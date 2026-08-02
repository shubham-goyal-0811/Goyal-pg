/**
 * Role vocabulary — mirrors backend/config/roles.js.
 *
 * Client-side role checks are a RENDER HINT only. The API re-checks every
 * request against the database; nothing here is a security boundary.
 */
export const ROLES = Object.freeze({
  ADMIN: 'admin',
  GATEKEEPER: 'gatekeeper',
  VIEWER: 'viewer',
})

/**
 * May this role use the app at all?
 *
 * 'viewer' is the default every new Google sign-in lands on, so this is false
 * for anyone who hasn't been deliberately promoted.
 */
export const hasAccess = (role) => role === ROLES.ADMIN || role === ROLES.GATEKEEPER

export const isAdmin = (role) => role === ROLES.ADMIN
