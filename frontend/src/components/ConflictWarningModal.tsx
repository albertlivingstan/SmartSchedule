import React, { useState } from 'react';
import {
  AlertTriangle, Clock, Calendar, User, Sparkles, CheckCircle2,
  ListPlus, X, ArrowRight, ShieldCheck, Check
} from 'lucide-react';
import { ConflictData, AlternativeSlot } from '../types';
import { api } from '../api';

interface ConflictWarningModalProps {
  isOpen: boolean;
  conflictData: ConflictData | null;
  onClose: () => void;
  onResolved: (newAppointment?: any) => void;
  onJoinWaitingList: (clientName: string, clientEmail: string, service: string, staff: string) => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const ConflictWarningModal: React.FC<ConflictWarningModalProps> = ({
  isOpen,
  conflictData,
  onClose,
  onResolved,
  onJoinWaitingList,
  showToast
}) => {
  const [selectedSlot, setSelectedSlot] = useState<AlternativeSlot | null>(null);
  const [userAgreed, setUserAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen || !conflictData) return null;

  const alternatives = conflictData.alternatives || [];

  const handleConfirmAlternative = async () => {
    if (!selectedSlot) {
      showToast("Please choose an alternative appointment slot first.", "info");
      return;
    }
    if (!userAgreed) {
      showToast("Please check the agreement box to confirm rescheduling.", "info");
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.submitRescheduling({
        conflict_id: conflictData.conflict_id,
        client_name: (conflictData as any).client_name || "Valued Client",
        client_email: (conflictData as any).client_email || "client@example.org",
        service: selectedSlot.service || conflictData.service,
        staff: selectedSlot.staff,
        requested_starts_at: selectedSlot.starts_at,
        original_starts_at: conflictData.requested_starts_at,
        duration_minutes: conflictData.duration_minutes || 30,
        user_consent: true,
        notes: `Customer accepted alternative slot: ${selectedSlot.time_display} on ${selectedSlot.date_display}`
      });

      if (res.status === 'APPROVED' || res.status === 'RESOLVED') {
        showToast("Appointment successfully rescheduled and confirmed!", "success");
        onResolved(res.appointment);
        onClose();
      } else if (res.status === 'AWAITING_ADMIN_APPROVAL') {
        showToast("Rescheduling request submitted for administrative sign-off. Slot held for 30 minutes.", "info");
        onResolved();
        onClose();
      } else {
        showToast(res.message || "Rescheduling request recorded.", "info");
        onResolved();
        onClose();
      }
    } catch (err: any) {
      if (err.status === 409 && err.data?.detail?.alternatives) {
        showToast("That slot was just booked by another user! We refreshed your alternatives.", "error");
        // Update alternatives live
        conflictData.alternatives = err.data.detail.alternatives;
        setSelectedSlot(null);
        setUserAgreed(false);
      } else {
        showToast(`Rescheduling error: ${err.message}`, "error");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestAdminApproval = async () => {
    if (!selectedSlot) {
      showToast("Please select a slot to request approval for.", "info");
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.submitRescheduling({
        conflict_id: conflictData.conflict_id,
        client_name: (conflictData as any).client_name || "Valued Client",
        client_email: (conflictData as any).client_email || "client@example.org",
        service: selectedSlot.service || conflictData.service,
        staff: selectedSlot.staff,
        requested_starts_at: selectedSlot.starts_at,
        original_starts_at: conflictData.requested_starts_at,
        duration_minutes: conflictData.duration_minutes || 30,
        user_consent: userAgreed,
        notes: "Requested administrative rescheduling approval via Smart Conflict Modal."
      });

      showToast("Administrator approval request submitted! A 30-minute hold has been reserved.", "info");
      onResolved();
      onClose();
    } catch (err: any) {
      showToast(`Request failed: ${err.message}`, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleWaitingListClick = () => {
    onJoinWaitingList(
      (conflictData as any).client_name || "Client",
      (conflictData as any).client_email || "client@example.org",
      conflictData.service,
      conflictData.staff
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-fade-in">
      <div className="glass-panel p-6 sm:p-7 rounded-3xl border border-red-500/30 max-w-xl w-full space-y-5 shadow-2xl bg-gradient-to-b from-navy-900 via-navy-950 to-navy-950 text-slate-100 relative">
        {/* Header with Conflict Status */}
        <div className="flex items-start justify-between pb-3 border-b border-slate-800/80">
          <div className="flex items-center space-x-3">
            <div className="w-11 h-11 rounded-2xl bg-red-500/20 text-red-400 border border-red-500/30 flex items-center justify-center shadow-inner">
              <AlertTriangle className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-xl font-bold text-white tracking-tight">Appointment Slot Unavailable</h3>
                <span className="text-[11px] font-semibold uppercase px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
                  Fully Booked
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                The time you selected has just been booked by another user. Don't worry — we found other available appointments for you.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Conflict Summary Card */}
        <div className="bg-slate-900/60 rounded-xl p-3.5 border border-slate-800 text-xs grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div>
            <span className="text-slate-400 flex items-center gap-1"><Calendar className="w-3.5 h-3.5 text-brand-400" /> Requested Date</span>
            <p className="font-semibold text-slate-200 mt-1">{conflictData.requested_date || "Today"}</p>
          </div>
          <div>
            <span className="text-slate-400 flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-brand-400" /> Requested Time</span>
            <p className="font-semibold text-red-400 mt-1 line-through">{conflictData.requested_time || "Requested Slot"}</p>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <span className="text-slate-400 flex items-center gap-1"><User className="w-3.5 h-3.5 text-brand-400" /> Staff Member</span>
            <p className="font-semibold text-slate-200 mt-1">{conflictData.staff}</p>
          </div>
        </div>

        {/* Top 3 AI-Powered Alternative Slots */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-400" />
              Verified Available Alternatives (Select One)
            </label>
            <span className="text-[11px] text-slate-400">Database Guaranteed Open</span>
          </div>

          {alternatives.length === 0 ? (
            <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800 text-center text-xs text-slate-400">
              No immediate openings found in the next 5 days. We recommend joining the Priority Waiting List below.
            </div>
          ) : (
            <div className="space-y-2">
              {alternatives.map((slot, idx) => {
                const isSelected = selectedSlot?.starts_at === slot.starts_at && selectedSlot?.staff === slot.staff;
                return (
                  <div
                    key={idx}
                    onClick={() => setSelectedSlot(slot)}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                      isSelected
                        ? 'bg-brand-950/60 border-brand-500 shadow-md shadow-brand-500/10'
                        : 'bg-slate-900/40 border-slate-800/80 hover:border-slate-700 hover:bg-slate-900/70'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs transition-colors ${
                        isSelected ? 'bg-brand-500 text-white' : 'bg-slate-800 text-slate-400'
                      }`}>
                        {idx + 1}
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-semibold text-sm text-white">{slot.time_display}</span>
                          <span className="text-xs text-slate-400 font-mono">({slot.date_display})</span>
                          <span className="text-[11px] px-2 py-0.5 rounded-md bg-slate-800 text-brand-300 font-medium">
                            {slot.staff}
                          </span>
                        </div>
                        <p className="text-xs text-emerald-400 flex items-center gap-1 mt-0.5">
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                          {slot.reason}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <span className="text-[11px] font-mono text-slate-400 bg-slate-800/60 px-2 py-1 rounded">
                        Score {slot.score}
                      </span>
                      <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                        isSelected ? 'border-brand-500 bg-brand-500 text-white' : 'border-slate-700'
                      }`}>
                        {isSelected && <Check className="w-3.5 h-3.5" />}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Customer Agreement Checkbox */}
        {selectedSlot && (
          <div className="bg-brand-950/30 border border-brand-500/30 rounded-xl p-3 flex items-start space-x-3 text-xs">
            <input
              type="checkbox"
              id="agreementCheckbox"
              checked={userAgreed}
              onChange={(e) => setUserAgreed(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-slate-700 bg-slate-900 text-brand-500 focus:ring-brand-500 cursor-pointer"
            />
            <label htmlFor="agreementCheckbox" className="text-slate-300 cursor-pointer select-none">
              <span className="font-semibold text-white">Confirmation of Rescheduling:</span>{" "}
              "I agree to reschedule my appointment to the selected time (<strong className="text-brand-300">{selectedSlot.time_display} on {selectedSlot.date_display}</strong> with <strong>{selectedSlot.staff}</strong>)."
            </label>
          </div>
        )}

        {/* Action Buttons */}
        <div className="pt-2 border-t border-slate-800/80 flex flex-col sm:flex-row gap-2.5">
          <button
            onClick={handleConfirmAlternative}
            disabled={!selectedSlot || !userAgreed || submitting}
            className="flex-1 py-2.5 px-4 rounded-xl font-medium text-xs bg-brand-600 hover:bg-brand-500 disabled:opacity-40 disabled:hover:bg-brand-600 text-white transition-all shadow-lg shadow-brand-600/20 flex items-center justify-center gap-1.5"
          >
            <ShieldCheck className="w-4 h-4" />
            {submitting ? "Rescheduling..." : "Confirm Selected Alternative"}
          </button>

          <button
            onClick={handleRequestAdminApproval}
            disabled={!selectedSlot || submitting}
            className="py-2.5 px-3.5 rounded-xl font-medium text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 transition-all border border-slate-700 flex items-center justify-center gap-1"
            title="Submit request for administrator review with a 30-minute hold"
          >
            Request Admin Approval
          </button>

          <button
            onClick={handleWaitingListClick}
            className="py-2.5 px-3.5 rounded-xl font-medium text-xs bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 transition-all flex items-center justify-center gap-1"
          >
            <ListPlus className="w-4 h-4" />
            Join Waiting List
          </button>

          <button
            onClick={onClose}
            className="py-2.5 px-3 rounded-xl font-medium text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 transition-all"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
