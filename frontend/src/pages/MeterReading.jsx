import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useApiQuery } from '../lib/queries'
import { dateLabel, todayISO } from '../lib/format'
import toast from 'react-hot-toast'
import { Loader2 } from 'lucide-react'
import Skeleton from '../components/Skeleton'
import { Card, Button, Field, PageTitle, ConfirmDialog, inputCls } from '../components/ui'

const MeterReading = () => {
  const { roomId } = useParams()
  const navigate = useNavigate()
  const [saving, setSaving] = useState(false)
  const [reading, setReading] = useState('')
  const [date, setDate] = useState(todayISO)
  const [previous, setPrevious] = useState(null)
  const [loadingPrev, setLoadingPrev] = useState(true)
  const [confirmLower, setConfirmLower] = useState(false)

  // The URL carries the room's id; people know it by its number.
  const { data: rooms } = useApiQuery('/rooms')
  const roomNo = rooms?.find(r => String(r.id) === String(roomId))?.room_number

  // Show the last reading. Entering a value lower than this is the one mistake
  // that corrupts a bill silently — the split skips any period that runs
  // backwards — so put the number in front of the admin before they type.
  useEffect(() => {
    api.get(`/rooms/${roomId}/meter-readings`)
      .then(rows => setPrevious(rows?.[0] ?? null))
      .catch(() => { /* non-fatal: the form still works without it */ })
      .finally(() => setLoadingPrev(false))
  }, [roomId])

  const value = Number(reading)
  const goesBackwards = Boolean(previous && reading !== '' && value < previous.reading_value)
  const unitsUsed = previous && reading !== '' && !goesBackwards
    ? value - previous.reading_value
    : null

  const save = async () => {
    setConfirmLower(false)
    setSaving(true)
    try {
      await api.post(`/rooms/${roomId}/meter-readings`, {
        reading_date: date,
        reading_value: value,
        triggered_by: 'routine',
        // The API rejects a backwards reading by default. Only override it
        // once the admin has confirmed the meter really was reset or replaced.
        ...(goesBackwards ? { allow_lower: true } : {})
      })
      toast.success('Meter reading saved')
      navigate(-1)
    } catch (err) {
      toast.error(err.message || "Couldn't save the reading")
    } finally {
      setSaving(false)
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (reading === '' || Number.isNaN(value) || value < 0) return toast.error('Enter the number on the meter')
    if (goesBackwards) return setConfirmLower(true)
    save()
  }

  return (
    <div className="flex flex-col gap-3.5 max-w-xl">
      <PageTitle>Meter reading{roomNo && `, Room ${roomNo}`}</PageTitle>

      <Card className="px-4 py-[18px]">
        <form onSubmit={handleSubmit} className="flex flex-col gap-[18px]">
          {/* Hold the line's place while the last reading loads — it is the
              number the admin checks before typing, so it must not pop in
              under them. */}
          {loadingPrev ? (
            <Skeleton className="h-5 w-56" />
          ) : previous ? (
            <p>Last reading was <b className="font-semibold">{previous.reading_value}</b> on {dateLabel(previous.reading_date)}.</p>
          ) : (
            <p className="text-text-secondary">
              No reading yet for this room. This one becomes the starting point, and
              electricity is charged from the next reading on.
            </p>
          )}

          <Field label="Date">
            <input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} className={inputCls()} />
          </Field>

          <Field
            label="Number on the meter"
            error={goesBackwards ? `This is lower than the last reading (${previous.reading_value}). Check for a typo.` : null}
            hint={unitsUsed !== null ? `${unitsUsed} unit${unitsUsed === 1 ? '' : 's'} used since the last reading.` : null}
          >
            <input
              inputMode="decimal"
              value={reading}
              onChange={(e) => setReading(e.target.value.replace(/[^\d.]/g, ''))}
              className={inputCls(goesBackwards, 'tabular-nums')}
            />
          </Field>

          <Button type="submit" variant="primary" disabled={saving || reading === ''}>
            {saving ? <><Loader2 size={18} className="animate-spin" aria-hidden="true" /> Saving...</> : 'Save reading'}
          </Button>
        </form>
      </Card>

      {confirmLower && (
        <ConfirmDialog
          title="This reading is lower than the last one"
          confirmLabel="Yes, save it"
          onConfirm={save}
          onCancel={() => setConfirmLower(false)}
        >
          You entered {value}. The last reading was {previous.reading_value} on {dateLabel(previous.reading_date)}.
          That stretch will be left out of the electricity bills. Only save it if the meter was reset or replaced.
        </ConfirmDialog>
      )}
    </div>
  )
}

export default MeterReading
