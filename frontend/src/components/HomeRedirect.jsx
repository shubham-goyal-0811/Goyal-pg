import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { isStaff, isTenant } from '../lib/roles'
import AccessDenied from '../pages/AccessDenied'

/**
 * "Wherever home is for you."
 *
 * Three apps now live at one origin — the public site at /, the admin app at
 * /admin, and the resident portal at /me — so there is no longer a single
 * correct destination after signing in. Every place that used to hard-code
 * navigate('/') routes through here instead.
 *
 * Also serves as the catch-all for unknown paths, which is why a signed-out
 * visitor lands on the public site rather than a login wall.
 */
const HomeRedirect = () => {
  const { user, role } = useAuth()

  if (!user) return <Navigate to="/" replace />
  if (isStaff(role)) return <Navigate to="/admin" replace />
  if (isTenant(role)) return <Navigate to="/me" replace />

  // Signed in, promoted to nothing. Render in place rather than redirecting —
  // sending them anywhere else bounces them straight back here.
  return <AccessDenied />
}

export default HomeRedirect
