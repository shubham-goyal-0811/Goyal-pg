import { QueryClient } from '@tanstack/react-query'

/**
 * The one React Query client for the app.
 *
 * Kept in its own module with no imports from lib/api.js, because api.js needs
 * it (mutations invalidate queries) and lib/queries.js needs both — this way
 * neither side has to import the other.
 *
 * Freshness is set per endpoint in lib/queries.js, from the same TTL table the
 * old response cache used, so nothing here goes stale sooner or later than it
 * did before. What changes is what happens once it IS stale: the page keeps
 * showing what it had and refreshes behind it, instead of dropping back to a
 * skeleton.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Ten minutes in memory after the last screen using it unmounts. Long
      // enough that going Dashboard → tenant → back never shows a skeleton.
      gcTime: 10 * 60 * 1000,

      // Phone connections drop requests; a single lost packet shouldn't put an
      // error on screen. But a 4xx is an answer, not a blip — retrying a 403 or
      // a 404 only delays the message, and retrying a 429 makes it worse.
      retry: (failureCount, err) => {
        if (err?.status && err.status < 500) return false
        return failureCount < 2
      },
    },
  },
})
