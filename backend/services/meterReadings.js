const supabase = require('../config/supabase');

/**
 * The most recent reading at or before `readingDate` for a room, or null.
 * Ordered by id as well as date so same-day readings resolve by insertion
 * order rather than arbitrarily.
 */
const findPriorReading = async (roomId, readingDate) => {
  const { data, error } = await supabase
    .from('meter_readings')
    .select('reading_value, reading_date')
    .eq('room_id', roomId)
    .lte('reading_date', readingDate)
    .order('reading_date', { ascending: false })
    .order('id', { ascending: false })
    .limit(1);

  if (error) throw error;
  return data?.[0] ?? null;
};

/** The earliest reading after `readingDate` for a room, or null. */
const findNextReading = async (roomId, readingDate) => {
  const { data, error } = await supabase
    .from('meter_readings')
    .select('reading_value, reading_date')
    .eq('room_id', roomId)
    .gt('reading_date', readingDate)
    .order('reading_date', { ascending: true })
    .order('id', { ascending: true })
    .limit(1);

  if (error) throw error;
  return data?.[0] ?? null;
};

/**
 * Ids of the tenants living in a room on `date`: moved in by then and not yet
 * moved out. Worked out from the dates rather than today's status, because a
 * reading is often entered late — the end-of-September reading typed in on
 * 17 October must be charged to who was there in September, not to whoever
 * has moved in since. For a reading dated today it gives the same answer as
 * "active right now".
 */
const tenantsPresentOn = async (roomId, date) => {
  const { data, error } = await supabase
    .from('tenants')
    .select('id, status, check_out_date')
    .eq('room_id', roomId)
    .lte('check_in_date', date);

  if (error) throw error;
  return data
    .filter(t => (t.check_out_date ? t.check_out_date > date : t.status === 'active'))
    .map(t => t.id);
};

/**
 * Guard against a reading lower than the one before it.
 *
 * A lower value means the meter was reset or replaced — or, far more likely, a
 * digit was mistyped. calculateElectricityCharges skips any period that runs
 * backwards, so an unchecked typo doesn't fail loudly; it quietly drops a
 * month's consumption from the bill. Catching it at the point of entry is the
 * difference between an error the admin can act on and a bill that is simply
 * wrong.
 *
 * Returns an error message string, or null when the reading is acceptable.
 */
const rejectionIfBackwards = async (roomId, readingDate, readingValue) => {
  const prior = await findPriorReading(roomId, readingDate);
  if (!prior || Number(readingValue) >= prior.reading_value) return null;

  return `Reading ${readingValue} is lower than the previous reading of ${prior.reading_value} on ${prior.reading_date}. `
       + 'Check the value — if the meter really was reset or replaced, resubmit with allow_lower set to true.';
};

module.exports = { findPriorReading, findNextReading, tenantsPresentOn, rejectionIfBackwards };
