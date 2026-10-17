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
 * Deliberately plain — flat blocks on a slow, shallow pulse, no shimmer sweep.
 * The point is to look like the page, not to be looked at. Colour and pulse
 * live in index.css (--color-skeleton, --animate-skeleton).
 */

const Skeleton = ({ className = '' }) => (
  <div className={`bg-skeleton rounded animate-skeleton ${className}`} aria-hidden="true" />
)

/** A header block: title + one line of subtitle. Matches every page's <header>. */
export const HeaderSkeleton = () => (
  <div className="mb-8">
    <Skeleton className="h-8 w-56" />
    <Skeleton className="h-4 w-72 mt-3" />
  </div>
)

/** The office app's page title — a single line, no subtitle under it. */
export const TitleSkeleton = () => (
  <Skeleton className="h-8 w-48 mb-4" />
)

/**
 * Rows stacked inside one card — the shape of the tenant list, rent history
 * and the dashboard's "hasn't paid" card.
 */
export const ListSkeleton = ({ rows = 5, tag = true }) => (
  <div className="bg-surface border border-border rounded-[10px] overflow-hidden">
    <div className="p-4"><Skeleton className="h-6 w-3/5" /></div>
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="border-t border-border px-4 h-[60px] flex items-center justify-between gap-4">
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-3.5 w-1/3" />
        </div>
        {tag && <Skeleton className="h-7 w-[72px] rounded-lg" />}
      </div>
    ))}
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
      <div className="min-h-screen bg-bg md:grid md:grid-cols-[248px_1fr]">
        <div className="hidden md:flex h-screen bg-surface border-r border-border flex-col px-3.5 py-5 gap-6">
          <Skeleton className="h-7 w-28 mx-3" />
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        </div>
        <div className="min-w-0">
          <div className="md:hidden h-[60px] bg-surface border-b border-border flex items-center gap-3 px-3">
            <Skeleton className="h-11 w-[92px] rounded-lg" />
            <Skeleton className="h-5 w-24" />
          </div>
          <div className="px-4 pt-5 md:px-10 md:py-8 max-w-[1000px]">
            <TitleSkeleton />
            <PanelSkeleton count={3} />
          </div>
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
