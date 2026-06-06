import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { Users, Search, ChevronRight } from 'lucide-react';

interface PatientSummary {
  id: number;
  external_id: string;
  name: string | null;
  blood_group: string | null;
  expected_next_transfusion_date: string | null;
  transfusion_frequency_days: number | null;
  bridge_slots_filled: number;
}

export function PatientsList() {
  const [patients, setPatients] = useState<PatientSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPatients();
  }, []);

  const fetchPatients = async () => {
    try {
      const res = await api.get('/api/admin/patients');
      setPatients(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-8">
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Patient Directory</h1>
          <p className="text-slate-500 mt-1">Manage patients and their transfusion schedules</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center bg-slate-50">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search patients..." 
              className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-red-500"
            />
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-500">Loading directory...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3">Patient</th>
                  <th className="px-6 py-3">Blood Group</th>
                  <th className="px-6 py-3">Next Transfusion</th>
                  <th className="px-6 py-3">Bridge Status</th>
                  <th className="px-6 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {patients.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                      No patients registered yet.
                    </td>
                  </tr>
                ) : (
                  patients.map(p => (
                    <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-medium text-slate-900">{p.name || 'Unnamed Patient'}</div>
                        <div className="text-xs text-slate-500">ID: {p.external_id.split('-')[0]}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                          {p.blood_group || 'Unknown'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        {p.expected_next_transfusion_date ? new Date(p.expected_next_transfusion_date).toLocaleDateString() : 'Not Set'}
                        {p.transfusion_frequency_days && <span className="text-xs text-slate-400 ml-2">({p.transfusion_frequency_days}d cycle)</span>}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                            <div className="bg-green-500 h-full" style={{ width: `${(p.bridge_slots_filled / 8) * 100}%` }}></div>
                          </div>
                          <span className="text-xs text-slate-500">{p.bridge_slots_filled}/8 slots</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Link 
                          to={`/admin/patients/${p.id}`}
                          className="inline-flex items-center gap-1 text-sm font-medium text-red-600 hover:text-red-700"
                        >
                          Manage <ChevronRight size={16} />
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
