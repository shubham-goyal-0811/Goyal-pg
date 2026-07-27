const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const authMiddleware = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');

router.use(authMiddleware);
router.use(roleCheck('admin'));

router.get('/', async (req, res) => {
  try {
    const { data: settings, error } = await supabase
      .from('settings')
      .select('*')
      .single();

    if (error) throw error;
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/', async (req, res) => {
  const { electricity_rate_per_unit, total_parking_spots } = req.body;
  try {
    // Assuming there's only one settings row with id = 1
    const { data: settings, error } = await supabase
      .from('settings')
      .update({ electricity_rate_per_unit, total_parking_spots, updated_at: new Date().toISOString() })
      .eq('id', 1)
      .select()
      .single();

    if (error) throw error;
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
