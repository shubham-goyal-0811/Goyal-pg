import React, { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext({})

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    // Check active sessions and sets the user
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        await verifyAdmin(session.user)
      } else {
        setLoading(false)
      }
    }
    
    checkSession()

    // Listen for changes on auth state (logged in, signed out, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
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

  const verifyAdmin = async (authUser) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('role')
        .eq('id', authUser.id)  // use UUID match, not email — more reliable
        .single()

      if (error && error.code !== 'PGRST116') {
        // PGRST116 = row not found — acceptable (trigger may not have run yet)
        console.warn('[AuthContext] users table query error:', error.message)
      }

      setUser(authUser)
      // If the row exists and role is explicitly not admin, block. Otherwise allow.
      setIsAdmin(!data || data.role === 'admin')
    } catch (err) {
      console.error(err)
      setUser(authUser)
      setIsAdmin(true)
    } finally {
      setLoading(false)
    }
  }

  const signOut = () => supabase.auth.signOut()

  return (
    <AuthContext.Provider value={{ user, isAdmin, loading, signOut }}>
      {!loading && children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
