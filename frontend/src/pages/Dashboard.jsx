import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useApiQuery, prefetchApi } from '../lib/queries'
import { useAuth } from '../context/AuthContext'
import { isAdmin } from '../lib/roles'
import { monthName, monthLabel, dayMonthLabel, rupees } from '../lib/format'
import RoomCard from '../components/RoomCard'
import { ListSkeleton, CardGridSkeleton } from '../components/Skeleton'
import { Card, Button, ButtonLink, TextButton, Notice, ChevronRight, inputCls } from '../components/ui'
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

const BillsForm = ({ due, onDone }) => {
  const [month, setMonth] = useState(() => monthKey(1))
  const [running, setRunning] = useState(false)

  const run = async () => {
    setRunning(true)
    try {
      const res = await api.post('/rent/generate', { billing_month: month })
      onDone({ ...res, month })
      // No refetch call needed: POST /rent busts '/rooms' in api.js, which
      // refetches the room grid while it is on screen.
    } catch (err) {
      toast.error(err.message || "Couldn't make the bills")
    } finally {
      setRunning(false)
    }
  }

  return (
    <Card className="px-4 py-[18px] flex flex-col gap-3.5">
      <h2 className="font-heading font-bold text-[22px] leading-snug">
        {due ? `${nameOf(month)} bills aren't made yet` : 'Make bills'}
      </h2>
      <p className="text-text-secondary -mt-1.5">
        Make them after all rooms have a meter reading for the end of {nameOf(month)}.
      </p>
      <label className="flex flex-col gap-1.5">
        <span className="font-heading font-semibold text-[15px]">Month</span>
        <select value={month} onChange={e => setMonth(e.target.value)} className={inputCls()}>
          {[1, 2, 3].map(back => (
            <option key={back} value={monthKey(back)}>{monthLabel(`${monthKey(back)}-01`)}</option>
          ))}
        </select>
      </label>
      <Button variant="primary" onClick={run} disabled={running}>
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

  return (
    <Card className="px-4 py-[18px] flex flex-col gap-3">
      <h2 className="font-heading font-bold text-xl leading-snug">
        {result.generated > 0
          ? `${name} bills made for ${result.generated} tenant${result.generated === 1 ? '' : 's'}`
          : `No new ${name} bills to make`}
      </h2>
      {result.skipped?.length > 0 && (
        <p className="text-text-secondary -mt-1">
          {result.skipped.length} already paid, left as they were.
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
