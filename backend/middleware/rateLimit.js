/**
 * rateLimit.js — request budgets.
 *
 * Two tiers:
 *  - apiLimiter    broad backstop on everything, mounted before auth so that
 *                  garbage tokens can't be sprayed at us for free (every
 *                  request costs a Supabase auth.getUser round-trip).
 *  - uploadLimiter much tighter, for the two routes that run sharp over 8 MB
 *                  in-memory buffers and then bill Google Cloud Vision per
 *                  call. Abuse there costs money, not just CPU.
 *
 * Both are in-memory, so counters reset on restart and are per-process. That's
 * the right fit for a single-instance app; a multi-instance deploy would need
 * a shared store (Redis) for the budgets to mean anything.
 */
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const env = require('../config/env');

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

const tooMany = (message) => (req, res) => res.status(429).json({ error: message });

/**
 * Key by authenticated user when we have one, so several staff sharing an
 * office NAT don't eat each other's budget. ipKeyGenerator normalises IPv6 to
 * a /56 — without it, a single client with an IPv6 allocation could mint an
 * unlimited number of fresh keys.
 */
const userOrIpKey = (req) => (req.user?.id ? `u:${req.user.id}` : ipKeyGenerator(req.ip));

const apiLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: env.RATE_LIMIT_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: userOrIpKey,
  handler: tooMany('Too many requests. Please wait a few minutes and try again.'),
});

const uploadLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: env.RATE_LIMIT_UPLOAD_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: userOrIpKey,
  handler: tooMany('Too many document uploads. Please wait a few minutes and try again.'),
});

/**
 * /health/db touches Postgres, so it can't sit wide open the way /health does.
 * Generous enough for any sane keep-alive schedule (a 1-minute cron uses 15 of
 * these per window) while capping how much DB load a stranger can generate.
 */
const healthLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: env.RATE_LIMIT_HEALTH_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: userOrIpKey,
  handler: tooMany('Too many health checks.'),
});

/**
 * The public enquiry form — the only route in this app an unauthenticated
 * stranger can cause a database write from.
 *
 * Keyed on IP alone, because by definition there is no req.user here. The
 * window is an HOUR rather than the 15 minutes used above: the point isn't to
 * smooth out bursts, it's that the owner's inbox is read by two people on a
 * phone, so even slow, steady spam is expensive to them.
 */
const enquiryLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: env.RATE_LIMIT_ENQUIRY_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip),
  handler: tooMany("You've sent a few messages already. Please call us instead — we'll pick up."),
});

module.exports = { apiLimiter, uploadLimiter, healthLimiter, enquiryLimiter };
