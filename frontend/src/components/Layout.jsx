import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { isAdmin } from '../lib/roles'
import useDocumentTitle from '../hooks/useDocumentTitle'
import { prefetchRoutes } from '../lib/prefetch'
import { hasSeenTour, markTourSeen } from '../lib/tour'
import { LayoutDashboard, Users, ShieldCheck, Settings as SettingsIcon, LogOut, Menu, X, BookOpen, Inbox, HelpCircle } from 'lucide-react'
import { useState, useEffect, Suspense, lazy } from 'react'

// Modal that most sessions never open, and that a public visitor must never
// have to download. Nothing to show while it loads — it appears when it lands.
const AdminTour = lazy(() => import('./AdminTour'))

const Layout = ({ children }) => {
  const { signOut, role, user } = useAuth()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [tourOpen, setTourOpen] = useState(false)

  // index.html carries the public marketing title, which is wrong once you're
  // inside the office app — and worse in the installed PWA's task switcher.
  useDocumentTitle('Goyal PG — Office')

  // Show the walkthrough once, to an admin, on their first visit. Gatekeepers
  // never see it — half of what it describes is hidden from them anyway.
  //
  // Marked seen the moment it opens rather than when it is finished, because
  // someone who closes it on step 1 has decided they do not want it, and
  // re-opening it every reload would be the most annoying thing in the app.
  useEffect(() => {
    if (!user?.id || !isAdmin(role)) return
    if (hasSeenTour(user.id)) return
    markTourSeen(user.id)
    setTourOpen(true)
  }, [user?.id, role])

  // Warm the sidebar's destinations once the dashboard has settled.
  useEffect(() => prefetchRoutes([
    ['admin/tenants', () => import('../pages/Tenants')],
    ['admin/tenant-detail', () => import('../pages/TenantDetail')],
    ['admin/gate-log', () => import('../pages/GateLog')],
    ['admin/police-verification', () => import('../pages/PoliceVerification')],
    ['admin/onboarding', () => import('../pages/onboarding/OnboardingWizard')],
    ['admin/settings', () => import('../pages/Settings')],
    ...(isAdmin(role) ? [['admin/enquiries', () => import('../pages/Enquiries')]] : []),
  ]), [role])

  const navItems = [
    { label: 'Dashboard', path: '/admin', icon: LayoutDashboard },
    { label: 'Tenants', path: '/admin/tenants', icon: Users },
    { label: 'Gate Log', path: '/admin/gate-log', icon: BookOpen },
    { label: 'Police Verification', path: '/admin/police-verification', icon: ShieldCheck },
    // GET /enquiries is ADMIN_ONLY; hide rather than show a link that 403s.
    ...(isAdmin(role) ? [{ label: 'Enquiries', path: '/admin/enquiries', icon: Inbox }] : []),
    { label: 'Settings', path: '/admin/settings', icon: SettingsIcon },
  ]

  const isActive = (path) => location.pathname === path

  return (
    <div className="flex h-screen bg-bg">
      {tourOpen && (
        <Suspense fallback={null}>
          <AdminTour onClose={() => setTourOpen(false)} />
        </Suspense>
      )}

      {/* Mobile sidebar toggle */}
      <div className="md:hidden fixed top-4 left-4 z-50">
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 bg-surface rounded-md shadow-sm text-text-primary">
          {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Sidebar */}
      <aside className={`
        fixed md:static inset-y-0 left-0 z-40
        w-64 bg-surface border-r border-border
        transform transition-transform duration-200 ease-in-out
        flex flex-col
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <div className="p-6">
          <Link to="/admin" className="text-2xl font-heading font-bold text-accent">Goyal PG</Link>
          <p className="text-xs text-text-secondary mt-0.5">Office</p>
        </div>
        
        <nav className="flex-1 px-4 space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={`
                  flex items-center gap-3 px-4 py-3 rounded-md font-medium transition-colors
                  ${isActive(item.path) 
                    ? 'bg-accent text-surface' 
                    : 'text-text-secondary hover:bg-bg hover:text-text-primary'}
                `}
              >
                <Icon size={20} />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="p-4 border-t border-border space-y-1">
          {/* Replaying the walkthrough belongs here, not buried in Settings —
              the person who needs it is the person who cannot find things. */}
          {isAdmin(role) && (
            <button
              onClick={() => { setSidebarOpen(false); setTourOpen(true) }}
              className="flex items-center gap-3 w-full px-4 py-3 text-text-secondary hover:text-text-primary transition-colors font-medium rounded-md hover:bg-bg"
            >
              <HelpCircle size={20} />
              Walkthrough
            </button>
          )}
          <button
            onClick={() => signOut()}
            className="flex items-center gap-3 w-full px-4 py-3 text-text-secondary hover:text-warning transition-colors font-medium rounded-md hover:bg-warning/10"
          >
            <LogOut size={20} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Overlay for mobile sidebar */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/20 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-auto bg-bg p-4 md:p-8 pt-16 md:pt-8 w-full">
        <div className="max-w-6xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  )
}

export default Layout
