const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const authMiddleware = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');

router.use(authMiddleware);
router.use(roleCheck('admin'));

// POST /tenants - onboard new tenant
router.post('/', async (req, res) => {
  try {
    const {
      room_id, full_name, phone_number, address,
      id_proof_type, id_proof_number,
      ac_opted, has_vehicle, vehicle_number, check_in_date
    } = req.body;

    const { data: tenant, error } = await supabase
      .from('tenants')
      .insert([{
        room_id, full_name, phone_number, address,
        id_proof_type, id_proof_number,
        ac_opted, has_vehicle, vehicle_number, check_in_date
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
      query = query.or(`full_name.ilike.%${search}%,phone_number.ilike.%${search}%`);
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
router.get('/:id', async (req, res) => {
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

// PATCH /tenants/:id
router.patch('/:id', async (req, res) => {
  try {
    const updates = { ...req.body, updated_at: new Date().toISOString() };
    const { data: tenant, error } = await supabase
      .from('tenants')
      .update(updates)
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
router.post('/:id/checkout', async (req, res) => {
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

module.exports = router;
