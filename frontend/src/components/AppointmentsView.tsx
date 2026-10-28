import React, { useState } from 'react';
import {
  Search, Download, Filter, MoreVertical, CheckCircle, XCircle,
  AlertTriangle, Clock, Eye, ShieldAlert, Sparkles
} from 'lucide-react';
import { Appointment } from '../types';
import { api } from '../api';

interface AppointmentsViewProps {
  appointments: Appointment[];
  onRefresh: () => void;
  onSelectAppointment: (appt: Appointment) => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const AppointmentsView: React.FC<AppointmentsViewProps> = ({
  appointments,
  onRefresh,
  onSelectAppointment,
  showToast
}) => {
  const [filterStatus, setFilterStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const filtered = appointments.filter(a => {
    if (filterStatus !== 'all' && a.status !== filterStatus) return false;
    if (search) {
      const q = search.toLowerCase();
      const combined = `${a.client} ${a.email} ${a.service} ${a.staff} ${a.notes}`.toLowerCase();
      if (!combined.includes(q)) return false;
    }
    return true;
  });

  const handleStatusChange = async (id: number, newStatus: 'scheduled' | 'completed' | 'cancelled' | 'no_show') => {
    setUpdatingId(id);
    try {
      const updated = await api.updateAppointmentStatus(id, newStatus);
      if (newStatus === 'cancelled' && (updated as any).recovery) {
        showToast("Appointment cancelled! Autonomous recovery offer dispatched to waiting-list candidate.", "info");
      } else {
        showToast(`Status updated to ${newStatus}`, "success");
      }
      onRefresh();
    } catch (err: any) {
      showToast(`Update error: ${err.message}`, "error");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleExportCsv = () => {
    window.open('/api/export.csv', '_blank');
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Controls Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 glass-panel p-6 rounded-2xl border border-slate-800/80">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Appointment Workspace</h1>
          <p className="text-xs text-slate-400">Manage bookings, update statuses, inspect AI risk scores</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search appointments..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-slate-900 border border-slate-700/80 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 w-56"
            />
          </div>

          {/* Status Filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none"
          >
            <option value="all">All Statuses</option>
            <option value="scheduled">Scheduled</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
            <option value="no_show">No-Show</option>
          </select>

          {/* Export CSV Button */}
          <button
            onClick={handleExportCsv}
            className="flex items-center space-x-1.5 bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700/80 px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Appointments Table */}
      <div className="glass-panel rounded-2xl border border-slate-800/80 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/80 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-3.5 px-6">Client / Email</th>
                <th className="py-3.5 px-4">Service & Staff</th>
                <th className="py-3.5 px-4">Appointment Time</th>
                <th className="py-3.5 px-4">AI Risk Tier</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    No matching appointments found.
                  </td>
                </tr>
              ) : (
                filtered.map((appt) => (
                  <tr key={appt.id} className="hover:bg-slate-900/40 transition-colors">
                    <td className="py-4 px-6">
                      <div className="font-semibold text-white">{appt.client}</div>
                      <div className="text-[11px] text-slate-400 font-mono">{appt.email}</div>
                    </td>
                    <td className="py-4 px-4">
                      <div className="font-medium text-slate-200">{appt.service}</div>
                      <div className="text-[11px] text-slate-400">{appt.staff}</div>
                    </td>
                    <td className="py-4 px-4">
                      <div className="text-slate-200 font-medium">
                        {new Date(appt.starts_at).toLocaleDateString()}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {new Date(appt.starts_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <span
                        className={`inline-flex items-center space-x-1 text-[10px] font-semibold px-2.5 py-1 rounded-full border ${
                          appt.risk_tier === 'High'
                            ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                            : appt.risk_tier === 'Medium'
                            ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                            : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                        }`}
                      >
                        <ShieldAlert className="w-3 h-3" />
                        <span>{appt.risk_tier || 'Low'} ({Math.round((appt.risk_score || 0) * 100)}%)</span>
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <span
                        className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                          appt.status === 'scheduled'
                            ? 'bg-brand-500/20 text-brand-300'
                            : appt.status === 'completed'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : appt.status === 'cancelled'
                            ? 'bg-rose-500/20 text-rose-300'
                            : 'bg-amber-500/20 text-amber-300'
                        }`}
                      >
                        {appt.status}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={() => onSelectAppointment(appt)}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white"
                          title="View Details & Audit Trail"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>

                        {/* Status Select dropdown */}
                        <select
                          disabled={updatingId === appt.id || appt.status === 'cancelled'}
                          value={appt.status}
                          onChange={(e) => handleStatusChange(appt.id, e.target.value as any)}
                          className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-300 focus:outline-none disabled:opacity-50"
                        >
                          <option value="scheduled">Scheduled</option>
                          <option value="completed">Completed</option>
                          <option value="cancelled">Cancelled</option>
                          <option value="no_show">No-Show</option>
                        </select>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
