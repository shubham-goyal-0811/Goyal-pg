const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const authMiddleware = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');

router.use(authMiddleware);
router.use(roleCheck('admin'));

// GET /police-verification
// Returns ALL active tenants with their verification status (pending if no record yet)
router.get('/', async (req, res) => {
  try {
    // Fetch all active tenants
    const { data: tenants, error: tenantError } = await supabase
      .from('tenants')
      .select('id, full_name, room_id, rooms(room_number)')
      .eq('status', 'active')
      .order('full_name', { ascending: true });

    if (tenantError) throw tenantError;

    // Fetch all existing verification records
    const { data: records, error: recError } = await supabase
      .from('police_verification')
      .select('*');

    if (recError) throw recError;

    // Merge: every tenant gets a record (real or synthetic pending)
    const recordMap = {};
    (records || []).forEach(r => { recordMap[r.tenant_id] = r; });

    const merged = tenants.map(tenant => ({
      id: recordMap[tenant.id]?.id ?? null,
      tenant_id: tenant.id,
      status: recordMap[tenant.id]?.status ?? 'pending',
      submitted_date: recordMap[tenant.id]?.submitted_date ?? null,
      verified_date: recordMap[tenant.id]?.verified_date ?? null,
      tenants: { full_name: tenant.full_name, rooms: tenant.rooms }
    }));

    res.json(merged);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /police-verification/:tenant_id
router.patch('/:tenant_id', async (req, res) => {
  try {
    const updates = { ...req.body, updated_at: new Date().toISOString() };

    const { data: record, error } = await supabase
      .from('police_verification')
      .upsert({
        tenant_id: Number(req.params.tenant_id),
        ...updates
      }, { onConflict: 'tenant_id' })
      .select()
      .single();

    if (error) throw error;
    res.json(record);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
