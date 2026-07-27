import { supabase } from './supabase'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'

// Helper to get auth headers
const getHeaders = async () => {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  }
}

export const api = {
  get: async (endpoint) => {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      headers: await getHeaders()
    })
    if (!res.ok) throw new Error(await res.text())
    return res.json()
  },
  post: async (endpoint, data) => {
    const headers = await getHeaders()
    let body = data
    if (!(data instanceof FormData)) {
      body = JSON.stringify(data)
    } else {
      delete headers['Content-Type'] // Let browser set boundary
    }

    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers,
      body
    })
    if (!res.ok) throw new Error(await res.text())
    return res.json()
  },
  patch: async (endpoint, data) => {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: 'PATCH',
      headers: await getHeaders(),
      body: JSON.stringify(data)
    })
    if (!res.ok) throw new Error(await res.text())
    return res.json()
  }
}
