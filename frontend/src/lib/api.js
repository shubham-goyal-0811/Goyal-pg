import { supabase } from './supabase'
import { API_BASE_URL } from './env'
import { queryClient } from './queryClient'

const API_BASE = API_BASE_URL

// ── Token Cache ──────────────────────────────────────────────────────────────
// Avoids a Supabase gateway round-trip on every single api.get/post/patch call.
// Token is reused until 60 s before JWT expiry.
let _cachedToken = null
let _tokenExpiresAt = 0 // Unix seconds

const getToken = async () => {
  const now = Math.floor(Date.now() / 1000)
  if (_cachedToken && now < _tokenExpiresAt - 60) return _cachedToken

  const { data: { session } } = await supabase.auth.getSession()
  if (session?.access_token) {
    _cachedToken = session.access_token
    _tokenExpiresAt = session.expires_at ?? (now + 3600)
  } else {
    _cachedToken = null
    _tokenExpiresAt = 0
  }
  return _cachedToken
}

export const invalidateTokenCache = () => {
  _cachedToken = null
  _tokenExpiresAt = 0
}

// ── Response Cache (GET only) ────────────────────────────────────────────────
// In-memory store: endpoint → { data, expiresAt }
// - Static-ish data (rooms, settings) cached for 5 minutes.
// - User-generated data (tenants, gate-log, etc.) cached for 30 seconds
//   so navigating back to a page feels instant without going stale.
// - Search queries (?search=...) bypass the cache entirely.
// - Mutating calls (POST / PATCH) automatically bust related cache keys.

const _cache = new Map() // key → { data, expiresAt (ms) }

// In-flight GETs, so two components mounting in the same tick share one
// request. The response cache alone can't prevent this — it isn't populated
// until the first response lands, by which point the duplicate has already
// gone out.
const _inflight = new Map() // key → Promise

// TTL rules (longest match wins)
const TTL_RULES = [
  { match: '/rooms',    ttl: 5 * 60 * 1000 },   // 5 min — rooms rarely change
  { match: '/settings', ttl: 5 * 60 * 1000 },   // 5 min
  { match: '/tenants',  ttl: 30 * 1000 },        // 30 s
  { match: '/gate-log', ttl: 30 * 1000 },        // 30 s
  { match: '/police-verification', ttl: 30 * 1000 },
  { match: '/enquiries', ttl: 30 * 1000 },
  // The resident portal. Short, because a bill being marked paid in the office
  // should show up on the tenant's phone on their next tap, not five minutes on.
  { match: '/me', ttl: 30 * 1000 },
]

export const getTTL = (endpoint) => {
  // Never cache search queries
  if (endpoint.includes('?search=')) return 0
  // Never cache signed URL requests (they expire themselves)
  if (endpoint.includes('/signed-url')) return 0
  const rule = TTL_RULES.find(r => endpoint.startsWith(r.match))
  return rule ? rule.ttl : 0 // 0 = don't cache
}

const cacheGet = (key) => {
  const entry = _cache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) { _cache.delete(key); return null }
  return entry.data
}

const cacheSet = (key, data, ttlMs) => {
  if (ttlMs <= 0) return
  _cache.set(key, { data, expiresAt: Date.now() + ttlMs })
}

// Bust all cache entries whose key starts with any of the given prefixes
const cacheBust = (...prefixes) => {
  for (const key of _cache.keys()) {
    if (prefixes.some(p => key.startsWith(p))) _cache.delete(key)
  }
  // Pages on React Query keep their own cache, keyed by endpoint (lib/queries.js).
  // Mark those stale too — and unlike deleting from the Map above, this refetches
  // any that are on screen right now, so the page updates without a reload.
  queryClient.invalidateQueries({
    predicate: (q) => typeof q.queryKey[0] === 'string' && prefixes.some(p => q.queryKey[0].startsWith(p)),
  })
}

// Derive which caches a mutating call should invalidate
const bustRelated = (endpoint) => {
  if (endpoint.startsWith('/rooms'))               cacheBust('/rooms')
  if (endpoint.startsWith('/settings'))            cacheBust('/settings')
  if (endpoint.startsWith('/tenants'))             cacheBust('/tenants', '/police-verification', '/rooms')
  if (endpoint.startsWith('/gate-log'))            cacheBust('/gate-log')
  if (endpoint.startsWith('/police-verification')) cacheBust('/police-verification')
  if (endpoint.startsWith('/enquiries'))           cacheBust('/enquiries')
  // Generating bills and marking rent paid both change the rent status the
  // dashboard renders per room, which is served by the 5-minute /rooms cache.
  if (endpoint.startsWith('/rent'))                cacheBust('/rooms', '/tenants')
}

// ── Errors ───────────────────────────────────────────────────────────────────
// The API answers with { error: "..." } on every failure path (401/403/404/429
// /500). Surface that message rather than the raw JSON body, so anything doing
// toast.error(err.message) reads like a sentence.
const throwApiError = async (res) => {
  const body = await res.text()
  let message = body
  try {
    message = JSON.parse(body).error || body
  } catch { /* not JSON — use the raw body */ }

  const err = new Error(message || `Request failed (${res.status})`)
  err.status = res.status
  throw err
}

// ── Auth Headers ─────────────────────────────────────────────────────────────
const getHeaders = async () => {
  const token = await getToken()
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  }
}

// ── API Client ───────────────────────────────────────────────────────────────
export const api = {
  // { fresh: true } skips the cache read (the response is still stored). React
  // Query passes it, since it keeps its own cache and only calls this to refresh.
  get: async (endpoint, { fresh = false } = {}) => {
    const ttl = getTTL(endpoint)

    // Cache hit
    if (ttl > 0 && !fresh) {
      const cached = cacheGet(endpoint)
      if (cached !== null) return cached
    }

    // Already fetching this exact endpoint — join that request instead of
    // firing a second one.
    const pending = _inflight.get(endpoint)
    if (pending) return pending

    const request = (async () => {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        headers: await getHeaders()
      })
      if (!res.ok) await throwApiError(res)
      const data = await res.json()

      // Store in cache
      cacheSet(endpoint, data, ttl)
      return data
    })()

    _inflight.set(endpoint, request)
    try {
      return await request
    } finally {
      _inflight.delete(endpoint)
    }
  },

  post: async (endpoint, data) => {
    const headers = await getHeaders()
    let body = data
    if (!(data instanceof FormData)) {
      body = JSON.stringify(data)
    } else {
      delete headers['Content-Type']
    }
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers,
      body
    })
    if (!res.ok) await throwApiError(res)
    const result = await res.json()
    bustRelated(endpoint) // invalidate stale GET caches
    return result
  },

  patch: async (endpoint, data) => {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: 'PATCH',
      headers: await getHeaders(),
      body: JSON.stringify(data)
    })
    if (!res.ok) await throwApiError(res)
    const result = await res.json()
    bustRelated(endpoint) // invalidate stale GET caches
    return result
  },

  // Manual cache invalidation — call this after bulk mutations if needed
  invalidate: (...prefixes) => cacheBust(...prefixes),

  // Drop every cached response, in both caches, WITHOUT refetching. For sign-out:
  // invalidating would refetch the screens still mounted, as nobody, and the
  // next person on this phone must not see the last one's data.
  reset: () => {
    _cache.clear()
    queryClient.clear()
  },
}
