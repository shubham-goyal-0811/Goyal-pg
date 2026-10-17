import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { isAdmin } from '../lib/roles'
import { api } from '../lib/api'
import { rupees } from '../lib/format'
import toast from 'react-hot-toast'
import { TitleSkeleton, PanelSkeleton } from '../components/Skeleton'
import { Card, CardTitle, Button, Field, YesNo, InfoRow, PageTitle, inputCls } from '../components/ui'

/**
 * Prices and room setup. One Save button for the whole page, pinned to the
 * bottom of the screen, instead of a separate save per box that is easy to
 * miss. Gatekeepers see the same figures as plain text, with nothing to press.
 */

const ROOM_FIELDS = ['room_number', 'capacity', 'seat_rent', 'ac_charge', 'has_ac']
const str = (v) => (v == null ? '' : String(Number(v)))

// The app puts "Room " in front of the name everywhere, so "Room 101" typed in
// full would show as "Room Room 101". The API strips it the same way.
const roomName = (v) => v.trim().replace(/^room\s+/i, '')

const Settings = () => {
  const { role } = useAuth()
  const admin = isAdmin(role)
  const [saved, setSaved] = useState(null)   // { settings, rooms } as last loaded or saved
  const [form, setForm] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    Promise.all([api.get('/settings'), api.get('/rooms')])
      .then(([settings, rooms]) => {
        const loaded = {
          rate: str(settings.electricity_rate_per_unit),
          parking: str(settings.total_parking_spots),
          rooms: Object.fromEntries(rooms.map(r => [r.id, {
            room_number: r.room_number,
            capacity: str(r.capacity),
            seat_rent: str(r.seat_rent),
            ac_charge: str(r.ac_charge),
            has_ac: Boolean(r.has_ac),
          }])),
        }
        setSaved(loaded)
        setForm(loaded)
      })
      .catch(() => toast.error("Couldn't load settings"))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="flex flex-col gap-3.5"><TitleSkeleton /><PanelSkeleton count={3} /></div>
  if (!form) return <Card className="p-6 text-center">Couldn't load settings. Try opening this page again.</Card>

  const setRoom = (id, field, value) =>
    setForm(f => ({ ...f, rooms: { ...f.rooms, [id]: { ...f.rooms[id], [field]: value } } }))

  const settingsChanged = form.rate !== saved.rate || form.parking !== saved.parking
  const changedRooms = Object.keys(form.rooms)
    .filter(id => ROOM_FIELDS.some(k => form.rooms[id][k] !== saved.rooms[id][k]))
  const changed = settingsChanged || changedRooms.length > 0

  // Room names must be filled in and different from each other. Checked here so
  // the clash shows on the box being typed in, not as an error after Save.
  const nameError = (id) => {
    const name = roomName(form.rooms[id].room_number)
    if (!name) return 'Enter a name for this room.'
    const clash = Object.keys(form.rooms).some(other =>
      other !== id && roomName(form.rooms[other].room_number).toLowerCase() === name.toLowerCase())
    return clash ? `Another room is already called ${name}.` : null
  }
  const namesOk = Object.keys(form.rooms).every(id => !nameError(id))

  const save = async () => {
    if (!namesOk) return
    setSaving(true)
    try {
      await Promise.all([
        settingsChanged && api.patch('/settings', {
          electricity_rate_per_unit: Number(form.rate),
          total_parking_spots: Number(form.parking),
        }),
        ...changedRooms.map(id => {
          const r = form.rooms[id]
          return api.patch(`/rooms/${id}`, {
            ...(r.room_number !== saved.rooms[id].room_number ? { room_number: roomName(r.room_number) } : {}),
            capacity: Number(r.capacity),
            seat_rent: Number(r.seat_rent),
            ac_charge: r.has_ac ? Number(r.ac_charge) : 0,
            has_ac: r.has_ac,
          })
        }),
      ])
      // Store names as saved, so "Room 101" typed in full doesn't read as an
      // unsaved change afterwards.
      const stored = {
        ...form,
        rooms: Object.fromEntries(Object.entries(form.rooms).map(([id, r]) => [id, { ...r, room_number: roomName(r.room_number) }])),
      }
      setSaved(stored)
      setForm(stored)
      toast.success('Changes saved')
    } catch (err) {
      toast.error(err.message || "Couldn't save the changes")
    } finally {
      setSaving(false)
    }
  }

  // Digits (and one decimal point for the rate) only, so what is typed is
  // what gets saved.
  const digits = (v, decimal = false) => decimal ? v.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1') : v.replace(/\D/g, '')

  const rooms = Object.entries(form.rooms)

  if (!admin) {
    return (
      <div className="flex flex-col gap-3.5 max-w-2xl">
        <PageTitle>Settings</PageTitle>
        <Card className="pb-1">
          <InfoRow label="Electricity rate">{rupees(form.rate)} per unit</InfoRow>
          <InfoRow label="Parking spots">{form.parking}</InfoRow>
        </Card>
        <h2 className="font-heading font-bold text-xl pt-2 px-1">Rooms</h2>
        {rooms.map(([id, r]) => (
          <Card key={id} className="pb-1">
            <CardTitle className="px-4 pt-4 pb-2 text-[19px]">Room {r.room_number}</CardTitle>
            <InfoRow label="Seats">{r.capacity}</InfoRow>
            <InfoRow label="Rent per seat">{rupees(r.seat_rent)}</InfoRow>
            <InfoRow label="AC">{r.has_ac ? `Yes, ${rupees(r.ac_charge)} a month` : 'No'}</InfoRow>
          </Card>
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3.5 max-w-2xl">
      <PageTitle>Settings</PageTitle>

      <Card className="p-4 flex flex-col gap-4">
        <Field label="Electricity rate" hint="Changes bills made from now on, not ones already made.">
          <span className="flex items-center gap-1.5 h-[52px] px-3 border border-border rounded-lg bg-bg focus-within:outline-2 focus-within:outline-text-primary focus-within:outline-offset-2">
            <span className="text-text-secondary">₹</span>
            <input
              value={form.rate}
              onChange={e => setForm(f => ({ ...f, rate: digits(e.target.value, true) }))}
              inputMode="decimal"
              className="flex-1 min-w-0 h-12 border-0 bg-transparent text-[17px] focus:outline-none"
            />
            <span className="text-text-secondary">per unit</span>
          </span>
        </Field>
        <Field label="Parking spots">
          <input value={form.parking} onChange={e => setForm(f => ({ ...f, parking: digits(e.target.value) }))} inputMode="numeric" className={inputCls()} />
        </Field>
      </Card>

      <h2 className="font-heading font-bold text-xl pt-2 px-1">Rooms</h2>
      {rooms.map(([id, r]) => (
        <Card key={id} className="p-4 flex flex-col gap-3.5">
          {/* Titled by the saved name, so it doesn't change under the admin while they type a new one. */}
          <CardTitle className="text-[19px]">Room {saved.rooms[id].room_number}</CardTitle>
          <Field
            label="Room name"
            error={nameError(id)}
            hint={'Just the name, like 101. The app adds "Room" in front.'}
          >
            <input
              value={r.room_number}
              onChange={e => setRoom(id, 'room_number', e.target.value)}
              maxLength={20}
              autoComplete="off"
              className={inputCls(Boolean(nameError(id)))}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Seats">
              <input value={r.capacity} onChange={e => setRoom(id, 'capacity', digits(e.target.value))} inputMode="numeric" className={inputCls()} />
            </Field>
            <Field label="Rent per seat, ₹">
              <input value={r.seat_rent} onChange={e => setRoom(id, 'seat_rent', digits(e.target.value))} inputMode="numeric" className={inputCls()} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3 items-end">
            <YesNo label="Has AC" value={r.has_ac} onChange={v => setRoom(id, 'has_ac', v)} />
            {r.has_ac && (
              <Field label="AC charge, ₹">
                <input value={r.ac_charge} onChange={e => setRoom(id, 'ac_charge', digits(e.target.value))} inputMode="numeric" className={inputCls()} />
              </Field>
            )}
          </div>
        </Card>
      ))}

      {/* Stays at the bottom of the screen while scrolling. */}
      <div className="sticky bottom-0 -mx-4 md:mx-0 md:rounded-[10px] md:border mt-2 px-4 pt-3.5 pb-[max(1.25rem,env(safe-area-inset-bottom))] md:pb-3.5 bg-surface border-t border-border flex flex-col gap-1.5">
        <Button variant="primary" onClick={save} disabled={saving || !changed || !namesOk}>
          {saving ? 'Saving...' : 'Save changes'}
        </Button>
        {!changed && <p className="text-sm text-text-secondary text-center">Nothing changed yet.</p>}
        {changed && !namesOk && <p className="text-sm text-text-secondary text-center">Fix the room names above to save.</p>}
      </div>
    </div>
  )
}

export default Settings
