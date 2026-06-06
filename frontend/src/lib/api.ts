/**
 * Centralised API client for PulseNet.
 * Uses Axios with a base URL from Vite env vars.
 * The Vite dev server proxies /api → FastAPI (configured in vite.config.ts).
 */

import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_URL ?? ''

export const api = axios.create({
  baseURL: API_BASE,
  timeout: 10_000,
  headers: { 'Content-Type': 'application/json' },
})

// ── Types derived from backend Pydantic schemas ──────────────────────────────

export interface HealthResponse {
  status: string
  service: string
  version: string
}

export interface DashboardStats {
  total_users: number
  total_bridges: number
  active_bridges: number
  eligible_donors: number
  active_donors: number
  donor_fatigue_risk: number
  as_of: string
}

export interface CandidateDonor {
  external_id: string
  name: string
  blood_group: string
  eligibility_status: string
  user_donation_active_status: string
  calls_to_donations_ratio: number
  donations_till_date: number
  frequency_in_days: number
  donated_earlier: boolean
  distance_km: number
  ml_rank_score: number
}

export interface MockBridgePatient {
  external_id: string
  name: string
  blood_group: string
  next_transfusion_date: string
  bridge_id: string
}

export interface MockBridgeResponse {
  patient: MockBridgePatient
  ranked_donors: CandidateDonor[]
  model_used: string
  generated_at: string
}

export interface UserRead {
  id: number
  external_id: string
  name?: string
  blood_group?: string
  gender?: string
  eligibility_status?: string
  user_donation_active_status?: string
  calls_to_donations_ratio?: number
  donations_till_date?: number
  last_donation_date?: string
  next_eligible_date?: string
  status: string
  registration_date?: string
  created_at: string
}

// ── API functions ─────────────────────────────────────────────────────────────

export const fetchHealth = () =>
  api.get<HealthResponse>('/api/health').then(r => r.data)

export const fetchStats = () =>
  api.get<DashboardStats>('/api/admin/stats').then(r => r.data)

export const fetchMockBridge = () =>
  api.get<MockBridgeResponse>('/api/admin/bridge/mock').then(r => r.data)

export const fetchEligibleDonors = (blood_group?: string) =>
  api.get<UserRead[]>('/api/donor/', { params: { blood_group, limit: 20 } }).then(r => r.data)

export const fetchInactiveDonors = () =>
  api.get<UserRead[]>('/api/admin/donors/inactive', { params: { limit: 20 } }).then(r => r.data)
