// Node 24+ has native fetch built-in — no import needed

const VISION_API_URL = 'https://vision.googleapis.com/v1/images:annotate';

const parseAadhaarOCR = async (fileBuffer, mimetype) => {
  const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY;

  if (!apiKey || apiKey === 'dummy-vision-api-key') {
    console.warn('[OCR] No Vision API key set. Returning empty fields.');
    return { rawText: '', ocrFields: { name: '', address: '', id_number: '', dob: '' } };
  }

  try {
    const base64Image = fileBuffer.toString('base64');

    const body = {
      requests: [
        {
          image: { content: base64Image },
          features: [{ type: 'TEXT_DETECTION', maxResults: 1 }],
        },
      ],
    };

    const response = await fetch(`${VISION_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[OCR] Vision API HTTP error:', response.status, errText);
      return { rawText: '', ocrFields: { name: '', address: '', id_number: '', dob: '' } };
    }

    const json = await response.json();

    if (json.responses?.[0]?.error) {
      console.error('[OCR] Vision API error:', json.responses[0].error);
      return { rawText: '', ocrFields: { name: '', address: '', id_number: '', dob: '' } };
    }

    const rawText = json.responses?.[0]?.textAnnotations?.[0]?.description || '';
    console.log('[OCR] Raw extracted text:\n', rawText);

    const ocrFields = extractAadhaarFields(rawText);
    console.log('[OCR] Parsed fields:', ocrFields);

    return { rawText, ocrFields };
  } catch (err) {
    console.error('[OCR] Unexpected error:', err.message);
    return { rawText: '', ocrFields: { name: '', address: '', id_number: '', dob: '' } };
  }
};

/**
 * Parse Aadhaar-specific fields from OCR raw text.
 */
const extractAadhaarFields = (rawText) => {
  if (!rawText) return { name: '', address: '', id_number: '', dob: '' };

  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);

  // Aadhaar number: 4+4+4 digits (with spaces or without)
  const aadhaarMatch = rawText.match(/\d{4}\s?\d{4}\s?\d{4}/);
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
