const express = require('express');
const supabase = require('../config/supabase');
const authMiddleware = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');
const { ADMIN_ONLY } = require('../config/roles');
const { validateId } = require('../middleware/validate');
const { generateRent, isBillingMonth, lastDayOfMonth, TENANT_BILLING_SELECT } = require('../services/rent');
const { firstOfNextMonth } = require('../services/electricity');
const { findPriorReading, findNextReading, tenantsPresentOn } = require('../services/meterReadings');

const tenantRentRouter = express.Router({ mergeParams: true });
const rentRouter = express.Router();

tenantRentRouter.use(authMiddleware);
tenantRentRouter.use(roleCheck(ADMIN_ONLY));
rentRouter.use(authMiddleware);
rentRouter.use(roleCheck(ADMIN_ONLY));

// GET /tenants/:id/rent
tenantRentRouter.get('/', validateId(), async (req, res) => {
  try {
    const { data: payments, error } = await supabase
      .from('rent_payments')
      .select('*')
      .eq('tenant_id', req.params.id)
      .order('billing_month', { ascending: false });

    if (error) throw error;
    res.json(payments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /rent/generate — bill every active tenant for a month in one pass.
// Body: { billing_month: 'YYYY-MM' }
// Doing this per-tenant meant 20 requests and re-running the same room's
// electricity split once per seat.
rentRouter.post('/generate', async (req, res) => {
  try {
    const { billing_month } = req.body;

    if (!isBillingMonth(billing_month)) {
      return res.status(400).json({ error: 'billing_month required in YYYY-MM format' });
    }

    const { data: tenants, error } = await supabase
      .from('tenants')
      .select(TENANT_BILLING_SELECT)
      .eq('status', 'active');

    if (error) throw error;

    const result = await generateRent(tenants || [], billing_month);
    res.status(201).json({ billing_month, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /rent/readings-needed?billing_month=YYYY-MM
// Rooms with someone to bill for the month but no reading for the end of it.
// The Dashboard asks for these before making bills, instead of making them and
// then reporting which rooms came out with no electricity charge.
rentRouter.get('/readings-needed', async (req, res) => {
  try {
    const { billing_month } = req.query;
    if (!isBillingMonth(billing_month)) {
      return res.status(400).json({ error: 'billing_month required in YYYY-MM format' });
    }

    // A reading on the last day or the 1st of the next month both close the
    // month: electricity.js bills up to the latest reading on or before the 1st.
    const lastDay = lastDayOfMonth(billing_month);
    const nextFirst = firstOfNextMonth(billing_month);

    const { data: tenants, error: tErr } = await supabase
      .from('tenants')
      .select('room_id')
      .eq('status', 'active')
      .lte('check_in_date', lastDay);
    if (tErr) throw tErr;

    const roomIds = [...new Set(tenants.map(t => t.room_id))];
    if (roomIds.length === 0) return res.json([]);

    const [{ data: rooms, error: roomErr }, { data: readings, error: readErr }] = await Promise.all([
      supabase.from('rooms').select('id, room_number').in('id', roomIds),
      supabase
        .from('meter_readings')
        .select('room_id, reading_date, reading_value')
        .in('room_id', roomIds)
        .order('reading_date', { ascending: true })
        .order('id', { ascending: true }),
    ]);
    if (roomErr) throw roomErr;
    if (readErr) throw readErr;

    const needed = [];
    for (const room of rooms) {
      const own = readings.filter(r => r.room_id === room.id);
      if (own.some(r => r.reading_date >= lastDay && r.reading_date <= nextFirst)) continue;

      const before = own.filter(r => r.reading_date < lastDay);
      const after = own.find(r => r.reading_date > nextFirst);
      needed.push({
        room_id: room.id,
        room_number: room.room_number,
        previous: before.length ? before[before.length - 1] : null,
        next: after ?? null,
      });
    }

    needed.sort((a, b) => String(a.room_number).localeCompare(String(b.room_number), undefined, { numeric: true }));
    res.json(needed);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /rent/readings — end-of-month readings for several rooms at once.
// Body: { billing_month: 'YYYY-MM', readings: [{ room_id, reading_value }] }
// Each is dated the month's last day and charged to who lived there then.
// Every value is checked before any is saved, so one typo doesn't leave half
// the rooms done.
rentRouter.post('/readings', async (req, res) => {
  try {
    const { billing_month, readings } = req.body;
    if (!isBillingMonth(billing_month)) {
      return res.status(400).json({ error: 'billing_month required in YYYY-MM format' });
    }
    if (!Array.isArray(readings) || readings.length === 0) {
      return res.status(400).json({ error: 'readings must be a non-empty list' });
    }

    const seen = new Set();
    for (const r of readings) {
      const roomId = Number(r?.room_id);
      const value = Number(r?.reading_value);
      if (!Number.isInteger(roomId) || roomId <= 0) {
        return res.status(400).json({ error: 'Each reading needs a valid room_id' });
      }
      if (seen.has(roomId)) return res.status(400).json({ error: `Room ${roomId} is listed twice` });
      seen.add(roomId);
      if (r.reading_value === '' || r.reading_value == null || !Number.isInteger(value) || value < 0) {
        return res.status(400).json({ error: 'Each reading_value must be a whole number, 0 or more' });
      }
    }

    const readingDate = lastDayOfMonth(billing_month);

    const checked = await Promise.all(readings.map(async (r) => {
      const roomId = Number(r.room_id);
      const value = Number(r.reading_value);
      const [prior, next, present] = await Promise.all([
        findPriorReading(roomId, readingDate),
        findNextReading(roomId, readingDate),
        tenantsPresentOn(roomId, readingDate),
      ]);

      let problem = null;
      if (prior && value < prior.reading_value) {
        problem = `${value} is lower than the reading of ${prior.reading_value} on ${prior.reading_date}`;
      } else if (next && value > next.reading_value) {
        problem = `${value} is higher than the later reading of ${next.reading_value} on ${next.reading_date}`;
      }

      return {
        problem,
        row: {
          room_id: roomId,
          reading_date: readingDate,
          reading_value: value,
          active_tenant_ids: present,
          triggered_by: 'routine',
        },
      };
    }));

    const problems = checked.filter(c => c.problem);
    if (problems.length > 0) {
      const { data: rooms } = await supabase
        .from('rooms')
        .select('id, room_number')
        .in('id', problems.map(p => p.row.room_id));
      const roomNo = (id) => rooms?.find(x => x.id === id)?.room_number ?? id;
      const error = problems.map(p => `Room ${roomNo(p.row.room_id)}: ${p.problem}.`).join(' ');
      return res.status(400).json({ error, code: 'READING_OUT_OF_ORDER' });
    }

    // One insert, so it is all or nothing.
    const { data: saved, error } = await supabase
      .from('meter_readings')
      .insert(checked.map(c => c.row))
      .select();
    if (error) throw error;

    res.status(201).json(saved);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /rent/:paymentId/mark-paid
rentRouter.post('/:paymentId/mark-paid', validateId('paymentId'), async (req, res) => {
  try {
    // Verify the payment exists before updating
    const { data: existing, error: lookupError } = await supabase
      .from('rent_payments')
      .select('id, status, total_amount')
      .eq('id', req.params.paymentId)
      .single();

    if (lookupError || !existing) return res.status(404).json({ error: 'Payment not found' });
    if (existing.status === 'paid') return res.status(400).json({ error: 'Payment already marked as paid' });

    const today = new Date().toISOString().substring(0, 10);
    const { data: payment, error } = await supabase
      .from('rent_payments')
      .update({
        status: 'paid',
        paid_date: today,
        amount_paid: req.body.amount_paid || existing.total_amount || 0,
        updated_at: new Date().toISOString()
      })
      .eq('id', req.params.paymentId)
      .select()
      .single();

    if (error) throw error;
    res.json(payment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = { tenantRentRouter, rentRouter };
