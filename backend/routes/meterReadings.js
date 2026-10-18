const express = require('express');
const router = express.Router({ mergeParams: true }); // to access :roomId from parent if needed
const supabase = require('../config/supabase');
const roleCheck = require('../middleware/roleCheck');
const { ADMIN_ONLY, ADMIN_OR_GATEKEEPER } = require('../config/roles');
const { validateId } = require('../middleware/validate');
const { rejectionIfBackwards, tenantsPresentOn } = require('../services/meterReadings');

// NOTE: this router is mounted under routes/rooms.js, which already applies
// authMiddleware. Mounting it anywhere else requires applying auth there too.

// GET /rooms/:id/meter-readings
router.get('/', roleCheck(ADMIN_OR_GATEKEEPER), validateId(), async (req, res) => {
  try {
    const { data: readings, error } = await supabase
      .from('meter_readings')
      .select('*')
      .eq('room_id', req.params.id)
      // Newest first, and by id within a day: a check-in or move-out often
      // shares a date with another reading, and the page shows rows[0] as
      // "the last reading".
      .order('reading_date', { ascending: false })
      .order('id', { ascending: false });

    if (error) throw error;
    res.json(readings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /rooms/:id/meter-readings
router.post('/', roleCheck(ADMIN_ONLY), validateId(), async (req, res) => {
  const { reading_date, reading_value, triggered_by, allow_lower } = req.body;
  const roomId = req.params.id;

  // ── Input validation ────────────────────────────────────────────────
  if (!reading_date) return res.status(400).json({ error: 'reading_date is required' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reading_date)) {
    return res.status(400).json({ error: 'reading_date must be in YYYY-MM-DD format' });
  }
  if (reading_value === undefined || reading_value === null || isNaN(Number(reading_value)) || Number(reading_value) < 0) {
    return res.status(400).json({ error: 'reading_value must be a non-negative number' });
  }
  // ────────────────────────────────────────────────────────────────────

  try {
    // Refuse a reading that goes backwards unless the caller has explicitly
    // confirmed the meter was reset or replaced.
    if (!allow_lower) {
      const rejection = await rejectionIfBackwards(roomId, reading_date, reading_value);
      if (rejection) return res.status(400).json({ error: rejection, code: 'READING_WENT_BACKWARDS' });
    }

    // 1. Snapshot who lived in this room on the reading's date
    const activeTenantIds = await tenantsPresentOn(roomId, reading_date);

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
