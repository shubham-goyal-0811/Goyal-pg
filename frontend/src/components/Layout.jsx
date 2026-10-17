import { Link, useLocation, matchPath } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { isAdmin } from '../lib/roles'
import { useApiQuery } from '../lib/queries'
import useDocumentTitle from '../hooks/useDocumentTitle'
import { prefetchRoutes } from '../lib/prefetch'
import { hasSeenTour, markTourSeen } from '../lib/tour'
import { useState, useEffect, Suspense, lazy } from 'react'

// Modal that most sessions never open, and that a public visitor must never
// have to download. Nothing to show while it loads — it appears when it lands.
const AdminTour = lazy(() => import('./AdminTour'))

const ROLE_NAMES = { admin: 'admin', gatekeeper: 'gatekeeper' }

const MenuIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M4 6h16M4 12h16M4 18h16" />
  </svg>
)

const BackIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m15 18-6-6 6-6" />
  </svg>
)

// Bordered, labelled header buttons. An icon alone ("hamburger") is one more
// thing to have to learn; the word "Menu" is not.
const barButton = 'h-11 flex items-center gap-2 px-3.5 border border-border rounded-lg bg-surface font-heading font-semibold text-base'

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

  // The open menu covers the page; stop the page scrolling underneath it.
  useEffect(() => {
    if (!menuOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [menuOpen])

  const navItems = [
    { label: 'Dashboard', path: '/admin' },
    { label: 'Tenants', path: '/admin/tenants' },
    { label: 'Gate log', path: '/admin/gate-log' },
    { label: 'Police verification', path: '/admin/police-verification' },
    // GET /enquiries is ADMIN_ONLY; hide rather than show a link that 403s.
    ...(admin ? [{ label: 'Enquiries', path: '/admin/enquiries', note: newEnquiries ? `${newEnquiries} new` : '' }] : []),
    { label: 'Settings', path: '/admin/settings' },
  ]

  // A tenant's page counts as being in Tenants.
  const isActive = (path) => path === '/admin'
    ? location.pathname === '/admin'
    : location.pathname.startsWith(path)

  // Inside a tenant's record the header takes you back to the list instead of
  // opening the menu — that is where everyone wants to go next.
  const onTenantPage = Boolean(matchPath('/admin/tenants/:id', location.pathname))
  // Adding a tenant is a focused flow with its own header and a Cancel button.
  const ownHeader = location.pathname.startsWith('/admin/onboarding')

  const openTour = () => { setMenuOpen(false); setTourOpen(true) }

  const navList = (big = false) => (
    <nav className="flex flex-col gap-1">
      {navItems.map(item => (
        <Link
          key={item.path}
          to={item.path}
          onClick={() => setMenuOpen(false)}
          aria-current={isActive(item.path) ? 'page' : undefined}
          className={`flex items-center gap-3 rounded-lg font-heading font-semibold border
            ${big ? 'h-14 px-3.5 text-[17px]' : 'h-12 px-3 text-base'}
            ${isActive(item.path) ? 'bg-bg border-border' : 'bg-surface border-transparent hover:bg-bg'}`}
        >
          <span className="flex-1">{item.label}</span>
          {item.note && <span className="font-body font-medium text-[15px] text-text-secondary">{item.note}</span>}
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
        {/* Phone header */}
        {!ownHeader && (
          <header className="md:hidden sticky top-0 z-30 bg-surface border-b border-border pt-[env(safe-area-inset-top)]">
            <div className="h-[60px] flex items-center gap-3 px-3">
              {onTenantPage ? (
                <Link to="/admin/tenants" className={`${barButton} pl-2`}><BackIcon />Tenants</Link>
              ) : (
                <>
                  <button type="button" onClick={() => setMenuOpen(true)} className={barButton} aria-expanded={menuOpen}>
                    <MenuIcon />Menu
                  </button>
                  <Link to="/admin" className="font-heading font-extrabold text-[19px] text-accent">Goyal PG</Link>
                </>
              )}
            </div>
          </header>
        )}

        <main className={`px-4 pb-7 md:px-10 md:py-8 ${ownHeader ? 'pt-0 md:pt-8' : 'pt-5'}`}>
          <div className="max-w-[1000px]">
            {children}
          </div>
        </main>
      </div>

      {/* Phone menu — a full screen of big rows, not a narrow drawer. */}
      {menuOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-surface flex flex-col pt-[env(safe-area-inset-top)]" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="h-[60px] shrink-0 flex items-center justify-between pl-5 pr-3 border-b border-border">
            <span className="font-heading font-extrabold text-[19px] text-accent">Goyal PG</span>
            <button type="button" onClick={() => setMenuOpen(false)} className={barButton}>Close</button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-1 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {navList(true)}
            <div className="flex-1" />
            {footer()}
          </div>
        </div>
      )}
    </div>
  )
}

export default Layout
