/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Bvelt Radar — Mobile-First Founder Control Console (PWA)
 */

import React, { useState, useEffect } from 'react';
import { 
  Radar, 
  Settings, 
  ShieldAlert, 
  Sparkles, 
  CheckCircle2, 
  XCircle, 
  RefreshCw, 
  Database,
  MapPin,
  Send,
  Zap,
  AlertTriangle,
  Info,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  ExternalLink,
  Phone,
  Mail,
  MessageSquare,
  FileText,
  Clock,
  Ban,
  Lock,
  KeyRound,
  LogOut,
  Target,
  TrendingUp,
  Briefcase,
  Compass,
  DollarSign,
  Layers,
  Activity
} from 'lucide-react';

interface Prospect {
  id: string;
  name: string;
  city: string;
  trade: string;
  website: string | null;
  phone: string | null;
  email: string | null;
  score: number;
  signals_json: string;
  score_breakdown: string;
  draft_subject: string;
  draft_body: string;
  bvelt_angle: string;
  signal_event?: string | null;
  signal_area?: string | null;
  status: string;
  outcome?: string;
  response_type?: string;
  last_reply_content?: string;
  suppression_reason?: string | null;
  cooldown_until?: string | null;
  last_contact_at?: string | null;
  created_at: string;
  updated_at?: string;
  fit_score?: number;
  intent_score?: number;
  pain_score?: number;
  ability_to_pay_score?: number;
  contactability_score?: number;
  timing_score?: number;
  evidence_score?: number;
  signal_freshness_score?: number;
  expected_value?: number;
  decision_state?: string;
  why_now_json?: string;
}

export interface Opportunity {
  id: string;
  prospect_id: string;
  tenant_id: string;
  title: string;
  strategic_score: number;
  fit_score: number;
  intent_score: number;
  pain_score: number;
  ability_to_pay_score: number;
  contactability_score: number;
  timing_score: number;
  evidence_score: number;
  signal_freshness_score: number;
  expected_value: number;
  decision_state: string;
  why_now_json: string;
  priority_tier: string;
  prospect_name?: string;
  prospect_city?: string;
  prospect_trade?: string;
  prospect_website?: string | null;
  prospect_phone?: string | null;
  prospect_email?: string | null;
  prospect_status?: string;
  draft_subject?: string;
  draft_body?: string;
  created_at: string;
}

export interface DailyMission {
  tenant_id: string;
  day: string;
  goal: string;
  markets: string;
  icp: string;
  budget: string;
  target_qualified: number;
  target_outreach: number;
  qualified_count: number;
  outreach_count: number;
  status: string;
}

export interface Mission {
  id: string;
  tenant_id: string;
  name: string;
  goal: string;
  status: string;
  markets_json: string;
  icp_json: string;
  budget_json: string;
  target_qualified: number;
  target_outreach: number;
  created_at: string;
}

export interface TenantConfig {
  tenant_id: string;
  tenant_name: string;
  industry: string;
  niche: string;
  subniches_json?: string;
  services_json?: string;
  service_areas_json?: string;
  countries_json?: string;
  regions_json?: string;
  cities_json?: string;
  languages_json?: string;
  icp_description?: string;
  icp_keywords_json?: string;
  minimum_score?: number;
  daily_outreach_limit?: number;
  allowed_markets_json?: string;
  campaign_goal?: string;
  messaging_angle?: string;
}

interface Health {
  status: string;
  telegram_configured?: boolean;
  last_telegram_ok?: boolean | string | null;
  prospects_today: number;
  prospects_by_status?: Record<string, number>;
  queue_pending?: number;
  hunter_remaining_estimate: number;
  last_run: string | null;
  last_run_diagnostics?: any;
  diagnostics?: any;
  queue?: {
    pending?: number;
    pending_or_processing: number;
    completed_jobs: number;
    failed_jobs: number;
    last_error: string | null;
  };
  timestamp: string;
}

interface StatsSummary {
  prospects_by_status: Array<{ status: string; count: number }>;
  runs_summary: { count: number; total_discovered: number; total_finalized: number };
  suppression_list_size: number;
}

export type StatusCategory = 'ALL' | 'SCOUTED' | 'QUALIFIED' | 'APPROVED' | 'QUEUED' | 'SENT' | 'REPLIED' | 'SUPPRESSED' | 'BLOCKED';

export default function App() {
  // Authentication status tracked via Worker HttpOnly session cookie
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [loginInputKey, setLoginInputKey] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  const [apiUrl, setApiUrl] = useState(() => localStorage.getItem('RADAR_API_URL') || window.location.origin);
  
  // Pipeline/Telemetries data states
  const [health, setHealth] = useState<Health | null>(null);
  const [stats, setStats] = useState<StatsSummary | null>(null);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [dailyMissions, setDailyMissions] = useState<DailyMission[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [tenants, setTenants] = useState<TenantConfig[]>([]);
  const [activeFilter, setActiveFilter] = useState<StatusCategory>('ALL');
  const [opportunityPriorityFilter, setOpportunityPriorityFilter] = useState<string>('ALL');
  const [loading, setLoading] = useState(true);
  const [errorState, setErrorState] = useState<string | null>(null);

  // Mode and Tab Navigation
  const [mainTab, setMainTab] = useState<'opportunities' | 'prospects' | 'missions' | 'tenant'>('opportunities');
  const [currentMode, setCurrentMode] = useState<'founder' | 'tenant'>('founder');
  const [selectedTenantId, setSelectedTenantId] = useState<string>('founder');
  const [inspectedOpportunity, setInspectedOpportunity] = useState<Opportunity | null>(null);

  // Run execution states
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [runState, setRunState] = useState<'idle' | 'queued' | 'running' | 'completed' | 'failed'>('idle');
  const [lastRunError, setLastRunError] = useState<string | null>(null);
  const [isTestingTelegram, setIsTestingTelegram] = useState(false);
  const [telegramToast, setTelegramToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // App UI states
  const [showConfig, setShowConfig] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [inspectedProspect, setInspectedProspect] = useState<Prospect | null>(null);
  const [contactedProspects, setContactedProspects] = useState<Record<string, boolean>>({});
  
  // PWA Install prompt trigger states
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isPwaInstalled, setIsPwaInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // Load all telemetry endpoints with HttpOnly session cookie credentials
  const fetchTelemetry = async () => {
    try {
      // 1. GET /health (public)
      const healthRes = await fetch(`${apiUrl}/health`, { credentials: 'include' }).catch(() => null);
      if (healthRes && healthRes.ok) {
        const healthData: Health = await healthRes.json();
        setHealth(healthData);
        if (healthData.queue?.last_error) {
          setLastRunError(healthData.queue.last_error);
        } else if (healthData.diagnostics?.reason && healthData.diagnostics?.discovered_raw === 0) {
          setLastRunError(`Diagnostics (${healthData.diagnostics.city || 'Discovery'}/${healthData.diagnostics.trade || 'All'}): ${healthData.diagnostics.reason}`);
        } else if (healthData.last_run_diagnostics?.reason && healthData.last_run_diagnostics?.discovered_raw === 0) {
          setLastRunError(`Diagnostics: ${healthData.last_run_diagnostics.reason}`);
        }
      }

      // 2. GET /stats (protected by Worker HttpOnly cookie)
      const statsRes = await fetch(`${apiUrl}/stats`, {
        credentials: 'include'
      }).catch(() => null);
      
      if (statsRes && statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
        setIsAuthenticated(true);
      } else if (statsRes?.status === 401) {
        setIsAuthenticated(false);
        setLoading(false);
        return;
      }

      // 3. GET /prospects (SINGLE REAL PRODUCTION ROUTE)
      let prospectsRes = await fetch(`${apiUrl}/prospects`, {
        credentials: 'include'
      }).catch(() => null);

      if (!prospectsRes || !prospectsRes.ok) {
        prospectsRes = await fetch(`${apiUrl}/api/prospects`, {
          credentials: 'include'
        }).catch(() => null);
      }
      
      if (prospectsRes && prospectsRes.ok) {
        const rawList = await prospectsRes.json();
        const pList: any[] = Array.isArray(rawList) ? rawList : (rawList.prospects || []);
        
        const normalized: Prospect[] = pList.map((p: any) => ({
          ...p,
          id: p.id || `p-${Math.random().toString(36).substring(7)}`,
          name: p.name || p.company_name || 'Sin Nombre',
          city: p.city || 'Desconocida',
          trade: p.trade || 'General',
          website: p.website || p.website_url || null,
          phone: p.phone || null,
          email: p.email || null,
          score: typeof p.score === 'number' ? p.score : (typeof p.overall_score === 'number' ? p.overall_score : (typeof p.total_score === 'number' ? p.total_score : 0)),
          signals_json: typeof p.signals_json === 'string' ? p.signals_json : JSON.stringify(p.signals || p.signals_json || {}),
          score_breakdown: p.score_breakdown || p.breakdown || (typeof p.score_details === 'string' ? p.score_details : ''),
          draft_subject: p.draft_subject || p.subject || '',
          draft_body: p.draft_body || p.body || p.draft || '',
          bvelt_angle: p.bvelt_angle || p.angle || '',
          status: p.status || 'scouted',
          created_at: p.created_at || new Date().toISOString()
        }));

        const sorted = normalized.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        setProspects(sorted);
        setIsAuthenticated(true);

        // Fetch Opportunity Intelligence data
        try {
          const oppUrl = `${apiUrl}/opportunities${selectedTenantId && selectedTenantId !== 'founder' ? `?tenant_id=${encodeURIComponent(selectedTenantId)}` : ''}`;
          const oppRes = await fetch(oppUrl, { credentials: 'include' });
          if (oppRes && oppRes.ok) {
            const oppList = await oppRes.json();
            if (Array.isArray(oppList)) setOpportunities(oppList);
          }
        } catch (e) {}

        // Fetch Missions data
        try {
          const misUrl = `${apiUrl}/missions${selectedTenantId && selectedTenantId !== 'founder' ? `?tenant_id=${encodeURIComponent(selectedTenantId)}` : ''}`;
          const misRes = await fetch(misUrl, { credentials: 'include' });
          if (misRes && misRes.ok) {
            const misData = await misRes.json();
            if (Array.isArray(misData.missions)) setMissions(misData.missions);
            if (Array.isArray(misData.daily_missions)) setDailyMissions(misData.daily_missions);
          }
        } catch (e) {}

        // Fetch Tenant Configs
        try {
          const tenRes = await fetch(`${apiUrl}/api/tenants/config`, { credentials: 'include' });
          if (tenRes && tenRes.ok) {
            const tenList = await tenRes.json();
            if (Array.isArray(tenList)) setTenants(tenList);
          }
        } catch (e) {}
      } else if (prospectsRes?.status === 401) {
        setIsAuthenticated(false);
        setLoading(false);
        return;
      }

      setErrorState(null);
      setLoading(false);
    } catch (err: any) {
      setErrorState(err.message || 'Error de conexión.');
      setLoading(false);
    }
  };

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const candidate = loginInputKey.trim();
    if (!candidate) {
      setLoginError('Ingresa la Founder Service Key');
      return;
    }

    setIsVerifying(true);
    setLoginError(null);

    try {
      const res = await fetch(`${apiUrl}/verify-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ key: candidate })
      }).catch(() => null);

      if (res && res.ok) {
        setIsAuthenticated(true);
        setLoginError(null);
        setIsVerifying(false);
        setLoginInputKey('');
        fetchTelemetry();
      } else {
        setLoginError('Clave incorrecta');
        setIsVerifying(false);
      }
    } catch (err) {
      setLoginError('Clave incorrecta');
      setIsVerifying(false);
    }
  };

  const handleLogout = async () => {
    await fetch(`${apiUrl}/logout`, { method: 'POST', credentials: 'include' }).catch(() => null);
    setIsAuthenticated(false);
    setProspects([]);
    setStats(null);
    setLoginError(null);
  };

  // On load triggers
  useEffect(() => {
    fetchTelemetry();

    // Check PWA status and setup prompts
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                         (window.navigator as any).standalone === true;
    setIsPwaInstalled(isStandalone);

    const isApple = /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());
    setIsIOS(isApple);

    const handleInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
  }, [apiUrl]);

  // Handle manual API config updates
  const saveApiSettings = (urlVal: string) => {
    localStorage.setItem('RADAR_API_URL', urlVal);
    setApiUrl(urlVal);
    setShowConfig(false);
    setLoading(true);
    fetchTelemetry();
  };

  // Copy proposal draft trigger
  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  // Run decision state mutate via endpoint
  const submitDecision = async (prospectId: string, action: string) => {
    try {
      const res = await fetch(`${apiUrl}/decision`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ id: prospectId, action, prospect_id: prospectId, event_type: action })
      });
      if (res.ok) {
        fetchTelemetry();
        if (inspectedProspect && inspectedProspect.id === prospectId) {
          setInspectedProspect(null);
        }
      }
    } catch (e) {
      alert("Error al enviar la decisión: " + e);
    }
  };

  // Instant Trigger + Non-blocking Light Polling Pipeline Execution
  const executeRadarScout = async () => {
    setIsScrubbing(true);
    setRunState('queued');
    setLastRunError(null);

    try {
      // 1. Send POST /run - returns IMMEDIATELY without waiting
      const runParam = currentMode === 'tenant' && selectedTenantId
        ? `mode=tenant&tenant_id=${encodeURIComponent(selectedTenantId)}`
        : `mode=founder`;
      const startRes = await fetch(`${apiUrl}/run?${runParam}`, {
        method: 'POST',
        credentials: 'include'
      });
      
      if (!startRes.ok) {
        const errJson = await startRes.json().catch(() => ({ error: 'Fallo al iniciar el run.' }));
        throw new Error(errJson.error || 'Fallo al iniciar el run.');
      }

      setRunState('running');

      // 2. Light background polling of /health to track Cloudflare Queue progress
      let pollCount = 0;
      const maxPolls = 15; // 30 seconds max UI polling loop
      
      const interval = setInterval(async () => {
        pollCount++;
        try {
          const checkRes = await fetch(`${apiUrl}/health`, { credentials: 'include' });
          if (checkRes.ok) {
            const checkData: Health = await checkRes.json();
            setHealth(checkData);

            if (checkData.queue) {
              if (checkData.queue.last_error) {
                setLastRunError(checkData.queue.last_error);
              }

              if (checkData.queue.pending_or_processing === 0) {
                clearInterval(interval);
                setIsScrubbing(false);
                if (checkData.queue.failed_jobs > 0 && checkData.queue.completed_jobs === 0) {
                  setRunState('failed');
                } else {
                  setRunState('completed');
                }
                fetchTelemetry(); // Refresh prospects
                return;
              } else {
                setRunState('running');
              }
            }
          }
        } catch (e) {
          console.warn("Error polling health status: ", e);
        }

        if (pollCount >= maxPolls) {
          clearInterval(interval);
          setIsScrubbing(false);
          setRunState('completed'); // Work continues on Cloudflare Workers Queues
          fetchTelemetry();
        }
      }, 2000);

    } catch (e: any) {
      setLastRunError(e.message || String(e));
      setRunState('failed');
      setIsScrubbing(false);
    }
  };

  // Test Telegram Outbound Connectivity directly to Founder Chat
  const testTelegramBot = async () => {
    setIsTestingTelegram(true);
    setTelegramToast(null);
    try {
      const res = await fetch(`${apiUrl}/api/telegram-test`, {
        method: 'GET',
        credentials: 'include'
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        const desc = data.telegram_response?.description || "Notificación de prueba enviada con éxito";
        setTelegramToast({ type: 'success', message: `✅ Telegram LIVE: ${desc}` });
      } else {
        const err = data.error || data.telegram_response?.description || `HTTP ${res.status}: Falló el test`;
        setTelegramToast({ type: 'error', message: `❌ Error Telegram: ${err}` });
      }
    } catch (e: any) {
      setTelegramToast({ type: 'error', message: `❌ Error de conexión: ${e.message}` });
    } finally {
      setIsTestingTelegram(false);
      setTimeout(() => setTelegramToast(null), 8000);
    }
  };

  // PWA Install prompt trigger
  const handlePwaInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setIsPwaInstalled(true);
        setDeferredPrompt(null);
      }
    }
  };

  // Status Category Categorizer & Badge Styles (8 Required States)
  const getCategory = (p: Prospect): StatusCategory => {
    const s = (p.status || '').toLowerCase();
    const score = typeof p.score === 'number' ? p.score : 0;
    
    const cdTime = p.cooldown_until ? new Date(p.cooldown_until).getTime() : 0;
    const isDataBugCooldown = cdTime > Date.now() + 60 * 24 * 60 * 60 * 1000;
    if (p.cooldown_until && cdTime > Date.now() && !isDataBugCooldown) {
      return 'BLOCKED';
    }
    if (p.suppression_reason || s === 'suppressed' || s === 'unsubscribed') {
      return 'SUPPRESSED';
    }
    if (s === 'blocked' || s === 'hold' || s === 'discarded' || s === 'disqualified') {
      return 'BLOCKED';
    }
    if (s === 'replied' || s === 'human_review' || s === 'positive' || s === 'question') {
      return 'REPLIED';
    }
    if (s === 'sent' || s === 'delivered') {
      return 'SENT';
    }
    if (s === 'queued' || s === 'notified' || s === 'pending') {
      return 'QUEUED';
    }
    if (s === 'approved' || s === 'drafted') {
      return 'APPROVED';
    }
    if ((s === 'qualified' || s === 'scored') && score >= 45 && p.email) {
      return 'QUALIFIED';
    }
    if (s === 'scored' || s === 'disqualified' || score < 45 || !p.email) {
      return 'BLOCKED';
    }
    return 'SCOUTED';
  };

  const getStatusBadge = (p: Prospect) => {
    const s = (p.status || '').toLowerCase();
    
    if (s === 'bounced' || s === 'bounce') {
      return { label: 'BOUNCED', color: 'bg-rose-950/80 text-rose-300 border-rose-800' };
    }
    if (s === 'out_of_office' || s === 'ooo') {
      return { label: 'OUT OF OFFICE', color: 'bg-amber-950/80 text-amber-300 border-amber-800' };
    }
    if (s === 'not_now') {
      return { label: 'NOT NOW', color: 'bg-amber-950/50 text-amber-400 border-amber-800/40' };
    }
    if (s === 'human_review') {
      return { label: 'HUMAN REVIEW', color: 'bg-orange-950/80 text-orange-300 border-orange-800' };
    }
    if (s === 'positive') {
      return { label: 'POSITIVE REPLY', color: 'bg-emerald-950/80 text-emerald-300 border-emerald-800' };
    }
    if (s === 'question') {
      return { label: 'QUESTION', color: 'bg-sky-950/80 text-sky-300 border-sky-800' };
    }
    if (s === 'converted') {
      return { label: 'CONVERTED', color: 'bg-emerald-900 text-emerald-200 border-emerald-600' };
    }
    if (s === 'disqualified' || s === 'rejected') {
      return { label: 'DISQUALIFIED', color: 'bg-zinc-900 text-zinc-500 border-zinc-800' };
    }
    
    const category = getCategory(p);
    switch (category) {
      case 'SUPPRESSED':
        return { label: s === 'unsubscribed' ? 'UNSUBSCRIBED' : 'SUPPRESSED', color: 'bg-rose-950/50 text-rose-400 border-rose-800/40' };
      case 'BLOCKED':
        return { label: p.cooldown_until ? 'COOLDOWN' : 'BLOCKED', color: 'bg-zinc-800/80 text-zinc-400 border-zinc-700/40' };
      case 'REPLIED':
        return { label: 'REPLIED', color: 'bg-orange-950/50 text-orange-400 border-orange-800/40' };
      case 'SENT':
        return { label: s === 'contacted' ? 'CONTACTED' : 'SENT', color: 'bg-emerald-950/50 text-emerald-400 border-emerald-800/40' };
      case 'QUEUED':
        return { label: 'QUEUED', color: 'bg-blue-950/50 text-blue-400 border-blue-800/40' };
      case 'APPROVED':
        return { label: 'APPROVED', color: 'bg-indigo-950/50 text-indigo-400 border-indigo-800/40' };
      case 'QUALIFIED':
        return { label: 'QUALIFIED', color: 'bg-cyan-950/50 text-cyan-400 border-cyan-800/40' };
      case 'SCOUTED':
      default:
        return { label: (p.status || 'SCOUTED').toUpperCase(), color: 'bg-slate-900 text-slate-400 border-slate-800' };
    }
  };

  // Filter prospects list based on active pill filter
  const filteredProspects = prospects.filter(p => {
    if (activeFilter === 'ALL') return true;
    return getCategory(p) === activeFilter;
  });

  // Parse evidence/signals from JSON
  const parseSignals = (prospect: Prospect): string[] => {
    try {
      const parsedMeta = JSON.parse(prospect.signals_json);
      const activeSignals: string[] = [];
      if (parsedMeta.signals) {
        if (parsedMeta.signals.emergency) activeSignals.push("24/7 / Urgencias");
        if (parsedMeta.signals.sms_gap) activeSignals.push("SMS Gap");
        if (parsedMeta.signals.quote_request) activeSignals.push("Presupuesto");
        if (parsedMeta.signals.booking) activeSignals.push("Reserva");
        if (parsedMeta.signals.multiple_areas) activeSignals.push("Multi-área");
        if (parsedMeta.signals.lead_capture) activeSignals.push("Captura Leads");
        if (parsedMeta.signals.contact_form) activeSignals.push("Contacto");
      }
      return activeSignals.slice(0, 4);
    } catch (e) {
      return [];
    }
  };

  const getEngineState = () => {
    if (isScrubbing || runState === 'running' || runState === 'queued') {
      return { label: `RUNNING (${runState.toUpperCase()})...`, color: 'bg-blue-500/10 text-blue-400 animate-pulse', border: 'border-blue-500/20' };
    }
    if (!health) {
      return { label: 'Desconectado', color: 'bg-red-500 text-red-50', border: 'border-red-500/20' };
    }
    if (health.status === 'healthy') {
      return { label: 'Radar Listo (Cloudflare Queues OK)', color: 'bg-emerald-500/10 text-emerald-400', border: 'border-emerald-500/20' };
    }
    return { label: 'Degradado', color: 'bg-amber-500/10 text-amber-400', border: 'border-amber-500/20' };
  };

  const currentEngine = getEngineState();

  const getAngleLabel = (angle: string) => {
    switch(angle) {
      case 'after_hours': return 'After-Hours Emergency';
      case 'sms_gap': return 'SMS Gap';
      case 'quote_followup': return 'Quote/Estimate';
      case 'lead_reactivation': return 'Lead Reactivation';
      default: return 'Missed Calls';
    }
  };

  const parseWhyNow = (opp: Opportunity) => {
    try {
      if (opp.why_now_json) {
        return JSON.parse(opp.why_now_json);
      }
    } catch (e) {}
    return {
      what_is_happening: "Demanda activa de servicios",
      why_now: "Ventana de oportunidad estacional inmediata",
      why_it_matters: "Fuga de ingresos por llamadas no atendidas",
      recommended_action: "Activar secuencia de prospección",
      potential_economic_outcome: "$3,400/mes proyectados",
      distinctions: {
        observed_facts: ["Sitio web operativo", "Línea telefónica disponible"],
        inferences: ["Técnicos ocupados en servicios durante llamadas"],
        estimates: ["Recuperación potencial de 3-5 trabajos mensuales"]
      }
    };
  };

  const getPriorityBadge = (tier: string) => {
    switch ((tier || '').toLowerCase()) {
      case 'high':
        return { label: 'ALTA PRIORIDAD', color: 'bg-rose-950/80 text-rose-300 border-rose-800' };
      case 'medium':
        return { label: 'MEDIA PRIORIDAD', color: 'bg-amber-950/80 text-amber-300 border-amber-800' };
      default:
        return { label: 'BAJA PRIORIDAD', color: 'bg-slate-900 text-slate-400 border-slate-800' };
    }
  };

  const [tenantForm, setTenantForm] = useState<Partial<TenantConfig>>({
    tenant_id: 'tenant_custom_01',
    tenant_name: 'Mi Empresa Cliente',
    industry: 'Commercial Services',
    niche: 'property_management',
    subniches_json: '["Facility Managers", "HOA Directors"]',
    services_json: '["Preventative Maintenance", "Emergency Repairs"]',
    service_areas_json: '["Metro Area"]',
    countries_json: '["US"]',
    regions_json: '["FL"]',
    cities_json: '["Tampa, FL", "Orlando, FL"]',
    languages_json: '["en"]',
    icp_description: 'Commercial property managers requiring rapid contractor dispatch',
    minimum_score: 50,
    daily_outreach_limit: 10,
    campaign_goal: 'Agendar llamadas de demostración',
    messaging_angle: 'fast_response_guarantee'
  });
  const [tenantSaveStatus, setTenantSaveStatus] = useState<string | null>(null);

  const saveTenantConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${apiUrl}/api/tenants/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(tenantForm)
      });
      if (res.ok) {
        setTenantSaveStatus("Configuración de tenant guardada exitosamente.");
        fetchTelemetry();
        setTimeout(() => setTenantSaveStatus(null), 4000);
      } else {
        setTenantSaveStatus("Error al guardar configuración de tenant.");
      }
    } catch (err: any) {
      setTenantSaveStatus("Error: " + err.message);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none antialiased pb-safe">
      
      {/* 1. Slim Header Zone */}
      <header className="px-5 pt-8 pb-4 border-b border-slate-900 bg-slate-950 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="bg-blue-600/10 p-2 rounded-xl border border-blue-500/10">
            <Radar className="w-5 h-5 text-blue-500" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-white leading-none">Bvelt Radar</h1>
            <p className="text-[10px] text-slate-500 font-medium mt-1">Founder Mobile Console</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!isPwaInstalled && (
            isIOS ? (
              <button 
                onClick={() => setShowIOSGuide(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg bg-slate-900 border border-slate-800 text-slate-300"
              >
                <Download className="w-3.5 h-3.5 text-blue-400" />
                Instalar
              </button>
            ) : deferredPrompt ? (
              <button 
                onClick={handlePwaInstall}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg bg-slate-900 border border-slate-800 text-slate-300"
              >
                <Download className="w-3.5 h-3.5 text-blue-400" />
                Instalar
              </button>
            ) : null
          )}

          {isAuthenticated && (
            <button 
              onClick={handleLogout}
              title="Cerrar sesión"
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-bold rounded-lg bg-rose-950/40 border border-rose-900/40 text-rose-300 hover:bg-rose-900/50 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5 text-rose-400" />
              Salir
            </button>
          )}

          <button 
            onClick={() => setShowConfig(!showConfig)}
            className="p-2 rounded-lg bg-slate-900/50 border border-slate-900 text-slate-400 hover:text-white"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Founder Access Login Modal Overlay when unauthenticated */}
      {!isAuthenticated && (
        <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-5">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-5 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="bg-blue-600/10 p-2.5 rounded-2xl border border-blue-500/20">
                <Lock className="w-6 h-6 text-blue-500" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white tracking-tight">Founder access</h2>
                <p className="text-xs text-slate-400">Consola Privada Bvelt Radar</p>
              </div>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-slate-400 block mb-1.5 font-mono uppercase tracking-wider">
                  Founder Service Key
                </label>
                <div className="relative">
                  <input
                    type="password"
                    value={loginInputKey}
                    onChange={(e) => setLoginInputKey(e.target.value)}
                    placeholder="••••••••••••••••"
                    autoFocus
                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3 text-slate-100 font-mono text-sm focus:outline-none focus:border-blue-500 transition-colors"
                  />
                  <KeyRound className="w-4 h-4 text-slate-600 absolute right-4 top-3.5" />
                </div>
              </div>

              {loginError && (
                <div className="bg-rose-950/40 border border-rose-900/50 p-3 rounded-2xl text-xs text-rose-300 font-mono flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{loginError}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isVerifying}
                className="w-full h-12 rounded-2xl bg-blue-600 hover:bg-blue-500 active:scale-95 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold text-sm transition-all shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2"
              >
                {isVerifying ? (
                  <>
                    <RefreshCw className="w-4 h-4 text-white animate-spin" />
                    Verificando...
                  </>
                ) : (
                  'Entrar'
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Config Drawer */}
      {showConfig && (
        <div className="bg-slate-900/95 border-b border-slate-800 p-5 space-y-4 font-mono text-xs">
          <h3 className="font-bold text-slate-300 text-xs">Ajustes del Fundador (Mobile Cache)</h3>
          <div className="space-y-3">
            <div>
              <label className="text-[10px] text-slate-500 block mb-1">API URL Endpoint</label>
              <input 
                type="text" 
                defaultValue={apiUrl}
                id="cfg-url"
                className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-2 text-slate-200 focus:outline-none"
              />
            </div>
            <div className="flex gap-2.5 pt-2">
              <button 
                onClick={() => {
                  const urlVal = (document.getElementById('cfg-url') as HTMLInputElement).value;
                  saveApiSettings(urlVal);
                }}
                className="flex-1 py-2 text-center bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg"
              >
                Guardar Cambios
              </button>
              <button 
                onClick={() => setShowConfig(false)}
                className="px-4 py-2 border border-slate-800 text-slate-400 rounded-lg"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main scrolling viewport */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

        {/* Connection or Run Errors */}
        {(errorState || lastRunError) && (
          <div className="bg-rose-950/20 border border-rose-900/40 rounded-2xl p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
            <div className="flex-1 space-y-1">
              <h4 className="text-xs font-bold text-rose-300">Aviso del Sistema</h4>
              <p className="text-[11px] text-slate-400 leading-relaxed">{lastRunError || errorState}</p>
              <button 
                onClick={() => {
                  setLoading(true);
                  fetchTelemetry();
                }}
                className="text-[11px] font-bold text-blue-400 flex items-center gap-1 pt-1.5"
              >
                <RefreshCw className="w-3 h-3 text-blue-400 animate-spin" /> Actualizar Estado
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <RefreshCw className="w-6 h-6 text-blue-500 animate-spin" />
            <p className="text-xs text-slate-500 font-medium">Sincronizando estado...</p>
          </div>
        ) : (
          <>
            {/* Engine Status Bar */}
            <div className={`p-4 rounded-2xl border ${currentEngine.border} ${currentEngine.color} flex items-center justify-between`}>
              <div className="space-y-1">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-bold">Estado del Engine</span>
                <span className="text-xs font-bold text-slate-100 flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  {currentEngine.label}
                </span>
              </div>
              <div className="text-right text-[11px] font-mono text-slate-400">
                {health?.last_run ? (
                  <span>Run: {new Date(health.last_run).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                ) : (
                  <span>Último Run: --:--</span>
                )}
              </div>
            </div>

            {/* Action Trigger Button & Autonomous Daily Cron Label */}
            <div className="space-y-2">
              <button
                onClick={executeRadarScout}
                disabled={isScrubbing}
                className={`w-full h-14 min-h-[48px] rounded-2xl bg-blue-600 hover:bg-blue-500 active:scale-95 disabled:bg-slate-900 disabled:text-slate-500 font-bold text-sm tracking-wide transition-all shadow-xl shadow-blue-600/10 flex items-center justify-center gap-3`}
              >
                <RefreshCw className={`w-4 h-4 ${isScrubbing ? 'animate-spin' : ''}`} />
                {isScrubbing ? 'CORRIENDO EN CLOUDFLARE...' : '▶ CORRER RADAR AHORA'}
              </button>
              
              <div className="flex items-center justify-between px-2 text-[11px] font-mono text-slate-400">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  <span>Cron: <strong className="text-slate-200">Autónomo diario (12:00 UTC)</strong></span>
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 font-semibold bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-800/40">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  Activo
                </span>
              </div>

              {/* Telegram Test Trigger */}
              <div className="pt-1">
                <button
                  onClick={testTelegramBot}
                  disabled={isTestingTelegram}
                  className="w-full py-2.5 px-3 rounded-xl bg-slate-900/80 hover:bg-slate-800/80 active:scale-[0.98] border border-slate-800 text-slate-300 text-xs font-mono font-bold flex items-center justify-center gap-2 transition-all"
                >
                  <Send className={`w-3.5 h-3.5 text-sky-400 ${isTestingTelegram ? 'animate-bounce' : ''}`} />
                  {isTestingTelegram ? 'ENVIANDO TEST A TELEGRAM...' : 'Probar Telegram (LIVE)'}
                </button>
              </div>

              {/* Telegram Test Toast */}
              {telegramToast && (
                <div className={`p-3 rounded-xl border text-xs font-mono flex items-center justify-between ${
                  telegramToast.type === 'success' 
                    ? 'bg-emerald-950/40 border-emerald-800/50 text-emerald-300' 
                    : 'bg-rose-950/40 border-rose-800/50 text-rose-300'
                }`}>
                  <span>{telegramToast.message}</span>
                  <button 
                    onClick={() => setTelegramToast(null)} 
                    className="text-slate-400 hover:text-white text-xs px-1"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>

            {/* Mode Selector & Main Navigation Tabs */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between bg-slate-900/60 p-2 rounded-xl border border-slate-800">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => { setCurrentMode('founder'); setSelectedTenantId('founder'); }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold font-mono transition-all ${currentMode === 'founder' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
                  >
                    Founder Mode
                  </button>
                  <button
                    onClick={() => {
                      setCurrentMode('tenant');
                      if (tenants.length > 0 && selectedTenantId === 'founder') {
                        setSelectedTenantId(tenants[0].tenant_id);
                      }
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold font-mono transition-all ${currentMode === 'tenant' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
                  >
                    Tenant Mode
                  </button>
                </div>
                {currentMode === 'tenant' && tenants.length > 0 && (
                  <select
                    value={selectedTenantId}
                    onChange={(e) => setSelectedTenantId(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs text-slate-200 font-mono focus:outline-none"
                  >
                    {tenants.map(t => (
                      <option key={t.tenant_id} value={t.tenant_id}>{t.tenant_name || t.tenant_id}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* 4 Main View Tabs */}
              <div className="grid grid-cols-4 gap-1 bg-slate-900/40 p-1 rounded-xl border border-slate-900 font-mono text-[11px] font-bold">
                <button
                  onClick={() => setMainTab('opportunities')}
                  className={`py-2 rounded-lg flex items-center justify-center gap-1 transition-all ${mainTab === 'opportunities' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span className="truncate">Oportunidades</span>
                </button>
                <button
                  onClick={() => setMainTab('prospects')}
                  className={`py-2 rounded-lg flex items-center justify-center gap-1 transition-all ${mainTab === 'prospects' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
                >
                  <Database className="w-3.5 h-3.5" />
                  <span className="truncate">Prospectos</span>
                </button>
                <button
                  onClick={() => setMainTab('missions')}
                  className={`py-2 rounded-lg flex items-center justify-center gap-1 transition-all ${mainTab === 'missions' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
                >
                  <Target className="w-3.5 h-3.5" />
                  <span className="truncate">Misiones</span>
                </button>
                <button
                  onClick={() => setMainTab('tenant')}
                  className={`py-2 rounded-lg flex items-center justify-center gap-1 transition-all ${mainTab === 'tenant' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
                >
                  <Briefcase className="w-3.5 h-3.5" />
                  <span className="truncate">Tenant</span>
                </button>
              </div>
            </div>

            {/* TAB 1: OPPORTUNITIES INTELLIGENCE (RADAR FUSION MAX) */}
            {mainTab === 'opportunities' && (
              <div className="space-y-4">
                {/* Metric Scoreboard */}
                <div className="grid grid-cols-3 gap-2.5 font-mono text-slate-200">
                  <div className="bg-slate-900/40 p-3 rounded-2xl border border-slate-900">
                    <span className="text-[9px] text-slate-500 block uppercase font-sans font-bold">Oportunidades</span>
                    <span className="text-lg font-bold tracking-tight text-slate-100 tabular-nums">
                      {opportunities.length}
                    </span>
                  </div>
                  <div className="bg-slate-900/40 p-3 rounded-2xl border border-slate-900">
                    <span className="text-[9px] text-slate-500 block uppercase font-sans font-bold">Alta Prioridad</span>
                    <span className="text-lg font-bold tracking-tight text-rose-400 tabular-nums">
                      {opportunities.filter(o => o.priority_tier === 'high' || (o.strategic_score || 0) >= 80).length}
                    </span>
                  </div>
                  <div className="bg-slate-900/40 p-3 rounded-2xl border border-slate-900">
                    <span className="text-[9px] text-slate-500 block uppercase font-sans font-bold">Pipeline EV</span>
                    <span className="text-lg font-bold tracking-tight text-emerald-400 tabular-nums">
                      ${opportunities.reduce((acc, o) => acc + (o.expected_value || 0), 0).toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Priority filter pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-[10px] font-mono font-bold">
                  {(['ALL', 'high', 'medium', 'low']).map(pTier => (
                    <button
                      key={pTier}
                      onClick={() => setOpportunityPriorityFilter(pTier)}
                      className={`px-3 py-1 rounded-lg border whitespace-nowrap transition-all uppercase ${
                        opportunityPriorityFilter === pTier
                          ? 'bg-blue-600 border-blue-500 text-white'
                          : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {pTier === 'ALL' ? 'TODAS' : pTier === 'high' ? 'ALTA' : pTier === 'medium' ? 'MEDIA' : 'BAJA'}
                    </button>
                  ))}
                </div>

                {opportunities.filter(o => opportunityPriorityFilter === 'ALL' || o.priority_tier === opportunityPriorityFilter).length === 0 ? (
                  <div className="text-center py-10 bg-slate-900/10 rounded-2xl border border-slate-900 p-5">
                    <Sparkles className="w-6 h-6 text-slate-600 mx-auto mb-2" />
                    <p className="text-xs text-slate-500 leading-normal">
                      No hay oportunidades identificadas en este filtro. Ejecuta el Radar para activar el Opportunity Intelligence engine.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {opportunities
                      .filter(o => opportunityPriorityFilter === 'ALL' || o.priority_tier === opportunityPriorityFilter)
                      .map(opp => {
                        const whyNow = parseWhyNow(opp);
                        const pBadge = getPriorityBadge(opp.priority_tier);
                        const isExpanded = inspectedOpportunity?.id === opp.id;

                        return (
                          <div
                            key={opp.id}
                            onClick={() => setInspectedOpportunity(isExpanded ? null : opp)}
                            className="bg-slate-900/40 border border-slate-900 rounded-2xl p-4 space-y-3 transition-colors active:bg-slate-900/60"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <h4 className="text-xs font-bold text-slate-100">{opp.title || opp.prospect_name}</h4>
                                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold border ${pBadge.color}`}>
                                    {pBadge.label}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono">
                                  <span className="uppercase text-blue-400 font-semibold">{opp.prospect_trade || 'General'}</span>
                                  <span>·</span>
                                  <span>{opp.prospect_city}</span>
                                  <span>·</span>
                                  <span className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 uppercase">{opp.decision_state || 'identificada'}</span>
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <div className="text-xs font-mono font-bold text-emerald-400">
                                  {opp.strategic_score}/100
                                </div>
                                <div className="text-[10px] font-mono font-semibold text-sky-400">
                                  +${opp.expected_value || 3400} EV
                                </div>
                              </div>
                            </div>

                            {/* Strategic Scoring Breakdown Badges */}
                            <div className="grid grid-cols-4 gap-1 text-[9px] font-mono bg-slate-950 p-2 rounded-xl border border-slate-900/80 text-center">
                              <div><span className="text-slate-500 block">Fit</span><strong className="text-slate-200">{opp.fit_score || 0}</strong></div>
                              <div><span className="text-slate-500 block">Pain</span><strong className="text-rose-400">{opp.pain_score || 0}</strong></div>
                              <div><span className="text-slate-500 block">Timing</span><strong className="text-amber-400">{opp.timing_score || 0}</strong></div>
                              <div><span className="text-slate-500 block">Evidencia</span><strong className="text-emerald-400">{opp.evidence_score || 0}</strong></div>
                            </div>

                            {/* Why Now Highlight */}
                            <div className="bg-blue-950/20 border border-blue-900/30 p-2.5 rounded-xl space-y-1 text-[11px]">
                              <div className="flex items-center gap-1.5 text-blue-400 font-bold text-[10px]">
                                <Clock className="w-3 h-3" />
                                <span>¿POR QUÉ AHORA?</span>
                              </div>
                              <p className="text-slate-300 leading-snug">{whyNow.why_now}</p>
                            </div>

                            {/* Expandable Why Now & Evidence Chain Drawer */}
                            {isExpanded && (
                              <div className="pt-2 border-t border-slate-800 space-y-3 text-xs" onClick={(e) => e.stopPropagation()}>
                                <div className="space-y-2 bg-slate-950 p-3 rounded-xl border border-slate-900 font-mono text-[10px]">
                                  <div className="space-y-1">
                                    <span className="text-slate-500 font-bold uppercase block">Situación Observada:</span>
                                    <p className="text-slate-300">{whyNow.what_is_happening}</p>
                                  </div>
                                  <div className="space-y-1 pt-1">
                                    <span className="text-slate-500 font-bold uppercase block">Por qué importa:</span>
                                    <p className="text-slate-300">{whyNow.why_it_matters}</p>
                                  </div>
                                  <div className="space-y-1 pt-1">
                                    <span className="text-slate-500 font-bold uppercase block">Acción con sentido:</span>
                                    <p className="text-blue-300 font-bold">{whyNow.recommended_action}</p>
                                  </div>
                                  <div className="space-y-1 pt-1">
                                    <span className="text-slate-500 font-bold uppercase block">Resultado económico potencial:</span>
                                    <p className="text-emerald-400 font-bold">{whyNow.potential_economic_outcome}</p>
                                  </div>
                                </div>

                                {/* Distinctions: Facts vs Inferences vs Estimates */}
                                <div className="bg-slate-950 p-3 rounded-xl border border-slate-900 text-[10px] space-y-2">
                                  <span className="text-slate-500 font-bold uppercase font-mono block">Trazabilidad de Evidencia:</span>
                                  {whyNow.distinctions?.observed_facts && (
                                    <div className="space-y-0.5">
                                      <span className="text-emerald-400 font-bold">✓ Hechos Observados:</span>
                                      <ul className="list-disc list-inside text-slate-300 pl-1">
                                        {whyNow.distinctions.observed_facts.map((f: string, fIdx: number) => (
                                          <li key={fIdx}>{f}</li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                  {whyNow.distinctions?.inferences && (
                                    <div className="space-y-0.5 pt-1">
                                      <span className="text-amber-400 font-bold">⚡ Inferencias Estratégicas:</span>
                                      <ul className="list-disc list-inside text-slate-300 pl-1">
                                        {whyNow.distinctions.inferences.map((inf: string, iIdx: number) => (
                                          <li key={iIdx}>{inf}</li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                  {whyNow.distinctions?.estimates && (
                                    <div className="space-y-0.5 pt-1">
                                      <span className="text-sky-400 font-bold">📊 Estimaciones Económicas:</span>
                                      <ul className="list-disc list-inside text-slate-300 pl-1">
                                        {whyNow.distinctions.estimates.map((est: string, eIdx: number) => (
                                          <li key={eIdx}>{est}</li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                </div>

                                {/* Action Buttons for Opportunity */}
                                <div className="grid grid-cols-2 gap-2 pt-1 font-mono">
                                  <button
                                    onClick={() => submitDecision(opp.prospect_id, 'sent')}
                                    className="h-10 text-xs font-semibold rounded-lg bg-emerald-600/20 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-600 hover:text-white transition-colors"
                                  >
                                    ✓ Ejecutar Acción
                                  </button>
                                  <button
                                    onClick={() => submitDecision(opp.prospect_id, 'discard')}
                                    className="h-10 text-xs font-semibold rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-white"
                                  >
                                    ✕ Descartar
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: PROSPECT DIRECTORY (LEGACY COMPATIBLE) */}
            {mainTab === 'prospects' && (
              <div className="space-y-3">
                {/* Metric Scoreboard */}
                <div className="grid grid-cols-2 gap-3.5 font-mono text-slate-200">
                  <div className="bg-slate-900/40 p-4 rounded-2xl border border-slate-900">
                    <span className="text-[10px] text-slate-500 block uppercase font-sans font-bold">Total Encontrados</span>
                    <span className="text-xl font-bold tracking-tight text-slate-100 tabular-nums">
                      {prospects.length}
                    </span>
                  </div>
                  <div className="bg-slate-900/40 p-4 rounded-2xl border border-slate-900">
                    <span className="text-[10px] text-slate-500 block uppercase font-sans font-bold">Pendientes Aprobar</span>
                    <span className="text-xl font-bold tracking-tight text-purple-400 tabular-nums">
                      {prospects.filter(p => getCategory(p) === 'APPROVED' || getCategory(p) === 'QUEUED').length}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between border-b border-slate-900 pb-2">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Directorio de Prospectos Real</h3>
                  <Database className="w-3.5 h-3.5 text-slate-500" />
                </div>

                {/* Status Filter Pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-[10px] font-mono font-bold">
                  {(['ALL', 'SCOUTED', 'QUALIFIED', 'APPROVED', 'QUEUED', 'SENT', 'REPLIED', 'SUPPRESSED', 'BLOCKED'] as StatusCategory[]).map(cat => (
                    <button
                      key={cat}
                      onClick={() => setActiveFilter(cat)}
                      className={`px-2.5 py-1 rounded-lg border whitespace-nowrap transition-all ${
                        activeFilter === cat 
                          ? 'bg-blue-600 border-blue-500 text-white' 
                          : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                {filteredProspects.length === 0 ? (
                  <div className="text-center py-10 bg-slate-900/10 rounded-2xl border border-slate-900 p-5">
                    <Info className="w-6 h-6 text-slate-600 mx-auto mb-2" />
                    <p className="text-xs text-slate-500 leading-normal">
                      No se encontraron prospectos en la categoría '{activeFilter}'. Ejecuta el radar para prospectar.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredProspects.map(p => {
                      const badge = getStatusBadge(p);
                      const signalsList = parseSignals(p);
                      const isExpanded = inspectedProspect?.id === p.id;

                      return (
                        <div 
                          key={p.id}
                          onClick={() => setInspectedProspect(isExpanded ? null : p)}
                          className="bg-slate-900/30 border border-slate-900 rounded-2xl p-4 space-y-3 active:bg-slate-900/50 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <h4 className="text-xs font-bold text-slate-100">{p.name}</h4>
                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold border ${badge.color}`}>
                                  {badge.label}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-mono">
                                <span className="uppercase text-blue-400 font-semibold">{p.trade}</span>
                                <span>·</span>
                                <span>{p.city}</span>
                              </div>
                            </div>
                            <span className="text-xs font-mono font-bold text-emerald-400 shrink-0">
                              {p.score}/100
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                            {p.signal_event && p.signal_area && (
                              <span className="px-2 py-0.5 rounded bg-amber-950/40 text-[9px] text-amber-300 font-mono border border-amber-800/40 font-bold">
                                ⚡ Clima: {p.signal_event} ({p.signal_area})
                              </span>
                            )}
                            <span className="px-2 py-0.5 rounded bg-blue-900/30 text-[9px] text-blue-400 font-mono border border-blue-500/10">
                              Ángulo: {getAngleLabel(p.bvelt_angle)}
                            </span>
                            {signalsList.map((sig, sIdx) => (
                              <span key={sIdx} className="px-1.5 py-0.5 rounded bg-rose-950/20 text-[9px] text-rose-300 font-mono border border-rose-500/10">
                                • {sig}
                              </span>
                            ))}
                          </div>

                          <div className="flex flex-wrap items-center gap-2 pt-1 font-mono text-[11px]">
                            {p.email && (
                              <a 
                                href={`mailto:${p.email}?subject=${encodeURIComponent(p.draft_subject || '')}&body=${encodeURIComponent(p.draft_body || '')}`}
                                target="_blank" 
                                rel="noreferrer" 
                                className="px-2.5 py-1 rounded-lg bg-blue-950/50 border border-blue-800/40 text-blue-300 hover:bg-blue-900/60 flex items-center gap-1 font-bold"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setContactedProspects(prev => ({ ...prev, [p.id]: true }));
                                }}
                              >
                                <Mail className="w-3.5 h-3.5 text-blue-400" />
                                Correo
                              </a>
                            )}
                            {p.phone && (
                              <a 
                                href={`https://wa.me/1${p.phone.replace(/\D/g, '')}?text=${encodeURIComponent(p.draft_body || '')}`}
                                target="_blank" 
                                rel="noreferrer" 
                                className="px-2.5 py-1 rounded-lg bg-emerald-950/50 border border-emerald-800/40 text-emerald-300 hover:bg-emerald-900/60 flex items-center gap-1 font-bold"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setContactedProspects(prev => ({ ...prev, [p.id]: true }));
                                }}
                              >
                                <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
                                WhatsApp
                              </a>
                            )}
                            {p.phone && (
                              <a 
                                href={`tel:${p.phone}`}
                                className="px-2.5 py-1 rounded-lg bg-indigo-950/50 border border-indigo-800/40 text-indigo-300 hover:bg-indigo-900/60 flex items-center gap-1 font-bold"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setContactedProspects(prev => ({ ...prev, [p.id]: true }));
                                }}
                              >
                                <Phone className="w-3.5 h-3.5 text-indigo-400" />
                                Llamar
                              </a>
                            )}
                            {p.website && (
                              <a 
                                href={`https://${p.website}`} 
                                target="_blank" 
                                rel="noreferrer" 
                                className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-blue-400 flex items-center gap-1" 
                                onClick={(e) => e.stopPropagation()}
                              >
                                <ExternalLink className="w-3 h-3 text-slate-500" />
                                {p.website}
                              </a>
                            )}
                          </div>

                          {(contactedProspects[p.id] || isExpanded) && (
                            <div className="pt-2 border-t border-slate-900/80 space-y-2" onClick={(e) => e.stopPropagation()}>
                              <span className="text-[10px] font-mono text-slate-400 font-bold uppercase block">Registrar Resultado:</span>
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                <button
                                  onClick={() => submitDecision(p.id, 'sent')}
                                  className="py-2 px-2.5 text-xs font-bold font-mono rounded-lg bg-blue-900/30 border border-blue-700/40 text-blue-300 hover:bg-blue-800/50 transition-colors"
                                >
                                  Enviado
                                </button>
                                <button
                                  onClick={() => submitDecision(p.id, 'replied')}
                                  className="py-2 px-2.5 text-xs font-bold font-mono rounded-lg bg-amber-900/30 border border-amber-700/40 text-amber-300 hover:bg-amber-800/50 transition-colors"
                                >
                                  Respondió
                                </button>
                                <button
                                  onClick={() => submitDecision(p.id, 'demo')}
                                  className="py-2 px-2.5 text-xs font-bold font-mono rounded-lg bg-purple-900/30 border border-purple-700/40 text-purple-300 hover:bg-purple-800/50 transition-colors"
                                >
                                  Demo
                                </button>
                                <button
                                  onClick={() => submitDecision(p.id, 'won')}
                                  className="py-2 px-2.5 text-xs font-bold font-mono rounded-lg bg-emerald-900/30 border border-emerald-700/40 text-emerald-300 hover:bg-emerald-800/50 transition-colors"
                                >
                                  Ganado
                                </button>
                              </div>
                            </div>
                          )}

                          {(p.suppression_reason || p.cooldown_until) && (
                            <div className={`p-2 rounded-xl text-[10px] font-mono flex items-center gap-2 ${p.cooldown_until && new Date(p.cooldown_until).getTime() > Date.now() + 60 * 24 * 60 * 60 * 1000 ? 'bg-amber-950/30 border border-amber-900/40 text-amber-300' : 'bg-rose-950/20 border border-rose-900/30 text-rose-300'}`}>
                              <Ban className={`w-3.5 h-3.5 shrink-0 ${p.cooldown_until && new Date(p.cooldown_until).getTime() > Date.now() + 60 * 24 * 60 * 60 * 1000 ? 'text-amber-400' : 'text-rose-400'}`} />
                              <span>
                                {p.suppression_reason 
                                  ? `Supresión: ${p.suppression_reason}` 
                                  : `Cooldown activo hasta ${new Date(p.cooldown_until!).toLocaleDateString()}`}
                              </span>
                            </div>
                          )}

                          {isExpanded && (
                            <div className="pt-3.5 border-t border-slate-900/80 space-y-3 font-sans text-xs" onClick={(e) => e.stopPropagation()}>
                              {p.score_breakdown && (
                                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-900 font-mono text-[10px] text-slate-400 space-y-1">
                                  <span className="text-slate-500 font-bold uppercase block">Score Breakdown:</span>
                                  <div>{p.score_breakdown}</div>
                                </div>
                              )}
                              {p.draft_body && (
                                <div className="bg-slate-950 p-3 rounded-xl border border-slate-900 font-mono text-[11px] text-slate-300 whitespace-pre-wrap leading-relaxed">
                                  <span className="text-slate-500 font-bold block mb-1 text-[9px] uppercase">Asunto: {p.draft_subject}</span>
                                  {p.draft_body}
                                </div>
                              )}
                              <div className="grid grid-cols-2 gap-2 pt-1 font-mono">
                                <button
                                  onClick={() => submitDecision(p.id, 'sent')}
                                  className="h-10 text-xs font-semibold rounded-lg bg-emerald-600/20 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-600 hover:text-white transition-colors"
                                >
                                  ✓ Enviar (Lock)
                                </button>
                                <button
                                  onClick={() => submitDecision(p.id, 'discard')}
                                  className="h-10 text-xs font-semibold rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-white"
                                >
                                  ✕ Descartar
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: MISSIONS SYSTEM (RADAR FUSION MAX) */}
            {mainTab === 'missions' && (
              <div className="space-y-4 font-mono">
                {dailyMissions.map((dm, dIdx) => (
                  <div key={dIdx} className="bg-slate-900/40 border border-slate-800 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <div className="flex items-center gap-2">
                        <Target className="w-4 h-4 text-blue-400" />
                        <h4 className="text-xs font-bold text-white uppercase">Misión Diaria ({dm.day})</h4>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-emerald-950/60 border border-emerald-800 text-emerald-300">
                        {dm.status}
                      </span>
                    </div>

                    <div className="space-y-1 text-xs">
                      <span className="text-[10px] text-slate-500 block uppercase">Objetivo Operativo:</span>
                      <p className="text-slate-200">{dm.goal}</p>
                    </div>

                    <div className="space-y-2 pt-2">
                      <div>
                        <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                          <span>Prospectos Calificados:</span>
                          <span className="text-blue-400 font-bold">{dm.qualified_count} / {dm.target_qualified}</span>
                        </div>
                        <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
                          <div 
                            className="bg-blue-600 h-full rounded-full transition-all"
                            style={{ width: `${Math.min(100, ((dm.qualified_count || 0) / (dm.target_qualified || 1)) * 100)}%` }}
                          />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                          <span>Outreach / Mensajes Enviados:</span>
                          <span className="text-emerald-400 font-bold">{dm.outreach_count} / {dm.target_outreach}</span>
                        </div>
                        <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
                          <div 
                            className="bg-emerald-500 h-full rounded-full transition-all"
                            style={{ width: `${Math.min(100, ((dm.outreach_count || 0) / (dm.target_outreach || 1)) * 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[10px] pt-1 text-slate-400 border-t border-slate-850">
                      <div><strong className="text-slate-500 block">Mercados:</strong> {dm.markets}</div>
                      <div><strong className="text-slate-500 block">Presupuesto:</strong> {dm.budget}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* TAB 4: MULTI-TENANT CONFIGURATION */}
            {mainTab === 'tenant' && (
              <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-4 space-y-4 font-mono text-xs">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <div className="flex items-center gap-2">
                    <Briefcase className="w-4 h-4 text-indigo-400" />
                    <h4 className="text-xs font-bold text-white uppercase">Configuración Multi-Tenant</h4>
                  </div>
                  <span className="text-[10px] text-slate-500 font-bold uppercase">Modo Tenant Independiente</span>
                </div>

                <form onSubmit={saveTenantConfig} className="space-y-3">
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-1">Tenant ID</label>
                    <input 
                      type="text" 
                      value={tenantForm.tenant_id || ''} 
                      onChange={(e) => setTenantForm(prev => ({ ...prev, tenant_id: e.target.value }))}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-1">Nombre Comercial del Tenant</label>
                    <input 
                      type="text" 
                      value={tenantForm.tenant_name || ''} 
                      onChange={(e) => setTenantForm(prev => ({ ...prev, tenant_name: e.target.value }))}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-slate-500 block mb-1">Industria</label>
                      <input 
                        type="text" 
                        value={tenantForm.industry || ''} 
                        onChange={(e) => setTenantForm(prev => ({ ...prev, industry: e.target.value }))}
                        className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-500 block mb-1">Nicho Objetivo</label>
                      <input 
                        type="text" 
                        value={tenantForm.niche || ''} 
                        onChange={(e) => setTenantForm(prev => ({ ...prev, niche: e.target.value }))}
                        className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-1">Descripción del ICP</label>
                    <textarea 
                      value={tenantForm.icp_description || ''} 
                      onChange={(e) => setTenantForm(prev => ({ ...prev, icp_description: e.target.value }))}
                      rows={2}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-slate-500 block mb-1">Score Mínimo</label>
                      <input 
                        type="number" 
                        value={tenantForm.minimum_score || 50} 
                        onChange={(e) => setTenantForm(prev => ({ ...prev, minimum_score: parseInt(e.target.value, 10) }))}
                        className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-500 block mb-1">Límite Diario de Outreach</label>
                      <input 
                        type="number" 
                        value={tenantForm.daily_outreach_limit || 10} 
                        onChange={(e) => setTenantForm(prev => ({ ...prev, daily_outreach_limit: parseInt(e.target.value, 10) }))}
                        className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200"
                      />
                    </div>
                  </div>

                  {tenantSaveStatus && (
                    <div className="p-2 rounded bg-blue-950/40 border border-blue-800 text-blue-300 text-[11px]">
                      {tenantSaveStatus}
                    </div>
                  )}

                  <button
                    type="submit"
                    className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 font-bold rounded-xl text-white transition-all shadow-md shadow-blue-600/20"
                  >
                    Guardar Configuración del Tenant
                  </button>
                </form>
              </div>
            )}
          </>
        )}
      </div>

      {/* iOS Safari PWA Install Modal guide */}
      {showIOSGuide && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-end justify-center p-5 animate-fade-in" onClick={() => setShowIOSGuide(false)}>
          <div className="w-full max-w-sm rounded-3xl bg-slate-900 border border-slate-800 p-6 space-y-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Download className="w-4 h-4 text-blue-500" />
                Instalar en iPhone / iPad
              </h3>
              <button onClick={() => setShowIOSGuide(false)} className="text-slate-500 text-xs font-semibold px-2 py-1">Cerrar</button>
            </div>
            
            <p className="text-xs text-slate-400 leading-relaxed space-y-2">
              Sigue estos sencillos pasos para instalar Bvelt Radar como una aplicación nativa en tu móvil:
            </p>
            
            <div className="space-y-3 text-xs text-slate-300 font-mono bg-slate-950 p-4 rounded-2xl border border-slate-800">
              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-slate-900 border border-slate-800 text-[10px] flex items-center justify-center font-bold text-blue-400 shrink-0">1</span>
                <span className="leading-relaxed">Pulsa el botón de <strong>Compartir</strong> en la barra inferior de Safari.</span>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-slate-900 border border-slate-800 text-[10px] flex items-center justify-center font-bold text-blue-400 shrink-0">2</span>
                <span className="leading-relaxed">Desliza hacia abajo y pulsa sobre <strong>Añadir a la pantalla de inicio</strong>.</span>
              </div>
            </div>

            <button 
              onClick={() => setShowIOSGuide(false)}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-2xl text-xs"
            >
              ¡Entendido!
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
