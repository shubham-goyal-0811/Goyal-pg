import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { isAdmin } from '../lib/roles'
import { api } from '../lib/api'
import { useApiQuery, setApiData } from '../lib/queries'
import { dateLabel, dayMonthLabel, monthName, rupees, todayISO } from '../lib/format'
import toast from 'react-hot-toast'
import { X, ExternalLink, Loader2, LogOut, ChevronDown } from 'lucide-react'
import { TitleSkeleton, PanelSkeleton } from '../components/Skeleton'
import {
  Card, CardTitle, Button, TextButton, StatusTag, RentTag, Notice, InfoRow,
  Field, ConfirmDialog, inputCls,
} from '../components/ui'

/**
 * A tenant's record. It opens on this month's bill, because "has she paid?"
 * is why anyone opens it. Profile comes next. The things needed once or twice
 * a stay — ID number, document scans, portal access — sit under "More
 * details", and checking out is a quiet button at the very bottom.
 */

const firstName = (name = '') => name.split(' ')[0]

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
    <div className="fixed inset-0 bg-text-primary/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface rounded-[10px] w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 p-4 border-b border-border">
          <div>
            <h3 className="font-heading font-bold text-lg">{docName(doc.doc_type)}</h3>
            <p className="text-sm text-text-secondary">Added {dateLabel(doc.uploaded_at)}</p>
          </div>
          <div className="flex items-center gap-2">
            {url && (
              <a href={url} target="_blank" rel="noopener noreferrer"
                className="h-11 px-3 flex items-center gap-1.5 font-heading font-semibold text-[15px] underline underline-offset-4">
                <ExternalLink size={16} aria-hidden="true" /> Open
              </a>
            )}
            <button type="button" onClick={onClose} aria-label="Close" className="h-11 w-11 flex items-center justify-center border border-border rounded-lg">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-bg min-h-[300px]">
          {loading && (
            <div className="flex flex-col items-center gap-3 text-text-secondary">
              <Loader2 size={32} className="animate-spin" />
              <p>Loading the document...</p>
            </div>
          )}
          {error && <p className="text-center">{error}</p>}
          {url && !loading && (
            isPdf
              ? <iframe src={url} className="w-full h-[60vh] rounded-lg border border-border" title={docName(doc.doc_type)} />
              : <img src={url} alt={docName(doc.doc_type)} className="max-w-full max-h-[65vh] object-contain rounded-lg" />
          )}
        </div>
      </div>
    </div>
  )
}

// 'id_proof_front' → 'ID proof front'
const docName = (type = '') => {
  const s = type.replace(/_/g, ' ').replace(/\bid\b/i, 'ID')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// ── Bill ──────────────────────────────────────────────────────────────────────
const paidLabel = (date) => {
  if (!date) return 'Paid'
  return date === todayISO() ? `Paid today, ${dayMonthLabel(date)}` : `Paid on ${dayMonthLabel(date)}`
}

const BillCard = ({ bill, onMarkPaid, busy }) => {
  const paid = bill.status === 'paid'
  const rows = [
    ['Seat rent', bill.seat_rent],
    ...(Number(bill.ac_charge) > 0 ? [['AC', bill.ac_charge]] : []),
    ['Electricity', bill.electricity_charge],
  ]

  return (
    <Card className="px-4 py-[18px] lg:p-5 flex flex-col gap-3.5 lg:grid lg:grid-cols-2 lg:gap-x-6 lg:gap-y-4 lg:items-end">
      <div className="flex flex-col gap-3.5 lg:gap-2.5">
        <div className="flex items-center justify-between lg:justify-start gap-2.5">
          <CardTitle>{monthName(bill.billing_month)} bill</CardTitle>
          <RentTag status={bill.status} />
        </div>
        <p className="text-4xl lg:text-[38px] font-semibold leading-none">{rupees(bill.total_amount)}</p>
      </div>
      <dl className="flex flex-col gap-1 lg:gap-0.5 text-text-secondary lg:text-[15px]">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4"><dt>{label}</dt><dd>{rupees(value)}</dd></div>
        ))}
      </dl>
      <div className="lg:col-span-2">
        {paid ? (
          <div className="h-14 flex items-center justify-center border border-success rounded-lg font-heading font-semibold text-[17px] text-success">
            {paidLabel(bill.paid_date)}
          </div>
        ) : (
          <Button variant="primary" className="w-full text-lg" onClick={() => onMarkPaid(bill.id)} disabled={busy}>
            {busy ? 'Saving...' : 'Mark paid'}
          </Button>
        )}
      </div>
    </Card>
  )
}

const RentHistory = ({ bills, onMarkPaid, busyId }) => (
  <Card>
    <CardTitle className="px-4 lg:px-5 pt-4 pb-2">Rent history</CardTitle>
    {bills.length === 0 && (
      <p className="px-4 lg:px-5 pb-4 text-text-secondary">No earlier bills.</p>
    )}
    {bills.map(bill => (
      <div key={bill.id} className="flex items-center justify-between gap-3 px-4 lg:px-5 py-3 border-t border-border min-h-11">
        <div>
          <p className="font-semibold">{monthName(bill.billing_month)} {bill.billing_month.slice(0, 4) !== todayISO().slice(0, 4) && bill.billing_month.slice(0, 4)}</p>
          <p className="text-[15px] text-text-secondary">
            {rupees(bill.total_amount)}{bill.status === 'paid' && bill.paid_date && ` · paid ${dayMonthLabel(bill.paid_date)}`}
          </p>
        </div>
        {bill.status === 'paid' ? (
          <RentTag status="paid" />
        ) : (
          <div className="flex items-center gap-2">
            <RentTag status="pending" />
            <Button variant="quiet" size="sm" onClick={() => onMarkPaid(bill.id)} disabled={busyId === bill.id}>
              {busyId === bill.id ? 'Saving...' : 'Mark paid'}
            </Button>
          </div>
        )}
      </div>
    ))}
  </Card>
)

// ── ID Proof ──────────────────────────────────────────────────────────────────
// The number here is captured by OCR off a photographed card, and OCR gets
// digits wrong on a creased or badly lit Aadhaar. This is where it is
// corrected, before the police verification form is.
//
// The API validates the pair (12 digits + Verhoeff checksum for Aadhaar) and
// stores it normalized, so the check below is only there to catch the obvious
// case before a round-trip. The server's answer is the one that counts.
const ID_PROOF_TYPES = [
  { value: 'aadhaar',         label: 'Aadhaar',         hint: '12 digits, as printed on the card' },
  { value: 'pan',             label: 'PAN',             hint: 'Like ABCDE1234F' },
  { value: 'passport',        label: 'Passport',        hint: '1 letter and 7 digits' },
  { value: 'driving_license', label: 'Driving licence', hint: '8 to 20 letters or digits' },
]

// '234123412346' → '2341 2341 2346'. Grouped the way it is printed, because the
// admin is reading it back off a card held next to the screen.
const displayIdNumber = (type, number) =>
  type === 'aadhaar' ? number.replace(/(\d{4})(?=\d)/g, '$1 ') : number

const IdProof = ({ tenant, tenantId, onChange }) => {
  const savedType = tenant.id_proof_type || 'aadhaar'
  const savedNumber = tenant.id_proof_number ? displayIdNumber(savedType, tenant.id_proof_number) : ''
  const [type, setType] = useState(savedType)
  const [number, setNumber] = useState(savedNumber)
  const [busy, setBusy] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)

  const spec = ID_PROOF_TYPES.find(t => t.value === type) ?? ID_PROOF_TYPES[0]
  const cleaned = number.replace(/[\s-]/g, '')
  const wrongLength = type === 'aadhaar' && cleaned.length > 0 && cleaned.length !== 12
  const changed = type !== savedType || cleaned !== (tenant.id_proof_number || '')
  const typeLabel = spec.label

  const save = async () => {
    setBusy(true)
    try {
      const updated = await api.patch(`/tenants/${tenantId}`, { id_proof_type: type, id_proof_number: cleaned })
      onChange({ id_proof_type: updated.id_proof_type, id_proof_number: updated.id_proof_number })
      setNumber(updated.id_proof_number ? displayIdNumber(updated.id_proof_type, updated.id_proof_number) : '')
      toast.success('ID number saved')
    } catch (err) {
      // Carries the real reason — wrong length, failed checksum, bad PAN shape.
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  const clear = async () => {
    setBusy(true)
    try {
      await api.patch(`/tenants/${tenantId}`, { id_proof_number: '' })
      onChange({ id_proof_type: null, id_proof_number: null })
      setNumber('')
      setConfirmClear(false)
      toast.success('ID number removed')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="border-t border-border p-4 lg:px-5 flex flex-col gap-3.5">
      <h3 className="font-heading font-bold text-base">ID proof</h3>
      <div className="flex flex-col gap-3.5 lg:grid lg:grid-cols-[1fr_1.4fr] lg:gap-3 lg:items-start">
        <Field label="Type">
          <select value={type} onChange={e => setType(e.target.value)} className={inputCls()}>
            {ID_PROOF_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </Field>
        <Field
          label={`${typeLabel} number`}
          error={wrongLength ? `This has ${cleaned.length} digits. An Aadhaar number has 12.` : null}
          hint={tenant.id_proof_number ? 'Check it matches the card. It goes on the police form.' : spec.hint}
        >
          <input
            value={number}
            onChange={e => setNumber(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && cleaned && changed) save() }}
            inputMode={type === 'aadhaar' ? 'numeric' : 'text'}
            autoComplete="off"
            className={inputCls(wrongLength, 'tracking-wide tabular-nums text-lg')}
          />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="quiet" onClick={save} disabled={busy || !cleaned || !changed || wrongLength} className="flex-1 lg:flex-none">
          {busy ? 'Saving...' : 'Save ID number'}
        </Button>
        {tenant.id_proof_number && (
          <TextButton onClick={() => setConfirmClear(true)} disabled={busy}>Remove number</TextButton>
        )}
      </div>
      {confirmClear && (
        <ConfirmDialog
          title={`Remove the ID number for ${tenant.full_name}?`}
          confirmLabel="Yes, remove"
          busy={busy}
          onConfirm={clear}
          onCancel={() => setConfirmClear(false)}
        >
          The police verification form will have no ID number until you add it again.
        </ConfirmDialog>
      )}
    </section>
  )
}

// ── Documents ─────────────────────────────────────────────────────────────────
const Documents = ({ docs, onOpen }) => (
  <section className="border-t border-border p-4 lg:px-5 flex flex-col gap-3">
    <h3 className="font-heading font-bold text-base">Documents</h3>
    {docs.length === 0 ? (
      <p className="text-text-secondary">No documents uploaded.</p>
    ) : (
      <div className="grid grid-cols-2 gap-2.5">
        {docs.map(doc => (
          <button
            key={doc.id}
            type="button"
            onClick={() => onOpen(doc)}
            className="h-[110px] lg:h-[90px] border border-border rounded-lg bg-[repeating-linear-gradient(135deg,var(--color-bg)_0_8px,var(--color-surface)_8px_16px)] flex flex-col justify-end items-start p-2.5 text-left hover:border-text-primary"
          >
            <span className="text-sm font-medium bg-surface px-1 rounded">{docName(doc.doc_type)}</span>
            <span className="text-sm text-text-secondary bg-surface px-1 rounded">{dateLabel(doc.uploaded_at)}</span>
          </button>
        ))}
      </div>
    )}
  </section>
)

// ── Online access ─────────────────────────────────────────────────────────────
// Lets an admin hand a resident read-only access to their own record at /me.
//
// The one real hazard here is a typo: an email pointing at the wrong person
// gives a stranger this tenant's rent history and documents. Nothing can
// validate the address up front, so once the account signs in we show the
// Google display name it came back with — that is the check the admin makes.
const OnlineAccess = ({ tenant, tenantId, onChange }) => {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmRevoke, setConfirmRevoke] = useState(false)
  const first = firstName(tenant.full_name)

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
      toast.success(`${first} can now sign in`)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  const revoke = async () => {
    setBusy(true)
    try {
      await api.post(`/tenants/${tenantId}/revoke-portal`)
      onChange({ login_email: null, user_id: null, portal_user: null })
      setConfirmRevoke(false)
      toast.success('Online access removed')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="border-t border-border p-4 lg:px-5 flex flex-col gap-3">
      <h3 className="font-heading font-bold text-base">Online access</h3>

      {!invited && !claimed && (
        <>
          <p className="text-text-secondary -mt-1.5">
            Lets {first} sign in with Google and see their own rent and documents. They can't change anything.
          </p>
          <Field label={`${first}'s Google email`}>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') grant() }}
              autoComplete="off"
              className={inputCls()}
            />
          </Field>
          <Button onClick={grant} disabled={busy || !email.trim()}>{busy ? 'Saving...' : 'Give access'}</Button>
        </>
      )}

      {invited && !claimed && (
        <>
          <p><b className="font-semibold">{tenant.login_email}</b> can sign in. {first} hasn't signed in yet.</p>
          <Button variant="quiet" size="sm" className="self-start" onClick={() => setConfirmRevoke(true)} disabled={busy}>Remove access</Button>
        </>
      )}

      {claimed && (
        <>
          <p>
            Signed in as <b className="font-semibold">"{tenant.portal_user?.full_name || 'no name'}"</b>
            {' '}({tenant.portal_user?.email || tenant.login_email})
          </p>
          <Notice className="text-[15px]">Check this name is really {first}. If not, remove access.</Notice>
          <Button size="sm" className="self-start" onClick={() => setConfirmRevoke(true)} disabled={busy}>Remove access</Button>
        </>
      )}

      {confirmRevoke && (
        <ConfirmDialog
          title={`Remove online access for ${tenant.full_name}?`}
          confirmLabel="Yes, remove"
          busy={busy}
          onConfirm={revoke}
          onCancel={() => setConfirmRevoke(false)}
        >
          {first} won't be able to see their rent online any more. You can give access again later.
        </ConfirmDialog>
      )}
    </section>
  )
}

const MoreDetails = ({ tenant, tenantId, onChange, onOpenDoc }) => {
  const [open, setOpen] = useState(false)
  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full min-h-[60px] flex items-center gap-3 px-4 lg:px-5 py-2.5 bg-surface text-left"
      >
        <span className="flex-1 flex flex-col">
          <span className="font-heading font-bold text-lg">More details</span>
          <span className="text-[15px] text-text-secondary">ID proof, documents, online access</span>
        </span>
        <span className="flex items-center gap-1 font-heading font-semibold text-[15px]">
          {open ? 'Hide' : 'Show'}
          <ChevronDown size={20} aria-hidden="true" className={open ? 'rotate-180' : ''} />
        </span>
      </button>
      {open && (
        <>
          <IdProof tenant={tenant} tenantId={tenantId} onChange={onChange} />
          <Documents docs={tenant.tenant_documents ?? []} onOpen={onOpenDoc} />
          <OnlineAccess tenant={tenant} tenantId={tenantId} onChange={onChange} />
        </>
      )}
    </Card>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
const TenantDetail = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const { role } = useAuth()
  const [previewDoc, setPreviewDoc] = useState(null)
  const [payingId, setPayingId] = useState(null)
  const [confirmCheckout, setConfirmCheckout] = useState(false)
  const [checkingOut, setCheckingOut] = useState(false)

  // Usually already cached: the Tenants list and room cards prefetch this on
  // touch, so the record is in hand before the page has finished opening.
  const endpoint = `/tenants/${id}`
  const { data: tenant, isPending, isError, error } = useApiQuery(endpoint)

  // Every edit below lands in the cache on the response, so the screen updates
  // straight away. api.js then refetches this record behind it (any write to
  // /tenants or /rent busts '/tenants'), which corrects anything the patch got
  // wrong — e.g. totals the server recalculated.
  const patchTenant = (patch) =>
    setApiData(endpoint, prev => prev && { ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) })

  const checkout = async () => {
    setCheckingOut(true)
    try {
      const res = await api.post(`/tenants/${id}/checkout`)
      patchTenant({ status: 'vacated', check_out_date: todayISO() })
      setConfirmCheckout(false)
      toast.success(`${tenant.full_name} checked out`)
      // The remaining tenants' electricity is split from this reading, so
      // ask for it now rather than leave a gap in the next bill.
      if (res.requiresMeterReading) navigate(`/admin/meter-reading/${res.roomId}`)
    } catch (err) {
      toast.error(err.message || "Couldn't check out")
    } finally {
      setCheckingOut(false)
    }
  }

  const markPaid = async (paymentId) => {
    setPayingId(paymentId)
    try {
      await api.post(`/rent/${paymentId}/mark-paid`, {
        amount_paid: tenant.rent_payments.find(p => p.id === paymentId)?.total_amount
      })
      patchTenant(prev => ({
        rent_payments: prev.rent_payments.map(p => p.id === paymentId ? { ...p, status: 'paid', paid_date: todayISO() } : p)
      }))
      toast.success('Marked as paid')
    } catch (err) {
      toast.error(err.message || "Couldn't mark it paid")
    } finally {
      setPayingId(null)
    }
  }

  if (isPending) {
    return (
      <div>
        <TitleSkeleton />
        <PanelSkeleton count={3} />
      </div>
    )
  }
  // Checked on `tenant`, not isError: a failed background refresh sets isError
  // too, but keeps the cached record, and that should stay on screen.
  if (!tenant) {
    return (
      <Card className="p-6 text-center">
        {isError && error.status !== 404 ? `Couldn't load this tenant: ${error.message}` : 'No tenant with this record.'}
      </Card>
    )
  }

  // Rent, ID-proof numbers and document scans are admin-only. The API already
  // omits these fields for gatekeepers — the page shows the profile alone
  // rather than empty sections that look like missing data.
  const admin = isAdmin(role)
  const active = tenant.status === 'active'
  const first = firstName(tenant.full_name)
  const bills = (tenant.rent_payments ?? [])
    .slice()
    .sort((a, b) => String(b.billing_month).localeCompare(String(a.billing_month)))
  const [latest, ...older] = bills
  const room = tenant.rooms?.room_number

  const profile = (
    <Card>
      <CardTitle className="px-4 lg:px-5 pt-4 pb-2">Profile</CardTitle>
      <InfoRow label="Status">{active ? 'Living here' : 'Moved out'}</InfoRow>
      <InfoRow label="Checked in">{dateLabel(tenant.check_in_date)}</InfoRow>
      <InfoRow label="Checked out">{tenant.check_out_date ? dateLabel(tenant.check_out_date) : 'Not yet'}</InfoRow>
      <InfoRow label="AC">{tenant.ac_opted ? 'Yes' : 'No'}</InfoRow>
      <InfoRow label="Vehicle">{tenant.has_vehicle ? (tenant.vehicle_number || 'Yes') : 'No'}</InfoRow>
      <InfoRow label="Parent's mobile">{tenant.parent_contact || 'Not given'}</InfoRow>
      {admin && <InfoRow label="Home address">{tenant.address || 'Not given'}</InfoRow>}
      {admin && tenant.rooms?.seat_rent != null && <InfoRow label="Seat rent">{rupees(tenant.rooms.seat_rent)} a month</InfoRow>}
    </Card>
  )

  const checkoutBlock = (className) => admin && active && (
    <div className={className}>
      <Button onClick={() => setConfirmCheckout(true)}>
        <LogOut size={18} aria-hidden="true" />Check out {first}
      </Button>
      <p className="text-sm text-text-secondary text-center lg:text-left">Use this on the day {first} moves out.</p>
    </div>
  )

  return (
    <div className="flex flex-col gap-4 lg:gap-[18px]">
      {previewDoc && <DocPreviewModal doc={previewDoc} tenantId={id} onClose={() => setPreviewDoc(null)} />}
      {confirmCheckout && (
        <ConfirmDialog
          title={`Check out ${tenant.full_name}?`}
          confirmLabel="Yes, check out"
          busy={checkingOut}
          onConfirm={checkout}
          onCancel={() => setConfirmCheckout(false)}
        >
          {first} will be marked as moved out of Room {room}. Next you'll enter a new meter reading for the room.
        </ConfirmDialog>
      )}

      {/* Phones get this in the header bar instead. */}
      <Link
        to="/admin/tenants"
        className="hidden md:flex self-start h-11 items-center gap-1.5 pl-2 pr-3.5 border border-border rounded-lg bg-surface font-heading font-semibold text-[15px]"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
        Tenants
      </Link>

      <header className="flex flex-col gap-1 px-1 lg:flex-row lg:items-end lg:justify-between lg:gap-5">
        <div>
          <h1 className="font-heading font-bold text-[28px] lg:text-[34px] leading-tight">{tenant.full_name}</h1>
          <p className="text-[17px] lg:text-lg text-text-secondary">
            Room {room} · {tenant.ac_opted ? 'AC' : 'No AC'}
            <span className="hidden lg:inline"> · {tenant.phone_number}</span>
            {!active && <> · <StatusTag tone="muted">Moved out</StatusTag></>}
          </p>
        </div>
        <div className="flex items-center justify-between mt-2 lg:mt-0">
          <span className="text-lg font-medium lg:hidden">{tenant.phone_number}</span>
          {tenant.phone_number && (
            <a href={`tel:+91${tenant.phone_number}`} className="h-11 lg:h-12 px-[18px] lg:px-[22px] flex items-center border border-border rounded-lg bg-surface font-heading font-semibold text-base">
              Call
            </a>
          )}
        </div>
      </header>

      {admin ? (
        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-[18px] lg:items-start">
          <div className="flex flex-col gap-4 lg:gap-[18px]">
            {latest ? (
              <BillCard bill={latest} onMarkPaid={markPaid} busy={payingId === latest.id} />
            ) : (
              <Card className="px-4 py-[18px]">
                <CardTitle>No bills yet</CardTitle>
                <p className="text-text-secondary mt-1">The first one is made at the end of the month {first} moved in.</p>
              </Card>
            )}
            {latest && <RentHistory bills={older} onMarkPaid={markPaid} busyId={payingId} />}
            {checkoutBlock('hidden lg:flex items-center gap-3.5 pt-2')}
          </div>
          <div className="flex flex-col gap-4 lg:gap-[18px]">
            {profile}
            <MoreDetails tenant={tenant} tenantId={id} onChange={patchTenant} onOpenDoc={setPreviewDoc} />
          </div>
          {checkoutBlock('lg:hidden mt-7 pt-5 border-t border-border flex flex-col gap-2')}
        </div>
      ) : (
        profile
      )}
    </div>
  )
}

export default TenantDetail
