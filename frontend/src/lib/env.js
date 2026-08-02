/**
 * env.js — validated build-time configuration.
 *
 * Vite picks the file by mode automatically:
 *   npm run dev            -> .env.development, then .env
 *   npm run build          -> .env.production,  then .env
 *   vite build --mode staging -> .env.staging,  then .env
 *
 * Only VITE_-prefixed vars are exposed to the bundle, and they are inlined at
 * BUILD time — changing them on the host after a build has no effect, so a
 * production build must be run with production values present.
 *
 * These previously fell back to localhost silently. A production bundle built
 * without VITE_API_BASE_URL would ship pointing at http://localhost:5000 and
 * fail in the browser with nothing to explain why.
 */
const required = (name) => {
  const value = import.meta.env[name]
  if (value) return value

  if (import.meta.env.PROD) {
    throw new Error(
      `[env] ${name} is missing from this production build. ` +
      `Set it in .env.production (or the host's build environment) and rebuild — ` +
      `VITE_ vars are baked in at build time, not read at runtime.`
    )
  }

  console.warn(`[env] ${name} is not set; falling back to a local default.`)
  return null
}

export const SUPABASE_URL = required('VITE_SUPABASE_URL')
export const SUPABASE_ANON_KEY = required('VITE_SUPABASE_ANON_KEY')
export const API_BASE_URL = required('VITE_API_BASE_URL') || 'http://localhost:5000'
