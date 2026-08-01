const supabase = require('../config/supabase');
const { ROLES } = require('../config/roles');

const KNOWN_ROLES = new Set(Object.values(ROLES));

/**
 * roleCheck(allowedRoles) — gate a route on the caller's DB role.
 *
 * Must run AFTER authMiddleware (it needs req.user).
 * Place it BEFORE validateId() so an unauthorized caller gets 403, not 400.
 */
const roleCheck = (allowedRoles) => {
  // Validate at wire-up time so mistakes crash the server on boot instead of
  // degrading silently per-request. A bare string used to "work" here because
  // String.prototype.includes does substring matching — 'admin'.includes('adm')
  // is true — so roleCheck('admin') was a latent bypass.
  if (!Array.isArray(allowedRoles) || allowedRoles.length === 0) {
    throw new TypeError('roleCheck: expected a non-empty array of roles');
  }
  const unknown = allowedRoles.filter((r) => !KNOWN_ROLES.has(r));
  if (unknown.length) {
    throw new TypeError(`roleCheck: unknown role(s) [${unknown.join(', ')}] — not in the user_role enum`);
  }

  const allowed = new Set(allowedRoles);

  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      // Look up by auth uid — public.users.id mirrors auth.users.id, and this
      // is the same key the frontend resolves its role by. Looking up by email
      // instead lets the two diverge if an auth user is deleted and recreated.
      const { data: userData, error } = await supabase
        .from('users')
        .select('role')
        .eq('id', req.user.id)
        .single();

      if (error || !userData) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      if (!allowed.has(userData.role)) {
        // Deliberately vague — don't advertise the role vocabulary to callers.
        return res.status(403).json({ error: 'Forbidden' });
      }

      req.user.role = userData.role;
      next();
    } catch (err) {
      console.error('[roleCheck]', err.message);
      res.status(500).json({ error: 'Internal server error checking roles' });
    }
  };
};

module.exports = roleCheck;
