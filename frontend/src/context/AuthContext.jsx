import React, { createContext, useContext, useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { invalidateTokenCache } from '../lib/api'

const AuthContext = createContext({})

// ── Role Cache ───────────────────────────────────────────────────────────────
// Cache the role in sessionStorage so a page refresh doesn't re-query
// public.users. Cleared on sign-out.
//
// This is a RENDER HINT, never an authority. sessionStorage is user-writable,
// so a tampered value could flash admin controls — but every cache hit is
// revalidated against the DB immediately after render, and the API rejects
// anything the real role doesn't allow. The TTL bounds how long a role change
// (e.g. an admin being demoted) can go unnoticed if revalidation fails.
const ROLE_CACHE_KEY = 'goyalpg_user_role'
const ROLE_CACHE_TTL_MS = 5 * 60 * 1000

const getCachedRole = (userId) => {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(ROLE_CACHE_KEY) || 'null')
    if (!parsed || parsed.userId !== userId) return null
    if (Date.now() - (parsed.cachedAt ?? 0) > ROLE_CACHE_TTL_MS) return null
    return parsed.role
  } catch {
    return null
  }
}

const setCachedRole = (userId, role) => {
  try {
    sessionStorage.setItem(ROLE_CACHE_KEY, JSON.stringify({ userId, role, cachedAt: Date.now() }))
  } catch { /* ignore */ }
}

const clearRoleCache = () => {
  try { sessionStorage.removeItem(ROLE_CACHE_KEY) } catch { /* ignore */ }
}

// ── Provider ─────────────────────────────────────────────────────────────────
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [role, setRole] = useState(null)
  // Prevent duplicate verifyAdmin calls when both getSession + onAuthStateChange fire
  const verifyingRef = useRef(false)

  // Authoritative lookup. RLS restricts this to the caller's own row.
  // Anything unresolvable falls back to 'viewer' — no access.
  const fetchRole = async (userId) => {
    const { data, error } = await supabase
      .from('users')
      .select('role')
      .eq('id', userId)
      .single()

    if (error && error.code !== 'PGRST116') {
      console.warn('[AuthContext] users table query error:', error.message)
    }
    return data?.role ?? 'viewer'
  }

  const applyRole = (authUser, nextRole) => {
    setCachedRole(authUser.id, nextRole)
    setUser(authUser)
    setRole(nextRole)
    setIsAdmin(nextRole === 'admin')
  }

  const verifyAdmin = async (authUser) => {
    if (verifyingRef.current) return
    verifyingRef.current = true

    try {
      const cachedRole = getCachedRole(authUser.id)
      if (cachedRole !== null) {
        // Paint from cache so the app isn't blocked on a round-trip...
        applyRole(authUser, cachedRole)
        setLoading(false)
        // ...then confirm against the DB and correct if it disagrees.
        fetchRole(authUser.id)
          .then(fresh => { if (fresh !== cachedRole) applyRole(authUser, fresh) })
          .catch(() => { /* keep cached value; API is still authoritative */ })
        return
      }

      applyRole(authUser, await fetchRole(authUser.id))
    } catch (err) {
      console.error(err)
      setUser(authUser)
      setIsAdmin(false)
      setRole('viewer')
    } finally {
      setLoading(false)
      verifyingRef.current = false
    }
  }

  useEffect(() => {
    // onAuthStateChange fires INITIAL_SESSION on mount — use it as the single
    // source of truth. Skip the extra getSession() call to halve auth requests.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        await verifyAdmin(session.user)
      } else {
        setUser(null)
        setIsAdmin(false)
        setRole(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const signOut = async () => {
    clearRoleCache()       // wipe sessionStorage role
    invalidateTokenCache() // wipe in-memory JWT
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ user, role, isAdmin, loading, signOut }}>
      {!loading && children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
