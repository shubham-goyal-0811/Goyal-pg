const supabase = require('../config/supabase');
const { calculateElectricityCharges } = require('./electricity');

const TENANT_BILLING_SELECT = 'id, full_name, room_id, ac_opted, status, check_in_date, rooms(seat_rent, ac_charge)';

/** 'YYYY-MM' with a real month number. */
const isBillingMonth = (s) => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}$/.test(s)) return false;
  const month = Number(s.slice(5));
  return month >= 1 && month <= 12;
};

/** Number of days in a 'YYYY-MM'. UTC so the host's timezone can't shift it. */
const daysInMonth = (billingMonth) => {
  const [y, m] = billingMonth.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

/** Last day of a 'YYYY-MM', as 'YYYY-MM-DD'. */
const lastDayOfMonth = (billingMonth) =>
  `${billingMonth}-${String(daysInMonth(billingMonth)).padStart(2, '0')}`;

/**
 * Days of the month the tenant lived here, counting the day they moved in.
 * 0 when they moved in after the month ended — they owe nothing for it.
 */
const daysStayed = (checkInDate, billingMonth) => {
  const checkIn = String(checkInDate).slice(0, 10);
  const total = daysInMonth(billingMonth);
  if (checkIn.slice(0, 7) > billingMonth) return 0;
  if (checkIn.slice(0, 7) < billingMonth) return total;
  return total - Number(checkIn.slice(8, 10)) + 1;
};

/** A monthly amount cut down to the days stayed, to the nearest rupee. */
const prorate = (amount, days, total) => (days === total ? amount : Math.round((amount * days) / total));

/** Human-readable explanation for why a room produced no electricity charge. */
const WARNING_TEXT = {
  no_readings: 'No meter readings have ever been recorded for this room.',
  insufficient_readings: 'Only one reading available — a period needs an opening and a closing reading.',
  no_billable_periods: 'Readings exist but no tenants were active during any period.',
  reading_went_backwards: 'A reading was lower than the one before it (meter reset or replaced?) — that period was skipped.',
};

/**
 * Build and upsert rent_payments rows for the given tenants.
 *
 * Electricity is calculated once per ROOM rather than once per tenant — the
 * split is a room-level computation, so doing it per tenant re-ran the same
 * meter_readings query for every seat in the room.
 *
 * Rows already marked `paid` are left untouched and reported back, so re-running
 * a month to pick up a late meter reading can't silently reopen a settled bill.
 *
 * Someone who moved in partway through the month pays rent and AC for the days
 * they were here. Someone who moved in after it ended isn't billed at all, and
 * an unpaid bill made for them before that check existed is deleted.
 */
const generateRent = async (allTenants, billingMonth) => {
  const billingMonthDate = `${billingMonth}-01`;
  const monthDays = daysInMonth(billingMonth);

  if (allTenants.length === 0) {
    return { generated: 0, removed: 0, rows: [], skipped: [], warnings: [] };
  }

  const skipped = [];
  const tenants = [];
  for (const t of allTenants) {
    if (daysStayed(t.check_in_date, billingMonth) > 0) tenants.push(t);
    else skipped.push({ tenant_id: t.id, full_name: t.full_name, reason: 'not_moved_in' });
  }

  let removed = 0;
  const notMovedIn = skipped.map(s => s.tenant_id);
  if (notMovedIn.length > 0) {
    const { data: deleted, error: deleteErr } = await supabase
      .from('rent_payments')
      .delete()
      .eq('billing_month', billingMonthDate)
      .eq('status', 'pending')
      .eq('amount_paid', 0)
      .in('tenant_id', notMovedIn)
      .select('id');
    if (deleteErr) throw deleteErr;
    removed = deleted.length;
  }

  if (tenants.length === 0) {
    return { generated: 0, removed, rows: [], skipped, warnings: [] };
  }

  // Which of these are already settled? Don't touch those.
  const { data: existing, error: existingErr } = await supabase
    .from('rent_payments')
    .select('tenant_id, status')
    .eq('billing_month', billingMonthDate)
    .in('tenant_id', tenants.map(t => t.id));

  if (existingErr) throw existingErr;

  const alreadyPaid = new Set((existing || []).filter(p => p.status === 'paid').map(p => p.tenant_id));

  // Group by room so a 3-seater costs one electricity computation, not three.
  const byRoom = new Map();
  for (const t of tenants) {
    if (!byRoom.has(t.room_id)) byRoom.set(t.room_id, []);
    byRoom.get(t.room_id).push(t);
  }

  const warnings = [];
  const rows = [];

  for (const [roomId, roomTenants] of byRoom) {
    const { charges, reason, anomalies } = await calculateElectricityCharges(roomId, billingMonth);

    const problem = reason || (anomalies > 0 ? 'reading_went_backwards' : null);
    if (problem) {
      warnings.push({
        room_id: roomId,
        reason: problem,
        message: WARNING_TEXT[problem] || problem,
        affected_tenants: roomTenants.map(t => t.full_name),
      });
    }

    for (const t of roomTenants) {
      if (alreadyPaid.has(t.id)) {
        skipped.push({ tenant_id: t.id, full_name: t.full_name, reason: 'already_paid' });
        continue;
      }

      const days = daysStayed(t.check_in_date, billingMonth);
      const seat_rent = prorate(Number(t.rooms.seat_rent), days, monthDays);
      const ac_charge = t.ac_opted ? prorate(Number(t.rooms.ac_charge), days, monthDays) : 0;
      const electricity_charge = charges[t.id] ?? 0;

      rows.push({
        tenant_id: t.id,
        billing_month: billingMonthDate,
        seat_rent,
        ac_charge,
        electricity_charge,
        total_amount: Number((seat_rent + ac_charge + electricity_charge).toFixed(2)),
        amount_paid: 0,
        status: 'pending',
        updated_at: new Date().toISOString(),
      });
    }
  }

  if (rows.length === 0) {
    return { generated: 0, removed, rows: [], skipped, warnings };
  }

  // One round-trip for every tenant. Requires the UNIQUE (tenant_id,
  // billing_month) constraint from migration 003.
  const { data: saved, error } = await supabase
    .from('rent_payments')
    .upsert(rows, { onConflict: 'tenant_id,billing_month' })
    .select();

  if (error) throw error;

  return { generated: saved.length, removed, rows: saved, skipped, warnings };
};

module.exports = { generateRent, isBillingMonth, lastDayOfMonth, TENANT_BILLING_SELECT };
