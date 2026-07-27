const supabase = require('../config/supabase');

// Dummy implementation since we don't have production domain/vapid keys yet
const runReminderCron = async () => {
  console.log('Running daily rent reminder check...');
  try {
    const today = new Date();
    const todayDay = today.getDate();
    const currentMonthLength = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();

    const { data: tenants, error } = await supabase
      .from('tenants')
      .select('id, full_name, room_id, check_in_date, rooms(room_number)')
      .eq('status', 'active');

    if (error) throw error;

    for (const tenant of tenants) {
      const checkInDate = new Date(tenant.check_in_date);
      let targetDay = checkInDate.getDate();

      // Clamp to month length
      if (targetDay > currentMonthLength) {
        targetDay = currentMonthLength;
      }

      if (targetDay === todayDay) {
        const message = `Rent for ${tenant.full_name}, Room ${tenant.rooms.room_number} is due today`;
        console.log(`[PUSH NOTIFICATION TRIGGERED]: ${message}`);
        
        // In real implementation: 
        // 1. Fetch user subscriptions from DB
        // 2. webpush.sendNotification(subscription, JSON.stringify({ title: 'Rent Due', body: message }))
      }
    }
  } catch (err) {
    console.error('Error running reminder cron:', err);
  }
};

module.exports = runReminderCron;
