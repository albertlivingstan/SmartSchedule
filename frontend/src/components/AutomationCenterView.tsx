import React, { useState, useEffect } from 'react';
import {
  Bot, CheckCircle2, Clock, AlertTriangle, RefreshCcw, ArrowRight,
  ShieldAlert, Activity, FileJson, X, ExternalLink
} from 'lucide-react';
import { AutomationExecution } from '../types';
import { api } from '../api';

interface AutomationCenterViewProps {
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const AutomationCenterView: React.FC<AutomationCenterViewProps> = ({ showToast }) => {
  const [executions, setExecutions] = useState<AutomationExecution[]>([]);
  const [selectedExec, setSelectedExec] = useState<AutomationExecution | null>(null);
  const [uipathStatus, setUipathStatus] = useState<any>(null);

  const fetchData = async () => {
    try {
      const [exList, uiH] = await Promise.all([
        api.getExecutions(),
        api.getUiPathHealth()
      ]);
      setExecutions(exList);
      setUipathStatus(uiH);
    } catch {}
  };

  useEffect(() => {
    fetchData();
  }, []);

  const workflowNodes = [
    { id: 'request', label: '1. Appointment Request', icon: '📥', status: 'completed' },
    { id: 'validation', label: '2. Input Validation', icon: '🔍', status: 'completed' },
    { id: 'scheduling', label: '3. Smart Constraint Engine', icon: '⚙️', status: 'completed' },
    { id: 'database', label: '4. Database Save', icon: '💾', status: 'completed' },
    { id: 'uipath', label: '5. UiPath Dispatch', icon: '🤖', status: 'completed' },
    { id: 'notification', label: '6. Outbox Dispatch', icon: '📨', status: 'completed' },
    { id: 'confirmation', label: '7. Final Confirmation', icon: '✅', status: 'completed' },
    { id: 'analytics', label: '8. Analytics Update', icon: '📊', status: 'completed' },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Hero Header */}
      <div className="glass-panel p-8 rounded-2xl border border-brand-500/20 bg-gradient-to-r from-navy-900 via-indigo-950/40 to-navy-900">
        <div className="max-w-3xl">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-brand-500/10 border border-brand-500/30 text-accent-cyan text-xs font-semibold mb-3">
            <Bot className="w-3.5 h-3.5" />
            <span>UiPath Studio Web & Event Telemetry</span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Automation Center & Workflow Visualizer
          </h1>
          <p className="mt-2 text-xs text-slate-300 leading-relaxed">
            Monitors end-to-end execution across the FastAPI platform and UiPath Integration Service.
            Tracks idempotent booking tasks, reminder delivery callbacks, and autonomous recovery events.
          </p>
        </div>
      </div>

      {/* Visual Workflow Nodes */}
      <div className="glass-panel p-6 rounded-2xl border border-slate-800/80">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-white uppercase tracking-wider">
            Interactive Workflow Architecture (Live Node Pipeline)
          </h2>
          <span className="text-xs text-slate-400">
            Connector: <b className="text-emerald-400">UiPath Generic HTTP Connector</b>
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2 pt-2">
          {workflowNodes.map((node, index) => (
            <div
              key={node.id}
              className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between space-y-2 hover:border-brand-500/50 transition-all text-xs"
            >
              <div className="flex items-center justify-between">
                <span className="text-base">{node.icon}</span>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              </div>
              <div className="font-semibold text-white tracking-tight leading-snug">
                {node.label}
              </div>
              <div className="text-[10px] text-emerald-400 font-mono uppercase">
                {node.status}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Execution Telemetry Log */}
      <div className="glass-panel p-6 rounded-2xl border border-slate-800/80">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-base font-semibold text-white tracking-tight">
              Automation Execution Records
            </h2>
            <p className="text-xs text-slate-400">
              Live telemetry reported by UiPath bots and background orchestration workers
            </p>
          </div>
          <button
            onClick={fetchData}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700 transition-colors"
          >
            <RefreshCcw className="w-3.5 h-3.5" />
            <span>Refresh Telemetry</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/80 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Execution ID</th>
                <th className="py-3 px-4">Workflow Name</th>
                <th className="py-3 px-4">UiPath Job ID</th>
                <th className="py-3 px-4">Started At</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Payload</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {executions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    No automation executions recorded.
                  </td>
                </tr>
              ) : (
                executions.map((ex) => (
                  <tr key={ex.id} className="hover:bg-slate-900/40">
                    <td className="py-3.5 px-4 font-mono text-slate-400 text-[11px]">
                      {ex.execution_id}
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-white">
                      {ex.workflow_name}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-accent-cyan text-[11px]">
                      {ex.uipath_job_id || '—'}
                    </td>
                    <td className="py-3.5 px-4 text-slate-300">
                      {new Date(ex.started_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                          ex.status === 'completed'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : ex.status === 'failed'
                            ? 'bg-rose-500/20 text-rose-300'
                            : ex.status === 'running'
                            ? 'bg-brand-500/20 text-brand-300 animate-pulse'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {ex.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => setSelectedExec(ex)}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white"
                        title="Inspect JSON Payload"
                      >
                        <FileJson className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* JSON Payload Inspection Drawer */}
      {selectedExec && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel p-6 rounded-2xl border border-slate-700 max-w-xl w-full space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-white">{selectedExec.workflow_name}</h3>
                <span className="font-mono text-xs text-slate-400">{selectedExec.execution_id}</span>
              </div>
              <button
                onClick={() => setSelectedExec(null)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between text-slate-400">
                <span>Status:</span>
                <span className="font-semibold text-white uppercase">{selectedExec.status}</span>
              </div>
              {selectedExec.error_message && (
                <div className="p-2.5 rounded-lg bg-rose-950/40 border border-rose-800/60 text-rose-300">
                  <b>Error:</b> {selectedExec.error_message}
                </div>
              )}
              <div className="text-slate-400 font-medium">Payload Metadata:</div>
              <pre className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-[11px] font-mono text-accent-cyan overflow-x-auto max-h-60">
                {JSON.stringify(selectedExec.payload, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
