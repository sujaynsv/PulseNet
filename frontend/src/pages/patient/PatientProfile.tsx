import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { User, MapPin, Phone, Activity, Calendar } from 'lucide-react';

export function PatientProfile() {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form states
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [bloodGroup, setBloodGroup] = useState('');
  const [location, setLocation] = useState('');
  const [freq, setFreq] = useState('');
  const [nextDate, setNextDate] = useState('');

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const res = await api.get('/api/patient/me');
      const data = res.data;
      setProfile(data);
      setName(data.name || '');
      setPhone(data.phone || '');
      setBloodGroup(data.blood_group || '');
      setLocation(data.location || '');
      setFreq(data.transfusion_frequency_days?.toString() || '');
      setNextDate(data.expected_next_transfusion_date || '');
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.patch('/api/patient/me', {
        name,
        phone,
        blood_group: bloodGroup,
        location,
        transfusion_frequency_days: freq ? parseInt(freq, 10) : null,
        expected_next_transfusion_date: nextDate || null
      });
      alert('Profile updated successfully!');
      fetchProfile();
    } catch (err) {
      alert('Failed to update profile.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-slate-500 font-medium">Loading Profile...</div>;

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">My Profile</h1>
        <p className="text-slate-500 mt-1">Manage your personal information and transfusion settings.</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-100 bg-slate-50 flex items-center gap-4">
          <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center">
            <User size={32} />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-slate-800">{profile?.name || 'Your Profile'}</h2>
            <p className="text-sm text-slate-500">{profile?.email}</p>
          </div>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <User size={16} className="text-slate-400" /> Personal Info
              </h3>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
                <input 
                  type="text" value={name} onChange={e => setName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:ring-red-500 focus:border-red-500 outline-none" 
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Blood Group</label>
                <select 
                  value={bloodGroup} onChange={e => setBloodGroup(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:ring-red-500 focus:border-red-500 outline-none bg-white"
                >
                  <option value="">Select...</option>
                  <option value="A+">A+</option>
                  <option value="A-">A-</option>
                  <option value="B+">B+</option>
                  <option value="B-">B-</option>
                  <option value="O+">O+</option>
                  <option value="O-">O-</option>
                  <option value="AB+">AB+</option>
                  <option value="AB-">AB-</option>
                </select>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <Phone size={16} className="text-slate-400" /> Contact & Location
              </h3>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Phone Number</label>
                <input 
                  type="text" value={phone} onChange={e => setPhone(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:ring-red-500 focus:border-red-500 outline-none" 
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Location</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <MapPin size={16} className="text-slate-400" />
                  </div>
                  <input 
                    type="text" value={location} onChange={e => setLocation(e.target.value)}
                    className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-md shadow-sm focus:ring-red-500 focus:border-red-500 outline-none" 
                    placeholder="City, Area"
                  />
                </div>
              </div>
            </div>
            
            <div className="space-y-4 md:col-span-2 pt-4 border-t border-slate-100">
              <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <Activity size={16} className="text-slate-400" /> Transfusion Schedule
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Transfusion Frequency (Days)</label>
                  <input 
                    type="number" value={freq} onChange={e => setFreq(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:ring-red-500 focus:border-red-500 outline-none" 
                  />
                  <p className="text-xs text-slate-500 mt-1">Used to predict your upcoming cycle needs.</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Expected Next Transfusion</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Calendar size={16} className="text-slate-400" />
                    </div>
                    <input 
                      type="date" value={nextDate} onChange={e => setNextDate(e.target.value)}
                      className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-md shadow-sm focus:ring-red-500 focus:border-red-500 outline-none" 
                    />
                  </div>
                </div>
              </div>
            </div>

          </div>

          <div className="pt-6 border-t border-slate-100 flex justify-end">
            <button 
              type="submit" 
              disabled={saving}
              className="px-6 py-2 bg-red-600 text-white rounded-md shadow-sm font-medium hover:bg-red-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Profile'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
