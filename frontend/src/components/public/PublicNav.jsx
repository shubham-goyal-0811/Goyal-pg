import { Link } from 'react-router-dom'
import { Phone } from 'lucide-react'
import { pg, formatPhone } from '../../content/pg'

/**
 * Top bar for the public site.
 *
 * No hamburger menu. The page is short enough that a menu would be three links
 * hidden behind a tap — the anchors sit in the bar on desktop and collapse to
 * the one thing that matters on a phone: the call button.
 */
const PublicNav = () => (
  <header className="sticky top-0 z-30 bg-surface border-b border-border">
    <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
      <a href="#top" className="font-heading font-bold text-lg text-accent shrink-0">
        {pg.name}
      </a>

      <nav className="hidden md:flex items-center gap-6 text-text-secondary font-medium">
        <a href="#rooms" className="hover:text-text-primary">Rooms &amp; rent</a>
        <a href="#amenities" className="hover:text-text-primary">What's included</a>
        <a href="#visit" className="hover:text-text-primary">Visit us</a>
      </nav>

      <div className="flex items-center gap-2">
        <a
          href={`tel:+91${pg.phone}`}
          className="flex items-center gap-2 h-[44px] px-4 bg-accent text-surface rounded-md font-semibold hover:opacity-90 transition-opacity"
        >
          <Phone size={17} />
          <span className="hidden sm:inline">{formatPhone(pg.phone)}</span>
          <span className="sm:hidden">Call</span>
        </a>
        <Link
          to="/login"
          className="hidden lg:flex items-center h-[44px] px-4 border border-border rounded-md font-medium text-text-secondary hover:text-text-primary"
        >
          Resident login
        </Link>
      </div>
    </div>
  </header>
)

export default PublicNav
