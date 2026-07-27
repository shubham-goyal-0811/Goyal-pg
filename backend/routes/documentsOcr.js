const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');
const upload = require('../middleware/upload');
const { parseAadhaarOCR } = require('../services/ocr');

router.use(authMiddleware);
router.use(roleCheck('admin'));

/**
 * POST /documents/ocr
 * Pre-tenant upload — runs OCR only, no DB record yet.
 * Used by the onboarding wizard before the tenant is created.
 */
router.post('/ocr', upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { rawText, ocrFields } = await parseAadhaarOCR(req.file.buffer, req.file.mimetype);

    res.json({ rawText, ocrFields });
  } catch (err) {
    console.error('[/documents/ocr]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
