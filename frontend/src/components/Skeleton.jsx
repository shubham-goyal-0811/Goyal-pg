/**
 * Loading placeholders.
 *
 * Every page used to render the string "Loading..." centred in an empty box
 * while its first request was in flight. On the mid-range Androids these run on,
 * over a phone connection, that is a second or two of a page that looks broken
 * — and then the whole layout appears at once and shifts everything.
 *
 * These draw the shape of the content that is coming instead. The page arrives
 * in place: same card sizes, same column count, so nothing jumps when the real
 * data lands.
 *
 * Deliberately plain — flat grey blocks on a 150ms pulse, no shimmer sweep. The
 * point is to look like the page, not to be looked at.
 */

const Skeleton = ({ className = '' }) => (
  <div className={`bg-border/60 rounded animate-pulse ${className}`} aria-hidden="true" />
)

/** A header block: title + one line of subtitle. Matches every page's <header>. */
export const HeaderSkeleton = () => (
  <div className="mb-8">
    <Skeleton className="h-8 w-56" />
    <Skeleton className="h-4 w-72 mt-3" />
  </div>
)

/** One card in a grid. `lines` matches how many rows of content it will hold. */
export const CardSkeleton = ({ lines = 3 }) => (
  <div className="bg-surface border border-border rounded-xl p-5">
    <div className="flex justify-between items-center mb-5">
      <Skeleton className="h-6 w-32" />
      <Skeleton className="h-6 w-20 rounded-full" />
    </div>
    <div className="space-y-3">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  </div>
)

export const CardGridSkeleton = ({ count = 6, lines = 3, className = 'grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6' }) => (
  <div className={className}>
    {Array.from({ length: count }).map((_, i) => (
      <CardSkeleton key={i} lines={lines} />
    ))}
  </div>
)

/** Matches the bordered tables on Gate Log and Police Verification. */
export const TableSkeleton = ({ rows = 6, cols = 4 }) => (
  <div className="bg-surface border border-border rounded-xl overflow-hidden">
    <div className="bg-bg border-b border-border p-4 flex gap-4">
      {Array.from({ length: cols }).map((_, i) => (
        <Skeleton key={i} className="h-4 flex-1" />
      ))}
    </div>
    {Array.from({ length: rows }).map((_, r) => (
      <div key={r} className="border-b border-border last:border-b-0 p-4 flex gap-4">
        {Array.from({ length: cols }).map((_, c) => (
          <Skeleton key={c} className="h-4 flex-1" />
        ))}
      </div>
    ))}
  </div>
)

/** Stacked panels — the resident portal and any single-column page. */
export const PanelSkeleton = ({ count = 3 }) => (
  <div className="space-y-4">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="bg-surface border border-border rounded-xl p-5 space-y-3">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    ))}
  </div>
)

/**
 * Route-level fallback, shown while a lazily-loaded page's JavaScript is still
 * downloading. Generic on purpose — it stands in for any page, so it draws a
 * header and some panels rather than guessing at a layout it might get wrong.
 */
export const RouteSkeleton = () => (
  <div>
    <HeaderSkeleton />
    <PanelSkeleton count={3} />
  </div>
)

/**
 * Shown by AuthProvider while the session is restored and GET /me answers —
 * before any route, layout or page can render.
 *
 * In a browser tab that wait is usually skipped: the identity cache lives in
 * sessionStorage and survives a reload. An installed PWA starts a fresh
 * session on every launch, so it waits every time, on a backend that may be
 * cold — and this used to be a blank white screen for all of it.
 *
 * Draws the shell of whichever app the URL is in, sized like Layout and
 * TenantLayout, so the real one lands in place.
 */
export const AppSkeleton = ({ path }) => {
  if (path.startsWith('/admin')) {
    return (
      <div className="flex h-screen bg-bg">
        <div className="hidden md:flex w-64 bg-surface border-r border-border flex-col p-6 gap-8">
          <Skeleton className="h-8 w-32" />
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        </div>
        <div className="flex-1 overflow-hidden p-4 md:p-8 pt-16 md:pt-8 w-full">
          <div className="max-w-6xl mx-auto"><RouteSkeleton /></div>
        </div>
      </div>
    )
  }

  if (path.startsWith('/me')) {
    return (
      <div className="min-h-screen bg-bg flex flex-col">
        <div className="bg-surface border-b border-border">
          <div className="max-w-2xl mx-auto px-4 h-16 flex items-center">
            <Skeleton className="h-5 w-28" />
          </div>
        </div>
        <div className="flex-1 w-full max-w-2xl mx-auto px-4 py-6">
          <PanelSkeleton count={3} />
        </div>
      </div>
    )
  }

  // /login (the PWA's start_url) and the public site: no shell to guess at.
  return (
    <div className="min-h-screen bg-bg p-4 md:p-8">
      <div className="max-w-2xl mx-auto"><RouteSkeleton /></div>
    </div>
  )
}

export default Skeleton
