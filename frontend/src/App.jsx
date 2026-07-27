import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Settings from './pages/Settings'
import PoliceVerification from './pages/PoliceVerification'
import GateLog from './pages/GateLog'
import Tenants from './pages/Tenants'

import TenantDetail from './pages/TenantDetail'
import OnboardingWizard from './pages/onboarding/OnboardingWizard'
import MeterReading from './pages/MeterReading'

const ProtectedRoute = ({ children }) => {
  const { user, isAdmin } = useAuth()
  if (!user || !isAdmin) return <Navigate to="/login" replace />
  return <Layout>{children}</Layout>
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      
      {/* Protected Routes */}
      <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/tenants" element={<ProtectedRoute><Tenants /></ProtectedRoute>} />
      <Route path="/onboarding" element={<ProtectedRoute><OnboardingWizard /></ProtectedRoute>} />
      <Route path="/tenants/:id" element={<ProtectedRoute><TenantDetail /></ProtectedRoute>} />
      <Route path="/police-verification" element={<ProtectedRoute><PoliceVerification /></ProtectedRoute>} />
      <Route path="/meter-reading/:roomId" element={<ProtectedRoute><MeterReading /></ProtectedRoute>} />
      <Route path="/gate-log" element={<ProtectedRoute><GateLog /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
