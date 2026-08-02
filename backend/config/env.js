/**
 * env.js — the single place environment config is loaded and validated.
 *
 * Load order (first value wins; dotenv never overwrites an already-set var):
 *   1. Real process environment  — what Render/Railway inject. Always wins.
 *   2. .env.<NODE_ENV>           — e.g. .env.production, .env.development
 *   3. .env                      — shared base
 *
 * So switching environments locally is just NODE_ENV=production npm start, and
 * on a host you set dashboard variables and ship no .env at all.
 *
 * Anything required is checked at boot. A missing ALLOWED_ORIGIN used to fall
 * back to http://localhost:5173, which in production surfaces as unexplained
 * CORS failures in the browser rather than a failure here.
 */
const path = require('path');
const dotenv = require('dotenv');

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProduction = NODE_ENV === 'production';
const root = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(root, `.env.${NODE_ENV}`) });
dotenv.config({ path: path.join(root, '.env') });

const missing = [];

const required = (name) => {
  const value = process.env[name];
  if (!value) missing.push(name);
  return value;
};

/** Required in production, defaulted in development. */
const requiredInProd = (name, devDefault) => {
  const value = process.env[name];
  if (value) return value;
  if (isProduction) {
    missing.push(name);
    return undefined;
  }
  return devDefault;
};

const num = (name, fallback) => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  if (Number.isNaN(parsed)) {
    missing.push(`${name} (got "${raw}", expected a number)`);
    return fallback;
  }
  return parsed;
};

const env = {
  NODE_ENV,
  isProduction,

  PORT: num('PORT', 5000),

  SUPABASE_URL: required('SUPABASE_URL'),
  SUPABASE_SERVICE_ROLE_KEY: required('SUPABASE_SERVICE_ROLE_KEY'),

  // Comma-separated, so a preview deployment and the production domain can
  // both be allowed without a code change.
  ALLOWED_ORIGINS: (requiredInProd('ALLOWED_ORIGIN', 'http://localhost:5173') || '')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean),

  // Never higher than the real number of proxies — clients can forge extra
  // X-Forwarded-For entries beyond that and mint a fresh rate-limit key.
  TRUST_PROXY: num('TRUST_PROXY', 0),

  RATE_LIMIT_MAX: num('RATE_LIMIT_MAX', 500),
  RATE_LIMIT_UPLOAD_MAX: num('RATE_LIMIT_UPLOAD_MAX', 40),
  RATE_LIMIT_HEALTH_MAX: num('RATE_LIMIT_HEALTH_MAX', 60),
  // Per HOUR, not per 15 minutes — see middleware/rateLimit.js. A real family
  // enquiring about a room sends one message; five is already generous.
  RATE_LIMIT_ENQUIRY_MAX: num('RATE_LIMIT_ENQUIRY_MAX', 5),

  ROLE_CACHE_TTL_MS: num('ROLE_CACHE_TTL_MS', 60_000),

  CRON_TIMEZONE: process.env.CRON_TIMEZONE || 'Asia/Kolkata',

  // Optional: OCR degrades to empty fields without it (services/ocr.js).
  GOOGLE_CLOUD_VISION_API_KEY: process.env.GOOGLE_CLOUD_VISION_API_KEY || null,
};

if (missing.length) {
  throw new Error(
    `[env] Missing or invalid required configuration: ${missing.join(', ')}.\n` +
    `      NODE_ENV=${NODE_ENV}. Set these in .env.${NODE_ENV}, .env, or your host's dashboard.`
  );
}

// A production deploy that forgot NODE_ENV logs full OCR text — including
// Aadhaar name, address and number — because services/ocr.js treats any
// non-production env as debuggable. Make that loud rather than silent.
if (!isProduction) {
  console.warn(
    `[env] NODE_ENV is "${NODE_ENV}" — debug logging is ON and may write ID-document ` +
    'contents to the console. Set NODE_ENV=production before deploying.'
  );
}

module.exports = env;
