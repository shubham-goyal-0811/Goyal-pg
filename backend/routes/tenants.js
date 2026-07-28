const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const authMiddleware = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');
const { calculateElectricityCharges } = require('../services/electricity');
const { validateId, sanitizeSearch } = require('../middleware/validate');

router.use(authMiddleware);
router.use(roleCheck('admin'));

// POST /tenants - onboard new tenant
router.post('/', async (req, res) => {
  try {
    const {
      room_id, full_name, phone_number, parent_contact, address,
      id_proof_type, id_proof_number,
      ac_opted, has_vehicle, vehicle_number, check_in_date
    } = req.body;

    // ── Input validation ────────────────────────────────────────────────
    if (!full_name?.trim())    return res.status(400).json({ error: 'full_name is required' });
    if (!phone_number?.trim()) return res.status(400).json({ error: 'phone_number is required' });
    if (!room_id || isNaN(Number(room_id))) return res.status(400).json({ error: 'valid room_id is required' });
    if (!check_in_date)        return res.status(400).json({ error: 'check_in_date is required' });
    if (new Date(check_in_date) > new Date()) return res.status(400).json({ error: 'check_in_date cannot be in the future' });
    // ────────────────────────────────────────────────────────────────────

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
router.get('/', async (req, res) => {
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
router.get('/:id', validateId(), async (req, res) => {
  try {
    const { data: tenant, error } = await supabase
      .from('tenants')
      .select(`
        *,
        rooms (room_number, floor, seat_rent, ac_charge),
        tenant_documents (*),
        rent_payments (*)
      `)
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

router.patch('/:id', validateId(), async (req, res) => {
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
router.post('/:id/checkout', validateId(), async (req, res) => {
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
router.post('/:id/generate-rent', validateId(), async (req, res) => {
  try {
    const tenantId = Number(req.params.id);
    const { billing_month } = req.body; // e.g. '2025-07'

    if (!billing_month || !/^\d{4}-\d{2}$/.test(billing_month)) {
      return res.status(400).json({ error: 'billing_month required in YYYY-MM format' });
    }

    // Fetch tenant + room pricing
    const { data: tenant, error: tErr } = await supabase
      .from('tenants')
      .select('id, room_id, ac_opted, rooms(seat_rent, ac_charge)')
      .eq('id', tenantId)
      .single();
    if (tErr || !tenant) return res.status(404).json({ error: 'Tenant not found' });

    const seat_rent = Number(tenant.rooms.seat_rent);
    const ac_charge = tenant.ac_opted ? Number(tenant.rooms.ac_charge) : 0;

    // Calculate electricity share for this tenant this month
    const allCharges = await calculateElectricityCharges(tenant.room_id, billing_month);
    const electricity_charge = Number((allCharges[tenantId] || 0).toFixed(2));

    const total_amount = seat_rent + ac_charge + electricity_charge;
    const billing_month_date = `${billing_month}-01`;

    // Upsert so re-running is safe (e.g. meter reading added after first generation)
    const { data: payment, error: pErr } = await supabase
      .from('rent_payments')
      .upsert({
        tenant_id: tenantId,
        billing_month: billing_month_date,
        seat_rent,
        ac_charge,
        electricity_charge,
        total_amount,
        amount_paid: 0,
        status: 'pending'
      }, { onConflict: 'tenant_id,billing_month' })
      .select()
      .single();

    if (pErr) throw pErr;
    res.status(201).json(payment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
