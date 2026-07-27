import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import RoomCard from '../components/RoomCard'
import toast from 'react-hot-toast'

const Dashboard = () => {
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

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-text-secondary">
        Loading dashboard...
      </div>
    )
  }

  return (
    <div>
      <header className="mb-8">
        <h1 className="text-3xl font-heading font-bold text-text-primary">Dashboard</h1>
        <p className="text-text-secondary mt-1">Room occupancy and rent status</p>
      </header>

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
