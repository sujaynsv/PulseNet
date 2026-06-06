/**
 * Patients Page — Branch: feature/patient-flow
 * Placeholder for patient registration + transfusion calendar.
 */
import { Heart } from 'lucide-react'

export function Patients() {
  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32 }}>
        <Heart size={24} style={{ color: 'var(--clr-blood-light)' }} />
        <div>
          <h1 style={{ fontSize: 24, fontFamily: 'var(--font-display)' }}>Patient Coordination</h1>
          <p style={{ color: 'var(--clr-muted)', fontSize: 14, marginTop: 4 }}>
            Branch: <code style={{ color: 'var(--clr-blood-light)' }}>feature/patient-flow</code>
          </p>
        </div>
      </div>
      <div className="glass-card" style={{ padding: 40, textAlign: 'center' }}>
        <Heart size={48} style={{ color: 'var(--clr-blood)', margin: '0 auto 16px' }} />
        <h2 style={{ fontSize: 20, marginBottom: 8 }}>Patient Intake & Transfusion Calendar</h2>
        <p style={{ color: 'var(--clr-muted)', fontSize: 14, maxWidth: 400, margin: '0 auto' }}>
          This section will house patient registration forms, Blood Bridge mapping views,
          and transfusion schedule calendars. Assigned to <strong>feature/patient-flow</strong>.
        </p>
        <div style={{ marginTop: 24, padding: '12px 20px', background: 'rgba(192,25,44,0.08)', borderRadius: 10, display: 'inline-block', fontSize: 13, color: 'var(--clr-muted)' }}>
          API Endpoints Ready: <code style={{ color: '#22c55e' }}>POST /api/patient/register</code> · <code style={{ color: '#22c55e' }}>GET /api/patient/:id/schedule</code>
        </div>
      </div>
    </div>
  )
}
