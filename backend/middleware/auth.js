const supabase = require('../config/supabase');

const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }

  const token = authHeader.split(' ')[1];

  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    // Log server-side; don't hand the raw provider error back to the client.
    if (error) console.warn('[auth] token rejected:', error.message);
    return res.status(401).json({ error: 'Unauthorized' });
  }

  req.user = user;
  next();
};

module.exports = authMiddleware;
