import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import { useApiQuery } from '../lib/queries'
import { relativeLabel, timeLabel, todayISO } from '../lib/format'
import toast from 'react-hot-toast'
import { Plus } from 'lucide-react'
import { TitleSkeleton, PanelSkeleton } from '../components/Skeleton'
import { Card, CardTitle, Button, Field, PageTitle, inputCls } from '../components/ui'

/**
 * The gatekeeper's screen. Two jobs: write down who came in, and mark them
 * out on the way back. So it opens on one big "Add visitor" button and the
 * people inside right now, each with their own "Mark out".
 */

// Local calendar day of a timestamp, to compare with todayISO().
const dayOf = (value) => {
  const d = new Date(value)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const isToday = (value) => value && dayOf(value) === todayISO()
const whenLabel = (value) => (isToday(value) ? timeLabel(value) : relativeLabel(value))

// Who the entry is for. An entry with no visitor name is a tenant coming in.
const who = (log) => log.visitor_name || log.tenants?.full_name || 'Unknown'
const visiting = (log) => {
  const room = log.tenants?.rooms?.room_number
  if (!log.tenants) return ''
  if (!log.visitor_name) return `Tenant${room ? ` · Room ${room}` : ''}`
  return `Visiting ${log.tenants.full_name}${room ? ` · Room ${room}` : ''}`
}

const AddVisitor = ({ onSaved, onCancel }) => {
  const { data: tenants = [] } = useApiQuery('/tenants')
  const [form, setForm] = useState({ tenant_id: '', visitor_name: '' })
  const [saving, setSaving] = useState(false)
  const empty = !form.visitor_name.trim() && !form.tenant_id

  const save = async (e) => {
    e.preventDefault()
    if (empty) return
    setSaving(true)
    try {
      const res = await api.post('/gate-log', {
        tenant_id: form.tenant_id || null,
        visitor_name: form.visitor_name.trim() || null,
      })
      onSaved(res)
      toast.success(`${res.visitor_name || 'Entry'} marked as in`)
    } catch (err) {
      toast.error(err.message || "Couldn't save the entry")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="px-4 py-[18px]">
      <form onSubmit={save} className="flex flex-col gap-4">
        <CardTitle>New visitor</CardTitle>
        <Field label="Visitor's name" hint="Leave empty when it is a tenant coming in">
          <input
            value={form.visitor_name}
            onChange={e => setForm({ ...form, visitor_name: e.target.value })}
            autoComplete="off"
            className={inputCls()}
          />
        </Field>
        <Field label="Visiting">
          <select
            value={form.tenant_id}
            onChange={e => setForm({ ...form, tenant_id: e.target.value })}
            className={inputCls()}
          >
            <option value="">Choose a tenant</option>
            {tenants.map(t => (
              <option key={t.id} value={t.id}>{t.full_name}{t.rooms?.room_number && ` · ${t.rooms.room_number}`}</option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-[1fr_1.6fr] gap-2.5">
          <Button variant="quiet" size="dialog" onClick={onCancel} disabled={saving}>Cancel</Button>
          <Button type="submit" variant="primary" size="dialog" disabled={saving || empty}>
            {saving ? 'Saving...' : 'Save, mark as in'}
          </Button>
        </div>
      </form>
    </Card>
  )
}

const GateLog = () => {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [markingId, setMarkingId] = useState(null)

  useEffect(() => {
    api.get('/gate-log')
      .then(setLogs)
      .catch(() => toast.error("Couldn't load the gate log"))
      .finally(() => setLoading(false))
  }, [])

  const markOut = async (logId) => {
    setMarkingId(logId)
    try {
      const res = await api.patch(`/gate-log/${logId}/mark-out`)
      setLogs(list => list.map(l => (l.id === logId ? { ...l, ...res } : l)))
      toast.success('Marked out')
    } catch (err) {
      toast.error(err.message || "Couldn't mark out")
    } finally {
      setMarkingId(null)
    }
  }

  if (loading) return <div className="flex flex-col gap-3.5"><TitleSkeleton /><PanelSkeleton count={3} /></div>

  const inside = logs.filter(l => !l.out_time)
  const leftToday = logs.filter(l => l.out_time && isToday(l.out_time))
  const earlier = logs.filter(l => l.out_time && !isToday(l.out_time))

  const sectionTitle = 'font-heading font-bold text-lg pt-2 px-1'

  return (
    <div className="flex flex-col gap-3.5 max-w-2xl">
      <PageTitle>Gate log</PageTitle>

      {adding ? (
        <AddVisitor
          onSaved={(entry) => { setLogs(list => [entry, ...list]); setAdding(false) }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <Button variant="primary" onClick={() => setAdding(true)}>
          <Plus size={20} strokeWidth={2.2} aria-hidden="true" />Add visitor
        </Button>
      )}

      <h2 className={sectionTitle}>Inside now</h2>
      {inside.length === 0 ? (
        <Card className="px-4 py-5 text-center text-text-secondary">No visitors inside right now.</Card>
      ) : inside.map(log => (
        <Card key={log.id} className="px-4 py-3.5 flex flex-col gap-2.5">
          <div className="flex justify-between items-baseline gap-2">
            <span className="font-semibold text-[17px]">{who(log)}</span>
            <span className="text-[15px] text-text-secondary whitespace-nowrap">In {whenLabel(log.in_time)}</span>
          </div>
          {visiting(log) && <p className="text-text-secondary -mt-1.5">{visiting(log)}</p>}
          <Button onClick={() => markOut(log.id)} disabled={markingId === log.id}>
            {markingId === log.id ? 'Saving...' : 'Mark out'}
          </Button>
        </Card>
      ))}

      <h2 className={sectionTitle}>Left today</h2>
      <LeftList logs={leftToday} empty="Nobody has left yet today." />

      {earlier.length > 0 && (
        <>
          <h2 className={sectionTitle}>Earlier</h2>
          <LeftList logs={earlier} />
        </>
      )}
    </div>
  )
}

const LeftList = ({ logs, empty }) => (
  <Card className="overflow-hidden">
    {logs.length === 0 && <p className="px-4 py-5 text-center text-text-secondary">{empty}</p>}
    {logs.map(log => (
      <div key={log.id} className="px-4 py-3 border-b border-border last:border-b-0">
        <div className="flex justify-between gap-2">
          <span className="font-semibold">{who(log)}</span>
          <span className="text-[15px] text-text-secondary text-right">
            {isToday(log.out_time)
              ? `${timeLabel(log.in_time)} – ${timeLabel(log.out_time)}`
              : relativeLabel(log.in_time)}
          </span>
        </div>
        {visiting(log) && <p className="text-[15px] text-text-secondary">{visiting(log)}</p>}
      </div>
    ))}
  </Card>
)

export default GateLog
