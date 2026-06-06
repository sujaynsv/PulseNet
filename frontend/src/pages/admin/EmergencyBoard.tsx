/**
 * PulseNet — Emergency Command Board
 * Tracks and resolves emergency cases through a 5-step checklist
 */

import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Zap, Plus, Clock, CheckCircle, Circle, X } from 'lucide-react'
import { api } from '@/lib/api'

type EmCase = {
  id: number
  patient_label: string | null
  blood_group: string | null
  center_name: string | null
  units_needed: number
  hours_remaining: number | null
  assigned_donor_name: string | null
  donor_assigned: boolean
  donor_confirmed: boolean
  center_informed: boolean
  units_arranged: boolean
  case_closed: boolean
  status: string
  created_at: string
}

const fetchEmergencies = () => api.get('/api/admin/emergencies').then(r => r.data as EmCase[])

const STEPS = [
  { key: 'donor_assigned', label: 'Donor Assigned' },
  { key: 'donor_confirmed', label: 'Donor Confirmed' },
  { key: 'center_informed', label: 'Center Informed' },
  { key: 'units_arranged', label: 'Units Arranged' },
] as const

type StepKey = typeof STEPS[number]['key']

function ChecklistStep({ done, label, onClick }: { done: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '6px 0',
        background: 'none', border: 'none', cursor: 'pointer',
        color: done ? '#22c55e' : 'var(--clr-muted)',
        fontSize: 12, fontWeight: done ? 600 : 400,
        textAlign: 'left',
      }}
    >
      {done ? <CheckCircle size={14} style={{ flexShrink: 0 }} /> : <Circle size={14} style={{ flexShrink: 0 }} />}
      <span style={{ textDecoration: done ? 'line-through' : 'none' }}>{label}</span>
    </button>
  )
}

function EmergencyCard({ ec }: { ec: EmCase }) {
  const qc = useQueryClient()
  const urgentHours = ec.hours_remaining !== null && ec.hours_remaining <= 6

  const patchMutation = useMutation({
    mutationFn: (patch: Partial<EmCase>) =>
      api.patch(`/api/admin/emergencies/${ec.id}`, patch).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['emergencies'] }),
  })

  const toggle = (key: StepKey) => {
    patchMutation.mutate({ [key]: !ec[key] })
  }

  const stepsCompleted = STEPS.filter(s => ec[s.key]).length
  const progressPct = (stepsCompleted / 4) * 100

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: `1px solid ${urgentHours ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.08)'}`,
      borderRadius: 14,
      padding: '20px 24px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {urgentHours && (
        <div style={{ position: 'absolute', inset: 0, boxShadow: 'inset 0 0 40px rgba(239,68,68,0.1)', pointerEvents: 'none' }} />
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontWeight: 700, fontSize: 15, color: '#f1f5f9' }}>
              {ec.patient_label || 'Unknown Patient'}
            </span>
            <span style={{ fontSize: 12, padding: '2px 10px', borderRadius: 12, background: 'rgba(192,25,44,0.2)', color: '#C0191C', fontWeight: 700 }}>
              {ec.blood_group || '?'}
            </span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--clr-muted)' }}>
            {ec.center_name || 'No center specified'} · {ec.units_needed} units needed
          </div>
        </div>

        {ec.hours_remaining !== null && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700,
            color: urgentHours ? '#ef4444' : '#f59e0b',
            background: urgentHours ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)',
            padding: '4px 10px', borderRadius: 8,
          }}>
            <Clock size={13} />
            {ec.hours_remaining < 1
              ? `${Math.round(ec.hours_remaining * 60)}m left`
              : `${ec.hours_remaining.toFixed(1)}h left`}
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
          <span style={{ fontSize: 11, color: 'var(--clr-muted)' }}>Resolution Progress</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: stepsCompleted === 4 ? '#22c55e' : '#f59e0b' }}>
            {stepsCompleted}/4 steps
          </span>
        </div>
        <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${progressPct}%`, background: stepsCompleted === 4 ? '#22c55e' : '#f59e0b', borderRadius: 2, transition: 'width 0.4s' }} />
        </div>
      </div>

      {/* Checklist */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
        {STEPS.map(step => (
          <ChecklistStep
            key={step.key}
            done={ec[step.key]}
            label={step.label}
            onClick={() => toggle(step.key)}
          />
        ))}
      </div>

      {ec.assigned_donor_name && (
        <div style={{ marginTop: 10, fontSize: 11, color: '#22c55e', display: 'flex', alignItems: 'center', gap: 4 }}>
          <CheckCircle size={12} /> Assigned to: {ec.assigned_donor_name}
        </div>
      )}
    </div>
  )
}

function CreateEmergencyModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    patient_label: '',
    blood_group: 'O+',
    center_name: '',
    units_needed: 2,
    hours_until_critical: 24,
  })

  const createMutation = useMutation({
    mutationFn: () => api.post('/api/admin/emergencies', form).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['emergencies'] }); onClose() },
  })

  const field = (label: string, key: keyof typeof form, type = 'text', opts?: string[]) => (
    <div>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--clr-muted)', marginBottom: 6 }}>{label}</label>
      {opts ? (
        <select
          value={form[key]}
          onChange={e => setForm(v => ({ ...v, [key]: e.target.value }))}
          style={{ width: '100%', padding: '9px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: '#f1f5f9', fontSize: 13 }}
        >
          {opts.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input
          type={type}
          value={form[key]}
          onChange={e => setForm(v => ({ ...v, [key]: type === 'number' ? Number(e.target.value) : e.target.value }))}
          style={{ width: '100%', padding: '9px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: '#f1f5f9', fontSize: 13, boxSizing: 'border-box' }}
        />
      )}
    </div>
  )

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#0f1117', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 32, width: '100%', maxWidth: 420 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Zap size={18} style={{ color: '#ef4444' }} /> New Emergency
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-muted)' }}><X size={18} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {field('Patient / Identifier', 'patient_label')}
          {field('Blood Group', 'blood_group', 'text', ['A+','A-','B+','B-','O+','O-','AB+','AB-'])}
          {field('Hospital / Center', 'center_name')}
          {field('Units Needed', 'units_needed', 'number')}
          {field('Hours Until Critical', 'hours_until_critical', 'number')}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '9px 20px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'none', color: 'var(--clr-muted)', cursor: 'pointer' }}>Cancel</button>
          <button
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending || !form.patient_label || !form.center_name}
            style={{ padding: '9px 20px', borderRadius: 8, background: '#ef4444', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', opacity: createMutation.isPending ? 0.7 : 1 }}
          >
            {createMutation.isPending ? 'Creating...' : 'Create Emergency'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function EmergencyBoard() {
  const [showModal, setShowModal] = useState(false)
  const { data: cases, isLoading, isError } = useQuery({
    queryKey: ['emergencies'],
    queryFn: fetchEmergencies,
    refetchInterval: 30000,
  })

  const validCases = Array.isArray(cases) ? cases : (cases as any)?.data || (cases as any)?.emergencies || []
  const open = validCases.filter((c: any) => !c.case_closed)
  const closed = validCases.filter((c: any) => c.case_closed)

  return (
    <div style={{ maxWidth: 1200 }}>
      {showModal && <CreateEmergencyModal onClose={() => setShowModal(false)} />}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ fontSize: 11, color: '#475569', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 6 }}>
            Command Centre
          </div>
          <h1 style={{ fontSize: 26, fontFamily: 'var(--font-display)', fontWeight: 700 }}>
            <Zap size={22} style={{ display: 'inline', marginRight: 10, color: '#ef4444', verticalAlign: 'middle' }} />
            Emergency Board
          </h1>
          <p style={{ color: 'var(--clr-muted)', fontSize: 13, marginTop: 4 }}>
            {cases ? `${open.length} open · ${closed.length} resolved today` : 'Loading...'}
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 20px',
            background: '#ef4444', color: '#fff',
            border: 'none', borderRadius: 10, cursor: 'pointer',
            fontSize: 13, fontWeight: 700,
          }}
        >
          <Plus size={16} /> New Emergency
        </button>
      </div>

      {isLoading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 14 }}>
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 200, borderRadius: 14 }} />)}
        </div>
      )}

      {isError && (
        <div style={{ color: '#ef4444', padding: 20, fontSize: 14 }}>⚠️ Could not load emergency cases.</div>
      )}

      {!isLoading && open.length === 0 && (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <CheckCircle size={40} style={{ color: '#22c55e', display: 'block', margin: '0 auto 16px' }} />
          <p style={{ color: '#22c55e', fontWeight: 600, fontSize: 15 }}>All clear — no open emergencies</p>
          <p style={{ color: 'var(--clr-muted)', fontSize: 13, marginTop: 4 }}>Click "New Emergency" to create one if needed.</p>
        </div>
      )}

      {open.length > 0 && (
        <>
          <h3 style={{ fontSize: 12, color: '#ef4444', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>
            Open — {open.length} case{open.length !== 1 ? 's' : ''}
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 14, marginBottom: 32 }}>
            {open.map((ec: any) => <EmergencyCard key={ec.id} ec={ec} />)}
          </div>
        </>
      )}

      {closed.length > 0 && (
        <>
          <h3 style={{ fontSize: 12, color: '#22c55e', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>
            Resolved — {closed.length}
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 14 }}>
            {closed.map((ec: any) => <EmergencyCard key={ec.id} ec={ec} />)}
          </div>
        </>
      )}
    </div>
  )
}
