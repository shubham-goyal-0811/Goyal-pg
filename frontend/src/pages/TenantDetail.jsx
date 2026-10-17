import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import { dateLabel, monthLabel, rupees } from '../lib/format'
import toast from 'react-hot-toast'
import MeterModal from '../components/MeterModal'
import { HeaderSkeleton, PanelSkeleton } from '../components/Skeleton'
import { FileText, X, ExternalLink, Loader2, KeyRound, CircleCheck, CircleAlert, IdCard } from 'lucide-react'

// ── Doc Preview Modal ─────────────────────────────────────────────────────────
const DocPreviewModal = ({ doc, tenantId, onClose }) => {
  const [url, setUrl] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.get(`/tenants/${tenantId}/documents/${doc.id}/signed-url`)
      .then(res => setUrl(res.signedUrl))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [doc.id, tenantId])

  const isPdf = doc.file_url?.toLowerCase().endsWith('.pdf')

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <h3 className="font-heading font-bold text-text-primary">{doc.doc_type?.replace(/_/g, ' ').toUpperCase()}</h3>
            <p className="text-xs text-text-secondary mt-0.5">Uploaded on {dateLabel(doc.uploaded_at)}</p>
          </div>
          <div className="flex items-center gap-2">
            {url && (
              <a href={url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-accent text-sm font-medium hover:underline">
                <ExternalLink size={14} /> Open in new tab
              </a>
            )}
            <button onClick={onClose} className="p-2 rounded-md hover:bg-bg transition-colors text-text-secondary">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-bg min-h-[300px]">
          {loading && (
            <div className="flex flex-col items-center gap-3 text-text-secondary">
              <Loader2 size={32} className="animate-spin" />
              <p className="text-sm">Loading document...</p>
            </div>
          )}
          {error && <p className="text-warning text-sm text-center">{error}</p>}
          {url && !loading && (
            isPdf ? (
              <iframe src={url} className="w-full h-[60vh] rounded-md border border-border" title="ID Proof" />
            ) : (
              <img src={url} alt="ID Proof" className="max-w-full max-h-[65vh] object-contain rounded-md shadow" />
            )
          )}
        </div>
      </div>
    </div>
  )
}

// ── ID Proof ──────────────────────────────────────────────────────────────────
// The number here is captured by OCR off a photographed card, and OCR gets
// digits wrong on a creased or badly lit Aadhaar. Until now there was no way to
// correct one from the app at all — the field was read-only everywhere and only
// ever written once, during onboarding. That made the police verification form
// the place where the mistake was discovered.
//
// The API validates the pair (12 digits + Verhoeff checksum for Aadhaar) and
// stores it normalized, so the check below is only there to catch the obvious
// case before a round-trip. The server's answer is the one that counts.
const ID_PROOF_TYPES = [
  { value: 'aadhaar',         label: 'Aadhaar',          hint: '12 digits, as printed on the card' },
  { value: 'pan',             label: 'PAN',              hint: 'e.g. ABCDE1234F' },
  { value: 'passport',        label: 'Passport',         hint: '1 letter followed by 7 digits' },
  { value: 'driving_license', label: 'Driving Licence',  hint: '8–20 letters or digits' },
]

// '234123412346' → '2341 2341 2346'. Grouped the way it is printed, because the
// admin is reading it back off a card held next to the screen.
const displayIdNumber = (type, number) => {
  if (!number) return '—'
  return type === 'aadhaar' ? number.replace(/(\d{4})(?=\d)/g, '$1 ') : number
}

const IdProof = ({ tenant, tenantId, onChange }) => {
  const [editing, setEditing] = useState(false)
  const [type, setType] = useState(tenant.id_proof_type || 'aadhaar')
  const [number, setNumber] = useState(tenant.id_proof_number || '')
  const [busy, setBusy] = useState(false)

  const spec = ID_PROOF_TYPES.find(t => t.value === type) ?? ID_PROOF_TYPES[0]
  const cleaned = number.replace(/[\s-]/g, '')
  const tooShortAadhaar = type === 'aadhaar' && cleaned.length > 0 && cleaned.length !== 12

  const open = () => {
    setType(tenant.id_proof_type || 'aadhaar')
    setNumber(tenant.id_proof_number || '')
    setEditing(true)
  }

  const save = async () => {
    setBusy(true)
    try {
      const updated = await api.patch(`/tenants/${tenantId}`, {
        id_proof_type: type,
        id_proof_number: cleaned,
      })
      onChange({
        id_proof_type: updated.id_proof_type,
        id_proof_number: updated.id_proof_number,
      })
      setEditing(false)
      toast.success('ID proof updated')
    } catch (err) {
      // Carries the real reason — wrong length, failed checksum, bad PAN shape.
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  const clear = async () => {
    if (!window.confirm(`Remove the ID proof number on record for ${tenant.full_name}?`)) return
    setBusy(true)
    try {
      await api.patch(`/tenants/${tenantId}`, { id_proof_number: '' })
      onChange({ id_proof_type: null, id_proof_number: null })
      setEditing(false)
      toast.success('ID proof cleared')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  const inputCls = 'w-full h-[44px] px-3 bg-bg border border-border rounded-md text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-accent'

  return (
    <div className="bg-surface border border-border rounded-xl shadow-sm p-6 md:col-span-2">
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-2">
          <IdCard size={20} className="text-text-secondary" />
          <h2 className="text-xl font-heading font-bold">ID Proof</h2>
        </div>
        {!editing && (
          <button onClick={open} className="text-accent text-sm font-semibold hover:underline">
            {tenant.id_proof_number ? 'Edit' : 'Add'}
          </button>
        )}
      </div>
      <p className="text-sm text-text-secondary mb-4">
        Goes on the police verification form. Correct it here if the scan read it wrong.
      </p>

      {!editing ? (
        <div className="p-4 bg-bg border border-border rounded-md">
          {tenant.id_proof_number ? (
            <>
              <p className="text-xs text-text-secondary uppercase tracking-wide">
                {ID_PROOF_TYPES.find(t => t.value === tenant.id_proof_type)?.label || tenant.id_proof_type}
              </p>
              <p className="font-medium text-text-primary mt-1 tabular-nums">
                {displayIdNumber(tenant.id_proof_type, tenant.id_proof_number)}
              </p>
            </>
          ) : (
            <p className="text-sm text-text-secondary">
              No ID number on record. Add it before filing police verification.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3 max-w-md">
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Document type</label>
            <select value={type} onChange={e => setType(e.target.value)} className={inputCls}>
              {ID_PROOF_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Number</label>
            <input
              value={number}
              onChange={e => setNumber(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && cleaned) save() }}
              placeholder={spec.hint}
              inputMode={type === 'aadhaar' ? 'numeric' : 'text'}
              autoComplete="off"
              className={`${inputCls} tabular-nums`}
            />
            <p className={`text-xs mt-1 ${tooShortAadhaar ? 'text-warning' : 'text-text-secondary'}`}>
              {tooShortAadhaar ? `${cleaned.length} of 12 digits` : spec.hint}
            </p>
          </div>

          <div className="flex flex-wrap gap-3 pt-1">
            <button
              onClick={save}
              disabled={busy || !cleaned}
              className="h-[44px] px-5 bg-accent text-surface rounded-md font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {busy ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={() => setEditing(false)}
              disabled={busy}
              className="h-[44px] px-4 border border-border rounded-md font-medium text-text-secondary hover:text-text-primary disabled:opacity-40"
            >
              Cancel
            </button>
            {tenant.id_proof_number && (
              <button
                onClick={clear}
                disabled={busy}
                className="h-[44px] px-4 ml-auto text-text-secondary hover:text-warning font-medium disabled:opacity-40"
              >
                Remove
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Portal Access ─────────────────────────────────────────────────────────────
// Lets an admin hand a resident read-only access to their own record at /me.
//
// The one real hazard here is a typo: an email pointing at the wrong person
// gives a stranger this tenant's rent history and documents. Nothing can
// validate the address up front, so once the account signs in we show the
// Google display name it came back with — that is the check the admin makes.
const PortalAccess = ({ tenant, tenantId, onChange }) => {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)

  const invited = Boolean(tenant.login_email)
  const claimed = Boolean(tenant.user_id)

  const grant = async () => {
    const value = email.trim().toLowerCase()
    if (!value) return
    setBusy(true)
    try {
      const updated = await api.patch(`/tenants/${tenantId}`, { login_email: value })
      onChange({ login_email: updated.login_email, user_id: updated.user_id })
      setEmail('')
      toast.success('Portal access granted')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  const revoke = async () => {
    if (!window.confirm(`Remove portal access for ${tenant.full_name}? They will be signed out of their account's access on their next request.`)) return
    setBusy(true)
    try {
      await api.post(`/tenants/${tenantId}/revoke-portal`)
      onChange({ login_email: null, user_id: null, portal_user: null })
      toast.success('Portal access removed')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-surface border border-border rounded-xl shadow-sm p-6 md:col-span-2">
      <div className="flex items-center gap-2 mb-1">
        <KeyRound size={20} className="text-text-secondary" />
        <h2 className="text-xl font-heading font-bold">Portal Access</h2>
      </div>
      <p className="text-sm text-text-secondary mb-4">
        Lets this tenant sign in with Google and see their own rent and documents. They cannot change anything.
      </p>

      {!invited && !claimed && (
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') grant() }}
            placeholder="tenant's Google email"
            autoComplete="off"
            className="flex-1 h-[44px] px-3 bg-bg border border-border rounded-md text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-accent"
          />
          <button
            onClick={grant}
            disabled={busy || !email.trim()}
            className="h-[44px] px-5 bg-accent text-surface rounded-md font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Grant access
          </button>
        </div>
      )}

      {invited && !claimed && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-bg border border-border rounded-md">
          <div>
            <p className="font-medium text-text-primary">{tenant.login_email}</p>
            <p className="text-sm text-text-secondary mt-0.5">
              Invited — waiting for their first sign-in.
            </p>
          </div>
          <button
            onClick={revoke}
            disabled={busy}
            className="h-[44px] px-4 border border-border rounded-md font-medium text-text-secondary hover:text-warning hover:border-warning disabled:opacity-40"
          >
            Remove
          </button>
        </div>
      )}

      {claimed && (
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-bg border border-border rounded-md">
            <div className="flex items-start gap-3">
              <CircleCheck size={20} className="text-success shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-text-primary">
                  {tenant.portal_user?.full_name || 'Signed in'}
                </p>
                <p className="text-sm text-text-secondary mt-0.5">
                  {tenant.portal_user?.email || tenant.login_email}
                </p>
              </div>
            </div>
            <button
              onClick={revoke}
              disabled={busy}
              className="h-[44px] px-4 border border-border rounded-md font-medium text-text-secondary hover:text-warning hover:border-warning disabled:opacity-40"
            >
              Revoke access
            </button>
          </div>
          <p className="flex items-start gap-2 text-sm text-text-secondary">
            <CircleAlert size={16} className="text-warning shrink-0 mt-0.5" />
            Check that name is really {tenant.full_name}. If it is not, revoke access now — that
            account can see this tenant's rent history and ID documents.
          </p>
        </div>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
const TenantDetail = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const { role } = useAuth()
  const [tenant, setTenant] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isMeterModalOpen, setMeterModalOpen] = useState(false)
  const [roomIdForMeter, setRoomIdForMeter] = useState(null)
  const [previewDoc, setPreviewDoc] = useState(null)

  useEffect(() => {
    api.get(`/tenants/${id}`)
      .then(res => setTenant(res))
      .catch(() => toast.error('Failed to load tenant'))
      .finally(() => setLoading(false))
  }, [id])

  const handleCheckout = async () => {
    if (!window.confirm('Are you sure you want to mark this tenant as vacated?')) return
    try {
      const res = await api.post(`/tenants/${id}/checkout`)
      setTenant(prev => ({ ...prev, status: 'vacated' }))
      if (res.requiresMeterReading) {
        setRoomIdForMeter(res.roomId)
        setMeterModalOpen(true)
      }
      toast.success('Tenant checked out')
    } catch (err) {
      toast.error('Failed to checkout')
    }
  }

  const markPaid = async (paymentId) => {
    try {
      await api.post(`/rent/${paymentId}/mark-paid`, {
        amount_paid: tenant.rent_payments.find(p => p.id === paymentId)?.total_amount
      })
      setTenant(prev => ({
        ...prev,
        rent_payments: prev.rent_payments.map(p => p.id === paymentId ? { ...p, status: 'paid' } : p)
      }))
      toast.success('Marked as paid')
    } catch (err) {
      toast.error('Failed to mark paid')
    }
  }

  if (loading) {
    return (
      <div>
        <HeaderSkeleton />
        <div className="grid md:grid-cols-2 gap-8">
          <PanelSkeleton count={1} />
          <PanelSkeleton count={1} />
        </div>
      </div>
    )
  }
  if (!tenant) return <div className="flex justify-center p-8 text-text-secondary">Tenant not found</div>

  // Rent, ID-proof numbers and document scans are admin-only. The API already
  // omits these fields for gatekeepers — this just avoids rendering empty
  // sections that look like missing data rather than withheld data.
  const isAdmin = role === 'admin'

  return (
    <div>
      {/* Modals */}
      <MeterModal isOpen={isMeterModalOpen} roomId={roomIdForMeter} onClose={() => setMeterModalOpen(false)} />
      {previewDoc && <DocPreviewModal doc={previewDoc} tenantId={id} onClose={() => setPreviewDoc(null)} />}

      {/* Header */}
      <header className="mb-8 flex flex-col md:flex-row md:justify-between md:items-start gap-4">
        <div>
          <h1 className="text-3xl font-heading font-bold text-text-primary">{tenant.full_name}</h1>
          <p className="text-text-secondary mt-1">Room {tenant.rooms?.room_number} • {tenant.phone_number}</p>
        </div>
        {tenant.status === 'active' && isAdmin && (
          <button onClick={handleCheckout} className="bg-warning text-surface px-4 py-2 rounded-md font-semibold hover:opacity-90 h-[44px]">
            Checkout Tenant
          </button>
        )}
      </header>

      <div className="grid md:grid-cols-2 gap-8">
        {/* Rent History — admin only */}
        {isAdmin && (
          <div className="bg-surface border border-border rounded-xl shadow-sm p-6">
            <h2 className="text-xl font-heading font-bold mb-4">Rent History</h2>
            {!tenant.rent_payments?.length ? (
              <p className="text-text-secondary text-sm">No rent records yet</p>
            ) : (
              <div className="space-y-3">
                {tenant.rent_payments.map(payment => (
                  <div key={payment.id} className="flex justify-between items-center p-3 bg-bg rounded-md">
                    <div>
                      <p className="font-medium">{monthLabel(payment.billing_month)}</p>
                      <p className="text-sm text-text-secondary">{rupees(payment.total_amount)}</p>
                    </div>
                    {payment.status === 'paid' ? (
                      <span className="text-success font-semibold px-3 py-1 bg-success/10 rounded-full text-sm">Paid</span>
                    ) : (
                      <button onClick={() => markPaid(payment.id)} className="text-accent font-semibold text-sm px-3 py-1 bg-accent/10 rounded-full hover:underline">
                        Mark Paid
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Profile */}
        <div className={`bg-surface border border-border rounded-xl shadow-sm p-6 ${isAdmin ? '' : 'md:col-span-2'}`}>
          <h2 className="text-xl font-heading font-bold mb-4">Profile</h2>
          <ul className="space-y-3 text-text-secondary">
            <li><span className="font-medium text-text-primary">Status:</span> {tenant.status?.toUpperCase()}</li>
            <li><span className="font-medium text-text-primary">Check-in:</span> {dateLabel(tenant.check_in_date)}</li>
            {tenant.check_out_date && (
              <li><span className="font-medium text-text-primary">Check-out:</span> {dateLabel(tenant.check_out_date)}</li>
            )}
            <li><span className="font-medium text-text-primary">AC Opted:</span> {tenant.ac_opted ? 'Yes' : 'No'}</li>
            <li><span className="font-medium text-text-primary">Vehicle:</span> {tenant.has_vehicle ? tenant.vehicle_number : 'No'}</li>
            <li><span className="font-medium text-text-primary">Parent's Contact:</span> {tenant.parent_contact || '—'}</li>
            {isAdmin && (
              <>
                <li><span className="font-medium text-text-primary">Address:</span> {tenant.address || '—'}</li>
                <li><span className="font-medium text-text-primary">Base Rent:</span> {rupees(tenant.rooms?.seat_rent)}</li>
              </>
            )}
          </ul>
        </div>

        {/* ID proof — admin only, and editable: OCR gets digits wrong. */}
        {isAdmin && (
          <IdProof
            tenant={tenant}
            tenantId={id}
            onChange={(patch) => setTenant(prev => ({ ...prev, ...patch }))}
          />
        )}

        {/* Portal access — admin only */}
        {isAdmin && (
          <PortalAccess
            tenant={tenant}
            tenantId={id}
            onChange={(patch) => setTenant(prev => ({ ...prev, ...patch }))}
          />
        )}

        {/* ID Documents — admin only */}
        {isAdmin && (
          <div className="bg-surface border border-border rounded-xl shadow-sm p-6 md:col-span-2">
            <h2 className="text-xl font-heading font-bold mb-4">ID Documents</h2>
            {!tenant.tenant_documents?.length ? (
              <p className="text-text-secondary text-sm">No documents uploaded yet</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {tenant.tenant_documents.map(doc => (
                  <button
                    key={doc.id}
                    onClick={() => setPreviewDoc(doc)}
                    className="flex flex-col items-center gap-3 p-4 bg-bg border border-border rounded-xl hover:border-accent hover:shadow-md transition-all group"
                  >
                    <div className="bg-accent/10 text-accent p-4 rounded-lg group-hover:bg-accent group-hover:text-surface transition-colors">
                      <FileText size={28} />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-semibold text-text-primary leading-tight">
                        {doc.doc_type?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                      </p>
                      <p className="text-xs text-text-secondary mt-1">
                        {dateLabel(doc.uploaded_at)}
                      </p>
                    </div>
                    <span className="text-xs text-accent font-medium group-hover:underline">View →</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default TenantDetail
