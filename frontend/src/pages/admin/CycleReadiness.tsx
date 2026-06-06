/**
 * PulseNet — 7-Day Cycle Readiness
 * All transfusion cycles due in the next N days
 * Sorted by confidence (most at-risk first)
 */

import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Clock, AlertTriangle, CheckCircle, Zap, Droplets } from 'lucide-react'
import { api } from '@/lib/api'

type CycleCard = {
  cycle_id: number
  patient_id: number
  patient_name: string | null
  blood_group: string | null
  due_date: string
  days_until: number
  expected_units: number
  confidence_score: number
  state: 'covered' | 'at_risk' | 'critical'
}

const fetchCycles = (days: number) =>
  api.get(`/api/admin/cycles/upcoming?days=${days}`).then(r => r.data as CycleCard[])

const STATE_CFG = {
  covered:  { color: '#22c55e', bg: 'rgba(34,197,94,0.1)',   border: 'rgba(34,197,94,0.2)',  icon: <CheckCircle size={14} />, label: 'Covered' },
  at_risk:  { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.2)', icon: <AlertTriangle size={14} />, label: 'At Risk' },
  critical: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.2)',  icon: <Zap size={14} />, label: 'Critical' },
}

function CycleCardView({ card }: { card: CycleCard }) {
  const cfg = STATE_CFG[card.state]
  const isToday = card.days_until === 0
  const isTomorrow = card.days_until === 1

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: `1px solid ${cfg.border}`,
      borderRadius: 12,
      padding: '18px 22px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Ambient glow for critical */}
      {card.state === 'critical' && (
        <div style={{ position: 'absolute', inset: 0, boxShadow: 'inset 0 0 30px rgba(239,68,68,0.06)', pointerEvents: 'none' }} />
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontWeight: 700, fontSize: 15, color: '#f1f5f9' }}>{card.patient_name || `Patient #${card.patient_id}`}</span>
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: 'rgba(192,25,44,0.15)', color: '#C0191C', fontWeight: 600 }}>
              {card.blood_group || '?'}
            </span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--clr-muted)' }}>
            Due: <strong style={{ color: '#f1f5f9' }}>{new Date(card.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</strong>
            {' '}·{' '}
            <span style={{ color: card.days_until <= 1 ? '#ef4444' : card.days_until <= 3 ? '#f59e0b' : 'inherit' }}>
              {isToday ? 'TODAY' : isTomorrow ? 'Tomorrow' : `${card.days_until}d away`}
            </span>
          </div>
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '5px 12px', borderRadius: 20,
          background: cfg.bg, border: `1px solid ${cfg.border}`,
          color: cfg.color, fontSize: 11, fontWeight: 600,
        }}>
          {cfg.icon} {cfg.label}
        </div>
      </div>

      {/* Metrics row */}
      <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
        {/* Confidence gauge */}
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
            <span style={{ fontSize: 11, color: 'var(--clr-muted)' }}>Confidence</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: cfg.color, fontFamily: 'monospace' }}>{card.confidence_score}%</span>
          </div>
          <div style={{ height: 5, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${card.confidence_score}%`, background: cfg.color, borderRadius: 3, transition: 'width 0.5s' }} />
          </div>
        </div>

        {/* Units */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--clr-muted)' }}>
          <Droplets size={14} style={{ color: '#C0191C' }} />
          <span><strong style={{ color: '#f1f5f9' }}>{card.expected_units}</strong> units</span>
        </div>
      </div>
    </div>
  )
}

export function CycleReadiness() {
  const [days, setDays] = useState(7)
  const { data: cycles, isLoading, isError } = useQuery({
    queryKey: ['upcoming-cycles', days],
    queryFn: () => fetchCycles(days),
    refetchInterval: 60000,
  })

  const critical = cycles?.filter(c => c.state === 'critical') ?? []
  const atRisk = cycles?.filter(c => c.state === 'at_risk') ?? []
  const covered = cycles?.filter(c => c.state === 'covered') ?? []

  return (
    <div style={{ maxWidth: 1200 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ fontSize: 11, color: '#475569', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 6 }}>
            Command Centre
          </div>
          <h1 style={{ fontSize: 26, fontFamily: 'var(--font-display)', fontWeight: 700 }}>
            <Clock size={22} style={{ display: 'inline', marginRight: 10, color: '#a78bfa', verticalAlign: 'middle' }} />
            Cycle Readiness
          </h1>
          <p style={{ color: 'var(--clr-muted)', fontSize: 13, marginTop: 4 }}>
            {cycles ? `${cycles.length} cycles due in the next ${days} days` : 'Loading...'}
          </p>
        </div>
        {/* Day window selector */}
        <div style={{ display: 'flex', gap: 6 }}>
          {[3, 7, 14].map(d => (
            <button
              key={d}
              onClick={() => setDays(d)}
              style={{
                padding: '6px 16px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                background: days === d ? 'rgba(167,139,250,0.2)' : 'transparent',
                border: days === d ? '1px solid rgba(167,139,250,0.4)' : '1px solid rgba(255,255,255,0.1)',
                color: days === d ? '#a78bfa' : 'var(--clr-muted)',
              }}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* Summary tiles */}
      {!isLoading && cycles && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 28 }}>
          {[
            { label: 'Critical', count: critical.length, color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
            { label: 'At Risk', count: atRisk.length, color: '#f59e0b', bg: 'rgba(245,158,11,0.08)' },
            { label: 'Covered', count: covered.length, color: '#22c55e', bg: 'rgba(34,197,94,0.08)' },
          ].map(t => (
            <div key={t.label} style={{ background: t.bg, border: `1px solid ${t.color}33`, borderRadius: 10, padding: '14px 18px' }}>
              <div style={{ fontFamily: 'monospace', fontSize: 26, fontWeight: 700, color: t.color }}>{t.count}</div>
              <div style={{ fontSize: 12, color: 'var(--clr-muted)', marginTop: 3 }}>{t.label}</div>
            </div>
          ))}
        </div>
      )}

      {isLoading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 130, borderRadius: 12 }} />)}
        </div>
      )}

      {isError && (
        <div style={{ color: '#ef4444', padding: 20, fontSize: 14 }}>⚠️ Could not load cycles.</div>
      )}

      {/* Grouped cycle cards */}
      {!isLoading && cycles && cycles.length === 0 && (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--clr-muted)' }}>
          <CheckCircle size={32} style={{ color: '#22c55e', marginBottom: 12, display: 'block', margin: '0 auto 12px' }} />
          <p>No cycles due in the next {days} days.</p>
        </div>
      )}

      {[
        { group: critical, title: '🚨 Critical', show: critical.length > 0 },
        { group: atRisk, title: '⚠️ At Risk', show: atRisk.length > 0 },
        { group: covered, title: '✅ Covered', show: covered.length > 0 },
      ].filter(g => g.show).map(({ group, title }) => (
        <div key={title} style={{ marginBottom: 28 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--clr-muted)', marginBottom: 12, letterSpacing: '0.05em' }}>
            {title} ({group.length})
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 10 }}>
            {group.map(card => <CycleCardView key={card.cycle_id} card={card} />)}
          </div>
        </div>
      ))}
    </div>
  )
}
