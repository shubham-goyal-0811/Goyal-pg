import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { isAdmin } from '../lib/roles'
import { useApiQuery } from '../lib/queries'
import useDocumentTitle from '../hooks/useDocumentTitle'
import { prefetchRoutes } from '../lib/prefetch'
import { hasSeenTour, markTourSeen } from '../lib/tour'
import { LayoutDashboard, Users, ShieldCheck, Settings as SettingsIcon, LogOut, Menu, X, BookOpen, Inbox, HelpCircle } from 'lucide-react'
import { useState, useEffect, Suspense, lazy } from 'react'

// Modal that most sessions never open, and that a public visitor must never
// have to download. Nothing to show while it loads — it appears when it lands.
const AdminTour = lazy(() => import('./AdminTour'))

const ROLE_NAMES = { admin: 'admin', gatekeeper: 'gatekeeper' }

const Layout = ({ children }) => {
  const { signOut, role, user } = useAuth()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [tourOpen, setTourOpen] = useState(false)
  const admin = isAdmin(role)

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
    if (!user?.id || !admin) return
    if (hasSeenTour(user.id)) return
    markTourSeen(user.id)
    setTourOpen(true)
  }, [user?.id, admin])

  // Warm the menu's destinations once the dashboard has settled.
  useEffect(() => prefetchRoutes([
    ['admin/tenants', () => import('../pages/Tenants')],
    ['admin/tenant-detail', () => import('../pages/TenantDetail')],
    ['admin/gate-log', () => import('../pages/GateLog')],
    ['admin/police-verification', () => import('../pages/PoliceVerification')],
    ['admin/onboarding', () => import('../pages/onboarding/OnboardingWizard')],
    ['admin/settings', () => import('../pages/Settings')],
    ...(admin ? [['admin/enquiries', () => import('../pages/Enquiries')]] : []),
  ]), [admin])

  // "2 new" beside Enquiries — the only reason to open that page is a message
  // waiting, so the menu says whether there is one.
  const { data: enquiries } = useApiQuery('/enquiries', { enabled: admin })
  const newEnquiries = enquiries?.filter(e => e.status === 'new').length ?? 0

  // The open drawer sits over the page; stop the page scrolling underneath it.
  useEffect(() => {
    if (!menuOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [menuOpen])

  const navItems = [
    { label: 'Dashboard', path: '/admin', icon: LayoutDashboard },
    { label: 'Tenants', path: '/admin/tenants', icon: Users },
    { label: 'Gate log', path: '/admin/gate-log', icon: BookOpen },
    { label: 'Police verification', path: '/admin/police-verification', icon: ShieldCheck },
    // GET /enquiries is ADMIN_ONLY; hide rather than show a link that 403s.
    ...(admin ? [{ label: 'Enquiries', path: '/admin/enquiries', icon: Inbox, note: newEnquiries ? `${newEnquiries} new` : '' }] : []),
    { label: 'Settings', path: '/admin/settings', icon: SettingsIcon },
  ]

  // A tenant's page counts as being in Tenants.
  const isActive = (path) => path === '/admin'
    ? location.pathname === '/admin'
    : location.pathname.startsWith(path)

  // Adding a tenant is a focused flow with its own header and a Cancel button,
  // so the phone menu button stays out of its way.
  const ownHeader = location.pathname.startsWith('/admin/onboarding')

  const openTour = () => { setMenuOpen(false); setTourOpen(true) }

  const navList = () => (
    <nav className="flex flex-col gap-1">
      {navItems.map(item => (
        <Link
          key={item.path}
          to={item.path}
          aria-current={isActive(item.path) ? 'page' : undefined}
          className={`flex items-center gap-3 rounded-lg font-heading font-semibold border h-12 px-3 text-base
            ${isActive(item.path) ? 'bg-bg border-border' : 'bg-surface border-transparent hover:bg-bg'}`}
        >
          <span className="flex-1">{item.label}</span>
          {item.note && <span className="font-body font-medium text-[15px] text-text-secondary">{item.note}</span>}
        </Link>
      ))}
    </nav>
  )

  // Phone drawer rows: an icon beside each name, and the page you're on filled in.
  const drawerList = () => (
    <nav className="flex-1 px-4 space-y-2">
      {navItems.map(({ icon: Icon, ...item }) => (
        <Link
          key={item.path}
          to={item.path}
          onClick={() => setMenuOpen(false)}
          aria-current={isActive(item.path) ? 'page' : undefined}
          className={`flex items-center gap-3 px-4 py-3 rounded-md font-medium transition-colors
            ${isActive(item.path) ? 'bg-accent text-surface' : 'text-text-secondary hover:bg-bg hover:text-text-primary'}`}
        >
          <Icon size={20} aria-hidden="true" />
          <span className="flex-1">{item.label}</span>
          {item.note && <span className="text-sm">{item.note}</span>}
        </Link>
      ))}
    </nav>
  )

  const footerItem = 'w-full text-left flex items-center px-3.5 h-[52px] font-heading font-semibold text-base rounded-lg hover:bg-bg'

  const footer = () => (
    <div className="border-t border-border pt-2 flex flex-col gap-1">
      {/* Replaying the walkthrough belongs here, not buried in Settings —
          the person who needs it is the person who cannot find things. */}
      {admin && <button type="button" onClick={openTour} className={footerItem}>Show me how it works</button>}
      <button type="button" onClick={() => signOut()} className={footerItem}>Sign out</button>
      {ROLE_NAMES[role] && (
        <p className="px-3.5 py-1.5 text-sm text-text-secondary">Signed in as {ROLE_NAMES[role]}</p>
      )}
    </div>
  )

  return (
    <div className="min-h-screen bg-bg md:grid md:grid-cols-[248px_1fr]">
      {tourOpen && (
        <Suspense fallback={null}>
          <AdminTour onClose={() => setTourOpen(false)} />
        </Suspense>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden md:flex sticky top-0 h-screen flex-col gap-1 bg-surface border-r border-border px-3.5 py-5">
        <Link to="/admin" className="font-heading font-extrabold text-[21px] text-accent px-3 pt-1 pb-4">Goyal PG</Link>
        {navList()}
        <div className="flex-1" />
        {footer()}
      </aside>

      <div className="min-w-0">
        {/* Phone menu button, floating over the page's top-left corner */}
        {!ownHeader && (
          <button
            type="button"
            onClick={() => setMenuOpen(o => !o)}
            aria-expanded={menuOpen}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            className="md:hidden fixed top-[calc(1rem+env(safe-area-inset-top))] left-4 z-50 p-2 bg-surface border border-border rounded-md text-text-primary"
          >
            {menuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        )}

        <main className={`px-4 pb-7 md:px-10 md:py-8 ${ownHeader ? 'pt-0 md:pt-8' : 'pt-[calc(4rem+env(safe-area-inset-top))]'}`}>
          <div className="max-w-[1000px]">
            {children}
          </div>
        </main>
      </div>

      {/* Phone drawer — slides in from the left over a dimmed page. */}
      <aside
        inert={!menuOpen}
        className={`md:hidden fixed inset-y-0 left-0 z-40 w-64 bg-surface border-r border-border flex flex-col
          pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]
          transition-[transform,visibility] duration-200 ease-in-out
          ${menuOpen ? 'translate-x-0' : '-translate-x-full invisible'}`}
      >
        {/* Right-aligned so the menu button (top-left) doesn't sit on the name. */}
        <div className="p-6 text-right">
          <Link to="/admin" onClick={() => setMenuOpen(false)} className="text-2xl font-heading font-bold text-accent">Goyal PG</Link>
          <p className="text-xs text-text-secondary mt-0.5">Office</p>
        </div>

        {drawerList()}

        <div className="p-4 border-t border-border space-y-1">
          {admin && (
            <button
              type="button"
              onClick={openTour}
              className="flex items-center gap-3 w-full px-4 py-3 text-text-secondary hover:text-text-primary transition-colors font-medium rounded-md hover:bg-bg"
            >
              <HelpCircle size={20} aria-hidden="true" />
              Show me how it works
            </button>
          )}
          <button
            type="button"
            onClick={() => signOut()}
            className="flex items-center gap-3 w-full px-4 py-3 text-text-secondary hover:text-warning transition-colors font-medium rounded-md hover:bg-warning/10"
          >
            <LogOut size={20} aria-hidden="true" />
            Sign out
          </button>
          {ROLE_NAMES[role] && (
            <p className="px-4 py-1.5 text-sm text-text-secondary">Signed in as {ROLE_NAMES[role]}</p>
          )}
        </div>
      </aside>

      {menuOpen && (
        <div className="md:hidden fixed inset-0 bg-black/20 z-30" onClick={() => setMenuOpen(false)} />
      )}
    </div>
  )
}

export default Layout
