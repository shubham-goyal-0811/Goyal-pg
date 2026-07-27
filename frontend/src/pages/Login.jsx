import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

const Login = () => {
  const { user } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (user) {
      navigate('/')
    }
  }, [user, navigate])

  const handleLogin = async () => {
    // For dummy dev purposes, if API keys aren't real, just mock the login by pushing to state or show error
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin
        }
      })
      if (error) throw error
    } catch (err) {
      alert("Error: Supabase not fully configured yet. " + err.message)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg p-4">
      <div className="bg-surface p-8 rounded-xl shadow-sm border border-border w-full max-w-md text-center">
        <h1 className="text-3xl font-heading font-bold text-accent mb-2">Goyal PG Admin</h1>
        <p className="text-text-secondary mb-8">Sign in to manage tenants and rent.</p>
        
        <button 
          onClick={handleLogin}
          className="w-full flex items-center justify-center gap-3 bg-white border border-border text-text-primary px-4 py-3 rounded-md font-medium hover:bg-bg transition-colors h-[44px]"
        >
          <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google" className="w-5 h-5" />
          Sign in with Google
        </button>
      </div>
    </div>
  )
}

export default Login
