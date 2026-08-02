const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const authMiddleware = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');
const { ADMIN_ONLY, ADMIN_OR_GATEKEEPER } = require('../config/roles');
const { validateId } = require('../middleware/validate');

router.use(authMiddleware);

// GET /police-verification
// Returns ALL active tenants with their verification status (pending if no record yet)
router.get('/', roleCheck(ADMIN_OR_GATEKEEPER), async (req, res) => {
  try {
    // One round-trip instead of two. police_verification.tenant_id is UNIQUE,
    // so PostgREST embeds it as a single object (or null when no record exists)
    // rather than an array — which is exactly the shape the merge below wants.
    const { data: tenants, error } = await supabase
      .from('tenants')
      .select(`
        id, full_name,
        rooms(room_number),
        police_verification(id, status, submitted_date, verified_date)
      `)
      .eq('status', 'active')
      .order('full_name', { ascending: true });

    if (error) throw error;

    // Every tenant gets a record — real, or a synthetic pending one.
    const merged = tenants.map(tenant => {
      const pv = tenant.police_verification;
      return {
        id: pv?.id ?? null,
        tenant_id: tenant.id,
        status: pv?.status ?? 'pending',
        submitted_date: pv?.submitted_date ?? null,
        verified_date: pv?.verified_date ?? null,
        tenants: { full_name: tenant.full_name, rooms: tenant.rooms }
      };
    });

    res.json(merged);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /police-verification/:tenant_id
const PV_EDITABLE_FIELDS = ['status', 'submitted_date', 'verified_date', 'reference_number', 'notes'];

router.patch('/:tenant_id', roleCheck(ADMIN_ONLY), validateId('tenant_id'), async (req, res) => {
  try {
    const safeUpdates = {};
    for (const field of PV_EDITABLE_FIELDS) {
      if (req.body[field] !== undefined) safeUpdates[field] = req.body[field];
    }
    if (Object.keys(safeUpdates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }
    safeUpdates.updated_at = new Date().toISOString();

    const { data: record, error } = await supabase
      .from('police_verification')
      .upsert({
        tenant_id: Number(req.params.tenant_id),
        ...safeUpdates
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
