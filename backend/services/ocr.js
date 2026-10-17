// Node 24+ has native fetch built-in — no import needed
const env = require('../config/env');

const VISION_IMAGES_URL = 'https://vision.googleapis.com/v1/images:annotate';
// images:annotate only takes images — a PDF sent there fails with "Bad image
// data". PDFs go through files:annotate, which reads up to 5 pages inline.
const VISION_FILES_URL = 'https://vision.googleapis.com/v1/files:annotate';
const PDF_PAGES = [1, 2]; // Aadhaar is one page, sometimes front and back on two

const EMPTY_FIELDS = { name: '', address: '', id_number: '', dob: '' };

// `error` is written for the admin at the desk, not for a developer — the
// wizard shows it as-is and lets them type the fields by hand.
const failed = (error) => ({ rawText: '', ocrFields: { ...EMPTY_FIELDS }, error });

/**
 * e-Aadhaar PDFs downloaded from UIDAI are password-protected. Vision cannot
 * open them and reports the same unhelpful error as a corrupt file, so check
 * for the encryption dictionary ourselves and say what is actually wrong.
 */
const isEncryptedPdf = (buffer) => buffer.includes('/Encrypt');

const buildRequest = (base64, mimetype) => {
  if (mimetype === 'application/pdf') {
    return {
      url: VISION_FILES_URL,
      body: {
        requests: [{
          inputConfig: { content: base64, mimeType: 'application/pdf' },
          features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
          pages: PDF_PAGES,
        }],
      },
    };
  }
  return {
    url: VISION_IMAGES_URL,
    body: {
      requests: [{
        image: { content: base64 },
        features: [{ type: 'TEXT_DETECTION', maxResults: 1 }],
      }],
    },
  };
};

// files:annotate nests one response per page inside the file's response.
const readText = (json, mimetype) => {
  const top = json.responses?.[0];
  if (mimetype === 'application/pdf') {
    const pages = top?.responses || [];
    const pageError = pages.find(p => p.error)?.error;
    const text = pages.map(p => p.fullTextAnnotation?.text || '').filter(Boolean).join('\n');
    return { error: top?.error || (text ? null : pageError), text };
  }
  return { error: top?.error, text: top?.textAnnotations?.[0]?.description || '' };
};

const parseAadhaarOCR = async (fileBuffer, mimetype) => {
  const apiKey = env.GOOGLE_CLOUD_VISION_API_KEY;

  if (!apiKey || apiKey === 'dummy-vision-api-key') {
    console.warn('[OCR] No Vision API key set. Returning empty fields.');
    return { rawText: '', ocrFields: { ...EMPTY_FIELDS } };
  }

  if (mimetype === 'application/pdf' && isEncryptedPdf(fileBuffer)) {
    return failed('This PDF is password-protected (e-Aadhaar downloads are). Upload a photo or screenshot of the card instead.');
  }

  try {
    const { url, body } = buildRequest(fileBuffer.toString('base64'), mimetype);

    const response = await fetch(`${url}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[OCR] Vision API HTTP error:', response.status, errText);
      return failed('Text extraction service is unavailable right now.');
    }

    const { error, text: rawText } = readText(await response.json(), mimetype);

    if (error) {
      console.error('[OCR] Vision API error:', error);
      return failed('Could not read this file. Try a clearer photo or a different file.');
    }

    const ocrFields = extractAadhaarFields(rawText);
    // Debug-only — never log PII in production
    if (!env.isProduction) {
      console.log('[OCR] Raw extracted text:\n', rawText);
      console.log('[OCR] Parsed fields:', ocrFields);
    }

    return { rawText, ocrFields };
  } catch (err) {
    console.error('[OCR] Unexpected error:', err.message);
    return failed('Text extraction failed unexpectedly.');
  }
};

/**
 * Parse Aadhaar-specific fields from OCR raw text.
 */
const extractAadhaarFields = (rawText) => {
  if (!rawText) return { ...EMPTY_FIELDS };

  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);

  // Aadhaar number: 4+4+4 digits (with spaces or without). Spaces only, not \s —
  // PDF text puts the birth year and the number on adjacent lines, and \s would
  // join them. The lookarounds skip the 16-digit VID printed on the same card.
  const aadhaarMatch = rawText.match(/(?<!\d ?)\d{4} ?\d{4} ?\d{4}(?! ?\d)/);
  const id_number = aadhaarMatch ? aadhaarMatch[0].trim() : '';

  // DOB: DD/MM/YYYY or DD-MM-YYYY or Year of Birth: YYYY
  const dobMatch = rawText.match(/\d{2}[\/\-]\d{2}[\/\-]\d{4}/) ||
                   rawText.match(/Year of Birth\s*[:\-]?\s*(\d{4})/i);
  const dob = dobMatch ? dobMatch[0].trim() : '';

  // Gender lines to skip in name detection
  const skipPatterns = [
    /^(government|india|uidai|unique|identification|authority|male|female|dob|date|address|year|birth|download|digitally|signed|enrolment|enrollment|vid)/i,
    /\d{4}/, // any line with 4+ digits is likely aadhaar/dob/pincode — not a name
  ];

  // Name heuristic: typically the first all-alpha line that isn't a skip keyword
  // and appears before the DOB line or after "To" keyword
  const nameLine = lines.find(line =>
    line.length >= 3 &&
    line.length <= 60 &&
    /^[A-Za-z][A-Za-z\s\.]+$/.test(line) &&
    !skipPatterns.some(p => p.test(line))
  );
  const name = nameLine || '';

  // Address: find line containing "S/O", "C/O", "W/O", "D/O", or "Address"
  // then collect subsequent lines until a 6-digit pincode line
  let address = '';
  const addrKeywordIdx = lines.findIndex(l =>
    /^(s\/o|c\/o|w\/o|d\/o|address)/i.test(l) ||
    /,\s*(dist|district|state|pin|po|ps)/i.test(l)
  );

  const pincodeIdx = lines.findIndex(l => /\b\d{6}\b/.test(l));

  if (addrKeywordIdx !== -1 && pincodeIdx !== -1 && pincodeIdx > addrKeywordIdx) {
    address = lines.slice(addrKeywordIdx, pincodeIdx + 1).join(', ');
  } else if (pincodeIdx > 0) {
    // fallback: grab 3 lines before pincode
    address = lines.slice(Math.max(0, pincodeIdx - 2), pincodeIdx + 1).join(', ');
  }

  return { name, address, id_number, dob };
};

module.exports = { parseAadhaarOCR };
