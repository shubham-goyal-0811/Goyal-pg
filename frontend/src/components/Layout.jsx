import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { isAdmin } from '../lib/roles'
import useDocumentTitle from '../hooks/useDocumentTitle'
import { LayoutDashboard, Users, ShieldCheck, Settings as SettingsIcon, LogOut, Menu, X, BookOpen, Inbox } from 'lucide-react'
import { useState } from 'react'

const Layout = ({ children }) => {
  const { signOut, role } = useAuth()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // index.html carries the public marketing title, which is wrong once you're
  // inside the office app — and worse in the installed PWA's task switcher.
  useDocumentTitle('Goyal PG — Office')

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

        <div className="p-4 border-t border-border">
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
