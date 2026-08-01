require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const multer = require('multer');
const cron = require('node-cron');
const runReminderCron = require('./jobs/rentReminder');
const { apiLimiter } = require('./middleware/rateLimit');

const app = express();

// Behind a hosting proxy (Render, Railway, Fly, nginx) req.ip is the proxy's
// own address unless we trust the forwarding header — which would make the
// rate limiter treat all traffic as a single client. Set TRUST_PROXY to the
// number of proxies actually in front of this app. Never set it higher than
// the real hop count: clients can forge extra X-Forwarded-For entries beyond
// that and mint a fresh rate-limit key per request.
app.set('trust proxy', Number(process.env.TRUST_PROXY || 0));

app.use(helmet({
  // This is a JSON API called from the frontend's origin. Access is governed
  // by CORS below; helmet's default same-origin CORP would additionally block
  // legitimate cross-origin reads.
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || 'http://localhost:5173',
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

const PORT = process.env.PORT || 5000;

// Ahead of the limiter so uptime monitors don't consume the request budget.
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use(apiLimiter);

// Explicit cap. Every JSON endpoint here takes a small object; file uploads go
// through multer (8 MB) and are unaffected by this.
app.use(express.json({ limit: '100kb' }));

// Import routers
const roomsRouter = require('./routes/rooms');
const tenantsRouter = require('./routes/tenants');
const documentsRouter = require('./routes/documents');
const rentRouter = require('./routes/rent');
const policeVerificationRouter = require('./routes/policeVerification');
const gateLogRouter = require('./routes/gateLog');
const settingsRouter = require('./routes/settings');
const documentsOcrRouter = require('./routes/documentsOcr');

// Mount routers
app.use('/rooms', roomsRouter);
app.use('/tenants', tenantsRouter);
app.use('/tenants/:id/documents', documentsRouter);
app.use('/tenants/:id/rent', rentRouter.tenantRentRouter);
app.use('/rent', rentRouter.markPaidRouter);
app.use('/police-verification', policeVerificationRouter);
app.use('/gate-log', gateLogRouter);
app.use('/settings', settingsRouter);
app.use('/documents', documentsOcrRouter);

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
  console.error('[unhandled]', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start cron
cron.schedule('0 9 * * *', () => {
  runReminderCron();
});

app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});
