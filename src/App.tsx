/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Bvelt Radar — Developer Dashboard & Autonomous Scraper Control Console
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Radar, 
  Settings, 
  Terminal, 
  ShieldAlert, 
  Sparkles, 
  CheckCircle2, 
  XCircle, 
  ArrowRight, 
  RefreshCw, 
  Plus, 
  Trash2, 
  ExternalLink, 
  Send, 
  FileText, 
  Database,
  MapPin,
  Wrench,
  User,
  Zap,
  Info,
  Sliders,
  Copy,
  Check,
  AlertTriangle
} from 'lucide-react';

interface Prospect {
  id: string;
  mode: string;
  tenant_id: string | null;
  name: string;
  city: string;
  trade: string;
  website: string | null;
  phone: string | null;
  email: string | null;
  score: number;
  signals_json: string;
  draft_subject: string;
  draft_body: string;
  status: 'discovered' | 'enriched' | 'drafted' | 'notified' | 'ready_to_send' | 'sent' | 'replied' | 'discarded' | 'suppressed';
  source: string;
  created_at: string;
  updated_at: string;
}

interface Run {
  id: string;
  day: string;
  mode: string;
  discovered: number;
  finalized: number;
  ai_calls: number;
  hunter_calls: number;
  errors_json: string;
  created_at: string;
}

interface Seed {
  id: string;
  city: string;
  trade: string;
  notes: string;
}

interface Suppression {
  key: string;
  reason: string;
  created_at: string;
}

interface Config {
  FOUNDER_SERVICE_KEY: string;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHAT_ID: string;
  GROQ_API_KEY: string;
  GEMINI_FOUNDER_API_KEY: string;
  HUNTER_API_KEY: string;
  ABSTRACT_API_KEY: string;
  TRUST_STACK_URL: string;
  FOUNDING_CITIES: string;
  FOUNDING_TRADES: string;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'opportunities' | 'seeds' | 'suppressions' | 'logs'>('opportunities');
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [seeds, setSeeds] = useState<Seed[]>([]);
  const [suppressions, setSuppressions] = useState<Suppression[]>([]);
  const [config, setConfig] = useState<Partial<Config>>({});
  const [logs, setLogs] = useState<Array<{ id: string; timestamp: string; level: string; message: string }>>([]);
  
  // UI states
  const [selectedProspect, setSelectedProspect] = useState<Prospect | null>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [runningLogInterval, setRunningLogInterval] = useState<boolean>(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [customKeyInput, setCustomKeyInput] = useState<Record<string, string>>({});
  const [newSeedCity, setNewSeedCity] = useState('');
  const [newSeedTrade, setNewSeedTrade] = useState('plumbing');
  const [newSeedNotes, setNewSeedNotes] = useState('');
  const [newSuppressKey, setNewSuppressKey] = useState('');
  const [newSuppressReason, setNewSuppressReason] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterSearch, setFilterSearch] = useState<string>('');

  const terminalEndRef = useRef<HTMLDivElement>(null);

  // Load dashboard dataset
  const fetchAllData = async () => {
    try {
      const pRes = await fetch('/api/prospects');
      if (pRes.ok) setProspects(await pRes.json());

      const rRes = await fetch('/api/runs');
      if (rRes.ok) setRuns(await rRes.json());

      const sRes = await fetch('/api/seeds');
      if (sRes.ok) setSeeds(await sRes.json());

      const supRes = await fetch('/api/suppression');
      if (supRes.ok) setSuppressions(await supRes.json());

      const confRes = await fetch('/api/config');
      if (confRes.ok) setConfig(await confRes.json());

      const logsRes = await fetch('/api/logs');
      if (logsRes.ok) setLogs(await logsRes.json());
    } catch (err) {
      console.error("Error communicating with mock radar backend: ", err);
    }
  };

  useEffect(() => {
    fetchAllData();
    // Poll data & logs
    const interval = setInterval(() => {
      fetchAllData();
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // Scroll terminal to view
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  // Copy draft text trigger
  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  // Perform decision state mutate
  const submitDecision = async (prospectId: string, action: 'sent' | 'discard' | 'suppress') => {
    try {
      const res = await fetch('/decision', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.FOUNDER_SERVICE_KEY || 'FOUNDER_SERVICE_KEY_LOCAL'}`
        },
        body: JSON.stringify({ id: prospectId, action })
      });
      if (res.ok) {
        fetchAllData();
        // Update currently viewing modal if relevant
        if (selectedProspect && selectedProspect.id === prospectId) {
          const updated = { ...selectedProspect, status: action === 'sent' ? 'sent' : action === 'discard' ? 'discarded' : 'suppressed' as any };
          setSelectedProspect(updated);
        }
      }
    } catch (e) {
      alert("Decision payload dispatch failed: " + e);
    }
  };

  // Trigger manual scouting pipeline
  const triggerRadarScout = async (mode: 'founder' | 'tenant') => {
    setIsScrubbing(true);
    setActiveTab('logs');
    try {
      const res = await fetch(`/run?mode=${mode}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.FOUNDER_SERVICE_KEY || 'FOUNDER_SERVICE_KEY_LOCAL'}`
        }
      });
      if (res.ok) {
        setTimeout(() => {
          setIsScrubbing(false);
          fetchAllData();
        }, 10000); // 10s simulation window
      } else {
        setIsScrubbing(false);
      }
    } catch (e) {
      setIsScrubbing(false);
    }
  };

  // Reset database values
  const resetDatabaseToInitial = async () => {
    if (window.confirm("Are you sure you want to reset the radar database to initial state? This will clear all custom runs, prospects, and seeds.")) {
      const res = await fetch('/api/reset-db', { method: 'POST' });
      if (res.ok) {
        fetchAllData();
        setSelectedProspect(null);
      }
    }
  };

  // Save new seed coordinate constraint
  const handleAddSeed = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSeedCity || !newSeedTrade) return;
    try {
      const res = await fetch('/api/seeds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ city: newSeedCity, trade: newSeedTrade, notes: newSeedNotes })
      });
      if (res.ok) {
        setNewSeedCity('');
        setNewSeedNotes('');
        fetchAllData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteSeed = async (id: string) => {
    try {
      const res = await fetch(`/api/seeds/${id}`, { method: 'DELETE' });
      if (res.ok) fetchAllData();
    } catch (e) {
      console.error(e);
    }
  };

  // Save new manual suppression constraint
  const handleAddSuppression = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSuppressKey || !newSuppressReason) return;
    try {
      const res = await fetch('/api/suppression', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: newSuppressKey, reason: newSuppressReason })
      });
      if (res.ok) {
        setNewSuppressKey('');
        setNewSuppressReason('');
        fetchAllData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteSuppression = async (key: string) => {
    try {
      const res = await fetch(`/api/suppression/${encodeURIComponent(key)}`, { method: 'DELETE' });
      if (res.ok) fetchAllData();
    } catch (e) {
      console.error(e);
    }
  };

  // Hot-reload credentials and config settings
  const handleSaveKeys = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keys: customKeyInput })
      });
      if (res.ok) {
        alert("Credentials injected successfully. Radar pipeline re-aligned.");
        setCustomKeyInput({});
        fetchAllData();
      }
    } catch (err) {
      alert("Error configuring keys: " + err);
    }
  };

  const handleConfigTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCustomKeyInput({
      ...customKeyInput,
      [e.target.name]: e.target.value
    });
  };

  // Scoring pill styling mapping
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-emerald-500 font-semibold';
    if (score >= 60) return 'text-amber-500 font-semibold';
    return 'text-slate-400 font-semibold';
  };

  // Status mapping details
  const getStatusLabel = (status: string) => {
    switch(status) {
      case 'discovered': return 'Discovered';
      case 'enriched': return 'Enriched';
      case 'drafted': return 'Drafted';
      case 'notified': return 'Notified (Telegram)';
      case 'sent': return 'Sent (Locked)';
      case 'discarded': return 'Discarded';
      case 'suppressed': return 'Suppressed';
      default: return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'sent': return 'text-emerald-600 dark:text-emerald-400';
      case 'notified': return 'text-blue-500';
      case 'drafted': return 'text-purple-500';
      case 'enriched': return 'text-amber-500';
      case 'discarded': return 'text-slate-400';
      case 'suppressed': return 'text-red-400';
      default: return 'text-slate-300';
    }
  };

  // Filter prospects
  const filteredProspects = prospects.filter(p => {
    const matchesStatus = filterStatus === 'all' || p.status === filterStatus;
    const matchesSearch = p.name.toLowerCase().includes(filterSearch.toLowerCase()) || 
                          p.city.toLowerCase().includes(filterSearch.toLowerCase()) ||
                          p.trade.toLowerCase().includes(filterSearch.toLowerCase()) ||
                          (p.email && p.email.toLowerCase().includes(filterSearch.toLowerCase())) ||
                          (p.website && p.website.toLowerCase().includes(filterSearch.toLowerCase()));
    return matchesStatus && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* 1. Header Zone (Top Bar Contract) */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-slate-900 bg-slate-950/80 backdrop-blur shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600/10 p-2 rounded-lg border border-blue-500/20">
            <Radar className="w-6 h-6 text-blue-500 animate-pulse" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight bg-gradient-to-r from-blue-400 to-indigo-300 bg-clip-text text-transparent">
              Bvelt Radar Console
            </h1>
            <p className="text-xs text-slate-500 font-medium">Autonomous Lead Discovery & Prospección</p>
          </div>
        </div>

        {/* Live service health indicator */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-xs text-slate-400 font-mono tracking-tight font-medium">
              Radar-v1 Engine Active
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button 
              onClick={() => triggerRadarScout('founder')}
              disabled={isScrubbing}
              className={`flex items-center gap-2 px-4 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-500/10 whitespace-nowrap`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isScrubbing ? 'animate-spin' : ''}`} />
              {isScrubbing ? 'Running Scout Pipeline...' : 'Manual Run'}
            </button>
            <button 
              onClick={resetDatabaseToInitial}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-900/40 transition-colors whitespace-nowrap"
            >
              Reset DB
            </button>
          </div>
        </div>
      </header>

      {/* 2. Main Layout Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar Section: Settings, Keys & History */}
        <aside className="w-80 border-r border-slate-900 bg-slate-950 p-5 overflow-y-auto flex flex-col gap-6 shrink-0 select-none">
          {/* Quick Metrics */}
          <div>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">System Metrics</h3>
            <div className="grid grid-cols-2 gap-3 font-mono">
              <div className="bg-slate-900/40 p-3 rounded-lg border border-slate-900">
                <span className="text-xs text-slate-500 block">Scouted</span>
                <span className="text-lg font-bold text-slate-200 tabular-nums">
                  {prospects.length}
                </span>
              </div>
              <div className="bg-slate-900/40 p-3 rounded-lg border border-slate-900">
                <span className="text-xs text-slate-500 block">Sent Drafts</span>
                <span className="text-lg font-bold text-emerald-400 tabular-nums">
                  {prospects.filter(p => p.status === 'sent').length}
                </span>
              </div>
              <div className="bg-slate-900/40 p-3 rounded-lg border border-slate-900">
                <span className="text-xs text-slate-500 block">Pending Approve</span>
                <span className="text-lg font-bold text-blue-400 tabular-nums">
                  {prospects.filter(p => p.status === 'notified').length}
                </span>
              </div>
              <div className="bg-slate-900/40 p-3 rounded-lg border border-slate-900">
                <span className="text-xs text-slate-500 block">Suppressed Keys</span>
                <span className="text-lg font-bold text-red-400 tabular-nums">
                  {suppressions.length}
                </span>
              </div>
            </div>
          </div>

          {/* Key Configurations Panel */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Credential Injector</h3>
              <Sparkles className="w-3.5 h-3.5 text-blue-500" />
            </div>
            
            <form onSubmit={handleSaveKeys} className="space-y-3 bg-slate-900/40 p-4 rounded-xl border border-slate-900">
              <p className="text-[11px] text-slate-500 leading-normal">
                Submit local API keys directly to run live enrichment and AI copywriting rather than the simulated placeholders.
              </p>
              
              <div className="space-y-2 font-mono text-[11px]">
                <div>
                  <label className="text-slate-500 block mb-1">FOUNDER_SERVICE_KEY</label>
                  <input 
                    type="password" 
                    name="FOUNDER_SERVICE_KEY" 
                    value={customKeyInput.FOUNDER_SERVICE_KEY || ''} 
                    placeholder="FOUNDER_SERVICE_KEY_LOCAL"
                    onChange={handleConfigTextChange}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="text-slate-500 block mb-1">GROQ_API_KEY (Copywriting)</label>
                  <input 
                    type="password" 
                    name="GROQ_API_KEY" 
                    value={customKeyInput.GROQ_API_KEY || ''} 
                    placeholder={config.GROQ_API_KEY === "Configured (Hidden)" ? "••••••••••••••" : "Paste Groq API Key..."}
                    onChange={handleConfigTextChange}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="text-slate-500 block mb-1">HUNTER_API_KEY (Emails)</label>
                  <input 
                    type="password" 
                    name="HUNTER_API_KEY" 
                    value={customKeyInput.HUNTER_API_KEY || ''} 
                    placeholder={config.HUNTER_API_KEY === "Configured (Hidden)" ? "••••••••••••••" : "Hunter.io Domain Finder Key..."}
                    onChange={handleConfigTextChange}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="text-slate-500 block mb-1">ABSTRACT_API_KEY (Validation)</label>
                  <input 
                    type="password" 
                    name="ABSTRACT_API_KEY" 
                    value={customKeyInput.ABSTRACT_API_KEY || ''} 
                    placeholder={config.ABSTRACT_API_KEY === "Configured (Hidden)" ? "••••••••••••••" : "Abstract Email Verifier..."}
                    onChange={handleConfigTextChange}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="text-slate-500 block mb-1">TELEGRAM_BOT_TOKEN</label>
                  <input 
                    type="password" 
                    name="TELEGRAM_BOT_TOKEN" 
                    value={customKeyInput.TELEGRAM_BOT_TOKEN || ''} 
                    placeholder={config.TELEGRAM_BOT_TOKEN === "Configured (Hidden)" ? "••••••••••••••" : "Bot Token..."}
                    onChange={handleConfigTextChange}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="text-slate-500 block mb-1">TELEGRAM_CHAT_ID</label>
                  <input 
                    type="text" 
                    name="TELEGRAM_CHAT_ID" 
                    value={customKeyInput.TELEGRAM_CHAT_ID || ''} 
                    placeholder={config.TELEGRAM_CHAT_ID === "Configured (Hidden)" ? "••••••••••••••" : "Target Chat ID..."}
                    onChange={handleConfigTextChange}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
              </div>

              <button 
                type="submit" 
                className="w-full mt-2 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-white transition-colors"
              >
                Inject Credentials
              </button>
            </form>
          </div>

          {/* Active Config Target Bounds */}
          <div>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Scout Constraints</h3>
            <div className="space-y-3 font-mono text-[11px] bg-slate-900/20 p-3.5 rounded-lg border border-slate-900">
              <div>
                <span className="text-slate-500 block">FOUNDING_CITIES (Default Fallbacks)</span>
                <span className="text-slate-300 block break-all leading-relaxed bg-slate-950/40 p-1.5 rounded mt-1">
                  {config.FOUNDING_CITIES}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">FOUNDING_TRADES</span>
                <span className="text-slate-300 block break-all leading-relaxed bg-slate-950/40 p-1.5 rounded mt-1">
                  {config.FOUNDING_TRADES}
                </span>
              </div>
            </div>
          </div>
        </aside>

        {/* Center Canvas Workspace: Main Tables, Configurations & Charts */}
        <main className="flex-1 flex flex-col min-w-0 bg-slate-950">
          {/* Sub Navigation Tabs */}
          <div className="flex border-b border-slate-900 bg-slate-950/30 px-6 shrink-0 select-none">
            <button 
              onClick={() => setActiveTab('opportunities')}
              className={`py-3 px-4 text-xs font-semibold border-b-2 transition-all ${activeTab === 'opportunities' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
            >
              <span className="flex items-center gap-2">
                <Database className="w-3.5 h-3.5" />
                Opportunities ({prospects.length})
              </span>
            </button>
            <button 
              onClick={() => setActiveTab('seeds')}
              className={`py-3 px-4 text-xs font-semibold border-b-2 transition-all ${activeTab === 'seeds' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
            >
              <span className="flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5" />
                Seed Constraints ({seeds.length})
              </span>
            </button>
            <button 
              onClick={() => setActiveTab('suppressions')}
              className={`py-3 px-4 text-xs font-semibold border-b-2 transition-all ${activeTab === 'suppressions' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
            >
              <span className="flex items-center gap-2">
                <ShieldAlert className="w-3.5 h-3.5" />
                Suppression Lock ({suppressions.length})
              </span>
            </button>
            <button 
              onClick={() => setActiveTab('logs')}
              className={`py-3 px-4 text-xs font-semibold border-b-2 transition-all ${activeTab === 'logs' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
            >
              <span className="flex items-center gap-2">
                <Terminal className="w-3.5 h-3.5" />
                Agent Logs Feed
              </span>
            </button>
          </div>

          {/* TAB CONTENT: Prospects Grid */}
          {activeTab === 'opportunities' && (
            <div className="flex-1 flex overflow-hidden">
              {/* Opportunities Data Grid List */}
              <div className="flex-1 flex flex-col overflow-y-auto p-6">
                
                {/* Search / Filters Bar */}
                <div className="flex flex-wrap items-center justify-between gap-4 mb-6 bg-slate-900/20 p-3 rounded-lg border border-slate-900">
                  <div className="flex items-center gap-3 w-full md:w-auto max-w-md">
                    <input 
                      type="text" 
                      placeholder="Search by name, trade, location, website..."
                      value={filterSearch}
                      onChange={(e) => setFilterSearch(e.target.value)}
                      className="w-full text-xs bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-slate-200 focus:outline-none focus:border-blue-500 transition-colors font-mono"
                    />
                  </div>

                  {/* Filter segments (functional buttons conforming to zero-pill filter rules) */}
                  <div className="flex items-center gap-1.5 p-1 bg-slate-950 border border-slate-900 rounded-lg">
                    {['all', 'notified', 'sent', 'discarded', 'suppressed', 'discovered'].map(state => (
                      <button 
                        key={state}
                        onClick={() => setFilterStatus(state)}
                        className={`px-2.5 py-1 text-[10px] font-semibold rounded-md transition-colors whitespace-nowrap uppercase ${filterStatus === state ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                      >
                        {state === 'all' ? 'All' : state}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Table Header / Container */}
                <div className="flex-1 bg-slate-950/20 border border-slate-900 rounded-xl overflow-hidden flex flex-col">
                  {filteredProspects.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                      <Sliders className="w-8 h-8 text-slate-600 mb-3" />
                      <p className="text-sm text-slate-400 font-medium">No prospects match selected filters</p>
                      <p className="text-xs text-slate-500 mt-1">Try broadening your search or execute a new manual radar scout.</p>
                    </div>
                  ) : (
                    <div className="flex-1 overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-slate-900 bg-slate-900/20 text-slate-400 font-medium select-none">
                            <th className="p-3.5 pl-5">Business Name</th>
                            <th className="p-3.5">Trade</th>
                            <th className="p-3.5">City / Region</th>
                            <th className="p-3.5">Website</th>
                            <th className="p-3.5 text-center">Score</th>
                            <th className="p-3.5 text-right pr-5">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-900">
                          {filteredProspects.map(p => (
                            <tr 
                              key={p.id}
                              onClick={() => setSelectedProspect(p)}
                              className={`hover:bg-slate-900/30 cursor-pointer transition-colors ${selectedProspect?.id === p.id ? 'bg-slate-900/50' : ''}`}
                            >
                              <td className="p-3.5 pl-5 font-semibold text-slate-200">
                                {p.name}
                              </td>
                              <td className="p-3.5 font-mono text-[11px] text-slate-400 uppercase">
                                {p.trade.replace('_', ' ')}
                              </td>
                              <td className="p-3.5 text-slate-400 font-medium">
                                {p.city}
                              </td>
                              <td className="p-3.5 text-slate-400 truncate max-w-xs">
                                {p.website ? (
                                  <span className="flex items-center gap-1 hover:text-blue-400 transition-colors font-mono">
                                    {p.website}
                                    <ExternalLink className="w-3 h-3 inline" />
                                  </span>
                                ) : (
                                  <span className="text-slate-600 font-mono italic">None</span>
                                )}
                              </td>
                              <td className="p-3.5 text-center font-mono">
                                <span className={getScoreColor(p.score)}>
                                  {p.score}
                                </span>
                              </td>
                              <td className="p-3.5 text-right pr-5 font-mono text-[11px] font-medium">
                                <span className={getStatusColor(p.status)}>
                                  {getStatusLabel(p.status)}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              {/* Sidebar Detail Inspector Panel for Selected Prospect */}
              {selectedProspect && (
                <div className="w-96 border-l border-slate-900 bg-slate-950 p-6 overflow-y-auto flex flex-col gap-6 shrink-0">
                  <div className="flex items-center justify-between border-b border-slate-900 pb-4">
                    <h2 className="text-sm font-bold text-slate-200">Prospect Inspector</h2>
                    <button 
                      onClick={() => setSelectedProspect(null)}
                      className="text-slate-500 hover:text-slate-300 text-xs font-semibold px-2 py-1"
                    >
                      Close
                    </button>
                  </div>

                  {/* Business Basic Summary */}
                  <div>
                    <h3 className="text-base font-bold text-slate-100">{selectedProspect.name}</h3>
                    <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-slate-400">
                      <span className="font-semibold uppercase font-mono text-blue-400">
                        {selectedProspect.trade.replace('_', ' ')}
                      </span>
                      <span>·</span>
                      <span>{selectedProspect.city}</span>
                    </div>
                  </div>

                  {/* Signal Matrix Score breakdown */}
                  <div>
                    <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Signal Assessment</h4>
                    <div className="bg-slate-900/40 p-4 rounded-xl border border-slate-900 space-y-3 font-mono text-[11px]">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Total Match Score</span>
                        <span className={`text-sm ${getScoreColor(selectedProspect.score)}`}>
                          {selectedProspect.score} / 100
                        </span>
                      </div>
                      
                      {/* Breakdown sub-items */}
                      <div className="space-y-1.5 text-slate-500 border-t border-slate-900/60 pt-2.5">
                        <div className="flex items-center justify-between">
                          <span>Domain Website Signal</span>
                          <span className={selectedProspect.website ? 'text-emerald-400' : 'text-slate-600'}>
                            {selectedProspect.website ? '+25' : '0'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Valid Lead Email</span>
                          <span className={selectedProspect.email ? 'text-emerald-400' : 'text-slate-600'}>
                            {selectedProspect.email ? '+35' : '0'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Business Domain (Classic Handle)</span>
                          <span className={selectedProspect.email && /^(info|contact|office|hello|sales)/i.test(selectedProspect.email) ? 'text-emerald-400' : 'text-slate-600'}>
                            {selectedProspect.email && /^(info|contact|office|hello|sales)/i.test(selectedProspect.email) ? '+10' : '0'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Contact Phone Signal</span>
                          <span className={selectedProspect.phone ? 'text-emerald-400' : 'text-slate-600'}>
                            {selectedProspect.phone ? '+15' : '0'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Trade Sweet Spot Alignment</span>
                          <span className={["plumbing", "hvac", "landscaping", "lawn_care"].includes(selectedProspect.trade.toLowerCase()) ? 'text-emerald-400' : 'text-slate-600'}>
                            {["plumbing", "hvac", "landscaping", "lawn_care"].includes(selectedProspect.trade.toLowerCase()) ? '+15' : '0'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Metadata and Scraped contact items */}
                  <div>
                    <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Direct Scraped Contacts</h4>
                    <div className="bg-slate-900/20 rounded-lg p-3 border border-slate-900 space-y-2 font-mono text-[11px] text-slate-300">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Website:</span>
                        <span>
                          {selectedProspect.website ? (
                            <a href={`https://${selectedProspect.website}`} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline flex items-center gap-1">
                              {selectedProspect.website} <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          ) : 'Not found'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Hunter/Scraped Email:</span>
                        <span className="text-slate-200 font-semibold">{selectedProspect.email || 'No email harvested'}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Contact Phone:</span>
                        <span className="text-slate-200">{selectedProspect.phone || 'No phone harvested'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Outreach Copy Draft with copy/paste */}
                  {selectedProspect.draft_body && (
                    <div>
                      <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Outreach Message Draft</h4>
                      <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-900 space-y-3">
                        <div className="font-mono text-xs border-b border-slate-900 pb-2">
                          <span className="text-slate-500 block text-[10px]">SUBJECT:</span>
                          <span className="text-slate-200 font-bold">{selectedProspect.draft_subject}</span>
                        </div>

                        <div className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed font-sans max-h-48 overflow-y-auto bg-slate-950 p-2.5 rounded border border-slate-900 font-mono text-[11px]">
                          {selectedProspect.draft_body}
                        </div>

                        <button
                          onClick={() => copyToClipboard(selectedProspect.draft_body, selectedProspect.id)}
                          className="w-full flex items-center justify-center gap-2 py-1.5 text-xs font-semibold rounded bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
                        >
                          {copiedId === selectedProspect.id ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              Copied Draft
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5 text-slate-400" />
                              Copy Complete Text
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Action Decision triggers (If status allows action) */}
                  <div className="space-y-2 border-t border-slate-900 pt-4">
                    {selectedProspect.status !== 'sent' ? (
                      <>
                        <button
                          onClick={() => submitDecision(selectedProspect.id, 'sent')}
                          className="w-full py-2.5 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-md shadow-emerald-500/10 flex items-center justify-center gap-2"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Verify & Mark Sent (Locks Lead)
                        </button>

                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => submitDecision(selectedProspect.id, 'discard')}
                            className="py-2 text-xs font-semibold rounded-lg border border-slate-800 text-slate-400 hover:text-slate-300 hover:bg-slate-900/40 transition-colors flex items-center justify-center gap-1.5"
                          >
                            <XCircle className="w-3 h-3" />
                            Discard
                          </button>
                          <button
                            onClick={() => submitDecision(selectedProspect.id, 'suppress')}
                            className="py-2 text-xs font-semibold rounded-lg border border-red-900/40 text-red-400 hover:text-red-300 hover:bg-red-950/20 transition-colors flex items-center justify-center gap-1.5"
                          >
                            <ShieldAlert className="w-3 h-3" />
                            Suppress Domain
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="bg-emerald-950/20 border border-emerald-900/30 p-3 rounded-lg flex items-start gap-2.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs text-emerald-300 font-semibold">Lead Contacted</p>
                          <p className="text-[10px] text-slate-500 leading-normal mt-0.5">
                            This domain and email are now blocked on suppression list to guarantee zero duplicate contact issues.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB CONTENT: Seeds Setup */}
          {activeTab === 'seeds' && (
            <div className="flex-1 overflow-y-auto p-6 max-w-4xl">
              <h2 className="text-base font-bold text-slate-100 mb-1">Seed Coordinates</h2>
              <p className="text-xs text-slate-400 mb-6 leading-normal">
                Seeds determine which local regions and trades are processed during automated daily runs. The background cron agent picks matching coordinates sequentially each day.
              </p>

              {/* Create new seed form */}
              <div className="bg-slate-900/20 p-5 rounded-xl border border-slate-900 mb-8">
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-4">Add Scouting Seed Coordinate</h3>
                <form onSubmit={handleAddSeed} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Target City</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Tampa, FL"
                      value={newSeedCity}
                      onChange={(e) => setNewSeedCity(e.target.value)}
                      required
                      className="w-full text-xs bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Trade Category</label>
                    <select 
                      value={newSeedTrade} 
                      onChange={(e) => setNewSeedTrade(e.target.value)}
                      className="w-full text-xs bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
                    >
                      <option value="plumbing">Plumbing</option>
                      <option value="hvac">HVAC</option>
                      <option value="landscaping">Landscaping</option>
                      <option value="lawn_care">Lawn Care</option>
                      <option value="house_cleaning">House Cleaning</option>
                    </select>
                  </div>
                  <div className="md:col-span-2 flex gap-3">
                    <div className="flex-1">
                      <label className="text-[11px] text-slate-400 block mb-1">Scouting Notes (Optional)</label>
                      <input 
                        type="text" 
                        placeholder="e.g. Target dense suburban areas"
                        value={newSeedNotes}
                        onChange={(e) => setNewSeedNotes(e.target.value)}
                        className="w-full text-xs bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
                      />
                    </div>
                    <button 
                      type="submit"
                      className="px-4 py-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors flex items-center gap-1 whitespace-nowrap self-end"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Seed
                    </button>
                  </div>
                </form>
              </div>

              {/* Seed records list */}
              <div className="bg-slate-950/20 border border-slate-900 rounded-xl overflow-hidden">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-900 bg-slate-900/20 text-slate-400 font-medium">
                      <th className="p-3.5 pl-5">City Coordinate</th>
                      <th className="p-3.5">Category Target</th>
                      <th className="p-3.5">Context / Notes</th>
                      <th className="p-3.5 text-right pr-5">Control</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900">
                    {seeds.map(s => (
                      <tr key={s.id} className="hover:bg-slate-900/10">
                        <td className="p-3.5 pl-5 font-bold text-slate-200">{s.city}</td>
                        <td className="p-3.5 font-mono text-blue-400 uppercase text-[10px]">{s.trade}</td>
                        <td className="p-3.5 text-slate-400">{s.notes || <span className="italic text-slate-600">No notes</span>}</td>
                        <td className="p-3.5 text-right pr-5">
                          <button 
                            onClick={() => handleDeleteSeed(s.id)}
                            className="p-1 text-slate-500 hover:text-red-400 transition-colors"
                            title="Delete seed constraint"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {seeds.length === 0 && (
                      <tr>
                        <td colSpan={4} className="p-6 text-center text-slate-500">
                          No active custom seed coordinates in SQL database. Running off DEFAULT fallbacks.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB CONTENT: Suppression Register */}
          {activeTab === 'suppressions' && (
            <div className="flex-1 overflow-y-auto p-6 max-w-4xl">
              <h2 className="text-base font-bold text-slate-100 mb-1">Suppression Lock</h2>
              <p className="text-xs text-slate-400 mb-6 leading-normal">
                Avoid contacting duplicates. The radar suppresses domain, email, or name_city combinations recorded below.
              </p>

              {/* Add manual suppression form */}
              <div className="bg-slate-900/20 p-5 rounded-xl border border-slate-900 mb-8">
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-4">Add Manual Suppression Rule</h3>
                <form onSubmit={handleAddSuppression} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                  <div className="md:col-span-2">
                    <label className="text-[11px] text-slate-400 block mb-1">Suppression Key (Email or Domain or slugified name_city)</label>
                    <input 
                      type="text" 
                      placeholder="e.g. competitor.com or hello@business.com"
                      value={newSuppressKey}
                      onChange={(e) => setNewSuppressKey(e.target.value)}
                      required
                      className="w-full text-xs bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-blue-500 transition-colors font-mono"
                    />
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="text-[11px] text-slate-400 block mb-1">Suppression Reason</label>
                      <input 
                        type="text" 
                        placeholder="e.g. Manual opt-out"
                        value={newSuppressReason}
                        onChange={(e) => setNewSuppressReason(e.target.value)}
                        required
                        className="w-full text-xs bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
                      />
                    </div>
                    <button 
                      type="submit"
                      className="px-4 py-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors flex items-center gap-1 whitespace-nowrap self-end"
                    >
                      Lock Key
                    </button>
                  </div>
                </form>
              </div>

              {/* Suppression records list */}
              <div className="bg-slate-950/20 border border-slate-900 rounded-xl overflow-hidden">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-900 bg-slate-900/20 text-slate-400 font-medium">
                      <th className="p-3.5 pl-5">Suppression Target Key</th>
                      <th className="p-3.5">Triggered Reason</th>
                      <th className="p-3.5">Key Locked Date</th>
                      <th className="p-3.5 text-right pr-5">Unlock</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900 font-mono text-[11px]">
                    {suppressions.map(s => (
                      <tr key={s.key} className="hover:bg-slate-900/10">
                        <td className="p-3.5 pl-5 font-bold text-slate-300 break-all">{s.key}</td>
                        <td className="p-3.5 text-slate-400 font-sans text-xs">{s.reason}</td>
                        <td className="p-3.5 text-slate-500 text-[10px]">{new Date(s.created_at).toLocaleDateString()}</td>
                        <td className="p-3.5 text-right pr-5">
                          <button 
                            onClick={() => handleDeleteSuppression(s.key)}
                            className="p-1 text-slate-500 hover:text-red-400 transition-colors"
                            title="Remove suppression lock"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {suppressions.length === 0 && (
                      <tr>
                        <td colSpan={4} className="p-6 text-center text-slate-500 font-sans text-xs">
                          No suppressed keys found. Suppression engine is clear.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB CONTENT: Agent Running Logs terminal */}
          {activeTab === 'logs' && (
            <div className="flex-1 flex flex-col p-6 overflow-hidden">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-blue-500" />
                    Agent Console Feed
                  </h2>
                  <p className="text-xs text-slate-400 leading-normal mt-0.5">
                    Live console pipeline logging. Initiating a manual run will stream scrapers and API integrations in real-time.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button 
                    onClick={async () => {
                      const res = await fetch('/api/logs');
                      if (res.ok) setLogs(await res.json());
                    }}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs border border-slate-800 rounded text-slate-400 hover:text-white transition-all font-semibold"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Refresh Logs
                  </button>
                </div>
              </div>

              {/* Terminal View */}
              <div className="flex-1 bg-slate-950 border border-slate-900 rounded-xl p-5 font-mono text-[11px] leading-relaxed overflow-y-auto flex flex-col gap-2.5 shadow-inner">
                {logs.length === 0 ? (
                  <span className="text-slate-600 italic">No agent logs currently recorded in runtime cache...</span>
                ) : (
                  logs.slice().reverse().map(l => (
                    <div key={l.id} className="flex items-start gap-3">
                      <span className="text-slate-600 select-none">[{l.timestamp}]</span>
                      <span className={`font-semibold shrink-0 select-none ${
                        l.level === 'error' ? 'text-red-400' :
                        l.level === 'warn' ? 'text-amber-400' :
                        l.level === 'success' ? 'text-emerald-400' : 'text-blue-400'
                      }`}>
                        {l.level.toUpperCase()}
                      </span>
                      <span className="text-slate-300 break-all">{l.message}</span>
                    </div>
                  ))
                )}
                <div ref={terminalEndRef} />
              </div>
            </div>
          )}
        </main>

        {/* Right Sidebar Section: Live Telegram Mock Client */}
        <aside className="w-96 border-l border-slate-900 bg-slate-950 p-6 flex flex-col gap-5 shrink-0 overflow-y-auto select-none">
          <div className="flex items-center gap-2 text-blue-400 border-b border-slate-900 pb-3">
            <Send className="w-4 h-4 text-blue-400" />
            <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Simulador Telegram</h3>
          </div>

          <p className="text-[11px] text-slate-500 leading-normal">
            Bvelt Radar notifies founders automatically with beautifully styled, Markdown-formatted proposals sent to their phone via Telegram.
          </p>

          {/* Telegram mockup container */}
          <div className="flex-1 bg-slate-900/30 border border-slate-900 rounded-2xl flex flex-col overflow-hidden shadow-2xl relative min-h-[380px]">
            {/* Header */}
            <div className="bg-slate-900 p-3.5 flex items-center gap-3 border-b border-slate-950/60 shrink-0">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center font-bold text-white text-xs">
                BR
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-200 leading-normal">Bvelt Radar Scout Bot</h4>
                <p className="text-[10px] text-emerald-400 font-medium">online bot service</p>
              </div>
            </div>

            {/* Chat list bubble */}
            <div className="flex-1 p-3 overflow-y-auto flex flex-col justify-end gap-3 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-950/20 via-slate-950 to-slate-950">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 text-[11px] text-slate-300 leading-relaxed max-w-[90%] self-start shadow-xl space-y-2 font-sans">
                <div className="flex items-center gap-1.5 font-bold text-amber-400 text-[10px] border-b border-slate-800 pb-1.5 mb-2 uppercase">
                  <Radar className="w-3.5 h-3.5 animate-pulse" />
                  Bvelt Radar Report Dispatch
                </div>

                <p className="text-slate-400">
                  📍 Targets: <span className="text-slate-200 font-semibold">Tampa, FL</span> · Trades: <span className="text-slate-200 font-semibold">HVAC</span>
                </p>

                <p className="text-xs font-bold text-slate-200 border-t border-slate-800 pt-1.5 mt-2">
                  Top Prospects of the Day:
                </p>

                <div className="space-y-2 border-l border-blue-500 pl-2 mt-1.5">
                  <div className="text-[10px]">
                    <span className="font-bold text-slate-100">1. Tampa AC & Heating Pros</span> (95/100)<br />
                    📧 <span className="font-mono text-slate-400">service@tampabayacpros.com</span><br />
                    Subject: <span className="italic text-slate-400">Helping Tampa AC recover...</span>
                  </div>
                  <div className="text-[10px]">
                    <span className="font-bold text-slate-100">2. Green Lawn Care Tampa</span> (85/100)<br />
                    📧 <span className="font-mono text-slate-400">office@greenlawntampa.com</span><br />
                    Subject: <span className="italic text-slate-400">Recovering missed lawn...</span>
                  </div>
                </div>

                <p className="text-[10px] text-slate-500 italic mt-3 block leading-normal pt-1.5 border-t border-slate-800">
                  ⚡ Copy drafts directly or type /sent ID or /discard ID to update suppression lists.
                </p>
              </div>
            </div>

            {/* Input field */}
            <div className="p-3 bg-slate-900 border-t border-slate-950 shrink-0 flex items-center gap-2">
              <input 
                type="text" 
                placeholder="Write command..." 
                disabled
                className="flex-1 bg-slate-950 border border-slate-800 rounded-full px-4 py-1.5 text-[11px] text-slate-400 focus:outline-none"
              />
              <button disabled className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-white opacity-50 cursor-not-allowed">
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
