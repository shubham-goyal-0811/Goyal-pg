const supabase = require('../config/supabase');

// The rate lives in a single-row table and changes maybe once a year, but
// generating rent walks every room — so without this, a month-end run re-reads
// the same row repeatedly. Short TTL keeps a Settings edit from going unnoticed
// for long; routes/settings.js busts it explicitly on save.
const RATE_TTL_MS = 60_000;
let _rateCache = { value: null, expiresAt: 0 };

const getElectricityRate = async () => {
  if (_rateCache.value !== null && _rateCache.expiresAt > Date.now()) {
    return _rateCache.value;
  }

  const { data: settings, error } = await supabase
    .from('settings')
    .select('electricity_rate_per_unit')
    .single();

  if (error) throw error;

  _rateCache = { value: Number(settings.electricity_rate_per_unit), expiresAt: Date.now() + RATE_TTL_MS };
  return _rateCache.value;
};

/** Drop the cached rate — call after the rate is edited in Settings. */
const invalidateRateCache = () => { _rateCache = { value: null, expiresAt: 0 }; };

/**
 * First day of the month AFTER the given 'YYYY-MM', as 'YYYY-MM-DD'.
 * Deliberately string arithmetic: `new Date('2026-08-01')` parses as UTC
 * midnight but getMonth/setMonth read and write in the server's local zone, so
 * the previous implementation's result depended on the host's timezone.
 */
const firstOfNextMonth = (billingMonthString) => {
  const [y, m] = billingMonthString.split('-').map(Number);
  const year = m === 12 ? y + 1 : y;
  const month = m === 12 ? 1 : m + 1;
  return `${year}-${String(month).padStart(2, '0')}-01`;
};

/**
 * Split a room's electricity consumption across the tenants who lived there.
 *
 * Each consecutive pair of meter readings defines a period; the units burned in
 * that period are billed to whoever `active_tenant_ids` says was present at the
 * closing reading, split evenly. See plan.md 5.2.
 *
 * Returns { charges, periods, units, anomalies, reason }. `charges` maps tenant
 * id -> rupees. `reason` is non-null when nothing could be billed, so the caller
 * can warn instead of silently writing a zero bill.
 */
const calculateElectricityCharges = async (roomId, billingMonthString) => {
  const startDate = `${billingMonthString}-01`;
  const endDate = firstOfNextMonth(billingMonthString);

  // NOTE: no lower bound on the query. The period being billed OPENS with the
  // previous month's closing reading, which by definition sits before the 1st.
  // Filtering from startDate dropped it, so any room whose readings weren't
  // taken exactly on the 1st billed Rs0 for every month after its first.
  const { data: allReadings, error } = await supabase
    .from('meter_readings')
    .select('id, reading_date, reading_value, active_tenant_ids')
    .eq('room_id', roomId)
    .lte('reading_date', endDate)
    .order('reading_date', { ascending: true })
    // Tie-break on id (serial, so insertion order). Two readings can share a
    // date when a tenant checks out on a day a routine reading was already
    // taken; without this their order — and therefore which tenant set pays
    // for which period — is whatever Postgres happens to return.
    .order('id', { ascending: true });

  if (error) throw error;

  const nothing = (reason) => ({ charges: {}, periods: 0, units: 0, anomalies: 0, reason });

  if (!allReadings || allReadings.length === 0) return nothing('no_readings');

  // Anchor on the latest reading at or before the 1st. That reading closed the
  // previous month and opens this one, so consumption is neither double-billed
  // nor dropped in the gap between months.
  let anchor = -1;
  for (let i = 0; i < allReadings.length; i++) {
    if (allReadings[i].reading_date <= startDate) anchor = i;
    else break;
  }
  const readings = allReadings.slice(anchor === -1 ? 0 : anchor);

  if (readings.length < 2) return nothing('insufficient_readings');

  const rate = await getElectricityRate();

  // Accumulate in paise as integers. Splitting in rupees and rounding per
  // tenant at the end doesn't reconcile — Rs300 across 7 tenants rounds to
  // Rs42.86 each, i.e. Rs300.02 collected.
  const paise = {};
  let periods = 0;
  let units = 0;
  let anomalies = 0;

  for (let i = 1; i < readings.length; i++) {
    const prev = readings[i - 1];
    const curr = readings[i];

    const used = curr.reading_value - prev.reading_value;
    if (used < 0) { anomalies++; continue; } // meter reset or replaced

    const tenants = curr.active_tenant_ids || [];
    if (tenants.length === 0) continue; // room stood empty — nobody to bill

    const totalPaise = Math.round(used * rate * 100);
    const ids = [...tenants].sort((a, b) => a - b); // stable, so remainders land predictably
    const base = Math.floor(totalPaise / ids.length);
    let remainder = totalPaise - base * ids.length;

    for (const tenantId of ids) {
      paise[tenantId] = (paise[tenantId] || 0) + base + (remainder-- > 0 ? 1 : 0);
    }

    periods++;
    units += used;
  }

  if (periods === 0) return nothing(anomalies > 0 ? 'reading_went_backwards' : 'no_billable_periods');

  const charges = {};
  for (const [tenantId, p] of Object.entries(paise)) {
    charges[tenantId] = Math.round(p) / 100;
  }

  return { charges, periods, units, anomalies, reason: null };
};

module.exports = {
  calculateElectricityCharges,
  invalidateRateCache,
  firstOfNextMonth
};
