import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import useDocumentTitle from '../hooks/useDocumentTitle'
import { Home, Receipt, User, LogOut } from 'lucide-react'

/**
 * Shell for the resident portal (/me/*).
 *
 * Deliberately not components/Layout.jsx. That one is a desk tool for the
 * office — a 256px sidebar assuming a laptop. Residents open this on a phone,
 * on three screens total, so it gets a bottom tab bar and nothing else.
 */
const TABS = [
  { label: 'Home', path: '/me', icon: Home },
  { label: 'Rent', path: '/me/rent', icon: Receipt },
  { label: 'Profile', path: '/me/profile', icon: User },
]

const TenantLayout = ({ children }) => {
  const { signOut, fullName } = useAuth()
  const location = useLocation()

  useDocumentTitle('Goyal PG')

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      {/* Header */}
      <header className="bg-surface border-b border-border">
        <div className="max-w-2xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="min-w-0">
            <p className="font-heading font-bold text-accent leading-tight">Goyal PG</p>
            {fullName && (
              <p className="text-sm text-text-secondary truncate">{fullName}</p>
            )}
          </div>
          <button
            onClick={() => signOut()}
            aria-label="Sign out"
            className="flex items-center gap-2 h-[44px] px-3 -mr-3 rounded-md text-text-secondary hover:text-text-primary hover:bg-bg transition-colors"
          >
            <LogOut size={20} />
            <span className="hidden sm:inline font-medium">Sign out</span>
          </button>
        </div>
      </header>

      {/* Content. pb-24 clears the fixed tab bar. */}
      <main className="flex-1 w-full max-w-2xl mx-auto px-4 py-6 pb-24">
        {children}
      </main>

      {/* Bottom tabs */}
      <nav className="fixed bottom-0 inset-x-0 bg-surface border-t border-border">
        <div className="max-w-2xl mx-auto grid grid-cols-3">
          {TABS.map(({ label, path, icon: Icon }) => {
            const active = location.pathname === path
            return (
              <Link
                key={path}
                to={path}
                aria-current={active ? 'page' : undefined}
                className={`flex flex-col items-center justify-center gap-1 h-16 text-xs font-medium transition-colors
                  ${active ? 'text-accent' : 'text-text-secondary hover:text-text-primary'}`}
              >
                <Icon size={22} />
                {label}
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
  )
}

export default TenantLayout
