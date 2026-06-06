/**
 * PulseNet — Admin Dashboard Page
 * ================================
 * Proves full end-to-end connectivity by making TWO parallel API calls:
 *   1. GET /api/health       → backend alive?
 *   2. GET /api/admin/stats  → DB connected and data returned?
 *   3. GET /api/admin/bridge/mock → ML ranking service working?
 *
 * All rendered on one screen so the team can verify the stack is live
 * immediately after `docker compose up`.
 */

import { useQuery } from '@tanstack/react-query'
import { CheckCircle, AlertCircle, Activity, Users, GitBranch, TrendingDown, Brain, Droplets } from 'lucide-react'
import { StatCard } from '@/components/StatCard'
import { fetchHealth, fetchStats, fetchMockBridge } from '@/lib/api'
import type { CandidateDonor } from '@/lib/api'

// ── Connection status badge ───────────────────────────────────────────────────
function ConnectionBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '8px 16px',
      background: ok ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
      border: `1px solid ${ok ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
      borderRadius: 10,
      fontSize: 13,
      fontWeight: 500,
      color: ok ? '#22c55e' : '#ef4444',
    }}>
      {ok ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
      {label}
    </div>
  )
}

// ── Donor rank row ────────────────────────────────────────────────────────────
function DonorRankRow({ donor, rank }: { donor: CandidateDonor; rank: number }) {
  const score = Math.round(donor.ml_rank_score * 100)
  return (
    <div className="donor-row">
      {/* Rank number */}
      <div style={{
        width: 28, height: 28, borderRadius: '50%',
        background: rank === 1 ? 'var(--clr-blood)' : 'rgba(255,255,255,0.06)',
        color: rank === 1 ? '#fff' : 'var(--clr-muted)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, fontWeight: 700, flexShrink: 0,
      }}>
        {rank}
      </div>

      {/* Name + meta */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: '#f1f5f9' }}>{donor.name}</div>
        <div style={{ fontSize: 12, color: 'var(--clr-muted)', marginTop: 2 }}>
          {donor.blood_group} · {donor.distance_km} km away · {donor.donations_till_date} donations
        </div>
      </div>

      {/* Eligibility badge */}
      <span className={`badge ${donor.eligibility_status === 'eligible' ? 'badge-eligible' : 'badge-inactive'}`}>
        {donor.eligibility_status}
      </span>

      {/* Score bar */}
      <div style={{ width: 100, display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#f1f5f9' }}>{score}%</div>
        <div className="score-bar-track" style={{ width: '100%' }}>
          <div className="score-bar-fill" style={{ width: `${score}%` }} />
        </div>
      </div>
    </div>
  )
}

// ── Dashboard page ────────────────────────────────────────────────────────────
export function Dashboard() {
  const health = useQuery({ queryKey: ['health'], queryFn: fetchHealth, retry: 1 })
  const stats  = useQuery({ queryKey: ['stats'],  queryFn: fetchStats,  retry: 1 })
  const bridge = useQuery({ queryKey: ['bridge'], queryFn: fetchMockBridge, retry: 1 })

  const backendOk = health.data?.status === 'ok'
  const dbOk      = !stats.isError && stats.data !== undefined

  return (
    <div style={{ maxWidth: 1200 }}>
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontFamily: 'var(--font-display)', fontWeight: 700 }}>
          <span className="gradient-text">PulseNet</span> Command Centre
        </h1>
        <p style={{ color: 'var(--clr-muted)', fontSize: 14, marginTop: 6 }}>
          AI-enabled care coordination for Blood Warriors Foundation — Thalassemia Patient Support
        </p>
      </div>

      {/* ── Live connection status row ──────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 32, flexWrap: 'wrap' }}>
        <ConnectionBadge
          ok={!health.isLoading && backendOk}
          label={health.isLoading ? 'Checking backend…' : backendOk ? 'FastAPI Backend · Online' : 'Backend · Offline'}
        />
        <ConnectionBadge
          ok={!stats.isLoading && dbOk}
          label={stats.isLoading ? 'Checking database…' : dbOk ? 'AWS RDS · Connected' : 'Database · Error'}
        />
        <ConnectionBadge
          ok={!bridge.isLoading && !bridge.isError}
          label={bridge.isLoading ? 'Loading ML…' : !bridge.isError ? `ML Ranking · ${bridge.data?.model_used ?? 'active'}` : 'ML · Error'}
        />
      </div>

      {/* ── Stats grid ───────────────────────────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: 16,
        marginBottom: 40,
      }}>
        {stats.isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 120 }} />
          ))
        ) : stats.isError ? (
          <div style={{ gridColumn: '1/-1', color: '#ef4444', fontSize: 14 }}>
            ⚠️ Could not load stats — ensure backend is running and DATABASE_URL is set.
          </div>
        ) : stats.data ? (
          <>
            <StatCard
              label="Total Users"
              value={stats.data.total_users.toLocaleString()}
              sub="Donors + volunteers registered"
              color="var(--clr-blood-light)"
              icon={<Users size={20} />}
            />
            <StatCard
              label="Active Bridges"
              value={stats.data.active_bridges}
              sub={`of ${stats.data.total_bridges} total`}
              color="#60a5fa"
              icon={<GitBranch size={20} />}
            />
            <StatCard
              label="Eligible Donors"
              value={stats.data.eligible_donors}
              sub="Ready to donate now"
              color="#22c55e"
              icon={<Droplets size={20} />}
            />
            <StatCard
              label="Active Donors"
              value={stats.data.active_donors}
              sub="Engaged in last cycle"
              color="var(--clr-accent)"
              icon={<Activity size={20} />}
            />
            <StatCard
              label="Fatigue Risk"
              value={stats.data.donor_fatigue_risk}
              sub="Need re-engagement"
              color="#f87171"
              icon={<TrendingDown size={20} />}
            />
          </>
        ) : null}
      </div>

      {/* ── Mock Bridge — Ranked donors section ──────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {/* Patient card */}
        <div className="glass-card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <Brain size={16} style={{ color: 'var(--clr-blood-light)' }} />
            <h2 style={{ fontSize: 16, fontWeight: 600 }}>AI Bridge Matching Demo</h2>
          </div>

          {bridge.isLoading ? (
            <div className="skeleton" style={{ height: 120 }} />
          ) : bridge.isError ? (
            <div style={{ color: '#f87171', fontSize: 13 }}>
              ⚠️ Could not reach /api/admin/bridge/mock
            </div>
          ) : bridge.data ? (
            <>
              <div style={{
                padding: '16px 20px',
                background: 'rgba(192,25,44,0.08)',
                border: '1px solid rgba(192,25,44,0.2)',
                borderRadius: 12, marginBottom: 16,
              }}>
                <div style={{ fontSize: 11, color: 'var(--clr-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                  Patient
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700 }}>
                  {bridge.data.patient.name}
                </div>
                <div style={{ fontSize: 13, color: 'var(--clr-muted)', marginTop: 4 }}>
                  {bridge.data.patient.blood_group} · Next transfusion:{' '}
                  <strong style={{ color: 'var(--clr-accent)' }}>
                    {bridge.data.patient.next_transfusion_date}
                  </strong>
                </div>
              </div>

              <div style={{ fontSize: 11, color: 'var(--clr-muted)', marginBottom: 8 }}>
                MODEL: <span style={{ color: 'var(--clr-blood-light)', fontWeight: 600 }}>
                  {bridge.data.model_used.toUpperCase()}
                </span> · Generated {bridge.data.generated_at}
              </div>
            </>
          ) : null}
        </div>

        {/* Ranked donors */}
        <div className="glass-card" style={{ padding: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
            Ranked Replacement Donors
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {bridge.isLoading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="skeleton" style={{ height: 64 }} />
                ))
              : bridge.data?.ranked_donors.map((donor, i) => (
                  <DonorRankRow key={donor.external_id} donor={donor} rank={i + 1} />
                ))}
          </div>
        </div>
      </div>
    </div>
  )
}
