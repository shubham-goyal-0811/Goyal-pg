const express = require('express');
const router = express.Router({ mergeParams: true }); // to access :roomId from parent if needed
const supabase = require('../config/supabase');
const authMiddleware = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');
const { validateId } = require('../middleware/validate');

router.use(authMiddleware);
router.use(roleCheck('admin'));

// GET /rooms/:id/meter-readings
router.get('/', validateId(), async (req, res) => {
  try {
    const { data: readings, error } = await supabase
      .from('meter_readings')
      .select('*')
      .eq('room_id', req.params.id)
      .order('reading_date', { ascending: false });

    if (error) throw error;
    res.json(readings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /rooms/:id/meter-readings
router.post('/', validateId(), async (req, res) => {
  const { reading_date, reading_value, triggered_by } = req.body;
  const roomId = req.params.id;

  // ── Input validation ────────────────────────────────────────────────
  if (!reading_date) return res.status(400).json({ error: 'reading_date is required' });
  if (reading_value === undefined || reading_value === null || isNaN(Number(reading_value)) || Number(reading_value) < 0) {
    return res.status(400).json({ error: 'reading_value must be a non-negative number' });
  }
  // ────────────────────────────────────────────────────────────────────

  try {
    // 1. Snapshot active tenants in this room
    const { data: tenants, error: tenantsError } = await supabase
      .from('tenants')
      .select('id')
      .eq('room_id', roomId)
      .eq('status', 'active');

    if (tenantsError) throw tenantsError;

    const activeTenantIds = tenants.map(t => t.id);

    // 2. Insert reading
    const { data: reading, error } = await supabase
      .from('meter_readings')
      .insert([{
        room_id: roomId,
        reading_date,
        reading_value,
        active_tenant_ids: activeTenantIds,
        triggered_by: triggered_by || 'routine'
      }])
      .select()
      .single();

    if (error) throw error;
    res.json(reading);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
