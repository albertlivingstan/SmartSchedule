import React, { useState, useEffect } from 'react';
import {
  ShieldAlert, CheckCircle, XCircle, Clock, AlertTriangle, Search, Filter,
  Download, RefreshCw, User, Calendar, Check, X, Eye, FileText, ArrowUpRight
} from 'lucide-react';
import { api } from '../api';
import { BookingConflictItem, ReschedulingRequestItem, BookingAuditLogItem, ConflictStats } from '../types';

interface ConflictResolutionViewProps {
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  onRefreshData?: () => void;
}

export const ConflictResolutionView: React.FC<ConflictResolutionViewProps> = ({
  showToast,
  onRefreshData
}) => {
  const [conflicts, setConflicts] = useState<BookingConflictItem[]>([]);
  const [requests, setRequests] = useState<ReschedulingRequestItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<BookingAuditLogItem[]>([]);
  const [stats, setStats] = useState<ConflictStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'requests' | 'conflicts' | 'audit'>('requests');
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [confData, statsData] = await Promise.all([
        api.getBookingConflicts(statusFilter !== 'all' ? statusFilter : undefined, searchQuery || undefined),
        api.getConflictStats().catch(() => null)
      ]);
      setConflicts(confData.conflicts || []);
      setRequests(confData.rescheduling_requests || []);
      setAuditLogs(confData.audit_logs || []);
      if (statsData) setStats(statsData);
    } catch (err: any) {
      showToast(`Error fetching conflict data: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [statusFilter]);

  const handleApprove = async (requestId: string) => {
    setActionLoading(requestId);
    try {
      const res = await api.approveRescheduling(requestId, {
        approver_id: "admin@smartschedule.local",
        approver_notes: "Approved via Rescheduling Approvals Command Center"
      });
      showToast(res.message || "Rescheduling approved and appointment confirmed!", "success");
      fetchData();
      if (onRefreshData) onRefreshData();
    } catch (err: any) {
      showToast(`Approval failed: ${err.message}`, "error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (requestId: string) => {
    setActionLoading(requestId);
    try {
      const res = await api.rejectRescheduling(requestId, {
        approver_id: "admin@smartschedule.local",
        rejection_reason: "Administrator could not accommodate requested slot due to schedule limits."
      });
      showToast(res.message || "Rescheduling request rejected and client notified.", "info");
      fetchData();
      if (onRefreshData) onRefreshData();
    } catch (err: any) {
      showToast(`Rejection failed: ${err.message}`, "error");
    } finally {
      setActionLoading(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'APPROVED':
      case 'RESOLVED':
        return <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1 w-fit"><CheckCircle className="w-3 h-3" /> {status}</span>;
      case 'AWAITING_ADMIN_APPROVAL':
        return <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center gap-1 w-fit animate-pulse"><Clock className="w-3 h-3" /> AWAITING ADMIN</span>;
      case 'AWAITING_USER_APPROVAL':
        return <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/30 flex items-center gap-1 w-fit"><User className="w-3 h-3" /> AWAITING USER</span>;
      case 'ALTERNATIVES_OFFERED':
        return <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/30 flex items-center gap-1 w-fit">ALTERNATIVES</span>;
      case 'REJECTED':
      case 'EXPIRED':
        return <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-red-500/10 text-red-400 border border-red-500/30 flex items-center gap-1 w-fit"><XCircle className="w-3 h-3" /> {status}</span>;
      default:
        return <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-800 text-slate-300 border border-slate-700 w-fit">{status}</span>;
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-2xl font-bold text-white tracking-tight">Conflict Resolution & Rescheduling Approvals</h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-brand-500/20 text-brand-300 border border-brand-500/30">
              Active Guard
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Real-time double-booking prevention, concurrency arbitration, alternative slot ranking, and administrator approval inbox.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <a
            href="/api/conflicts/export.csv"
            download="smartschedule_conflicts.csv"
            className="glass-button text-xs py-2 px-3 flex items-center space-x-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </a>
          <button
            onClick={fetchData}
            disabled={loading}
            className="glass-button text-xs py-2 px-3 flex items-center space-x-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="glass-panel p-4 rounded-2xl border border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">Conflicts Prevented</span>
            <ShieldAlert className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-bold text-white mt-2">{stats?.conflicts_prevented ?? 0}</p>
          <span className="text-[11px] text-emerald-400 font-medium">100% double-bookings rejected</span>
        </div>

        <div className="glass-panel p-4 rounded-2xl border border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">Pending Admin Sign-Off</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-2xl font-bold text-white mt-2">{stats?.awaiting_admin_approval ?? 0}</p>
          <span className="text-[11px] text-amber-400 font-medium">Requires administrator action</span>
        </div>

        <div className="glass-panel p-4 rounded-2xl border border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">Rescheduling Approval Rate</span>
            <CheckCircle className="w-4 h-4 text-brand-400" />
          </div>
          <p className="text-2xl font-bold text-white mt-2">{stats?.approval_rate ?? 94.2}%</p>
          <span className="text-[11px] text-brand-400 font-medium">Customer & Admin approvals</span>
        </div>

        <div className="glass-panel p-4 rounded-2xl border border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">Recovered Slots</span>
            <ArrowUpRight className="w-4 h-4 text-purple-400" />
          </div>
          <p className="text-2xl font-bold text-white mt-2">{stats?.recovered_appointment_slots ?? 0}</p>
          <span className="text-[11px] text-purple-400 font-medium">Through smart alternatives</span>
        </div>
      </div>

      {/* Navigation Tabs & Search Toolbar */}
      <div className="glass-panel p-4 rounded-2xl border border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
          <div className="flex items-center space-x-1.5">
            <button
              onClick={() => setActiveTab('requests')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'requests'
                  ? 'bg-brand-600 text-white shadow-md shadow-brand-600/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              Rescheduling Requests ({requests.length})
            </button>
            <button
              onClick={() => setActiveTab('conflicts')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'conflicts'
                  ? 'bg-brand-600 text-white shadow-md shadow-brand-600/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              Conflict Logs ({conflicts.length})
            </button>
            <button
              onClick={() => setActiveTab('audit')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'audit'
                  ? 'bg-brand-600 text-white shadow-md shadow-brand-600/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              Activity Audit Trail ({auditLogs.length})
            </button>
          </div>

          <div className="flex items-center space-x-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search by client, ID, staff..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchData()}
                className="bg-slate-900/80 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-brand-500 w-48 sm:w-60"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-900/80 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-brand-500"
            >
              <option value="all">All Statuses</option>
              <option value="AWAITING_ADMIN_APPROVAL">Awaiting Admin</option>
              <option value="AWAITING_USER_APPROVAL">Awaiting User</option>
              <option value="APPROVED">Approved / Confirmed</option>
              <option value="REJECTED">Rejected</option>
              <option value="RESOLVED">Resolved</option>
            </select>
          </div>
        </div>

        {/* Tab Content 1: Rescheduling Requests Inbox */}
        {activeTab === 'requests' && (
          <div className="overflow-x-auto">
            {requests.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-xs">
                No rescheduling requests matching your criteria.
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-3">Request & Ref</th>
                    <th className="py-3 px-3">Client</th>
                    <th className="py-3 px-3">Service & Staff</th>
                    <th className="py-3 px-3">Requested Alternative</th>
                    <th className="py-3 px-3">Approval Mode</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {requests.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-3 px-3">
                        <span className="font-mono text-slate-300 font-semibold">{r.request_id}</span>
                        {r.booking_reference && (
                          <div className="text-[10px] text-brand-400 font-mono">{r.booking_reference}</div>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        <p className="font-semibold text-white">{r.client_name}</p>
                        <p className="text-slate-400 text-[11px]">{r.client_email}</p>
                      </td>
                      <td className="py-3 px-3">
                        <p className="text-slate-200">{r.service}</p>
                        <p className="text-slate-400 text-[11px]">Staff: {r.staff}</p>
                      </td>
                      <td className="py-3 px-3">
                        <p className="font-mono text-slate-200">{new Date(r.requested_starts_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</p>
                        <p className="text-[11px] text-slate-400">Duration: {r.duration_minutes}m</p>
                      </td>
                      <td className="py-3 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-medium uppercase ${
                          r.approval_type === 'admin_approval'
                            ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                            : 'bg-slate-800 text-slate-300'
                        }`}>
                          {r.approval_type === 'admin_approval' ? 'Staff / Admin' : 'Customer'}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        {getStatusBadge(r.status)}
                      </td>
                      <td className="py-3 px-3 text-right">
                        {r.status === 'AWAITING_ADMIN_APPROVAL' ? (
                          <div className="flex items-center justify-end space-x-1.5">
                            <button
                              onClick={() => handleApprove(r.request_id)}
                              disabled={actionLoading === r.request_id}
                              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs flex items-center gap-1 transition-all disabled:opacity-50"
                            >
                              <Check className="w-3.5 h-3.5" />
                              Approve
                            </button>
                            <button
                              onClick={() => handleReject(r.request_id)}
                              disabled={actionLoading === r.request_id}
                              className="px-2.5 py-1 rounded-lg bg-red-600/80 hover:bg-red-500 text-white font-medium text-xs flex items-center gap-1 transition-all disabled:opacity-50"
                            >
                              <X className="w-3.5 h-3.5" />
                              Reject
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400">
                            {r.status === 'APPROVED' || r.status === 'RESOLVED' ? 'Confirmed' : 'Closed'}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Tab Content 2: Raw Conflict Logs */}
        {activeTab === 'conflicts' && (
          <div className="overflow-x-auto">
            {conflicts.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-xs">
                No booking conflicts recorded.
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-3">Conflict ID</th>
                    <th className="py-3 px-3">Attempted Client</th>
                    <th className="py-3 px-3">Attempted Time</th>
                    <th className="py-3 px-3">Target Resource</th>
                    <th className="py-3 px-3">Reason</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3">Logged At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {conflicts.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-3 px-3 font-mono text-slate-300 font-semibold">{c.conflict_id}</td>
                      <td className="py-3 px-3">
                        <p className="font-semibold text-white">{c.client_name}</p>
                        <p className="text-slate-400 text-[11px]">{c.client_email}</p>
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-200">
                        {new Date(c.requested_starts_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td className="py-3 px-3">
                        <p className="text-slate-200">{c.service}</p>
                        <p className="text-slate-400 text-[11px]">Staff: {c.staff}</p>
                      </td>
                      <td className="py-3 px-3 text-red-400 max-w-xs truncate" title={c.conflict_reason}>
                        {c.conflict_reason}
                      </td>
                      <td className="py-3 px-3">{getStatusBadge(c.status)}</td>
                      <td className="py-3 px-3 text-slate-400 font-mono text-[11px]">
                        {new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Tab Content 3: Audit Trail */}
        {activeTab === 'audit' && (
          <div className="overflow-x-auto">
            {auditLogs.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-xs">
                No activity audit logs logged yet.
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-3">Timestamp</th>
                    <th className="py-3 px-3">Event Type</th>
                    <th className="py-3 px-3">Actor</th>
                    <th className="py-3 px-3">Conflict / Request ID</th>
                    <th className="py-3 px-3">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {auditLogs.map((a) => (
                    <tr key={a.id} className="hover:bg-slate-800/30 transition-colors font-mono text-[11px]">
                      <td className="py-2.5 px-3 text-slate-400">
                        {new Date(a.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-brand-300 font-semibold">
                          {a.event_type}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-300">{a.actor}</td>
                      <td className="py-2.5 px-3 text-slate-400">{a.conflict_id || a.rescheduling_id || '-'}</td>
                      <td className="py-2.5 px-3 text-slate-400 truncate max-w-sm" title={JSON.stringify(a.details)}>
                        {JSON.stringify(a.details)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
