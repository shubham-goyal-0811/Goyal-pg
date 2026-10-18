import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApiQuery, prefetchApi } from '../lib/queries'
import { searchTenants } from '../lib/search'
import { Search } from 'lucide-react'
import { TitleSkeleton, ListSkeleton } from '../components/Skeleton'
import { Card, PageTitle, ChevronRight } from '../components/ui'

const Tenants = () => {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')

  // Everyone, moved out included, loaded once and searched here on every
  // keystroke — a PG's whole history is a few hundred rows, and filtering them
  // on the phone beats waiting on the network for each letter.
  const { data, isPending, isError, error } = useApiQuery('/tenants?status=all')
  const searching = query.trim() !== ''
  const tenants = useMemo(() => {
    const all = data ?? []
    // Without a search, only people living here.
    return searching ? searchTenants(all, query) : all.filter(t => t.status === 'active')
  }, [data, query, searching])

  // Opening a tenant is the next thing anyone does here. Start loading their
  // record the moment a pointer lands on the row — hover with a mouse, the
  // touch itself on a phone — so it is usually there before the tap completes.
  const warm = (id) => prefetchApi(`/tenants/${id}`)

  if (isPending) {
    return (
      <div className="flex flex-col gap-3.5">
        <TitleSkeleton />
        <div className="h-[52px] bg-skeleton rounded-lg animate-skeleton" aria-hidden="true" />
        <ListSkeleton rows={8} tag={false} />
      </div>
    )
  }

  // A search covers people who have moved out too.
  const countLine = searching
    ? `${tenants.length} found`
    : `${tenants.length} ${tenants.length === 1 ? 'person' : 'people'} living here`

  return (
    <div className="flex flex-col gap-3.5 max-w-2xl">
      <PageTitle>Tenants</PageTitle>

      <label className="flex flex-col gap-1.5">
        <span className="font-heading font-semibold text-[15px] px-1">Search by name, mobile or room</span>
        <span className="relative block">
          <Search size={20} aria-hidden="true" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-secondary" />
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoComplete="off"
            className="w-full h-[52px] pl-11 pr-3 rounded-lg border border-border bg-surface text-[17px] focus:outline-2 focus:outline-text-primary focus:outline-offset-2"
          />
        </span>
      </label>

      <p className="text-[15px] text-text-secondary px-1" aria-live="polite">{countLine}</p>

      {isError && (
        <p className="px-1">Couldn't load tenants: {error.message}</p>
      )}

      <Card className="overflow-hidden">
        {tenants.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => navigate(`/admin/tenants/${t.id}`)}
            onPointerEnter={() => warm(t.id)}
            onFocus={() => warm(t.id)}
            className="w-full min-h-16 flex items-center gap-3 px-4 py-2 bg-surface text-left border-b border-border last:border-b-0 hover:bg-bg"
          >
            <span className="flex-1 flex flex-col min-w-0">
              <span className="font-semibold text-[17px] truncate">{t.full_name}</span>
              <span className="text-[15px] text-text-secondary">
                Room {t.rooms?.room_number || '—'}{t.phone_number && ` · ${t.phone_number}`}
                {t.status !== 'active' && ' · Moved out'}
              </span>
            </span>
            <ChevronRight />
          </button>
        ))}
        {tenants.length === 0 && !isError && (
          <p className="px-4 py-7 text-center text-text-secondary">
            {query.trim() ? `No tenant matches "${query.trim()}".` : 'Nobody is living here yet.'}
          </p>
        )}
      </Card>
    </div>
  )
}

export default Tenants
