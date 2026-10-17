/**
 * Display formatting shared by EVERY surface — public site, office app and
 * resident portal.
 *
 * Money is rendered from strings Postgres returns for `decimal` columns, so
 * everything goes through Number() first — `'4500.00'` must not print as
 * "₹4500.00" in one place and "₹4,500" in another on the same screen.
 *
 * Dates have the same problem, worse: the office app used to print a check-in
 * as the raw `2026-07-14`, its documents as `14/7/2026`, and its gate log in
 * whatever the browser's default locale was, while the portal printed
 * `14 Jul 2026`. Same tenant, four spellings of one day. Import from here
 * instead of calling toLocaleDateString at the call site.
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

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

/**
 * Postgres `date` columns (check_in_date, reading_date, billing_month) arrive as
 * '2026-07-14'. `new Date()` reads that as UTC midnight, so any browser set west
 * of UTC renders it as the 13th. Build those as a LOCAL date instead; anything
 * with a time component (timestamptz: in_time, uploaded_at) is a real instant
 * and is left alone.
 */
const parse = (value) => {
  if (!value) return null
  if (typeof value === 'string' && DATE_ONLY.test(value)) {
    const [y, m, d] = value.split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

/** '2026-07-01' → 'July 2026' */
export const monthLabel = (value) => {
  const d = parse(value)
  return d ? d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) : '—'
}

/** '2026-07-14' → '14 Jul 2026' — the default for any date shown to a user. */
export const dateLabel = (value) => {
  const d = parse(value)
  return d ? d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
}

/** '2026-07-14T19:30:00Z' → '14 Jul 2026, 7:30 pm' — for real timestamps. */
export const dateTimeLabel = (value) => {
  const d = parse(value)
  if (!d) return '—'
  return `${dateLabel(d)}, ${d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}`
}

/** '7:30 pm' — when the day is already obvious from context. */
export const timeLabel = (value) => {
  const d = parse(value)
  return d ? d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : '—'
}

/**
 * 'Today, 7:30 pm' / 'Yesterday' / '3 days ago' / '14 Jul 2026'.
 * For feeds where recency is the point — enquiries, gate log. Falls back to
 * dateLabel past a week, so old rows read the same as dates everywhere else.
 */
export const relativeLabel = (value) => {
  const d = parse(value)
  if (!d) return '—'

  // Compare calendar days, not elapsed hours — 11pm yesterday to 1am today is
  // two hours but reads as "Yesterday" to a human, not "Today".
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const startOfThat = new Date(d)
  startOfThat.setHours(0, 0, 0, 0)
  const days = Math.round((startOfToday - startOfThat) / 86_400_000)

  if (days === 0) return `Today, ${timeLabel(d)}`
  if (days === 1) return `Yesterday, ${timeLabel(d)}`
  if (days > 1 && days < 7) return `${days} days ago`
  return dateLabel(d)
}

/** Today as 'YYYY-MM-DD' in the user's own timezone — for <input type="date">. */
export const todayISO = () => {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
