import React, { useState, useEffect } from 'react';
import {
  Settings as SettingsIcon, Bot, Mail, Sliders, Database, Key,
  ShieldCheck, CheckCircle2, AlertTriangle, ExternalLink
} from 'lucide-react';
import { getApiKey, setApiKey, api } from '../api';

interface SettingsViewProps {
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  onRefreshAll: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ showToast, onRefreshAll }) => {
  const [apiKey, setApiKeyState] = useState(getApiKey());
  const [uipathWebhook, setUipathWebhook] = useState('');
  const [uipathToken, setUipathToken] = useState('');
  const [testingPing, setTestingPing] = useState(false);
  const [uipathHealth, setUipathHealth] = useState<any>(null);
  const [notifStatus, setNotifStatus] = useState<any>(null);
  const [seeding, setSeeding] = useState(false);

  useEffect(() => {
    api.getUiPathHealth().then(data => setUipathHealth(data)).catch(() => {});
    api.getNotificationStatus().then(data => setNotifStatus(data)).catch(() => {});
  }, []);

  const handleSaveApiKey = () => {
    setApiKey(apiKey.trim());
    showToast("Master API Key saved for active browser session", "success");
    onRefreshAll();
  };

  const handleTestUiPath = async () => {
    setTestingPing(true);
    try {
      const data = await api.getUiPathHealth();
      setUipathHealth(data);
      showToast("UiPath Studio Web Integration API is active and responsive!", "success");
    } catch (err: any) {
      showToast(`UiPath check failed: ${err.message}`, "error");
    } finally {
      setTestingPing(false);
    }
  };

  const handleSeedDemo = async () => {
    setSeeding(true);
    try {
      await api.seedDemoData(true);
      showToast("Seeded 100 sample appointments, 10 staff, 8 services & 30 waitlist entries!", "success");
      onRefreshAll();
    } catch (err: any) {
      showToast(`Seed failed: ${err.message}`, "error");
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="glass-panel p-8 rounded-2xl border border-brand-500/20 bg-gradient-to-r from-navy-900 via-indigo-950/40 to-navy-900">
        <div className="max-w-3xl">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-brand-500/10 border border-brand-500/30 text-accent-cyan text-xs font-semibold mb-3">
            <SettingsIcon className="w-3.5 h-3.5" />
            <span>Platform Configuration</span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            System & RPA Orchestration Settings
          </h1>
          <p className="mt-2 text-xs text-slate-300 leading-relaxed">
            Manage your API keys, configure UiPath Studio Web Integration Service webhook endpoints,
            and review notification delivery settings.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* UiPath Studio Web Configuration */}
        <div className="glass-panel p-6 rounded-2xl border border-slate-800/80 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center space-x-2">
              <Bot className="w-5 h-5 text-accent-cyan" />
              <h2 className="text-sm font-semibold text-white uppercase tracking-wider">
                UiPath Studio Web Integration
              </h2>
            </div>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              API Active
            </span>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            Configure an outbound webhook URL from UiPath Integration Service or Automation Cloud.
            Events (new bookings, cancellations, recovery offers) will be dispatched directly to your robot.
          </p>

          <div className="space-y-3 text-xs">
            <div>
              <label className="block text-slate-300 font-medium mb-1">
                UiPath Inbound Webhook / Integration URL
              </label>
              <input
                type="url"
                placeholder="https://cloud.uipath.com/YOUR_TENANT/..."
                value={uipathWebhook}
                onChange={(e) => setUipathWebhook(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-brand-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">
                Bearer Auth Token (Optional)
              </label>
              <input
                type="password"
                placeholder="Bearer token for UiPath Webhook"
                value={uipathToken}
                onChange={(e) => setUipathToken(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-brand-500"
              />
            </div>

            <div className="pt-2 flex items-center justify-between">
              <a
                href="/docs#/default/uipath_health_api_integrations_uipath_health_get"
                target="_blank"
                rel="noreferrer"
                className="text-xs text-brand-400 hover:underline flex items-center space-x-1"
              >
                <span>UiPath Endpoint Specs</span>
                <ExternalLink className="w-3 h-3" />
              </a>

              <button
                onClick={handleTestUiPath}
                disabled={testingPing}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-white font-semibold transition-all border border-slate-700"
              >
                {testingPing ? 'Testing...' : 'Test Connection'}
              </button>
            </div>
          </div>
        </div>

        {/* Security & Authentication */}
        <div className="glass-panel p-6 rounded-2xl border border-slate-800/80 space-y-4">
          <div className="flex items-center space-x-2 pb-3 border-b border-slate-800">
            <Key className="w-5 h-5 text-brand-400" />
            <h2 className="text-sm font-semibold text-white uppercase tracking-wider">
              Security & API Authentication
            </h2>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            The SmartSchedule API uses <code className="text-brand-300 font-mono">X-API-Key</code> for
            robot-to-backend automation and JWT Bearer tokens for authenticated users.
          </p>

          <div className="space-y-3 text-xs">
            <div>
              <label className="block text-slate-300 font-medium mb-1">Active X-API-Key</label>
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={apiKey}
                  onChange={(e) => setApiKeyState(e.target.value)}
                  className="flex-1 bg-slate-900 border border-slate-700/80 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-brand-500 font-mono"
                />
                <button
                  onClick={handleSaveApiKey}
                  className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-semibold shadow-md transition-all"
                >
                  Save Key
                </button>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1.5 text-[11px] text-slate-400">
              <div className="font-semibold text-slate-200">Default Demo Accounts (Seeded):</div>
              <div>• <b>Admin:</b> admin@smartschedule.local / AdminPass123!</div>
              <div>• <b>Staff:</b> staff.a@smartschedule.local / StaffPass123!</div>
              <div>• <b>Student:</b> student@example.org / CustomerPass123!</div>
            </div>
          </div>
        </div>
      </div>

      {/* Row 2: Seed Controls & SMTP Info */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Seed Controls */}
        <div className="glass-panel p-6 rounded-2xl border border-slate-800/80 space-y-4">
          <div className="flex items-center space-x-2 pb-3 border-b border-slate-800">
            <Database className="w-5 h-5 text-accent-cyan" />
            <h2 className="text-sm font-semibold text-white uppercase tracking-wider">
              Research Dataset Controls
            </h2>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            Re-populate or reset the database with the official Project 23 college demonstration dataset.
            Generates 100 sample appointments, 10 staff members, 8 services, 30 waiting-list records, and slot recovery flows.
          </p>

          <button
            onClick={handleSeedDemo}
            disabled={seeding}
            className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold shadow-md transition-all"
          >
            <Database className={`w-3.5 h-3.5 ${seeding ? 'animate-spin' : ''}`} />
            <span>{seeding ? 'Seeding Records...' : 'Reset & Seed 100 Demonstration Records'}</span>
          </button>
        </div>

        {/* SMTP Status */}
        <div className="glass-panel p-6 rounded-2xl border border-slate-800/80 space-y-4">
          <div className="flex items-center space-x-2 pb-3 border-b border-slate-800">
            <Mail className="w-5 h-5 text-emerald-400" />
            <h2 className="text-sm font-semibold text-white uppercase tracking-wider">
              Email Dispatch Environment
            </h2>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            By default, all notifications run in safe dry-run mode (logged to outbox table and terminal).
            To enable real SMTP delivery, set <code className="text-accent-cyan">SMTP_ENABLED=true</code> in your environment.
          </p>

          <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1 text-xs text-slate-300">
            <div>Current Status: <b className="text-amber-400">{notifStatus?.mode}</b></div>
            <div>Configured SMTP Server: <span className="font-mono text-slate-400">{notifStatus?.host}:{notifStatus?.port}</span></div>
          </div>
        </div>
      </div>
    </div>
  );
};
