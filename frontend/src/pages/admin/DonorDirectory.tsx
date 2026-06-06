/**
 * PulseNet — Donor Directory
 * Full donor pool browsing with filters for command center
 */

import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Droplets, Filter, CheckCircle, XCircle } from 'lucide-react'
import { api } from '@/lib/api'

type Donor = {
  id: number
  external_id: string
  name: string | null
  blood_group: string | null
  eligibility_status: string | null
  user_donation_active_status: string | null
  donations_till_date: number | null
  last_donation_date: string | null
  next_eligible_date: string | null
}

export function DonorDirectory() {
  const [bloodGroup, setBloodGroup] = useState<string>('all')
  const [status, setStatus] = useState<string>('all')

  const { data: donors, isLoading, isError } = useQuery({
    queryKey: ['donors', bloodGroup, status],
    queryFn: () => {
      const params = new URLSearchParams()
      if (bloodGroup !== 'all') params.append('blood_group', bloodGroup)
      if (status !== 'all') params.append('status', status)
      return api.get(`/api/admin/donors?${params.toString()}`).then(r => r.data as Donor[])
    },
    refetchInterval: 60000,
  })

  return (
    <div style={{ maxWidth: 1200 }}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ fontSize: 11, color: '#475569', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 6 }}>
            Command Centre
          </div>
          <h1 style={{ fontSize: 26, fontFamily: 'var(--font-display)', fontWeight: 700 }}>
            <Droplets size={22} style={{ display: 'inline', marginRight: 10, color: '#C0191C', verticalAlign: 'middle' }} />
            Donor Directory
          </h1>
          <p style={{ color: 'var(--clr-muted)', fontSize: 13, marginTop: 4 }}>
            {donors ? `${donors.length} donors matching filters (showing up to 50)` : 'Loading...'}
          </p>
        </div>
      </div>

      {/* ── Filters ── */}
      <div style={{ 
        display: 'flex', gap: 16, marginBottom: 24, padding: '16px 20px', 
        background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12,
        alignItems: 'center', flexWrap: 'wrap'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Filter size={16} color="var(--clr-muted)" />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9' }}>Filters</span>
        </div>
        
        <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.1)' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--clr-muted)' }}>Blood Group:</span>
          <select 
            value={bloodGroup} 
            onChange={e => setBloodGroup(e.target.value)}
            style={{ 
              padding: '6px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', 
              borderRadius: 8, color: '#f1f5f9', fontSize: 13, outline: 'none'
            }}
          >
            <option value="all">All Groups</option>
            <option value="O+">O+</option>
            <option value="O-">O-</option>
            <option value="A+">A+</option>
            <option value="A-">A-</option>
            <option value="B+">B+</option>
            <option value="B-">B-</option>
            <option value="AB+">AB+</option>
            <option value="AB-">AB-</option>
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--clr-muted)' }}>Status:</span>
          <select 
            value={status} 
            onChange={e => setStatus(e.target.value)}
            style={{ 
              padding: '6px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', 
              borderRadius: 8, color: '#f1f5f9', fontSize: 13, outline: 'none'
            }}
          >
            <option value="all">All Statuses</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </div>
      </div>

      {/* ── Table ── */}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ 
          display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1.5fr', gap: 16, 
          padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)',
          fontSize: 11, fontWeight: 600, color: 'var(--clr-muted)', letterSpacing: '0.05em', textTransform: 'uppercase'
        }}>
          <div>Donor</div>
          <div>Blood Group</div>
          <div>Status</div>
          <div>Eligibility</div>
          <div>Donations</div>
          <div>Next Eligible</div>
        </div>

        {isLoading && (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--clr-muted)' }}>Loading donors...</div>
        )}

        {isError && (
          <div style={{ padding: 40, textAlign: 'center', color: '#ef4444' }}>Failed to load donors.</div>
        )}

        {!isLoading && !isError && donors?.length === 0 && (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--clr-muted)' }}>
            No donors found matching these filters.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {donors?.map((d, i) => (
            <div 
              key={d.id} 
              style={{ 
                display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1.5fr', gap: 16, 
                padding: '16px 24px', borderBottom: i < donors.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none',
                alignItems: 'center',
                transition: 'background 0.2s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9' }}>{d.name || 'Unknown'}</div>
                <div style={{ fontSize: 11, color: 'var(--clr-muted)', marginTop: 4, fontFamily: 'monospace' }}>{d.external_id.split('-')[0]}</div>
              </div>

              <div>
                <span style={{ 
                  display: 'inline-flex', padding: '4px 10px', borderRadius: 12, 
                  background: 'rgba(192,25,44,0.15)', color: '#C0191C', fontSize: 12, fontWeight: 700 
                }}>
                  {d.blood_group || '?'}
                </span>
              </div>

              <div>
                {d.user_donation_active_status === 'Active' ? (
                  <span style={{ color: '#22c55e', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <CheckCircle size={12} /> Active
                  </span>
                ) : (
                  <span style={{ color: '#f59e0b', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <XCircle size={12} /> Inactive
                  </span>
                )}
              </div>

              <div>
                <span style={{ fontSize: 13, color: d.eligibility_status === 'eligible' ? '#22c55e' : 'var(--clr-muted)' }}>
                  {d.eligibility_status || 'Unknown'}
                </span>
              </div>

              <div style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9', fontFamily: 'monospace' }}>
                {d.donations_till_date ?? 0}
              </div>

              <div style={{ fontSize: 13, color: 'var(--clr-muted)' }}>
                {d.next_eligible_date ? new Date(d.next_eligible_date).toLocaleDateString() : '—'}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
