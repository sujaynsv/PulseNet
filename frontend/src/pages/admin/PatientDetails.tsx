import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { ArrowLeft, Calendar, Activity, PlusCircle } from 'lucide-react';

export function PatientDetails() {
  const { id } = useParams<{ id: string }>();
  const [patient, setPatient] = useState<any>(null);
  const [cycles, setCycles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    fetchData();
  }, [id]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [patientRes, cyclesRes] = await Promise.all([
        api.get(`/api/admin/patients/${id}`),
        api.get(`/api/admin/patients/${id}/cycles`)
      ]);
      setPatient(patientRes.data);
      setCycles(cyclesRes.data);
    } catch (err) {
      console.error(err);
      alert('Failed to load patient data');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateCycles = async () => {
    if (!confirm('This will generate 6 upcoming transfusion cycles based on the patient frequency. Proceed?')) return;
    setGenerating(true);
    try {
      const res = await api.post(`/api/admin/patients/${id}/generate-cycles`);
      setCycles(res.data);
      alert('Cycles generated successfully!');
    } catch (err) {
      console.error(err);
      alert('Failed to generate cycles.');
    } finally {
      setGenerating(false);
    }
  };

  if (loading) return <div className="p-8 text-slate-500 font-medium">Loading Patient Data...</div>;
  if (!patient) return <div className="p-8 text-red-500 font-medium">Patient not found.</div>;

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Link to="/admin/patients" className="p-2 bg-white border border-slate-200 rounded-lg shadow-sm text-slate-500 hover:text-slate-700 hover:bg-slate-50">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{patient.name || 'Unnamed Patient'}</h1>
          <p className="text-slate-500 mt-1">ID: {patient.external_id} | Blood Group: <span className="font-medium text-red-600">{patient.blood_group || 'Unknown'}</span></p>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        {/* Profile Summary Card */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 md:col-span-1 h-fit">
          <h3 className="text-lg font-medium mb-4 flex items-center gap-2"><Activity className="w-5 h-5 text-slate-400" /> Patient Profile</h3>
          <div className="space-y-4 text-sm">
            <div>
              <span className="block text-slate-500 mb-1">Expected Next Transfusion</span>
              <span className="font-medium text-slate-900">{patient.expected_next_transfusion_date ? new Date(patient.expected_next_transfusion_date).toLocaleDateString() : 'Not set'}</span>
            </div>
            <div>
              <span className="block text-slate-500 mb-1">Frequency (Days)</span>
              <span className="font-medium text-slate-900">{patient.transfusion_frequency_days || 'Not set'}</span>
            </div>
            <div>
              <span className="block text-slate-500 mb-1">Bridge Slots Filled</span>
              <span className="font-medium text-slate-900">{patient.bridge_slots_filled} / 8</span>
            </div>
          </div>
        </div>

        {/* Cycles Management */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 md:col-span-2">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-medium flex items-center gap-2"><Calendar className="w-5 h-5 text-slate-400" /> Scheduled Cycles</h3>
            <button 
              onClick={handleGenerateCycles}
              disabled={generating || cycles.length > 0}
              className="px-4 py-2 bg-red-600 text-white rounded-md text-sm font-medium shadow-sm hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
            >
              <PlusCircle size={16} />
              {generating ? 'Generating...' : 'Generate Next 6 Cycles'}
            </button>
          </div>

          {cycles.length === 0 ? (
            <div className="text-center py-12 bg-slate-50 rounded-lg border border-slate-200 border-dashed">
              <p className="text-slate-500 text-sm">No cycles scheduled for this patient.</p>
              <p className="text-slate-400 text-xs mt-1">Click "Generate Next 6 Cycles" to create the schedule based on their frequency.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Due Date</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Expected Units</th>
                    <th className="px-4 py-3">Confidence Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {cycles.map((cycle, index) => (
                    <tr key={cycle.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {new Date(cycle.due_date).toLocaleDateString()}
                        {index === 0 && <span className="ml-2 px-2 py-0.5 bg-red-100 text-red-700 text-[10px] rounded uppercase font-bold tracking-wide">Next</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cycle.status === 'routine' ? 'bg-slate-100 text-slate-600' : 'bg-yellow-100 text-yellow-800'}`}>
                          {cycle.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{cycle.expected_units} Units</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className={`font-semibold ${cycle.confidence_score >= 70 ? 'text-green-600' : cycle.confidence_score >= 40 ? 'text-yellow-600' : 'text-slate-400'}`}>
                            {cycle.confidence_score}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
