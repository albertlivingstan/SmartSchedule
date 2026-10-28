import React, { useState } from 'react';
import { Search, Plus, Key, RefreshCcw, Database, ShieldCheck, ExternalLink } from 'lucide-react';
import { getApiKey, setApiKey, api } from '../api';

interface HeaderProps {
  onOpenNewBooking: () => void;
  onRefresh: () => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenNewBooking,
  onRefresh,
  searchQuery,
  setSearchQuery,
  showToast
}) => {
  const [keyInput, setKeyInput] = useState(getApiKey());
  const [isEditingKey, setIsEditingKey] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const handleSaveKey = () => {
    setApiKey(keyInput.trim());
    setIsEditingKey(false);
    showToast("API Key updated for current session", "success");
    onRefresh();
  };

  const handleSeedData = async () => {
    setSeeding(true);
    try {
      await api.seedDemoData(true);
      showToast("100 demonstration appointments & synthetic records seeded successfully!", "success");
      onRefresh();
    } catch (err: any) {
      showToast(`Seed failed: ${err.message}`, "error");
    } finally {
      setSeeding(false);
    }
  };

  return (
    <header className="h-20 border-b border-slate-800/80 bg-navy-900/60 backdrop-blur-xl sticky top-0 z-20 px-8 flex items-center justify-between">
      {/* Global Search Bar */}
      <div className="relative w-96">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          placeholder="Search appointments, staff, client name, service..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-slate-950/60 border border-slate-700/60 rounded-xl pl-10 pr-4 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-brand-500/80 focus:ring-1 focus:ring-brand-500/50 transition-all"
        />
      </div>

      {/* Control Actions */}
      <div className="flex items-center space-x-3">
        {/* Seed Demonstration Dataset Button */}
        <button
          onClick={handleSeedData}
          disabled={seeding}
          className="flex items-center space-x-2 text-xs font-medium px-3.5 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-750 text-slate-200 border border-slate-700/80 hover:border-slate-600 transition-all"
          title="Seed 100 sample appointments, 10 staff members, 30 waitlist entries"
        >
          <Database className={`w-3.5 h-3.5 text-accent-cyan ${seeding ? 'animate-spin' : ''}`} />
          <span>{seeding ? 'Seeding...' : 'Seed 100 Demo Records'}</span>
        </button>

        {/* API Key Modal / Quick Editor */}
        <div className="flex items-center space-x-1.5 bg-slate-950/60 border border-slate-800/80 rounded-xl px-3 py-1.5 text-xs text-slate-300">
          <Key className="w-3.5 h-3.5 text-brand-400" />
          {isEditingKey ? (
            <div className="flex items-center space-x-1">
              <input
                type="text"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                className="bg-slate-900 border border-slate-700 text-white rounded px-2 py-0.5 text-xs w-28 focus:outline-none"
              />
              <button
                onClick={handleSaveKey}
                className="bg-brand-600 text-white px-2 py-0.5 rounded text-[11px] font-medium hover:bg-brand-500"
              >
                Save
              </button>
            </div>
          ) : (
            <div className="flex items-center space-x-1.5 cursor-pointer" onClick={() => setIsEditingKey(true)}>
              <span className="font-mono text-[11px] text-slate-400">
                {keyInput.length > 12 ? `${keyInput.slice(0, 10)}...` : keyInput}
              </span>
              <span className="text-[10px] text-brand-400 hover:underline">Edit</span>
            </div>
          )}
        </div>

        {/* Refresh button */}
        <button
          onClick={onRefresh}
          className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-750 text-slate-300 hover:text-white border border-slate-700/80 transition-colors"
          title="Refresh All Data"
        >
          <RefreshCcw className="w-4 h-4" />
        </button>

        {/* API Docs Button */}
        <a
          href="/docs"
          target="_blank"
          rel="noreferrer"
          className="flex items-center space-x-1.5 text-xs font-medium px-3 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-750 text-slate-300 hover:text-white border border-slate-700/80 transition-colors"
        >
          <span>FastAPI Docs</span>
          <ExternalLink className="w-3 h-3 text-slate-400" />
        </a>

        {/* New Booking CTA */}
        <button
          onClick={onOpenNewBooking}
          className="flex items-center space-x-2 bg-gradient-to-r from-brand-600 via-indigo-600 to-brand-700 hover:from-brand-500 hover:to-indigo-500 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-lg shadow-brand-500/25 transition-all transform hover:-translate-y-0.5 active:translate-y-0"
        >
          <Plus className="w-4 h-4" />
          <span>New Booking</span>
        </button>
      </div>
    </header>
  );
};
