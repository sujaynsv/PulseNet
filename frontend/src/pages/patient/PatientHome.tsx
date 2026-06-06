import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { Activity, Calendar, Shield, History } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

// Types
interface Requirement {
  requirement_id: number;
  cycle_id: number;
  status: string;
  confidence_score: number;
  days_remaining: number;
}

interface BridgeDonor {
  cycle_position: number;
  donor_name: string;
  slot_status: string;
}

interface Cycle {
  id: number;
  due_date: string;
  expected_units: number;
  status: string;
  confidence_score: number;
}

interface TransfusionLog {
  id: number;
  transfusion_date: string;
  hospital: string;
  pretransfusion_hb: number | null;
}

export function PatientHome() {
  const [activeReq, setActiveReq] = useState<Requirement | null>(null);
  const [donors, setDonors] = useState<BridgeDonor[]>([]);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [history, setHistory] = useState<TransfusionLog[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals state
  const [showLogModal, setShowLogModal] = useState(false);
  const [hbValue, setHbValue] = useState('');
  const [bloodUnits, setBloodUnits] = useState('2');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [reqRes, bridgeRes, cyclesRes, historyRes] = await Promise.all([
        api.get('/api/patient/me/active-requirement').catch(() => ({ data: null })),
        api.get('/api/patient/me/bridge'),
        api.get('/api/patient/me/cycles'),
        api.get('/api/patient/me/history')
      ]);
      
      setActiveReq(reqRes.data);
      setDonors(bridgeRes.data?.donors || []);
      setCycles(cyclesRes.data || []);
      setHistory(historyRes.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogTransfusion = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/api/patient/me/log-transfusion', {
        transfusion_date: new Date().toISOString().split('T')[0],
        blood_units: parseFloat(bloodUnits),
        pretransfusion_hb: hbValue ? parseFloat(hbValue) : null,
      });
      setShowLogModal(false);
      setHbValue('');
      fetchData();
    } catch (err) {
      alert("Failed to log transfusion");
    }
  };

  const handleRequestTransfusion = async () => {
    if (confirm("Are you sure you want to request an out-of-schedule transfusion?")) {
      try {
        await api.post('/api/patient/me/request-transfusion');
        fetchData();
        alert("Request submitted.");
      } catch (err) {
        alert("Failed to submit request.");
      }
    }
  };

  if (loading) return <div className="p-8 text-slate-500 font-medium">Loading Continuity Guarantee...</div>;

  const score = activeReq?.confidence_score ?? 100;
  let statusColor = "text-green-600";
  let bgRing = "text-green-500";
  if (score < 40) { statusColor = "text-red-600"; bgRing = "text-red-500"; }
  else if (score < 70) { statusColor = "text-yellow-600"; bgRing = "text-yellow-500"; }

  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-8 text-slate-900 bg-slate-50 min-h-screen">
      
      {/* Header & Hero Panel */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Continuity Guarantee</h1>
          <p className="text-slate-500 mt-1">Your predictive transfusion coverage.</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => setShowLogModal(true)} className="px-4 py-2 bg-white border border-slate-200 shadow-sm rounded-md font-medium text-slate-700 hover:bg-slate-50 transition">
            Log Transfusion
          </button>
          <button onClick={handleRequestTransfusion} className="px-4 py-2 bg-red-600 text-white shadow-sm rounded-md font-medium hover:bg-red-700 transition">
            Request Now
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 md:p-8 flex flex-col md:flex-row items-center gap-8">
        {/* Radial Gauge */}
        <div className="relative w-32 h-32 flex-shrink-0">
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
            <circle className="text-slate-100 stroke-current" strokeWidth="8" cx="50" cy="50" r={radius} fill="transparent" />
            <circle 
              className={`${bgRing} stroke-current transition-all duration-1000 ease-in-out`} 
              strokeWidth="8" strokeLinecap="round" cx="50" cy="50" r={radius} fill="transparent" 
              strokeDasharray={circumference} strokeDashoffset={offset} 
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`text-3xl font-bold ${statusColor}`}>{score}</span>
            <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">Score</span>
          </div>
        </div>

        <div className="flex-1 text-center md:text-left">
          <h2 className="text-2xl font-medium mb-2">
            {activeReq ? (
              activeReq.days_remaining > 0 ? `${activeReq.days_remaining} Days Until Transfusion` : "Transfusion Due"
            ) : "Routine Covered"}
          </h2>
          <p className="text-slate-600 max-w-xl text-sm md:text-base leading-relaxed">
            {score >= 70 ? "Your fighter is covered. We have secured sufficient donors from your Blood Bridge for the upcoming requirement." :
             score >= 40 ? "We are actively matching donors from your Blood Bridge to meet your requirement." :
             "Attention required. We are escalating your requirement to the emergency pool to secure blood."}
          </p>
        </div>
      </div>

      {/* Blood Bridge Pod View */}
      <div>
        <h3 className="text-lg font-medium mb-4 flex items-center gap-2"><Shield className="w-5 h-5 text-slate-400" /> Your Blood Bridge</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          {donors.map((d, i) => (
            <div key={i} className="bg-white border border-slate-200 rounded-lg p-3 flex flex-col items-center text-center shadow-sm">
              <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mb-2 text-slate-400">
                <Activity className="w-5 h-5" />
              </div>
              <div className="text-xs font-semibold truncate w-full">{d.donor_name !== '—' ? d.donor_name : `Slot ${d.cycle_position}`}</div>
              <div className="mt-1 flex items-center gap-1">
                <span className={`w-2 h-2 rounded-full ${d.slot_status === 'Active' ? 'bg-green-500' : d.slot_status === 'Due' ? 'bg-yellow-500' : 'bg-slate-300'}`}></span>
                <span className="text-[10px] text-slate-500 uppercase">{d.slot_status}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Calendar & History */}
      <div className="grid md:grid-cols-2 gap-8">
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
          <h3 className="text-lg font-medium mb-6 flex items-center gap-2"><Calendar className="w-5 h-5 text-slate-400" /> Upcoming Cycles</h3>
          <div className="space-y-6 relative before:absolute before:inset-0 before:ml-2 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 before:to-transparent">
            {cycles.length === 0 ? (
              <div className="text-sm text-slate-500 py-6 text-center bg-slate-50 rounded-lg border border-slate-100 relative z-10 shadow-sm mx-auto max-w-sm">
                No upcoming cycles scheduled.<br/>Awaiting coordinator review.
              </div>
            ) : cycles.slice(0, 5).map((cycle, i) => (
              <div key={cycle.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                <div className="flex items-center justify-center w-5 h-5 rounded-full border-2 border-white bg-slate-200 text-slate-500 shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow-sm z-10"></div>
                <div className="w-[calc(100%-2rem)] md:w-[calc(50%-1.5rem)] bg-slate-50 border border-slate-100 p-3 rounded-lg shadow-sm">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm font-semibold text-slate-700">{new Date(cycle.due_date).toLocaleDateString()}</span>
                    <span className={`text-[10px] uppercase px-2 py-0.5 rounded-full font-medium ${cycle.status === 'routine' ? 'bg-slate-200 text-slate-600' : 'bg-yellow-100 text-yellow-700'}`}>
                      {cycle.status}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500">{cycle.expected_units} Units Expected</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
          <h3 className="text-lg font-medium mb-6 flex items-center gap-2"><History className="w-5 h-5 text-slate-400" /> Transfusion Log</h3>
          <div className="space-y-4">
            {history.slice(0, 6).map((log) => (
              <div key={log.id} className="flex justify-between items-center py-3 border-b border-slate-100 last:border-0">
                <div>
                  <div className="font-medium text-sm text-slate-800">{new Date(log.transfusion_date).toLocaleDateString()}</div>
                  <div className="text-xs text-slate-500">{log.hospital || 'Unknown Facility'}</div>
                </div>
                <div className="flex items-center gap-4">
                  {log.pretransfusion_hb && (
                    <div className="flex flex-col items-end">
                      <span className="text-sm font-semibold text-slate-700">{log.pretransfusion_hb} <span className="text-xs text-slate-400 font-normal">g/dL</span></span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Health Analytics */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
        <h3 className="text-lg font-medium mb-6 flex items-center gap-2"><Activity className="w-5 h-5 text-slate-400" /> Pre-Transfusion Hemoglobin Trend</h3>
        <div className="h-64 w-full">
          {history.filter(h => h.pretransfusion_hb !== null).length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={[...history].reverse().filter(h => h.pretransfusion_hb !== null)} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis 
                  dataKey="transfusion_date" 
                  tickFormatter={(val) => new Date(val).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} dy={10} 
                />
                <YAxis 
                  domain={['dataMin - 1', 'dataMax + 1']} 
                  axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} dx={-10}
                />
                <Tooltip 
                  contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  labelFormatter={(val) => new Date(val as string).toLocaleDateString()}
                  formatter={(value: any) => [`${value} g/dL`, 'Hemoglobin']}
                />
                <Line type="monotone" dataKey="pretransfusion_hb" stroke="#ef4444" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-slate-500 bg-slate-50 rounded-lg border border-slate-100">
              Not enough data to generate trend graph.
            </div>
          )}
        </div>
      </div>

      {/* Log Transfusion Modal */}
      {showLogModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-6 border-b border-slate-100">
              <h2 className="text-xl font-semibold">Log Transfusion</h2>
              <p className="text-sm text-slate-500 mt-1">Record a completed transfusion event to update your cycles.</p>
            </div>
            <form onSubmit={handleLogTransfusion} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Pre-transfusion Hb (g/dL)</label>
                <input 
                  type="number" step="0.1" 
                  value={hbValue} onChange={e => setHbValue(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:ring-red-500 focus:border-red-500 outline-none" 
                  placeholder="e.g. 7.2"
                />
                <p className="text-xs text-slate-500 mt-1">Used to track hemoglobin trends and alert your coordinator.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Units Transfused</label>
                <input 
                  type="number" step="0.5" required
                  value={bloodUnits} onChange={e => setBloodUnits(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:ring-red-500 focus:border-red-500 outline-none" 
                />
              </div>
              <div className="pt-4 flex gap-3 justify-end">
                <button type="button" onClick={() => setShowLogModal(false)} className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50">Cancel</button>
                <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 shadow-sm">Save Log</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export function TransfusionHistory() {
  return <div className="p-8">History View Coming Soon</div>;
}
