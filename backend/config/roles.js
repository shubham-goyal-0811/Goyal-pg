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
  VIEWER: 'viewer', // default for new sign-ups — grants nothing
  STAFF: 'staff',   // legacy enum value, unused — grants nothing
  TENANT: 'tenant', // legacy enum value, unused — grants nothing
});

/** Full access: money, settings, PII, checkout. */
const ADMIN_ONLY = Object.freeze([ROLES.ADMIN]);

/** Day-to-day desk work: gate log, onboarding, tenant lookup. No financials, no ID scans. */
const ADMIN_OR_GATEKEEPER = Object.freeze([ROLES.ADMIN, ROLES.GATEKEEPER]);

module.exports = { ROLES, ADMIN_ONLY, ADMIN_OR_GATEKEEPER };
