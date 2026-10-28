import React, { useState, useEffect } from 'react';
import { Users, Plus, X, Search, Clock, ShieldCheck, UserCheck, Trash2 } from 'lucide-react';
import { WaitingListEntry } from '../types';
import { api } from '../api';

interface WaitingListViewProps {
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  onRefreshStats: () => void;
}

export const WaitingListView: React.FC<WaitingListViewProps> = ({
  showToast,
  onRefreshStats
}) => {
  const [entries, setEntries] = useState<WaitingListEntry[]>([]);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [services, setServices] = useState<any[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);

  // Form state
  const [client, setClient] = useState('');
  const [email, setEmail] = useState('');
  const [service, setService] = useState('Consultation');
  const [staffPref, setStaffPref] = useState('Any');
  const [preferredStart, setPreferredStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 16);
  });
  const [preferredEnd, setPreferredEnd] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 5);
    return d.toISOString().slice(0, 16);
  });
  const [urgency, setUrgency] = useState(3.0);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchEntries = async () => {
    try {
      const data = await api.getWaitingList();
      setEntries(data);
    } catch {}
  };

  useEffect(() => {
    fetchEntries();
    Promise.all([api.getServices(), api.getStaff()])
      .then(([srvs, stfs]) => {
        setServices(srvs);
        setStaffList(stfs);
      })
      .catch(() => {});
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.addToWaitingList({
        client,
        email,
        service,
        staff_preference: staffPref,
        preferred_start: new Date(preferredStart).toISOString(),
        preferred_end: new Date(preferredEnd).toISOString(),
        urgency_score: urgency,
        notes
      });
      showToast("Added to Waiting List! Eligible for autonomous slot recovery.", "success");
      setIsModalOpen(false);
      // Reset form
      setClient('');
      setEmail('');
      setNotes('');
      fetchEntries();
      onRefreshStats();
    } catch (err: any) {
      showToast(`Error: ${err.message}`, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelEntry = async (id: number) => {
    try {
      await api.cancelWaitingList(id);
      showToast("Waiting list entry cancelled.", "info");
      fetchEntries();
      onRefreshStats();
    } catch (err: any) {
      showToast(`Cancel error: ${err.message}`, "error");
    }
  };

  const filtered = entries.filter(e => {
    if (filter !== 'all' && e.status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      const combined = `${e.client} ${e.email} ${e.service} ${e.staff_preference} ${e.notes}`.toLowerCase();
      if (!combined.includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 glass-panel p-6 rounded-2xl border border-slate-800/80">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Smart Waiting List Registry</h1>
          <p className="text-xs text-slate-400">Queue of clients awaiting earlier or alternative appointment slots</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search waitlist..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-slate-900 border border-slate-700/80 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 w-52"
            />
          </div>

          {/* Filter */}
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none"
          >
            <option value="all">All Entries</option>
            <option value="waiting">Waiting (Active)</option>
            <option value="offered">Offered</option>
            <option value="matched">Matched</option>
            <option value="cancelled">Cancelled</option>
          </select>

          {/* Join CTA */}
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center space-x-1.5 bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-md transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Join Waiting List</span>
          </button>
        </div>
      </div>

      {/* Waiting List Table */}
      <div className="glass-panel rounded-2xl border border-slate-800/80 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/80 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-3.5 px-6">Candidate / Contact</th>
                <th className="py-3.5 px-4">Requested Service & Staff</th>
                <th className="py-3.5 px-4">Acceptable Date Window</th>
                <th className="py-3.5 px-4">Urgency Score</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    No waiting list entries found. Click "+ Join Waiting List" to add one!
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-900/40">
                    <td className="py-4 px-6">
                      <div className="font-semibold text-white">{item.client}</div>
                      <div className="text-[11px] text-slate-400 font-mono">{item.email}</div>
                    </td>
                    <td className="py-4 px-4">
                      <div className="font-medium text-slate-200">{item.service}</div>
                      <div className="text-[11px] text-slate-400">Pref: {item.staff_preference}</div>
                    </td>
                    <td className="py-4 px-4">
                      <div className="text-slate-200">
                        {new Date(item.preferred_start).toLocaleDateString()} – {new Date(item.preferred_end).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <span className="font-bold text-accent-cyan px-2 py-0.5 rounded bg-accent-cyan/10 border border-accent-cyan/20">
                        P{item.urgency_score}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <span
                        className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                          item.status === 'matched'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : item.status === 'offered'
                            ? 'bg-amber-500/20 text-amber-300 animate-pulse'
                            : item.status === 'cancelled'
                            ? 'bg-slate-800 text-slate-500'
                            : 'bg-brand-500/20 text-brand-300'
                        }`}
                      >
                        {item.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-right">
                      {item.status === 'waiting' && (
                        <button
                          onClick={() => handleCancelEntry(item.id)}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-400 transition-colors"
                          title="Remove from Waiting List"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Join Waiting List Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel p-6 rounded-2xl border border-slate-700 max-w-md w-full space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h2 className="text-base font-bold text-white">Join Waiting List</h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={client}
                  onChange={(e) => setClient(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-brand-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Service</label>
                  <select
                    value={service}
                    onChange={(e) => setService(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-brand-500"
                  >
                    {services.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Staff Preference</label>
                  <select
                    value={staffPref}
                    onChange={(e) => setStaffPref(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-brand-500"
                  >
                    <option value="Any">Any Staff</option>
                    {staffList.map(st => <option key={st.id} value={st.name}>{st.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Available From</label>
                  <input
                    type="datetime-local"
                    required
                    value={preferredStart}
                    onChange={(e) => setPreferredStart(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Available Until</label>
                  <input
                    type="datetime-local"
                    required
                    value={preferredEnd}
                    onChange={(e) => setPreferredEnd(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-slate-300 font-medium mb-1">
                  <span>Urgency Priority (1 to 5)</span>
                  <span className="font-bold text-accent-cyan">{urgency}</span>
                </div>
                <input
                  type="range"
                  min="1.0"
                  max="5.0"
                  step="0.5"
                  value={urgency}
                  onChange={(e) => setUrgency(parseFloat(e.target.value))}
                  className="w-full accent-brand-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Notes / Preferences</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Prefer mornings before 12 PM"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-brand-500"
                />
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-semibold shadow-md"
                >
                  {submitting ? 'Adding...' : 'Join Queue'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
