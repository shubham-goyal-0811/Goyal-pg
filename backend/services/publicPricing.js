/**
 * publicPricing.js — the room prices shown on the public landing page.
 *
 * The `rooms` table is the one place rent lives; the landing page used to keep
 * a hand-copied duplicate in frontend/src/content/pg.js, which meant a price
 * changed in Settings stayed wrong on the website until someone redeployed.
 *
 * Prices change about once a year, so this is cached in memory and only
 * rebuilt when something says it is out of date:
 *
 *   - invalidatePricing() — called by PATCH /rooms/:id, the only route that
 *     writes a price. A change in Settings is on the website on the next visit.
 *   - a 24-hour ceiling — the safety net for edits made straight in the
 *     Supabase dashboard, which this process never hears about.
 *
 * Between rebuilds, public traffic never touches Postgres at all. That matters
 * on the free tier: a stranger's page view can't wake or load the database.
 *
 * In-memory and per-process, like the rate limiter. Right for one instance; a
 * multi-instance deploy would need a shared store or a shorter ceiling.
 */
const supabase = require('../config/supabase');

const MAX_AGE_MS = 24 * 60 * 60 * 1000;

let cached = null;      // { body, builtAt }
let building = null;    // in-flight rebuild, shared by concurrent requests
let generation = 0;     // bumped on invalidation; a rebuild started before it is discarded

/**
 * Collapse rooms into what a family is actually choosing between: how many
 * share, and whether there is AC. Room numbers, occupancy and vacancies are
 * deliberately left out — this is served to anyone.
 *
 * Rooms of the same type normally share a price. If they don't, the lowest is
 * reported and `varies` is set, so the page can say "from ₹X" rather than
 * quote a number some rooms don't match.
 */
const toTiers = (rooms) => {
  const groups = new Map();
  for (const room of rooms) {
    const key = `${room.capacity}-${room.has_ac ? 'ac' : 'nonac'}`;
    const seatRent = Number(room.seat_rent);
    const acCharge = room.has_ac ? Number(room.ac_charge) : null;

    const g = groups.get(key);
    if (!g) {
      groups.set(key, {
        key,
        capacity: room.capacity,
        hasAc: room.has_ac,
        seatRent, seatRentVaries: false,
        acCharge, acChargeVaries: false,
        floors: [room.floor],
      });
      continue;
    }
    if (seatRent !== g.seatRent) g.seatRentVaries = true;
    if (acCharge !== g.acCharge) g.acChargeVaries = true;
    g.seatRent = Math.min(g.seatRent, seatRent);
    if (acCharge !== null) g.acCharge = Math.min(g.acCharge ?? acCharge, acCharge);
    if (!g.floors.includes(room.floor)) g.floors.push(room.floor);
  }

  return [...groups.values()]
    .map((g) => ({ ...g, floors: g.floors.sort((a, b) => a - b) }))
    // Smaller rooms first, and AC before non-AC within a size.
    .sort((a, b) => a.capacity - b.capacity || Number(b.hasAc) - Number(a.hasAc));
};

const build = async () => {
  const { data, error } = await supabase
    .from('rooms')
    .select('floor, capacity, has_ac, seat_rent, ac_charge');
  if (error) throw error;
  return { tiers: toTiers(data ?? []) };
};

const getPricing = async () => {
  if (cached && Date.now() - cached.builtAt < MAX_AGE_MS) return cached.body;

  if (!building) {
    const startedAt = generation;
    const run = build()
      .then((body) => {
        // A price changed while this was reading. What it read may be the old
        // price — don't store it; the next request rebuilds.
        if (startedAt === generation) cached = { body, builtAt: Date.now() };
        return body;
      })
      .finally(() => {
        // Only clear our own slot: an invalidation may already have started a
        // newer rebuild, and that one must stay shareable.
        if (building === run) building = null;
      });
    building = run;
  }

  try {
    return await building;
  } catch (err) {
    // The database is unreachable (paused, cold, network). If what we hold
    // merely aged out, it is still the last thing the database said — serve it.
    // invalidatePricing() drops the copy outright, so this can never serve a
    // price the office has since changed.
    if (cached) return cached.body;
    throw err;
  }
};

const invalidatePricing = () => {
  generation += 1;
  cached = null;
  building = null;
};

module.exports = { getPricing, invalidatePricing };
