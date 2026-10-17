const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');
const { ADMIN_OR_GATEKEEPER } = require('../config/roles');
const upload = require('../middleware/upload');
const { uploadLimiter } = require('../middleware/rateLimit');
const { parseAadhaarOCR } = require('../services/ocr');

router.use(authMiddleware);

/**
 * POST /documents/ocr
 * Pre-tenant upload — runs OCR only, no DB record yet.
 * Used by the onboarding wizard before the tenant is created.
 */
// Each call bills Google Cloud Vision — see middleware/rateLimit.js.
router.post('/ocr', roleCheck(ADMIN_OR_GATEKEEPER), uploadLimiter, upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // A failed read is still a 200: the wizard carries on with empty fields
    // for the admin to fill by hand, and shows `error` so they know why.
    const { rawText, ocrFields, error } = await parseAadhaarOCR(req.file.buffer, req.file.mimetype);

    res.json({ rawText, ocrFields, error: error || null });
  } catch (err) {
    console.error('[/documents/ocr]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
