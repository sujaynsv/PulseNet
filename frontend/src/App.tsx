import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Sidebar } from './components/Sidebar'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Login } from './pages/Login'
import { Register } from './pages/Register'
import { AdminDashboard } from './pages/admin/AdminDashboard'
import { PatientsList } from './pages/admin/PatientsList'
import { DonorHome } from './pages/donor/DonorHome'
import { PatientHome } from './pages/patient/PatientHome'

const queryClient = new QueryClient()

function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="layout">
      <Sidebar />
      <main className="main-content">
        {children}
      </main>
    </div>
  )
}

function RootRedirect() {
  const { user, role, isLoading } = useAuth();
  if (isLoading) return <div className="flex items-center justify-center h-screen">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (role === 'Admin') return <Navigate to="/admin" replace />;
  if (role === 'Donor') return <Navigate to="/donor" replace />;
  if (role === 'Patient') return <Navigate to="/patient" replace />;
  return <Navigate to="/login" replace />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            
            {/* Admin Routes */}
            <Route element={<ProtectedRoute allowedRoles={['Admin']} />}>
              <Route path="/admin" element={<AppLayout><AdminDashboard /></AppLayout>} />
              <Route path="/admin/patients" element={<AppLayout><PatientsList /></AppLayout>} />
            </Route>

            {/* Donor Routes */}
            <Route element={<ProtectedRoute allowedRoles={['Donor']} />}>
              <Route path="/donor" element={<AppLayout><DonorHome /></AppLayout>} />
            </Route>

            {/* Patient Routes */}
            <Route element={<ProtectedRoute allowedRoles={['Patient']} />}>
              <Route path="/patient" element={<AppLayout><PatientHome /></AppLayout>} />
            </Route>

            {/* Redirect root based on login status / role */}
            <Route path="/" element={<RootRedirect />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}

export default App
