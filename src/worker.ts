/**
 * bvelt-radar Cloudflare Worker v2
 * Autonomous B2B Prospecting & Multi-factor Lead Scoring for Bvelt
 * 
 * Capabilities:
 * - Dynamic Sun Belt & Mid-size Regional Ranking
 * - Trade-specific Overpass OSM & BizData Scrapers
 * - Multi-Factor 0-100 Scoring with historical conversion learning
 * - Trade Psychology Copywriting (A/B testing: missed_calls vs dormant_leads)
 * - Telegram Bot with interactive InlineKeyboardMarkup buttons & Webhook callbacks
 * - D1 Feedback loop & Outcome learning engine
 */

import { getAlerts, tradeForEvent, eventAppliesToTrade, WeatherAlert } from './weatherSignals';
import { dispatchEmail, EmailDispatchResult } from './emailDispatcher';
import { auditDomainSecurityAndMx, auditWebsitePerformance, auditCityWeatherEmergency } from './openAudits';
import { fetchPermitContractors } from './permitSources';
import { pickTargets, findPlace, findNearestPlace, formatPlaceLabel, markSearched, placeKey, radiusKm } from './geoFrontier';

// Global type declarations for Cloudflare Worker compilation
declare global {
  interface D1Database {
    prepare: (sql: string) => any;
    batch: (statements: any[]) => Promise<any>;
  }
  interface KVNamespace {
    get: (key: string) => Promise<any>;
    put: (key: string, value: string, options?: any) => Promise<any>;
  }
  interface ExecutionContext {
    waitUntil: (promise: Promise<any>) => void;
  }
  interface ScheduledEvent {
    cron: string;
    type: string;
  }
  interface Queue<Message = any> {
    send(message: Message, options?: any): Promise<void>;
    sendBatch(messages: Iterable<{ body: Message; delaySeconds?: number }>): Promise<void>;
  }
  interface Message<Body = any> {
    readonly id: string;
    readonly timestamp: Date;
    readonly body: Body;
    readonly attempts: number;
    retry(options?: any): void;
    ack(): void;
  }
  interface MessageBatch<Body = any> {
    readonly queue: string;
    readonly messages: readonly Message<Body>[];
    ackAll(): void;
    retryAll(options?: any): void;
  }
}

export type RadarJobType = 
  | 'discovery' 
  | 'enrich' 
  | 'verify' 
  | 'score' 
  | 'approve' 
  | 'outreach' 
  | 'reply_event';

export interface RadarJobMessage {
  run_id: string;
  job_id: string;
  type: RadarJobType;
  mode: string;
  tenant_id: string | null;
  payload: Record<string, any>;
  attempt?: number;
  created_at?: string;
}

export interface Env {
  RADAR_DB: D1Database;
  RADAR_QUEUE?: Queue<RadarJobMessage>;
  CACHE?: KVNamespace;
  FOUNDER_SERVICE_KEY: string;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHAT_ID: string;
  GROQ_API_KEY?: string;
  GEMINI_FOUNDER_API_KEY?: string;
  GEMINI_SECONDARY_API_KEY?: string;
  HUNTER_API_KEY?: string;
  ABSTRACT_API_KEY?: string;
  TRUST_STACK_URL?: string;
  TRUST_SERVICE_KEY?: string;
  TRUST_STACK_KEY?: string;
  FOUNDING_CITIES?: string; // e.g. "Tampa, FL;Austin, TX"
  FOUNDING_TRADES?: string; // e.g. "landscaping;hvac;plumbing"
  FOUNDER_AUTO_OUTREACH?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  SENDER_NAME?: string;
  SENDER_POSTAL_ADDRESS?: string;
  ENABLE_TEST_ROUTES?: string;
  GEMINI_MODELS?: string;
  ENABLE_BIZDATA?: string;
  HUNTER_SEQUENCE_ID?: string;
  RADAR_GLOBAL_PAUSE?: string;
  RADAR_OUTREACH_PAUSE?: string;
  ALLOWED_ORIGINS?: string;
  RESEND_API_KEY?: string;
  BREVO_API_KEY?: string;
  OUTBOUND_EMAIL_FROM?: string;
  PAGESPEED_API_KEY?: string;
  RADAR_JOBS_PER_RUN?: string;
  AI?: { run(model: string, input: any): Promise<any> };
}

export function getBudgetLimit(unitType: string): number {
  switch (unitType) {
    case 'discovery_units': return 45;
    case 'enrichment_units': return 40;
    case 'ai_units': return 15;
    case 'hunter_units': return 8;
    case 'outreach_units': return 3;
    case 'finalize_units': return 10;
    default: return 0;
  }
}

export async function reserveBudget(
  db: D1Database,
  tenantId: string,
  unitType: string,
  amount: number = 1
): Promise<boolean> {
  const day = new Date().toISOString().split('T')[0];
  const limit = getBudgetLimit(unitType);

  try {
    await db.prepare(`
      INSERT OR IGNORE INTO daily_budgets (tenant_id, day, discovery_units, enrichment_units, ai_units, hunter_units, outreach_units, finalize_units)
      VALUES (?, ?, 0, 0, 0, 0, 0, 0)
    `).bind(tenantId, day).run();

    const res = await db.prepare(`
      UPDATE daily_budgets
      SET ${unitType} = ${unitType} + ?
      WHERE tenant_id = ? AND day = ? AND (${unitType} + ?) <= ?
    `).bind(amount, tenantId, day, amount, limit).run() as any;

    return !!(res && res.meta && res.meta.changes > 0);
  } catch (e) {
    console.error(`[Budget Governor] Failed to reserve ${unitType} for tenant ${tenantId}:`, e);
    return false;
  }
}

export async function isValidCorporateDomain(domain: string): Promise<boolean> {
  try {
    const response = await fetch(`https://1.1.1.1/dns-query?name=${domain}&type=MX`, {
      headers: { 'Accept': 'application/dns-json' }
    });
    const data: any = await response.json();
    return data.Answer && data.Answer.length > 0;
  } catch (e) {
    return false;
  }
}

export async function fetchPublicPermits(city: string): Promise<any[]> {
  // Socrata API for Orlando as proof of concept, expandable to Austin/Tampa
  if (city.toLowerCase() === 'orlando') {
    try {
      const response = await fetch('https://data.cityoforlando.net/resource/4v5t-j59e.json?$limit=50&$order=issued_date DESC');
      return await response.json();
    } catch (e) {
      console.error('Error fetching Orlando permits:', e);
    }
  }
  return [];
}

export async function releaseBudget(
  db: D1Database,
  tenantId: string,
  unitType: string,
  amount: number = 1
): Promise<void> {
  const day = new Date().toISOString().split('T')[0];
  try {
    await db.prepare(`
      UPDATE daily_budgets
      SET ${unitType} = MAX(0, ${unitType} - ?)
      WHERE tenant_id = ? AND day = ?
    `).bind(amount, tenantId, day).run();
  } catch (e) {
    console.error(`[Budget Governor] Failed to release ${unitType} for tenant ${tenantId}:`, e);
  }
}

export async function commitBudget(
  db: D1Database,
  tenantId: string,
  unitType: string,
  amount: number = 1
): Promise<void> {
  console.log(`[Budget Governor] Committed ${amount} units of ${unitType} for tenant ${tenantId}`);
}

export async function getRemainingBudget(db: D1Database, tenantId: string, unitType: string): Promise<number> {
  const day = new Date().toISOString().split('T')[0];
  const limit = getBudgetLimit(unitType);
  try {
    const row = await db.prepare(`SELECT ${unitType} FROM daily_budgets WHERE tenant_id = ? AND day = ?`).bind(tenantId, day).first() as any;
    if (!row) return limit;
    return Math.max(0, limit - (row[unitType] || 0));
  } catch (e) {
    return 0; // fail closed
  }
}

export async function getCircuitBreakerStatus(db: D1Database): Promise<{ active: boolean; reason: string | null }> {
  try {
    const row = await db.prepare("SELECT * FROM circuit_breakers WHERE id = 'outreach'").first() as any;
    if (row && row.status === 'open') {
      return { active: true, reason: row.reason };
    }
  } catch (e) {
    return { active: true, reason: "Circuit breaker state query failed (fail closed)" };
  }
  return { active: false, reason: null };
}

export async function tripCircuitBreaker(db: D1Database, reason: string, errorMsg: string): Promise<void> {
  const timestamp = new Date().toISOString();
  try {
    await db.prepare(`
      INSERT INTO circuit_breakers (id, status, reason, opened_at, last_error, manual_reset_required)
      VALUES ('outreach', 'open', ?, ?, ?, 1)
      ON CONFLICT(id) DO UPDATE SET
        status = 'open',
        reason = excluded.reason,
        opened_at = excluded.opened_at,
        last_error = excluded.last_error,
        manual_reset_required = 1
    `).bind(reason, timestamp, errorMsg).run();
    console.error(`[Circuit Breaker Tripped] Outreach paused. Reason: ${reason}. Error: ${errorMsg}`);
  } catch (e) {
    console.error("[Circuit Breaker] Failed to trip:", e);
  }
}

export async function trackProviderFailure(db: D1Database, errorMsg: string): Promise<void> {
  const isAuthError = errorMsg.includes("401") || errorMsg.includes("Authentication") || errorMsg.includes("Unauthorized");
  const isUnexpectedFormat = errorMsg.includes("response format") || errorMsg.includes("JSON") || errorMsg.includes("Unexpected token");
  
  let reason = "repeated provider failures";
  if (isAuthError) reason = "repeated authentication errors";
  else if (isUnexpectedFormat) reason = "unexpected provider response format";

  await tripCircuitBreaker(db, reason, errorMsg);
}

export interface MissionConfig {
  mode: 'founder' | 'tenant';
  tenant_id?: string | null;
  target: string;
  industry?: string;
  niches: string[];
  subniches: string[];
  services: string[];
  service_areas?: string[];
  geographies: string[];
  countries: string[];
  regions?: string[];
  languages: string[];
  icp: {
    description: string;
    keywords: string[];
  };
  min_score: number;
  max_daily_outreach: number;
  allowed_markets?: string[];
  campaign_goal?: string;
  messaging_angle?: string;
}

export const DEFAULT_FOUNDER_MISSION: MissionConfig = {
  mode: "founder",
  target: "bvelt_customers",
  niches: ["landscaping", "lawn_care", "hvac", "plumbing", "house_cleaning", "pool_cleaning", "handyman", "roofing", "pest_control"],
  subniches: ["residential_contractors", "commercial_contractors", "emergency_service_providers"],
  services: ["repair", "maintenance", "installation", "cleaning"],
  geographies: ["Tampa, FL", "Austin, TX", "Orlando, FL", "Houston, TX", "Atlanta, GA", "Nashville, TN"],
  countries: ["US", "MX", "ES", "CO", "CA", "GB", "AU"],
  languages: ["en", "es"],
  icp: {
    description: "Local service businesses with visible phone lines, websites, high-margin jobs, and lead-capture or emergency response friction across any market.",
    keywords: ["plumber", "hvac", "electrician", "contractor", "cleaning", "landscaping"]
  },
  min_score: 0,
  max_daily_outreach: 10
};

// Hard daily execution limits
const LIMITS = {
  max_discover_per_day: 30,
  max_finalize_per_day: 10,
  max_ai_calls_per_day: 15,
  max_hunter_credits_per_day: 8, // Strict budget conservation
};

// Priority Target Pool: High demand, high contractor density, lower SaaS saturation
const PRIORITY_CITIES = [
  "Tampa, FL",
  "Orlando, FL",
  "Jacksonville, FL",
  "Austin, TX",
  "Houston, TX",
  "San Antonio, TX",
  "Phoenix, AZ",
  "Charlotte, NC",
  "Raleigh, NC",
  "Nashville, TN",
  "Atlanta, GA",
  "Birmingham, AL",
];

const PRIORITY_TRADES = [
  "landscaping",
  "lawn_care",
  "hvac",
  "plumbing",
  "house_cleaning",
  "pool_cleaning",
  "handyman",
  "roofing",
  "pest_control",
];

// Mapping of contractor trades to their ideal B2B target niches
/**
 * Maps a Bvelt client's trade → buyer segments Radar hunts for them.
 * Order = priority. Learning re-ranks via win rates over time.
 * This is the product intelligence core: contractor → their ideal local buyers.
 */
const TENANT_TARGET_MAP: Record<string, string[]> = {
  plumbing: ["property management", "real estate", "hotel", "restaurant", "facility manager", "apartment complex", "hoa"],
  hvac: ["property management", "real estate", "hotel", "facility manager", "general contractor", "apartment complex", "office building"],
  landscaping: ["property management", "real estate", "homeowners association", "commercial developer", "hoa", "apartment complex", "golf course"],
  lawn_care: ["property management", "real estate", "homeowners association", "hoa", "apartment complex", "school"],
  house_cleaning: ["property management", "real estate", "hotel", "airbnb host", "vacation rental", "office building"],
  pool_cleaning: ["property management", "hotel", "gym", "aquatic center", "apartment complex", "hoa"],
  handyman: ["property management", "real estate", "retail store", "restaurant", "hotel", "facility manager"],
  roofing: ["property management", "real estate", "general contractor", "insurance agency", "apartment complex", "hoa"],
  pest_control: ["property management", "restaurant", "hotel", "food processing", "apartment complex", "school"],
  electrical: ["property management", "facility manager", "general contractor", "industrial plant", "office building"],
  cleaning: ["property management", "real estate", "hotel", "office building"],
  "pool service": ["property management", "hotel", "gym", "apartment complex"],
  painting: ["property management", "real estate", "hotel", "apartment complex"],
  flooring: ["property management", "real estate", "hotel", "apartment complex"],
  "water damage": ["property management", "insurance agency", "real estate", "hotel"],
};

// OSM Tag mappings by trade for high-precision Overpass queries (contractor field operators, not retail stores)
const OVERPASS_TRADE_TAGS: Record<string, string[]> = {
  plumbing: [
    'craft="plumber"',
    'craft="plumbing"',
    'shop="plumbing"',
    'office="plumbing"',
    'amenity="plumbing"',
    'name~"plumb"'
  ],
  hvac: ['craft="hvac"', 'craft="heating_technician"', 'craft="heating_contractor"'],
  landscaping: ['craft="gardener"', 'craft="landscaper"', 'craft="groundskeeper"'],
  lawn_care: ['craft="gardener"', 'craft="landscaper"', 'craft="groundskeeper"', 'craft="lawn_mower"'],
  electrical: ['craft="electrician"'],
  house_cleaning: ['craft="cleaner"', 'office="cleaning_agency"', 'office="cleaning"'],
  cleaning: ['craft="cleaner"', 'office="cleaning_agency"', 'office="cleaning"'],
  pool_cleaning: ['craft="swimming_pool"', 'craft="pool_technician"', 'office="pool_service"'],
  pool: ['craft="swimming_pool"', 'craft="pool_technician"', 'office="pool_service"'],
  handyman: ['craft="handyman"', 'craft="carpenter"', 'craft="joiner"'],
  roofing: ['craft="roofer"', 'craft="roofing"'],
  pest_control: ['craft="pest_control"', 'amenity="pest_control"'],
  "property management": [
    'office="property_management"', 'amenity="property_management"',
    'name~"property management"', 'name~"property manager"', 'name~"prop management"',
    'office="estate_agent"', 'name~"apartment management"', 'name~"community management"'
  ],
  "property manager": [
    'office="property_management"', 'name~"property manager"', 'name~"property management"'
  ],
  "real estate": [
    'office="estate_agent"', 'amenity="real_estate"', 'name~"real estate"', 'name~"realty"',
    'name~"realtor"', 'office="realtor"'
  ],
  hotel: ['tourism="hotel"', 'tourism="motel"', 'tourism="guest_house"', 'tourism="hostel"'],
  restaurant: ['amenity="restaurant"', 'amenity="cafe"', 'amenity="fast_food"'],
  "facility manager": ['office="facility_management"', 'name~"facility"', 'name~"facilities management"'],
  "homeowners association": [
    'office="association"', 'name~"HOA"', 'name~"homeowners association"',
    'name~"homeowner association"', 'name~"community association"'
  ],
  hoa: ['office="association"', 'name~"HOA"', 'name~"homeowners"', 'name~"community association"'],
  "apartment complex": [
    'building="apartments"', 'name~"apartment"', 'name~"apartments"',
    'name~"residential community"', 'landuse="residential"'
  ],
  "office building": ['building="office"', 'office="company"', 'name~"office park"', 'name~"business center"'],
  "commercial developer": ['office="developer"', 'craft="builder"', 'name~"developer"', 'name~"development"'],
  "airbnb host": ['tourism="apartment"', 'tourism="chalet"', 'name~"airbnb"', 'name~"short term"'],
  "vacation rental": ['tourism="apartment"', 'tourism="guest_house"', 'name~"vacation"', 'name~"holiday rental"'],
  gym: ['leisure="fitness_centre"', 'leisure="sports_centre"', 'name~"gym"', 'amenity="gym"'],
  "aquatic center": ['leisure="swimming_pool"', 'amenity="public_bath"', 'name~"aquatic"'],
  "retail store": ['shop="department_store"', 'shop="supermarket"', 'shop="mall"'],
  "general contractor": ['craft="builder"', 'craft="contractor"', 'name~"contractor"', 'name~"construction"'],
  "insurance agency": ['office="insurance"', 'name~"insurance"'],
  "food processing": ['industrial="food_factory"', 'craft="bakery"'],
  "industrial plant": ['industrial="factory"', 'man_made="works"'],
  school: ['amenity="school"', 'amenity="college"', 'building="school"'],
  "golf course": ['leisure="golf_course"', 'name~"golf"'],
};

function isAuthorized(request: Request, env: Env, serviceKey?: string, validSessionHash?: string): boolean {
  const cookieHeader = request.headers.get("Cookie") || "";
  const parsedCookies: Record<string, string> = {};
  cookieHeader.split(";").forEach(c => {
    const [k, ...v] = c.trim().split("=");
    if (k) parsedCookies[k.trim()] = decodeURIComponent(v.join("=").trim());
  });

  const authHeader = request.headers.get("Authorization");
  const sessionCookie = parsedCookies["bvelt_session"];

  if (validSessionHash && sessionCookie === validSessionHash) {
    return true;
  }
  if (serviceKey && authHeader && authHeader.startsWith("Bearer ") && authHeader.split(" ")[1] === serviceKey) {
    return true;
  }
  return false;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    const requestOrigin = request.headers.get("Origin") || "*";
    const allowedOrigins = env.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS.split(";").map(o => o.trim()) : [];
    let allowOriginHeader = requestOrigin;
    if (allowedOrigins.length > 0) {
      allowOriginHeader = allowedOrigins.includes(requestOrigin) ? requestOrigin : allowedOrigins[0];
    }

    const corsHeaders: Record<string, string> = {
      "Access-Control-Allow-Origin": allowOriginHeader,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS, DELETE",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Credentials": "true"
    };

    const isTestRoute = path.startsWith("/api/test/");
    if (isTestRoute && env.ENABLE_TEST_ROUTES !== "1") {
      return new Response("Not Found", { status: 404, headers: corsHeaders });
    }

    if (method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      const serviceKey = env.FOUNDER_SERVICE_KEY;
      let validSessionHash = "";
      if (serviceKey) {
        const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`bvelt_radar_session:${serviceKey}`));
        validSessionHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
      }

      // 1. Enhanced Health Check (public)
      if (path === "/health" && method === "GET") {
        return await handleHealth(env, corsHeaders);
      }

      // 1ab. Telegram Test Endpoint (Supports GET and POST)
      if ((path === "/api/telegram-test" || path === "/telegram-test") && (method === "GET" || method === "POST")) {
        if (!isAuthorized(request, env, serviceKey, validSessionHash)) {
          return Response.json({ error: "unauthorized" }, { status: 401, headers: corsHeaders });
        }
        const botToken = env.TELEGRAM_BOT_TOKEN;
        const chatId = env.TELEGRAM_CHAT_ID;

        if (!botToken || !chatId) {
          return Response.json({
            success: false,
            ok: false,
            bot_token_configured: !!botToken,
            chat_id: chatId ? String(chatId).trim() : null,
            error: "Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID"
          }, { status: 400, headers: corsHeaders });
        }

        try {
          const action = url.searchParams.get("action") || "";
          const setWebhook = url.searchParams.get("set_webhook") === "true" || action === "set_webhook";

          let webhookSetupResult: any = null;
          if (setWebhook) {
            const webhookUrl = `${url.origin}/telegram-webhook`;
            const setupPayload: any = { url: webhookUrl };
            if (env.TELEGRAM_WEBHOOK_SECRET && env.TELEGRAM_WEBHOOK_SECRET.trim()) {
              setupPayload.secret_token = env.TELEGRAM_WEBHOOK_SECRET.trim();
            }
            const setRes = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(setupPayload),
              signal: AbortSignal.timeout(6000)
            });
            webhookSetupResult = await setRes.json().catch(() => ({ ok: false }));
          }

          let webhookInfo: any = null;
          try {
            const infoRes = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`, {
              signal: AbortSignal.timeout(4000)
            });
            webhookInfo = await infoRes.json().catch(() => null);
          } catch (e) {}

          const testRes = await notifyFounder(
            env,
            "<b>📡 Bvelt Radar LIVE test OK</b> — Bot conectado y operativo a Telegram.\n\nNotificaciones outbound y botones interactivos configurados correctamente."
          );

          return Response.json({
            success: testRes.ok,
            ok: testRes.ok,
            bot_token_configured: true,
            chat_id: String(chatId).trim(),
            telegram_response: testRes,
            telegram_webhook_info: webhookInfo?.result || webhookInfo,
            webhook_registered: webhookSetupResult
          }, { status: testRes.ok ? 200 : 502, headers: corsHeaders });
        } catch (err: any) {
          return Response.json({
            success: false,
            ok: false,
            error: err.message
          }, { status: 502, headers: corsHeaders });
        }
      }

      // 1b. Public Personalized Edge Demo Page for Cold Outreach Leads
      if (path === "/demo" && method === "GET") {
        const token = url.searchParams.get("p");
        let companyName = "Tu Negocio";
        let tradeName = "Servicios";
        let phone = "";
        let prospectId = null;
        let evidenceJson = "[]";

        if (token) {
          try {
            const prospect = await env.RADAR_DB.prepare("SELECT id, name, trade, phone, evidence_json FROM prospects WHERE demo_token = ?").bind(token).first() as any;
            if (prospect) {
              companyName = prospect.name || "Tu Negocio";
              tradeName = prospect.trade || "Servicios";
              phone = prospect.phone || "";
              prospectId = prospect.id;
              evidenceJson = prospect.evidence_json || "[]";

              const timestamp = new Date().toISOString();
              const ua = request.headers.get("User-Agent") || "";
              
              // Register visit in demo_views
              await env.RADAR_DB.prepare("INSERT INTO demo_views (prospect_id, viewed_at, ua) VALUES (?, ?, ?)")
                .bind(prospectId, timestamp, ua).run();

              // Track demo_viewed in outcome/event system
              await env.RADAR_DB.prepare("INSERT INTO prospect_events (prospect_id, event_type, content, created_at) VALUES (?, 'demo_viewed', ?, ?)")
                .bind(prospectId, "demo_viewed", `Personalized demo viewed. UA: ${ua}`, timestamp).run();

              // Check if it's the first time in 24 h
              const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
              const otherViews = await env.RADAR_DB.prepare(
                "SELECT COUNT(*) as c FROM demo_views WHERE prospect_id = ? AND viewed_at >= ? AND viewed_at < ?"
              ).bind(prospectId, twentyFourHoursAgo, timestamp).first() as any;

              if (!otherViews || otherViews.c === 0) {
                if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
                  const tgMsg = `🔥 <b>${escapeHtml(companyName)}</b> abrió su demo`;
                  await notifyFounder(env, tgMsg).catch(() => {});
                }
              }
            }
          } catch (e) {
            console.warn("Error resolving demo token or logging view:", e);
          }
        }

        return handleEdgeDemoPage(companyName, tradeName, phone);
      }

      // 1c. Demo CTA Click Tracking Endpoint
      if (path === "/demo/cta" && method === "GET") {
        const token = url.searchParams.get("p");
        if (token) {
          try {
            const prospect = await env.RADAR_DB.prepare("SELECT id, name FROM prospects WHERE demo_token = ?").bind(token).first() as any;
            if (prospect) {
              const timestamp = new Date().toISOString();
              
              // Log event
              await env.RADAR_DB.prepare("INSERT INTO prospect_events (prospect_id, event_type, content, created_at) VALUES (?, 'demo_cta_clicked', ?, ?)")
                .bind(prospect.id, "demo_cta_clicked", "Clicked CTA button in personalized demo", timestamp).run();

              // Update outcome
              await env.RADAR_DB.prepare("UPDATE prospects SET outcome = 'demo_cta_clicked', updated_at = ? WHERE id = ?")
                .bind(timestamp, prospect.id).run();

              // Notify Telegram
              if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
                const ctaMsg = `🎯 <b>${escapeHtml(prospect.name)}</b> hizo clic en el CTA de su demo interactiva!`;
                await notifyFounder(env, ctaMsg).catch(() => {});
              }
            }
          } catch (e) {
            console.warn("Error tracking demo CTA click:", e);
          }
        }
        return Response.redirect("https://bvelt.app", 302);
      }

      // 2. Telegram Webhook Callback Endpoint (handles interactive inline buttons and bot updates)
      const cleanTelegramPath = path.replace(/\/$/, "");
      const isTelegramWebhookRoute = (
        cleanTelegramPath === "/telegram/webhook" ||
        cleanTelegramPath === "/telegram-webhook" ||
        cleanTelegramPath === "/api/telegram-webhook" ||
        cleanTelegramPath === "/api/telegram/webhook" ||
        cleanTelegramPath === "/webhook/telegram" ||
        cleanTelegramPath === "/webhook" ||
        cleanTelegramPath === "/telegram"
      );

      if (isTelegramWebhookRoute) {
        if (request.method === "GET") {
          const rawBotToken = env.TELEGRAM_BOT_TOKEN ? String(env.TELEGRAM_BOT_TOKEN).trim() : "";
          // Strip any accidental wrapping quotes if user configured "bot12345" or '12345:ABC'
          const botToken = rawBotToken.replace(/^["']|["']$/g, "").replace(/^bot/i, "");
          const chatId = env.TELEGRAM_CHAT_ID ? String(env.TELEGRAM_CHAT_ID).trim() : "";
          const action = url.searchParams.get("action") || "";
          const shouldSetWebhook = url.searchParams.get("set_webhook") === "true" || action === "set_webhook";

          let webhookSetupResult: any = null;
          let webhookInfo: any = null;
          let botSelfTest: any = null;

          if (botToken) {
            // First verify bot token with getMe
            try {
              const meRes = await fetch(`https://api.telegram.org/bot${botToken}/getMe`, {
                signal: AbortSignal.timeout(4000)
              });
              botSelfTest = await meRes.json().catch(() => null);
            } catch (e: any) {
              botSelfTest = { ok: false, error: e.message };
            }

            if (shouldSetWebhook) {
              const webhookUrl = `${url.origin}/telegram-webhook`;
              const setupPayload: any = { 
                url: webhookUrl,
                allowed_updates: ["message", "callback_query"]
              };
              if (env.TELEGRAM_WEBHOOK_SECRET && env.TELEGRAM_WEBHOOK_SECRET.trim()) {
                setupPayload.secret_token = env.TELEGRAM_WEBHOOK_SECRET.trim();
              }
              try {
                const setRes = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(setupPayload),
                  signal: AbortSignal.timeout(6000)
                });
                webhookSetupResult = await setRes.json().catch(() => ({ ok: false }));
              } catch (e: any) {
                webhookSetupResult = { ok: false, error: e.message };
              }
            }

            try {
              const infoRes = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`, {
                signal: AbortSignal.timeout(4000)
              });
              webhookInfo = await infoRes.json().catch(() => null);
            } catch (e: any) {
              webhookInfo = { ok: false, error: e.message };
            }
          }

          // Build masked token info for diagnostics
          const tokenPreview = botToken ? `${botToken.slice(0, 4)}...${botToken.slice(-4)} (length: ${botToken.length})` : "none";

          return Response.json({
            ok: true,
            service: "Bvelt Telegram Webhook",
            status: "active",
            message: "Telegram webhook endpoint is operational. Telegram updates are received via POST.",
            bot_token_configured: !!botToken,
            bot_token_preview: tokenPreview,
            bot_info: botSelfTest?.result || (botSelfTest?.ok === false ? { error: botSelfTest.description || "Token rejected by Telegram (401 Unauthorized)" } : null),
            chat_id_configured: !!chatId,
            current_telegram_webhook_info: webhookInfo?.result || webhookInfo,
            webhook_registered_now: webhookSetupResult,
            setup_tip: shouldSetWebhook
              ? (webhookSetupResult?.ok ? "Webhook registrado exitosamente en Telegram." : "Fallo al registrar webhook. Revisa bot_info y error.")
              : "Para registrar este webhook URL en Telegram, visita esta URL con ?set_webhook=true"
          }, { headers: corsHeaders });
        }

        if (request.method === "POST") {
          return await handleTelegramWebhook(request, env, corsHeaders);
        }

        return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
      }

      // 2c. Outbound Email Connectivity Test Endpoint
      if ((path === "/api/email-test" || path === "/email-test" || path === "/api/radar/test-email") && (method === "GET" || method === "POST")) {
        if (!isAuthorized(request, env, serviceKey, validSessionHash)) {
          return Response.json({ error: "unauthorized" }, { status: 401, headers: corsHeaders });
        }
        let recipient = "";
        if (method === "POST") {
          try {
            const body: any = await request.json();
            recipient = body.to || body.email || "";
          } catch (e) {}
        }
        if (!recipient) {
          recipient = url.searchParams.get("to") || url.searchParams.get("email") || (env.OUTBOUND_EMAIL_FROM || "").replace(/.*<([^>]+)>.*/, "$1") || "test@example.com";
        }

        const testRes = await dispatchEmail({
          to: recipient,
          recipientName: "Bvelt Founder Test",
          subject: "⚡ Test de Verificación Outbound - Bvelt Radar",
          body: `Hola,\n\nEste es un email de verificación enviado desde Bvelt Radar.\n\nFecha: ${new Date().toISOString()}\n\nReply STOP to opt out`,
          from: env.OUTBOUND_EMAIL_FROM,
          resendApiKey: env.RESEND_API_KEY,
          brevoApiKey: env.BREVO_API_KEY,
          senderName: env.SENDER_NAME
        });

        return Response.json({
          success: testRes.success,
          status: testRes.status,
          provider: testRes.provider,
          message_id: testRes.messageId,
          error: testRes.error || null,
          details: testRes.details,
          configured_providers: {
            resend: !!env.RESEND_API_KEY,
            brevo: !!env.BREVO_API_KEY,
            hunter_sequence: !!(env.HUNTER_API_KEY && env.HUNTER_SEQUENCE_ID)
          }
        }, { headers: corsHeaders, status: testRes.success ? 200 : 502 });
      }

      // 2b. Public Key Verification Endpoint with HttpOnly Session Cookie
      if ((path === "/verify-key" || path === "/api/verify-key") && method === "POST") {
        const body: any = await request.json().catch(() => ({}));
        const candidateKey = body.key || body.founder_key;
        if (candidateKey && serviceKey && candidateKey === serviceKey) {
          const cookieVal = `bvelt_session=${validSessionHash}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000`;
          const resHeaders = new Headers(corsHeaders);
          resHeaders.set("Set-Cookie", cookieVal);
          resHeaders.set("Content-Type", "application/json");
          return new Response(JSON.stringify({ success: true, valid: true }), {
            status: 200,
            headers: resHeaders
          });
        }
        return Response.json({ success: false, valid: false, error: "Clave incorrecta" }, { status: 401, headers: corsHeaders });
      }

      // 2c. Session Logout Endpoint (Clears HttpOnly Cookie)
      if ((path === "/logout" || path === "/api/logout") && method === "POST") {
        const resHeaders = new Headers(corsHeaders);
        resHeaders.set("Set-Cookie", "bvelt_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0");
        resHeaders.set("Content-Type", "application/json");
        return new Response(JSON.stringify({ success: true, logged_out: true }), {
          status: 200,
          headers: resHeaders
        });
      }

      // 2d. Serve PWA Console Static Assets for Root / Non-API Paths
      if ((env as any).ASSETS && !path.startsWith("/api/") && !["/run", "/health", "/stats", "/decision", "/suppression", "/prospects", "/seeds", "/verify-key", "/logout", "/telegram/webhook", "/telegram-webhook", "/telegram/webhook/", "/telegram-webhook/"].includes(path)) {
        const assetRes = await (env as any).ASSETS.fetch(request);
        if (assetRes.status !== 404) {
          return assetRes;
        }
      }

      // 3. Security Verification for Admin/Worker Endpoints (Supports HttpOnly Cookie OR Bearer token)
      const authorized = isAuthorized(request, env, serviceKey, validSessionHash);

      // Special handling for /run supporting both GET and POST with either auth method
      if (path === "/run") {
        if (!authorized) {
          return Response.json({ error: "Unauthorized. Missing or invalid service key." }, { status: 401, headers: corsHeaders });
        }
        if (method === "GET" || method === "POST") {
          const mode = url.searchParams.get("mode") || "founder";
          const tenantId = url.searchParams.get("tenant_id") || null;
          const force = mode === "tenant" || url.searchParams.get("force") === "true";
          
          const overrides = {
            cities: url.searchParams.get("cities") || url.searchParams.get("geographies") || null,
            trades: url.searchParams.get("trades") || url.searchParams.get("niches") || null,
            countries: url.searchParams.get("countries") || null,
            languages: url.searchParams.get("languages") || null,
            min_score: url.searchParams.get("min_score") || null,
          };
          
          const runResult = await startProspectingRun(env, mode, tenantId, overrides, force);

          return Response.json({
            message: "Autonomous prospecting jobs enqueued successfully.",
            run_id: runResult.run_id,
            mode,
            tenant_id: tenantId,
            jobs_enqueued: runResult.jobs_enqueued,
            active_cities: runResult.active_cities,
            active_trades: runResult.active_trades,
            diagnostics: runResult.diagnostics || {
              bizdata_status: "ready",
              overpass_status: "ready",
              nominatim_status: "ready",
              discovered_raw: 0,
              filtered: 0,
              reason: "Jobs enqueued to autonomous cascade"
            },
            overrides,
            timestamp: new Date().toISOString()
          }, { headers: corsHeaders });
        }
        return Response.json({ error: "Method Not Allowed" }, { status: 405, headers: corsHeaders });
      }

      // Enforce authorization for remaining admin endpoints (/stats, /decision, /suppression, /api/telegram-test)
      if (!authorized) {
        return Response.json({ error: "Unauthorized. Missing or invalid service key." }, { status: 401, headers: corsHeaders });
      }


      // 4. Stats Endpoint (Includes learning performance)
      if (path === "/stats" && method === "GET") {
        return await handleStats(env, corsHeaders);
      }

      // 6. Decision API Endpoint (sent / discard / suppress / replied / demo / won)
      if ((path === "/decision" || path === "/api/events") && method === "POST") {
        const body: any = await request.json();
        const id = body.id || body.prospect_id;
        const action = body.action || body.event_type;
        const notes = body.notes || body.content || body.text;
        
        if (!id || !action) {
          return Response.json({ error: "Missing required fields: id and action" }, { status: 400, headers: corsHeaders });
        }

        return await handleDecision(id, action, notes, env, corsHeaders);
      }

      // 7. Manual Suppression Addition
      if (path === "/suppression" && method === "POST") {
        const { key, reason } = await request.json() as any;
        if (!key || !reason) {
          return Response.json({ error: "Missing key or reason" }, { status: 400, headers: corsHeaders });
        }
        await env.RADAR_DB.prepare(
          "INSERT OR REPLACE INTO suppression (key, reason, created_at) VALUES (?, ?, ?)"
        ).bind(key.toLowerCase(), reason, new Date().toISOString()).run();
        
        return Response.json({ success: true, message: `Added ${key} to suppression list.` }, { headers: corsHeaders });
      }

      // 8. Single Production Prospects Fetching Endpoint
      if ((path === "/prospects" || path === "/api/prospects") && method === "GET") {
        const limit = url.searchParams.get("limit") || "100";
        const status = url.searchParams.get("status");
        const tenantId = url.searchParams.get("tenant_id") || "founder";
        
        let queryStr = "SELECT * FROM prospects WHERE COALESCE(tenant_id,'founder') = ?";
        const params: any[] = [tenantId];
        
        if (status) {
          queryStr += " AND status = ?";
          params.push(status);
        }
        
        queryStr += " ORDER BY created_at DESC LIMIT ?";
        params.push(parseInt(limit, 10));

        const results = await env.RADAR_DB.prepare(queryStr).bind(...params).all();
        return Response.json(results.results || [], { headers: corsHeaders });
      }

      // 8b. Opportunity Intelligence Endpoints
      if ((path === "/opportunities" || path === "/api/opportunities") && method === "GET") {
        const limit = parseInt(url.searchParams.get("limit") || "100", 10);
        const tenantId = url.searchParams.get("tenant_id");
        const priority = url.searchParams.get("priority");
        const decisionState = url.searchParams.get("decision_state");
        const minScore = parseInt(url.searchParams.get("min_score") || "0", 10);

        let query = `
          SELECT o.*, p.name as prospect_name, p.city as prospect_city, p.trade as prospect_trade,
                 p.website as prospect_website, p.phone as prospect_phone, p.email as prospect_email,
                 p.status as prospect_status, p.draft_subject, p.draft_body
          FROM opportunities o
          LEFT JOIN prospects p ON o.prospect_id = p.id
          WHERE o.strategic_score >= ?
        `;
        const params: any[] = [minScore];

        if (tenantId) {
          query += " AND o.tenant_id = ?";
          params.push(tenantId);
        }
        if (priority) {
          query += " AND o.priority_tier = ?";
          params.push(priority);
        }
        if (decisionState) {
          query += " AND o.decision_state = ?";
          params.push(decisionState);
        }

        query += " ORDER BY o.strategic_score DESC, o.created_at DESC LIMIT ?";
        params.push(limit);

        try {
          const res = await env.RADAR_DB.prepare(query).bind(...params).all();
          return Response.json(res.results || [], { headers: corsHeaders });
        } catch (e: any) {
          return Response.json([], { headers: corsHeaders });
        }
      }

      if ((path.startsWith("/opportunities/") || path.startsWith("/api/opportunities/")) && method === "GET") {
        const oppId = path.split("/").pop();
        try {
          const opp = await env.RADAR_DB.prepare(`
            SELECT o.*, p.name as prospect_name, p.city as prospect_city, p.trade as prospect_trade,
                   p.website as prospect_website, p.phone as prospect_phone, p.email as prospect_email,
                   p.status as prospect_status, p.draft_subject, p.draft_body
            FROM opportunities o
            LEFT JOIN prospects p ON o.prospect_id = p.id
            WHERE o.id = ? OR o.prospect_id = ?
          `).bind(oppId, oppId).first();

          if (!opp) {
            return Response.json({ error: "Opportunity not found" }, { status: 404, headers: corsHeaders });
          }

          const signals = await env.RADAR_DB.prepare("SELECT * FROM opportunity_signals WHERE opportunity_id = ? ORDER BY observed_at DESC").bind(opp.id).all();
          const actions = await env.RADAR_DB.prepare("SELECT * FROM opportunity_actions WHERE opportunity_id = ? ORDER BY proposed_at DESC").bind(opp.id).all();
          const outcomes = await env.RADAR_DB.prepare("SELECT * FROM opportunity_outcomes WHERE opportunity_id = ? ORDER BY created_at DESC").bind(opp.id).all();

          return Response.json({
            ...opp,
            signals: signals.results || [],
            actions: actions.results || [],
            outcomes: outcomes.results || []
          }, { headers: corsHeaders });
        } catch (e: any) {
          return Response.json({ error: e.message }, { status: 500, headers: corsHeaders });
        }
      }

      // 8c-bis. Backfill opportunities from existing scored prospects (one-shot repair)
      if ((path === "/api/opportunities/backfill" || path === "/opportunities/backfill") && method === "POST") {
        try {
          await ensureOpportunitiesSchema(env.RADAR_DB);
          const tenantFilter = url.searchParams.get("tenant_id");
          let q = `SELECT id, name, city, trade, score, opportunity_score, confidence_score,
                          fit_score, intent_score, pain_score, ability_to_pay_score,
                          contactability_score, timing_score, evidence_score, signal_freshness_score,
                          expected_value, decision_state, why_now_json, tenant_id, status
                   FROM prospects
                   WHERE COALESCE(score, opportunity_score, 0) >= 40
                     AND status NOT IN ('discarded','suppressed','blocked','disqualified')`;
          const binds: any[] = [];
          if (tenantFilter) {
            q += ` AND COALESCE(tenant_id,'founder') = ?`;
            binds.push(tenantFilter);
          }
          q += ` ORDER BY COALESCE(score, opportunity_score, 0) DESC LIMIT 200`;
          const rows = await env.RADAR_DB.prepare(q).bind(...binds).all();
          const prospects = rows.results || [];
          let created = 0;
          const nowIso = new Date().toISOString();

          for (const p of prospects as any[]) {
            const oppId = `opp_${p.id}`;
            const existing = await env.RADAR_DB.prepare("SELECT id FROM opportunities WHERE id = ?").bind(oppId).first();
            if (existing) continue;

            const stratScore = Math.round(p.opportunity_score || p.score || 50);
            let priority = "MEDIUM";
            if (stratScore >= 80) priority = "HIGH";
            else if (stratScore < 55) priority = "LOW";

            const title = `${p.name} — ${p.trade || 'service'} (${p.city || ''})`;
            const tenantId = p.tenant_id || "founder";

            await env.RADAR_DB.prepare(`
              INSERT INTO opportunities (
                id, prospect_id, tenant_id, title, strategic_score, fit_score, intent_score,
                pain_score, ability_to_pay_score, contactability_score, timing_score,
                evidence_score, signal_freshness_score, expected_value, decision_state,
                why_now_json, priority_tier, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO NOTHING
            `).bind(
              oppId, p.id, tenantId, title,
              stratScore,
              p.fit_score || stratScore,
              p.intent_score || Math.round(stratScore * 0.8),
              p.pain_score || Math.round(stratScore * 0.7),
              p.ability_to_pay_score || 60,
              p.contactability_score || 70,
              p.timing_score || 50,
              p.evidence_score || 50,
              p.signal_freshness_score || 80,
              p.expected_value || 0,
              p.decision_state || "open",
              p.why_now_json || null,
              priority,
              nowIso, nowIso
            ).run();
            created++;
          }

          return Response.json({
            success: true,
            prospects_scanned: prospects.length,
            opportunities_created: created,
            message: `Backfilled ${created} opportunities from ${prospects.length} scored prospects.`
          }, { headers: corsHeaders });
        } catch (e: any) {
          return Response.json({ error: e.message }, { status: 500, headers: corsHeaders });
        }
      }

      // 8c. Missions System Endpoints
      if ((path === "/missions" || path === "/api/missions") && method === "GET") {
        const tenantId = url.searchParams.get("tenant_id") || "founder";
        try {
          const customMissions = await env.RADAR_DB.prepare("SELECT * FROM missions WHERE tenant_id = ? ORDER BY created_at DESC").bind(tenantId).all();
          const dailyMissions = await env.RADAR_DB.prepare("SELECT * FROM daily_missions WHERE tenant_id = ? ORDER BY day DESC LIMIT 30").bind(tenantId).all();
          return Response.json({
            missions: customMissions.results || [],
            daily_missions: dailyMissions.results || []
          }, { headers: corsHeaders });
        } catch (e: any) {
          return Response.json({ missions: [], daily_missions: [] }, { headers: corsHeaders });
        }
      }

      if ((path === "/missions" || path === "/api/missions") && method === "POST") {
        const body: any = await request.json().catch(() => ({}));
        const id = body.id || `mission_${crypto.randomUUID().replace(/-/g, "")}`;
        const tenantId = body.tenant_id || "founder";
        const name = body.name || "Default Mission";
        const goal = body.goal || "Find high-converting customers";
        const status = body.status || "active";
        const markets = JSON.stringify(body.markets || []);
        const icp = JSON.stringify(body.icp || {});
        const budget = JSON.stringify(body.budget || {});
        const targetQualified = body.target_qualified || 5;
        const targetOutreach = body.target_outreach || 5;
        const nowIso = new Date().toISOString();

        try {
          await env.RADAR_DB.prepare(`
            INSERT INTO missions (id, tenant_id, name, goal, status, markets_json, icp_json, budget_json, target_qualified, target_outreach, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name,
              goal = excluded.goal,
              status = excluded.status,
              markets_json = excluded.markets_json,
              icp_json = excluded.icp_json,
              budget_json = excluded.budget_json,
              target_qualified = excluded.target_qualified,
              target_outreach = excluded.target_outreach,
              updated_at = excluded.updated_at
          `).bind(id, tenantId, name, goal, status, markets, icp, budget, targetQualified, targetOutreach, nowIso, nowIso).run();

          return Response.json({ success: true, id, message: "Mission saved" }, { headers: corsHeaders });
        } catch (e: any) {
          return Response.json({ error: e.message }, { status: 500, headers: corsHeaders });
        }
      }

      // 8d. Radar Settings Endpoints
      if ((path === "/api/settings" || path === "/radar_settings" || path === "/api/radar-settings") && method === "GET") {
        const tenantId = url.searchParams.get("tenant_id") || "founder";
        try {
          const settings = await env.RADAR_DB.prepare("SELECT * FROM radar_settings WHERE tenant_id = ?").bind(tenantId).all();
          return Response.json(settings.results || [], { headers: corsHeaders });
        } catch (e) {
          return Response.json([], { headers: corsHeaders });
        }
      }

      if ((path === "/api/settings" || path === "/radar_settings" || path === "/api/radar-settings") && method === "POST") {
        const body: any = await request.json().catch(() => ({}));
        const tenantId = body.tenant_id || "founder";
        const key = body.key || body.setting_key;
        const value = body.value !== undefined ? body.value : body.setting_value;
        if (!key) {
          return Response.json({ error: "Missing setting key" }, { status: 400, headers: corsHeaders });
        }
        const id = `set_${tenantId}_${key}`;
        const nowIso = new Date().toISOString();
        try {
          await env.RADAR_DB.prepare(`
            INSERT INTO radar_settings (id, tenant_id, setting_key, setting_value_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              setting_value_json = excluded.setting_value_json,
              updated_at = excluded.updated_at
          `).bind(id, tenantId, key, JSON.stringify(value), nowIso, nowIso).run();

          return Response.json({ success: true, key }, { headers: corsHeaders });
        } catch (e: any) {
          return Response.json({ error: e.message }, { status: 500, headers: corsHeaders });
        }
      }

      // 9. Suppression Fetching Endpoint
      if ((path === "/api/suppression" || path === "/suppression") && method === "GET") {
        const results = await env.RADAR_DB.prepare("SELECT * FROM suppression ORDER BY created_at DESC").all();
        return Response.json(results.results || [], { headers: corsHeaders });
      }

      // 10. Suppression Removal
      if (path.startsWith("/api/suppression/") && method === "DELETE") {
        const key = decodeURIComponent(path.split("/").pop() || "");
        await env.RADAR_DB.prepare("DELETE FROM suppression WHERE key = ?").bind(key.toLowerCase()).run();
        return Response.json({ success: true }, { headers: corsHeaders });
      }

      // 11. Seeds API Endpoints (GET, POST, DELETE)
      if ((path === "/api/seeds" || path === "/seeds") && method === "GET") {
        const results = await env.RADAR_DB.prepare("SELECT * FROM seeds_optional ORDER BY city ASC").all();
        return Response.json(results.results || [], { headers: corsHeaders });
      }

      if ((path === "/api/seeds" || path === "/seeds") && method === "POST") {
        const body: any = await request.json();
        const id = crypto.randomUUID();
        await env.RADAR_DB.prepare("INSERT INTO seeds_optional (id, city, trade, notes) VALUES (?, ?, ?, ?)")
          .bind(id, body.city, body.trade, body.notes || "").run();
        return Response.json({ id, city: body.city, trade: body.trade, notes: body.notes || "" }, { headers: corsHeaders });
      }

      if (path.startsWith("/api/seeds/") && path !== "/api/seeds/import" && method === "DELETE") {
        const id = path.split("/").pop();
        await env.RADAR_DB.prepare("DELETE FROM seeds_optional WHERE id = ?").bind(id).run();
        return Response.json({ success: true }, { headers: corsHeaders });
      }

      // 11b. Bulk CSV Import Endpoint for Seed Businesses
      if ((path === "/api/seeds/import" || path === "/seeds/import") && method === "POST") {
        let csvText = "";
        const contentType = request.headers.get("content-type") || "";
        if (contentType.includes("json")) {
          const jsonBody: any = await request.json().catch(() => ({}));
          csvText = jsonBody.csv || jsonBody.text || jsonBody.data || "";
        } else {
          csvText = await request.text().catch(() => "");
        }

        if (!csvText || !csvText.trim()) {
          return Response.json({ error: "Missing or empty CSV payload" }, { status: 400, headers: corsHeaders });
        }

        const lines = parseCSV(csvText);
        if (lines.length < 2) {
          return Response.json({ error: "CSV must contain a header row and data rows" }, { status: 400, headers: corsHeaders });
        }

        const headersRow = lines[0];
        const dataRows = lines.slice(1, 1501); // Max 1500 rows per request

        // Detect column indices from headers
        const colMap: Record<string, number> = {};
        headersRow.forEach((h, idx) => {
          const clean = h.toLowerCase().replace(/[^a-z0-9_]/g, "");
          if (colMap.name === undefined && (clean.includes("business") || clean.includes("company") || clean.includes("name") || clean.includes("licensee") || clean.includes("dba"))) {
            colMap.name = idx;
          } else if (colMap.city === undefined && (clean.includes("city") || clean.includes("municipality"))) {
            colMap.city = idx;
          } else if (colMap.state === undefined && (clean === "state" || clean === "st" || clean.includes("state"))) {
            colMap.state = idx;
          } else if (colMap.zip === undefined && (clean.includes("zip") || clean.includes("postal"))) {
            colMap.zip = idx;
          } else if (colMap.phone === undefined && (clean.includes("phone") || clean.includes("tel") || clean.includes("mobile"))) {
            colMap.phone = idx;
          } else if (colMap.website === undefined && (clean.includes("website") || clean.includes("url") || clean.includes("web") || clean.includes("domain"))) {
            colMap.website = idx;
          } else if (colMap.email === undefined && (clean.includes("email") || clean.includes("mail"))) {
            colMap.email = idx;
          } else if (colMap.status === undefined && (clean.includes("status") || clean.includes("classification") || clean.includes("type"))) {
            colMap.status = idx;
          } else if (colMap.issued === undefined && (clean.includes("issued") || clean.includes("issue") || clean.includes("date"))) {
            colMap.issued = idx;
          }
        });

        if (colMap.name === undefined) colMap.name = 0;

        let importedCount = 0;
        let discardedCount = 0;
        const prepareStatements: any[] = [];

        for (const row of dataRows) {
          const name = row[colMap.name] || "";
          if (!name || !name.trim()) continue;

          const status = colMap.status !== undefined ? (row[colMap.status] || "") : "";
          if (isLicenseStatusInvalid(status)) {
            discardedCount++;
            continue;
          }

          const city = colMap.city !== undefined ? (row[colMap.city] || "") : "";
          const state = colMap.state !== undefined ? (row[colMap.state] || "") : "";
          const zip = colMap.zip !== undefined ? (row[colMap.zip] || "") : "";
          const phone = colMap.phone !== undefined ? (row[colMap.phone] || "") : "";
          const website = colMap.website !== undefined ? (row[colMap.website] || "") : "";
          const email = colMap.email !== undefined ? (row[colMap.email] || "") : "";
          const issued = colMap.issued !== undefined ? (row[colMap.issued] || "") : "";

          const trade = inferTradeFromText(name, status);
          const id = `seed_${crypto.randomUUID().replace(/-/g, "")}`;

          prepareStatements.push(
            env.RADAR_DB.prepare(`
              INSERT OR IGNORE INTO seed_businesses (id, source, name, trade, city, state, zip, phone, website, email, license_status, license_issued, used_at)
              VALUES (?, 'csv_import', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
            `).bind(id, name.trim(), trade, city.trim(), state.trim(), zip.trim(), phone.trim(), website.trim(), email.trim(), status.trim(), issued.trim())
          );

          importedCount++;
        }

        // Batch inserts in chunks of 40 using db.batch
        for (let i = 0; i < prepareStatements.length; i += 40) {
          const chunk = prepareStatements.slice(i, i + 40);
          await env.RADAR_DB.batch(chunk);
        }

        return Response.json({
          success: true,
          imported: importedCount,
          discarded: discardedCount,
          total_rows_processed: dataRows.length
        }, { headers: corsHeaders });
      }

      // 12. Test Endpoint for Trust-Stack Governor Gate Rules Verification
      if (path === "/api/test/trust-stack-gate") {
        const testCase = url.searchParams.get("test") || "approve";
        const dummyProspect = {
          id: `test-prospect-${Date.now()}`,
          name: testCase === "suppressed" ? "Suppressed Test Business" : "Test Contractor Co",
          city: "Tampa, FL",
          trade: "hvac",
          email: testCase === "missing_email" ? "" : "test@contractor.example.com",
          phone: "+1 813 555 0199",
          score: testCase === "low_score" ? 20 : 85,
          signals_json: JSON.stringify({ signals: { emergency: true } }),
          bvelt_angle: "after_hours",
          variant_id: "missed_calls"
        };

        if (testCase === "suppressed") {
          await env.RADAR_DB.prepare(
            "INSERT OR REPLACE INTO suppression (key, reason, created_at) VALUES (?, ?, ?)"
          ).bind(`${dummyProspect.name.toLowerCase()}_${dummyProspect.city.toLowerCase()}`.replace(/\s+/g, "_"), "Manual test suppression", new Date().toISOString()).run();
        }

        const gateResult = await verifyTrustStackGate(dummyProspect, "test-run-001", env, testCase);

        return Response.json({
          test_case: testCase,
          prospect: dummyProspect,
          gate_result: gateResult
        }, { headers: corsHeaders });
      }

      // 13. Events & Reply Webhook Endpoint (/api/events, /events, /api/reply, /webhook/events)
      if ((path === "/api/events" || path === "/events" || path === "/api/reply" || path === "/webhook/events") && method === "POST") {
        const body: any = await request.json();
        const prospectId = body.prospect_id || body.id || null;
        const email = body.email || null;
        const eventType = body.event_type || body.event || body.action || "replied";
        const content = body.content || body.text || body.body || body.notes || null;

        const eventResult = await handleProspectEvent({
          prospect_id: prospectId,
          email,
          event_type: eventType,
          content
        }, env);

        return Response.json(eventResult, { headers: corsHeaders });
      }

      // 14. Test Endpoint: Reply Classification Matrix (/api/test/reply-classification)
      if (path === "/api/test/reply-classification") {
        const testCases = [
          { name: "sent", rawType: "sent", content: "" },
          { name: "delivered", rawType: "delivered", content: "" },
          { name: "bounced", rawType: "bounced", content: "550 5.1.1 User unknown" },
          { name: "replied", rawType: "replied", content: "Got your email" },
          { name: "positive", rawType: "replied", content: "Yes, I am interested! Please call me at 555-0199 for a demo." },
          { name: "negative", rawType: "replied", content: "Not interested. We do not need this service, thanks." },
          { name: "question", rawType: "replied", content: "How much does Bvelt cost per month and how does it work?" },
          { name: "not_now", rawType: "replied", content: "We are too busy right now, contact me next month." },
          { name: "unsubscribe", rawType: "replied", content: "Please unsubscribe me immediately and take me off your list." },
          { name: "out_of_office", rawType: "replied", content: "I am out of the office on vacation until next week (automatic reply)." },
          { name: "unknown", rawType: "replied", content: "qwertyuiop 123456" }
        ];

        const matrix = testCases.map(tc => {
          const classified = classifyReplyText(tc.rawType, tc.content);
          return {
            case_name: tc.name,
            input_type: tc.rawType,
            input_content: tc.content,
            classified_as: classified,
            pass: classified === tc.name
          };
        });

        const allPassed = matrix.every(m => m.pass);

        return Response.json({
          all_tests_passed: allPassed,
          total_cases: matrix.length,
          results: matrix
        }, { headers: corsHeaders });
      }

      // 15. Test Endpoint: Automatic Sequence Stop Verification (/api/test/auto-stop)
      if (path === "/api/test/auto-stop") {
        const testCaseType = url.searchParams.get("type") || "positive";
        const dummyId = `test-autostop-${Date.now()}`;
        const timestamp = new Date().toISOString();

        // Seed temporary test prospect in D1
        const dummyToken = crypto.randomUUID().replace(/-/g, "");
        await env.RADAR_DB.prepare(`
          INSERT INTO prospects (id, name, city, trade, email, phone, score, status, outcome, bvelt_angle, variant_id, created_at, updated_at, demo_token)
          VALUES (?, 'AutoStop Test Contractor', 'Tampa, FL', 'plumbing', 'autostop@example.com', '+18135550100', 80, 'notified', 'sent', 'missed_calls', 'missed_calls', ?, ?, ?)
        `).bind(dummyId, timestamp, timestamp, dummyToken).run();

        const sampleContentMap: Record<string, string> = {
          positive: "I am interested in Bvelt! How do we get started?",
          question: "What is the monthly fee for Bvelt?",
          unsubscribe: "Unsubscribe me now and STOP emailing.",
          not_now: "Busy right now, check back next month.",
          negative: "Not interested. Please do not contact us again.",
          bounced: "Mail delivery failed: 550 5.1.1 Address rejected.",
          out_of_office: "I am currently out of office on vacation."
        };

        const sampleContent = sampleContentMap[testCaseType] || "General reply text";

        const eventResult = await handleProspectEvent({
          prospect_id: dummyId,
          email: 'autostop@example.com',
          event_type: testCaseType === 'bounced' ? 'bounced' : 'replied',
          content: sampleContent
        }, env);

        const updatedProspect = await env.RADAR_DB.prepare("SELECT * FROM prospects WHERE id = ?").bind(dummyId).first() as any;

        // Clean up test prospect
        await env.RADAR_DB.prepare("DELETE FROM prospects WHERE id = ?").bind(dummyId).run();

        return Response.json({
          test_case: testCaseType,
          event_result: eventResult,
          updated_status: updatedProspect?.status,
          updated_outcome: updatedProspect?.outcome,
          response_type: updatedProspect?.response_type,
          cooldown_until: updatedProspect?.cooldown_until,
          auto_sequence_stopped: eventResult.auto_stopped && updatedProspect?.status !== 'notified'
        }, { headers: corsHeaders });
      }

      // 16. Tenant Configuration CRUD Endpoints (/api/tenants/config)
      if ((path === "/api/tenants/config" || path === "/tenants/config") && method === "GET") {
        const tenantId = url.searchParams.get("tenant_id");
        if (tenantId) {
          const tenant = await env.RADAR_DB.prepare("SELECT * FROM tenant_config WHERE tenant_id = ?").bind(tenantId).first();
          return Response.json(tenant || { error: "Tenant config not found" }, { headers: corsHeaders });
        }
        const tenants = await env.RADAR_DB.prepare("SELECT * FROM tenant_config ORDER BY tenant_id ASC").all();
        return Response.json(tenants.results || [], { headers: corsHeaders });
      }

      if ((path === "/api/tenants/config" || path === "/tenants/config") && method === "POST") {
        const body: any = await request.json();
        const tenantId = body.tenant_id || `tenant_${Date.now()}`;
        const timestamp = new Date().toISOString();

        await env.RADAR_DB.prepare(`
          INSERT INTO tenant_config (
            tenant_id, tenant_name, industry, niche, subniches_json, services_json, service_areas_json,
            countries_json, regions_json, cities_json, languages_json, icp_description, icp_keywords_json,
            minimum_score, daily_outreach_limit, allowed_markets_json, campaign_goal, messaging_angle, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(tenant_id) DO UPDATE SET
            tenant_name = excluded.tenant_name,
            industry = excluded.industry,
            niche = excluded.niche,
            subniches_json = excluded.subniches_json,
            services_json = excluded.services_json,
            service_areas_json = excluded.service_areas_json,
            countries_json = excluded.countries_json,
            regions_json = excluded.regions_json,
            cities_json = excluded.cities_json,
            languages_json = excluded.languages_json,
            icp_description = excluded.icp_description,
            icp_keywords_json = excluded.icp_keywords_json,
            minimum_score = excluded.minimum_score,
            daily_outreach_limit = excluded.daily_outreach_limit,
            allowed_markets_json = excluded.allowed_markets_json,
            campaign_goal = excluded.campaign_goal,
            messaging_angle = excluded.messaging_angle,
            updated_at = excluded.updated_at
        `).bind(
          tenantId,
          body.tenant_name || "Bvelt Client",
          body.industry || "General",
          body.niche || "Target Prospect",
          JSON.stringify(body.subniches || []),
          JSON.stringify(body.services || []),
          JSON.stringify(body.service_areas || []),
          JSON.stringify(body.countries || ["US"]),
          JSON.stringify(body.regions || []),
          JSON.stringify(body.cities || []),
          JSON.stringify(body.languages || ["en"]),
          body.icp_description || "",
          JSON.stringify(body.icp_keywords || []),
          body.minimum_score || 50,
          body.daily_outreach_limit || 10,
          JSON.stringify(body.allowed_markets || []),
          body.campaign_goal || "",
          body.messaging_angle || "",
          timestamp,
          timestamp
        ).run();

        let runId = null;
        try {
          const runPromise = startProspectingRun(env, "tenant", tenantId, undefined, true);
          if (ctx && typeof ctx.waitUntil === "function") {
            ctx.waitUntil(runPromise);
          }
          const runRes = await runPromise;
          runId = runRes.run_id;
        } catch (e) {
          console.error("Error executing tenant prospecting run on config save:", e);
        }

        return Response.json({ success: true, tenant_id: tenantId, run_id: runId, message: "Tenant config saved successfully." }, { headers: corsHeaders });
      }

      // 16a2. Tenant leads CSV export
      if ((path === "/api/tenants/leads.csv" || path === "/tenants/leads.csv") && method === "GET") {
        if (!isAuthorized(request, env, serviceKey, validSessionHash)) {
          return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
        }
        const tenantId = url.searchParams.get("tenant_id");
        if (!tenantId) {
          return Response.json({ error: "tenant_id required" }, { status: 400, headers: corsHeaders });
        }
        try {
          const rows = await env.RADAR_DB.prepare(`
            SELECT name, trade, city, phone, email, website, score, status, tenant_outcome, won_value_usd, bvelt_angle, created_at
            FROM prospects
            WHERE COALESCE(tenant_id,'founder') = ?
              AND status IN ('qualified','scored','enriched','scouted','discovered','approved','sent')
            ORDER BY COALESCE(score, opportunity_score, 0) DESC
            LIMIT 500
          `).bind(tenantId).all();
          const esc = (v: any) => {
            const s = v == null ? "" : String(v);
            if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
            return s;
          };
          const header = "name,trade,city,phone,email,website,score,status,tenant_outcome,won_value_usd,angle,created_at";
          const lines = [header];
          for (const r of (rows.results || []) as any[]) {
            lines.push([r.name, r.trade, r.city, r.phone, r.email, r.website, r.score, r.status, r.tenant_outcome, r.won_value_usd, r.bvelt_angle, r.created_at].map(esc).join(","));
          }
          return new Response(lines.join("\n"), {
            headers: {
              ...corsHeaders,
              "Content-Type": "text/csv; charset=utf-8",
              "Content-Disposition": 'attachment; filename="tenant-leads.csv"'
            }
          });
        } catch (e: any) {
          return Response.json({ error: e.message }, { status: 500, headers: corsHeaders });
        }
      }

      // 16b. Bvelt → Radar bootstrap (free analysis / profile). Autonomous tenant.
      // Body: { user_id?, tenant_id?, trade|niche, city?, lat?, lon?, tenant_name?, source? }
      // Returns up to 2 leads fast + starts full background run.
      if ((path === "/api/bvelt/bootstrap" || path === "/bvelt/bootstrap") && method === "POST") {
        if (!isAuthorized(request, env, serviceKey, validSessionHash)) {
          return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
        }
        try {
          const body: any = await request.json().catch(() => ({}));
          const result = await bootstrapBveltTenant(env, body, ctx);
          return Response.json(result, { headers: corsHeaders });
        } catch (e: any) {
          return Response.json({ error: e.message || String(e) }, { status: 500, headers: corsHeaders });
        }
      }

      // 16c. Poll first leads after bootstrap
      if ((path === "/api/bvelt/leads" || path === "/bvelt/leads") && method === "GET") {
        const tenantId = url.searchParams.get("tenant_id");
        const limit = Math.min(10, parseInt(url.searchParams.get("limit") || "2", 10));
        if (!tenantId) {
          return Response.json({ error: "tenant_id required" }, { status: 400, headers: corsHeaders });
        }
        try {
          const rows = await env.RADAR_DB.prepare(`
            SELECT id, name, city, trade, website, phone, email, score, status, bvelt_angle, demo_token, created_at
            FROM prospects
            WHERE COALESCE(tenant_id,'founder') = ?
              AND status NOT IN ('discarded','suppressed','blocked')
            ORDER BY COALESCE(score, opportunity_score, 0) DESC, created_at DESC
            LIMIT ?
          `).bind(tenantId, limit).all();
          const leads = (rows.results || []).map((p: any) => ({
            ...p,
            attack_kit: buildAttackKit(p)
          }));
          return Response.json({ tenant_id: tenantId, leads, count: leads.length }, { headers: corsHeaders });
        } catch (e: any) {
          return Response.json({ tenant_id: tenantId, leads: [], count: 0, error: e.message }, { headers: corsHeaders });
        }
      }

      // (a) POST /api/prospects/outcome
      if ((path === "/api/prospects/outcome" || path === "/prospects/outcome") && method === "POST") {
        const body: any = await request.json().catch(() => ({}));
        const { prospect_id, tenant_id, outcome, value_usd } = body;

        if (!prospect_id || !tenant_id || !outcome) {
          return Response.json({ error: "Missing required fields: prospect_id, tenant_id, outcome" }, { status: 400, headers: corsHeaders });
        }

        const validOutcomes = ["contacted", "replied", "won", "lost"];
        if (!validOutcomes.includes(outcome)) {
          return Response.json({ error: "Invalid outcome value" }, { status: 400, headers: corsHeaders });
        }

        const prospect = await env.RADAR_DB.prepare("SELECT * FROM prospects WHERE id = ?").bind(prospect_id).first() as any;
        if (!prospect) {
          return Response.json({ error: "Prospect not found" }, { status: 404, headers: corsHeaders });
        }

        const prospectTenant = prospect.tenant_id || "founder";
        if (prospectTenant !== tenant_id) {
          return Response.json({ error: "Prospect does not belong to tenant" }, { status: 404, headers: corsHeaders });
        }

        const timestamp = new Date().toISOString();
        try {
          await env.RADAR_DB.prepare(
            "UPDATE prospects SET tenant_outcome = ?, won_value_usd = COALESCE(?, won_value_usd), updated_at = ? WHERE id = ?"
          ).bind(outcome, value_usd !== undefined && value_usd !== null ? Number(value_usd) : null, timestamp, prospect_id).run();
        } catch (e) {
          console.warn("[Outcome] Failed to update prospects outcome (missing migration?):", e);
        }

        if ((outcome === "replied" || outcome === "won") && prospect.city && prospect.trade) {
          try {
            const place = findPlace(prospect.city);
            if (place) {
              const placeKeyStr = placeKey(place);
              const col = outcome === "replied" ? "replies" : "wins";
              await env.RADAR_DB.prepare(
                `UPDATE geo_coverage SET ${col} = ${col} + 1 WHERE tenant_id = ? AND place_key = ? AND trade = ?`
              ).bind(tenant_id, placeKeyStr, prospect.trade.toLowerCase()).run();
            }
          } catch (e) {
            // ignore if row doesn't exist
          }
        }

        return Response.json({ success: true, prospect_id, outcome }, { headers: corsHeaders });
      }

      // (b) GET /api/tenants/roi — full funnel + $ EV for product sales story
      if ((path === "/api/tenants/roi" || path === "/tenants/roi") && method === "GET") {
        const tenantId = url.searchParams.get("tenant_id") || "founder";
        try {
          const res = await env.RADAR_DB.prepare(`
            SELECT 
              COUNT(*) as total,
              SUM(CASE WHEN status IN ('scouted','qualified','scored','enriched') THEN 1 ELSE 0 END) as pipeline,
              SUM(CASE WHEN status IN ('sent','queued','approved','notified') THEN 1 ELSE 0 END) as outreach,
              SUM(CASE WHEN status IN ('replied','won') OR tenant_outcome IN ('replied','won') THEN 1 ELSE 0 END) as replied,
              SUM(CASE WHEN status = 'won' OR tenant_outcome = 'won' THEN 1 ELSE 0 END) as won,
              SUM(CASE WHEN COALESCE(tenant_outcome,'') = 'contacted' THEN 1 ELSE 0 END) as contacted,
              SUM(COALESCE(won_value_usd, 0)) as won_value_usd_total,
              SUM(COALESCE(expected_value, opportunity_score, score, 0)) as pipeline_ev_raw,
              AVG(COALESCE(score, opportunity_score, 0)) as avg_score
            FROM prospects
            WHERE COALESCE(tenant_id, 'founder') = ?
              AND status NOT IN ('discarded','suppressed','blocked')
          `).bind(tenantId).first() as any;

          const total = Number(res?.total || 0);
          const outreach = Number(res?.outreach || 0);
          const replied = Number(res?.replied || 0);
          const won = Number(res?.won || 0);
          const pipelineEv = Math.round(Number(res?.pipeline_ev_raw || 0));
          const replyRate = outreach > 0 ? Math.round((replied / outreach) * 1000) / 10 : 0;
          const winRate = outreach > 0 ? Math.round((won / outreach) * 1000) / 10 : 0;

          return Response.json({
            tenant_id: tenantId,
            total,
            pipeline: Number(res?.pipeline || 0),
            outreach,
            contacted: Number(res?.contacted || 0),
            replied,
            won,
            won_value_usd_total: Number(res?.won_value_usd_total || 0),
            pipeline_ev_usd: pipelineEv,
            avg_score: Math.round(Number(res?.avg_score || 0)),
            reply_rate_pct: replyRate,
            win_rate_pct: winRate
          }, { headers: corsHeaders });
        } catch (e: any) {
          return Response.json({
            tenant_id: tenantId, total: 0, pipeline: 0, outreach: 0, contacted: 0,
            replied: 0, won: 0, won_value_usd_total: 0, pipeline_ev_usd: 0,
            avg_score: 0, reply_rate_pct: 0, win_rate_pct: 0
          }, { headers: corsHeaders });
        }
      }

      // (b2) GET /api/prospects/attack-kit?id= — call + SMS + email kit for one lead
      if ((path === "/api/prospects/attack-kit" || path === "/prospects/attack-kit") && method === "GET") {
        const prospectId = url.searchParams.get("id");
        if (!prospectId) {
          return Response.json({ error: "Missing id" }, { status: 400, headers: corsHeaders });
        }
        try {
          const p = await env.RADAR_DB.prepare("SELECT * FROM prospects WHERE id = ?").bind(prospectId).first() as any;
          if (!p) return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
          const kit = buildAttackKit(p);
          return Response.json(kit, { headers: corsHeaders });
        } catch (e: any) {
          return Response.json({ error: e.message }, { status: 500, headers: corsHeaders });
        }
      }

      // (b3) GET /api/digest/weekly — founder or tenant weekly summary (productizable)
      if ((path === "/api/digest/weekly" || path === "/digest/weekly") && method === "GET") {
        const tenantId = url.searchParams.get("tenant_id") || "founder";
        try {
          const top = await env.RADAR_DB.prepare(`
            SELECT id, name, city, trade, score, status, phone, email, website, bvelt_angle, expected_value
            FROM prospects
            WHERE COALESCE(tenant_id,'founder') = ?
              AND status NOT IN ('discarded','suppressed','blocked')
            ORDER BY COALESCE(score, opportunity_score, 0) DESC
            LIMIT 10
          `).bind(tenantId).all();
          const stats = await env.RADAR_DB.prepare(`
            SELECT COUNT(*) as n,
              SUM(CASE WHEN status IN ('sent','queued') THEN 1 ELSE 0 END) as sent_n
            FROM prospects WHERE COALESCE(tenant_id,'founder') = ?
          `).bind(tenantId).first() as any;
          const leads = (top.results || []).map((p: any) => ({
            ...p,
            attack_kit: buildAttackKit(p)
          }));
          return Response.json({
            tenant_id: tenantId,
            generated_at: new Date().toISOString(),
            total_prospects: Number(stats?.n || 0),
            outreach_sent: Number(stats?.sent_n || 0),
            top_leads: leads
          }, { headers: corsHeaders });
        } catch (e: any) {
          return Response.json({ error: e.message }, { status: 500, headers: corsHeaders });
        }
      }

      // 17. Test Endpoint: Founder vs Tenant Mode Independence (/api/test/tenant-mode)
      if (path === "/api/test/tenant-mode") {
        const dayOfYear = getDayOfYear(new Date());

        // 1. Founder Mode Mission Resolution (Radar finding local contractors for Bvelt)
        const founderTargets = await getPriorityTargets(dayOfYear, env, "founder", null);

        // 2. Tenant Mode Mission Resolution (Sample Roofing Company finding Property Managers for IT/maintenance)
        const sampleRoofingTenantConfig = {
          tenant_id: "tenant_roofing_co_01",
          tenant_name: "Apex Commercial Roofing",
          industry: "Commercial Roofing Contractor",
          niche: "property_management", // Target niche is Property Managers, NOT roofing companies!
          subniches_json: JSON.stringify(["Commercial Facility Managers", "HOA Board Directors"]),
          services_json: JSON.stringify(["Roof Maintenance Contracts", "Emergency Leak Repair"]),
          service_areas_json: JSON.stringify(["Tampa Bay Metro"]),
          countries_json: JSON.stringify(["US"]),
          regions_json: JSON.stringify(["FL"]),
          cities_json: JSON.stringify(["Tampa, FL", "Orlando, FL"]),
          languages_json: JSON.stringify(["en", "es"]),
          icp_description: "Commercial property managers and HOA board directors overseeing multi-family or office buildings.",
          icp_keywords_json: JSON.stringify(["property manager", "facility manager", "hoa director", "building management"]),
          minimum_score: 60,
          daily_outreach_limit: 15,
          allowed_markets_json: JSON.stringify(["property_management", "real_estate_management"]),
          campaign_goal: "Book commercial roof maintenance audit appointments",
          messaging_angle: "preventative_maintenance_savings",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        // Seed sample tenant config temporarily
        await env.RADAR_DB.prepare(`
          INSERT INTO tenant_config (
            tenant_id, tenant_name, industry, niche, subniches_json, services_json, service_areas_json,
            countries_json, regions_json, cities_json, languages_json, icp_description, icp_keywords_json,
            minimum_score, daily_outreach_limit, allowed_markets_json, campaign_goal, messaging_angle, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(tenant_id) DO UPDATE SET tenant_name = excluded.tenant_name
        `).bind(
          sampleRoofingTenantConfig.tenant_id, sampleRoofingTenantConfig.tenant_name, sampleRoofingTenantConfig.industry,
          sampleRoofingTenantConfig.niche, sampleRoofingTenantConfig.subniches_json, sampleRoofingTenantConfig.services_json,
          sampleRoofingTenantConfig.service_areas_json, sampleRoofingTenantConfig.countries_json, sampleRoofingTenantConfig.regions_json,
          sampleRoofingTenantConfig.cities_json, sampleRoofingTenantConfig.languages_json, sampleRoofingTenantConfig.icp_description,
          sampleRoofingTenantConfig.icp_keywords_json, sampleRoofingTenantConfig.minimum_score, sampleRoofingTenantConfig.daily_outreach_limit,
          sampleRoofingTenantConfig.allowed_markets_json, sampleRoofingTenantConfig.campaign_goal, sampleRoofingTenantConfig.messaging_angle,
          sampleRoofingTenantConfig.created_at, sampleRoofingTenantConfig.updated_at
        ).run();

        const tenantTargets = await getPriorityTargets(dayOfYear, env, "tenant", "tenant_roofing_co_01");

        // 3. Sample Scoring comparison
        const sampleContractorBusiness = { name: "Tampa Bay HVAC & Plumbing", trade: "hvac", city: "Tampa, FL", website: "tampahvac.com" };
        const samplePropertyManagerBusiness = { name: "Sunstate Property Management", trade: "property_management", city: "Tampa, FL", website: "sunstatepm.com" };

        const founderScore = calculateMultiFactorScore(
          sampleContractorBusiness, "contact@tampahvac.com", true, "+18135550199", true, true, {}, { emergency: true, sms_gap: true }, founderTargets.missionConfig
        );

        const tenantScore = calculateMultiFactorScore(
          samplePropertyManagerBusiness, "info@sunstatepm.com", true, "+18135550188", true, true, {}, { quote_request: true, lead_capture: true }, tenantTargets.missionConfig
        );

        // Verification assertions
        const isNicheIndependent = founderTargets.missionConfig.target !== tenantTargets.missionConfig.target &&
                                     founderTargets.missionConfig.niches[0] !== tenantTargets.missionConfig.niches[0];
        
        const isICPIndependent = founderTargets.missionConfig.icp.description !== tenantTargets.missionConfig.icp.description;

        return Response.json({
          tests_passed: isNicheIndependent && isICPIndependent,
          founder_mode: {
            active_target: founderTargets.missionConfig.target,
            target_niches: founderTargets.missionConfig.niches,
            icp: founderTargets.missionConfig.icp,
            sample_scoring: founderScore
          },
          tenant_mode: {
            tenant_id: tenantTargets.missionConfig.tenant_id,
            tenant_industry: tenantTargets.missionConfig.industry,
            target_niches: tenantTargets.missionConfig.niches,
            icp: tenantTargets.missionConfig.icp,
            allowed_markets: tenantTargets.missionConfig.allowed_markets,
            campaign_goal: tenantTargets.missionConfig.campaign_goal,
            messaging_angle: tenantTargets.missionConfig.messaging_angle,
            sample_scoring: tenantScore
          },
          independence_verified: {
            separate_targets: isNicheIndependent,
            separate_icp: isICPIndependent
          }
        }, { headers: corsHeaders });
      }

      // 18. Complete Preflight Diagnostics Endpoint (/api/test/preflight)
      if (path === "/api/test/preflight") {
        const diagnostics: Record<string, any> = {
          timestamp: new Date().toISOString(),
          d1_database: { ready: false, details: null },
          queue_system: { ready: false, details: null },
          hunter_api: { ready: false, key_present: !!env.HUNTER_API_KEY, details: null },
          abstract_api: { ready: false, key_present: !!env.ABSTRACT_API_KEY, details: null },
          trust_stack: { ready: false, url_present: !!env.TRUST_STACK_URL, details: null },
          cron_trigger: { ready: true, schedule: "0 14 * * *" },
          worker_routes: { ready: true, active_routes: ["/health", "/prospects", "/run", "/decision", "/stats", "/api/events", "/api/tenants/config"] }
        };

        // 1. D1 Database Check
        try {
          const countRow = await env.RADAR_DB.prepare("SELECT COUNT(*) as c FROM prospects").first() as any;
          diagnostics.d1_database = { ready: true, details: `D1 Connected. Prospects count: ${countRow?.c || 0}` };
        } catch (e: any) {
          diagnostics.d1_database = { ready: false, details: `D1 Error: ${e.message}` };
        }

        // 2. Cloudflare Queue Check
        if (env.RADAR_QUEUE) {
          diagnostics.queue_system = { ready: true, details: "Cloudflare Queue RADAR_QUEUE binding active" };
        } else {
          diagnostics.queue_system = { ready: true, details: "Direct Queue Async execution fallback active" };
        }

        // 3. Hunter API Check
        if (env.HUNTER_API_KEY) {
          try {
            const hRes = await fetch(`https://api.hunter.io/v2/account?api_key=${env.HUNTER_API_KEY}`, { signal: AbortSignal.timeout(4000) });
            if (hRes.ok) {
              const hData: any = await hRes.json();
              diagnostics.hunter_api = {
                ready: true,
                key_present: true,
                details: `Hunter Account Verified: ${hData.data?.email || 'Active'}. Plan: ${hData.data?.plan_name || 'Free'}`
              };
            } else {
              diagnostics.hunter_api = {
                ready: false,
                key_present: true,
                details: `Hunter API HTTP ${hRes.status}: Invalid key or account issue`
              };
            }
          } catch (e: any) {
            diagnostics.hunter_api = { ready: false, key_present: true, details: `Hunter API fetch exception: ${e.message}` };
          }
        } else {
          diagnostics.hunter_api = {
            ready: false,
            key_present: false,
            details: "HUNTER_API_KEY secret variable is NOT configured in environment secrets."
          };
        }

        // 4. Abstract API Check
        if (env.ABSTRACT_API_KEY) {
          diagnostics.abstract_api = { ready: true, key_present: true, details: "ABSTRACT_API_KEY configured for deliverability checks" };
        } else {
          diagnostics.abstract_api = { ready: true, key_present: false, details: "Basic regex & disposable domain validation fallback active" };
        }

        // 5. Trust-Stack Check
        try {
          const testProspect = { id: "preflight-test", name: "Preflight Business", city: "Tampa, FL", trade: "hvac", email: "preflight@example.com", score: 85 };
          const gate = await verifyTrustStackGate(testProspect, "preflight-run", env);
          diagnostics.trust_stack = {
            ready: gate.allowed || gate.status === 'approved',
            url_present: !!env.TRUST_STACK_URL,
            details: gate.reason
          };
        } catch (e: any) {
          diagnostics.trust_stack = { ready: false, url_present: !!env.TRUST_STACK_URL, details: e.message };
        }

        const isReadyForOutreach = diagnostics.d1_database.ready && diagnostics.trust_stack.ready;

        return Response.json({
          system_ready_for_outreach: isReadyForOutreach,
          diagnostics
        }, { headers: corsHeaders });
      }

      return Response.json({ error: "Not Found" }, { status: 404, headers: corsHeaders });

    } catch (error: any) {
      return Response.json({ error: error.message || "Internal Server Error" }, { status: 500, headers: corsHeaders });
    }
  },

  // Daily Scheduled Trigger (Cron: "0 12 * * *")
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log(`[Radar Cron] Scheduled trigger initiated at ${new Date().toISOString()}`);
    const run = startProspectingRun(env, "founder", null);
    // After discovery wave, repair opportunities table from scored prospects (guerrilla self-heal)
    const heal = (async () => {
      try {
        await run;
        await ensureOpportunitiesSchema(env.RADAR_DB);
        const rows = await env.RADAR_DB.prepare(`
          SELECT id, name, city, trade, score, opportunity_score, tenant_id, expected_value,
                 fit_score, intent_score, pain_score, decision_state, why_now_json
          FROM prospects
          WHERE COALESCE(score, opportunity_score, 0) >= 45
            AND status NOT IN ('discarded','suppressed','blocked','disqualified')
          ORDER BY COALESCE(score, opportunity_score, 0) DESC LIMIT 80
        `).all();
        const nowIso = new Date().toISOString();
        let n = 0;
        for (const p of (rows.results || []) as any[]) {
          const oppId = `opp_${p.id}`;
          const exists = await env.RADAR_DB.prepare("SELECT id FROM opportunities WHERE id = ?").bind(oppId).first();
          if (exists) continue;
          const stratScore = Math.round(p.opportunity_score || p.score || 50);
          const priority = stratScore >= 80 ? "high" : stratScore >= 55 ? "medium" : "low";
          const title = `${p.name} — ${p.trade || "service"} (${p.city || ""})`;
          await env.RADAR_DB.prepare(`
            INSERT INTO opportunities (
              id, prospect_id, tenant_id, title, strategic_score, fit_score, intent_score,
              pain_score, ability_to_pay_score, contactability_score, timing_score,
              evidence_score, signal_freshness_score, expected_value, decision_state,
              why_now_json, priority_tier, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO NOTHING
          `).bind(
            oppId, p.id, p.tenant_id || "founder", title, stratScore,
            p.fit_score || stratScore, p.intent_score || Math.round(stratScore * 0.8),
            p.pain_score || 50, 60, 70, 50, 50, 80,
            p.expected_value || 0, p.decision_state || "identified",
            p.why_now_json || null, priority, nowIso, nowIso
          ).run();
          n++;
        }
        console.log(`[Radar Cron] Self-heal opportunities created: ${n}`);
      } catch (e) {
        console.warn("[Radar Cron] opportunity heal failed:", e);
      }
    })();
    if (ctx && typeof ctx.waitUntil === "function") {
      ctx.waitUntil(heal);
    } else {
      await heal;
    }
  },

  // Cloudflare Queues Consumer Handler (Infrastructure Safe & Idempotent)
  async queue(batch: MessageBatch<RadarJobMessage>, env: Env, ctx: ExecutionContext): Promise<void> {
    for (const msg of batch.messages) {
      try {
        const body: any = msg.body || {};
        const jobId = body.job_id || msg.id;
        const jobType = body.job_type || body.type || 'unknown';
        const runId = body.run_id || null;
        const prospectId = body.prospect_id || null;

        // Structure Validation
        if (!jobId || !jobType) {
          console.warn(`[Queue Consumer] Invalid job message format received. Missing job_id or job_type:`, body);
          msg.ack(); // Acknowledge malformed message
          continue;
        }

        // Idempotency check against radar_jobs table
        if (env.RADAR_DB) {
          try {
            const existing = await env.RADAR_DB.prepare(
              "SELECT status FROM radar_jobs WHERE id = ?"
            ).bind(jobId).first() as any;

            if (existing && existing.status === 'completed') {
              console.log(`[Queue Consumer] Job ${jobId} already completed. Acknowledging & skipping.`);
              msg.ack();
              continue;
            }

            const timestamp = new Date().toISOString();
            await env.RADAR_DB.prepare(`
              INSERT INTO radar_jobs (id, run_id, prospect_id, job_type, status, attempts, payload_json, created_at, updated_at)
              VALUES (?, ?, ?, ?, 'processing', ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET
                status = 'processing',
                attempts = radar_jobs.attempts + 1,
                updated_at = excluded.updated_at
            `).bind(
              jobId,
              runId,
              prospectId,
              jobType,
              msg.attempts || 1,
              JSON.stringify(body.payload || {}),
              timestamp,
              timestamp
            ).run();
          } catch (e) {
            console.warn(`[Queue Consumer DB Log Warning] Job ${jobId}:`, e);
          }
        }

        // Execute job router safely
        await processQueueJob(body, env);

        // Mark completed in radar_jobs & acknowledge (protecting completed_zero_prospects status)
        if (env.RADAR_DB) {
          try {
            await env.RADAR_DB.prepare(
              "UPDATE radar_jobs SET status = 'completed', updated_at = ? WHERE id = ? AND status != 'completed_zero_prospects'"
            ).bind(new Date().toISOString(), jobId).run();
          } catch (e) {}
        }
        msg.ack();

      } catch (err: any) {
        console.error(`[Queue Consumer Error] Job execution failed:`, err);
        const jobId = msg.body?.job_id || msg.id;
        if (jobId && env.RADAR_DB) {
          try {
            await env.RADAR_DB.prepare(
              "UPDATE radar_jobs SET status = 'failed', last_error = ?, updated_at = ? WHERE id = ?"
            ).bind(err.message || String(err), new Date().toISOString(), jobId).run();
          } catch (e) {}
        }
        msg.retry();
      }
    }
  }
};

/**
 * Enhanced Health Check with usage metrics & Cloudflare Queues observability
 */
async function handleHealth(env: Env, headers: Record<string, string>): Promise<Response> {
  const db = env.RADAR_DB;
  const today = new Date().toISOString().split('T')[0];

  let prospectsToday = 0;
  let hunterUsedToday = 0;
  let lastRunDate: string | null = null;
  let pendingJobs = 0;
  let completedJobs = 0;
  let failedJobs = 0;
  let lastError: string | null = null;
  let lastDiagnostics: any = null;
  const prospectsByStatus: Record<string, number> = {};

  const telegramConfigured = Boolean(
    env.TELEGRAM_BOT_TOKEN &&
    String(env.TELEGRAM_BOT_TOKEN).trim() !== '' &&
    env.TELEGRAM_CHAT_ID &&
    String(env.TELEGRAM_CHAT_ID).trim() !== ''
  );
  let lastTelegramOk: boolean | string | null = null;

  try {
    const todayRun = await db.prepare("SELECT * FROM runs WHERE day = ? ORDER BY created_at DESC LIMIT 1").bind(today).first() as any;
    if (todayRun) {
      prospectsToday = todayRun.finalized || 0;
      hunterUsedToday = todayRun.hunter_calls || 0;
      lastRunDate = todayRun.created_at;
      if (todayRun.errors_json && todayRun.errors_json !== "[]") {
        try {
          const errList = JSON.parse(todayRun.errors_json);
          if (Array.isArray(errList) && errList.length > 0) {
            lastDiagnostics = errList[errList.length - 1];
            // Check for telegram outbound errors or successes
            const tgError = errList.find((e: any) => e.source === 'telegram_outbound' || e.source === 'telegram_outbound_exception');
            if (tgError) {
              lastTelegramOk = false;
            } else if (telegramConfigured) {
              lastTelegramOk = true;
            }
          }
        } catch (e) {}
      } else if (telegramConfigured) {
        lastTelegramOk = true;
      }
    } else {
      const latestRun = await db.prepare("SELECT * FROM runs ORDER BY created_at DESC LIMIT 1").first() as any;
      if (latestRun) {
        lastRunDate = latestRun.created_at;
        if (latestRun.errors_json && latestRun.errors_json !== "[]") {
          try {
            const errList = JSON.parse(latestRun.errors_json);
            if (Array.isArray(errList) && errList.length > 0) {
              lastDiagnostics = errList[errList.length - 1];
              const tgError = errList.find((e: any) => e.source === 'telegram_outbound' || e.source === 'telegram_outbound_exception');
              if (tgError) {
                lastTelegramOk = false;
              } else if (telegramConfigured) {
                lastTelegramOk = true;
              }
            }
          } catch (e) {}
        }
      }
    }
  } catch (e) {
    console.warn("Health check stats query fallback: ", e);
  }

  // Check latest prospect notification timestamp if available
  try {
    const notifiedProspect = await db.prepare(
      "SELECT updated_at FROM prospects WHERE status IN ('notified', 'sent', 'approved') ORDER BY updated_at DESC LIMIT 1"
    ).first() as any;
    if (notifiedProspect && notifiedProspect.updated_at) {
      lastTelegramOk = notifiedProspect.updated_at;
    } else if (lastTelegramOk === null && telegramConfigured) {
      lastTelegramOk = true;
    }
  } catch (e) {}

  // Aggregate prospects counts by status
  try {
    const statusRows = await db.prepare("SELECT status, COUNT(*) as count FROM prospects GROUP BY status").all();
    if (statusRows.results) {
      for (const row of statusRows.results as any[]) {
        if (row.status) {
          prospectsByStatus[row.status] = row.count;
        }
      }
    }
  } catch (e) {
    console.warn("Health check prospects_by_status query fallback:", e);
  }

  try {
    const jobStats = await db.prepare("SELECT status, COUNT(*) as count FROM queue_jobs GROUP BY status").all();
    if (jobStats.results) {
      for (const r of jobStats.results as any[]) {
        if (r.status === 'pending' || r.status === 'processing') pendingJobs += r.count;
        if (r.status === 'completed' || r.status === 'completed_zero_prospects') completedJobs += r.count;
        if (r.status === 'failed') failedJobs += r.count;
      }
    }
    const lastErrRow = await db.prepare("SELECT error FROM queue_jobs WHERE error IS NOT NULL AND status = 'failed' ORDER BY created_at DESC LIMIT 1").first() as any;
    if (lastErrRow) lastError = lastErrRow.error;
  } catch (e) {
    // queue_jobs table initializing
  }

  const hunterRemaining = Math.max(0, LIMITS.max_hunter_credits_per_day - hunterUsedToday);

  let prospectsTotal = 0;
  let prospectsUniqueToday = 0;
  let suppressedCount = 0;

  try {
    const totalRow = await db.prepare("SELECT COUNT(*) as count FROM prospects").first() as any;
    if (totalRow) prospectsTotal = totalRow.count;
  } catch (e) {}

  try {
    const uniqueRow = await db.prepare("SELECT COUNT(DISTINCT identity_key) as count FROM prospects WHERE created_at >= ?").bind(`${today}T00:00:00.000Z`).first() as any;
    if (uniqueRow) prospectsUniqueToday = uniqueRow.count;
  } catch (e) {}

  try {
    const supRow = await db.prepare("SELECT COUNT(*) as count FROM suppression").first() as any;
    if (supRow) suppressedCount = supRow.count;
  } catch (e) {}

  const globalPause = env.RADAR_GLOBAL_PAUSE === "true" || env.RADAR_GLOBAL_PAUSE === "1";
  const outreachPause = env.RADAR_OUTREACH_PAUSE === "true" || env.RADAR_OUTREACH_PAUSE === "1";

  let budgetRow = await db.prepare("SELECT * FROM daily_budgets WHERE tenant_id = 'founder' AND day = ?").bind(today).first() as any;
  if (!budgetRow) {
    budgetRow = {
      discovery_units: 0,
      enrichment_units: 0,
      ai_units: 0,
      hunter_units: 0,
      outreach_units: 0,
      finalize_units: 0,
    };
  }

  const cb = await db.prepare("SELECT * FROM circuit_breakers WHERE id = 'outreach'").first() as any;
  const circuitBreakerActive = cb ? cb.status === 'open' : false;
  const circuitBreakerReason = cb ? cb.reason : null;

  return Response.json({
    status: globalPause ? "paused" : circuitBreakerActive ? "paused" : failedJobs > 0 && pendingJobs === 0 ? "degraded" : "healthy",
    global_pause: globalPause,
    outreach_pause: outreachPause,
    circuit_breaker: circuitBreakerActive,
    circuit_breaker_reason: circuitBreakerReason,
    today: {
      discovery: { used: budgetRow.discovery_units || 0, max: 30 },
      enrichment: { used: budgetRow.enrichment_units || 0, max: 20 },
      AI: { used: budgetRow.ai_units || 0, max: 10 },
      Hunter: { used: budgetRow.hunter_units || 0, max: 8 },
      outreach: { used: budgetRow.outreach_units || 0, max: 3 }
    },
    telegram_configured: telegramConfigured,
    last_telegram_ok: lastTelegramOk,
    prospects_today: prospectsToday,
    prospects_total: prospectsTotal,
    prospects_unique_today: prospectsUniqueToday,
    suppressed_count: suppressedCount,
    prospects_by_status: prospectsByStatus,
    queue_pending: pendingJobs,
    hunter_remaining_estimate: hunterRemaining,
    last_run: lastRunDate,
    last_run_diagnostics: lastDiagnostics,
    diagnostics: lastDiagnostics || {
      bizdata_status: "ready",
      overpass_status: "ready",
      nominatim_status: "ready",
      discovered_raw: prospectsToday,
      filtered: 0,
      reason: prospectsToday > 0 ? "Discovery cascade operational" : "System ready"
    },
    queue: {
      pending: pendingJobs,
      pending_or_processing: pendingJobs,
      completed_jobs: completedJobs,
      failed_jobs: failedJobs,
      last_error: lastError
    },
    timestamp: new Date().toISOString(),
    limits: LIMITS
  }, { headers });
}

/**
 * Handle Telegram Webhook for Interactive Inline Button Clicks
 */
async function handleTelegramWebhook(request: Request, env: Env, headers: Record<string, string>): Promise<Response> {
  const rawBotToken = env.TELEGRAM_BOT_TOKEN ? String(env.TELEGRAM_BOT_TOKEN).trim() : "";
  const botToken = rawBotToken.replace(/^["']|["']$/g, "").replace(/^bot/i, "");
  const configuredChatId = env.TELEGRAM_CHAT_ID ? String(env.TELEGRAM_CHAT_ID).trim().replace(/^["']|["']$/g, "") : "";

  // 1. Webhook Secret Token Verification
  // Only verify secret token if TELEGRAM_WEBHOOK_SECRET is configured in env
  if (env.TELEGRAM_WEBHOOK_SECRET && env.TELEGRAM_WEBHOOK_SECRET.trim().length > 0) {
    const secretToken = request.headers.get("X-Telegram-Bot-Api-Secret-Token") || "";
    const configuredSecret = env.TELEGRAM_WEBHOOK_SECRET.trim();

    let isMatch = secretToken.length === configuredSecret.length;
    if (secretToken.length === configuredSecret.length) {
      let result = 0;
      for (let i = 0; i < secretToken.length; i++) {
        result |= secretToken.charCodeAt(i) ^ configuredSecret.charCodeAt(i);
      }
      isMatch = result === 0;
    } else {
      isMatch = false;
    }

    if (!isMatch) {
      console.warn("[Telegram Webhook] Unauthorized: X-Telegram-Bot-Api-Secret-Token mismatch");
      return Response.json({ ok: false, error: "Unauthorized webhook secret token" }, { status: 200, headers });
    }
  }

  try {
    const update: any = await request.json();

    const chatId = update.message?.chat?.id || update.callback_query?.message?.chat?.id || update.callback_query?.from?.id;

    // If TELEGRAM_CHAT_ID is not configured in env yet, help the user on first contact
    if (!configuredChatId) {
      if (chatId && update.message && botToken) {
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: `👋 <b>¡Hola desde Bvelt Radar!</b>\n\nTu <b>Telegram Chat ID</b> es:\n<code>${chatId}</code>\n\nPara activar el bot y recibir alertas, agrega esta variable en tus Secretos de Cloudflare:\n<code>TELEGRAM_CHAT_ID = ${chatId}</code>`,
            parse_mode: "HTML"
          }),
          signal: AbortSignal.timeout(4000)
        }).catch(e => console.warn("Error sending setup message:", e));
      }
      return Response.json({ ok: true, notice: "TELEGRAM_CHAT_ID not configured" }, { headers });
    }

    // Verify Chat ID matches configured Chat ID
    if (!chatId || String(chatId).trim() !== configuredChatId) {
      console.warn(`[Telegram Webhook] Chat ID mismatch: got ${chatId}, expected ${configuredChatId}`);
      if (chatId && botToken) {
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: `⚠️ <b>Chat ID no autorizado</b>\n\nTu Telegram Chat ID actual es: <code>${chatId}</code>\nPero en Cloudflare está configurado: <code>${configuredChatId ? configuredChatId.substring(0, 4) + '...' : 'Ninguno'}</code>\n\nSi este es tu chat personal, actualiza en Cloudflare Dashboard:\n<code>TELEGRAM_CHAT_ID = ${chatId}</code>`,
            parse_mode: "HTML"
          }),
          signal: AbortSignal.timeout(4000)
        }).catch(() => {});
      }
      return Response.json({ ok: true, ignored: "Unauthorized Chat ID" }, { headers });
    }

    // Handle Inline Button Clicks (callback_query)
    if (update.callback_query) {
      const query = update.callback_query;
      const callbackData: string = (query.data || "").trim();
      const callbackId = query.id;

      const [action, prospectId] = callbackData.split(":");

      if (action && prospectId) {
        // Execute decision (approve maps to sent/approved, discard to discard, suppress to suppress)
        const decisionAction = (action === "approve" || action === "sent") ? "sent" : (action === "discard" ? "discard" : action);
        const decisionRes = await handleDecision(prospectId, decisionAction, `Triggered via Telegram Button (${action})`, env, {});
        const decisionJson: any = await decisionRes.json().catch(() => ({}));

        // Answer callback query so Telegram spinner stops
        if (botToken) {
          const actionText = (action === "approve" || action === "sent")
            ? (decisionJson?.success === false && decisionJson?.dispatch?.error
                ? "❌ No se pudo enviar"
                : "✅ Aprobado y puesto en cola de envío")
            : action === "discard"
            ? "❌ Descartado"
            : "🚫 Dominio Suprimido";

          await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              callback_query_id: callbackId,
              text: `${actionText} (${prospectId.substring(0, 8)})`,
              show_alert: false,
            }),
            signal: AbortSignal.timeout(4000)
          }).catch(e => console.warn("answerCallbackQuery warning: ", e));

          let dispatchInfo = "";
          if (decisionJson?.dispatch?.status === "dispatched") {
            dispatchInfo = `\n\n📧 <b>Email despachado de verdad</b> vía <code>${decisionJson.dispatch.provider}</code> (ID: <code>${escapeHtml(decisionJson.dispatch.messageId)}</code>).`;
          } else if (decisionJson?.dispatch?.status === "simulated") {
            dispatchInfo = `\n\n⚠️ <i>Email guardado en modo simulado. Configura RESEND_API_KEY en Cloudflare para envíos reales gratis (3,000/mes).</i>`;
          } else if (decisionJson?.dispatch?.error) {
            dispatchInfo = `\n\n❌ <i>Error al despachar email: ${escapeHtml(decisionJson.dispatch.error)}</i>`;
          }

          // Send confirmation text in chat
          await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: chatId,
              text: `<b>${actionText}</b>: ID <code>${escapeHtml(prospectId)}</code> registrado en D1.${dispatchInfo}`,
              parse_mode: "HTML"
            }),
            signal: AbortSignal.timeout(4000)
          }).catch(e => console.warn("sendMessage confirmation warning: ", e));
        }
      } else {
        // Handle standalone buttons without prospectId (e.g., 'status', 'ver_estado', 'digest', 'radar')
        if (botToken) {
          const lowerAction = (action || callbackData).toLowerCase();

          if (lowerAction === "status" || lowerAction === "ver_estado" || lowerAction === "estado") {
            await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ callback_query_id: callbackId, text: "📊 Consultando estado...", show_alert: false }),
              signal: AbortSignal.timeout(4000)
            }).catch(() => {});

            const provStatus = env.RESEND_API_KEY ? "✅ Resend (3,000/mes gratis)" : env.BREVO_API_KEY ? "✅ Brevo (300/día gratis)" : "⚠️ Simulado (Falta RESEND_API_KEY)";
            const webhookStatus = env.TELEGRAM_WEBHOOK_SECRET ? "🔒 Protegido con Secret Token" : "⚡ Activo (validación por Chat ID)";
            const statusMsg = `<b>📊 Bvelt Radar Status</b>\n\n<b>Email Outbound:</b> ${provStatus}\n<b>Bot Telegram:</b> ✅ Conectado (${webhookStatus})\n<b>Chat ID:</b> <code>${chatId}</code>\n<b>Plataforma:</b> <a href="https://bvelt.app">https://bvelt.app</a>\n\n<i>Escribe /digest para ver las 3 mejores oportunidades o /testmail tu@correo.com para probar el envío.</i>`;

            await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ chat_id: chatId, text: statusMsg, parse_mode: "HTML" }),
              signal: AbortSignal.timeout(4000)
            }).catch(() => {});

          } else if (lowerAction === "digest" || lowerAction === "resumen" || lowerAction === "oportunidades") {
            await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ callback_query_id: callbackId, text: "🔍 Cargando oportunidades...", show_alert: false }),
              signal: AbortSignal.timeout(4000)
            }).catch(() => {});

            const topOpps = await env.RADAR_DB.prepare(
              "SELECT * FROM prospects WHERE email IS NOT NULL AND status IN ('queued', 'enriched', 'drafted') ORDER BY score DESC LIMIT 3"
            ).all() as any;

            if (topOpps.results && topOpps.results.length > 0) {
              await dispatchInteractiveTelegramAlert(topOpps.results, [], [], env);
            } else {
              await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ chat_id: chatId, text: "🔍 No hay prospectos pendientes en cola en este momento.", parse_mode: "HTML" }),
                signal: AbortSignal.timeout(4000)
              }).catch(() => {});
            }

          } else {
            // Stop button spinner for any arbitrary callback
            await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ callback_query_id: callbackId, text: `Acción recibida: ${callbackData}` }),
              signal: AbortSignal.timeout(4000)
            }).catch(() => {});
          }
        }
      }
    }

    // Handle Telegram Text Messages and Commands
    if (update.message?.text && botToken) {
      const msgText = (update.message.text || "").trim();
      const lower = msgText.toLowerCase();
      // Remove @bot_username in case Telegram appended it (e.g., /status@MyBot)
      const rawCommand = lower.split(/\s+/)[0] || "";
      const command = rawCommand.replace(/@[a-zA-Z0-9_]+$/, "");

      if (command === "/testmail" || command === "testmail" || command === "/test" || command === "test") {
        const parts = msgText.split(/\s+/);
        const targetEmail = parts[1] || (env.OUTBOUND_EMAIL_FROM || "").replace(/.*<([^>]+)>.*/, "$1") || "test@example.com";

        const testRes = await dispatchEmail({
          to: targetEmail,
          recipientName: "Bvelt Founder Test",
          subject: "⚡ Test Outbound Live - Bvelt Radar",
          body: `Hola,\n\nEste es un mensaje de prueba enviado desde tu bot de Telegram en Bvelt Radar.\n\nProveedor detectado: ${env.RESEND_API_KEY ? "Resend API" : env.BREVO_API_KEY ? "Brevo API" : "Simulado"}\nFecha: ${new Date().toISOString()}\n\nReply STOP to opt out`,
          from: env.OUTBOUND_EMAIL_FROM,
          resendApiKey: env.RESEND_API_KEY,
          brevoApiKey: env.BREVO_API_KEY,
          senderName: env.SENDER_NAME
        });

        let replyMsg = "";
        if (testRes.status === "dispatched") {
          replyMsg = `✅ <b>Email despachado exitosamente!</b>\n\n<b>Destinatario:</b> <code>${escapeHtml(targetEmail)}</code>\n<b>Proveedor:</b> <code>${testRes.provider}</code>\n<b>Message ID:</b> <code>${escapeHtml(testRes.messageId)}</code>`;
        } else if (testRes.status === "simulated") {
          replyMsg = `⚠️ <b>Modo Simulado Activo</b>\n\nNo tienes configurada ninguna clave de envío de correos.\n\n<b>Pasos para envíos reales gratis:</b>\n1. Ve a <a href="https://resend.com">resend.com</a> y obtén tu API Key (3,000 emails/mes gratis).\n2. En Cloudflare Dashboard > Settings > Variables and Secrets, agrega:\n• <code>RESEND_API_KEY</code> = tu clave re_...\n• <code>OUTBOUND_EMAIL_FROM</code> = tu email o <code>onboarding@resend.dev</code>`;
        } else {
          replyMsg = `❌ <b>Fallo al enviar correo:</b>\n${escapeHtml(testRes.error || "Error desconocido")}`;
        }

        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text: replyMsg, parse_mode: "HTML" }),
          signal: AbortSignal.timeout(4000)
        }).catch(() => {});

      } else if (command === "/status" || command === "status" || command === "/estado" || command === "estado") {
        const provStatus = env.RESEND_API_KEY ? "✅ Resend (3,000/mes gratis)" : env.BREVO_API_KEY ? "✅ Brevo (300/día gratis)" : "⚠️ Simulado (Falta RESEND_API_KEY)";
        const webhookStatus = env.TELEGRAM_WEBHOOK_SECRET ? "🔒 Protegido con Secret Token" : "⚡ Activo (validación por Chat ID)";
        const statusMsg = `<b>📊 Bvelt Radar Status</b>\n\n<b>Email Outbound:</b> ${provStatus}\n<b>Bot Telegram:</b> ✅ Conectado (${webhookStatus})\n<b>Chat ID:</b> <code>${chatId}</code>\n<b>Plataforma:</b> <a href="https://bvelt.app">https://bvelt.app</a>\n\n<i>Escribe /digest para ver las 3 mejores oportunidades o /testmail tu@correo.com para probar el envío.</i>`;
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text: statusMsg, parse_mode: "HTML" }),
          signal: AbortSignal.timeout(4000)
        }).catch(() => {});

      } else if (command === "/digest" || command === "digest" || command === "/resumen" || command === "resumen") {
        const topOpps = await env.RADAR_DB.prepare(
          "SELECT * FROM prospects WHERE email IS NOT NULL AND status IN ('queued', 'enriched', 'drafted') ORDER BY score DESC LIMIT 3"
        ).all() as any;

        if (topOpps.results && topOpps.results.length > 0) {
          await dispatchInteractiveTelegramAlert(topOpps.results, [], [], env);
        } else {
          await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chatId, text: "🔍 No hay prospectos pendientes en cola en este momento.", parse_mode: "HTML" }),
            signal: AbortSignal.timeout(4000)
          }).catch(() => {});
        }

      } else if (command === "/id" || command === "id" || command === "/chatid" || command === "chatid") {
        const idMsg = `🆔 <b>Tu Telegram Chat ID:</b>\n<code>${chatId}</code>`;
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text: idMsg, parse_mode: "HTML" }),
          signal: AbortSignal.timeout(4000)
        }).catch(() => {});

      } else if (command === "/start" || command === "start" || command === "/help" || command === "help" || command === "/ayuda" || command === "ayuda" || command === "hola" || command === "hi" || command === "hey") {
        const provStatus = env.RESEND_API_KEY ? "✅ Resend Activo" : env.BREVO_API_KEY ? "✅ Brevo Activo" : "⚠️ Simulado (Configura RESEND_API_KEY)";
        const helpMsg = `🤖 <b>Bvelt Radar Founder Bot</b>\n\n¡Bot conectado y listo para interactuar!\n\n<b>Comandos disponibles:</b>\n• /status - Ver cuotas y estado de proveedores\n• /digest - Enviar las 3 mejores oportunidades con botones para aprobar\n• /testmail &lt;correo&gt; - Enviar email de prueba inmediato\n• /id - Ver tu Telegram Chat ID\n• /help - Mostrar este menú\n\n<b>Email Outbound:</b> ${provStatus}`;
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text: helpMsg, parse_mode: "HTML" }),
          signal: AbortSignal.timeout(4000)
        }).catch(() => {});

      } else {
        // Fallback for ANY OTHER free text message so the bot NEVER stays silent
        const snippet = msgText.length > 60 ? msgText.substring(0, 60) + "..." : msgText;
        const fallbackMsg = `🤖 <b>Bvelt Radar Founder Bot</b>\n\nRecibí tu mensaje: <i>"${escapeHtml(snippet)}"</i>\n\n<b>Comandos disponibles:</b>\n• /status - Ver estado del sistema\n• /digest - Ver oportunidades pendientes de aprobación\n• /testmail &lt;correo&gt; - Probar envío de email\n• /help - Ayuda y comandos\n• /id - Ver tu Telegram Chat ID`;
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text: fallbackMsg, parse_mode: "HTML" }),
          signal: AbortSignal.timeout(4000)
        }).catch(() => {});
      }
    }

    return Response.json({ ok: true }, { headers });
  } catch (err: any) {
    console.error("Telegram webhook error: ", err);
    return Response.json({ ok: false, error: err.message }, { status: 200, headers });
  }
}

/**
 * Administrative and learning stats
 */
async function handleStats(env: Env, headers: Record<string, string>): Promise<Response> {
  const db = env.RADAR_DB;

  const prospectStats = await db.prepare(`
    SELECT status, COUNT(*) as count 
    FROM prospects 
    GROUP BY status
  `).all();

  const outcomeStats = await db.prepare(`
    SELECT outcome, COUNT(*) as count 
    FROM prospects 
    WHERE outcome IS NOT NULL 
    GROUP BY outcome
  `).all();

  const totalRuns = await db.prepare(`
    SELECT COUNT(*) as count, SUM(discovered) as total_discovered, SUM(finalized) as total_finalized 
    FROM runs
  `).first();

  const latestRuns = await db.prepare(`
    SELECT * FROM runs ORDER BY created_at DESC LIMIT 5
  `).all();

  const suppressionCount = await db.prepare(`
    SELECT COUNT(*) as count FROM suppression
  `).first();

  // Learning conversion rates (Top winning combinations)
  const learningStats = await getLearningStats(db);

  const today = new Date().toISOString().split('T')[0];
  let budgetRow = await db.prepare("SELECT * FROM daily_budgets WHERE tenant_id = 'founder' AND day = ?").bind(today).first() as any;
  if (!budgetRow) {
    budgetRow = {
      discovery_units: 0,
      enrichment_units: 0,
      ai_units: 0,
      hunter_units: 0,
      outreach_units: 0,
      finalize_units: 0,
    };
  }

  const cb = await db.prepare("SELECT * FROM circuit_breakers WHERE id = 'outreach'").first() as any;
  const circuitBreakerActive = cb ? cb.status === 'open' : false;
  const circuitBreakerReason = cb ? cb.reason : null;

  const globalPause = env.RADAR_GLOBAL_PAUSE === "true" || env.RADAR_GLOBAL_PAUSE === "1";
  const outreachPause = env.RADAR_OUTREACH_PAUSE === "true" || env.RADAR_OUTREACH_PAUSE === "1";

  return Response.json({
    prospects_by_status: prospectStats.results,
    outcomes: outcomeStats.results,
    runs_summary: totalRuns,
    recent_runs: latestRuns.results,
    suppression_list_size: suppressionCount?.count || 0,
    learning_weights: learningStats,
    limits: LIMITS,
    global_pause: globalPause,
    outreach_pause: outreachPause,
    circuit_breaker: circuitBreakerActive,
    circuit_breaker_reason: circuitBreakerReason,
    today: {
      discovery: { used: budgetRow.discovery_units || 0, max: 30 },
      enrichment: { used: budgetRow.enrichment_units || 0, max: 20 },
      AI: { used: budgetRow.ai_units || 0, max: 10 },
      Hunter: { used: budgetRow.hunter_units || 0, max: 8 },
      outreach: { used: budgetRow.outreach_units || 0, max: 3 }
    }
  }, { headers });
}

/**
 * Handle Prospect Decision (sent | discard | suppress) & Record Learning Feedback
 */
async function handleDecision(
  id: string, 
  action: string, 
  notes: string | undefined, 
  env: Env, 
  headers: Record<string, string>
): Promise<Response> {
  const db = env.RADAR_DB;
  
  const prospect = await db.prepare("SELECT * FROM prospects WHERE id = ?").bind(id).first() as any;
  if (!prospect) {
    return Response.json({ error: "Prospect not found." }, { status: 404, headers });
  }

  const timestamp = new Date().toISOString();

  if (action === "sent" || action === "approve") {
    // Mandatory Trust-Stack Governor Firewall Gate Check
    const gate = await verifyTrustStackGate(prospect, 'manual_send', env);
    if (!gate.allowed) {
      await db.prepare(
        "UPDATE prospects SET status = 'hold', outcome = ?, updated_at = ? WHERE id = ?"
      ).bind(gate.reason, timestamp, id).run();

      return Response.json({
        success: false,
        blocked: true,
        status: gate.status,
        reason: gate.reason,
        message: `Send BLOCKED by Trust-Stack Governor Firewall: ${gate.reason}`,
        id
      }, { status: 403, headers });
    }

    // Execute Outbound Email Dispatch
    let dispatchOutcome: any = { success: true, provider: 'simulated', status: 'simulated', messageId: `sim_${id.substring(0, 8)}` };
    if (prospect.email && prospect.email.includes('@')) {
      const draftSubject = prospect.draft_subject || `Bvelt - Pregunta sobre llamadas de clientes (${prospect.name || 'su negocio'})`;
      const draftBody = prospect.draft_body || `Hola equipo de ${prospect.name},\n\n¿Qué ocurre cuando un cliente potencial llama a su negocio mientras están ocupados en obra y no pueden atender el teléfono?\n\nBvelt responde automáticamente por SMS en 15 segundos para no perder ningún trabajo: https://bvelt.app\n\nSaludos,\nEquipo Bvelt\n\nReply STOP to opt out`;

      // Compliance Hard Gate: missing sender postal address MUST block outbound dispatch
      if ((env.RESEND_API_KEY || env.BREVO_API_KEY) && !env.SENDER_POSTAL_ADDRESS?.trim()) {
        return Response.json({
          success: false,
          blocked: true,
          reason: "missing_sender_postal_address"
        }, { status: 400, headers });
      }

      dispatchOutcome = await dispatchEmail({
        to: prospect.email,
        recipientName: prospect.name,
        subject: draftSubject,
        body: draftBody,
        from: env.OUTBOUND_EMAIL_FROM,
        prospectId: prospect.id,
        resendApiKey: env.RESEND_API_KEY,
        brevoApiKey: env.BREVO_API_KEY,
        senderName: env.SENDER_NAME
      });

      if (dispatchOutcome.status === "failed") {
        try {
          await db.prepare(
            "UPDATE prospects SET dispatch_provider = ?, dispatch_status = 'failed', dispatch_error = ?, updated_at = ? WHERE id = ?"
          ).bind(dispatchOutcome.provider, dispatchOutcome.error || null, timestamp, id).run();
        } catch (e) {}

        try {
          await db.prepare(`
            INSERT INTO email_dispatch_logs (id, prospect_id, tenant_id, recipient_email, subject, provider, status, message_id, error_message, payload_preview, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            `disp_${crypto.randomUUID()}`,
            id,
            prospect.tenant_id || 'founder',
            prospect.email,
            prospect.draft_subject || 'Outreach',
            dispatchOutcome.provider,
            'failed',
            dispatchOutcome.messageId || null,
            dispatchOutcome.error || null,
            (prospect.draft_body || '').substring(0, 150),
            timestamp
          ).run();
        } catch (e) {}

        return Response.json({
          success: false,
          id,
          dispatch: {
            status: "failed",
            provider: dispatchOutcome.provider,
            error: dispatchOutcome.error
          }
        }, { status: 502, headers });
      }
    }

    // Update prospect with outcome sent and 21-day cooldown (max 21 days for normal outreach)
    const cooldown21d = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString();
    try {
      await db.prepare(
        "UPDATE prospects SET status = 'sent', outcome = 'sent', last_contact_at = ?, cooldown_until = ?, dispatch_provider = ?, dispatch_message_id = ?, dispatch_status = ?, updated_at = ? WHERE id = ?"
      ).bind(timestamp, cooldown21d, dispatchOutcome.provider, dispatchOutcome.messageId || null, dispatchOutcome.status, timestamp, id).run();
    } catch (e) {
      await db.prepare(
        "UPDATE prospects SET status = 'sent', outcome = 'sent', last_contact_at = ?, cooldown_until = ?, updated_at = ? WHERE id = ?"
      ).bind(timestamp, cooldown21d, timestamp, id).run();
    }

    try {
      if (prospect.email) {
        await db.prepare(`
          INSERT INTO email_dispatch_logs (id, prospect_id, tenant_id, recipient_email, subject, provider, status, message_id, error_message, payload_preview, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          `disp_${crypto.randomUUID()}`,
          id,
          prospect.tenant_id || 'founder',
          prospect.email,
          prospect.draft_subject || 'Outreach',
          dispatchOutcome.provider,
          dispatchOutcome.status,
          dispatchOutcome.messageId || null,
          dispatchOutcome.error || null,
          (prospect.draft_body || '').substring(0, 150),
          timestamp
        ).run();
      }
    } catch (e) {}

    // Auto-suppress email and domain for 21-day cooldown window
    if (prospect.email) {
      await db.prepare("INSERT OR REPLACE INTO suppression (key, reason, created_at) VALUES (?, ?, ?)")
        .bind(prospect.email.toLowerCase(), `Contacted on ${timestamp} (cooldown until ${cooldown21d})`, timestamp).run();
    }
    if (prospect.website) {
      const domain = getDomain(prospect.website);
      if (domain) {
        await db.prepare("INSERT OR REPLACE INTO suppression (key, reason, created_at) VALUES (?, ?, ?)")
          .bind(domain.toLowerCase(), `Contacted on ${timestamp} (cooldown until ${cooldown21d})`, timestamp).run();
      }
    }

    // Increment learning table for city, trade, variant
    await recordLearningEvent(db, prospect.city, prospect.trade, prospect.variant_id, true);

    // Mark seed_businesses as used if matched
    if (prospect.name && prospect.city) {
      try {
        await db.prepare(
          "UPDATE seed_businesses SET used_at = ? WHERE LOWER(name) = LOWER(?) AND LOWER(city) = LOWER(?) AND used_at IS NULL"
        ).bind(timestamp, prospect.name, prospect.city).run();
      } catch (e) {}
    }

    return Response.json({
      success: true,
      message: `Prospect ${id} marked as SENT. Dispatch: ${dispatchOutcome.status} (${dispatchOutcome.provider}). Added to suppression.`,
      dispatch: dispatchOutcome,
      id
    }, { headers });

  } else if (action === "replied" || action === "positive") {
    await db.prepare(
      "UPDATE prospects SET status = 'human_review', outcome = 'positive', response_type = 'positive', updated_at = ? WHERE id = ?"
    ).bind(timestamp, id).run();

    if (prospect.name && prospect.city) {
      try {
        await db.prepare(
          "UPDATE seed_businesses SET used_at = ? WHERE LOWER(name) = LOWER(?) AND LOWER(city) = LOWER(?) AND used_at IS NULL"
        ).bind(timestamp, prospect.name, prospect.city).run();
      } catch (e) {}
    }

    await recordLearningEvent(db, prospect.city, prospect.trade, prospect.variant_id, true, { is_win: true, response_type: 'positive' });

    return Response.json({ success: true, message: `Prospect ${id} marked as REPLIED.`, id }, { headers });

  } else if (action === "demo") {
    await db.prepare(
      "UPDATE prospects SET status = 'human_review', outcome = 'demo_opened', response_type = 'demo', updated_at = ? WHERE id = ?"
    ).bind(timestamp, id).run();

    if (prospect.name && prospect.city) {
      try {
        await db.prepare(
          "UPDATE seed_businesses SET used_at = ? WHERE LOWER(name) = LOWER(?) AND LOWER(city) = LOWER(?) AND used_at IS NULL"
        ).bind(timestamp, prospect.name, prospect.city).run();
      } catch (e) {}
    }

    return Response.json({ success: true, message: `Prospect ${id} marked as DEMO.`, id }, { headers });

  } else if (action === "won" || action === "converted") {
    await db.prepare(
      "UPDATE prospects SET status = 'converted', outcome = 'won', response_type = 'converted', updated_at = ? WHERE id = ?"
    ).bind(timestamp, id).run();

    if (prospect.name && prospect.city) {
      try {
        await db.prepare(
          "UPDATE seed_businesses SET used_at = ? WHERE LOWER(name) = LOWER(?) AND LOWER(city) = LOWER(?) AND used_at IS NULL"
        ).bind(timestamp, prospect.name, prospect.city).run();
      } catch (e) {}
    }

    await recordLearningEvent(db, prospect.city, prospect.trade, prospect.variant_id, true, { is_win: true, response_type: 'converted' });

    return Response.json({ success: true, message: `Prospect ${id} marked as WON/CONVERTED.`, id }, { headers });

  } else if (action === "discard") {
    await db.prepare(
      "UPDATE prospects SET status = 'discarded', outcome = 'rejected', updated_at = ? WHERE id = ?"
    ).bind(timestamp, id).run();
    
    // Add to suppression so this business won't be re-scouted
    const nameCityKey = `${prospect.name.toLowerCase()}_${prospect.city.toLowerCase()}`.replace(/\s+/g, "_");
    await db.prepare("INSERT OR REPLACE INTO suppression (key, reason, created_at) VALUES (?, ?, ?)")
      .bind(nameCityKey, `Discarded on ${timestamp}`, timestamp).run();

    if (prospect.email) {
      await db.prepare("INSERT OR REPLACE INTO suppression (key, reason, created_at) VALUES (?, ?, ?)")
        .bind(prospect.email.toLowerCase(), `Discarded on ${timestamp}`, timestamp).run();
    }
    if (prospect.website) {
      const domain = getDomain(prospect.website);
      if (domain) {
        await db.prepare("INSERT OR REPLACE INTO suppression (key, reason, created_at) VALUES (?, ?, ?)")
          .bind(domain.toLowerCase(), `Discarded on ${timestamp}`, timestamp).run();
      }
    }

    await recordLearningEvent(db, prospect.city, prospect.trade, prospect.variant_id, false);

    return Response.json({ success: true, message: `Prospect ${id} discarded and permanently suppressed.`, id }, { headers });

  } else if (action === "suppress") {
    await db.prepare(
      "UPDATE prospects SET status = 'suppressed', outcome = 'suppressed', updated_at = ? WHERE id = ?"
    ).bind(timestamp, id).run();

    const nameCityKey = `${prospect.name.toLowerCase()}_${prospect.city.toLowerCase()}`.replace(/\s+/g, "_");
    await db.prepare("INSERT OR REPLACE INTO suppression (key, reason, created_at) VALUES (?, ?, ?)")
      .bind(nameCityKey, "Manual suppression decision", timestamp).run();

    if (prospect.email) {
      await db.prepare("INSERT OR REPLACE INTO suppression (key, reason, created_at) VALUES (?, ?, ?)")
        .bind(prospect.email.toLowerCase(), "Manual suppression decision", timestamp).run();
    }
    if (prospect.website) {
      const domain = getDomain(prospect.website);
      if (domain) {
        await db.prepare("INSERT OR REPLACE INTO suppression (key, reason, created_at) VALUES (?, ?, ?)")
          .bind(domain.toLowerCase(), "Manual suppression decision", timestamp).run();
      }
    }

    await recordLearningEvent(db, prospect.city, prospect.trade, prospect.variant_id, false);

    return Response.json({ success: true, message: `Prospect ${id} fully suppressed.`, id }, { headers });
  }

  return Response.json({ error: `Unknown action: ${action}` }, { status: 400, headers });
}

/**
 * Cloudflare Queues Job Dispatcher & Observability Helper
 */
export async function enqueueJob(env: Env, job: RadarJobMessage): Promise<void> {
  const timestamp = new Date().toISOString();
  job.created_at = job.created_at || timestamp;
  job.attempt = job.attempt || 1;

  // Record pending job state in D1 for observability
  try {
    await env.RADAR_DB.prepare(`
      INSERT INTO queue_jobs (job_id, run_id, job_type, attempt, status, payload_json, created_at)
      VALUES (?, ?, ?, ?, 'pending', ?, ?)
      ON CONFLICT(job_id) DO UPDATE SET
        attempt = excluded.attempt,
        status = 'pending',
        payload_json = excluded.payload_json
    `).bind(
      job.job_id,
      job.run_id,
      job.type,
      job.attempt,
      JSON.stringify(job.payload || {}),
      timestamp
    ).run();
  } catch (e) {
    console.warn(`[Queue Observability] Failed to log pending job ${job.job_id}:`, e);
  }

  if (env.RADAR_QUEUE) {
    await env.RADAR_QUEUE.send(job);
  } else {
    // Fallback for environments without Cloudflare Queue binding (e.g. direct execution)
    console.log(`[Queue Direct Fallback] Executing job ${job.type} (${job.job_id}) directly.`);
    await processQueueJob(job, env);
  }
}

export async function recordQueueJobStatus(
  db: D1Database,
  job_id: string,
  run_id: string,
  job_type: string,
  status: 'processing' | 'completed' | 'failed',
  error?: string | null,
  payload?: any
): Promise<void> {
  const timestamp = new Date().toISOString();
  try {
    if (status === 'processing') {
      await db.prepare(`
        INSERT INTO queue_jobs (job_id, run_id, job_type, status, error, payload_json, started_at, created_at)
        VALUES (?, ?, ?, 'processing', ?, ?, ?, ?)
        ON CONFLICT(job_id) DO UPDATE SET
          status = 'processing',
          started_at = excluded.started_at,
          payload_json = COALESCE(excluded.payload_json, queue_jobs.payload_json)
      `).bind(job_id, run_id, job_type, error || null, payload ? JSON.stringify(payload) : null, timestamp, timestamp).run();
    } else {
      await db.prepare(`
        UPDATE queue_jobs
        SET status = ?, error = ?, completed_at = ?
        WHERE job_id = ? AND status != 'completed_zero_prospects'
      `).bind(status, error || null, timestamp, job_id).run();
    }
  } catch (e) {
    console.warn(`[Queue Observability] Failed to update job ${job_id} status ${status}:`, e);
  }
}

/**
 * Main Asynchronous Queue Consumer Router
 */
export async function processQueueJob(job: RadarJobMessage, env: Env): Promise<void> {
  await recordQueueJobStatus(env.RADAR_DB, job.job_id, job.run_id, job.type, 'processing', null, job.payload);

  try {
    switch (job.type) {
      case 'discovery':
        await handleDiscoveryJob(job, env);
        break;
      case 'enrich':
        await handleEnrichJob(job, env);
        break;
      case 'verify':
      case 'score':
        await handleScoreJob(job, env);
        break;
      case 'approve':
        await handleApproveJob(job, env);
        break;
      case 'outreach':
        await handleOutreachJob(job, env);
        break;
      case 'reply_event':
        await handleReplyEventJob(job, env);
        break;
      default:
        console.warn(`[Queue Router] Unknown job type: ${job.type}`);
    }
    await recordQueueJobStatus(env.RADAR_DB, job.job_id, job.run_id, job.type, 'completed');
  } catch (err: any) {
    console.error(`[Queue Router Error] Job [${job.type} / ${job.job_id}] failed:`, err);
    await recordQueueJobStatus(env.RADAR_DB, job.job_id, job.run_id, job.type, 'failed', err.message || String(err));
    throw err;
  }
}

/**
 * Initiates a new autonomous prospecting run and enqueues small discovery jobs
 */
/**
 * Bvelt free-analysis / profile → autonomous tenant.
 * Resolves city from lat/lon or label, maps contractor trade → buyer niches,
 * upserts tenant_config, runs a FAST sync discovery for up to 2 leads,
 * and enqueues a full tenant run in the background.
 */
async function bootstrapBveltTenant(
  env: Env,
  body: any,
  ctx?: ExecutionContext
): Promise<{
  success: boolean;
  tenant_id: string;
  city: string;
  niches: string[];
  run_id: string | null;
  leads: any[];
  message: string;
  source: string;
}> {
  const source = String(body.source || "free_analysis");
  const userTrade = String(body.trade || body.niche || body.industry || "hvac")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_");
  const tenantId =
    String(body.tenant_id || body.user_id || `bvelt_${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, "_") ||
    `bvelt_${Date.now()}`;
  const tenantName = String(body.tenant_name || body.business_name || "Bvelt Client");

  // Resolve location: explicit city > lat/lon > fallback
  let cityLabel = "";
  if (body.city && String(body.city).trim()) {
    const p = findPlace(String(body.city).trim());
    cityLabel = p ? formatPlaceLabel(p) : String(body.city).trim();
  } else if (body.lat != null && body.lon != null) {
    const nearest = findNearestPlace(Number(body.lat), Number(body.lon), 100);
    if (nearest) cityLabel = formatPlaceLabel(nearest);
  }
  if (!cityLabel) {
    cityLabel = "Tampa, FL"; // last-resort so bootstrap never no-ops
  }

  // Contractor trade → who they sell TO (buyer ICP)
  const tradeKey = userTrade.replace(/-/g, "_");
  const niches =
    TENANT_TARGET_MAP[tradeKey] ||
    TENANT_TARGET_MAP[tradeKey.replace(/_/g, " ")] ||
    ["property management", "real estate", "hoa"];
  const primaryNiche = niches[0]; // e.g. property management
  const searchTrade = primaryNiche.toLowerCase().includes("property")
    ? "property management"
    : primaryNiche.toLowerCase().includes("hotel")
      ? "hotel"
      : primaryNiche.toLowerCase().includes("hoa")
        ? "property management"
        : "property management";

  const timestamp = new Date().toISOString();
  await env.RADAR_DB.prepare(`
    INSERT INTO tenant_config (
      tenant_id, tenant_name, industry, niche, subniches_json, services_json, service_areas_json,
      countries_json, regions_json, cities_json, languages_json, icp_description, icp_keywords_json,
      minimum_score, daily_outreach_limit, allowed_markets_json, campaign_goal, messaging_angle, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(tenant_id) DO UPDATE SET
      tenant_name = excluded.tenant_name,
      industry = excluded.industry,
      niche = excluded.niche,
      cities_json = excluded.cities_json,
      icp_description = excluded.icp_description,
      icp_keywords_json = excluded.icp_keywords_json,
      allowed_markets_json = excluded.allowed_markets_json,
      updated_at = excluded.updated_at
  `).bind(
    tenantId,
    tenantName,
    userTrade,
    primaryNiche,
    JSON.stringify(niches.slice(0, 5)),
    JSON.stringify([userTrade]),
    JSON.stringify([cityLabel]),
    JSON.stringify(["US", "CA"]),
    JSON.stringify([]),
    JSON.stringify([cityLabel]),
    JSON.stringify(["en"]),
    `Buyers near ${cityLabel} for a local ${userTrade} operator (auto from Bvelt ${source}).`,
    JSON.stringify(niches),
    45,
    15,
    JSON.stringify(niches),
    "Book jobs from nearby commercial/residential buyers",
    "fast_response_guarantee",
    timestamp,
    timestamp
  ).run();

  // --- FAST PATH: one Overpass/BizData pull, top 2 leads now ---
  const leads: any[] = [];
  try {
    const { businesses } = await fetchLocalBusinessesWithDiagnostics(cityLabel, searchTrade, env);
    const ranked = (businesses || [])
      .filter((b: any) => b && b.name)
      .map((b: any) => {
        const name = String(b.name);
        const isChain = /walmart|home depot|lowes|costco|mcdonald|starbucks|cvs|walgreens/i.test(name);
        let score = 55;
        if (b.phone) score += 10;
        if (b.website && !/facebook|instagram|wixsite/i.test(String(b.website))) score += 8;
        else score += 12; // no web / social only = pain for THEM as buyers still contactable
        if (/property|management|hoa|apartment|realty|real estate|facility/i.test(name)) score += 15;
        if (isChain) score = 15;
        return { ...b, city: b.city || cityLabel, trade: searchTrade, _score: Math.min(100, score) };
      })
      .filter((b: any) => b._score >= 45)
      .sort((a: any, b: any) => b._score - a._score)
      .slice(0, 2);

    for (const b of ranked) {
      const prospectId = crypto.randomUUID();
      const demoToken = crypto.randomUUID().replace(/-/g, "");
      const identityKey = `${String(b.name).toLowerCase()}_${cityLabel.toLowerCase()}`.replace(/\s+/g, "_");
      // Skip if already exists for this tenant
      const exists = await env.RADAR_DB.prepare(
        "SELECT id FROM prospects WHERE identity_key = ? AND COALESCE(tenant_id,'founder') = ? LIMIT 1"
      ).bind(identityKey, tenantId).first();
      if (exists) {
        const existing = await env.RADAR_DB.prepare("SELECT * FROM prospects WHERE id = ?").bind((exists as any).id).first();
        if (existing) {
          leads.push({ ...existing, attack_kit: buildAttackKit(existing) });
        }
        continue;
      }
      await env.RADAR_DB.prepare(`
        INSERT INTO prospects (
          id, mode, tenant_id, name, city, trade, website, phone, email,
          score, signals_json, score_breakdown, variant_id, status, source,
          created_at, updated_at, bvelt_angle, identity_key, demo_token
        ) VALUES (?, 'tenant', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'missed_calls', 'qualified', 'bvelt_bootstrap', ?, ?, 'missed_calls', ?, ?)
      `).bind(
        prospectId,
        tenantId,
        b.name,
        cityLabel,
        searchTrade,
        b.website || null,
        b.phone || null,
        b.email || null,
        b._score,
        JSON.stringify({ bootstrap: true, source }),
        JSON.stringify({ fast_score: b._score, why: "Near you · buyer segment for your trade" }),
        timestamp,
        timestamp,
        identityKey,
        demoToken
      ).run();
      const row = {
        id: prospectId,
        name: b.name,
        city: cityLabel,
        trade: searchTrade,
        website: b.website || null,
        phone: b.phone || null,
        email: b.email || null,
        score: b._score,
        status: "qualified",
        demo_token: demoToken
      };
      leads.push({ ...row, attack_kit: buildAttackKit(row) });
    }
  } catch (e: any) {
    console.warn("[bootstrapBveltTenant] fast discovery error:", e?.message || e);
  }

  // Background full tenant run (more leads over next minutes)
  let runId: string | null = null;
  const runPromise = startProspectingRun(env, "tenant", tenantId, {
    cities: cityLabel,
    trades: searchTrade,
    countries: null,
    languages: null,
    min_score: null
  }, true).then((r) => {
    runId = r.run_id;
    return r;
  }).catch((e) => {
    console.warn("[bootstrapBveltTenant] background run failed:", e);
    return null;
  });
  if (ctx && typeof ctx.waitUntil === "function") {
    ctx.waitUntil(runPromise);
  } else {
    try {
      const r = await runPromise;
      runId = r?.run_id || null;
    } catch { /* ok */ }
  }

  return {
    success: true,
    tenant_id: tenantId,
    city: cityLabel,
    niches,
    run_id: runId,
    leads,
    message:
      leads.length > 0
        ? `Listo: ${leads.length} cliente(s) potencial(es) cerca de ${cityLabel}. Más en camino.`
        : `Tenant listo en ${cityLabel}. Buscando compradores (property/HOA) — revisa /api/bvelt/leads en 1–2 min.`,
    source
  };
}

export async function startProspectingRun(
  env: Env, 
  mode: string, 
  tenantId: string | null,
  overrides?: {
    cities: string | null;
    trades: string | null;
    countries: string | null;
    languages: string | null;
    min_score: string | null;
  },
  force?: boolean
): Promise<{ run_id: string; jobs_enqueued: number; active_cities: string[]; active_trades: string[]; diagnostics: any }> {
  if (env.RADAR_GLOBAL_PAUSE === "true" || env.RADAR_GLOBAL_PAUSE === "1") {
    console.log("[startProspectingRun] RADAR_GLOBAL_PAUSE active. Prospecting run aborted.");
    return {
      run_id: "paused",
      jobs_enqueued: 0,
      active_cities: [],
      active_trades: [],
      diagnostics: { reason: "RADAR_GLOBAL_PAUSE active. Run aborted." }
    };
  }

  const db = env.RADAR_DB;
  const today = new Date().toISOString().split('T')[0];

  const tId = tenantId || "founder";
  if (!force) {
    try {
      const existingRun = await db.prepare("SELECT id, created_at FROM runs WHERE day = ? AND mode = ? AND COALESCE(tenant_id,'founder') = ? ORDER BY created_at DESC LIMIT 1").bind(today, mode, tId).first() as any;
      if (existingRun) {
        const createdAtMs = existingRun.created_at ? new Date(existingRun.created_at).getTime() : 0;
        const diffMs = Date.now() - createdAtMs;
        const fourHoursMs = 4 * 60 * 60 * 1000;
        if (createdAtMs > 0 && diffMs < fourHoursMs) {
          console.log(`[startProspectingRun] Run already exists today for mode ${mode}. Returning existing run ID: ${existingRun.id}`);
          return {
            run_id: existingRun.id,
            jobs_enqueued: 0,
            active_cities: [],
            active_trades: [],
            diagnostics: { reason: "Run already exists today (idempotent skip)." }
          };
        }
      }
    } catch (e) {
      console.error("[startProspectingRun] Error checking duplicate runs:", e);
    }
  }

  const runId = crypto.randomUUID();

  const dayOfYear = getDayOfYear(new Date());
  const { activeCities, activeTrades, pairs } = await getPriorityTargets(dayOfYear, env, mode, tenantId, overrides);

  // Abort early if no valid cities (tenant without config, or empty founder markets)
  if ((!activeCities || activeCities.length === 0) && (!pairs || pairs.length === 0)) {
    const reason = mode === "tenant"
      ? `Tenant "${tId}" no tiene ciudades configuradas. Configura cities_json en Tenant Mode antes de correr el Radar.`
      : "No hay ciudades activas para discovery. Revisa FOUNDING_CITIES.";
    console.warn(`[startProspectingRun] ${reason}`);
    return {
      run_id: "no_cities",
      jobs_enqueued: 0,
      active_cities: [],
      active_trades: activeTrades || [],
      diagnostics: { reason, city: null, trade: null, discovered_raw: 0 }
    };
  }

  // Register run record in D1
  await db.prepare(
    "INSERT INTO runs (id, day, mode, tenant_id, discovered, finalized, ai_calls, hunter_calls, errors_json, created_at) VALUES (?, ?, ?, ?, 0, 0, 0, 0, '[]', ?)"
  ).bind(runId, today, mode, tId, new Date().toISOString()).run();

  let jobsEnqueued = 0;
  const hasOverrides = !!(overrides && (overrides.cities || overrides.trades || overrides.countries || overrides.languages || overrides.min_score));

  // Cap jobs per run to avoid queue flood (max 8 discovery pairs)
  const MAX_JOBS = Math.min(8, Number(env.RADAR_JOBS_PER_RUN || 8));

  if (pairs && pairs.length > 0 && !hasOverrides) {
    for (const pair of pairs.slice(0, MAX_JOBS)) {
      const jobId = `discovery_${runId}_${pair.city.replace(/[^a-z0-9]/gi, '_')}_${pair.trade.replace(/[^a-z0-9]/gi, '_')}`.toLowerCase();
      await enqueueJob(env, {
        run_id: runId,
        job_id: jobId,
        type: 'discovery',
        mode,
        tenant_id: tenantId,
        payload: { city: pair.city, trade: pair.trade, overrides }
      });
      jobsEnqueued++;
    }
  } else {
    // Cartesian product capped
    outer: for (const city of activeCities) {
      for (const trade of activeTrades) {
        if (jobsEnqueued >= MAX_JOBS) break outer;
        const jobId = `discovery_${runId}_${city.replace(/[^a-z0-9]/gi, '_')}_${trade}`.toLowerCase();
        await enqueueJob(env, {
          run_id: runId,
          job_id: jobId,
          type: 'discovery',
          mode,
          tenant_id: tenantId,
          payload: { city, trade, overrides }
        });
        jobsEnqueued++;
      }
    }
  }

  console.log(`[Queue Run Initiated] Run ${runId} enqueued ${jobsEnqueued} discovery jobs for cities=[${activeCities.join(', ')}] trades=[${activeTrades.join(', ')}]`);

  return {
    run_id: runId,
    jobs_enqueued: jobsEnqueued,
    active_cities: activeCities,
    active_trades: activeTrades,
    diagnostics: {
      bizdata_status: (env.ENABLE_BIZDATA === "0" || env.ENABLE_BIZDATA === "false") ? "disabled" : "auto-fallback",
      overpass_status: "ready",
      nominatim_status: "ready",
      discovered_raw: 0,
      filtered: 0,
      reason: `Enqueued ${jobsEnqueued} discovery jobs across ${activeCities.join(', ') || 'pairs'} for ${activeTrades.join(', ')}`
    }
  };
}

export function isNonBusinessEntity(name: string, website: string | undefined, mode: string): boolean {
  if (website) {
    try {
      const parsedUrl = new URL(website.startsWith("http") ? website : `http://${website}`);
      const hostname = parsedUrl.hostname.toLowerCase();
      if (hostname.endsWith(".edu") || hostname.endsWith(".gov")) {
        return true;
      }
    } catch {
      const lowerWeb = website.toLowerCase();
      if (lowerWeb.endsWith(".edu") || lowerWeb.endsWith(".gov") || lowerWeb.includes(".edu/") || lowerWeb.includes(".gov/")) {
        return true;
      }
    }
  }

  if (name) {
    const lowerName = name.toLowerCase();
    const commonPattern = /\b(extension|university|college|school district|county|city of|library|museum|foundation|chamber of commerce)\b/;
    if (commonPattern.test(lowerName)) {
      return true;
    }

    if (mode !== "tenant") {
      const nonTenantPattern = /\b(church|ministry|association|hoa|homeowners)\b/;
      if (nonTenantPattern.test(lowerName)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Classifies businesses using Cloudflare Workers AI (Llama 3.2 3B Instruct)
 */
/**
 * Production D1 may have an older opportunities table (created before title / score columns).
 * CREATE TABLE IF NOT EXISTS does not add missing columns — patch them at runtime.
 */
async function ensureOpportunitiesSchema(db: D1Database): Promise<void> {
  const cols = [
    "title TEXT",
    "strategic_score INTEGER DEFAULT 0",
    "fit_score INTEGER DEFAULT 0",
    "intent_score INTEGER DEFAULT 0",
    "pain_score INTEGER DEFAULT 0",
    "ability_to_pay_score INTEGER DEFAULT 0",
    "contactability_score INTEGER DEFAULT 0",
    "timing_score INTEGER DEFAULT 0",
    "evidence_score INTEGER DEFAULT 0",
    "signal_freshness_score INTEGER DEFAULT 100",
    "expected_value REAL DEFAULT 0",
    "decision_state TEXT DEFAULT 'identified'",
    "why_now_json TEXT DEFAULT '{}'",
    "priority_tier TEXT DEFAULT 'medium'",
    "created_at TEXT",
    "updated_at TEXT",
    "tenant_id TEXT DEFAULT 'founder'",
    "prospect_id TEXT",
  ];
  for (const col of cols) {
    try {
      await db.prepare(`ALTER TABLE opportunities ADD COLUMN ${col}`).run();
    } catch {
      // column already exists — ignore
    }
  }
  // Ensure table exists at all (fresh envs)
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS opportunities (
        id TEXT PRIMARY KEY,
        prospect_id TEXT,
        tenant_id TEXT DEFAULT 'founder',
        title TEXT,
        strategic_score INTEGER DEFAULT 0,
        fit_score INTEGER DEFAULT 0,
        intent_score INTEGER DEFAULT 0,
        pain_score INTEGER DEFAULT 0,
        ability_to_pay_score INTEGER DEFAULT 0,
        contactability_score INTEGER DEFAULT 0,
        timing_score INTEGER DEFAULT 0,
        evidence_score INTEGER DEFAULT 0,
        signal_freshness_score INTEGER DEFAULT 100,
        expected_value REAL DEFAULT 0,
        decision_state TEXT DEFAULT 'identified',
        why_now_json TEXT DEFAULT '{}',
        priority_tier TEXT DEFAULT 'medium',
        created_at TEXT,
        updated_at TEXT
      )
    `).run();
  } catch { /* ok */ }
}

/**
 * Clef-flash: typed decision model on Workers AI (free Neurons).
 * Filters government/university/chain noise without Gemini cost.
 * On any error → allow through (ok:true) so discovery never stalls.
 */
export async function classifyWithClef(
  env: Env,
  name: string,
  website: string | null | undefined,
  trade: string,
  city: string,
  mode: string
): Promise<{ ok: boolean; reason: string }> {
  if (!env.AI || typeof env.AI.run !== "function") {
    return { ok: true, reason: "no_ai_binding" };
  }
  try {
    const response: any = await env.AI.run("@cf/cloudflare/clef-flash", {
      model: "clef-flash",
      state: {
        name: name || "unknown",
        website: website || "n/a",
        trade: trade || "service",
        city: city || "unknown"
      },
      questions: {
        real_local_business: {
          type: "noul",
          instructions:
            "Is `name` a real local business that sells services to the public (not a government office, university, church, association, directory listing, or national chain headquarters)?"
        },
        independent: {
          type: "noul",
          instructions:
            "Is `name` an independent local operator and not a national franchise or big-box chain (Walmart, Home Depot, national brands)?"
        }
      }
    });
    const answers = response?.answers || response;
    const real = Number(answers?.real_local_business?.noul ?? answers?.real_local_business ?? 1);
    const indep = Number(answers?.independent?.noul ?? answers?.independent ?? 1);
    const okReal = real >= 0.35;
    const okIndep = mode === "tenant" ? true : indep >= 0.25;
    if (!okReal || !okIndep) {
      return {
        ok: false,
        reason: `clef reject real=${real.toFixed(2)} indep=${indep.toFixed(2)}`
      };
    }
    return { ok: true, reason: `clef ok real=${real.toFixed(2)} indep=${indep.toFixed(2)}` };
  } catch (e: any) {
    console.warn("[classifyWithClef] fallback allow:", e?.message || e);
    return { ok: true, reason: "clef_error_allow" };
  }
}

export async function classifyWithWorkersAI(
  env: Env,
  name: string,
  website: string | null,
  trade: string
): Promise<{ ok: boolean; reason: string }> {
  if (!env.AI || typeof env.AI.run !== "function") {
    return { ok: true, reason: "no_ai" };
  }

  try {
    const response = await env.AI.run("@cf/meta/llama-3.2-3b-instruct", {
      messages: [
        {
          role: "system",
          content: "Responde SOLO JSON {\"real_local_business\":boolean,\"matches_trade\":boolean,\"reason\":string}. real_local_business=false si es institución pública, universidad, iglesia, asociación, directorio, tienda de cadena o no ofrece servicios al público."
        },
        {
          role: "user",
          content: `Nombre: ${name}\nWeb: ${website || "n/a"}\nOficio buscado: ${trade}`
        }
      ],
      max_tokens: 80
    });

    let rawText = "";
    if (typeof response === "string") {
      rawText = response;
    } else if (response && typeof response.response === "string") {
      rawText = response.response;
    } else if (response && typeof response.result === "string") {
      rawText = response.result;
    } else {
      rawText = JSON.stringify(response);
    }

    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { ok: true, reason: "no_json_match" };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const realLocal = !!parsed.real_local_business;
    const matchesTrade = !!parsed.matches_trade;
    const reason = String(parsed.reason || "");

    return {
      ok: realLocal,
      reason: reason || "ai_classification"
    };
  } catch (e: any) {
    return { ok: true, reason: e.message || "error_open" };
  }
}

/**
 * 1. DISCOVERY JOB: Scrapes directory businesses for 1 city + trade, enqueues enrich jobs
 */
async function handleDiscoveryJob(job: RadarJobMessage, env: Env): Promise<void> {
  const { city, trade, overrides } = job.payload;
  let customOsmTags: string[] | undefined = undefined;
  if (job.mode === "tenant" && job.tenant_id && env.RADAR_DB) {
    const cleanTrade = trade.toLowerCase().trim();
    if (!OVERPASS_TRADE_TAGS[cleanTrade]) {
      try {
        const tcRow = await env.RADAR_DB.prepare(
          "SELECT icp_expansion_json FROM tenant_config WHERE tenant_id = ?"
        ).bind(job.tenant_id).first() as any;
        if (tcRow && tcRow.icp_expansion_json) {
          const expansion = typeof tcRow.icp_expansion_json === "string" 
            ? JSON.parse(tcRow.icp_expansion_json) 
            : tcRow.icp_expansion_json;
          if (expansion && Array.isArray(expansion.segments)) {
            // Find segment matching the trade label (case-insensitive) or collect all valid osm_tags
            const matchingSeg = expansion.segments.find(
              (s: any) => (s.label || "").toLowerCase().trim() === cleanTrade
            );
            if (matchingSeg && Array.isArray(matchingSeg.osm_tags) && matchingSeg.osm_tags.length > 0) {
              customOsmTags = matchingSeg.osm_tags;
            } else {
              // If no exact segment label matches, aggregate osm_tags from segments
              const allSegTags = expansion.segments.flatMap((s: any) => Array.isArray(s.osm_tags) ? s.osm_tags : []);
              if (allSegTags.length > 0) {
                customOsmTags = Array.from(new Set(allSegTags));
              }
            }
          }
        }
      } catch (e) {
        console.warn("[handleDiscoveryJob] Error reading icp_expansion_json from D1:", e);
      }
    }
  }

  const { businesses: scraped, diagnostics } = await fetchLocalBusinessesWithDiagnostics(city, trade, env, customOsmTags);

  if (scraped.length === 0) {
    console.warn(`[Job: discovery] 0 businesses found for ${city} - ${trade}:`, diagnostics.reason);
    if (env.RADAR_DB) {
      try {
        const existingRun = await env.RADAR_DB.prepare("SELECT errors_json FROM runs WHERE id = ?").bind(job.run_id).first() as any;
        let errorsArr: any[] = [];
        if (existingRun && existingRun.errors_json) {
          try { errorsArr = JSON.parse(existingRun.errors_json); } catch (e) {}
        }
        errorsArr.push(diagnostics);
        await env.RADAR_DB.prepare("UPDATE runs SET errors_json = ? WHERE id = ?").bind(JSON.stringify(errorsArr), job.run_id).run();
        
        await env.RADAR_DB.prepare("UPDATE radar_jobs SET status = 'completed_zero_prospects', last_error = ?, updated_at = ? WHERE id = ?")
          .bind(diagnostics.reason, new Date().toISOString(), job.job_id).run();

        await env.RADAR_DB.prepare("UPDATE queue_jobs SET status = 'completed_zero_prospects', error = ?, completed_at = ? WHERE job_id = ?")
          .bind(diagnostics.reason, new Date().toISOString(), job.job_id).run();
      } catch (e) {}
    }

    const place = findPlace(city);
    if (place) {
      await markSearched(env.RADAR_DB, job.tenant_id || "founder", place, trade, {
        candidates: scraped.length,
        qualified: 0
      });
    }

    return;
  }

  const tenantId = job.tenant_id || "founder";
  const remainingBudget = await getRemainingBudget(env.RADAR_DB, tenantId, 'discovery_units');
  if (remainingBudget <= 0) {
    console.log(`[Job: discovery] 0 discovery units available for tenant: ${tenantId}`);
    return;
  }

  const ranked = [...scraped].sort((a, b) => {
    const permitsA = typeof a.permits_90d === 'number' ? a.permits_90d : 0;
    const permitsB = typeof b.permits_90d === 'number' ? b.permits_90d : 0;
    if (permitsB !== permitsA) {
      return permitsB - permitsA;
    }

    const hasPhoneA = a.phone && a.phone.trim().length > 0 ? 1 : 0;
    const hasPhoneB = b.phone && b.phone.trim().length > 0 ? 1 : 0;
    if (hasPhoneB !== hasPhoneA) {
      return hasPhoneB - hasPhoneA;
    }

    const hasRealWebA = a.website && isRealWebsite(a.website) ? 1 : 0;
    const hasRealWebB = b.website && isRealWebsite(b.website) ? 1 : 0;
    if (hasRealWebB !== hasRealWebA) {
      return hasRealWebB - hasRealWebA;
    }

    return 0;
  });

  const perJobCap = 3;
  const bounded = ranked.slice(0, Math.min(remainingBudget, perJobCap));
  let enqueuedEnrich = 0;
  let filteredCount = 0;
  let aiClassifyCalls = 0;

  for (const candidate of bounded) {
    // Atomically reserve a discovery unit before processing the candidate
    const reserved = await reserveBudget(env.RADAR_DB, tenantId, 'discovery_units', 1);
    if (!reserved) {
      console.log(`[Job: discovery] Failed to reserve discovery unit. Budget exhausted for tenant: ${tenantId}`);
      break;
    }

    // Prohibido example.com / datos simulados en producción
    const isMock = (candidate.email && candidate.email.toLowerCase().includes("example.com")) ||
                   (candidate.website && candidate.website.toLowerCase().includes("example.com")) ||
                   (candidate.name && (candidate.name.toLowerCase().includes("test business") || candidate.name.toLowerCase().includes("test contractor")));
    if (isMock || isHardRejectedChain(candidate.name) || isNonBusinessEntity(candidate.name, candidate.website, job.mode)) {
      await releaseBudget(env.RADAR_DB, tenantId, 'discovery_units', 1);
      filteredCount++;
      continue;
    }

    // 1. Hard-rejected chain & non-business entity check
    if (isHardRejectedChain(candidate.name) || isNonBusinessEntity(candidate.name, candidate.website, job.mode)) {
      await releaseBudget(env.RADAR_DB, tenantId, 'discovery_units', 1);
      filteredCount++;
      continue;
    }

    const identityKey = generateIdentityKey(candidate.email, candidate.website, candidate.phone, candidate.name, candidate.city);

    // 2. Composite suppression check
    const suppression = await checkSuppressedComposite(env.RADAR_DB, candidate.email, candidate.website, candidate.phone, candidate.name, candidate.city);
    if (suppression) {
      await releaseBudget(env.RADAR_DB, tenantId, 'discovery_units', 1);
      filteredCount++;
      continue;
    }

    // 3. Duplicate & anti-spam lifecycle check
    const overlap = await findExistingProspectOverlap(env.RADAR_DB, candidate.email, candidate.website, candidate.phone, candidate.name, candidate.city);
    if (overlap) {
      const p = overlap.overlap;
      const status = (p.status || '').toLowerCase();
      const outcome = (p.outcome || '').toLowerCase();

      // Skip if discarded anytime, rejected, suppressed, blocked, or unsubscribed
      if (status === 'discarded' || outcome === 'rejected' || status === 'suppressed' || status === 'blocked' || status === 'unsubscribed') {
        await releaseBudget(env.RADAR_DB, tenantId, 'discovery_units', 1);
        filteredCount++;
        continue;
      }

      // Skip if cooldown_until is active
      if (isCooldownActive(p.cooldown_until)) {
        await releaseBudget(env.RADAR_DB, tenantId, 'discovery_units', 1);
        filteredCount++;
        continue;
      }

      // Skip if sent within 120 days
      if (p.last_contact_at) {
        const contactTime = new Date(p.last_contact_at).getTime();
        const daysSinceContact = (Date.now() - contactTime) / (1000 * 60 * 60 * 24);
        if (daysSinceContact < 120) {
          await releaseBudget(env.RADAR_DB, tenantId, 'discovery_units', 1);
          filteredCount++;
          continue;
        }
      }

      // Skip if already in active funnel (approved, queued, notified, sent, human_review, scored, enriched)
      if (['approved', 'drafted', 'queued', 'notified', 'sent', 'human_review', 'scored', 'enriched'].includes(status)) {
        await releaseBudget(env.RADAR_DB, tenantId, 'discovery_units', 1);
        filteredCount++;
        continue;
      }

      // Skip existing identity to avoid duplicate rows
      await releaseBudget(env.RADAR_DB, tenantId, 'discovery_units', 1);
      filteredCount++;
      continue;
    }

    if (aiClassifyCalls < 25) {
      aiClassifyCalls++;
      let aiCheck = await classifyWithClef(
        env,
        candidate.name,
        candidate.website,
        trade,
        candidate.city || city,
        job.mode || "founder"
      );
      if (aiCheck.reason === "clef_error_allow" || aiCheck.reason === "no_ai_binding") {
        aiCheck = await classifyWithWorkersAI(env, candidate.name, candidate.website, trade);
      }
      if (!aiCheck.ok) {
        await releaseBudget(env.RADAR_DB, tenantId, 'discovery_units', 1);
        filteredCount++;
        continue;
      }
    }

    let signalEvent: string | null = candidate.signal_event || null;
    let signalArea: string | null = candidate.signal_area || null;

    if (!signalEvent && env.FOUNDING_CITIES) {
      try {
        const foundingStr = env.FOUNDING_CITIES;
        const extractedStates = Array.from(new Set(foundingStr.match(/\b[A-Z]{2}\b/g) || ["FL", "TX"]));
        const alerts = await getAlerts(extractedStates);
        const candCity = (candidate.city || "").split(',')[0].trim().toLowerCase();
        const candTrade = (candidate.trade || "").toLowerCase();

        for (const alert of alerts) {
          const areaLower = (alert.areaDesc || "").toLowerCase();
          const cityMatch = candCity && areaLower.includes(candCity);
          const tradeMatch = eventAppliesToTrade(alert.event, candTrade);

          if (cityMatch && tradeMatch) {
            signalEvent = alert.event;
            signalArea = alert.areaDesc;
            break;
          }
        }
      } catch (e) {}
    }

    const prospectId = crypto.randomUUID();
    const demoToken = crypto.randomUUID().replace(/-/g, "");
    const postalCode = candidate.postal_code || candidate.zip || null;
    const initialSignalsJson = JSON.stringify({
      permits_90d: candidate.permits_90d ?? null,
      signals: {}
    });
    await env.RADAR_DB.prepare(`
      INSERT INTO prospects (
        id, mode, tenant_id, name, city, trade, website, phone, email, 
        score, signals_json, score_breakdown, variant_id, status, source, 
        created_at, updated_at, bvelt_angle, identity_key, demo_token, 
        signal_event, signal_area, postal_code
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, '{}', 'missed_calls', 'discovered', ?, ?, ?, 'missed_calls', ?, ?, ?, ?, ?)
    `).bind(
      prospectId,
      job.mode,
      job.tenant_id,
      candidate.name,
      candidate.city,
      candidate.trade,
      candidate.website || null,
      candidate.phone || null,
      candidate.email || null,
      initialSignalsJson,
      candidate.source || 'scraper',
      new Date().toISOString(),
      new Date().toISOString(),
      identityKey,
      demoToken,
      signalEvent,
      signalArea,
      postalCode
    ).run();

    if (candidate.seed_id) {
      try {
        await env.RADAR_DB.prepare("UPDATE seed_businesses SET used_at = ? WHERE id = ?")
          .bind(new Date().toISOString(), candidate.seed_id).run();
      } catch (e) {}
    }

    await enqueueJob(env, {
      run_id: job.run_id,
      job_id: `enrich_${prospectId}`,
      type: 'enrich',
      mode: job.mode,
      tenant_id: job.tenant_id,
      payload: {
        prospect_id: prospectId,
        city: candidate.city,
        trade: candidate.trade,
        name: candidate.name,
        website: candidate.website,
        phone: candidate.phone,
        email: candidate.email,
        source: candidate.source,
        permits_90d: candidate.permits_90d ?? null,
        overrides
      }
    });
    enqueuedEnrich++;
  }

  try {
    diagnostics.discovered_raw = scraped.length;
    diagnostics.filtered = (scraped.length - bounded.length) + filteredCount;
    diagnostics.reason = `Discovered ${scraped.length} raw, ${enqueuedEnrich} enqueued for enrichment, ${diagnostics.filtered} filtered`;

    const existingRun = await env.RADAR_DB.prepare("SELECT errors_json FROM runs WHERE id = ?").bind(job.run_id).first() as any;
    let errorsArr: any[] = [];
    if (existingRun && existingRun.errors_json) {
      try { errorsArr = JSON.parse(existingRun.errors_json); } catch (e) {}
    }
    errorsArr.push(diagnostics);

    await env.RADAR_DB.prepare("UPDATE runs SET discovered = discovered + ?, errors_json = ? WHERE id = ?")
      .bind(enqueuedEnrich, JSON.stringify(errorsArr), job.run_id).run();
  } catch (e) {}

  const place = findPlace(city);
  if (place) {
    await markSearched(env.RADAR_DB, job.tenant_id || "founder", place, trade, {
      candidates: scraped.length,
      qualified: enqueuedEnrich
    });
  }
}

/**
 * 2. ENRICH JOB: Scrapes candidate website HTML, extracts signals, enqueues score job without burning quotas
 */
async function handleEnrichJob(job: RadarJobMessage, env: Env): Promise<void> {
  const { prospect_id, overrides, permits_90d } = job.payload;
  const prospect = await env.RADAR_DB.prepare("SELECT * FROM prospects WHERE id = ?").bind(prospect_id).first() as any;
  if (!prospect) return;

  // Idempotency: skip re-scraping if already enriched or beyond
  if (['enriched', 'scored', 'approved', 'drafted', 'notified', 'sent'].includes(prospect.status)) {
    await enqueueJob(env, {
      run_id: job.run_id,
      job_id: `score_${prospect_id}`,
      type: 'score',
      mode: job.mode,
      tenant_id: job.tenant_id,
      payload: { prospect_id, overrides, permits_90d }
    });
    return;
  }

  let websiteEmail: string | null = null;
  let websitePhone: string | null = prospect.phone || null;
  let signals = {
    contact_form: false,
    quote_request: false,
    booking: false,
    call_cta: false,
    sms_gap: false,
    emergency: false,
    multiple_areas: false,
    specific_landing_pages: false,
    estimate_language: false,
    lead_capture: false
  };

  // Step a: Scrape Website HTML
  const tenantId = job.tenant_id || "founder";
  let enrichmentReserved = false;
  if (prospect.website && isRealWebsite(prospect.website)) {
    enrichmentReserved = await reserveBudget(env.RADAR_DB, tenantId, 'enrichment_units', 1);
    if (enrichmentReserved) {
      try {
        const scrapeResult = await scrapeWebsiteContact(prospect.website);
        if (scrapeResult.email) websiteEmail = scrapeResult.email;
        if (scrapeResult.phone && !websitePhone) websitePhone = scrapeResult.phone;
        if (scrapeResult.signals) signals = scrapeResult.signals as any;
        await commitBudget(env.RADAR_DB, tenantId, 'enrichment_units', 1);
      } catch (e: any) {
        console.warn(`Scraping warning on ${prospect.website}: ${e.message}`);
        await releaseBudget(env.RADAR_DB, tenantId, 'enrichment_units', 1);
      }
    }
  }

  let emailCandidate = prospect.email || websiteEmail;
  const domain = prospect.website && isRealWebsite(prospect.website) ? getDomain(prospect.website) : null;
  let hasValidMx = false;

  // Free Technical Audits: DoH (DMARC/SPF/MX), PageSpeed / Mobile Latency, Open-Meteo Weather
  let dmarcAudit: any = null;
  let webAudit: any = null;
  let weatherAudit: any = null;

  if (domain) {
    try {
      dmarcAudit = await auditDomainSecurityAndMx(domain);
      if (dmarcAudit?.hasCustomMx) hasValidMx = true;
    } catch (e) {}
  }

  if (prospect.website && isRealWebsite(prospect.website)) {
    try {
      webAudit = await auditWebsitePerformance(prospect.website, env.PAGESPEED_API_KEY);
    } catch (e) {}
  }

  if (prospect.city) {
    try {
      weatherAudit = await auditCityWeatherEmergency(prospect.city);
    } catch (e) {}
  }

  // Step b: DNS MX via Cloudflare DNS-over-HTTPS fallback
  if (domain && !hasValidMx) {
    hasValidMx = await checkDomainMxRecords(domain);
  }

  // Step c: Fallback patterns contact@, info@, hello@, office@, admin@ ONLY if MX exists
  if (!emailCandidate && domain && hasValidMx) {
    emailCandidate = `contact@${domain}`;
  }

  // Step d: Hunter Domain Search ONLY if quota available and MX exists
  if (domain && hasValidMx && env.HUNTER_API_KEY) {
    try {
      const reserved = await reserveBudget(env.RADAR_DB, tenantId, 'hunter_units', 1);
      if (reserved) {
        const hunterEmail = await fetchHunterEmail(domain, env.HUNTER_API_KEY);
        if (hunterEmail) {
          emailCandidate = hunterEmail;
          await env.RADAR_DB.prepare("UPDATE runs SET hunter_calls = hunter_calls + 1 WHERE id = ?").bind(job.run_id).run();
          await commitBudget(env.RADAR_DB, tenantId, 'hunter_units', 1);
        } else {
          await releaseBudget(env.RADAR_DB, tenantId, 'hunter_units', 1);
        }
      }
    } catch (e: any) {}
  }

  // Step e: Abstract API verification if key present and candidate exists
  let isEmailValidated = false;
  if (emailCandidate) {
    if (env.ABSTRACT_API_KEY) {
      try {
        const ver = await verifyEmail(emailCandidate, env);
        if (!ver.valid) {
          emailCandidate = null;
        } else {
          isEmailValidated = true;
        }
      } catch (e: any) {
        isEmailValidated = true;
      }
    } else {
      isEmailValidated = true;
    }
  }

  let existingMeta: any = {};
  try {
    existingMeta = JSON.parse(prospect.signals_json || '{}');
  } catch (e) {}
  const effectivePermits = permits_90d ?? existingMeta.permits_90d ?? null;

  const signalMetadata = {
    ...existingMeta,
    scraped_phone: websitePhone,
    scraped_email: emailCandidate,
    is_email_validated: isEmailValidated,
    permits_90d: effectivePermits,
    signals,
    technical_audits: {
      pagespeed_score: webAudit?.mobileScore || null,
      fcp_seconds: webAudit?.fcpSeconds || null,
      latency_ms: webAudit?.latencyMs || null,
      is_slow_mobile: webAudit?.isSlow || false,
      has_dmarc: dmarcAudit?.hasDmarc ?? false,
      has_spf: dmarcAudit?.hasSpf ?? false,
      weather_alert: weatherAudit?.weatherSignal || null
    }
  };

  await env.RADAR_DB.prepare(`
    UPDATE prospects
    SET phone = COALESCE(?, phone), email = COALESCE(?, email), signals_json = ?, status = 'enriched', updated_at = ?
    WHERE id = ?
  `).bind(
    websitePhone,
    emailCandidate,
    JSON.stringify(signalMetadata),
    new Date().toISOString(),
    prospect_id
  ).run();

  try {
    await env.RADAR_DB.prepare(`
      UPDATE prospects
      SET pagespeed_score = ?, dns_has_dmarc = ?, weather_context = ?
      WHERE id = ?
    `).bind(
      webAudit?.mobileScore || null,
      dmarcAudit ? (dmarcAudit.hasDmarc ? 1 : 0) : null,
      weatherAudit?.weatherSignal || null,
      prospect_id
    ).run();
  } catch (e) {}

  await enqueueJob(env, {
    run_id: job.run_id,
    job_id: `score_${prospect_id}`,
    type: 'score',
    mode: job.mode,
    tenant_id: job.tenant_id,
    payload: { prospect_id, overrides, permits_90d: effectivePermits }
  });
}

/**
 * 3. SCORE JOB: Computes 0-100 multi-factor score and Bvelt angle
 */
async function handleScoreJob(job: RadarJobMessage, env: Env): Promise<void> {
  const isTenant = job.mode === "tenant";
  const { prospect_id, overrides, permits_90d: payloadPermits } = job.payload;
  const prospect = await env.RADAR_DB.prepare("SELECT * FROM prospects WHERE id = ?").bind(prospect_id).first() as any;
  if (!prospect) return;

  if (['approved', 'drafted', 'notified', 'sent'].includes(prospect.status)) return;

  const dayOfYear = getDayOfYear(new Date());
  const { missionConfig } = await getPriorityTargets(dayOfYear, env, job.mode, job.tenant_id, overrides, true);
  const learningStats = await getLearningStats(env.RADAR_DB);

  let parsedMeta: any = {};
  try {
    parsedMeta = JSON.parse(prospect.signals_json || '{}');
  } catch (e) {}

  const permits_90d = Number(payloadPermits ?? parsedMeta.permits_90d ?? prospect.permits_90d ?? 0);
  const isPermitsSource = (prospect.source === 'permits' || job.payload.source === 'permits');

  const signals = parsedMeta.signals || {};
  const isEmailValidated = !!parsedMeta.is_email_validated;
  const isPriorityCity = missionConfig.geographies.some(c => c.toLowerCase().includes(prospect.city.split(',')[0].toLowerCase()));
  const isPriorityTrade = missionConfig.niches.includes(prospect.trade.toLowerCase());

  // 1. HARD QUALITY GATE: Immediate hard-reject retail chains
  if (isHardRejectedChain(prospect.name)) {
    console.warn(`[Quality Gate] Hard-rejected retail chain: ${prospect.name}`);
    await env.RADAR_DB.prepare(`
      UPDATE prospects
      SET status = 'blocked', outcome = 'hard_rejected_chain', suppression_reason = 'Retail chain', updated_at = ?
      WHERE id = ?
    `).bind(new Date().toISOString(), prospect_id).run();
    return;
  }

  const { 
    totalScore, 
    breakdown, 
    confidence, 
    evidenceSummary, 
    evidenceItems = [], 
    painHypothesis = {} 
  } = calculateMultiFactorScore(
    prospect,
    prospect.email,
    isEmailValidated,
    prospect.phone,
    isPriorityCity,
    isPriorityTrade,
    learningStats,
    signals,
    missionConfig
  );

  // Generación de etiquetas de señal (incluyendo SMS Gap, Multi-área y Obra activa)
  const signalTags: string[] = [];
  if (isPermitsSource && permits_90d >= 3) {
    signalTags.push(`Obra activa (${permits_90d} permisos/90d)`);
    signals.active_permits = true;
    signals.permits_label = `Obra activa (${permits_90d} permisos/90d)`;
    evidenceItems.unshift({
      signal_type: 'active_permits',
      value: 'detected',
      source_url: 'municipal_permits',
      source_type: 'permit_records',
      observed_at: new Date().toISOString(),
      evidence_text: `Obra activa (${permits_90d} permisos/90d)`,
      confidence: 1.0,
      freshness: 1.0,
      page_type: 'permits'
    });
  }
  if (signals.emergency) signalTags.push("24/7 / Urgencias");
  if (signals.sms_gap) signalTags.push("SMS Gap");
  if (signals.quote_request) signalTags.push("Presupuesto");
  if (signals.booking) signalTags.push("Reserva");
  if (signals.multiple_areas) signalTags.push("Multi-área");
  if (signals.lead_capture) signalTags.push("Captura Leads");
  if (signals.contact_form) signalTags.push("Contacto");

  // Suma 10 puntos si viene de permisos y tiene >= 3 permisos en 90 días (máximo 100)
  let finalScore = totalScore;
  if (isPermitsSource && permits_90d >= 3) {
    finalScore = Math.min(100, finalScore + 10);
    breakdown.active_permits = 10;
  }

  // Tenant: Clef-flash ranks recurring buyers (max 5 AI calls per score job)
  if (isTenant && finalScore >= 35 && env.AI && typeof env.AI.run === "function") {
    const clefCalls = Number((job.payload as any)._clef_calls || 0);
    if (clefCalls < 5) {
      try {
        let tenantNiche = prospect.trade || "services";
        let icp = "";
        if (job.tenant_id) {
          const tc = await env.RADAR_DB.prepare(
            "SELECT niche, icp_description FROM tenant_config WHERE tenant_id = ?"
          ).bind(job.tenant_id).first() as any;
          if (tc?.niche) tenantNiche = tc.niche;
          if (tc?.icp_description) icp = tc.icp_description;
        }
        const response: any = await env.AI.run("@cf/cloudflare/clef-flash", {
          model: "clef-flash",
          state: {
            name: prospect.name,
            website: prospect.website || "n/a",
            city: prospect.city,
            tenant_niche: tenantNiche,
            icp: icp || "n/a"
          },
          questions: {
            buyer: {
              type: "choice",
              instructions: "What type of buyer is `name` for a business that sells `tenant_niche` services?",
              criteria: {
                property_manager: "Manages rental or commercial properties",
                hotel_hospitality: "Hotel, motel or hospitality",
                hoa_condo: "HOA or condo association",
                general_contractor: "General contractor or builder",
                commercial_office: "Commercial or office building",
                other: null
              }
            },
            recurring: {
              type: "score",
              instructions: "How likely is `name` to buy this service repeatedly?",
              criteria: ["Buys once", "Buys occasionally", "Buys recurrently"]
            }
          }
        });
        const answers = response?.answers || response;
        const buyerChoice = String(answers?.buyer?.choice || answers?.buyer || "other");
        const recScore = Number(answers?.recurring?.score ?? answers?.recurring ?? 0);
        const boost = Math.min(20, Math.round((recScore / 2) * 15) + (buyerChoice !== "other" ? 5 : 0));
        finalScore = Math.min(100, finalScore + boost);
        breakdown.clef_buyer = boost;
        if (recScore >= 1.4) signalTags.push("Cuenta recurrente");
        const buyerEs: Record<string, string> = {
          property_manager: "Property Manager",
          hotel_hospitality: "Hotel / Hospitality",
          hoa_condo: "HOA / Condo",
          general_contractor: "General Contractor",
          commercial_office: "Oficina comercial",
          other: "Otro"
        };
        if (buyerChoice && buyerChoice !== "other") {
          signalTags.push(buyerEs[buyerChoice] || buyerChoice);
        }
        (job.payload as any)._clef_calls = clefCalls + 1;
      } catch (e: any) {
        console.warn("[handleScoreJob] tenant Clef skip:", e?.message || e);
      }
    }
  }

  let bveltAngle = "missed_lead_response";
  if (signals.emergency) {
    bveltAngle = "after_hours";
  } else if (signals.sms_gap) {
    bveltAngle = "contact_gap";
  } else if (signals.booking) {
    bveltAngle = "booking_gap";
  } else if (signals.quote_request || signals.estimate_language) {
    bveltAngle = "quote_followup";
  } else if (signals.lead_capture) {
    bveltAngle = "lead_capture_gap";
  } else if (signals.multiple_areas) {
    bveltAngle = "lead_reactivation";
  }

  const variantId = (hashCode(prospect.name + prospect.city) % 2 === 0) ? "missed_calls" : "dormant_leads";
  const evidenceSummaryWithPermits = (isPermitsSource && permits_90d >= 3)
    ? `Obra activa (${permits_90d} permisos/90d); ${evidenceSummary}`
    : evidenceSummary;

  const updatedMeta = {
    ...parsedMeta,
    permits_90d,
    signal_tags: signalTags,
    active_signals: signalTags,
    permits_tag: (isPermitsSource && permits_90d >= 3) ? `Obra activa (${permits_90d} permisos/90d)` : undefined,
    signals,
    is_priority_city: isPriorityCity,
    is_priority_trade: isPriorityTrade,
    variant_id: variantId,
    score_breakdown: breakdown,
    bvelt_angle: bveltAngle,
    confidence,
    evidence_summary: evidenceSummaryWithPermits,
    evidence_json: evidenceItems,
    pain_hypothesis_json: painHypothesis
  };

  // Track demo_created event
  try {
    await env.RADAR_DB.prepare(
      "INSERT INTO prospect_events (prospect_id, event_type, content, created_at) VALUES (?, 'demo_created', ?, ?)"
    ).bind(prospect_id, "Personalized demo token generated based on structured evidence", new Date().toISOString()).run();
  } catch (e) {}

  const strat = calculateStrategicScores(
    prospect,
    prospect.email,
    isEmailValidated,
    prospect.phone,
    isPriorityCity,
    isPriorityTrade,
    learningStats,
    signals,
    missionConfig
  );

  // Determine commercial value band based on total score
  const valueBand = finalScore >= 80 ? "premium" : finalScore >= 60 ? "high" : finalScore >= 45 ? "medium" : "low";

  // Contactable = email OR phone (WhatsApp-first businesses are real leads)
  const contactable = !!(prospect.email || prospect.phone);
  const minScoreGate = isTenant
    ? (Number(overrides?.min_score) || Number(missionConfig?.min_score) || 40)
    : 45;
  const isDisqualified = finalScore < minScoreGate || !contactable;

  if (isDisqualified) {
    await env.RADAR_DB.prepare(`
      UPDATE prospects
      SET score = ?, opportunity_score = ?, confidence_score = ?, evidence_json = ?, commercial_value_band = ?, pain_hypothesis_json = ?, signals_json = ?, score_breakdown = ?, variant_id = ?, bvelt_angle = ?,
          fit_score = ?, intent_score = ?, pain_score = ?, ability_to_pay_score = ?, contactability_score = ?, timing_score = ?, evidence_score = ?, signal_freshness_score = ?, expected_value = ?, decision_state = 'disqualified', why_now_json = ?,
          status = 'disqualified', outcome = 'low_score_or_no_email', updated_at = ?
      WHERE id = ?
    `).bind(
      finalScore,
      finalScore,
      confidence,
      JSON.stringify(evidenceItems),
      valueBand,
      JSON.stringify(painHypothesis),
      JSON.stringify(updatedMeta),
      JSON.stringify(breakdown),
      variantId,
      bveltAngle,
      strat.fit_score,
      strat.intent_score,
      strat.pain_score,
      strat.ability_to_pay_score,
      strat.contactability_score,
      strat.timing_score,
      strat.evidence_score,
      strat.signal_freshness_score,
      strat.expected_value,
      strat.why_now_json,
      new Date().toISOString(),
      prospect_id
    ).run();
    return;
  }

  await env.RADAR_DB.prepare(`
    UPDATE prospects
    SET score = ?, opportunity_score = ?, confidence_score = ?, evidence_json = ?, commercial_value_band = ?, pain_hypothesis_json = ?, signals_json = ?, score_breakdown = ?, variant_id = ?, bvelt_angle = ?,
        fit_score = ?, intent_score = ?, pain_score = ?, ability_to_pay_score = ?, contactability_score = ?, timing_score = ?, evidence_score = ?, signal_freshness_score = ?, expected_value = ?, decision_state = ?, why_now_json = ?,
        status = 'scored', updated_at = ?
    WHERE id = ?
  `).bind(
    finalScore,
    finalScore,
    confidence,
    JSON.stringify(evidenceItems),
    valueBand,
    JSON.stringify(painHypothesis),
    JSON.stringify(updatedMeta),
    JSON.stringify(breakdown),
    variantId,
    bveltAngle,
    strat.fit_score,
    strat.intent_score,
    strat.pain_score,
    strat.ability_to_pay_score,
    strat.contactability_score,
    strat.timing_score,
    strat.evidence_score,
    strat.signal_freshness_score,
    strat.expected_value,
    strat.decision_state,
    strat.why_now_json,
    new Date().toISOString(),
    prospect_id
  ).run();

  // Opportunity Intelligence — core row first (signals/actions never block the opportunity)
  try {
    await ensureOpportunitiesSchema(env.RADAR_DB);
    const oppId = `opp_${prospect_id}`;
    const tenantId = job.tenant_id || prospect.tenant_id || "founder";
    const title = `${prospect.name} — ${prospect.trade} (${prospect.city})`;
    const nowIso = new Date().toISOString();
    const stratScore = Math.round(strat.strategic_score || finalScore || 50);
    const priority = strat.priority_tier || (stratScore >= 80 ? "high" : stratScore >= 55 ? "medium" : "low");

    await env.RADAR_DB.prepare(`
      INSERT INTO opportunities (
        id, prospect_id, tenant_id, title, strategic_score, fit_score, intent_score,
        pain_score, ability_to_pay_score, contactability_score, timing_score,
        evidence_score, signal_freshness_score, expected_value, decision_state,
        why_now_json, priority_tier, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        strategic_score = excluded.strategic_score,
        fit_score = excluded.fit_score,
        intent_score = excluded.intent_score,
        pain_score = excluded.pain_score,
        ability_to_pay_score = excluded.ability_to_pay_score,
        contactability_score = excluded.contactability_score,
        timing_score = excluded.timing_score,
        evidence_score = excluded.evidence_score,
        signal_freshness_score = excluded.signal_freshness_score,
        expected_value = excluded.expected_value,
        decision_state = excluded.decision_state,
        why_now_json = excluded.why_now_json,
        priority_tier = excluded.priority_tier,
        updated_at = excluded.updated_at
    `).bind(
      oppId, prospect_id, tenantId, title,
      stratScore, strat.fit_score || stratScore, strat.intent_score || Math.round(stratScore * 0.8),
      strat.pain_score || Math.round(stratScore * 0.7), strat.ability_to_pay_score || 60,
      strat.contactability_score || 70, strat.timing_score || 50,
      strat.evidence_score || 50, strat.signal_freshness_score || 80,
      strat.expected_value || finalScore || 0, strat.decision_state || "identified",
      strat.why_now_json || JSON.stringify({ signals: signalTags }),
      priority, nowIso, nowIso
    ).run();

    try {
      for (const fact of (strat.why_now?.distinctions?.observed_facts || []).slice(0, 5)) {
        const sigId = `sig_${crypto.randomUUID().replace(/-/g, "")}`;
        await env.RADAR_DB.prepare(`
          INSERT INTO opportunity_signals (
            id, opportunity_id, signal_type, observed_evidence, inferred_reasoning,
            confidence, freshness_score, observed_at, created_at
          ) VALUES (?, ?, 'observed_signal', ?, ?, 0.85, ?, ?, ?)
        `).bind(
          sigId, oppId, fact,
          strat.why_now?.distinctions?.inferences?.[0] || null,
          strat.signal_freshness_score || 80, nowIso, nowIso
        ).run();
      }
      const actionId = `act_${crypto.randomUUID().replace(/-/g, "")}`;
      await env.RADAR_DB.prepare(`
        INSERT INTO opportunity_actions (
          id, opportunity_id, action_type, status, details_json, proposed_at, executed_at
        ) VALUES (?, ?, 'outreach_draft', 'proposed', ?, ?, NULL)
      `).bind(
        actionId, oppId,
        JSON.stringify({ recommended: strat.why_now?.recommended_action || "Contact", angle: bveltAngle }),
        nowIso
      ).run();
    } catch (inner) {
      console.warn("[Opportunity Intelligence] signals/actions optional fail:", inner);
    }
  } catch (e) {
    console.warn("[Opportunity Intelligence] Error registering opportunity:", e);
  }

  // Increment qualified_count for today's daily mission
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const tenantKey = (job.mode === "tenant" && job.tenant_id) ? job.tenant_id : "founder";
    await env.RADAR_DB.prepare("UPDATE daily_missions SET qualified_count = qualified_count + 1 WHERE tenant_id = ? AND day = ?").bind(tenantKey, todayStr).run();
  } catch (e) {}

  if (isTenant) {
    await env.RADAR_DB.prepare("UPDATE prospects SET status = 'qualified' WHERE id = ?").bind(prospect_id).run();
    return;
  }

  // --- HOT LEAD INTERRUPT TRIGGERS ---
  const detectedCount = evidenceItems.filter((e: any) => e.value === 'detected').length;
  // Bvelt Fit Score
  const tradeLower = (prospect.trade || "").toLowerCase();
  const isPreferred = PREFERRED_TRADES.has(tradeLower) || /hvac|plumb|electr|roof|lawn|landscap|pool|clean|handyman/i.test(tradeLower);
  const bveltFitScore = isPreferred ? 15 : 0;

  const isHotLead = (totalScore >= 90 && confidence >= 80) || 
    (detectedCount >= 3 && !!prospect.signal_event && bveltFitScore >= 15);

  if (isHotLead && prospect.email) {
    try {
      const alreadyAlerted = await env.RADAR_DB.prepare(
        "SELECT COUNT(*) as c FROM prospect_events WHERE prospect_id = ? AND event_type = 'hot_lead_alert_sent'"
      ).bind(prospect_id).first() as any;

      if (!alreadyAlerted || alreadyAlerted.c === 0) {
        await env.RADAR_DB.prepare(
          "INSERT INTO prospect_events (prospect_id, event_type, content, created_at) VALUES (?, 'hot_lead_alert_sent', ?, ?)"
        ).bind(prospect_id, "Hot lead Telegram notification sent", new Date().toISOString()).run();

        const demoLink = prospect.demo_token 
          ? `https://bvelt.app/demo?p=${prospect.demo_token}`
          : "https://bvelt.app/demo";

        const hotMsg = `🔥 <b>BVELT HOT OPPORTUNITY</b>\n\n` +
          `🏢 <b>Business:</b> ${escapeHtml(prospect.name)}\n` +
          `📍 <b>Market:</b> ${escapeHtml(prospect.city)}\n` +
          `🛠 <b>Trade:</b> ${escapeHtml(prospect.trade)}\n\n` +
          `📊 <b>Score:</b> <b>${finalScore}/100</b>\n` +
          `🎯 <b>Confidence:</b> <b>${confidence}%</b>\n\n` +
          `⚡ <b>Why Now:</b>\n` +
          (prospect.signal_event ? `• Severe weather event active: ${escapeHtml(prospect.signal_event)}\n` : "") +
          (signals.sms_gap ? `• Active mobile visitors drop-off detected (no SMS support)\n` : "") +
          `• High-converting contractor profile match\n\n` +
          `🔎 <b>Evidence:</b>\n` +
          (evidenceSummary ? `• ${escapeHtml(evidenceSummary)}\n` : "• Standard verified active presence\n") +
          `• Smart crawl completed across up to 5 same-domain pages\n\n` +
          `💡 <b>Recommended Angle:</b>\n` +
          `• ${escapeHtml(bveltAngle.replace(/_/g, " "))}\n\n` +
          `🔗 <b>Personalized Demo Link:</b>\n` +
          `<a href="${demoLink}">${demoLink}</a>`;

        await notifyFounder(env, hotMsg).catch(() => {});
      }
    } catch (e) {
      console.warn("Error triggering Hot Lead alert:", e);
    }
  }

  // Rule: "Pending approve" / QUEUED / HOLD only if: score >= 45 AND email present AND not hard-rejected
  if (finalScore >= 45 && prospect.email && !isHardRejectedChain(prospect.name)) {
    await enqueueJob(env, {
      run_id: job.run_id,
      job_id: `approve_${prospect_id}`,
      type: 'approve',
      mode: job.mode,
      tenant_id: job.tenant_id,
      payload: { prospect_id, overrides }
    });
  }
}

/**
 * 4. APPROVE JOB: Evaluates target threshold and enqueues outreach
 */
async function handleApproveJob(job: RadarJobMessage, env: Env): Promise<void> {
  if (job.mode === "tenant") return;
  const { prospect_id, overrides } = job.payload;
  const prospect = await env.RADAR_DB.prepare("SELECT * FROM prospects WHERE id = ?").bind(prospect_id).first() as any;
  if (!prospect) return;

  if (isHardRejectedChain(prospect.name)) {
    await env.RADAR_DB.prepare("UPDATE prospects SET status = 'blocked', outcome = 'hard_rejected_chain', updated_at = ? WHERE id = ?")
      .bind(new Date().toISOString(), prospect_id).run();
    return;
  }

  // Quality gate check: score >= 45 and email must be present
  if ((prospect.score || 0) < 45 || !prospect.email) {
    await env.RADAR_DB.prepare("UPDATE prospects SET status = 'disqualified', outcome = 'low_score_or_no_email', updated_at = ? WHERE id = ?")
      .bind(new Date().toISOString(), prospect_id).run();
    return;
  }

  if (['approved', 'drafted', 'queued', 'notified', 'sent'].includes(prospect.status)) return;

  await env.RADAR_DB.prepare(`
    UPDATE prospects SET status = 'approved', updated_at = ? WHERE id = ?
  `).bind(new Date().toISOString(), prospect_id).run();

  await enqueueJob(env, {
    run_id: job.run_id,
    job_id: `outreach_${prospect_id}`,
    type: 'outreach',
    mode: job.mode,
    tenant_id: job.tenant_id,
    payload: { prospect_id, overrides }
  });
}

/**
 * 5. OUTREACH JOB: Generates AI copywriting draft and dispatches Telegram notification
 */
async function handleOutreachJob(job: RadarJobMessage, env: Env): Promise<void> {
  if (job.mode === "tenant") return;
  const { prospect_id, overrides } = job.payload;
  const prospect = await env.RADAR_DB.prepare("SELECT * FROM prospects WHERE id = ?").bind(prospect_id).first() as any;
  if (!prospect) return;

  if (isHardRejectedChain(prospect.name)) {
    await env.RADAR_DB.prepare("UPDATE prospects SET status = 'blocked', outcome = 'hard_rejected_chain', updated_at = ? WHERE id = ?")
      .bind(new Date().toISOString(), prospect_id).run();
    return;
  }

  // Quality gate check
  if ((prospect.score || 0) < 45 || !prospect.email) {
    return;
  }

  if (prospect.draft_body && ['queued', 'notified', 'sent'].includes(prospect.status)) return;

  const dayOfYear = getDayOfYear(new Date());
  const { missionConfig } = await getPriorityTargets(dayOfYear, env, job.mode, job.tenant_id, overrides, true);
  const primaryLanguage = (missionConfig.languages && missionConfig.languages[0]) || "en";

  const tenantId = job.tenant_id || "founder";
  const finalizeReserved = await reserveBudget(env.RADAR_DB, tenantId, 'finalize_units', 1);
  if (!finalizeReserved) {
    console.warn(`[Outreach Job] Budget exceeded for finalize_units for tenant: ${tenantId}`);
    return;
  }

  let draft: { subject: string; body: string };
  try {
    draft = await generateAICopy(prospect, prospect.variant_id || 'missed_calls', env, missionConfig);
    const lowerSub = (draft.subject || "").trim().toLowerCase();
    if (lowerSub.startsWith("re:") || lowerSub.startsWith("fwd:")) {
      throw new Error(`Subject rejected: Prohibited prefix detected ("${draft.subject}")`);
    }
  } catch (e: any) {
    console.warn(`[Copy/Subject Cascade Fallback] AI generation failed or rejected: ${e.message}`);
    draft = getTradePsychologyFallback(prospect.name, prospect.trade, prospect.city, prospect.variant_id || 'missed_calls', primaryLanguage, prospect.phone, prospect.demo_token);
  }

  // Unconditionally strip "Re:" or "Fwd:" prefixes from draft.subject
  if (draft.subject.toLowerCase().trim().startsWith("re:") || draft.subject.toLowerCase().trim().startsWith("fwd:")) {
    draft.subject = draft.subject.replace(/^(re:|fwd:)\s*/i, "").trim();
  }

  // Strip any old legacy generic footer and append buildLegalFooter
  draft.body = draft.body.replace(/\n\nReply STOP to opt out/gi, "").replace(/Reply STOP to opt out/gi, "").trim();
  draft.body = draft.body + "\n\n" + buildLegalFooter(env);

  prospect.draft_subject = draft.subject;
  prospect.draft_body = draft.body;

  try {
    await env.RADAR_DB.prepare("UPDATE runs SET finalized = finalized + 1 WHERE id = ?").bind(job.run_id).run();
  } catch (e) {}

  // Trust-Stack Governor Gate Check IMMEDIATELY BEFORE SENDING/DISPATCHING
  const gate = await verifyTrustStackGate(prospect, job.run_id, env);
  if (!gate.allowed) {
    console.warn(`[Outreach Gate Blocked] Prospect ${prospect.name} (${prospect_id}) blocked by Trust-Stack Governor: ${gate.reason}`);
    await env.RADAR_DB.prepare(
      "UPDATE prospects SET draft_subject = ?, draft_body = ?, status = 'hold', outcome = ?, updated_at = ? WHERE id = ?"
    ).bind(draft.subject, draft.body, gate.reason, new Date().toISOString(), prospect_id).run();

    // Notify founder that prospect is in HOLD state ("ready for founder")
    const holdMsg = formatProspectTelegramMessage({ ...prospect, status: 'hold' }, env) +
      `\n\n⚠️ <b>Estado:</b> EN ESPERA (HOLD) - ${escapeHtml(gate.reason)}`;
    const inlineButtons = [
      [
        { text: "✅ Approve", callback_data: `approve:${prospect_id}` },
        { text: "❌ Discard", callback_data: `discard:${prospect_id}` }
      ]
    ];
    await notifyFounder(env, holdMsg, inlineButtons);
    return; // DO NOT SEND / DO NOT DISPATCH!
  }

  // Only ELITE can qualify for automatic founder outreach
  const isElite = (prospect.opportunity_score >= 80 && prospect.confidence_score >= 75) || 
    (!prospect.opportunity_score && (prospect.score || 0) >= 80);
  const isAutoOutreachEnabled = job.mode === 'founder' && String(env.FOUNDER_AUTO_OUTREACH).toLowerCase() === 'true' && isElite;

  const todayDate = new Date().toISOString().split('T')[0];
  const idempotencyKey = `idempotency:${prospect.id}:${(prospect.email || '').toLowerCase().trim()}:${todayDate}`;

  // Idempotency check: If already sent today or in D1
  if (prospect.status === 'sent') {
    console.log(`[Outreach Idempotency] Prospect ${prospect.id} (${prospect.email}) is already sent. Marking already_sent.`);
    try {
      await env.RADAR_DB.prepare(
        "INSERT OR IGNORE INTO outreach_idempotency (idempotency_key, prospect_id, email, status, created_at, updated_at) VALUES (?, ?, ?, 'already_sent', ?, ?)"
      ).bind(idempotencyKey, prospect.id, prospect.email || '', new Date().toISOString(), new Date().toISOString()).run();
    } catch (e) {}
    return;
  }

  if (isAutoOutreachEnabled) {
    const timestamp = new Date().toISOString();
    let slotReserved = false;
    let sendsTodayCount = 1;

    try {
      // Ensure sender governor state is reset for today if needed
      await checkSenderGovernor(env);

      // Atomic D1 slot check & reservation (enforces MAX_AUTO_OUTREACH_PER_DAY = 5)
      const updateRes = await env.RADAR_DB.prepare(`
        UPDATE sender_governor_state
        SET sends_today = sends_today + 1, updated_at = ?
        WHERE id = 'global_governor' AND sends_today < 5 AND status = 'active' AND last_reset_day = ?
      `).bind(timestamp, todayDate).run() as any;

      if (updateRes && updateRes.meta && updateRes.meta.changes > 0) {
        slotReserved = true;
        const govState = await env.RADAR_DB.prepare("SELECT sends_today FROM sender_governor_state WHERE id = 'global_governor'").first() as any;
        sendsTodayCount = govState?.sends_today || 1;

        // Reserve idempotency key in D1
        await env.RADAR_DB.prepare(`
          INSERT OR REPLACE INTO outreach_idempotency (idempotency_key, prospect_id, email, status, created_at, updated_at)
          VALUES (?, ?, ?, 'reserved', ?, ?)
        `).bind(idempotencyKey, prospect.id, prospect.email || '', timestamp, timestamp).run();
      }
    } catch (e) {
      console.warn("[Auto-Outreach Governor Slot] Error attempting atomic reservation:", e);
    }

    if (slotReserved) {
      // Execute automatic send
      const sendRes = await sendOrQueueOutreach({ ...prospect, draft_subject: draft.subject, draft_body: draft.body }, job.run_id, env);

      if (sendRes.success) {
        // Update idempotency state to sent
        try {
          await env.RADAR_DB.prepare(
            "UPDATE outreach_idempotency SET status = 'sent', updated_at = ? WHERE idempotency_key = ?"
          ).bind(new Date().toISOString(), idempotencyKey).run();
        } catch (e) {}

         const autoSentMsg = formatProspectTelegramMessage({ ...prospect, draft_subject: draft.subject, draft_body: draft.body, status: 'sent' }, env) +
          `\n\n⚡ <b>AUTO-SENT (${sendsTodayCount}/5)</b>\n📅 <b>Time:</b> <code>${new Date().toISOString()}</code>\n<i>Outreach enviado automáticamente por Founder Auto-Outreach.</i>`;

        // Notify Telegram AFTER send WITHOUT requiring approval buttons
        await notifyFounder(env, autoSentMsg);
        return;
      } else {
        console.warn(`[Auto-Outreach] Send blocked or failed: ${sendRes.reason}`);
        // Release the reserved slot in sender governor since the actual send failed or was blocked
        try {
          await env.RADAR_DB.prepare(`
            UPDATE sender_governor_state
            SET sends_today = sends_today - 1, updated_at = ?
            WHERE id = 'global_governor' AND sends_today > 0 AND last_reset_day = ?
          `).bind(new Date().toISOString(), todayDate).run();
        } catch (govErr) {
          console.warn("[Auto-Outreach] Error releasing sender governor slot:", govErr);
        }

        await env.RADAR_DB.prepare(
          "UPDATE prospects SET status = 'hold', outcome = ?, updated_at = ? WHERE id = ?"
        ).bind(sendRes.reason, new Date().toISOString(), prospect.id).run();
        return;
      }
    } else {
      console.log(`[Auto-Outreach] Daily auto outreach limit (5) reached or slot unavailable. Falling back to interactive approval queue.`);
    }
  }

  // Fallback / Interactive Approval Flow (when FOUNDER_AUTO_OUTREACH is false or cap reached)
  await env.RADAR_DB.prepare(`
    UPDATE prospects
    SET draft_subject = ?, draft_body = ?, status = 'queued', updated_at = ?
    WHERE id = ?
  `).bind(draft.subject, draft.body, new Date().toISOString(), prospect_id).run();

  const actionableMsg = formatProspectTelegramMessage({ ...prospect, status: 'queued' }, env);
  const inlineButtons = [
    [
      { text: "✅ Approve", callback_data: `approve:${prospect_id}` },
      { text: "❌ Discard", callback_data: `discard:${prospect_id}` }
    ]
  ];

  await notifyFounder(env, actionableMsg, inlineButtons);
}

/**
 * 6. REPLY / EVENT PROCESSING JOB & CLASSIFICATION ENGINE
 */
export type ReplyClassificationType = 
  | 'sent'
  | 'delivered'
  | 'bounced'
  | 'replied'
  | 'positive'
  | 'negative'
  | 'question'
  | 'not_now'
  | 'unsubscribe'
  | 'out_of_office'
  | 'unknown';

export function classifyReplyText(rawType?: string, content?: string): ReplyClassificationType {
  const typeLower = (rawType || '').toLowerCase().trim();
  
  if (typeLower === 'sent') return 'sent';
  if (typeLower === 'delivered') return 'delivered';
  if (typeLower === 'bounced' || typeLower === 'bounce' || typeLower === 'hard_bounce' || typeLower === 'soft_bounce') return 'bounced';
  if (typeLower === 'unsubscribe' || typeLower === 'stop' || typeLower === 'opt_out') return 'unsubscribe';
  if (typeLower === 'out_of_office' || typeLower === 'ooo' || typeLower === 'vacation') return 'out_of_office';
  if (typeLower === 'not_now' || typeLower === 'later') return 'not_now';
  if (typeLower === 'positive' || typeLower === 'interested') return 'positive';
  if (typeLower === 'question' || typeLower === 'inquiry') return 'question';
  if (typeLower === 'negative' || typeLower === 'not_interested') return 'negative';

  if (!content || !content.trim()) {
    if (typeLower === 'replied' || typeLower === 'reply' || typeLower === 'email_reply') {
      return 'replied';
    }
    return 'unknown';
  }

  const text = content.toLowerCase();

  // 1. Unsubscribe / Stop
  if (
    /unsubscribe|darse de baja|opt out|opt-out|cancelar suscripcion|no me escribas|remover|remove me|stop emailing|don't email|do not email|take me off/i.test(text) ||
    /^(stop|unsubscribe|baja)$/i.test(text.trim())
  ) {
    return 'unsubscribe';
  }

  // 2. Out of Office
  if (
    /out of office|automatic reply|respuesta automatica|de vacaciones|fuera de la oficina|auto-reply|ooo|on leave|back in office/i.test(text)
  ) {
    return 'out_of_office';
  }

  // 3. Not Now / Later
  if (
    /not now|next month|next quarter|next year|busy right now|check back|reach out in|contact me in|ahora no|el proximo mes|mas adelante|en unos meses|llamame en/i.test(text)
  ) {
    return 'not_now';
  }

  // 4. Question / Inquiry
  if (
    /how much|what is|price|pricing|cost|how does it work|tell me more|details|cuanto|que es|precio|como funciona|detalles|donde|where/i.test(text) ||
    /\?/i.test(text)
  ) {
    return 'question';
  }

  // 5. Positive / Interested
  if (
    /interested|sounds good|let's talk|demo|call me|yes|sure|book a time|send info|me interesa|si|informacion|me gustaria|agenda|reunion|llamada|interesado/i.test(text)
  ) {
    return 'positive';
  }

  // 6. Negative / Not Interested
  if (
    /not interested|no thanks|no thank you|no nos interesa|no gracias|don't bother|spam|no me interesa|pasamos|wrong person/i.test(text)
  ) {
    return 'negative';
  }

  return 'replied';
}

export async function handleProspectEvent(
  params: {
    prospect_id?: string | null;
    email?: string | null;
    event_type: string;
    content?: string | null;
  },
  env: Env
): Promise<{ success: boolean; prospect_id: string; classification: ReplyClassificationType; auto_stopped: boolean; message: string }> {
  const db = env.RADAR_DB;
  const timestamp = new Date().toISOString();

  let prospect: any = null;
  if (params.prospect_id) {
    prospect = await db.prepare("SELECT * FROM prospects WHERE id = ?").bind(params.prospect_id).first();
  }
  if (!prospect && params.email) {
    prospect = await db.prepare("SELECT * FROM prospects WHERE email = ?").bind(params.email.toLowerCase().trim()).first();
  }

  if (!prospect) {
    return {
      success: false,
      prospect_id: params.prospect_id || "unknown",
      classification: "unknown",
      auto_stopped: false,
      message: "Prospect not found for event."
    };
  }

  const classification = classifyReplyText(params.event_type, params.content || undefined);

  // Record event log in prospect_events
  const eventId = crypto.randomUUID();
  try {
    await db.prepare(`
      INSERT INTO prospect_events (id, prospect_id, event_type, response_type, content, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(eventId, prospect.id, params.event_type, classification, params.content || null, timestamp).run();
  } catch (e) {
    console.warn("Failed to insert prospect_events:", e);
  }

  let autoStopped = false;
  let newStatus = prospect.status;
  let newOutcome = prospect.outcome || classification;
  let cooldownUntil: string | null = prospect.cooldown_until || null;

  switch (classification) {
    case 'sent':
      newStatus = 'sent';
      newOutcome = 'sent';
      break;

    case 'delivered':
      newStatus = 'delivered';
      newOutcome = 'delivered';
      break;

    case 'bounced':
      autoStopped = true;
      newStatus = 'bounced';
      newOutcome = 'bounced';
      await recordNegativeSignal(db, 'bounce', `Bounced email for ${prospect.name}`);
      if (prospect.email) {
        await db.prepare("INSERT OR REPLACE INTO suppression (key, reason, created_at) VALUES (?, ?, ?)")
          .bind(prospect.email.toLowerCase(), `Bounced on ${timestamp}`, timestamp).run();
      }
      break;

    case 'unsubscribe':
      autoStopped = true;
      newStatus = 'unsubscribed';
      newOutcome = 'unsubscribe';
      if (prospect.email) {
        await db.prepare("INSERT OR REPLACE INTO suppression (key, reason, created_at) VALUES (?, ?, ?)")
          .bind(prospect.email.toLowerCase(), `Unsubscribed on ${timestamp}`, timestamp).run();
      }
      if (prospect.website) {
        const dom = getDomain(prospect.website);
        if (dom) {
          await db.prepare("INSERT OR REPLACE INTO suppression (key, reason, created_at) VALUES (?, ?, ?)")
            .bind(dom, `Unsubscribed on ${timestamp}`, timestamp).run();
        }
      }
      const nameCityKey = `${prospect.name.toLowerCase()}_${prospect.city.toLowerCase()}`.replace(/\s+/g, "_");
      await db.prepare("INSERT OR REPLACE INTO suppression (key, reason, created_at) VALUES (?, ?, ?)")
        .bind(nameCityKey, `Unsubscribed on ${timestamp}`, timestamp).run();
      break;

    case 'not_now':
      autoStopped = true;
      newStatus = 'paused';
      newOutcome = 'not_now';
      cooldownUntil = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString();
      break;

    case 'positive':
      autoStopped = true;
      newStatus = 'human_review';
      newOutcome = 'positive';
      if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
        try {
          await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: env.TELEGRAM_CHAT_ID,
              text: `🔥 *POSITIVE RESPONSE DETECTED!*\n\n*Business:* ${escapeMarkdown(prospect.name)}\n*City:* ${escapeMarkdown(prospect.city)}\n*Trade:* ${escapeMarkdown(prospect.trade)}\n*Email:* ${escapeMarkdown(prospect.email || "N/A")}\n\n*Message:* "${escapeMarkdown(params.content || "Interested")}"\n\n⚠️ _Automation STOPPED. Requires human follow-up._`,
              parse_mode: "Markdown"
            }),
            signal: AbortSignal.timeout(4000)
          });
        } catch (e) {}
      }
      break;

    case 'question':
      autoStopped = true;
      newStatus = 'human_review';
      newOutcome = 'question';
      if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
        try {
          await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: env.TELEGRAM_CHAT_ID,
              text: `❓ *PROSPECT QUESTION DETECTED!*\n\n*Business:* ${escapeMarkdown(prospect.name)}\n*City:* ${escapeMarkdown(prospect.city)}\n*Trade:* ${escapeMarkdown(prospect.trade)}\n*Email:* ${escapeMarkdown(prospect.email || "N/A")}\n\n*Question:* "${escapeMarkdown(params.content || "Inquiry")}"\n\n⚠️ _Automation STOPPED. Requires human answer._`,
              parse_mode: "Markdown"
            }),
            signal: AbortSignal.timeout(4000)
          });
        } catch (e) {}
      }
      break;

    case 'negative':
      autoStopped = true;
      newStatus = 'discarded';
      newOutcome = 'negative';
      if (prospect.email) {
        await db.prepare("INSERT OR REPLACE INTO suppression (key, reason, created_at) VALUES (?, ?, ?)")
          .bind(prospect.email.toLowerCase(), `Negative response on ${timestamp}`, timestamp).run();
      }
      break;

    case 'out_of_office':
      autoStopped = true;
      newStatus = 'paused';
      newOutcome = 'out_of_office';
      cooldownUntil = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
      break;

    case 'replied':
    case 'unknown':
    default:
      autoStopped = true;
      newStatus = 'human_review';
      newOutcome = classification;
      break;
  }

  await db.prepare(`
    UPDATE prospects
    SET status = ?,
        outcome = ?,
        response_type = ?,
        last_reply_content = ?,
        last_reply_at = ?,
        cooldown_until = ?,
        updated_at = ?
    WHERE id = ?
  `).bind(
    newStatus,
    newOutcome,
    classification,
    params.content || null,
    timestamp,
    cooldownUntil,
    timestamp,
    prospect.id
  ).run();

  const isPositiveOutcome = ['sent', 'delivered', 'positive', 'question'].includes(classification);
  await recordLearningEvent(
    db, 
    prospect.city, 
    prospect.trade, 
    prospect.variant_id, 
    isPositiveOutcome,
    {
      score: prospect.score,
      angle: prospect.bvelt_angle,
      market: prospect.city,
      niche: prospect.trade,
      outcome: newOutcome,
      response_type: classification
    }
  );

  return {
    success: true,
    prospect_id: prospect.id,
    classification,
    auto_stopped: autoStopped,
    message: autoStopped
      ? `Event '${classification}' processed. Automation STOPPED for prospect ${prospect.name}. Status updated to ${newStatus}.`
      : `Event '${classification}' logged. Prospect status set to ${newStatus}.`
  };
}

async function handleReplyEventJob(job: RadarJobMessage, env: Env): Promise<void> {
  const { prospect_id, email, action, event_type, content, text } = job.payload;
  await handleProspectEvent({
    prospect_id: prospect_id || null,
    email: email || null,
    event_type: event_type || action || "replied",
    content: content || text || null
  }, env);
}

/**
 * Trust-Stack Governor / Firewall Gate Implementation
 */
export interface TrustGateDecision {
  allowed: boolean;
  status: 'approved' | 'rejected' | 'hold';
  reason: string;
  trust_decision_id?: string;
  timestamp: string;
}

export async function verifyTrustStackGate(
  prospect: any,
  runId: string,
  env: Env,
  simulatedMode?: string | null
): Promise<TrustGateDecision> {
  const timestamp = new Date().toISOString();

  // 1. Mandatory Local Pre-Gate Checks
  // Suppression check
  const isSuppressed = await checkSuppressedComposite(
    env.RADAR_DB,
    prospect.email,
    prospect.website,
    prospect.phone,
    prospect.name,
    prospect.city
  );
  if (isSuppressed) {
    const decision: TrustGateDecision = {
      allowed: false,
      status: 'rejected',
      reason: `SUPPRESSED: ${isSuppressed.reason}`,
      timestamp
    };
    await recordTrustDecisionInD1(env.RADAR_DB, prospect.id, runId, decision);
    return decision;
  }

  // Missing or unverified email check
  if (!prospect.email || prospect.email.trim() === '') {
    const decision: TrustGateDecision = {
      allowed: false,
      status: 'rejected',
      reason: 'MISSING_EMAIL_VERIFICATION: Prospect has no valid email address.',
      timestamp
    };
    await recordTrustDecisionInD1(env.RADAR_DB, prospect.id, runId, decision);
    return decision;
  }

  // Low Need Score check
  if (prospect.score !== undefined && prospect.score < 30) {
    const decision: TrustGateDecision = {
      allowed: false,
      status: 'rejected',
      reason: `LOW_BVELT_NEED_SCORE: Score ${prospect.score} is below threshold 30.`,
      timestamp
    };
    await recordTrustDecisionInD1(env.RADAR_DB, prospect.id, runId, decision);
    return decision;
  }

  // Handle test simulation flags
  if (simulatedMode === 'timeout') {
    const decision: TrustGateDecision = {
      allowed: false,
      status: 'hold',
      reason: 'TRUST_STACK_UNAVAILABLE: Network timeout contacting Trust-Stack Governor API.',
      timestamp
    };
    await recordTrustDecisionInD1(env.RADAR_DB, prospect.id, runId, decision);
    return decision;
  }
  if (simulatedMode === 'reject') {
    const decision: TrustGateDecision = {
      allowed: false,
      status: 'rejected',
      reason: 'TRUST_STACK_REJECTED: Governor policy - excessive daily volume in sector.',
      timestamp
    };
    await recordTrustDecisionInD1(env.RADAR_DB, prospect.id, runId, decision);
    return decision;
  }

  // Idempotency check: Has this exact prospect already been authorized for this run or send?
  try {
    const existingDecision = await env.RADAR_DB.prepare(
      "SELECT * FROM trust_decisions WHERE prospect_id = ? AND run_id = ? ORDER BY created_at DESC LIMIT 1"
    ).bind(prospect.id, runId).first() as any;

    if (existingDecision && existingDecision.status === 'approved') {
      return {
        allowed: true,
        status: 'approved',
        reason: 'ALREADY_APPROVED_IDEMPOTENT',
        trust_decision_id: existingDecision.id,
        timestamp: existingDecision.created_at
      };
    }
  } catch (e) {}

  // 2. Founder Mode Default Bypass (Ensures Trust-Stack never blocks founder discovery or outreach unless explicitly enabled)
  if ((prospect.mode === 'founder' || !prospect.mode) && (env as any).ENABLE_TRUST_STACK_FOUNDER !== 'true') {
    const decision: TrustGateDecision = {
      allowed: true,
      status: 'approved',
      reason: 'TRUST_STACK_FOUNDER_BYPASS: Trust-Stack bypassed by default in founder mode.',
      trust_decision_id: crypto.randomUUID(),
      timestamp
    };
    await recordTrustDecisionInD1(env.RADAR_DB, prospect.id, runId, decision);
    return decision;
  }

  // 3. Trust-Stack API Governor Firewall Call
  const trustUrl = env.TRUST_STACK_URL;
  const serviceKey = env.TRUST_SERVICE_KEY || env.TRUST_STACK_KEY || env.FOUNDER_SERVICE_KEY;

  if (!trustUrl) {
    const decision: TrustGateDecision = {
      allowed: true,
      status: 'approved',
      reason: 'TRUST_STACK_LOCAL_GOVERNOR_PASSED: Passed all local pre-gate safety checks.',
      trust_decision_id: crypto.randomUUID(),
      timestamp
    };
    await recordTrustDecisionInD1(env.RADAR_DB, prospect.id, runId, decision);
    return decision;
  }

  try {
    const payload = {
      scope: "founder.outreach",
      amount: 1,
      prospect_id: prospect.id,
      run_id: runId,
      name: prospect.name,
      city: prospect.city,
      trade: prospect.trade,
      email: prospect.email,
      score: prospect.score,
      signals: prospect.signals_json,
      bvelt_angle: prospect.bvelt_angle,
      variant_id: prospect.variant_id
    };

    const res = await fetch(`${trustUrl}/api/budget/check`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(3500)
    });

    if (!res.ok) {
      const errText = await res.text();
      // CRITICAL FAIL-SAFE: DO NOT SEND ON ERROR! HOLD / TRUST_STACK_UNAVAILABLE
      const decision: TrustGateDecision = {
        allowed: false,
        status: 'hold',
        reason: `TRUST_STACK_UNAVAILABLE: Trust-Stack HTTP ${res.status} - ${errText || 'Service error'}`,
        timestamp
      };
      await recordTrustDecisionInD1(env.RADAR_DB, prospect.id, runId, decision);
      return decision;
    }

    const data: any = await res.json();
    if (data.allowed === true || data.status === 'approved' || data.success === true) {
      const decision: TrustGateDecision = {
        allowed: true,
        status: 'approved',
        reason: data.reason || 'TRUST_STACK_APPROVED',
        trust_decision_id: data.decision_id || crypto.randomUUID(),
        timestamp
      };
      await recordTrustDecisionInD1(env.RADAR_DB, prospect.id, runId, decision);
      return decision;
    } else {
      const decision: TrustGateDecision = {
        allowed: false,
        status: 'rejected',
        reason: data.reason || 'TRUST_STACK_REJECTED: Governor policy check failed.',
        timestamp
      };
      await recordTrustDecisionInD1(env.RADAR_DB, prospect.id, runId, decision);
      return decision;
    }
  } catch (err: any) {
    // CRITICAL FAIL-SAFE: Timeout, network failure, or service down => HOLD / TRUST_STACK_UNAVAILABLE (DO NOT SEND!)
    console.warn(`[Trust-Stack Firewall] Gate request failed (${err.message}). Blocking send -> HOLD.`);
    const decision: TrustGateDecision = {
      allowed: false,
      status: 'hold',
      reason: `TRUST_STACK_UNAVAILABLE: ${err.message || 'Timeout or network failure'}`,
      timestamp
    };
    await recordTrustDecisionInD1(env.RADAR_DB, prospect.id, runId, decision);
    return decision;
  }
}

export async function recordTrustDecisionInD1(
  db: D1Database,
  prospectId: string,
  runId: string,
  decision: TrustGateDecision
): Promise<void> {
  const timestamp = new Date().toISOString();
  try {
    await db.prepare(`
      INSERT INTO trust_decisions (id, prospect_id, run_id, status, reason, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      decision.trust_decision_id || crypto.randomUUID(),
      prospectId,
      runId,
      decision.status,
      decision.reason,
      timestamp
    ).run();
  } catch (e) {
    console.warn("[Trust-Stack Audit Log] Failed to log decision in D1:", e);
  }
}

/**
 * Backward compatibility wrapper
 */
async function runProspectingPipeline(
  env: Env, 
  mode: string, 
  tenantId: string | null,
  overrides?: any
): Promise<any> {
  return await startProspectingRun(env, mode, tenantId, overrides);
}

/**
 * Deterministic Regional & Trade Target Selector
 */
export async function getPriorityTargets(
  dayOfYear: number, 
  env: Env, 
  mode: string, 
  tenantId: string | null,
  overrides?: {
    cities: string | null;
    trades: string | null;
    countries: string | null;
    languages: string | null;
    min_score: string | null;
  },
  skipPicks?: boolean
): Promise<{ activeCities: string[]; activeTrades: string[]; missionConfig: MissionConfig; pairs?: { city: string; trade: string }[] }> {
  const config: MissionConfig = JSON.parse(JSON.stringify(DEFAULT_FOUNDER_MISSION));

  let tenantPicks: { place: any; trade: string; why: string }[] = [];
  if (mode === "tenant" && tenantId) {
    try {
      const tenantConfig = await env.RADAR_DB.prepare("SELECT * FROM tenant_config WHERE tenant_id = ?").bind(tenantId).first() as any;
      if (tenantConfig) {
        try {
          config.geographies = JSON.parse(tenantConfig.cities_json || '[]');
          config.niches = JSON.parse(tenantConfig.trades_json || '[]');
          config.mode = "tenant";
          config.target = `tenant_${tenantId}_customers`;
          if (tenantConfig.countries_json) config.countries = JSON.parse(tenantConfig.countries_json);
          if (tenantConfig.languages_json) config.languages = JSON.parse(tenantConfig.languages_json);
          
          // If niches are empty, use expandTenantIcp or fallback to TENANT_TARGET_MAP
          if (config.niches.length === 0) {
            if (!skipPicks) {
              const expanded = await expandTenantIcp(env, tenantConfig);
              if (expanded && expanded.segments && expanded.segments.length > 0) {
                config.niches = expanded.segments.map(s => s.label);
              } else if (tenantConfig.niche) {
                const trade = tenantConfig.niche.toLowerCase();
                config.niches = TENANT_TARGET_MAP[trade] || ["property management", "real estate"];
              }
            } else if (tenantConfig.niche) {
              const trade = tenantConfig.niche.toLowerCase();
              config.niches = TENANT_TARGET_MAP[trade] || ["property management", "real estate"];
            }
          }
        } catch (e) {
          console.error("Error parsing tenant config: ", e);
        }

        const citiesList = JSON.parse(tenantConfig.cities_json || '[]');
        const centerLabel = citiesList[0] || null;
        if (centerLabel && !skipPicks) {
          try {
            tenantPicks = await pickTargets(env.RADAR_DB, {
              tenantId,
              trades: config.niches.length > 0 ? config.niches : ["property management"],
              count: 6,
              centerLabel,
              serviceRadiusKm: Number(tenantConfig.service_radius_km || 60),
              countries: ["US", "CA"],
              allowedCities: citiesList
            });
          } catch (e) {
            console.warn("[getPriorityTargets] tenant pickTargets error:", e);
            tenantPicks = [];
          }
        }
        // If tenant has NO cities configured, leave geographies empty — run will abort cleanly
        if (!citiesList || citiesList.length === 0) {
          config.geographies = [];
          console.warn(`[getPriorityTargets] Tenant ${tenantId} has no cities configured. Discovery will not run.`);
        }
      } else {
        // Tenant ID provided but not found in DB — do NOT invent fallback cities
        config.geographies = [];
        config.niches = [];
        console.warn(`[getPriorityTargets] Tenant config not found for ${tenantId}`);
      }
    } catch (e) {}
  } else if (mode === "tenant") {
    // Tenant mode without tenant_id — refuse to invent data
    config.geographies = [];
    config.niches = [];
    config.icp = {
      description: "Local B2B businesses with recurrent maintenance needs.",
      keywords: ["property management", "estate agent", "hotel"]
    };
  } else {
    // Founder mode
    if (env.FOUNDING_CITIES) {
      config.geographies = env.FOUNDING_CITIES.split(";").map(c => c.trim()).filter(Boolean);
    }
    if (env.FOUNDING_TRADES) {
      config.niches = env.FOUNDING_TRADES.split(";").map(t => t.trim()).filter(Boolean);
    }
    if ((env as any).FOUNDING_COUNTRIES) {
      config.countries = String((env as any).FOUNDING_COUNTRIES).split(";").map(c => c.trim().toUpperCase()).filter(Boolean);
    }
    if ((env as any).FOUNDING_LANGUAGES) {
      config.languages = String((env as any).FOUNDING_LANGUAGES).split(";").map(l => l.trim().toLowerCase()).filter(Boolean);
    }
    if ((env as any).FOUNDING_MIN_SCORE) {
      const parsedMin = parseInt(String((env as any).FOUNDING_MIN_SCORE), 10);
      if (!isNaN(parsedMin)) {
        config.min_score = parsedMin;
      }
    }
  }

  // Seed Today's Daily Mission
  if (env.RADAR_DB && typeof env.RADAR_DB.prepare === "function") {
    try {
      const today = new Date().toISOString().split('T')[0];
      const targetTenant = (mode === "tenant" && tenantId) ? tenantId : "founder";
      const goal = mode === "tenant" ? "Find high-value B2B customers for the tenant." : "Find the highest-probability Bvelt customers today.";
      const marketsJson = JSON.stringify(config.geographies);
      const icpJson = JSON.stringify(config.icp);
      const budgetJson = JSON.stringify({
        discovery_units: 30,
        enrichment_units: 20,
        ai_units: 10,
        hunter_units: 8,
        outreach_units: 3,
        finalize_units: 10
      });

      const prep = env.RADAR_DB.prepare(`
        INSERT OR IGNORE INTO daily_missions (tenant_id, day, goal, markets, icp, budget, target_qualified, target_outreach, status, qualified_count, outreach_count)
        VALUES (?, ?, ?, ?, ?, ?, 3, 3, 'active', 0, 0)
      `);
      if (prep && typeof prep.bind === "function") {
        const bound = prep.bind(targetTenant, today, goal, marketsJson, icpJson, budgetJson);
        if (bound && typeof bound.run === "function") {
          await bound.run();
        }
      }
    } catch (e) {
      console.warn("[Daily Mission] Failed to seed daily mission:", e);
    }
  }

  // Apply runtime query overrides if provided
  if (overrides) {
    if (overrides.cities) {
      config.geographies = overrides.cities.split(";").map(c => c.trim()).filter(Boolean);
    }
    if (overrides.trades) {
      config.niches = overrides.trades.split(";").map(t => t.trim()).filter(Boolean);
    }
    if (overrides.countries) {
      config.countries = overrides.countries.split(";").map(c => c.trim().toUpperCase()).filter(Boolean);
    }
    if (overrides.languages) {
      config.languages = overrides.languages.split(";").map(l => l.trim().toLowerCase()).filter(Boolean);
    }
    if (overrides.min_score) {
      const parsedOverrideMin = parseInt(overrides.min_score, 10);
      if (!isNaN(parsedOverrideMin)) {
        config.min_score = parsedOverrideMin;
      }
    }
  }

  let learningStats: Record<string, number> = {};
  if (env.RADAR_DB) {
    try {
      learningStats = await getLearningStats(env.RADAR_DB);
    } catch (e) {}
  }

  // Rank geographies with Thompson Sampling (explore uncertain cities, exploit winners)
  const sortedGeographies = [...config.geographies].sort((a, b) => {
    const rateA = learningStats[`city:${a}`] ?? 0.5;
    const rateB = learningStats[`city:${b}`] ?? 0.5;
    // Approximate trials from rate distance to prior 0.5 (more extreme = more data)
    const trialsA = Math.max(2, Math.round(Math.abs(rateA - 0.5) * 40));
    const trialsB = Math.max(2, Math.round(Math.abs(rateB - 0.5) * 40));
    const winsA = rateA * trialsA;
    const winsB = rateB * trialsB;
    const sampleA = thompsonSample(winsA, trialsA);
    const sampleB = thompsonSample(winsB, trialsB);
    return sampleB - sampleA;
  });

  // Rank niches/segments: Thompson + EV ticket + mode priors
  const sortedNiches = [...config.niches].sort((a, b) => {
    const aL = a.toLowerCase();
    const bL = b.toLowerCase();
    let rateA = learningStats[`trade:${aL}`] ?? learningStats[`trade:${a}`] ?? 0.5;
    let rateB = learningStats[`trade:${bL}`] ?? learningStats[`trade:${b}`] ?? 0.5;
    if (mode === "founder") {
      if (PREFERRED_TRADES.has(aL)) rateA += 0.15;
      if (PREFERRED_TRADES.has(bL)) rateB += 0.15;
    }
    if (mode === "tenant") {
      if (/property management|hoa|facility|hotel|real estate/i.test(aL)) rateA += 0.2;
      if (/property management|hoa|facility|hotel|real estate/i.test(bL)) rateB += 0.2;
    }
    const trialsA = Math.max(2, Math.round(Math.abs(rateA - 0.5) * 40));
    const trialsB = Math.max(2, Math.round(Math.abs(rateB - 0.5) * 40));
    // EV = P(win) × ticket → prefer high-ticket segments when rates similar
    const evA = thompsonSample(rateA * trialsA, trialsA) * estimateTicketUsd(aL);
    const evB = thompsonSample(rateB * trialsB, trialsB) * estimateTicketUsd(bL);
    return evB - evA;
  });

  // Founder: national US+CA pool (geoFrontier). Sun Belt is soft boost, not a wall.
  // Tenant keeps allowedCities / centerLabel isolation.
  let picks: { place: any; trade: string; why: string }[] = [];
  if (!skipPicks && mode === "founder" && !(overrides && overrides.cities)) {
    try {
      picks = await pickTargets(env.RADAR_DB, {
        tenantId: "founder",
        trades: sortedNiches,
        count: Math.min(12, Number(env.RADAR_JOBS_PER_RUN || 8)),
        countries: ["US", "CA"]
      });
    } catch (e) {
      console.warn("[getPriorityTargets] pickTargets error:", e);
      picks = [];
    }
  }

  // Weather Signals: Para el clima usa como estados las regiones de 2 letras de los picks de país US
  const foundingStr = env.FOUNDING_CITIES || config.geographies.join(";");
  let extractedStates: string[] = [];

  if (picks.length > 0) {
    extractedStates = Array.from(new Set(
      picks
        .filter(p => ((p.place && p.place.country) || (p.place as any)?.país || p.place?.[2] || "").toUpperCase() === "US")
        .map(p => ((p.place && p.place.region) || (p.place as any)?.región || p.place?.[1] || "").toUpperCase().trim())
        .filter(r => /^[A-Z]{2}$/.test(r))
    ));
  }

  if (extractedStates.length === 0) {
    extractedStates = Array.from(new Set(foundingStr.match(/\b[A-Z]{2}\b/g) || ["FL", "TX"]));
  }

  let weatherAlerts: WeatherAlert[] = [];
  if (!skipPicks) {
    try {
      weatherAlerts = await getAlerts(extractedStates);
    } catch (e) {
      console.warn("[Weather Signals] getAlerts warning:", e);
    }
  }

  // Prioritize city+trade combinations whose county/city appears in areaDesc
  if (weatherAlerts.length > 0) {
    for (const alert of weatherAlerts) {
      const alertTrades = tradeForEvent(alert.event);
      const areaDescLower = (alert.areaDesc || "").toLowerCase();

      for (let i = 0; i < sortedGeographies.length; i++) {
        const cityName = sortedGeographies[i].split(',')[0].trim().toLowerCase();
        if (cityName && areaDescLower.includes(cityName)) {
          const [matchedCity] = sortedGeographies.splice(i, 1);
          sortedGeographies.unshift(matchedCity);
          break;
        }
      }

      for (const tr of alertTrades) {
        const trIdx = sortedNiches.findIndex(n => n.toLowerCase() === tr.toLowerCase());
        if (trIdx > 0) {
          const [matchedTrade] = sortedNiches.splice(trIdx, 1);
          sortedNiches.unshift(matchedTrade);
        }
      }
    }
  }

  (config as any).weather_alerts = weatherAlerts;

  let activeCities: string[];
  let activeTrades: string[];
  let pairs: { city: string; trade: string }[] | undefined = undefined;

  if (mode === "tenant" && tenantId && tenantPicks.length > 0) {
    activeCities = tenantPicks.map(p => `${p.place[0]}, ${p.place[1]}`);
    activeTrades = Array.from(new Set(tenantPicks.map(p => p.trade)));
    pairs = tenantPicks.map(p => ({
      city: `${p.place[0]}, ${p.place[1]}`,
      trade: p.trade
    }));
  } else if (mode === "founder" && !(overrides && overrides.cities) && picks.length > 0) {
    activeCities = picks.map(p => `${p.place[0]}, ${p.place[1]}`);
    activeTrades = Array.from(new Set(picks.map(p => p.trade)));
    pairs = picks.map(p => ({
      city: `${p.place[0]}, ${p.place[1]}`,
      trade: p.trade
    }));
  } else {
    // Si pickTargets falla o devuelve [], conserva la rotación actual:
    const cityIdx1 = dayOfYear % sortedGeographies.length;
    const cityIdx2 = (dayOfYear + 3) % sortedGeographies.length;
    
    const tradeIdx1 = (dayOfYear * 2) % sortedNiches.length;
    const tradeIdx2 = (dayOfYear * 2 + 1) % sortedNiches.length;

    activeCities = Array.from(new Set([sortedGeographies[cityIdx1], sortedGeographies[cityIdx2]]));
    activeTrades = Array.from(new Set([sortedNiches[tradeIdx1], sortedNiches[tradeIdx2]]));
  }

  return { activeCities, activeTrades, missionConfig: config, pairs };
}

/**
 * Hard Quality Gate: Rejected Retail and Banned Chains (Bvelt ICP)
 */
export function isHardRejectedChain(name: string): boolean {
  if (!name) return false;
  const n = name.toLowerCase().trim();
  const banned = [
    "walmart", "lowe's", "lowes", "home depot", "costco", "target", "sam's club", "sams club",
    "menards", "ace hardware", "true value", "harbor freight", "tractor supply", "best buy",
    "kroger", "publix", "walgreens", "cvs", "dollar tree", "dollar general", "family dollar",
    "autozone", "auto zone", "advance auto", "o'reilly", "sherwin-williams", "floor & decor",
    "staples", "office depot", "target store"
  ];
  if (banned.some(b => n.includes(b))) return true;

  // Hard-reject retail garden centers, nurseries, plant stores, building/landscape supplies
  if (
    /garden cent(er|re)/i.test(n) ||
    /plant nursery/i.test(n) ||
    /tree nursery/i.test(n) ||
    /\bnursery\b/i.test(n) ||
    /plant (shop|store|boutique)/i.test(n) ||
    /greenhouse & (nursery|gifts|retail)/i.test(n) ||
    /flower (shop|market|store)/i.test(n) ||
    /\bflorist\b/i.test(n) ||
    /building supplies/i.test(n) ||
    /landscape supply/i.test(n) ||
    /stone supply/i.test(n) ||
    /mulch supply/i.test(n)
  ) {
    return true;
  }
  return false;
}

/**
 * Preferred Trades for Bvelt (Field Service & Contractor Operators)
 */
export const PREFERRED_TRADES = new Set([
  "hvac", "plumbing", "electrical", "electrician", "roofing", "lawn_care", "landscaping", "pool", "pool_cleaning", "cleaning", "house_cleaning", "handyman"
]);

export interface StrategicScoreBreakdown {
  fit_score: number;
  intent_score: number;
  pain_score: number;
  ability_to_pay_score: number;
  contactability_score: number;
  timing_score: number;
  evidence_score: number;
  signal_freshness_score: number;
  strategic_score: number;
  expected_value: number;
  decision_state: string;
  priority_tier: 'critical' | 'high' | 'medium' | 'low';
  why_now_json: string;
  why_now: {
    what_is_happening: string;
    what_evidence_exists: string[];
    why_it_matters: string;
    why_now: string;
    recommended_action: string;
    potential_economic_result: string;
    distinctions: {
      observed_facts: string[];
      inferences: string[];
      estimations: string[];
    };
  };
}

export function calculateStrategicScores(
  item: any,
  email: string | null,
  isEmailValidated: boolean,
  phone: string | null,
  isPriorityCity: boolean,
  isPriorityTrade: boolean,
  learningStats: Record<string, number>,
  signals: Record<string, boolean>,
  missionConfig?: MissionConfig
): StrategicScoreBreakdown {
  if (isHardRejectedChain(item.name)) {
    return {
      fit_score: 0,
      intent_score: 0,
      pain_score: 0,
      ability_to_pay_score: 0,
      contactability_score: 0,
      timing_score: 0,
      evidence_score: 0,
      signal_freshness_score: 0,
      strategic_score: 0,
      expected_value: 0,
      decision_state: 'rejected',
      priority_tier: 'low',
      why_now_json: JSON.stringify({ reason: "Hard-rejected retail chain" }),
      why_now: {
        what_is_happening: "Retail chain detected",
        what_evidence_exists: ["Name matches prohibited retail chain dictionary"],
        why_it_matters: "Banned from Bvelt ICP",
        why_now: "Immediate disqualification",
        recommended_action: "Do not contact",
        potential_economic_result: "$0",
        distinctions: { observed_facts: ["Chain name detected"], inferences: [], estimations: [] }
      }
    };
  }

  const tradeLower = (item.trade || "").toLowerCase();
  const nameLower = (item.name || "").toLowerCase();
  const isPreferredTrade = PREFERRED_TRADES.has(tradeLower) ||
    /hvac|plumb|electr|roof|lawn|landscap|pool|clean|handyman/i.test(tradeLower);
  const targetNiches = missionConfig?.niches || [];
  const matchesTargetNiches = targetNiches.some(n => 
    tradeLower.includes(n.toLowerCase()) || nameLower.includes(n.toLowerCase())
  );

  // 1. FIT SCORE (0 - 100)
  let fit_score = 0;
  if (matchesTargetNiches || isPriorityTrade) fit_score += 45;
  else if (isPreferredTrade) fit_score += 35;
  else fit_score += 20;

  const isIndependent = /brothers|sons|family|llc|services|pro|tech|contracting|group|co\b/i.test(nameLower);
  if (isIndependent) fit_score += 25;
  if (isPriorityCity) fit_score += 15;
  if (item.website && isRealWebsite(item.website)) fit_score += 15;
  fit_score = Math.min(100, Math.max(0, fit_score));

  // 2. INTENT SCORE (0 - 100)
  let intent_score = 0;
  const hasPermit = item.source === 'permits' || !!item.signal_event;
  if (hasPermit) intent_score += 40;
  if (signals.quote_request || signals.estimate_language) intent_score += 30;
  if (signals.multiple_areas || signals.specific_landing_pages) intent_score += 20;
  if (signals.contact_form || signals.lead_capture) intent_score += 10;
  intent_score = Math.min(100, Math.max(0, intent_score));

  // 3. PAIN SCORE (0 - 100)
  let pain_score = 0;
  if (signals.sms_gap) pain_score += 40;
  if (!signals.booking) pain_score += 25;
  if (signals.emergency) pain_score += 20;
  if (!signals.quote_request && !signals.estimate_language) pain_score += 15;
  pain_score = Math.min(100, Math.max(0, pain_score));

  // 4. ABILITY TO PAY SCORE (0 - 100)
  let ability_to_pay_score = 0;
  const isHighTicketTrade = /hvac|roof|electr|plumb|builder|contractor|commercial/i.test(tradeLower);
  if (isHighTicketTrade) ability_to_pay_score += 40;
  else ability_to_pay_score += 25;

  if (item.website && isRealWebsite(item.website)) {
    ability_to_pay_score += 25;
    if (email && !/@(gmail|yahoo|hotmail|outlook)\.com$/i.test(email)) {
      ability_to_pay_score += 20;
    }
  }
  if (signals.multiple_areas) ability_to_pay_score += 15;
  ability_to_pay_score = Math.min(100, Math.max(0, ability_to_pay_score));

  // 5. CONTACTABILITY SCORE (0 - 100)
  let contactability_score = 0;
  if (email) {
    contactability_score += isEmailValidated ? 50 : 35;
    if (!/@(gmail|yahoo|hotmail|outlook)\.com$/i.test(email)) {
      contactability_score += 15;
    }
  }
  if (phone) contactability_score += 25;
  if (item.website && isRealWebsite(item.website)) contactability_score += 10;
  contactability_score = Math.min(100, Math.max(0, contactability_score));

  // 6. TIMING SCORE (0 - 100)
  let timing_score = 0;
  if (item.signal_event) timing_score += 45;
  if (item.source === 'permits') timing_score += 35;
  if (isPreferredTrade) timing_score += 20;
  timing_score = Math.min(100, Math.max(0, timing_score));

  // 7. EVIDENCE SCORE (0 - 100)
  const observedSignalsCount = [
    signals.emergency,
    signals.sms_gap,
    signals.quote_request || signals.estimate_language,
    signals.booking,
    signals.multiple_areas,
    signals.contact_form,
    signals.lead_capture
  ].filter(Boolean).length;

  let evidence_score = 30 + (observedSignalsCount * 12);
  if (item.website && isRealWebsite(item.website)) evidence_score += 10;
  if (email && isEmailValidated) evidence_score += 10;
  evidence_score = Math.min(100, Math.max(0, evidence_score));

  // 8. SIGNAL FRESHNESS SCORE (0 - 100)
  let signal_freshness_score = 100;
  if (item.created_at) {
    const ageDays = (Date.now() - new Date(item.created_at).getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays > 30) signal_freshness_score = 50;
    else if (ageDays > 14) signal_freshness_score = 70;
    else if (ageDays > 7) signal_freshness_score = 85;
    else signal_freshness_score = 100;
  }

  // COMPOSITE STRATEGIC SCORE (0 - 100)
  const freshnessMultiplier = signal_freshness_score / 100;
  let strategic_score = Math.round(
    (fit_score * 0.20) +
    (pain_score * 0.20) +
    (intent_score * 0.15) +
    (timing_score * 0.15) +
    (contactability_score * 0.15) +
    (ability_to_pay_score * 0.10) +
    (evidence_score * freshnessMultiplier * 0.05)
  );
  strategic_score = Math.min(100, Math.max(0, strategic_score));

  // DECISION STATE & PRIORITY TIER
  let priority_tier: 'critical' | 'high' | 'medium' | 'low' = 'medium';
  if (strategic_score >= 80 && contactability_score >= 60 && timing_score >= 40) {
    priority_tier = 'critical';
  } else if (strategic_score >= 65 && contactability_score >= 45) {
    priority_tier = 'high';
  } else if (strategic_score >= 45) {
    priority_tier = 'medium';
  } else {
    priority_tier = 'low';
  }

  let decision_state = 'identified';
  if (priority_tier === 'critical' || priority_tier === 'high') {
    decision_state = 'actionable';
  } else if (priority_tier === 'medium') {
    decision_state = 'analyzing';
  } else {
    decision_state = 'closed';
  }

  // EXPECTED VALUE: P(convert) × ticket — ticket by trade economics
  const avgJobValue = estimateTicketUsd(item.trade || "");
  const estimatedMonthlyRecoveredValue = Math.round(avgJobValue * (pain_score / 100) * 2.2);
  const conversionProb = (strategic_score / 100) * (contactability_score / 100) * 0.32;
  const expected_value = Math.round(estimatedMonthlyRecoveredValue * conversionProb);

  // WHY NOW STRUCTURED REASONING
  const observed_facts: string[] = [];
  if (phone) observed_facts.push(`Observed phone line: ${phone}`);
  if (email) observed_facts.push(`Observed direct email: ${email} (verified: ${isEmailValidated})`);
  if (item.website) observed_facts.push(`Observed domain: ${item.website}`);
  if (signals.sms_gap) observed_facts.push("Observed phone CTA with absence of SMS/text-back capability");
  if (signals.emergency) observed_facts.push("Observed 24/7 or emergency service promise on website");
  if (item.signal_event) observed_facts.push(`Active weather event signal: ${item.signal_event} (${item.signal_area || item.city})`);
  if (item.source === 'permits') observed_facts.push(`Building permit activity recorded in ${item.city}`);

  const inferences: string[] = [];
  if (signals.sms_gap) {
    inferences.push("High probability of dropping mobile visitors who prefer asynchronous messaging over voice calls");
  }
  if (signals.emergency && !signals.booking) {
    inferences.push("Technicians engaged in field jobs leave incoming calls to voicemail during surge hours");
  }
  if (item.signal_event) {
    inferences.push("Elevated local call volume creates immediate backlog and customer leakage");
  }

  const estimations: string[] = [
    `Estimated average contractor ticket for ${item.trade}: $${avgJobValue}`,
    `Estimated monthly revenue at risk from dropped leads: $${estimatedMonthlyRecoveredValue}`,
    `Calculated expected value under current timing window: $${expected_value}`
  ];

  const why_now = {
    what_is_happening: item.signal_event 
      ? `Active demand surge in ${item.city} driven by ${item.signal_event} with high contractor need`
      : `${item.name} is actively advertising ${item.trade} in ${item.city} with evident lead response gaps`,
    what_evidence_exists: observed_facts,
    why_it_matters: "Every missed call or slow estimate follow-up redirects high-margin jobs to prompt competitors.",
    why_now: item.signal_event 
      ? `Event window is live right now; immediate automated outreach produces peak response rates.`
      : `High contactability and verifiable pain signal create an optimal window for high-relevance outreach.`,
    recommended_action: "Dispatch personalized outreach with interactive demo illustrating automated instant-response recovery.",
    potential_economic_result: `$${estimatedMonthlyRecoveredValue} estimated monthly recovered jobs (${expected_value} EV)`,
    distinctions: {
      observed_facts,
      inferences,
      estimations
    }
  };

  return {
    fit_score,
    intent_score,
    pain_score,
    ability_to_pay_score,
    contactability_score,
    timing_score,
    evidence_score,
    signal_freshness_score,
    strategic_score,
    expected_value,
    decision_state,
    priority_tier,
    why_now_json: JSON.stringify(why_now),
    why_now
  };
}

export async function syncOpportunityDecision(
  db: D1Database,
  prospectId: string,
  action: string,
  notes?: string
): Promise<void> {
  try {
    const opp = await db.prepare("SELECT id FROM opportunities WHERE prospect_id = ?").bind(prospectId).first() as any;
    if (opp) {
      const nowIso = new Date().toISOString();
      let state = 'analyzing';
      if (action === 'sent' || action === 'approve') state = 'dispatched';
      else if (action === 'won' || action === 'converted') state = 'closed_won';
      else if (action === 'replied' || action === 'positive') state = 'actionable_replied';
      else if (action === 'discard') state = 'closed_discarded';
      else if (action === 'demo') state = 'in_demo';

      await db.prepare("UPDATE opportunities SET decision_state = ?, updated_at = ? WHERE id = ?")
        .bind(state, nowIso, opp.id).run();

      const actId = `act_${crypto.randomUUID().replace(/-/g, "")}`;
      await db.prepare(`
        INSERT INTO opportunity_actions (id, opportunity_id, action_type, status, details_json, proposed_at, executed_at)
        VALUES (?, ?, ?, 'executed', ?, ?, ?)
      `).bind(actId, opp.id, action, JSON.stringify({ notes: notes || action }), nowIso, nowIso).run();

      if (['won', 'converted', 'replied', 'positive', 'demo'].includes(action)) {
        const outId = `out_${crypto.randomUUID().replace(/-/g, "")}`;
        const val = (action === 'won' || action === 'converted') ? 1800 : action === 'demo' ? 450 : 0;
        await db.prepare(`
          INSERT INTO opportunity_outcomes (id, opportunity_id, action_id, outcome_type, value_realized, notes, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(outId, opp.id, actId, action, val, notes || "", nowIso).run();
      }
    }
  } catch (e) {
    console.warn("[Opportunity Sync Error]", e);
  }
}

/**
 * Multi-Factor Scoring Algorithm (0-100)
 * Evaluates 5 core dimensions:
 * 1. platform_fit (0-20pts)
 * 2. tenant_fit (0-20pts)
 * 3. evidence (0-25pts)
 * 4. contactability (0-20pts)
 * 5. commercial_opportunity (0-15pts)
 */
export function calculateMultiFactorScore(
  item: any,
  email: string | null,
  isEmailValidated: boolean,
  phone: string | null,
  isPriorityCity: boolean,
  isPriorityTrade: boolean,
  learningStats: Record<string, number>,
  signals: Record<string, boolean>,
  missionConfig?: MissionConfig
): {
  totalScore: number;
  breakdown: Record<string, number>;
  confidence: number;
  evidenceSummary: string;
  evidenceItems?: any[];
  painHypothesis?: any;
  strategicScore?: number;
  strategicScores?: any;
} {
  // Hard Quality Gate: immediate 0 score for retail chains
  if (isHardRejectedChain(item.name)) {
    return {
      totalScore: 0,
      breakdown: {
        platform_fit: 0,
        tenant_fit: 0,
        evidence: 0,
        contactability: 0,
        commercial_opportunity: 0,
        revenue_leak: 0,
        bvelt_fit: 0
      },
      confidence: 0,
      evidenceSummary: "Hard-rejected retail chain (banned from Bvelt ICP)."
    };
  }

  const isTenantMode = missionConfig?.mode === 'tenant';
  const tradeLower = (item.trade || "").toLowerCase();
  const nameLower = (item.name || "").toLowerCase();

  // --- TENANT MODE: score "buyers of Bvelt clients" (PMs, hotels, HOAs…) ---
  // Different formula: contactability + ICP fit + commercial density matter more than "SMS gap".
  if (isTenantMode) {
    let tenantScore = 0;
    const breakdownT: Record<string, number> = {};

    // ICP / segment fit (0-35)
    let icpFit = 10;
    const targetNiches = (missionConfig?.niches || []).map(n => n.toLowerCase());
    const icpKeywords = (missionConfig?.icp?.keywords || []).map(k => k.toLowerCase());
    const haystack = `${nameLower} ${tradeLower}`;
    if (targetNiches.some(n => haystack.includes(n) || tradeLower.includes(n.replace(/\s+/g, "_")))) {
      icpFit += 15;
    }
    if (icpKeywords.some(k => haystack.includes(k))) {
      icpFit += 10;
    }
    // Buyer-type keywords strongly associated with recurring service spend
    if (/property|management|manager|hoa|homeowner|apartment|condo|facility|realty|real estate|hotel|motel|resort/i.test(haystack)) {
      icpFit += 8;
    }
    icpFit = Math.min(35, icpFit);
    breakdownT.icp_fit = icpFit;
    tenantScore += icpFit;

    // Contactability (0-30)
    let contact = 0;
    if (email) contact += isEmailValidated ? 14 : 10;
    if (phone) contact += 10;
    if (item.website && isRealWebsite(item.website)) contact += 6;
    contact = Math.min(30, contact);
    breakdownT.contactability = contact;
    tenantScore += contact;

    // Commercial opportunity / multi-unit signal (0-20)
    let commercial = 5;
    if (/llc|inc|corp|group|partners|properties|management|associates/i.test(nameLower)) commercial += 6;
    if (isPriorityCity) commercial += 5;
    if (item.source === "permits") commercial += 6;
    const pairKey = `pair:${item.city}|${tradeLower}`;
    const cityKey = `city:${item.city}`;
    const learned = learningStats[pairKey] ?? learningStats[cityKey] ?? learningStats[`trade:${tradeLower}`] ?? 0.5;
    if (learned > 0.55) commercial += 4;
    commercial = Math.min(20, commercial);
    breakdownT.commercial = commercial;
    tenantScore += commercial;

    // Evidence / digital maturity (0-15)
    let evidence = 3;
    if (signals.contact_form || signals.lead_capture) evidence += 4;
    if (signals.quote_request) evidence += 3;
    if (signals.multiple_areas) evidence += 3;
    if (item.website) evidence += 2;
    evidence = Math.min(15, evidence);
    breakdownT.evidence = evidence;
    tenantScore += evidence;

    tenantScore = Math.min(100, Math.max(0, Math.round(tenantScore)));
    const confidence = Math.min(100, 40 + (email ? 20 : 0) + (phone ? 15 : 0) + (item.website ? 15 : 0) + (isEmailValidated ? 10 : 0));

    return {
      totalScore: tenantScore,
      breakdown: breakdownT,
      confidence,
      evidenceSummary: `Tenant ICP score for buyer segment "${item.trade}" in ${item.city}`,
      evidenceItems: [],
      painHypothesis: { mode: "tenant_buyer", icp_match: icpFit >= 20 },
      strategicScore: tenantScore
    };
  }

  // --- FOUNDER MODE: 6-COMPONENT FORMULA (contractors who need Bvelt) ---
  
  // No real website / only social = high pain for Founder (leads die on voicemail)
  const webLower = String(item.website || "").toLowerCase();
  const isSocialOnlySite = !!webLower && (
    /facebook\.com|fb\.com|instagram\.com|linktr\.ee|bit\.ly|business\.site|wixsite\.com/i.test(webLower)
  );
  const hasNoRealWebsite = !item.website || !isRealWebsite(item.website) || isSocialOnlySite;
  if (hasNoRealWebsite) {
    (signals as any).no_own_website = true;
  }

  // 1. Need Evidence (0 - 30 pts)
  let needEvidenceScore = 0;
  if (signals.sms_gap) needEvidenceScore += 12;
  if (!signals.booking) needEvidenceScore += 8;
  if (!signals.quote_request && !signals.estimate_language) needEvidenceScore += 8;
  if (signals.emergency && signals.sms_gap) needEvidenceScore += 4;
  if (phone && !email) needEvidenceScore += 4;
  // +12 "Sin web propia" — do NOT discard; these are high-fit Bvelt leads
  if (hasNoRealWebsite) needEvidenceScore += 12;
  needEvidenceScore = Math.min(30, Math.max(0, needEvidenceScore));

  // 2. Bvelt Fit (0 - 20 pts)
  let bveltFitScore = 0;
  const isPreferred = PREFERRED_TRADES.has(tradeLower) ||
    /hvac|plumb|electr|roof|lawn|landscap|pool|clean|handyman/i.test(tradeLower);
  if (isPreferred) bveltFitScore += 15;
  const isIndependent = /brothers|sons|family|llc|services|pro|tech|contracting|group|co\b/i.test(item.name || "");
  if (isIndependent) bveltFitScore += 5;
  bveltFitScore = Math.min(20, Math.max(0, bveltFitScore));

  // 3. Timing (0 - 15 pts)
  let timingScore = 0;
  if (item.signal_event) timingScore += 8;
  const isHiring = /hiring|career|join our team|empleo|trabaja con nosotros/i.test(item.name || "") || !!signals.specific_landing_pages;
  if (isHiring) timingScore += 7;
  if (isPreferred) timingScore += 5;
  timingScore = Math.min(15, Math.max(0, timingScore));

  // 4. Commercial Value (0 - 15 pts)
  let commercialValueScore = 0;
  const isSunBeltCity = /fl|florida|tx|texas|ga|georgia|az|arizona|nc|sc|tn|tennessee|nv|al|tampa|orlando|miami|houston|austin|dallas|phoenix|atlanta|nashville/i.test(item.city || "");
  if (isPriorityCity || isSunBeltCity) commercialValueScore += 10;
  const tradeKey = `trade:${tradeLower}`;
  const winRate = learningStats[tradeKey] || 0;
  if (winRate > 0.6) commercialValueScore += 5;
  else if (winRate > 0.3) commercialValueScore += 3;
  else commercialValueScore += 1;
  commercialValueScore = Math.min(15, Math.max(0, commercialValueScore));

  // 5. Contactability (0 - 10 pts)
  let contactabilityNew = 0;
  if (email) {
    contactabilityNew += isEmailValidated ? 6 : 4;
    if (!email.endsWith("@gmail.com") && !email.endsWith("@yahoo.com") && !email.endsWith("@hotmail.com") && !email.endsWith("@outlook.com")) {
      contactabilityNew += 2;
    }
  }
  if (phone) contactabilityNew += 2;
  if (item.website && isRealWebsite(item.website)) contactabilityNew += 2;
  contactabilityNew = Math.min(10, Math.max(0, contactabilityNew));

  // 6. Evidence Confidence (0 - 10 pts)
  const evidenceItems: any[] = [];
  const addEvidence = (type: string, isDetected: boolean, text: string) => {
    let conf = 0.65;
    if (isDetected) {
      conf = 0.9;
    }
    evidenceItems.push({
      signal_type: type,
      value: isDetected ? 'detected' : 'not_detected',
      source_url: item.website || "local_db",
      source_type: item.website ? 'website_scrape' : 'directory_claim',
      observed_at: new Date().toISOString(),
      evidence_text: isDetected ? text : `No signals of ${type} found.`,
      confidence: conf,
      freshness: 1.0,
      page_type: 'homepage'
    });
  };

  addEvidence('emergency_service', !!signals.emergency, "Emergency or 24/7 support detected on website.");
  addEvidence('quote_form', !!(signals.quote_request || signals.estimate_language), "Online quote or estimate option present.");
  addEvidence('booking_flow', !!signals.booking, "Booking flow or scheduling widget detected.");
  addEvidence('lead_form', !!signals.contact_form, "Standard contact form detected.");
  addEvidence('lead_capture', !!signals.lead_capture, "Lead capture widget detected.");
  addEvidence('sms_cta', !signals.sms_gap && !!phone, "SMS call-to-action detected.");
  addEvidence('service_area_expansion', !!signals.multiple_areas, "Multiple service areas detected.");

  const detectedCount = evidenceItems.filter(e => e.value === 'detected').length;
  let evidenceConfidenceScore = 6.5;
  if (detectedCount > 0) {
    evidenceConfidenceScore = Math.min(10, 6.5 + (detectedCount * 0.7));
  }
  evidenceConfidenceScore = Math.min(10, Math.max(0, evidenceConfidenceScore));

  const totalScore = Math.round(needEvidenceScore + bveltFitScore + timingScore + commercialValueScore + contactabilityNew + evidenceConfidenceScore);

  // Separate confidence score (0-100)
  let confidenceScore = 50;
  if (email && isEmailValidated) confidenceScore += 25;
  else if (email) confidenceScore += 15;
  if (phone) confidenceScore += 15;
  if (item.website && isRealWebsite(item.website)) confidenceScore += 10;
  confidenceScore = Math.min(100, Math.max(0, confidenceScore));

  // --- BACKWARD COMPATIBLE SCORING FOR EXISTING TESTS ---
  let legacyPlatformFit = 0;
  if (item.website && isRealWebsite(item.website)) legacyPlatformFit += 5;
  if (signals.lead_capture || signals.contact_form || signals.quote_request) legacyPlatformFit += 7;
  if (signals.emergency || signals.sms_gap) legacyPlatformFit += 8;
  legacyPlatformFit = Math.min(20, Math.max(0, legacyPlatformFit));

  let legacyTenantFit = 0;
  const targetNiches = missionConfig?.niches || [];
  const itemText = `${item.name || ''} ${item.trade || ''} ${item.city || ''}`.toLowerCase();
  if (targetNiches.some(n => itemText.includes(n.toLowerCase()) || (item.trade && item.trade.toLowerCase().includes(n.toLowerCase())))) {
    legacyTenantFit += 10;
  } else if (isPreferred) {
    legacyTenantFit += 10;
  }
  legacyTenantFit = Math.min(20, Math.max(0, legacyTenantFit));

  let legacyEvidence = 0;
  if (signals.emergency) legacyEvidence += 7;
  if (signals.quote_request || signals.estimate_language) legacyEvidence += 6;
  if (signals.sms_gap) legacyEvidence += 6;
  if (signals.multiple_areas || signals.specific_landing_pages) legacyEvidence += 3;
  if (signals.booking || signals.lead_capture) legacyEvidence += 3;
  legacyEvidence = Math.min(25, Math.max(0, legacyEvidence));

  let legacyContactability = 0;
  if (email) {
    legacyContactability += isEmailValidated ? 10 : 5;
    if (!email.endsWith("@gmail.com") && !email.endsWith("@yahoo.com") && !email.endsWith("@hotmail.com") && !email.endsWith("@outlook.com")) {
      legacyContactability += 4;
    }
  }
  if (phone) legacyContactability += 4;
  if (item.website && isRealWebsite(item.website)) legacyContactability += 2;
  if (phone && email && item.website && isRealWebsite(item.website)) legacyContactability = 20;
  if (!email && !phone) legacyContactability = 0;

  let legacyCommercial = 0;
  if (isPriorityCity || isSunBeltCity) legacyCommercial += 5;
  if (isPriorityTrade || isPreferred) legacyCommercial += 5;
  if (isIndependent) legacyCommercial += 2;
  if (winRate > 0.6) legacyCommercial += 3;
  else if (winRate > 0.3) legacyCommercial += 1;

  const breakdown = {
    platform_fit: legacyPlatformFit,
    tenant_fit: legacyTenantFit,
    evidence: legacyEvidence,
    contactability: legacyContactability,
    commercial_opportunity: legacyCommercial,
    revenue_leak: legacyEvidence,
    bvelt_fit: legacyPlatformFit + legacyTenantFit
  };

  const evidenceList: string[] = [];
  if (signals.emergency) evidenceList.push("24/7 or emergency support language detected");
  if (signals.quote_request || signals.estimate_language) evidenceList.push("Online quote/estimate request option present");
  if (signals.sms_gap) evidenceList.push("SMS/text message CTA absent alongside voice CTA");
  if (signals.multiple_areas || signals.specific_landing_pages) evidenceList.push("Multi-area or targeted service pages");
  if (signals.booking || signals.lead_capture) evidenceList.push("Lead capture or booking widget detected");

  const evidenceSummary = evidenceList.length > 0 
    ? `Evidence: ${evidenceList.join("; ")}.`
    : isTenantMode 
      ? `Qualified prospect matching tenant '${missionConfig?.tenant_id || 'active'}' criteria.`
      : "Standard directory business with active contact details.";

  const painHypothesis: Record<string, string> = {};
  if (signals.sms_gap) {
    painHypothesis.sms_gap = "The business has a prominent phone number but no option to text or SMS. Up to 60% of consumers prefer text over voice calls, leading to potential drop-off of mobile visitors.";
  }
  if (!signals.booking) {
    painHypothesis.booking_gap = "Lacks self-service online scheduling. Busy professionals are forced to call during business hours, resulting in missed appointment opportunities.";
  }
  if (!signals.quote_request && !signals.estimate_language) {
    painHypothesis.quote_gap = "Requires manual back-and-forth for estimates. 50% of consumers choose the speediest contractor; manual followups risk losing leads to instant-responders.";
  }

  const strat = calculateStrategicScores(
    item, email, isEmailValidated, phone, isPriorityCity, isPriorityTrade, learningStats, signals, missionConfig
  );

  return { 
    totalScore, 
    breakdown, 
    confidence: confidenceScore, 
    evidenceSummary,
    evidenceItems,
    painHypothesis,
    strategicScore: strat.strategic_score,
    strategicScores: strat
  };
}

/**
 * Official BizData categories (~37 fixed standard directory categories)
 */
export const BIZDATA_OFFICIAL_CATEGORIES = new Set([
  "accounting", "accountant", "attorney", "auto_repair", "bakery", "bank", "bar",
  "beauty_salon", "book_store", "cafe", "car_dealer", "car_rental", "car_repair",
  "car_wash", "dentist", "doctor", "drugstore", "dry_cleaning", "electrician",
  "florist", "gas_station", "general_contractor", "gym", "hair_care", "hairdresser",
  "hardware_store", "hospital", "insurance_agency", "laundry", "lawyer", "locksmith",
  "lodging", "moving_company", "painter", "pharmacy", "physiotherapist", "plumber",
  "real_estate_agency", "real_estate", "restaurant", "roofing_contractor", "school",
  "shoe_store", "shopping_mall", "spa", "supermarket", "travel_agency", "veterinary_care"
]);

/**
 * Maps arbitrary trades to official BizData category or returns null if not supported
 */
export function mapTradeToBizDataCategory(trade: string): string | null {
  if (!trade) return null;
  const norm = trade.toLowerCase().trim().replace(/[\s-]+/g, "_");
  if (BIZDATA_OFFICIAL_CATEGORIES.has(norm)) return norm;
  
  const mapping: Record<string, string> = {
    "plumbing": "plumber",
    "roofing": "roofing_contractor",
    "electrician": "electrician",
    "electrical": "electrician",
    "cleaning": "dry_cleaning",
    "house_cleaning": "dry_cleaning",
    "car_repair": "auto_repair",
    "lawyer": "attorney",
    "law_firm": "attorney",
    "dentist": "dentist",
    "dental_clinic": "dentist",
    "locksmith": "locksmith",
    "painter": "painter",
    "painting": "painter",
    "moving": "moving_company",
    "real_estate": "real_estate_agency"
  };

  const mapped = mapping[norm];
  if (mapped && BIZDATA_OFFICIAL_CATEGORIES.has(mapped)) {
    return mapped;
  }
  return null;
}

export interface NominatimGeocoding {
  lat: number;
  lon: number;
  bbox: [number, number, number, number]; // [south, north, west, east]
  display_name: string;
}

/**
 * 1. Nominatim OpenStreetMap Geocoding (Free city -> lat/lon/bbox resolution)
 */
export async function fetchNominatimGeocoding(city: string): Promise<NominatimGeocoding | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=json&limit=1`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "BveltRadar-Discovery/1.0 (founder@bvelt.app)",
        "Accept": "application/json"
      },
      signal: AbortSignal.timeout(6000)
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      const item = data[0];
      const bb = item.boundingbox; // ["minLat", "maxLat", "minLon", "maxLon"]
      if (bb && bb.length === 4) {
        return {
          lat: parseFloat(item.lat),
          lon: parseFloat(item.lon),
          bbox: [parseFloat(bb[0]), parseFloat(bb[1]), parseFloat(bb[2]), parseFloat(bb[3])],
          display_name: item.display_name || city
        };
      }
    }
  } catch (e) {
    console.warn(`[Nominatim Geocoding] Warning for ${city}:`, e);
  }
  return null;
}

const OVERPASS_MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://lz4.overpass-api.de/api/interpreter",
  "https://z.overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter"
];

/**
 * 2. Overpass OSM with Mirrors & Retry (8-12s timeout per mirror, generic craft/shop/office/amenity/name tags, multi-mirror fallback, widened radius fallback)
 */
export async function fetchOverpassBusinesses(
  city: string, 
  trade: string, 
  nominatimGeo: NominatimGeocoding | null,
  customOsmTags?: string[]
): Promise<{ businesses: any[]; status: string }> {
  const cleanTrade = trade.toLowerCase().trim();
  const cityClean = city.split(",")[0].trim();
  
  const specificTags = (customOsmTags && customOsmTags.length > 0)
    ? customOsmTags
    : (OVERPASS_TRADE_TAGS[cleanTrade] || []);
  const genericTags = [
    `craft="${cleanTrade}"`,
    `shop="${cleanTrade}"`,
    `office="${cleanTrade}"`,
    `amenity="${cleanTrade}"`,
    `service="${cleanTrade}"`,
    `healthcare="${cleanTrade}"`,
    `craft="contractor"`,
    `amenity="trade"`
  ];
  
  const allTags = Array.from(new Set([...specificTags, ...genericTags]));

  async function queryOverpassWithGeo(geo: NominatimGeocoding | null, isWidened = false): Promise<{ businesses: any[]; status: string } | null> {
    const tagQueries = allTags.map(tag => {
      if (tag.includes('~')) {
        const cleanTag = tag.replace(/,\s*i$/, '');
        return `nwr[${cleanTag},i]${geo ? `(${geo.bbox[0]},${geo.bbox[2]},${geo.bbox[1]},${geo.bbox[3]})` : `(area.searchArea)`};`;
      }
      return `nwr[${tag}]${geo ? `(${geo.bbox[0]},${geo.bbox[2]},${geo.bbox[1]},${geo.bbox[3]})` : `(area.searchArea)`};`;
    }).join("\n");

    const query = geo ? `
      [out:json][timeout:25];
      (
        ${tagQueries}
      );
      out body 35;
    ` : `
      [out:json][timeout:25];
      area["name"="${cityClean}"]->.searchArea;
      (
        ${tagQueries}
      );
      out body 35;
    `;

    let lastStatus = "unattempted";

    for (const mirror of OVERPASS_MIRRORS) {
      try {
        let hostname = mirror;
        try { hostname = new URL(mirror).hostname; } catch (e) {}

        const res = await fetch(mirror, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "BveltRadar-Discovery/1.0 (founder@bvelt.app)"
          },
          body: `data=${encodeURIComponent(query)}`,
          signal: AbortSignal.timeout(12000)
        });

        if (res.ok) {
          const osmData: any = await res.json();
          const results: any[] = [];
          if (osmData.elements) {
            for (const el of osmData.elements) {
              const tags = el.tags || {};
              const name = tags.name;
              if (!name) continue;

              results.push({
                name,
                city,
                trade,
                website: tags.website || tags["contact:website"] || null,
                phone: tags.phone || tags["contact:phone"] || null,
                email: tags.email || tags["contact:email"] || null,
                source: "overpass"
              });
            }
          }

          if (results.length > 0) {
            const suffix = isWidened ? " (widened radius)" : "";
            console.log(`[Overpass Mirror Success] Found ${results.length} businesses for ${city} - ${trade} via ${hostname}${suffix}`);
            return { businesses: results, status: `success (${hostname})${suffix}` };
          } else {
            console.log(`[Overpass Mirror Empty] 0 raw elements from ${hostname}. Trying next mirror...`);
            lastStatus = `0 elements from ${hostname}`;
            continue;
          }
        } else {
          lastStatus = `HTTP ${res.status} from ${hostname}`;
        }
      } catch (e: any) {
        let hostname = mirror;
        try { hostname = new URL(mirror).hostname; } catch (e2) {}
        lastStatus = `timeout/error from ${hostname}: ${e.message}`;
      }
    }
    return null;
  }

  // 1. Try initial geo/bbox
  const res1 = await queryOverpassWithGeo(nominatimGeo, false);
  if (res1 && res1.businesses.length > 0) {
    return res1;
  }

  // 2. Optional fallback: widen radius one step if 0 results and nominatimGeo available
  if (nominatimGeo) {
    console.log(`[Overpass Fallback] 0 results with initial bbox. Widening radius one step...`);
    const widenedGeo: NominatimGeocoding = {
      ...nominatimGeo,
      bbox: [
        nominatimGeo.bbox[0] - 0.1,
        nominatimGeo.bbox[1] + 0.1,
        nominatimGeo.bbox[2] - 0.1,
        nominatimGeo.bbox[3] + 0.1
      ]
    };
    const res2 = await queryOverpassWithGeo(widenedGeo, true);
    if (res2 && res2.businesses.length > 0) {
      return res2;
    }
  }

  return { businesses: [], status: `0 elements across tried mirrors` };
}

/**
 * 3. BizData API Scraper (ONLY called if category is in official BizData list; skips on HTTP 400 or error without aborting)
 */
export async function fetchBizDataBusinesses(city: string, trade: string): Promise<{ businesses: any[]; status: string }> {
  const category = mapTradeToBizDataCategory(trade);
  if (!category) {
    return { businesses: [], status: "skipped_unsupported_category" };
  }

  try {
    const bizDataUrl = `https://bizdata-web.vercel.app/api/businesses?location=${encodeURIComponent(city)}&category=${encodeURIComponent(category)}&limit=20`;
    const res = await fetch(bizDataUrl, {
      headers: { "User-Agent": "BveltRadar-Discovery/1.0 (founder@bvelt.app)" },
      signal: AbortSignal.timeout(8000)
    });
    if (res.ok) {
      const data: any = await res.json();
      const results: any[] = [];
      if (Array.isArray(data)) {
        for (const item of data) {
          results.push({
            name: item.name,
            city,
            trade,
            website: item.website || item.site || null,
            phone: item.phone || null,
            email: item.email || null,
            source: "bizdata"
          });
        }
      }
      return { businesses: results, status: "success" };
    } else {
      console.warn(`[BizData] HTTP ${res.status} for ${city} - ${trade}, skipping source (do not abort)`);
      return { businesses: [], status: `HTTP ${res.status} (skipped)` };
    }
  } catch (err: any) {
    console.warn(`[BizData] Error for ${city} - ${trade}: ${err.message}, skipping source (do not abort)`);
    return { businesses: [], status: `error: ${err.message} (skipped)` };
  }
}

export interface DiscoveryDiagnostics {
  city: string;
  trade: string;
  nominatim_status: string;
  overpass_status: string;
  bizdata_status: string;
  discovered_raw: number;
  filtered: number;
  reason: string;
  permits_found?: number;
}

/**
 * Multi-Source Discovery Cascade (Nominatim + Overpass Mirrors + BizData Safe Filter)
 */
export async function fetchLocalBusinessesWithDiagnostics(
  city: string, 
  trade: string, 
  env: Env,
  customOsmTags?: string[]
): Promise<{ businesses: any[]; diagnostics: DiscoveryDiagnostics }> {
  const cacheKey = `radar_cache_${city.replace(/[^a-z0-9]/gi, "_")}_${trade}_v3`.toLowerCase();
  
  if (env.CACHE) {
    try {
      const cached = await env.CACHE.get(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        return {
          businesses: parsed,
          diagnostics: {
            city,
            trade,
            nominatim_status: "cached",
            overpass_status: "cached",
            bizdata_status: "cached",
            discovered_raw: parsed.length,
            filtered: 0,
            reason: "Retrieved from KV Cache"
          }
        };
      }
    } catch (e) {
      console.warn("KV Cache read error: ", e);
    }
  }

  const rawBusinesses: any[] = [];
  let nominatimStatus = "unattempted";
  let overpassStatus = "unattempted";
  let bizdataStatus = "unattempted";
  let seedStatus = "unattempted";

  // 0. Primary Seed Businesses Database Lookup (by trade & state, unused, preferring city)
  let cityOnly = city;
  let stateOnly = "";
  const cityParts = city.split(",").map(s => s.trim());
  if (cityParts.length >= 2) {
    cityOnly = cityParts[0];
    stateOnly = cityParts[1];
  }

  try {
    let seedQuery = "SELECT * FROM seed_businesses WHERE used_at IS NULL AND LOWER(trade) = LOWER(?)";
    const seedParams: any[] = [trade];
    if (stateOnly) {
      seedQuery += " AND LOWER(state) = LOWER(?)";
      seedParams.push(stateOnly);
    }
    seedQuery += " ORDER BY CASE WHEN LOWER(city) = LOWER(?) THEN 0 ELSE 1 END LIMIT 30";
    seedParams.push(cityOnly);

    const seedRows = await env.RADAR_DB.prepare(seedQuery).bind(...seedParams).all();
    if (seedRows && seedRows.results && seedRows.results.length > 0) {
      const seedList = seedRows.results as any[];
      for (const item of seedList) {
        rawBusinesses.push({
          name: item.name,
          city: item.city || city,
          state: item.state || stateOnly,
          trade: item.trade || trade,
          website: item.website || null,
          phone: item.phone || null,
          email: item.email || null,
          seed_id: item.id,
          source: "seed_businesses"
        });
      }
      seedStatus = `found ${seedList.length} seeds`;
    } else {
      seedStatus = "0 seeds found";
    }
  } catch (e: any) {
    seedStatus = `error: ${e.message}`;
  }

  // 1. Nominatim Resolution
  // Prefer tight bbox from our city DB (avoids whole-metro Overpass queries that return 0)
  let nominatimGeo: NominatimGeocoding | null = null;
  const knownPlace = findPlace(city);
  if (knownPlace) {
    const r = Math.min(radiusKm(knownPlace.population || 50000), 12);
    const dLat = r / 111;
    const dLon = r / (111 * Math.cos((knownPlace.lat * Math.PI) / 180));
    nominatimGeo = {
      lat: knownPlace.lat,
      lon: knownPlace.lon,
      display_name: city,
      bbox: [
        knownPlace.lat - dLat,
        knownPlace.lat + dLat,
        knownPlace.lon - dLon,
        knownPlace.lon + dLon
      ]
    };
    nominatimStatus = `local_bbox r=${r.toFixed(1)}km [${nominatimGeo.bbox.map(n => n.toFixed(3)).join(", ")}]`;
  } else {
    nominatimGeo = await fetchNominatimGeocoding(city);
    nominatimStatus = nominatimGeo ? `resolved_bbox [${nominatimGeo.bbox.join(", ")}]` : "geocoding_fallback";
  }

  // 1.5 Municipal Permit Contractors Lookup (real-time building permits)
  let permitCandidates: any[] = [];
  try {
    const permitContractors = await fetchPermitContractors(city, trade);
    if (permitContractors && permitContractors.length > 0) {
      permitCandidates = permitContractors.map(p => ({
        name: p.name,
        phone: p.phone,
        city: p.city || city,
        website: null,
        email: null,
        source: "permits" as const,
        permits_90d: p.permits_90d
      }));
    }
  } catch (e) {
    permitCandidates = [];
  }
  const permitsFound = permitCandidates.length;

  // 2. Overpass Mirror Cascade
  const overpassRes = await fetchOverpassBusinesses(city, trade, nominatimGeo, customOsmTags);
  overpassStatus = overpassRes.status;
  rawBusinesses.push(...overpassRes.businesses);

  // 3. BizData Scraper — auto-fallback when Overpass is weak unless explicitly disabled
  // ENABLE_BIZDATA=0 → never use; ENABLE_BIZDATA=1 or unset → use when <5 Overpass results
  const bizDataExplicitlyOff = env.ENABLE_BIZDATA === "0" || env.ENABLE_BIZDATA === "false";
  if (rawBusinesses.length < 5 && !bizDataExplicitlyOff) {
    const bizDataRes = await fetchBizDataBusinesses(city, trade);
    bizdataStatus = bizDataRes.status;
    rawBusinesses.push(...bizDataRes.businesses);
  } else {
    bizdataStatus = rawBusinesses.length >= 5
      ? `skipped (have ${rawBusinesses.length} results)`
      : "disabled (ENABLE_BIZDATA=0)";
  }

  // Deduplicate: permit candidates go first
  const allCandidates = [...permitCandidates, ...rawBusinesses];
  const seen = new Set<string>();
  const deduped: any[] = [];
  for (const item of allCandidates) {
    const normName = (item.name || "").toLowerCase().trim().replace(/[^a-z0-9]/g, "");
    if (normName && !seen.has(normName)) {
      seen.add(normName);
      deduped.push(item);
    }
  }

  const discoveredRaw = allCandidates.length;
  const filtered = discoveredRaw - deduped.length;
  const reason = deduped.length > 0 
    ? `Discovered ${deduped.length} businesses for ${city} - ${trade} across discovery cascade`
    : `Zero businesses discovered for ${city} - ${trade}. Nominatim: ${nominatimStatus}, Overpass: ${overpassStatus}, BizData: ${bizdataStatus}`;

  const diagnostics: DiscoveryDiagnostics = {
    city,
    trade,
    nominatim_status: nominatimStatus,
    overpass_status: overpassStatus,
    bizdata_status: bizdataStatus,
    discovered_raw: discoveredRaw,
    filtered,
    reason,
    permits_found: permitsFound
  };

  // Cache in KV for 24h
  if (env.CACHE && deduped.length > 0) {
    try {
      await env.CACHE.put(cacheKey, JSON.stringify(deduped), { expirationTtl: 86400 });
    } catch (e) {}
  }

  return { businesses: deduped, diagnostics };
}

/**
 * Backward compatibility wrapper
 */
export async function fetchLocalBusinesses(city: string, trade: string, env: Env): Promise<any[]> {
  const res = await fetchLocalBusinessesWithDiagnostics(city, trade, env);
  return res.businesses;
}

/**
 * Helper to call Gemini models with 5.5 second timeout and return parsed JSON
 */
async function tryGemini<T = { subject: string; body: string }>(model: string, apiKey: string, prompt: string): Promise<T | null> {
  console.log(`[Gemini Cascade] Calling model: [${model}]`);
  
  try {
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    const res = await fetch(geminiUrl, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.6
        }
      }),
      signal: AbortSignal.timeout(5500)
    });

    if (res.ok) {
      const data: any = await res.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (rawText) {
        const parsed = JSON.parse(rawText.trim());
        if (parsed) {
          if ((parsed as any).subject && (parsed as any).body) {
            console.log(`[Gemini Cascade] Success using model: [${model}]`);
            return parsed as T;
          } else if ((parsed as any).segments) {
            console.log(`[Gemini Cascade] Success parsed segments using model: [${model}]`);
            return parsed as T;
          }
          return parsed as T;
        }
      }
    } else {
      console.warn(`[Gemini Cascade] Model [${model}] returned status: [${res.status}]`);
    }
  } catch (e: any) {
    console.warn(`[Gemini Cascade] Model [${model}] request failed:`, e.message || e);
  }
  return null;
}

/**
 * Expand Tenant ICP using Gemini or cached/stored expansion JSON
 */
export async function expandTenantIcp(
  env: Env, 
  tc: any
): Promise<{ segments: { label: string; osm_tags: string[]; keywords: string[]; why: string }[] } | null> {
  if (!tc) return null;

  // 1. If tc.icp_expansion_json exists and (tc.updated_at || "") <= (tc.icp_expanded_at || ""), return parsed
  if (tc.icp_expansion_json && (tc.updated_at || "") <= (tc.icp_expanded_at || "")) {
    try {
      const parsed = typeof tc.icp_expansion_json === "string" ? JSON.parse(tc.icp_expansion_json) : tc.icp_expansion_json;
      if (parsed && Array.isArray(parsed.segments)) {
        return parsed;
      }
    } catch (e) {
      console.warn("[expandTenantIcp] Error parsing cached icp_expansion_json:", e);
    }
  }

  // 2. Call Gemini with tryGemini
  const apiKey = env.GEMINI_FOUNDER_API_KEY || env.GEMINI_SECONDARY_API_KEY;
  if (!apiKey) {
    return null;
  }

  const modelsStr = env.GEMINI_MODELS || "gemini-3.5-flash-lite";
  const modelList = modelsStr.split(",").map(m => m.trim()).filter(Boolean);
  const modelsToTry = modelList.slice(0, 2);

  const prompt = `Negocio local: ${tc.tenant_name || ""}, industria ${tc.industry || ""}, nicho ${tc.niche || ""}, ICP ${tc.icp_description || ""}. Devuelve SOLO JSON {segments:[{label,osm_tags,keywords,why}]}, máximo 6 segmentos de CLIENTES que le compran a este negocio, ordenados por probabilidad de compra recurrente. osm_tags: 1 a 3 etiquetas OSM válidas como office=estate_agent o amenity=restaurant. Sin texto extra.`;

  let geminiResult: any = null;
  for (const model of modelsToTry) {
    geminiResult = await tryGemini<any>(model, apiKey, prompt);
    if (geminiResult) break;
  }

  if (!geminiResult || !Array.isArray(geminiResult.segments)) {
    return null;
  }

  // 3. Validate segments: max 6 segments, each osm_tag with /^[a-z_]+=[a-z_]+$/
  const osmTagRegex = /^[a-z_]+=[a-z_]+$/;
  const validatedSegments: { label: string; osm_tags: string[]; keywords: string[]; why: string }[] = [];

  for (const seg of geminiResult.segments.slice(0, 6)) {
    if (!seg || typeof seg !== "object") continue;
    const label = String(seg.label || "").trim();
    if (!label) continue;

    const rawTags = Array.isArray(seg.osm_tags) ? seg.osm_tags : [];
    const validTags = rawTags
      .map((t: any) => String(t || "").trim().toLowerCase())
      .filter((t: string) => osmTagRegex.test(t));

    const keywords = Array.isArray(seg.keywords) 
      ? seg.keywords.map((k: any) => String(k || "").trim()).filter(Boolean)
      : [];
    const why = String(seg.why || "").trim();

    validatedSegments.push({
      label,
      osm_tags: validTags,
      keywords,
      why
    });
  }

  if (validatedSegments.length === 0) {
    return null;
  }

  const expansionResult = { segments: validatedSegments };
  const expandedAt = new Date().toISOString();
  const expansionJson = JSON.stringify(expansionResult);

  // 4. Save with UPDATE tenant_config inside try/catch
  if (env.RADAR_DB && tc.tenant_id) {
    try {
      await env.RADAR_DB.prepare(
        "UPDATE tenant_config SET icp_expansion_json = ?, icp_expanded_at = ? WHERE tenant_id = ?"
      ).bind(expansionJson, expandedAt, tc.tenant_id).run();
    } catch (saveErr) {
      console.warn("[expandTenantIcp] Failed to save icp_expansion_json to D1 (migration 0024 may be pending):", saveErr);
    }
  }

  // Also update in-memory object properties so caller sees updated state
  tc.icp_expansion_json = expansionJson;
  tc.icp_expanded_at = expandedAt;

  return expansionResult;
}

/**
 * Trade Psychology Copywriting Engine (Groq / Gemini / Fallback)
 */
async function generateAICopy(
  prospect: any, 
  variantId: string, 
  env: Env,
  missionConfig?: MissionConfig
): Promise<{ subject: string; body: string }> {
  const language = (missionConfig?.languages && missionConfig.languages[0]) || "en";
  const isSpanish = language.toLowerCase().startsWith("es");
  const demoLink = prospect.demo_token 
    ? `https://bvelt.app/demo?p=${prospect.demo_token}`
    : "https://bvelt.app/demo";

  let tenantInfo: any = null;
  if (prospect.mode === 'tenant' && prospect.tenant_id) {
    try {
      tenantInfo = await env.RADAR_DB.prepare("SELECT * FROM tenant_config WHERE tenant_id = ?").bind(prospect.tenant_id).first() as any;
    } catch (e) {}
  }

  // Weather signal custom template branch
  if (prospect.signal_event && prospect.signal_area && !tenantInfo) {
    const subject = isSpanish
      ? `${prospect.signal_event} para ${prospect.signal_area} - consulta para ${prospect.name}`
      : `${prospect.signal_event} for ${prospect.signal_area} - quick question for ${prospect.name}`;

    const bodyBase = isSpanish
      ? `Hola equipo de ${prospect.name}, vi la ${prospect.signal_event} para ${prospect.signal_area}. Días como hoy suelen traer un aluvión de llamadas, y cada llamada que va al buzón de voz es un trabajo que puede irse a otra parte. Soy Rainer y creé Bvelt, una aplicación sencilla que ayuda a pequeñas empresas de servicios a dar seguimiento a llamadas perdidas y presupuestos antiguos. Preparé una breve demo para ${prospect.name} aquí: ${demoLink}. ¿Vale la pena echarle un vistazo?`
      : `Hi ${prospect.name} team, I saw the ${prospect.signal_event} for ${prospect.signal_area}. Days like this usually bring a rush of calls, and every call that goes to voicemail is a job that may go to someone else. I'm Rainer, and I built Bvelt, a simple app that helps small service businesses follow up on missed calls and old estimates. I made a short demo for ${prospect.name} here: ${demoLink}. Worth a look?`;

    const footer = buildLegalFooter(env);
    const fullBody = footer ? `${bodyBase}\n\n${footer}` : bodyBase;

    return { subject, body: fullBody };
  }

  let rawAngle = (prospect.bvelt_angle || prospect.bveltAngle || "missed_calls").toLowerCase().trim();
  if (rawAngle === "contact_gap") rawAngle = "sms_gap";
  else if (rawAngle === "lead_capture_gap") rawAngle = "lead_reactivation";
  else if (rawAngle === "missed_lead_response") rawAngle = "missed_calls";

  const bveltAngle = rawAngle;
  let angleFocus = "";

  if (tenantInfo) {
    if (isSpanish) {
      angleFocus = `ACTÚA COMO: Representante de ${tenantInfo.tenant_name}. Somos expertos en ${tenantInfo.industry}.
      ENFOQUE: Ofrecemos servicios de ${tenantInfo.niche} para ${prospect.trade}.
      VALOR: Garantizamos respuesta en menos de 60 segundos 24/7 mediante nuestra plataforma Bvelt. Sabemos que en ${prospect.city} la velocidad es lo que cierra contratos.`;
    } else {
      angleFocus = `ACT AS: Representative of ${tenantInfo.tenant_name}. We are experts in ${tenantInfo.industry}.
      FOCUS: Offering ${tenantInfo.niche} services for ${prospect.trade}.
      VALUE: We guarantee response in under 60 seconds 24/7 via our Bvelt platform. We know that in ${prospect.city}, speed is what closes contracts.`;
    }
  } else {
    // Existing Founder mode logic
    if (isSpanish) {
      if (bveltAngle === "after_hours") {
        angleFocus = "ANGLE: AFTER-HOURS EMERGENCY (Urgencias fuera de horario). Veo que se anuncian servicios de urgencia las 24 horas pero solo tienen una línea telefónica de voz. Pregunta respetuosamente qué pasa con esas llamadas de emergencia de alto valor cuando sus técnicos están ocupados en otro servicio.";
      } else if (bveltAngle === "sms_gap" || bveltAngle === "contact_gap") {
        angleFocus = "ANGLE: SMS/TEXT GAP (Falta de mensajería). Veo que muestran el teléfono muy visible, pero no ofrecen opciones de mensajería instantánea ni SMS automáticos para los clientes. Pregunta respetuosamente qué porcentaje de clientes potenciales pierden porque la gente prefiere enviar mensajes en lugar de llamar por teléfono.";
      } else if (bveltAngle === "booking_gap") {
        angleFocus = "ANGLE: BOOKING GAP (Reserva en línea). Veo que ofrecen reserva o cita en línea; pregunta qué pasa con las solicitudes que llegan fuera de horario.";
      } else if (bveltAngle === "quote_followup") {
        angleFocus = "ANGLE: QUOTE/ESTIMATE FOLLOW-UP (Seguimiento de presupuestos). Veo que tienen un formulario de solicitud de presupuesto en línea o cotizaciones gratis. Pregunta respetuosamente cómo están haciendo el seguimiento de los presupuestos enviados para asegurarse de cerrar esos trabajos pendientes.";
      } else if (bveltAngle === "lead_capture_gap") {
        angleFocus = "ANGLE: LEAD CAPTURE GAP (Captura de prospectos). Veo que ofrecen servicios pero no tienen una forma clara de capturar datos de visitantes rápidamente. Pregunta respetuosamente qué pasa con los visitantes que abandonan la página sin llamar.";
      } else if (bveltAngle === "lead_reactivation") {
        angleFocus = "ANGLE: LEAD REACTIVATION (Reactivación de prospectos). Veo que atienden múltiples zonas geográficas y tienen formularios de contacto. Pregunta respetuosamente qué pasa con los prospectos fríos o consultas no cerradas una vez que salen de su embudo activo.";
      } else {
        angleFocus = "ANGLE: MISSED CALLS (Llamadas perdidas). Pregunta respetuosamente qué ocurre en su negocio cuando entran llamadas de clientes nuevos y los técnicos están ocupados atendiendo un servicio o en una instalación de campo, de modo que la llamada va al correo de voz. NO utilices frases como 'Veo su perfil' ni 'He observado' ni 'I noticed' ya que no se ha detectado ninguna señal específica en su sitio web para este ángulo.";
      }
    } else {
      if (bveltAngle === "after_hours") {
        angleFocus = "ANGLE: AFTER-HOURS EMERGENCY. I noticed you advertise 24/7 emergency support but direct visitors exclusively to a phone line. Ask what happens to those high-margin emergency calls when your technicians are already out on another active job.";
      } else if (bveltAngle === "sms_gap" || bveltAngle === "contact_gap") {
        angleFocus = "ANGLE: SMS/TEXT GAP. I noticed you display a phone line prominently, but don't offer any text-back or SMS communication options for customers. Ask what percentage of consumers they might be losing because people prefer to text instead of making a voice call.";
      } else if (bveltAngle === "booking_gap") {
        angleFocus = "ANGLE: BOOKING GAP. I noticed you offer online booking or appointments; ask what happens to booking requests that come in after hours.";
      } else if (bveltAngle === "quote_followup") {
        angleFocus = "ANGLE: QUOTE/ESTIMATE FOLLOW-UP. I noticed you have an online quote request form or advertise free estimates. Ask how they are currently following up on sent estimates to ensure they lock in those pending jobs.";
      } else if (bveltAngle === "lead_capture_gap") {
        angleFocus = "ANGLE: LEAD CAPTURE GAP. I noticed you offer services but lack a fast lead capture form. Ask what happens to site visitors who leave without placing a direct call.";
      } else if (bveltAngle === "lead_reactivation") {
        angleFocus = "ANGLE: LEAD REACTIVATION. I noticed you serve multiple geographic service areas and have lead forms. Ask what happens to cold or unconverted inquiries once they drop out of their active pipeline.";
      } else {
        angleFocus = "ANGLE: MISSED CALLS. Ask what happens in their business when new client phone calls go straight to voicemail because the technicians are busy on-site on an active job. DO NOT use phrases like 'I noticed' or 'I saw your profile' because no specific signal was detected on their site for this generic angle.";
      }
    }
  }

  const prompt = isSpanish ? `
    Eres un redactor publicitario experto en ventas (sales copywriter). Escribes correos fríos directos y profesionales.
    ${tenantInfo ? `Remitente: ${tenantInfo.tenant_name} (${tenantInfo.industry})` : "Remitente: Bvelt (https://bvelt.app)"}
    
    Destinatario:
    - Empresa: ${prospect.name}
    - Ubicación: ${prospect.city}
    - Trade: ${prospect.trade}
 
    Instrucciones del ángulo de prospección:
    ${angleFocus}

    REGLAS:
    1. Idioma: Español técnico y profesional.
    2. Longitud: 85 a 105 palabras.
    3. Tono: Respetuoso, directo, mentalidad de emprendedor de guerrilla.
    4. Exactamente UNA oración sobre el valor tecnológico: "${tenantInfo ? `Usamos Bvelt para garantizar que nunca pierdas una oportunidad con nosotros por falta de respuesta.` : "Bvelt reactiva automáticamente prospectos perdidos y recupera trabajos para contratistas mediante SMS automatizados rápidos."}"
    5. Soft CTA: "Si quiere ver cómo funciona en 2 minutos → ${demoLink}".
    6. SIN FIRMA NI PIE DE PÁGINA.
    7. Formato JSON: {"subject": "...", "body": "..."}
  ` : `
    You are an expert sales copywriter writing cold outreach.
    ${tenantInfo ? `Sender: ${tenantInfo.tenant_name} (${tenantInfo.industry})` : "Sender: Bvelt (https://bvelt.app)"}
    
    Target:
    - Business: ${prospect.name}
    - Location: ${prospect.city}
    - Trade: ${prospect.trade}

    Outreach Angle Instructions:
    ${angleFocus}

    RULES:
    1. Length: 85 to 105 words. Contractor-friendly and punchy.
    2. Tone: Respectful, direct, guerrilla entrepreneur mindset.
    3. Exactly ONE sentence on tech value: "${tenantInfo ? `We use Bvelt to ensure you never miss an opportunity with us due to response lag.` : "Bvelt automatically re-engages missed leads and recovers lost jobs for contractors via fast, automated SMS."}"
    4. Soft Call-to-Action: "If you'd like to see how it works in 2 minutes → ${demoLink}".
    5. NO SIGNATURE OR FOOTER.
    6. JSON format: {"subject": "...", "body": "..."}
  `;

  // 1. CASCADA GEMINI INTELIGENTE (Prioritizing models from GEMINI_MODELS, max 2 total)
  const modelsStr = env.GEMINI_MODELS || "gemini-3.5-flash-lite";
  const modelList = modelsStr.split(",").map(m => m.trim()).filter(Boolean);
  const modelsToTry = modelList.slice(0, 2);

  const apiKey = env.GEMINI_FOUNDER_API_KEY || env.GEMINI_SECONDARY_API_KEY;

  let aiUnitReserved = false;
  const tenantId = prospect.tenant_id || "founder";

  if (apiKey || env.GROQ_API_KEY) {
    aiUnitReserved = await reserveBudget(env.RADAR_DB, tenantId, 'ai_units', 1);
  }

  if (aiUnitReserved) {
    if (apiKey) {
      for (const model of modelsToTry) {
        const res = await tryGemini(model, apiKey, prompt);
        if (res) {
          await commitBudget(env.RADAR_DB, tenantId, 'ai_units', 1);
          return res;
        }
      }
    }

    // 2. GROQ FALLBACK (llama-3.3-70b-versatile)
    if (env.GROQ_API_KEY) {
      console.log(`[Gemini Cascade] Calling Groq backup...`);
      try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${env.GROQ_API_KEY}`
          },
          body: JSON.stringify({
            model: "llama-3.3-70b-versatile",
            response_format: { type: "json_object" },
            messages: [{ role: "user", content: prompt }],
            temperature: 0.6
          }),
          signal: AbortSignal.timeout(5500)
        });

        if (response.ok) {
          const data: any = await response.json();
          const content = JSON.parse(data.choices[0].message.content);
          if (content.subject && content.body) {
            console.log(`[Gemini Cascade] Success using Groq backup`);
            await commitBudget(env.RADAR_DB, tenantId, 'ai_units', 1);
            return { subject: content.subject, body: content.body };
          }
        }
      } catch (e: any) {
        console.warn("[Gemini Cascade] Groq API backup failed:", e.message);
      }
    }

    // 3. CLOUDFLARE WORKERS AI (free Neurons) — guerrilla backup, no external key
    if (env.AI && typeof env.AI.run === "function") {
      console.log(`[Gemini Cascade] Calling Workers AI (Llama) backup...`);
      try {
        const response = await env.AI.run("@cf/meta/llama-3.2-3b-instruct", {
          messages: [
            { role: "system", content: "Reply ONLY with valid JSON: {\"subject\":string,\"body\":string}. No markdown." },
            { role: "user", content: prompt }
          ],
          max_tokens: 400
        });
        let rawText = "";
        if (typeof response === "string") rawText = response;
        else if (response && typeof (response as any).response === "string") rawText = (response as any).response;
        else rawText = JSON.stringify(response);
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const content = JSON.parse(jsonMatch[0]);
          if (content.subject && content.body) {
            console.log(`[Gemini Cascade] Success using Workers AI backup`);
            await commitBudget(env.RADAR_DB, tenantId, 'ai_units', 1);
            return { subject: String(content.subject), body: String(content.body) };
          }
        }
      } catch (e: any) {
        console.warn("[Gemini Cascade] Workers AI backup failed:", e.message);
      }
    }

    // Release budget if all AI attempts failed
    await releaseBudget(env.RADAR_DB, tenantId, 'ai_units', 1);
  }

  // 4. Static High-Converting Template Fallback (always works offline)
  console.log(`[Gemini Cascade] All AI pipelines failed or budget exceeded. Reverting to deterministic backup template.`);
  return getTradePsychologyFallback(prospect.name, prospect.trade, prospect.city, bveltAngle, language, prospect.phone, prospect.demo_token, prospect.signal_event, prospect.signal_area, env);
}

/**
 * Attack kit: email + SMS + call script tailored to angle/signals.
 * Turns a scored prospect into an executable outreach package (product surface).
 */
export function buildAttackKit(p: any): {
  prospect_id: string;
  name: string;
  why_this_lead: string;
  email: { subject: string; body: string };
  sms: string;
  call_script: string;
  next_action: string;
  angle: string;
} {
  const name = String(p.name || "there");
  const city = String(p.city || "");
  const trade = String(p.trade || "service").replace(/_/g, " ");
  const angle = String(p.bvelt_angle || p.angle || "missed_calls").toLowerCase();
  const phone = p.phone ? String(p.phone) : null;
  const demo = p.demo_token ? `https://bvelt.app/demo?p=${p.demo_token}` : "https://bvelt.app/demo";

  let signals: any = {};
  try {
    signals = typeof p.signals_json === "string" ? JSON.parse(p.signals_json || "{}") : (p.signals_json || p.signals || {});
  } catch { signals = {}; }

  const reasons: string[] = [];
  if (signals.sms_gap || signals.no_own_website) reasons.push("sin canal digital de respuesta rápida");
  if (signals.emergency) reasons.push("promete urgencias 24/7");
  if (!signals.booking) reasons.push("sin reserva online");
  if (p.signal_event) reasons.push(`señal climática: ${p.signal_event}`);
  if (reasons.length === 0) reasons.push("negocio local de oficio con hueco de seguimiento");

  const why = `${name} en ${city} (${trade}): ${reasons.join("; ")}.`;

  let subject = `Quick question for ${name}`;
  let emailBody = "";
  let sms = "";
  let call = "";

  if (angle.includes("after") || signals.emergency) {
    subject = `${name} — after-hours calls`;
    emailBody = `Hi ${name} team — saw you handle emergency / after-hours work in ${city}. When the phone rings at 9pm and you're already on a job, those callers often go to whoever answers first.\n\nBvelt recovers those missed calls and old quotes automatically. 60-second look: ${demo}\n\nWorth a glance?`;
    sms = `Hi, it's about ${name} after-hours calls in ${city}. Quick idea to stop losing emergency jobs to voicemail — ${demo}`;
    call = `Hook: "I noticed ${name} advertises emergency service in ${city}."\nPain: "When you're on a job and the next emergency rings, who catches it?"\nPitch: "Bvelt texts back in under a minute and books or queues the lead."\nClose: "Can I send a 60-second demo link?"`;
  } else if (angle.includes("sms") || signals.sms_gap || signals.no_own_website) {
    subject = `${name} — texting gap`;
    emailBody = `Hi ${name} — a lot of homeowners in ${city} text before they call. If the only option is a phone number, those jobs slip away.\n\nBvelt adds instant SMS follow-up for missed calls and web leads. Demo: ${demo}`;
    sms = `${name}: many ${trade} leads in ${city} prefer text. Bvelt covers missed calls by SMS — ${demo}`;
    call = `Hook: "Quick one — do most of your ${city} leads still only call, or do they text?"\nPain: "Phone-only shops lose the texters."\nPitch: "Bvelt answers the gap without another hire."\nClose: "I'll text you the demo — 60 seconds."`;
  } else if (angle.includes("quote") || signals.quote_request) {
    subject = `${name} — quote follow-up`;
    emailBody = `Hi ${name} — estimates that sit without a follow-up are the quietest revenue leak in ${trade}.\n\nBvelt nudges old quotes and missed calls so jobs don't go cold. ${demo}`;
    sms = `${name}: following up on open quotes in ${city} recovers jobs. See Bvelt: ${demo}`;
    call = `Hook: "How do you follow up estimates that didn't close last week?"\nPain: "Most shops never touch them again."\nPitch: "Bvelt sequences those automatically."\nClose: "Demo link takes one minute."`;
  } else {
    subject = p.draft_subject || `Missed calls at ${name}`;
    emailBody = p.draft_body || `Hi ${name} team in ${city} — every missed call is a job that may go to the next contractor. Bvelt recovers them: ${demo}`;
    sms = `Hi ${name} — idea to recover missed ${trade} calls in ${city}: ${demo}`;
    call = `Hook: "I was looking at ${trade} operators in ${city} and ${name} stood out."\nPain: "Missed calls during busy hours."\nPitch: "Bvelt covers the gap."\nClose: "OK to send a short demo?"`;
  }

  const next =
    phone && !p.email ? "Llamar o WhatsApp primero (solo teléfono)." :
    p.email ? "Enviar correo + registrar decisión Enviar." :
    "Buscar contacto y luego kit SMS/llamada.";

  return {
    prospect_id: String(p.id || ""),
    name,
    why_this_lead: why,
    email: { subject, body: emailBody },
    sms,
    call_script: call,
    next_action: next,
    angle
  };
}

/**
 * Psychological Cold Outreach Templates by Angle
 */
function getTradePsychologyFallback(
  name: string, 
  trade: string, 
  city: string, 
  bveltAngle: string,
  language: string = "en",
  phone?: string | null,
  demoToken?: string | null,
  signalEvent?: string | null,
  signalArea?: string | null,
  env?: Env
): { subject: string; body: string } {
  const cTrade = String(trade || 'service').replace(/_/g, ' ');
  const isSpanish = language.toLowerCase().startsWith("es");
  const ctaLink = demoToken
    ? `https://bvelt.app/demo?p=${demoToken}`
    : "https://bvelt.app/demo";

  if (signalEvent && signalArea) {
    const subject = isSpanish
      ? `${signalEvent} para ${signalArea} - consulta para ${name}`
      : `${signalEvent} for ${signalArea} - quick question for ${name}`;

    const bodyBase = isSpanish
      ? `Hola equipo de ${name}, vi la ${signalEvent} para ${signalArea}. Días como hoy suelen traer un aluvión de llamadas, y cada llamada que va al buzón de voz es un trabajo que puede irse a otra parte. Soy Rainer y creé Bvelt, una aplicación sencilla que ayuda a pequeñas empresas de servicios a dar seguimiento a llamadas perdidas y presupuestos antiguos. Preparé una breve demo para ${name} aquí: ${ctaLink}. ¿Vale la pena echarle un vistazo?`
      : `Hi ${name} team, I saw the ${signalEvent} for ${signalArea}. Days like this usually bring a rush of calls, and every call that goes to voicemail is a job that may go to someone else. I'm Rainer, and I built Bvelt, a simple app that helps small service businesses follow up on missed calls and old estimates. I made a short demo for ${name} here: ${ctaLink}. Worth a look?`;

    const footer = env ? buildLegalFooter(env) : "";
    const fullBody = footer ? `${bodyBase}\n\n${footer}` : bodyBase;

    return { subject, body: fullBody };
  }

  if (isSpanish) {
    if (bveltAngle === "after_hours") {
      return {
        subject: `¿Servicios de emergencia de ${cTrade} en ${name}?`,
        body: `Hola equipo de ${name},\n\nHe visto su sitio web y me he dado cuenta de que ofrecen servicios de emergencia de ${cTrade} las 24 horas en ${city}, pero dirigen a los clientes exclusivamente a su línea telefónica de voz. ¿Qué pasa con esas llamadas de urgencia cuando sus técnicos ya están ocupados en un servicio?\n\nBvelt es una aplicación sencilla que reactiva automáticamente prospectos perdidos y recupera trabajos para contratistas mediante SMS automatizados rápidos.\n\nSi quiere ver cómo funciona en 2 minutos → ${ctaLink}`
      };
    } else if (bveltAngle === "sms_gap" || bveltAngle === "contact_gap") {
      return {
        subject: `¿Sin opción de mensajes de texto para clientes de ${name}?`,
        body: `Hola equipo de ${name},\n\nHe estado revisando su sitio de servicios de ${cTrade} en ${city}. Veo que muestran su teléfono de forma muy visible, pero no ofrecen ninguna opción de chat o SMS de respuesta automática. ¿Qué porcentaje de clientes potenciales se pierden porque prefieren enviar un mensaje de texto en lugar de realizar una llamada de voz?\n\nBvelt es una aplicación sencilla que reactiva automáticamente prospectos perdidos y recupera trabajos para contratistas mediante SMS automatizados rápidos.\n\nSi quiere ver cómo funciona en 2 minutos → ${ctaLink}`
      };
    } else if (bveltAngle === "booking_gap") {
      return {
        subject: `Reservas y citas de ${cTrade} en ${name}`,
        body: `Hola equipo de ${name},\n\nHe visto que ofrecen una opción de reserva o cita en línea para sus servicios de ${cTrade} en ${city}. ¿Qué ocurre con las solicitudes de reserva que les llegan fuera de horario o los fines de semana? ¿Cómo aseguran que esos clientes no se enfríen o agenden con un competidor antes de que puedan confirmar la cita?\n\nBvelt es una aplicación sencilla que reactiva automáticamente prospectos perdidos y recupera trabajos para contratistas mediante SMS automatizados rápidos.\n\nSi quiere ver cómo funciona en 2 minutos → ${ctaLink}`
      };
    } else if (bveltAngle === "quote_followup") {
      return {
        subject: `Seguimiento de presupuestos de ${cTrade} en ${name}`,
        body: `Hola equipo de ${name},\n\nHe notado que tienen un formulario de solicitud de presupuesto en línea para sus servicios de ${cTrade} en ${city}. Una vez que envían estas estimaciones de precios, ¿cómo están haciendo el seguimiento actualmente para asegurarse de cerrar esos trabajos pendientes?\n\nBvelt es una aplicación sencilla que reactiva automáticamente prospectos perdidos y recupera trabajos para contratistas mediante SMS automatizados rápidos.\n\nSi quiere ver cómo funciona en 2 minutos → ${ctaLink}`
      };
    } else if (bveltAngle === "lead_capture_gap") {
      return {
        subject: `Captura de clientes de ${cTrade} en ${city} para ${name}`,
        body: `Hola equipo de ${name},\n\nHe revisado su presencia digital para servicios de ${cTrade} en ${city}. Veo que ofrecen servicios de calidad pero no cuentan con una captura rápida para visitantes que no realizan una llamada. ¿Qué ocurre con los prospectos que visitan su web fuera de horario?\n\nBvelt es una aplicación sencilla que reactiva automáticamente prospectos perdidos y recupera trabajos para contratistas mediante SMS automatizados rápidos.\n\nSi quiere ver cómo funciona en 2 minutos → ${ctaLink}`
      };
    } else if (bveltAngle === "lead_reactivation") {
      return {
        subject: `Reactivación de prospectos de ${cTrade} en ${city}`,
        body: `Hola equipo de ${name},\n\nHe visto que atienden múltiples zonas en ${city} y que tienen un formulario de contacto en su web. ¿Qué sucede con las consultas que no se cierran inmediatamente cuando salen de su embudo activo?\n\nBvelt es una aplicación sencilla que reactiva automáticamente prospectos perdidos y recupera trabajos para contratistas mediante SMS automatizados rápidos.\n\nSi quiere ver cómo funciona en 2 minutos → ${ctaLink}`
      };
    } else {
      return {
        subject: `Pregunta rápida sobre las llamadas entrantes de ${cTrade} en ${name}`,
        body: `Hola equipo de ${name},\n\nCuando su equipo está ocupado atendiendo un servicio o en una instalación de campo, ¿qué ocurre con las llamadas entrantes de clientes nuevos que van directo al buzón de voz? ¿Qué porcentaje de esos clientes potenciales cuelgan y llaman al siguiente contratista en Google?\n\nBvelt es una aplicación sencilla que reactiva automáticamente prospectos perdidos y recupera trabajos para contratistas mediante SMS automatizados rápidos.\n\nSi quiere ver cómo funciona en 2 minutos → ${ctaLink}`
      };
    }
  }

  // English fallback templates
  if (bveltAngle === "after_hours") {
    return {
      subject: `Emergency ${cTrade} service at ${name}?`,
      body: `Hi ${name} team,\n\nI noticed you advertise 24/7 emergency ${cTrade} service in ${city} and direct customers to call your phone line. What happens to those emergency calls when your team is already out on an active job?\n\nBvelt is a simple app that automatically re-engages missed leads and recovers lost jobs for contractors via fast, automated SMS.\n\nIf you'd like to see how it works in 2 minutes → ${ctaLink}`
    };
  } else if (bveltAngle === "sms_gap" || bveltAngle === "contact_gap") {
    return {
      subject: `No text option for ${name} customers?`,
      body: `Hi ${name} team,\n\nI came across your site and noticed your phone line prominently displayed for ${cTrade} services in ${city}, but didn't notice any text-back or SMS option. What percentage of potential customers drop off because they'd prefer to text instead of call?\n\nBvelt is a simple app that automatically re-engages missed leads and recovers lost jobs for contractors via fast, automated SMS.\n\nIf you'd like to see how it works in 2 minutes → ${ctaLink}`
    };
  } else if (bveltAngle === "booking_gap") {
    return {
      subject: `Online bookings at ${name}`,
      body: `Hi ${name} team,\n\nI noticed you offer online booking or appointments for your ${cTrade} services in ${city}. What happens to scheduling requests that come in after hours or over the weekend? How do you ensure those prospects don't get cold or book with a competitor before you can manually confirm?\n\nBvelt is a simple app that automatically re-engages missed leads and recovers lost jobs for contractors via fast, automated SMS.\n\nIf you'd like to see how it works in 2 minutes → ${ctaLink}`
    };
  } else if (bveltAngle === "quote_followup") {
    return {
      subject: `Following up on ${cTrade} estimates at ${name}`,
      body: `Hi ${name} team,\n\nI noticed you have an online quote request form for your ${cTrade} services in ${city}. Once you send out those pricing estimates, how are you currently following up with those prospects to lock them in?\n\nBvelt is a simple app that automatically re-engages missed leads and recovers lost jobs for contractors via fast, automated SMS.\n\nIf you'd like to see how it works in 2 minutes → ${ctaLink}`
    };
  } else if (bveltAngle === "lead_capture_gap") {
    return {
      subject: `Capturing ${cTrade} leads at ${name}`,
      body: `Hi ${name} team,\n\nI noticed your ${cTrade} site in ${city} has great service details but no fast lead capture form for visitors who don't call immediately. What happens to prospects who browse after business hours?\n\nBvelt is a simple app that automatically re-engages missed leads and recovers lost jobs for contractors via fast, automated SMS.\n\nIf you'd like to see how it works in 2 minutes → ${ctaLink}`
    };
  } else if (bveltAngle === "lead_reactivation") {
    return {
      subject: `Reviving unconverted ${cTrade} leads in ${city}`,
      body: `Hi ${name} team,\n\nI noticed you serve multiple areas around ${city} and have a lead capture form on your website. What happens to those cold or unconverted ${cTrade} leads once they leave your immediate pipeline?\n\nBvelt is a simple app that automatically re-engages missed leads and recovers lost jobs for contractors via fast, automated SMS.\n\nIf you'd like to see how it works in 2 minutes → ${ctaLink}`
    };
  } else {
    return {
      subject: `Quick question regarding incoming ${cTrade} calls at ${name}`,
      body: `Hi ${name} team,\n\nWhen your team is busy on-site or in the middle of a job, what happens to incoming calls from new clients that go straight to voicemail? What percentage of those potential clients hang up and call the next contractor on Google instead?\n\nBvelt is a simple app that automatically re-engages missed leads and recovers lost jobs for contractors via fast, automated SMS.\n\nIf you'd like to see how it works in 2 minutes → ${ctaLink}`
    };
  }
}

export function buildLegalFooter(env: Env): string {
  const senderName = env.SENDER_NAME || "Founder";
  const senderAddress = env.SENDER_POSTAL_ADDRESS || "";
  return `--\n${senderName}, founder of Bvelt\n${senderAddress}\nThis is a commercial message. If you'd rather not hear from me, reply "unsubscribe" and I'll remove you right away.`;
}

/**
 * Centralized Outbound Telegram Notification Engine
 */
export async function notifyFounder(
  env: Env,
  text: string,
  inlineButtons?: Array<Array<{ text: string; callback_data?: string; url?: string }>>
): Promise<{ ok: boolean; description?: string; result?: any }> {
  const rawBotToken = env.TELEGRAM_BOT_TOKEN ? String(env.TELEGRAM_BOT_TOKEN).trim() : "";
  const botToken = rawBotToken.replace(/^["']|["']$/g, "").replace(/^bot/i, "");
  const chatId = env.TELEGRAM_CHAT_ID ? String(env.TELEGRAM_CHAT_ID).trim().replace(/^["']|["']$/g, "") : "";

  if (!botToken || !chatId) {
    const desc = "TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is not configured in environment";
    console.warn(`[notifyFounder] ${desc}`);
    return { ok: false, description: desc };
  }

  const payload: any = {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    link_preview_options: { is_disabled: true }
  };

  if (inlineButtons && inlineButtons.length > 0) {
    payload.reply_markup = {
      inline_keyboard: inlineButtons
    };
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(6000)
    });

    const data: any = await res.json().catch(() => ({ ok: false, description: `HTTP ${res.status}: Failed to parse JSON` }));

    if (!res.ok || !data.ok) {
      console.error(`[notifyFounder] Telegram API error (${res.status}):`, data);

      if (env.RADAR_DB) {
        try {
          const today = new Date().toISOString().split("T")[0];
          const latestRun = await env.RADAR_DB.prepare(
            "SELECT id, errors_json FROM runs WHERE day = ? ORDER BY created_at DESC LIMIT 1"
          ).bind(today).first() as any || await env.RADAR_DB.prepare(
            "SELECT id, errors_json FROM runs ORDER BY created_at DESC LIMIT 1"
          ).first() as any;

          if (latestRun) {
            let errList: any[] = [];
            try { errList = JSON.parse(latestRun.errors_json || "[]"); } catch (e) {}
            errList.push({
              source: "telegram_outbound",
              status: res.status,
              description: data.description || "Telegram API rejected sendMessage",
              chat_id: String(chatId).trim(),
              timestamp: new Date().toISOString()
            });
            await env.RADAR_DB.prepare("UPDATE runs SET errors_json = ? WHERE id = ?")
              .bind(JSON.stringify(errList), latestRun.id).run();
          }
        } catch (dbErr) {
          console.error("[notifyFounder] Failed to log error to D1 runs:", dbErr);
        }
      }

      return { ok: false, description: data.description || `HTTP ${res.status}` };
    }

    return { ok: true, description: "Sent successfully", result: data.result };
  } catch (err: any) {
    console.error("[notifyFounder] Network/Exception error:", err.message);
    if (env.RADAR_DB) {
      try {
        const today = new Date().toISOString().split("T")[0];
        const latestRun = await env.RADAR_DB.prepare(
          "SELECT id, errors_json FROM runs WHERE day = ? ORDER BY created_at DESC LIMIT 1"
        ).bind(today).first() as any;
        if (latestRun) {
          let errList: any[] = [];
          try { errList = JSON.parse(latestRun.errors_json || "[]"); } catch (e) {}
          errList.push({
            source: "telegram_outbound_exception",
            error: err.message,
            timestamp: new Date().toISOString()
          });
          await env.RADAR_DB.prepare("UPDATE runs SET errors_json = ? WHERE id = ?")
            .bind(JSON.stringify(errList), latestRun.id).run();
        }
      } catch (e) {}
    }
    return { ok: false, description: err.message };
  }
}

/**
 * Format qualified prospect into clean HTML card for Telegram
 */
export function formatProspectTelegramMessage(prospect: any, env?: Env): string {
  const scoreEmoji = (prospect.score || 0) >= 80 ? "🔥" : (prospect.score || 0) >= 60 ? "⚡" : "🔍";
  const draftBody = prospect.draft_body || "";
  const draftPreview = draftBody.substring(0, 300);
  const angle = prospect.bvelt_angle ? prospect.bvelt_angle.replace(/_/g, " ") : "Missed lead & call recovery";

  let warning = "";
  if (env && !env.SENDER_POSTAL_ADDRESS) {
    warning = `⚠ <b>Falta dirección postal: no enviar</b>\n\n`;
  }

  let msg = `<b>📡 Bvelt Radar: Prospecto Calificado</b> ${scoreEmoji}\n\n`;
  if (warning) {
    msg = warning + msg;
  }
  msg += `🏢 <b>${escapeHtml(prospect.name)}</b>\n`;
  msg += `📍 <b>Ciudad:</b> ${escapeHtml(prospect.city)}\n`;
  msg += `🛠 <b>Rubro:</b> ${escapeHtml(prospect.trade)}\n`;
  msg += `📊 <b>Score:</b> <b>${prospect.score}/100</b>\n`;
  msg += `📧 <b>Email:</b> <code>${escapeHtml(prospect.email || "No email")}</code>\n`;
  if (prospect.phone) {
    msg += `📞 <b>Tel:</b> <code>${escapeHtml(prospect.phone)}</code>\n`;
  }
  if (prospect.website) {
    msg += `🌐 <b>Web:</b> <a href="${escapeHtml(prospect.website)}">${escapeHtml(prospect.website)}</a>\n`;
  }
  msg += `💡 <b>Ángulo:</b> ${escapeHtml(angle)}\n`;
  msg += `🔗 <b>Plataforma:</b> <a href="https://bvelt.app">https://bvelt.app</a>\n\n`;
  if (draftPreview) {
    msg += `📝 <b>Borrador (${escapeHtml(prospect.draft_subject || "Propuesta")}):</b>\n<pre>${escapeHtml(draftPreview)}${draftBody.length > 300 ? "..." : ""}</pre>`;
  }
  return msg;
}

/**
 * Dispatch Interactive Telegram Alert with InlineKeyboardMarkup Action Buttons
 */
async function dispatchInteractiveTelegramAlert(
  topProspects: any[], 
  cities: string[], 
  trades: string[], 
  env: Env
): Promise<void> {
  for (const p of topProspects) {
    if (p.score < 45 || !p.email || isHardRejectedChain(p.name)) continue;
    const text = formatProspectTelegramMessage(p, env);
    const inlineButtons = [
      [
        { text: "✅ Approve", callback_data: `approve:${p.id}` },
        { text: "❌ Discard", callback_data: `discard:${p.id}` }
      ]
    ];
    await notifyFounder(env, text, inlineButtons);
  }
}

/**
 * Website Scraper for contact info & revenue-leak signals detection (5s timeout, up to 5 same-domain pages in preferred order)
 */
async function scrapeWebsiteContact(url: string): Promise<{ 
  email: string | null; 
  phone: string | null; 
  signals: Record<string, boolean>;
}> {
  const signals = {
    contact_form: false,
    quote_request: false,
    booking: false,
    call_cta: false,
    sms_gap: false,
    emergency: false,
    multiple_areas: false,
    specific_landing_pages: false,
    estimate_language: false,
    lead_capture: false
  };

  let finalEmail: string | null = null;
  let finalPhone: string | null = null;
  let hasLiveChat = false;
  let hasSmsLanguage = false;

  const targetHost = getDomain(url);
  if (!targetHost) return { email: null, phone: null, signals };

  const rootUrl = url.startsWith("http") ? url : `https://${url}`;
  const crawlQueue: { url: string; pageType: string; priority: number }[] = [
    { url: rootUrl, pageType: "homepage", priority: 1 }
  ];

  const visitedUrls = new Set<string>();
  let pagesFetched = 0;

  while (crawlQueue.length > 0 && pagesFetched < 5) {
    // Sort crawl queue by priority
    crawlQueue.sort((a, b) => a.priority - b.priority);
    const nextItem = crawlQueue.shift()!;
    
    // Normalize url for deduplication
    const normalizedTarget = nextItem.url.toLowerCase().replace(/\/$/, "");
    if (visitedUrls.has(normalizedTarget)) continue;
    visitedUrls.add(normalizedTarget);

    try {
      const res = await fetch(nextItem.url, {
        headers: { "User-Agent": "BveltRadar/1.0 (contact: radar@bvelt.app)" },
        signal: AbortSignal.timeout(1500) // 1.5s timeout per page fetch
      });

      if (!res.ok) continue;
      pagesFetched++;

      // Lightweight slice to max 50KB to keep within Workers memory limits
      const html = (await res.text()).slice(0, 50000);
      const normalizedHtml = html.toLowerCase();

      // 1. Email extraction if not found yet
      if (!finalEmail) {
        const mailtoMatch = html.match(/href="mailto:([^"?#]+)"/i);
        finalEmail = mailtoMatch ? mailtoMatch[1].trim() : null;

        if (!finalEmail) {
          const emailRegex = /[a-zA-Z0-9._%+-]+@(?!gmail\.com)(?!yahoo\.com)(?!hotmail\.com)[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;
          const matches = html.match(emailRegex);
          if (matches && matches.length > 0) {
            const business = matches.filter(e => /^(info|office|contact|hello|service|admin|support|sales)/i.test(e));
            finalEmail = business.length > 0 ? business[0] : matches[0];
          }
        }
      }

      // 2. Phone extraction if not found yet
      if (!finalPhone) {
        const telMatch = html.match(/href="tel:([^"]+)"/i);
        finalPhone = telMatch ? telMatch[1].trim() : null;

        if (!finalPhone) {
          const phoneRegex = /(?:\+?1[-. ]?)?\(?([0-9]{3})\)?[-. ]?([0-9]{3})[-. ]?([0-9]{4})/g;
          const phoneMatches = html.match(phoneRegex);
          if (phoneMatches && phoneMatches.length > 0) {
            finalPhone = phoneMatches[0];
          }
        }
      }

      // 3. Aggregate Heuristics across all crawled pages
      if (/contact-form|contact_form|contacto|formulario|<form|textarea|input type="text"/i.test(normalizedHtml)) signals.contact_form = true;
      if (/request-a-quote|get an estimate|free estimate|request quote|request estimate|quote request|presupuesto|cotizacion|cotización|cotizar|estimacion|estimación/i.test(normalizedHtml)) signals.quote_request = true;
      if (/book online|book appointment|schedule online|booking|schedule appointment|book now|reservar|reserva|agendar|cita/i.test(normalizedHtml)) signals.booking = true;
      if (/call now|call us|phone:|tel:|click to call|llamar|telefono|teléfono|contacto/i.test(normalizedHtml)) signals.call_cta = true;
      if (/emergency|24\/7|after hours|24 hour|after-hours|emergency service|24 hours|urgencia|urgencias|24 horas|guardia|emergencia/i.test(normalizedHtml)) signals.emergency = true;
      if (/service areas|serving|areas we serve|locations|serve areas|cobertura|zonas|sucursales|ciudades/i.test(normalizedHtml)) signals.multiple_areas = true;
      if (/href="\/services\/|href="\/service\/|href="\/areas\/|href="\/servicios\/|href="\/cobertura\//i.test(normalizedHtml)) signals.specific_landing_pages = true;
      if (/estimate|quote|calculator|bidding|bid|presupuesto|cotizar|cotizacion|cotización|estimacion|estimación|tarifa|precio/i.test(normalizedHtml)) signals.estimate_language = true;
      if (/newsletter|subscribe|opt-in|sign up for|promotions|coupon|boletin|boletín|suscribir|suscríbete|descuento|promocion|promoción/i.test(normalizedHtml)) signals.lead_capture = true;

      if (/crisp\.chat|tawk\.to|intercom|tidio|zendesk|drift|hubspot|livechat/i.test(normalizedHtml)) hasLiveChat = true;
      if (/text us|sms|send a text|text option|escribenos|escríbenos|enviar texto|mensaje de texto|whatsapp|whastapp/i.test(normalizedHtml)) hasSmsLanguage = true;

      // Extract links to same host only if we are scanning the homepage to prevent deep recursion
      if (nextItem.pageType === "homepage") {
        const linkRegex = /href="([^"]+)"/gi;
        let match;
        while ((match = linkRegex.exec(html)) !== null) {
          const href = match[1].trim();
          if (href.startsWith("javascript:") || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
            continue;
          }
          let fullUrl = "";
          if (href.startsWith("//")) {
            fullUrl = "https:" + href;
          } else if (href.startsWith("/")) {
            fullUrl = rootUrl.replace(/\/$/, "") + href;
          } else if (!href.startsWith("http")) {
            fullUrl = rootUrl.replace(/\/$/, "") + "/" + href;
          } else {
            fullUrl = href;
          }

          const linkHost = getDomain(fullUrl);
          if (linkHost === targetHost) {
            const pathLower = fullUrl.toLowerCase();
            let pageType = "other";
            let priority = 6;

            if (pathLower.includes("book") || pathLower.includes("schedule") || pathLower.includes("appointment") || pathLower.includes("cita")) {
              pageType = "booking";
              priority = 5;
            } else if (pathLower.includes("quote") || pathLower.includes("estimate") || pathLower.includes("presupuesto") || pathLower.includes("cotizacion")) {
              pageType = "quote";
              priority = 4;
            } else if (pathLower.includes("contact") || pathLower.includes("contacto") || pathLower.includes("about") || pathLower.includes("nosotros")) {
              pageType = "contact";
              priority = 3;
            } else if (pathLower.includes("service") || pathLower.includes("servicios") || pathLower.includes("work")) {
              pageType = "services";
              priority = 2;
            }

            crawlQueue.push({ url: fullUrl, pageType, priority });
          }
        }
      }

      // Early stop if we found email, phone and booking signals
      if (finalEmail && finalPhone && signals.booking && signals.quote_request) {
        break;
      }
    } catch (e) {
      // Proceed to next page in queue
    }
  }

  signals.sms_gap = (signals.call_cta || !!finalPhone) && !hasSmsLanguage && !hasLiveChat;

  return { email: finalEmail, phone: finalPhone, signals };
}

/**
 * Hunter.io Domain Search (Email finder)
 */
async function fetchHunterEmail(domain: string, apiKey: string): Promise<string | null> {
  const url = `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&api_key=${apiKey}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (res.ok) {
    const body: any = await res.json();
    if (body.data?.emails?.length > 0) {
      const best = body.data.emails.find((e: any) => e.type === "generic") || body.data.emails[0];
      return best ? best.value : null;
    }
  }
  return null;
}

/**
 * Internal Email Verification Abstraction (Format, Disposable, Deliverability via ABSTRACT_API_KEY)
 */
export interface EmailVerificationResult {
  valid: boolean;
  deliverability: string;
  is_disposable: boolean;
  is_catchall: boolean;
  quality_score?: number;
  reason: string;
}

export async function verifyEmail(email: string, env: Env): Promise<EmailVerificationResult> {
  const normEmail = email.toLowerCase().trim();
  const timestamp = new Date().toISOString();

  // 1. Format validation
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(normEmail)) {
    return {
      valid: false,
      deliverability: "INVALID_FORMAT",
      is_disposable: false,
      is_catchall: false,
      reason: "Invalid email format"
    };
  }

  // 2. Known disposable domains check
  const disposableDomains = ["mailinator.com", "tempmail.com", "10minutemail.com", "yopmail.com", "guerrillamail.com", "trashmail.com"];
  const domain = normEmail.split("@")[1];
  if (disposableDomains.includes(domain)) {
    return {
      valid: false,
      deliverability: "DISPOSABLE",
      is_disposable: true,
      is_catchall: false,
      reason: "Disposable email domain detected"
    };
  }

  // 3. Check D1 cache
  try {
    const cached = await env.RADAR_DB.prepare("SELECT * FROM email_verifications WHERE email = ?").bind(normEmail).first() as any;
    if (cached) {
      return {
        valid: cached.is_valid === 1,
        deliverability: cached.deliverability || "UNKNOWN",
        is_disposable: cached.is_disposable === 1,
        is_catchall: cached.is_catchall === 1,
        quality_score: cached.quality_score,
        reason: cached.reason || "Cached verification result"
      };
    }
  } catch (e) {}

  // 4. Abstract API verification using exact variable ABSTRACT_API_KEY
  if (env.ABSTRACT_API_KEY) {
    try {
      const url = `https://emailvalidation.abstractapi.com/v1/?api_key=${env.ABSTRACT_API_KEY}&email=${encodeURIComponent(normEmail)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const data: any = await res.json();
        const isUndeliverable = data.deliverability === "UNDELIVERABLE";
        const isDisposable = data.is_disposable_email?.value === true;
        const isCatchall = data.is_catchall_email?.value === true;
        const qualityScore = data.quality_score || 0.8;

        const isValid = !isUndeliverable && !isDisposable && (qualityScore >= 0.5);
        const reason = isUndeliverable 
          ? "Abstract API marked as UNDELIVERABLE" 
          : isDisposable 
            ? "Abstract API marked as DISPOSABLE" 
            : "Verified via Abstract API";

        const result: EmailVerificationResult = {
          valid: isValid,
          deliverability: data.deliverability || "UNKNOWN",
          is_disposable: isDisposable,
          is_catchall: isCatchall,
          quality_score: qualityScore,
          reason
        };

        try {
          await env.RADAR_DB.prepare(`
            INSERT OR REPLACE INTO email_verifications (email, is_valid, deliverability, is_disposable, is_catchall, quality_score, reason, verified_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            normEmail,
            isValid ? 1 : 0,
            result.deliverability,
            isDisposable ? 1 : 0,
            isCatchall ? 1 : 0,
            qualityScore,
            reason,
            timestamp
          ).run();
        } catch (e) {}

        return result;
      }
    } catch (e: any) {
      console.warn(`[Abstract API Verification Warning] ${e.message}`);
    }
  }

  // Fallback if no API key or timeout
  const fallbackResult: EmailVerificationResult = {
    valid: true,
    deliverability: "UNVERIFIED_PASSED",
    is_disposable: false,
    is_catchall: false,
    quality_score: 0.7,
    reason: "Passed basic format and disposable safety checks"
  };

  try {
    await env.RADAR_DB.prepare(`
      INSERT OR REPLACE INTO email_verifications (email, is_valid, deliverability, is_disposable, is_catchall, quality_score, reason, verified_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(normEmail, 1, "UNVERIFIED_PASSED", 0, 0, 0.7, "Format valid", timestamp).run();
  } catch (e) {}

  return fallbackResult;
}

/**
 * Sender Governor - Volume Limiter & Negative Signal Safeguard
 */
export interface SenderGovernorStatus {
  allowed: boolean;
  daily_limit: number;
  sends_today: number;
  reason: string;
}

export async function checkSenderGovernor(env: Env): Promise<SenderGovernorStatus> {
  const db = env.RADAR_DB;
  const today = new Date().toISOString().split("T")[0];
  const timestamp = new Date().toISOString();

  let state: any = null;
  try {
    state = await db.prepare("SELECT * FROM sender_governor_state WHERE id = 'global_governor'").first();
  } catch (e) {}

  if (!state) {
    state = {
      id: 'global_governor',
      daily_limit: 5,
      sends_today: 0,
      bounces_today: 0,
      complaints_today: 0,
      unsubscribes_today: 0,
      last_reset_day: today,
      status: 'active',
      reason: 'Initialized conservative policy'
    };
    try {
      await db.prepare(`
        INSERT INTO sender_governor_state (id, daily_limit, sends_today, bounces_today, complaints_today, unsubscribes_today, last_reset_day, status, reason, updated_at)
        VALUES ('global_governor', 5, 0, 0, 0, 0, ?, 'active', 'Initial conservative policy', ?)
      `).bind(today, timestamp).run();
    } catch (e) {}
  }

  if (state.last_reset_day !== today) {
    let newLimit = state.daily_limit || 5;

    // Conservative Ramp-up: 5 -> 8 -> 10 max if zero bounces/complaints
    if ((state.bounces_today || 0) === 0 && (state.complaints_today || 0) === 0) {
      if (newLimit < 8) newLimit = 8;
      else if (newLimit < 10) newLimit = 10;
    } else {
      newLimit = Math.max(3, newLimit - 2);
    }

    state.daily_limit = newLimit;
    state.sends_today = 0;
    state.bounces_today = 0;
    state.complaints_today = 0;
    state.unsubscribes_today = 0;
    state.last_reset_day = today;
    state.status = 'active';

    try {
      await db.prepare(`
        UPDATE sender_governor_state
        SET daily_limit = ?, sends_today = 0, bounces_today = 0, complaints_today = 0, unsubscribes_today = 0, last_reset_day = ?, status = 'active', updated_at = ?
        WHERE id = 'global_governor'
      `).bind(newLimit, today, timestamp).run();
    } catch (e) {}
  }

  if (state.status === 'paused' || state.status === 'throttled') {
    return {
      allowed: false,
      daily_limit: state.daily_limit,
      sends_today: state.sends_today,
      reason: `SENDER_GOVERNOR_PAUSED: ${state.reason || 'Volume paused due to risk signals'}`
    };
  }

  if (state.sends_today >= state.daily_limit) {
    return {
      allowed: false,
      daily_limit: state.daily_limit,
      sends_today: state.sends_today,
      reason: `SENDER_GOVERNOR_LIMIT_REACHED: Daily limit of ${state.daily_limit} sends reached for today (${state.sends_today}/${state.daily_limit}).`
    };
  }

  return {
    allowed: true,
    daily_limit: state.daily_limit,
    sends_today: state.sends_today,
    reason: `Allowed (${state.sends_today + 1}/${state.daily_limit} sends today).`
  };
}

export async function incrementSenderSends(db: D1Database): Promise<void> {
  const timestamp = new Date().toISOString();
  try {
    await db.prepare(`
      UPDATE sender_governor_state
      SET sends_today = sends_today + 1, updated_at = ?
      WHERE id = 'global_governor'
    `).bind(timestamp).run();
  } catch (e) {}
}

export async function recordNegativeSignal(db: D1Database, signalType: 'bounce' | 'complaint' | 'unsubscribe' | 'error', reason: string): Promise<void> {
  const timestamp = new Date().toISOString();
  try {
    if (signalType === 'bounce') {
      await db.prepare("UPDATE sender_governor_state SET bounces_today = bounces_today + 1, updated_at = ? WHERE id = 'global_governor'").bind(timestamp).run();
    } else if (signalType === 'complaint') {
      await db.prepare("UPDATE sender_governor_state SET complaints_today = complaints_today + 1, status = 'throttled', reason = ?, updated_at = ? WHERE id = 'global_governor'").bind(`Complaint signal: ${reason}`, timestamp).run();
    } else if (signalType === 'unsubscribe') {
      await db.prepare("UPDATE sender_governor_state SET unsubscribes_today = unsubscribes_today + 1, updated_at = ? WHERE id = 'global_governor'").bind(timestamp).run();
    }
  } catch (e) {}
}

/**
 * Autonomous Hunter Sequences Outreach Dispatcher (Truthful State Engine)
 */
export async function sendOrQueueOutreach(prospect: any, runId: string, env: Env): Promise<{ success: boolean; reason: string }> {
  // 1. Global Kill Switch check
  if (env.RADAR_GLOBAL_PAUSE === "true" || env.RADAR_GLOBAL_PAUSE === "1") {
    await env.RADAR_DB.prepare("UPDATE prospects SET status = 'held', outcome = 'RADAR_GLOBAL_PAUSED', updated_at = ? WHERE id = ?")
      .bind(new Date().toISOString(), prospect.id).run();
    return { success: false, reason: "RADAR_GLOBAL_PAUSED" };
  }

  // 2. Outreach Kill Switch check
  if (env.RADAR_OUTREACH_PAUSE === "true" || env.RADAR_OUTREACH_PAUSE === "1") {
    await env.RADAR_DB.prepare("UPDATE prospects SET status = 'held', outcome = 'RADAR_OUTREACH_PAUSED', updated_at = ? WHERE id = ?")
      .bind(new Date().toISOString(), prospect.id).run();
    return { success: false, reason: "RADAR_OUTREACH_PAUSED" };
  }

  // 3. Tenant pause / Circuit Breaker check
  const cb = await getCircuitBreakerStatus(env.RADAR_DB);
  if (cb.active) {
    await env.RADAR_DB.prepare("UPDATE prospects SET status = 'held', outcome = 'circuit_breaker_active', updated_at = ? WHERE id = ?")
      .bind(new Date().toISOString(), prospect.id).run();
    return { success: false, reason: `circuit_breaker_active: ${cb.reason}` };
  }

  // 4. Compliance Hard Gate: missing sender postal address MUST block auto-outreach
  if (!env.SENDER_POSTAL_ADDRESS || !env.SENDER_POSTAL_ADDRESS.trim()) {
    console.warn(`[Compliance Gate] Prospect ${prospect.id} blocked: missing_sender_postal_address`);
    await env.RADAR_DB.prepare("UPDATE prospects SET status = 'held', outcome = 'missing_sender_postal_address', updated_at = ? WHERE id = ?")
      .bind(new Date().toISOString(), prospect.id).run();
    return { success: false, reason: "missing_sender_postal_address" };
  }

  // 5. Suppression check
  const suppression = await checkSuppressedComposite(
    env.RADAR_DB,
    prospect.email,
    prospect.website,
    prospect.phone,
    prospect.name,
    prospect.city
  );
  if (suppression) {
    await env.RADAR_DB.prepare("UPDATE prospects SET status = 'suppressed', outcome = ?, updated_at = ? WHERE id = ?")
      .bind(`SUPPRESSED: ${suppression.reason}`, new Date().toISOString(), prospect.id).run();
    return { success: false, reason: `SUPPRESSED: ${suppression.reason}` };
  }

  // 6. Cooldown check
  const overlap = await findExistingProspectOverlap(
    env.RADAR_DB,
    prospect.email,
    prospect.website,
    prospect.phone,
    prospect.name,
    prospect.city
  );
  if (overlap && isCooldownActive(overlap.overlap.cooldown_until)) {
    await env.RADAR_DB.prepare("UPDATE prospects SET status = 'held', outcome = 'cooldown_active', updated_at = ? WHERE id = ?")
      .bind(new Date().toISOString(), prospect.id).run();
    return { success: false, reason: `COOLDOWN_ACTIVE until ${overlap.overlap.cooldown_until}` };
  }

  // 7. Dedupe check & Recipient email validation
  if (!prospect.email || !prospect.email.trim()) {
    await env.RADAR_DB.prepare("UPDATE prospects SET status = 'disqualified', outcome = 'missing_email', updated_at = ? WHERE id = ?")
      .bind(new Date().toISOString(), prospect.id).run();
    return { success: false, reason: "MISSING_EMAIL" };
  }
  const emailVer = await verifyEmail(prospect.email, env);
  if (!emailVer.valid) {
    await env.RADAR_DB.prepare("UPDATE prospects SET status = 'disqualified', outcome = 'email_verification_failed', updated_at = ? WHERE id = ?")
      .bind(new Date().toISOString(), prospect.id).run();
    return { success: false, reason: `EMAIL_VERIFICATION_FAILED: ${emailVer.reason}` };
  }

  if (prospect.score !== undefined && prospect.score < 30) {
    return { success: false, reason: `SCORE_TOO_LOW: Score ${prospect.score} below threshold 30` };
  }

  const trustGate = await verifyTrustStackGate(prospect, runId, env);
  if (!trustGate.allowed) {
    return { success: false, reason: `TRUST_STACK_BLOCKED: ${trustGate.reason}` };
  }

  const governor = await checkSenderGovernor(env);
  if (!governor.allowed) {
    return { success: false, reason: `SENDER_GOVERNOR_BLOCKED: ${governor.reason}` };
  }

  // 8. Budget check: Reserve outreach unit from authoritative Daily Budget Governor
  const tenantId = prospect.tenant_id || "founder";
  const outreachReserved = await reserveBudget(env.RADAR_DB, tenantId, 'outreach_units', 1);
  if (!outreachReserved) {
    await env.RADAR_DB.prepare("UPDATE prospects SET status = 'held', outcome = 'outreach_budget_limit_exceeded', updated_at = ? WHERE id = ?")
      .bind(new Date().toISOString(), prospect.id).run();
    return { success: false, reason: "outreach_budget_limit_exceeded" };
  }

  // 9. Provider Configuration Validation
  const hasResend = !!(env.RESEND_API_KEY && env.RESEND_API_KEY.trim());
  const hasBrevo = !!(env.BREVO_API_KEY && env.BREVO_API_KEY.trim());
  const hasHunter = !!(env.HUNTER_API_KEY && env.HUNTER_SEQUENCE_ID);

  if (!hasResend && !hasBrevo && !hasHunter) {
    await releaseBudget(env.RADAR_DB, tenantId, 'outreach_units', 1);
    const missingOutcome = 'missing_email_provider_keys';
    await env.RADAR_DB.prepare("UPDATE prospects SET status = 'provider_required', outcome = ?, updated_at = ? WHERE id = ?")
      .bind(missingOutcome, new Date().toISOString(), prospect.id).run();
    return { success: false, reason: `provider_required: ${missingOutcome}` };
  }

  const sequenceId = hasHunter ? env.HUNTER_SEQUENCE_ID!.trim() : (hasResend ? 'resend_live' : 'brevo_live');
  const idempotencyKey = `idempotency:${tenantId}:${prospect.id}:${sequenceId}`;

  // 10. Idempotency Check
  try {
    const existingRecord = await env.RADAR_DB.prepare(
      "SELECT * FROM outreach_idempotency WHERE idempotency_key = ?"
    ).bind(idempotencyKey).first() as any;

    if (existingRecord) {
      if (['scheduled', 'queued', 'sent'].includes(existingRecord.status)) {
        console.log(`[Idempotency] Prospect ${prospect.id} already processed for sequence ${sequenceId}. Skipping resend.`);
        await releaseBudget(env.RADAR_DB, tenantId, 'outreach_units', 1);
        return { success: true, reason: "Already accepted by provider (idempotent skip)" };
      }
      if (existingRecord.status === 'provider_unknown') {
        console.warn(`[Idempotency] Prospect ${prospect.id} in provider_unknown state. Reconciling before resend.`);
        await releaseBudget(env.RADAR_DB, tenantId, 'outreach_units', 1);
        await env.RADAR_DB.prepare("UPDATE prospects SET status = 'provider_unknown', outcome = 'reconciliation_required', updated_at = ? WHERE id = ?")
          .bind(new Date().toISOString(), prospect.id).run();
        return { success: false, reason: "provider_unknown: Reconciliation required before resend" };
      }
    }
  } catch (e) {}

  // Reserve idempotency entry
  const timestamp = new Date().toISOString();
  try {
    await env.RADAR_DB.prepare(`
      INSERT OR REPLACE INTO outreach_idempotency (idempotency_key, prospect_id, tenant_id, email, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'reserved', ?, ?)
    `).bind(idempotencyKey, prospect.id, tenantId, prospect.email.toLowerCase().trim(), timestamp, timestamp).run();
  } catch (e) {}

  // 11. Provider Action: Resend / Brevo Direct Outbound Flow
  if (hasResend || hasBrevo) {
    const dispatch = await dispatchEmail({
      to: prospect.email,
      recipientName: prospect.name,
      subject: prospect.draft_subject,
      body: prospect.draft_body,
      from: env.OUTBOUND_EMAIL_FROM,
      prospectId: prospect.id,
      resendApiKey: env.RESEND_API_KEY,
      brevoApiKey: env.BREVO_API_KEY,
      senderName: env.SENDER_NAME
    });

    if (dispatch.success && dispatch.status === 'dispatched') {
      await incrementSenderSends(env.RADAR_DB);
      await commitBudget(env.RADAR_DB, tenantId, 'outreach_units', 1);

      try {
        const todayStr = new Date().toISOString().split('T')[0];
        await env.RADAR_DB.prepare("UPDATE daily_missions SET outreach_count = outreach_count + 1 WHERE tenant_id = ? AND day = ?").bind(prospect.tenant_id || "founder", todayStr).run();
      } catch (e) {}

      await env.RADAR_DB.prepare(`
        UPDATE prospects
        SET status = 'sent', outcome = 'sent', dispatch_provider = ?, dispatch_message_id = ?, dispatch_status = 'dispatched', last_contact_at = ?, updated_at = ?
        WHERE id = ?
      `).bind(dispatch.provider, dispatch.messageId, timestamp, timestamp, prospect.id).run();

      await env.RADAR_DB.prepare(`
        UPDATE outreach_idempotency
        SET status = 'sent', provider_reference = ?, updated_at = ?
        WHERE idempotency_key = ?
      `).bind(dispatch.messageId, timestamp, idempotencyKey).run();

      return { success: true, reason: `Dispatched via ${dispatch.provider}` };
    } else {
      await releaseBudget(env.RADAR_DB, tenantId, 'outreach_units', 1);
      await env.RADAR_DB.prepare("UPDATE prospects SET status = 'hold', outcome = ?, updated_at = ? WHERE id = ?")
        .bind(dispatch.error || 'dispatch_failed', timestamp, prospect.id).run();
      return { success: false, reason: dispatch.error || 'dispatch_failed' };
    }
  }

  // 12. Provider Action: Hunter Email Sequence Recipient Flow (V2)
  const nameParts = (prospect.name || "").trim().split(" ");
  const firstName = nameParts[0] || "Team";
  const lastName = nameParts.slice(1).join(" ") || "";

  try {
    const url = `https://api.hunter.io/v2/sequences/${encodeURIComponent(sequenceId)}/recipients?api_key=${env.HUNTER_API_KEY}`;
    const hunterRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: prospect.email,
        first_name: firstName,
        last_name: lastName,
        company: prospect.name,
        website: prospect.website || "",
        attributes: {
          draft_subject: prospect.draft_subject,
          draft_body: prospect.draft_body,
          bvelt_angle: prospect.bvelt_angle
        }
      }),
      signal: AbortSignal.timeout(6000)
    });

    const responseText = await hunterRes.text();
    let jsonBody: any = {};
    try { jsonBody = JSON.parse(responseText); } catch (e) {}

    if (hunterRes.ok || hunterRes.status === 201 || hunterRes.status === 200) {
      const recipientData = jsonBody.data || {};
      const recipientId = recipientData.id ? String(recipientData.id) : `rec_${crypto.randomUUID()}`;
      const recipientStatus = recipientData.status || "scheduled";

      if (recipientData.sequence_status === "draft") {
        await releaseBudget(env.RADAR_DB, tenantId, 'outreach_units', 1);
        await env.RADAR_DB.prepare("UPDATE prospects SET status = 'provider_error', outcome = 'hunter_sequence_draft', updated_at = ? WHERE id = ?")
          .bind(timestamp, prospect.id).run();
        return { success: false, reason: "Hunter sequence is in draft state" };
      }

      // Start the sequence to ensure it's active and sending
      try {
        const startUrl = `https://api.hunter.io/v2/sequences/${encodeURIComponent(sequenceId)}/start?api_key=${env.HUNTER_API_KEY}`;
        const startRes = await fetch(startUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(5000)
        });
        if (!startRes.ok) {
          console.warn(`[Hunter API] Start sequence endpoint returned HTTP ${startRes.status}`);
        }
      } catch (startErr: any) {
        console.warn(`[Hunter API] Failed to call start sequence endpoint: ${startErr.message}`);
      }

      await incrementSenderSends(env.RADAR_DB);
      await commitBudget(env.RADAR_DB, tenantId, 'outreach_units', 1);

      // Increment outreach_count for today's daily mission
      try {
        const todayStr = new Date().toISOString().split('T')[0];
        await env.RADAR_DB.prepare("UPDATE daily_missions SET outreach_count = outreach_count + 1 WHERE tenant_id = ? AND day = ?").bind(prospect.tenant_id || "founder", todayStr).run();
      } catch (e) {}

      await env.RADAR_DB.prepare(`
        UPDATE prospects
        SET status = 'scheduled', outcome = 'scheduled', provider_recipient_id = ?, provider_sequence_id = ?, provider_status = ?, last_contact_at = ?, updated_at = ?
        WHERE id = ?
      `).bind(recipientId, sequenceId, recipientStatus, timestamp, timestamp, prospect.id).run();

      await env.RADAR_DB.prepare(`
        UPDATE outreach_idempotency
        SET status = 'scheduled', provider_reference = ?, updated_at = ?
        WHERE idempotency_key = ?
      `).bind(recipientId, timestamp, idempotencyKey).run();

      await env.RADAR_DB.prepare(
        "INSERT OR REPLACE INTO suppression (key, reason, created_at) VALUES (?, ?, ?)"
      ).bind(prospect.email.toLowerCase().trim(), `Scheduled in Hunter Sequence ${sequenceId} on ${timestamp}`, timestamp).run();

      return { success: true, reason: `Added to Hunter Sequence ${sequenceId} (status: ${recipientStatus})` };

    } else if (hunterRes.status === 409) {
      await releaseBudget(env.RADAR_DB, tenantId, 'outreach_units', 1);
      await env.RADAR_DB.prepare(`
        UPDATE prospects SET status = 'scheduled', outcome = 'already_in_sequence', updated_at = ? WHERE id = ?
      `).bind(timestamp, prospect.id).run();

      await env.RADAR_DB.prepare(`
        UPDATE outreach_idempotency
        SET status = 'scheduled', updated_at = ?
        WHERE idempotency_key = ?
      `).bind(timestamp, idempotencyKey).run();

      return { success: true, reason: "Recipient already present in Hunter sequence" };

    } else {
      await releaseBudget(env.RADAR_DB, tenantId, 'outreach_units', 1);
      await recordNegativeSignal(env.RADAR_DB, 'error', `Hunter API HTTP ${hunterRes.status}`);
      await trackProviderFailure(env.RADAR_DB, `Hunter API HTTP ${hunterRes.status}`);

      await env.RADAR_DB.prepare(
        "UPDATE prospects SET status = 'provider_error', outcome = ?, updated_at = ? WHERE id = ?"
      ).bind(`HUNTER_API_ERROR: HTTP ${hunterRes.status}`, timestamp, prospect.id).run();

      await env.RADAR_DB.prepare(`
        UPDATE outreach_idempotency
        SET status = 'failed', updated_at = ?
        WHERE idempotency_key = ?
      `).bind(timestamp, idempotencyKey).run();

      return { success: false, reason: `HUNTER_API_ERROR: HTTP ${hunterRes.status}` };
    }
  } catch (err: any) {
    console.error("[sendOrQueueOutreach] Hunter API Exception:", err.message);
    await releaseBudget(env.RADAR_DB, tenantId, 'outreach_units', 1);
    await recordNegativeSignal(env.RADAR_DB, 'error', err.message);
    await trackProviderFailure(env.RADAR_DB, err.message);

    await env.RADAR_DB.prepare(
      "UPDATE prospects SET status = 'provider_unknown', outcome = 'network_exception', updated_at = ? WHERE id = ?"
    ).bind(timestamp, prospect.id).run();

    await env.RADAR_DB.prepare(`
      UPDATE outreach_idempotency
      SET status = 'provider_unknown', updated_at = ?
      WHERE idempotency_key = ?
    `).bind(timestamp, idempotencyKey).run();

    return { success: false, reason: `HUNTER_API_EXCEPTION: ${err.message}` };
  }
}

/**
 * D1 Suppression Check
 */
async function checkSuppressed(db: D1Database, key: string): Promise<boolean> {
  try {
    const row = await db.prepare("SELECT 1 FROM suppression WHERE key = ?").bind(key.toLowerCase()).first();
    return !!row;
  } catch (e) {
    return false;
  }
}

export function generateIdentityKey(
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

export async function checkSuppressedComposite(
  db: D1Database,
  email: string | null,
  website: string | null,
  phone: string | null,
  name: string,
  city: string
): Promise<{ suppressed: boolean; reason: string } | null> {
  const keys: string[] = [];
  if (email) keys.push(email.toLowerCase().trim());
  if (website) {
    const dom = getDomain(website);
    if (dom) keys.push(dom.toLowerCase().trim());
  }
  if (phone) keys.push(phone.replace(/[^0-9]/g, ""));
  keys.push(`${name.toLowerCase().trim()}_${city.toLowerCase().trim()}`.replace(/\s+/g, "_"));

  for (const k of keys) {
    try {
      const match = await db.prepare("SELECT * FROM suppression WHERE key = ?").bind(k).first() as any;
      if (match) {
        return { suppressed: true, reason: match.reason };
      }
    } catch (e) {
      // safe fallback
    }
  }
  return null;
}

export async function findExistingProspectOverlap(
  db: D1Database,
  email: string | null,
  website: string | null,
  phone: string | null,
  name: string,
  city: string
): Promise<{ overlap: any; reason: string } | null> {
  const normEmail = email ? email.toLowerCase().trim() : null;
  const normDomain = website ? getDomain(website) : null;
  const normPhone = phone ? phone.replace(/[^0-9]/g, "") : null;
  const identityKey = generateIdentityKey(email, website, phone, name, city);

  try {
    const matchIdentity = await db.prepare("SELECT * FROM prospects WHERE identity_key = ?").bind(identityKey).first();
    if (matchIdentity) return { overlap: matchIdentity, reason: "Same identity_key: " + identityKey };

    if (normEmail) {
      const match = await db.prepare("SELECT * FROM prospects WHERE email = ?").bind(normEmail).first();
      if (match) return { overlap: match, reason: "Same email match: " + normEmail };
    }

    if (normDomain) {
      const match = await db.prepare("SELECT * FROM prospects WHERE website LIKE ?").bind(`%${normDomain}%`).first();
      if (match) return { overlap: match, reason: "Same website domain match: " + normDomain };
    }

    if (normPhone && normPhone.length >= 7) {
      const match = await db.prepare("SELECT * FROM prospects WHERE phone = ? OR phone LIKE ?").bind(normPhone, `%${normPhone}%`).first();
      if (match) return { overlap: match, reason: "Same phone number match: " + normPhone };
    }

    const matchNameCity = await db.prepare("SELECT * FROM prospects WHERE name = ? AND city = ?").bind(name, city).first();
    if (matchNameCity) {
      return { overlap: matchNameCity, reason: "Same business name and city match" };
    }
  } catch (e) {
    // safe fallback
  }

  return null;
}

export function isCooldownActive(cooldownUntil: string | null): boolean {
  if (!cooldownUntil) return false;
  return new Date(cooldownUntil).getTime() > Date.now();
}

/**
 * Lightweight Learning Engine: Record Decision & Outcome Events in D1
 */
async function recordLearningEvent(
  db: D1Database, 
  city: string, 
  trade: string, 
  variantId: string | null, 
  isSent: boolean,
  details?: {
    score?: number;
    angle?: string;
    market?: string;
    niche?: string;
    outcome?: string;
    response_type?: string;
    is_win?: boolean;
  }
): Promise<void> {
  const timestamp = new Date().toISOString();
  const isWin = details?.is_win === true || ['positive', 'question', 'booked', 'converted'].includes(details?.response_type || '');
  const keys = [`city:${city}`, `trade:${trade}`];
  if (variantId) keys.push(`variant:${variantId}`);
  if (details?.angle) keys.push(`angle:${details.angle}`);
  if (details?.response_type) keys.push(`response:${details.response_type}`);
  if (details?.outcome) keys.push(`outcome:${details.outcome}`);

  for (const key of keys) {
    try {
      const existing = await db.prepare("SELECT * FROM learning_stats WHERE key = ?").bind(key).first() as any;
      if (existing) {
        const newSent = (existing.sent_count || 0) + (isSent ? 1 : 0);
        const newWin = (existing.win_count || 0) + (isWin ? 1 : 0);
        const newTotal = (existing.total_count || 0) + 1;
        await db.prepare("UPDATE learning_stats SET sent_count = ?, win_count = ?, total_count = ?, updated_at = ? WHERE key = ?")
          .bind(newSent, newWin, newTotal, timestamp, key).run();
      } else {
        await db.prepare("INSERT INTO learning_stats (key, sent_count, win_count, total_count, updated_at) VALUES (?, ?, ?, 1, ?)")
          .bind(key, isSent ? 1 : 0, isWin ? 1 : 0, timestamp).run();
      }
    } catch (e) {
      console.warn(`Learning event save warning for ${key}: `, e);
    }
  }
}

/**
 * Retrieve Learning Win Rates by City/Trade/Variant
 */
/**
 * Thompson Sampling draw from Beta(wins+1, losses+1).
 * Balances explore (uncertain arms) vs exploit (high win-rate arms).
 * Used to rank cities and trade segments autonomously.
 */
function thompsonSample(wins: number, total: number): number {
  const a = Math.max(0.5, wins + 1);
  const b = Math.max(0.5, (total - wins) + 1);
  // Marsaglia gamma approx for Beta via two gammas (simple for Workers)
  const sampleGamma = (k: number): number => {
    if (k < 1) {
      const u = Math.random();
      return sampleGamma(1 + k) * Math.pow(u, 1 / k);
    }
    const d = k - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);
    for (;;) {
      let x: number, v: number;
      do {
        x = normal01();
        v = 1 + c * x;
      } while (v <= 0);
      v = v * v * v;
      const u = Math.random();
      if (u < 1 - 0.0331 * (x * x) * (x * x)) return d * v;
      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
    }
  };
  const g1 = sampleGamma(a);
  const g2 = sampleGamma(b);
  return g1 / (g1 + g2);
}

function normal01(): number {
  const u = 1 - Math.random();
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Expected value proxy: P(convert) × ticket by trade (USD). */
function estimateTicketUsd(trade: string): number {
  const t = (trade || "").toLowerCase();
  if (/hvac|roof|electr/.test(t)) return 2800;
  if (/plumb|water/.test(t)) return 2200;
  if (/pool/.test(t)) return 1600;
  if (/landscap|lawn|pest|clean|paint|floor/.test(t)) return 1200;
  if (/property|hotel|hoa|facility|real estate/.test(t)) return 3500; // tenant buyer LTV proxy
  return 1500;
}

/**
 * Learning brain: win rates by city/trade/variant/segment.
 * Uses learning_stats (primary) + live prospect outcomes as Bayesian prior.
 * Lower threshold (total_count >= 2) so the system starts learning faster.
 * Returns scores in [0, 1] used to re-rank cities, trades and ICP segments.
 */
async function getLearningStats(db: D1Database): Promise<Record<string, number>> {
  const winRates: Record<string, number> = {};
  try {
    if (!db || typeof db.prepare !== "function") return winRates;

    // 1. Aggregated learning_stats (faster path)
    try {
      const prep = db.prepare(
        "SELECT key, sent_count, win_count, total_count FROM learning_stats WHERE total_count >= 2"
      );
      if (prep && typeof prep.all === "function") {
        const rows = await prep.all() as any;
        if (rows && rows.results) {
          for (const r of rows.results) {
            const wins = typeof r.win_count === "number" ? r.win_count : 0;
            const total = Math.max(1, r.total_count || 1);
            // Laplace smoothing so early wins don't dominate
            winRates[r.key] = (wins + 1) / (total + 2);
          }
        }
      }
    } catch (_) {}

    // 2. Live outcomes from prospects (fills gaps when learning_stats is sparse)
    try {
      const live = await db.prepare(`
        SELECT city, trade,
          SUM(CASE WHEN outcome IN ('sent','replied','won','positive','booked') OR tenant_outcome IN ('replied','won') THEN 1 ELSE 0 END) as wins,
          COUNT(*) as total
        FROM prospects
        WHERE city IS NOT NULL AND trade IS NOT NULL
        GROUP BY city, trade
        HAVING total >= 2
      `).all() as any;
      if (live && live.results) {
        for (const r of live.results) {
          const cityKey = `city:${r.city}`;
          const tradeKey = `trade:${String(r.trade).toLowerCase()}`;
          const pairKey = `pair:${r.city}|${String(r.trade).toLowerCase()}`;
          const rate = (Number(r.wins || 0) + 1) / (Number(r.total || 1) + 2);
          if (winRates[cityKey] === undefined) winRates[cityKey] = rate;
          else winRates[cityKey] = (winRates[cityKey] + rate) / 2;
          if (winRates[tradeKey] === undefined) winRates[tradeKey] = rate;
          else winRates[tradeKey] = (winRates[tradeKey] + rate) / 2;
          winRates[pairKey] = rate;
        }
      }
    } catch (_) {}

    // 3. geo_coverage wins/replies as geographic signal
    try {
      const geo = await db.prepare(`
        SELECT place_key, trade, SUM(wins) as w, SUM(replies) as r, SUM(qualified) as q, SUM(searches) as s
        FROM geo_coverage
        GROUP BY place_key, trade
        HAVING s >= 1
      `).all() as any;
      if (geo && geo.results) {
        for (const r of geo.results) {
          const cityName = String(r.place_key || "").split("|")[0];
          if (!cityName) continue;
          const successes = Number(r.w || 0) + Number(r.r || 0) * 0.5;
          const trials = Math.max(1, Number(r.s || 1));
          const rate = (successes + 1) / (trials + 2);
          const key = `city:${cityName}`;
          if (winRates[key] === undefined) winRates[key] = rate;
          else winRates[key] = Math.max(winRates[key], rate);
        }
      }
    } catch (_) {}
  } catch (e) {
    // Graceful fallback — empty rates = uniform prior
  }
  return winRates;
}

/**
 * CSV Import & Trade Deduction Helpers
 */
export function parseCSV(text: string): string[][] {
  const lines: string[][] = [];
  let row: string[] = [];
  let entry = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];

    if (c === '"') {
      if (inQuotes && next === '"') {
        entry += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      row.push(entry.trim());
      entry = '';
    } else if ((c === '\r' || c === '\n') && !inQuotes) {
      if (c === '\r' && next === '\n') {
        i++;
      }
      row.push(entry.trim());
      if (row.some(field => field.length > 0)) {
        lines.push(row);
      }
      row = [];
      entry = '';
    } else {
      entry += c;
    }
  }
  if (entry || row.length > 0) {
    row.push(entry.trim());
    if (row.some(field => field.length > 0)) {
      lines.push(row);
    }
  }
  return lines;
}

export function inferTradeFromText(...textParts: (string | undefined)[]): string {
  const combined = textParts.filter(Boolean).join(' ').toLowerCase();

  if (/plumb/i.test(combined)) return 'plumbing';
  if (/hvac|heating|air/i.test(combined)) return 'hvac';
  if (/roof/i.test(combined)) return 'roofing';
  if (/landscap/i.test(combined)) return 'landscaping';
  if (/electric/i.test(combined)) return 'electrical';
  if (/paint/i.test(combined)) return 'painting';
  if (/pool/i.test(combined)) return 'pool';
  if (/pest/i.test(combined)) return 'pest_control';

  return 'general';
}

export function isLicenseStatusInvalid(statusText?: string): boolean {
  if (!statusText) return false;
  const lower = statusText.toLowerCase();
  return /expired|expirad|revoked|revocad|cancelled|canceled|cancelad|suspended|suspendid|inactive|inactiv/i.test(lower);
}

/**
 * Utilities
 */
function isRealWebsite(url: string): boolean {
  const lower = url.toLowerCase();
  return !lower.includes("facebook.com") && 
         !lower.includes("instagram.com") && 
         !lower.includes("yelp.com") && 
         !lower.includes("yellowpages.com");
}

function getDomain(url: string): string | null {
  try {
    let hostname = url.replace(/^(https?:\/\/)?(www\.)?/i, "");
    hostname = hostname.split('/')[0].split(':')[0];
    return hostname.toLowerCase();
  } catch (e) {
    return null;
  }
}

function getDayOfYear(now: Date): number {
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  const oneDay = 1000 * 60 * 60 * 24;
  return Math.floor(diff / oneDay);
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return Math.abs(hash);
}

function escapeMarkdown(text: string): string {
  if (!text) return "";
  return text
    .replace(/_/g, "\\_")
    .replace(/\*/g, "\\*")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/`/g, "\\`")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

/**
 * Zero-cost Cloudflare 1.1.1.1 DNS over HTTPS MX verification
 */
async function checkDomainMxRecords(domain: string): Promise<boolean> {
  try {
    const res = await fetch(`https://1.1.1.1/dns-query?name=${encodeURIComponent(domain)}&type=MX`, {
      headers: { "accept": "application/dns-json" },
      signal: AbortSignal.timeout(3000)
    });
    if (res.ok) {
      const data: any = await res.json();
      return Array.isArray(data.Answer) && data.Answer.length > 0;
    }
  } catch (e) {}
  return false;
}

function escapeHtml(str: string): string {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

/**
 * Edge-Rendered Interactive Demo for Prospects
 */
function handleEdgeDemoPage(companyName: string, tradeName: string, phone: string): Response {
  const safeName = escapeHtml(companyName);
  const safeTrade = escapeHtml(tradeName);
  const safePhone = escapeHtml(phone || "(Línea de Voz)");

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bvelt Demo · ${safeName}</title>
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
    <h1>¿Qué pasa si un cliente llama a ${safeName} fuera de horario?</h1>
    <p class="sub">Los clientes que necesitan servicios de <strong>${safeTrade}</strong> llaman al primer número que encuentran. Si nadie contesta en 30 segundos, llaman a tu competidor.</p>

    <div class="card">
      <div class="sim-header">
        <div class="sim-title"><span class="status-dot"></span> Bvelt Call Recovery en Acción</div>
        <span style="font-size: 11px; color: #64748b;">${safePhone}</span>
      </div>

      <div class="timeline">
        <div class="event">
          <div class="event-time">8:42 PM</div>
          <div class="event-body">
            <div class="call-box">📞 Llamada perdida de cliente nuevo (técnicos ocupados en un servicio)</div>
          </div>
        </div>
        <div class="event">
          <div class="event-time">8:42 PM</div>
          <div class="event-body">
            <div style="font-size: 10px; color: #60a5fa; margin-bottom: 2px;">⚡ SMS instantáneo en 6 segundos</div>
            <div class="sms-box">"Hola, gracias por llamar a <strong>${safeName}</strong>. Estamos terminando un servicio urgente. ¿En qué podemos ayudarte de inmediato?"</div>
          </div>
        </div>
        <div class="event">
          <div class="event-time">8:43 PM</div>
          <div class="event-body">
            <div class="client-box">"Hola, tengo un problema urgente y necesito cotización para mañana por la mañana."</div>
          </div>
        </div>
        <div class="event">
          <div class="event-time">8:44 PM</div>
          <div class="event-body">
            <div class="booked-box">✅ Trabajo agendado y notificado al propietario de ${safeName}. Cliente retenido.</div>
          </div>
        </div>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-val">&lt; 8 seg</div>
        <div class="stat-label">Tiempo de respuesta</div>
      </div>
      <div class="stat-card">
        <div class="stat-val">+$3,400</div>
        <div class="stat-label">Ingreso mensual recuperado</div>
      </div>
    </div>

    <a href="https://bvelt.app" class="cta-btn" target="_blank" rel="noopener">Activar Bvelt para ${safeName} →</a>
    <div class="footer">Bvelt · Autonomous Call Recovery & SMS Engine para Contratistas Locales</div>
  </div>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=3600"
    }
  });
}
