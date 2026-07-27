require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const runReminderCron = require('./jobs/rentReminder');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

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

// Start cron
cron.schedule('0 9 * * *', () => {
  runReminderCron();
});

app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});
