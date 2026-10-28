import React, { useState, useEffect } from 'react';
import {
  Bell, Mail, Send, CheckCircle2, AlertTriangle, RefreshCcw,
  Clock, ShieldAlert, Zap, Info, FileText, X
} from 'lucide-react';
import { NotificationItem } from '../types';
import { api } from '../api';

interface NotificationsViewProps {
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const NotificationsView: React.FC<NotificationsViewProps> = ({ showToast }) => {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [statusInfo, setStatusInfo] = useState<any>(null);
  const [processing, setProcessing] = useState(false);
  const [selectedItem, setSelectedItem] = useState<NotificationItem | null>(null);

  const fetchData = async () => {
    try {
      const [outbox, st] = await Promise.all([
        api.getOutbox(),
        api.getNotificationStatus()
      ]);
      setItems(outbox);
      setStatusInfo(st);
    } catch {}
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleProcessTick = async () => {
    setProcessing(true);
    try {
      const res = await api.processOutboxTick();
      showToast(`Processed batch! Outbox items: ${res.counts.outbox}, Reminders: ${res.counts.reminders}`, "success");
      fetchData();
    } catch (err: any) {
      showToast(`Process failed: ${err.message}`, "error");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header Banner */}
      <div className="glass-panel p-8 rounded-2xl border border-brand-500/20 bg-gradient-to-r from-navy-900 via-indigo-950/40 to-navy-900">
        <div className="max-w-3xl">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-brand-500/10 border border-brand-500/30 text-accent-cyan text-xs font-semibold mb-3">
            <Mail className="w-3.5 h-3.5" />
            <span>Durable Database-Backed Outbox Pattern</span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Notification Outbox & Reminder Dispatch Engine
          </h1>
          <p className="mt-2 text-xs text-slate-300 leading-relaxed">
            Multi-worker concurrency safe queue with atomic status claiming, idempotency keys, exponential backoff
            retries, and safe dry-run preview mode.
          </p>
        </div>
      </div>

      {/* SMTP Status & Controls Banner */}
      <div className="glass-panel p-6 rounded-2xl border border-slate-800/80 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-4">
          <div className={`p-3 rounded-xl border ${
            statusInfo?.smtp_enabled ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
          }`}>
            <Mail className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-sm font-bold text-white">Delivery Mode:</span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                statusInfo?.smtp_enabled ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
              }`}>
                {statusInfo?.mode || 'Dry-Run Preview (Safe)'}
              </span>
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              Host: <span className="text-slate-300 font-mono">{statusInfo?.host}</span> · From: <span className="text-slate-300 font-mono">{statusInfo?.from_address}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={handleProcessTick}
            disabled={processing}
            className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold shadow-md transition-all"
          >
            <Zap className={`w-3.5 h-3.5 ${processing ? 'animate-spin' : ''}`} />
            <span>{processing ? 'Processing...' : 'Run Outbox Batch Tick'}</span>
          </button>
        </div>
      </div>

      {/* Outbox Items Table */}
      <div className="glass-panel p-6 rounded-2xl border border-slate-800/80">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-base font-semibold text-white tracking-tight">Outbox Dispatch Queue</h2>
            <p className="text-xs text-slate-400">Chronological history of enqueued reminders, slot offers, and confirmations</p>
          </div>
          <button
            onClick={fetchData}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700 transition-colors"
          >
            <RefreshCcw className="w-3.5 h-3.5" />
            <span>Refresh Queue</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/80 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Recipient</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Subject</th>
                <th className="py-3 px-4">Retries</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Preview</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    Outbox queue is currently empty.
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-900/40">
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-white">{item.recipient_name}</div>
                      <div className="text-[11px] text-slate-400 font-mono">{item.recipient_email}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="font-mono text-[11px] text-accent-cyan bg-accent-cyan/10 px-2 py-0.5 rounded border border-accent-cyan/20">
                        {item.notification_type}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 max-w-xs truncate text-slate-200">
                      {item.subject}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-400">
                      {item.retry_count} / {item.max_retries}
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                          item.status.includes('sent')
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : item.status === 'failed' || item.status === 'dead_letter'
                            ? 'bg-rose-500/20 text-rose-300'
                            : 'bg-amber-500/20 text-amber-300'
                        }`}
                      >
                        {item.status.replace('_', ' ').toUpperCase()}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => setSelectedItem(item)}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white"
                        title="View Notification Payload"
                      >
                        <FileText className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Notification Preview Drawer */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel p-6 rounded-2xl border border-slate-700 max-w-lg w-full space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white">Notification Payload Preview</h3>
              <button
                onClick={() => setSelectedItem(null)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <span className="text-slate-400">Recipient: </span>
                <span className="font-semibold text-white">{selectedItem.recipient_name} ({selectedItem.recipient_email})</span>
              </div>
              <div>
                <span className="text-slate-400">Subject: </span>
                <span className="font-semibold text-white">{selectedItem.subject}</span>
              </div>
              <div>
                <span className="text-slate-400">Idempotency Key: </span>
                <span className="font-mono text-slate-300">{selectedItem.idempotency_key}</span>
              </div>
              <div>
                <span className="text-slate-400">Payload Data:</span>
                <pre className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-[11px] font-mono text-accent-cyan mt-1 max-h-52 overflow-x-auto">
                  {JSON.stringify(selectedItem.payload, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
