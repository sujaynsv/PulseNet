import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { 
  User as UserIcon, Heart, Calendar, Award, Clock, MapPin, 
  Phone, MessageSquare, Check, X, ShieldAlert, Award as CertificateIcon,
  Activity, CheckCircle, HelpCircle, Edit2, Settings, Power
} from 'lucide-react';

// Interfaces
interface DonorProfile {
  id: number;
  external_id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  blood_group: string | null;
  gender: string | null;
  age: number | null;
  location: string | null;
  eligibility_status: string | null;
  user_donation_active_status: string | null;
  status: string | null;
  donations_till_date: number | null;
  last_donation_date: string | null;
  next_eligible_date: string | null;
  
  locality: string | null;
  preferred_center: string | null;
  contact_preference: string | null;
  general_availability: string | null;
  bridge_preference: boolean | null;
  travel_radius: number | null;
  calls_to_donations_ratio: number | null;
  languages: string | null;
  medical_notes: string | null;
}

interface DonorRequirement {
  requirement_id: number;
  external_requirement_id: string;
  patient_name: string | null;
  blood_group: string | null;
  severity: string;
  trigger_type: string;
  units_needed: number;
  date_needed: string;
  center_name: string | null;
  my_response_status: string;
}

interface BridgeResponse {
  assigned: boolean;
  bridge_id: number | null;
  patient_name: string | null;
  patient_blood_group: string | null;
  next_transfusion_date: string | null;
  cycle_position: number | null;
  my_last_donation_date: string | null;
  my_next_due_date: string | null;
  slot_status: string | null;
}

interface DonationLog {
  id: number;
  transfusion_date: string;
  hospital: string | null;
  notes: string | null;
  status: string;
}

interface ImpactResponse {
  total_donations: number;
  cycles_supported: number;
  emergencies_responded: number;
}

export function DonorHome() {
  const [profile, setProfile] = useState<DonorProfile | null>(null);
  const [requirements, setRequirements] = useState<DonorRequirement[]>([]);
  const [bridge, setBridge] = useState<BridgeResponse | null>(null);
  const [history, setHistory] = useState<DonationLog[]>([]);
  const [impact, setImpact] = useState<ImpactResponse | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Modals
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showLogModal, setShowLogModal] = useState(false);
  const [editingLogId, setEditingLogId] = useState<number | null>(null);
  const [selectedCertificate, setSelectedCertificate] = useState<DonationLog | null>(null);
  const [rescheduleReqId, setRescheduleReqId] = useState<number | null>(null);

  // Form states for profile/preferences
  const [formName, setFormName] = useState('');
  const [formLocality, setFormLocality] = useState('');
  const [formTravelRadius, setFormTravelRadius] = useState(15);
  const [formContactPref, setFormContactPref] = useState('whatsapp');
  const [formAvailability, setFormAvailability] = useState<string[]>([]);
  const [formLanguages, setFormLanguages] = useState<string[]>([]);
  const [formNotes, setFormNotes] = useState('');

  // Log donation form states
  const [donationDate, setDonationDate] = useState(new Date().toISOString().split('T')[0]);
  const [donationHospital, setDonationHospital] = useState('');
  const [donationNotes, setDonationNotes] = useState('');

  // Reschedule form
  const [reschDate, setReschDate] = useState('');
  const [reschTime, setReschTime] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [profileRes, reqsRes, bridgeRes, historyRes, impactRes] = await Promise.all([
        api.get('/api/donor/me'),
        api.get('/api/donor/me/requirements').catch(() => ({ data: [] })),
        api.get('/api/donor/me/bridge').catch(() => ({ data: { assigned: false } })),
        api.get('/api/donor/me/history').catch(() => ({ data: [] })),
        api.get('/api/donor/me/impact').catch(() => ({ data: { total_donations: 0, cycles_supported: 0, emergencies_responded: 0 } }))
      ]);

      const prof = profileRes.data;
      setProfile(prof);
      setRequirements(reqsRes.data);
      setBridge(bridgeRes.data);
      setHistory(historyRes.data);
      setImpact(impactRes.data);

      if (prof) {
        setFormName(prof.name || '');
        setFormLocality(prof.locality || '');
        setFormContactPref(prof.contact_preference || 'whatsapp');
        setFormAvailability(prof.general_availability ? prof.general_availability.split(', ') : []);
        setFormTravelRadius(prof.travel_radius || 15);
        setFormLanguages(prof.languages ? prof.languages.split(', ') : ['English']);
        setFormNotes(prof.medical_notes || '');
      }
    } catch (err) {
      console.error("Failed to load donor data:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.put('/api/donor/me', {
        name: formName,
        locality: formLocality,
        travel_radius: formTravelRadius,
        contact_preference: formContactPref,
        general_availability: formAvailability.join(', '),
        languages: formLanguages.join(', '),
        medical_notes: formNotes
      });
      await fetchData();
      setShowEditProfile(false);
    } catch (err) {
      alert("Failed to save profile details.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (newStatus: 'active' | 'inactive') => {
    // Optimistic update for dynamic toggle feel
    setProfile(prev => prev ? { ...prev, status: newStatus } : null);
    try {
      await api.patch('/api/donor/me/status', { status: newStatus });
      // We don't necessarily need to fetch all data again if we just updated status, 
      // but keeping it ensures sync. We can just wait for it in background.
      fetchData(); 
    } catch (err) {
      alert("Failed to update status.");
      // Revert on failure
      setProfile(prev => prev ? { ...prev, status: newStatus === 'active' ? 'inactive' : 'active' } : null);
    }
  };

  const handleRequirementResponse = async (reqId: number, status: 'confirmed' | 'declined') => {
    try {
      await api.post(`/api/donor/me/requirements/${reqId}/respond`, { status });
      await fetchData();
    } catch (err: any) {
      alert(err.response?.data?.detail || "Failed to record response.");
    }
  };

  const handleRescheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rescheduleReqId) return;
    try {
      await api.post(`/api/donor/me/requirements/${rescheduleReqId}/reschedule-suggestion`, {
        suggested_date: reschDate,
        suggested_time: reschTime
      });
      setRescheduleReqId(null);
      await fetchData();
      alert("Suggestion sent. We will contact you if it aligns with the patient's schedule.");
    } catch (err) {
      alert("Failed to submit suggestion.");
    }
  };

  const handleLogDonation = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editingLogId) {
        await api.patch(`/api/donor/me/history/${editingLogId}`, {
          donation_date: donationDate,
          hospital: donationHospital,
          notes: donationNotes
        });
      } else {
        await api.post('/api/donor/me/donation', {
          donation_date: donationDate,
          hospital: donationHospital,
          notes: donationNotes
        });
      }
      setShowLogModal(false);
      setEditingLogId(null);
      await fetchData();
    } catch (err) {
      alert(`Failed to ${editingLogId ? 'update' : 'log'} donation.`);
    } finally {
      setSubmitting(false);
    }
  };

  const openLogModal = (log?: DonationLog) => {
    if (log) {
      setEditingLogId(log.id);
      setDonationDate(log.transfusion_date.split('T')[0]);
      setDonationHospital(log.hospital || '');
      setDonationNotes(log.notes || '');
    } else {
      setEditingLogId(null);
      setDonationDate(new Date().toISOString().split('T')[0]);
      setDonationHospital('');
      setDonationNotes('');
    }
    setShowLogModal(true);
  };

  const toggleArrayItem = (item: string, arr: string[], setArr: (val: string[]) => void) => {
    if (arr.includes(item)) setArr(arr.filter(i => i !== item));
    else setArr([...arr, item]);
  };

  if (loading) {
    return <div className="p-8 text-slate-400 font-medium flex items-center justify-center h-screen">Loading Donor Dashboard...</div>;
  }

  const scheduledRequirement = requirements.find(r => r.my_response_status === 'confirmed');
  const isCooldown = profile?.eligibility_status === 'not eligible';
  const isInactive = profile?.status === 'inactive';

  // Gamification Logic
  const donations = impact?.total_donations || 0;
  let currentBadge = 'Starter';
  let nextBadge = 'Bronze Warrior';
  let nextBadgeGoal = 1;
  let badgeColor = 'text-slate-400';

  if (donations >= 5) {
    currentBadge = 'Gold Guardian';
    nextBadge = 'Platinum Hero';
    nextBadgeGoal = 10;
    badgeColor = 'text-yellow-400';
  } else if (donations >= 3) {
    currentBadge = 'Silver Savior';
    nextBadge = 'Gold Guardian';
    nextBadgeGoal = 5;
    badgeColor = 'text-slate-300';
  } else if (donations >= 1) {
    currentBadge = 'Bronze Warrior';
    nextBadge = 'Silver Savior';
    nextBadgeGoal = 3;
    badgeColor = 'text-amber-600';
  }

  const progressPercent = Math.min((donations / nextBadgeGoal) * 100, 100);
  const progRadius = 24;
  const progCircumference = 2 * Math.PI * progRadius;
  const progOffset = progCircumference - (progressPercent / 100) * progCircumference;

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-8 space-y-8">
      
      {/* 1. Top Bar */}
      <div className="flex justify-between items-center border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <Heart className="text-red-500" size={24} />
          <span className="text-xl font-bold text-white tracking-tight">PulseNet <span className="text-slate-500 font-normal">|</span> Blood Warriors</span>
          <span className="hidden sm:inline-flex items-center gap-1 text-xs font-mono bg-slate-900 text-slate-400 px-2 py-1 rounded-md">
            <MapPin size={12} /> Hyderabad
          </span>
        </div>
        <button className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition">
          <HelpCircle size={16} /> <span className="hidden sm:inline">Help & Support</span>
        </button>
      </div>

      {/* 2. Donor Summary Header */}
      <div className="glass-card p-6 md:p-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative overflow-hidden">
        <div className="absolute -right-10 -top-10 text-slate-800/20 pointer-events-none">
          <Award size={180} />
        </div>
        
        <div className="flex gap-6 items-center z-10">
          <div className="w-20 h-20 bg-slate-900 border-2 border-red-900/50 rounded-2xl flex flex-col items-center justify-center shadow-lg shadow-red-900/20">
            <span className="text-2xl font-bold text-red-500">{profile?.blood_group || '-'}</span>
          </div>
          
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-white">{profile?.name || 'Valued Donor'}</h1>
              <span className={`badge ${isInactive ? 'badge-inactive' : isCooldown ? 'badge-pending' : 'badge-active'}`}>
                {isInactive ? 'INACTIVE' : isCooldown ? 'RECOVERY PERIOD' : 'ACTIVE'}
              </span>
            </div>
            <div className="text-sm text-slate-400 font-mono">ID: {profile?.external_id || `DW-${profile?.id}`} • {profile?.locality || 'Hyderabad'}</div>
            <div className="text-sm text-slate-300 mt-2">
              Last donation: <strong className="text-white">{profile?.last_donation_date || 'None'}</strong> • 
              Eligible from: <strong className="text-white">{profile?.next_eligible_date || 'Now'}</strong>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 w-full md:w-auto z-10">
          <button 
            onClick={() => setShowEditProfile(true)}
            className="px-4 py-2 bg-slate-900 border border-slate-700 text-white rounded-lg text-sm font-semibold hover:bg-slate-800 transition flex items-center justify-center gap-2"
          >
            <Edit2 size={16} /> Edit Info
          </button>
          <div className="flex items-center justify-between px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg">
            <span className="text-sm font-semibold text-slate-300 flex items-center gap-2">
              <Power size={14} className={isInactive ? "text-amber-500" : "text-slate-500"} /> 
              I need a break (Pause)
            </span>
            <button
              type="button"
              onClick={() => handleStatusChange(isInactive ? 'active' : 'inactive')}
              className={`ml-4 w-10 h-5 rounded-full p-0.5 transition-colors duration-200 outline-none cursor-pointer ${
                isInactive ? 'bg-amber-500' : 'bg-slate-700'
              }`}
            >
              <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                isInactive ? 'translate-x-5' : 'translate-x-0'
              }`} />
            </button>
          </div>
        </div>
      </div>

      {isInactive && (
        <div className="bg-amber-950/30 border border-amber-900/50 text-amber-200/80 p-4 rounded-xl text-sm flex items-center gap-3">
          <ShieldAlert size={18} className="text-amber-500" />
          You are currently paused. We will not send you any cycle requests or notifications until you resume participation.
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          
          
          {scheduledRequirement && (
            <div className="glass-card bg-gradient-to-br from-blue-900/40 to-slate-900 border border-blue-500/30 p-8 rounded-2xl shadow-xl flex flex-col md:flex-row items-center gap-6 mb-6">
              <div className="bg-blue-500/20 p-4 rounded-full border border-blue-500/30">
                <Calendar className="text-blue-400" size={40} />
              </div>
              <div className="flex-1 space-y-2 text-center md:text-left">
                <h2 className="text-2xl font-bold text-white tracking-tight">Donation Scheduled</h2>
                <p className="text-slate-300">You have confirmed your availability for an upcoming patient cycle.</p>
                <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 mt-2 text-sm">
                  <span className="bg-blue-950/50 text-blue-300 border border-blue-800 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                    <Calendar size={16} /> {new Date(scheduledRequirement.date_needed).toLocaleDateString()}
                  </span>
                  <span className="bg-blue-950/50 text-blue-300 border border-blue-800 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                    <MapPin size={16} /> {scheduledRequirement.center_name}
                  </span>
                  <span className="bg-slate-900/50 text-slate-400 border border-slate-700 px-3 py-1.5 rounded-lg">
                    Patient: <strong className="text-white ml-1">{scheduledRequirement.patient_name || 'Anonymous'}</strong>
                  </span>
                </div>
              </div>
            </div>
          )}
          
          {/* 3. Upcoming Donation Panel */}

          <div className="glass-card p-6 md:p-8">
            <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Calendar className="text-red-500" size={20} /> Your Next Opportunity
            </h2>
            
            {isCooldown ? (
              <div className="p-6 bg-slate-900/50 border border-slate-800 rounded-xl text-center space-y-2">
                <ShieldAlert size={24} className="text-amber-500 mx-auto" />
                <div className="font-semibold text-white">You're on a short break until {profile?.next_eligible_date}.</div>
                <div className="text-sm text-slate-400">We'll reach out after this date for your safety and recovery.</div>
              </div>
            ) : requirements.length > 0 ? (
              <div className="space-y-4">
                {requirements.map(req => (
                  <div key={req.requirement_id} className="p-5 bg-gradient-to-br from-slate-900 to-slate-900/50 border border-slate-700/50 rounded-xl">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <div className="font-semibold text-white text-lg">Next Cycle: {new Date(req.date_needed).toLocaleDateString()}</div>
                        <div className="text-sm text-slate-400 mt-1">Patient Location: {req.center_name}</div>
                      </div>
                      <span className={`badge ${req.my_response_status === 'confirmed' ? 'badge-active' : 'badge-pending'}`}>
                        {req.my_response_status.toUpperCase()}
                      </span>
                    </div>
                    
                    {req.my_response_status === 'pending' ? (
                      <div className="flex flex-wrap gap-3 mt-5">
                        <button 
                          onClick={() => handleRequirementResponse(req.requirement_id, 'confirmed')}
                          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold flex items-center gap-2 transition"
                        >
                          <Check size={16} /> I can donate this cycle
                        </button>
                        <button 
                          onClick={() => handleRequirementResponse(req.requirement_id, 'declined')}
                          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-semibold transition"
                        >
                          I can't make it
                        </button>
                        <button 
                          onClick={() => setRescheduleReqId(req.requirement_id)}
                          className="px-4 py-2 border border-slate-700 hover:bg-slate-800 text-slate-400 rounded-lg text-sm font-semibold transition"
                        >
                          Suggest another day/time
                        </button>
                      </div>
                    ) : req.my_response_status === 'reschedule_requested' ? (
                      <div className="mt-4 text-sm text-amber-400 flex items-center gap-2">
                        <Clock size={16} /> Reschedule suggestion submitted.
                      </div>
                    ) : (
                      <div className="mt-4 text-sm text-green-400 flex items-center gap-2">
                        <CheckCircle size={16} /> Response recorded for this cycle.
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : !bridge?.assigned ? (
              <div className="p-6 bg-slate-900/50 border border-slate-800 rounded-xl text-center space-y-2">
                <Activity size={24} className="text-slate-500 mx-auto" />
                <div className="font-semibold text-white">We're matching you to a fighter in Hyderabad.</div>
                <div className="text-sm text-slate-400">You'll be notified as soon as your Blood Bridge pod is ready.</div>
              </div>
            ) : (
              <div className="p-6 bg-slate-900/50 border border-slate-800 rounded-xl text-center space-y-2">
                <CheckCircle size={24} className="text-green-500 mx-auto" />
                <div className="font-semibold text-white">No active requests right now.</div>
                <div className="text-sm text-slate-400">Your pod is currently stable. We'll alert you before the next cycle.</div>
              </div>
            )}
          </div>

          {/* 4. Blood Bridge Pod Panel */}
          {bridge?.assigned && (
            <div className="glass-card p-6 md:p-8">
              <h2 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
                <Activity className="text-red-500" size={20} /> Your Blood Bridge Pod
              </h2>
              <div className="text-sm text-slate-400 mb-6">
                You are part of a support circle for a fighter at <strong className="text-slate-300">{bridge.patient_name || 'Care Center'}</strong>, Hyderabad.
              </div>

              <div className="flex flex-col md:flex-row gap-6">
                <div className="flex-1 bg-slate-900/50 border border-slate-800 rounded-xl p-5">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Pod Members</div>
                  <div className="flex flex-wrap gap-2">
                    <span className="px-3 py-1.5 bg-red-950/30 border border-red-900/50 text-red-400 rounded-full text-xs font-semibold flex items-center gap-1.5">
                      <UserIcon size={12} /> You
                    </span>
                    {Array.from({ length: 7 }).map((_, i) => (
                      <span key={i} className="px-3 py-1.5 bg-slate-800/50 border border-slate-700/50 text-slate-400 rounded-full text-xs font-medium flex items-center gap-1.5">
                        <UserIcon size={12} /> Donor {i + 1}
                      </span>
                    ))}
                  </div>
                </div>
                
                <div className="md:w-48 bg-slate-900/50 border border-slate-800 rounded-xl p-5 flex flex-col justify-center">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Pod Status</div>
                  <div className="text-green-400 font-bold text-lg flex items-center gap-2">
                    <CheckCircle size={18} /> Strong
                  </div>
                  <div className="text-xs text-slate-400 mt-1">8/8 slots filled</div>
                </div>
              </div>
            </div>
          )}

          {/* 5. Impact & History Panel */}
          <div className="glass-card p-6 md:p-8">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Award className="text-red-500" size={20} /> Your Impact
              </h2>
              <button 
                onClick={() => openLogModal()}
                className="text-xs font-semibold text-red-400 hover:text-red-300 bg-red-400/10 px-3 py-1.5 rounded-lg"
              >
                Log Past Donation
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-white">{donations}</div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mt-1">Total Donations</div>
              </div>
              <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-red-500">{donations * 3}</div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mt-1">Lives Saved</div>
              </div>
              <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-white">{impact?.cycles_supported || 0}</div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mt-1">Cycles Supported</div>
              </div>
              <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-amber-500">{impact?.emergencies_responded || 0}</div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mt-1">Emergencies</div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-slate-800/50 to-slate-900/80 border border-slate-700/50 rounded-xl p-6 mb-8 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-slate-950 flex items-center justify-center border-2 border-slate-700 shadow-inner">
                  <Award className={badgeColor} size={24} />
                </div>
                <div>
                  <div className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Current Rank</div>
                  <div className={`text-xl font-bold ${badgeColor}`}>{currentBadge}</div>
                </div>
              </div>
              <div className="flex items-center gap-4 text-right">
                <div className="hidden sm:block">
                  <div className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Next Badge</div>
                  <div className="text-sm font-bold text-slate-300">{nextBadge} ({donations}/{nextBadgeGoal})</div>
                </div>
                <div className="relative w-14 h-14 flex-shrink-0">
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 60 60">
                    <circle className="text-slate-800 stroke-current" strokeWidth="4" cx="30" cy="30" r={progRadius} fill="transparent" />
                    <circle 
                      className={`text-red-500 stroke-current transition-all duration-1000 ease-in-out`} 
                      strokeWidth="4" strokeLinecap="round" cx="30" cy="30" r={progRadius} fill="transparent" 
                      strokeDasharray={progCircumference} strokeDashoffset={progOffset} 
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-xs font-bold text-white">{Math.round(progressPercent)}%</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-800 before:to-transparent">
              {history.length > 0 ? history.map((log, i) => (
                <div key={log.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full border border-slate-700 bg-slate-900 text-slate-500 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                    <Heart size={16} className={i === 0 ? "text-red-500" : ""} />
                  </div>
                  <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl border border-slate-800 bg-slate-900/50 shadow">
                    <div className="flex items-center justify-between mb-1">
                      <div className="font-bold text-white text-sm">Donation at {log.hospital || 'Center'}</div>
                      <time className="font-mono text-xs text-slate-400">{new Date(log.transfusion_date).toLocaleDateString()}</time>
                    </div>
                    <div className="text-xs text-slate-400 mt-2">{log.notes || 'Routine cycle support'}</div>
                    <div className="flex items-center gap-3 mt-3">
                      <button 
                        onClick={() => setSelectedCertificate(log)}
                        className="text-red-400 hover:text-red-300 font-semibold text-[10px] uppercase tracking-wider flex items-center gap-1"
                      >
                        <CertificateIcon size={12} /> View Certificate
                      </button>
                      <button 
                        onClick={() => openLogModal(log)}
                        className="text-slate-400 hover:text-white font-semibold text-[10px] uppercase tracking-wider flex items-center gap-1"
                      >
                        <Edit2 size={12} /> Edit
                      </button>
                    </div>
                  </div>
                </div>
              )) : (
                <div className="text-center text-sm text-slate-500 py-4">No donation history yet.</div>
              )}
            </div>
          </div>

        </div>

        {/* 6. Preferences & Settings (Sidebar) */}
        <div className="space-y-6">
          <div className="glass-card p-6">
            <h2 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
              <Settings className="text-slate-400" size={20} /> Your Preferences
            </h2>

            <div className="space-y-6">
              <div>
                <div className="text-sm font-semibold text-slate-300 mb-2">Contact Methods</div>
                <div className="flex flex-wrap gap-2">
                  {['whatsapp', 'sms', 'phone'].map(c => (
                    <span key={c} className={`px-3 py-1.5 text-xs font-semibold rounded-lg border flex items-center gap-1.5 uppercase ${
                      profile?.contact_preference === c ? 'bg-slate-800 border-slate-600 text-white' : 'bg-transparent border-slate-800 text-slate-500'
                    }`}>
                      {c === 'whatsapp' && <MessageSquare size={12} />}
                      {c === 'sms' && <ShieldAlert size={12} />}
                      {c === 'phone' && <Phone size={12} />}
                      {c}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-sm font-semibold text-slate-300 mb-2">General Availability</div>
                <div className="flex flex-wrap gap-2">
                  {profile?.general_availability ? profile.general_availability.split(', ').map(t => (
                    <span key={t} className="px-3 py-1 text-xs bg-slate-900 border border-slate-800 text-slate-400 rounded-md">
                      {t}
                    </span>
                  )) : <span className="text-xs text-slate-500">Not set</span>}
                </div>
              </div>

              <div>
                <div className="text-sm font-semibold text-slate-300 mb-2">Travel Radius</div>
                <div className="text-sm text-slate-400 flex items-center gap-2">
                  <MapPin size={14} /> Up to {profile?.travel_radius || 15} km from {profile?.locality}
                </div>
              </div>

              <div>
                <div className="text-sm font-semibold text-slate-300 mb-2">Language</div>
                <div className="flex flex-wrap gap-2">
                  {profile?.languages ? profile.languages.split(', ').map(l => (
                    <span key={l} className="px-3 py-1 text-xs bg-slate-900 border border-slate-800 text-slate-400 rounded-md">
                      {l}
                    </span>
                  )) : <span className="text-xs text-slate-500">English</span>}
                </div>
              </div>

              <div>
                <div className="text-sm font-semibold text-slate-300 mb-2">Health / Medical Notes</div>
                <div className="text-xs text-slate-400 bg-slate-900/50 border border-slate-800 p-3 rounded-lg min-h-[60px]">
                  {profile?.medical_notes || 'No medical notes or restrictions on file.'}
                </div>
              </div>

              <button 
                onClick={() => setShowEditProfile(true)}
                className="w-full py-2 bg-slate-900 border border-slate-700 hover:bg-slate-800 text-white text-sm font-semibold rounded-lg transition"
              >
                Update Preferences
              </button>
            </div>
          </div>
        </div>

      </div>

      {/* 7. Footer */}
      <div className="pt-8 pb-4 border-t border-slate-800/50 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-slate-500">
        <div className="flex gap-4">
          <a href="#" className="hover:text-slate-300">FAQ: What if I miss a cycle?</a>
          <a href="#" className="hover:text-slate-300">Privacy Policy</a>
          <a href="#" className="hover:text-slate-300">Terms</a>
        </div>
        <div>
          Urgent support: <a href="#" className="text-red-400 font-semibold hover:text-red-300">+91 99999 88888</a>
        </div>
      </div>

      {/* --- Modals --- */}
      
      {/* Reschedule Modal */}
      {rescheduleReqId && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-card w-full max-w-md overflow-hidden text-slate-200 p-6">
            <h2 className="text-xl font-bold text-white mb-4">Suggest Alternate Time</h2>
            <form onSubmit={handleRescheduleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Date</label>
                <input 
                  type="date" required value={reschDate} onChange={e => setReschDate(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2 px-3 focus:border-red-500 text-slate-200"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Time Preference</label>
                <select 
                  value={reschTime} onChange={e => setReschTime(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2 px-3 focus:border-red-500 text-slate-200"
                >
                  <option value="Morning">Morning (8 AM - 12 PM)</option>
                  <option value="Afternoon">Afternoon (12 PM - 4 PM)</option>
                  <option value="Evening">Evening (4 PM - 8 PM)</option>
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={() => setRescheduleReqId(null)} className="px-4 py-2 text-sm text-slate-400 hover:text-white">Cancel</button>
                <button type="submit" className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold">Send Suggestion</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Profile / Preferences Modal */}
      {showEditProfile && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-card w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col text-slate-200">
            <div className="p-6 border-b border-slate-800 flex justify-between items-center shrink-0">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">Update Info & Preferences</h2>
              <button onClick={() => setShowEditProfile(false)} className="text-slate-400 hover:text-white"><X size={20} /></button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-6">
              <form id="profile-form" onSubmit={handleProfileSave} className="space-y-6">
                
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Full Name</label>
                    <input type="text" value={formName} onChange={e => setFormName(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2 px-3 focus:border-red-500 text-slate-200" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Locality (Hyderabad)</label>
                    <input type="text" value={formLocality} onChange={e => setFormLocality(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2 px-3 focus:border-red-500 text-slate-200" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Contact Preference</label>
                  <div className="grid grid-cols-3 gap-2">
                    {['whatsapp', 'sms', 'phone'].map(channel => (
                      <button
                        key={channel} type="button" onClick={() => setFormContactPref(channel)}
                        className={`py-2 rounded-lg border text-sm font-medium uppercase ${formContactPref === channel ? 'bg-red-950/40 border-red-500 text-white' : 'bg-slate-900 border-slate-800 text-slate-400'}`}
                      >
                        {channel}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Availability</label>
                  <div className="flex flex-wrap gap-2">
                    {['Weekdays', 'Weekends', 'Mornings', 'Afternoons'].map(time => {
                      const isSel = formAvailability.includes(time);
                      return (
                        <button
                          key={time} type="button" onClick={() => toggleArrayItem(time, formAvailability, setFormAvailability)}
                          className={`px-4 py-2 rounded-lg border text-sm font-medium ${isSel ? 'bg-slate-800 border-slate-500 text-white' : 'bg-slate-900 border-slate-800 text-slate-400'}`}
                        >
                          {time} {isSel && <Check size={14} className="inline ml-1 text-red-500" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Languages</label>
                  <div className="flex flex-wrap gap-2">
                    {['English', 'Telugu', 'Hindi', 'Urdu'].map(lang => {
                      const isSel = formLanguages.includes(lang);
                      return (
                        <button
                          key={lang} type="button" onClick={() => toggleArrayItem(lang, formLanguages, setFormLanguages)}
                          className={`px-4 py-2 rounded-lg border text-sm font-medium ${isSel ? 'bg-slate-800 border-slate-500 text-white' : 'bg-slate-900 border-slate-800 text-slate-400'}`}
                        >
                          {lang}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Travel Radius Limit ({formTravelRadius} km)</label>
                  <input 
                    type="range" min="5" max="50" step="5"
                    value={formTravelRadius} onChange={e => setFormTravelRadius(Number(e.target.value))}
                    className="w-full accent-red-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Health / Medical Notes</label>
                  <textarea 
                    value={formNotes} onChange={e => setFormNotes(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2 px-3 focus:border-red-500 text-slate-200 h-24"
                    placeholder="E.g., Doctor advised max 2 donations per year..."
                  />
                </div>
              </form>
            </div>
            
            <div className="p-6 border-t border-slate-800 shrink-0 flex justify-end gap-3">
              <button onClick={() => setShowEditProfile(false)} className="px-5 py-2 text-sm text-slate-400 hover:text-white">Cancel</button>
              <button type="submit" form="profile-form" disabled={submitting} className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold shadow-md">
                {submitting ? 'Saving...' : 'Save Preferences'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Log Donation Modal */}
      {showLogModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-card w-full max-w-md overflow-hidden text-slate-200 p-6">
            <h2 className="text-xl font-bold text-white mb-4">{editingLogId ? 'Edit Donation' : 'Log Past Donation'}</h2>
            <form onSubmit={handleLogDonation} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Date</label>
                <input type="date" required value={donationDate} onChange={e => setDonationDate(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2 px-3" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Hospital</label>
                <input type="text" required value={donationHospital} onChange={e => setDonationHospital(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2 px-3" placeholder="Hospital name" />
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={() => { setShowLogModal(false); setEditingLogId(null); }} className="px-4 py-2 text-sm text-slate-400">Cancel</button>
                <button type="submit" disabled={submitting} className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold">
                  {editingLogId ? 'Save Changes' : 'Confirm'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Certificate Viewer */}
      {selectedCertificate && (
        <div className="fixed inset-0 bg-slate-950/95 backdrop-blur z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-stone-50 border-[16px] border-amber-800/40 p-6 md:p-12 text-center text-stone-900 shadow-2xl relative rounded-sm">
            <button onClick={() => setSelectedCertificate(null)} className="absolute top-4 right-4 text-stone-400 hover:text-stone-900 p-1 bg-stone-200 rounded-full"><X size={18} /></button>
            <div className="border-2 border-dashed border-amber-900/30 p-8 space-y-6">
              <Heart size={44} className="text-red-600 pulse-ring mx-auto" />
              <h1 className="font-serif text-3xl font-bold tracking-wide text-amber-950 uppercase">Certificate of Appreciation</h1>
              <div className="text-stone-600 font-sans text-base leading-relaxed py-4">
                This is to gratefully acknowledge the life-saving contribution of
                <div className="font-serif text-2xl font-bold text-amber-950 py-3">{profile?.name || 'Valued Donor'}</div>
                who donated blood on <strong className="text-amber-950">{new Date(selectedCertificate.transfusion_date).toLocaleDateString()}</strong> at <strong className="text-amber-950">{selectedCertificate.hospital}</strong>.
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
