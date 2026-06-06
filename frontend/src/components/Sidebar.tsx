import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Users, Heart, LogOut, Activity,
  User as UserIcon, GitBranch, Clock, Zap, MapPin, Droplets
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

// Live emergency count for badge
function useOpenEmergencies(enabled: boolean) {
  return useQuery({
    queryKey: ['emergencies'],
    queryFn: () => api.get('/api/admin/emergencies').then(r => (r.data as any[]).length),
    enabled,
    refetchInterval: 30000,
  })
}

export function Sidebar() {
  const { role, logout } = useAuth()
  const location = useLocation()
  const isAdmin = role === 'Admin'
  const { data: openEmergencies } = useOpenEmergencies(isAdmin)

  const getNavItems = () => {
    switch (role) {
      case 'Admin':
        return [
          { to: '/admin', label: 'Dashboard', Icon: LayoutDashboard, exact: true },
          { to: '/admin/pods', label: 'Pod Centre', Icon: GitBranch },
          { to: '/admin/cycles', label: 'Cycles', Icon: Clock },
          { to: '/admin/emergencies', label: 'Emergencies', Icon: Zap, badge: openEmergencies ?? 0 },
          { to: '/admin/centers', label: 'Centers', Icon: MapPin },
          { to: '/admin/patients', label: 'Patients', Icon: Heart },
          { to: '/admin/donors', label: 'Donors', Icon: Droplets },
        ]
      case 'Donor':
        return [
          { to: '/donor', label: 'My Profile', Icon: UserIcon },
        ]
      case 'Patient':
        return [
          { to: '/patient', label: 'My Bridge', Icon: GitBranchIcon },
          { to: '/patient/profile', label: 'My Profile', Icon: UserIcon },
        ]
      default:
        return []
    }
  }

  const NAV_ITEMS = getNavItems()

  return (
    <aside className="sidebar" style={{ padding: '0', display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Logo */}
      <div style={{
        padding: '28px 20px 24px',
        borderBottom: '1px solid var(--clr-border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="pulse-ring" style={{
            width: 36, height: 36,
            background: 'var(--clr-blood)',
            borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Activity size={18} color="#fff" />
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, color: '#fff' }}>
              PulseNet
            </div>
            <div style={{ fontSize: 10, color: 'var(--clr-muted)', letterSpacing: '0.08em', marginTop: 1 }}>
              BLOOD WARRIORS
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav style={{ padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 4, flex: 1, overflowY: 'auto' }}>
        <div style={{ fontSize: 10, color: 'var(--clr-muted)', letterSpacing: '0.12em', textTransform: 'uppercase', padding: '8px 8px 4px', fontWeight: 600 }}>
          {role === 'Admin' ? 'Command Centre' : 'Main Menu'}
        </div>
        {NAV_ITEMS.map(({ to, label, Icon, badge, exact }: any) => (
          <NavLink
            key={to}
            to={to}
            end={exact}
            className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
            style={{ position: 'relative' }}
          >
            <Icon size={16} />
            {label}
            {badge > 0 && (
              <span style={{
                marginLeft: 'auto',
                minWidth: 18, height: 18,
                background: '#ef4444',
                color: '#fff',
                borderRadius: 9,
                fontSize: 10, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '0 5px',
              }}>
                {badge}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Logout button */}
      <div style={{ padding: '16px 12px', borderTop: '1px solid var(--clr-border)' }}>
        <button
          onClick={logout}
          className="nav-link w-full text-left flex items-center gap-3 text-red-400 hover:text-red-300 transition-colors"
        >
          <LogOut size={16} />
          Sign Out
        </button>
      </div>

      {/* Footer badge */}
      <div style={{
        margin: '12px',
        padding: '12px 16px',
        background: 'rgba(192,25,44,0.1)',
        border: '1px solid rgba(192,25,44,0.2)',
        borderRadius: 12,
      }}>
        <div style={{ fontSize: 11, color: 'var(--clr-blood-light)', fontWeight: 600 }}>
          🏆 AI FOR GOOD 2.0
        </div>
        <div style={{ fontSize: 10, color: 'var(--clr-muted)', marginTop: 2 }}>
          Hackathon Submission
        </div>
      </div>
    </aside>
  )
}

function GitBranchIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="6" y1="3" x2="6" y2="15"></line>
      <circle cx="18" cy="6" r="3"></circle>
      <circle cx="6" cy="18" r="3"></circle>
      <path d="M18 9a9 9 0 0 1-9 9"></path>
    </svg>
  )
}
