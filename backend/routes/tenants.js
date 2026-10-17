const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const authMiddleware = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');
const { ROLES, ADMIN_ONLY, ADMIN_OR_GATEKEEPER } = require('../config/roles');
const { generateRent, isBillingMonth, TENANT_BILLING_SELECT } = require('../services/rent');
const { rejectionIfBackwards } = require('../services/meterReadings');
const { validateId, sanitizeSearch, normalizeEmail, normalizeIdProof } = require('../middleware/validate');

const { invalidateRole } = roleCheck;

router.use(authMiddleware);

// POST /tenants - onboard new tenant
router.post('/', roleCheck(ADMIN_OR_GATEKEEPER), async (req, res) => {
  try {
    const {
      room_id, full_name, phone_number, parent_contact, address,
      id_proof_type, id_proof_number,
      ac_opted, has_vehicle, vehicle_number, check_in_date,
      meter_reading, allow_lower
    } = req.body;

    // ── Input validation ────────────────────────────────────────────────
    if (!full_name?.trim())    return res.status(400).json({ error: 'full_name is required' });
    if (!phone_number?.trim()) return res.status(400).json({ error: 'phone_number is required' });
    if (!room_id || isNaN(Number(room_id))) return res.status(400).json({ error: 'valid room_id is required' });
    if (!check_in_date)        return res.status(400).json({ error: 'check_in_date is required' });
    if (new Date(check_in_date) > new Date()) return res.status(400).json({ error: 'check_in_date cannot be in the future' });

    const hasReading = meter_reading !== undefined && meter_reading !== null && meter_reading !== '';
    if (hasReading && (isNaN(Number(meter_reading)) || Number(meter_reading) < 0)) {
      return res.status(400).json({ error: 'meter_reading must be a non-negative number' });
    }

    // ID proof is optional at onboarding — OCR often reads nothing usable off a
    // creased card, and blocking the whole check-in on that would push admins to
    // type a placeholder, which is worse than an empty field. But whatever IS
    // supplied has to be real, because this number goes on the police form.
    let idProof = { type: null, number: null };
    if (id_proof_number?.trim()) {
      const checked = normalizeIdProof(id_proof_type, id_proof_number);
      if (!checked.ok) return res.status(400).json({ error: checked.error });
      idProof = { type: checked.type, number: checked.number };
    }
    // ────────────────────────────────────────────────────────────────────

    // Record the check-in reading BEFORE the tenant row exists. The reading
    // snapshots whoever is active in the room right now, and that snapshot is
    // who pays for the period it closes — the period that ran up to today,
    // before this tenant arrived. Insert the tenant first and they get billed
    // for electricity burned before they moved in.
    if (hasReading) {
      // Same guard as POST /rooms/:id/meter-readings. This path matters more,
      // not less: a check-in reading is often the baseline every later bill for
      // the room is measured against.
      if (!allow_lower) {
        const rejection = await rejectionIfBackwards(Number(room_id), check_in_date, Number(meter_reading));
        if (rejection) return res.status(400).json({ error: rejection, code: 'READING_WENT_BACKWARDS' });
      }

      const { data: roomMates, error: mateErr } = await supabase
        .from('tenants')
        .select('id')
        .eq('room_id', Number(room_id))
        .eq('status', 'active');
      if (mateErr) throw mateErr;

      const { error: readingErr } = await supabase
        .from('meter_readings')
        .insert([{
          room_id: Number(room_id),
          reading_date: check_in_date,
          reading_value: Number(meter_reading),
          active_tenant_ids: roomMates.map(t => t.id),
          triggered_by: 'routine'
        }]);
      if (readingErr) throw readingErr;
    }

    const { data: tenant, error } = await supabase
      .from('tenants')
      .insert([{
        room_id: Number(room_id), full_name: full_name.trim(), phone_number: phone_number.trim(),
        parent_contact: parent_contact?.trim() || null, address,
        id_proof_type: idProof.type, id_proof_number: idProof.number,
        ac_opted: Boolean(ac_opted), has_vehicle: Boolean(has_vehicle),
        vehicle_number: vehicle_number || null, check_in_date
      }])
      .select()
      .single();

    if (error) throw error;

    // Auto-create a pending police_verification record for the new tenant
    await supabase.from('police_verification').insert([{ tenant_id: tenant.id, status: 'pending' }]);

    res.status(201).json(tenant);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /tenants — list all active tenants (includes phone for search/disambiguation)
router.get('/', roleCheck(ADMIN_OR_GATEKEEPER), async (req, res) => {
  try {
    const { search } = req.query;
    let query = supabase
      .from('tenants')
      .select('id, full_name, phone_number, status, room_id, rooms(room_number)')
      .order('full_name', { ascending: true });

    if (search) {
      const safeSearch = sanitizeSearch(search);
      if (!safeSearch) return res.json([]); // empty after sanitizing — return nothing
      query = query.or(`full_name.ilike.%${safeSearch}%,phone_number.ilike.%${safeSearch}%`);
    } else {
      query = query.eq('status', 'active');
    }

    const { data: tenants, error } = await query;
    if (error) throw error;
    res.json(tenants);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /tenants/:id
// Admins get the full record. Gatekeepers get identity + room only — no
// ID-proof numbers, no document scans, no rent history, no home address.
// portal_user is the Google account currently linked to this tenant, if any.
// Surfacing its real display name next to the admin-typed login_email is the
// backstop for a typo — a wrong address shows a stranger's name.
const TENANT_SELECT_ADMIN = `
  *,
  rooms (room_number, floor, seat_rent, ac_charge),
  tenant_documents (*),
  rent_payments (*),
  portal_user:users!tenants_user_id_fkey (email, full_name)
`;

const TENANT_SELECT_GATEKEEPER = `
  id, full_name, phone_number, parent_contact, status, room_id,
  check_in_date, check_out_date, ac_opted, has_vehicle, vehicle_number,
  rooms (room_number, floor)
`;

router.get('/:id', roleCheck(ADMIN_OR_GATEKEEPER), validateId(), async (req, res) => {
  try {
    const isAdmin = req.user.role === ROLES.ADMIN;

    const { data: tenant, error } = await supabase
      .from('tenants')
      .select(isAdmin ? TENANT_SELECT_ADMIN : TENANT_SELECT_GATEKEEPER)
      .eq('id', req.params.id)
      .single();

    if (error) throw error;
    res.json(tenant);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /tenants/:id — only whitelisted fields can be updated.
// login_email is NOT in this list; it has extra rules and is handled below.
// id_proof_* are NOT here either — the pair has to be validated together, so it
// is handled below rather than copied through blind.
const TENANT_EDITABLE_FIELDS = [
  'full_name', 'phone_number', 'parent_contact', 'address',
  'ac_opted', 'has_vehicle', 'vehicle_number', 'check_in_date'
];

router.patch('/:id', roleCheck(ADMIN_ONLY), validateId(), async (req, res) => {
  try {
    const safeUpdates = {};
    for (const field of TENANT_EDITABLE_FIELDS) {
      if (req.body[field] !== undefined) safeUpdates[field] = req.body[field];
    }

    // ── ID proof ────────────────────────────────────────────────────────────
    // Correcting an Aadhaar that OCR misread is the main reason this endpoint
    // gets used by hand, so it has to accept a number on its own — but a number
    // means nothing without its type, and a type means nothing without a number.
    // Fill whichever half wasn't sent from the stored row and validate the pair.
    const editsType = req.body.id_proof_type !== undefined;
    const editsNumber = req.body.id_proof_number !== undefined;

    if (editsType || editsNumber) {
      const { data: current, error: curErr } = await supabase
        .from('tenants')
        .select('id_proof_type, id_proof_number')
        .eq('id', req.params.id)
        .single();
      if (curErr) throw curErr;

      const nextType = editsType ? req.body.id_proof_type : current.id_proof_type;
      const nextNumber = editsNumber ? req.body.id_proof_number : current.id_proof_number;

      // Explicitly clearing the number clears the type with it, so the record
      // never claims "aadhaar" with nothing behind it.
      if (editsNumber && !String(nextNumber ?? '').trim()) {
        safeUpdates.id_proof_type = null;
        safeUpdates.id_proof_number = null;
      } else {
        const checked = normalizeIdProof(nextType, nextNumber);
        if (!checked.ok) return res.status(400).json({ error: checked.error });
        safeUpdates.id_proof_type = checked.type;
        safeUpdates.id_proof_number = checked.number;
      }
    }

    // ── Portal access ───────────────────────────────────────────────────────
    // Granting access is a different kind of edit from correcting a phone
    // number, so it gets its own rules:
    //   - must be a syntactically valid address
    //   - cannot be changed once someone has actually signed in with it;
    //     revoke first, so the old account is demoted rather than left holding
    //     a role that no longer maps to anything
    //   - clearing it goes through POST /:id/revoke-portal, never through here
    if (req.body.login_email !== undefined) {
      const email = normalizeEmail(req.body.login_email);
      if (!email) {
        return res.status(400).json({ error: 'Enter a valid email address' });
      }

      const { data: current, error: curErr } = await supabase
        .from('tenants')
        .select('user_id')
        .eq('id', req.params.id)
        .single();
      if (curErr) throw curErr;

      if (current.user_id) {
        return res.status(409).json({
          error: 'This tenant has already signed in. Revoke portal access first, then set a new email.'
        });
      }

      safeUpdates.login_email = email;
    }

    if (Object.keys(safeUpdates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }
    safeUpdates.updated_at = new Date().toISOString();

    const { data: tenant, error } = await supabase
      .from('tenants')
      .update(safeUpdates)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) {
      // tenants_login_email_active_key — another ACTIVE tenant already has it.
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Another active tenant is already using that email address' });
      }
      throw error;
    }
    res.json(tenant);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /tenants/:id/revoke-portal
// Cuts a resident's access to /me. Three things have to happen together or the
// account is left in a broken half-state: clear the link, clear the invitation,
// and demote the auth user. Skipping the demotion would leave role='tenant'
// with nothing to read — routes/me.js self-heals that, but only on their next
// sign-in, which may never come.
router.post('/:id/revoke-portal', roleCheck(ADMIN_ONLY), validateId(), async (req, res) => {
  try {
    const { data: tenant, error: readErr } = await supabase
      .from('tenants')
      .select('user_id, login_email')
      .eq('id', req.params.id)
      .single();
    if (readErr) throw readErr;

    if (!tenant.user_id && !tenant.login_email) {
      return res.status(400).json({ error: 'This tenant does not have portal access' });
    }

    const { error: clearErr } = await supabase
      .from('tenants')
      .update({ user_id: null, login_email: null, updated_at: new Date().toISOString() })
      .eq('id', req.params.id);
    if (clearErr) throw clearErr;

    if (tenant.user_id) {
      // Only ever demotes 'tenant'. If this account was separately promoted to
      // admin or gatekeeper, revoking portal access must not strip that.
      await supabase
        .from('users')
        .update({ role: ROLES.VIEWER })
        .eq('id', tenant.user_id)
        .eq('role', ROLES.TENANT);
      invalidateRole(tenant.user_id);
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /tenants/:id/checkout
router.post('/:id/checkout', roleCheck(ADMIN_ONLY), validateId(), async (req, res) => {
  try {
    const tenantId = req.params.id;
    const today = new Date().toISOString().substring(0, 10);

    const { data: tenant, error } = await supabase
      .from('tenants')
      .update({
        status: 'vacated',
        check_out_date: today,
        updated_at: new Date().toISOString()
      })
      .eq('id', tenantId)
      .select('room_id')
      .single();

    if (error) throw error;

    // Frontend MUST show blocking modal using this flag
    res.json({
      success: true,
      requiresMeterReading: true,
      roomId: tenant.room_id
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /tenants/:id/generate-rent
// Creates (or recalculates) the rent_payment record for a tenant for a given billing month.
// Call this once per tenant per month after the month's meter readings are in.
// Body: { billing_month: 'YYYY-MM' }
router.post('/:id/generate-rent', roleCheck(ADMIN_ONLY), validateId(), async (req, res) => {
  try {
    const tenantId = Number(req.params.id);
    const { billing_month } = req.body; // e.g. '2025-07'

    if (!isBillingMonth(billing_month)) {
      return res.status(400).json({ error: 'billing_month required in YYYY-MM format' });
    }

    const { data: tenant, error: tErr } = await supabase
      .from('tenants')
      .select(TENANT_BILLING_SELECT)
      .eq('id', tenantId)
      .single();
    if (tErr || !tenant) return res.status(404).json({ error: 'Tenant not found' });

    const result = await generateRent([tenant], billing_month);

    if (result.generated === 0) {
      const why = result.skipped[0]?.reason === 'already_paid'
        ? 'This month is already marked paid for this tenant.'
        : 'Nothing to generate.';
      return res.status(409).json({ error: why, ...result });
    }

    // warnings is non-empty when the room's readings couldn't produce a charge,
    // so a Rs0 electricity line is visibly explained rather than silently wrong.
    res.status(201).json({ ...result.rows[0], warnings: result.warnings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
