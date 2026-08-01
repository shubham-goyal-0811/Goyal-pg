const express = require('express');
const router = express.Router({ mergeParams: true }); // to access :id (tenant_id)
const supabase = require('../config/supabase');
const authMiddleware = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');
const { ADMIN_ONLY, ADMIN_OR_GATEKEEPER } = require('../config/roles');
const upload = require('../middleware/upload');
const { uploadLimiter } = require('../middleware/rateLimit');
const { parseAadhaarOCR } = require('../services/ocr');
const sharp = require('sharp');
const { validateId } = require('../middleware/validate');

router.use(authMiddleware);

// GET /tenants/:id/documents — admin only. Gatekeepers may upload ID scans
// during onboarding but must not be able to browse or read them back.
router.get('/', roleCheck(ADMIN_ONLY), validateId(), async (req, res) => {
  try {
    const { data: documents, error } = await supabase
      .from('tenant_documents')
      .select('*')
      .eq('tenant_id', req.params.id);

    if (error) throw error;
    res.json(documents);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /tenants/:id/documents
// uploadLimiter sits after roleCheck so rejected callers don't burn the budget
// and so it can key on req.user.id rather than a shared office IP.
router.post('/', roleCheck(ADMIN_OR_GATEKEEPER), uploadLimiter, validateId(), upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const tenantId = req.params.id;
    const { doc_type } = req.body; // e.g., 'id_proof_front'
    
    // Compression logic
    let fileBuffer = req.file.buffer;
    let mimetype = req.file.mimetype;
    let fileNameExt = req.file.originalname.split('.').pop();
    
    if (mimetype.startsWith('image/')) {
      // Compress image using sharp
      fileBuffer = await sharp(req.file.buffer)
        .resize({ width: 1600, withoutEnlargement: true }) // reasonable max width
        .jpeg({ quality: 75 }) // compress to 75% quality JPEG
        .toBuffer();
      mimetype = 'image/jpeg';
      fileNameExt = 'jpg';
    }

    // 1. Upload to Supabase Storage
    const fileName = `${tenantId}/${Date.now()}-compressed.${fileNameExt}`;
    const { data: storageData, error: storageError } = await supabase.storage
      .from('Goyal-pg')
      .upload(fileName, fileBuffer, {
        contentType: mimetype,
        upsert: false
      });

    if (storageError) throw storageError;

    // Get public URL or signed URL (assuming private bucket, so we store the path)
    const fileUrl = fileName; // Store path, generate signed URL on demand later

    // 2. Run OCR (Dummy)
    const { rawText, ocrFields } = await parseAadhaarOCR(req.file.buffer, req.file.mimetype);

    // 3. Save to DB
    const { data: document, error: dbError } = await supabase
      .from('tenant_documents')
      .insert([{
        tenant_id: tenantId,
        doc_type: doc_type || 'other',
        file_url: fileUrl,
        ocr_raw_data: { text: rawText }
      }])
      .select()
      .single();

    if (dbError) throw dbError;

    // Return document info and OCR fields for the frontend to review
    res.status(201).json({
      document,
      ocrFields
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /tenants/:id/documents/:docId/signed-url
// Generates a short-lived signed URL so the frontend can preview the file
router.get('/:docId/signed-url', roleCheck(ADMIN_ONLY), validateId(), validateId('docId'), async (req, res) => {
  try {
    const { data: doc, error: docError } = await supabase
      .from('tenant_documents')
      .select('file_url')
      .eq('id', req.params.docId)
      .eq('tenant_id', req.params.id)
      .single();

    if (docError || !doc) return res.status(404).json({ error: 'Document not found' });

    const { data: signed, error: signError } = await supabase.storage
      .from('Goyal-pg')
      .createSignedUrl(doc.file_url, 60 * 5); // 5-minute expiry

    if (signError) throw signError;

    res.json({ signedUrl: signed.signedUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
