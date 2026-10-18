/**
 * Tenant search, run on the device against the full list so results change
 * with every keystroke instead of after a round trip.
 *
 * Forgiving on purpose. The person typing is at a desk with a phone in one
 * hand, spelling a name they heard rather than read — "Shubam" for Shubham,
 * "Pipsoo" for Pipsu. So:
 *   - every word typed has to match some word of the name, in any order;
 *   - a word matches if the name word starts with it, contains it, or is a
 *     letter or two off (a typo, a missing or swapped letter);
 *   - common spelling swaps count as the same (aa/a, ee/i, oo/u, ph/f, w/v);
 *   - digits match a mobile number anywhere in it, or a room number exactly.
 */

// Lower-case, accents off, anything that isn't a letter or digit becomes a space.
const clean = (s) => String(s ?? '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()

// The same name spelt the way it sounds, so spelling variants compare equal.
const sound = (w) => w
  .replace(/ph/g, 'f')
  .replace(/w/g, 'v')
  .replace(/ee/g, 'i')
  .replace(/oo/g, 'u')
  .replace(/(.)\1+/g, '$1')

// Typos allowed for a word of this length. Short words must be exact, or "ram"
// would match half the building.
const allowedTypos = (len) => (len <= 3 ? 0 : len <= 6 ? 1 : 2)

/** Edit distance, counting a swap of two neighbouring letters as one edit. */
const distance = (a, b) => {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
      }
    }
  }
  return d[a.length][b.length]
}

/**
 * How well one typed word matches one word of a name — lower is better, null
 * for no match. Compared against the name word's start as well as the whole
 * word, because the admin is usually still typing it.
 */
const wordScore = (typed, word) => {
  if (word === typed) return 0
  if (word.startsWith(typed)) return 1
  if (typed.length >= 3 && word.includes(typed)) return 2

  const t = sound(typed)
  const w = sound(word)
  if (w.startsWith(t)) return 2
  const limit = allowedTypos(typed.length)
  if (limit === 0) return null

  let best = distance(t, w)
  for (let len = t.length - 1; len <= t.length + 1; len++) {
    if (len > 0 && len < w.length) best = Math.min(best, distance(t, w.slice(0, len)))
  }
  return best <= limit ? 3 + best : null
}

/**
 * Score a tenant against the search box — lower is better, null if it doesn't
 * match at all.
 */
const tenantScore = (tenant, words) => {
  const nameWords = clean(tenant.full_name).split(' ').filter(Boolean)
  const phone = String(tenant.phone_number ?? '').replace(/\D/g, '')
  const room = clean(tenant.rooms?.room_number)

  let total = 0
  for (const typed of words) {
    if (/^\d+$/.test(typed)) {
      if (room && typed === room) continue
      // Typed with the country code, the number still has to match.
      const digits = typed.length > 10 && typed.startsWith('91') ? typed.slice(2) : typed
      if (phone && digits.length >= 3 && phone.includes(digits)) { total += 1; continue }
      return null
    }

    let best = null
    for (const word of nameWords) {
      const s = wordScore(typed, word)
      if (s !== null && (best === null || s < best)) best = s
    }
    if (best === null) return null
    total += best
  }
  return total
}

/**
 * Tenants matching the search box, best match first. People still living here
 * come before people who have moved out when the match is equally good.
 */
export const searchTenants = (tenants, query) => {
  const cleaned = clean(query)
  // All digits is one number however it was spaced: "+91 98765 43210".
  const words = /^[\d ]+$/.test(cleaned) ? [cleaned.replace(/ /g, '')] : cleaned.split(' ').filter(Boolean)
  if (words.length === 0) return []

  return tenants
    .map(t => ({ t, score: tenantScore(t, words) }))
    .filter(r => r.score !== null)
    .sort((a, b) =>
      a.score - b.score
      || (a.t.status === 'active' ? 0 : 1) - (b.t.status === 'active' ? 0 : 1)
      || a.t.full_name.localeCompare(b.t.full_name))
    .map(r => r.t)
}
