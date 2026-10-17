import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ShieldOff, LogOut } from 'lucide-react'

/**
 * Terminal screen for a signed-in account with no access.
 *
 * Google OAuth accepts any Google account, so anyone who finds the URL can
 * complete sign-in and land on the 'viewer' default. This page is where they
 * stop. It deliberately does NOT redirect — bouncing them to /login sent them
 * back here through Login's own redirect, looping forever with no reachable
 * sign-out button (that lives in Layout, which this account never renders).
 */
const AccessDenied = () => {
  const { user, signOut } = useAuth()

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg p-4">
      <div className="bg-surface p-8 rounded-xl shadow-sm border border-border w-full max-w-md text-center">
        <div className="bg-warning/10 text-warning w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5">
          <ShieldOff size={30} />
        </div>

        <h1 className="text-2xl font-heading font-bold text-text-primary mb-2">
          No access yet
        </h1>

        <p className="text-text-secondary leading-relaxed mb-6">
          You're signed in{user?.email ? <> as <span className="font-medium text-text-primary">{user.email}</span></> : null},
          but this account hasn't been given access yet. If you live here, ask the office to
          add this exact email address to your record.
        </p>

        <button
          onClick={signOut}
          className="w-full flex items-center justify-center gap-2 border border-border text-text-primary px-4 py-3 rounded-md font-semibold hover:bg-bg transition-colors h-[44px]"
        >
          <LogOut size={18} />
          Sign out
        </button>

        <p className="text-xs text-text-secondary mt-4">
          Signed in with the wrong account? Sign out and try another.
        </p>

        <Link to="/" className="inline-block mt-4 text-sm text-text-secondary hover:text-text-primary">
          ← Back to Goyal PG
        </Link>
      </div>
    </div>
  )
}

export default AccessDenied
