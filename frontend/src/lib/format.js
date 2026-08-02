/**
 * Display formatting shared by the resident portal.
 *
 * Money is rendered from strings Postgres returns for `decimal` columns, so
 * everything goes through Number() first — `'4500.00'` must not print as
 * "₹4500.00" in one place and "₹4,500" in another on the same screen.
 */

export const rupees = (value) => {
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  // Whole rupees unless there are real paise. Bills are almost always round;
  // the electricity split is where the paise show up, and hiding them there
  // makes the total look wrong.
  const hasPaise = Math.round(n * 100) % 100 !== 0
  return `₹${n.toLocaleString('en-IN', {
    minimumFractionDigits: hasPaise ? 2 : 0,
    maximumFractionDigits: 2,
  })}`
}

/** '2026-07-01' → 'July 2026' */
export const monthLabel = (isoDate) =>
  isoDate
    ? new Date(isoDate).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
    : '—'

/** '2026-07-14' → '14 Jul 2026' */
export const dateLabel = (isoDate) =>
  isoDate
    ? new Date(isoDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—'
