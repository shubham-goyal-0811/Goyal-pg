/**
 * enquiries.js — messages from the public landing page.
 *
 * POST / is the ONLY unauthenticated route in this application. Everything
 * about it is written on that assumption:
 *
 *   - no auth, so the rate limiter keys on IP and the window is an hour
 *   - a honeypot field that a human never sees and a bot always fills
 *   - hard length caps, rejected rather than truncated, so a 2 MB "name"
 *     can't be stored (express.json's 100kb cap is the outer bound; these are
 *     the inner ones)
 *   - the response never echoes stored content back, and is identical whether
 *     the row was written or silently dropped as spam. A spammer gets no
 *     signal about which of their attempts landed.
 *
 * The table it writes to references nothing else in the schema, so the blast
 * radius of anything that gets through is one row of junk text.
 */
const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const authMiddleware = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');
const { ADMIN_ONLY } = require('../config/roles');
const { enquiryLimiter } = require('../middleware/rateLimit');
const { validateId } = require('../middleware/validate');

const LIMITS = { name: 80, phone: 20, email: 254, message: 1000 };
const STATUSES = new Set(['new', 'contacted', 'closed']);

const text = (raw) => (typeof raw === 'string' ? raw.trim() : '');

/**
 * Indian mobile numbers, forgivingly. Accepts spaces, dashes, a +91 or 0
 * prefix. Stored as the bare 10 digits so the inbox can build tel: and
 * WhatsApp links without re-parsing.
 */
const normalizePhone = (raw) => {
  const digits = text(raw).replace(/\D/g, '');
  if (digits.length === 10) return digits;
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  return null;
};

// ── Public ───────────────────────────────────────────────────────────────────

// POST /enquiries — no authMiddleware. Deliberate.
router.post('/', enquiryLimiter, async (req, res) => {
  try {
    // Honeypot. Hidden from real users by CSS and label-less, so anything in
    // it came from something filling every field it could find. Answer 200 so
    // the sender learns nothing, and write nothing.
    if (text(req.body.website)) {
      console.warn('[enquiries] honeypot tripped');
      return res.json({ ok: true });
    }

    const name = text(req.body.name);
    const message = text(req.body.message);
    const email = text(req.body.email).toLowerCase();
    const phone = normalizePhone(req.body.phone);

    if (!name) return res.status(400).json({ error: 'Please enter your name' });
    if (!phone) return res.status(400).json({ error: 'Please enter a valid 10-digit mobile number' });

    if (name.length > LIMITS.name)       return res.status(400).json({ error: 'That name is too long' });
    if (email.length > LIMITS.email)     return res.status(400).json({ error: 'That email is too long' });
    if (message.length > LIMITS.message) return res.status(400).json({ error: 'Please keep your message under 1000 characters' });

    const { error } = await supabase
      .from('enquiries')
      .insert([{ name, phone, email: email || null, message: message || null }]);

    if (error) throw error;

    // Bare acknowledgement — no id, no echo of what was stored.
    res.json({ ok: true });
  } catch (err) {
    console.error('[enquiries] POST', err.message);
    res.status(500).json({ error: 'Could not send your message. Please call us instead.' });
  }
});

// ── Admin inbox ──────────────────────────────────────────────────────────────

router.get('/', authMiddleware, roleCheck(ADMIN_ONLY), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('enquiries')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id', authMiddleware, roleCheck(ADMIN_ONLY), validateId(), async (req, res) => {
  try {
    const { status } = req.body;
    if (!STATUSES.has(status)) {
      return res.status(400).json({ error: 'status must be new, contacted or closed' });
    }

    const { data, error } = await supabase
      .from('enquiries')
      .update({ status })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
