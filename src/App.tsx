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
  Terminal, 
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
  Download
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
  draft_subject: string;
  draft_body: string;
  status: string;
  created_at: string;
}

interface Health {
  status: string;
  prospects_today: number;
  hunter_remaining_estimate: number;
  last_run: string | null;
  timestamp: string;
}

interface StatsSummary {
  prospects_by_status: Array<{ status: string; count: number }>;
  runs_summary: { count: number; total_discovered: number; total_finalized: number };
  suppression_list_size: number;
}

export default function App() {
  // Service configuration stored in localStorage
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('FOUNDER_SERVICE_KEY') || 'FOUNDER_SERVICE_KEY_LOCAL');
  const [apiUrl, setApiUrl] = useState(() => localStorage.getItem('RADAR_API_URL') || window.location.origin);
  
  // Pipeline/Telemetries data states
  const [health, setHealth] = useState<Health | null>(null);
  const [stats, setStats] = useState<StatsSummary | null>(null);
  const [recentDrafts, setRecentDrafts] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorState, setErrorState] = useState<string | null>(null);

  // App UI states
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [inspectedProspect, setInspectedProspect] = useState<Prospect | null>(null);
  
  // PWA Install prompt trigger states
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isPwaInstalled, setIsPwaInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // Load all telemetry endpoints
  const fetchTelemetry = async () => {
    setErrorState(null);
    try {
      // 1. GET /health
      const healthRes = await fetch(`${apiUrl}/health`).catch(() => null);
      if (!healthRes || !healthRes.ok) {
        throw new Error('No se pudo conectar con el motor de Bvelt Radar.');
      }
      const healthData = await healthRes.json();
      setHealth(healthData);

      // 2. GET /stats
      const statsRes = await fetch(`${apiUrl}/stats`, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      }).catch(() => null);
      
      if (statsRes && statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      } else {
        // Fallback or request credentials trigger
        if (statsRes?.status === 401) {
          setErrorState("Credenciales inválidas. Verifica tu FOUNDER_SERVICE_KEY.");
        } else {
          setErrorState("Error al cargar estadísticas generales. Comprueba la API.");
        }
      }

      // 3. GET /api/prospects (Recent drafts)
      const prospectsRes = await fetch(`${apiUrl}/api/prospects`).catch(() => null);
      if (prospectsRes && prospectsRes.ok) {
        const pList: Prospect[] = await prospectsRes.json();
        // Filter and sort for drafted/notified/sent ones
        const sorted = pList
          .filter(p => p.status === 'drafted' || p.status === 'notified' || p.status === 'sent')
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        setRecentDrafts(sorted.slice(0, 10)); // Top 10 most recent
      }

      setLoading(false);
    } catch (err: any) {
      setErrorState(err.message || 'Error de conexión.');
      setLoading(false);
    }
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
  }, [apiUrl, apiKey]);

  // Handle manual API config updates
  const saveApiSettings = (key: string, urlVal: string) => {
    localStorage.setItem('FOUNDER_SERVICE_KEY', key);
    localStorage.setItem('RADAR_API_URL', urlVal);
    setApiKey(key);
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

  // Run scouting pipeline manually
  const executeRadarScout = async () => {
    setIsScrubbing(true);
    try {
      const res = await fetch(`${apiUrl}/run?mode=founder`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      if (res.ok) {
        // Success feedback
        setTimeout(() => {
          setIsScrubbing(false);
          fetchTelemetry();
        }, 5000); // 5s wait time
      } else {
        alert("Fallo al iniciar el radar.");
        setIsScrubbing(false);
      }
    } catch (e) {
      alert("Error ejecutando pipeline: " + e);
      setIsScrubbing(false);
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

  // Compute status metrics directly from stats object
  const getCountByStatus = (status: string) => {
    if (!stats) return 0;
    const item = stats.prospects_by_status.find(s => s.status === status);
    return item ? item.count : 0;
  };

  // Render state helper
  const getEngineState = () => {
    if (!health) return { label: 'Desconectado', color: 'bg-red-500 text-red-50', border: 'border-red-500/20' };
    
    // Check if pipeline has processed today
    const hasRunToday = health.prospects_today > 0;
    if (health.status === 'healthy') {
      if (hasRunToday) {
        return { label: 'Radar Activo (Corrida OK)', color: 'bg-emerald-500/10 text-emerald-400', border: 'border-emerald-500/20' };
      }
      return { label: 'Radar Listo (Sin Corrida Hoy)', color: 'bg-amber-500/10 text-amber-400', border: 'border-amber-500/20' };
    }
    return { label: 'Error de Engine', color: 'bg-rose-500/10 text-rose-400', border: 'border-rose-500/20' };
  };

  const currentEngine = getEngineState();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none antialiased pb-safe">
      
      {/* 1. Slim Header Zone (Notch & Safe Area padding) */}
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

        {/* PWA / Install action banner or indicator */}
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

          <button 
            onClick={() => setShowConfig(!showConfig)}
            className="p-2 rounded-lg bg-slate-900/50 border border-slate-900 text-slate-400 hover:text-white"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* API / Local Configurations Settings Modal/Drawer */}
      {showConfig && (
        <div className="bg-slate-900/90 border-b border-slate-800 p-5 space-y-4 font-mono text-xs">
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
            <div>
              <label className="text-[10px] text-slate-500 block mb-1">FOUNDER_SERVICE_KEY (Bearer)</label>
              <input 
                type="password" 
                defaultValue={apiKey}
                id="cfg-key"
                className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-2 text-slate-200 focus:outline-none"
              />
            </div>
            <div className="flex gap-2.5 pt-2">
              <button 
                onClick={() => {
                  const urlVal = (document.getElementById('cfg-url') as HTMLInputElement).value;
                  const keyVal = (document.getElementById('cfg-key') as HTMLInputElement).value;
                  saveApiSettings(keyVal, urlVal);
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

      {/* Main content scroll container */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

        {/* Resilience error card */}
        {errorState && (
          <div className="bg-rose-950/20 border border-rose-900/40 rounded-2xl p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
            <div className="flex-1 space-y-1">
              <h4 className="text-xs font-bold text-rose-300">Error de conexión</h4>
              <p className="text-[11px] text-slate-400 leading-relaxed">{errorState}</p>
              <button 
                onClick={() => {
                  setLoading(true);
                  fetchTelemetry();
                }}
                className="text-[11px] font-bold text-blue-400 flex items-center gap-1 pt-1.5"
              >
                <RefreshCw className="w-3 h-3" /> Reintentar conexión
              </button>
            </div>
          </div>
        )}

        {/* App state content loader spinner */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <RefreshCw className="w-6 h-6 text-blue-500 animate-spin" />
            <p className="text-xs text-slate-500 font-medium">Sincronizando estado...</p>
          </div>
        ) : (
          <>
            {/* 2. Large Engine Status Bar */}
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

            {/* 3. Single Large Action Button */}
            <button
              onClick={executeRadarScout}
              disabled={isScrubbing}
              className={`w-full h-14 min-h-[48px] rounded-2xl bg-blue-600 hover:bg-blue-500 active:scale-95 disabled:bg-slate-900 disabled:text-slate-500 font-bold text-sm tracking-wide transition-all shadow-xl shadow-blue-600/10 flex items-center justify-center gap-3`}
            >
              <RefreshCw className={`w-4 h-4 ${isScrubbing ? 'animate-spin' : ''}`} />
              {isScrubbing ? 'BUSCANDO NEGOCIOS...' : '▶ CORRER RADAR AHORA'}
            </button>

            {/* 4. Compact 2x2 Metric Scoreboard */}
            <div>
              <div className="grid grid-cols-2 gap-3.5 font-mono text-slate-200">
                <div className="bg-slate-900/40 p-4 rounded-2xl border border-slate-900">
                  <span className="text-[10px] text-slate-500 block uppercase font-sans font-bold">Scouted</span>
                  <span className="text-xl font-bold tracking-tight text-slate-100 tabular-nums">
                    {stats?.runs_summary?.total_discovered || 0}
                  </span>
                </div>
                <div className="bg-slate-900/40 p-4 rounded-2xl border border-slate-900">
                  <span className="text-[10px] text-slate-500 block uppercase font-sans font-bold">Drafted</span>
                  <span className="text-xl font-bold tracking-tight text-purple-400 tabular-nums">
                    {getCountByStatus('drafted') + getCountByStatus('notified')}
                  </span>
                </div>
                <div className="bg-slate-900/40 p-4 rounded-2xl border border-slate-900">
                  <span className="text-[10px] text-slate-500 block uppercase font-sans font-bold">Telegram (Pending)</span>
                  <span className="text-xl font-bold tracking-tight text-blue-400 tabular-nums">
                    {getCountByStatus('notified')}
                  </span>
                </div>
                <div className="bg-slate-900/40 p-4 rounded-2xl border border-slate-900">
                  <span className="text-[10px] text-slate-500 block uppercase font-sans font-bold">Suppressed</span>
                  <span className="text-xl font-bold tracking-tight text-red-400 tabular-nums">
                    {stats?.suppression_list_size || 0}
                  </span>
                </div>
              </div>
            </div>

            {/* 5. Minimal list of recent drafts */}
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-slate-900 pb-2.5">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Últimos Leads Draftados</h3>
                <Database className="w-3.5 h-3.5 text-slate-500" />
              </div>

              {recentDrafts.length === 0 ? (
                <div className="text-center py-10 bg-slate-900/10 rounded-2xl border border-slate-900 p-5">
                  <Info className="w-6 h-6 text-slate-600 mx-auto mb-2" />
                  <p className="text-xs text-slate-500 leading-normal">Ningún lead procesado recientemente. Ejecuta el radar para comenzar.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentDrafts.map(p => (
                    <div 
                      key={p.id}
                      onClick={() => setInspectedProspect(inspectedProspect?.id === p.id ? null : p)}
                      className="bg-slate-900/30 border border-slate-900 rounded-2xl p-4 space-y-3 active:bg-slate-900/50 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="text-xs font-bold text-slate-200">{p.name}</h4>
                          <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mt-0.5">
                            <span className="uppercase text-blue-400 font-mono tracking-tight font-semibold">{p.trade}</span>
                            <span>·</span>
                            <span>{p.city}</span>
                          </div>
                        </div>
                        <span className="text-xs font-mono font-bold text-emerald-400">
                          {p.score}/100
                        </span>
                      </div>

                      {/* Expandable details/body viewer */}
                      {inspectedProspect?.id === p.id && (
                        <div className="pt-3.5 border-t border-slate-900/80 space-y-3.5" onClick={(e) => e.stopPropagation()}>
                          <div className="bg-slate-950 p-3 rounded-xl border border-slate-900 font-mono text-[11px] text-slate-300 whitespace-pre-wrap leading-relaxed">
                            <span className="text-slate-500 font-bold block mb-1 text-[9px] uppercase">Subject: {p.draft_subject}</span>
                            {p.draft_body}
                          </div>
                          
                          <button
                            onClick={() => copyToClipboard(p.draft_body, p.id)}
                            className="w-full h-11 min-h-[48px] rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center justify-center gap-2"
                          >
                            {copiedId === p.id ? (
                              <>
                                <Check className="w-4 h-4 text-emerald-400" />
                                Copiado en Portapapeles
                              </>
                            ) : (
                              <>
                                <Copy className="w-4 h-4 text-slate-400" />
                                Copiar Mensaje
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* 9. iOS Safari PWA Install Modal guide */}
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
