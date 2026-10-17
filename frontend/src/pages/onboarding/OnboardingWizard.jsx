import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../../lib/api'
import { dateLabel, todayISO } from '../../lib/format'
import toast from 'react-hot-toast'
import { Loader2, UploadCloud, CheckCircle } from 'lucide-react'

// Indian mobile: 10 digits starting 6-9. Matches normalizePhone on the API.
const isMobile = (v) => /^[6-9]\d{9}$/.test(v)

// Keep the field to bare digits as they type or paste, dropping a +91 / 0
// prefix, so what they see is exactly what gets saved.
const toMobileDigits = (raw) => {
  let d = raw.replace(/\D/g, '')
  if (d.length > 10 && d.startsWith('91')) d = d.slice(2)
  else if (d.length > 10 && d.startsWith('0')) d = d.slice(1)
  return d.slice(0, 10)
}

const OnboardingWizard = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [step, setStep] = useState(1)
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [rooms, setRooms] = useState([])

  const [lastReading, setLastReading] = useState(null)

  const [state, setState] = useState({
    roomId: searchParams.get('room') || '',
    meterReading: '',
    tenantDetails: {
      full_name: '',
      phone_number: '',
      parent_contact: '',
      check_in_date: todayISO(),
      ac_opted: false,
      has_vehicle: false,
      vehicle_number: ''
    },
    documentFile: null,
    uploadedDocId: null,
    idProofType: 'aadhaar',
    ocrFields: { name: '', address: '', id_number: '', dob: '' }
  })

  useEffect(() => {
    api.get('/rooms')
      .then(res => setRooms(res))
      .catch(() => toast.error('Failed to load rooms'))
  }, [])

  // Show the room's last meter reading so a typo is obvious before it becomes
  // the baseline every future bill is measured against.
  useEffect(() => {
    if (!state.roomId) { setLastReading(null); return }
    api.get(`/rooms/${state.roomId}/meter-readings`)
      .then(rows => setLastReading(rows?.[0] ?? null))
      .catch(() => setLastReading(null))
  }, [state.roomId])

  const handleNext = () => setStep(s => s + 1)
  const handleBack = () => setStep(s => s - 1)

  // Step 3: Upload file to backend, get back real OCR fields
  const handleUploadAndExtract = async () => {
    if (!state.documentFile) return toast.error('Please select a file')

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('document', state.documentFile)
      formData.append('doc_type', 'id_proof_front')

      // We upload to a temp tenant ID or use a separate /ocr endpoint
      // For onboarding (no tenant id yet), call a dedicated /documents/ocr endpoint
      const res = await api.post('/documents/ocr', formData)

      setState(prev => ({
        ...prev,
        uploadedDocId: res.document?.id || null,
        ocrFields: {
          name: res.ocrFields?.name || '',
          address: res.ocrFields?.address || '',
          id_number: res.ocrFields?.id_number || '',
          dob: res.ocrFields?.dob || ''
        }
      }))

      // A failed read still moves on — the admin can type the fields by hand.
      if (res.error) toast.error(`${res.error} You can type the details in by hand.`, { duration: 6000 })
      else toast.success('Document scanned! Review the extracted fields.')
      handleNext()
    } catch (err) {
      toast.error('Upload or OCR failed: ' + err.message)
    } finally {
      setUploading(false)
    }
  }

  const submit = async () => {
    // The API rejects a check-in reading lower than the room's last one. Confirm
    // here rather than letting the admin lose four steps of work to a 400.
    const readingGoesBackwards = lastReading
      && state.meterReading !== ''
      && Number(state.meterReading) < lastReading.reading_value

    if (readingGoesBackwards && !window.confirm(
      `The meter reading (${state.meterReading}) is lower than this room's last reading ` +
      `(${lastReading.reading_value} on ${dateLabel(lastReading.reading_date)}).\n\n` +
      `That period will be skipped when bills are generated. Only continue if the meter ` +
      `was actually reset or replaced.\n\nOnboard anyway?`
    )) return

    setSubmitting(true)
    try {
      const tenantRes = await api.post('/tenants', {
        room_id: Number(state.roomId),
        // Recorded server-side BEFORE the tenant row is created, so the closing
        // period is billed to the existing occupants only.
        meter_reading: state.meterReading === '' ? undefined : Number(state.meterReading),
        ...(readingGoesBackwards ? { allow_lower: true } : {}),
        full_name: state.tenantDetails.full_name,
        phone_number: state.tenantDetails.phone_number,
        parent_contact: state.tenantDetails.parent_contact || null,
        check_in_date: state.tenantDetails.check_in_date,
        ac_opted: state.tenantDetails.ac_opted,
        has_vehicle: state.tenantDetails.has_vehicle,
        vehicle_number: state.tenantDetails.vehicle_number,
        address: state.ocrFields.address,
        id_proof_type: state.idProofType,
        id_proof_number: state.ocrFields.id_number,
      })

      if (state.documentFile) {
        const formData = new FormData()
        formData.append('document', state.documentFile)
        formData.append('doc_type', 'id_proof_front')
        await api.post(`/tenants/${tenantRes.id}/documents`, formData)
      }

      toast.success('Tenant onboarded successfully!')
      navigate('/admin')
    } catch (err) {
      toast.error('Failed to onboard: ' + err.message)
    } finally {
      setSubmitting(false)
    }
  }

  // Explains why Next is disabled. No maxLength on the inputs: it would cut a
  // pasted '+91 98765 43210' short before toMobileDigits could strip the prefix.
  const { phone_number, parent_contact } = state.tenantDetails
  const phoneInvalid = phone_number !== '' && !isMobile(phone_number)
  const parentInvalid = parent_contact !== '' && !isMobile(parent_contact)

  const inputCls = 'w-full px-4 py-3 rounded-md border border-border bg-bg text-text-primary focus:outline-none focus:border-accent transition-colors'
  const btnPrimary = 'w-full bg-accent text-surface py-3 rounded-md font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2'
  const btnSecondary = 'w-full border border-border py-3 rounded-md font-semibold hover:bg-bg transition-colors'

  return (
    <div className="max-w-2xl mx-auto">
      <header className="mb-8">
        <h1 className="text-3xl font-heading font-bold text-text-primary">Onboard Tenant</h1>
        <p className="text-text-secondary mt-1">Step {step} of 4</p>
        <div className="flex gap-2 mt-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className={`h-2 flex-1 rounded-full transition-colors ${i <= step ? 'bg-accent' : 'bg-border'}`} />
          ))}
        </div>
      </header>

      <div className="bg-surface border border-border rounded-xl shadow-sm p-6">

        {/* Step 1 — Room Selection */}
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-xl font-heading font-bold">Select Room</h2>
            <select
              value={state.roomId}
              onChange={e => setState({ ...state, roomId: e.target.value })}
              className={inputCls}
            >
              <option value="">Choose a room...</option>
              {rooms.map(room => {
                const available = room.capacity - room.active_tenants_count
                const isFull = available <= 0
                return (
                  <option key={room.id} value={room.id} disabled={isFull}>
                    Room {room.room_number} — {isFull ? 'Full' : `${available} seat${available > 1 ? 's' : ''} open`}
                  </option>
                )
              })}
            </select>
            {state.roomId && (
              <div className="pt-2 space-y-2">
                <label className="block text-sm font-medium text-text-primary">
                  Current Meter Reading
                </label>
                <input
                  type="number"
                  min="0"
                  placeholder="e.g. 14502"
                  className={inputCls}
                  value={state.meterReading}
                  onChange={e => setState({ ...state, meterReading: e.target.value })}
                />
                {lastReading ? (
                  <p className="text-xs text-text-secondary">
                    Last recorded: <span className="font-semibold text-text-primary">{lastReading.reading_value}</span>
                    {' '}on {dateLabel(lastReading.reading_date)}
                  </p>
                ) : (
                  <p className="text-xs text-text-secondary">
                    No reading recorded for this room yet — this becomes the opening baseline.
                  </p>
                )}
                {lastReading && state.meterReading !== '' && Number(state.meterReading) < lastReading.reading_value && (
                  <p className="text-xs text-warning">
                    Lower than the last reading ({lastReading.reading_value}) — check for a typo.
                  </p>
                )}
                <p className="text-xs text-text-secondary">
                  Recorded against the tenants already in this room, closing their period before
                  the new tenant starts sharing the bill. Skipping it means the incoming tenant
                  is charged for electricity used before they moved in.
                </p>
              </div>
            )}
            <button onClick={handleNext} disabled={!state.roomId} className={btnPrimary}>Next</button>
          </div>
        )}

        {/* Step 2 — Tenant Details */}
        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-xl font-heading font-bold">Tenant Details</h2>
            <input
              placeholder="Full Name *"
              className={inputCls}
              value={state.tenantDetails.full_name}
              onChange={e => setState({ ...state, tenantDetails: { ...state.tenantDetails, full_name: e.target.value } })}
            />
            <div>
              <input
                placeholder="Phone Number *"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                className={inputCls}
                value={state.tenantDetails.phone_number}
                onChange={e => setState({ ...state, tenantDetails: { ...state.tenantDetails, phone_number: toMobileDigits(e.target.value) } })}
              />
              {phoneInvalid && (
                <p className="text-xs text-warning mt-1">Enter a 10-digit mobile number starting with 6, 7, 8 or 9.</p>
              )}
            </div>
            <div>
              <input
                placeholder="Parent's Contact Number"
                type="tel"
                inputMode="numeric"
                className={inputCls}
                value={state.tenantDetails.parent_contact}
                onChange={e => setState({ ...state, tenantDetails: { ...state.tenantDetails, parent_contact: toMobileDigits(e.target.value) } })}
              />
              {parentInvalid && (
                <p className="text-xs text-warning mt-1">Enter a 10-digit mobile number, or leave it blank.</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Move-in Date</label>
              <input
                type="date"
                max={todayISO()}
                className={inputCls}
                value={state.tenantDetails.check_in_date}
                onChange={e => setState({ ...state, tenantDetails: { ...state.tenantDetails, check_in_date: e.target.value } })}
              />
            </div>
            <div className="flex items-center gap-3">
              <input type="checkbox" id="ac" checked={state.tenantDetails.ac_opted} onChange={e => setState({ ...state, tenantDetails: { ...state.tenantDetails, ac_opted: e.target.checked } })} className="w-4 h-4" />
              <label htmlFor="ac" className="text-text-primary">AC opted</label>
            </div>
            <div className="flex items-center gap-3">
              <input type="checkbox" id="vehicle" checked={state.tenantDetails.has_vehicle} onChange={e => setState({ ...state, tenantDetails: { ...state.tenantDetails, has_vehicle: e.target.checked } })} className="w-4 h-4" />
              <label htmlFor="vehicle" className="text-text-primary">Has vehicle</label>
            </div>
            {state.tenantDetails.has_vehicle && (
              <input placeholder="Vehicle Number" className={inputCls} value={state.tenantDetails.vehicle_number} onChange={e => setState({ ...state, tenantDetails: { ...state.tenantDetails, vehicle_number: e.target.value } })} />
            )}
            <div className="flex gap-4 pt-2">
              <button onClick={handleBack} className={btnSecondary}>Back</button>
              <button onClick={handleNext} disabled={!state.tenantDetails.full_name.trim() || !isMobile(state.tenantDetails.phone_number) || parentInvalid} className={btnPrimary}>Next</button>
            </div>
          </div>
        )}

        {/* Step 3 — Document Upload + OCR */}
        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-xl font-heading font-bold">Upload Aadhaar / ID Proof</h2>
            <p className="text-text-secondary text-sm">Upload a clear photo or PDF. Text will be extracted automatically.</p>

            <label className="block border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-accent transition-colors">
              <UploadCloud size={32} className="mx-auto mb-2 text-text-secondary" />
              <p className="text-text-secondary text-sm">
                {state.documentFile ? (
                  <span className="flex items-center justify-center gap-2 text-success">
                    <CheckCircle size={16} /> {state.documentFile.name}
                  </span>
                ) : 'Click to choose a file (JPG, PNG, PDF)'}
              </p>
              <input
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={e => setState({ ...state, documentFile: e.target.files[0] || null })}
              />
            </label>

            <div className="flex gap-4 pt-2">
              <button onClick={handleBack} className={btnSecondary}>Back</button>
              <button
                onClick={handleUploadAndExtract}
                disabled={!state.documentFile || uploading}
                className={btnPrimary}
              >
                {uploading ? <><Loader2 size={18} className="animate-spin" /> Extracting...</> : 'Upload & Extract'}
              </button>
            </div>
          </div>
        )}

        {/* Step 4 — Review OCR Data */}
        {step === 4 && (
          <div className="space-y-4">
            <h2 className="text-xl font-heading font-bold">Review Extracted Data</h2>
            <p className="text-text-secondary text-sm">Fields are pre-filled from the document. Correct any errors before confirming.</p>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Name (from document)</label>
              <input className={inputCls} value={state.ocrFields.name} onChange={e => setState({ ...state, ocrFields: { ...state.ocrFields, name: e.target.value } })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Address</label>
              {/* Aadhaar addresses run to three or four lines — a single-line
                  input hid most of it, so nobody could check it. */}
              <textarea
                rows={4}
                className={`${inputCls} resize-y`}
                value={state.ocrFields.address}
                onChange={e => setState({ ...state, ocrFields: { ...state.ocrFields, address: e.target.value } })}
              />
            </div>
            <div className="grid sm:grid-cols-[10rem_1fr] gap-4">
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">Document type</label>
                <select
                  className={inputCls}
                  value={state.idProofType}
                  onChange={e => setState({ ...state, idProofType: e.target.value })}
                >
                  <option value="aadhaar">Aadhaar</option>
                  <option value="pan">PAN</option>
                  <option value="passport">Passport</option>
                  <option value="driving_license">Driving Licence</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">ID Number</label>
                <input className={inputCls} value={state.ocrFields.id_number} onChange={e => setState({ ...state, ocrFields: { ...state.ocrFields, id_number: e.target.value } })} />
                {/* OCR misreads digits on creased cards, and the API rejects an
                    Aadhaar that fails its checksum. Say so here rather than
                    letting the admin find out at the last click. */}
                <p className="text-xs text-text-secondary mt-1">
                  {state.ocrFields.id_number.trim()
                    ? 'Check every digit against the card — a wrong one is rejected on save.'
                    : 'Leave blank if the scan is unreadable. You can add it later from the tenant page.'}
                </p>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Date of Birth</label>
              <input className={inputCls} value={state.ocrFields.dob} onChange={e => setState({ ...state, ocrFields: { ...state.ocrFields, dob: e.target.value } })} />
            </div>

            <div className="flex gap-4 pt-2">
              <button onClick={handleBack} className={btnSecondary}>Back</button>
              <button onClick={submit} disabled={submitting} className={`${btnPrimary} bg-success`}>
                {submitting ? <><Loader2 size={18} className="animate-spin" /> Saving...</> : 'Confirm & Onboard'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default OnboardingWizard
