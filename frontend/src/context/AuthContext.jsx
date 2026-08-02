import React, { createContext, useContext, useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { api, invalidateTokenCache } from '../lib/api'
import { ROLES } from '../lib/roles'

const AuthContext = createContext({})

// ── Identity Cache ───────────────────────────────────────────────────────────
// Cache the resolved identity in sessionStorage so a page refresh doesn't wait
// on a round-trip before it can decide which app to render. Cleared on sign-out.
//
// This is a RENDER HINT, never an authority. sessionStorage is user-writable,
// so a tampered value could flash admin controls — but every cache hit is
// revalidated against the API immediately after render, and the API rejects
// anything the real role doesn't allow. The TTL bounds how long a role change
// (e.g. portal access being revoked) can go unnoticed if revalidation fails.
const IDENTITY_CACHE_KEY = 'goyalpg_identity'
const IDENTITY_CACHE_TTL_MS = 5 * 60 * 1000

const EMPTY_IDENTITY = { role: ROLES.VIEWER, tenantId: null, fullName: null }

const getCachedIdentity = (userId) => {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(IDENTITY_CACHE_KEY) || 'null')
    if (!parsed || parsed.userId !== userId) return null
    if (Date.now() - (parsed.cachedAt ?? 0) > IDENTITY_CACHE_TTL_MS) return null
    return { role: parsed.role, tenantId: parsed.tenantId, fullName: parsed.fullName }
  } catch {
    return null
  }
}

const setCachedIdentity = (userId, identity) => {
  try {
    sessionStorage.setItem(IDENTITY_CACHE_KEY, JSON.stringify({ userId, ...identity, cachedAt: Date.now() }))
  } catch { /* ignore */ }
}

const clearIdentityCache = () => {
  try { sessionStorage.removeItem(IDENTITY_CACHE_KEY) } catch { /* ignore */ }
}

const sameIdentity = (a, b) => a.role === b.role && a.tenantId === b.tenantId

// ── Provider ─────────────────────────────────────────────────────────────────
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [identity, setIdentity] = useState(EMPTY_IDENTITY)
  // Prevent duplicate resolves when both getSession + onAuthStateChange fire
  const resolvingRef = useRef(false)

  /**
   * Authoritative lookup. GET /me is the only thing that knows a caller's role,
   * because resolving a resident's role can involve a WRITE — binding their
   * Google account to a tenants row on first sign-in. That can't happen from
   * the browser, which is why this no longer reads public.users directly.
   *
   * Anything unresolvable falls back to 'viewer' — no access.
   */
  const fetchIdentity = async () => {
    try {
      const me = await api.get('/me')
      return {
        role: me.role ?? ROLES.VIEWER,
        tenantId: me.tenant?.id ?? null,
        fullName: me.full_name ?? me.tenant?.full_name ?? null,
      }
    } catch (err) {
      console.warn('[AuthContext] /me failed:', err.message)
      return EMPTY_IDENTITY
    }
  }

  const apply = (authUser, next) => {
    setCachedIdentity(authUser.id, next)
    setUser(authUser)
    setIdentity(next)
  }

  const resolve = async (authUser) => {
    if (resolvingRef.current) return
    resolvingRef.current = true

    try {
      const cached = getCachedIdentity(authUser.id)
      if (cached) {
        // Paint from cache so the app isn't blocked on a round-trip...
        apply(authUser, cached)
        setLoading(false)
        // ...then confirm against the API and correct if it disagrees.
        fetchIdentity()
          .then(fresh => { if (!sameIdentity(fresh, cached)) apply(authUser, fresh) })
          .catch(() => { /* keep cached value; the API is still authoritative */ })
        return
      }

      apply(authUser, await fetchIdentity())
    } catch (err) {
      console.error(err)
      setUser(authUser)
      setIdentity(EMPTY_IDENTITY)
    } finally {
      setLoading(false)
      resolvingRef.current = false
    }
  }

  useEffect(() => {
    // onAuthStateChange fires INITIAL_SESSION on mount — use it as the single
    // source of truth. Skip the extra getSession() call to halve auth requests.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        await resolve(session.user)
      } else {
        setUser(null)
        setIdentity(EMPTY_IDENTITY)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const signOut = async () => {
    clearIdentityCache()    // wipe sessionStorage identity
    invalidateTokenCache()  // wipe in-memory JWT
    api.invalidate('/')     // wipe cached GET responses — shared devices are the norm here
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        role: user ? identity.role : null,
        isAdmin: identity.role === ROLES.ADMIN,
        tenantId: identity.tenantId,
        fullName: identity.fullName,
        loading,
        signOut,
      }}
    >
      {!loading && children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
