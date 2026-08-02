import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { isStaff, isTenant, isAdmin } from './lib/roles'

import Layout from './components/Layout'
import TenantLayout from './components/TenantLayout'
import HomeRedirect from './components/HomeRedirect'

import PublicLanding from './pages/public/PublicLanding'
import Login from './pages/Login'
import AccessDenied from './pages/AccessDenied'

import Dashboard from './pages/Dashboard'
import Settings from './pages/Settings'
import PoliceVerification from './pages/PoliceVerification'
import GateLog from './pages/GateLog'
import Tenants from './pages/Tenants'
import Enquiries from './pages/Enquiries'
import TenantDetail from './pages/TenantDetail'
import OnboardingWizard from './pages/onboarding/OnboardingWizard'
import MeterReading from './pages/MeterReading'

import TenantHome from './pages/tenant/TenantHome'
import TenantRent from './pages/tenant/TenantRent'
import TenantProfile from './pages/tenant/TenantProfile'

/**
 * Three audiences share one origin:
 *   /        public site        — no account
 *   /admin/* office app         — admin | gatekeeper
 *   /me/*    resident portal    — tenant
 *
 * Guards below are a RENDER HINT. Every one of these screens gets its data
 * from an API that re-checks the caller's role against the database, so a
 * tampered client role shows empty pages, not someone else's data.
 *
 * Each guard sends a wrong-app-but-valid role to ITS home rather than to
 * AccessDenied — a resident who taps a stale /admin link should land in the
 * portal, not on a dead end.
 */
const StaffRoute = ({ children }) => {
  const { user, role } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (isTenant(role)) return <Navigate to="/me" replace />
  if (!isStaff(role)) return <AccessDenied />
  return <Layout>{children}</Layout>
}

const AdminRoute = ({ children }) => {
  const { user, role } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (isTenant(role)) return <Navigate to="/me" replace />
  if (!isStaff(role)) return <AccessDenied />
  if (!isAdmin(role)) return <Navigate to="/admin" replace />
  return <Layout>{children}</Layout>
}

const TenantRoute = ({ children }) => {
  const { user, role } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (isStaff(role)) return <Navigate to="/admin" replace />
  if (!isTenant(role)) return <AccessDenied />
  return <TenantLayout>{children}</TenantLayout>
}

function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<PublicLanding />} />
      <Route path="/login" element={<Login />} />

      {/* Office app */}
      <Route path="/admin" element={<StaffRoute><Dashboard /></StaffRoute>} />
      <Route path="/admin/tenants" element={<StaffRoute><Tenants /></StaffRoute>} />
      <Route path="/admin/tenants/:id" element={<StaffRoute><TenantDetail /></StaffRoute>} />
      <Route path="/admin/onboarding" element={<StaffRoute><OnboardingWizard /></StaffRoute>} />
      <Route path="/admin/gate-log" element={<StaffRoute><GateLog /></StaffRoute>} />
      <Route path="/admin/police-verification" element={<StaffRoute><PoliceVerification /></StaffRoute>} />
      {/* AdminRoute, not StaffRoute — GET /enquiries is ADMIN_ONLY, so a
          gatekeeper would only ever see an empty page and a 403 toast. */}
      <Route path="/admin/enquiries" element={<AdminRoute><Enquiries /></AdminRoute>} />
      <Route path="/admin/settings" element={<StaffRoute><Settings /></StaffRoute>} />
      <Route path="/admin/meter-reading/:roomId" element={<AdminRoute><MeterReading /></AdminRoute>} />

      {/* Resident portal */}
      <Route path="/me" element={<TenantRoute><TenantHome /></TenantRoute>} />
      <Route path="/me/rent" element={<TenantRoute><TenantRent /></TenantRoute>} />
      <Route path="/me/profile" element={<TenantRoute><TenantProfile /></TenantRoute>} />

      {/* Unknown path — goes wherever this visitor's home is */}
      <Route path="*" element={<HomeRedirect />} />
    </Routes>
  )
}

export default App
