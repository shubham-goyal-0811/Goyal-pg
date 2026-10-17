import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { isAdmin } from '../lib/roles'
import { api } from '../lib/api'
import { TitleSkeleton, PanelSkeleton } from '../components/Skeleton'
import { Card, Dot, StatusTag, PageTitle } from '../components/ui'
import toast from 'react-hot-toast'

/**
 * Where each tenant's police paperwork has reached. One card per tenant with
 * the three steps as big buttons — tap the one it is at now. No dropdowns.
 */

const STEPS = [
  { value: 'pending', label: 'Pending', tone: 'warning', border: 'border-warning' },
  { value: 'submitted', label: 'Submitted', tone: 'dark', border: 'border-text-primary' },
  { value: 'verified', label: 'Verified', tone: 'success', border: 'border-success' },
]
const ORDER = { pending: 0, submitted: 1, verified: 2 }

const PoliceVerification = () => {
  const { role } = useAuth()
  const admin = isAdmin(role)
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/police-verification')
      // Sorted once, on arrival: what still needs doing comes first. Not
      // re-sorted on every tap, or a card would jump away from under the
      // finger that just changed it.
      .then(res => setRecords(res.slice().sort((a, b) =>
        (ORDER[a.status] ?? 0) - (ORDER[b.status] ?? 0)
        || String(a.tenants?.full_name).localeCompare(String(b.tenants?.full_name)))))
      .catch(() => toast.error("Couldn't load police verification"))
      .finally(() => setLoading(false))
  }, [])

  const setStatus = async (tenantId, status) => {
    const before = records
    setRecords(list => list.map(r => (r.tenant_id === tenantId ? { ...r, status } : r)))
    try {
      await api.patch(`/police-verification/${tenantId}`, { status })
    } catch (err) {
      setRecords(before)
      toast.error(err.message || "Couldn't change the status")
    }
  }

  if (loading) return <div className="flex flex-col gap-3"><TitleSkeleton /><PanelSkeleton count={4} /></div>

  const count = (s) => records.filter(r => r.status === s).length

  return (
    <div className="flex flex-col gap-3 max-w-2xl">
      <PageTitle>Police verification</PageTitle>
      <p className="text-text-secondary px-1 pb-1">
        {count('pending')} pending · {count('submitted')} submitted · {count('verified')} verified
      </p>

      {records.length === 0 && (
        <Card className="px-4 py-7 text-center text-text-secondary">Nobody is living here yet.</Card>
      )}

      {records.map(r => (
        <Card key={r.id} className="px-3 pt-3.5 pb-3 flex flex-col gap-2.5">
          <div className="flex justify-between items-center gap-2 px-1">
            <span className="font-semibold text-[17px]">{r.tenants?.full_name}</span>
            {admin ? (
              <span className="text-text-secondary">Room {r.tenants?.rooms?.room_number}</span>
            ) : (
              <StatusTag tone={STEPS.find(s => s.value === r.status)?.tone ?? 'warning'}>
                {STEPS.find(s => s.value === r.status)?.label ?? r.status}
              </StatusTag>
            )}
          </div>
          {!admin && <p className="text-text-secondary px-1 -mt-1.5">Room {r.tenants?.rooms?.room_number}</p>}

          {admin && (
            <div className="grid grid-cols-[1fr_1.15fr_1fr] gap-1.5" role="radiogroup" aria-label={`Police verification for ${r.tenants?.full_name}`}>
              {STEPS.map(step => {
                const current = r.status === step.value
                return (
                  <button
                    key={step.value}
                    type="button"
                    role="radio"
                    aria-checked={current}
                    onClick={() => !current && setStatus(r.tenant_id, step.value)}
                    className={`h-12 flex items-center justify-center gap-1.5 rounded-lg font-heading text-[15px]
                      ${current
                        ? `border-2 ${step.border} bg-surface text-text-primary font-bold`
                        : 'border border-border bg-bg text-text-secondary font-semibold'}`}
                  >
                    {current && <Dot tone={step.tone} />}
                    {step.label}
                  </button>
                )
              })}
            </div>
          )}
        </Card>
      ))}
    </div>
  )
}

export default PoliceVerification
