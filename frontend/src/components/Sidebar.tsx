import React from 'react';
import {
  LayoutDashboard, Calendar, CalendarCheck2, Sparkles, RefreshCw,
  Users, Bot, Bell, BarChart3, GraduationCap, Settings, ShieldAlert,
  ChevronLeft, ChevronRight, Activity
} from 'lucide-react';

interface SidebarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  waitingCount: number;
  outboxCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  setCurrentTab,
  collapsed,
  setCollapsed,
  waitingCount,
  outboxCount
}) => {
  const navItems = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'calendar', label: 'Smart Calendar', icon: Calendar },
    { id: 'appointments', label: 'Appointments', icon: CalendarCheck2 },
    { id: 'ai-scheduling', label: 'AI Scheduling', icon: Sparkles, badge: 'Smart' },
    { id: 'recovery', label: 'Cancellation Recovery', icon: RefreshCw, highlight: true },
    { id: 'waiting-list', label: 'Waiting List', icon: Users, count: waitingCount },
    { id: 'automation', label: 'Automation Center', icon: Bot, badge: 'UiPath' },
    { id: 'notifications', label: 'Notifications', icon: Bell, count: outboxCount },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'research', label: 'Research Evaluation', icon: GraduationCap, badge: 'Academic' },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <aside
      className={`fixed top-0 left-0 h-screen z-30 transition-all duration-300 flex flex-col justify-between border-r border-slate-800/80 bg-navy-900/90 backdrop-blur-xl ${
        collapsed ? 'w-20' : 'w-72'
      }`}
    >
      {/* Brand Header */}
      <div>
        <div className="h-20 flex items-center justify-between px-5 border-b border-slate-800/80">
          {!collapsed ? (
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-600 via-indigo-500 to-accent-cyan flex items-center justify-center shadow-lg shadow-brand-500/25">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="font-bold text-lg tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
                  SmartSchedule <span className="text-accent-cyan text-sm font-semibold">AI 3.0</span>
                </div>
                <div className="text-[11px] text-slate-400 font-medium tracking-wide">
                  Project 23 · RPA Orchestration
                </div>
              </div>
            </div>
          ) : (
            <div className="mx-auto w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-600 to-accent-cyan flex items-center justify-center shadow-md">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
          )}

          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1.5 rounded-lg hover:bg-slate-800/80 text-slate-400 hover:text-white transition-colors"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* Navigation List */}
        <nav className="p-3 space-y-1.5 overflow-y-auto max-h-[calc(100vh-170px)]">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setCurrentTab(item.id)}
                className={`w-full flex items-center relative rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all duration-200 group ${
                  isActive
                    ? 'bg-gradient-to-r from-brand-600/30 to-indigo-600/10 text-white border border-brand-500/40 shadow-sm shadow-brand-500/10'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/50 border border-transparent'
                }`}
              >
                {isActive && (
                  <div className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-accent-cyan rounded-r-full" />
                )}
                <Icon
                  className={`w-5 h-5 flex-shrink-0 transition-transform duration-200 group-hover:scale-110 ${
                    isActive ? 'text-accent-cyan' : 'text-slate-400 group-hover:text-slate-200'
                  }`}
                />
                {!collapsed && (
                  <span className="ml-3.5 flex-1 text-left truncate tracking-tight">{item.label}</span>
                )}
                {!collapsed && item.badge && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-brand-500/20 text-brand-300 border border-brand-500/30">
                    {item.badge}
                  </span>
                )}
                {!collapsed && typeof item.count === 'number' && item.count > 0 && (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-accent-cyan/20 text-accent-cyan border border-accent-cyan/30">
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* System Status Footer */}
      <div className="p-4 border-t border-slate-800/80 bg-slate-950/40">
        {!collapsed ? (
          <div className="flex items-center space-x-3">
            <div className="w-2.5 h-2.5 rounded-full bg-accent-emerald animate-pulse" />
            <div className="text-xs">
              <div className="text-slate-200 font-medium">Orchestration Active</div>
              <div className="text-slate-500 text-[11px]">UiPath & ML Engine Ready</div>
            </div>
          </div>
        ) : (
          <div className="w-2.5 h-2.5 mx-auto rounded-full bg-accent-emerald animate-pulse" />
        )}
      </div>
    </aside>
  );
};
