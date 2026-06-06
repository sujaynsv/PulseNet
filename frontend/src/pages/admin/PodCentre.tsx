/**
 * PulseNet — Pod Command Centre
 * All patient pods sorted by health (weakest first)
 * Supports AI Refill trigger per pod
 */

import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { GitBranch, Zap, AlertTriangle, CheckCircle, RefreshCw, Users, X, MessageCircle } from 'lucide-react'
import { api } from '@/lib/api'

type Pod = {
  patient_id: number
  patient_label: string
  blood_group: string | null
  next_cycle_date: string | null
  confidence_score: number
  pod_health_score: number
  active_donors: number
  sleeping_donors: number
  cooldown_donors: number
  total_slots: number
  bridge_id: number | null
  status: 'healthy' | 'at_risk' | 'critical'
}

const fetchPods = () => api.get('/api/admin/pods').then(r => r.data as Pod[])

const STATUS_CONFIG = {
  healthy:  { color: '#22c55e', bg: 'rgba(34,197,94,0.1)',   border: 'rgba(34,197,94,0.25)',  label: 'Healthy',  icon: <CheckCircle size={12} /> },
  at_risk:  { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.25)', label: 'At Risk',  icon: <AlertTriangle size={12} /> },
  critical: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.25)',  label: 'Critical', icon: <Zap size={12} /> },
}

function PodRow({ pod, onSuggestBackups }: { pod: Pod, onSuggestBackups: (bridgeId: number) => void }) {
  const qc = useQueryClient()
  const [refillMsg, setRefillMsg] = useState<string | null>(null)

  const refillMutation = useMutation({
    mutationFn: () => api.post(`/api/admin/pods/${pod.patient_id}/ai-refill`).then(r => r.data),
    onSuccess: (data) => {
      setRefillMsg(data.message)
      qc.invalidateQueries({ queryKey: ['pods'] })
    },
    onError: () => setRefillMsg('Refill failed — check backend logs.'),
  })

  const cfg = STATUS_CONFIG[pod.status]
  const healthPct = pod.pod_health_score

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: `1px solid ${cfg.border}`,
      borderRadius: 12,
      padding: '16px 20px',
      display: 'grid',
      gridTemplateColumns: '1fr 80px 100px 140px 140px 120px',
      gap: 16,
      alignItems: 'center',
    }}>
      {/* Patient */}
      <div>
        <div style={{ fontWeight: 600, fontSize: 14, color: '#f1f5f9' }}>{pod.patient_label}</div>
        <div style={{ fontSize: 12, color: 'var(--clr-muted)', marginTop: 2 }}>
          {pod.blood_group || '—'} · {pod.next_cycle_date ? new Date(pod.next_cycle_date).toLocaleDateString() : 'No cycle'}
        </div>
      </div>

      {/* Status badge */}
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '4px 10px', borderRadius: 20,
        background: cfg.bg, border: `1px solid ${cfg.border}`,
        color: cfg.color, fontSize: 11, fontWeight: 600,
      }}>
        {cfg.icon} {cfg.label}
      </div>

      {/* Confidence */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: 'monospace', fontSize: 20, fontWeight: 700, color: cfg.color }}>{pod.confidence_score}%</div>
        <div style={{ fontSize: 10, color: 'var(--clr-muted)', marginTop: 2 }}>Confidence</div>
      </div>

      {/* Health bar */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 11, color: 'var(--clr-muted)' }}>Pod Health</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: cfg.color }}>{healthPct}%</span>
        </div>
        <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${healthPct}%`, background: cfg.color, borderRadius: 3, transition: 'width 0.5s ease' }} />
        </div>
      </div>

      {/* Donor breakdown */}
      <div style={{ display: 'flex', gap: 10, fontSize: 11 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontWeight: 700, color: '#22c55e', fontSize: 15 }}>{pod.active_donors}</div>
          <div style={{ color: 'var(--clr-muted)' }}>Active</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontWeight: 700, color: '#f59e0b', fontSize: 15 }}>{pod.cooldown_donors}</div>
          <div style={{ color: 'var(--clr-muted)' }}>Cooldown</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontWeight: 700, color: '#94a3b8', fontSize: 15 }}>{pod.sleeping_donors}</div>
          <div style={{ color: 'var(--clr-muted)' }}>Sleeping</div>
        </div>
      </div>

      {/* Action */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {pod.status === 'healthy' && (
          <span style={{ fontSize: 11, color: '#22c55e', display: 'flex', alignItems: 'center', gap: 4 }}>
            <CheckCircle size={13} /> Covered
          </span>
        )}
        
        {pod.bridge_id && (
          <button
            onClick={() => onSuggestBackups(pod.bridge_id!)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 14px',
              background: 'rgba(59, 130, 246, 0.15)',
              border: '1px solid rgba(59, 130, 246, 0.4)',
              borderRadius: 8,
              color: '#60a5fa',
              fontSize: 12, fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            <Users size={13} /> Suggest Backups
          </button>
        )}
        
        {refillMsg && (
          <div style={{ fontSize: 10, color: 'var(--clr-muted)', marginTop: 4, maxWidth: 120 }}>{refillMsg}</div>
        )}
      </div>
    </div>
  )
}

export function PodCentre() {
  const [filterStatus, setFilterStatus] = useState<'all' | 'at_risk' | 'critical'>('all')
  const [selectedBridgeId, setSelectedBridgeId] = useState<number | null>(null)
  
  const qc = useQueryClient()
  
  const { data: pods, isLoading, isError, refetch } = useQuery({
    queryKey: ['pods'],
    queryFn: fetchPods,
    refetchInterval: 60000,
  })
  
  const { data: backups, isLoading: isLoadingBackups } = useQuery({
    queryKey: ['recommendedBackups', selectedBridgeId],
    queryFn: () => api.get(`/api/admin/pods/${selectedBridgeId}/recommended-backups`).then(r => r.data),
    enabled: !!selectedBridgeId
  })

  const addBackupMutation = useMutation({
    mutationFn: (data: { pod_id: number, donor_id: number }) => 
      api.post(`/api/admin/pods/${data.pod_id}/add-backup`, { donor_id: data.donor_id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pods'] })
      qc.invalidateQueries({ queryKey: ['recommendedBackups', selectedBridgeId] })
    }
  })

  const notifyBackupMutation = useMutation({
    mutationFn: (donorId: number) => api.post(`/api/admin/notify/${donorId}/whatsapp`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pods'] })
    },
    onError: () => alert('Failed to send WhatsApp reminder'),
  })

  const filtered = pods?.filter(p => filterStatus === 'all' || p.status === filterStatus) ?? []

  return (
    <div style={{ maxWidth: 1200 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ fontSize: 11, color: '#475569', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 6 }}>
            Command Centre
          </div>
          <h1 style={{ fontSize: 26, fontFamily: 'var(--font-display)', fontWeight: 700 }}>
            <GitBranch size={22} style={{ display: 'inline', marginRight: 10, color: '#60a5fa', verticalAlign: 'middle' }} />
            Pod Command Centre
          </h1>
          <p style={{ color: 'var(--clr-muted)', fontSize: 13, marginTop: 4 }}>
            {pods ? `${pods.length} patient pods — sorted by health (weakest first)` : 'Loading...'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {(['all', 'at_risk', 'critical'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilterStatus(f)}
              style={{
                padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                cursor: 'pointer',
                background: filterStatus === f ? 'rgba(192,25,44,0.2)' : 'transparent',
                border: filterStatus === f ? '1px solid rgba(192,25,44,0.4)' : '1px solid rgba(255,255,255,0.1)',
                color: filterStatus === f ? '#C0191C' : 'var(--clr-muted)',
              }}
            >
              {f === 'all' ? 'All' : f === 'at_risk' ? 'At Risk' : 'Critical'}
            </button>
          ))}
          <button onClick={() => refetch()} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', color: 'var(--clr-muted)' }}>
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Column headers */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 80px 100px 140px 140px 120px',
        gap: 16,
        padding: '0 20px',
        marginBottom: 8,
        fontSize: 10,
        color: '#475569',
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        fontWeight: 600,
      }}>
        <span>Patient</span>
        <span>Status</span>
        <span>Score</span>
        <span>Pod Health</span>
        <span>Donors</span>
        <span>Action</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {isLoading && Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="skeleton" style={{ height: 80, borderRadius: 12 }} />
        ))}
        {isError && (
          <div style={{ padding: 24, color: '#ef4444', fontSize: 14 }}>⚠️ Could not load pods.</div>
        )}
        {!isLoading && !isError && filtered.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--clr-muted)', fontSize: 14 }}>
            No pods found for this filter.
          </div>
        )}
        {filtered.map(pod => <PodRow key={pod.patient_id} pod={pod} onSuggestBackups={setSelectedBridgeId} />)}
      </div>

      {/* Backup Recommendations Modal */}
      {selectedBridgeId && (
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
              <button onClick={() => setSelectedBridgeId(null)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}>
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
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>📞 {rec.donor_phone || 'N/A'}</span>
                        {rec.blood_group && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4, borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: 12 }}>
                            🩸 {rec.blood_group}
                          </span>
                        )}
                        {rec.last_donation_date && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4, borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: 12 }}>
                            🕒 Last: {new Date(rec.last_donation_date).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 13, color: '#94a3b8' }}>{rec.reason}</div>
                    </div>
                    <button 
                      onClick={async () => {
                        await addBackupMutation.mutateAsync({ pod_id: selectedBridgeId!, donor_id: rec.donor_id });
                        await notifyBackupMutation.mutateAsync(rec.donor_id);
                        setSelectedBridgeId(null);
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
