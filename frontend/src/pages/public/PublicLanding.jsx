import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Check, MapPin, Phone, MessageCircle } from 'lucide-react'
import PublicNav from '../../components/public/PublicNav'
import EnquiryForm from '../../components/public/EnquiryForm'
import { pg, formatPhone, fullAddress } from '../../content/pg'
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
const useBusinessSchema = () => {
  useEffect(() => {
    const cheapest = Math.min(...pg.tiers.map((t) => t.seatRent))
    const dearest = Math.max(...pg.tiers.map((t) => t.seatRent))

    const schema = {
      '@context': 'https://schema.org',
      '@type': 'LodgingBusiness',
      name: pg.name,
      description: pg.tagline,
      telephone: `+91${pg.phone}`,
      priceRange: `₹${cheapest}–₹${dearest} per seat per month`,
      address: {
        '@type': 'PostalAddress',
        streetAddress: pg.address.line1,
        addressLocality: pg.address.locality || pg.address.city,
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
  }, [])
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

const RoomsPricing = () => (
  <Section
    id="rooms"
    tint
    title="Rooms & rent"
    lead="Rent is per seat, per month. Pick the room type, not the room."
  >
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {pg.tiers.map((tier) => (
        <div key={tier.name} className="bg-bg border border-border rounded-xl p-5 flex flex-col">
          <p className="font-heading font-bold text-text-primary">{tier.name}</p>
          <p className="text-sm text-text-secondary mt-0.5">
            {tier.floor} · {tier.capacity} seats
          </p>

          <p className="mt-4 text-3xl font-heading font-bold text-text-primary">
            ₹{tier.seatRent.toLocaleString('en-IN')}
            <span className="text-base font-body font-normal text-text-secondary"> / seat / month</span>
          </p>

          {tier.acCharge != null && (
            <p className="text-sm text-text-secondary mt-1">
              + ₹{tier.acCharge.toLocaleString('en-IN')} a month if you use the AC
            </p>
          )}

          <p className="text-sm text-text-secondary mt-4 pt-4 border-t border-border">{tier.note}</p>
        </div>
      ))}
    </div>

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
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress())}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent font-medium hover:underline text-sm"
            >
              Open in Maps
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
  useBusinessSchema()

  return (
    <div className="min-h-screen bg-bg">
      <PublicNav />
      <Hero />
      <Intro />
      <RoomsPricing />
      <Amenities />
      <PhotoGallery />
      <Rules />
      <Visit />
      <Footer />
    </div>
  )
}

export default PublicLanding
