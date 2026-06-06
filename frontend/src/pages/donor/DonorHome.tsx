import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { 
  User as UserIcon, Heart, Calendar, Award, Clock, MapPin, 
  Phone, MessageSquare, Check, X, ShieldAlert, Award as CertificateIcon,
  ChevronRight, RefreshCw, Activity, CheckCircle, HelpCircle
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
  my_response_status: string; // pending, confirmed, declined, standby
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

export function DonorHome() {
  const [profile, setProfile] = useState<DonorProfile | null>(null);
  const [requirements, setRequirements] = useState<DonorRequirement[]>([]);
  const [bridge, setBridge] = useState<BridgeResponse | null>(null);
  const [history, setHistory] = useState<DonationLog[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [submittingProfile, setSubmittingProfile] = useState(false);
  const [showLogModal, setShowLogModal] = useState(false);
  const [selectedCertificate, setSelectedCertificate] = useState<DonationLog | null>(null);

  // Form states for profile onboarding
  const [formBloodGroup, setFormBloodGroup] = useState('');
  const [formGender, setFormGender] = useState('');
  const [formAge, setFormAge] = useState('');
  const [formLocality, setFormLocality] = useState('');
  const [formPreferredCenter, setFormPreferredCenter] = useState('');
  const [formContactPref, setFormContactPref] = useState('whatsapp');
  const [formAvailability, setFormAvailability] = useState<string[]>([]);
  const [formBridgePref, setFormBridgePref] = useState(true);
  const [formTravelRadius, setFormTravelRadius] = useState(15);

  // Log donation form states
  const [donationDate, setDonationDate] = useState(new Date().toISOString().split('T')[0]);
  const [donationHospital, setDonationHospital] = useState('');
  const [donationNotes, setDonationNotes] = useState('');
  const [loggingDonation, setLoggingDonation] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [profileRes, reqsRes, bridgeRes, historyRes] = await Promise.all([
        api.get('/api/donor/me'),
        api.get('/api/donor/me/requirements').catch(() => ({ data: [] })),
        api.get('/api/donor/me/bridge').catch(() => ({ data: { assigned: false } })),
        api.get('/api/donor/me/history').catch(() => ({ data: [] }))
      ]);

      const prof = profileRes.data;
      setProfile(prof);
      setRequirements(reqsRes.data);
      setBridge(bridgeRes.data);
      setHistory(historyRes.data);

      // Prepopulate form fields if profile is being completed
      if (prof) {
        setFormBloodGroup(prof.blood_group || '');
        setFormGender(prof.gender || '');
        setFormAge(prof.age ? String(prof.age) : '');
        setFormLocality(prof.locality || '');
        setFormPreferredCenter(prof.preferred_center || '');
        setFormContactPref(prof.contact_preference || 'whatsapp');
        setFormAvailability(prof.general_availability ? prof.general_availability.split(', ') : []);
        setFormBridgePref(prof.bridge_preference !== false);
        setFormTravelRadius(prof.travel_radius || 15);
      }
    } catch (err) {
      console.error("Failed to load donor data:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleOnboardingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingProfile(true);
    try {
      await api.put('/api/donor/me', {
        blood_group: formBloodGroup,
        gender: formGender,
        age: parseInt(formAge) || null,
        location: formLocality, // Sync with main location
        locality: formLocality,
        preferred_center: formPreferredCenter,
        contact_preference: formContactPref,
        general_availability: formAvailability.join(', '),
        bridge_preference: formBridgePref,
        travel_radius: formTravelRadius
      });
      await fetchData();
    } catch (err) {
      alert("Failed to save onboarding details. Please try again.");
    } finally {
      setSubmittingProfile(false);
    }
  };

  const handleRequirementResponse = async (reqId: number, status: 'confirmed' | 'declined') => {
    try {
      await api.post(`/api/donor/me/requirements/${reqId}/respond`, { status });
      await fetchData();
      alert(status === 'confirmed' ? "Thank you! Your donation slot is confirmed." : "Response recorded. We will contact backup donors.");
    } catch (err: any) {
      alert(err.response?.data?.detail || "Failed to record response.");
    }
  };

  const handleLogDonation = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoggingDonation(true);
    try {
      await api.post('/api/donor/me/donation', {
        donation_date: donationDate,
        hospital: donationHospital,
        notes: donationNotes
      });
      setShowLogModal(false);
      setDonationHospital('');
      setDonationNotes('');
      await fetchData();
      alert("Donation successfully logged! Cooldown cycle activated.");
    } catch (err) {
      alert("Failed to log donation.");
    } finally {
      setLoggingDonation(false);
    }
  };

  const handleWillingToDonate = async (optIn: boolean) => {
    try {
      setLoading(true);
      await api.put('/api/donor/me', { bridge_preference: optIn });
      await fetchData();
      if (optIn) {
        alert("Thank you! We've registered your willingness to donate and checked for matching pods.");
      }
    } catch (err) {
      alert("Failed to update preference.");
      setLoading(false);
    }
  };

  const toggleAvailability = (time: string) => {
    if (formAvailability.includes(time)) {
      setFormAvailability(formAvailability.filter(t => t !== time));
    } else {
      setFormAvailability([...formAvailability, time]);
    }
  };

  if (loading) {
    return <div className="p-8 text-slate-400 font-medium flex items-center justify-center h-96">Loading Donor Portal...</div>;
  }

  // Determine if onboarding is required (check critical fields)
  const needsOnboarding = !profile?.blood_group || !profile?.locality || !profile?.contact_preference;

  // Cooldown calculation
  const isCooldown = profile?.eligibility_status === 'not eligible';
  let cooldownDaysLeft = 0;
  let cooldownPercent = 0;

  if (isCooldown && profile?.next_eligible_date) {
    const nextEligible = new Date(profile.next_eligible_date);
    const lastDonation = profile.last_donation_date ? new Date(profile.last_donation_date) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const today = new Date();
    const totalCooldownDays = Math.max(1, Math.round((nextEligible.getTime() - lastDonation.getTime()) / (1000 * 60 * 60 * 24)));
    cooldownDaysLeft = Math.max(0, Math.round((nextEligible.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
    cooldownPercent = Math.max(0, Math.min(100, Math.round(((totalCooldownDays - cooldownDaysLeft) / totalCooldownDays) * 100)));
  }

  if (needsOnboarding) {
    return (
      <div className="max-w-xl mx-auto p-4 md:p-8">
        <div className="glass-card p-6 md:p-8 space-y-6">
          <div className="flex justify-center mb-2">
            <div className="w-16 h-16 bg-red-950/40 border border-red-500/30 rounded-2xl flex items-center justify-center transform rotate-12 shadow-xl">
              <Heart className="w-10 h-10 text-red-500 transform -rotate-12" />
            </div>
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight text-white">Complete Your Profile</h1>
            <p className="text-slate-400 text-sm mt-1">We need a few details to match you with a local patient bridge in Hyderabad.</p>
          </div>

          <form onSubmit={handleOnboardingSubmit} className="space-y-4 text-slate-200">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Blood Group</label>
                <select 
                  required value={formBloodGroup} onChange={e => setFormBloodGroup(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2 px-3 focus:outline-none focus:border-red-500 text-slate-200"
                >
                  <option value="">Select</option>
                  {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(bg => <option key={bg} value={bg}>{bg}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Gender</label>
                <select 
                  required value={formGender} onChange={e => setFormGender(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2 px-3 focus:outline-none focus:border-red-500 text-slate-200"
                >
                  <option value="">Select</option>
                  {['Male', 'Female', 'Other'].map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Age</label>
                <input 
                  type="number" required min="18" max="65"
                  value={formAge} onChange={e => setFormAge(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2 px-3 focus:outline-none focus:border-red-500 text-slate-200"
                  placeholder="e.g. 25"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Locality (Hyderabad)</label>
                <select 
                  required value={formLocality} onChange={e => setFormLocality(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2 px-3 focus:outline-none focus:border-red-500 text-slate-200"
                >
                  <option value="">Select Locality</option>
                  {['Kukatpally', 'Secunderabad', 'Jubilee Hills', 'Gachibowli', 'Nampally', 'Begumpet', 'Ameerpet', 'LB Nagar', 'Charminar'].map(loc => (
                    <option key={loc} value={loc}>{loc}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Preferred Donation Center</label>
              <select 
                required value={formPreferredCenter} onChange={e => setFormPreferredCenter(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2 px-3 focus:outline-none focus:border-red-500 text-slate-200"
              >
                <option value="">Select Center</option>
                {['Blood Warriors Kukatpally Care Center', 'NIMS Hospital Blood Bank', 'Red Cross Secunderabad', 'Gandhi Hospital Blood Center', 'Osmania Hospital Center'].map(ctr => (
                  <option key={ctr} value={ctr}>{ctr}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Travel Radius Limit (km)</label>
              <div className="flex items-center gap-4">
                <input 
                  type="range" min="5" max="50" step="5"
                  value={formTravelRadius} onChange={e => setFormTravelRadius(Number(e.target.value))}
                  className="flex-1 accent-red-500"
                />
                <span className="w-12 text-sm text-right font-mono">{formTravelRadius} km</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Preferred Notification Channel</label>
              <div className="grid grid-cols-3 gap-2">
                {['whatsapp', 'sms', 'phone'].map(channel => (
                  <button
                    key={channel} type="button"
                    onClick={() => setFormContactPref(channel)}
                    className={`py-2 px-3 rounded-lg border text-sm font-medium transition uppercase tracking-wider flex items-center justify-center gap-1.5 ${
                      formContactPref === channel 
                        ? 'bg-red-950/40 border-red-500 text-white shadow' 
                        : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    {channel === 'whatsapp' && <MessageSquare size={14} />}
                    {channel === 'sms' && <ShieldAlert size={14} />}
                    {channel === 'phone' && <Phone size={14} />}
                    {channel}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">General Availability</label>
              <div className="grid grid-cols-2 gap-2">
                {['Weekdays', 'Weekends', 'Mornings', 'Afternoons'].map(time => {
                  const isSel = formAvailability.includes(time);
                  return (
                    <button
                      key={time} type="button"
                      onClick={() => toggleAvailability(time)}
                      className={`py-2 px-3 rounded-lg border text-left text-sm font-medium transition flex items-center justify-between ${
                        isSel 
                          ? 'bg-slate-800 border-slate-500 text-white' 
                          : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <span>{time}</span>
                      {isSel && <Check size={14} className="text-red-500" />}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <div>
                <div className="text-sm font-medium text-white">Join Blood Bridge model</div>
                <div className="text-xs text-slate-400">Recurring matched rotations (8 donors/pod)</div>
              </div>
              <button
                type="button"
                onClick={() => setFormBridgePref(!formBridgePref)}
                className={`w-12 h-6 rounded-full p-1 transition-colors duration-200 outline-none ${
                  formBridgePref ? 'bg-red-600' : 'bg-slate-700'
                }`}
              >
                <div className={`w-4 h-4 rounded-full bg-white transition-transform duration-200 ${
                  formBridgePref ? 'translate-x-6' : 'translate-x-0'
                }`} />
              </button>
            </div>

            <button
              type="submit" disabled={submittingProfile}
              className="w-full btn-primary justify-center mt-6 py-2.5"
            >
              {submittingProfile ? 'Saving profile...' : 'Save & Onboard'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-8">
      
      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${isCooldown ? 'bg-amber-500' : 'bg-green-500'} pulse-ring`} />
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-white">
              Donor Command Centre
            </h1>
          </div>
          <p className="text-slate-400 text-sm mt-1">Matched Rotation & Care Continuity portal.</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setShowLogModal(true)} 
            className="px-4 py-2 bg-slate-900 border border-slate-700 text-white rounded-lg text-sm font-semibold hover:bg-slate-800 transition"
          >
            Log Donation
          </button>
        </div>
      </div>

      {/* Active Requirement Alerts */}
      {requirements.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-red-400">🚨 Critical Transfusion Request Alerts</h2>
          {requirements.map((req) => (
            <div 
              key={req.requirement_id} 
              className="glass-card border border-red-500/20 bg-gradient-to-r from-red-950/10 to-transparent p-6 rounded-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6"
            >
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <span className="badge badge-inactive">Transfusion Needed</span>
                  {req.my_response_status !== 'pending' && (
                    <span className={`badge ${
                      req.my_response_status === 'confirmed' ? 'badge-active' : 'badge-pending'
                    }`}>
                      My Response: {req.my_response_status}
                    </span>
                  )}
                </div>
                <h3 className="text-lg font-bold text-white">
                  Patient Support Cycle Request: {req.patient_name || 'Anonymous Patient'} ({req.blood_group})
                </h3>
                <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-400">
                  <span className="flex items-center gap-1.5"><Calendar size={15} /> Needed: <strong>{new Date(req.date_needed).toLocaleDateString()}</strong></span>
                  <span className="flex items-center gap-1.5"><MapPin size={15} /> Location: <strong>{req.center_name}</strong></span>
                  <span className="flex items-center gap-1.5"><Activity size={15} /> Units: <strong>{req.units_needed}</strong></span>
                </div>
              </div>
              
              {req.my_response_status === 'pending' ? (
                <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                  <button 
                    onClick={() => handleRequirementResponse(req.requirement_id, 'confirmed')}
                    className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition"
                  >
                    <Check size={16} /> Confirm Attendance
                  </button>
                  <button 
                    onClick={() => handleRequirementResponse(req.requirement_id, 'declined')}
                    className="px-5 py-2.5 bg-slate-900 border border-slate-700 text-slate-300 hover:bg-slate-800 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition"
                  >
                    <X size={16} /> Mark Unavailable
                  </button>
                </div>
              ) : (
                <div className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                  <CheckCircle size={18} className="text-green-500" /> Response Recorded
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Main Grid: Status & Cooldown Tracker + Metrics */}
      <div className="grid md:grid-cols-3 gap-6">
        
        {/* Status / Cooldown Card */}
        <div className="glass-card p-6 flex flex-col items-center justify-center text-center relative overflow-hidden md:col-span-2">
          {isCooldown ? (
            <div className="w-full space-y-6">
              <div className="flex justify-between items-center">
                <div className="text-left">
                  <span className="badge badge-pending">Cooldown Active</span>
                  <h3 className="text-xl font-bold mt-2 text-white">Donor Recovery Period</h3>
                  <p className="text-sm text-slate-400 mt-1">Thank you for donating whole blood. Your body needs rest.</p>
                </div>
                <div className="text-right font-mono text-3xl font-bold text-amber-500">{cooldownDaysLeft} Days Left</div>
              </div>
              
              {/* Cooldown progress bar */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-slate-400">
                  <span>Last Donation: {profile?.last_donation_date}</span>
                  <span>Next Eligible: {profile?.next_eligible_date}</span>
                </div>
                <div className="score-bar-track">
                  <div className="score-bar-fill" style={{ width: `${cooldownPercent}%` }} />
                </div>
                <div className="text-right text-[10px] text-slate-500 font-mono">Recovery Progress: {cooldownPercent}%</div>
              </div>
            </div>
          ) : (
            <div className="space-y-4 py-4">
              <div className="w-16 h-16 bg-green-950/40 border border-green-500/30 rounded-full flex items-center justify-center mx-auto mb-2 pulse-ring">
                <Check className="w-8 h-8 text-green-400" />
              </div>
              <div>
                <span className="badge badge-active">Eligible to Donate</span>
                <h3 className="text-2xl font-bold mt-2 text-white">Available for Matches</h3>
                <p className="text-sm text-slate-400 max-w-md mx-auto mt-2 leading-relaxed">
                  You have fully recovered and are ready to support your patient pod's next transfusion.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 gap-4 h-full">
          <div className="stat-card flex flex-col justify-between">
            <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Donations</span>
            <div>
              <div className="font-mono text-4xl font-bold text-white mt-2">{profile?.donations_till_date || 0}</div>
              <div className="text-[10px] text-slate-500 mt-1">Registered till date</div>
            </div>
          </div>

          <div className="stat-card flex flex-col justify-between">
            <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Reliability</span>
            <div>
              <div className="font-mono text-4xl font-bold text-green-400 mt-2">
                {profile?.calls_to_donations_ratio 
                  ? `${Math.round(profile.calls_to_donations_ratio * 100)}%` 
                  : '100%'}
              </div>
              <div className="text-[10px] text-slate-500 mt-1">Turnout ratio score</div>
            </div>
          </div>

          <div className="stat-card flex flex-col justify-between col-span-2">
            <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Hyderabad Care Locality</span>
            <div className="flex justify-between items-end mt-2">
              <div>
                <div className="text-sm font-bold text-white">{profile?.locality}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">{profile?.preferred_center}</div>
              </div>
              <div className="text-xs text-red-400 font-mono flex items-center gap-1">
                <MapPin size={12} /> {profile?.travel_radius}km limit
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Patient Bridge Pod Visualizer */}
      {bridge && bridge.assigned ? (
        <div className="glass-card p-6 md:p-8 space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-800 pb-4 gap-4">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Award className="text-red-500" size={20} /> My Active Blood Bridge Pod
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">Recurring care pod rotation for thalassemia patient support.</p>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-2 flex items-center gap-3">
              <div>
                <div className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Supporting Patient</div>
                <div className="text-sm font-bold text-white">{bridge.patient_name} ({bridge.patient_blood_group})</div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="text-sm text-slate-300 leading-relaxed max-w-4xl">
              Thalassemia transfusions happen regularly every 3-4 weeks. Rather than random matching, you are part of a 
              pod of <strong>8 rotation slots</strong> that support {bridge.patient_name} in rotation. This structure ensures a reliable pipeline for the patient while preventing donor burnout.
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 pt-2">
              {Array.from({ length: 8 }).map((_, i) => {
                const pos = i + 1;
                const isMe = bridge.cycle_position === pos;
                const active = pos === 1 || pos === 3 || pos === 5; // Simulating slot fill representation
                
                return (
                  <div 
                    key={pos} 
                    className={`border rounded-xl p-3.5 flex flex-col items-center justify-between text-center relative ${
                      isMe 
                        ? 'bg-red-950/20 border-red-500/40 shadow shadow-red-950/40' 
                        : 'bg-slate-900/40 border-slate-800/80'
                    }`}
                  >
                    <span className="absolute top-1.5 left-2 font-mono text-[9px] font-bold text-slate-500">#{pos}</span>
                    
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center mb-2.5 ${
                      isMe 
                        ? 'bg-red-950/50 border border-red-500/40 text-red-400' 
                        : 'bg-slate-950 text-slate-500'
                    }`}>
                      <UserIcon size={14} />
                    </div>

                    <div className="text-xs font-bold text-slate-200 truncate w-full">
                      {isMe ? 'Me (You)' : (active ? `Donor ${pos}` : 'Slot Empty')}
                    </div>

                    <div className="mt-2.5">
                      {isMe ? (
                        <span className={`badge ${isCooldown ? 'badge-pending' : 'badge-active'}`}>
                          {isCooldown ? 'Cooldown' : 'Eligible'}
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-500 uppercase font-mono font-medium">
                          {active ? 'Bridge Active' : 'Standby Slot'}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="glass-card p-8 text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-slate-900 flex items-center justify-center mx-auto text-slate-400 border border-slate-700 shadow-inner">
            <Heart size={28} className={profile?.bridge_preference ? "text-red-500 pulse-ring" : "text-slate-500"} />
          </div>
          <div>
            <h3 className="text-xl font-bold text-white">
              {profile?.bridge_preference ? "Pod Matching Pending" : "Willing to Donate?"}
            </h3>
            <p className="text-sm text-slate-400 max-w-md mx-auto mt-2 leading-relaxed">
              {profile?.bridge_preference 
                ? "You are currently opted-in as an eligible donor in the Hyderabad pool. We are actively matching you to a patient pod based on distance and blood group."
                : "Opt-in to the Blood Bridge model to be automatically assigned to a thalassemia patient pod in your locality."}
            </p>
          </div>
          
          <div className="pt-2 flex justify-center">
            {profile?.bridge_preference ? (
              <button 
                onClick={() => handleWillingToDonate(false)}
                className="px-5 py-2.5 bg-slate-900 border border-slate-700 text-slate-300 hover:bg-slate-800 rounded-lg text-sm font-semibold transition"
              >
                Opt Out of Bridge Matches
              </button>
            ) : (
              <button 
                onClick={() => handleWillingToDonate(true)}
                className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-bold shadow-lg shadow-red-900/50 flex items-center gap-2 transition"
              >
                <Heart size={16} /> Yes, I am willing to donate
              </button>
            )}
          </div>
        </div>
      )}

      {/* Donation History Table */}
      <div className="glass-card p-6 md:p-8 space-y-6">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <Clock size={18} className="text-slate-400" /> Donation History
        </h2>
        {history.length === 0 ? (
          <div className="text-sm text-slate-500 py-6 text-center bg-slate-950/25 rounded-lg border border-slate-900">
            No donation records found. If you completed a donation, log it using the button above.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-200">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 text-xs font-semibold uppercase tracking-wider">
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Hospital Location</th>
                  <th className="py-3 px-4">Notes</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Appreciation</th>
                </tr>
              </thead>
              <tbody>
                {history.map((log) => (
                  <tr key={log.id} className="border-b border-slate-800/60 hover:bg-slate-900/20 transition-colors">
                    <td className="py-3 px-4 font-mono font-medium">{new Date(log.transfusion_date).toLocaleDateString()}</td>
                    <td className="py-3 px-4 font-medium text-white">{log.hospital || 'N/A'}</td>
                    <td className="py-3 px-4 text-slate-400 max-w-xs truncate">{log.notes || '—'}</td>
                    <td className="py-3 px-4 text-center">
                      <span className="badge badge-active">{log.status}</span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button 
                        onClick={() => setSelectedCertificate(log)}
                        className="text-red-400 hover:text-red-300 font-semibold text-xs flex items-center justify-end gap-1.5 ml-auto cursor-pointer"
                      >
                        <CertificateIcon size={12} /> Certificate
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Log Donation Modal */}
      {showLogModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-card w-full max-w-md overflow-hidden text-slate-200">
            <div className="p-6 border-b border-slate-800 flex justify-between items-center">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Heart size={20} className="text-red-500" /> Log Donation
              </h2>
              <button 
                onClick={() => setShowLogModal(false)} 
                className="text-slate-400 hover:text-white transition"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleLogDonation} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Donation Date</label>
                <input 
                  type="date" required
                  value={donationDate} onChange={e => setDonationDate(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2 px-3 focus:outline-none focus:border-red-500 text-slate-200"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Hospital / Bank Name</label>
                <input 
                  type="text" required
                  value={donationHospital} onChange={e => setDonationHospital(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2 px-3 focus:outline-none focus:border-red-500 text-slate-200"
                  placeholder="e.g. NIMS Hospital Blood Bank"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Notes / Hb Details</label>
                <textarea 
                  value={donationNotes} onChange={e => setDonationNotes(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2 px-3 focus:outline-none focus:border-red-500 text-slate-200 h-20"
                  placeholder="Optional notes..."
                />
              </div>
              <div className="pt-4 flex gap-3 justify-end">
                <button 
                  type="button" onClick={() => setShowLogModal(false)} 
                  className="px-4 py-2 text-sm font-semibold text-slate-400 bg-slate-900 border border-slate-700 rounded-lg hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button 
                  type="submit" disabled={loggingDonation}
                  className="px-5 py-2 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 shadow-md"
                >
                  {loggingDonation ? 'Logging...' : 'Confirm donation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Certificate Viewer Modal */}
      {selectedCertificate && (
        <div className="fixed inset-0 bg-slate-950/95 backdrop-blur z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-stone-50 border-[16px] border-amber-800/40 p-6 md:p-12 text-center text-stone-900 shadow-2xl relative rounded-sm">
            <button 
              onClick={() => setSelectedCertificate(null)}
              className="absolute top-4 right-4 text-stone-400 hover:text-stone-900 transition p-1 bg-stone-200 rounded-full"
            >
              <X size={18} />
            </button>

            {/* Certificate content styling */}
            <div className="border-2 border-dashed border-amber-900/30 p-4 md:p-8 space-y-6">
              <div className="flex justify-center">
                <Heart size={44} className="text-red-600 pulse-ring" />
              </div>
              
              <div className="space-y-2">
                <h1 className="font-serif text-3xl font-bold tracking-wide text-amber-950 uppercase">Certificate of Appreciation</h1>
                <p className="text-xs text-stone-500 font-semibold tracking-widest uppercase">Issued by Blood Warriors Foundation</p>
              </div>

              <div className="py-2 text-stone-600 font-sans text-sm md:text-base leading-relaxed">
                This is to gratefully acknowledge the life-saving contribution of
                <div className="font-serif text-2xl font-bold text-amber-950 py-3 underline decoration-amber-950/30">{profile?.name || 'Valued Donor'}</div>
                who donated a unit of blood on <strong className="text-amber-950">{new Date(selectedCertificate.transfusion_date).toLocaleDateString()}</strong> at <strong className="text-amber-950">{selectedCertificate.hospital}</strong>.
                Your commitment as a Blood Bridge champion supports patient care continuity and preserves life.
              </div>

              <div className="grid grid-cols-2 pt-8 border-t border-stone-200 gap-8">
                <div>
                  <div className="font-serif text-stone-700 italic font-bold">Harish Vasireddy</div>
                  <div className="text-[10px] text-stone-500 uppercase mt-0.5">Blood Warriors Coordinator</div>
                </div>
                <div>
                  <div className="font-mono text-stone-800 text-xs font-semibold mt-2">{selectedCertificate.id}-BW-BRIDGE</div>
                  <div className="text-[10px] text-stone-500 uppercase mt-0.5">Verification Reference</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export function EditProfile() {
  return <div className="p-8 text-white">Edit Profile View is integrated into Dashboard onboarding.</div>;
}
