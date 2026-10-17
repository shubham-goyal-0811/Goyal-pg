import { useState, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'
import { api } from '../../lib/api'
import { rupees, monthLabel, dateLabel } from '../../lib/format'
import { PanelSkeleton } from '../../components/Skeleton'

/**
 * Month-by-month rent history.
 *
 * Each row opens to show the three things the total is made of, because
 * "₹6,240" with no explanation is what generates the phone call this portal
 * exists to prevent.
 */

const BillRow = ({ bill, defaultOpen }) => {
  const [open, setOpen] = useState(defaultOpen)
  const paid = bill.status === 'paid'

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-bg transition-colors"
      >
        <div className="min-w-0">
          <p className="font-heading font-bold text-text-primary">{monthLabel(bill.billing_month)}</p>
          <p className={`text-sm mt-0.5 ${paid ? 'text-success' : 'text-accent'}`}>
            {paid ? `Paid ${dateLabel(bill.paid_date)}` : 'Pending'}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-lg font-heading font-bold text-text-primary">{rupees(bill.total_amount)}</span>
          <ChevronDown
            size={18}
            className={`text-text-secondary transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
          />
        </div>
      </button>

      {open && (
        <dl className="px-4 pb-4 pt-1 space-y-2 text-text-secondary border-t border-border">
          <div className="flex justify-between gap-4 pt-3">
            <dt>Seat rent</dt><dd className="text-text-primary">{rupees(bill.seat_rent)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>AC charge</dt>
            <dd className="text-text-primary">{Number(bill.ac_charge) > 0 ? rupees(bill.ac_charge) : 'Not opted'}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>Electricity (your share)</dt><dd className="text-text-primary">{rupees(bill.electricity_charge)}</dd>
          </div>
          <div className="flex justify-between gap-4 pt-2 border-t border-border font-semibold">
            <dt className="text-text-primary">Total</dt><dd className="text-text-primary">{rupees(bill.total_amount)}</dd>
          </div>
          {paid && Number(bill.amount_paid) !== Number(bill.total_amount) && (
            <div className="flex justify-between gap-4 text-sm">
              <dt>Recorded as paid</dt><dd>{rupees(bill.amount_paid)}</dd>
            </div>
          )}
        </dl>
      )}
    </div>
  )
}

const TenantRent = () => {
  const [bills, setBills] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.get('/me/rent').then(setBills).catch((err) => setError(err.message))
  }, [])

  if (error) {
    return (
      <div className="bg-surface border border-border rounded-xl p-6">
        <p className="text-text-primary font-medium">{error}</p>
      </div>
    )
  }

  if (!bills) return <PanelSkeleton count={4} />

  return (
    <div>
      <h1 className="text-2xl font-heading font-bold text-text-primary mb-1">Rent</h1>
      <p className="text-text-secondary mb-5">
        Electricity is metered per room and split between whoever lived there during each period.
      </p>

      {bills.length === 0 ? (
        <div className="bg-surface border border-border rounded-xl p-8 text-center">
          <p className="text-text-secondary">No bills yet. Your first one appears after the office generates it.</p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {bills.map((bill, i) => (
              <BillRow key={bill.id} bill={bill} defaultOpen={i === 0} />
            ))}
          </div>

          <p className="text-sm text-text-secondary mt-6">
            Pay at the office — they'll mark it paid here. There's nothing to pay through this app.
          </p>
        </>
      )}
    </div>
  )
}

export default TenantRent
