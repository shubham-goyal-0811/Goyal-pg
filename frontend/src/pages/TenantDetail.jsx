import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import toast from 'react-hot-toast'
import MeterModal from '../components/MeterModal'
import { FileText, X, ExternalLink, Loader2 } from 'lucide-react'

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
            <p className="text-xs text-text-secondary mt-0.5">Uploaded on {new Date(doc.uploaded_at).toLocaleDateString('en-IN')}</p>
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

// ── Main Page ─────────────────────────────────────────────────────────────────
const TenantDetail = () => {
  const { id } = useParams()
  const navigate = useNavigate()
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

  if (loading) return <div className="flex justify-center p-8 text-text-secondary">Loading...</div>
  if (!tenant) return <div className="flex justify-center p-8 text-text-secondary">Tenant not found</div>

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
        {tenant.status === 'active' && (
          <button onClick={handleCheckout} className="bg-warning text-surface px-4 py-2 rounded-md font-semibold hover:opacity-90 h-[44px]">
            Checkout Tenant
          </button>
        )}
      </header>

      <div className="grid md:grid-cols-2 gap-8">
        {/* Rent History */}
        <div className="bg-surface border border-border rounded-xl shadow-sm p-6">
          <h2 className="text-xl font-heading font-bold mb-4">Rent History</h2>
          {!tenant.rent_payments?.length ? (
            <p className="text-text-secondary text-sm">No rent records yet</p>
          ) : (
            <div className="space-y-3">
              {tenant.rent_payments.map(payment => (
                <div key={payment.id} className="flex justify-between items-center p-3 bg-bg rounded-md">
                  <div>
                    <p className="font-medium">
                      {new Date(payment.billing_month).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
                    </p>
                    <p className="text-sm text-text-secondary">₹{payment.total_amount}</p>
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

        {/* Profile */}
        <div className="bg-surface border border-border rounded-xl shadow-sm p-6">
          <h2 className="text-xl font-heading font-bold mb-4">Profile</h2>
          <ul className="space-y-3 text-text-secondary">
            <li><span className="font-medium text-text-primary">Status:</span> {tenant.status?.toUpperCase()}</li>
            <li><span className="font-medium text-text-primary">Address:</span> {tenant.address || '—'}</li>
            <li><span className="font-medium text-text-primary">Check-in:</span> {tenant.check_in_date}</li>
            <li><span className="font-medium text-text-primary">ID Proof:</span> {tenant.id_proof_type?.toUpperCase() || '—'} — {tenant.id_proof_number || '—'}</li>
            <li><span className="font-medium text-text-primary">AC Opted:</span> {tenant.ac_opted ? 'Yes' : 'No'}</li>
            <li><span className="font-medium text-text-primary">Vehicle:</span> {tenant.has_vehicle ? tenant.vehicle_number : 'No'}</li>
            <li><span className="font-medium text-text-primary">Base Rent:</span> ₹{tenant.rooms?.seat_rent}</li>
          </ul>
        </div>

        {/* ID Documents */}
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
                      {new Date(doc.uploaded_at).toLocaleDateString('en-IN')}
                    </p>
                  </div>
                  <span className="text-xs text-accent font-medium group-hover:underline">View →</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default TenantDetail
