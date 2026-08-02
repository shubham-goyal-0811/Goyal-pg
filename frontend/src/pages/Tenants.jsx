import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import toast from 'react-hot-toast'
import { Search, User, Phone, Home } from 'lucide-react'

const Tenants = () => {
  const navigate = useNavigate()
  const [tenants, setTenants] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)

  // Single effect for both the initial load and search. Previously a separate
  // mount effect fired /tenants at the same time this one did with an empty
  // query — two identical requests on every visit to the page.
  useEffect(() => {
    const q = query.trim()

    const run = () => {
      setSearching(true)
      api.get(q ? `/tenants?search=${encodeURIComponent(q)}` : '/tenants')
        .then(res => setTenants(res))
        .catch(() => toast.error(q ? 'Search failed' : 'Failed to load tenants'))
        .finally(() => { setSearching(false); setLoading(false) })
    }

    // The unfiltered list is cached client-side, so clearing the box shouldn't
    // wait 400ms. Only real search terms need debouncing.
    if (!q) { run(); return }

    const timer = setTimeout(run, 400)
    return () => clearTimeout(timer)
  }, [query])

  if (loading) {
    return <div className="flex h-64 items-center justify-center text-text-secondary">Loading tenants...</div>
  }

  return (
    <div>
      <header className="mb-8">
        <h1 className="text-3xl font-heading font-bold text-text-primary">Tenants</h1>
        <p className="text-text-secondary mt-1">Search and view tenant profiles</p>
      </header>

      {/* Search Bar */}
      <div className="relative mb-6">
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary" />
        <input
          type="text"
          placeholder="Search by name or mobile number..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="w-full pl-11 pr-4 py-3 rounded-xl border border-border bg-surface text-text-primary focus:outline-none focus:border-accent transition-colors shadow-sm"
        />
        {searching && (
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-text-secondary animate-pulse">
            Searching...
          </span>
        )}
      </div>

      {/* Results count */}
      <p className="text-sm text-text-secondary mb-4">
        {tenants.length} {query ? 'result(s) for' : 'active'} tenant{tenants.length !== 1 ? 's' : ''}
        {query && <span className="text-accent font-medium"> "{query}"</span>}
      </p>

      {tenants.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-text-secondary gap-3">
          <User size={48} strokeWidth={1} />
          <p className="text-lg font-medium">{query ? 'No tenants found' : 'No active tenants'}</p>
          {query && <p className="text-sm">Try a different name or mobile number</p>}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {tenants.map(tenant => (
            <button
              key={tenant.id}
              onClick={() => navigate(`/tenants/${tenant.id}`)}
              className="bg-surface border border-border rounded-xl p-5 text-left hover:border-accent hover:shadow-md transition-all group"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="bg-accent/10 text-accent rounded-full w-10 h-10 flex items-center justify-center font-heading font-bold text-lg flex-shrink-0">
                  {tenant.full_name.charAt(0).toUpperCase()}
                </div>
                <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                  tenant.status === 'active'
                    ? 'bg-success/10 text-success'
                    : 'bg-text-secondary/10 text-text-secondary'
                }`}>
                  {tenant.status?.toUpperCase()}
                </span>
              </div>

              <h3 className="font-heading font-bold text-text-primary text-lg group-hover:text-accent transition-colors truncate">
                {tenant.full_name}
              </h3>

              <div className="mt-2 space-y-1">
                <div className="flex items-center gap-2 text-text-secondary text-sm">
                  <Phone size={14} />
                  <span>{tenant.phone_number || '—'}</span>
                </div>
                <div className="flex items-center gap-2 text-text-secondary text-sm">
                  <Home size={14} />
                  <span>Room {tenant.rooms?.room_number || '—'}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default Tenants
