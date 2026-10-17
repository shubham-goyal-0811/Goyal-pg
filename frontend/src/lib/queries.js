import { useQuery } from '@tanstack/react-query'
import { api, getTTL } from './api'
import { queryClient } from './queryClient'

/**
 * React Query, keyed by endpoint.
 *
 * The query key is the endpoint string itself — ['/tenants/12'], ['/rooms'].
 * That is what lets api.js invalidate by the same prefixes it always has: a
 * PATCH to /tenants/12 marks every key starting '/tenants' stale and refetches
 * the ones on screen, with no per-page wiring.
 *
 * Every helper below builds its options through apiQuery(), so a prefetch and
 * the page that later reads it can never disagree about the key.
 */
export const apiQuery = (endpoint) => ({
  queryKey: [endpoint],
  // fresh: React Query is the cache now. Reading api.js's own response cache
  // here would hand a background refresh the same stale copy it is replacing.
  queryFn: () => api.get(endpoint, { fresh: true }),
  staleTime: getTTL(endpoint),
})

export const useApiQuery = (endpoint, options) =>
  useQuery({ ...apiQuery(endpoint), ...options })

// Start loading a page's data before it is opened — on hover, or the moment a
// finger lands on a card. Does nothing if the data is already fresh, and never
// throws: a failed prefetch just means the page fetches for itself.
export const prefetchApi = (endpoint) => queryClient.prefetchQuery(apiQuery(endpoint))

// Write a mutation's result straight into the cache so the screen updates on
// the response, not on the refetch that api.js triggers after it.
export const setApiData = (endpoint, updater) => queryClient.setQueryData([endpoint], updater)
