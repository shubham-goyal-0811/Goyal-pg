/**
 * me.js — "who am I, and what may I see?"
 *
 * Two jobs:
 *   1. Tell the frontend its role. It used to read public.users directly under
 *      the users_select_own RLS policy; that can't work any more because
 *      resolving a resident's role now involves a WRITE (the link below).
 *   2. Link a Google account to a tenants row the first time that resident
 *      signs in.
 *
 * ── The linker is the only self-service role change in this system ──────────
 *
 * Three properties keep that from being a privilege-escalation hole, and all
 * three are enforced in code below, not just described here:
 *
 *   a. It can only ever assign 'tenant'. There is no path through this file
 *      that writes 'admin' or 'gatekeeper'.
 *   b. It only fires when the caller is currently 'viewer'. An admin whose
 *      email an admin also typed into a tenants row keeps being an admin.
 *   c. It requires an admin to have already written that exact address into
 *      tenants.login_email. A stranger signing in with Google gets 'viewer'
 *      and nothing else, exactly as before.
 *
 * The residual risk is a TYPO: login_email pointing at the wrong address hands
 * that tenant's profile and rent history to whoever owns it. That is why
 * GET /tenants/:id reports the linked account's Google display name back to
 * the admin — a wrong address shows a stranger's name.
 */
const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const authMiddleware = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');
const { ROLES, TENANT_ONLY } = require('../config/roles');
const { validateId } = require('../middleware/validate');

const { invalidateRole } = roleCheck;

// No roleCheck on this router: this endpoint is what RESOLVES the role, so
// gating it on one would be circular. Every route still requires a valid JWT.
router.use(authMiddleware);

/** Shape returned to the client. Deliberately small — role plus own identity. */
const shape = (role, tenant, user) => ({
  role,
  email: user.email ?? null,
  full_name: user.user_metadata?.full_name ?? null,
  tenant: tenant ? { id: tenant.id, full_name: tenant.full_name } : null,
});

/**
 * Attempt to bind this auth account to an active tenants row.
 * Returns the tenant on success, null if there was nothing to link.
 *
 * Caller MUST have already confirmed the current role is 'viewer'.
 */
const linkTenant = async (authUser) => {
  const email = authUser.email?.toLowerCase();
  if (!email) return null;

  // Plain .eq, never .ilike. ilike would treat '_' and '%' in the address as
  // wildcards, so john_doe@x.com could match johnXdoe@x.com. login_email is
  // lower-cased on write (routes/tenants.js) precisely so this can be exact.
  const { data: match, error: matchErr } = await supabase
    .from('tenants')
    .select('id, full_name')
    .eq('status', 'active')
    .eq('login_email', email)
    .is('user_id', null)
    .maybeSingle();

  if (matchErr || !match) return null;

  // Conditional update: re-assert status/user_id in the WHERE so two sign-ins
  // racing each other can't both claim the row. The loser updates 0 rows.
  const { data: claimed, error: claimErr } = await supabase
    .from('tenants')
    .update({ user_id: authUser.id, updated_at: new Date().toISOString() })
    .eq('id', match.id)
    .eq('status', 'active')
    .is('user_id', null)
    .select('id, full_name')
    .maybeSingle();

  if (claimErr || !claimed) return null;

  // Promote — but only from 'viewer'. The extra .eq() is the last line of
  // defence: even if the role read above went stale between then and now, this
  // update cannot touch an admin or a gatekeeper.
  const { data: promoted, error: roleErr } = await supabase
    .from('users')
    .update({ role: ROLES.TENANT })
    .eq('id', authUser.id)
    .eq('role', ROLES.VIEWER)
    .select('id')
    .maybeSingle();

  if (roleErr || !promoted) {
    // Half-linked is worse than unlinked: the row would be claimed by someone
    // who still can't read it, and no later sign-in could claim it either.
    await supabase.from('tenants').update({ user_id: null }).eq('id', claimed.id);
    console.error('[me] claimed tenant but could not promote role — rolled back', roleErr?.message);
    return null;
  }

  invalidateRole(authUser.id);
  console.log(`[me] linked tenant ${claimed.id} to auth user ${authUser.id}`);
  return claimed;
};

/**
 * GET /me
 * → { role, email, full_name, tenant: { id, full_name } | null }
 *
 * Always 200 for a valid token. "No access" is a role of 'viewer', not a 403 —
 * the frontend needs to render a sign-out button on that screen.
 */
router.get('/', async (req, res) => {
  try {
    const { data: row, error } = await supabase
      .from('users')
      .select('role')
      .eq('id', req.user.id)
      .maybeSingle();

    if (error) throw error;

    // No users row means the on_auth_user_created trigger didn't fire. Treat as
    // no access rather than inventing one.
    const role = row?.role ?? ROLES.VIEWER;

    if (role === ROLES.VIEWER) {
      const tenant = await linkTenant(req.user);
      return res.json(tenant
        ? shape(ROLES.TENANT, tenant, req.user)
        : shape(ROLES.VIEWER, null, req.user));
    }

    if (role === ROLES.TENANT) {
      const { data: tenant } = await supabase
        .from('tenants')
        .select('id, full_name')
        .eq('user_id', req.user.id)
        .maybeSingle();

      // Role says tenant but no row points back — access was revoked, or the
      // tenants row was deleted. Self-heal to 'viewer' so the account doesn't
      // sit in a state the portal can't render.
      if (!tenant) {
        await supabase
          .from('users')
          .update({ role: ROLES.VIEWER })
          .eq('id', req.user.id)
          .eq('role', ROLES.TENANT);
        invalidateRole(req.user.id);
        return res.json(shape(ROLES.VIEWER, null, req.user));
      }

      return res.json(shape(ROLES.TENANT, tenant, req.user));
    }

    // admin / gatekeeper / staff — reported as-is, never linked, never changed.
    res.json(shape(role, null, req.user));
  } catch (err) {
    console.error('[me]', err.message);
    res.status(500).json({ error: 'Could not resolve your account' });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
//  RESIDENT PORTAL — read-only
// ═════════════════════════════════════════════════════════════════════════════
//
// ── The one rule ─────────────────────────────────────────────────────────────
// Not one route below takes a tenant id. The row is resolved from req.user.id
// by requireTenant() and nothing else. There is therefore no request a
// resident can construct that returns another resident's data — not a crafted
// URL, not a tampered client role, not a guessed id. Adding an :id param to
// anything in this section would undo that in a single line.
//
// Nothing here writes. Payment is settled in the office, so the portal has no
// "mark paid" — which removes an entire class of authorization bug.

/**
 * Explicit column list. NEVER select('*') on a resident-facing path: the point
 * of naming columns is that a column added to `tenants` later is withheld by
 * default instead of leaking by default.
 *
 * Withheld deliberately, even though it is the resident's own row:
 *   id_proof_number  — nothing in the portal needs it, and it is the single
 *                      most damaging field in the schema if a session leaks
 *   login_email      — an admin-side control, not resident-facing
 *   user_id          — internal plumbing
 */
const TENANT_SELF_SELECT = `
  id, full_name, phone_number, parent_contact, address,
  id_proof_type, ac_opted, has_vehicle, vehicle_number,
  check_in_date, check_out_date, status, room_id
`;

/**
 * Resolve the caller's own tenant row and hang it on req.tenant.
 *
 * A 403 here means role='tenant' with nothing linked. routes/me.js self-heals
 * that on the next GET /me, but the portal endpoints must not serve anything
 * in the meantime.
 */
const requireTenant = async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('tenants')
      .select(TENANT_SELF_SELECT)
      .eq('user_id', req.user.id)
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(403).json({ error: 'No resident record is linked to this account' });

    req.tenant = data;
    next();
  } catch (err) {
    console.error('[me] requireTenant', err.message);
    res.status(500).json({ error: 'Could not load your record' });
  }
};

/** Every portal route runs this pair, in this order. */
const portal = [roleCheck(TENANT_ONLY), requireTenant];

const RENT_SELECT = 'id, billing_month, seat_rent, ac_charge, electricity_charge, total_amount, amount_paid, status, paid_date';

/**
 * GET /me/summary — the home screen.
 * Answers "what do I owe" in one request rather than three.
 */
router.get('/summary', portal, async (req, res) => {
  try {
    const t = req.tenant;

    const [roomRes, rentRes, pvRes] = await Promise.all([
      t.room_id
        ? supabase.from('rooms').select('room_number, floor, has_ac, seat_rent, ac_charge').eq('id', t.room_id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from('rent_payments').select(RENT_SELECT).eq('tenant_id', t.id).order('billing_month', { ascending: false }),
      supabase.from('police_verification').select('status, verified_date').eq('tenant_id', t.id).maybeSingle(),
    ]);

    const payments = rentRes.data || [];
    const pending = payments.filter((p) => p.status === 'pending');

    res.json({
      tenant: {
        full_name: t.full_name,
        check_in_date: t.check_in_date,
        check_out_date: t.check_out_date,
        status: t.status,
        ac_opted: t.ac_opted,
      },
      room: roomRes.data
        ? { room_number: roomRes.data.room_number, floor: roomRes.data.floor, has_ac: roomRes.data.has_ac }
        : null,
      latest_bill: payments[0] || null,
      outstanding: {
        count: pending.length,
        // Sum in paise, then convert once. Adding decimals straight from
        // Postgres gives 4500.000000000001 often enough to be embarrassing on
        // a bill.
        total: pending.reduce((sum, p) => sum + Math.round(Number(p.total_amount) * 100), 0) / 100,
      },
      police_verification: pvRes.data || null,
    });
  } catch (err) {
    console.error('[me/summary]', err.message);
    res.status(500).json({ error: 'Could not load your summary' });
  }
});

/** GET /me/rent — own bills, newest first. */
router.get('/rent', portal, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('rent_payments')
      .select(RENT_SELECT)
      .eq('tenant_id', req.tenant.id)
      .order('billing_month', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('[me/rent]', err.message);
    res.status(500).json({ error: 'Could not load your rent history' });
  }
});

/**
 * GET /me/profile — everything the profile tab shows, in one request.
 *
 * The plan had this as three endpoints (/me/room, /me/documents and the
 * tenant's own fields). Collapsed into one because the screen needs all three
 * at once on a phone, and because a smaller set of resident-facing routes is a
 * smaller set to audit.
 *
 * Roommates are FIRST NAMES ONLY. A resident should be able to see who they
 * live with; they have no business reading a housemate's phone number, ID or
 * rent status out of this app.
 *
 * Documents carry neither ocr_raw_data (the full raw Aadhaar text) nor
 * file_url (the storage path). is_pdf is derived server-side so the client can
 * pick a viewer without ever seeing the path.
 */
router.get('/profile', portal, async (req, res) => {
  try {
    const t = req.tenant;

    const [roomRes, mateRes, docRes, pvRes] = await Promise.all([
      t.room_id
        ? supabase.from('rooms').select('room_number, floor, capacity, has_ac, seat_rent, ac_charge').eq('id', t.room_id).maybeSingle()
        : Promise.resolve({ data: null }),
      t.room_id
        ? supabase.from('tenants').select('id, full_name').eq('room_id', t.room_id).eq('status', 'active').neq('id', t.id)
        : Promise.resolve({ data: [] }),
      supabase.from('tenant_documents').select('id, doc_type, uploaded_at, file_url').eq('tenant_id', t.id).order('uploaded_at', { ascending: false }),
      supabase.from('police_verification').select('status, submitted_date, verified_date').eq('tenant_id', t.id).maybeSingle(),
    ]);

    res.json({
      tenant: {
        full_name: t.full_name,
        phone_number: t.phone_number,
        parent_contact: t.parent_contact,
        address: t.address,
        id_proof_type: t.id_proof_type,
        ac_opted: t.ac_opted,
        has_vehicle: t.has_vehicle,
        vehicle_number: t.vehicle_number,
        check_in_date: t.check_in_date,
        check_out_date: t.check_out_date,
        status: t.status,
      },
      room: roomRes.data || null,
      roommates: (mateRes.data || []).map((m) => ({
        first_name: String(m.full_name || '').trim().split(/\s+/)[0] || 'Resident',
      })),
      documents: (docRes.data || []).map((d) => ({
        id: d.id,
        doc_type: d.doc_type,
        uploaded_at: d.uploaded_at,
        is_pdf: String(d.file_url || '').toLowerCase().endsWith('.pdf'),
      })),
      police_verification: pvRes.data || null,
    });
  } catch (err) {
    console.error('[me/profile]', err.message);
    res.status(500).json({ error: 'Could not load your profile' });
  }
});

/**
 * GET /me/documents/:docId/signed-url
 *
 * Mirrors routes/documents.js, with one difference that is the whole point:
 * the tenant_id in the WHERE clause comes from the session, not the URL. :docId
 * alone therefore cannot reach another resident's scan.
 */
router.get('/documents/:docId/signed-url', portal, validateId('docId'), async (req, res) => {
  try {
    const { data: doc, error } = await supabase
      .from('tenant_documents')
      .select('file_url')
      .eq('id', req.params.docId)
      .eq('tenant_id', req.tenant.id)
      .maybeSingle();

    if (error) throw error;
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    const { data: signed, error: signErr } = await supabase.storage
      .from('Goyal-pg')
      .createSignedUrl(doc.file_url, 60 * 5); // 5 minutes

    if (signErr) throw signErr;
    res.json({ signedUrl: signed.signedUrl });
  } catch (err) {
    console.error('[me/documents/signed-url]', err.message);
    res.status(500).json({ error: 'Could not open that document' });
  }
});

module.exports = router;
