import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { dateLabel, todayISO } from '../lib/format'
import toast from 'react-hot-toast'
import { Loader2 } from 'lucide-react'
import Skeleton from '../components/Skeleton'

const MeterReading = () => {
  const { roomId } = useParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [reading, setReading] = useState('')
  const [date, setDate] = useState(todayISO)
  const [previous, setPrevious] = useState(null)
  const [loadingPrev, setLoadingPrev] = useState(true)

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
  const goesBackwards = previous && reading !== '' && value < previous.reading_value
  const unitsUsed = previous && reading !== '' && !goesBackwards
    ? value - previous.reading_value
    : null

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (reading === '') return toast.error('Please enter a reading value')
    if (isNaN(value) || value < 0) return toast.error('Reading must be a non-negative number')

    if (goesBackwards && !window.confirm(
      `This reading (${value}) is lower than the last one (${previous.reading_value} on ${dateLabel(previous.reading_date)}).\n\n` +
      `That period will be skipped when bills are generated. Only continue if the meter was actually reset or replaced.\n\nSave anyway?`
    )) return

    setLoading(true)
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
      toast.error(err.message || 'Failed to save reading')
    } finally {
      setLoading(false)
    }
  }

  const inputCls = 'w-full px-4 py-3 rounded-md border border-border bg-bg text-text-primary focus:outline-none focus:border-accent transition-colors'

  return (
    <div className="max-w-xl mx-auto">
      <header className="mb-8">
        <h1 className="text-3xl font-heading font-bold text-text-primary">Meter Reading</h1>
        <p className="text-text-secondary mt-1">Record electricity usage for Room {roomId}</p>
      </header>

      <div className="bg-surface border border-border rounded-xl p-6 shadow-sm">
        {/* Hold the box's place while the last reading loads — it is the number
            the admin checks before typing, so it must not pop in under them. */}
        {loadingPrev ? (
          <div className="mb-6 p-4 rounded-md bg-bg border border-border">
            <Skeleton className="h-5 w-56" />
          </div>
        ) : (
          <div className="mb-6 p-4 rounded-md bg-bg border border-border">
            {previous ? (
              <p className="text-sm text-text-secondary">
                Last reading:{' '}
                <span className="font-semibold text-text-primary">{previous.reading_value}</span>
                {' '}on {dateLabel(previous.reading_date)}
              </p>
            ) : (
              <p className="text-sm text-text-secondary">
                No previous reading for this room — this becomes the opening baseline.
                Electricity can only be billed from the second reading onward.
              </p>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">Reading Date</label>
            <input
              type="date"
              value={date}
              max={todayISO()}
              onChange={(e) => setDate(e.target.value)}
              className={inputCls}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">Meter Value (Units)</label>
            <input
              type="number"
              min="0"
              value={reading}
              onChange={(e) => setReading(e.target.value)}
              placeholder="e.g. 14502"
              className={inputCls}
            />
            {goesBackwards && (
              <p className="text-warning text-sm mt-2">
                Lower than the last reading ({previous.reading_value}). Check for a typo —
                that period gets skipped when bills are generated.
              </p>
            )}
            {unitsUsed !== null && (
              <p className="text-text-secondary text-sm mt-2">
                {unitsUsed} unit{unitsUsed === 1 ? '' : 's'} used since the last reading.
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-accent text-surface px-4 py-3 rounded-md font-semibold hover:opacity-90 transition-opacity h-[44px] disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <><Loader2 size={18} className="animate-spin" /> Saving...</> : 'Save Reading'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default MeterReading
