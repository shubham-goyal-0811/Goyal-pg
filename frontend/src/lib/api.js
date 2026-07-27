import { supabase } from './supabase'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'

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

// TTL rules (longest match wins)
const TTL_RULES = [
  { match: '/rooms',    ttl: 5 * 60 * 1000 },   // 5 min — rooms rarely change
  { match: '/settings', ttl: 5 * 60 * 1000 },   // 5 min
  { match: '/tenants',  ttl: 30 * 1000 },        // 30 s
  { match: '/gate-log', ttl: 30 * 1000 },        // 30 s
  { match: '/police-verification', ttl: 30 * 1000 },
]

const getTTL = (endpoint) => {
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
}

// Derive which caches a mutating call should invalidate
const bustRelated = (endpoint) => {
  if (endpoint.startsWith('/rooms'))               cacheBust('/rooms')
  if (endpoint.startsWith('/settings'))            cacheBust('/settings')
  if (endpoint.startsWith('/tenants'))             cacheBust('/tenants', '/police-verification')
  if (endpoint.startsWith('/gate-log'))            cacheBust('/gate-log')
  if (endpoint.startsWith('/police-verification')) cacheBust('/police-verification')
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
  get: async (endpoint) => {
    const ttl = getTTL(endpoint)

    // Cache hit
    if (ttl > 0) {
      const cached = cacheGet(endpoint)
      if (cached !== null) return cached
    }

    const res = await fetch(`${API_BASE}${endpoint}`, {
      headers: await getHeaders()
    })
    if (!res.ok) throw new Error(await res.text())
    const data = await res.json()

    // Store in cache
    cacheSet(endpoint, data, ttl)
    return data
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
    if (!res.ok) throw new Error(await res.text())
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
    if (!res.ok) throw new Error(await res.text())
    const result = await res.json()
    bustRelated(endpoint) // invalidate stale GET caches
    return result
  },

  // Manual cache invalidation — call this after bulk mutations if needed
  invalidate: (...prefixes) => cacheBust(...prefixes)
}
