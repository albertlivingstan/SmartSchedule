import React, { useState, useEffect } from 'react';
import { X, Calendar, Clock, User, Mail, ShieldAlert, Sparkles, Activity, FileText } from 'lucide-react';
import { Appointment } from '../types';
import { api } from '../api';

interface AppointmentDetailModalProps {
  appointment: Appointment | null;
  onClose: () => void;
  onRefresh: () => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const AppointmentDetailModal: React.FC<AppointmentDetailModalProps> = ({
  appointment,
  onClose,
  onRefresh,
  showToast
}) => {
  const [auditList, setAuditList] = useState<any[]>([]);

  useEffect(() => {
    if (appointment) {
      api.getAudit(appointment.id)
        .then(data => setAuditList(data))
        .catch(() => {});
    }
  }, [appointment]);

  if (!appointment) return null;

  const starts = new Date(appointment.starts_at);
  const ends = new Date(appointment.ends_at);

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="glass-panel p-6 rounded-2xl border border-slate-700 max-w-lg w-full space-y-4 shadow-2xl">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-white text-base">{appointment.client}</span>
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                  appointment.status === 'scheduled'
                    ? 'bg-brand-500/20 text-brand-300'
                    : appointment.status === 'completed'
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : appointment.status === 'cancelled'
                    ? 'bg-rose-500/20 text-rose-300'
                    : 'bg-amber-500/20 text-amber-300'
                }`}
              >
                {appointment.status.toUpperCase()}
              </span>
            </div>
            <div className="text-[11px] text-slate-400 font-mono">
              ID #{appointment.id} · Source: {appointment.source}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3.5 text-xs">
          <div className="grid grid-cols-2 gap-3 p-3.5 rounded-xl bg-slate-900/60 border border-slate-800">
            <div>
              <div className="text-[10px] text-slate-500 uppercase">Service & Staff</div>
              <div className="font-semibold text-white mt-0.5">{appointment.service}</div>
              <div className="text-slate-400">{appointment.staff}</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500 uppercase">Appointment Time</div>
              <div className="font-semibold text-white mt-0.5">{starts.toLocaleDateString()}</div>
              <div className="text-slate-400">
                {starts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – {ends.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>

          {/* AI Risk Assessment */}
          <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-400 uppercase font-semibold">AI No-Show Risk</span>
              <span
                className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                  appointment.risk_tier === 'High'
                    ? 'bg-rose-500/20 text-rose-300'
                    : appointment.risk_tier === 'Medium'
                    ? 'bg-amber-500/20 text-amber-300'
                    : 'bg-emerald-500/20 text-emerald-300'
                }`}
              >
                {appointment.risk_tier || 'Low'} ({Math.round((appointment.risk_score || 0) * 100)}%)
              </span>
            </div>
            {appointment.risk_factors && appointment.risk_factors.length > 0 && (
              <div className="text-[11px] text-slate-300 space-y-1 pt-1">
                {appointment.risk_factors.map((f, i) => (
                  <div key={i} className="flex items-center space-x-1.5">
                    <span className="text-accent-cyan">•</span>
                    <span>{f}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {appointment.notes && (
            <div className="p-3 rounded-xl bg-slate-900/40 border border-slate-800 text-[11px] text-slate-300">
              <span className="font-semibold text-slate-400">Notes: </span>
              {appointment.notes}
            </div>
          )}

          {/* Audit History */}
          <div>
            <div className="text-[11px] font-semibold text-slate-400 uppercase mb-1.5 flex items-center space-x-1">
              <Activity className="w-3.5 h-3.5 text-accent-cyan" />
              <span>Audit Trail History</span>
            </div>
            <div className="max-h-36 overflow-y-auto space-y-1.5 divide-y divide-slate-800/60">
              {auditList.map((entry) => (
                <div key={entry.id} className="pt-1.5 flex justify-between text-[11px]">
                  <span className="text-slate-300">
                    <b className="text-brand-300 capitalize">{entry.action}:</b> {entry.detail}
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {new Date(entry.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
              {auditList.length === 0 && (
                <div className="text-[11px] text-slate-500">No activity logged yet.</div>
              )}
            </div>
          </div>
        </div>

        <div className="pt-3 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
