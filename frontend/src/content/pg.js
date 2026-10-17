/**
 * ══════════════════════════════════════════════════════════════════════════
 *  EVERYTHING THE PUBLIC SEES LIVES IN THIS FILE. EDIT HERE, NOT IN THE JSX.
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
 * The cost is that prices live in two places: here, and in the `rooms` table
 * that actually bills people. They change about once a year. That's an
 * acceptable trade for a page that can't fail — but when you change a rent,
 * change it in BOTH.
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

  // ← EDIT — bare 10 digits, no +91. Used for tel: and WhatsApp links.
  phone: '9999999999',
  // Set to null to hide the WhatsApp button entirely.
  whatsapp: '9999999999',
  email: null, // ← EDIT or leave null

  // Plain sentences, not marketing. Shown under the hero.
  intro: [
    'We have been running this PG for families who want somewhere safe and simple for their daughter to live while she studies or works.',
    'Rooms are shared, rent is per seat, and there are no hidden charges — you pay rent, an AC charge if you want AC, and your share of the electricity actually used in your room.',
    // Said up front, because it is the first thing families ask on a visit.
    'Meals are not provided. Residents cook for themselves in the shared kitchen on the first floor, and wash their own clothes — there is no washing machine.',
  ],

  /**
   * Public pricing, grouped by what a person is actually choosing between —
   * not one card per room. Keep in sync with the `rooms` table.
   *
   * `note` is where the honest caveat goes. Don't delete it to make a tier
   * look better.
   */
  tiers: [
    {
      name: '3-sharing, AC',
      seatRent: 5000,
      acCharge: 1000,
      capacity: 3,
      floor: 'First floor',
      note: 'AC is optional — pay the AC charge only if you want it on.',
    },
    {
      name: '3-sharing, non-AC',
      seatRent: 4500,
      acCharge: null,
      capacity: 3,
      floor: 'First floor',
      note: 'Ceiling fan and cross-ventilation.',
    },
    {
      name: '6-sharing, AC',
      seatRent: 4000,
      acCharge: 1000,
      capacity: 6,
      floor: 'Terrace',
      note: 'The cheapest option, and the largest room.',
    },
  ],

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
