const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const authMiddleware = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');
const { ROLES, ADMIN_ONLY, ADMIN_OR_GATEKEEPER } = require('../config/roles');
const { generateRent, isBillingMonth, TENANT_BILLING_SELECT } = require('../services/rent');
const { rejectionIfBackwards } = require('../services/meterReadings');
const { validateId, sanitizeSearch } = require('../middleware/validate');

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
        id_proof_type, id_proof_number,
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
const TENANT_SELECT_ADMIN = `
  *,
  rooms (room_number, floor, seat_rent, ac_charge),
  tenant_documents (*),
  rent_payments (*)
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

// PATCH /tenants/:id — only whitelisted fields can be updated
const TENANT_EDITABLE_FIELDS = [
  'full_name', 'phone_number', 'parent_contact', 'address',
  'ac_opted', 'has_vehicle', 'vehicle_number',
  'id_proof_type', 'id_proof_number', 'check_in_date'
];

router.patch('/:id', roleCheck(ADMIN_ONLY), validateId(), async (req, res) => {
  try {
    const safeUpdates = {};
    for (const field of TENANT_EDITABLE_FIELDS) {
      if (req.body[field] !== undefined) safeUpdates[field] = req.body[field];
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

    if (error) throw error;
    res.json(tenant);
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
