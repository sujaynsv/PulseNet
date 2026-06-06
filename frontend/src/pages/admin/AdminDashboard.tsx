/**
 * PulseNet — Admin Command Centre Dashboard
 * City-level operational overview for Hyderabad
 * Design: Industrial Command Room — dark precision ops
 */

import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Activity, AlertTriangle, CheckCircle, Users, GitBranch,
  Droplets, Zap, ChevronDown, Bell, TrendingDown, Clock
} from 'lucide-react'
import { api } from '@/lib/api'

const fetchCommandStats = () => api.get('/api/admin/command-stats').then(r => r.data)
const fetchHealth = () => api.get('/api/health').then(r => r.data)

const CITIES = [
  { name: 'Hyderabad', active: true },
  { name: 'Mumbai', active: false },
  { name: 'Delhi', active: false },
  { name: 'Bangalore', active: false },
  { name: 'Chennai', active: false },
]

function CitySelector() {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 14px',
          background: 'rgba(192,25,44,0.12)',
          border: '1px solid rgba(192,25,44,0.3)',
          borderRadius: 8,
          color: '#f1f5f9',
          fontSize: 13, fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 6px #22c55e' }} />
        Hyderabad
        <ChevronDown size={14} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 4,
          background: '#0f1117', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 10, overflow: 'hidden', zIndex: 100, minWidth: 180,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}>
          {CITIES.map(c => (
            <div
              key={c.name}
              onClick={() => { if (c.active) setOpen(false) }}
              style={{
                padding: '10px 16px',
                display: 'flex', alignItems: 'center', gap: 10,
                color: c.active ? '#f1f5f9' : '#475569',
                fontSize: 13, fontWeight: c.active ? 600 : 400,
                cursor: c.active ? 'pointer' : 'default',
              }}
            >
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: c.active ? '#22c55e' : '#334155' }} />
              {c.name}
              {!c.active && <span style={{ fontSize: 10, color: '#475569', marginLeft: 'auto' }}>Soon</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

type StatTileProps = {
  label: string
  value: number | string
  sub?: string
  icon: React.ReactNode
  color?: string
  pulse?: boolean
  alert?: boolean
}
function StatTile({ label, value, sub, icon, color = '#C0191C', pulse, alert }: StatTileProps) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: `1px solid ${alert ? 'rgba(239,68,68,0.35)' : 'rgba(255,255,255,0.06)'}`,
      borderRadius: 14,
      padding: '20px 24px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {alert && (
        <div style={{
          position: 'absolute', inset: 0,
          boxShadow: 'inset 0 0 24px rgba(239,68,68,0.07)',
          pointerEvents: 'none',
        }} />
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div style={{ color, opacity: 0.85 }}>{icon}</div>
        {pulse && (
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: alert ? '#ef4444' : '#22c55e',
            boxShadow: `0 0 8px ${alert ? '#ef4444' : '#22c55e'}`,
            animation: 'pulse 2s ease-in-out infinite',
          }} />
        )}
      </div>
      <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 32, fontWeight: 700, color: '#f1f5f9', lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontSize: 12, color: 'var(--clr-muted)', marginTop: 6, fontWeight: 500 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

export function AdminDashboard() {
  const stats = useQuery({ queryKey: ['command-stats'], queryFn: fetchCommandStats, refetchInterval: 30000 })
  const health = useQuery({ queryKey: ['health'], queryFn: fetchHealth, retry: 1 })

  const s = stats.data
  const backendOk = health.data?.status === 'ok'

  return (
    <div style={{ maxWidth: 1200 }}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ fontSize: 11, color: '#475569', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 6 }}>
            Blood Warriors · Command Centre
          </div>
          <h1 style={{ fontSize: 28, fontFamily: 'var(--font-display)', fontWeight: 700, lineHeight: 1 }}>
            <span className="gradient-text">Hyderabad</span> Operations
          </h1>
          <p style={{ color: 'var(--clr-muted)', fontSize: 13, marginTop: 6 }}>
            {s ? `Live as of ${new Date().toLocaleTimeString()} · ${s.as_of}` : 'Loading operational data...'}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <CitySelector />
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 14px',
            background: backendOk ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
            border: `1px solid ${backendOk ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
            borderRadius: 8, fontSize: 12, fontWeight: 500,
            color: backendOk ? '#22c55e' : '#ef4444',
          }}>
            {backendOk ? <CheckCircle size={13} /> : <AlertTriangle size={13} />}
            {backendOk ? 'Systems Online' : 'Backend Offline'}
          </div>
        </div>
      </div>

      {/* ── Stats Grid ── */}
      {stats.isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 16, marginBottom: 40 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 130, borderRadius: 14 }} />
          ))}
        </div>
      ) : stats.isError ? (
        <div style={{ color: '#ef4444', fontSize: 14, marginBottom: 40, padding: 20, background: 'rgba(239,68,68,0.08)', borderRadius: 12, border: '1px solid rgba(239,68,68,0.2)' }}>
          ⚠️ Could not load command stats — ensure backend is running.
        </div>
      ) : s ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 16, marginBottom: 40 }}>
          <StatTile label="Active Pods" value={s.active_pods} sub="Blood bridges running" icon={<GitBranch size={20} />} color="#60a5fa" pulse />
          <StatTile label="Cycles · Next 7d" value={s.cycles_next_7_days} sub="Upcoming transfusions" icon={<Activity size={20} />} color="#a78bfa" pulse />
          <StatTile label="At-Risk Cycles" value={s.at_risk_cycles} sub="Need coordinator review" icon={<AlertTriangle size={20} />} color="#f59e0b" alert={s.at_risk_cycles > 0} pulse />
          <StatTile label="Open Emergencies" value={s.open_emergencies} sub="Unresolved cases" icon={<Zap size={20} />} color="#ef4444" alert={s.open_emergencies > 0} pulse />
          <StatTile label="Eligible Donors" value={s.eligible_donors} sub={`of ${s.total_donors} total`} icon={<Droplets size={20} />} color="#22c55e" />
          <StatTile label="Total Donors" value={s.total_donors} sub="Registered in Hyderabad" icon={<Users size={20} />} color="#C0191C" />
        </div>
      ) : null}

      {/* ── Risk Ribbon ── */}
      {s && (s.at_risk_cycles > 0 || s.open_emergencies > 0) && (
        <div style={{
          marginBottom: 32,
          padding: '16px 20px',
          background: 'rgba(245,158,11,0.06)',
          border: '1px solid rgba(245,158,11,0.2)',
          borderRadius: 12,
          display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center',
        }}>
          <AlertTriangle size={16} style={{ color: '#f59e0b', flexShrink: 0 }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#f59e0b' }}>Attention Required</span>
          {s.at_risk_cycles > 0 && (
            <span style={{ fontSize: 13, color: '#94a3b8' }}>
              {s.at_risk_cycles} cycle{s.at_risk_cycles > 1 ? 's' : ''} at risk in the next 7 days →{' '}
              <a href="/admin/cycles" style={{ color: '#f59e0b', fontWeight: 600, textDecoration: 'none' }}>Review Cycles</a>
            </span>
          )}
          {s.open_emergencies > 0 && (
            <span style={{ fontSize: 13, color: '#94a3b8' }}>
              {s.open_emergencies} emergency case{s.open_emergencies > 1 ? 's' : ''} open →{' '}
              <a href="/admin/emergencies" style={{ color: '#ef4444', fontWeight: 600, textDecoration: 'none' }}>Emergency Board</a>
            </span>
          )}
        </div>
      )}

      {/* ── Quick links grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
        {[
          { href: '/admin/pods', icon: <GitBranch size={20} />, title: 'Pod Command Centre', desc: 'View all patient pods sorted by health score. Trigger AI refill for at-risk bridges.', color: '#60a5fa' },
          { href: '/admin/cycles', icon: <Clock size={20} />, title: '7-Day Cycle Readiness', desc: 'All transfusion cycles due this week with confidence scores and risk states.', color: '#a78bfa' },
          { href: '/admin/emergencies', icon: <Zap size={20} />, title: 'Emergency Board', desc: 'Track and resolve open emergency cases through the 5-step resolution workflow.', color: '#ef4444' },
          { href: '/admin/centers', icon: <Activity size={20} />, title: 'Center Stress View', desc: 'Hyderabad hospital/location stress levels derived from patient and donor density.', color: '#22c55e' },
          { href: '/admin/patients', icon: <Users size={20} />, title: 'Patient Directory', desc: 'Manage individual patient records, generate transfusion cycles, and view bridges.', color: '#C0191C' },
          { href: '/admin/donors', icon: <Droplets size={20} />, title: 'Donor Directory', desc: 'Browse and filter the full donor pool by blood group, status, and eligibility.', color: '#f59e0b' },
        ].map(item => (
          <a
            key={item.href}
            href={item.href}
            style={{
              display: 'block',
              padding: '20px 24px',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 14,
              textDecoration: 'none',
              transition: 'border-color 0.2s, background 0.2s',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.borderColor = item.color + '55'
              ;(e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)'
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.07)'
              ;(e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)'
            }}
          >
            <div style={{ color: item.color, marginBottom: 12 }}>{item.icon}</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#f1f5f9', marginBottom: 6 }}>{item.title}</div>
            <div style={{ fontSize: 12, color: 'var(--clr-muted)', lineHeight: 1.6 }}>{item.desc}</div>
          </a>
        ))}
      </div>
    </div>
  )
}
