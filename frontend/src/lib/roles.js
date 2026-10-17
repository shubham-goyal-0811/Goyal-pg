/**
 * Role vocabulary — mirrors backend/config/roles.js.
 *
 * Client-side role checks are a RENDER HINT only. The API re-checks every
 * request against the database; nothing here is a security boundary.
 */
export const ROLES = Object.freeze({
  ADMIN: 'admin',
  GATEKEEPER: 'gatekeeper',
  TENANT: 'tenant',
  VIEWER: 'viewer',
})

/**
 * May this role use the ADMIN app (/admin/*)?
 *
 * Deliberately not called hasAccess() any more. A tenant has access to the app
 * — just not to this half of it — and the old name made `!hasAccess(role)`
 * read as "no account", which is how tenants would have landed on AccessDenied.
 */
export const isStaff = (role) => role === ROLES.ADMIN || role === ROLES.GATEKEEPER

/** May this role use the RESIDENT portal (/me/*)? */
export const isTenant = (role) => role === ROLES.TENANT

export const isAdmin = (role) => role === ROLES.ADMIN

/**
 * Signed in but promoted to nothing. 'viewer' is where every new Google
 * sign-in lands, so this is true for anyone who hasn't been deliberately
 * granted a role or linked to a tenant record.
 */
export const hasNoRole = (role) => !isStaff(role) && !isTenant(role)
