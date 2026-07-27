const supabase = require('../config/supabase');

const calculateElectricityCharges = async (roomId, billingMonthString) => {
  // billingMonthString expected format: YYYY-MM
  // We need readings from first of this month to first of next month
  const startDate = `${billingMonthString}-01`;
  const nextMonth = new Date(startDate);
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  const endDate = nextMonth.toISOString().substring(0, 10);

  // 1. Fetch all meter_readings for room in this period
  const { data: readings, error: readingsError } = await supabase
    .from('meter_readings')
    .select('*')
    .eq('room_id', roomId)
    .gte('reading_date', startDate)
    .lte('reading_date', endDate)
    .order('reading_date', { ascending: true });

  if (readingsError) throw readingsError;

  if (!readings || readings.length < 2) {
    return {}; // Cannot calculate split without at least 2 readings
  }

  // Fetch settings for rate
  const { data: settings, error: settingsError } = await supabase
    .from('settings')
    .select('electricity_rate_per_unit')
    .single();

  if (settingsError) throw settingsError;
  const rate = settings.electricity_rate_per_unit;

  const accumulatedCharge = {};

  // 2. Iterate through consecutive pairs
  for (let i = 1; i < readings.length; i++) {
    const prevReading = readings[i - 1];
    const currReading = readings[i];

    const units = currReading.reading_value - prevReading.reading_value;
    if (units < 0) continue; // Invalid reading sequence, skip

    const chargeForPeriod = units * rate;
    
    // The active tenants during this period are captured in currReading.active_tenant_ids
    const activeTenants = currReading.active_tenant_ids || [];
    
    if (activeTenants.length > 0) {
      const perTenantCharge = chargeForPeriod / activeTenants.length;

      activeTenants.forEach(tenantId => {
        if (!accumulatedCharge[tenantId]) accumulatedCharge[tenantId] = 0;
        accumulatedCharge[tenantId] += perTenantCharge;
      });
    }
  }

  return accumulatedCharge;
};

module.exports = {
  calculateElectricityCharges
};
