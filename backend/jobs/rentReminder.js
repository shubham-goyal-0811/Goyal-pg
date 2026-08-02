const supabase = require('../config/supabase');
const env = require('../config/env');

const TIMEZONE = env.CRON_TIMEZONE;

/** Today's date in the configured timezone, as { year, month, day }. */
const todayInTimezone = () => {
  // en-CA formats as YYYY-MM-DD. Going through Intl rather than new Date()
  // getters keeps this correct on a UTC host, which is what deploys run on.
  const [year, month, day] = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date()).split('-').map(Number);
  return { year, month, day };
};

/**
 * Rent reminder sweep — runs daily.
 *
 * A tenant is due on the same day-of-month they moved in, clamped to the last
 * day of shorter months (plan.md 5.3).
 *
 * NOTE: this does not send anything yet. Web push needs VAPID keys and a table
 * of per-user subscriptions, neither of which exists — so due tenants are
 * logged and nothing reaches the admin's phone. The date logic below is real;
 * only the delivery step is missing.
 */
const runReminderCron = async () => {
  console.log('[rentReminder] running daily check...');
  try {
    const { year, month, day: todayDay } = todayInTimezone();
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

    const { data: tenants, error } = await supabase
      .from('tenants')
      .select('id, full_name, check_in_date, rooms(room_number)')
      .eq('status', 'active');

    if (error) throw error;

    const due = [];

    for (const tenant of tenants) {
      // check_in_date is a DATE column, so it arrives as 'YYYY-MM-DD'. Reading
      // the day off the string avoids new Date() parsing it as UTC midnight and
      // then handing back a local day that can be off by one.
      const checkInDay = Number(String(tenant.check_in_date).slice(8, 10));
      if (!checkInDay) continue;

      const targetDay = Math.min(checkInDay, daysInMonth);

      if (targetDay === todayDay) {
        due.push(`${tenant.full_name}, Room ${tenant.rooms?.room_number ?? '—'}`);
      }
    }

    if (due.length === 0) {
      console.log('[rentReminder] no rent due today.');
      return;
    }

    console.log(`[rentReminder] rent due today for ${due.length} tenant(s) — no delivery configured:`);
    for (const label of due) console.log(`  - Rent for ${label} is due today`);
  } catch (err) {
    console.error('[rentReminder] failed:', err.message);
  }
};

module.exports = runReminderCron;
