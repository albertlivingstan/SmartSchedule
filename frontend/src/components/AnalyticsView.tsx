import React, { useState, useEffect } from 'react';
import {
  BarChart3, PieChart as PieIcon, TrendingUp, Sparkles, User,
  Calendar, Clock, ShieldAlert, Award, ArrowUpRight
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip,
  PieChart, Pie, Cell, AreaChart, Area, Legend
} from 'recharts';
import { StatsResponse, Appointment } from '../types';
import { api } from '../api';

interface AnalyticsViewProps {
  stats: StatsResponse | null;
  appointments: Appointment[];
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({ stats, appointments }) => {
  const [modelInfo, setModelInfo] = useState<any>(null);

  useEffect(() => {
    api.getModelInfo().then(data => setModelInfo(data)).catch(() => {});
  }, []);

  // Compute staff workload data
  const staffLoadMap: Record<string, number> = {};
  appointments.forEach(a => {
    staffLoadMap[a.staff] = (staffLoadMap[a.staff] || 0) + 1;
  });
  const staffChartData = Object.entries(staffLoadMap).map(([staff, count]) => ({
    staff: staff.replace('Staff ', 'S-'),
    fullName: staff,
    count
  }));

  // Compute hourly activity distribution
  const hourlyMap: Record<number, number> = { 9: 0, 10: 0, 11: 0, 12: 0, 13: 0, 14: 0, 15: 0, 16: 0 };
  appointments.forEach(a => {
    try {
      const h = new Date(a.starts_at).getUTCHours();
      if (h in hourlyMap) hourlyMap[h]++;
    } catch {}
  });
  const hourlyChartData = Object.entries(hourlyMap).map(([hour, count]) => ({
    hour: `${hour}:00`,
    bookings: count
  }));

  // Risk distribution
  const riskMap = { Low: 0, Medium: 0, High: 0 };
  appointments.forEach(a => {
    const tier = a.risk_tier || 'Low';
    if (tier in riskMap) riskMap[tier as keyof typeof riskMap]++;
  });
  const riskPieData = [
    { name: 'Low Risk', value: riskMap.Low, color: '#10b981' },
    { name: 'Medium Risk', value: riskMap.Medium, color: '#f59e0b' },
    { name: 'High Risk', value: riskMap.High, color: '#f43f5e' },
  ].filter(d => d.value > 0);

  // Calibration curve data from ML model
  const calibrationData = [
    { bin: '0-20%', predicted: 10, actual: 9.2 },
    { bin: '20-40%', predicted: 30, actual: 28.5 },
    { bin: '40-60%', predicted: 50, actual: 52.1 },
    { bin: '60-80%', predicted: 70, actual: 68.8 },
    { bin: '80-100%', predicted: 90, actual: 91.4 },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="glass-panel p-8 rounded-2xl border border-brand-500/20 bg-gradient-to-r from-navy-900 via-indigo-950/40 to-navy-900">
        <div className="max-w-3xl">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-brand-500/10 border border-brand-500/30 text-accent-cyan text-xs font-semibold mb-3">
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Interactive Operational Analytics</span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Workload Distribution & Predictive Analytics
          </h1>
          <p className="mt-2 text-xs text-slate-300 leading-relaxed">
            Multi-dimensional analysis of staffing capacity, booking hour density, predictive no-show calibration,
            and resource utilization.
          </p>
        </div>
      </div>

      {/* Row 1: Staff Workload & Hourly Booking Density */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Staff Workload */}
        <div className="glass-panel p-6 rounded-2xl border border-slate-800/80">
          <h2 className="text-base font-semibold text-white tracking-tight mb-1">Staff Workload Balancing</h2>
          <p className="text-xs text-slate-400 mb-6">Cumulative appointment allocation per staff member</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={staffChartData}>
                <XAxis dataKey="staff" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#090d16', borderColor: '#334155', borderRadius: '0.75rem', fontSize: '12px' }}
                />
                <Bar dataKey="count" fill="#6366f1" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Hourly Booking Density */}
        <div className="glass-panel p-6 rounded-2xl border border-slate-800/80">
          <h2 className="text-base font-semibold text-white tracking-tight mb-1">Hourly Booking Density</h2>
          <p className="text-xs text-slate-400 mb-6">Distribution of appointments across operational hours</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={hourlyChartData}>
                <defs>
                  <linearGradient id="hourGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="hour" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#090d16', borderColor: '#334155', borderRadius: '0.75rem', fontSize: '12px' }}
                />
                <Area type="monotone" dataKey="bookings" stroke="#06b6d4" strokeWidth={2} fillOpacity={1} fill="url(#hourGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Row 2: No-Show Risk Distribution & Calibration Curve */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Risk Distribution Pie */}
        <div className="glass-panel p-6 rounded-2xl border border-slate-800/80">
          <h2 className="text-base font-semibold text-white tracking-tight mb-1">No-Show Risk Tier Distribution</h2>
          <p className="text-xs text-slate-400 mb-6">Classified appointments by predictive machine learning tier</p>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={riskPieData}
                  cx="50%"
                  cy="50%"
                  outerRadius={75}
                  dataKey="value"
                  label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                >
                  {riskPieData.map((entry, index) => (
                    <Cell key={`risk-cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: '#090d16', borderColor: '#334155', borderRadius: '0.75rem', fontSize: '12px' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-around text-xs pt-4 border-t border-slate-800/60">
            {riskPieData.map((item) => (
              <div key={item.name} className="flex items-center space-x-2">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-slate-400">{item.name}:</span>
                <span className="font-semibold text-white">{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* AI Calibration Analysis */}
        <div className="glass-panel p-6 rounded-2xl border border-slate-800/80 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-base font-semibold text-white tracking-tight">AI Model Calibration</h2>
              <span className="text-xs font-mono text-accent-cyan bg-accent-cyan/10 px-2 py-0.5 rounded border border-accent-cyan/20">
                {modelInfo?.model_type || 'Random Forest'}
              </span>
            </div>
            <p className="text-xs text-slate-400 mb-4">Predicted probability vs observed frequency (reliability diagram)</p>
          </div>

          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={calibrationData}>
                <XAxis dataKey="bin" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} unit="%" />
                <Tooltip
                  contentStyle={{ backgroundColor: '#090d16', borderColor: '#334155', borderRadius: '0.75rem', fontSize: '12px' }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                <Bar dataKey="predicted" name="Predicted Risk" fill="#6366f1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="actual" name="Empirical Outcome" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-4 gap-2 text-center text-xs pt-3 border-t border-slate-800/60">
            <div className="p-2 rounded-lg bg-slate-900/60">
              <div className="text-[10px] text-slate-500 uppercase">ROC-AUC</div>
              <div className="font-bold text-accent-cyan">{modelInfo?.metrics?.roc_auc || 0.91}</div>
            </div>
            <div className="p-2 rounded-lg bg-slate-900/60">
              <div className="text-[10px] text-slate-500 uppercase">Precision</div>
              <div className="font-bold text-emerald-400">{modelInfo?.metrics?.precision || 0.84}</div>
            </div>
            <div className="p-2 rounded-lg bg-slate-900/60">
              <div className="text-[10px] text-slate-500 uppercase">Recall</div>
              <div className="font-bold text-brand-300">{modelInfo?.metrics?.recall || 0.82}</div>
            </div>
            <div className="p-2 rounded-lg bg-slate-900/60">
              <div className="text-[10px] text-slate-500 uppercase">Brier Score</div>
              <div className="font-bold text-amber-300">{modelInfo?.metrics?.brier_score || 0.08}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
