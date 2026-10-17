import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { isStaff, isTenant } from '../lib/roles'
import AccessDenied from './AccessDenied'
import HomeRedirect from '../components/HomeRedirect'
import toast from 'react-hot-toast'

// Inlined rather than fetched from a CDN: this screen has to work on a flaky
// connection and inside the installed PWA, and a broken <img> on the sign-in
// button reads as a broken app.
const GoogleMark = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z" />
    <path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z" />
    <path fill="#FBBC05" d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z" />
    <path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z" />
  </svg>
)

const Login = () => {
  const { user, role } = useAuth()

  // Signed in and placed somewhere — HomeRedirect knows which app that is.
  if (user && (isStaff(role) || isTenant(role))) return <HomeRedirect />

  // Signed in, but promoted to nothing. Show the terminal screen rather than a
  // login button that would do nothing.
  if (user) return <AccessDenied />

  const handleLogin = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          // MUST be /login, not the origin. '/' is the public site now and
          // never mounts the auth listener, so a callback landing there would
          // drop the session on the floor with no visible error.
          redirectTo: `${window.location.origin}/login`,
        },
      })
      if (error) throw error
    } catch (err) {
      toast.error(`Could not start sign-in: ${err.message}`)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg p-4">
      <div className="bg-surface p-8 rounded-xl shadow-sm border border-border w-full max-w-md text-center">
        <h1 className="text-3xl font-heading font-bold text-accent mb-2">Goyal PG</h1>
        <p className="text-text-secondary mb-8">
          Sign in to your account. Residents and staff use the same button.
        </p>

        <button
          onClick={handleLogin}
          className="w-full flex items-center justify-center gap-3 bg-surface border border-border text-text-primary px-4 py-3 rounded-md font-medium hover:bg-bg transition-colors h-[44px]"
        >
          <GoogleMark />
          Sign in with Google
        </button>

        <Link to="/" className="inline-block mt-6 text-sm text-text-secondary hover:text-text-primary">
          ← Back to Goyal PG
        </Link>
      </div>
    </div>
  )
}

export default Login
