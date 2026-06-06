import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Sidebar } from '@/components/Sidebar'
import { Dashboard } from '@/pages/Dashboard'
import { Donors } from '@/pages/Donors'
import { Patients } from '@/pages/Patients'
import { BloodBridges } from '@/pages/BloodBridges'

export default function App() {
  return (
    <BrowserRouter>
      <div style={{ display: 'flex' }}>
        <Sidebar />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/donors" element={<Donors />} />
            <Route path="/patients" element={<Patients />} />
            <Route path="/bridges" element={<BloodBridges />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
