import { useNavigate } from 'react-router-dom'
import { Plus, ExternalLink } from 'lucide-react'

const RoomCard = ({ room }) => {
  const navigate = useNavigate()
  
  const isFull = room.active_tenants_count >= room.capacity
  const isEmpty = room.active_tenants_count === 0
  
  const handleOnboard = (e) => {
    e.stopPropagation()
    navigate(`/onboarding?room=${room.id}`)
  }

  // Create array of slots based on capacity
  const slots = Array.from({ length: room.capacity }).map((_, index) => {
    return room.tenants[index] || null
  })

  return (
    <div 
      className={`
        border p-5 rounded-xl transition-all h-full flex flex-col
        ${isEmpty ? 'bg-surface/50 border-border border-dashed' : 'bg-surface border-border'}
        ${!isFull ? 'hover:border-accent cursor-pointer shadow-sm hover:shadow-md' : 'opacity-95'}
      `}
      onClick={(e) => !isFull && handleOnboard(e)}
    >
      <div className="flex justify-between items-center mb-5">
        <h2 className="text-2xl font-heading font-bold">Room {room.room_number}</h2>
        <span className={`
          px-3 py-1 rounded-full text-sm font-semibold
          ${isFull ? 'bg-text-secondary/10 text-text-secondary' : 'bg-success/10 text-success'}
        `}>
          {room.active_tenants_count}/{room.capacity} Filled
        </span>
      </div>

      <div className="flex-1 space-y-3 mb-5">
        {slots.map((tenant, idx) => (
          <div key={idx} className="flex justify-between items-center p-2 rounded-md bg-bg">
            {tenant ? (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); navigate(`/tenants/${tenant.id}`) }}
                  className="font-medium truncate pr-2 text-left hover:text-accent transition-colors flex items-center gap-1 group"
                >
                  {tenant.full_name}
                  <ExternalLink size={12} className="opacity-0 group-hover:opacity-60 transition-opacity flex-shrink-0" />
                </button>
                <span className={`
                  text-xs font-semibold px-2 py-1 rounded
                  ${tenant.rent_status === 'paid' ? 'bg-success/20 text-success' : 'bg-warning/20 text-warning'}
                `}>
                  {tenant.rent_status?.toUpperCase()}
                </span>
              </>
            ) : (
              <span className="text-text-secondary italic text-sm py-1">Empty Seat</span>
            )}
          </div>
        ))}
      </div>

      {!isFull && (
        <button 
          onClick={handleOnboard}
          className="w-full mt-auto flex items-center justify-center gap-2 bg-accent/10 text-accent hover:bg-accent hover:text-surface border border-accent/20 transition-colors py-3 rounded-md font-semibold h-[44px]"
        >
          <Plus size={18} />
          {isEmpty ? 'Start Onboarding' : 'Add Tenant'}
        </button>
      )}
    </div>
  )
}

export default RoomCard
