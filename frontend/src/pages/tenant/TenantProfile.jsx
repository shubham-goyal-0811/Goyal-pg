import { useState, useEffect } from 'react'
import { FileText, X, ExternalLink, Loader2, ShieldCheck, ShieldAlert } from 'lucide-react'
import { api } from '../../lib/api'
import { dateLabel } from '../../lib/format'

/**
 * Own details, room, roommates, documents and verification status.
 *
 * Read-only, and it says so — a resident who wants a phone number corrected
 * asks the office. Adding an edit form here would mean tenant-writable fields
 * on records the property is legally responsible for.
 */

// ── Document viewer ───────────────────────────────────────────────────────────
// Same 5-minute signed URL as the admin viewer, but the endpoint resolves the
// tenant from the session, so :docId alone can't reach anyone else's scan.
const DocViewer = ({ doc, onClose }) => {
  const [url, setUrl] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.get(`/me/documents/${doc.id}/signed-url`)
      .then((res) => setUrl(res.signedUrl))
      .catch((err) => setError(err.message))
  }, [doc.id])

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 p-4 border-b border-border">
          <h3 className="font-heading font-bold text-text-primary">{label(doc.doc_type)}</h3>
          <div className="flex items-center gap-2">
            {url && (
              <a href={url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-accent text-sm font-medium hover:underline">
                <ExternalLink size={14} /> Open
              </a>
            )}
            <button onClick={onClose} aria-label="Close" className="p-2 rounded-md hover:bg-bg text-text-secondary">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-bg min-h-[240px]">
          {!url && !error && <Loader2 size={28} className="animate-spin text-text-secondary" />}
          {error && <p className="text-warning text-sm text-center">{error}</p>}
          {url && (doc.is_pdf
            ? <iframe src={url} className="w-full h-[60vh] rounded-md border border-border" title={label(doc.doc_type)} />
            : <img src={url} alt={label(doc.doc_type)} className="max-w-full max-h-[65vh] object-contain rounded-md" />
          )}
        </div>
      </div>
    </div>
  )
}

const label = (docType) =>
  String(docType || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

const Row = ({ term, children }) => (
  <div className="flex justify-between gap-4 py-2 border-b border-border last:border-0">
    <dt className="text-text-secondary shrink-0">{term}</dt>
    <dd className="text-text-primary text-right break-words">{children || '—'}</dd>
  </div>
)

const Card = ({ title, children }) => (
  <div className="bg-surface border border-border rounded-xl p-6">
    <h2 className="font-heading font-bold text-text-primary mb-3">{title}</h2>
    {children}
  </div>
)

const TenantProfile = () => {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [viewing, setViewing] = useState(null)

  useEffect(() => {
    api.get('/me/profile').then(setData).catch((err) => setError(err.message))
  }, [])

  if (error) {
    return (
      <div className="bg-surface border border-border rounded-xl p-6">
        <p className="text-text-primary font-medium">{error}</p>
      </div>
    )
  }

  if (!data) return <p className="text-text-secondary">Loading…</p>

  const { tenant, room, roommates, documents, police_verification: pv } = data
  const verified = pv?.status === 'verified'

  return (
    <div className="space-y-4">
      {viewing && <DocViewer doc={viewing} onClose={() => setViewing(null)} />}

      <div>
        <h1 className="text-2xl font-heading font-bold text-text-primary">{tenant.full_name}</h1>
        <p className="text-text-secondary mt-1">
          These are the details the office has on record. To change any of them, ask at the office.
        </p>
      </div>

      <Card title="Your details">
        <dl>
          <Row term="Mobile">{tenant.phone_number}</Row>
          <Row term="Parent's contact">{tenant.parent_contact}</Row>
          <Row term="Address">{tenant.address}</Row>
          <Row term="ID on file">{tenant.id_proof_type ? label(tenant.id_proof_type) : null}</Row>
          <Row term="Moved in">{dateLabel(tenant.check_in_date)}</Row>
          {tenant.check_out_date && <Row term="Moved out">{dateLabel(tenant.check_out_date)}</Row>}
          <Row term="AC">{tenant.ac_opted ? 'Opted in' : 'Not opted'}</Row>
          <Row term="Vehicle">{tenant.has_vehicle ? (tenant.vehicle_number || 'Yes') : 'None'}</Row>
        </dl>
      </Card>

      <Card title="Your room">
        {!room ? (
          <p className="text-text-secondary">No room assigned yet.</p>
        ) : (
          <dl>
            <Row term="Room">{room.room_number}</Row>
            <Row term="Floor">{room.floor}</Row>
            <Row term="Sharing">{room.capacity}-sharing</Row>
            <Row term="You live with">
              {roommates.length === 0
                ? 'Nobody else right now'
                : roommates.map((r) => r.first_name).join(', ')}
            </Row>
          </dl>
        )}
      </Card>

      <Card title="Police verification">
        <div className="flex gap-3">
          {verified
            ? <ShieldCheck size={20} className="text-success shrink-0 mt-0.5" />
            : <ShieldAlert size={20} className="text-warning shrink-0 mt-0.5" />}
          <div>
            <p className="text-text-primary font-medium capitalize">{pv?.status || 'Not started'}</p>
            <p className="text-sm text-text-secondary mt-0.5">
              {verified
                ? `Verified on ${dateLabel(pv.verified_date)}.`
                : 'The office files this for you — nothing for you to do.'}
            </p>
          </div>
        </div>
      </Card>

      <Card title="Your documents">
        {documents.length === 0 ? (
          <p className="text-text-secondary">Nothing uploaded for you yet.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {documents.map((doc) => (
              <button
                key={doc.id}
                onClick={() => setViewing(doc)}
                className="flex flex-col items-center gap-2 p-4 bg-bg border border-border rounded-xl hover:border-accent transition-colors"
              >
                <FileText size={24} className="text-accent" />
                <span className="text-sm font-medium text-text-primary text-center leading-tight">
                  {label(doc.doc_type)}
                </span>
                <span className="text-xs text-text-secondary">{dateLabel(doc.uploaded_at)}</span>
              </button>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

export default TenantProfile
