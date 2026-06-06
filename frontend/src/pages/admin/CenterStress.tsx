/**
 * PulseNet — Center Stress Command View
 * =====================================
 * Interactive Leaflet heatmap of Hyderabad transfusion centers
 * with red/amber/green status dots + AI-powered operational insights.
 * 
 * Design: Dark cartographic aesthetic with neon-glow overlays,
 * inspired by military command center UIs.
 */

import React, { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Activity, AlertTriangle, CheckCircle, Zap, Users, Droplets,
  Brain, RefreshCw, ChevronDown, ChevronUp, MapPin, Shield, ShieldAlert,
  ArrowRight, Lightbulb, Bell, X
} from 'lucide-react'
import { geoMercator, geoPath } from 'd3-geo'
import * as topojson from 'topojson-client'
import indiaData from '@/assets/india_full.json'
import { api } from '@/lib/api'

// ── Types ────────────────────────────────────────────────────────────────────

type CenterGeo = {
  center_name: string
  latitude: number
  longitude: number
  patient_count: number
  cycles_next_7_days: number
  open_emergencies: number
  eligible_donors_nearby: number
  stress_score: number
  stress_level: 'Low' | 'Moderate' | 'High' | 'Critical'
}

type CenterRow = {
  center_name: string
  patient_count: number
  cycles_next_7_days: number
  open_emergencies: number
  eligible_donors_nearby: number
  stress_score: number
  stress_level: 'Low' | 'Moderate' | 'High' | 'Critical'
}

type Insight = {
  type: 'action' | 'warning' | 'info'
  priority: 'high' | 'medium' | 'low'
  title: string
  description: string
  metric: string
}

type InsightsResponse = {
  source: string
  insights: Insight[]
  raw?: string
}

// ── Fetch functions ──────────────────────────────────────────────────────────

const fetchGeoData = () => api.get('/api/admin/center-stress/geo').then(r => r.data as CenterGeo[])
const fetchCenterStress = () => api.get('/api/admin/center-stress').then(r => r.data as CenterRow[])
const postAiInsights = () => api.post('/api/admin/ai-insights').then(r => r.data as InsightsResponse)

// ── Color config ─────────────────────────────────────────────────────────────

const STRESS_COLORS: Record<string, { fill: string; glow: string; text: string; bg: string; border: string }> = {
  Low:      { fill: '#22c55e', glow: 'rgba(34,197,94,0.5)',  text: '#22c55e', bg: 'rgba(34,197,94,0.08)',  border: 'rgba(34,197,94,0.2)' },
  Moderate: { fill: '#60a5fa', glow: 'rgba(96,165,250,0.5)', text: '#60a5fa', bg: 'rgba(96,165,250,0.08)', border: 'rgba(96,165,250,0.2)' },
  High:     { fill: '#f59e0b', glow: 'rgba(245,158,11,0.5)', text: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.2)' },
  Critical: { fill: '#ef4444', glow: 'rgba(239,68,68,0.5)',  text: '#ef4444', bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.2)' },
}

const INSIGHT_ICONS: Record<string, React.ReactNode> = {
  action:  <Lightbulb size={16} />,
  warning: <AlertTriangle size={16} />,
  info:    <Shield size={16} />,
}

const INSIGHT_COLORS: Record<string, { color: string; bg: string; border: string }> = {
  action:  { color: '#60a5fa', bg: 'rgba(96,165,250,0.06)',  border: 'rgba(96,165,250,0.15)' },
  warning: { color: '#f59e0b', bg: 'rgba(245,158,11,0.06)', border: 'rgba(245,158,11,0.15)' },
  info:    { color: '#a78bfa', bg: 'rgba(167,139,250,0.06)', border: 'rgba(167,139,250,0.15)' },
}

const PRIORITY_BADGE: Record<string, { color: string; bg: string }> = {
  high:   { color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  medium: { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  low:    { color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
}

// ── Dot Matrix Map Component ───────────────────────────────────────────────────

function DotMatrixMapComponent({ centers }: { centers: CenterGeo[] }) {
  const [viewMode, setViewMode] = useState<'india' | 'hyderabad'>('india')
  const [selectedCenter, setSelectedCenter] = useState<CenterGeo | null>(null)
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null)
  const [isZooming, setIsZooming] = useState(false)
  const [isHoveringHyd, setIsHoveringHyd] = useState(false)

  const mapWidth = 900
  const mapHeight = 500

  // ── 1. D3 Geo Setup for India ──────────────────────────────────────────────
  const indiaFeature = React.useMemo(() => {
    // indiaData is a FeatureCollection, we just need the first feature
    return (indiaData as any).features[0]
  }, [])

  const { projection, indiaPathD } = React.useMemo(() => {
    const proj = geoMercator().fitSize([mapWidth, mapHeight], indiaFeature)
    const path = geoPath().projection(proj)
    return { projection: proj, indiaPathD: path(indiaFeature) }
  }, [indiaFeature])

  // Center of Hyderabad relative to the India projection
  const [hydX, hydY] = projection([78.4747, 17.3850]) || [0, 0]

  // ── 2. Local Hyderabad Grid Setup ──────────────────────────────────────────
  const MIN_LAT = 17.32
  const MAX_LAT = 17.58
  const MIN_LON = 78.32
  const MAX_LON = 78.62

  const getLocalX = (lon: number) => ((lon - MIN_LON) / (MAX_LON - MIN_LON)) * mapWidth
  const getLocalY = (lat: number) => ((1 - (lat - MIN_LAT) / (MAX_LAT - MIN_LAT))) * mapHeight

  const localDots = React.useMemo(() => {
    const cols = 45
    const rows = 25
    const dots = []
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        dots.push({
          x: c * (mapWidth / cols) + (mapWidth / cols) / 2,
          y: r * (mapHeight / rows) + (mapHeight / rows) / 2,
          opacity: Math.random() * 0.15 + 0.05
        })
      }
    }
    return dots
  }, [])

  // ── 3. Interactions ────────────────────────────────────────────────────────
  const handleHydClick = () => {
    if (viewMode === 'hyderabad') return
    setSelectedRegion('hyderabad')
  }

  const handleZoomToHyderabad = () => {
    setSelectedRegion(null)
    setIsZooming(true)
    setTimeout(() => {
      setViewMode('hyderabad')
      setIsZooming(false)
    }, 800) // Match CSS transition duration
  }

  const handleBackToNational = () => {
    setSelectedCenter(null)
    setSelectedRegion(null)
    setViewMode('india')
  }

  // Calculate transform for India map
  const mapTransform = viewMode === 'india' && !isZooming
    ? `scale(1) translate(0px, 0px)`
    : `translate(\${mapWidth/2}px, \${mapHeight/2}px) scale(35) translate(\${-hydX}px, \${-hydY}px)`

  return (
    <div style={{ position: 'relative', borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)', background: '#0a0f2e', height: 500 }}>
      {/* Background Glow */}
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 600, height: 400, background: 'radial-gradient(ellipse, rgba(167,139,250,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />
      
      {/* Navigation Controls */}
      <div style={{ position: 'absolute', top: 16, right: 16, zIndex: 20 }}>
        {viewMode === 'hyderabad' && (
          <button 
            onClick={handleBackToNational}
            style={{ 
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'rgba(10,15,46,0.8)', border: '1px solid rgba(255,255,255,0.1)',
              color: '#94a3b8', padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
              fontSize: 12, fontWeight: 600, backdropFilter: 'blur(8px)',
              transition: 'all 0.2s'
            }}
            onMouseEnter={e => e.currentTarget.style.color = '#fff'}
            onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}
          >
            <ArrowRight size={14} style={{ transform: 'rotate(180deg)' }} /> National View
          </button>
        )}
      </div>

      {/* Map legend overlay */}
      <div style={{
        position: 'absolute', bottom: 16, left: 16, zIndex: 10,
        background: 'rgba(10,15,46,0.92)', backdropFilter: 'blur(12px)',
        borderRadius: 12, padding: '12px 16px',
        border: '1px solid rgba(255,255,255,0.08)',
        transition: 'opacity 0.4s',
        opacity: viewMode === 'hyderabad' ? 1 : 0,
        pointerEvents: viewMode === 'hyderabad' ? 'auto' : 'none'
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
          Center Status
        </div>
        {['Critical', 'High', 'Moderate', 'Low'].map(level => {
          const cfg = STRESS_COLORS[level]
          return (
            <div key={level} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: cfg.fill, boxShadow: `0 0 8px \${cfg.glow}` }} />
              <span style={{ fontSize: 11, color: '#94a3b8' }}>{level}</span>
            </div>
          )
        })}
      </div>

      {/* Map title overlay */}
      <div style={{
        position: 'absolute', top: 16, left: 16, zIndex: 10,
        background: 'rgba(10,15,46,0.88)', backdropFilter: 'blur(12px)',
        borderRadius: 10, padding: '10px 16px',
        border: '1px solid rgba(255,255,255,0.08)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <MapPin size={14} color="#C0191C" />
          <span style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>
            {viewMode === 'india' ? 'National Operations Network' : 'Hyderabad Network'}
          </span>
        </div>
        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>
          {viewMode === 'india' ? 'Select region to inspect' : `\${centers.length} center\${centers.length !== 1 ? 's' : ''} monitored`}
        </div>
      </div>

      {/* SVG Canvas */}
      <svg width="100%" height="100%" viewBox={`0 0 \${mapWidth} \${mapHeight}`} style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <pattern id="dot-grid" width="8" height="8" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1.5" fill="rgba(255,255,255,0.2)" />
          </pattern>
          <radialGradient id="heatmap-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(239, 68, 68, 0.6)" />
            <stop offset="30%" stopColor="rgba(245, 158, 11, 0.4)" />
            <stop offset="65%" stopColor="rgba(167, 139, 250, 0.15)" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
        </defs>

        {/* ── INDIA LAYER ── */}
        <g 
          style={{ 
            transition: 'transform 0.8s cubic-bezier(0.65, 0, 0.35, 1), opacity 0.4s',
            transform: mapTransform,
            opacity: viewMode === 'hyderabad' ? 0 : 1,
            pointerEvents: viewMode === 'hyderabad' ? 'none' : 'auto'
          }}
        >
          {indiaPathD && (
            <path d={indiaPathD} fill="url(#dot-grid)" stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
          )}

          {/* Heatmap glow over Hyderabad */}
          <circle cx={hydX} cy={hydY} r={80} fill="url(#heatmap-glow)" style={{ cursor: 'pointer', mixBlendMode: 'screen' }} onClick={handleHydClick} onMouseEnter={() => setIsHoveringHyd(true)} onMouseLeave={() => setIsHoveringHyd(false)} />
          
          {/* Hyderabad Interactive Node */}
          <g 
            transform={`translate(\${hydX}, \${hydY})`} 
            style={{ cursor: 'pointer' }}
            onClick={handleHydClick}
            onMouseEnter={() => setIsHoveringHyd(true)}
            onMouseLeave={() => setIsHoveringHyd(false)}
          >
            <circle r={isHoveringHyd ? 12 : 8} fill="rgba(167,139,250,0.2)" className="pulse-ring" />
            <circle r={4} fill="#a78bfa" />
            {isHoveringHyd && (
              <text y={-15} fill="#f1f5f9" fontSize={10} fontWeight="bold" textAnchor="middle" style={{ pointerEvents: 'none', textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>
                HYDERABAD COMMAND
              </text>
            )}
          </g>
        </g>

        {/* ── HYDERABAD LOCAL LAYER ── */}
        <g
          style={{
            transition: 'opacity 0.6s ease 0.4s', // delay fade in until zoom finishes
            opacity: viewMode === 'hyderabad' ? 1 : 0,
            pointerEvents: viewMode === 'hyderabad' ? 'auto' : 'none'
          }}
        >
          {/* Background local dots */}
          <g>
            {localDots.map((d, i) => (
              <circle key={i} cx={d.x} cy={d.y} r={1.5} fill="rgba(255,255,255,1)" opacity={d.opacity} />
            ))}
          </g>
          
          {/* Local Centers */}
          {centers.map((center, i) => {
            const x = getLocalX(center.longitude)
            const y = getLocalY(center.latitude)
            const cfg = STRESS_COLORS[center.stress_level] || STRESS_COLORS.Low
            const isSelected = selectedCenter?.center_name === center.center_name
            const radius = center.stress_level === 'Critical' ? 14 : center.stress_level === 'High' ? 10 : 7

            return (
              <g 
                key={i} 
                onClick={(e) => { e.stopPropagation(); setSelectedCenter(center); }}
                style={{ cursor: 'pointer' }}
              >
                {/* Outer Pulse/Glow */}
                <circle cx={x} cy={y} r={radius + (isSelected ? 12 : 8)} fill={cfg.fill} opacity={isSelected ? 0.3 : 0.12} className={center.stress_level === 'Critical' ? 'pulse-ring' : ''} style={{ transition: 'all 0.2s' }} />
                
                {/* Main Dot */}
                <circle cx={x} cy={y} r={radius} fill={cfg.fill} stroke={isSelected ? '#fff' : '#0a0f2e'} strokeWidth={isSelected ? 3 : 2} style={{ transition: 'all 0.2s' }} />
                
                {/* Label inside dot */}
                {center.patient_count > 0 && (
                  <text x={x} y={y} fill="#fff" fontSize={10} fontWeight="bold" fontFamily="monospace" textAnchor="middle" dominantBaseline="central" style={{ pointerEvents: 'none' }}>
                    {center.patient_count}
                  </text>
                )}
              </g>
            )
          })}
        </g>
      </svg>

      {/* POPUP: Selected Center HTML Overlay */}
      {selectedCenter && viewMode === 'hyderabad' && (
        <div style={{
          position: 'absolute',
          left: getLocalX(selectedCenter.longitude) + 24,
          top: getLocalY(selectedCenter.latitude) - 40,
          zIndex: 50,
          background: 'rgba(10, 15, 46, 0.85)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          borderRadius: 24, // curved-edge box
          borderTopLeftRadius: 4, // pointer style tail
          padding: '24px',
          color: '#f1f5f9',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(255,255,255,0.1)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          width: 300,
          animation: 'slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        }}>
          <button 
            onClick={(e) => { e.stopPropagation(); setSelectedCenter(null); }}
            style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4 }}
          >
            <X size={18} />
          </button>
          
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12, paddingRight: 20, color: '#fff', letterSpacing: '-0.02em' }}>{selectedCenter.center_name}</div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: 12, borderRadius: 12 }}>
              <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status</div>
              <div style={{ color: STRESS_COLORS[selectedCenter.stress_level]?.fill, fontWeight: 700, fontSize: 14 }}>{selectedCenter.stress_level}</div>
            </div>
            
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: 12, borderRadius: 12 }}>
              <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Score</div>
              <div style={{ color: STRESS_COLORS[selectedCenter.stress_level]?.fill, fontWeight: 700, fontSize: 14, fontFamily: 'monospace' }}>{selectedCenter.stress_score}/100</div>
            </div>
            
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: 12, borderRadius: 12 }}>
              <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Patients</div>
              <div style={{ color: '#f1f5f9', fontWeight: 600, fontSize: 14 }}>{selectedCenter.patient_count}</div>
            </div>
            
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: 12, borderRadius: 12 }}>
              <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Cycles (7d)</div>
              <div style={{ color: '#a78bfa', fontWeight: 600, fontSize: 14 }}>{selectedCenter.cycles_next_7_days}</div>
            </div>
          </div>
          
          <div style={{ marginTop: 12, background: 'rgba(255,255,255,0.03)', padding: 12, borderRadius: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ color: '#94a3b8', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Users size={14} /> Eligible Donors
            </div>
            <div style={{ color: selectedCenter.eligible_donors_nearby > 3 ? '#22c55e' : '#f59e0b', fontWeight: 700, fontSize: 14 }}>
              {selectedCenter.eligible_donors_nearby}
            </div>
          </div>

          {selectedCenter.open_emergencies > 0 && (
            <div style={{ marginTop: 8, background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', padding: 12, borderRadius: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ color: '#ef4444', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                <ShieldAlert size={14} /> Open Emergencies
              </div>
              <div style={{ color: '#ef4444', fontWeight: 700, fontSize: 14 }}>
                {selectedCenter.open_emergencies}
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* POPUP: Selected Region HTML Overlay */}
      {selectedRegion === 'hyderabad' && viewMode === 'india' && (
        <div style={{
          position: 'absolute',
          left: hydX + 24,
          top: hydY - 40,
          zIndex: 50,
          background: 'rgba(10, 15, 46, 0.85)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          borderRadius: 24,
          borderTopLeftRadius: 4,
          padding: '24px',
          color: '#f1f5f9',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(255,255,255,0.1)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          width: 300,
          animation: 'slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        }}>
          <button 
            onClick={(e) => { e.stopPropagation(); setSelectedRegion(null); }}
            style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4 }}
          >
            <X size={18} />
          </button>
          
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4, color: '#fff' }}>Hyderabad Operations</div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 16 }}>Southern Command Zone</div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: 12, borderRadius: 12 }}>
              <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 4, textTransform: 'uppercase' }}>Centers</div>
              <div style={{ color: '#f1f5f9', fontWeight: 700, fontSize: 14 }}>{centers.length}</div>
            </div>
            <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: 12, borderRadius: 12 }}>
              <div style={{ color: '#ef4444', fontSize: 11, marginBottom: 4, textTransform: 'uppercase' }}>Emergencies</div>
              <div style={{ color: '#ef4444', fontWeight: 700, fontSize: 14 }}>{centers.reduce((acc, c) => acc + c.open_emergencies, 0)}</div>
            </div>
          </div>

          <button 
            onClick={handleZoomToHyderabad}
            style={{ 
              width: '100%', padding: '12px 0', borderRadius: 8, border: 'none',
              background: '#4f46e5', color: '#fff', fontSize: 13, fontWeight: 600,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              boxShadow: '0 4px 12px rgba(79, 70, 229, 0.3)'
            }}
          >
            Enter Operations View <ArrowRight size={14} />
          </button>
        </div>
      )}
      
      {/* Slide-in Animation Definition */}
      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(10px) scale(0.96); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  )
}



// ── AI Insights Panel ────────────────────────────────────────────────────────

function AiInsightsPanel() {
  const [expanded, setExpanded] = useState(true)

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['ai-insights'],
    queryFn: postAiInsights,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  })

  const insights = data?.insights ?? []
  const source = data?.source ?? 'unknown'

  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(167,139,250,0.15)',
      borderRadius: 16,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '18px 24px', cursor: 'pointer',
          background: 'linear-gradient(135deg, rgba(167,139,250,0.06) 0%, rgba(96,165,250,0.04) 100%)',
          borderBottom: expanded ? '1px solid rgba(167,139,250,0.1)' : 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'linear-gradient(135deg, rgba(167,139,250,0.2), rgba(96,165,250,0.2))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Brain size={18} color="#a78bfa" />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#f1f5f9' }}>
              AI Operational Insights
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
              {source === 'bedrock' ? 'Powered by AWS Bedrock (Claude)' : 'Local analysis engine'} · {insights.length} insight{insights.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={e => { e.stopPropagation(); refetch() }}
            disabled={isFetching}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 8,
              background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.2)',
              color: '#a78bfa', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              opacity: isFetching ? 0.5 : 1,
              fontFamily: 'var(--font-body)',
            }}
          >
            <RefreshCw size={13} style={{ animation: isFetching ? 'spin 1s linear infinite' : 'none' }} />
            {isFetching ? 'Analyzing...' : 'Refresh'}
          </button>
          {expanded ? <ChevronUp size={18} color="#94a3b8" /> : <ChevronDown size={18} color="#94a3b8" />}
        </div>
      </div>

      {/* Insights List */}
      {expanded && (
        <div style={{ padding: '16px 24px 20px' }}>
          {isLoading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[1, 2, 3].map(i => (
                <div key={i} className="skeleton" style={{ height: 80, borderRadius: 12 }} />
              ))}
            </div>
          )}

          {isError && (
            <div style={{ color: '#ef4444', fontSize: 13, padding: 20, textAlign: 'center' }}>
              Failed to generate insights. Check Bedrock configuration.
            </div>
          )}

          {!isLoading && !isError && insights.length === 0 && (
            <div style={{ color: '#94a3b8', fontSize: 13, padding: 20, textAlign: 'center' }}>
              No insights available. Click Refresh to generate.
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {insights.map((insight, i) => {
              const cfg = INSIGHT_COLORS[insight.type] || INSIGHT_COLORS.info
              const priority = PRIORITY_BADGE[insight.priority] || PRIORITY_BADGE.low
              return (
                <div
                  key={i}
                  style={{
                    display: 'flex', gap: 14, padding: '14px 18px',
                    background: cfg.bg, border: `1px solid ${cfg.border}`,
                    borderRadius: 12, alignItems: 'flex-start',
                    transition: 'background 0.2s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = `${cfg.bg.replace('0.06', '0.12')}`}
                  onMouseLeave={e => e.currentTarget.style.background = cfg.bg}
                >
                  <div style={{
                    flexShrink: 0, width: 32, height: 32, borderRadius: 8,
                    background: `${cfg.color}15`, color: cfg.color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginTop: 2,
                  }}>
                    {INSIGHT_ICONS[insight.type]}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: 13, color: '#f1f5f9' }}>
                        {insight.title}
                      </span>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 8px',
                        borderRadius: 6, color: priority.color,
                        background: priority.bg, textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}>
                        {insight.priority}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.5 }}>
                      {insight.description}
                    </div>
                  </div>

                  <div style={{
                    flexShrink: 0, textAlign: 'right', minWidth: 60,
                  }}>
                    <div style={{
                      fontSize: 16, fontWeight: 800, fontFamily: 'monospace',
                      color: cfg.color,
                    }}>
                      {insight.metric}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Center Card (polished version) ───────────────────────────────────────────

function CenterCard({ center }: { center: CenterRow }) {
  const cfg = STRESS_COLORS[center.stress_level] || STRESS_COLORS.Low
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
      transition: 'transform 0.2s, box-shadow 0.2s',
    }}
    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 8px 32px ${cfg.glow}` }}
    onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none' }}
    >
      {center.stress_level === 'Critical' && (
        <div style={{ position: 'absolute', inset: 0, boxShadow: 'inset 0 0 40px rgba(239,68,68,0.08)', pointerEvents: 'none' }} />
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#f1f5f9', marginBottom: 3 }}>{center.center_name}</div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>
            Hyderabad · {center.patient_count} patient{center.patient_count !== 1 ? 's' : ''}
          </div>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '5px 12px', borderRadius: 20,
          background: cfg.bg, border: `1px solid ${cfg.border}`,
          color: cfg.text, fontSize: 11, fontWeight: 700,
        }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.fill }} />
          {center.stress_level}
        </div>
      </div>

      {/* Stress bar */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
          <span style={{ fontSize: 11, color: '#94a3b8' }}>Stress Score</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: cfg.text, fontFamily: 'monospace' }}>{center.stress_score}</span>
        </div>
        <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${barPct}%`, background: cfg.fill, borderRadius: 3, transition: 'width 0.5s' }} />
        </div>
      </div>

      {/* Metrics row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        <div style={{ textAlign: 'center', padding: '10px', background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
          <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'monospace', color: center.cycles_next_7_days > 0 ? '#a78bfa' : '#475569' }}>
            {center.cycles_next_7_days}
          </div>
          <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2, lineHeight: 1.4 }}>Cycles<br/>Next 7d</div>
        </div>
        <div style={{ textAlign: 'center', padding: '10px', background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
          <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'monospace', color: center.open_emergencies > 0 ? '#ef4444' : '#475569' }}>
            {center.open_emergencies}
          </div>
          <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2, lineHeight: 1.4 }}>Open<br/>Emergencies</div>
        </div>
        <div style={{ textAlign: 'center', padding: '10px', background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
          <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'monospace', color: center.eligible_donors_nearby > 3 ? '#22c55e' : '#f59e0b' }}>
            {center.eligible_donors_nearby}
          </div>
          <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2, lineHeight: 1.4 }}>Eligible<br/>Donors</div>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────

export function CenterStress() {
  const { data: geoData, isLoading: geoLoading } = useQuery({
    queryKey: ['center-stress-geo'],
    queryFn: fetchGeoData,
    refetchInterval: 60000,
  })

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
      {/* ── Header ── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, color: '#475569', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 6 }}>
          Command Centre
        </div>
        <h1 style={{ fontSize: 26, fontFamily: 'var(--font-display)', fontWeight: 700 }}>
          <Activity size={22} style={{ display: 'inline', marginRight: 10, color: '#22c55e', verticalAlign: 'middle' }} />
          Center Stress View
        </h1>
        <p style={{ color: '#94a3b8', fontSize: 13, marginTop: 4 }}>
          {centers
            ? `${centers.length} locations in Hyderabad — interactive map with AI-powered insights`
            : 'Loading center data...'}
        </p>
      </div>

      {/* ── Summary KPI bar ── */}
      {!isLoading && centers && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
          {(['Critical', 'High', 'Moderate', 'Low'] as const).map(level => {
            const cfg = STRESS_COLORS[level]
            const count = centers.filter(c => c.stress_level === level).length
            return (
              <div key={level} style={{
                background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: 10, padding: '14px 18px',
                transition: 'transform 0.2s',
              }}
              onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'none'}
              >
                <div style={{ fontFamily: 'monospace', fontSize: 26, fontWeight: 700, color: cfg.text }}>{count}</div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 3 }}>{level}</div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Interactive Map ── */}
      <div style={{ marginBottom: 24 }}>
        {geoLoading && (
          <div className="skeleton" style={{ height: 480, borderRadius: 16 }} />
        )}
        {!geoLoading && geoData && geoData.length > 0 && (
          <DotMatrixMapComponent centers={geoData} />
        )}
        {!geoLoading && (!geoData || geoData.length === 0) && (
          <div style={{
            height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(255,255,255,0.02)', borderRadius: 16, border: '1px solid rgba(255,255,255,0.06)',
            color: '#94a3b8', fontSize: 14,
          }}>
            No geographic data available. Seed the dataset first.
          </div>
        )}
      </div>

      {/* ── AI Insights Panel ── */}
      <div style={{ marginBottom: 28 }}>
        <AiInsightsPanel />
      </div>

      {/* ── Center Cards ── */}
      {isLoading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 220, borderRadius: 14 }} />)}
        </div>
      )}

      {isError && (
        <div style={{ color: '#ef4444', padding: 20, fontSize: 14 }}>Could not load center stress data.</div>
      )}

      {!isLoading && centers?.length === 0 && (
        <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
          No patient locations registered yet. Patient locations power this view.
        </div>
      )}

      {[
        { group: critical, title: '🚨 Critical', show: critical.length > 0 },
        { group: high, title: '⚠️ High Stress', show: high.length > 0 },
        { group: rest, title: '📊 Moderate & Low', show: rest.length > 0 },
      ].filter(g => g.show).map(({ group, title }) => (
        <div key={title} style={{ marginBottom: 28 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8', marginBottom: 12, letterSpacing: '0.05em' }}>
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
