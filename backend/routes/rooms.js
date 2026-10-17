const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const authMiddleware = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');
const { ADMIN_ONLY, ADMIN_OR_GATEKEEPER } = require('../config/roles');
const { validateId } = require('../middleware/validate');
const { invalidatePricing } = require('../services/publicPricing');

// authMiddleware here also covers the nested meter-readings router below.
router.use(authMiddleware);

const meterReadingsRouter = require('./meterReadings');
router.use('/:id/meter-readings', meterReadingsRouter);

router.get('/', roleCheck(ADMIN_OR_GATEKEEPER), async (req, res) => {
  try {
    const { data: rooms, error } = await supabase
      .from('rooms')
      .select(`
        *,
        tenants (
          id, full_name, status,
          rent_payments (
            id, status, billing_month
          )
        )
      `)
      .order('room_number', { ascending: true });

    if (error) throw error;

    const formattedRooms = rooms.map(room => {
      const activeTenants = room.tenants.filter(t => t.status === 'active');
      return {
        ...room,
        active_tenants_count: activeTenants.length,
        tenants: activeTenants.map(t => {
          // Report the most recent bill, not the current calendar month's.
          // Bills are generated once a month closes and its final meter reading
          // is in, so the month in progress has no row yet — matching on it
          // made every tenant read "pending" forever. 'none' distinguishes
          // "nothing billed yet" from "billed and unpaid".
          const latest = (t.rent_payments || [])
            .slice()
            .sort((a, b) => String(b.billing_month).localeCompare(String(a.billing_month)))[0];
          return {
            id: t.id,
            full_name: t.full_name,
            rent_status: latest ? latest.status : 'none',
            rent_month: latest ? latest.billing_month : null
          };
        })
      };
    });


    res.json(formattedRooms);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', roleCheck(ADMIN_OR_GATEKEEPER), validateId(), async (req, res) => {
  try {
    const { data: room, error } = await supabase
      .from('rooms')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error) throw error;
    res.json(room);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id', roleCheck(ADMIN_ONLY), validateId(), async (req, res) => {
  const { capacity, has_ac, seat_rent, ac_charge } = req.body;
  try {
    const { data: room, error } = await supabase
      .from('rooms')
      .update({ capacity, has_ac, seat_rent, ac_charge, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    // The public landing page quotes these prices from a cache; this is the
    // only route that changes them, so it is the one that says so.
    invalidatePricing();
    res.json(room);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
