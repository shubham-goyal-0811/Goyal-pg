/**
 * ══════════════════════════════════════════════════════════════════════════
 *  EVERYTHING THE PUBLIC SEES LIVES IN THIS FILE — EXCEPT THE PRICES.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Why this is a plain file and not an API call:
 *
 * The landing page is the one page that must never be down. Supabase's free
 * tier PAUSES a project after 7 days without activity — and a prospective
 * tenant finding the site is exactly the moment nobody has been using the
 * admin app. A database-backed brochure renders blank in precisely the
 * scenario it exists for.
 *
 * Prices are the one exception. They come from the `rooms` table via
 * GET /public/pricing, so a rent changed in Settings is on the website on the
 * next visit, with no redeploy. That endpoint is cached in the backend's
 * memory and rarely touches the database; if it can't answer at all, the page
 * says "call for current rent" rather than guessing — see RoomsPricing in
 * pages/public/PublicLanding.jsx.
 *
 * ── TODO before going live ────────────────────────────────────────────────
 *   1. Replace every value marked  ← EDIT  below.
 *   2. Drop real photos into  frontend/public/photos/  and list them in
 *      `photos`. The gallery renders nothing at all while that list is empty,
 *      so an unfinished site looks deliberate rather than broken.
 */

export const pg = {
  name: 'Goyal PG',
  tagline: 'A girls\' PG in a quiet residential lane in Bathinda — your own kitchen to cook in, hot water, and a gate that is actually watched.',

  // Used in the hero, the footer, the map link and the JSON-LD business listing.
  // The hero shows `locality, city`, so keep locality to the road/area name.
  address: {
    line1: '21170, Street Number 7',
    locality: 'Ajit Rd, BTI',
    city: 'Bathinda',
    state: 'Punjab',
    pincode: '151001',
  },

  // Directions to the Google Maps listing itself. A plain address search can
  // drop the pin on the wrong house; this one can't. Origin is left empty so
  // Maps starts from the visitor's own location.
  mapsUrl: 'https://www.google.com/maps/dir//Goyal+PG,+21170,+street+number+7,+Ajit+Rd,+BTI,+Bathinda,+Punjab+151001/data=!4m6!4m5!1m1!4e2!1m2!1m1!1s0x391732a4154d1d33:0xbe03be4a58088605',

  // ← EDIT — bare 10 digits, no +91. Used for tel: and WhatsApp links.
  phone: '9999999999',
  // Set to null to hide the WhatsApp button entirely.
  whatsapp: '9999999999',
  email: null, // ← EDIT or leave null

  // Plain sentences, not marketing. Shown under the hero.
  intro: [
    'We have been running this PG for families who want somewhere safe and simple for their daughter to live while she studies or works.',
    'Rooms are shared, rent is per seat, and there are no hidden charges — you pay rent, an AC charge where one applies, and your share of the electricity actually used in your room.',
    // Said up front, because it is the first thing families ask on a visit.
    'Meals are not provided. Residents cook for themselves in the shared kitchen on the first floor, and wash their own clothes — there is no washing machine.',
  ],

  /**
   * Optional words under a room type's price. Prices, seats, floors and the AC
   * line are all generated from the database; this is only for the sentence a
   * person would add when showing a family round.
   *
   * Keyed by the type the API reports: '<seats>-ac' or '<seats>-nonac', e.g.
   *   '6-ac': 'The largest room, with its own balcony.',
   * A type with no entry just shows no note. A note for a type that no longer
   * exists is ignored.
   */
  roomNotes: {},

  // Shown next to the prices so nobody is surprised on the first bill.
  billingNotes: [
    'Rent is per seat, per month, from the date you move in.',
    'Electricity is metered per room and split between whoever was living in it — you are not charged for a period before you arrived.',
    'No brokerage. No maintenance charge.',
  ],

  /**
   * Keep this honest — an amenity list that overpromises is the fastest way to
   * lose a family on the day they visit. Remove anything not actually offered.
   */
  amenities: [
    { label: 'Wi-Fi', detail: 'Shared broadband throughout the building' },
    { label: 'Shared kitchen', detail: 'On the first floor — residents cook their own meals' },
    { label: 'Hot water', detail: 'Geyser in every bathroom' },
    { label: 'Power backup', detail: 'Inverter for fans and lights' },
    { label: 'Watched gate', detail: 'Entry and exit logged, visitors recorded' },
    { label: 'Parking', detail: 'Two-wheeler space, subject to availability' },
  ],

  // House rules, stated plainly. Parents read this section first.
  rules: [
    'Gate closes at 10:00 pm. Later than that, tell us in advance.',
    'Visitors are signed in at the gate and are not allowed in the rooms.',
    'Police verification is completed for every resident — we handle the paperwork.',
  ],

  /**
   * ← EDIT — put files in frontend/public/photos/ and list them here.
   * Empty array = the gallery section is not rendered at all.
   *
   * Compress before adding: ~1600px wide, JPEG ~75%. These load on phones.
   */
  photos: [
    // { src: '/photos/room-3-sharing.jpg', alt: 'A three-sharing room with three beds' },
    // { src: '/photos/kitchen.jpg',        alt: 'The shared kitchen on the first floor' },
    // { src: '/photos/terrace.jpg',        alt: 'The terrace room' },
  ],
}

/** '9999999999' → '99999 99999'. Easier to read and to dictate over a phone. */
export const formatPhone = (digits) =>
  typeof digits === 'string' && digits.length === 10
    ? `${digits.slice(0, 5)} ${digits.slice(5)}`
    : digits

export const fullAddress = () => {
  const { line1, locality, city, state, pincode } = pg.address
  return [line1, locality, city, state, pincode].filter(Boolean).join(', ')
}
