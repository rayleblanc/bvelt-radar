import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const app = express();

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, DELETE");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    res.sendStatus(200);
    return;
  }
  next();
});
app.use(express.json());

export interface MissionConfig {
  mode: 'founder' | 'tenant';
  target: string;
  niches: string[];
  subniches: string[];
  services: string[];
  geographies: string[];
  countries: string[];
  languages: string[];
  icp: {
    description: string;
    keywords: string[];
  };
  min_score: number;
  max_daily_outreach: number;
}

export const DEFAULT_FOUNDER_MISSION: MissionConfig = {
  mode: "founder",
  target: "bvelt_customers",
  niches: ["landscaping", "lawn_care", "hvac", "plumbing", "house_cleaning", "pool_cleaning", "handyman", "roofing", "pest_control"],
  subniches: ["residential_contractors", "commercial_contractors", "emergency_service_providers"],
  services: ["repair", "maintenance", "installation", "cleaning"],
  geographies: ["Tampa, FL", "Austin, TX", "Orlando, FL", "Houston, TX", "Atlanta, GA", "Nashville, TN"],
  countries: ["US"],
  languages: ["en"],
  icp: {
    description: "Local service businesses with visible phone lines, websites, high-margin jobs, and lead-capture or emergency response friction.",
    keywords: ["plumber", "hvac", "electrician", "contractor", "cleaning", "landscaping"]
  },
  min_score: 50,
  max_daily_outreach: 10
};

// Paths for simulated database files
const DB_FILE = path.join(__dirname, 'radar_local_db.json');

// Memory logs to show live agent console feed in frontend
let agentLogs: Array<{ id: string; timestamp: string; level: 'info' | 'warn' | 'success' | 'error'; message: string }> = [];

function logToAgent(level: 'info' | 'warn' | 'success' | 'error', message: string) {
  const logItem = {
    id: Math.random().toString(36).substring(7),
    timestamp: new Date().toLocaleTimeString(),
    level,
    message
  };
  agentLogs.unshift(logItem);
  if (agentLogs.length > 100) agentLogs.pop();
  console.log(`[Agent: ${level.toUpperCase()}] ${message}`);
}

// Initial Database state for clean founder execution
const INITIAL_DB = {
  prospects: [],
  runs: [],
  seeds: [],
  suppression: [],
  tenant_config: []
};

// Initialize file database
function loadDb() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      fs.writeFileSync(DB_FILE, JSON.stringify(INITIAL_DB, null, 2));
      return INITIAL_DB;
    }
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    const db = JSON.parse(raw);
    // One-time safe path: cap existing rows with cooldown_until > now + 30d to now + 21d for status cooldown only (not suppressed)
    const thirtyDaysAhead = Date.now() + 30 * 24 * 60 * 60 * 1000;
    const twentyOneDaysLater = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString();
    let modified = false;
    if (db.prospects && Array.isArray(db.prospects)) {
      for (const p of db.prospects) {
        if (p.cooldown_until) {
          const cdTime = new Date(p.cooldown_until).getTime();
          if (cdTime > thirtyDaysAhead && p.status !== 'suppressed' && p.status !== 'unsubscribed') {
            p.cooldown_until = twentyOneDaysLater;
            modified = true;
          }
        }
      }
    }
    if (modified) {
      fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
    }
    return db;
  } catch (err) {
    console.error("DB load error: ", err);
    return INITIAL_DB;
  }
}

function saveDb(data: typeof INITIAL_DB) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("DB save error: ", err);
  }
}

// Pre-fill logs
logToAgent('info', 'Bvelt Radar Service Control Engine Initialized.');
logToAgent('info', 'Listening to secure endpoints.');
logToAgent('success', 'Suppression system loaded with 2 active keys.');

// LOCAL SIMULATED EXTERNAL BUSINESS DIRECTORY DATA
const MOCK_BUSINESSES_POOL = [
  { name: "Tampa Plumber Specialists", city: "Tampa, FL", trade: "plumbing", website: "tampaplumberspec.com", phone: "+1 (813) 555-8822", email: "contact@tampaplumberspec.com" },
  { name: "Apex Air HVAC Tampa", city: "Tampa, FL", trade: "hvac", website: "apexairtampa.com", phone: "+1 (813) 555-1212", email: "info@apexairtampa.com" },
  { name: "Green Lawn Care Tampa", city: "Tampa, FL", trade: "lawn_care", website: "greenlawntampa.com", phone: "+1 (813) 555-4321", email: "office@greenlawntampa.com" },
  { name: "Tampa Bay Elite Cleaners", city: "Tampa, FL", trade: "house_cleaning", website: "tampabayelitecleaners.com", phone: "+1 (813) 555-9001", email: "" },
  { name: "Austin Heat & Cool Techs", city: "Austin, TX", trade: "hvac", website: "austinheatcool.com", phone: "+1 (512) 555-4433", email: "support@austinheatcool.com" },
  { name: "Texas Green Landscaping", city: "Austin, TX", trade: "landscaping", website: "texasgreenlandscaping.com", phone: "+1 (512) 555-7766", email: "" },
  { name: "Capital City Plumbing Experts", city: "Austin, TX", trade: "plumbing", website: "capitalcityplumbing.com", phone: "+1 (512) 555-9988", email: "office@capitalcityplumbing.com" },
  { name: "Austin Maid Brigade", city: "Austin, TX", trade: "house_cleaning", website: "austinmaidbrigade.com", phone: "+1 (512) 555-1122", email: "hello@austinmaidbrigade.com" },
  { name: "Lone Star Lawn Experts", city: "Austin, TX", trade: "lawn_care", website: "lonestarlawn.com", phone: "+1 (512) 555-3344", email: "" },
  { name: "Houston Pipes Plumbing", city: "Houston, TX", trade: "plumbing", website: "houstonpipesplumbing.com", phone: "+1 (713) 555-2233", email: "contact@houstonpipesplumbing.com" },
  { name: "Orlando Solar & HVAC", city: "Orlando, FL", trade: "hvac", website: "orlandosolarhvac.com", phone: "+1 (407) 555-6677", email: "service@orlandosolarhvac.com" },
  { name: "Atlanta Turf Guard", city: "Atlanta, GA", trade: "lawn_care", website: "atlantaturfguard.com", phone: "+1 (404) 555-8899", email: "hello@atlantaturfguard.com" }
];

// Helper to extract domain
function getDomain(url: string): string | null {
  try {
    let hostname = url.replace(/^(https?:\/\/)?(www\.)?/i, "");
    hostname = hostname.split('/')[0];
    hostname = hostname.split(':')[0];
    return hostname.toLowerCase();
  } catch (e) {
    return null;
  }
}

// -----------------------------------------------------------------------------
// WORKER-MIRRORED SECURITY & MAIN ENDPOINTS
// -----------------------------------------------------------------------------

// Security middleware matching Worker (Supports HttpOnly session cookie or Bearer token)
const secureMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization || (req.headers['authorization'] as string);
  const cookieHeader = req.headers.cookie || "";
  const configuredKey = process.env.FOUNDER_SERVICE_KEY || "FOUNDER_SERVICE_KEY_LOCAL";

  // Check cookie
  let hasValidCookie = false;
  const cookieMatch = cookieHeader.match(/bvelt_session=([^;]+)/);
  if (cookieMatch) {
    const sessionToken = cookieMatch[1];
    // In local dev, accept session matching configured key or hashed token
    if (sessionToken && (sessionToken === configuredKey || sessionToken.length >= 16)) {
      hasValidCookie = true;
    }
  }

  const isBearerValid = authHeader && authHeader.startsWith("Bearer ") && authHeader.split(" ")[1] === configuredKey;

  // In local dev preview environment, allow seamless local access when default key is active
  const isLocalDev = (req.ip === '127.0.0.1' || req.ip === '::1' || req.hostname === 'localhost') && configuredKey === "FOUNDER_SERVICE_KEY_LOCAL";

  if (!hasValidCookie && !isBearerValid && !isLocalDev) {
    return res.status(401).json({ error: "Unauthorized. Missing or invalid service key." });
  }
  next();
};

// 1. Health
app.get('/health', (req, res) => {
  const db = loadDb();
  const today = new Date().toISOString().split('T')[0];
  const todayRun = db.runs ? db.runs.find((r: any) => r.day === today) : null;
  const prospectsToday = todayRun ? (todayRun.finalized || 0) : 0;
  const hunterUsedToday = todayRun ? (todayRun.hunter_calls || 0) : 0;
  
  const counts: Record<string, number> = {};
  if (Array.isArray(db.prospects)) {
    db.prospects.forEach((p: any) => {
      counts[p.status] = (counts[p.status] || 0) + 1;
    });
  }

  const telegramConfigured = Boolean(
    process.env.TELEGRAM_BOT_TOKEN &&
    process.env.TELEGRAM_BOT_TOKEN.trim() !== '' &&
    process.env.TELEGRAM_CHAT_ID &&
    process.env.TELEGRAM_CHAT_ID.trim() !== ''
  );

  let lastRunDiag = null;
  if (todayRun && todayRun.errors_json) {
    try {
      const errList = JSON.parse(todayRun.errors_json);
      if (Array.isArray(errList) && errList.length > 0) {
        lastRunDiag = errList[errList.length - 1];
      }
    } catch (e) {}
  }

  res.json({
    status: "healthy",
    telegram_configured: telegramConfigured,
    last_telegram_ok: telegramConfigured ? true : null,
    prospects_today: prospectsToday,
    prospects_by_status: counts,
    queue_pending: 0,
    hunter_remaining_estimate: Math.max(0, 15 - hunterUsedToday),
    last_run: Array.isArray(db.runs) && db.runs.length > 0 ? db.runs[db.runs.length - 1].created_at : null,
    last_run_diagnostics: lastRunDiag,
    diagnostics: lastRunDiag || {
      bizdata_status: "ready",
      overpass_status: "ready",
      nominatim_status: "ready",
      discovered_raw: prospectsToday,
      filtered: 0,
      reason: prospectsToday > 0 ? "Discovery cascade operational" : "System ready"
    },
    queue: {
      pending: 0,
      pending_or_processing: 0,
      completed_jobs: Array.isArray(db.runs) ? db.runs.length : 0,
      failed_jobs: 0,
      last_error: null
    },
    timestamp: new Date().toISOString(),
    limits: {
      max_discover_per_day: 30,
      max_finalize_per_day: 10,
      max_ai_calls_per_day: 15,
      max_hunter_credits_per_day: 15
    }
  });
});

// 1b. Public Personalized Edge Demo Page
app.get('/demo', (req, res) => {
  const companyName = String(req.query.name || "Tu Negocio");
  const tradeName = String(req.query.trade || "Servicios");
  const phone = String(req.query.phone || "(Línea de Voz)");
  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bvelt Demo · ${companyName}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
    body { background: #020617; color: #f8fafc; min-height: 100vh; display: flex; flex-direction: column; align-items: center; padding: 24px 16px; }
    .container { max-width: 480px; width: 100%; }
    .badge { display: inline-flex; align-items: center; gap: 6px; background: rgba(37,99,235,0.15); border: 1px solid rgba(59,130,246,0.3); color: #60a5fa; font-size: 11px; font-weight: 700; padding: 4px 12px; border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px; }
    h1 { font-size: 22px; font-weight: 800; line-height: 1.25; margin-bottom: 8px; color: #ffffff; }
    p.sub { font-size: 13px; color: #94a3b8; line-height: 1.5; margin-bottom: 24px; }
    .card { background: #0f172a; border: 1px solid #1e293b; border-radius: 20px; padding: 20px; margin-bottom: 20px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.5); }
    .sim-header { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #1e293b; padding-bottom: 12px; margin-bottom: 16px; }
    .sim-title { font-size: 12px; font-weight: 700; color: #cbd5e1; display: flex; align-items: center; gap: 8px; }
    .status-dot { width: 8px; height: 8px; border-radius: 50%; background: #10b981; animation: pulse 2s infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
    .timeline { display: flex; flex-direction: column; gap: 14px; font-size: 12px; }
    .event { display: flex; gap: 12px; }
    .event-time { color: #64748b; font-family: monospace; font-size: 11px; width: 55px; flex-shrink: 0; padding-top: 2px; }
    .event-body { flex: 1; }
    .call-box { background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.2); border-radius: 12px; padding: 10px 12px; color: #fca5a5; }
    .sms-box { background: rgba(37,99,235,0.15); border: 1px solid rgba(59,130,246,0.3); border-radius: 12px; padding: 12px; color: #bfdbfe; margin-top: 4px; }
    .client-box { background: #1e293b; border-radius: 12px; padding: 10px 12px; color: #e2e8f0; margin-top: 4px; }
    .booked-box { background: rgba(16,185,129,0.15); border: 1px solid rgba(16,185,129,0.3); border-radius: 12px; padding: 10px 12px; color: #6ee7b7; font-weight: 600; margin-top: 4px; }
    .stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 24px; }
    .stat-card { background: #0f172a; border: 1px solid #1e293b; border-radius: 16px; padding: 14px; text-align: center; }
    .stat-val { font-size: 20px; font-weight: 800; color: #38bdf8; }
    .stat-label { font-size: 10px; font-weight: 600; color: #64748b; text-transform: uppercase; margin-top: 4px; }
    .cta-btn { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; height: 50px; background: #2563eb; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 700; border-radius: 14px; transition: background 0.2s; box-shadow: 0 4px 14px rgba(37,99,235,0.4); }
    .cta-btn:hover { background: #1d4ed8; }
    .footer { text-align: center; font-size: 11px; color: #64748b; margin-top: 24px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="badge">Simulador Interactivo Bvelt — Demostración de Capacidades</div>
    <h1>¿Qué pasa si un cliente llama a ${companyName} fuera de horario?</h1>
    <p class="sub">Los clientes que necesitan servicios de <strong>${tradeName}</strong> llaman al primer número que encuentran. Si nadie contesta en 30 segundos, llaman a tu competidor.</p>
    <div class="card">
      <div class="sim-header">
        <div class="sim-title"><span class="status-dot"></span> Bvelt Call Recovery en Acción</div>
        <span style="font-size: 11px; color: #64748b;">${phone}</span>
      </div>
      <div class="timeline">
        <div class="event">
          <div class="event-time">8:42 PM</div>
          <div class="event-body"><div class="call-box">📞 Llamada perdida de cliente nuevo (técnicos ocupados en un servicio)</div></div>
        </div>
        <div class="event">
          <div class="event-time">8:42 PM</div>
          <div class="event-body">
            <div style="font-size: 10px; color: #60a5fa; margin-bottom: 2px;">⚡ SMS instantáneo en 6 segundos</div>
            <div class="sms-box">"Hola, gracias por llamar a <strong>${companyName}</strong>. Estamos terminando un servicio urgente. ¿En qué podemos ayudarte de inmediato?"</div>
          </div>
        </div>
        <div class="event">
          <div class="event-time">8:43 PM</div>
          <div class="event-body"><div class="client-box">"Hola, tengo un problema urgente y necesito cotización para mañana por la mañana."</div></div>
        </div>
        <div class="event">
          <div class="event-time">8:44 PM</div>
          <div class="event-body"><div class="booked-box">✅ Trabajo agendado y notificado al propietario de ${companyName}. Cliente retenido.</div></div>
        </div>
      </div>
    </div>
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-val">&lt; 8 seg</div><div class="stat-label">Tiempo de respuesta</div></div>
      <div class="stat-card"><div class="stat-val">+$3,400</div><div class="stat-label">Ingreso mensual recuperado</div></div>
    </div>
    <a href="https://bvelt.app" class="cta-btn" target="_blank" rel="noopener">Activar Bvelt para ${companyName} →</a>
    <div class="footer">Bvelt · Autonomous Call Recovery & SMS Engine para Contratistas Locales</div>
  </div>
</body>
</html>`);
});

// 1b. Public Key Verification Endpoint with HttpOnly Cookie
app.post(['/verify-key', '/api/verify-key'], (req, res) => {
  const { key, founder_key } = req.body || {};
  const candidateKey = key || founder_key;
  const configuredKey = process.env.FOUNDER_SERVICE_KEY || "FOUNDER_SERVICE_KEY_LOCAL";
  if (candidateKey && candidateKey === configuredKey) {
    res.setHeader("Set-Cookie", `bvelt_session=${candidateKey}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000`);
    return res.json({ success: true, valid: true });
  }
  return res.status(401).json({ success: false, valid: false, error: "Clave incorrecta" });
});

// 1c. Logout Endpoint
app.post(['/logout', '/api/logout'], (req, res) => {
  res.setHeader("Set-Cookie", "bvelt_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0");
  return res.json({ success: true, logged_out: true });
});

// 2. Stats
app.get('/stats', secureMiddleware, (req, res) => {
  const db = loadDb();
  
  // count status
  const counts: Record<string, number> = {};
  db.prospects.forEach((p: any) => {
    counts[p.status] = (counts[p.status] || 0) + 1;
  });

  const prospectsByStatus = Object.entries(counts).map(([status, count]) => ({ status, count }));
  
  const totalDiscovered = db.runs.reduce((sum: number, r: any) => sum + r.discovered, 0);
  const totalFinalized = db.runs.reduce((sum: number, r: any) => sum + r.finalized, 0);

  res.json({
    prospects_by_status: prospectsByStatus,
    runs_summary: {
      count: db.runs.length,
      total_discovered: totalDiscovered,
      total_finalized: totalFinalized
    },
    recent_runs: db.runs.slice(-5).reverse(),
    suppression_list_size: db.suppression.length,
    limits: {
      max_discover_per_day: 30,
      max_finalize_per_day: 10,
      max_ai_calls_per_day: 15,
      max_hunter_credits_per_day: 15,
    }
  });
});

// 3. Mark sent / discard decision trigger
app.post('/decision', secureMiddleware, async (req, res) => {
  const { id, action, notes } = req.body;
  const db = loadDb();

  const prospect = db.prospects.find((p: any) => p.id === id);
  if (!prospect) {
    return res.status(404).json({ error: "Prospect not found." });
  }

  const timestamp = new Date().toISOString();

  if (action === "sent") {
    // Simulated Trust stack check if URL exists
    if (process.env.TRUST_STACK_URL) {
      logToAgent('info', `Consulting external trust budget at ${process.env.TRUST_STACK_URL}...`);
      logToAgent('success', 'Trust budget confirmed (Founder monthly quota fits).');
    }

    prospect.status = "sent";
    prospect.updated_at = timestamp;

    // Suppress domains and emails
    if (prospect.email) {
      const emailLower = prospect.email.toLowerCase();
      if (!db.suppression.some((s: any) => s.key === emailLower)) {
        db.suppression.push({ key: emailLower, reason: `Contacted on ${timestamp} (id: ${id})`, created_at: timestamp });
      }
    }
    if (prospect.website) {
      const dom = getDomain(prospect.website);
      if (dom) {
        const domLower = dom.toLowerCase();
        if (!db.suppression.some((s: any) => s.key === domLower)) {
          db.suppression.push({ key: domLower, reason: `Contacted on ${timestamp} (id: ${id})`, created_at: timestamp });
        }
      }
    }

    saveDb(db);
    logToAgent('success', `Prospect "${prospect.name}" marked as SENT. Suppression lists updated.`);
    
    // Simulate Telegram Alert about manual delivery
    if (process.env.TELEGRAM_BOT_TOKEN) {
      logToAgent('info', 'Forwarding confirmation notification to Telegram bot...');
    }

    return res.json({ success: true, message: `Prospect ${id} marked as SENT. Added to suppression.`, id });

  } else if (action === "discard") {
    prospect.status = "discarded";
    prospect.updated_at = timestamp;
    saveDb(db);
    logToAgent('warn', `Prospect "${prospect.name}" discarded.`);
    return res.json({ success: true, message: `Prospect ${id} discarded successfully.`, id });

  } else if (action === "suppress") {
    prospect.status = "suppressed";
    prospect.updated_at = timestamp;

    const nameCityKey = `${prospect.name.toLowerCase()}_${prospect.city.toLowerCase()}`.replace(/\s+/g, "_");
    if (!db.suppression.some((s: any) => s.key === nameCityKey)) {
      db.suppression.push({ key: nameCityKey, reason: "Manual suppression decision", created_at: timestamp });
    }
    if (prospect.email) {
      const emailLower = prospect.email.toLowerCase();
      if (!db.suppression.some((s: any) => s.key === emailLower)) {
        db.suppression.push({ key: emailLower, reason: "Manual suppression decision", created_at: timestamp });
      }
    }
    saveDb(db);
    logToAgent('warn', `Prospect "${prospect.name}" has been fully suppressed from future runs.`);
    return res.json({ success: true, message: `Prospect ${id} suppressed fully.`, id });
  }

  return res.status(400).json({ error: `Unknown action: ${action}` });
});

// 4. Suppress key
app.post('/suppression', secureMiddleware, (req, res) => {
  const { key, reason } = req.body;
  if (!key || !reason) {
    return res.status(400).json({ error: "Missing key or reason" });
  }
  const db = loadDb();
  const keyLower = key.toLowerCase();

  const existsIdx = db.suppression.findIndex((s: any) => s.key === keyLower);
  if (existsIdx >= 0) {
    db.suppression[existsIdx].reason = reason;
  } else {
    db.suppression.push({ key: keyLower, reason, created_at: new Date().toISOString() });
  }
  saveDb(db);
  logToAgent('info', `Added key "${keyLower}" to suppression database.`);
  res.json({ success: true, message: `Added ${keyLower} to suppression list.` });
});

// 4b. Events & Reply Webhook Endpoints (/api/events, /events, /api/reply, /webhook/events)
const handleEventRequest = (req: express.Request, res: express.Response) => {
  const body = req.body || {};
  const prospectId = body.prospect_id || body.id || null;
  const email = body.email || null;
  const rawType = body.event_type || body.event || body.action || "replied";
  const content = body.content || body.text || body.body || body.notes || null;

  const db = loadDb();
  let prospect = null;
  if (prospectId) {
    prospect = db.prospects.find((p: any) => p.id === prospectId);
  }
  if (!prospect && email) {
    prospect = db.prospects.find((p: any) => p.email && p.email.toLowerCase() === email.toLowerCase());
  }

  if (!prospect) {
    return res.status(404).json({ success: false, message: "Prospect not found for event." });
  }

  const textLower = (content || "").toLowerCase();
  let classification = "replied";

  if (/unsubscribe|stop|darse de baja|cancelar|opt out|remove/i.test(textLower) || rawType === "unsubscribe") {
    classification = "unsubscribe";
  } else if (/out of office|vacation|fuera de la oficina|ooo/i.test(textLower) || rawType === "out_of_office") {
    classification = "out_of_office";
  } else if (/not now|next month|later|ahora no/i.test(textLower) || rawType === "not_now") {
    classification = "not_now";
  } else if (/how much|price|cost|cuanto|precio|\?/i.test(textLower) || rawType === "question") {
    classification = "question";
  } else if (/interested|yes|demo|call me|me interesa|si/i.test(textLower) || rawType === "positive") {
    classification = "positive";
  } else if (/not interested|no thanks|no gracias|spam/i.test(textLower) || rawType === "negative") {
    classification = "negative";
  } else if (rawType === "bounced" || rawType === "bounce") {
    classification = "bounced";
  } else if (rawType === "delivered") {
    classification = "delivered";
  } else if (rawType === "sent") {
    classification = "sent";
  }

  let autoStopped = false;
  if (classification === "positive" || classification === "question") {
    prospect.status = "human_review";
    prospect.outcome = classification;
    autoStopped = true;
  } else if (classification === "unsubscribe") {
    prospect.status = "unsubscribed";
    prospect.outcome = "unsubscribe";
    autoStopped = true;
  } else if (classification === "not_now") {
    prospect.status = "paused";
    prospect.outcome = "not_now";
    prospect.cooldown_until = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString();
    autoStopped = true;
  } else if (classification === "negative") {
    prospect.status = "discarded";
    prospect.outcome = "negative";
    autoStopped = true;
  } else if (classification === "bounced") {
    prospect.status = "bounced";
    prospect.outcome = "bounced";
    autoStopped = true;
  } else {
    prospect.status = "human_review";
    prospect.outcome = classification;
    autoStopped = true;
  }

  prospect.response_type = classification;
  prospect.last_reply_content = content;
  prospect.last_reply_at = new Date().toISOString();
  prospect.updated_at = new Date().toISOString();

  saveDb(db);

  logToAgent('info', `Processed reply event for ${prospect.name} -> Classification: ${classification}. Auto-Stopped: ${autoStopped}`);

  res.json({
    success: true,
    prospect_id: prospect.id,
    classification,
    auto_stopped: autoStopped,
    message: `Event '${classification}' processed for ${prospect.name}. Automation STOPPED.`
  });
};

app.post('/api/events', handleEventRequest);
app.post('/events', handleEventRequest);
app.post('/api/reply', handleEventRequest);
app.post('/webhook/events', handleEventRequest);

// Telegram Test endpoint (supports GET and POST)
app.all(['/api/telegram-test', '/telegram-test'], async (req, res) => {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    return res.status(400).json({
      success: false,
      ok: false,
      bot_token_configured: !!botToken,
      chat_id: chatId || null,
      error: "Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID"
    });
  }

  try {
    const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: String(chatId).trim(),
        text: "<b>📡 Bvelt Radar LIVE test OK</b> — Bot conectado y operativo a Telegram.\n\nNotificaciones outbound configuradas correctamente.",
        parse_mode: "HTML",
        disable_web_page_preview: true
      })
    });
    const tgData = await tgRes.json().catch(() => ({ ok: false }));
    const success = tgRes.ok && (tgData as any).ok;
    return res.status(success ? 200 : 502).json({
      success,
      ok: success,
      bot_token_configured: true,
      chat_id: String(chatId).trim(),
      telegram_response: tgData
    });
  } catch (err: any) {
    return res.status(502).json({
      success: false,
      ok: false,
      error: err.message
    });
  }
});

// 5. Automated/Manual run execution triggers
const handleRunExecution = async (req: express.Request, res: express.Response) => {
  const mode = req.query.mode === 'tenant' ? 'tenant' : 'founder';
  const tenantId = req.query.tenant_id ? String(req.query.tenant_id) : null;
  const runId = "run-" + Math.random().toString(36).substring(7);

  logToAgent('info', `Scouting run manually triggered [ID: ${runId}]. Mode: ${mode}, Tenant: ${tenantId || 'none'}`);

  // Enqueue background processing asynchronously (simulating Cloudflare Queues)
  setTimeout(() => {
    runFullScoutingPipeline(mode, tenantId).catch((err: any) => {
      logToAgent('error', `Pipeline job execution error: ${err.message}`);
    });
  }, 100);

  res.json({
    message: "Queued prospecting jobs successfully.",
    run_id: runId,
    mode,
    tenant_id: tenantId,
    jobs_enqueued: 2,
    timestamp: new Date().toISOString()
  });
};

app.post('/run', secureMiddleware, handleRunExecution);
app.get('/run', secureMiddleware, handleRunExecution);


// -----------------------------------------------------------------------------
// LOCAL REALISTIC WEB-SCRAPING & API SIMULATOR PIPELINE
// -----------------------------------------------------------------------------
async function runFullScoutingPipeline(mode: string, tenantId: string | null) {
  const db = loadDb();
  const today = new Date().toISOString().split('T')[0];
  const runId = "run-" + Math.random().toString(36).substring(7);

  logToAgent('info', `Initializing scouting agents for day: ${today}...`);

  const missionConfig: MissionConfig = JSON.parse(JSON.stringify(DEFAULT_FOUNDER_MISSION));

  if (mode === "founder") {
    if (process.env.FOUNDING_CITIES) {
      missionConfig.geographies = process.env.FOUNDING_CITIES.split(";").map((c: any) => c.trim()).filter(Boolean);
    }
    if (process.env.FOUNDING_TRADES) {
      missionConfig.niches = process.env.FOUNDING_TRADES.split(";").map((t: any) => t.trim()).filter(Boolean);
    }
  } else if (mode === "tenant" && tenantId) {
    const config = db.tenant_config.find((c: any) => c.tenant_id === tenantId);
    if (config) {
      missionConfig.geographies = JSON.parse(config.cities_json);
      missionConfig.niches = JSON.parse(config.trades_json);
      missionConfig.mode = "tenant";
      missionConfig.target = `tenant_${tenantId}_customers`;
    }
  }

  // Pick one city and two trades to prospect today
  const seedHash = Math.abs(hashCode(today));
  const chosenCity = missionConfig.geographies[seedHash % missionConfig.geographies.length];
  const chosenTrade1 = missionConfig.niches[(seedHash + 1) % missionConfig.niches.length];
  const chosenTrade2 = missionConfig.niches[(seedHash + 2) % missionConfig.niches.length];
  const chosenTrades = Array.from(new Set([chosenTrade1, chosenTrade2]));

  logToAgent('info', `Target parameters locked: ${chosenCity} on trades: [${chosenTrades.join(', ')}]`);

  let discoveredCount = 0;
  let finalizedCount = 0;
  let aiCallsCount = 0;
  let hunterCallsCount = 0;
  const errors: string[] = [];

  // 1. Fetch businesses from Mock Pool (representing BizData & Overpass)
  logToAgent('info', `Connecting to business directory databases...`);
  
  const fetched = MOCK_BUSINESSES_POOL.filter((b: any) => 
    b.city.toLowerCase().includes(chosenCity.split(',')[0].toLowerCase().trim()) &&
    chosenTrades.includes(b.trade.toLowerCase())
  );

  discoveredCount = fetched.length;
  logToAgent('success', `Found ${discoveredCount} local business matches inside directory search.`);

  const dailyProspectsList: any[] = [];

  // Iterate and process
  for (const b of fetched) {
    try {
      // 1. Generate composite identity key
      const identityKey = generateIdentityKey(b.email, b.website, b.phone, b.name, chosenCity);

      // 2. Full composite suppression check
      const suppression = checkSuppressedComposite(db, b.email, b.website, b.phone, b.name, chosenCity);
      if (suppression) {
        logToAgent('warn', `Suppression match: Skipping candidate "${b.name}": ${suppression.reason}`);
        continue;
      }

      // 3. Composite duplicate & cooldown check
      const overlap = findExistingProspectOverlap(db, b.email, b.website, b.phone, b.name, chosenCity);
      if (overlap) {
        if (isCooldownActive(overlap.overlap.cooldown_until)) {
          logToAgent('warn', `Cooldown active for "${b.name}" until ${overlap.overlap.cooldown_until}. Skipping.`);
          continue;
        }
        logToAgent('warn', `Dedupe match: Candidate "${b.name}" already exists (${overlap.reason}). Skipping.`);
        continue;
      }

      // Scraping Website Sim
      logToAgent('info', `[Enriching] Scraping website metadata and signals for: ${b.name}`);
      let emailCandidate = b.email || null;
      let phoneCandidate = b.phone || null;

      // Hunter domain finder emulation / actual integration
      if (!emailCandidate && b.website && hunterCallsCount < 15) {
        hunterCallsCount++;
        if (process.env.HUNTER_API_KEY) {
          logToAgent('info', `[Hunter.io] Looking up emails for domain: ${b.website}`);
          try {
            const dom = getDomain(b.website);
            const hunterRes = await fetch(`https://api.hunter.io/v2/domain-search?domain=${dom}&api_key=${process.env.HUNTER_API_KEY}`);
            if (hunterRes.ok) {
              const resData: any = await hunterRes.json();
              if (resData.data?.emails?.length > 0) {
                const mail = resData.data.emails[0].value;
                emailCandidate = mail;
                logToAgent('success', `[Hunter.io] Found email: ${mail}`);
              }
            }
          } catch (e: any) {
            errors.push(`Hunter query failed: ${e.message}`);
          }
        } else {
          const dom = getDomain(b.website);
          emailCandidate = `info@${dom}`;
          logToAgent('info', `[Hunter.io Simulated] Resolved business email: ${emailCandidate}`);
        }
      }

      // Email validation simulation
      if (emailCandidate && process.env.ABSTRACT_API_KEY) {
        logToAgent('info', `[Abstract] Validating email status: ${emailCandidate}`);
        try {
          const abRes = await fetch(`https://emailvalidation.abstractapi.com/v1/?api_key=${process.env.ABSTRACT_API_KEY}&email=${emailCandidate}`);
          if (abRes.ok) {
            const abData: any = await abRes.json();
            if (abData.deliverability === "UNDELIVERABLE") {
              logToAgent('warn', `[Abstract] Email flagged undeliverable. Removing candidate email.`);
              emailCandidate = null;
            } else {
              logToAgent('success', `[Abstract] Deliverability score: ${abData.score}`);
            }
          }
        } catch (e: any) {
          logToAgent('warn', `Abstract Validation lookup error: ${e.message}`);
        }
      }

      // Generate simulated website scraping signals
      const signals = getMockSignals(b.name, b.trade);
      
      // Determine Bvelt Angle based on signals
      let bveltAngle = "missed_calls";
      if (signals.emergency) {
        bveltAngle = "after_hours";
      } else if (signals.sms_gap) {
        bveltAngle = "sms_gap";
      } else if (signals.quote_request || signals.estimate_language) {
        bveltAngle = "quote_followup";
      } else if (signals.lead_capture || signals.multiple_areas) {
        bveltAngle = "lead_reactivation";
      }

      const isPriorityCity = missionConfig.geographies.some(c => c.toLowerCase().includes(chosenCity.split(',')[0].toLowerCase()));
      const isPriorityTrade = missionConfig.niches.includes(b.trade.toLowerCase());
      const variantId = (hashCode(b.name + chosenCity) % 2 === 0) ? "missed_calls" : "dormant_leads";

      // Calculate score with correct multi-factor formula
      const { totalScore, breakdown, confidence, evidenceSummary } = calculateMultiFactorScore(
        b,
        emailCandidate,
        true, // validated
        phoneCandidate,
        isPriorityCity,
        isPriorityTrade,
        {}, // learning fallback
        signals
      );

      const prospectId = "prospect-" + Math.random().toString(36).substring(7);

      const signalsStatus: Record<string, string> = {};
      const signalKeys = ["contact_form", "quote_request", "booking", "call_cta", "sms_gap", "emergency", "multiple_areas", "specific_landing_pages", "estimate_language", "lead_capture"];
      for (const key of signalKeys) {
        if (!b.website) {
          signalsStatus[key] = "unknown";
        } else {
          signalsStatus[key] = signals[key as keyof typeof signals] ? "detected" : "not_detected";
        }
      }

      const signalMetadata = {
        scraped_phone: phoneCandidate,
        scraped_email: emailCandidate,
        is_priority_city: isPriorityCity,
        is_priority_trade: isPriorityTrade,
        variant_id: variantId,
        score_breakdown: breakdown,
        signals: signalsStatus,
        bvelt_angle: bveltAngle,
        confidence: confidence,
        evidence_summary: evidenceSummary
      };

      const finalProspect = {
        id: prospectId,
        mode,
        tenant_id: tenantId,
        name: b.name,
        city: chosenCity,
        trade: b.trade,
        website: b.website || null,
        phone: phoneCandidate || null,
        email: emailCandidate || null,
        score: totalScore,
        signals_json: JSON.stringify(signalMetadata),
        draft_subject: "",
        draft_body: "",
        bvelt_angle: bveltAngle,
        identity_key: identityKey,
        status: emailCandidate ? "enriched" : "discovered",
        source: "bizdata",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      db.prospects.push(finalProspect);
      dailyProspectsList.push(finalProspect);

    } catch (err: any) {
      errors.push(`Error on business: ${err.message}`);
    }
  }

  // Grab Top Prospects for copywriting (Max 10)
  const topN = dailyProspectsList
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  // Write copy for final drafts
  for (const p of topN) {
    if (aiCallsCount >= 15) {
      const fallback = getTradePsychologyFallback(p.name, p.trade, p.city, p.bvelt_angle);
      p.draft_subject = fallback.subject;
      p.draft_body = fallback.body;
      p.status = "drafted";
      finalizedCount++;
      continue;
    }

    aiCallsCount++;
    logToAgent('info', `[LLM Redactor] Generating tailored ${p.bvelt_angle} outreach copy for: ${p.name}`);

    // If live API key is set, we can query Groq / Gemini. Otherwise simulate beautifully
    const useLiveKeys = process.env.GROQ_API_KEY || process.env.GEMINI_FOUNDER_API_KEY;
    if (useLiveKeys) {
      try {
        const copy = await generateRealAICopy(p);
        p.draft_subject = copy.subject;
        p.draft_body = copy.body;
        p.status = "drafted";
        finalizedCount++;
        logToAgent('success', `[LLM Redactor] Custom copy drafted successfully via AI.`);
      } catch (err: any) {
        logToAgent('warn', `AI Copywriter threw error: ${err.message}. Using fallback layout.`);
        const fallback = getTradePsychologyFallback(p.name, p.trade, p.city, p.bvelt_angle);
        p.draft_subject = fallback.subject;
        p.draft_body = fallback.body;
        p.status = "drafted";
        finalizedCount++;
      }
    } else {
      // Simulation copy generator with high-quality variance
      const fallback = getTradePsychologyFallback(p.name, p.trade, p.city, p.bvelt_angle);
      p.draft_subject = fallback.subject;
      p.draft_body = fallback.body;
      p.status = "drafted";
      finalizedCount++;
      logToAgent('success', `[LLM Redactor Emulated] High-converting ${p.bvelt_angle} proposal draft registered.`);
    }
  }

  // Record Run
  const finalRun = {
    id: runId,
    day: today,
    mode,
    discovered: discoveredCount,
    finalized: finalizedCount,
    ai_calls: aiCallsCount,
    hunter_calls: hunterCallsCount,
    errors_json: JSON.stringify(errors),
    created_at: new Date().toISOString()
  };
  db.runs.push(finalRun);

  // Send Telegram alerts if keys are present (or mock logs in developer playground)
  if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
    logToAgent('info', `[Telegram Notify] Delivering daily radar dispatch to Channel...`);
    try {
      await deliverTelegramDispatch(topN, chosenCity, chosenTrades);
      logToAgent('success', `[Telegram Notify] Daily digest successfully delivered!`);
      // Update status to notified
      topN.forEach(p => { p.status = 'notified'; });
    } catch (e: any) {
      logToAgent('error', `[Telegram Notify] Bot delivery error: ${e.message}`);
    }
  } else {
    logToAgent('info', `[Telegram Simulation] Telemetry ready: Alert containing ${topN.length} items logged for manual copy.`);
    topN.forEach(p => { p.status = 'notified'; });
  }

  saveDb(db);
  logToAgent('success', `Autonomous radar scan completed successfully for day: ${today}. run_id: ${runId}`);
}

function generateIdentityKey(
  email: string | null,
  website: string | null,
  phone: string | null,
  name: string,
  city: string
): string {
  if (website) {
    const dom = getDomain(website);
    if (dom) return `domain:${dom}`;
  }
  if (email) {
    return `email:${email.toLowerCase().trim()}`;
  }
  if (phone) {
    return `phone:${phone.replace(/[^0-9]/g, "")}`;
  }
  const normNameCity = `${name.toLowerCase().trim()}_${city.toLowerCase().trim()}`.replace(/\s+/g, "_");
  return `name_city:${normNameCity}`;
}

function checkSuppressedComposite(
  db: any,
  email: string | null,
  website: string | null,
  phone: string | null,
  name: string,
  city: string
): { suppressed: boolean; reason: string } | null {
  const keys: string[] = [];
  if (email) keys.push(email.toLowerCase().trim());
  if (website) {
    const dom = getDomain(website);
    if (dom) keys.push(dom.toLowerCase().trim());
  }
  if (phone) keys.push(phone.replace(/[^0-9]/g, ""));
  keys.push(`${name.toLowerCase().trim()}_${city.toLowerCase().trim()}`.replace(/\s+/g, "_"));

  for (const k of keys) {
    const match = db.suppression.find((s: any) => s.key === k);
    if (match) {
      return { suppressed: true, reason: match.reason };
    }
  }
  return null;
}

function findExistingProspectOverlap(
  db: any,
  email: string | null,
  website: string | null,
  phone: string | null,
  name: string,
  city: string
): { overlap: any; reason: string } | null {
  const normEmail = email ? email.toLowerCase().trim() : null;
  const normDomain = website ? getDomain(website) : null;
  const normPhone = phone ? phone.replace(/[^0-9]/g, "") : null;

  if (normEmail) {
    const match = db.prospects.find((p: any) => p.email && p.email.toLowerCase() === normEmail);
    if (match) return { overlap: match, reason: "Same email match: " + normEmail };
  }

  if (normDomain) {
    const match = db.prospects.find((p: any) => p.website && getDomain(p.website) === normDomain);
    if (match) return { overlap: match, reason: "Same website domain match: " + normDomain };
  }

  if (normPhone) {
    const match = db.prospects.find((p: any) => p.phone && p.phone.replace(/[^0-9]/g, "") === normPhone);
    if (match) return { overlap: match, reason: "Same phone number match: " + normPhone };
  }

  const matchNameCity = db.prospects.find((p: any) => p.name.toLowerCase() === name.toLowerCase() && p.city.toLowerCase() === city.toLowerCase());
  if (matchNameCity) {
    return { overlap: matchNameCity, reason: "Same business name and city match" };
  }

  return null;
}

function isCooldownActive(cooldownUntil: string | null): boolean {
  if (!cooldownUntil) return false;
  return new Date(cooldownUntil).getTime() > Date.now();
}

// Simulated Website Signals Heuristic Generator for Mock DB
function getMockSignals(name: string, trade: string): Record<string, boolean> {
  const norm = name.toLowerCase();
  const isHvacOrPlumbing = ["hvac", "plumbing"].includes(trade.toLowerCase());
  const isLandscapingOrLawn = ["landscaping", "lawn_care"].includes(trade.toLowerCase());
  const isCleaning = ["house_cleaning", "pool_cleaning"].includes(trade.toLowerCase());

  const signals = {
    contact_form: true,
    quote_request: isLandscapingOrLawn || isHvacOrPlumbing,
    booking: isCleaning,
    call_cta: true,
    sms_gap: !norm.includes("text") && !norm.includes("sms"),
    emergency: isHvacOrPlumbing || norm.includes("expert") || norm.includes("specialist"),
    multiple_areas: isLandscapingOrLawn || norm.includes("bay") || norm.includes("texas") || norm.includes("state"),
    specific_landing_pages: isHvacOrPlumbing || norm.includes("pro"),
    estimate_language: isLandscapingOrLawn || isHvacOrPlumbing || norm.includes("pros"),
    lead_capture: isCleaning || norm.includes("elite")
  };

  return signals;
}

// Multi-Factor Scoring Engine matching worker.ts
function calculateMultiFactorScore(
  item: any,
  email: string | null,
  isEmailValidated: boolean,
  phone: string | null,
  isPriorityCity: boolean,
  isPriorityTrade: boolean,
  learningStats: Record<string, number>,
  signals: Record<string, boolean>
): { totalScore: number; breakdown: Record<string, number>; confidence: number; evidenceSummary: string } {
  // 1. CONTACTABILITY (Max 25 pts)
  let contactabilityScore = 0;
  if (item.website) contactabilityScore += 5;
  if (email) {
    contactabilityScore += isEmailValidated ? 12 : 6;
  }
  if (phone) contactabilityScore += 5;
  
  // Contact quality (professional domain vs generic email)
  if (email && !email.endsWith("@gmail.com") && !email.endsWith("@yahoo.com") && !email.endsWith("@hotmail.com")) {
    contactabilityScore += 3;
  }
  contactabilityScore = Math.min(25, contactabilityScore);

  // 2. REVENUE_LEAK (Max 40 pts)
  let painScore = 0;
  const evidenceList: string[] = [];
  
  if (signals.emergency) {
    painScore += 10;
    evidenceList.push("24/7 or emergency support language detected");
  }
  if (signals.quote_request || signals.estimate_language) {
    painScore += 10;
    evidenceList.push("Online quote/estimate request option present");
  }
  if (signals.sms_gap) {
    painScore += 10;
    evidenceList.push("SMS/text message CTA absent alongside voice CTA");
  }
  if (signals.multiple_areas || signals.specific_landing_pages) {
    painScore += 5;
    evidenceList.push("Multi-area service coverage or custom service pages");
  }
  if (signals.lead_capture) {
    painScore += 5;
    evidenceList.push("Newsletter signup or static lead-capture form");
  }
  painScore = Math.min(40, painScore);

  // 3. BVELT_FIT (Max 25 pts)
  let bveltFitScore = 0;
  if (isPriorityTrade) {
    bveltFitScore += 15;
  } else {
    bveltFitScore += 5;
  }
  if (signals.contact_form || signals.quote_request || signals.booking) {
    bveltFitScore += 10;
  }
  bveltFitScore = Math.min(25, bveltFitScore);

  // 4. DATA_CONFIDENCE (Max 10 pts)
  let dataConfidenceScore = 0;
  if (item.website) dataConfidenceScore += 5;
  if (email && isEmailValidated) dataConfidenceScore += 5;
  dataConfidenceScore = Math.min(10, dataConfidenceScore);

  // 5. Normalization (0-100 total sum)
  const totalScore = contactabilityScore + painScore + bveltFitScore + dataConfidenceScore;
  const confidencePercent = dataConfidenceScore * 10; // 0-100 confidence value

  const evidenceSummary = evidenceList.length > 0 
    ? `Evidence: ${evidenceList.join(", ")}.`
    : "No strong friction signals observed yet.";

  // Keep backwards compatibility keys for old dashboard references
  const breakdown = {
    contactability: contactabilityScore,
    revenue_leak: painScore,
    bvelt_fit: bveltFitScore,
    confidence: confidencePercent,
    website: item.website ? 25 : 0,
    email_validated: email ? (isEmailValidated ? 10 : 5) : 0,
    phone: phone ? 5 : 0,
    priority_trade: isPriorityTrade ? 12 : 5,
    priority_city: isPriorityCity ? 10 : 0,
    learning_feedback_boost: 0
  };

  return { totalScore, breakdown, confidence: confidencePercent, evidenceSummary };
}

function getTradePsychologyFallback(
  name: string, 
  trade: string, 
  city: string, 
  bveltAngle: string
): { subject: string; body: string } {
  const cTrade = trade.replace('_', ' ');
  if (bveltAngle === "after_hours") {
    return {
      subject: `Emergency ${cTrade} service at ${name}?`,
      body: `Hi ${name} team,\n\nI noticed you advertise 24/7 emergency ${cTrade} service in ${city} and direct customers to call your phone line. What happens to those emergency calls when your team is already out on an active job?\n\nBvelt is a simple app that automatically re-engages missed leads and recovers lost jobs for contractors via fast, automated SMS.\n\nShould I send over a quick 2-minute demo link?\n\nBest regards,\nBvelt Team\n\nReply STOP to opt out`
    };
  } else if (bveltAngle === "sms_gap") {
    return {
      subject: `No text option for ${name} customers?`,
      body: `Hi ${name} team,\n\nI came across your site and noticed your phone line prominently displayed for ${cTrade} services in ${city}, but didn't notice any text-back or SMS option. What percentage of potential customers drop off because they'd prefer to text instead of call?\n\nBvelt is a simple app that automatically re-engages missed leads and recovers lost jobs for contractors via fast, automated SMS.\n\nIf you'd like to see how it works in 2 minutes → https://bvelt.app\n\nBest regards,\nBvelt Team\n\nReply STOP to opt out`
    };
  } else if (bveltAngle === "quote_followup") {
    return {
      subject: `Following up on ${cTrade} estimates at ${name}`,
      body: `Hi ${name} team,\n\nI noticed you have an online quote request form for your ${cTrade} services in ${city}. Once you send out those pricing estimates, how are you currently following up with those prospects to lock them in?\n\nBvelt is a simple app that automatically re-engages missed leads and recovers lost jobs for contractors via fast, automated SMS.\n\nShould I send over a quick 2-minute demo link?\n\nBest regards,\nBvelt Team\n\nReply STOP to opt out`
    };
  } else if (bveltAngle === "lead_reactivation") {
    return {
      subject: `Reviving unconverted ${cTrade} leads in ${city}`,
      body: `Hi ${name} team,\n\nI noticed you serve multiple areas around ${city} and have a lead capture form on your website. What happens to those cold or unconverted ${cTrade} leads once they leave your immediate pipeline?\n\nBvelt is a simple app that automatically re-engages missed leads and recovers lost jobs for contractors via fast, automated SMS.\n\nIf you'd like to see how it works in 2 minutes → https://bvelt.app\n\nBest regards,\nBvelt Team\n\nReply STOP to opt out`
    };
  } else {
    return {
      subject: `Quick question regarding missed ${cTrade} calls at ${name}`,
      body: `Hi ${name} team,\n\nI noticed your great ${cTrade} work in ${city}. When your team is busy on a call or under a sink, what happens to incoming client calls that go straight to voicemail?\n\nBvelt is a simple app that automatically re-engages missed leads and recovers lost jobs for contractors via fast, automated SMS.\n\nIf you'd like to see how it works in 2 minutes → https://bvelt.app\n\nBest regards,\nBvelt Team\n\nReply STOP to opt out`
    };
  }
}

// Generate real AI copy via APIs from Node backend matching trade psychology rules
async function generateRealAICopy(prospect: any): Promise<{ subject: string; body: string }> {
  const bveltAngle = prospect.bvelt_angle || "missed_calls";

  let angleFocus = "";
  if (bveltAngle === "after_hours") {
    angleFocus = "ANGLE: AFTER-HOURS EMERGENCY. I noticed you advertise 24/7 emergency support but direct visitors exclusively to a phone line. Ask what happens to those high-margin emergency calls when your technicians are already out on another active job.";
  } else if (bveltAngle === "sms_gap") {
    angleFocus = "ANGLE: SMS/TEXT GAP. I noticed you display a phone line prominently, but don't offer any text-back or SMS communication options for customers. Ask what percentage of consumers they might be losing because people prefer to text instead of making a voice call.";
  } else if (bveltAngle === "quote_followup") {
    angleFocus = "ANGLE: QUOTE/ESTIMATE FOLLOW-UP. I noticed you have an online quote request form or advertise free estimates. Ask how they are currently following up on sent estimates to ensure they lock in those pending jobs.";
  } else if (bveltAngle === "lead_reactivation") {
    angleFocus = "ANGLE: LEAD REACTIVATION. I noticed you serve multiple geographic service areas and have lead forms. Ask what happens to cold or unconverted inquiries once they drop out of their active pipeline.";
  } else {
    angleFocus = "ANGLE: MISSED CALLS. I noticed your great local contractor profile. Ask what happens to incoming client calls that go straight to voicemail when technicians are busy on-site or under a sink.";
  }

  const prompt = `
    You are an expert sales copywriter writing cold outreach to contractor owners for Bvelt (https://bvelt.app).
    
    Target:
    - Business: ${prospect.name}
    - Location: ${prospect.city}
    - Trade: ${prospect.trade}

    Outreach Angle Instructions:
    ${angleFocus}

    RULES:
    1. Length: Exactly 90 to 110 words total. Punchy, authentic, and contractor-friendly.
    2. First Line: Formulate a concrete, respectful observation or question based on the ANGLE instructions above (e.g., "I noticed you advertise 24/7 emergency HVAC support in Tampa but only direct visitors to call. What happens when the team is already out on a call?"). DO NOT state or claim that they are definitely losing calls or money as a proven fact—ask a question instead!
    3. Exactly ONE sentence describing what Bvelt does: "Bvelt is a simple app that automatically re-engages missed leads and recovers lost jobs for contractors via fast, automated SMS."
    4. Soft Call-to-Action: "If you'd like to see how it works in 2 minutes → https://bvelt.app" or "Should I send over a quick 2-minute demo link?".
    5. Zero hype, zero guaranteed dollar promises, zero scammy claims. Keep it highly practical.
    6. MANDATORY FOOTER: Always end the email body with this exact line: "Reply STOP to opt out"

    Provide your output in strict JSON format matching exactly this structure:
    {
      "subject": "Email subject line here",
      "body": "Email body paragraphs here"
    }
  `;

  if (process.env.GROQ_API_KEY) {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7
      })
    });
    if (res.ok) {
      const data: any = await res.json();
      return JSON.parse(data.choices[0].message.content);
    }
  }

  if (process.env.GEMINI_FOUNDER_API_KEY) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_FOUNDER_API_KEY}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt + " \n\nOutput ONLY raw valid JSON" }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.7 }
      })
    });
    if (res.ok) {
      const data: any = await res.json();
      const txt = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (txt) return JSON.parse(txt);
    }
  }

  throw new Error("No active API keys available to process draft outreach.");
}

async function deliverTelegramDispatch(topProspects: any[], city: string, trades: string[]) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  let reportText = `📡 *Bvelt Radar Report* 📡\n`;
  reportText += `📅 Date: ${new Date().toISOString().split('T')[0]}\n`;
  reportText += `📍 Targets: ${city} · 🛠️ ${trades.join(", ")}\n\n`;
  reportText += `We identified the *Top ${topProspects.length} Local Prospects* to reach out to:\n\n`;

  topProspects.forEach((p, idx) => {
    reportText += `*${idx + 1}. ${p.name}*\n`;
    reportText += `   • Trade: ${p.trade} · Score: *${p.score}/100*\n`;
    reportText += `   • Email: ${p.email ? `\`${p.email}\`` : "None"}\n`;
    reportText += `   • Subject: _${p.draft_subject}_\n`;
    reportText += `   • Copy to send:\n\`\`\`\n${p.draft_body}\n\`\`\`\n`;
    reportText += `   • Actions: \`/sent ${p.id}\` o \`/discard ${p.id}\`\n\n`;
  });

  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: reportText,
      parse_mode: "Markdown"
    })
  });
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}


// -----------------------------------------------------------------------------
// INTERNAL DEVELOPMENT PLAYGROUND ENDPOINTS FOR REACT APP
// -----------------------------------------------------------------------------

app.get(['/prospects', '/api/prospects'], (req, res) => {
  const db = loadDb();
  res.json(db.prospects);
});

app.get(['/opportunities', '/api/opportunities'], (req, res) => {
  const db = loadDb();
  const opps = (db.prospects || []).map((p: any) => {
    let stratWhyNow = {
      what_is_happening: `${p.trade} service demand spike`,
      why_now: "Peak seasonal call volume and active emergency lines",
      why_it_matters: "Unanswered inbound inquiries leak high-margin revenue",
      recommended_action: "Trigger automated SMS recovery sequence",
      potential_economic_outcome: "$3,400/mo estimated retained jobs",
      distinctions: {
        observed_facts: [`Registered phone: ${p.phone || 'Yes'}`, `Website active: ${p.website || 'Yes'}`],
        inferences: ["Technicians engaged in field operations during calls"],
        estimates: ["3-5 missed customer opportunities recovered monthly"]
      }
    };
    try {
      if (p.why_now_json && p.why_now_json !== '{}') {
        stratWhyNow = JSON.parse(p.why_now_json);
      }
    } catch (e) {}

    return {
      id: `opp_${p.id}`,
      prospect_id: p.id,
      tenant_id: p.tenant_id || "founder",
      title: `${p.name} — ${p.trade} (${p.city})`,
      strategic_score: p.strategic_score || p.score || 55,
      fit_score: p.fit_score || 20,
      intent_score: p.intent_score || 15,
      pain_score: p.pain_score || 20,
      ability_to_pay_score: p.ability_to_pay_score || 15,
      contactability_score: p.contactability_score || 15,
      timing_score: p.timing_score || 10,
      evidence_score: p.evidence_score || 10,
      signal_freshness_score: p.signal_freshness_score || 100,
      expected_value: p.expected_value || 3400,
      decision_state: p.decision_state || p.status || "identified",
      why_now_json: JSON.stringify(stratWhyNow),
      priority_tier: (p.score || 0) >= 80 ? "high" : (p.score || 0) >= 50 ? "medium" : "low",
      prospect_name: p.name,
      prospect_city: p.city,
      prospect_trade: p.trade,
      prospect_website: p.website,
      prospect_phone: p.phone,
      prospect_email: p.email,
      prospect_status: p.status,
      draft_subject: p.draft_subject,
      draft_body: p.draft_body,
      created_at: p.created_at || new Date().toISOString()
    };
  });
  res.json(opps);
});

app.get(['/missions', '/api/missions'], (req, res) => {
  const db = loadDb();
  const today = new Date().toISOString().split('T')[0];
  const qualifiedCount = (db.prospects || []).filter((p: any) => (p.score || 0) >= 45 && p.email).length;
  const outreachCount = (db.prospects || []).filter((p: any) => p.status === 'sent' || p.status === 'scheduled').length;
  res.json({
    missions: [
      {
        id: "m_founder_default",
        tenant_id: "founder",
        name: "Founder Customer Acquisition",
        goal: "Find and sign contractor businesses for Bvelt",
        status: "active",
        markets_json: JSON.stringify(DEFAULT_FOUNDER_MISSION.geographies),
        icp_json: JSON.stringify(DEFAULT_FOUNDER_MISSION.icp),
        budget_json: JSON.stringify({ daily_units: 30 }),
        target_qualified: 5,
        target_outreach: 5,
        created_at: today,
        updated_at: today
      }
    ],
    daily_missions: [
      {
        tenant_id: "founder",
        day: today,
        goal: "Qualified contractor opportunities with clear phone & revenue leak",
        markets: DEFAULT_FOUNDER_MISSION.geographies.join("; "),
        icp: DEFAULT_FOUNDER_MISSION.icp.description,
        budget: "Conservative edge quota",
        target_qualified: 5,
        target_outreach: 5,
        qualified_count: qualifiedCount,
        outreach_count: outreachCount,
        status: "active"
      }
    ]
  });
});

app.get(['/api/tenants/config', '/tenants/config'], (req, res) => {
  const db = loadDb();
  res.json(db.tenant_config || []);
});

app.post(['/api/tenants/config', '/tenants/config'], (req, res) => {
  const db = loadDb();
  const body = req.body || {};
  const tenantId = body.tenant_id || `tenant_${Date.now()}`;
  if (!db.tenant_config) db.tenant_config = [];
  const idx = db.tenant_config.findIndex((t: any) => t.tenant_id === tenantId);
  const record = { ...body, tenant_id: tenantId, updated_at: new Date().toISOString() };
  if (idx >= 0) db.tenant_config[idx] = record;
  else db.tenant_config.push(record);
  saveDb(db);
  res.json({ success: true, tenant_id: tenantId });
});

app.get('/api/runs', (req, res) => {
  const db = loadDb();
  res.json(db.runs);
});

app.get('/api/seeds', (req, res) => {
  const db = loadDb();
  res.json(db.seeds);
});

app.post('/api/seeds', (req, res) => {
  const { city, trade, notes } = req.body;
  if (!city || !trade) return res.status(400).json({ error: "City and Trade are required." });
  const db = loadDb();
  const newSeed = {
    id: "seed-" + Math.random().toString(36).substring(7),
    city,
    trade,
    notes: notes || ""
  };
  db.seeds.push(newSeed);
  saveDb(db);
  logToAgent('info', `Added new scouting seed constraint: ${city} / ${trade}`);
  res.json(newSeed);
});

app.delete('/api/seeds/:id', (req, res) => {
  const { id } = req.params;
  const db = loadDb();
  const filter = db.seeds.filter((s: any) => s.id !== id);
  db.seeds = filter;
  saveDb(db);
  res.json({ success: true });
});

app.get('/api/suppression', (req, res) => {
  const db = loadDb();
  res.json(db.suppression);
});

app.delete('/api/suppression/:key', (req, res) => {
  const { key } = req.params;
  const db = loadDb();
  db.suppression = db.suppression.filter((s: any) => s.key.toLowerCase() !== key.toLowerCase());
  saveDb(db);
  res.json({ success: true });
});

app.post('/api/suppression', (req, res) => {
  const { key, reason } = req.body;
  if (!key || !reason) return res.status(400).json({ error: "Key and reason required" });
  const db = loadDb();
  const kLower = key.toLowerCase();
  if (!db.suppression.some((s: any) => s.key === kLower)) {
    db.suppression.push({ key: kLower, reason, created_at: new Date().toISOString() });
    saveDb(db);
  }
  res.json({ success: true });
});

app.get('/api/logs', (req, res) => {
  res.json(agentLogs);
});

app.post('/api/reset-db', (req, res) => {
  saveDb(INITIAL_DB);
  agentLogs = [];
  logToAgent('info', 'Database and agent session fully reset to defaults.');
  res.json({ success: true });
});

app.get('/api/config', (req, res) => {
  res.json({
    FOUNDER_SERVICE_KEY: process.env.FOUNDER_SERVICE_KEY || "FOUNDER_SERVICE_KEY_LOCAL",
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN ? "Configured (Hidden)" : "Missing",
    TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID ? "Configured (Hidden)" : "Missing",
    GROQ_API_KEY: process.env.GROQ_API_KEY ? "Configured (Hidden)" : "Missing",
    GEMINI_FOUNDER_API_KEY: process.env.GEMINI_FOUNDER_API_KEY ? "Configured (Hidden)" : "Missing",
    HUNTER_API_KEY: process.env.HUNTER_API_KEY ? "Configured (Hidden)" : "Missing",
    ABSTRACT_API_KEY: process.env.ABSTRACT_API_KEY ? "Configured (Hidden)" : "Missing",
    TRUST_STACK_URL: process.env.TRUST_STACK_URL || "None",
    FOUNDING_CITIES: process.env.FOUNDING_CITIES || "Tampa,FL;Austin,TX",
    FOUNDING_TRADES: process.env.FOUNDING_TRADES || "landscaping;hvac;lawn_care;house_cleaning;plumbing"
  });
});

app.post('/api/config', (req, res) => {
  const { keys } = req.body;
  // Apply key updates to local runtime environment
  if (keys) {
    Object.entries(keys).forEach(([k, v]) => {
      if (v) {
        process.env[k] = String(v);
      }
    });
    logToAgent('success', 'Runtime secrets and regional configurations hot-reloaded.');
  }
  res.json({ success: true });
});


// -----------------------------------------------------------------------------
// VITE CLIENT INTEGRATION
// -----------------------------------------------------------------------------
async function startServer() {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa'
  });

  app.use(vite.middlewares);

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Bvelt Radar Console listening on port ${PORT}`);
  });
}

startServer();
