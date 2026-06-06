/**
 * PulseNet — Center Stress View
 * Derived from patient location data — groups patients by location
 * and calculates stress from upcoming cycles, emergencies, and donor depth
 */

import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Activity, AlertTriangle, CheckCircle, Zap, Users, Droplets } from 'lucide-react'
import { api } from '@/lib/api'

type CenterRow = {
  center_name: string
  patient_count: number
  cycles_next_7_days: number
  open_emergencies: number
  eligible_donors_nearby: number
  stress_score: number
  stress_level: 'Low' | 'Moderate' | 'High' | 'Critical'
}

const fetchCenterStress = () => api.get('/api/admin/center-stress').then(r => r.data as CenterRow[])

const STRESS_CFG = {
  Low:      { color: '#22c55e', bg: 'rgba(34,197,94,0.1)',   border: 'rgba(34,197,94,0.2)',  icon: <CheckCircle size={14} /> },
  Moderate: { color: '#60a5fa', bg: 'rgba(96,165,250,0.1)', border: 'rgba(96,165,250,0.2)', icon: <Activity size={14} /> },
  High:     { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.2)', icon: <AlertTriangle size={14} /> },
  Critical: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.2)',  icon: <Zap size={14} /> },
}

function CenterCard({ center }: { center: CenterRow }) {
  const cfg = STRESS_CFG[center.stress_level]
  const maxScore = 30
  const barPct = Math.min((center.stress_score / maxScore) * 100, 100)

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: `1px solid ${cfg.border}`,
      borderRadius: 14,
      padding: '20px 24px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {center.stress_level === 'Critical' && (
        <div style={{ position: 'absolute', inset: 0, boxShadow: 'inset 0 0 40px rgba(239,68,68,0.08)', pointerEvents: 'none' }} />
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#f1f5f9', marginBottom: 3 }}>{center.center_name}</div>
          <div style={{ fontSize: 12, color: 'var(--clr-muted)' }}>
            Hyderabad · {center.patient_count} patient{center.patient_count !== 1 ? 's' : ''}
          </div>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '5px 12px', borderRadius: 20,
          background: cfg.bg, border: `1px solid ${cfg.border}`,
          color: cfg.color, fontSize: 11, fontWeight: 700,
        }}>
          {cfg.icon} {center.stress_level}
        </div>
      </div>

      {/* Stress bar */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
          <span style={{ fontSize: 11, color: 'var(--clr-muted)' }}>Stress Score</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: cfg.color, fontFamily: 'monospace' }}>{center.stress_score}</span>
        </div>
        <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${barPct}%`, background: cfg.color, borderRadius: 3, transition: 'width 0.5s' }} />
        </div>
      </div>

      {/* Metrics row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        <div style={{ textAlign: 'center', padding: '10px', background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
          <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'monospace', color: center.cycles_next_7_days > 0 ? '#a78bfa' : '#475569' }}>
            {center.cycles_next_7_days}
          </div>
          <div style={{ fontSize: 10, color: 'var(--clr-muted)', marginTop: 2, lineHeight: 1.4 }}>Cycles<br/>Next 7d</div>
        </div>
        <div style={{ textAlign: 'center', padding: '10px', background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
          <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'monospace', color: center.open_emergencies > 0 ? '#ef4444' : '#475569' }}>
            {center.open_emergencies}
          </div>
          <div style={{ fontSize: 10, color: 'var(--clr-muted)', marginTop: 2, lineHeight: 1.4 }}>Open<br/>Emergencies</div>
        </div>
        <div style={{ textAlign: 'center', padding: '10px', background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
          <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'monospace', color: center.eligible_donors_nearby > 3 ? '#22c55e' : '#f59e0b' }}>
            {center.eligible_donors_nearby}
          </div>
          <div style={{ fontSize: 10, color: 'var(--clr-muted)', marginTop: 2, lineHeight: 1.4 }}>Eligible<br/>Donors</div>
        </div>
      </div>
    </div>
  )
}

export function CenterStress() {
  const { data: centers, isLoading, isError } = useQuery({
    queryKey: ['center-stress'],
    queryFn: fetchCenterStress,
    refetchInterval: 60000,
  })

  const critical = centers?.filter(c => c.stress_level === 'Critical') ?? []
  const high = centers?.filter(c => c.stress_level === 'High') ?? []
  const rest = centers?.filter(c => c.stress_level === 'Moderate' || c.stress_level === 'Low') ?? []

  return (
    <div style={{ maxWidth: 1200 }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, color: '#475569', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 6 }}>
          Command Centre
        </div>
        <h1 style={{ fontSize: 26, fontFamily: 'var(--font-display)', fontWeight: 700 }}>
          <Activity size={22} style={{ display: 'inline', marginRight: 10, color: '#22c55e', verticalAlign: 'middle' }} />
          Center Stress View
        </h1>
        <p style={{ color: 'var(--clr-muted)', fontSize: 13, marginTop: 4 }}>
          {centers
            ? `${centers.length} locations in Hyderabad — derived from patient and donor distribution`
            : 'Loading center data...'}
        </p>
      </div>

      {/* Summary bar */}
      {!isLoading && centers && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 28 }}>
          {(['Critical', 'High', 'Moderate', 'Low'] as const).map(level => {
            const cfg = STRESS_CFG[level]
            const count = centers.filter(c => c.stress_level === level).length
            return (
              <div key={level} style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: 10, padding: '14px 18px' }}>
                <div style={{ fontFamily: 'monospace', fontSize: 26, fontWeight: 700, color: cfg.color }}>{count}</div>
                <div style={{ fontSize: 12, color: 'var(--clr-muted)', marginTop: 3 }}>{level}</div>
              </div>
            )
          })}
        </div>
      )}

      {isLoading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 220, borderRadius: 14 }} />)}
        </div>
      )}

      {isError && (
        <div style={{ color: '#ef4444', padding: 20, fontSize: 14 }}>⚠️ Could not load center stress data.</div>
      )}

      {!isLoading && centers?.length === 0 && (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--clr-muted)' }}>
          No patient locations registered yet. Patient locations power this view.
        </div>
      )}

      {[
        { group: critical, title: '🚨 Critical', show: critical.length > 0 },
        { group: high, title: '⚠️ High Stress', show: high.length > 0 },
        { group: rest, title: '📊 Moderate & Low', show: rest.length > 0 },
      ].filter(g => g.show).map(({ group, title }) => (
        <div key={title} style={{ marginBottom: 28 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--clr-muted)', marginBottom: 12, letterSpacing: '0.05em' }}>
            {title} ({group.length})
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
            {group.map(c => <CenterCard key={c.center_name} center={c} />)}
          </div>
        </div>
      ))}
    </div>
  )
}
