const supabase = require('../config/supabase');
const env = require('../config/env');
const { ROLES } = require('../config/roles');

const KNOWN_ROLES = new Set(Object.values(ROLES));

// ── Role cache ───────────────────────────────────────────────────────────────
// Without this, every single API request costs a SELECT on users just to learn
// something that changes maybe twice a year. Roles are read far more often than
// they are written, so a short TTL removes ~1 DB round-trip per request at the
// cost of a role change taking up to TTL seconds to take effect. Set
// ROLE_CACHE_TTL_MS=0 to disable if you ever need instant revocation.
const ROLE_CACHE_TTL_MS = env.ROLE_CACHE_TTL_MS;
const roleCache = new Map(); // userId -> { role, expiresAt }

const fetchRole = async (userId) => {
  const now = Date.now();
  const hit = roleCache.get(userId);
  if (hit && hit.expiresAt > now) return hit.role;

  const { data, error } = await supabase
    .from('users')
    .select('role')
    .eq('id', userId)
    .single();

  if (error || !data) {
    roleCache.delete(userId);
    return null;
  }

  if (ROLE_CACHE_TTL_MS > 0) {
    // Cheap unbounded-growth guard. Real usage is a handful of staff, but the
    // 'viewer' default means any Google account that signs in gets an entry.
    if (roleCache.size > 500) roleCache.clear();
    roleCache.set(userId, { role: data.role, expiresAt: now + ROLE_CACHE_TTL_MS });
  }
  return data.role;
};

/** Drop a cached role immediately — call after changing someone's role. */
const invalidateRole = (userId) => roleCache.delete(userId);

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
      const role = await fetchRole(req.user.id);

      if (!role || !allowed.has(role)) {
        // Deliberately vague — don't advertise the role vocabulary to callers.
        return res.status(403).json({ error: 'Forbidden' });
      }

      req.user.role = role;
      next();
    } catch (err) {
      console.error('[roleCheck]', err.message);
      res.status(500).json({ error: 'Internal server error checking roles' });
    }
  };
};

module.exports = roleCheck;
module.exports.invalidateRole = invalidateRole;
