import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ShieldCheck, ShieldAlert, DoorOpen } from 'lucide-react'
import { api } from '../../lib/api'
import { rupees, monthLabel, dateLabel } from '../../lib/format'

/**
 * The resident home screen.
 *
 * One question, answered above the fold: do I owe anything? Everything else is
 * secondary and sits below it.
 *
 * There is no pay button anywhere in this portal. Rent is settled in the
 * office, and a button that only *looks* like it takes payment is worse than
 * none — so the screen says plainly where to pay instead.
 */

const PV_COPY = {
  pending: { icon: ShieldAlert, tone: 'text-warning', text: 'Police verification not submitted yet. The office handles this.' },
  submitted: { icon: ShieldAlert, tone: 'text-warning', text: 'Police verification submitted, waiting on the police station.' },
  verified: { icon: ShieldCheck, tone: 'text-success', text: 'Police verification complete.' },
}

const TenantHome = () => {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.get('/me/summary').then(setData).catch((err) => setError(err.message))
  }, [])

  if (error) {
    return (
      <div className="bg-surface border border-border rounded-xl p-6">
        <p className="text-text-primary font-medium">{error}</p>
        <p className="text-text-secondary text-sm mt-1">Please tell the office if this keeps happening.</p>
      </div>
    )
  }

  if (!data) return <p className="text-text-secondary">Loading…</p>

  const { tenant, room, latest_bill: bill, outstanding, police_verification: pv } = data
  const owes = outstanding.count > 0
  const pvCopy = pv ? PV_COPY[pv.status] : null

  return (
    <div className="space-y-4">
      {/* What you owe */}
      <div className="bg-surface border border-border rounded-xl p-6">
        <p className="text-text-secondary">
          {owes ? 'You have rent due' : 'Rent'}
        </p>
        <p className={`text-4xl font-heading font-bold mt-1 ${owes ? 'text-accent' : 'text-success'}`}>
          {owes ? rupees(outstanding.total) : 'All paid'}
        </p>
        <p className="text-text-secondary mt-2">
          {owes
            ? `Across ${outstanding.count} month${outstanding.count === 1 ? '' : 's'}. Pay at the office — they'll mark it paid here.`
            : 'Nothing outstanding. Thank you.'}
        </p>

        {owes && (
          <Link
            to="/me/rent"
            className="inline-flex items-center h-[44px] px-5 mt-5 border border-border rounded-md font-semibold text-text-primary hover:bg-bg"
          >
            See the breakdown
          </Link>
        )}
      </div>

      {/* Latest bill */}
      {bill && (
        <div className="bg-surface border border-border rounded-xl p-6">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-heading font-bold text-text-primary">{monthLabel(bill.billing_month)}</h2>
            <span className={`text-sm font-semibold ${bill.status === 'paid' ? 'text-success' : 'text-accent'}`}>
              {bill.status === 'paid' ? `Paid ${dateLabel(bill.paid_date)}` : 'Pending'}
            </span>
          </div>

          <dl className="mt-4 space-y-2 text-text-secondary">
            <div className="flex justify-between gap-4">
              <dt>Seat rent</dt><dd className="text-text-primary">{rupees(bill.seat_rent)}</dd>
            </div>
            {Number(bill.ac_charge) > 0 && (
              <div className="flex justify-between gap-4">
                <dt>AC</dt><dd className="text-text-primary">{rupees(bill.ac_charge)}</dd>
              </div>
            )}
            <div className="flex justify-between gap-4">
              <dt>Electricity (your share)</dt><dd className="text-text-primary">{rupees(bill.electricity_charge)}</dd>
            </div>
            <div className="flex justify-between gap-4 pt-2 mt-2 border-t border-border font-semibold">
              <dt className="text-text-primary">Total</dt><dd className="text-text-primary">{rupees(bill.total_amount)}</dd>
            </div>
          </dl>
        </div>
      )}

      {/* Where you live */}
      <div className="bg-surface border border-border rounded-xl p-6">
        <div className="flex gap-3">
          <DoorOpen size={20} className="text-text-secondary shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-text-primary">
              {room ? `Room ${room.room_number}` : 'No room assigned'}
              {room?.floor != null && <span className="text-text-secondary font-normal"> · Floor {room.floor}</span>}
            </p>
            <p className="text-sm text-text-secondary mt-0.5">
              Living here since {dateLabel(tenant.check_in_date)}
              {tenant.ac_opted && ' · AC opted in'}
            </p>
            {tenant.status === 'vacated' && (
              <p className="text-sm text-text-secondary mt-1">
                Checked out on {dateLabel(tenant.check_out_date)}. Your records stay here.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Police verification */}
      {pvCopy && (
        <div className="bg-surface border border-border rounded-xl p-6 flex gap-3">
          <pvCopy.icon size={20} className={`${pvCopy.tone} shrink-0 mt-0.5`} />
          <p className="text-text-secondary">{pvCopy.text}</p>
        </div>
      )}
    </div>
  )
}

export default TenantHome
