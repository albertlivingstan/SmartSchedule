import React, { useState, useEffect } from 'react';
import {
  Sparkles, Sliders, Calendar, Clock, User, CheckCircle2,
  Award, ArrowRight, Zap, Info
} from 'lucide-react';
import { RecommendedSlot } from '../types';
import { api } from '../api';

interface AISchedulingViewProps {
  onBookSlot: (slot: RecommendedSlot) => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const AISchedulingView: React.FC<AISchedulingViewProps> = ({
  onBookSlot,
  showToast
}) => {
  const [services, setServices] = useState<any[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [selectedService, setSelectedService] = useState('Consultation');
  const [selectedStaff, setSelectedStaff] = useState('Any');
  const [targetDate, setTargetDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [preferredTime, setPreferredTime] = useState('10:00');
  const [loading, setLoading] = useState(false);
  const [recommendations, setRecommendations] = useState<RecommendedSlot[]>([]);
  const [totalAvailable, setTotalAvailable] = useState(0);

  useEffect(() => {
    Promise.all([api.getServices(), api.getStaff()])
      .then(([srvs, stfs]) => {
        setServices(srvs);
        setStaffList(stfs);
      })
      .catch(() => {});
  }, []);

  const handleCalculateSlots = async () => {
    setLoading(true);
    try {
      const res = await api.recommendSlots({
        service_name: selectedService,
        staff_preference: selectedStaff,
        target_date: targetDate,
        preferred_time: preferredTime
      });
      setRecommendations(res.recommended_slots);
      setTotalAvailable(res.total_available_slots);
      if (res.recommended_slots.length === 0) {
        showToast("No available slots found for chosen constraints.", "info");
      } else {
        showToast(`Discovered ${res.total_available_slots} slots! Top 5 ranked with explainable scores.`, "success");
      }
    } catch (err: any) {
      showToast(`Recommendation error: ${err.message}`, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header Banner */}
      <div className="glass-panel p-8 rounded-2xl border border-brand-500/20 bg-gradient-to-r from-navy-900 via-indigo-950/40 to-navy-900">
        <div className="max-w-3xl">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-brand-500/10 border border-brand-500/30 text-accent-cyan text-xs font-semibold mb-3">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Deterministic Weighted Scoring Algorithm</span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Intelligent Slot Ranking & Constraint Engine
          </h1>
          <p className="mt-2 text-xs text-slate-300 leading-relaxed">
            Evaluates staff working hours, scheduled commitments, buffer gaps, and user preference proximity
            to rank the top 5 optimal booking intervals with complete mathematical transparency.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Input Parameters Panel */}
        <div className="glass-panel p-6 rounded-2xl border border-slate-800/80 space-y-5">
          <div className="flex items-center space-x-2 pb-3 border-b border-slate-800/80">
            <Sliders className="w-4 h-4 text-accent-cyan" />
            <h2 className="text-sm font-semibold text-white uppercase tracking-wider">Scheduling Parameters</h2>
          </div>

          {/* Service Selector */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Service Type</label>
            <select
              value={selectedService}
              onChange={(e) => setSelectedService(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-brand-500"
            >
              {services.map(s => <option key={s.id} value={s.name}>{s.name} ({s.duration_minutes} min)</option>)}
            </select>
          </div>

          {/* Staff Preference */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Staff Member Preference</label>
            <select
              value={selectedStaff}
              onChange={(e) => setSelectedStaff(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-brand-500"
            >
              <option value="Any">Any Available Staff Member</option>
              {staffList.map(st => <option key={st.id} value={st.name}>{st.name} ({st.department})</option>)}
            </select>
          </div>

          {/* Target Date */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Preferred Target Date</label>
            <input
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-brand-500"
            />
          </div>

          {/* Preferred Time Window */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Ideal Time (Proximity Anchor)</label>
            <input
              type="time"
              value={preferredTime}
              onChange={(e) => setPreferredTime(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-brand-500"
            />
          </div>

          {/* Scoring Weight Badges */}
          <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2 text-[11px]">
            <div className="font-semibold text-slate-300 flex items-center space-x-1.5">
              <Info className="w-3.5 h-3.5 text-brand-400" />
              <span>Configured Weight Formula</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Time Proximity:</span>
              <span className="font-mono text-accent-cyan">40%</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Staff Workload Balance:</span>
              <span className="font-mono text-accent-cyan">30%</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Buffer Continuity:</span>
              <span className="font-mono text-accent-cyan">20%</span>
            </div>
          </div>

          {/* Action Button */}
          <button
            onClick={handleCalculateSlots}
            disabled={loading}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-lg shadow-brand-500/20 transition-all flex items-center justify-center space-x-2"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{loading ? 'Evaluating Slots...' : 'Compute Optimal Slots'}</span>
          </button>
        </div>

        {/* Results Panel */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between pb-1">
            <h2 className="text-base font-semibold text-white tracking-tight">
              Top Ranked Available Intervals
            </h2>
            {totalAvailable > 0 && (
              <span className="text-xs text-slate-400">
                Found <b className="text-accent-cyan">{totalAvailable}</b> conflict-free candidate slots
              </span>
            )}
          </div>

          {recommendations.length === 0 ? (
            <div className="glass-panel p-12 rounded-2xl border border-slate-800/80 text-center space-y-3">
              <Clock className="w-8 h-8 text-slate-600 mx-auto" />
              <div className="text-sm font-semibold text-slate-300">Ready to compute slots</div>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Configure your service, staff preference, and target date, then click "Compute Optimal Slots" to see ranked alternatives.
              </p>
            </div>
          ) : (
            <div className="space-y-3.5">
              {recommendations.map((slot, index) => {
                const sDate = new Date(slot.starts_at);
                const eDate = new Date(slot.ends_at);
                return (
                  <div
                    key={index}
                    className="glass-panel glass-panel-hover p-5 rounded-2xl border border-slate-800/80 relative overflow-hidden"
                  >
                    {/* Rank Badge */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div
                          className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs ${
                            index === 0
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                              : 'bg-slate-800 text-slate-300 border border-slate-700'
                          }`}
                        >
                          #{index + 1}
                        </div>
                        <div>
                          <div className="text-sm font-bold text-white">
                            {sDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · {sDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – {eDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                          <div className="text-xs text-slate-400">
                            Staff: <b className="text-slate-200">{slot.staff}</b> · Service: {slot.service}
                          </div>
                        </div>
                      </div>

                      {/* Score Badge */}
                      <div className="text-right">
                        <div className="text-xl font-extrabold text-accent-cyan tracking-tight">
                          {slot.score} <span className="text-xs text-slate-400 font-normal">/ 100</span>
                        </div>
                        <div className="text-[10px] text-slate-500 font-medium">Rank Score</div>
                      </div>
                    </div>

                    {/* Breakdown bars */}
                    <div className="grid grid-cols-3 gap-3 my-3 pt-3 border-t border-slate-800/60 text-[11px]">
                      <div>
                        <div className="text-slate-400 flex justify-between">
                          <span>Proximity</span>
                          <span className="font-semibold text-slate-200">{slot.breakdown.preference_proximity}%</span>
                        </div>
                        <div className="h-1.5 bg-slate-800 rounded-full mt-1 overflow-hidden">
                          <div className="h-full bg-brand-500 rounded-full" style={{ width: `${slot.breakdown.preference_proximity}%` }} />
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-400 flex justify-between">
                          <span>Workload</span>
                          <span className="font-semibold text-slate-200">{slot.breakdown.workload_balance}%</span>
                        </div>
                        <div className="h-1.5 bg-slate-800 rounded-full mt-1 overflow-hidden">
                          <div className="h-full bg-accent-cyan rounded-full" style={{ width: `${slot.breakdown.workload_balance}%` }} />
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-400 flex justify-between">
                          <span>Continuity</span>
                          <span className="font-semibold text-slate-200">{slot.breakdown.buffer_efficiency}%</span>
                        </div>
                        <div className="h-1.5 bg-slate-800 rounded-full mt-1 overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${slot.breakdown.buffer_efficiency}%` }} />
                        </div>
                      </div>
                    </div>

                    {/* Rationale & Book CTA */}
                    <div className="flex items-center justify-between pt-2">
                      <div className="text-xs text-slate-400 italic">
                        "{slot.reason}"
                      </div>
                      <button
                        onClick={() => onBookSlot(slot)}
                        className="px-3.5 py-1.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold shadow-md flex items-center space-x-1.5 transition-all"
                      >
                        <span>Select Slot</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
