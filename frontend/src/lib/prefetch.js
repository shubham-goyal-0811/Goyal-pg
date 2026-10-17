/**
 * Chunk warming.
 *
 * Splitting the routes made the first paint cheap, but it moved the cost to the
 * first tap on each sidebar link — and on a slow connection that tap now waits
 * on a download that used to already be there.
 *
 * So once a layout has mounted and the browser has gone idle, quietly fetch the
 * pages that layout links to. By the time anyone taps, the chunk is in the HTTP
 * cache and the transition is instant.
 *
 * Rules this follows:
 *  - only when idle, so it never competes with the page's own API calls
 *  - never on a metered or 2G connection; residents' parents pay for this data
 *  - failures are silent, because nothing here is required for anything to work
 */

const onIdle = (fn) =>
  typeof requestIdleCallback === 'function'
    ? requestIdleCallback(fn, { timeout: 3000 })
    : setTimeout(fn, 1200)

const shouldSkip = () => {
  const c = navigator.connection
  if (!c) return false
  if (c.saveData) return true
  return c.effectiveType === 'slow-2g' || c.effectiveType === '2g'
}

// Loaders already run are remembered — a layout remounting on every navigation
// must not re-enter the import() chain each time.
const warmed = new Set()

/**
 * @param {Array<[string, () => Promise<unknown>]>} entries
 *   [key, loader] pairs. The key just has to be stable; the loader must be the
 *   same `() => import('...')` form used in the route definition, so Vite emits
 *   one chunk rather than two.
 */
export const prefetchRoutes = (entries) => {
  if (shouldSkip()) return () => {}

  const handle = onIdle(() => {
    for (const [key, load] of entries) {
      if (warmed.has(key)) continue
      warmed.add(key)
      load().catch(() => warmed.delete(key)) // let a failed fetch be retried
    }
  })

  return () => {
    if (typeof cancelIdleCallback === 'function') cancelIdleCallback(handle)
    else clearTimeout(handle)
  }
}
