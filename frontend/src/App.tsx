import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { OverviewView } from './components/OverviewView';
import { SmartCalendarView } from './components/SmartCalendarView';
import { AppointmentsView } from './components/AppointmentsView';
import { AISchedulingView } from './components/AISchedulingView';
import { CancellationRecoveryView } from './components/CancellationRecoveryView';
import { WaitingListView } from './components/WaitingListView';
import { AutomationCenterView } from './components/AutomationCenterView';
import { NotificationsView } from './components/NotificationsView';
import { AnalyticsView } from './components/AnalyticsView';
import { ResearchEvaluationView } from './components/ResearchEvaluationView';
import { SettingsView } from './components/SettingsView';
import { NewBookingModal } from './components/NewBookingModal';
import { AppointmentDetailModal } from './components/AppointmentDetailModal';
import { Appointment, StatsResponse, RecommendedSlot } from './types';
import { api } from './api';

export function App() {
  const [currentTab, setCurrentTab] = useState('overview');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [waitingCount, setWaitingCount] = useState(0);
  const [outboxCount, setOutboxCount] = useState(0);

  // Modals state
  const [isNewBookingOpen, setIsNewBookingOpen] = useState(false);
  const [selectedSlotForBooking, setSelectedSlotForBooking] = useState<any>(null);
  const [inspectingAppointment, setInspectingAppointment] = useState<Appointment | null>(null);

  // Toast state
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ msg, type });
    setTimeout(() => {
      setToast(null);
    }, 4500);
  };

  const refreshData = async () => {
    try {
      const [sData, aData, wData, oData] = await Promise.all([
        api.getStats().catch(() => null),
        api.getAppointments().catch(() => []),
        api.getWaitingList('waiting').catch(() => []),
        api.getOutbox().catch(() => [])
      ]);
      if (sData) setStats(sData);
      setAppointments(aData);
      setWaitingCount(wData.length);
      setOutboxCount(oData.filter((i: any) => i.status === 'pending').length);
    } catch (err: any) {
      console.error("Refresh error:", err);
    }
  };

  useEffect(() => {
    refreshData();
  }, []);

  const handleBookFromSlot = (slot: RecommendedSlot) => {
    setSelectedSlotForBooking(slot);
    setIsNewBookingOpen(true);
  };

  const handleOpenGeneralBooking = () => {
    setSelectedSlotForBooking(null);
    setIsNewBookingOpen(true);
  };

  const handleTriggerWorker = async () => {
    try {
      const res = await api.processOutboxTick();
      showToast(`Outbox batch executed: ${res.counts.outbox} processed`, "success");
      refreshData();
    } catch (err: any) {
      showToast(`Worker error: ${err.message}`, "error");
    }
  };

  return (
    <div className="min-h-screen bg-navy-950 flex text-slate-100">
      {/* Sidebar */}
      <Sidebar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        collapsed={sidebarCollapsed}
        setCollapsed={setSidebarCollapsed}
        waitingCount={waitingCount}
        outboxCount={outboxCount}
      />

      {/* Main Content Area */}
      <div
        className={`flex-1 flex flex-col min-h-screen transition-all duration-300 ${
          sidebarCollapsed ? 'ml-20' : 'ml-72'
        }`}
      >
        <Header
          onOpenNewBooking={handleOpenGeneralBooking}
          onRefresh={refreshData}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          showToast={showToast}
        />

        <main className="flex-1 p-8 overflow-y-auto max-w-7xl w-full mx-auto">
          {currentTab === 'overview' && (
            <OverviewView
              stats={stats}
              recentAppointments={appointments}
              onNavigateTab={setCurrentTab}
              onOpenNewBooking={handleOpenGeneralBooking}
              onTriggerWorker={handleTriggerWorker}
            />
          )}

          {currentTab === 'calendar' && (
            <SmartCalendarView
              appointments={appointments}
              onOpenNewBooking={handleOpenGeneralBooking}
              onSelectAppointment={setInspectingAppointment}
            />
          )}

          {currentTab === 'appointments' && (
            <AppointmentsView
              appointments={appointments}
              onRefresh={refreshData}
              onSelectAppointment={setInspectingAppointment}
              showToast={showToast}
            />
          )}

          {currentTab === 'ai-scheduling' && (
            <AISchedulingView
              onBookSlot={handleBookFromSlot}
              showToast={showToast}
            />
          )}

          {currentTab === 'recovery' && (
            <CancellationRecoveryView
              appointments={appointments}
              onRefresh={refreshData}
              showToast={showToast}
            />
          )}

          {currentTab === 'waiting-list' && (
            <WaitingListView
              showToast={showToast}
              onRefreshStats={refreshData}
            />
          )}

          {currentTab === 'automation' && (
            <AutomationCenterView
              showToast={showToast}
            />
          )}

          {currentTab === 'notifications' && (
            <NotificationsView
              showToast={showToast}
            />
          )}

          {currentTab === 'analytics' && (
            <AnalyticsView
              stats={stats}
              appointments={appointments}
            />
          )}

          {currentTab === 'research' && (
            <ResearchEvaluationView
              showToast={showToast}
            />
          )}

          {currentTab === 'settings' && (
            <SettingsView
              showToast={showToast}
              onRefreshAll={refreshData}
            />
          )}
        </main>
      </div>

      {/* Modals */}
      <NewBookingModal
        isOpen={isNewBookingOpen}
        onClose={() => setIsNewBookingOpen(false)}
        onSuccess={refreshData}
        showToast={showToast}
        initialSlot={selectedSlotForBooking}
      />

      <AppointmentDetailModal
        appointment={inspectingAppointment}
        onClose={() => setInspectingAppointment(null)}
        onRefresh={refreshData}
        showToast={showToast}
      />

      {/* Toast Notification Container */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom duration-300">
          <div
            className={`px-4 py-3 rounded-xl shadow-2xl flex items-center space-x-2 text-xs font-semibold border ${
              toast.type === 'success'
                ? 'bg-emerald-950/90 text-emerald-200 border-emerald-500/50 shadow-emerald-900/30'
                : toast.type === 'error'
                ? 'bg-rose-950/90 text-rose-200 border-rose-500/50 shadow-rose-900/30'
                : 'bg-brand-950/90 text-brand-200 border-brand-500/50 shadow-brand-900/30'
            }`}
          >
            <span>{toast.msg}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
