import { useState } from 'react'
import toast from 'react-hot-toast'
import { Phone, MessageCircle } from 'lucide-react'
import { api } from '../lib/api'
import { useApiQuery, setApiData } from '../lib/queries'
import { relativeLabel } from '../lib/format'
import { TitleSkeleton, PanelSkeleton } from '../components/Skeleton'
import { Card, Button, StatusTag, PageTitle, buttonCls } from '../components/ui'
import { formatPhone } from '../content/pg'

/**
 * The other half of the public enquiry form.
 *
 * Without this page the form is a write-only hole — messages land in a table
 * nobody opens, which is worse than having no form at all, because the sender
 * believes they have been heard.
 *
 * Read through the same query the menu's "2 new" count uses, so marking one
 * contacted here updates that count straight away.
 */

const FILTERS = [
  { key: 'new', label: 'New' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'closed', label: 'Closed' },
  { key: 'all', label: 'All' },
]

const TAGS = {
  new: <StatusTag tone="new">New</StatusTag>,
  contacted: <StatusTag tone="dark">Contacted</StatusTag>,
  closed: <StatusTag tone="success">Closed</StatusTag>,
}

const EnquiryCard = ({ enquiry, onStatus }) => {
  const [busy, setBusy] = useState(false)

  const setStatus = async (status) => {
    setBusy(true)
    try {
      await api.patch(`/enquiries/${enquiry.id}`, { status })
      onStatus(enquiry.id, status)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="px-4 py-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-[17px]">{enquiry.name}</p>
          <p className="text-[15px] text-text-secondary">{relativeLabel(enquiry.created_at)}</p>
        </div>
        {TAGS[enquiry.status]}
      </div>

      {enquiry.message && <p className="whitespace-pre-wrap break-words">{enquiry.message}</p>}
      {enquiry.email && <p className="text-[15px] text-text-secondary break-all">{enquiry.email}</p>}

      <div className="grid grid-cols-2 gap-2">
        <a href={`tel:+91${enquiry.phone}`} className={buttonCls('secondary')}>
          <Phone size={18} aria-hidden="true" /> Call
        </a>
        <a href={`https://wa.me/91${enquiry.phone}`} target="_blank" rel="noopener noreferrer" className={buttonCls('quiet')}>
          <MessageCircle size={18} aria-hidden="true" /> WhatsApp
        </a>
      </div>
      <p className="text-[15px] text-text-secondary -mt-1">{formatPhone(enquiry.phone)}</p>

      <div className="border-t border-border pt-3 flex flex-wrap gap-2">
        {enquiry.status === 'new' && (
          <Button variant="quiet" className="flex-1" onClick={() => setStatus('contacted')} disabled={busy}>Mark contacted</Button>
        )}
        {enquiry.status !== 'closed' && (
          <Button variant="quiet" className="flex-1" onClick={() => setStatus('closed')} disabled={busy}>Close</Button>
        )}
        {enquiry.status === 'closed' && (
          <Button variant="quiet" className="flex-1" onClick={() => setStatus('new')} disabled={busy}>Open again</Button>
        )}
      </div>
    </Card>
  )
}

const Enquiries = () => {
  const { data: enquiries = [], isPending, isError, error } = useApiQuery('/enquiries')
  const [filter, setFilter] = useState('new')

  const onStatus = (id, status) =>
    setApiData('/enquiries', (list) => list?.map((e) => (e.id === id ? { ...e, status } : e)))

  if (isPending) return <div className="flex flex-col gap-3.5"><TitleSkeleton /><PanelSkeleton count={4} /></div>

  const count = (key) => (key === 'all' ? enquiries.length : enquiries.filter((e) => e.status === key).length)
  const shown = filter === 'all' ? enquiries : enquiries.filter((e) => e.status === filter)
  const newCount = count('new')

  return (
    <div className="flex flex-col gap-3.5 max-w-2xl">
      <PageTitle>Enquiries</PageTitle>
      <p className="text-text-secondary px-1 -mt-1.5">
        {newCount > 0
          ? `${newCount} ${newCount === 1 ? 'message' : 'messages'} nobody has replied to yet.`
          : 'Messages from the website.'}
      </p>

      {isError && <p className="px-1">Couldn't load enquiries: {error.message}</p>}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5" role="radiogroup" aria-label="Show">
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={filter === key}
            onClick={() => setFilter(key)}
            className={`h-12 rounded-lg font-heading text-[15px] ${filter === key
              ? 'bg-text-primary text-surface border-2 border-text-primary font-bold'
              : 'bg-surface text-text-secondary border border-border font-semibold'}`}
          >
            {label} ({count(key)})
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <Card className="p-4">
          <div className="border border-dashed border-border rounded-[10px] px-4 py-7 flex flex-col items-center gap-3 text-center">
            <p className="font-heading font-bold text-lg">
              {filter === 'all' ? 'No enquiries yet' : `No ${FILTERS.find(f => f.key === filter).label.toLowerCase()} enquiries`}
            </p>
            <p className="text-text-secondary">Messages from the website will show up here.</p>
            {filter === 'new' && count('closed') > 0 && (
              <Button variant="quiet" onClick={() => setFilter('closed')}>See closed enquiries</Button>
            )}
          </div>
        </Card>
      ) : (
        shown.map((enquiry) => <EnquiryCard key={enquiry.id} enquiry={enquiry} onStatus={onStatus} />)
      )}
    </div>
  )
}

export default Enquiries
