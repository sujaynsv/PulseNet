import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Users, Heart, GitBranch, Activity } from 'lucide-react'

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { to: '/donors',    label: 'Donors',    Icon: Users },
  { to: '/patients',  label: 'Patients',  Icon: Heart },
  { to: '/bridges',   label: 'Blood Bridges', Icon: GitBranch },
]

export function Sidebar() {
  return (
    <aside className="sidebar" style={{ padding: '0' }}>
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
      <nav style={{ padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ fontSize: 10, color: 'var(--clr-muted)', letterSpacing: '0.12em', textTransform: 'uppercase', padding: '8px 8px 4px', fontWeight: 600 }}>
          Main Menu
        </div>
        {NAV_ITEMS.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
          >
            <Icon size={16} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Footer badge */}
      <div style={{
        position: 'absolute', bottom: 20, left: 12, right: 12,
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
