/**
 * validate.js — shared input guards
 *
 * Why this matters:
 *  - Supabase JS client uses PostgREST. Structured calls (.eq, .insert, .update)
 *    are parameterized and safe. BUT the .or() filter method takes a raw filter
 *    STRING — user input interpolated there can inject extra PostgREST clauses.
 *  - Numeric route params (req.params.id) arrive as strings. Passing a non-numeric
 *    string to PostgREST causes a 400 from Supabase instead of our own clean error.
 *  - This module provides: a route-param integer guard and a search sanitizer.
 */

/**
 * Middleware: ensures req.params[paramName] is a positive integer.
 * Returns 400 immediately if not. Coerces to Number so downstream code is clean.
 * Usage: router.get('/:id', validateId(), async (req, res) => { ... })
 *        router.get('/:docId', validateId('docId'), async (req, res) => { ... })
 */
const validateId = (paramName = 'id') => (req, res, next) => {
  const raw = req.params[paramName];
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    return res.status(400).json({ error: `Invalid ${paramName}: must be a positive integer` });
  }
  req.params[paramName] = n; // coerce to Number for downstream use
  next();
};

/**
 * Sanitize a free-text search string before interpolating into a PostgREST
 * .or() filter. Strips characters that have meaning in PostgREST filter syntax:
 *   ( ) , . and control characters.
 * Also trims whitespace and limits length to 100 chars.
 */
const sanitizeSearch = (raw) => {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/[(),.\x00-\x1F\x7F]/g, '') // remove PostgREST filter metacharacters + control chars
    .trim()
    .substring(0, 100);
};

/**
 * Normalize an address for storage/lookup, or return null if it isn't one.
 *
 * Lower-casing is not cosmetic here: tenants.login_email is matched with a
 * plain .eq() by routes/me.js, and is indexed on lower(login_email). Using
 * .ilike() instead would make '_' and '%' in an address behave as wildcards.
 *
 * The pattern is deliberately loose — one @, no spaces, a dot in the domain.
 * Anything stricter rejects addresses that really exist, and the real proof of
 * ownership is that the person can sign into Google with it.
 */
const normalizeEmail = (raw) => {
  if (typeof raw !== 'string') return null;
  const value = raw.trim().toLowerCase();
  if (value.length < 5 || value.length > 254) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return null;
  return value;
};

/**
 * Indian mobile numbers, forgivingly. Accepts spaces, dashes, a +91 or 0
 * prefix. Stored as the bare 10 digits so the office app can build tel: and
 * WhatsApp links without re-parsing. Returns null if it isn't one.
 *
 * Every Indian mobile starts with 6, 7, 8 or 9 — checking that catches a
 * dropped or doubled digit that a length check alone lets through.
 */
const normalizePhone = (raw) => {
  if (typeof raw !== 'string') return null;
  let digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
};

/**
 * ── ID proof ────────────────────────────────────────────────────────────────
 *
 * These numbers reach us two ways, and both of them produce garbage:
 *   - OCR of a photographed Aadhaar card (services/ocr.js), which reads a 5 as
 *     a 6 whenever the card is creased or the light is bad
 *   - an admin retyping the number off the card by hand
 *
 * A wrong Aadhaar number is not a cosmetic problem — it is what goes on the
 * police verification form. Nothing downstream re-checks it, so it gets checked
 * here, at the only two places it can be written.
 */
const ID_PROOF_TYPES = ['aadhaar', 'pan', 'passport', 'driving_license'];

// Verhoeff checksum — the dihedral-group check Aadhaar numbers carry in their
// 12th digit. This is the whole reason to validate rather than just count
// digits: a single mistyped or misread digit fails it, which is exactly the
// error mode we have. Tables are from the standard algorithm.
const VERHOEFF_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const VERHOEFF_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

const passesVerhoeff = (digits) => {
  let c = 0;
  const reversed = digits.split('').reverse().map(Number);
  for (let i = 0; i < reversed.length; i++) {
    c = VERHOEFF_D[c][VERHOEFF_P[i % 8][reversed[i]]];
  }
  return c === 0;
};

/**
 * Validate and normalize an ID proof pair for storage.
 *
 * Returns { ok: true, type, number } or { ok: false, error } with a message
 * written for the admin holding the card, not for a developer.
 *
 * Normalizing matters as much as validating: the same Aadhaar typed as
 * '1234 5678 9012' and '123456789012' must not become two different tenants in
 * a search, and PAN is compared case-sensitively by every agency that asks for it.
 */
const normalizeIdProof = (rawType, rawNumber) => {
  const type = typeof rawType === 'string' ? rawType.trim().toLowerCase() : '';
  if (!ID_PROOF_TYPES.includes(type)) {
    return { ok: false, error: `id_proof_type must be one of: ${ID_PROOF_TYPES.join(', ')}` };
  }

  if (typeof rawNumber !== 'string' || !rawNumber.trim()) {
    return { ok: false, error: 'ID proof number is required' };
  }
  // Spaces and hyphens are how these are printed, not part of the number.
  const value = rawNumber.replace(/[\s-]/g, '').toUpperCase();

  if (type === 'aadhaar') {
    if (!/^\d{12}$/.test(value)) {
      return { ok: false, error: 'Aadhaar number must be exactly 12 digits' };
    }
    if (value[0] === '0' || value[0] === '1') {
      return { ok: false, error: 'Aadhaar numbers never start with 0 or 1 — re-check the first digit' };
    }
    if (!passesVerhoeff(value)) {
      return {
        ok: false,
        error: 'That Aadhaar number fails its built-in checksum, so at least one digit is wrong. Re-check it against the card.'
      };
    }
  }

  if (type === 'pan' && !/^[A-Z]{5}\d{4}[A-Z]$/.test(value)) {
    return { ok: false, error: 'PAN must be 5 letters, 4 digits, then 1 letter (e.g. ABCDE1234F)' };
  }

  if (type === 'passport' && !/^[A-Z]\d{7}$/.test(value)) {
    return { ok: false, error: 'Passport number must be 1 letter followed by 7 digits' };
  }

  if (type === 'driving_license' && !/^[A-Z0-9]{8,20}$/.test(value)) {
    return { ok: false, error: 'Driving licence number must be 8–20 letters or digits' };
  }

  return { ok: true, type, number: value };
};

module.exports = { validateId, sanitizeSearch, normalizeEmail, normalizePhone, normalizeIdProof, ID_PROOF_TYPES };
