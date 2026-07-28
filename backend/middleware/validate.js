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

module.exports = { validateId, sanitizeSearch };
