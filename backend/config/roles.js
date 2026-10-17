/**
 * roles.js — canonical role vocabulary.
 *
 * These strings MUST stay in sync with the `user_role` enum in Postgres
 * (see backend/seed.sql). Routes import the permission groups below instead
 * of writing role strings inline — a typo like 'gatekeper' then fails at
 * server start rather than silently locking everyone out of an endpoint.
 */
const ROLES = Object.freeze({
  ADMIN: 'admin',
  GATEKEEPER: 'gatekeeper',
  TENANT: 'tenant',  // a resident, reading their OWN record through /me
  VIEWER: 'viewer',  // default for new sign-ups — grants nothing
  STAFF: 'staff',    // legacy enum value, unused — grants nothing
});

/** Full access: money, settings, PII, checkout. */
const ADMIN_ONLY = Object.freeze([ROLES.ADMIN]);

/** Day-to-day desk work: gate log, onboarding, tenant lookup. No financials, no ID scans. */
const ADMIN_OR_GATEKEEPER = Object.freeze([ROLES.ADMIN, ROLES.GATEKEEPER]);

/**
 * The resident-facing portal, and nothing else.
 *
 * A tenant is NOT staff — this group must never appear alongside the two above
 * on the same route. Every endpoint it guards resolves the tenant row from
 * req.user.id and ignores any id in the URL, so holding this role grants a view
 * of exactly one record: your own.
 */
const TENANT_ONLY = Object.freeze([ROLES.TENANT]);

module.exports = { ROLES, ADMIN_ONLY, ADMIN_OR_GATEKEEPER, TENANT_ONLY };
