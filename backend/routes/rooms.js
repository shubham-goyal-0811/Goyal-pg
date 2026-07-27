const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const authMiddleware = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');

router.use(authMiddleware);
router.use(roleCheck('admin'));

const meterReadingsRouter = require('./meterReadings');
router.use('/:id/meter-readings', meterReadingsRouter);

router.get('/', async (req, res) => {
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
          const currentMonth = new Date().toISOString().substring(0, 7) + '-01'; 
          const currentRent = t.rent_payments.find(r => r.billing_month === currentMonth);
          return {
            id: t.id,
            full_name: t.full_name,
            rent_status: currentRent ? currentRent.status : 'pending'
          };
        })
      };
    });

    res.json(formattedRooms);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
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

router.patch('/:id', async (req, res) => {
  const { capacity, has_ac, seat_rent, ac_charge } = req.body;
  try {
    const { data: room, error } = await supabase
      .from('rooms')
      .update({ capacity, has_ac, seat_rent, ac_charge, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json(room);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
