import React, { useState } from 'react';
import {
  ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock,
  User, CheckCircle, XCircle, AlertCircle, Sparkles, Filter
} from 'lucide-react';
import { Appointment } from '../types';

interface SmartCalendarViewProps {
  appointments: Appointment[];
  onOpenNewBooking: () => void;
  onSelectAppointment: (appt: Appointment) => void;
}

export const SmartCalendarView: React.FC<SmartCalendarViewProps> = ({
  appointments,
  onOpenNewBooking,
  onSelectAppointment
}) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedStaff, setSelectedStaff] = useState('All');
  const [selectedStatus, setSelectedStatus] = useState('All');

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // First day of month and number of days
  const firstDayIndex = new Date(year, month, 1).getDay(); // 0 is Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };
  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const staffList = ['All', ...Array.from(new Set(appointments.map(a => a.staff)))];

  // Filter appointments
  const filteredAppointments = appointments.filter(a => {
    if (selectedStaff !== 'All' && a.staff !== selectedStaff) return false;
    if (selectedStatus !== 'All' && a.status !== selectedStatus) return false;
    return true;
  });

  // Map appointments by day number
  const apptsByDay: Record<number, Appointment[]> = {};
  filteredAppointments.forEach(a => {
    try {
      const dt = new Date(a.starts_at);
      if (dt.getFullYear() === year && dt.getMonth() === month) {
        const dayNum = dt.getDate();
        if (!apptsByDay[dayNum]) apptsByDay[dayNum] = [];
        apptsByDay[dayNum].push(a);
      }
    } catch {}
  });

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Calendar Header Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 glass-panel p-6 rounded-2xl border border-slate-800/80">
        <div className="flex items-center space-x-4">
          <div className="p-3 rounded-xl bg-brand-600/20 text-brand-400 border border-brand-500/30">
            <CalendarIcon className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">Smart Calendar Command</h1>
            <p className="text-xs text-slate-400">Interactive slot inspector and conflict visualization</p>
          </div>
        </div>

        {/* Filters & Month Stepper */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Staff Filter */}
          <div className="flex items-center space-x-1.5 bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-1.5 text-xs">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedStaff}
              onChange={(e) => setSelectedStaff(e.target.value)}
              className="bg-transparent text-slate-200 focus:outline-none"
            >
              {staffList.map(s => <option key={s} value={s} className="bg-slate-900">{s === 'All' ? 'All Staff' : s}</option>)}
            </select>
          </div>

          {/* Month Stepper */}
          <div className="flex items-center space-x-2 bg-slate-900 border border-slate-700/80 rounded-xl p-1">
            <button
              onClick={prevMonth}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-semibold px-3 text-white min-w-28 text-center">
              {monthNames[month]} {year}
            </span>
            <button
              onClick={nextMonth}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={onOpenNewBooking}
            className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold shadow-md transition-all"
          >
            + Book Slot
          </button>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="glass-panel p-6 rounded-2xl border border-slate-800/80">
        {/* Days of week header */}
        <div className="grid grid-cols-7 gap-2 text-center text-xs font-semibold text-slate-400 pb-3 border-b border-slate-800/80 uppercase tracking-wider">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} className="py-1">{day}</div>
          ))}
        </div>

        {/* Days grid */}
        <div className="grid grid-cols-7 gap-2 pt-3">
          {/* Empty cells before month start */}
          {Array.from({ length: firstDayIndex }).map((_, i) => (
            <div key={`empty-${i}`} className="min-h-28 rounded-xl p-2 bg-slate-950/20 border border-dashed border-slate-900/60" />
          ))}

          {/* Days of month */}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const dayNum = i + 1;
            const dayAppts = apptsByDay[dayNum] || [];
            const isToday =
              dayNum === new Date().getDate() &&
              month === new Date().getMonth() &&
              year === new Date().getFullYear();

            return (
              <div
                key={`day-${dayNum}`}
                className={`min-h-28 rounded-xl p-2 flex flex-col justify-between border transition-all ${
                  isToday
                    ? 'border-brand-500/60 bg-brand-950/20'
                    : 'border-slate-800/60 bg-slate-900/40 hover:border-slate-700/80'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center ${
                      isToday ? 'bg-brand-500 text-white' : 'text-slate-300'
                    }`}
                  >
                    {dayNum}
                  </span>
                  {dayAppts.length > 0 && (
                    <span className="text-[10px] font-semibold text-slate-400 px-1.5 py-0.5 rounded bg-slate-800">
                      {dayAppts.length}
                    </span>
                  )}
                </div>

                {/* Day Appointment Badges */}
                <div className="space-y-1 my-1 overflow-y-auto max-h-20">
                  {dayAppts.slice(0, 3).map(a => (
                    <div
                      key={a.id}
                      onClick={() => onSelectAppointment(a)}
                      className={`text-[11px] truncate px-2 py-1 rounded-lg cursor-pointer transition-transform hover:scale-[1.02] border font-medium ${
                        a.status === 'scheduled'
                          ? 'bg-brand-600/20 border-brand-500/30 text-brand-300'
                          : a.status === 'completed'
                          ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300'
                          : a.status === 'cancelled'
                          ? 'bg-rose-500/20 border-rose-500/30 text-rose-300'
                          : 'bg-amber-500/20 border-amber-500/30 text-amber-300'
                      }`}
                      title={`${a.client} (${a.service} with ${a.staff})`}
                    >
                      {new Date(a.starts_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {a.client.split(' ')[0]}
                    </div>
                  ))}
                  {dayAppts.length > 3 && (
                    <div className="text-[10px] text-slate-500 text-center font-medium">
                      +{dayAppts.length - 3} more
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
