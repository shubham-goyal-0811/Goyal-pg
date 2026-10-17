import { useState } from 'react'
import { Phone, MessageCircle, Check } from 'lucide-react'
import { api } from '../../lib/api'
import { pg, formatPhone } from '../../content/pg'

/**
 * The one thing on the public site that touches the database.
 *
 * It is built to fail gracefully on purpose: if the backend is asleep, down,
 * or rate-limiting, the form collapses into the phone number and WhatsApp
 * link rather than showing a red error and dead-ending someone who was ready
 * to get in touch. A missed enquiry is the most expensive bug this page has.
 */
const EnquiryForm = () => {
  const [form, setForm] = useState({ name: '', phone: '', message: '', website: '' })
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [failed, setFailed] = useState(null)

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    if (sending) return
    setSending(true)
    setFailed(null)
    try {
      await api.post('/enquiries', form)
      setSent(true)
    } catch (err) {
      setFailed(err.message)
    } finally {
      setSending(false)
    }
  }

  const contactLinks = (
    <div className="flex flex-col sm:flex-row gap-3">
      <a
        href={`tel:+91${pg.phone}`}
        className="flex items-center justify-center gap-2 h-[44px] px-5 bg-accent text-surface rounded-md font-semibold hover:opacity-90"
      >
        <Phone size={17} /> {formatPhone(pg.phone)}
      </a>
      {pg.whatsapp && (
        <a
          href={`https://wa.me/91${pg.whatsapp}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 h-[44px] px-5 border border-border rounded-md font-semibold text-text-primary hover:bg-bg"
        >
          <MessageCircle size={17} /> WhatsApp
        </a>
      )}
    </div>
  )

  if (sent) {
    return (
      <div className="bg-surface border border-border rounded-xl p-6">
        <div className="flex items-start gap-3">
          <span className="shrink-0 w-9 h-9 rounded-full bg-success/10 text-success flex items-center justify-center">
            <Check size={18} />
          </span>
          <div>
            <h3 className="font-heading font-bold text-lg text-text-primary">Message sent</h3>
            <p className="text-text-secondary mt-1">
              We'll call you back on {formatPhone(form.phone) || 'the number you gave'}. If it's urgent, ring us directly.
            </p>
          </div>
        </div>
        <div className="mt-5">{contactLinks}</div>
      </div>
    )
  }

  return (
    <div className="bg-surface border border-border rounded-xl p-6">
      <h3 className="font-heading font-bold text-lg text-text-primary">Ask us about a room</h3>
      <p className="text-text-secondary mt-1 mb-5">
        Leave your number and we'll call you back. Or just call — we'd rather talk.
      </p>

      <form onSubmit={submit} className="space-y-4">
        {/* Honeypot. Real people never see this; bots fill every field they find.
            Not display:none — some bots skip those. */}
        <div aria-hidden="true" className="absolute w-px h-px overflow-hidden -left-[9999px]">
          <label htmlFor="website">Leave this empty</label>
          <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off"
            value={form.website} onChange={set('website')} />
        </div>

        <div>
          <label htmlFor="enq-name" className="block text-sm font-medium text-text-primary mb-1.5">
            Your name
          </label>
          <input
            id="enq-name" type="text" required maxLength={80}
            value={form.name} onChange={set('name')}
            className="w-full h-[44px] px-3 bg-bg border border-border rounded-md text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-accent"
          />
        </div>

        <div>
          <label htmlFor="enq-phone" className="block text-sm font-medium text-text-primary mb-1.5">
            Mobile number
          </label>
          <input
            id="enq-phone" type="tel" inputMode="numeric" required maxLength={20}
            value={form.phone} onChange={set('phone')}
            placeholder="10-digit number"
            className="w-full h-[44px] px-3 bg-bg border border-border rounded-md text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-accent"
          />
        </div>

        <div>
          <label htmlFor="enq-message" className="block text-sm font-medium text-text-primary mb-1.5">
            Anything you'd like to ask <span className="text-text-secondary font-normal">(optional)</span>
          </label>
          <textarea
            id="enq-message" rows={3} maxLength={1000}
            value={form.message} onChange={set('message')}
            placeholder="When you'd like to move in, which room, any questions…"
            className="w-full px-3 py-2.5 bg-bg border border-border rounded-md text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-accent resize-y"
          />
        </div>

        <button
          type="submit"
          disabled={sending}
          className="w-full h-[44px] bg-accent text-surface rounded-md font-semibold hover:opacity-90 disabled:opacity-50"
        >
          {sending ? 'Sending…' : 'Send'}
        </button>
      </form>

      {failed && (
        <div className="mt-5 pt-5 border-t border-border">
          <p className="text-text-primary font-medium">{failed}</p>
          <p className="text-text-secondary text-sm mt-1 mb-4">Please reach us directly instead:</p>
          {contactLinks}
        </div>
      )}
    </div>
  )
}

export default EnquiryForm
