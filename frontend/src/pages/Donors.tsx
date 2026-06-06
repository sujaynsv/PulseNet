/**
 * Donors Page — Branch: feature/donor-flow
 * Shows eligible and inactive donors. Team extends this.
 */
import { useQuery } from '@tanstack/react-query'
import { Users, RefreshCw } from 'lucide-react'
import { api } from '@/lib/api'
type UserRead = any;

const fetchEligibleDonors = () => api.get('/api/admin/donors/eligible').then(res => res.data);
const fetchInactiveDonors = () => api.get('/api/admin/donors/inactive').then(res => res.data);

function DonorCard({ donor }: { donor: UserRead }) {
  const active = donor.user_donation_active_status === 'Active'
  return (
    <div className="donor-row" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
      <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{donor.name ?? donor.external_id.slice(0, 16) + '…'}</div>
          <div style={{ fontSize: 12, color: 'var(--clr-muted)', marginTop: 2 }}>
            {donor.blood_group} · {donor.gender}
          </div>
        </div>
        <span className={`badge ${active ? 'badge-active' : 'badge-inactive'}`}>
          {donor.user_donation_active_status ?? 'Unknown'}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 12, color: 'var(--clr-muted)' }}>
        <span>Donations: <strong style={{ color: '#f1f5f9' }}>{donor.donations_till_date ?? 0}</strong></span>
        <span>Ratio: <strong style={{ color: '#f1f5f9' }}>{donor.calls_to_donations_ratio?.toFixed(2) ?? '—'}</strong></span>
        <span>Eligible: <strong style={{ color: donor.eligibility_status === 'eligible' ? '#22c55e' : '#ef4444' }}>
          {donor.eligibility_status ?? '—'}
        </strong></span>
      </div>
    </div>
  )
}

export function Donors() {
  const eligible  = useQuery({ queryKey: ['eligible-donors'],  queryFn: () => fetchEligibleDonors() })
  const inactive  = useQuery({ queryKey: ['inactive-donors'],  queryFn: fetchInactiveDonors })

  return (
    <div style={{ maxWidth: 1000 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32 }}>
        <Users size={24} style={{ color: 'var(--clr-blood-light)' }} />
        <div>
          <h1 style={{ fontSize: 24, fontFamily: 'var(--font-display)' }}>Donor Management</h1>
          <p style={{ color: 'var(--clr-muted)', fontSize: 14, marginTop: 4 }}>
            Branch: <code style={{ color: 'var(--clr-blood-light)' }}>feature/donor-flow</code>
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {/* Eligible */}
        <div className="glass-card" style={{ padding: 20 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, color: '#22c55e' }}>
            ✅ Eligible Donors ({eligible.data?.length ?? 0})
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {eligible.isLoading
              ? Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 80 }} />)
              : eligible.data?.map((d: any) => <DonorCard key={d.id} donor={d} />)}
          </div>
        </div>

        {/* Inactive / Re-engagement */}
        <div className="glass-card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <RefreshCw size={14} style={{ color: 'var(--clr-accent)' }} />
            <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--clr-accent)' }}>
              Re-engagement Targets ({inactive.data?.length ?? 0})
            </h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {inactive.isLoading
              ? Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 80 }} />)
              : inactive.data?.map((d: any) => <DonorCard key={d.id} donor={d} />)}
          </div>
        </div>
      </div>
    </div>
  )
}
