import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { Phone, MessageCircle, Inbox } from 'lucide-react'
import { api } from '../lib/api'
import { relativeLabel } from '../lib/format'
import { PanelSkeleton } from '../components/Skeleton'
import { formatPhone } from '../content/pg'

/**
 * The other half of the public enquiry form.
 *
 * Without this page the form is a write-only hole — messages land in a table
 * nobody opens, which is worse than having no form at all, because the sender
 * believes they have been heard.
 */

const FILTERS = [
  { key: 'new', label: 'New' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'closed', label: 'Closed' },
  { key: 'all', label: 'All' },
]

const STATUS_STYLES = {
  new: 'bg-accent/10 text-accent',
  contacted: 'bg-warning/10 text-warning',
  closed: 'bg-success/10 text-success',
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
    <div className="bg-surface border border-border rounded-xl p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-heading font-bold text-text-primary">{enquiry.name}</p>
          <p className="text-sm text-text-secondary mt-0.5">{relativeLabel(enquiry.created_at)}</p>
        </div>
        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_STYLES[enquiry.status]}`}>
          {enquiry.status}
        </span>
      </div>

      {enquiry.message && (
        <p className="mt-3 text-text-primary whitespace-pre-wrap break-words">{enquiry.message}</p>
      )}

      {enquiry.email && (
        <p className="mt-2 text-sm text-text-secondary break-all">{enquiry.email}</p>
      )}

      <div className="mt-4 pt-4 border-t border-border flex flex-wrap gap-2">
        <a
          href={`tel:+91${enquiry.phone}`}
          className="flex items-center gap-2 h-[44px] px-4 bg-accent text-surface rounded-md font-semibold hover:opacity-90"
        >
          <Phone size={16} /> {formatPhone(enquiry.phone)}
        </a>
        <a
          href={`https://wa.me/91${enquiry.phone}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 h-[44px] px-4 border border-border rounded-md font-medium text-text-primary hover:bg-bg"
        >
          <MessageCircle size={16} /> WhatsApp
        </a>

        <div className="flex-1" />

        {enquiry.status === 'new' && (
          <button
            onClick={() => setStatus('contacted')}
            disabled={busy}
            className="h-[44px] px-4 border border-border rounded-md font-medium text-text-secondary hover:text-text-primary disabled:opacity-40"
          >
            Mark contacted
          </button>
        )}
        {enquiry.status !== 'closed' && (
          <button
            onClick={() => setStatus('closed')}
            disabled={busy}
            className="h-[44px] px-4 border border-border rounded-md font-medium text-text-secondary hover:text-text-primary disabled:opacity-40"
          >
            Close
          </button>
        )}
        {enquiry.status === 'closed' && (
          <button
            onClick={() => setStatus('new')}
            disabled={busy}
            className="h-[44px] px-4 border border-border rounded-md font-medium text-text-secondary hover:text-text-primary disabled:opacity-40"
          >
            Reopen
          </button>
        )}
      </div>
    </div>
  )
}

const Enquiries = () => {
  const [enquiries, setEnquiries] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('new')

  useEffect(() => {
    api.get('/enquiries')
      .then(setEnquiries)
      .catch((err) => toast.error(err.message))
      .finally(() => setLoading(false))
  }, [])

  const onStatus = (id, status) =>
    setEnquiries((list) => list.map((e) => (e.id === id ? { ...e, status } : e)))

  const shown = filter === 'all' ? enquiries : enquiries.filter((e) => e.status === filter)
  const newCount = enquiries.filter((e) => e.status === 'new').length

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-3xl font-heading font-bold text-text-primary">Enquiries</h1>
        <p className="text-text-secondary mt-1">
          {newCount > 0
            ? `${newCount} message${newCount === 1 ? '' : 's'} nobody has replied to yet.`
            : 'Messages from the website.'}
        </p>
      </header>

      <div className="flex flex-wrap gap-2 mb-6">
        {FILTERS.map(({ key, label }) => {
          const count = key === 'all' ? enquiries.length : enquiries.filter((e) => e.status === key).length
          return (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`h-[44px] px-4 rounded-md font-medium border transition-colors
                ${filter === key
                  ? 'bg-accent text-surface border-accent'
                  : 'bg-surface text-text-secondary border-border hover:text-text-primary'}`}
            >
              {label} ({count})
            </button>
          )
        })}
      </div>

      {loading ? (
        <PanelSkeleton count={4} />
      ) : shown.length === 0 ? (
        <div className="bg-surface border border-border rounded-xl p-10 text-center">
          <Inbox size={32} className="mx-auto text-text-secondary mb-3" />
          <p className="text-text-secondary">
            {filter === 'new' ? 'Nothing waiting for a reply.' : 'Nothing here.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {shown.map((enquiry) => (
            <EnquiryCard key={enquiry.id} enquiry={enquiry} onStatus={onStatus} />
          ))}
        </div>
      )}
    </div>
  )
}

export default Enquiries
