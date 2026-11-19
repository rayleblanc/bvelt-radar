/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Bvelt Radar — Mobile-First Founder Control Console (PWA)
 */

import React, { useState, useEffect, useMemo } from 'react';
import { toWhatsAppUrl, toSmsUrl, toTelUrl } from './phoneUtils';
import { 
  BarChart, Bar, AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts';
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
  attack_kit?: any;
  contactability?: {
    commercial_prospect: boolean;
    contact_available: boolean;
    channels: { email: boolean; phone: boolean; whatsapp_direct: boolean; website: boolean };
    send_authorized: boolean;
    send_state?: "authorized" | "confirmed" | "not_authorized";
  };
}

interface TenantConfig {
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

export interface TenantValidationResult {
  isValid: boolean;
  hasErrors: boolean;
  hasWarnings: boolean;
  fieldErrors: {
    niche?: string;
    icp_description?: string;
    cities?: string;
  };
  alignmentStatus: 'aligned' | 'misaligned' | 'missing_fields';
  messages: { text: string; severity: 'error' | 'warning' | 'success' }[];
  suggestedIcp?: string;
}

export function validateTenantAlignment(
  tenantForm: Partial<TenantConfig>,
  tenantCitiesText: string
): TenantValidationResult {
  const niche = (tenantForm.niche || '').trim().toLowerCase();
  const icp = (tenantForm.icp_description || '').trim();
  const cities = (tenantCitiesText || '').trim();

  const fieldErrors: { niche?: string; icp_description?: string; cities?: string } = {};
  const messages: { text: string; severity: 'error' | 'warning' | 'success' }[] = [];

  // 1. Check Missing Fields
  if (!niche) {
    fieldErrors.niche = "El Nicho Objetivo es obligatorio.";
    messages.push({ text: "Falta el Nicho Objetivo (ej: property_management, hvac, roofing, solar).", severity: 'error' });
  }

  if (!icp) {
    fieldErrors.icp_description = "La Descripción del ICP es obligatoria.";
    messages.push({ text: "Falta la Descripción del ICP (Perfil de Cliente Ideal).", severity: 'error' });
  } else if (icp.length < 15) {
    fieldErrors.icp_description = "La descripción del ICP es demasiado corta (mínimo 15 caracteres).";
    messages.push({ text: "La Descripción del ICP es demasiado breve para guiar al Radar adecuadamente.", severity: 'warning' });
  }

  const parsedCities = cities.split(/[;\n]+/).map(c => c.trim()).filter(Boolean);
  if (!cities || parsedCities.length === 0) {
    fieldErrors.cities = "Las Ciudades de servicio son obligatorias.";
    messages.push({ text: "Faltan las Ciudades de Servicio (Service Areas). El Radar no puede realizar búsquedas sin ciudades.", severity: 'error' });
  }

  // 2. Alignment Check (Niche vs ICP Description)
  let isAligned = true;
  if (niche && icp) {
    const nicheKeywordsMap: Record<string, string[]> = {
      property_management: ['property', 'properties', 'propiedad', 'fincas', 'manager', 'administrador', 'inmueble', 'hoa', 'condominio', 'edificio', 'real estate', 'alquiler', 'facility', 'facilities', 'mantenimiento', 'contractor', 'comercial', 'residencial'],
      hvac: ['hvac', 'aire', 'acondicionado', 'climatizacion', 'calefaccion', 'cooling', 'heating', 'ducto', 'refrigeracion', 'tecnico', 'mantenimiento', 'residencia', 'comercial', 'contractor'],
      roofing: ['roof', 'roofing', 'tejado', 'cubierta', 'gotera', 'shingle', 'techo', 'tormenta', 'contratista', 'comercial', 'residencial'],
      plumbing: ['plumb', 'fontaneria', 'plomeria', 'tuberia', 'averia', 'fuga', 'drenaje', 'agua', 'emergencia', 'comercial', 'residencial'],
      solar: ['solar', 'panel', 'fotovoltaica', 'energia', 'renovable', 'inversor', 'instalacion', 'ahorro', 'comercial', 'residencial'],
      commercial_facilities: ['facility', 'facilities', 'comercial', 'oficina', 'edificio', 'mantenimiento', 'gerente', 'operaciones', 'planta'],
      landscaping: ['landscape', 'jardineria', 'riego', 'poda', 'jardin', 'verde', 'terreno'],
      cleaning: ['clean', 'limpieza', 'janitorial', 'desinfeccion', 'oficina', 'mantenimiento', 'comercial']
    };

    const normalizedNicheKey = niche.replace(/\s+/g, '_').replace(/-/g, '_');
    let expectedKeywords = nicheKeywordsMap[normalizedNicheKey] || nicheKeywordsMap[niche];

    if (!expectedKeywords) {
      expectedKeywords = niche.split(/[\s_\-]+/).filter(w => w.length > 2);
    }

    const icpLower = icp.toLowerCase();
    const matchedCount = expectedKeywords.filter(kw => icpLower.includes(kw.toLowerCase())).length;

    if (matchedCount === 0) {
      isAligned = false;
      fieldErrors.icp_description = `El ICP no parece alineado con el nicho '${niche}'.`;
      messages.push({
        text: `⚠️ Posible desalineación: La descripción del ICP no contiene términos clave del nicho '${niche}'.`,
        severity: 'warning'
      });
    } else {
      messages.push({
        text: `✓ ICP alineado correctamente con el nicho '${niche}' (${matchedCount} coincidencias clave).`,
        severity: 'success'
      });
    }
  }

  if (parsedCities.length > 0) {
    messages.push({
      text: `✓ Ciudades de servicio configuradas: ${parsedCities.length} ubicación(es) definida(s).`,
      severity: 'success'
    });
  }

  // Generate Suggested ICP if missing or misaligned
  let suggestedIcp = undefined;
  if (niche) {
    const sugMap: Record<string, string> = {
      property_management: 'Administradores de propiedades comerciales y residenciales que requieren contratistas de respuesta rápida para mantenimiento preventivo y reparación urgente de instalaciones.',
      hvac: 'Propietarios comerciales y residenciales con sistemas de climatización HVAC que requieren mantenimiento técnico y solución de averías.',
      roofing: 'Empresas comerciales y propietarios residenciales con techos antiguos o dañados por eventos climáticos que buscan presupuestos de reparación de tejados.',
      plumbing: 'Instalaciones comerciales, restaurantes y administradores con necesidades de mantenimiento hidráulico, desatascos y fontanería de urgencia.',
      solar: 'Propietarios residenciales y naves industriales con alto consumo eléctrico interesados en instalar paneles solares fotovoltaicos.',
      commercial_facilities: 'Directores de operaciones y facilidades en búsqueda de proveedores de mantenimiento integral para edificios comerciales.'
    };
    const key = niche.toLowerCase().replace(/\s+/g, '_');
    suggestedIcp = sugMap[key] || `Clientes comerciales y residenciales del sector ${niche} que buscan contratistas locales especializados con respuesta en menos de 24h.`;
  }

  const hasErrors = Boolean(fieldErrors.niche || fieldErrors.cities || (fieldErrors.icp_description && !icp));
  const hasWarnings = messages.some(m => m.severity === 'warning');
  const isValid = !hasErrors;

  let alignmentStatus: 'aligned' | 'misaligned' | 'missing_fields' = 'aligned';
  if (hasErrors) alignmentStatus = 'missing_fields';
  else if (!isAligned || hasWarnings) alignmentStatus = 'misaligned';

  return {
    isValid,
    hasErrors,
    hasWarnings,
    fieldErrors,
    alignmentStatus,
    messages,
    suggestedIcp
  };
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
  workbench?: { total_found: number; pending_email: number; whatsapp_drafts: number; contacted: number; replied: number; won: number; as_of: string };
}

export type StatusCategory = 'ALL' | 'NEW' | 'READY' | 'SENT' | 'REPLIED' | 'BLOCKED';

export function renderScoreBreakdownChips(breakdownRaw: string) {
  if (!breakdownRaw) return null;
  let items: { label: string; score: string }[] = [];
  try {
    const parsed = typeof breakdownRaw === 'string' ? JSON.parse(breakdownRaw) : breakdownRaw;
    if (typeof parsed === 'object' && parsed !== null) {
      items = Object.entries(parsed).map(([k, v]) => ({
        label: k.replace(/_/g, ' '),
        score: typeof v === 'number' && v > 0 ? `+${v}` : String(v)
      }));
    }
  } catch {
    const parts = breakdownRaw.split(/[,;\n]/).map(s => s.trim()).filter(Boolean);
    items = parts.map(part => {
      const [k, v] = part.split(/[:=]/);
      return {
        label: (k || part).trim(),
        score: v ? v.trim() : ''
      };
    });
  }

  if (items.length === 0) {
    return <div className="text-slate-400">{breakdownRaw}</div>;
  }

  return (
    <div className="flex flex-wrap gap-1.5 pt-1">
      {items.map((item, idx) => (
        <span
          key={idx}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-slate-300 font-mono text-[10px]"
        >
          <span className="capitalize text-slate-400">{item.label}:</span>
          <span className="font-bold text-emerald-400">{item.score}</span>
        </span>
      ))}
    </div>
  );
}

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
  const [tenants, setTenants] = useState<TenantConfig[]>([]);
  const [activeFilter, setActiveFilter] = useState<StatusCategory>('ALL');
  const [loading, setLoading] = useState(true);
  const [errorState, setErrorState] = useState<string | null>(null);

  // Mode and Tab Navigation
  const [mainTab, setMainTab] = useState<'prospects' | 'tenant'>('prospects');
  const [currentMode, setCurrentMode] = useState<'founder' | 'tenant'>('founder');
  const [selectedTenantId, setSelectedTenantId] = useState<string>('founder');

  // Run execution states
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [runState, setRunState] = useState<'idle' | 'queued' | 'running' | 'completed' | 'failed'>('idle');
  const [lastRunError, setLastRunError] = useState<string | null>(null);
  const [tenantRunFeedback, setTenantRunFeedback] = useState<{ run_id: string; jobs_enqueued: number } | null>(null);
  const [isTestingTelegram, setIsTestingTelegram] = useState(false);
  const [telegramToast, setTelegramToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isTestingEmail, setIsTestingEmail] = useState(false);
  const [emailTestAddress, setEmailTestAddress] = useState('');
  const [emailToast, setEmailToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  const parseCityAndState = (rawCity: string) => {
    if (!rawCity) return { city: 'Desconocida', state: '-' };
    if (rawCity.includes(',')) {
      const parts = rawCity.split(',').map(s => s.trim());
      return { city: parts[0] || 'Desconocida', state: parts[1] || '-' };
    }
    return { city: rawCity, state: '-' };
  };

  // App UI states
  const [showConfig, setShowConfig] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [inspectedProspect, setInspectedProspect] = useState<Prospect | null>(null);
  const [showOutcomeControls, setShowOutcomeControls] = useState<Record<string, boolean>>({});
  
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

      // Founder authentication is held only in the Worker HttpOnly session cookie.
      // Never read or send a service key from browser storage.
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

      // Fetch Tenant Configs first so tenants are known
      try {
        const tenRes = await fetch(`${apiUrl}/api/tenants/config`, { credentials: 'include' });
        if (tenRes && tenRes.ok) {
          const tenList = await tenRes.json();
          if (Array.isArray(tenList)) setTenants(tenList);
        }
      } catch (e) {}

      // Tenant mode always scopes prospect reads to the selected tenant; never mix Founder data.
      const isTenantMode = currentMode === 'tenant';
      const hasTenantSelected = isTenantMode && !!selectedTenantId && selectedTenantId !== 'founder';

      if (isTenantMode && !hasTenantSelected) {
        setProspects([]);
        setRoiStats(null);
        setLoading(false);
        return;
      }

      // Founder mode never sends tenant_id (backend defaults to founder).
      // Tenant mode always scopes to the selected tenant — isolation is strict.
      const prospectQuery = new URLSearchParams();
      if (isTenantMode) prospectQuery.set('tenant_id', selectedTenantId);
      // READY is backed by the persisted approved queue, not merely the latest 100 records.
      // The API already scopes this status by tenant and returns contactability per row.
      if (activeFilter === 'READY') prospectQuery.set('status', 'approved');
      const queryParam = prospectQuery.toString() ? `?${prospectQuery.toString()}` : '';

      // 3. GET /prospects
      let prospectsRes = await fetch(`${apiUrl}/prospects${queryParam}`, {
        credentials: 'include',
      }).catch(() => null);

      if (!prospectsRes || !prospectsRes.ok) {
        prospectsRes = await fetch(`${apiUrl}/api/prospects${queryParam}`, {
          credentials: 'include',
          }).catch(() => null);
      }
      
      // ROI funnel (founder or selected tenant)
      try {
        const roiTenant = isTenantMode && hasTenantSelected ? selectedTenantId : 'founder';
        const roiRes = await fetch(`${apiUrl}/api/tenants/roi?tenant_id=${encodeURIComponent(roiTenant)}`, { credentials: 'include' }).catch(() => null);
        if (roiRes && roiRes.ok) setRoiStats(await roiRes.json());
      } catch { /* non-blocking */ }

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

  // Refetch the prospect work queue when its server-side category scope changes.
  useEffect(() => {
    fetchTelemetry();
  }, [currentMode, selectedTenantId, activeFilter]);

  // Handle manual API config updates
  const saveApiSettings = (urlVal: string) => {
    localStorage.setItem('RADAR_API_URL', urlVal);
    setApiUrl(urlVal);
    setShowConfig(false);
    setLoading(true);
    fetchTelemetry();
  };

  const recordProspectMessageEvent = async (prospectId: string, eventType: 'message_copied' | 'message_channel_opened', channel: string) => {
    try {
      await fetch(apiUrl + "/api/prospects/message-event", {
        method: "POST", credentials: "include", keepalive: true, headers: { "Content-Type": "application/json", "X-Tenant-Id": selectedTenantId || "founder" },
        body: JSON.stringify({ prospect_id: prospectId, event_type: eventType, channel })
      });
    } catch { /* telemetry never blocks the user's action */ }
  };

  const isValidEmailRecipient = (value?: string | null) => Boolean(value && /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(value.trim()));
  const isVerifiedEmailRecipient = (prospect: Prospect) => {
    try { return JSON.parse(prospect.signals_json || "{}").is_email_validated === true; }
    catch { return false; }
  };
  const hasDirectWhatsAppRecipient = (value?: string | null) => {
    if (!value) return false;
    const link = toWhatsAppUrl(value, "");
    return Boolean(link && /^https:\/\/wa\.me\/\d{8,15}(?:\?|$)/i.test(link));
  };
  const getWebsiteUrl = (value?: string | null) => {
    if (!value) return null;
    try {
      const raw = value.trim();
      const parsed = new URL(/^https?:\/\//i.test(raw) ? raw : "https://" + raw);
      return ["http:", "https:"].includes(parsed.protocol) && parsed.hostname ? parsed.toString() : null;
    } catch { return null; }
  };
  const generateProspectMessage = async (prospect: Prospect, channel: "email" | "whatsapp") => {
    setGeneratingMessageIds(prev => ({ ...prev, [prospect.id]: true }));
    setErrorState(null);
    try {
      const response = await fetch(apiUrl + "/api/prospects/attack-kit", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-Tenant-Id": selectedTenantId || "founder" },
        body: JSON.stringify({ prospect_id: prospect.id, channel })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrorState(data.error === "unauthorized" ? "Sesión expirada: vuelve a autenticarte." : "No se pudo generar el mensaje: " + (data.error || response.status));
        return;
      }
      if (!data.generated_message?.body) {
        setErrorState("El generador no devolvió un mensaje utilizable.");
        return;
      }
      setAttackKits(prev => ({ ...prev, [prospect.id]: data }));
    } catch (error: any) {
      setErrorState("Error de conexión al generar el mensaje: " + (error?.message || "desconocido"));
    } finally {
      setGeneratingMessageIds(prev => ({ ...prev, [prospect.id]: false }));
    }
  };

  // Copy proposal draft trigger
  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  // Run decision state mutate via endpoint
  
  const submitTenantOutcome = async (prospectId: string, outcome: "contacted" | "replied" | "won") => {
    if (!selectedTenantId || selectedTenantId === "founder") return;
    let value_usd: number | undefined;
    if (outcome === "won") {
      const raw = prompt("Valor ganado en USD (opcional):", "500");
      if (raw == null) return;
      value_usd = parseFloat(raw) || 0;
    }
    try {
      await fetch(`${apiUrl}/api/prospects/outcome`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prospect_id: prospectId, tenant_id: selectedTenantId, outcome, value_usd })
      });
      fetchTelemetry();
    } catch (e) {
      alert("Error al guardar resultado: " + e);
    }
  };

const submitDecision = async (prospectId: string, action: string, ownerLawfulBasisConfirmed = false) => {
    try {
      const isTenantMode = currentMode === 'tenant';
      const payload: any = {
        id: prospectId,
        action,
        prospect_id: prospectId,
        event_type: action,
        owner_lawful_basis_asserted: ownerLawfulBasisConfirmed
      };
      if (isTenantMode && selectedTenantId && selectedTenantId !== 'founder') {
        payload.tenant_id = selectedTenantId;
      }

      const res = await fetch(`${apiUrl}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => res.statusText);
        const errMsg = res.status === 401
          ? `Error [HTTP 401]: Clave no autorizada o sesión expirada (${errText || 'No autorizado'})`
          : `Error [HTTP ${res.status}]: ${errText || 'No se pudo procesar la decisión'}`;
        alert(errMsg);
        return;
      }

      const data = await res.json().catch(() => ({}));
      if (data && data.success === false && data.message) {
        alert(`Aviso: ${data.message}`);
        return;
      }

      // Success: update local opportunities and prospects state immediately so closed/dispatched items leave open list
      setProspects(prev => prev.map(p => p.id === prospectId ? {
        ...p,
        status: (action === 'sent' || action === 'approve') ? 'sent' : action === 'wa_sent' ? 'contacted' : (action === 'discard' ? 'discarded' : action === 'replied' ? 'replied' : p.status),
        outcome: action === 'wa_sent' ? 'whatsapp_manual_sent' : p.outcome
      } : p));

      fetchTelemetry();
      if (inspectedProspect && inspectedProspect.id === prospectId) {
        setInspectedProspect(null);
      }
    } catch (e: any) {
      alert("Error de red al enviar la decisión: " + (e?.message || e));
    }
  };

  // Instant Trigger + Non-blocking Light Polling Pipeline Execution
  const executeRadarScout = async () => {
    setIsScrubbing(true);
    setRunState('queued');
    setLastRunError(null);

    try {
      // 1. Send POST /run — force=true ALWAYS when user taps the button
      // (idempotent skip only applies to cron, not manual runs)
      const runParam = currentMode === 'tenant' && selectedTenantId
        ? `mode=tenant&tenant_id=${encodeURIComponent(selectedTenantId)}&force=true`
        : `mode=founder&force=true`;
      const startRes = await fetch(`${apiUrl}/run?${runParam}`, {
        method: 'POST',
        credentials: 'include'
      });
      
      if (!startRes.ok) {
        const errJson = await startRes.json().catch(() => ({ error: 'Fallo al iniciar el run.' }));
        throw new Error(errJson.error || 'Fallo al iniciar el run.');
      }

      const runData = await startRes.json().catch(() => null);

      // Surface diagnostics when zero jobs (no cities, pause, idempotent skip)
      if (runData) {
        const jobs = typeof runData.jobs_enqueued === 'number' ? runData.jobs_enqueued : 0;
        setTenantRunFeedback({
          run_id: runData.run_id || runData.id || 'N/A',
          jobs_enqueued: jobs
        });
        if (jobs === 0 && runData.diagnostics?.reason) {
          setLastRunError(runData.diagnostics.reason);
          setRunState('failed');
          setIsScrubbing(false);
          return;
        }
        if (runData.active_cities?.length) {
          // Keep cities visible in feedback
        }
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

  // Test Outbound Email Connectivity
  const testEmailOutbound = async () => {
    setIsTestingEmail(true);
    setEmailToast(null);
    try {
      const res = await fetch(`${apiUrl}/api/email-test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: emailTestAddress.trim() || undefined }),
        credentials: 'include'
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        if (data.status === 'dispatched') {
          setEmailToast({
            type: 'success',
            message: `✅ Email enviado en vivo vía ${String(data.provider || '').toUpperCase()} (ID: ${data.message_id || data.messageId || 'OK'})`
          });
        } else {
          setEmailToast({
            type: 'info',
            message: `ℹ️ Modo Simulado OK: Para envíos reales a bandejas, configura RESEND_API_KEY en Cloudflare (gratis en resend.com)`
          });
        }
      } else {
        const err = data.error || data.details || `HTTP ${res.status}: Falló el despacho`;
        setEmailToast({ type: 'error', message: `❌ Error Email: ${err}` });
      }
    } catch (e: any) {
      setEmailToast({ type: 'error', message: `❌ Error de red: ${e.message}` });
    } finally {
      setIsTestingEmail(false);
      setTimeout(() => setEmailToast(null), 10000);
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

  // Work queue reflects persisted states. Opening a composer is not a confirmed send.
  const getCategory = (p: Prospect): StatusCategory => {
    const s = String(p.status || '').toLowerCase();
    const outcome = String(p.outcome || '').toLowerCase();
    const cooldown = p.cooldown_until ? Date.parse(p.cooldown_until) : 0;
    if (p.suppression_reason || ['suppressed','unsubscribed','blocked','discarded','disqualified','rejected','bounced','held','hold'].includes(s)) return 'BLOCKED';
    if (cooldown > Date.now()) return 'BLOCKED';
    if (['replied','human_review','positive','question','booked','won','converted'].includes(s) || ['positive','replied','booked','won','converted'].includes(outcome)) return 'REPLIED';
    if (['sent','delivered','opened','clicked','contacted'].includes(s) || ['sent','delivered','whatsapp_manual_sent'].includes(outcome)) return 'SENT';
    if (s === 'approved' && p.contactability?.send_authorized && p.contactability.contact_available) return 'READY';
    return 'NEW';
  };
  const getStatusBadge = (p: Prospect) => {
    const s = String(p.status || '').toLowerCase();
    if (s === 'notified' && String(p.outcome || '').toLowerCase() === 'whatsapp_manual_ready') return { label: 'WA DRAFT · CONSENT REQUIRED', color: 'bg-amber-950/60 text-amber-200 border-amber-800/60' };
    if (s === 'bounced' || s === 'bounce') return { label: 'BOUNCED', color: 'bg-rose-950/80 text-rose-300 border-rose-800' };
    if (s === 'out_of_office' || s === 'ooo') return { label: 'OUT OF OFFICE', color: 'bg-amber-950/80 text-amber-300 border-amber-800' };
    if (s === 'not_now') return { label: 'NOT NOW', color: 'bg-amber-950/50 text-amber-400 border-amber-800/40' };
    if (s === 'human_review') return { label: 'HUMAN REVIEW', color: 'bg-orange-950/80 text-orange-300 border-orange-800' };
    if (s === 'positive') return { label: 'POSITIVE REPLY', color: 'bg-emerald-950/80 text-emerald-300 border-emerald-800' };
    if (s === 'question') return { label: 'QUESTION', color: 'bg-sky-950/80 text-sky-300 border-sky-800' };
    if (s === 'converted' || s === 'won') return { label: 'CONVERTED', color: 'bg-emerald-900 text-emerald-200 border-emerald-600' };
    const category = getCategory(p);
    if (category === 'BLOCKED') return { label: p.cooldown_until && Date.parse(p.cooldown_until) > Date.now() ? 'COOLDOWN' : 'BLOCKED', color: 'bg-zinc-800/80 text-zinc-400 border-zinc-700/40' };
    if (category === 'REPLIED') return { label: 'REPLIED', color: 'bg-orange-950/50 text-orange-400 border-orange-800/40' };
    if (category === 'SENT') return { label: 'SENT', color: 'bg-emerald-950/50 text-emerald-400 border-emerald-800/40' };
    if (category === 'READY') return { label: 'READY TO CONTACT', color: 'bg-indigo-950/50 text-indigo-300 border-indigo-800/40' };
    return { label: (p.status || 'NEW').toUpperCase(), color: 'bg-slate-900 text-slate-400 border-slate-800' };
  };

  // Filter prospects list based on active pill filter
  const filteredProspects = prospects.filter(p => activeFilter === 'ALL' || getCategory(p) === activeFilter);

  // Parse evidence/signals from JSON
  const parseSignals = (prospect: Prospect): string[] => {
    try {
      const parsedMeta = JSON.parse(prospect.signals_json);
      if (Array.isArray(parsedMeta.signal_tags) && parsedMeta.signal_tags.length > 0) {
        return parsedMeta.signal_tags.slice(0, 4);
      }
      const activeSignals: string[] = [];
      if (parsedMeta.permits_tag) {
        activeSignals.push(parsedMeta.permits_tag);
      }
      if (parsedMeta.signals) {
        if (parsedMeta.signals.permits_label) activeSignals.push(parsedMeta.signals.permits_label);
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
    cities_json: '',
    languages_json: '["en"]',
    icp_description: 'Commercial property managers requiring rapid contractor dispatch',
    minimum_score: 50,
    daily_outreach_limit: 10,
    campaign_goal: 'Agendar llamadas de demostración',
    messaging_angle: 'fast_response_guarantee'
  });
  const [tenantSaveStatus, setTenantSaveStatus] = useState<string | null>(null);
  // Human-friendly cities input (semicolon-separated) → stored as cities_json array
  const [tenantCitiesText, setTenantCitiesText] = useState('Austin, TX; Round Rock, TX');
  const [roiStats, setRoiStats] = useState<any>(null);
  const [attackKits, setAttackKits] = useState<Record<string, any>>({});
  const [generatingMessageIds, setGeneratingMessageIds] = useState<Record<string, boolean>>({});

  const saveTenantConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    const cities = tenantCitiesText
      // Commas belong to labels such as "Austin, TX"; delimit only by semicolon/newline.
      .split(/[;\n]+/)
      .map(s => s.trim())
      .filter(Boolean);
    if (cities.length === 0) {
      setTenantSaveStatus("Escribe al menos una ciudad (ej: Austin, TX; Round Rock, TX).");
      return;
    }
    const parseArrayField = (value?: string): string[] => {
      if (!value) return [];
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return parsed.map(v => String(v).trim()).filter(Boolean);
      } catch { /* legacy/free-text values are treated as a single item */ }
      return value.trim() ? value.split(/[;\n]+/).map(v => v.trim()).filter(Boolean) : [];
    };
    const explicitCountries = parseArrayField(tenantForm.countries_json);
    const inferredCountries = Array.from(new Set(cities.map(city => {
      const parts = city.split(',').map(v => v.trim());
      const last = (parts[parts.length - 1] || '').toUpperCase();
      const third = (parts[2] || '').toUpperCase();
      const candidate = third || last;
      return ({ UK: 'GB', GB: 'GB', IE: 'IE', AU: 'AU', NZ: 'NZ', ZA: 'ZA', US: 'US', CA: 'CA' } as Record<string, string>)[candidate] || '';
    }).filter(Boolean)));
    const subniches = parseArrayField(tenantForm.subniches_json);
    const payload = {
      ...tenantForm,
      tenant_id: String(tenantForm.tenant_id || '').trim(),
      cities_json: JSON.stringify(cities),
      cities,
      trades: subniches,
      subniches,
      services: parseArrayField(tenantForm.services_json),
      service_areas: parseArrayField(tenantForm.service_areas_json).length
        ? parseArrayField(tenantForm.service_areas_json) : cities,
      countries: explicitCountries.length ? explicitCountries : (inferredCountries.length ? inferredCountries : ['US']),
      regions: parseArrayField(tenantForm.regions_json),
      languages: parseArrayField(tenantForm.languages_json).length ? parseArrayField(tenantForm.languages_json) : ['en'],
      icp_keywords: parseArrayField(tenantForm.icp_keywords_json),
      allowed_markets: parseArrayField(tenantForm.allowed_markets_json)
    };
    try {
      const res = await fetch(`${apiUrl}/api/tenants/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setTenantForm(prev => ({ ...prev, cities_json: JSON.stringify(cities) }));
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
        {(errorState || lastRunError) && (() => {
          const alertMsg = String(lastRunError || errorState);
          const isOk = /ready|OK/i.test(alertMsg);
          return (
            <div className={`${isOk ? 'bg-emerald-950/20 border-emerald-900/40' : 'bg-rose-950/20 border-rose-900/40'} border rounded-2xl p-4 flex items-start gap-3`}>
              {isOk ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
              )}
              <div className="flex-1 space-y-1">
                <h4 className={`text-xs font-bold ${isOk ? 'text-emerald-300' : 'text-rose-300'}`}>Aviso del Sistema</h4>
                <p className="text-[11px] text-slate-400 leading-relaxed">{alertMsg}</p>
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
          );
        })()}

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

              {/* Feedback tras correr: run_id y jobs_enqueued (ambos modos) */}
              {tenantRunFeedback && (
                <div className={`p-3 border rounded-xl text-xs font-mono flex items-center justify-between ${
                  tenantRunFeedback.jobs_enqueued > 0
                    ? 'bg-indigo-950/40 border-indigo-800/60 text-indigo-200'
                    : 'bg-amber-950/40 border-amber-700/50 text-amber-200'
                }`}>
                  <div className="space-y-0.5">
                    <div className="font-bold text-white flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${tenantRunFeedback.jobs_enqueued > 0 ? 'bg-emerald-400' : 'bg-amber-400'}`}></span>
                      {tenantRunFeedback.jobs_enqueued > 0
                        ? `Radar ejecutado (${currentMode})`
                        : 'Radar no encoló jobs'}
                    </div>
                    <div className="text-[11px] text-slate-300">
                      run_id: <span className="text-indigo-300 font-semibold">{tenantRunFeedback.run_id}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-slate-400 uppercase">jobs</div>
                    <div className={`text-sm font-bold ${tenantRunFeedback.jobs_enqueued > 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {tenantRunFeedback.jobs_enqueued}
                    </div>
                  </div>
                </div>
              )}
              
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

              {/* Email Outbound Live Test */}
              <div className="pt-2 border-t border-slate-800/60 space-y-2">
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>Outbound Email: <strong className="text-slate-200">Resend / Brevo</strong></span>
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">100% Gratis</span>
                </div>
                <div className="flex gap-2">
                  <input
                    type="email"
                    placeholder="tu@correo.com (probar recepción)"
                    value={emailTestAddress}
                    onChange={(e) => setEmailTestAddress(e.target.value)}
                    className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
                  />
                  <button
                    onClick={testEmailOutbound}
                    disabled={isTestingEmail}
                    className="py-2 px-3 rounded-xl bg-slate-900/80 hover:bg-slate-800/80 active:scale-[0.98] border border-slate-800 text-slate-300 text-xs font-mono font-bold flex items-center gap-1.5 whitespace-nowrap transition-all"
                  >
                    <Mail className={`w-3.5 h-3.5 text-emerald-400 ${isTestingEmail ? 'animate-bounce' : ''}`} />
                    {isTestingEmail ? 'ENVIANDO...' : 'Probar Email'}
                  </button>
                </div>
              </div>

              {/* Email Test Toast */}
              {emailToast && (
                <div className={`p-3 rounded-xl border text-xs font-mono flex items-center justify-between ${
                  emailToast.type === 'success' 
                    ? 'bg-emerald-950/40 border-emerald-800/50 text-emerald-300' 
                    : emailToast.type === 'info'
                    ? 'bg-blue-950/40 border-blue-800/50 text-blue-300'
                    : 'bg-rose-950/40 border-rose-800/50 text-rose-300'
                }`}>
                  <span className="leading-relaxed">{emailToast.message}</span>
                  <button 
                    onClick={() => setEmailToast(null)} 
                    className="text-slate-400 hover:text-white text-xs px-1 ml-2 shrink-0"
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

              {/* Banner bajo el selector: "Buscando para: {tenant_name} · {ciudades} · {niche}" */}
              {currentMode === 'tenant' && (() => {
                const curTenant = tenants.find(t => t.tenant_id === selectedTenantId) || (tenants.length > 0 ? tenants[0] : null);
                const tName = curTenant?.tenant_name || curTenant?.tenant_id || selectedTenantId || 'Tenant';
                let tCities = 'Sin ciudades';
                let hasCities = false;
                if (curTenant?.cities_json) {
                  try {
                    const parsed = JSON.parse(curTenant.cities_json);
                    if (Array.isArray(parsed) && parsed.length > 0) {
                      tCities = parsed.join(', ');
                      hasCities = true;
                    } else if (typeof parsed === 'string' && parsed.trim()) {
                      tCities = parsed;
                      hasCities = true;
                    }
                  } catch {
                    if (curTenant.cities_json && curTenant.cities_json !== '[]') {
                      tCities = curTenant.cities_json;
                      hasCities = true;
                    }
                  }
                }
                const tNiche = curTenant?.niche || 'General';

                return (
                  <div className="space-y-2">
                    <div className={`px-3.5 py-2.5 border rounded-xl text-xs font-mono flex items-center gap-2 ${hasCities ? 'bg-indigo-950/40 border-indigo-800/50 text-indigo-300' : 'bg-amber-950/40 border-amber-700/50 text-amber-300'}`}>
                      <span className={`w-2 h-2 rounded-full shrink-0 ${hasCities ? 'bg-indigo-400 animate-pulse' : 'bg-amber-400'}`} />
                      <span className="truncate">
                        {hasCities ? 'Buscando para' : '⚠ Configura ciudades'}: <span className="font-semibold text-white">{tName}</span> · <span className={hasCities ? 'text-indigo-200' : 'text-amber-200 font-bold'}>{tCities}</span> · <span className="text-indigo-200">{tNiche}</span>
                      </span>
                    </div>
                    {!hasCities && (
                      <div className="px-3 py-2 bg-amber-950/30 border border-amber-800/40 rounded-lg text-[11px] text-amber-200/90">
                        Este tenant no tiene ciudades. Ve a la pestaña <strong>Tenant</strong>, añade ciudades (ej. <code className="text-amber-100">["City A, Region","City B, Region"]</code>) y guarda. Sin ciudades el Radar no buscará.
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Two destinations only: work contacts or configure a Tenant. */}
              <div className="grid grid-cols-2 gap-1 bg-slate-900/40 p-1 rounded-xl border border-slate-900 font-mono text-[11px] font-bold">
                <button onClick={() => setMainTab('prospects')} className={`py-2 rounded-lg flex items-center justify-center gap-1 transition-all ${mainTab === 'prospects' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}><MessageSquare className="w-3.5 h-3.5" /><span>Contactar</span></button>
                <button onClick={() => setMainTab('tenant')} className={`py-2 rounded-lg flex items-center justify-center gap-1 transition-all ${mainTab === 'tenant' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}><Settings className="w-3.5 h-3.5" /><span>Configuración</span></button>
              </div>
            </div>

            {/* CONTACT WORKBENCH: message-first; intelligence stays in the engine. */}
            {mainTab === 'prospects' && (
              <div className="space-y-3">
                {/* Metric Scoreboard */}
                {(() => {
                const m: any = currentMode === 'founder' ? stats?.workbench : roiStats;
                const metrics: [string, unknown][] = [
                  ['Empresas encontradas', m?.total_found],
                  ['Correo listo', m?.pending_email],
                  ['Borradores WhatsApp', m?.whatsapp_drafts],
                  ['Contactados', m?.contacted]
                ];
                return <div className="grid grid-cols-2 gap-2.5 font-mono text-slate-200">
                  {metrics.map(([label, value]) => <div key={label} className="bg-slate-900/40 p-3.5 rounded-2xl border border-slate-900">
                    <span className="text-[10px] text-slate-500 block uppercase font-sans font-bold">{label}</span>
                    <span className="text-xl font-bold tracking-tight text-slate-100 tabular-nums">{typeof value === 'number' ? value : 'N/D'}</span>
                  </div>)}
                  <div className="col-span-2 text-[10px] text-slate-500 flex items-center justify-between gap-2">
                    <span>Respuestas registradas: {typeof m?.replied === 'number' ? m.replied : 'N/D'}</span>
                    <span>WhatsApp requiere consentimiento explícito; borrador ≠ envío.</span>
                  </div>
                </div>;
              })()}

                <div className="flex items-center justify-between border-b border-slate-900 pb-2">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Directorio de Prospectos Real</h3>
                  <Database className="w-3.5 h-3.5 text-slate-500" />
                </div>

                {/* Status Filter Pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-[10px] font-mono font-bold">
                  {(['ALL', 'NEW', 'READY', 'SENT', 'REPLIED', 'BLOCKED'] as StatusCategory[]).map(cat => (
                    <button
                      key={cat}
                      onClick={() => setActiveFilter(cat)}
                      className={`px-2.5 py-1 rounded-lg border whitespace-nowrap transition-all ${
                        activeFilter === cat 
                          ? 'bg-blue-600 border-blue-500 text-white' 
                          : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {{ ALL: 'TODOS', NEW: 'NUEVOS', READY: 'LISTOS', SENT: 'CONTACTADOS', REPLIED: 'RESPUESTAS', BLOCKED: 'BLOQUEADOS' }[cat]}
                    </button>
                  ))}
                </div>

                {filteredProspects.length === 0 ? (
                  <div className="text-center py-10 bg-slate-900/10 rounded-2xl border border-slate-900 p-5">
                    <Info className="w-6 h-6 text-slate-600 mx-auto mb-2" />
                    <p className="text-xs text-slate-500 leading-normal">
                      {currentMode === 'tenant'
                        ? 'Aún no hay prospectos para este tenant. Pulsa CORRER RADAR AHORA.'
                        : `No se encontraron prospectos en la categoría '${activeFilter}'. Ejecuta el radar para prospectar.`}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredProspects.map(p => {
                      const badge = getStatusBadge(p);
                      const signalsList = parseSignals(p);
                      const isExpanded = inspectedProspect?.id === p.id;
                      const websiteHref = getWebsiteUrl(p.website);
                      const generatedMessage = attackKits[p.id]?.generated_message;
                      const emailMessageBody = generatedMessage?.channel === "email" ? generatedMessage.body : (p.draft_body || "");
                      const emailMessageSubject = generatedMessage?.channel === "email" ? generatedMessage.subject : (p.draft_subject || "");
                      const isPreparedWhatsAppDraft = currentMode === 'founder' && p.outcome === 'whatsapp_manual_ready';
                      const whatsappMessageBody = generatedMessage?.channel === "whatsapp"
                        ? generatedMessage.body
                        : isPreparedWhatsAppDraft ? (p.draft_body || "") : "";
                      const emailRecipient = p.email && isValidEmailRecipient(p.email) ? p.email.trim() : null;
                      const contactability = p.contactability;
                      const activeKitForProspect = attackKits[p.id] || p.attack_kit;
                      const hasVerifiedOutreachAngle = currentMode === 'tenant'
                        ? activeKitForProspect?.angle === 'tenant_b2b_service'
                        : ['weather_surge', 'stale_quotes', 'no_sms', 'missed_calls', 'general_intro'].includes(activeKitForProspect?.angle);
                      const canOpenDirectChannel = Boolean(contactability?.commercial_prospect && contactability.contact_available && hasVerifiedOutreachAngle);
      const canSendEmail = Boolean(contactability?.commercial_prospect && contactability.send_authorized && emailRecipient);
                      // A prepared Founder WhatsApp draft is already human-reviewed for this channel.
                      // Opening wa.me is still only a manual handoff; it does not prove account or opt-in.
                      const canOpenWhatsApp = canOpenDirectChannel || (isPreparedWhatsAppDraft && hasDirectWhatsAppRecipient(p.phone));

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
                              {currentMode === 'tenant' ? (
                                <div className="space-y-1">
                                  <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-400 font-mono">
                                    <span className="text-slate-200 font-semibold">{parseCityAndState(p.city).city}</span>
                                    <span>·</span>
                                    <span className="text-slate-200 font-semibold">{parseCityAndState(p.city).state}</span>
                                    <span>·</span>
                                    <span className="px-1.5 py-0.5 rounded bg-indigo-950/60 text-indigo-300 border border-indigo-800/40 font-semibold uppercase">
                                      {p.trade || (tenants.find(t => t.tenant_id === selectedTenantId)?.niche) || 'General'}
                                    </span>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-mono">
                                  <span className="uppercase text-blue-400 font-semibold">{p.trade}</span>
                                  <span>·</span>
                                  <span>{p.city}</span>
                                </div>
                              )}
                            </div>
                            <span className="text-xs font-mono font-bold text-emerald-400 shrink-0">
                              {p.score}/100
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                            {currentMode === 'tenant' ? (
                              <>
                                {signalsList.length > 0 ? (
                                  signalsList.map((sig, sIdx) => (
                                    <span key={sIdx} className="px-1.5 py-0.5 rounded bg-amber-950/30 text-[9px] text-amber-300 font-mono border border-amber-600/30 font-bold">
                                      ⚡ {sig}
                                    </span>
                                  ))
                                ) : (
                                  <span className="px-1.5 py-0.5 rounded bg-slate-800/60 text-[9px] text-slate-400 font-mono">
                                    Señal base
                                  </span>
                                )}
                                {p.signal_event && (
                                  <span className="px-1.5 py-0.5 rounded bg-sky-950/40 text-[9px] text-sky-300 font-mono border border-sky-800/40">
                                    {p.signal_event}
                                  </span>
                                )}
                              </>
                            ) : (
                              <>
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
                              </>
                            )}
                          </div>

                          {contactability && (
                            <div className="text-[9px] text-slate-500 font-mono">
                              {contactability.commercial_prospect ? "Prospecto comercial" : "No elegible"} ·
                              {contactability.contact_available ? "Contacto directo disponible" : contactability.channels.website ? "Web disponible, sin destinatario directo" : "Sin canal directo"} ·
                              {contactability.send_state === "confirmed" ? "Envío confirmado" : contactability.send_authorized ? "Envío autorizado" : "Envío requiere acción explícita"}
                            </div>
                          )}
                          <div className="flex flex-wrap items-center gap-2 pt-1 font-mono text-[11px]">
                            {canSendEmail && (
                              <button
                                type="button"
                                className="px-2.5 py-1 rounded-lg bg-blue-950/50 border border-blue-800/40 text-blue-300 hover:bg-blue-900/60 flex items-center gap-1 font-bold"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (window.confirm(`¿Enviar el correo a ${emailRecipient}? Confirma que tienes una base legal aplicable para este destinatario. Si el buzón no está verificado por proveedor, el riesgo de rebote es mayor.`)) void submitDecision(p.id, 'approve', true);
                                }}
                              >
                                <Mail className="w-3.5 h-3.5 text-blue-400" />
                                Enviar correo
                              </button>
                            )}
                            {canOpenWhatsApp && p.phone && hasDirectWhatsAppRecipient(p.phone) && toWhatsAppUrl(p.phone, whatsappMessageBody) && (
                              <a 
                                href={toWhatsAppUrl(p.phone, whatsappMessageBody)!}
                                target="_blank" 
                                rel="noreferrer" 
                                className="px-2.5 py-1 rounded-lg bg-emerald-950/50 border border-emerald-800/40 text-emerald-300 hover:bg-emerald-900/60 flex items-center gap-1 font-bold"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setShowOutcomeControls(prev => ({ ...prev, [p.id]: true }));
                                   void recordProspectMessageEvent(p.id, 'message_channel_opened', 'whatsapp');
                                }}
                              >
                                <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
                                WhatsApp <span className="text-[8px] opacity-70">· no verificado</span>
                              </a>
                            )}
                            {currentMode === 'founder' && p.outcome === 'whatsapp_manual_ready' && (
                              <button
                                type="button"
                                className="px-2.5 py-1 rounded-lg bg-emerald-600/20 border border-emerald-500/40 text-emerald-200 hover:bg-emerald-600/40 flex items-center gap-1 font-bold"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const confirmed = window.confirm('¿Enviaste manualmente el mensaje por WhatsApp y existe consentimiento explícito documentado para este contacto?');
                                  if (confirmed) void submitDecision(p.id, 'wa_sent');
                                }}
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Confirmar envío
                              </button>
                            )}
                            {canOpenDirectChannel && p.phone && toSmsUrl(p.phone, emailMessageBody) && (
                              <a
                                href={toSmsUrl(p.phone, emailMessageBody)!}
                                className="px-2.5 py-1 rounded-lg bg-sky-950/50 border border-sky-800/40 text-sky-300 hover:bg-sky-900/60 flex items-center gap-1 font-bold"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setShowOutcomeControls(prev => ({ ...prev, [p.id]: true }));
                                   void recordProspectMessageEvent(p.id, 'message_channel_opened', 'sms');
                                }}
                              >
                                <MessageSquare className="w-3.5 h-3.5 text-sky-400" />
                                SMS
                              </a>
                            )}
                            {canOpenDirectChannel && p.phone && toTelUrl(p.phone) && (
                              <a
                                href={toTelUrl(p.phone)!}
                                className="px-2.5 py-1 rounded-lg bg-indigo-950/50 border border-indigo-800/40 text-indigo-300 hover:bg-indigo-900/60 flex items-center gap-1 font-bold"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setShowOutcomeControls(prev => ({ ...prev, [p.id]: true }));
                                   void recordProspectMessageEvent(p.id, 'message_channel_opened', 'phone');
                                }}
                              >
                                <Phone className="w-3.5 h-3.5 text-indigo-400" />
                                Llamar
                              </a>
                            )}
                            {websiteHref && (
                              <a 
                                href={websiteHref} 
                                target="_blank" 
                                rel="noreferrer" 
                                className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-blue-400 flex items-center gap-1" 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void recordProspectMessageEvent(p.id, 'message_channel_opened', 'website');
                                }}
                              >
                                <ExternalLink className="w-3 h-3 text-slate-500" />
                                {p.website}
                              </a>
                            )}
                          </div>

                          {(showOutcomeControls[p.id] || isExpanded) && (
                            <div className="pt-2 border-t border-slate-900/80 space-y-2" onClick={(e) => e.stopPropagation()}>
                              <span className="text-[10px] font-mono text-slate-400 font-bold uppercase block">Registrar Resultado:</span>
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
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
                                  {renderScoreBreakdownChips(p.score_breakdown)}
                                </div>
                              )}
                              {p.draft_body && (
                                <div className="bg-slate-950 p-3 rounded-xl border border-slate-900 font-mono text-[11px] text-slate-300 whitespace-pre-wrap leading-relaxed">
                                  <span className="text-slate-500 font-bold block mb-1 text-[9px] uppercase">Asunto: {p.draft_subject}</span>
                                  {p.draft_body}
                                </div>
                              )}
                              {/* Attack kit: call + SMS + email — product surface */}
                              <div className="bg-indigo-950/30 border border-indigo-800/40 rounded-xl p-3 space-y-2">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="text-[10px] font-bold uppercase text-indigo-300">Kit de ataque</span>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <button
                                      type="button"
                                      className="text-[10px] text-indigo-300 font-bold"
                                      disabled={Boolean(generatingMessageIds[p.id])}
                                      onClick={() => void generateProspectMessage(p, emailRecipient ? "email" : hasDirectWhatsAppRecipient(p.phone) ? "whatsapp" : "email")}
                                    >
                                      {generatingMessageIds[p.id] ? "Generando…" : emailRecipient ? "Generar correo IA" : hasDirectWhatsAppRecipient(p.phone) ? "Generar WhatsApp IA" : "Generar mensaje IA"}
                                    </button>
                                    {emailRecipient && hasDirectWhatsAppRecipient(p.phone) && (
                                      <button
                                        type="button"
                                        className="text-[10px] text-emerald-300 font-bold"
                                        disabled={Boolean(generatingMessageIds[p.id])}
                                        onClick={() => void generateProspectMessage(p, "whatsapp")}
                                      >
                                        Generar WhatsApp
                                      </button>
                                    )}
                                    {emailRecipient && (
                                      <span className="text-[9px] text-slate-500">
                                        {isVerifiedEmailRecipient(p) ? "Email validado" : "Email · revisión manual"}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                {attackKits[p.id] ? (
                                  <div className="space-y-2 text-[10px] text-slate-300 font-mono">
                                    {attackKits[p.id].generated_message && (
                                      <div className="rounded-lg border border-blue-800/50 bg-slate-950 p-3 space-y-2">
                                        <div className="flex items-center justify-between gap-2">
                                          <span className="text-[10px] font-bold uppercase text-blue-300">Mensaje {attackKits[p.id].generated_message.channel} · {attackKits[p.id].generated_message.source === 'template' ? 'plantilla de respaldo' : 'IA · ' + attackKits[p.id].generated_message.source}</span>
                                          <button type="button" className="text-[10px] text-blue-300 font-bold" onClick={() => {
                                            copyToClipboard([attackKits[p.id].generated_message.subject, attackKits[p.id].generated_message.body].filter(Boolean).join('\n\n'), p.id);
                                            void recordProspectMessageEvent(p.id, 'message_copied', 'clipboard');
                                          }}>Copiar</button>
                                        </div>
                                        {attackKits[p.id].generated_message.subject && <p className="text-slate-400">Asunto: {attackKits[p.id].generated_message.subject}</p>}
                                        <p className="whitespace-pre-wrap text-[11px]">{attackKits[p.id].generated_message.body}</p>
                                        <p className="text-[9px] text-slate-500">Generar o copiar no significa contactar ni autoriza un envío. Canal directo disponible: {attackKits[p.id].contactability?.contact_available ? 'sí' : 'no'}.</p>
                                      </div>
                                    )}
                                    {attackKits[p.id].next_action?.includes("DO_NOT_CONTACT") ? (
                                      <div className="p-2.5 rounded-lg bg-rose-950/50 border border-rose-800/60 text-rose-300 font-sans space-y-1">
                                        <div className="font-bold uppercase text-[10px] text-rose-200">⛔ {attackKits[p.id].next_action}</div>
                                        <p className="text-[11px]">{attackKits[p.id].why_this_lead}</p>
                                      </div>
                                    ) : (
                                      <>
                                        <p className="text-amber-200">{attackKits[p.id].why_this_lead}</p>
                                                                                <p className="whitespace-pre-wrap"><span className="text-slate-500">Llamada:</span>{'\n'}{attackKits[p.id].call_script}</p>
                                        <p><span className="text-slate-500">Siguiente:</span> {attackKits[p.id].next_action}</p>
                                        {attackKits[p.id].generated_message?.channel === "whatsapp" && p.phone && hasDirectWhatsAppRecipient(p.phone) && toWhatsAppUrl(p.phone, attackKits[p.id].generated_message.body) && (
                                          <a
                                            href={toWhatsAppUrl(p.phone, attackKits[p.id].generated_message.body)!}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="inline-block px-2 py-1 rounded bg-emerald-950/50 border border-emerald-800 text-emerald-300 font-bold"
                                          >
                                            WhatsApp con texto del kit · no verificado
                                          </a>
                                        )}
                                        {p.phone && toSmsUrl(p.phone, attackKits[p.id].sms || '') && (
                                          <a
                                            href={toSmsUrl(p.phone, attackKits[p.id].sms || '')!}
                                            className="inline-block ml-2 px-2 py-1 rounded bg-sky-950/50 border border-sky-800 text-sky-300 font-bold"
                                          >
                                            Abrir SMS con texto del kit
                                          </a>
                                        )}
                                      </>
                                    )}
                                  </div>
                                ) : (
                                  <p className="text-[10px] text-slate-500">Genera un mensaje contextual con IA y revisa las señales antes de abrir un canal. La generación no registra un contacto.</p>
                                )}
                              </div>
                              {currentMode === 'founder' && (() => {
                                const activeKit = attackKits[p.id] || (p.attack_kit ? (typeof p.attack_kit === 'string' ? JSON.parse(p.attack_kit) : p.attack_kit) : null);
                                const isDoNotContact =
                                  !activeKit ||
                                  !["weather_surge", "stale_quotes", "no_sms", "missed_calls"].includes(activeKit.angle) ||
                                  activeKit?.next_action?.startsWith("DO_NOT_CONTACT") ||
                                  activeKit?.next_action?.includes("DO_NOT_CONTACT") ||
                                  p.outcome?.includes("off_icp") ||
                                  p.status === "disqualified";

                                return (
                                  <div className="grid grid-cols-2 gap-2 pt-1 font-mono">
                                    {isDoNotContact ? (
                                      <button
                                        disabled
                                        className="h-10 px-2 rounded-lg bg-rose-950/30 border border-rose-800/40 text-rose-400 flex items-center justify-center text-[10px] font-bold uppercase text-center opacity-70 cursor-not-allowed"
                                      >
                                        ⛔ DO NOT CONTACT
                                      </button>
                                    ) : !isValidEmailRecipient(p.email) ? (
                                      <button disabled className="h-10 px-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-500 text-[10px] font-bold">SIN EMAIL VÁLIDO</button>
                                    ) : (
                                      <button
                                        onClick={() => {
                                          const verified = isVerifiedEmailRecipient(p);
                                          const warning = verified
                                            ? `¿Enviar el correo a ${p.email}? Confirma que tienes una base legal aplicable.`
                                            : `El correo ${p.email} tiene sintaxis válida, pero no está verificado por proveedor. ¿Confirmas que tienes una base legal aplicable y aceptas el mayor riesgo de rebote?`;
                                          if (window.confirm(warning)) void submitDecision(p.id, 'sent', true);
                                        }}
                                        className="h-10 text-xs font-semibold rounded-lg bg-emerald-600/20 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-600 hover:text-white transition-colors"
                                      >
                                        ✓ Enviar correo
                                      </button>
                                    )}
                                    <button
                                      onClick={() => submitDecision(p.id, 'discard')}
                                      className="h-10 text-xs font-semibold rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-white"
                                    >
                                      ✕ Descartar
                                    </button>
                                  </div>
                                );
                              })()}
                              {currentMode === 'tenant' && selectedTenantId && selectedTenantId !== 'founder' && (
                                <div className="grid grid-cols-3 gap-1.5 pt-1 font-mono">
                                  <button type="button" onClick={() => submitTenantOutcome(p.id, 'contacted')}
                                    className="h-9 text-[10px] font-bold rounded-lg bg-slate-900 border border-slate-700 text-slate-300">Contactado</button>
                                  <button type="button" onClick={() => submitTenantOutcome(p.id, 'replied')}
                                    className="h-9 text-[10px] font-bold rounded-lg bg-amber-950/40 border border-amber-800 text-amber-300">Respondió</button>
                                  <button type="button" onClick={() => submitTenantOutcome(p.id, 'won')}
                                    className="h-9 text-[10px] font-bold rounded-lg bg-emerald-950/40 border border-emerald-800 text-emerald-300">Ganado $</button>
                                </div>
                              )}

                              {/* TIMELINE SECTION (STATUS / EVENT HISTORY) */}
                              <div className="bg-slate-950 border border-slate-900 rounded-xl p-3 space-y-2 mt-2 font-mono">
                                <div className="flex items-center justify-between text-[10px] text-slate-400 border-b border-slate-900 pb-1.5 font-bold uppercase">
                                  <span>⏱ Historial de Estado (Timeline)</span>
                                  <span>Fechas y Eventos</span>
                                </div>
                                <div className="space-y-2 pt-1 text-[11px]">
                                  <div className="flex items-center justify-between text-slate-300">
                                    <div className="flex items-center gap-2">
                                      <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                                      <span className="font-semibold uppercase text-[10px]">Scouted / Creado</span>
                                    </div>
                                    <span className="text-slate-500 text-[10px]">{new Date(p.created_at).toLocaleString()}</span>
                                  </div>
                                  {p.status && p.status !== 'scouted' && (
                                    <div className="flex items-center justify-between text-slate-300">
                                      <div className="flex items-center gap-2">
                                        <span className={`w-2 h-2 rounded-full ${
                                          p.status === 'sent' ? 'bg-blue-400' :
                                          p.status === 'delivered' ? 'bg-indigo-400' :
                                          p.status === 'opened' ? 'bg-purple-400' :
                                          p.status === 'clicked' ? 'bg-amber-400' :
                                          p.status === 'replied' ? 'bg-amber-500' :
                                          p.status === 'won' ? 'bg-emerald-400' : 'bg-slate-400'
                                        }`}></span>
                                        <span className="font-semibold uppercase text-[10px]">Estado: {p.status}</span>
                                      </div>
                                      <span className="text-slate-500 text-[10px]">Actualizado</span>
                                    </div>
                                  )}
                                  {p.outcome && (
                                    <div className="flex items-center justify-between text-slate-300">
                                      <div className="flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                        <span className="font-semibold uppercase text-[10px]">Resultado: {p.outcome}</span>
                                      </div>
                                      <span className="text-slate-500 text-[10px]">Registrado</span>
                                    </div>
                                  )}
                                </div>
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

            {/* TENANT CONFIGURATION — backend intelligence remains tenant-scoped. */}
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
                  {/* COMPUTED VALIDATION RESULTS FOR LIVE UI HIGHLIGHTS */}
                  {(() => {
                    const tenantVal = validateTenantAlignment(tenantForm, tenantCitiesText);
                    return (
                      <>
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
                            <div className="flex items-center justify-between mb-1">
                              <label className={`text-[10px] block ${tenantVal.fieldErrors.niche ? 'text-red-400 font-bold' : 'text-slate-500'}`}>
                                Nicho Objetivo
                              </label>
                              {tenantVal.fieldErrors.niche && (
                                <span className="text-[9px] text-red-400 font-bold uppercase">Faltante</span>
                              )}
                            </div>
                            <input 
                              type="text" 
                              value={tenantForm.niche || ''} 
                              onChange={(e) => setTenantForm(prev => ({ ...prev, niche: e.target.value }))}
                              placeholder="property_management, hvac, roofing..."
                              className={`w-full bg-slate-950 border rounded px-2.5 py-1.5 text-slate-200 transition-all ${
                                tenantVal.fieldErrors.niche 
                                  ? 'border-red-500/90 bg-red-950/30 text-red-100 ring-1 ring-red-500/50' 
                                  : 'border-slate-800'
                              }`}
                            />
                          </div>
                        </div>
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className={`text-[10px] block ${tenantVal.fieldErrors.icp_description ? 'text-red-400 font-bold' : 'text-slate-500'}`}>
                              Descripción del ICP (Perfil de Cliente Ideal)
                            </label>
                            {tenantVal.fieldErrors.icp_description && (
                              <span className="text-[9px] text-red-400 font-bold uppercase">{tenantVal.fieldErrors.icp_description}</span>
                            )}
                          </div>
                          <textarea 
                            value={tenantForm.icp_description || ''} 
                            onChange={(e) => setTenantForm(prev => ({ ...prev, icp_description: e.target.value }))}
                            rows={2}
                            placeholder="Describe el cliente ideal que busca tu tenant..."
                            className={`w-full bg-slate-950 border rounded px-2.5 py-1.5 text-slate-200 transition-all ${
                              tenantVal.fieldErrors.icp_description 
                                ? 'border-red-500/90 bg-red-950/30 text-red-100 ring-1 ring-red-500/50' 
                                : 'border-slate-800'
                            }`}
                          />
                        </div>
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className={`text-[10px] block ${tenantVal.fieldErrors.cities ? 'text-red-400 font-bold' : 'text-amber-500'}`}>
                              Ciudades de servicio / Service Areas (separadas por ;)
                            </label>
                            {tenantVal.fieldErrors.cities && (
                              <span className="text-[9px] text-red-400 font-bold uppercase">Obligatorio</span>
                            )}
                          </div>
                          <input
                            type="text"
                            value={tenantCitiesText}
                            onChange={(e) => setTenantCitiesText(e.target.value)}
                            placeholder="Austin, TX; Round Rock, TX"
                            className={`w-full bg-slate-950 border rounded px-2.5 py-1.5 transition-all ${
                              tenantVal.fieldErrors.cities 
                                ? 'border-red-500/90 bg-red-950/30 text-red-100 ring-1 ring-red-500/50' 
                                : 'border-amber-800/60 text-amber-100'
                            }`}
                          />
                          <p className={`text-[9px] mt-1 ${tenantVal.fieldErrors.cities ? 'text-red-400 font-bold' : 'text-amber-500/80'}`}>
                            {tenantVal.fieldErrors.cities ? '🔴 Obligatorio. Sin ciudades el Radar Tenant no puede realizar búsquedas.' : 'Obligatorio. Sin ciudades el Radar Tenant no busca.'}
                          </p>
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

                        {/* HELPER CARD DE VALIDACIÓN Y ALINEACIÓN */}
                        <div className={`p-3 rounded-xl border text-xs font-mono transition-all space-y-2.5 ${
                          tenantVal.alignmentStatus === 'missing_fields' 
                            ? 'bg-red-950/30 border-red-800/80 text-red-200'
                            : tenantVal.alignmentStatus === 'misaligned'
                              ? 'bg-amber-950/30 border-amber-800/80 text-amber-200'
                              : 'bg-emerald-950/20 border-emerald-800/80 text-emerald-200'
                        }`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 font-bold uppercase text-[11px]">
                              <CheckCircle2 className={`w-4 h-4 ${
                                tenantVal.alignmentStatus === 'missing_fields' ? 'text-red-400' :
                                tenantVal.alignmentStatus === 'misaligned' ? 'text-amber-400' : 'text-emerald-400'
                              }`} />
                              <span>Alineación de Nicho, ICP y Service Areas</span>
                            </div>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              tenantVal.alignmentStatus === 'missing_fields' ? 'bg-red-900/60 text-red-200 border border-red-700' :
                              tenantVal.alignmentStatus === 'misaligned' ? 'bg-amber-900/60 text-amber-200 border border-amber-700' :
                              'bg-emerald-900/60 text-emerald-200 border border-emerald-700'
                            }`}>
                              {tenantVal.alignmentStatus === 'missing_fields' ? 'Campos Faltantes' :
                               tenantVal.alignmentStatus === 'misaligned' ? 'Revisar Alineación' : 'Alineado Correctamente'}
                            </span>
                          </div>

                          <div className="grid grid-cols-3 gap-1.5 text-[10px] font-bold">
                            <div className={`p-1.5 rounded border text-center ${
                              tenantVal.fieldErrors.niche ? 'bg-red-900/40 border-red-700 text-red-200' : 'bg-slate-900/60 border-slate-700 text-slate-300'
                            }`}>
                              Nicho: {tenantForm.niche ? <span className="text-emerald-400">✓ Definido</span> : <span className="text-red-400 font-bold">✕ Faltante</span>}
                            </div>
                            <div className={`p-1.5 rounded border text-center ${
                              tenantVal.fieldErrors.icp_description ? 'bg-red-900/40 border-red-700 text-red-200' : 'bg-slate-900/60 border-slate-700 text-slate-300'
                            }`}>
                              ICP: {tenantForm.icp_description ? (tenantVal.fieldErrors.icp_description ? <span className="text-amber-400 font-bold">⚠ Desalineado</span> : <span className="text-emerald-400">✓ Alineado</span>) : <span className="text-red-400 font-bold">✕ Faltante</span>}
                            </div>
                            <div className={`p-1.5 rounded border text-center ${
                              tenantVal.fieldErrors.cities ? 'bg-red-900/40 border-red-700 text-red-200' : 'bg-slate-900/60 border-slate-700 text-slate-300'
                            }`}>
                              Ciudades: {tenantCitiesText.trim() ? <span className="text-emerald-400">✓ Definidas</span> : <span className="text-red-400 font-bold">✕ Faltante</span>}
                            </div>
                          </div>

                          <div className="space-y-1 text-[11px]">
                            {tenantVal.messages.map((m, idx) => (
                              <div key={idx} className="flex items-start gap-1.5">
                                <span className="mt-0.5">{m.severity === 'error' ? '🔴' : m.severity === 'warning' ? '🟡' : '🟢'}</span>
                                <span className={m.severity === 'error' ? 'text-red-300 font-semibold' : m.severity === 'warning' ? 'text-amber-300 font-semibold' : 'text-emerald-300'}>
                                  {m.text}
                                </span>
                              </div>
                            ))}
                          </div>

                          {tenantVal.suggestedIcp && (tenantVal.fieldErrors.icp_description || tenantVal.alignmentStatus === 'misaligned') && (
                            <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-2">
                              <div className="text-[10px] text-slate-300">
                                💡 <span className="font-semibold text-amber-200">Sugerencia ICP para {tenantForm.niche}:</span> "{tenantVal.suggestedIcp.slice(0, 60)}…"
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  if (tenantVal.suggestedIcp) {
                                    setTenantForm(prev => ({ ...prev, icp_description: tenantVal.suggestedIcp }));
                                  }
                                }}
                                className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 font-bold text-slate-950 rounded text-[10px] whitespace-nowrap transition-all shadow"
                              >
                                Auto-Alinear
                              </button>
                            </div>
                          )}
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
                      </>
                    );
                  })()}
                </form>

                <div className="pt-4 border-t border-slate-800 space-y-2">
                  <p className="text-[10px] text-slate-500 uppercase font-bold">Simular Bvelt → Radar (análisis gratis)</p>
                  <button
                    type="button"
                    className="w-full py-2.5 bg-indigo-600/80 hover:bg-indigo-500 font-bold rounded-xl text-white text-xs"
                    onClick={async () => {
                      setTenantSaveStatus("Bootstrap Bvelt…");
                      try {
                        let lat: number | undefined;
                        let lon: number | undefined;
                        try {
                          const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
                            if (!navigator.geolocation) return reject(new Error("no geo"));
                            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000 });
                          });
                          lat = pos.coords.latitude;
                          lon = pos.coords.longitude;
                        } catch { /* optional */ }
                        const body: any = {
                          user_id: tenantForm.tenant_id || "tenant_custom_01",
                          tenant_name: tenantForm.tenant_name || "Mi Empresa Cliente",
                          trade: (tenantForm.industry || tenantForm.niche || "").trim(),
                          source: "free_analysis_ui"
                        };
                        if (lat != null && lon != null) {
                          body.lat = lat;
                          body.lon = lon;
                        } else if (tenantCitiesText) {
                          body.city = tenantCitiesText.split(/[;\n]+/)[0].trim();
                        }
                        const r = await fetch(`${apiUrl}/api/bvelt/bootstrap`, {
                          method: "POST",
                          credentials: "include",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify(body)
                        });
                        const data = await r.json();
                        if (r.ok) {
                          setTenantSaveStatus(`OK ${data.city}: ${data.leads?.length || 0} lead(s). ${data.message || ""}`);
                          setCurrentMode("tenant");
                          if (data.tenant_id) setSelectedTenantId(data.tenant_id);
                          fetchTelemetry();
                        } else {
                          setTenantSaveStatus("Error bootstrap: " + (data.error || r.status));
                        }
                      } catch (e: any) {
                        setTenantSaveStatus("Error: " + e.message);
                      }
                    }}
                  >
                    Análisis gratis: geo + 2 clientes cerca
                  </button>
                  <p className="text-[9px] text-slate-600">
                    Ubicación del navegador o primera ciudad del campo. Mismo API que usará Bvelt.
                  </p>
                </div>
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
