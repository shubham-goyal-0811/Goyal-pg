import { useState, useEffect, useCallback } from 'react'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'

/**
 * First-run walkthrough for the office app.
 *
 * The people who run this are not going to read documentation, and the first
 * thing they see otherwise is a grid of room cards with no explanation of what
 * a tap does or where the month's bills come from. This is the thirty seconds
 * that answers that.
 *
 * Deliberately NOT a spotlight tour with arrows pointing at elements. Those
 * break the moment the sidebar collapses on a phone, which is where half of
 * this gets used. A plain sequence of cards says the same thing and cannot
 * point at the wrong place.
 *
 * Nothing here writes to the database or fakes any data — it only describes
 * screens that already exist. Whether it has been seen lives in lib/tour.js, so
 * that check costs nothing when this component is never loaded.
 */

const STEPS = [
  {
    title: 'Welcome to the office app',
    body: [
      'Everything you need to run the PG is on six screens. On a phone, press "Menu" at the top to see them. On a computer they are down the left side.',
      'This walkthrough takes about a minute. You can skip it — "Show me how it works" in the menu brings it back any time.',
    ],
  },
  {
    title: 'Dashboard — who hasn\'t paid, then the rooms',
    body: [
      'The top of the Dashboard lists everyone who hasn\'t paid their latest bill. Tap a name to open their page and mark it paid.',
      'Below that, every room shows its seats. A filled seat has the tenant\'s name; tap the name to open their record.',
      '"Add tenant" at the bottom of a room with a free seat starts adding someone to it.',
      'The tag next to each name is that tenant\'s latest bill — Paid, Pending, or No bill.',
    ],
  },
  {
    title: 'Making the month\'s bills',
    body: [
      'Once a month has ended, a box at the top of the Dashboard asks you to make its bills. The rest of the month, "Make bills" is a link at the bottom.',
      'Do it after that month has ended and its meter readings are recorded, or the electricity share will be missing.',
      'It is safe to press twice. Figures are recalculated, and any month already marked paid is left alone.',
    ],
  },
  {
    title: 'Tenants — the full record',
    body: [
      'Search by name or mobile number.',
      'A tenant\'s page opens on their latest bill, with a big "Mark paid" button. Their ID proof, documents and online access are under "More details".',
      'If the ID number was read wrong from the photo, correct it there — it is what goes on the police form.',
    ],
  },
  {
    title: 'Gate log and Police verification',
    body: [
      'Gate log records who came in and when they left. Press "Add visitor" when someone arrives, then "Mark out" when they leave.',
      'Police verification tracks where each tenant\'s paperwork has reached. Tap Pending, Submitted or Verified to change it.',
    ],
  },
  {
    title: 'Enquiries and Settings',
    body: [
      'Enquiries holds the messages people send from the public website. Mark each one contacted or closed so nobody is answered twice or forgotten.',
      'Settings is where the rent amounts and the electricity rate per unit live. Changing a rate affects bills generated afterwards, not ones already made.',
    ],
  },
  {
    title: 'That is all of it',
    body: [
      'Nothing in this walkthrough changed any data.',
      'To see it again, press "Show me how it works" in the menu.',
    ],
  },
]

const AdminTour = ({ onClose }) => {
  const [step, setStep] = useState(0)
  const last = step === STEPS.length - 1

  const next = useCallback(() => {
    setStep(s => (s === STEPS.length - 1 ? s : s + 1))
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') next()
      if (e.key === 'ArrowLeft') setStep(s => Math.max(0, s - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, next])

  const current = STEPS[step]

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Walkthrough"
      onClick={onClose}
    >
      <div
        className="bg-surface w-full sm:max-w-lg rounded-t-xl sm:rounded-xl border border-border shadow-lg flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 p-5 border-b border-border">
          <div>
            <p className="text-xs text-text-secondary">Step {step + 1} of {STEPS.length}</p>
            <h2 className="text-xl font-heading font-bold text-text-primary mt-1">{current.title}</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close walkthrough"
            className="p-2 -m-1 rounded-md text-text-secondary hover:bg-bg hover:text-text-primary transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-3">
          {current.body.map((line, i) => (
            <p key={i} className="text-text-secondary leading-relaxed">{line}</p>
          ))}
        </div>

        {/* Progress — plain bars, same pattern as the onboarding wizard. */}
        <div className="px-5 flex gap-1.5" aria-hidden="true">
          {STEPS.map((_, i) => (
            <div key={i} className={`h-1 flex-1 rounded-full ${i <= step ? 'bg-accent' : 'bg-border'}`} />
          ))}
        </div>

        <div className="p-5 flex items-center gap-3">
          {step > 0 ? (
            <button
              onClick={() => setStep(s => s - 1)}
              className="flex items-center gap-1 h-[44px] px-4 border border-border rounded-md font-medium text-text-secondary hover:text-text-primary transition-colors"
            >
              <ChevronLeft size={18} /> Back
            </button>
          ) : (
            <button
              onClick={onClose}
              className="h-[44px] px-4 font-medium text-text-secondary hover:text-text-primary transition-colors"
            >
              Skip
            </button>
          )}

          <button
            onClick={last ? onClose : next}
            className="flex items-center justify-center gap-1 h-[44px] px-5 ml-auto bg-accent text-surface rounded-md font-semibold hover:opacity-90 transition-opacity"
          >
            {last ? 'Start using the app' : <>Next <ChevronRight size={18} /></>}
          </button>
        </div>
      </div>
    </div>
  )
}

export default AdminTour
