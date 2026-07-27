import React, { createContext, useContext, useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { invalidateTokenCache } from '../lib/api'

const AuthContext = createContext({})

// ── Role Cache ───────────────────────────────────────────────────────────────
// Cache the role in sessionStorage so a page refresh doesn't re-query
// the public.users table. Cleared on sign-out.
const ROLE_CACHE_KEY = 'goyalpg_user_role'

const getCachedRole = (userId) => {
  try {
    const raw = sessionStorage.getItem(ROLE_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed.userId === userId ? parsed.role : null
  } catch {
    return null
  }
}

const setCachedRole = (userId, role) => {
  try {
    sessionStorage.setItem(ROLE_CACHE_KEY, JSON.stringify({ userId, role }))
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
  // Prevent duplicate verifyAdmin calls when both getSession + onAuthStateChange fire
  const verifyingRef = useRef(false)

  const verifyAdmin = async (authUser) => {
    if (verifyingRef.current) return
    verifyingRef.current = true

    try {
      // Check sessionStorage cache first — avoids a Supabase DB call on every page load
      const cachedRole = getCachedRole(authUser.id)
      if (cachedRole !== null) {
        setUser(authUser)
        setIsAdmin(cachedRole === 'admin')
        setLoading(false)
        return
      }

      // Cache miss — query public.users once and store result
      const { data, error } = await supabase
        .from('users')
        .select('role')
        .eq('id', authUser.id)
        .single()

      if (error && error.code !== 'PGRST116') {
        console.warn('[AuthContext] users table query error:', error.message)
      }

      const role = data?.role ?? 'admin'
      setCachedRole(authUser.id, role)

      setUser(authUser)
      setIsAdmin(role === 'admin')
    } catch (err) {
      console.error(err)
      setUser(authUser)
      setIsAdmin(true)
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
    <AuthContext.Provider value={{ user, isAdmin, loading, signOut }}>
      {!loading && children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
