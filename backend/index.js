// Must be first — loads .env.<NODE_ENV> / .env and fails fast on bad config.
const env = require('./config/env');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const multer = require('multer');
const cron = require('node-cron');
const runReminderCron = require('./jobs/rentReminder');
const supabase = require('./config/supabase');
const { apiLimiter, healthLimiter } = require('./middleware/rateLimit');

const app = express();

// Behind a hosting proxy (Render, Railway, Fly, nginx) req.ip is the proxy's
// own address unless we trust the forwarding header — which would make the
// rate limiter treat all traffic as a single client. Set TRUST_PROXY to the
// number of proxies actually in front of this app. Never set it higher than
// the real hop count: clients can forge extra X-Forwarded-For entries beyond
// that and mint a fresh rate-limit key per request.
app.set('trust proxy', env.TRUST_PROXY);

app.use(helmet({
  // This is a JSON API called from the frontend's origin. Access is governed
  // by CORS below; helmet's default same-origin CORP would additionally block
  // legitimate cross-origin reads.
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

app.use(cors({
  // ALLOWED_ORIGIN is comma-separated, so production and a preview deploy can
  // both be permitted without a code change. Requests with no Origin header
  // (curl, server-to-server, the keep-alive cron) are allowed through — CORS
  // only governs browsers, and auth still applies to everything.
  origin: (origin, callback) => {
    if (!origin || env.ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error(`Origin ${origin} is not allowed by CORS`));
  },
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

const PORT = env.PORT;

// Liveness. Never touches the database — use this to keep a sleeping web host
// (Render/Fly free tier) warm. Ahead of the limiter so pings don't consume the
// request budget.
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Readiness. Runs one trivial query, which is what actually counts as activity
// against a free-tier Supabase project — /health alone never reaches Postgres,
// so pinging it will NOT stop the database from pausing. Returns no data.
app.get('/health/db', healthLimiter, async (req, res) => {
  try {
    const { error } = await supabase.from('settings').select('id').limit(1);
    if (error) throw error;
    res.json({ status: 'ok', db: 'ok' });
  } catch (err) {
    console.error('[health/db]', err.message);
    res.status(503).json({ status: 'degraded', db: 'error' });
  }
});

app.use(apiLimiter);

// Explicit cap. Every JSON endpoint here takes a small object; file uploads go
// through multer (8 MB) and are unaffected by this.
app.use(express.json({ limit: '100kb' }));

// Import routers
const meRouter = require('./routes/me');
const roomsRouter = require('./routes/rooms');
const tenantsRouter = require('./routes/tenants');
const documentsRouter = require('./routes/documents');
const rentRouter = require('./routes/rent');
const policeVerificationRouter = require('./routes/policeVerification');
const gateLogRouter = require('./routes/gateLog');
const settingsRouter = require('./routes/settings');
const documentsOcrRouter = require('./routes/documentsOcr');
const enquiriesRouter = require('./routes/enquiries');

// Mount routers
// /me first: it's what resolves a caller's role, so every other router's
// roleCheck depends on it having run at least once for that account.
app.use('/me', meRouter);
app.use('/rooms', roomsRouter);
app.use('/tenants', tenantsRouter);
app.use('/tenants/:id/documents', documentsRouter);
app.use('/tenants/:id/rent', rentRouter.tenantRentRouter);
app.use('/rent', rentRouter.rentRouter);
app.use('/police-verification', policeVerificationRouter);
app.use('/gate-log', gateLogRouter);
app.use('/settings', settingsRouter);
app.use('/documents', documentsOcrRouter);
// Mixed: POST is public (landing page form), GET/PATCH are admin-only. The
// router applies authMiddleware per-route rather than with router.use(), which
// is why this one looks different from every other mount here.
app.use('/enquiries', enquiriesRouter);

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Central error handler. Without it, Express's default handler answers with an
// HTML page — and includes a stack trace whenever NODE_ENV isn't 'production'.
// It's also the only thing that catches multer's rejections (oversized file,
// disallowed mimetype), which otherwise surface as that HTML page.
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE'
      ? 'File too large — maximum size is 8 MB'
      : 'File upload rejected';
    return res.status(400).json({ error: message });
  }
  if (typeof err?.message === 'string' && err.message.startsWith('Invalid file type')) {
    return res.status(400).json({ error: err.message });
  }
  // A blocked CORS origin is a configuration mismatch, not a server fault.
  // Answering 500 made a missing ALLOWED_ORIGIN look like a backend crash.
  if (typeof err?.message === 'string' && err.message.includes('not allowed by CORS')) {
    console.warn('[cors]', err.message);
    return res.status(403).json({ error: 'Origin not allowed' });
  }
  console.error('[unhandled]', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Daily rent reminders at 9am. The timezone is explicit because hosts run on
// UTC — without it this fires at 2:30pm IST.
cron.schedule('0 9 * * *', () => {
  runReminderCron();
}, { timezone: env.CRON_TIMEZONE });

app.listen(PORT, () => {
  // Echo the resolved config so a misconfigured deploy is obvious in the logs
  // rather than showing up later as a browser CORS error. No secrets here.
  console.log(`Backend listening on ${PORT}`);
  console.log(`  env          ${env.NODE_ENV}`);
  console.log(`  cors origins ${env.ALLOWED_ORIGINS.join(', ') || '(none)'}`);
  console.log(`  trust proxy  ${env.TRUST_PROXY}`);
  console.log(`  cron tz      ${env.CRON_TIMEZONE}`);
  console.log(`  vision ocr   ${env.GOOGLE_CLOUD_VISION_API_KEY ? 'configured' : 'not configured (fields blank)'}`);
});
