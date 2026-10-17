import { useEffect } from 'react'
import { Link } from 'react-router-dom'

/**
 * The office app's building blocks.
 *
 * Built for the two people who run the PG: older eyes, a thumb on a phone.
 * Body text 16–17px and never under 14px, tap targets 48px, a label above
 * every field, Yes/No buttons instead of checkboxes.
 *
 * Button size follows how often the action is used. Primary (berry, 56px) is
 * the one thing a screen is for — "Mark paid", "Make bills" — so there is at
 * most one per screen or section. Rare or risky actions are outlined and sit
 * at the bottom.
 */

const BUTTON = {
  primary: 'bg-accent text-surface border-0 font-bold text-[17px]',
  secondary: 'bg-surface text-text-primary border border-text-primary font-semibold text-base',
  quiet: 'bg-surface text-text-primary border border-border font-semibold text-base',
}

// Kept apart from the variant so a caller never has to fight a height class.
const SIZE = { lg: 'h-14', md: 'h-12', sm: 'h-11', dialog: 'h-[52px]' }

export const buttonCls = (variant = 'secondary', size, className = '') =>
  `inline-flex items-center justify-center gap-2 px-4 rounded-lg font-heading
   disabled:opacity-50 disabled:cursor-not-allowed transition-opacity
   ${BUTTON[variant]} ${SIZE[size || (variant === 'primary' ? 'lg' : 'md')]} ${className}`

export const Button = ({ variant = 'secondary', size, className = '', type = 'button', ...props }) => (
  <button type={type} className={buttonCls(variant, size, className)} {...props} />
)

/** Same look as Button, for navigation. */
export const ButtonLink = ({ variant = 'secondary', size, className = '', ...props }) => (
  <Link className={buttonCls(variant, size, className)} {...props} />
)

/** Underlined text button for things that are needed now and then. */
export const TextButton = ({ className = '', type = 'button', ...props }) => (
  <button
    type={type}
    className={`h-11 px-1 font-heading font-semibold text-[15px] text-text-primary underline underline-offset-4 disabled:opacity-50 ${className}`}
    {...props}
  />
)

// ── Status ───────────────────────────────────────────────────────────────────
// The word carries the meaning; the colour only supports it. Text stays dark
// because amber text on white is about 3:1 — the colour goes on the border
// and the dot instead.
const TONES = {
  success: { border: 'border-success', dot: 'bg-success' },
  warning: { border: 'border-warning', dot: 'bg-warning' },
  dark:    { border: 'border-text-primary', dot: 'bg-text-primary' },
  muted:   { border: 'border-border', dot: 'border-[1.5px] border-text-secondary', text: 'text-text-secondary' },
  new:     { border: 'border-text-primary', dot: 'border-[1.5px] border-text-primary' },
}

export const Dot = ({ tone = 'warning', className = '' }) => {
  const t = TONES[tone]
  return <span aria-hidden="true" className={`inline-block w-2 h-2 rounded-full shrink-0 box-border ${t.dot} ${className}`} />
}

export const StatusTag = ({ tone, children }) => {
  const t = TONES[tone]
  return (
    <span className={`inline-flex items-center gap-1.5 h-7 px-2.5 border rounded-lg bg-surface font-heading font-semibold text-sm whitespace-nowrap ${t.border} ${t.text || 'text-text-primary'}`}>
      <Dot tone={tone} />
      {children}
    </span>
  )
}

/** Rent status as it comes off the API: 'paid' | 'pending' | 'none'. */
export const RentTag = ({ status }) => {
  if (status === 'paid') return <StatusTag tone="success">Paid</StatusTag>
  if (status === 'none' || !status) return <StatusTag tone="muted">No bill</StatusTag>
  return <StatusTag tone="warning">Pending</StatusTag>
}

/** A short amber note — a missing reading, a check the admin should make. */
export const Notice = ({ children, boxed = false, className = '' }) => (
  <div className={`flex gap-2.5 ${boxed ? 'p-3 border border-warning rounded-lg' : ''} ${className}`}>
    <Dot tone="warning" className="mt-2" />
    <div>{children}</div>
  </div>
)

// ── Layout ───────────────────────────────────────────────────────────────────
// One card per topic: white, 1px border, 10px corners, no shadow.
export const Card = ({ className = '', children, ...props }) => (
  <div className={`bg-surface border border-border rounded-[10px] ${className}`} {...props}>{children}</div>
)

export const CardTitle = ({ className = '', children }) => (
  <h2 className={`font-heading font-bold text-lg ${className}`}>{children}</h2>
)

export const PageTitle = ({ children, className = '' }) => (
  <h1 className={`font-heading font-bold text-[26px] md:text-[30px] leading-tight px-1 ${className}`}>{children}</h1>
)

/** Label on top, value under it. Used for profile and settings read-outs. */
export const InfoRow = ({ label, children }) => (
  <div className="flex flex-col px-4 py-2.5 border-t border-border lg:grid lg:grid-cols-[140px_1fr] lg:gap-3 lg:px-5">
    <span className="text-sm lg:text-[15px] text-text-secondary">{label}</span>
    <span className="text-[17px] lg:text-base break-words">{children}</span>
  </div>
)

// ── Forms ────────────────────────────────────────────────────────────────────
export const inputCls = (error = false, className = '') =>
  `w-full h-[52px] px-3 rounded-lg text-[17px] text-text-primary placeholder:text-text-secondary
   focus:outline-2 focus:outline-text-primary focus:outline-offset-2
   disabled:opacity-60 ${error ? 'border-2 border-warning bg-surface' : 'border border-border bg-bg'} ${className}`

/**
 * Label above, then the control, then a hint or an error. The error replaces
 * the hint and says what is wrong in plain words — "This has 9 digits".
 */
export const Field = ({ label, hint, error, children, className = '' }) => (
  <label className={`flex flex-col gap-1.5 ${className}`}>
    <span className="font-heading font-semibold text-base">{label}</span>
    {children}
    {error ? (
      <span className="flex gap-2 items-start text-[15px] font-medium">
        <Dot tone="warning" className="mt-[7px]" />{error}
      </span>
    ) : hint ? (
      <span className="text-sm text-text-secondary">{hint}</span>
    ) : null}
  </label>
)

/** Two big buttons instead of a checkbox. `value` is a boolean. */
export const YesNo = ({ label, hint, value, onChange, disabled = false }) => {
  const opt = (selected) =>
    `h-[52px] rounded-lg font-heading text-[17px] ${selected
      ? 'bg-text-primary text-surface border-2 border-text-primary font-bold'
      : 'bg-bg text-text-secondary border border-border font-semibold'} disabled:cursor-not-allowed`
  return (
    <div className="flex flex-col gap-2" role="radiogroup" aria-label={label}>
      <span className="font-heading font-semibold text-base">{label}</span>
      {hint && <span className="text-sm text-text-secondary -mt-1.5">{hint}</span>}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" role="radio" aria-checked={value === true} disabled={disabled} onClick={() => onChange(true)} className={opt(value === true)}>Yes</button>
        <button type="button" role="radio" aria-checked={value === false} disabled={disabled} onClick={() => onChange(false)} className={opt(value === false)}>No</button>
      </div>
    </div>
  )
}

// ── Dialog ───────────────────────────────────────────────────────────────────
/**
 * Asks before anything that is hard to undo. Replaces window.confirm, whose
 * tiny system dialog is easy to dismiss without reading. "Go back" comes first
 * and the confirm button is outlined, never berry — saying yes should take a
 * moment's thought.
 */
export const ConfirmDialog = ({ title, children, confirmLabel, onConfirm, onCancel, busy = false }) => {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel, busy])

  return (
    <div
      className="fixed inset-0 z-50 bg-text-primary/55 flex items-end sm:items-center justify-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
      onClick={() => !busy && onCancel()}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        className="bg-surface rounded-[10px] p-5 flex flex-col gap-3 w-full max-w-md"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="font-heading font-bold text-[21px] leading-snug">{title}</h2>
        <div className="text-base">{children}</div>
        <div className="grid grid-cols-2 gap-2.5 mt-1.5">
          <Button variant="quiet" size="dialog" onClick={onCancel} disabled={busy}>Go back</Button>
          <Button size="dialog" onClick={onConfirm} disabled={busy}>
            {busy ? 'Working...' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}

/** Chevron used on tappable list rows. */
export const ChevronRight = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-secondary shrink-0" aria-hidden="true">
    <path d="m9 18 6-6-6-6" />
  </svg>
)
