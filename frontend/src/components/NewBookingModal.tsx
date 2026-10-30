import React, { useState, useEffect } from 'react';
import { X, Calendar, Clock, User, Mail, ShieldAlert, Sparkles, CheckCircle } from 'lucide-react';
import { api } from '../api';

interface NewBookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  initialSlot?: any;
  onConflictDetected?: (conflictData: any) => void;
}

export const NewBookingModal: React.FC<NewBookingModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  showToast,
  initialSlot,
  onConflictDetected
}) => {
  const [client, setClient] = useState('');
  const [email, setEmail] = useState('');
  const [service, setService] = useState('Consultation');
  const [staff, setStaff] = useState('Staff A');
  const [startsAt, setStartsAt] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    d.setHours(10, 0, 0, 0);
    return d.toISOString().slice(0, 16);
  });
  const [duration, setDuration] = useState(30);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [services, setServices] = useState<any[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);

  useEffect(() => {
    if (isOpen) {
      Promise.all([api.getServices(), api.getStaff()])
        .then(([srvs, stfs]) => {
          setServices(srvs);
          setStaffList(stfs);
          if (srvs.length > 0 && !initialSlot) setService(srvs[0].name);
          if (stfs.length > 0 && !initialSlot) setStaff(stfs[0].name);
        })
        .catch(() => {});

      if (initialSlot) {
        setService(initialSlot.service || 'Consultation');
        setStaff(initialSlot.staff || 'Staff A');
        if (initialSlot.starts_at) {
          try {
            const dt = new Date(initialSlot.starts_at);
            // Local ISO string for input
            const localStr = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
            setStartsAt(localStr);
          } catch {}
        }
      }
    }
  }, [isOpen, initialSlot]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const startIso = new Date(startsAt).toISOString();
      const res = await api.createAppointment({
        client: client.trim(),
        email: email.trim(),
        service,
        staff,
        starts_at: startIso,
        duration_minutes: Number(duration),
        notes: notes.trim()
      });

      if (res.duplicate) {
        showToast("Existing duplicate booking identified. Retained existing record.", "info");
      } else {
        showToast(`Appointment booked successfully! AI risk classified as ${res.appointment.risk_tier || 'Low'}.`, "success");
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      if (err.status === 409 && onConflictDetected && err.data?.detail && typeof err.data.detail === 'object') {
        onConflictDetected({
          ...err.data.detail,
          client_name: client.trim(),
          client_email: email.trim(),
          service,
          staff
        });
        onClose();
        return;
      }
      showToast(`Booking conflict or error: ${err.message}`, "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="glass-panel p-6 rounded-2xl border border-slate-700 max-w-lg w-full space-y-4 shadow-2xl">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-brand-600/20 text-brand-400 flex items-center justify-center">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Create New Appointment</h2>
              <div className="text-[11px] text-slate-400">Strict conflict prevention & automated reminder queue</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-medium mb-1">Client Full Name</label>
              <input
                type="text"
                required
                placeholder="e.g. Maya Patel"
                value={client}
                onChange={(e) => setClient(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-brand-500"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-medium mb-1">Client Email Address</label>
              <input
                type="email"
                required
                placeholder="maya.patel@example.org"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-brand-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-medium mb-1">Service Type</label>
              <select
                value={service}
                onChange={(e) => setService(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-brand-500"
              >
                {services.map(s => <option key={s.id} value={s.name}>{s.name} ({s.duration_minutes} min)</option>)}
              </select>
            </div>
            <div>
              <label className="block text-slate-300 font-medium mb-1">Assigned Staff Member</label>
              <select
                value={staff}
                onChange={(e) => setStaff(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-brand-500"
              >
                {staffList.map(st => <option key={st.id} value={st.name}>{st.name} ({st.department})</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-medium mb-1">Start Date & Time (Future)</label>
              <input
                type="datetime-local"
                required
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-brand-500"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-medium mb-1">Duration (Minutes)</label>
              <select
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-brand-500"
              >
                <option value={15}>15 Minutes</option>
                <option value={30}>30 Minutes</option>
                <option value={45}>45 Minutes</option>
                <option value={60}>60 Minutes</option>
                <option value={90}>90 Minutes</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">Appointment Notes (Optional)</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add academic or session notes..."
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-brand-500"
            />
          </div>

          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-[11px] text-slate-400">
            ℹ️ Enqueues 24-hour and 1-hour automated reminders and calculates an AI no-show risk score upon creation.
          </div>

          <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-semibold shadow-md flex items-center space-x-1.5"
            >
              {submitting ? 'Validating Slot...' : 'Confirm Appointment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
