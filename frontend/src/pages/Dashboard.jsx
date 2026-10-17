import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useApiQuery, prefetchApi } from '../lib/queries'
import { useAuth } from '../context/AuthContext'
import { isAdmin } from '../lib/roles'
import { monthName, monthLabel, dayMonthLabel, rupees } from '../lib/format'
import RoomCard from '../components/RoomCard'
import { ListSkeleton, CardGridSkeleton } from '../components/Skeleton'
import { Card, Button, ButtonLink, TextButton, Notice, Field, ChevronRight, inputCls } from '../components/ui'
import toast from 'react-hot-toast'

/**
 * The Dashboard answers one question first: who hasn't paid. Everything else
 * — free seats, the room grid, making the month's bills — comes after it.
 *
 * Making bills is a once-a-month job, so it only takes up space when it is
 * due. The rest of the month it is a link at the bottom.
 */

// 'YYYY-MM' for the month `back` months before this one. Bills are made for a
// month after it closes, once its final meter readings are in, so the default
// is always the month just finished.
const monthKey = (back) => {
  const now = new Date()
  const d = new Date(now.getFullYear(), now.getMonth() - back, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
const nameOf = (key) => monthName(`${key}-01`)

// A typed reading has to sit between the room's readings either side of the
// month's end. Checked here so the admin sees which room is wrong as they type;
// the API checks again.
const readingProblem = (room, typed) => {
  if (typed === '') return null
  const value = Number(typed)
  if (!Number.isInteger(value)) return 'Enter the whole number on the meter.'
  if (room.previous && value < room.previous.reading_value) {
    return `Lower than the last reading (${room.previous.reading_value} on ${dayMonthLabel(room.previous.reading_date)}). Check for a typo.`
  }
  if (room.next && value > room.next.reading_value) {
    return `Higher than the later reading (${room.next.reading_value} on ${dayMonthLabel(room.next.reading_date)}). Check for a typo.`
  }
  return null
}

/**
 * Bills need every room's reading for the end of the month. Rooms missing one
 * are asked for here, before the bills are made, rather than coming out with
 * no electricity charge and a note to go back and fix it.
 */
const ReadingsStep = ({ month, rooms, busy, onSaved, onSkip, onBack }) => {
  const [values, setValues] = useState({})
  const [saving, setSaving] = useState(false)

  const problems = Object.fromEntries(rooms.map(r => [r.room_id, readingProblem(r, values[r.room_id] ?? '')]))
  const complete = rooms.every(r => (values[r.room_id] ?? '') !== '' && !problems[r.room_id])

  const save = async (e) => {
    e.preventDefault()
    if (!complete) return
    setSaving(true)
    try {
      await api.post('/rent/readings', {
        billing_month: month,
        readings: rooms.map(r => ({ room_id: r.room_id, reading_value: Number(values[r.room_id]) })),
      })
      await onSaved()
    } catch (err) {
      toast.error(err.message || "Couldn't save the readings")
      setSaving(false)
    }
  }

  return (
    <Card className="px-4 py-[18px]">
      <form onSubmit={save} className="flex flex-col gap-[18px]">
        <div className="flex flex-col gap-1.5">
          <h2 className="font-heading font-bold text-[22px] leading-snug">End of {nameOf(month)} meter readings</h2>
          <p className="text-text-secondary">
            {rooms.length === 1 ? 'This room needs its' : `These ${rooms.length} rooms need their`} meter
            reading for the end of {nameOf(month)} before the bills can include electricity.
          </p>
        </div>

        {rooms.map(room => (
          <Field
            key={room.room_id}
            label={`Room ${room.room_number}`}
            error={problems[room.room_id]}
            hint={room.previous
              ? `Last reading ${room.previous.reading_value} on ${dayMonthLabel(room.previous.reading_date)}.`
              : 'No reading yet. This one becomes the starting point.'}
          >
            <input
              inputMode="numeric"
              value={values[room.room_id] ?? ''}
              onChange={(e) => setValues(v => ({ ...v, [room.room_id]: e.target.value.replace(/\D/g, '') }))}
              className={inputCls(Boolean(problems[room.room_id]), 'tabular-nums')}
            />
          </Field>
        ))}

        <Button type="submit" variant="primary" disabled={saving || busy || !complete}>
          {saving ? 'Saving...' : `Save readings and make ${nameOf(month)} bills`}
        </Button>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <TextButton onClick={onBack} disabled={saving || busy}>Back</TextButton>
          <TextButton onClick={onSkip} disabled={saving || busy}>Make bills without these readings</TextButton>
        </div>
      </form>
    </Card>
  )
}

const BillsForm = ({ due, onDone }) => {
  const [month, setMonth] = useState(() => monthKey(1))
  const [running, setRunning] = useState(false)
  const [needed, setNeeded] = useState(null)

  const generate = async () => {
    setRunning(true)
    try {
      const res = await api.post('/rent/generate', { billing_month: month })
      onDone({ ...res, month })
      // No refetch call needed: POST /rent busts '/rooms' in api.js, which
      // refetches the room grid while it is on screen.
    } catch (err) {
      toast.error(err.message || "Couldn't make the bills")
      setRunning(false)
    }
  }

  const start = async () => {
    setRunning(true)
    try {
      const rooms = await api.get(`/rent/readings-needed?billing_month=${month}`, { fresh: true })
      if (rooms.length > 0) {
        setNeeded(rooms)
        setRunning(false)
      } else {
        await generate()
      }
    } catch (err) {
      toast.error(err.message || "Couldn't check the meter readings")
      setRunning(false)
    }
  }

  if (needed) {
    return (
      <ReadingsStep
        month={month}
        rooms={needed}
        busy={running}
        onSaved={generate}
        onSkip={generate}
        onBack={() => setNeeded(null)}
      />
    )
  }

  return (
    <Card className="px-4 py-[18px] flex flex-col gap-3.5">
      <h2 className="font-heading font-bold text-[22px] leading-snug">
        {due ? `${nameOf(month)} bills aren't made yet` : 'Make bills'}
      </h2>
      <p className="text-text-secondary -mt-1.5">
        Each room needs a meter reading for the end of {nameOf(month)}. You will be asked for any that are missing.
      </p>
      <label className="flex flex-col gap-1.5">
        <span className="font-heading font-semibold text-[15px]">Month</span>
        <select value={month} onChange={e => setMonth(e.target.value)} className={inputCls()}>
          {[1, 2, 3].map(back => (
            <option key={back} value={monthKey(back)}>{monthLabel(`${monthKey(back)}-01`)}</option>
          ))}
        </select>
      </label>
      <Button variant="primary" onClick={start} disabled={running}>
        {running ? 'Making bills...' : `Make ${nameOf(month)} bills`}
      </Button>
      <p className="text-sm text-text-secondary">Safe to run again. Bills already paid are not changed.</p>
    </Card>
  )
}

const BillsResult = ({ result, rooms }) => {
  const roomNo = (id) => rooms.find(r => r.id === id)?.room_number ?? id
  const missing = result.warnings ?? []
  const name = nameOf(result.month)
  const paid = (result.skipped ?? []).filter(s => s.reason === 'already_paid').length

  return (
    <Card className="px-4 py-[18px] flex flex-col gap-3">
      <h2 className="font-heading font-bold text-xl leading-snug">
        {result.generated > 0
          ? `${name} bills made for ${result.generated} tenant${result.generated === 1 ? '' : 's'}`
          : `No new ${name} bills to make`}
      </h2>
      {paid > 0 && (
        <p className="text-text-secondary -mt-1">
          {paid} already paid, left as they were.
        </p>
      )}
      {result.removed > 0 && (
        <p className="text-text-secondary -mt-1">
          Removed {result.removed} {name} bill{result.removed === 1 ? '' : 's'} made by mistake
          for tenants who moved in after {name}.
        </p>
      )}
      {missing.length > 0 && (
        <>
          <Notice boxed>
            No electricity charge for {missing.length === 1 ? '1 room' : `${missing.length} rooms`} (
            {missing.map(w => roomNo(w.room_id)).join(' and ')}).
            {missing.length === 1 ? ' Its meter reading is' : ' Their meter readings are'} missing.
            Add {missing.length === 1 ? 'it' : 'them'}, then make {name} bills again.
          </Notice>
          {missing.map(w => (
            <ButtonLink key={w.room_id} to={`/admin/meter-reading/${w.room_id}`}>
              Add meter reading for Room {roomNo(w.room_id)}
            </ButtonLink>
          ))}
        </>
      )}
    </Card>
  )
}

const Dashboard = () => {
  const navigate = useNavigate()
  const { role } = useAuth()
  const admin = isAdmin(role)
  const { data: rooms, isPending, isError, error, refetch, isFetching } = useApiQuery('/rooms')
  const [billsOpen, setBillsOpen] = useState(false)
  const [result, setResult] = useState(null)

  // Same shapes the real page lands in, so nothing jumps when it arrives.
  // Only shown on a true first load — once rooms are cached, coming back here
  // paints them immediately and refreshes behind.
  if (isPending) {
    return (
      <div className="flex flex-col gap-4">
        <ListSkeleton rows={3} tag={false} />
        <CardGridSkeleton count={6} lines={3} className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4" />
      </div>
    )
  }

  // Nothing cached and the request failed even after retries. A failed
  // background refresh also sets isError but keeps `rooms` — that case falls
  // through and the cached grid stays up.
  if (isError && !rooms) {
    return (
      <Card className="p-6 text-center flex flex-col items-center gap-3">
        <p className="font-heading font-bold text-lg">Couldn't load the rooms</p>
        <p className="text-text-secondary">{error.message}</p>
        <Button onClick={() => refetch()} disabled={isFetching}>{isFetching ? 'Trying again...' : 'Try again'}</Button>
      </Card>
    )
  }

  const tenants = rooms.flatMap(r => r.tenants.map(t => ({ ...t, room: r.room_number })))
  const seats = rooms.reduce((n, r) => n + r.capacity, 0)
  const filled = rooms.reduce((n, r) => n + r.active_tenants_count, 0)
  const free = seats - filled

  // The latest month anyone has been billed for, and when that was done.
  const billed = tenants.filter(t => t.rent_month)
  const latestMonth = billed.reduce((m, t) => (t.rent_month > m ? t.rent_month : m), '')
  const billedAt = billed
    .filter(t => t.rent_month === latestMonth && t.rent_billed_at)
    .reduce((d, t) => (t.rent_billed_at > d ? t.rent_billed_at : d), '')
  const billsDue = admin && filled > 0 && (!latestMonth || latestMonth.slice(0, 7) < monthKey(1))

  const unpaid = tenants.filter(t => t.rent_status === 'pending')
  // Name the month only when every unpaid bill is for the same one.
  const months = new Set(unpaid.map(t => t.rent_month))
  const forMonth = months.size === 1 ? ` for ${monthName([...months][0])}` : ''
  const attentionTitle = unpaid.length === 0
    ? `Everyone has paid for ${monthName(latestMonth)}`
    : `${unpaid.length === 1 ? "1 tenant hasn't" : `${unpaid.length} tenants haven't`} paid${forMonth}`

  const showBills = billsDue || billsOpen

  return (
    <div className="flex flex-col gap-4">
      {admin && result && <BillsResult result={result} rooms={rooms} />}
      {admin && !result && showBills && (
        <BillsForm due={billsDue} onDone={(res) => { setResult(res); setBillsOpen(false) }} />
      )}

      {/* Rent is admin-only; gatekeepers start at the seats. */}
      {admin && latestMonth && (
        <Card className="overflow-hidden">
          <div className="px-4 pt-[18px] pb-3.5 lg:px-5">
            <h1 className="font-heading font-bold text-[22px] lg:text-2xl leading-snug text-pretty">{attentionTitle}</h1>
            {unpaid.length === 0 && <p className="mt-1.5 text-text-secondary">Nothing else needs you today.</p>}
          </div>
          {unpaid.length > 0 && (
            <div className="lg:grid lg:grid-cols-3 border-t border-border">
              {unpaid.map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => navigate(`/admin/tenants/${t.id}`)}
                  onPointerEnter={() => prefetchApi(`/tenants/${t.id}`)}
                  onFocus={() => prefetchApi(`/tenants/${t.id}`)}
                  className="w-full min-h-[60px] lg:min-h-[68px] flex items-center gap-3 px-4 lg:px-5 py-2 bg-surface text-left border-t border-border first:border-t-0 lg:border-t-0 lg:border-r lg:[&:nth-child(3n)]:border-r-0 hover:bg-bg"
                >
                  <span className="flex-1 flex flex-col min-w-0">
                    <span className="font-semibold text-[17px] truncate">{t.full_name}</span>
                    <span className="text-[15px] text-text-secondary">
                      Room {t.room}{t.rent_amount != null && ` · ${rupees(t.rent_amount)} pending`}
                    </span>
                  </span>
                  <ChevronRight />
                </button>
              ))}
            </div>
          )}
        </Card>
      )}

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-1">
        <p className="text-text-secondary">
          {filled} of {seats} seats filled
          {free > 0 && <> · <span className="text-success font-semibold">{free} free</span></>}
        </p>
        {admin && !showBills && latestMonth && (
          <p className="hidden lg:flex items-center gap-2.5 text-[15px] text-text-secondary">
            {monthName(latestMonth)} bills made{billedAt && ` on ${dayMonthLabel(billedAt)}`}
            <TextButton onClick={() => { setResult(null); setBillsOpen(true) }}>Make bills</TextButton>
          </p>
        )}
      </div>

      <h2 className="font-heading font-bold text-xl mt-1.5 px-1 lg:sr-only">Rooms</h2>
      {rooms.length === 0 ? (
        <p className="text-text-secondary text-center py-16">No rooms set up yet.</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
          {rooms.map(room => <RoomCard key={room.id} room={room} showRent={admin} />)}
        </div>
      )}

      {admin && !showBills && latestMonth && (
        <div className="lg:hidden flex items-center justify-between gap-3 border-t border-border pt-3.5 px-1 mt-1.5">
          <span className="text-[15px] text-text-secondary">
            {monthName(latestMonth)} bills made{billedAt && ` on ${dayMonthLabel(billedAt)}`}
          </span>
          <TextButton onClick={() => { setResult(null); setBillsOpen(true); window.scrollTo({ top: 0 }) }}>Make bills</TextButton>
        </div>
      )}
    </div>
  )
}

export default Dashboard
