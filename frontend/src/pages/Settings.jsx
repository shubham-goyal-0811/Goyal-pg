import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import toast from 'react-hot-toast'
import { Save } from 'lucide-react'
import { HeaderSkeleton, PanelSkeleton } from '../components/Skeleton'

const Settings = () => {
  const { role } = useAuth()
  const [settings, setSettings] = useState(null)
  const [rooms, setRooms] = useState([])
  const [roomEdits, setRoomEdits] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingRooms, setSavingRooms] = useState(false)

  useEffect(() => {
    Promise.all([
      api.get('/settings'),
      api.get('/rooms')
    ])
      .then(([settingsRes, roomsRes]) => {
        setSettings(settingsRes)
        setRooms(roomsRes)
        // seed roomEdits with current values
        const edits = {}
        roomsRes.forEach(r => {
          edits[r.id] = { seat_rent: r.seat_rent, ac_charge: r.ac_charge, capacity: r.capacity, has_ac: r.has_ac }
        })
        setRoomEdits(edits)
      })
      .catch(() => toast.error('Failed to load settings'))
      .finally(() => setLoading(false))
  }, [])

  const handleSettingsChange = (e) => {
    setSettings(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleRoomEdit = (roomId, field, value) => {
    setRoomEdits(prev => ({
      ...prev,
      [roomId]: { ...prev[roomId], [field]: value }
    }))
  }

  const handleSubmitSettings = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await api.patch('/settings', {
        electricity_rate_per_unit: Number(settings.electricity_rate_per_unit),
        total_parking_spots: Number(settings.total_parking_spots)
      })
      toast.success('Settings updated')
    } catch (err) {
      toast.error('Failed to update settings')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveRooms = async () => {
    setSavingRooms(true)
    try {
      await Promise.all(
        rooms.map(room =>
          api.patch(`/rooms/${room.id}`, {
            capacity: Number(roomEdits[room.id].capacity),
            seat_rent: Number(roomEdits[room.id].seat_rent),
            ac_charge: Number(roomEdits[room.id].ac_charge),
            has_ac: roomEdits[room.id].has_ac,
          })
        )
      )
      toast.success('Room configurations saved')
    } catch (err) {
      toast.error('Failed to save room changes')
    } finally {
      setSavingRooms(false)
    }
  }

  const inputCls = 'w-full px-4 py-3 rounded-md border border-border bg-bg text-text-primary focus:outline-none focus:border-accent transition-colors'

  if (loading) return <div><HeaderSkeleton /><PanelSkeleton count={3} /></div>

  return (
    <div className="max-w-3xl mx-auto">
      <header className="mb-8">
        <h1 className="text-3xl font-heading font-bold text-text-primary">Settings</h1>
        <p className="text-text-secondary mt-1">Configure property-wide variables</p>
      </header>

      {role !== 'admin' && (
        <div className="bg-warning/10 text-warning px-4 py-3 rounded-md mb-6 border border-warning/20">
          You have view-only access to settings.
        </div>
      )}

      {/* Global Settings */}
      <div className="bg-surface border border-border rounded-xl p-6 shadow-sm">
        <form onSubmit={handleSubmitSettings} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">
              Electricity Rate (₹ per unit)
            </label>
            <input
              type="number"
              step="0.1"
              name="electricity_rate_per_unit"
              value={settings?.electricity_rate_per_unit ?? ''}
              onChange={handleSettingsChange}
              disabled={role !== 'admin'}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">
              Total Parking Spots
            </label>
            <input
              type="number"
              name="total_parking_spots"
              value={settings?.total_parking_spots ?? ''}
              onChange={handleSettingsChange}
              disabled={role !== 'admin'}
              className={inputCls}
            />
          </div>
          <button
            type="submit"
            disabled={saving || role !== 'admin'}
            className="w-full flex items-center justify-center gap-2 bg-accent text-surface px-4 py-3 rounded-md font-semibold hover:opacity-90 transition-opacity h-[44px] disabled:opacity-50"
          >
            <Save size={20} />
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </form>
      </div>

      {/* Room Configurations */}
      <div className="bg-surface border border-border rounded-xl p-6 shadow-sm mt-8 overflow-x-auto">
        <h2 className="text-xl font-heading font-bold mb-4">Room Configurations</h2>
        <table className="w-full text-left border-collapse min-w-[520px]">
          <thead>
            <tr className="bg-bg border-b border-border">
              <th className="p-3 font-semibold text-text-primary text-sm">Room</th>
              <th className="p-3 font-semibold text-text-primary text-sm">Capacity</th>
              <th className="p-3 font-semibold text-text-primary text-sm">Base Rent (₹)</th>
              <th className="p-3 font-semibold text-text-primary text-sm">AC Charge (₹)</th>
              <th className="p-3 font-semibold text-text-primary text-sm">AC</th>
            </tr>
          </thead>
          <tbody>
            {rooms.map(room => (
              <tr key={room.id} className="border-b border-border">
                <td className="p-3 font-medium">{room.room_number}</td>
                <td className="p-3">
                  <input type="number" value={roomEdits[room.id]?.capacity ?? ''} onChange={e => handleRoomEdit(room.id, 'capacity', e.target.value)} disabled={role !== 'admin'} className="w-16 p-1 border border-border rounded bg-bg text-center disabled:opacity-50" />
                </td>
                <td className="p-3">
                  <input type="number" value={roomEdits[room.id]?.seat_rent ?? ''} onChange={e => handleRoomEdit(room.id, 'seat_rent', e.target.value)} disabled={role !== 'admin'} className="w-24 p-1 border border-border rounded bg-bg text-center disabled:opacity-50" />
                </td>
                <td className="p-3">
                  <input type="number" value={roomEdits[room.id]?.ac_charge ?? ''} onChange={e => handleRoomEdit(room.id, 'ac_charge', e.target.value)} disabled={role !== 'admin'} className="w-24 p-1 border border-border rounded bg-bg text-center disabled:opacity-50" />
                </td>
                <td className="p-3">
                  <input type="checkbox" checked={roomEdits[room.id]?.has_ac ?? false} onChange={e => handleRoomEdit(room.id, 'has_ac', e.target.checked)} disabled={role !== 'admin'} className="w-4 h-4 disabled:opacity-50" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button
          onClick={handleSaveRooms}
          disabled={savingRooms || role !== 'admin'}
          className="mt-4 flex items-center gap-2 bg-accent text-surface px-4 py-2 rounded-md font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          <Save size={16} />
          {savingRooms ? 'Saving...' : 'Save Room Changes'}
        </button>
      </div>
    </div>
  )
}

export default Settings
