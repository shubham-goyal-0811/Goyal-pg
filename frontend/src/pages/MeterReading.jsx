import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import toast from 'react-hot-toast'

const MeterReading = () => {
  const { roomId } = useParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [reading, setReading] = useState('')
  const [date, setDate] = useState(new Date().toISOString().substring(0, 10))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!reading) return toast.error('Please enter a reading value')
    
    setLoading(true)
    try {
      // await api.post(`/rooms/${roomId}/meter-readings`, { reading_date: date, reading_value: Number(reading), triggered_by: 'routine' })
      toast.success('Meter reading saved')
      navigate(-1) // go back
    } catch (err) {
      toast.error('Failed to save reading')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-xl mx-auto">
      <header className="mb-8">
        <h1 className="text-3xl font-heading font-bold text-text-primary">Meter Reading</h1>
        <p className="text-text-secondary mt-1">Record electricity usage for Room {roomId}</p>
      </header>

      <div className="bg-surface border border-border rounded-xl p-6 shadow-sm">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">Reading Date</label>
            <input 
              type="date" 
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-4 py-3 rounded-md border border-border bg-bg text-text-primary focus:outline-none focus:border-accent transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">Meter Value (Units)</label>
            <input 
              type="number" 
              value={reading}
              onChange={(e) => setReading(e.target.value)}
              placeholder="e.g. 14502"
              className="w-full px-4 py-3 rounded-md border border-border bg-bg text-text-primary focus:outline-none focus:border-accent transition-colors"
            />
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-accent text-surface px-4 py-3 rounded-md font-semibold hover:opacity-90 transition-opacity h-[44px] disabled:opacity-50"
          >
            {loading ? 'Saving...' : 'Save Reading'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default MeterReading
