const supabase = require('../config/supabase');

const roleCheck = (requiredRole) => {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized - No user object found' });
    }

    try {
      const { data: userData, error } = await supabase
        .from('users')
        .select('role')
        .eq('email', req.user.email) // Linking by email as it's from Google OAuth
        .single();

      if (error || !userData) {
        return res.status(403).json({ error: 'User record not found in database or forbidden.' });
      }

      if (userData.role !== requiredRole) {
        return res.status(403).json({ error: `Forbidden - Requires ${requiredRole} role` });
      }

      req.user.role = userData.role;
      next();
    } catch (err) {
      res.status(500).json({ error: 'Internal server error checking roles' });
    }
  };
};

module.exports = roleCheck;
