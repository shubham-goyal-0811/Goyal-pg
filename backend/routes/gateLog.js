const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const authMiddleware = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');
const { ADMIN_OR_GATEKEEPER } = require('../config/roles');
const { validateId } = require('../middleware/validate');

router.use(authMiddleware);

// GET /gate-log
router.get('/', roleCheck(ADMIN_OR_GATEKEEPER), async (req, res) => {
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
router.post('/', roleCheck(ADMIN_OR_GATEKEEPER), async (req, res) => {
  try {
    const { tenant_id, visitor_name, in_time, out_time } = req.body;

    // ── Input validation ────────────────────────────────────────────────
    // tenant_id is optional (a visitor need not be tied to a tenant), but a
    // non-numeric value reaches PostgREST as a malformed filter and comes back
    // as an opaque 500 rather than a usable error.
    if (tenant_id !== undefined && tenant_id !== null && tenant_id !== '') {
      if (!Number.isInteger(Number(tenant_id)) || Number(tenant_id) <= 0) {
        return res.status(400).json({ error: 'tenant_id must be a positive integer' });
      }
    }
    if (!visitor_name?.trim()) {
      return res.status(400).json({ error: 'visitor_name is required' });
    }
    if (visitor_name.trim().length > 120) {
      return res.status(400).json({ error: 'visitor_name must be 120 characters or fewer' });
    }
    // ────────────────────────────────────────────────────────────────────

    const { data: log, error } = await supabase
      .from('gate_log')
      .insert([{
        tenant_id: tenant_id ? Number(tenant_id) : null,
        visitor_name: visitor_name.trim(),
        in_time: in_time || new Date().toISOString(),
        out_time: out_time || null
      }])
      .select(`*, tenants ( full_name, room_id, rooms (room_number) )`)
      .single();

    if (error) throw error;
    res.status(201).json(log);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /gate-log/:id/mark-out
router.patch('/:id/mark-out', roleCheck(ADMIN_OR_GATEKEEPER), validateId(), async (req, res) => {
  try {
    // Without this lookup, a missing row makes .single() error out and surface
    // as a 500 — and re-marking an already-departed visitor silently overwrote
    // the original out_time.
    const { data: existing, error: lookupError } = await supabase
      .from('gate_log')
      .select('id, out_time')
      .eq('id', req.params.id)
      .single();

    if (lookupError || !existing) return res.status(404).json({ error: 'Gate log entry not found' });
    if (existing.out_time) return res.status(400).json({ error: 'Already marked out' });

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
