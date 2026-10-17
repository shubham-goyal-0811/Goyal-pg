import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, MapPin, Phone, MessageCircle } from 'lucide-react'
import PublicNav from '../../components/public/PublicNav'
import EnquiryForm from '../../components/public/EnquiryForm'
import { pg, formatPhone, fullAddress } from '../../content/pg'
import { rupees } from '../../lib/format'
import { API_BASE_URL } from '../../lib/env'
import heroImage from '../../assets/hero.png'

/**
 * The public landing page.
 *
 * Every word and number on this screen comes from src/content/pg.js — edit
 * there, not here.
 *
 * Design constraints, deliberately narrow (see plan.md §2):
 *   - no purple/violet/indigo anywhere, no gradients, no glassmorphism
 *   - flat surfaces and 1px borders, never drop-shadow card stacks
 *   - no scroll animations, parallax, counters or carousels
 *   - no emoji as icons, no invented statistics, no testimonials
 *
 * The test it has to pass: a parent on a mid-range Android phone finds the
 * price, the photos and the phone number without scrolling past anything
 * decorative.
 */

/**
 * schema.org LodgingBusiness, built from content/pg.js so the structured data
 * can never drift from what's printed on the page.
 *
 * Injected at runtime rather than hardcoded in index.html for that reason.
 * Google renders JS before reading structured data; link-preview scrapers do
 * not, which is why the plain og: tags stay static in index.html.
 */
const useBusinessSchema = (tiers) => {
  useEffect(() => {
    const rents = (tiers ?? []).map((t) => t.seatRent)
    const cheapest = Math.min(...rents)
    const dearest = Math.max(...rents)

    const schema = {
      '@context': 'https://schema.org',
      '@type': 'LodgingBusiness',
      name: pg.name,
      description: pg.tagline,
      telephone: `+91${pg.phone}`,
      // Only once live prices have loaded. A guessed range in structured data
      // is worse than none: it is what a search result quotes back to people.
      ...(rents.length > 0 && {
        priceRange: cheapest === dearest
          ? `₹${cheapest} per seat per month`
          : `₹${cheapest}–₹${dearest} per seat per month`,
      }),
      address: {
        '@type': 'PostalAddress',
        streetAddress: [pg.address.line1, pg.address.locality].filter(Boolean).join(', '),
        addressLocality: pg.address.city,
        addressRegion: pg.address.state,
        postalCode: pg.address.pincode,
        addressCountry: 'IN',
      },
      amenityFeature: pg.amenities.map((a) => ({
        '@type': 'LocationFeatureSpecification',
        name: a.label,
        value: true,
      })),
    }

    const tag = document.createElement('script')
    tag.type = 'application/ld+json'
    tag.text = JSON.stringify(schema)
    document.head.appendChild(tag)
    return () => { document.head.removeChild(tag) }
  }, [tiers])
}

// ── Live prices ───────────────────────────────────────────────────────────────
// From GET /public/pricing, which the backend answers from memory and refreshes
// whenever a room's price is changed in Settings. See services/publicPricing.js.
//
// The one thing this page must not do is show a price that might be wrong. So
// there is no hard-coded fallback list: if the API hasn't answered within a few
// seconds, the section says "call for current rent" instead, and swaps the real
// prices in if they arrive later.
//
// Deliberately a plain fetch, not lib/api.js or React Query: this needs no
// session, sends no Authorization header, and must not share a cache with the
// signed-in apps.
const SLOW_AFTER_MS = 3000
// A sleeping free-tier backend can take most of a minute to wake. Keep waiting
// that long in the background; the fallback is already on screen meanwhile.
const GIVE_UP_AFTER_MS = 60000

const usePublicPricing = () => {
  const [state, setState] = useState({ tiers: null, slow: false, failed: false })

  useEffect(() => {
    let done = false
    const ctrl = new AbortController()
    const slowTimer = setTimeout(() => setState((s) => ({ ...s, slow: true })), SLOW_AFTER_MS)
    const giveUpTimer = setTimeout(() => ctrl.abort(), GIVE_UP_AFTER_MS)
    const stopTimers = () => { clearTimeout(slowTimer); clearTimeout(giveUpTimer) }

    fetch(`${API_BASE_URL}/public/pricing`, { signal: ctrl.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((body) => {
        if (done) return
        const tiers = Array.isArray(body?.tiers) && body.tiers.length > 0 ? body.tiers : null
        setState({ tiers, slow: false, failed: !tiers })
      })
      .catch(() => { if (!done) setState((s) => ({ ...s, failed: true })) })
      .finally(stopTimers)

    return () => { done = true; ctrl.abort(); stopTimers() }
  }, [])

  return state
}

const FLOOR_NAMES = ['Ground', 'First', 'Second', 'Third', 'Fourth', 'Fifth']

// [1] → 'First floor', [1, 2] → 'First & Second floors'
const floorLabel = (floors) => {
  if (floors.some((f) => !FLOOR_NAMES[f])) return `Floor ${floors.join(' & ')}`
  return `${floors.map((f) => FLOOR_NAMES[f]).join(' & ')} floor${floors.length > 1 ? 's' : ''}`
}

const tierName = (tier) =>
  `${tier.capacity === 1 ? 'Single room' : `${tier.capacity}-sharing`}, ${tier.hasAc ? 'AC' : 'non-AC'}`

// What the AC costs, stated the way the bill will state it.
const acLine = (tier) => {
  if (!tier.hasAc) return null
  if (tier.acChargeVaries) return 'AC charge depends on the room — ask us'
  if (!tier.acCharge) return 'AC included in the rent'
  return `+ ${rupees(tier.acCharge)} a month if you use the AC`
}

const Section = ({ id, title, lead, children, tint = false }) => (
  <section id={id} className={tint ? 'bg-surface border-y border-border' : ''}>
    <div className="max-w-5xl mx-auto px-4 py-14 md:py-20">
      {title && (
        <h2 className="text-2xl md:text-3xl font-heading font-bold text-text-primary">{title}</h2>
      )}
      {lead && <p className="text-text-secondary mt-2 max-w-2xl">{lead}</p>}
      <div className={title ? 'mt-8' : ''}>{children}</div>
    </div>
  </section>
)

const Hero = () => (
  <section id="top" className="bg-surface border-b border-border">
    <div className="max-w-5xl mx-auto px-4 py-12 md:py-16 grid md:grid-cols-2 gap-10 items-center">
      <div>
        <h1 className="text-3xl md:text-4xl font-heading font-bold text-text-primary leading-tight">
          {pg.name}
        </h1>
        <p className="text-lg text-text-secondary mt-3 leading-relaxed">{pg.tagline}</p>

        <div className="flex flex-col sm:flex-row gap-3 mt-7">
          <a
            href={`tel:+91${pg.phone}`}
            className="flex items-center justify-center gap-2 h-[48px] px-6 bg-accent text-surface rounded-md font-semibold hover:opacity-90"
          >
            <Phone size={18} /> {formatPhone(pg.phone)}
          </a>
          <a
            href="#rooms"
            className="flex items-center justify-center h-[48px] px-6 border border-border rounded-md font-semibold text-text-primary hover:bg-bg"
          >
            See rooms &amp; rent
          </a>
        </div>

        <p className="text-sm text-text-secondary mt-4">
          {pg.address.locality}, {pg.address.city}
        </p>
      </div>

      <img
        src={heroImage}
        alt={`Outside ${pg.name}`}
        className="w-full h-56 md:h-72 object-cover rounded-xl border border-border"
      />
    </div>
  </section>
)

const Intro = () => (
  <Section>
    <div className="max-w-2xl space-y-4">
      {pg.intro.map((para, i) => (
        <p key={i} className="text-lg text-text-primary leading-relaxed">{para}</p>
      ))}
    </div>
  </Section>
)

const PricingFallback = () => (
  <div className="bg-bg border border-border rounded-xl p-5 max-w-xl">
    <p className="font-heading font-bold text-text-primary">Call for current rent</p>
    <p className="text-sm text-text-secondary mt-1">
      We couldn't load today's prices just now. Call us and we'll tell you the rent for each room type.
    </p>
    <a
      href={`tel:+91${pg.phone}`}
      className="inline-flex items-center gap-2 mt-4 h-[44px] px-5 bg-accent text-surface rounded-md font-semibold hover:opacity-90"
    >
      <Phone size={18} /> {formatPhone(pg.phone)}
    </a>
  </div>
)

const RoomsPricing = ({ tiers, slow, failed }) => (
  <Section
    id="rooms"
    tint
    title="Rooms & rent"
    lead="Rent is per seat, per month. Pick the room type, not the room."
  >
    {tiers ? (
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {tiers.map((tier) => {
          const note = pg.roomNotes?.[tier.key]
          const ac = acLine(tier)
          return (
            <div key={tier.key} className="bg-bg border border-border rounded-xl p-5 flex flex-col">
              <p className="font-heading font-bold text-text-primary">{tierName(tier)}</p>
              <p className="text-sm text-text-secondary mt-0.5">
                {floorLabel(tier.floors)} · {tier.capacity} {tier.capacity === 1 ? 'seat' : 'seats'}
              </p>

              <p className="mt-4 text-3xl font-heading font-bold text-text-primary">
                {tier.seatRentVaries && (
                  <span className="text-base font-body font-normal text-text-secondary">from </span>
                )}
                {rupees(tier.seatRent)}
                <span className="text-base font-body font-normal text-text-secondary"> / seat / month</span>
              </p>

              {ac && <p className="text-sm text-text-secondary mt-1">{ac}</p>}

              {note && (
                <p className="text-sm text-text-secondary mt-4 pt-4 border-t border-border">{note}</p>
              )}
            </div>
          )
        })}
      </div>
    ) : slow || failed ? (
      <PricingFallback />
    ) : (
      // First ~3 seconds: the shape of the cards, so the page doesn't jump.
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4" aria-hidden="true">
        {[0, 1].map((i) => (
          <div key={i} className="h-44 bg-skeleton rounded-xl animate-skeleton" />
        ))}
      </div>
    )}

    <ul className="mt-8 space-y-2 max-w-2xl">
      {pg.billingNotes.map((note) => (
        <li key={note} className="flex gap-2.5 text-text-secondary">
          <Check size={18} className="text-success shrink-0 mt-0.5" />
          {note}
        </li>
      ))}
    </ul>
  </Section>
)

const Amenities = () => (
  <Section id="amenities" title="What's included" lead="If it isn't on this list, we don't offer it.">
    <div className="grid sm:grid-cols-2 gap-x-8 gap-y-5">
      {pg.amenities.map((item) => (
        <div key={item.label} className="flex gap-3">
          <Check size={18} className="text-success shrink-0 mt-1" />
          <div>
            <p className="font-medium text-text-primary">{item.label}</p>
            <p className="text-sm text-text-secondary">{item.detail}</p>
          </div>
        </div>
      ))}
    </div>
  </Section>
)

// Renders nothing at all until real photos are listed in content/pg.js. An
// empty grid of placeholder boxes looks broken; an absent section looks
// deliberate.
const PhotoGallery = () =>
  pg.photos.length === 0 ? null : (
    <Section tint title="Photos">
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {pg.photos.map((photo) => (
          <img
            key={photo.src}
            src={photo.src}
            alt={photo.alt}
            loading="lazy"
            className="w-full h-52 object-cover rounded-xl border border-border bg-bg"
          />
        ))}
      </div>
    </Section>
  )

const Rules = () => (
  <Section title="House rules" lead="Stated up front so there are no surprises later.">
    <ul className="space-y-3 max-w-2xl">
      {pg.rules.map((rule, i) => (
        <li key={rule} className="flex gap-3 text-text-primary">
          <span className="shrink-0 w-6 h-6 rounded-md bg-bg border border-border text-text-secondary text-sm flex items-center justify-center font-medium">
            {i + 1}
          </span>
          {rule}
        </li>
      ))}
    </ul>
  </Section>
)

const Visit = () => (
  <Section id="visit" tint title="Come and see it" lead="Call first so someone is there to show you around.">
    <div className="grid md:grid-cols-2 gap-8 items-start">
      <div className="space-y-5">
        <div className="flex gap-3">
          <MapPin size={20} className="text-text-secondary shrink-0 mt-0.5" />
          <div>
            <p className="text-text-primary">{fullAddress()}</p>
            <a
              href={pg.mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent font-medium hover:underline text-sm"
            >
              Get directions
            </a>
          </div>
        </div>

        <div className="flex gap-3">
          <Phone size={20} className="text-text-secondary shrink-0 mt-0.5" />
          <a href={`tel:+91${pg.phone}`} className="text-text-primary hover:text-accent font-medium">
            {formatPhone(pg.phone)}
          </a>
        </div>

        {pg.whatsapp && (
          <div className="flex gap-3">
            <MessageCircle size={20} className="text-text-secondary shrink-0 mt-0.5" />
            <a
              href={`https://wa.me/91${pg.whatsapp}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-text-primary hover:text-accent font-medium"
            >
              Message us on WhatsApp
            </a>
          </div>
        )}
      </div>

      <EnquiryForm />
    </div>
  </Section>
)

const Footer = () => (
  <footer className="border-t border-border">
    <div className="max-w-5xl mx-auto px-4 py-8 flex flex-col sm:flex-row justify-between gap-4 text-sm text-text-secondary">
      <div>
        <p className="font-heading font-bold text-text-primary">{pg.name}</p>
        <p className="mt-1">{fullAddress()}</p>
      </div>
      <Link to="/login" className="hover:text-text-primary self-start sm:self-end">
        Resident &amp; staff login
      </Link>
    </div>
  </footer>
)

const PublicLanding = () => {
  const pricing = usePublicPricing()
  useBusinessSchema(pricing.tiers)

  return (
    <div className="min-h-screen bg-bg">
      <PublicNav />
      <Hero />
      <Intro />
      <RoomsPricing {...pricing} />
      <Amenities />
      <PhotoGallery />
      <Rules />
      <Visit />
      <Footer />
    </div>
  )
}

export default PublicLanding
