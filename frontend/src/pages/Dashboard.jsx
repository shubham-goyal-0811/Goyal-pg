import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import RoomCard from '../components/RoomCard'
import { HeaderSkeleton, CardGridSkeleton } from '../components/Skeleton'
import toast from 'react-hot-toast'
import { Loader2, Receipt, AlertTriangle } from 'lucide-react'

// Default to the month just finished — bills are generated after a month
// closes, once its final meter readings are in.
const lastMonth = () => {
  const now = new Date()
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const GenerateBills = ({ onDone }) => {
  const [month, setMonth] = useState(lastMonth)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState(null)

  const run = async () => {
    setRunning(true)
    setResult(null)
    try {
      const res = await api.post('/rent/generate', { billing_month: month })
      setResult(res)
      if (res.generated > 0) toast.success(`Generated ${res.generated} bill${res.generated === 1 ? '' : 's'}`)
      else toast('Nothing to generate for this month')
      onDone?.()
    } catch (err) {
      toast.error(err.message || 'Failed to generate bills')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="bg-surface border border-border rounded-xl shadow-sm p-5 mb-8">
      <div className="flex flex-col sm:flex-row sm:items-end gap-4">
        <div className="flex-1">
          <label className="block text-sm font-medium text-text-primary mb-2">
            Generate monthly bills
          </label>
          <input
            type="month"
            value={month}
            onChange={e => setMonth(e.target.value)}
            className="w-full sm:w-56 px-4 py-3 rounded-md border border-border bg-bg text-text-primary focus:outline-none focus:border-accent transition-colors"
          />
        </div>
        <button
          onClick={run}
          disabled={running || !month}
          className="bg-accent text-surface px-5 py-3 rounded-md font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {running
            ? <><Loader2 size={18} className="animate-spin" /> Generating...</>
            : <><Receipt size={18} /> Generate Bills</>}
        </button>
      </div>

      <p className="text-xs text-text-secondary mt-3">
        Bills every active tenant for the selected month. Safe to re-run — figures are
        recalculated, and months already marked paid are left alone.
      </p>

      {result && (
        <div className="mt-4 pt-4 border-t border-border space-y-3 text-sm">
          <p className="text-text-primary">
            <span className="font-semibold">{result.generated}</span> bill(s) generated
            {result.skipped?.length > 0 && (
              <span className="text-text-secondary">
                {' '}• {result.skipped.length} skipped (already paid)
              </span>
            )}
          </p>

          {result.warnings?.length > 0 && (
            <div className="rounded-md bg-warning/10 border border-warning/30 p-3 space-y-2">
              <p className="flex items-center gap-2 font-semibold text-warning">
                <AlertTriangle size={16} />
                No electricity charge applied for {result.warnings.length} room(s)
              </p>
              {result.warnings.map(w => (
                <div key={w.room_id} className="text-text-secondary">
                  <span className="font-medium text-text-primary">
                    {w.affected_tenants?.join(', ') || `Room ${w.room_id}`}
                  </span>
                  {' — '}{w.message}
                </div>
              ))}
              <p className="text-xs text-text-secondary">
                These bills contain rent and AC only. Record the missing readings, then
                re-run this month to correct them.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const Dashboard = () => {
  const { role } = useAuth()
  const [rooms, setRooms] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchRooms()
  }, [])

  const fetchRooms = async () => {
    try {
      const res = await api.get('/rooms')
      setRooms(res)
    } catch (err) {
      toast.error('Failed to load rooms')
    } finally {
      setLoading(false)
    }
  }

  // Room cards in the same grid the real ones land in, so the page doesn't
  // reflow when they arrive.
  if (loading) {
    return (
      <div>
        <HeaderSkeleton />
        <CardGridSkeleton count={6} lines={3} />
      </div>
    )
  }

  return (
    <div>
      <header className="mb-8">
        <h1 className="text-3xl font-heading font-bold text-text-primary">Dashboard</h1>
        <p className="text-text-secondary mt-1">Room occupancy and rent status</p>
      </header>

      {/* Rent generation is admin-only, matching POST /rent/generate. */}
      {role === 'admin' && <GenerateBills onDone={fetchRooms} />}

      {rooms.length === 0 ? (
        <p className="text-text-secondary text-center py-16">No rooms found. Check your backend connection.</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {rooms.map(room => (
            <RoomCard key={room.id} room={room} />
          ))}
        </div>
      )}
    </div>
  )
}

export default Dashboard
