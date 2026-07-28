const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const authMiddleware = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');
const { validateId } = require('../middleware/validate');

router.use(authMiddleware);
router.use(roleCheck('admin'));

// GET /gate-log
router.get('/', async (req, res) => {
  try {
    const { data: logs, error } = await supabase
      .from('gate_log')
      .select(`
        *,
        tenants ( full_name, room_id, rooms (room_number) )
      `)
      .order('in_time', { ascending: false })
      .limit(100);

    if (error) throw error;
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /gate-log
router.post('/', async (req, res) => {
  try {
    const { tenant_id, visitor_name, in_time, out_time } = req.body;
    const { data: log, error } = await supabase
      .from('gate_log')
      .insert([{
        tenant_id: tenant_id || null,
        visitor_name,
        in_time: in_time || new Date().toISOString(),
        out_time
      }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(log);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /gate-log/:id/mark-out
router.patch('/:id/mark-out', validateId(), async (req, res) => {
  try {
    const { data: log, error } = await supabase
      .from('gate_log')
      .update({ out_time: new Date().toISOString() })
      .eq('id', req.params.id)
      .select(`*, tenants ( full_name, rooms (room_number) )`)
      .single();

    if (error) throw error;
    res.json(log);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
