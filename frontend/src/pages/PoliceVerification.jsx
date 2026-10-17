import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import { HeaderSkeleton, TableSkeleton } from '../components/Skeleton'
import toast from 'react-hot-toast'

const PoliceVerification = () => {
  const { role } = useAuth()
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/police-verification')
      .then(res => setRecords(res))
      .catch(() => toast.error('Failed to load records'))
      .finally(() => setLoading(false))
  }, [])

  const handleStatusChange = async (tenantId, newStatus) => {
    try {
      await api.patch(`/police-verification/${tenantId}`, { status: newStatus })
      setRecords(records.map(r => r.tenant_id === tenantId ? { ...r, status: newStatus } : r))
      toast.success('Status updated')
    } catch (err) {
      toast.error('Failed to update status')
    }
  }

  if (loading) return <div><HeaderSkeleton /><TableSkeleton rows={6} cols={4} /></div>

  return (
    <div>
      <header className="mb-8">
        <h1 className="text-3xl font-heading font-bold text-text-primary">Police Verification</h1>
        <p className="text-text-secondary mt-1">Track verification status of all tenants</p>
      </header>

      <div className="bg-surface border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-bg border-b border-border">
                <th className="p-4 font-semibold text-text-primary">Tenant</th>
                <th className="p-4 font-semibold text-text-primary">Room</th>
                <th className="p-4 font-semibold text-text-primary">Status</th>
                <th className="p-4 font-semibold text-text-primary">Action</th>
              </tr>
            </thead>
            <tbody>
              {records.length === 0 ? (
                <tr><td colSpan={4} className="p-8 text-center text-text-secondary">No tenants found</td></tr>
              ) : records.map((record) => (
                <tr key={record.id} className="border-b border-border hover:bg-bg/50 transition-colors">
                  <td className="p-4 font-medium">{record.tenants?.full_name}</td>
                  <td className="p-4">{record.tenants?.rooms?.room_number}</td>
                  <td className="p-4">
                    <span className={`
                      px-3 py-1 rounded-full text-xs font-semibold
                      ${record.status === 'verified' ? 'bg-success/20 text-success' : ''}
                      ${record.status === 'submitted' ? 'bg-warning/20 text-warning' : ''}
                      ${record.status === 'pending' ? 'bg-text-secondary/20 text-text-secondary' : ''}
                    `}>
                      {record.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="p-4">
                    {role === 'admin' ? (
                      <select
                        className="bg-surface border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent"
                        value={record.status}
                        onChange={(e) => handleStatusChange(record.tenant_id, e.target.value)}
                      >
                        <option value="pending">Pending</option>
                        <option value="submitted">Submitted</option>
                        <option value="verified">Verified</option>
                      </select>
                    ) : (
                      <span className="text-text-secondary text-sm">View only</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default PoliceVerification
