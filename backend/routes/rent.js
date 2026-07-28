const express = require('express');
const supabase = require('../config/supabase');
const authMiddleware = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');
const { validateId } = require('../middleware/validate');

const tenantRentRouter = express.Router({ mergeParams: true });
const markPaidRouter = express.Router();

tenantRentRouter.use(authMiddleware);
tenantRentRouter.use(roleCheck('admin'));
markPaidRouter.use(authMiddleware);
markPaidRouter.use(roleCheck('admin'));

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

// POST /rent/:paymentId/mark-paid
markPaidRouter.post('/:paymentId/mark-paid', validateId('paymentId'), async (req, res) => {
  try {
    // Verify the payment exists before updating
    const { data: existing, error: lookupError } = await supabase
      .from('rent_payments')
      .select('id, status')
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

module.exports = { tenantRentRouter, markPaidRouter };
