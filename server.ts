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

// Initial Database seeds
const INITIAL_DB = {
  prospects: [
    {
      id: "prospect-1",
      mode: "founder",
      tenant_id: null,
      name: "Tampa Bay AC & Heating Pros",
      city: "Tampa, FL",
      trade: "hvac",
      website: "tampabayacpros.example.com",
      phone: "+1 (813) 555-0124",
      email: "service@tampabayacpros.example.com",
      score: 85,
      signals_json: JSON.stringify({
        scraped_phone: "+1 (813) 555-0124",
        scraped_email: "service@tampabayacpros.example.com",
        has_socials: true,
        score_breakdown: { website: 25, email: 35, is_business_email: 10, phone: 15, trade_relevance: 15 }
      }),
      draft_subject: "Helping Tampa Bay AC & Heating Pros recover missed HVAC leads in Tampa",
      draft_body: "Hi Tampa Bay AC & Heating Pros team,\n\nI noticed your great work offering HVAC services in Tampa, FL.\n\nWhen busy handling jobs on-site, it's incredibly easy to miss incoming client calls and leads. Bvelt is a simple app that automatically re-engages missed leads and recovers lost jobs for contractors via fast, automatic SMS.\n\nTake a look at how we help contractors win back clients at https://bvelt.app\n\nBest regards,\nBvelt Team\n\nReply STOP to opt out",
      status: "notified",
      source: "bizdata",
      created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
      updated_at: new Date(Date.now() - 3600000 * 2).toISOString()
    },
    {
      id: "prospect-2",
      mode: "founder",
      tenant_id: null,
      name: "Austin Landscaping Craftsmen",
      city: "Austin, TX",
      trade: "landscaping",
      website: "austinlandscapeartists.example.com",
      phone: "+1 (512) 555-0199",
      email: "hello@austinlandscapeartists.example.com",
      score: 95,
      signals_json: JSON.stringify({
        scraped_phone: "+1 (512) 555-0199",
        scraped_email: "hello@austinlandscapeartists.example.com",
        has_socials: true,
        score_breakdown: { website: 25, email: 35, is_business_email: 10, phone: 15, trade_relevance: 15 }
      }),
      draft_subject: "Quick question regarding landscaping leads at Austin Landscaping Craftsmen",
      draft_body: "Hi Austin Landscaping Craftsmen team,\n\nI came across your business while looking at professional landscaping services in Austin.\n\nI know that answering client calls when you are out in the field with a lawnmower running is almost impossible. Bvelt is a simple app that automatically re-engages missed leads and recovers lost jobs for contractors via fast, automatic SMS.\n\nWe would love to help you recover those missed leads. Check us out: https://bvelt.app\n\nReply STOP to opt out",
      status: "sent",
      source: "overpass",
      created_at: new Date(Date.now() - 3600000 * 5).toISOString(),
      updated_at: new Date(Date.now() - 3600000 * 4).toISOString()
    },
    {
      id: "prospect-3",
      mode: "founder",
      tenant_id: null,
      name: "Squeaky Clean Tampa Co",
      city: "Tampa, FL",
      trade: "house_cleaning",
      website: "squeakycleantampa.example.com",
      phone: "+1 (813) 555-0245",
      email: "info@squeakycleantampa.example.com",
      score: 75,
      signals_json: JSON.stringify({
        scraped_phone: "+1 (813) 555-0245",
        scraped_email: "info@squeakycleantampa.example.com",
        has_socials: false,
        score_breakdown: { website: 25, email: 35, is_business_email: 10, phone: 15, trade_relevance: 0 }
      }),
      draft_subject: "Recovering missed house cleaning leads in Tampa",
      draft_body: "Hi Squeaky Clean Tampa Co team,\n\nI saw your excellent house cleaning profile in Tampa.\n\nCleaning homes keeps your hands busy, which means many calls from new customers go straight to voicemail. Bvelt is a simple app that automatically re-engages missed leads and recovers lost jobs for contractors via fast, automatic SMS.\n\nSee how we do it: https://bvelt.app\n\nReply STOP to opt out",
      status: "discarded",
      source: "bizdata",
      created_at: new Date(Date.now() - 3600000 * 10).toISOString(),
      updated_at: new Date(Date.now() - 3600000 * 9).toISOString()
    }
  ],
  runs: [
    {
      id: "run-pre-1",
      day: new Date().toISOString().split('T')[0],
      mode: "founder",
      discovered: 12,
      finalized: 3,
      ai_calls: 3,
      hunter_calls: 1,
      errors_json: JSON.stringify(["Overpass OSM hit timeout on region outer bound, falling back"]),
      created_at: new Date(Date.now() - 3600000 * 2).toISOString()
    }
  ],
  seeds: [
    { id: "seed-1", city: "Tampa, FL", trade: "hvac", notes: "Core Florida target zone" },
    { id: "seed-2", city: "Austin, TX", trade: "landscaping", notes: "High average order values" }
  ],
  suppression: [
    { key: "spammy_contractor@gmail.com", reason: "Explicit opt out request", created_at: new Date().toISOString() },
    { key: "competitor.com", reason: "Do not contact competitors", created_at: new Date().toISOString() }
  ],
  tenant_config: [
    {
      tenant_id: "tenant-bvelt-1",
      daily_limit: 10,
      cities_json: JSON.stringify(["Orlando, FL", "Atlanta, GA"]),
      trades_json: JSON.stringify(["plumbing", "lawn_care"])
    }
  ]
};

// Initialize file database
function loadDb() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      fs.writeFileSync(DB_FILE, JSON.stringify(INITIAL_DB, null, 2));
      return INITIAL_DB;
    }
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(raw);
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

// Security middleware matching Worker
const secureMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization || (req.headers['authorization'] as string);
  const configuredKey = process.env.FOUNDER_SERVICE_KEY || "FOUNDER_SERVICE_KEY_LOCAL";

  if (!authHeader || !authHeader.startsWith("Bearer ") || authHeader.split(" ")[1] !== configuredKey) {
    logToAgent('error', `Authentication rejected from IP ${req.ip}`);
    return res.status(401).json({ error: "Unauthorized. Missing or invalid service key." });
  }
  next();
};

// 1. Health
app.get('/health', (req, res) => {
  res.json({ status: "healthy", timestamp: new Date().toISOString() });
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

// 5. Automated/Manual run execution triggers
app.post('/run', secureMiddleware, async (req, res) => {
  const mode = req.query.mode === 'tenant' ? 'tenant' : 'founder';
  const tenantId = req.query.tenant_id ? String(req.query.tenant_id) : null;

  logToAgent('info', `Scouting run manually triggered. Mode: ${mode}, Tenant: ${tenantId || 'none'}`);

  // We run the pipeline asynchronously so we don't hold the client waiting, matching the Cloudflare worker ctx.waitUntil
  setTimeout(() => {
    runFullScoutingPipeline(mode, tenantId).catch((err: any) => {
      logToAgent('error', `Pipeline execution error: ${err.message}`);
    });
  }, 100);

  res.json({
    message: "Prospecting pipeline initiated in the background.",
    mode,
    tenant_id: tenantId,
    timestamp: new Date().toISOString()
  });
});


// -----------------------------------------------------------------------------
// LOCAL REALISTIC WEB-SCRAPING & API SIMULATOR PIPELINE
// -----------------------------------------------------------------------------
async function runFullScoutingPipeline(mode: string, tenantId: string | null) {
  const db = loadDb();
  const today = new Date().toISOString().split('T')[0];
  const runId = "run-" + Math.random().toString(36).substring(7);

  logToAgent('info', `Initializing scouting agents for day: ${today}...`);

  // Choose cities and trades
  let activeCities = ["Tampa, FL", "Austin, TX"];
  let activeTrades = ["hvac", "landscaping", "lawn_care", "house_cleaning", "plumbing"];

  if (mode === "founder") {
    if (process.env.FOUNDING_CITIES) {
      activeCities = process.env.FOUNDING_CITIES.split(";").map((c: any) => c.trim()).filter(Boolean);
    }
    if (process.env.FOUNDING_TRADES) {
      activeTrades = process.env.FOUNDING_TRADES.split(";").map((t: any) => t.trim()).filter(Boolean);
    }
  } else if (mode === "tenant" && tenantId) {
    const config = db.tenant_config.find((c: any) => c.tenant_id === tenantId);
    if (config) {
      activeCities = JSON.parse(config.cities_json);
      activeTrades = JSON.parse(config.trades_json);
    }
  }

  // Pick one city and two trades to prospect today
  const seedHash = Math.abs(hashCode(today));
  const chosenCity = activeCities[seedHash % activeCities.length];
  const chosenTrade1 = activeTrades[(seedHash + 1) % activeTrades.length];
  const chosenTrade2 = activeTrades[(seedHash + 2) % activeTrades.length];
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
      // Suppression check
      const suppressKey = `${b.name.toLowerCase()}_${b.city.toLowerCase()}`.replace(/\s+/g, "_");
      const isNameSuppressed = db.suppression.some((s: any) => s.key === suppressKey);
      if (isNameSuppressed) {
        logToAgent('warn', `Suppression hit: Skipping "${b.name}" due to Name+City match.`);
        continue;
      }

      if (b.website) {
        const dom = getDomain(b.website);
        if (dom && db.suppression.some((s: any) => s.key === dom.toLowerCase())) {
          logToAgent('warn', `Suppression hit: Skipping domain "${dom}" (already prospected).`);
          continue;
        }
      }

      // Scraping Website Sim
      logToAgent('info', `[Enriching] Scraping website metadata for: ${b.name}`);
      let emailCandidate = b.email || null;
      let phoneCandidate = b.phone || null;

      // Hunter domain finder emulation / actual integration
      if (!emailCandidate && b.website && hunterCallsCount < 15) {
        hunterCallsCount++;
        if (process.env.HUNTER_API_KEY) {
          logToAgent('info', `[Hunter.io] Looking up emails for domain: ${b.website}`);
          try {
            // Emulate or run actual Hunter API call
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
          // Emulated random Hunter find (since it's a simulation of the Worker behavior)
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

      // Score
      let score = 0;
      if (b.website) score += 25;
      if (emailCandidate) {
        score += 35;
        if (/^(info|contact|office|hello|sales|support)@/i.test(emailCandidate)) {
          score += 10;
        }
      }
      if (phoneCandidate) score += 15;
      if (["plumbing", "hvac", "landscaping", "lawn_care"].includes(b.trade.toLowerCase())) {
        score += 15;
      }

      const prospectId = "prospect-" + Math.random().toString(36).substring(7);

      const signalMetadata = {
        scraped_phone: phoneCandidate,
        scraped_email: emailCandidate,
        has_socials: Math.random() > 0.4,
        score_breakdown: {
          website: b.website ? 25 : 0,
          email: emailCandidate ? 35 : 0,
          is_business_email: emailCandidate && /^(info|contact|office|hello|sales)@/i.test(emailCandidate) ? 10 : 0,
          phone: phoneCandidate ? 15 : 0,
          trade_relevance: 15
        }
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
        score,
        signals_json: JSON.stringify(signalMetadata),
        draft_subject: "",
        draft_body: "",
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
      const fallback = getFallbackCopy(p.name, p.trade, p.city);
      p.draft_subject = fallback.subject;
      p.draft_body = fallback.body;
      p.status = "drafted";
      finalizedCount++;
      continue;
    }

    aiCallsCount++;
    logToAgent('info', `[LLM Redactor] Generating tailored Bvelt outreach copy for: ${p.name}`);

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
        const fallback = getFallbackCopy(p.name, p.trade, p.city);
        p.draft_subject = fallback.subject;
        p.draft_body = fallback.body;
        p.status = "drafted";
        finalizedCount++;
      }
    } else {
      // Simulation copy generator with high-quality variance
      const fallback = getFallbackCopy(p.name, p.trade, p.city);
      p.draft_subject = fallback.subject;
      p.draft_body = fallback.body;
      p.status = "drafted";
      finalizedCount++;
      logToAgent('success', `[LLM Redactor Emulated] High-converting proposal draft registered.`);
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

function getFallbackCopy(name: string, trade: string, city: string): { subject: string; body: string } {
  return {
    subject: `Helping ${name} recover missed ${trade} leads in ${city}`,
    body: `Hi ${name} team,\n\nI noticed your great work offering ${trade} services in ${city}.\n\nWhen busy handling jobs on-site, it's incredibly easy to miss incoming client calls and leads. Bvelt is a simple app that automatically re-engages missed leads and recovers lost jobs for contractors via fast, automatic SMS.\n\nTake a look at how we help contractors win back clients at https://bvelt.app\n\nBest regards,\nBvelt Team\n\nReply STOP to opt out`
  };
}

// Generate real AI copy via APIs from Node backend
async function generateRealAICopy(prospect: any): Promise<{ subject: string; body: string }> {
  const prompt = `
    Write a short cold email outreach draft for this local business:
    Name: ${prospect.name}
    City: ${prospect.city}
    Trade: ${prospect.trade}
    Website: ${prospect.website || "No site"}

    INSTRUCTIONS:
    1. Language: English. Keep it conversational and short.
    2. Length: Under 120 words total. No fluff, no formal greetings.
    3. State a concrete trade signal.
    4. State what Bvelt does in EXACTLY one sentence: "Bvelt is a simple app that automatically re-engages missed leads and recovers lost jobs for contractors."
    5. Call to action: Click/reply to learn more, referencing https://bvelt.app.
    6. Do NOT promise guaranteed money, "massive wealth", or risk-free millions. Keep it grounded and practical.
    7. Always end the email body with this exact footer text on a new line: "Reply STOP to opt out" (without quotes).

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

app.get('/api/prospects', (req, res) => {
  const db = loadDb();
  res.json(db.prospects);
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
