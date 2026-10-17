import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../../lib/api'
import { dateLabel, rupees, todayISO } from '../../lib/format'
import toast from 'react-hot-toast'
import { Loader2, Camera } from 'lucide-react'
import Skeleton from '../../components/Skeleton'
import { Card, Button, TextButton, Field, YesNo, ConfirmDialog, Notice, inputCls } from '../../components/ui'

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

// What is wrong with a mobile number, in words — or null if nothing is.
const mobileProblem = (v, required) => {
  if (!v) return required ? 'Enter a mobile number.' : null
  if (v.length !== 10) return `This has ${v.length} digit${v.length === 1 ? '' : 's'}. A mobile number needs 10.`
  if (!isMobile(v)) return 'A mobile number starts with 6, 7, 8 or 9.'
  return null
}

const STEPS = ['Room', 'Details', 'ID photo', 'Check']
const STEP_TITLES = ['Room', 'Tenant details', 'ID photo', 'Check and add']

const OnboardingWizard = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [step, setStep] = useState(1)
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [rooms, setRooms] = useState(null) // null until /rooms answers

  const [lastReading, setLastReading] = useState(null)
  const [loadingReading, setLoadingReading] = useState(false)

  // Errors show once a field has been left, or after Next was pressed — not
  // while the first digit is still being typed.
  const [touched, setTouched] = useState({})
  const [tried, setTried] = useState(false)
  const [confirmLower, setConfirmLower] = useState(false)

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
      .catch(() => { setRooms([]); toast.error("Couldn't load the rooms") })
  }, [])

  // Show the room's last meter reading so a typo is obvious before it becomes
  // the baseline every future bill is measured against.
  useEffect(() => {
    if (!state.roomId) { setLastReading(null); return }
    setLoadingReading(true)
    api.get(`/rooms/${state.roomId}/meter-readings`)
      .then(rows => setLastReading(rows?.[0] ?? null))
      .catch(() => setLastReading(null))
      .finally(() => setLoadingReading(false))
  }, [state.roomId])

  const room = rooms?.find(r => String(r.id) === String(state.roomId))
  const details = state.tenantDetails
  const setDetails = (patch) => setState(s => ({ ...s, tenantDetails: { ...s.tenantDetails, ...patch } }))
  const setOcr = (patch) => setState(s => ({ ...s, ocrFields: { ...s.ocrFields, ...patch } }))

  const goTo = (n) => { setTried(false); setStep(n); window.scrollTo({ top: 0 }) }
  const handleBack = () => goTo(step - 1)

  const errors = {
    full_name: details.full_name.trim() ? null : "Enter the tenant's name.",
    phone_number: mobileProblem(details.phone_number, true),
    parent_contact: mobileProblem(details.parent_contact, false),
  }
  const shown = (field) => (touched[field] || tried ? errors[field] : null)
  const touch = (field) => () => setTouched(t => ({ ...t, [field]: true }))

  const nextFromDetails = () => {
    if (Object.values(errors).some(Boolean)) { setTried(true); return }
    goTo(3)
  }

  // Step 3: Upload file to backend, get back real OCR fields
  const handleUploadAndExtract = async () => {
    if (!state.documentFile) return toast.error('Choose a photo of the ID card first')

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('document', state.documentFile)
      formData.append('doc_type', 'id_proof_front')

      // No tenant id yet during onboarding, so this goes to the dedicated
      // /documents/ocr endpoint.
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
      else toast.success('Card read. Check the details.')
      goTo(4)
    } catch (err) {
      toast.error("Couldn't read the card: " + err.message)
    } finally {
      setUploading(false)
    }
  }

  // The API rejects a check-in reading lower than the room's last one. Ask
  // here rather than letting the admin lose four steps of work to a 400.
  const readingGoesBackwards = Boolean(lastReading
    && state.meterReading !== ''
    && Number(state.meterReading) < lastReading.reading_value)

  const submit = async () => {
    setConfirmLower(false)
    setSubmitting(true)
    try {
      const tenantRes = await api.post('/tenants', {
        room_id: Number(state.roomId),
        // Recorded server-side BEFORE the tenant row is created, so the closing
        // period is billed to the existing occupants only.
        meter_reading: state.meterReading === '' ? undefined : Number(state.meterReading),
        ...(readingGoesBackwards ? { allow_lower: true } : {}),
        full_name: details.full_name,
        phone_number: details.phone_number,
        parent_contact: details.parent_contact || null,
        check_in_date: details.check_in_date,
        ac_opted: room?.has_ac ? details.ac_opted : false,
        has_vehicle: details.has_vehicle,
        vehicle_number: details.has_vehicle ? details.vehicle_number : '',
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

      toast.success(`${details.full_name} added to Room ${room?.room_number ?? ''}`)
      navigate('/admin')
    } catch (err) {
      toast.error("Couldn't add the tenant: " + err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const onConfirm = () => (readingGoesBackwards ? setConfirmLower(true) : submit())

  const footer = (back, next) => (
    <div className={`grid gap-2.5 ${back ? 'grid-cols-[1fr_1.6fr]' : 'grid-cols-1'}`}>
      {back && <Button variant="quiet" size="lg" onClick={handleBack}>Back</Button>}
      {next}
    </div>
  )

  return (
    <div className="flex flex-col gap-[18px] max-w-xl">
      {/* Its own header: a focused flow with one way out. */}
      <header className="sticky md:static top-0 z-30 -mx-4 md:mx-0 bg-surface md:bg-transparent border-b md:border-0 border-border pt-[env(safe-area-inset-top)] md:pt-0">
        <div className="h-[60px] md:h-auto flex items-center justify-between gap-3 pl-4 pr-3 md:px-1">
          <h1 className="font-heading font-bold text-lg md:text-[30px] leading-tight">
            {room ? `Add tenant to Room ${room.room_number}` : 'Add tenant'}
          </h1>
          <Button variant="quiet" size="sm" onClick={() => navigate('/admin')}>Cancel</Button>
        </div>
      </header>

      <div className="flex flex-col gap-2">
        <p className="font-heading font-semibold text-[15px]">Step {step} of 4: {STEP_TITLES[step - 1]}</p>
        <div className="grid grid-cols-4 gap-1.5" aria-hidden="true">
          {STEPS.map((_, i) => (
            <span key={i} className={`h-1.5 rounded-sm ${i < step ? 'bg-text-primary' : 'bg-border'}`} />
          ))}
        </div>
        <div className="grid grid-cols-4 gap-1.5 text-sm text-text-secondary" aria-hidden="true">
          {STEPS.map((label, i) => (
            <span key={label} className={i === step - 1 ? 'text-text-primary font-semibold' : ''}>{label}</span>
          ))}
        </div>
      </div>

      {/* Step 1 — Room */}
      {step === 1 && (
        <>
          <Card className="px-4 py-[18px] flex flex-col gap-[18px]">
            <Field label="Room">
              {rooms === null ? (
                <Skeleton className="h-[52px] w-full rounded-lg" />
              ) : (
                <select
                  value={state.roomId}
                  onChange={e => setState({ ...state, roomId: e.target.value })}
                  className={inputCls()}
                >
                  <option value="">Choose a room</option>
                  {rooms.map(r => {
                    const open = r.capacity - r.active_tenants_count
                    return (
                      <option key={r.id} value={r.id} disabled={open <= 0}>
                        Room {r.room_number}: {open <= 0 ? 'full' : `${open} seat${open > 1 ? 's' : ''} free`}
                      </option>
                    )
                  })}
                </select>
              )}
            </Field>

            {/* The room's last reading sits above the box, not as a hint under
                it, so it stays in view while typing and when the value is
                flagged. "No reading yet" while it is still loading would tell
                the admin this reading becomes the baseline when it won't. */}
            {state.roomId && (
              loadingReading ? (
                <Skeleton className="h-5 w-56" />
              ) : lastReading ? (
                <p>
                  Last reading for Room {room?.room_number}: <b className="font-semibold tabular-nums">{lastReading.reading_value}</b> on {dateLabel(lastReading.reading_date)}.
                </p>
              ) : (
                <p className="text-text-secondary">
                  No reading yet for Room {room?.room_number}. This one becomes the starting point.
                </p>
              )
            )}
            {state.roomId && (
              <Field
                label="Meter reading today"
                error={readingGoesBackwards ? `This is lower than the last reading (${lastReading.reading_value}). Check for a typo.` : null}
              >
                <input
                  inputMode="numeric"
                  value={state.meterReading}
                  onChange={e => setState({ ...state, meterReading: e.target.value.replace(/[^\d.]/g, '') })}
                  className={inputCls(readingGoesBackwards, 'tabular-nums')}
                />
              </Field>
            )}
            {state.roomId && (
              <p className="text-sm text-text-secondary -mt-2">
                This closes the electricity for the tenants already in the room, so the new
                tenant isn't charged for what was used before moving in.
              </p>
            )}
          </Card>
          {footer(false, (
            <Button variant="primary" onClick={() => goTo(2)} disabled={!state.roomId}>Next: Details</Button>
          ))}
        </>
      )}

      {/* Step 2 — Tenant Details */}
      {step === 2 && (
        <>
          <Card className="px-4 py-[18px] flex flex-col gap-[18px]">
            <Field label="Full name" hint="As written on the ID card" error={shown('full_name')}>
              <input
                value={details.full_name}
                onChange={e => setDetails({ full_name: e.target.value })}
                onBlur={touch('full_name')}
                autoComplete="off"
                className={inputCls(Boolean(shown('full_name')))}
              />
            </Field>
            {/* No maxLength: it would cut a pasted '+91 98765 43210' short
                before toMobileDigits could strip the prefix. */}
            <Field label="Mobile number" error={shown('phone_number')}>
              <input
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                value={details.phone_number}
                onChange={e => setDetails({ phone_number: toMobileDigits(e.target.value) })}
                onBlur={touch('phone_number')}
                className={inputCls(Boolean(shown('phone_number')))}
              />
            </Field>
            <Field label="Parent's mobile number" hint="Called in an emergency" error={shown('parent_contact')}>
              <input
                type="tel"
                inputMode="numeric"
                value={details.parent_contact}
                onChange={e => setDetails({ parent_contact: toMobileDigits(e.target.value) })}
                onBlur={touch('parent_contact')}
                className={inputCls(Boolean(shown('parent_contact')))}
              />
            </Field>
            <Field label="Move-in date">
              <input
                type="date"
                max={todayISO()}
                value={details.check_in_date}
                onChange={e => setDetails({ check_in_date: e.target.value })}
                className={inputCls()}
              />
            </Field>
            {room?.has_ac && (
              <YesNo
                label="Wants AC?"
                hint={Number(room.ac_charge) > 0 ? `Adds ${rupees(room.ac_charge)} a month` : null}
                value={details.ac_opted}
                onChange={v => setDetails({ ac_opted: v })}
              />
            )}
            <YesNo label="Has a vehicle?" value={details.has_vehicle} onChange={v => setDetails({ has_vehicle: v })} />
            {details.has_vehicle && (
              <Field label="Vehicle number">
                <input
                  value={details.vehicle_number}
                  onChange={e => setDetails({ vehicle_number: e.target.value.toUpperCase() })}
                  autoComplete="off"
                  className={inputCls(false, 'uppercase')}
                />
              </Field>
            )}
          </Card>
          {footer(true, <Button variant="primary" onClick={nextFromDetails}>Next: ID photo</Button>)}
        </>
      )}

      {/* Step 3 — ID photo + OCR */}
      {step === 3 && (
        <>
          <Card className="px-4 py-[18px] flex flex-col gap-3.5">
            <h2 className="font-heading font-bold text-lg">Photo of the ID card</h2>
            <p className="text-text-secondary -mt-1.5">
              Take a clear photo of the front of the Aadhaar or other ID. The name, number and
              address are read from it, and you can check them on the next step.
            </p>
            <label className="flex flex-col items-center justify-center gap-2 min-h-[150px] p-6 border-2 border-dashed border-border rounded-lg text-center cursor-pointer hover:border-text-primary">
              <Camera size={28} aria-hidden="true" className="text-text-secondary" />
              {state.documentFile ? (
                <>
                  <span className="font-semibold break-all">{state.documentFile.name}</span>
                  <span className="text-sm text-text-secondary underline underline-offset-4">Choose a different photo</span>
                </>
              ) : (
                <span className="font-heading font-semibold">Take or choose a photo</span>
              )}
              <input
                type="file"
                accept="image/*,application/pdf"
                className="sr-only"
                onChange={e => setState({ ...state, documentFile: e.target.files[0] || null })}
              />
            </label>
          </Card>
          {footer(true, (
            <Button variant="primary" onClick={handleUploadAndExtract} disabled={!state.documentFile || uploading}>
              {uploading ? <><Loader2 size={18} className="animate-spin" aria-hidden="true" /> Reading...</> : 'Read the card'}
            </Button>
          ))}
          <TextButton className="self-center" onClick={() => goTo(4)}>Skip, I'll type the details</TextButton>
        </>
      )}

      {/* Step 4 — Check */}
      {step === 4 && (
        <>
          <Card className="px-4 py-[18px] flex flex-col gap-[18px]">
            <p className="text-text-secondary">
              {state.documentFile
                ? 'These were read from the photo. Check each one against the card.'
                : 'Type these from the ID card. You can also add them later from the tenant page.'}
            </p>
            <Field label="Name on the card">
              <input value={state.ocrFields.name} onChange={e => setOcr({ name: e.target.value })} className={inputCls()} />
            </Field>
            {/* Aadhaar addresses run to three or four lines — a single-line
                input hid most of it, so nobody could check it. */}
            <Field label="Home address">
              <textarea
                rows={4}
                value={state.ocrFields.address}
                onChange={e => setOcr({ address: e.target.value })}
                className="w-full px-3 py-3 rounded-lg border border-border bg-bg text-[17px] resize-y focus:outline-2 focus:outline-text-primary focus:outline-offset-2"
              />
            </Field>
            <Field label="ID type">
              <select value={state.idProofType} onChange={e => setState({ ...state, idProofType: e.target.value })} className={inputCls()}>
                <option value="aadhaar">Aadhaar</option>
                <option value="pan">PAN</option>
                <option value="passport">Passport</option>
                <option value="driving_license">Driving licence</option>
              </select>
            </Field>
            {/* OCR misreads digits on creased cards, and the API rejects an
                Aadhaar that fails its checksum. Say so here rather than
                letting the admin find out at the last click. */}
            <Field
              label="ID number"
              hint={state.ocrFields.id_number.trim()
                ? 'Check every digit. A wrong one is refused when you add the tenant.'
                : 'Leave empty if the card is unreadable. You can add it later.'}
            >
              <input
                value={state.ocrFields.id_number}
                onChange={e => setOcr({ id_number: e.target.value })}
                inputMode={state.idProofType === 'aadhaar' ? 'numeric' : 'text'}
                className={inputCls(false, 'tracking-wide tabular-nums')}
              />
            </Field>
            <Field label="Date of birth">
              <input value={state.ocrFields.dob} onChange={e => setOcr({ dob: e.target.value })} className={inputCls()} />
            </Field>
          </Card>
          {readingGoesBackwards && (
            <Notice className="px-1">
              The meter reading is lower than the room's last one. You'll be asked about it.
            </Notice>
          )}
          {footer(true, (
            <Button variant="primary" onClick={onConfirm} disabled={submitting}>
              {submitting
                ? <><Loader2 size={18} className="animate-spin" aria-hidden="true" /> Adding...</>
                : `Add ${details.full_name.split(' ')[0] || 'tenant'}`}
            </Button>
          ))}
        </>
      )}

      {confirmLower && (
        <ConfirmDialog
          title="The meter reading is lower than the last one"
          confirmLabel="Yes, add anyway"
          onConfirm={submit}
          onCancel={() => setConfirmLower(false)}
        >
          You entered {state.meterReading}. The last reading was {lastReading.reading_value} on{' '}
          {dateLabel(lastReading.reading_date)}. That stretch will be left out of the electricity
          bills. Only go ahead if the meter was reset or replaced.
        </ConfirmDialog>
      )}
    </div>
  )
}

export default OnboardingWizard
