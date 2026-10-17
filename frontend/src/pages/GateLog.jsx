import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import { relativeLabel } from '../lib/format'
import toast from 'react-hot-toast'
import { Plus, X } from 'lucide-react'
import { HeaderSkeleton, TableSkeleton } from '../components/Skeleton'

const GateLog = () => {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [tenants, setTenants] = useState([])
  const [form, setForm] = useState({ tenant_id: '', visitor_name: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchLogs()
    api.get('/tenants').then(res => setTenants(res)).catch(() => {})
  }, [])

  const fetchLogs = async () => {
    try {
      const res = await api.get('/gate-log')
      setLogs(res)
    } catch (err) {
      toast.error('Failed to load gate log')
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await api.post('/gate-log', {
        tenant_id: form.tenant_id || null,
        visitor_name: form.visitor_name || null,
      })
      setLogs([res, ...logs])
      setShowForm(false)
      setForm({ tenant_id: '', visitor_name: '' })
      toast.success('Entry added')
    } catch (err) {
      toast.error('Failed to add entry')
    } finally {
      setSaving(false)
    }
  }

  const handleMarkOut = async (logId) => {
    try {
      const res = await api.patch(`/gate-log/${logId}/mark-out`)
      setLogs(logs.map(l => l.id === logId ? res : l))
      toast.success('Marked out')
    } catch (err) {
      toast.error('Failed to mark out')
    }
  }

  if (loading) return <div><HeaderSkeleton /><TableSkeleton rows={6} cols={4} /></div>

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <header>
          <h1 className="text-3xl font-heading font-bold text-text-primary">Gate Log</h1>
          <p className="text-text-secondary mt-1">Visitor and tenant entry/exit records</p>
        </header>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center justify-center gap-2 bg-accent text-surface px-4 py-3 rounded-md font-semibold hover:opacity-90 transition-opacity h-[44px]"
        >
          <Plus size={20} /> Add Entry
        </button>
      </div>

      {/* Add Entry Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-xl border border-border shadow-lg w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-heading font-bold">New Gate Entry</h2>
              <button onClick={() => setShowForm(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Visitor Name (if external)</label>
                <input
                  className="w-full px-3 py-2 border border-border rounded-md bg-bg focus:outline-none focus:border-accent"
                  placeholder="e.g. Amazon Delivery"
                  value={form.visitor_name}
                  onChange={e => setForm({ ...form, visitor_name: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Visiting Tenant</label>
                <select
                  className="w-full px-3 py-2 border border-border rounded-md bg-bg focus:outline-none focus:border-accent"
                  value={form.tenant_id}
                  onChange={e => setForm({ ...form, tenant_id: e.target.value })}
                >
                  <option value="">Select tenant...</option>
                  {tenants.map(t => (
                    <option key={t.id} value={t.id}>{t.full_name}</option>
                  ))}
                </select>
              </div>
              <button type="submit" disabled={saving} className="w-full bg-accent text-surface py-2 rounded-md font-semibold disabled:opacity-50">
                {saving ? 'Saving...' : 'Add Entry'}
              </button>
            </form>
          </div>
        </div>
      )}

      <div className="bg-surface border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-bg border-b border-border">
                <th className="p-4 font-semibold text-text-primary">Visitor</th>
                <th className="p-4 font-semibold text-text-primary">Visiting</th>
                <th className="p-4 font-semibold text-text-primary">In Time</th>
                <th className="p-4 font-semibold text-text-primary">Out Time</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr><td colSpan={4} className="p-8 text-center text-text-secondary">No entries yet</td></tr>
              ) : logs.map((log) => (
                <tr key={log.id} className="border-b border-border hover:bg-bg/50 transition-colors">
                  <td className="p-4 font-medium">{log.visitor_name || 'Tenant Entry'}</td>
                  <td className="p-4">{log.tenants?.full_name || '—'} {log.tenants?.rooms?.room_number ? `(Rm ${log.tenants.rooms.room_number})` : ''}</td>
                  <td className="p-4">{relativeLabel(log.in_time)}</td>
                  <td className="p-4">
                    {log.out_time
                      ? relativeLabel(log.out_time)
                      : <button onClick={() => handleMarkOut(log.id)} className="text-accent text-sm font-semibold hover:underline">Mark Out</button>
                    }
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

export default GateLog
