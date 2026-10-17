import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { monthLabel } from '../lib/format'
import { prefetchApi } from '../lib/queries'
import { Card, RentTag, ButtonLink } from './ui'

/**
 * One room: its seats, who is in each, and their latest bill.
 *
 * `showRent` is false for gatekeepers — the API leaves rent out for them, and
 * a column of "No bill" tags would read as missing data rather than withheld.
 */
const RoomCard = ({ room, showRent }) => {
  const navigate = useNavigate()
  const filled = room.active_tenants_count
  const hasSpace = filled < room.capacity

  // One row per seat, so an empty seat is as visible as a filled one.
  const seats = Array.from({ length: room.capacity }, (_, i) => room.tenants[i] || null)

  return (
    <Card className="overflow-hidden">
      <div className="flex items-baseline justify-between gap-2 px-4 pt-3.5 pb-2.5">
        <div className="flex items-baseline gap-2">
          <h3 className="font-heading font-bold text-[19px]">Room {room.room_number}</h3>
          <span className="text-sm text-text-secondary">{room.has_ac ? 'AC' : 'No AC'}</span>
        </div>
        <span className="text-[15px] text-text-secondary">{filled}/{room.capacity} filled</span>
      </div>

      {seats.map((tenant, idx) => (
        <div key={tenant?.id ?? `empty-${idx}`} className="border-t border-border min-h-[52px] flex items-center justify-between gap-2 pl-1 pr-3">
          {tenant ? (
            <>
              <button
                type="button"
                onClick={() => navigate(`/admin/tenants/${tenant.id}`)}
                // Load the record as the pointer arrives — usually there before the tap ends.
                onPointerEnter={() => prefetchApi(`/tenants/${tenant.id}`)}
                onFocus={() => prefetchApi(`/tenants/${tenant.id}`)}
                className="h-12 px-3 text-left font-semibold text-[17px] underline decoration-border decoration-2 underline-offset-[5px] hover:decoration-text-primary min-w-0 truncate"
              >
                {tenant.full_name}
              </button>
              {showRent && (
                <span title={tenant.rent_month ? `${monthLabel(tenant.rent_month)} bill` : 'No bill made yet'}>
                  <RentTag status={tenant.rent_status} />
                </span>
              )}
            </>
          ) : (
            <span className="pl-3 flex items-center gap-2 text-success font-medium">
              <span aria-hidden="true" className="w-2 h-2 rounded-full border-[1.5px] border-success box-border" />
              Empty seat
            </span>
          )}
        </div>
      ))}

      {hasSpace && (
        <div className="p-3 border-t border-border">
          <ButtonLink to={`/admin/onboarding?room=${room.id}`} className="w-full">
            <Plus size={18} aria-hidden="true" />Add tenant
          </ButtonLink>
        </div>
      )}
    </Card>
  )
}

export default RoomCard
