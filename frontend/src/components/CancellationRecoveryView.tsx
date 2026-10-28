import React, { useState, useEffect } from 'react';
import {
  RefreshCw, CheckCircle2, XCircle, Clock, Users, ArrowRight,
  ShieldCheck, AlertTriangle, Zap, Sparkles, Send
} from 'lucide-react';
import { SlotOffer, Appointment } from '../types';
import { api } from '../api';

interface CancellationRecoveryViewProps {
  appointments: Appointment[];
  onRefresh: () => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const CancellationRecoveryView: React.FC<CancellationRecoveryViewProps> = ({
  appointments,
  onRefresh,
  showToast
}) => {
  const [offers, setOffers] = useState<SlotOffer[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  const fetchOffers = async () => {
    try {
      const data = await api.getSlotOffers();
      setOffers(data);
    } catch {}
  };

  useEffect(() => {
    fetchOffers();
  }, []);

  const handleAcceptOffer = async (offerId: number) => {
    setActionLoading(offerId);
    try {
      const res = await api.acceptOffer(offerId);
      showToast("Slot Offer Accepted! Appointment successfully recovered and confirmed.", "success");
      fetchOffers();
      onRefresh();
    } catch (err: any) {
      showToast(`Acceptance error: ${err.message}`, "error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeclineOffer = async (offerId: number) => {
    setActionLoading(offerId);
    try {
      const res = await api.declineOffer(offerId);
      showToast("Offer declined. Autonomous recovery cascaded to the next eligible candidate!", "info");
      fetchOffers();
      onRefresh();
    } catch (err: any) {
      showToast(`Decline error: ${err.message}`, "error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleManualTrigger = async (appointmentId: number) => {
    setLoading(true);
    try {
      const res = await api.triggerRecovery(appointmentId);
      if (res.success && res.offer) {
        showToast(`Recovery triggered! Offer dispatched to ${res.candidate?.client || 'waiting candidate'}.`, "success");
      } else {
        showToast(res.detail || "No candidates found for this slot.", "info");
      }
      fetchOffers();
      onRefresh();
    } catch (err: any) {
      showToast(`Trigger failed: ${err.message}`, "error");
    } finally {
      setLoading(false);
    }
  };

  const cancelledAppointments = appointments.filter(a => a.status === 'cancelled');

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Hero Header */}
      <div className="glass-panel p-8 rounded-2xl border border-accent-cyan/30 bg-gradient-to-r from-navy-900 via-brand-950/40 to-navy-900">
        <div className="max-w-3xl">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-accent-cyan/10 border border-accent-cyan/30 text-accent-cyan text-xs font-semibold mb-3">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" style={{ animationDuration: '6s' }} />
            <span>Autonomous Appointment Recovery Engine</span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Autonomous Cancellation Recovery & Waiting-List Matching
          </h1>
          <p className="mt-2 text-xs text-slate-300 leading-relaxed">
            Eliminates lost capacity from last-minute cancellations. When an appointment is cancelled, the system
            releases the slot, searches waitlisted clients matching service and availability constraints,
            dispatches a time-limited offer, and automatically confirms the booking upon acceptance.
          </p>
        </div>
      </div>

      {/* 12-Step Autonomous Workflow Pipeline Visualizer */}
      <div className="glass-panel p-6 rounded-2xl border border-slate-800/80">
        <h2 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">
          Autonomous Recovery Orchestration Lifecycle
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 text-xs">
          {[
            { step: '01', title: 'Cancellation Event', desc: 'Customer cancels slot', active: true },
            { step: '02', title: 'Resource Release', desc: 'Staff calendar freed', active: true },
            { step: '03', title: 'Waitlist Scan', desc: 'Query active requests', active: true },
            { step: '04', title: 'Candidate Scoring', desc: 'Urgency & proximity', active: true },
            { step: '05', title: 'Dispatch Offer', desc: 'Time-limited deadline', active: true },
            { step: '06', title: 'Auto-Confirm', desc: 'Transaction-safe lock', active: true },
          ].map((item) => (
            <div key={item.step} className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
              <div className="text-[10px] font-mono text-accent-cyan font-bold">STEP {item.step}</div>
              <div className="font-semibold text-white truncate">{item.title}</div>
              <div className="text-[11px] text-slate-400">{item.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Active & Historical Slot Offers Table */}
      <div className="glass-panel p-6 rounded-2xl border border-slate-800/80">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-base font-semibold text-white tracking-tight">Slot Offers & Recovery Log</h2>
            <p className="text-xs text-slate-400">Real-time status of dispatched offers and candidate responses</p>
          </div>
          <button
            onClick={fetchOffers}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700 transition-colors"
          >
            Refresh Offers
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/80 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Offer ID</th>
                <th className="py-3 px-4">Service & Staff</th>
                <th className="py-3 px-4">Offered Time Slot</th>
                <th className="py-3 px-4">Response Deadline</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Autonomous Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {offers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    No slot offers recorded yet. Cancel an appointment to trigger an autonomous recovery offer!
                  </td>
                </tr>
              ) : (
                offers.map((offer) => {
                  const sDate = new Date(offer.offered_start);
                  const expDate = new Date(offer.expires_at);
                  const isPending = offer.status === 'pending';

                  return (
                    <tr key={offer.id} className="hover:bg-slate-900/40">
                      <td className="py-3.5 px-4 font-mono text-slate-400">
                        #{offer.id}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-white">{offer.service}</div>
                        <div className="text-[11px] text-slate-400">Staff: {offer.staff}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="text-slate-200 font-medium">
                          {sDate.toLocaleDateString()}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {sDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="text-slate-200 font-medium">
                          {expDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {isPending ? 'Active countdown' : 'Concluded'}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                            offer.status === 'accepted'
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : offer.status === 'declined'
                              ? 'bg-rose-500/20 text-rose-300'
                              : offer.status === 'expired'
                              ? 'bg-slate-700/50 text-slate-400'
                              : 'bg-amber-500/20 text-amber-300 animate-pulse'
                          }`}
                        >
                          {offer.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        {isPending ? (
                          <div className="flex items-center justify-end space-x-2">
                            <button
                              disabled={actionLoading === offer.id}
                              onClick={() => handleAcceptOffer(offer.id)}
                              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold transition-all shadow-sm"
                              title="Simulate customer clicking Accept link"
                            >
                              Accept & Confirm
                            </button>
                            <button
                              disabled={actionLoading === offer.id}
                              onClick={() => handleDeclineOffer(offer.id)}
                              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-medium border border-slate-700 transition-all"
                              title="Simulate customer declining -> Cascades to next candidate"
                            >
                              Decline & Cascade
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-500 italic">
                            {offer.status === 'accepted' ? 'Recovered & Confirmed' : 'Processed'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Manual Recovery Trigger Panel */}
      <div className="glass-panel p-6 rounded-2xl border border-slate-800/80">
        <h2 className="text-base font-semibold text-white tracking-tight mb-2">
          Manual Recovery Trigger (Administrative Override)
        </h2>
        <p className="text-xs text-slate-400 mb-4">
          Select any past cancelled appointment to manually re-evaluate eligible waiting-list candidates and issue a fresh slot offer:
        </p>

        <div className="flex flex-wrap items-center gap-3">
          {cancelledAppointments.slice(0, 6).map((appt) => (
            <button
              key={appt.id}
              onClick={() => handleManualTrigger(appt.id)}
              disabled={loading}
              className="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700/80 hover:border-accent-cyan text-xs text-slate-200 transition-all flex items-center space-x-2"
            >
              <Send className="w-3 h-3 text-accent-cyan" />
              <span>
                Recover #{appt.id}: {appt.service} ({appt.staff})
              </span>
            </button>
          ))}
          {cancelledAppointments.length === 0 && (
            <div className="text-xs text-slate-500">
              No cancelled appointments currently available.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
