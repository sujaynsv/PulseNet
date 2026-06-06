import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Clock, AlertTriangle, CheckCircle, Zap, Droplets, MessageCircle, Phone, User as UserIcon, Activity, Users, RefreshCw, X } from 'lucide-react'
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
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

const fetchBridge = (patientId: number) =>
  api.get(`/api/admin/bridge/${patientId}`).then(r => r.data)

const STATE_CFG = {
  covered:  { color: '#22c55e', bg: 'rgba(34,197,94,0.1)',   border: 'rgba(34,197,94,0.2)',  icon: <CheckCircle size={14} />, label: 'Covered' },
  at_risk:  { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.2)', icon: <AlertTriangle size={14} />, label: 'At Risk' },
  critical: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.2)',  icon: <Zap size={14} />, label: 'Critical' },
}

function DetailView({ cycle, onFindBackups }: { cycle: CycleCard, onFindBackups: (id: number) => void }) {
  const cfg = STATE_CFG[cycle.state]
  const { data: bridge, isLoading: isLoadingBridge } = useQuery({
    queryKey: ['bridge', cycle.patient_id],
    queryFn: () => fetchBridge(cycle.patient_id),
  })

  const queryClient = useQueryClient()
  const notifyMutation = useMutation({
    mutationFn: (donorId: number) => api.post(`/api/admin/notify/${donorId}/whatsapp`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bridge', cycle.patient_id] })
    },
    onError: () => alert('Failed to send WhatsApp reminder'),
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Detail Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, color: '#f8fafc', margin: 0 }}>
              {cycle.patient_name || `Patient #${cycle.patient_id}`}
            </h2>
            <span style={{ fontSize: 13, padding: '4px 10px', borderRadius: 16, background: 'rgba(192,25,44,0.15)', color: '#C0191C', fontWeight: 700 }}>
              {cycle.blood_group || '?'}
            </span>
          </div>
          <div style={{ fontSize: 13, color: 'var(--clr-muted)', display: 'flex', gap: 16 }}>
            <span>Due: <strong style={{ color: '#e2e8f0' }}>{new Date(cycle.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</strong></span>
            <span>ID: <strong style={{ color: '#e2e8f0' }}>#{cycle.patient_id}</strong></span>
          </div>
        </div>
        <div style={{ padding: '6px 14px', borderRadius: 20, background: cfg.bg, color: cfg.color, fontSize: 12, fontWeight: 700, border: `1px solid ${cfg.border}`, display: 'flex', alignItems: 'center', gap: 6 }}>
          {cfg.icon} {cfg.label}
        </div>
      </div>

      {/* Visual Progress Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ background: 'rgba(0,0,0,0.2)', padding: 16, borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ fontSize: 12, color: 'var(--clr-muted)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Activity size={14} /> Confidence Score
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
            <span style={{ fontSize: 28, fontWeight: 700, color: cfg.color, lineHeight: 1 }}>{cycle.confidence_score}%</span>
          </div>
          <div style={{ height: 6, background: 'rgba(255,255,255,0.1)', borderRadius: 3, marginTop: 12, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${cycle.confidence_score}%`, background: cfg.color, borderRadius: 3, transition: 'width 0.5s' }} />
          </div>
        </div>

        <div style={{ background: 'rgba(0,0,0,0.2)', padding: 16, borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ fontSize: 12, color: 'var(--clr-muted)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Droplets size={14} style={{ color: '#38bdf8' }} /> Units Expected
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
            <span style={{ fontSize: 28, fontWeight: 700, color: '#f8fafc', lineHeight: 1 }}>{cycle.expected_units}</span>
            <span style={{ fontSize: 12, color: 'var(--clr-muted)', marginBottom: 4 }}>units needed</span>
          </div>
          <div style={{ height: 6, background: 'rgba(255,255,255,0.1)', borderRadius: 3, marginTop: 12, overflow: 'hidden' }}>
             <div style={{ height: '100%', width: '100%', background: '#38bdf8', borderRadius: 3 }} />
          </div>
        </div>
      </div>

      {/* Blood Bridge Team Grid */}
      <div>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--clr-muted)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Blood Bridge Team
        </h3>
        {isLoadingBridge ? (
          <div className="skeleton" style={{ height: 100, borderRadius: 12 }} />
        ) : !bridge || bridge.slots.filter((s: any) => s.donor_id).length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: 12, color: '#94a3b8' }}>
            No donors mapped to this bridge.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {bridge.slots
              .filter((s: any) => s.donor_id && (!s.is_backup || s.requirement_status === 'confirmed' || s.requirement_status === 'waitlisted'))
              .sort((a: any, b: any) => {
                if (a.is_backup !== b.is_backup) {
                  return a.is_backup ? 1 : -1;
                }
                return a.cycle_position - b.cycle_position;
              })
              .map((slot: any) => (
              <div key={slot.slot_id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                padding: '12px 16px', borderRadius: 10
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ background: 'rgba(0,0,0,0.3)', width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <UserIcon size={16} color="var(--clr-muted)" />
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: 8 }}>
                      {slot.donor_name}
                      {slot.is_backup && (
                        <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'rgba(167, 139, 250, 0.2)', color: '#a78bfa', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Backup</span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Phone size={10} /> {slot.donor_phone || 'N/A'}</span>
                      {slot.last_donation_date && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: 12 }}>
                          <Clock size={10} /> Last: {new Date(slot.last_donation_date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      )}
                      {slot.expected_next_donation_date && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: 12, color: slot.slot_status === 'Active' ? '#4ade80' : slot.slot_status === 'Due' ? '#facc15' : '#f87171' }}>
                          <Droplets size={10} /> Due: {new Date(slot.expected_next_donation_date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  {slot.requirement_status === 'confirmed' ? (
                    <span style={{ fontSize: 12, padding: '4px 10px', borderRadius: 12, background: 'rgba(34,197,94,0.15)', color: '#4ade80', fontWeight: 600, border: '1px solid rgba(74,222,128,0.3)' }}>
                      ✓ Confirmed
                    </span>
                  ) : slot.requirement_status === 'declined' ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12, padding: '4px 10px', borderRadius: 12, background: 'rgba(239,68,68,0.15)', color: '#f87171', fontWeight: 600, border: '1px solid rgba(248,113,113,0.3)' }}>
                        ✗ Declined
                      </span>
                      <button
                        onClick={() => onFindBackups(bridge.bridge_id)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 4,
                          padding: '4px 10px',
                          background: 'rgba(59, 130, 246, 0.15)',
                          border: '1px solid rgba(59, 130, 246, 0.4)',
                          borderRadius: 12,
                          color: '#60a5fa',
                          fontSize: 12, fontWeight: 600,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <Users size={12} /> Find Backups
                      </button>
                    </div>
                  ) : slot.requirement_status === 'waitlisted' ? (
                    <span style={{ fontSize: 12, padding: '4px 10px', borderRadius: 12, background: 'rgba(234,179,8,0.15)', color: '#facc15', fontWeight: 600, border: '1px solid rgba(250,204,21,0.3)' }}>
                      Waitlist
                    </span>
                  ) : slot.requirement_status === 'pending' ? (
                    <span style={{ fontSize: 12, padding: '4px 10px', borderRadius: 12, background: 'rgba(255,255,255,0.05)', color: '#94a3b8', fontWeight: 600, border: '1px solid rgba(255,255,255,0.1)' }}>
                      Pending
                    </span>
                  ) : (
                    <span style={{ fontSize: 12, padding: '4px 10px', borderRadius: 12, background: slot.slot_status === 'Active' ? 'rgba(34,197,94,0.1)' : 'rgba(245,158,11,0.1)', color: slot.slot_status === 'Active' ? '#22c55e' : '#f59e0b' }}>
                      {slot.slot_status}
                    </span>
                  )}
                  
                  <button
                    disabled={notifyMutation.isPending || slot.requirement_status === 'confirmed' || slot.requirement_status === 'declined' || slot.requirement_status === 'waitlisted'}
                    onClick={() => notifyMutation.mutate(slot.donor_id)}
                    style={{
                      background: slot.requirement_status === 'confirmed' || slot.requirement_status === 'declined' || slot.requirement_status === 'waitlisted' ? 'rgba(255,255,255,0.1)' : '#25D366', 
                      color: slot.requirement_status === 'confirmed' || slot.requirement_status === 'declined' || slot.requirement_status === 'waitlisted' ? 'var(--clr-muted)' : '#fff', 
                      border: 'none',
                      padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                      display: 'flex', alignItems: 'center', gap: 6, 
                      cursor: slot.requirement_status === 'confirmed' || slot.requirement_status === 'declined' || slot.requirement_status === 'waitlisted' ? 'not-allowed' : 'pointer',
                      opacity: notifyMutation.isPending ? 0.6 : 1,
                      transition: 'background 0.2s, opacity 0.2s'
                    }}
                  >
                    <MessageCircle size={16} /> 
                    {slot.requirement_status === 'pending' ? 'Sent' : 'WhatsApp'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function CycleReadiness() {
  const [days, setDays] = useState(7)
  const [selectedCycleId, setSelectedCycleId] = useState<number | null>(null)
  const [selectedBridgeIdForBackups, setSelectedBridgeIdForBackups] = useState<number | null>(null)

  const qc = useQueryClient()

  const { data: cycles, isLoading } = useQuery({
    queryKey: ['upcoming-cycles', days],
    queryFn: () => fetchCycles(days),
    refetchInterval: 60000,
  })

  const { data: backups, isLoading: isLoadingBackups } = useQuery({
    queryKey: ['recommendedBackups', selectedBridgeIdForBackups],
    queryFn: () => api.get(`/api/admin/pods/${selectedBridgeIdForBackups}/recommended-backups`).then(r => r.data),
    enabled: !!selectedBridgeIdForBackups
  })

  const addBackupMutation = useMutation({
    mutationFn: (data: { pod_id: number, donor_id: number }) => 
      api.post(`/api/admin/pods/${data.pod_id}/add-backup`, { donor_id: data.donor_id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['upcoming-cycles', days] })
      qc.invalidateQueries({ queryKey: ['recommendedBackups', selectedBridgeIdForBackups] })
    }
  })

  const notifyBackupMutation = useMutation({
    mutationFn: (donorId: number) => api.post(`/api/admin/notify/${donorId}/whatsapp`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['upcoming-cycles', days] })
    },
    onError: () => alert('Failed to send WhatsApp reminder'),
  })

  // Auto-select first cycle on load
  React.useEffect(() => {
    if (cycles && cycles.length > 0 && selectedCycleId === null) {
      setSelectedCycleId(cycles[0].cycle_id)
    }
  }, [cycles, selectedCycleId])

  const chartData = useMemo(() => {
    if (!cycles) return []
    const datesMap: Record<string, any> = {}
    
    // Create a date range to ensure blank days are shown
    const today = new Date()
    for (let i = 0; i <= days; i++) {
      const d = new Date(today)
      d.setDate(today.getDate() + i)
      const dateStr = d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
      datesMap[dateStr] = { name: dateStr, critical: 0, at_risk: 0, covered: 0 }
    }

    cycles.forEach(c => {
      const d = new Date(c.due_date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
      if (datesMap[d]) {
        datesMap[d][c.state] += 1
      }
    })
    return Object.values(datesMap)
  }, [cycles, days])

  const selectedCycle = useMemo(() => {
    return cycles?.find(c => c.cycle_id === selectedCycleId) || null
  }, [cycles, selectedCycleId])

  return (
    <div style={{ maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
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
        <div style={{ display: 'flex', gap: 6, background: 'rgba(255,255,255,0.02)', padding: 4, borderRadius: 24 }}>
          {[3, 7, 14].map(d => (
            <button
              key={d}
              onClick={() => setDays(d)}
              style={{
                padding: '6px 16px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                background: days === d ? '#a78bfa' : 'transparent',
                border: 'none',
                color: days === d ? '#0f172a' : '#94a3b8',
                transition: 'all 0.2s'
              }}
            >
              {d} Days
            </button>
          ))}
        </div>
      </div>

      {/* Top Visualization */}
      <div style={{ height: 160, marginBottom: 24, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 16, padding: '20px 20px 0 20px' }}>
        {isLoading ? (
          <div className="skeleton" style={{ width: '100%', height: '100%', borderRadius: 8 }} />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <XAxis dataKey="name" stroke="#475569" fontSize={11} tickLine={false} axisLine={false} dy={5} />
              <Tooltip 
                cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }} 
              />
              <Bar dataKey="covered" stackId="a" fill="#22c55e" radius={[0, 0, 4, 4]} />
              <Bar dataKey="at_risk" stackId="a" fill="#f59e0b" />
              <Bar dataKey="critical" stackId="a" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Master-Detail Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 24, alignItems: 'flex-start' }}>
        
        {/* Left Panel: Master List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '600px', overflowY: 'auto', paddingRight: 8 }}>
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 90, borderRadius: 12 }} />)
          ) : cycles?.length === 0 ? (
             <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
               <CheckCircle size={32} style={{ color: '#22c55e', margin: '0 auto 12px' }} />
               No cycles in window
             </div>
          ) : (
            cycles?.map(card => {
              const isSelected = selectedCycleId === card.cycle_id
              const cfg = STATE_CFG[card.state]
              return (
                <div 
                  key={card.cycle_id} 
                  onClick={() => setSelectedCycleId(card.cycle_id)}
                  style={{
                    background: isSelected ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${isSelected ? cfg.color : 'rgba(255,255,255,0.05)'}`,
                    borderRadius: 12,
                    padding: '14px 16px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    position: 'relative',
                    overflow: 'hidden'
                  }}
                >
                  {isSelected && (
                    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: cfg.color }} />
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: isSelected ? '#f8fafc' : '#cbd5e1' }}>
                      {card.patient_name || `Patient #${card.patient_id}`}
                    </div>
                    <div style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: cfg.bg, color: cfg.color, fontWeight: 700 }}>
                      {card.state.replace('_', ' ')}
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', display: 'flex', justifyContent: 'space-between' }}>
                    <span>Due: {new Date(card.due_date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}</span>
                    <span>Score: {card.confidence_score}%</span>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Right Panel: Detail View */}
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 16, padding: 28, minHeight: '600px' }}>
          {selectedCycle ? (
            <DetailView cycle={selectedCycle} onFindBackups={setSelectedBridgeIdForBackups} />
          ) : (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
               <Activity size={48} style={{ opacity: 0.2, marginBottom: 16 }} />
               <p>Select a cycle from the list to view details</p>
            </div>
          )}
        </div>

      </div>

      {selectedBridgeIdForBackups && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100
        }}>
          <div style={{
            background: '#0f172a', border: '1px solid #1e293b', borderRadius: 16,
            width: 600, maxWidth: '90vw', padding: 24,
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 700, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Users size={20} color="#60a5fa" />
                  AI Recommended Backups
                </h2>
                <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                  Powered by Active Status Model & Eligibility Status Model
                </p>
              </div>
              <button onClick={() => setSelectedBridgeIdForBackups(null)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            {isLoadingBackups ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
                <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 12px' }} />
                Running AI models...
              </div>
            ) : backups?.recommended_backups?.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 400, overflowY: 'auto' }}>
                {backups.recommended_backups.map((rec: any, idx: number) => (
                  <div key={rec.donor_id} style={{
                    background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
                    borderRadius: 12, padding: 16, display: 'flex', gap: 16, alignItems: 'center'
                  }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: '50%', background: 'rgba(96, 165, 250, 0.1)',
                      color: '#60a5fa', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 700, fontSize: 14
                    }}>
                      #{idx + 1}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontWeight: 600, color: '#f1f5f9', fontSize: 14 }}>{rec.donor_name || `Donor #${rec.donor_id}`}</span>
                        <span style={{ 
                          fontSize: 12, fontWeight: 700, 
                          color: rec.match_score > 0.8 ? '#22c55e' : '#f59e0b',
                          background: rec.match_score > 0.8 ? 'rgba(34,197,94,0.1)' : 'rgba(245,158,11,0.1)',
                          padding: '2px 8px', borderRadius: 12
                        }}>
                          {(rec.match_score * 100).toFixed(0)}% Match
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Phone size={10} /> {rec.donor_phone || 'N/A'}</span>
                        {rec.blood_group && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4, borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: 12 }}>
                            <Droplets size={10} /> {rec.blood_group}
                          </span>
                        )}
                        {rec.last_donation_date && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4, borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: 12 }}>
                            <Clock size={10} /> Last: {new Date(rec.last_donation_date).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 13, color: '#94a3b8' }}>{rec.reason}</div>
                    </div>
                    <button 
                      onClick={async () => {
                        await addBackupMutation.mutateAsync({ pod_id: selectedBridgeIdForBackups!, donor_id: rec.donor_id });
                        await notifyBackupMutation.mutateAsync(rec.donor_id);
                        setSelectedBridgeIdForBackups(null);
                      }}
                      disabled={addBackupMutation.isPending || notifyBackupMutation.isPending}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '6px 14px',
                        background: 'rgba(34,197,94,0.15)',
                        border: '1px solid rgba(34,197,94,0.3)',
                        borderRadius: 10,
                        color: '#4ade80',
                        fontSize: 13, fontWeight: 600,
                        cursor: (addBackupMutation.isPending || notifyBackupMutation.isPending) ? 'not-allowed' : 'pointer',
                        opacity: (addBackupMutation.isPending || notifyBackupMutation.isPending) ? 0.7 : 1,
                        transition: 'all 0.2s'
                    }}>
                      <MessageCircle size={14} /> WhatsApp
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
                No compatible backup donors found for this pod.
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  )
}
