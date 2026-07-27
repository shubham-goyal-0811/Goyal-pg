import { useNavigate } from 'react-router-dom'
import { AlertCircle } from 'lucide-react'

const MeterModal = ({ roomId, isOpen, onClose }) => {
  const navigate = useNavigate()

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-surface p-6 rounded-xl shadow-lg w-full max-w-md">
        <div className="flex items-center gap-3 mb-4">
          <div className="bg-warning/20 p-2 rounded-full text-warning">
            <AlertCircle size={24} />
          </div>
          <h2 className="text-xl font-heading font-bold text-text-primary">Record Meter Reading</h2>
        </div>
        
        <p className="text-text-secondary mb-6 leading-relaxed">
          A tenant just checked out. To keep electricity split accurate, you must record a new meter reading now for Room {roomId}.
        </p>
        
        <div className="flex flex-col gap-3">
          <button 
            onClick={() => navigate(`/meter-reading/${roomId}`)}
            className="w-full bg-accent text-surface px-4 py-3 rounded-md font-semibold hover:opacity-90 transition-opacity"
          >
            Record Now (Recommended)
          </button>
          <button 
            onClick={onClose}
            className="w-full bg-surface border border-border text-text-secondary px-4 py-3 rounded-md font-medium hover:bg-bg transition-colors"
          >
            Skip (Electricity split will be inaccurate)
          </button>
        </div>
      </div>
    </div>
  )
}

export default MeterModal
