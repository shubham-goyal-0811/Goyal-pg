import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { LayoutDashboard, Users, ShieldCheck, Settings as SettingsIcon, LogOut, Menu, X, BookOpen } from 'lucide-react'
import { useState } from 'react'

const Layout = ({ children }) => {
  const { signOut } = useAuth()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const navItems = [
    { label: 'Dashboard', path: '/', icon: LayoutDashboard },
    { label: 'Tenants', path: '/tenants', icon: Users },
    { label: 'Gate Log', path: '/gate-log', icon: BookOpen },
    { label: 'Police Verification', path: '/police-verification', icon: ShieldCheck },
    { label: 'Settings', path: '/settings', icon: SettingsIcon },
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
          <h1 className="text-2xl font-heading font-bold text-accent">Goyal PG</h1>
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
