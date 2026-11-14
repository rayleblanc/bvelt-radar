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
import { dispatchEmail, normalizeOutreachBody, BVELT_SITE, EmailDispatchResult } from './emailDispatcher';
import { auditDomainSecurityAndMx, auditWebsitePerformance, auditCityWeatherEmergency } from './openAudits';
import { pickTargets, findPlace, findNearestPlace, formatPlaceLabel, markSearched, placeKey, radiusKm, haversineKm } from './geoFrontier';
import { sanitizeEmail, sanitizeProspectEmail, isOffIcpName, hasMxRecords } from './emailSanitizer';
import { dispatchScraplingResearch } from './research/githubActions';
import { recordScopedLearningEvent, readScopedLearningStats } from './learningIntegrity';
import { fetchPermitContractors as fetchMunicipalPermitContractors } from './permitSources';

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
  WEBHOOK_SECRET?: string; // token para webhooks de correo (?token=...)
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
  GEOAPIFY_API_KEY?: string;
  LOCATIONIQ_API_KEY?: string;
  OPENCAGE_API_KEY?: string;
  TENANT_REFRESH_PER_CRON?: string;
  TENANT_REFRESH_EVERY_CRON?: string;
  RADAR_JOBS_PER_RUN?: string;
  AI?: { run(model: string, input: any): Promise<any> };
  BVELT_INGEST_URL?: string;
  BVELT_INGEST_KEY?: string;
  GITHUB_ACTIONS_TOKEN?: string;
  RADAR_RESEARCH_REPOSITORY?: string;
  RADAR_SIDECAR_CALLBACK_KEY?: string;
  RADAR_SERVICE_KEY?: string;
  BVELT_TENANT_INGEST_URL?: string;
  BVELT_TENANT_INGEST_KEY?: string;
  REPLY_FORWARD_TO?: string; // correo personal al que reenviar las respuestas recibidas (Resend Receiving)
}

export function getBudgetLimit(unitType: string): number {
  switch (unitType) {
    case 'discovery_units': return 30;
    case 'enrichment_units': return 20;
    case 'ai_units': return 10;
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

export async function fetchPermitContractors(city: string, trade: string): Promise<any[]> {
  try {
    // Prefer the verified multi-city Socrata catalog; it groups contractors,
    // filters by trade and enforces the 90-day evidence window.
    const municipal = await fetchMunicipalPermitContractors(city, trade, 60);
    if (municipal.length) {
      return municipal.map(item => ({
        name: item.name,
        phone: item.phone,
        city: item.city || city,
        zip: item.zip,
        trade: item.trade || trade,
        permits_90d: item.permits_90d,
        last_issued: item.last_issued,
        source: "permits"
      }));
    }

    // Preserve the original Orlando feed as a fallback, but never label an
    // undated or stale permit as recent activity.
    const permits = await fetchPublicPermits(city);
    if (!Array.isArray(permits)) return [];
    const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
    const tradeKey = String(trade || "").toLowerCase().replace(/[_-]+/g, " ");
    const tradePattern = tradeKey.includes("hvac") ? /hvac|air|heating|cooling|mechanical/i
      : tradeKey.includes("plumb") ? /plumb|drain|sewer/i
      : tradeKey.includes("roof") ? /roof/i
      : tradeKey.includes("electric") ? /electric/i
      : tradeKey.includes("landscap") || tradeKey.includes("lawn") ? /landscap|lawn|irrigat/i
      : tradeKey.includes("pest") ? /pest|exterminat/i
      : tradeKey.includes("clean") ? /clean|janitorial/i
      : tradeKey.includes("paint") ? /paint/i
      : tradeKey.includes("pool") ? /pool/i
      : null;
    const results: any[] = [];
    for (const permit of permits) {
      const name = String(permit.contractor_name || permit.company_name || permit.applicant_name || "").trim();
      if (!name) continue;
      const dateValue = permit.issued_date || permit.issue_date || permit.issuance_date || permit.permit_date;
      const issuedAt = dateValue ? Date.parse(String(dateValue)) : NaN;
      if (!Number.isFinite(issuedAt) || issuedAt < cutoff || issuedAt > Date.now() + 24 * 60 * 60 * 1000) continue;
      const description = [permit.description, permit.work_description, permit.permit_type].filter(Boolean).join(" ");
      const permitText = `${name} ${description}`.toLowerCase().replace(/[_-]+/g, " ");
      if (tradePattern ? !tradePattern.test(permitText) : !tradeKey || !permitText.includes(tradeKey)) continue;
      results.push({
        name,
        phone: permit.contractor_phone || permit.phone || null,
        city: permit.city || city,
        permits_90d: 1,
        last_issued: new Date(issuedAt).toISOString(),
        source: "permits"
      });
    }
    return results;
  } catch (error) {
    console.warn("[Permits] Municipal lookup failed:", error);
    return [];
  }
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
  niches: [
    "landscaping", "lawn_care", "hvac", "plumbing", "house_cleaning", "pool_cleaning",
    "handyman", "roofing", "pest_control", "electrical", "painting", "garage_door",
    "appliance_repair", "junk_removal", "moving", "fencing", "concrete", "flooring"
  ],
  subniches: ["residential_contractors", "commercial_contractors", "emergency_service_providers"],
  services: ["repair", "maintenance", "installation", "cleaning"],
  geographies: [
    "Tampa, FL", "Orlando, FL", "Jacksonville, FL", "Miami, FL", "Fort Lauderdale, FL",
    "Austin, TX", "Houston, TX", "Dallas, TX", "San Antonio, TX", "Fort Worth, TX",
    "Atlanta, GA", "Charlotte, NC", "Raleigh, NC", "Nashville, TN", "Birmingham, AL",
    "Phoenix, AZ", "Tucson, AZ", "Las Vegas, NV", "Denver, CO", "Salt Lake City, UT",
    "Columbus, OH", "Indianapolis, IN", "Kansas City, MO", "Oklahoma City, OK",
    "Richmond, VA", "Virginia Beach, VA", "Louisville, KY", "Memphis, TN",
    "Sacramento, CA", "Riverside, CA", "San Diego, CA", "Portland, OR", "Seattle, WA"
  ],
  countries: ["US", "CA"],
  languages: ["en", "es"],
  icp: {
    description: "Local service businesses with visible phone lines, websites, high-margin jobs, and lead-capture friction across US/CA markets.",
    keywords: ["plumber", "hvac", "electrician", "contractor", "cleaning", "landscaping", "roofer", "handyman"]
  },
  min_score: 0,
  max_daily_outreach: 12
};

// Hard daily execution limits (respect free-tier API ceilings)
const LIMITS = {
  max_discover_per_day: 40,
  max_finalize_per_day: 12,
  max_ai_calls_per_day: 20,
  max_hunter_credits_per_day: 10,
};

// National rotation pool — founder must not stay stuck in 6 metros
const PRIORITY_CITIES = [
  "Tampa, FL", "Orlando, FL", "Jacksonville, FL", "Miami, FL", "Fort Lauderdale, FL", "St. Petersburg, FL",
  "Austin, TX", "Houston, TX", "Dallas, TX", "San Antonio, TX", "Fort Worth, TX", "El Paso, TX",
  "Atlanta, GA", "Charlotte, NC", "Raleigh, NC", "Nashville, TN", "Memphis, TN", "Knoxville, TN",
  "Birmingham, AL", "Phoenix, AZ", "Tucson, AZ", "Las Vegas, NV", "Denver, CO", "Colorado Springs, CO",
  "Salt Lake City, UT", "Columbus, OH", "Cincinnati, OH", "Indianapolis, IN", "Kansas City, MO", "St. Louis, MO",
  "Oklahoma City, OK", "Tulsa, OK", "Richmond, VA", "Virginia Beach, VA", "Louisville, KY", "New Orleans, LA",
  "Sacramento, CA", "Fresno, CA", "Riverside, CA", "San Diego, CA", "Bakersfield, CA",
  "Portland, OR", "Seattle, WA", "Boise, ID", "Albuquerque, NM", "Omaha, NE", "Des Moines, IA",
  "Minneapolis, MN", "Milwaukee, WI", "Detroit, MI", "Grand Rapids, MI", "Pittsburgh, PA", "Philadelphia, PA",
  "Buffalo, NY", "Rochester, NY", "Hartford, CT", "Providence, RI", "Baltimore, MD", "Washington, DC"
];

const PRIORITY_TRADES = [
  "landscaping", "lawn_care", "hvac", "plumbing", "house_cleaning", "pool_cleaning",
  "handyman", "roofing", "pest_control", "electrical", "painting", "garage_door",
  "appliance_repair", "junk_removal", "fencing", "flooring"
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
  garage_door: ["property management", "real estate", "facility manager", "apartment complex", "hoa"],
  appliance_repair: ["property management", "apartment complex", "hotel", "facility manager"],
  junk_removal: ["property management", "real estate", "construction company", "facility manager"],
  fencing: ["property management", "real estate", "hoa", "apartment complex"],
  concrete: ["general contractor", "property management", "real estate", "commercial developer"],
  moving: ["property management", "real estate", "apartment complex"],
  commercial_cleaning: ["property management", "office building", "hotel", "gym", "school", "facility manager"],
  janitorial: ["property management", "office building", "hotel", "gym", "school", "facility manager"],
  window_cleaning: ["property management", "office building", "hotel", "retail store", "apartment complex"],
  pressure_washing: ["property management", "hoa", "apartment complex", "retail store", "hotel", "restaurant"],
  tree_service: ["property management", "hoa", "apartment complex", "golf course", "school"],
  paving: ["property management", "general contractor", "commercial developer", "hoa", "retail store"],
  asphalt: ["property management", "general contractor", "commercial developer", "hoa", "retail store"],
  security: ["property management", "hotel", "retail store", "industrial plant", "apartment complex", "school"],
  it_services: ["insurance agency", "real estate", "general contractor", "retail store", "school", "gym"],
  solar: ["property management", "real estate", "general contractor", "commercial developer", "school"],
  fire_protection: ["property management", "hotel", "restaurant", "school", "industrial plant", "apartment complex"],
  carpet_cleaning: ["property management", "hotel", "office building", "apartment complex", "school"],
  signage: ["retail store", "restaurant", "gym", "real estate", "general contractor"],
  locksmith: ["property management", "apartment complex", "hotel", "real estate", "facility manager"],
};

export function resolveTenantBuyerSegments(
  niche: string,
  expandedSegments: Array<string | { label?: string }> = []
): string[] {
  const expanded = Array.from(new Set(
    expandedSegments
      .map(segment => typeof segment === "string" ? segment : String(segment?.label || ""))
      .map(label => label.trim())
      .filter(Boolean)
  ));
  if (expanded.length) return expanded.slice(0, 6);

  const normalized = String(niche || "").trim().toLowerCase();
  const key = normalized.replace(/\s+/g, "_");
  const mapped = TENANT_TARGET_MAP[key] || TENANT_TARGET_MAP[normalized] || [];
  return [...mapped];
}

// OSM Tag mappings by trade for high-precision Overpass queries (contractor field operators, not retail stores)
const OVERPASS_TRADE_TAGS: Record<string, string[]> = {
  plumbing: [
    'craft="plumber"',
    'craft="plumbing"',
    'shop="plumbing"',
    'office="plumbing"',
    'amenity="plumbing"',
    'name~"plumb"',
    'name~"plumber"',
    'name~"drain"'
  ],
  hvac: ['craft="hvac"', 'craft="heating_technician"', 'craft="heating_contractor"', 'craft="air_conditioning"', 'name~"hvac"', 'name~"heating and cooling"', 'name~"air conditioning"'],
  landscaping: ['craft="gardener"', 'craft="landscaper"', 'craft="groundskeeper"'],
  lawn_care: ['craft="gardener"', 'craft="landscaper"', 'craft="groundskeeper"', 'craft="lawn_mower"'],
  electrical: ['craft="electrician"', 'craft="electrical"', 'shop="electrical"', 'name~"electric"', 'name~"electrician"'],
  house_cleaning: ['craft="cleaner"', 'office="cleaning_agency"', 'office="cleaning"'],
  cleaning: ['craft="cleaner"', 'office="cleaning_agency"', 'office="cleaning"'],
  pool_cleaning: ['craft="swimming_pool"', 'craft="pool_technician"', 'office="pool_service"'],
  pool: ['craft="swimming_pool"', 'craft="pool_technician"', 'office="pool_service"'],
  handyman: ['craft="handyman"', 'craft="carpenter"', 'craft="joiner"', 'craft="builder"', 'name~"handyman"', 'name~"handy man"', 'shop="doityourself"'],
  roofing: ['craft="roofer"', 'craft="roofing"', 'name~"roof"', 'name~"roofer"', 'shop="roofing"'],
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

export interface TenantAuthContext {
  authorized: boolean;
  isService: boolean;
  isFounderSession: boolean;
  tenantId: string | null;
  canAccessTenant: (targetTenantId: string | null | undefined) => boolean;
}

export function isAuthorized(request: Request, env: Env, serviceKey?: string, validSessionHash?: string): boolean {
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
  const bearerToken = authHeader && authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;
  // Only the founder credential may access global/admin routes. Service ingestion
  // credentials are deliberately not accepted here.
  if (bearerToken && ((serviceKey && bearerToken === serviceKey) ||
      (env.FOUNDER_SERVICE_KEY && bearerToken === env.FOUNDER_SERVICE_KEY))) return true;
  return false;
}

export function resolveTenantAuthContext(
  request: Request,
  env: Env,
  serviceKey?: string,
  validSessionHash?: string
): TenantAuthContext {
  const cookieHeader = request.headers.get("Cookie") || "";
  const parsedCookies: Record<string, string> = {};
  cookieHeader.split(";").forEach(c => {
    const [k, ...v] = c.trim().split("=");
    if (k) parsedCookies[k.trim()] = decodeURIComponent(v.join("=").trim());
  });

  const authHeader = request.headers.get("Authorization") || "";
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;
  const sessionCookie = parsedCookies["bvelt_session"];
  const tenantCookie = parsedCookies["bvelt_tenant_id"];

  // Founder credentials retain global administrative access. RADAR_SERVICE_KEY
  // is restricted to the single tenant explicitly supplied by the trusted Bvelt
  // server-to-server caller. The ingestion key is never an API authentication key.
  const isFounderService = Boolean(bearerToken && (
    (serviceKey && bearerToken === serviceKey) ||
    (env.FOUNDER_SERVICE_KEY && bearerToken === env.FOUNDER_SERVICE_KEY)
  ));
  const isRadarService = Boolean(bearerToken && env.RADAR_SERVICE_KEY && bearerToken === env.RADAR_SERVICE_KEY);
  const isService = isFounderService || isRadarService;
  const isFounderSession = Boolean(validSessionHash && sessionCookie === validSessionHash);
  const headerTenantId = request.headers.get("X-Tenant-Id") || request.headers.get("x-tenant-id");
  const callerTenantId: string | null = isFounderSession || isFounderService
    ? "founder"
    : (headerTenantId || tenantCookie || null);
  const authorized = isFounderService || isFounderSession || (isRadarService && !!callerTenantId && callerTenantId !== "founder");

  return {
    authorized,
    isService,
    isFounderSession: isFounderSession || isFounderService,
    tenantId: callerTenantId,
    canAccessTenant: (targetTenant: string | null | undefined): boolean => {
      if (!authorized || !targetTenant) return false;
      if (isFounderService || isFounderSession) return true;
      return isRadarService && callerTenantId === targetTenant && targetTenant !== "founder";
    }
  };
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
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Tenant-Id",
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
        const tenantId = url.searchParams.get("tenant_id") || "founder";
        return await handleHealth(env, corsHeaders, tenantId);
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

      // 2d. Serve PWA Console Static Assets ONLY for UI shell — never for API routes.
      // Bug histórico: /opportunities y /missions NO estaban en la lista → ASSETS devolvía
      // HTML/placeholder y el frontend nunca recibía JSON (lista siempre en 0).
      const isWorkerApiPath =
        path.startsWith("/api/") ||
        path.startsWith("/webhook") ||
        path.startsWith("/telegram") ||
        path.startsWith("/opportunities") ||
        path.startsWith("/missions") ||
        path.startsWith("/prospects") ||
        path.startsWith("/seeds") ||
        path.startsWith("/demo") ||
        [
          "/run",
          "/health",
          "/stats",
          "/decision",
          "/suppression",
          "/fix-suppression",
          "/verify-key",
          "/logout",
          "/telegram-webhook",
          "/telegram/webhook",
        ].includes(path);

      if ((env as any).ASSETS && !isWorkerApiPath) {
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
          const force = url.searchParams.get("force") !== "false";
          
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
      // Webhooks de correo (Resend/Brevo) no pueden enviar "Authorization: Bearer": se validan con un token secreto en la URL.
      // Opcional (tiempo real): registra el webhook como https://TU-WORKER/webhook/resend?token=<TELEGRAM_WEBHOOK_SECRET>. Sin esto, el cron consulta a Resend igualmente.
      const isWebhookPath = method === "POST" && ["/api/events", "/events", "/api/reply", "/webhook/events", "/webhook/resend", "/webhook/brevo"].includes(path);
      const webhookSecret = (((env as any).WEBHOOK_SECRET || env.TELEGRAM_WEBHOOK_SECRET || "") as string).trim() || undefined;
      const webhookOk = isWebhookPath && !!webhookSecret && url.searchParams.get("token") === webhookSecret;
      const isResearchCallbackPath = path.startsWith("/api/research/") || path.startsWith("/research/");
      // These routes authenticate again with resolveTenantAuthContext and enforce
      // exact tenant ownership before reading or mutating tenant data. They must
      // reach that guard instead of being rejected by the Founder-only gate.
      const isTenantScopedRequest =
        ((method === "GET" || method === "POST") && ["/api/tenants/config", "/tenants/config"].includes(path)) ||
        (method === "POST" && ["/api/tenants/search", "/tenants/search", "/api/bvelt/bootstrap", "/bvelt/bootstrap", "/api/prospects/outcome", "/prospects/outcome"].includes(path)) ||
        (method === "GET" && ["/api/tenants/leads.csv", "/tenants/leads.csv", "/api/bvelt/leads", "/bvelt/leads"].includes(path));

      if (isResearchCallbackPath) {
        if (!isSidecarCallbackAuthorized(request, env)) {
          return Response.json({ error: "Unauthorized. Missing or invalid callback key." }, { status: 401, headers: corsHeaders });
        }
      } else if (!authorized && !webhookOk && !isTenantScopedRequest) {
        return Response.json({ error: "Unauthorized. Missing or invalid service key." }, { status: 401, headers: corsHeaders });
      }


      // 4. Stats Endpoint (Includes learning performance)
      if (path === "/stats" && method === "GET") {
        return await handleStats(env, corsHeaders);
      }

      // 4b. Resumen de salud del radar: lo calcula y lo manda a Telegram al instante (abrir en el navegador ya logueado)
      if ((path === "/api/digest/now" || path === "/digest/now") && (method === "GET" || method === "POST")) {
        const r = await sendRadarDigest(env, { force: true });
        return Response.json({ success: r.sent, verdict: r.verdict, headline: r.headline, telegram: r.telegram, data: r.data }, { headers: corsHeaders });
      }

      // 6. Decision API Endpoint (sent / discard / suppress / replied / demo / won)
      if (path === "/decision" && method === "POST") {
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

      // 7b. Self-healing suppression and cooldown repair endpoint
      if ((path === "/fix-suppression" || path === "/api/fix-suppression") && method === "POST") {
        if (!authorized) {
          return Response.json({ error: "Unauthorized. Missing or invalid service key." }, { status: 401, headers: corsHeaders });
        }

        let deletedInvalidSuppressions = 0;
        let reactivatedProspects = 0;

        // (a) Delete suppression entries created by invalid email bounces
        try {
          const suppRows = await env.RADAR_DB.prepare(
            "SELECT key, reason FROM suppression WHERE lower(reason) LIKE '%invalid%' OR lower(reason) LIKE '%bounced%'"
          ).all();
          const items = (suppRows.results || []) as any[];
          for (const item of items) {
            const check = sanitizeEmail(item.key);
            if (!check.valid) {
              await env.RADAR_DB.prepare("DELETE FROM suppression WHERE key = ?").bind(item.key).run();
              deletedInvalidSuppressions++;
            }
          }
        } catch (e: any) {
          console.warn("[fix-suppression] Error cleaning suppression entries:", e);
        }

        
        // (a1b) Selective retry of suppressions caused by sender-side Resend bounces
        // (e.g. unverified onboarding@resend.dev domain). NOT part of the default self-heal:
        // only runs when explicitly requested via POST /fix-suppression {"retry_resend_bounces": true}
        // or ?retry_resend_bounces=true. Call it ONLY after the sender domain is verified in Resend.
        let retriedResendBounces = 0;
        let reactivatedBouncedProspects = 0;
        try {
          let reqBody: any = {};
          try { reqBody = await request.json(); } catch { reqBody = {}; }
          const retryFlag = String(reqBody?.retry_resend_bounces || url.searchParams.get("retry_resend_bounces") || "").trim().toLowerCase() === "true";
          if (retryFlag) {
            const bounceRows = await env.RADAR_DB.prepare(
              "SELECT key FROM suppression WHERE lower(COALESCE(reason,'')) = 'resend_bounced'"
            ).all();
            const bouncedEmails: string[] = [];
            for (const item of ((bounceRows.results || []) as any[])) {
              await env.RADAR_DB.prepare("DELETE FROM suppression WHERE key = ?").bind(item.key).run();
              retriedResendBounces++;
              bouncedEmails.push(String(item.key).trim().toLowerCase());
            }
            if (bouncedEmails.length > 0) {
              const placeholders = bouncedEmails.map(() => '?').join(',');
              const react = await env.RADAR_DB.prepare(
                `UPDATE prospects SET status = 'qualified', cooldown_until = NULL, updated_at = ? WHERE lower(COALESCE(email,'')) IN (${placeholders}) AND status IN ('suppressed','bounced')`
              ).bind(new Date().toISOString(), ...bouncedEmails).run();
              reactivatedBouncedProspects = react?.meta?.changes || 0;
            }
          }
        } catch (e: any) {
          console.warn("[fix-suppression] resend_bounced retry error:", e);
        }

        // (a2) Purge soft "Contacted on" suppressions older than 25 days (fixes cooldown-until-2027 leftovers)
        try {
          const softRows = await env.RADAR_DB.prepare(
            "SELECT key, reason, created_at FROM suppression WHERE lower(reason) LIKE '%contacted on%' OR lower(reason) LIKE '%cooldown%'"
          ).all();
          const nowMs = Date.now();
          const softMs = 25 * 24 * 60 * 60 * 1000;
          for (const item of (softRows.results || []) as any[]) {
            const reason = String(item.reason || "");
            const rl = reason.toLowerCase();
            if (rl.includes('bounce') || rl.includes('complaint') || rl.includes('unsubscribe')) continue;
            let exp = item.created_at ? Date.parse(item.created_at) + softMs : 0;
            const m = reason.match(/cooldown until ([0-9T:\-.+Z]+)/i);
            if (m) {
              const p = Date.parse(m[1]);
              if (!isNaN(p)) exp = p;
            }
            if (exp && nowMs > exp) {
              await env.RADAR_DB.prepare("DELETE FROM suppression WHERE key = ?").bind(item.key).run();
            }
          }
        } catch (e) {
          console.warn("[fix-suppression] soft purge error:", e);
        }

        // (b) Reactivate prospects with cooldown_until > 40 days and score >= 50
        try {
          const future40d = new Date(Date.now() + 40 * 24 * 60 * 60 * 1000).toISOString();
          const reactivateResult = await env.RADAR_DB.prepare(`
            UPDATE prospects
            SET status = 'qualified', cooldown_until = NULL, updated_at = ?
            WHERE cooldown_until > ? AND COALESCE(score, opportunity_score, 0) >= 50
          `).bind(new Date().toISOString(), future40d).run();
          reactivatedProspects = reactivateResult?.meta?.changes || 0;
        } catch (e: any) {
          console.warn("[fix-suppression] Error reactivating prospects:", e);
        }

        return Response.json({
          success: true,
          deleted_invalid_suppressions: deletedInvalidSuppressions,
          reactivated_prospects: reactivatedProspects,
          retried_resend_bounces: retriedResendBounces,
          reactivated_bounced_prospects: reactivatedBouncedProspects,
          timestamp: new Date().toISOString()
        }, { headers: corsHeaders });
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
        const minScore = parseInt(url.searchParams.get("min_score") || "0", 10);
        // Founder UI omits tenant_id → scope founder only (never mix tenants)
        const scopeTenant = (tenantId || "founder").trim() || "founder";

        // Normaliza tenant_id: en SQLite COALESCE('','founder') NO corrige string vacío.
        // También repara filas huérfanas alineando tenant_id al del prospecto.
        try {
          await ensureOpportunitiesSchema(env.RADAR_DB);
          await env.RADAR_DB.prepare(`
            UPDATE opportunities
            SET tenant_id = 'founder'
            WHERE tenant_id IS NULL OR TRIM(tenant_id) = '' OR LOWER(TRIM(tenant_id)) = 'null'
          `).run();
          // Alinear tenant_id de la oportunidad al del prospecto cuando el prospecto tiene tenant real
          await env.RADAR_DB.prepare(`
            UPDATE opportunities
            SET tenant_id = (
              SELECT COALESCE(NULLIF(TRIM(p.tenant_id), ''), 'founder')
              FROM prospects p WHERE p.id = opportunities.prospect_id
            )
            WHERE prospect_id IS NOT NULL
              AND EXISTS (
                SELECT 1 FROM prospects p
                WHERE p.id = opportunities.prospect_id
                  AND COALESCE(NULLIF(TRIM(p.tenant_id), ''), 'founder')
                      != COALESCE(NULLIF(TRIM(opportunities.tenant_id), ''), 'founder')
              )
          `).run();
        } catch (normErr: any) {
          console.warn("[GET /opportunities] tenant normalize:", normErr?.message || normErr);
        }

        // Auto-curación si el scope sigue vacío
        try {
          const cnt: any = await env.RADAR_DB.prepare(
            `SELECT COUNT(*) AS c FROM opportunities
             WHERE COALESCE(NULLIF(TRIM(tenant_id), ''), 'founder') = ?`
          ).bind(scopeTenant).first();
          if (!cnt || Number(cnt.c) === 0) {
            const ps = await env.RADAR_DB.prepare(`
              SELECT id, name, city, trade, score, opportunity_score, tenant_id, expected_value,
                     fit_score, intent_score, pain_score, decision_state, why_now_json
              FROM prospects
              WHERE COALESCE(NULLIF(TRIM(tenant_id), ''), 'founder') = ?
                AND COALESCE(score, opportunity_score, 0) >= 40
                AND status NOT IN ('discarded','suppressed','blocked','disqualified')
              ORDER BY COALESCE(score, opportunity_score, 0) DESC LIMIT 12
            `).bind(scopeTenant).all();
            const nowIso = new Date().toISOString();
            for (const pr of (ps.results || []) as any[]) {
              const strat = Math.round(pr.opportunity_score || pr.score || 50);
              const tid = scopeTenant;
              const ttl = `${pr.name} — ${pr.trade || "service"} (${pr.city || ""})`;
              try {
                await env.RADAR_DB.prepare(`
                  INSERT OR IGNORE INTO opportunities (
                    id, prospect_id, tenant_id, mode, title, first_seen_at, last_seen_at, status, strategic_score,
                    fit_score, intent_score, pain_score, expected_value, decision_state, why_now_json, priority_tier, created_at, updated_at
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).bind(
                  `opp_${pr.id}`, pr.id, tid, tid === "founder" ? "founder" : "tenant", ttl, nowIso, nowIso, strat,
                  pr.fit_score || strat, pr.intent_score || Math.round(strat * 0.8), pr.pain_score || 50,
                  pr.expected_value || 0, pr.decision_state || "identified", pr.why_now_json || null,
                  strat >= 80 ? "high" : strat >= 55 ? "medium" : "low", nowIso, nowIso
                ).run();
              } catch {
                try {
                  await env.RADAR_DB.prepare(`
                    INSERT OR IGNORE INTO opportunities (id, prospect_id, tenant_id, mode, title, first_seen_at, last_seen_at, strategic_score, priority_tier, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                  `).bind(`opp_${pr.id}`, pr.id, tid, tid === "founder" ? "founder" : "tenant", ttl, nowIso, nowIso, strat,
                    strat >= 80 ? "high" : strat >= 55 ? "medium" : "low", nowIso, nowIso).run();
                } catch { /* sigue */ }
              }
            }
          }
        } catch (healErr: any) {
          console.warn("[GET /opportunities] auto-heal failed:", healErr?.message || healErr);
        }

        // Lectura robusta: normaliza tenant vacío; si falla el JOIN, degrada sin JOIN.
        // Último recurso: devolver por prospect_id del scope aunque tenant_id de la opp esté mal.
        const attempts: { sql: string; binds: any[] }[] = [
          {
            sql: `SELECT o.*, p.name as prospect_name, p.city as prospect_city, p.trade as prospect_trade,
                         p.website as prospect_website, p.phone as prospect_phone, p.email as prospect_email,
                         p.status as prospect_status, p.draft_subject, p.draft_body
                  FROM opportunities o
                  LEFT JOIN prospects p ON o.prospect_id = p.id
                  WHERE COALESCE(o.strategic_score, 0) >= ?
                    AND COALESCE(NULLIF(TRIM(o.tenant_id), ''), 'founder') = ?
                  ORDER BY COALESCE(o.strategic_score, 0) DESC, o.created_at DESC LIMIT ?`,
            binds: [minScore, scopeTenant, limit],
          },
          {
            sql: `SELECT * FROM opportunities
                  WHERE COALESCE(strategic_score, 0) >= ?
                    AND COALESCE(NULLIF(TRIM(tenant_id), ''), 'founder') = ?
                  ORDER BY COALESCE(strategic_score, 0) DESC LIMIT ?`,
            binds: [minScore, scopeTenant, limit],
          },
          {
            sql: `SELECT o.*, p.name as prospect_name, p.city as prospect_city, p.trade as prospect_trade,
                         p.website as prospect_website, p.phone as prospect_phone, p.email as prospect_email,
                         p.status as prospect_status, p.draft_subject, p.draft_body
                  FROM opportunities o
                  INNER JOIN prospects p ON o.prospect_id = p.id
                  WHERE COALESCE(NULLIF(TRIM(p.tenant_id), ''), 'founder') = ?
                    AND COALESCE(p.score, p.opportunity_score, o.strategic_score, 0) >= ?
                  ORDER BY COALESCE(o.strategic_score, p.score, 0) DESC LIMIT ?`,
            binds: [scopeTenant, minScore, limit],
          },
          {
            sql: `SELECT * FROM opportunities
                  WHERE COALESCE(NULLIF(TRIM(tenant_id), ''), 'founder') = ?
                  ORDER BY rowid DESC LIMIT ?`,
            binds: [scopeTenant, limit],
          },
        ];
        for (const a of attempts) {
          try {
            const res = await env.RADAR_DB.prepare(a.sql).bind(...a.binds).all();
            const rows = res.results || [];
            if (rows.length > 0 || a === attempts[attempts.length - 1]) {
              return Response.json(rows, { headers: corsHeaders });
            }
          } catch (e: any) {
            console.warn("[GET /opportunities]", e?.message || e);
          }
        }
        return Response.json([], { headers: corsHeaders });
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

      // 8c-bis. Backfill opportunities — FIXED: upsertOpportunity (no false "ya existían")
      if ((path === "/api/opportunities/backfill" || path === "/opportunities/backfill") && method === "POST") {
        try {
          await ensureOpportunitiesSchema(env.RADAR_DB);
          const scopeTenant = (url.searchParams.get("tenant_id") || "founder").trim() || "founder";
          const batchSize = Math.min(parseInt(url.searchParams.get("limit") || "15", 10), 20);
          const offset = Math.max(parseInt(url.searchParams.get("offset") || "0", 10), 0);
          const q = `SELECT p.id, p.name, p.city, p.trade, p.score, p.opportunity_score,
                            p.fit_score, p.intent_score, p.pain_score, p.ability_to_pay_score,
                            p.contactability_score, p.timing_score, p.evidence_score,
                            p.signal_freshness_score, p.expected_value, p.decision_state,
                            p.why_now_json, p.tenant_id, p.status
                     FROM prospects p
                     WHERE COALESCE(p.score, p.opportunity_score, 0) >= 35
                       AND lower(COALESCE(p.status,'')) IN ('approved','qualified','scored','hold')
                       AND COALESCE(NULLIF(TRIM(p.tenant_id), ''), 'founder') = ?
                       AND NOT EXISTS (
                         SELECT 1 FROM opportunities o
                         WHERE (o.id = 'opp_' || p.id OR o.prospect_id = p.id)
                           AND COALESCE(NULLIF(TRIM(o.tenant_id), ''), 'founder') = ?
                       )
                     ORDER BY COALESCE(p.score, p.opportunity_score, 0) DESC LIMIT ? OFFSET ?`;
          let prospects: any[] = [];
          try {
            const rows = await env.RADAR_DB.prepare(q).bind(scopeTenant, scopeTenant, batchSize, offset).all();
            prospects = rows.results || [];
          } catch {
            const rows = await env.RADAR_DB.prepare(`
              SELECT id, name, city, trade, score, opportunity_score, fit_score, intent_score, pain_score,
                     ability_to_pay_score, contactability_score, timing_score, evidence_score,
                     signal_freshness_score, expected_value, decision_state, why_now_json, tenant_id, status
              FROM prospects
              WHERE COALESCE(score, opportunity_score, 0) >= 35
                AND lower(COALESCE(status,'')) IN ('approved','qualified','scored','hold')
                AND COALESCE(NULLIF(TRIM(tenant_id), ''), 'founder') = ?
              ORDER BY COALESCE(score, opportunity_score, 0) DESC LIMIT ? OFFSET ?`).bind(scopeTenant, batchSize, offset).all();
            prospects = rows.results || [];
          }
          let created = 0, skippedExisting = 0, failed = 0;
          const errors: string[] = [];
          for (const p of prospects) {
            const oppId = `opp_${p.id}`;
            try {
              const already = await env.RADAR_DB.prepare(`SELECT id FROM opportunities WHERE id = ? OR prospect_id = ? LIMIT 1`).bind(oppId, p.id).first();
              if (already) { skippedExisting++; continue; }
            } catch {}
            const stratScore = Math.round(Number(p.opportunity_score || p.score || 50));
            try {
              const ok = await upsertOpportunity(env.RADAR_DB, {
                id: oppId, prospect_id: p.id, tenant_id: scopeTenant,
                mode: scopeTenant === "founder" ? "founder" : "tenant",
                title: `${p.name} — ${p.trade || "service"} (${p.city || ""})`,
                strategic_score: stratScore,
                fit_score: Number(p.fit_score || stratScore),
                intent_score: Number(p.intent_score || Math.round(stratScore * 0.8)),
                pain_score: Number(p.pain_score || Math.round(stratScore * 0.7)),
                ability_to_pay_score: Number(p.ability_to_pay_score || 60),
                contactability_score: Number(p.contactability_score || 70),
                timing_score: Number(p.timing_score || 50),
                evidence_score: Number(p.evidence_score || 50),
                signal_freshness_score: Number(p.signal_freshness_score || 80),
                expected_value: Number(p.expected_value || Math.round(stratScore * 25)),
                decision_state: String(p.decision_state || "identified"),
                why_now_json: p.why_now_json || null,
                priority_tier: stratScore >= 80 ? "high" : stratScore >= 55 ? "medium" : "low",
              });
              if (ok) created++; else { failed++; errors.push("upsert false " + p.id); }
            } catch (e: any) {
              failed++;
              if (errors.length < 5) errors.push(String(e?.message || e).slice(0, 140));
            }
          }
          const hasMore = prospects.length >= batchSize;
          return Response.json({
            success: true, scope_tenant: scopeTenant, prospects_scanned: prospects.length,
            opportunities_created: created, skipped_existing: skippedExisting, failed,
            offset, batch_size: batchSize, next_offset: hasMore ? offset + batchSize : null, has_more: hasMore,
            errors: errors.length ? errors : undefined,
            message: `Lote: ${created} creadas, ${skippedExisting} ya existían, ${failed} fallos.`,
          }, { headers: corsHeaders });
        } catch (e: any) {
          return Response.json({ error: e.message || String(e) }, { status: 500, headers: corsHeaders });
        }
      }

      // 8c. Missions System Endpoints
      if ((path === "/missions" || path === "/api/missions") && method === "GET") {
        const tenantId = url.searchParams.get("tenant_id") || "founder";
        let missions: any[] = [];
        let daily: any[] = [];
        try {
          const customMissions = await env.RADAR_DB.prepare(
            "SELECT * FROM missions WHERE COALESCE(tenant_id,'founder') = ? ORDER BY created_at DESC"
          ).bind(tenantId).all();
          missions = customMissions.results || [];
        } catch {
          try {
            const all = await env.RADAR_DB.prepare("SELECT * FROM missions ORDER BY created_at DESC LIMIT 50").all();
            missions = all.results || [];
          } catch { /* ok */ }
        }
        try {
          const dailyMissions = await env.RADAR_DB.prepare(
            "SELECT * FROM daily_missions WHERE COALESCE(tenant_id,'founder') = ? ORDER BY day DESC LIMIT 30"
          ).bind(tenantId).all();
          daily = dailyMissions.results || [];
        } catch {
          try {
            const dailyMissions = await env.RADAR_DB.prepare(
              "SELECT * FROM daily_missions ORDER BY day DESC LIMIT 30"
            ).all();
            daily = dailyMissions.results || [];
          } catch (e2: any) {
            console.warn("[GET /missions]", e2?.message || e2);
          }
        }
        return Response.json({ missions, daily_missions: daily }, { headers: corsHeaders });
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

      // 13. Events & Reply Webhook Endpoint (/api/events, /events, /api/reply, /webhook/events, /webhook/resend, /webhook/brevo)
      if ((path === "/api/events" || path === "/events" || path === "/api/reply" || path === "/webhook/events" || path === "/webhook/resend" || path === "/webhook/brevo") && method === "POST") {
        const rawBody: any = await request.json().catch(() => ({}));
        const rawEvents = Array.isArray(rawBody) ? rawBody : [rawBody];
        const results = [];

        for (const body of rawEvents) {
          let prospectId = body.prospect_id || body.id || null;
          let email = body.email || null;
          let eventType = body.event_type || body.event || body.action || null;
          let content = body.content || body.text || body.body || body.notes || null;

          // Resend webhook format: { type: "email.opened" | "email.clicked" | "email.bounced" | "email.delivered" | "email.incoming", data: { to, from, text, subject } }
          if (body.type && body.data) {
            const resendType = String(body.type).toLowerCase();
            if (resendType.includes("opened") || resendType.includes("open")) eventType = "opened";
            else if (resendType.includes("clicked") || resendType.includes("click")) eventType = "clicked";
            else if (resendType.includes("bounced") || resendType.includes("bounce")) eventType = "bounced";
            else if (resendType.includes("delivered")) eventType = "delivered";
            else if (resendType.includes("complained") || resendType.includes("spam")) eventType = "negative";
            else if (resendType.includes("received")) {
              // Resend inbound (email.received): el webhook trae solo metadatos (data.from = remitente, data.email_id).
              // El cuerpo se obtiene con GET /emails/{id} (Received emails API).
              eventType = "replied";
              const inboundFrom = String(body.data.from || "").trim();
              if (inboundFrom) email = inboundFrom.toLowerCase();
              try {
                const inboundId = String(body.data.email_id || "");
                const apiKey = String((env as any).RESEND_API_KEY || "").trim();
                if (inboundId && apiKey) {
                  const inboundRes = await fetch(`https://api.resend.com/emails/${encodeURIComponent(inboundId)}`, {
                    headers: { Authorization: `Bearer ${apiKey}` },
                    signal: AbortSignal.timeout(8000)
                  });
                  if (inboundRes.ok) {
                    const inboundData: any = await inboundRes.json().catch(() => ({}));
                    content = inboundData?.text || inboundData?.subject || content;
                    // Opcional: reenviar la respuesta al correo personal del founder (REPLY_FORWARD_TO).
                    const forwardTo = String((env as any).REPLY_FORWARD_TO || "").trim();
                    if (forwardTo) {
                      const fwdHtml = String(inboundData?.html || "");
                      const fwdText = String(inboundData?.text || "");
                      const fwdPayload: Record<string, unknown> = {
                        from: String((env as any).OUTBOUND_EMAIL_FROM || "").trim()
                          || (Array.isArray(inboundData?.to) && inboundData.to[0]) || "replies@bvelt.app",
                        to: [forwardTo],
                        subject: `Fwd: ${String(inboundData?.subject || body.data.subject || "(no subject)")}`
                      };
                      if (fwdHtml) fwdPayload.html = fwdHtml;
                      if (fwdText) fwdPayload.text = fwdText;
                      if (!fwdHtml && !fwdText) fwdPayload.text = String(inboundData?.subject || "(empty reply)");
                      await fetch("https://api.resend.com/emails", {
                        method: "POST",
                        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
                        body: JSON.stringify(fwdPayload),
                        signal: AbortSignal.timeout(8000)
                      });
                    }
                  }
                }
              } catch (e: any) {
                console.warn("[webhook] email.received processing error:", e?.message || e);
              }
            }
            else if (resendType.includes("incoming") || resendType.includes("reply") || resendType.includes("replied")) {
              eventType = "replied";
              content = body.data.text || body.data.html || body.data.subject || content;
            }

            if (Array.isArray(body.data.to) && body.data.to.length > 0) {
              email = email || body.data.to[0];
            } else if (typeof body.data.to === "string") {
              email = email || body.data.to;
            }

            if ((resendType.includes("incoming") || resendType.includes("received")) && body.data.from) {
              const fromStr = String(body.data.from);
              const extractedFrom = fromStr.includes("<") ? fromStr.replace(/.*<([^>]+)>.*/, "$1") : fromStr;
              email = extractedFrom.trim();
            }
          }

          // Brevo (Sendinblue) webhook format: { event: "delivered" | "opened" | "click" | "hard_bounce" | "soft_bounce" | "reply", email, content, subject }
          if (body.event && (body.email || body["message-id"])) {
            const brevoEvent = String(body.event).toLowerCase();
            if (brevoEvent === "opened") eventType = "opened";
            else if (brevoEvent === "click" || brevoEvent === "clicked") eventType = "clicked";
            else if (brevoEvent.includes("bounce")) eventType = "bounced";
            else if (brevoEvent === "delivered") eventType = "delivered";
            else if (brevoEvent.includes("spam") || brevoEvent.includes("complaint")) eventType = "negative";
            else if (brevoEvent === "reply") {
              eventType = "replied";
              content = body.content || body.subject || content;
            }
            if (body.email) email = email || body.email;
          }

          if (!eventType) eventType = "replied";

          const eventResult = await handleProspectEvent({
            prospect_id: prospectId,
            email,
            event_type: eventType,
            content
          }, env);

          results.push(eventResult);
        }

        const responsePayload = Array.isArray(rawBody) ? { batch: true, count: results.length, results } : results[0];
        return Response.json(responsePayload, { headers: corsHeaders });
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
        const auth = resolveTenantAuthContext(request, env, serviceKey, validSessionHash);
        if (!auth.authorized) {
          return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
        }
        const tenantId = url.searchParams.get("tenant_id");
        if (tenantId) {
          if (!auth.canAccessTenant(tenantId)) {
            return Response.json({ error: "Forbidden: cross-tenant access denied" }, { status: 403, headers: corsHeaders });
          }
          const tenant = await env.RADAR_DB.prepare("SELECT * FROM tenant_config WHERE tenant_id = ?").bind(tenantId).first();
          return Response.json(tenant || { error: "Tenant config not found" }, { headers: corsHeaders });
        }
        if (!auth.isFounderSession) {
          return Response.json({ error: "Forbidden: tenant listing requires administrative privileges" }, { status: 403, headers: corsHeaders });
        }
        const tenants = await env.RADAR_DB.prepare("SELECT * FROM tenant_config ORDER BY tenant_id ASC").all();
        return Response.json(tenants.results || [], { headers: corsHeaders });
      }

      if ((path === "/api/tenants/config" || path === "/tenants/config") && method === "POST") {
        const auth = resolveTenantAuthContext(request, env, serviceKey, validSessionHash);
        if (!auth.authorized) {
          return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
        }
        const body: any = await request.json().catch(() => ({}));
        const tenantId = body.tenant_id;
        if (!tenantId) {
          return Response.json({ error: "tenant_id required" }, { status: 400, headers: corsHeaders });
        }
        if (!auth.canAccessTenant(tenantId)) {
          return Response.json({ error: "Forbidden: cannot modify configuration for another tenant" }, { status: 403, headers: corsHeaders });
        }
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
          body.tenant_name || body.business_name || "",
          body.industry || "",
          body.niche || "",
          JSON.stringify(Array.isArray(body.subniches) ? body.subniches : []),
          JSON.stringify(Array.isArray(body.services) ? body.services : []),
          JSON.stringify(Array.isArray(body.service_areas) ? body.service_areas : []),
          JSON.stringify(Array.isArray(body.countries) ? body.countries : []),
          JSON.stringify(Array.isArray(body.regions) ? body.regions : []),
          JSON.stringify(Array.isArray(body.cities) ? body.cities : (body.city ? [body.city] : [])),
          JSON.stringify(Array.isArray(body.languages) ? body.languages : []),
          body.icp_description || "",
          JSON.stringify(body.icp_keywords || []),
          body.minimum_score ?? 50,
          body.daily_outreach_limit ?? 10,
          JSON.stringify(body.allowed_markets || []),
          body.campaign_goal || "",
          body.messaging_angle || "",
          timestamp,
          timestamp
        ).run();

        // Saving a profile must never launch discovery. Tenant discovery is
        // explicitly requested by the user or triggered by a recent app session.
        return Response.json({ success: true, tenant_id: tenantId, run_id: null, message: "Tenant config saved. Prospecting has not started." }, { headers: corsHeaders });
      }

      // 16a2. Explicit and activity-triggered Tenant prospecting.
      // POST /api/tenants/search { tenant_id, trigger: "manual" | "activity" }
      if ((path === "/api/tenants/search" || path === "/tenants/search") && method === "POST") {
        const auth = resolveTenantAuthContext(request, env, serviceKey, validSessionHash);
        if (!auth.authorized) return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
        const body: any = await request.json().catch(() => ({}));
        const tenantId = String(body.tenant_id || auth.tenantId || "").trim();
        const trigger = body.trigger === "activity" ? "activity" : "manual";
        if (!tenantId || tenantId === "founder") return Response.json({ error: "tenant_id_required" }, { status: 400, headers: corsHeaders });
        if (!auth.canAccessTenant(tenantId)) return Response.json({ error: "Forbidden" }, { status: 403, headers: corsHeaders });

        const config: any = await env.RADAR_DB.prepare("SELECT tenant_id, niche, subniches_json, cities_json, countries_json, languages_json FROM tenant_config WHERE tenant_id = ?").bind(tenantId).first();
        if (!config) return Response.json({ error: "tenant_configuration_not_found" }, { status: 404, headers: corsHeaders });
        let cities: string[] = [];
        let niches: string[] = [];
        try { cities = JSON.parse(config.cities_json || "[]"); } catch {}
        try { niches = JSON.parse(config.subniches_json || "[]"); } catch {}
        if (!niches.length && config.niche) niches = [String(config.niche)];
        cities = cities.map(v => String(v).trim()).filter(Boolean);
        niches = niches.map(v => String(v).trim()).filter(Boolean);
        if (!cities.length || !niches.length) {
          return Response.json({ error: "tenant_profile_incomplete", missing_fields: [!niches.length ? "niche" : null, !cities.length ? "city" : null].filter(Boolean) }, { status: 409, headers: corsHeaders });
        }

        await env.RADAR_DB.prepare("CREATE TABLE IF NOT EXISTS tenant_refresh_log (tenant_id TEXT PRIMARY KEY, last_at TEXT NOT NULL)").run();
        const previous: any = await env.RADAR_DB.prepare("SELECT last_at FROM tenant_refresh_log WHERE tenant_id = ?").bind(tenantId).first();
        if (trigger === "activity" && previous?.last_at && Date.now() - Date.parse(previous.last_at) < 6 * 60 * 60 * 1000) {
          return Response.json({ success: true, status: "recent_results_available", tenant_id: tenantId, last_started_at: previous.last_at }, { headers: corsHeaders });
        }
        if (previous?.last_at && Date.now() - Date.parse(previous.last_at) < 60 * 1000) {
          return Response.json({ success: true, status: "already_started", tenant_id: tenantId }, { headers: corsHeaders });
        }
        const now = new Date().toISOString();
        await env.RADAR_DB.prepare("INSERT INTO tenant_refresh_log (tenant_id, last_at) VALUES (?, ?) ON CONFLICT(tenant_id) DO UPDATE SET last_at = excluded.last_at").bind(tenantId, now).run();
        try {
          const runResult = await startProspectingRun(env, "tenant", tenantId, {
            cities: cities.join(";"),
            // Leave trades unset so getPriorityTargets derives the tenant's buyer segments.
            trades: null,
            countries: config.countries_json ? JSON.parse(config.countries_json).join(";") : null,
            languages: config.languages_json ? JSON.parse(config.languages_json).join(";") : null,
            min_score: null
          }, true);

          if (runResult.run_id === "no_buyer_segments" || runResult.run_id === "no_cities") {
            await env.RADAR_DB.prepare("DELETE FROM tenant_refresh_log WHERE tenant_id = ? AND last_at = ?").bind(tenantId, now).run();
            return Response.json({
              success: false,
              status: runResult.run_id,
              tenant_id: tenantId,
              diagnostics: runResult.diagnostics
            }, { status: 409, headers: corsHeaders });
          }
          if (runResult.run_id === "paused") {
            await env.RADAR_DB.prepare("DELETE FROM tenant_refresh_log WHERE tenant_id = ? AND last_at = ?").bind(tenantId, now).run();
            return Response.json({
              success: false,
              status: "paused",
              tenant_id: tenantId,
              diagnostics: runResult.diagnostics
            }, { status: 503, headers: corsHeaders });
          }

          const syncResult = await sendTenantObservationsToBvelt(env, tenantId, { limit: 100 }).catch(() => ({
            skipped: true,
            reason: "tenant_ingest_sync_failed",
            tenant_id: tenantId
          }));
          return Response.json({
            success: true,
            status: runResult.jobs_enqueued > 0 ? "started" : "no_new_jobs",
            tenant_id: tenantId,
            run_id: runResult.run_id,
            jobs_enqueued: runResult.jobs_enqueued,
            active_cities: runResult.active_cities,
            active_trades: runResult.active_trades,
            diagnostics: runResult.diagnostics,
            trigger,
            sync: syncResult
          }, { headers: corsHeaders });
        } catch (error: any) {
          await env.RADAR_DB.prepare("DELETE FROM tenant_refresh_log WHERE tenant_id = ? AND last_at = ?").bind(tenantId, now).run();
          return Response.json({ error: error?.message || "tenant_search_failed" }, { status: 500, headers: corsHeaders });
        }
      }

      // 16a2. Tenant leads CSV export
      if ((path === "/api/tenants/leads.csv" || path === "/tenants/leads.csv") && method === "GET") {
        const auth = resolveTenantAuthContext(request, env, serviceKey, validSessionHash);
        if (!auth.authorized) {
          return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
        }
        const tenantId = url.searchParams.get("tenant_id");
        if (!tenantId) {
          return Response.json({ error: "tenant_id required" }, { status: 400, headers: corsHeaders });
        }
        if (!auth.canAccessTenant(tenantId)) {
          return Response.json({ error: "Forbidden: cross-tenant access denied" }, { status: 403, headers: corsHeaders });
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
        const auth = resolveTenantAuthContext(request, env, serviceKey, validSessionHash);
        if (!auth.authorized) {
          return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
        }
        try {
          const body: any = await request.json().catch(() => ({}));
          const targetTenantId = body.tenant_id || body.user_id;
          if (targetTenantId && !auth.canAccessTenant(targetTenantId)) {
            return Response.json({ error: "Forbidden: cross-tenant bootstrap denied" }, { status: 403, headers: corsHeaders });
          }
          const result = await bootstrapBveltTenant(env, body, ctx);
          return Response.json(result, { headers: corsHeaders });
        } catch (e: any) {
          return Response.json({ error: e.message || String(e) }, { status: 500, headers: corsHeaders });
        }
      }

      // 16c. Poll first leads after bootstrap
      if ((path === "/api/bvelt/leads" || path === "/bvelt/leads") && method === "GET") {
        const auth = resolveTenantAuthContext(request, env, serviceKey, validSessionHash);
        if (!auth.authorized) {
          return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
        }
        const tenantId = url.searchParams.get("tenant_id");
        const limit = Math.min(20, Math.max(1, parseInt(url.searchParams.get("limit") || "10", 10) || 10));
        if (!tenantId) {
          return Response.json({ error: "tenant_id required" }, { status: 400, headers: corsHeaders });
        }
        if (!auth.canAccessTenant(tenantId)) {
          return Response.json({ error: "Forbidden: cross-tenant access denied" }, { status: 403, headers: corsHeaders });
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
        const auth = resolveTenantAuthContext(request, env, serviceKey, validSessionHash);
        if (!auth.authorized) {
          return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
        }
        const body: any = await request.json().catch(() => ({}));
        const { prospect_id, tenant_id, outcome, value_usd } = body;

        if (!prospect_id || !tenant_id || !outcome) {
          return Response.json({ error: "Missing required fields: prospect_id, tenant_id, outcome" }, { status: 400, headers: corsHeaders });
        }

        if (!auth.canAccessTenant(tenant_id)) {
          return Response.json({ error: "Forbidden: cross-tenant outcome submission denied" }, { status: 403, headers: corsHeaders });
        }

        const validOutcomes = ["contacted", "replied", "won", "lost"];
        if (!validOutcomes.includes(outcome)) {
          return Response.json({ error: "Invalid outcome value" }, { status: 400, headers: corsHeaders });
        }

        const prospect = await env.RADAR_DB.prepare("SELECT * FROM prospects WHERE id = ? AND mode = 'tenant' AND tenant_id = ?").bind(prospect_id, tenant_id).first() as any;
        if (!prospect) {
          return Response.json({ error: "Prospect not found for this tenant" }, { status: 404, headers: corsHeaders });
        }

        const parsedValue = value_usd === undefined || value_usd === null || value_usd === "" ? null : Number(value_usd);
        if (parsedValue !== null && (!Number.isFinite(parsedValue) || parsedValue < 0)) {
          return Response.json({ error: "value_usd must be a finite non-negative number" }, { status: 400, headers: corsHeaders });
        }

        const timestamp = new Date().toISOString();
        const outcomeChanged = String(prospect.tenant_outcome || "") !== outcome;
        await env.RADAR_DB.prepare(
          "UPDATE prospects SET tenant_outcome = ?, won_value_usd = CASE WHEN ? = 'won' THEN COALESCE(?, won_value_usd) ELSE won_value_usd END, updated_at = ? WHERE id = ? AND mode = 'tenant' AND tenant_id = ?"
        ).bind(outcome, outcome, parsedValue, timestamp, prospect_id, tenant_id).run();

        if (outcomeChanged) {
          await recordLearningEvent(
            env.RADAR_DB,
            prospect.city,
            prospect.trade,
            prospect.variant_id || null,
            false,
            {
              event_type: outcome,
              outcome,
              response_type: outcome,
              prospect_id: String(prospect.id),
              mode: "tenant",
              tenant_id: tenant_id,
              value_usd: parsedValue
            }
          );
        }

        await sendTenantObservationsToBvelt(env, tenant_id, {
          prospectIds: [String(prospect_id)]
        }).catch((error) => console.warn("[Tenant Bvelt Sync] Outcome sync failed:", error));

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
          bem_ingest: {
            ready: Boolean(env.BVELT_INGEST_URL && (env.BVELT_INGEST_KEY || env.RADAR_SERVICE_KEY)),
            url_present: Boolean(env.BVELT_INGEST_URL),
            credential_present: Boolean(env.BVELT_INGEST_KEY || env.RADAR_SERVICE_KEY)
          },
          scrapling: {
            ready: Boolean(env.GITHUB_ACTIONS_TOKEN && env.RADAR_SIDECAR_CALLBACK_KEY),
            github_token_present: Boolean(env.GITHUB_ACTIONS_TOKEN),
            callback_key_present: Boolean(env.RADAR_SIDECAR_CALLBACK_KEY),
            repository: env.RADAR_RESEARCH_REPOSITORY || "rayleblanc/bvelt-radar"
          },
          cron_trigger: { ready: true, schedule: "0 12,17,22 * * *" },
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

        const isReadyForOutreach = diagnostics.d1_database.ready;

        return Response.json({
          system_ready_for_outreach: isReadyForOutreach,
          diagnostics
        }, { headers: corsHeaders });
      }

      // 19. Scrapling Sidecar Research Endpoints (/api/research/candidates, /api/research/evidence)
      if ((path === "/api/research/candidates" || path === "/research/candidates") && method === "GET") {
        if (!isSidecarCallbackAuthorized(request, env)) {
          return Response.json({ error: "Unauthorized. Missing or invalid callback key." }, { status: 401, headers: corsHeaders });
        }

        await ensureResearchSchema(env.RADAR_DB);

        const runId = url.searchParams.get("run_id");
        const rawMode = url.searchParams.get("mode");
        const rawTenantId = url.searchParams.get("tenant_id");

        if (!runId) {
          return Response.json({ error: "Missing required query parameter: run_id" }, { status: 400, headers: corsHeaders });
        }
        if (!rawMode || !["founder", "tenant"].includes(rawMode)) {
          return Response.json({ error: "Invalid or missing mode parameter: must be 'founder' or 'tenant'" }, { status: 400, headers: corsHeaders });
        }
        const mode = rawMode as "founder" | "tenant";

        // Isolation validation
        if (mode === "founder" && rawTenantId && rawTenantId !== "founder") {
          return Response.json({ error: "Founder mode requires tenant_id='founder'" }, { status: 400, headers: corsHeaders });
        }
        if (mode === "tenant" && (!rawTenantId || rawTenantId === "founder")) {
          return Response.json({ error: "Tenant mode requires its exact tenant_id" }, { status: 400, headers: corsHeaders });
        }
        const tenantId = mode === "founder" ? "founder" : (rawTenantId || "");

        const query = `
          SELECT 
            c.prospect_id,
            p.name AS business_name,
            p.city,
            p.trade,
            p.website AS website
          FROM research_run_candidates c
          JOIN prospects p ON c.prospect_id = p.id
          WHERE c.run_id = ?
            AND c.mode = ?
            AND c.tenant_id = ?
            AND p.mode = ?
            AND COALESCE(p.tenant_id, 'founder') = ?
            AND p.website IS NOT NULL
            AND p.website != ''
          LIMIT 50
        `;

        const results = (await env.RADAR_DB.prepare(query)
          .bind(runId, mode, tenantId, mode, tenantId)
          .all()) as any;

        const records = ((results && results.results) || []).map((row: any) => ({
          prospect_id: row.prospect_id,
          business_name: row.business_name || "Unknown Business",
          city: row.city || "",
          trade: row.trade || "",
          website: row.website
        }));

        return Response.json({
          run_id: runId,
          mode,
          tenant_id: tenantId,
          records
        }, { headers: corsHeaders });
      }

      if ((path === "/api/research/evidence" || path === "/research/evidence") && method === "POST") {
        if (!isSidecarCallbackAuthorized(request, env)) {
          return Response.json({ error: "Unauthorized. Missing or invalid callback key." }, { status: 401, headers: corsHeaders });
        }

        await ensureResearchSchema(env.RADAR_DB);

        let body: any;
        try {
          const rawText = await request.text();
          if (rawText.length > 1024 * 1024) {
            return Response.json({ error: "Payload too large. Exceeds 1 MB limit." }, { status: 413, headers: corsHeaders });
          }
          body = JSON.parse(rawText);
        } catch (e) {
          return Response.json({ error: "Invalid JSON payload." }, { status: 400, headers: corsHeaders });
        }

        const runId = body.run_id;
        const rawMode = body.mode;
        const rawTenantId = body.tenant_id;

        if (!runId || typeof runId !== "string") {
          return Response.json({ error: "Missing or invalid run_id in payload." }, { status: 400, headers: corsHeaders });
        }
        if (!rawMode || !["founder", "tenant"].includes(rawMode)) {
          return Response.json({ error: "Invalid or missing mode in payload." }, { status: 400, headers: corsHeaders });
        }
        const mode = rawMode as "founder" | "tenant";

        if (mode === "founder" && rawTenantId && rawTenantId !== "founder") {
          return Response.json({ error: "Founder mode requires tenant_id='founder'" }, { status: 400, headers: corsHeaders });
        }
        if (mode === "tenant" && (!rawTenantId || rawTenantId === "founder")) {
          return Response.json({ error: "Tenant mode requires its exact tenant_id" }, { status: 400, headers: corsHeaders });
        }
        const tenantId = mode === "founder" ? "founder" : (rawTenantId || "");

        // Accept records array from body
        const records: any[] = Array.isArray(body.records) ? body.records : (Array.isArray(body) ? body : []);

        if (records.length > 100) {
          return Response.json({ error: "Batch size exceeds maximum limit of 100 items." }, { status: 400, headers: corsHeaders });
        }

        let insertedCount = 0;
        let duplicatedCount = 0;
        let rejectedCount = 0;

        const now = new Date().toISOString();

        // Check if runner reported failure
        if (body.status === "failed" || body.run_status === "failed") {
          const failReason = body.error || body.last_error || "Research sidecar execution failed";
          try {
            await env.RADAR_DB.prepare(`
              UPDATE sidecar_dispatches 
              SET status = 'failed', last_error = ?, updated_at = ? 
              WHERE run_id = ? AND tenant_id = ?
            `).bind(failReason, now, runId, tenantId).run();
          } catch (e) {}
          return Response.json({
            status: "recorded_failure",
            run_id: runId,
            error: failReason
          }, { headers: corsHeaders });
        }

        for (const item of records) {
          const prospectId = item.prospect_id;
          const sourceId = item.source_id || "scrapling_business_website";
          const sourceUrl = item.source_url || item.url || "";
          const evidenceType = item.evidence_type || "business_website_profile";
          const contentHash = item.content_hash || "";
          const extractorVersion = item.extractor_version || body.extractor_version || "bvelt-scrapling-1.0.0";
          const confidence = typeof item.confidence === "number" && Number.isFinite(item.confidence)
            ? Math.min(1, Math.max(0, item.confidence))
            : 0.65;
          const observedAt = item.observed_at || now;
          const evidenceData = item.evidence || {};

          if (!prospectId || !sourceUrl || !/^[a-f0-9]{64}$/i.test(String(contentHash))) {
            rejectedCount++;
            continue;
          }

          // 1. Verify candidate belongs to research_run_candidates for this exact run_id + mode + tenant_id
          const candidateMatch = (await env.RADAR_DB.prepare(`
            SELECT 1 FROM research_run_candidates 
            WHERE run_id = ? AND mode = ? AND tenant_id = ? AND prospect_id = ?
          `).bind(runId, mode, tenantId, prospectId).first()) as any;

          if (!candidateMatch) {
            console.warn(`[ResearchEvidence] Rejected evidence for prospect ${prospectId}: not associated with run ${runId} and tenant ${tenantId}`);
            rejectedCount++;
            continue;
          }

          // 2. Verify prospect belongs to the same mode and tenant
          const prospectRow = (await env.RADAR_DB.prepare(`
            SELECT id, signals_json, website FROM prospects
            WHERE id = ? AND mode = ? AND COALESCE(tenant_id, 'founder') = ?
          `).bind(prospectId, mode, tenantId).first()) as any;

          if (!prospectRow) {
            console.warn(`[ResearchEvidence] Rejected evidence for prospect ${prospectId}: mode/tenant mismatch in prospects table`);
            rejectedCount++;
            continue;
          }

          // Evidence may only describe the public website attached to this exact
          // prospect. This prevents cross-domain evidence from being attached to a lead.
          try {
            const submittedUrl = new URL(String(sourceUrl));
            const originalValue = String(prospectRow.website || "").trim();
            const originalUrl = new URL(/^https?:\/\//i.test(originalValue) ? originalValue : `https://${originalValue}`);
            const normalizedHost = (host: string) => host.toLowerCase().replace(/^www\./, "");
            if (
              !["http:", "https:"].includes(submittedUrl.protocol) ||
              submittedUrl.username || submittedUrl.password ||
              !originalUrl.hostname ||
              normalizedHost(submittedUrl.hostname) !== normalizedHost(originalUrl.hostname)
            ) {
              rejectedCount++;
              continue;
            }
          } catch {
            rejectedCount++;
            continue;
          }

          // 3. Idempotent check: UNIQUE (prospect_id, source_id, evidence_type, content_hash)
          const existingEvidence = (await env.RADAR_DB.prepare(`
            SELECT id FROM source_evidence 
            WHERE prospect_id = ? AND source_id = ? AND evidence_type = ? AND content_hash = ?
          `).bind(prospectId, sourceId, evidenceType, contentHash).first()) as any;

          const evidenceId = existingEvidence ? existingEvidence.id : (item.id || `ev_${crypto.randomUUID().replace(/-/g, '').substring(0, 16)}`);
          const evidenceJson = typeof evidenceData === "string" ? evidenceData : JSON.stringify(evidenceData);

          if (existingEvidence) {
            duplicatedCount++;
          } else {
            // 4. Insert into source_evidence
            try {
              await env.RADAR_DB.prepare(`
                INSERT INTO source_evidence (
                  id, run_id, mode, tenant_id, prospect_id, source_id, source_url,
                  evidence_type, evidence_json, content_hash, extractor_version,
                  confidence, observed_at, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `).bind(
                evidenceId,
                runId,
                mode,
                tenantId,
                prospectId,
                sourceId,
                sourceUrl,
                evidenceType,
                evidenceJson,
                contentHash,
                extractorVersion,
                confidence,
                observedAt,
                now
              ).run();
              insertedCount++;
            } catch (insertErr: any) {
              if (insertErr.message && insertErr.message.toLowerCase().includes("unique")) {
                duplicatedCount++;
              } else {
                console.error(`[ResearchEvidence] Error saving evidence:`, insertErr);
                rejectedCount++;
                continue;
              }
            }
          }

          // 5. Idempotent synchronization of prospects.signals_json
          // Canonical dual-write to both signalsObj.scrapling and signalsObj.signals.scrapling
          try {
            let signalsObj: any = {};
            try {
              signalsObj = JSON.parse(prospectRow.signals_json || "{}");
            } catch {
              signalsObj = {};
            }

            const prevScrapling = signalsObj.scrapling || signalsObj.signals?.scrapling || {};
            const incomingFacts = typeof evidenceData === "object" && evidenceData !== null ? evidenceData : {};
            const mergedScrapling = {
              ...prevScrapling,
              evidence_id: evidenceId,
              source_url: sourceUrl,
              evidence_type: evidenceType,
              extractor_version: extractorVersion,
              confidence,
              observed_at: observedAt,
              facts: {
                ...(prevScrapling.facts || {}),
                ...incomingFacts
              },
              updated_at: now
            };

            signalsObj.scrapling = mergedScrapling;
            if (!signalsObj.signals) signalsObj.signals = {};
            signalsObj.signals.scrapling = mergedScrapling;

            await env.RADAR_DB.prepare(`
              UPDATE prospects SET signals_json = ?, updated_at = ? WHERE id = ?
            `).bind(JSON.stringify(signalsObj), now, prospectId).run();
          } catch (syncErr) {
            console.warn(`[ResearchEvidence] signals_json sync warning for prospect ${prospectId}:`, syncErr);
          }
        }

        // Finalize dispatch for exact (run_id, tenant_id)
        try {
          await env.RADAR_DB.prepare(`
            UPDATE sidecar_dispatches 
            SET status = 'completed', completed_at = ?, updated_at = ? 
            WHERE run_id = ? AND tenant_id = ?
          `).bind(now, now, runId, tenantId).run();
        } catch (e) {}

        return Response.json({
          status: "ok",
          inserted: insertedCount,
          duplicated: duplicatedCount,
          rejected: rejectedCount,
          total_received: records.length,
          outcome: records.length === 0 ? "empty_completed" : "completed"
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
        await run.catch(() => undefined); // si el descubrimiento falla, igual reparamos las oportunidades
        await ensureOpportunitiesSchema(env.RADAR_DB);
        const rows = await env.RADAR_DB.prepare(`
          SELECT id, name, city, trade, score, opportunity_score, tenant_id, expected_value,
                 fit_score, intent_score, pain_score, decision_state, why_now_json
          FROM prospects
          WHERE COALESCE(score, opportunity_score, 0) >= 45
            AND status NOT IN ('discarded','suppressed','blocked','disqualified')
          ORDER BY COALESCE(score, opportunity_score, 0) DESC LIMIT 12
        `).all();
        const nowIso = new Date().toISOString();
        let n = 0;
        for (const p of (rows.results || []) as any[]) {
          const oppId = `opp_${p.id}`;
          const stratScore = Math.round(p.opportunity_score || p.score || 50);
          const tenantId = p.tenant_id || "founder";
          const title = `${p.name} — ${p.trade || "service"} (${p.city || ""})`;
          try {
            await env.RADAR_DB.prepare(`
              INSERT OR IGNORE INTO opportunities (
                id, prospect_id, tenant_id, mode, title,
                first_seen_at, last_seen_at, status, strategic_score,
                fit_score, intent_score, pain_score, expected_value,
                decision_state, why_now_json, priority_tier, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).bind(
              oppId, p.id, tenantId, tenantId === "founder" ? "founder" : "tenant", title,
              nowIso, nowIso, stratScore,
              p.fit_score || stratScore, p.intent_score || Math.round(stratScore * 0.8),
              p.pain_score || 50, p.expected_value || 0,
              p.decision_state || "identified", p.why_now_json || null,
              stratScore >= 80 ? "high" : stratScore >= 55 ? "medium" : "low",
              nowIso, nowIso
            ).run();
            n++;
          } catch { /* skip */ }
        }
        console.log(`[Radar Cron] Self-heal opportunities created: ${n}`);
      } catch (e) {
        console.warn("[Radar Cron] opportunity heal failed:", e);
      }
    })();
    // Tenant prospecting is demand-driven. The global Cron must never start
    // discovery for customer tenants; it only runs Founder and maintenance work.
    const tenantRefresh = Promise.resolve();
    const followUps = (async () => {
      try {
        if (!env.RADAR_DB) return;
        const rows = await env.RADAR_DB.prepare(`
          SELECT id FROM prospects
          WHERE COALESCE(NULLIF(TRIM(tenant_id),''),'founder') = 'founder'
            AND lower(status) = 'sent'
            AND (last_reply_at IS NULL OR TRIM(last_reply_at) = '')
            AND last_contact_at IS NOT NULL
            AND last_contact_at <= datetime('now', '-5 days')
            AND last_contact_at >= datetime('now', '-45 days')
          ORDER BY last_contact_at ASC
          LIMIT 8
        `).all();
        const list = (rows.results || []) as any[];
        for (const r of list) {
          try {
            const p = await env.RADAR_DB.prepare("SELECT * FROM prospects WHERE id = ?").bind(r.id).first() as any;
            if (!p) continue;
            const touch = getOutreachTouch(p);
            if (touch >= 3) continue;
            if (env.RADAR_QUEUE && typeof env.RADAR_QUEUE.send === "function") {
              await env.RADAR_QUEUE.send({
                run_id: `fu-${new Date().toISOString().slice(0, 10)}`,
                job_id: `outreach-fu-${r.id}-${touch + 1}`,
                type: "outreach",
                mode: "founder",
                tenant_id: "founder",
                payload: { prospect_id: r.id },
                created_at: new Date().toISOString(),
              } as any);
            }
          } catch (e) {
            console.warn("[Radar Cron] follow-up queue failed", r.id, e);
          }
        }
        if (list.length) console.log("[Radar Cron] queued follow-ups:", list.length);
      } catch (e) {
        console.warn("[Radar Cron] follow-ups error:", e);
      }
    })();
    const reconcile = reconcileResendDeliveries(env).catch(e => console.warn("[Radar Cron] resend reconcile failed:", e));
    // Latido + alerta de bloqueo: sin esto, un radar bloqueado o sin resultados se ve igual que uno muerto.
    const digest = (async () => {
      try {
        await heal.catch(() => undefined);
        const hour = new Date((event as any)?.scheduledTime || Date.now()).getUTCHours();
        await sendRadarDigest(env, { scheduledHourUtc: hour });
      } catch (e) {
        console.warn("[Radar Cron] digest failed:", e);
      }
    })();
    const bemSync = (async () => {
      try {
        await Promise.allSettled([heal, tenantRefresh]);
        await pushMarketObservationsToBem(env);
      } catch (e) {
        console.warn("[Radar Cron] bem sync error:", e);
      }
    })();
    if (ctx && typeof ctx.waitUntil === "function") {
      ctx.waitUntil(heal);
      ctx.waitUntil(tenantRefresh);
      ctx.waitUntil(followUps);
      ctx.waitUntil(reconcile);
      ctx.waitUntil(digest);
      ctx.waitUntil(bemSync);
    } else {
      await heal;
      await tenantRefresh;
      await followUps;
      await reconcile;
      await digest;
      await bemSync;
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

let researchSchemaEnsured = false;

export async function ensureResearchSchema(db: D1Database): Promise<void> {
  if (researchSchemaEnsured || !db) return;
  try {
    await db.batch([
      db.prepare(`
        CREATE TABLE IF NOT EXISTS research_run_candidates (
          run_id TEXT NOT NULL,
          mode TEXT NOT NULL CHECK (mode IN ('founder', 'tenant')),
          tenant_id TEXT NOT NULL,
          prospect_id TEXT NOT NULL,
          created_at TEXT NOT NULL,
          PRIMARY KEY (run_id, tenant_id, prospect_id)
        );
      `),
      db.prepare(`
        CREATE INDEX IF NOT EXISTS idx_research_candidates_run_tenant
          ON research_run_candidates (run_id, tenant_id, mode);
      `),
      db.prepare(`
        CREATE TABLE IF NOT EXISTS sidecar_dispatches (
          id TEXT PRIMARY KEY,
          run_id TEXT NOT NULL,
          mode TEXT NOT NULL CHECK (mode IN ('founder', 'tenant')),
          tenant_id TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          attempts INTEGER NOT NULL DEFAULT 0,
          workflow_file TEXT NOT NULL DEFAULT 'radar-research.yml',
          last_error TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          completed_at TEXT,
          UNIQUE (run_id, tenant_id)
        );
      `),
      db.prepare(`
        CREATE INDEX IF NOT EXISTS idx_sidecar_dispatch_status
          ON sidecar_dispatches (status, updated_at);
      `),
      db.prepare(`
        CREATE TABLE IF NOT EXISTS source_evidence (
          id TEXT PRIMARY KEY,
          run_id TEXT NOT NULL,
          mode TEXT NOT NULL CHECK (mode IN ('founder', 'tenant')),
          tenant_id TEXT NOT NULL,
          prospect_id TEXT NOT NULL,
          source_id TEXT NOT NULL,
          source_url TEXT NOT NULL,
          evidence_type TEXT NOT NULL,
          evidence_json TEXT NOT NULL,
          content_hash TEXT NOT NULL,
          extractor_version TEXT NOT NULL,
          confidence REAL NOT NULL DEFAULT 0.5,
          observed_at TEXT NOT NULL,
          created_at TEXT NOT NULL,
          UNIQUE (prospect_id, source_id, evidence_type, content_hash)
        );
      `),
      db.prepare(`
        CREATE INDEX IF NOT EXISTS idx_source_evidence_run_tenant
          ON source_evidence (run_id, tenant_id, mode);
      `),
      db.prepare(`
        CREATE INDEX IF NOT EXISTS idx_source_evidence_prospect
          ON source_evidence (prospect_id, tenant_id);
      `),
      db.prepare(`
        CREATE INDEX IF NOT EXISTS idx_source_evidence_observed
          ON source_evidence (observed_at);
      `)
    ]);
    researchSchemaEnsured = true;
  } catch (err) {
    console.warn("[ResearchSchema] Schema initialization warning:", err);
  }
}

export async function associateResearchCandidate(
  db: D1Database,
  runId: string,
  mode: string,
  tenantId: string | null,
  prospectId: string
): Promise<void> {
  if (!runId || !prospectId || !db) return;
  await ensureResearchSchema(db);
  const m = (mode === 'tenant' ? 'tenant' : 'founder') as 'founder' | 'tenant';
  const t = m === 'founder' ? 'founder' : (tenantId || '');
  if (m === 'tenant' && (!t || t === 'founder')) {
    console.warn(`[associateResearchCandidate] Tenant mode requires valid non-founder tenant_id`);
    return;
  }
  try {
    await db.prepare(`
      INSERT OR IGNORE INTO research_run_candidates (run_id, mode, tenant_id, prospect_id, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).bind(runId, m, t, prospectId, new Date().toISOString()).run();
  } catch (err) {
    console.warn(`[associateResearchCandidate] Error linking prospect ${prospectId} to run ${runId}:`, err);
  }
}

export async function maybeDispatchSidecarResearch(
  env: Env,
  runId: string,
  mode: string,
  tenantId: string | null
): Promise<boolean> {
  if (!runId || !env.RADAR_DB) return false;
  await ensureResearchSchema(env.RADAR_DB);
  const m = (mode === 'tenant' ? 'tenant' : 'founder') as 'founder' | 'tenant';
  const t = m === 'founder' ? 'founder' : (tenantId || '');
  if (m === 'tenant' && (!t || t === 'founder')) {
    console.warn(`[maybeDispatchSidecarResearch] Tenant mode requires valid non-founder tenant_id`);
    return false;
  }

  try {
    // 1. Verify all discovery jobs for this run are finished
    const pendingRes = (await env.RADAR_DB.prepare(`
      SELECT COUNT(*) as c FROM queue_jobs 
      WHERE run_id = ? AND job_type = 'discovery' AND status IN ('pending', 'processing')
    `).bind(runId).first()) as any;

    if (pendingRes && pendingRes.c > 0) {
      console.log(`[maybeDispatchSidecarResearch] Discovery jobs still running for run ${runId} (count=${pendingRes.c})`);
      return false;
    }

    // 2. Check if eligible candidates with non-empty websites exist
    const candidatesRes = (await env.RADAR_DB.prepare(`
      SELECT COUNT(*) as cnt 
      FROM research_run_candidates c
      JOIN prospects p ON c.prospect_id = p.id
      WHERE c.run_id = ? AND c.mode = ? AND c.tenant_id = ?
        AND p.mode = ? AND COALESCE(p.tenant_id, 'founder') = ?
        AND p.website IS NOT NULL AND p.website != ''
    `).bind(runId, m, t, m, t).first()) as any;

    const candidateCount = candidatesRes?.cnt || 0;
    if (candidateCount === 0) {
      console.log(`[maybeDispatchSidecarResearch] No website candidates found for run ${runId}, tenant ${t}`);
      return false;
    }

    // 3 & 4. Atomic reservation in D1 before calling GitHub Actions using UNIQUE(run_id, tenant_id)
    const now = new Date().toISOString();
    const existingDispatch = (await env.RADAR_DB.prepare(`
      SELECT id, status, attempts, updated_at FROM sidecar_dispatches WHERE run_id = ? AND tenant_id = ?
    `).bind(runId, t).first()) as any;

    let dispatchId: string;
    if (existingDispatch) {
      // Completed work is immutable. A queued/running dispatch that never calls
      // back is recoverable after the workflow's 25-minute hard timeout plus grace.
      if (existingDispatch.status === 'completed') return false;
      if (['queued', 'running', 'dispatching'].includes(existingDispatch.status)) {
        const lastUpdate = Date.parse(String(existingDispatch.updated_at || ""));
        const stale = !Number.isFinite(lastUpdate) || Date.now() - lastUpdate > 40 * 60 * 1000;
        if (!stale || Number(existingDispatch.attempts || 0) >= 3) {
          console.log(`[maybeDispatchSidecarResearch] Dispatch remains ${existingDispatch.status}; stale=${stale}, attempts=${existingDispatch.attempts}`);
          return false;
        }
        dispatchId = existingDispatch.id;
        const reclaimed = await env.RADAR_DB.prepare(`
          UPDATE sidecar_dispatches
          SET status = 'dispatching', attempts = attempts + 1, last_error = 'STALE_DISPATCH_RECOVERED', updated_at = ?
          WHERE id = ? AND status = ? AND updated_at = ?
        `).bind(now, dispatchId, existingDispatch.status, existingDispatch.updated_at).run();
        if (!(reclaimed as any)?.meta?.changes) return false;
      }
      // If failed, allow controlled recovery (max 3 attempts)
      else if (existingDispatch.status === 'failed') {
        if (existingDispatch.attempts >= 3) {
          console.warn(`[maybeDispatchSidecarResearch] Max retry attempts reached for run ${runId}, tenant ${t}`);
          return false;
        }
        dispatchId = existingDispatch.id;
        const updateRes = await env.RADAR_DB.prepare(`
          UPDATE sidecar_dispatches 
          SET status = 'dispatching', attempts = attempts + 1, updated_at = ? 
          WHERE run_id = ? AND tenant_id = ? AND status = 'failed'
        `).bind(now, runId, t).run();

        if (!updateRes || (updateRes as any).meta?.changes === 0) {
          return false;
        }
      } else {
        return false;
      }
    } else {
      // Atomically insert new reservation
      dispatchId = `disp_${Date.now()}_${crypto.randomUUID().replace(/-/g, '').substring(0, 8)}`;
      try {
        await env.RADAR_DB.prepare(`
          INSERT INTO sidecar_dispatches (
            id, run_id, mode, tenant_id, status, attempts, workflow_file, created_at, updated_at
          ) VALUES (?, ?, ?, ?, 'dispatching', 1, 'radar-research.yml', ?, ?)
        `).bind(dispatchId, runId, m, t, now, now).run();
      } catch (insertErr: any) {
        console.log(`[maybeDispatchSidecarResearch] Dispatch already created concurrently: ${insertErr.message}`);
        return false;
      }
    }

    // 5. Call GitHub Actions dispatch
    const dispatchResult = await dispatchScraplingResearch(env, {
      run_id: runId,
      mode: m,
      tenant_id: t
    });

    const updateTime = new Date().toISOString();
    if (dispatchResult.queued) {
      await env.RADAR_DB.prepare(`
        UPDATE sidecar_dispatches 
        SET status = 'queued', updated_at = ? 
        WHERE id = ? AND status NOT IN ('completed', 'running')
      `).bind(updateTime, dispatchId).run();
      console.log(`[maybeDispatchSidecarResearch] Successfully dispatched Scrapling research for run ${runId} (${candidateCount} candidates)`);
      return true;
    } else {
      // 6. Record failure without blocking main pipeline
      await env.RADAR_DB.prepare(`
        UPDATE sidecar_dispatches 
        SET status = 'failed', last_error = ?, updated_at = ? 
        WHERE id = ?
      `).bind(dispatchResult.reason || 'DISPATCH_FAILED', updateTime, dispatchId).run();
      console.warn(`[maybeDispatchSidecarResearch] Dispatch failed: ${dispatchResult.reason}`);
      return false;
    }
  } catch (err: any) {
    console.error(`[maybeDispatchSidecarResearch] Error in dispatch check for run ${runId}:`, err);
    return false;
  }
}

export function isSidecarCallbackAuthorized(request: Request, env: Env): boolean {
  const secret = (env.RADAR_SIDECAR_CALLBACK_KEY || '').trim();
  if (!secret) return false;

  const authHeader = request.headers.get("authorization") || "";
  const callbackKeyHeader = request.headers.get("x-callback-key") || "";

  if (callbackKeyHeader && callbackKeyHeader === secret) return true;
  if (authHeader && authHeader === `Bearer ${secret}`) return true;

  return false;
}

/**
 * Enhanced Health Check with usage metrics & Cloudflare Queues observability
 */
async function handleHealth(env: Env, headers: Record<string, string>, tenantId: string = "founder"): Promise<Response> {
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
    const statusRows = await db.prepare("SELECT status, COUNT(*) as count FROM prospects WHERE COALESCE(tenant_id,'founder') = ? GROUP BY status").bind(tenantId).all();
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
    const totalRow = await db.prepare("SELECT COUNT(*) as count FROM prospects WHERE COALESCE(tenant_id,'founder') = ?").bind(tenantId).first() as any;
    if (totalRow) prospectsTotal = totalRow.count;
  } catch (e) {}

  try {
    const uniqueRow = await db.prepare("SELECT COUNT(DISTINCT identity_key) as count FROM prospects WHERE created_at >= ? AND COALESCE(tenant_id,'founder') = ?").bind(`${today}T00:00:00.000Z`, tenantId).first() as any;
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

  let sidecarDiagnostics = {
    ready: true,
    dispatches_count: 0,
    evidence_count: 0,
    latest_dispatch_status: null as string | null
  };

  try {
    await ensureResearchSchema(db);
    const dispRow = await db.prepare("SELECT COUNT(*) as c FROM sidecar_dispatches").first() as any;
    if (dispRow) sidecarDiagnostics.dispatches_count = dispRow.c || 0;
    const latestDisp = await db.prepare("SELECT status FROM sidecar_dispatches ORDER BY created_at DESC LIMIT 1").first() as any;
    if (latestDisp) sidecarDiagnostics.latest_dispatch_status = latestDisp.status;
    const evRow = await db.prepare("SELECT COUNT(*) as c FROM source_evidence").first() as any;
    if (evRow) sidecarDiagnostics.evidence_count = evRow.c || 0;
  } catch (e) {}

  return Response.json({
    status: globalPause ? "paused" : circuitBreakerActive ? "paused" : failedJobs > 0 && pendingJobs === 0 ? "degraded" : "healthy",
    global_pause: globalPause,
    outreach_pause: outreachPause,
    circuit_breaker: circuitBreakerActive,
    circuit_breaker_reason: circuitBreakerReason,
    today: {
      discovery: { used: budgetRow.discovery_units || 0, max: 45 },
      enrichment: { used: budgetRow.enrichment_units || 0, max: 30 },
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
    sidecar: sidecarDiagnostics,
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
  const learningStats = await getLearningStats(db, "founder", "founder");

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
      discovery: { used: budgetRow.discovery_units || 0, max: 45 },
      enrichment: { used: budgetRow.enrichment_units || 0, max: 30 },
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
        message: `Send blocked: ${gate.reason}`,
        id
      }, { status: 403, headers });
    }

    // Execute Outbound Email Dispatch
    let dispatchOutcome: any = { success: true, provider: 'simulated', status: 'simulated', messageId: `sim_${id.substring(0, 8)}` };
    if (prospect.email && prospect.email.includes('@')) {
      const draftSubject = prospect.draft_subject || `Bvelt - Pregunta sobre llamadas de clientes (${prospect.name || 'su negocio'})`;
      const draftBody = prospect.draft_body || `Hola equipo de ${prospect.name},\n\n¿Qué ocurre cuando un cliente potencial llama a su negocio mientras están ocupados en obra y no pueden atender el teléfono?\n\nBvelt responde automáticamente por SMS en 15 segundos para no perder ningún trabajo: https://bvelt.app\n\nSaludos,\nEquipo Bvelt\n\nReply STOP to opt out`;
      const safeBody = typeof normalizeOutreachBody === 'function' ? normalizeOutreachBody(draftBody) : draftBody;

      // Compliance Hard Gate: missing sender postal address MUST block outbound dispatch
      if ((env.RESEND_API_KEY || env.BREVO_API_KEY) && !env.SENDER_POSTAL_ADDRESS?.trim()) {
        await notifyOnce(
          env,
          "missing_sender_postal_address",
          "⚠️ <b>Outreach en HOLD:</b> Falta <code>SENDER_POSTAL_ADDRESS</code> en las variables de Cloudflare. Se requiere dirección postal física para envíos conformes a CAN-SPAM."
        );
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
        body: typeof safeBody !== 'undefined' ? safeBody : draftBody,
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
    await recordLearningEvent(db, prospect.city, prospect.trade, prospect.variant_id, true, { event_type: "sent", prospect_id: id, mode: prospect.mode, tenant_id: prospect.tenant_id || "founder" });

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

    await recordLearningEvent(db, prospect.city, prospect.trade, prospect.variant_id, false, { event_type: "replied", response_type: "positive", prospect_id: id, mode: prospect.mode, tenant_id: prospect.tenant_id || "founder" });

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

    await recordLearningEvent(db, prospect.city, prospect.trade, prospect.variant_id, false, { event_type: "won", response_type: "converted", is_win: true, prospect_id: id, mode: prospect.mode, tenant_id: prospect.tenant_id || "founder" });

    return Response.json({ success: true, message: `Prospect ${id} marked as WON/CONVERTED.`, id }, { headers });

  } else if (action === "discard") {
    const cooldown30d = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await db.prepare(
      "UPDATE prospects SET status = 'discarded', outcome = 'rejected', cooldown_until = ?, updated_at = ? WHERE id = ?"
    ).bind(cooldown30d, timestamp, id).run();
    
    // Add to suppression with 30-day cooldown
    const nameCityKey = `${prospect.name.toLowerCase()}_${prospect.city.toLowerCase()}`.replace(/\s+/g, "_");
    await db.prepare("INSERT OR REPLACE INTO suppression (key, reason, created_at) VALUES (?, ?, ?)")
      .bind(nameCityKey, `Discarded on ${timestamp} (cooldown until ${cooldown30d})`, timestamp).run();

    if (prospect.email) {
      await db.prepare("INSERT OR REPLACE INTO suppression (key, reason, created_at) VALUES (?, ?, ?)")
        .bind(prospect.email.toLowerCase(), `Discarded on ${timestamp} (cooldown until ${cooldown30d})`, timestamp).run();
    }
    if (prospect.website) {
      const domain = getDomain(prospect.website);
      if (domain) {
        await db.prepare("INSERT OR REPLACE INTO suppression (key, reason, created_at) VALUES (?, ?, ?)")
          .bind(domain.toLowerCase(), `Discarded on ${timestamp} (cooldown until ${cooldown30d})`, timestamp).run();
      }
    }

    await recordLearningEvent(db, prospect.city, prospect.trade, prospect.variant_id, false, { event_type: "discarded", prospect_id: id, mode: prospect.mode, tenant_id: prospect.tenant_id || "founder" });

    return Response.json({ success: true, message: `Prospect ${id} discarded with 30-day cooldown.`, id }, { headers });

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

    await recordLearningEvent(db, prospect.city, prospect.trade, prospect.variant_id, false, { event_type: "suppressed", prospect_id: id, mode: prospect.mode, tenant_id: prospect.tenant_id || "founder" });

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
    if (job.type === 'discovery') {
      await maybeDispatchSidecarResearch(env, job.run_id, job.mode || 'founder', job.tenant_id || (job.mode === 'tenant' ? job.tenant_id : 'founder'));
    }
  } catch (err: any) {
    console.error(`[Queue Router Error] Job [${job.type} / ${job.job_id}] failed:`, err);
    await recordQueueJobStatus(env.RADAR_DB, job.job_id, job.run_id, job.type, 'failed', err.message || String(err));
    if (job.type === 'discovery') {
      await maybeDispatchSidecarResearch(env, job.run_id, job.mode || 'founder', job.tenant_id || (job.mode === 'tenant' ? job.tenant_id : 'founder'));
    }
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
export async function bootstrapBveltTenant(
  env: Env,
  body: any,
  ctx?: ExecutionContext
): Promise<{
  success: boolean;
  status?: string;
  tenant_id: string;
  city: string;
  niches: string[];
  run_id: string | null;
  leads: any[];
  message: string;
  missing_fields?: string[];
  source: string;
}> {
  const source = String(body.source || "free_analysis");
  const rawTrade = String(body.trade || body.niche || body.industry || "").trim();
  const tenantId =
    String(body.tenant_id || body.user_id || `bvelt_${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, "_") ||
    `bvelt_${Date.now()}`;
  const tenantName = String(body.tenant_name || body.business_name || "Bvelt Client");

  // Missing trade check - DO NOT DEFAULT TO HVAC
  if (!rawTrade) {
    return {
      success: false,
      status: "pending_configuration",
      tenant_id: tenantId,
      city: "",
      niches: [],
      run_id: null,
      leads: [],
      message: "trade_required: falta oficio, nicho o industria del cliente; Radar no inventa oficios.",
      missing_fields: ["trade"],
      source
    };
  }

  const userTrade = rawTrade.toLowerCase().replace(/\s+/g, "_");

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
    return {
      success: false,
      status: "pending_configuration",
      tenant_id: tenantId,
      city: "",
      niches: [],
      run_id: null,
      leads: [],
      message: "city_required: falta ciudad o coordenadas del cliente; Radar no inventa ubicación.",
      missing_fields: ["city"],
      source
    };
  }

  // Contractor trade → who they sell TO (buyer ICP)
  const tradeKey = userTrade.replace(/-/g, "_");
  const niches =
    (Array.isArray(body.subniches) && body.subniches.length > 0 ? body.subniches : null) ||
    (Array.isArray(body.target_niches) && body.target_niches.length > 0 ? body.target_niches : null) ||
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
        : primaryNiche;

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
    const businesses = body.skip_fast_discovery ? [] : (await fetchLocalBusinessesWithDiagnostics(cityLabel, searchTrade, env, undefined, 'tenant')).businesses;
    const ranked = (businesses || [])
      .filter((b: any) => b && b.name && tenantBuyerNameFits(b.name, searchTrade))
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
      .slice(0, 40);

    // BUG CORREGIDO: antes se tomaban solo los 2 primeros ANTES de ver cuáles ya existían, así que el cliente veía
    // siempre los mismos 2 leads. Ahora se insertan hasta 5 NUEVOS por llamada (y se muestran máx. 8 en total).
    let newInserted = 0;
    for (const b of ranked) {
      if (newInserted >= 5 || leads.length >= 8) break;
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
        ) VALUES (?, 'tenant', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'tenant_direct', 'qualified', 'bvelt_bootstrap', ?, ?, 'tenant_buyer_opportunity', ?, ?)
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
        mode: "tenant",
        tenant_id: tenantId,
        name: b.name,
        city: cityLabel,
        trade: searchTrade,
        website: b.website || null,
        phone: b.phone || null,
        email: b.email || null,
        score: b._score,
        status: "qualified",
        bvelt_angle: "tenant_buyer_opportunity",
        demo_token: demoToken
      };
      newInserted++;
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
    status: "active",
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

  if (mode === "tenant" && (!activeTrades || activeTrades.length === 0)) {
    return {
      run_id: "no_buyer_segments",
      jobs_enqueued: 0,
      active_cities: activeCities || [],
      active_trades: [],
      diagnostics: {
        reason: "No buyer segments could be derived from this tenant's business profile. Add a supported niche or configure ICP buyer segments before discovery."
      }
    };
  }

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


/** Tenant ICP: name must look like a real buyer for the niche (not random OSM noise). */
export function tenantBuyerNameFits(name: string, nicheOrTrade: string): boolean {
  if (!name) return false;
  const n = name.toLowerCase();
  const niche = (nicheOrTrade || "").toLowerCase();

  // Hard reject obvious non-buyers for property/commercial ICP
  if (/wig|scuba|diving|fence|metal fabricat|iron works|moving|attorney|lawyer|law office|criminal|church|ministry|school district|university|college\b|museum|florist|nursery\b|auto (repair|body|parts)|plumbing parts|marketing firm/i.test(n)) {
    return false;
  }

  if (/property|management|manager|hoa|condo|apartment|realty|real estate|property mgmt|prop management|facility|building management|community management|hotel|motel|inn\b|resort|hospitality|extended stay|senior living|assisted living|nursing home|office park|industrial park|warehouse/i.test(n)) {
    return true;
  }

  // Soft allow if niche is hotel/hospitality and name has lodging cues
  if (/hotel|hospitality|extended/.test(niche) && /hotel|inn|suites|lodge|motel|resort/i.test(n)) {
    return true;
  }

  // Default: for strict property management search, reject weak names
  if (/property management|property manager|hoa|real estate/.test(niche)) {
    return false;
  }

  return true; // other niches: allow through, Clef will refine
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
    "mode TEXT DEFAULT 'founder'",
    "first_seen_at TEXT",
    "last_seen_at TEXT",
    "status TEXT DEFAULT 'open'",
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
      // column already exists
    }
  }
  const nowIso = new Date().toISOString();
  // Heal NOT NULL columns that production may require without defaults
  for (const sql of [
    `UPDATE opportunities SET mode = 'founder' WHERE mode IS NULL OR mode = ''`,
    `UPDATE opportunities SET first_seen_at = COALESCE(first_seen_at, created_at, '${nowIso}') WHERE first_seen_at IS NULL OR first_seen_at = ''`,
    `UPDATE opportunities SET last_seen_at = COALESCE(last_seen_at, updated_at, created_at, '${nowIso}') WHERE last_seen_at IS NULL OR last_seen_at = ''`,
    `UPDATE opportunities SET status = COALESCE(NULLIF(status,''), 'open') WHERE status IS NULL OR status = ''`,
    `UPDATE opportunities SET created_at = COALESCE(created_at, '${nowIso}') WHERE created_at IS NULL`,
    `UPDATE opportunities SET updated_at = COALESCE(updated_at, '${nowIso}') WHERE updated_at IS NULL`,
  ]) {
    try { await db.prepare(sql).run(); } catch { /* ok */ }
  }
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS opportunities (
        id TEXT PRIMARY KEY,
        prospect_id TEXT,
        tenant_id TEXT DEFAULT 'founder',
        mode TEXT DEFAULT 'founder',
        title TEXT,
        first_seen_at TEXT,
        last_seen_at TEXT,
        status TEXT DEFAULT 'open',
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
 * Production-safe opportunity upsert. Always fills mode + first_seen_at + last_seen_at
 * so NOT NULL constraints on drifted prod schemas never fail.
 */
let _oppSchemaReady = false;

async function upsertOpportunity(
  db: D1Database,
  opts: {
    id: string;
    prospect_id: string;
    tenant_id: string;
    mode?: string;
    title: string;
    strategic_score: number;
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
    why_now_json?: string | null;
    priority_tier?: string;
  }
): Promise<boolean> {
  if (!_oppSchemaReady) {
    await ensureOpportunitiesSchema(db);
    _oppSchemaReady = true;
  }
  const nowIso = new Date().toISOString();
  const mode = opts.mode || (opts.tenant_id === "founder" ? "founder" : "tenant");
  const s = Math.round(opts.strategic_score || 50);
  try {
    await db.prepare(`
      INSERT INTO opportunities (
        id, prospect_id, tenant_id, mode, title,
        first_seen_at, last_seen_at, status,
        strategic_score, fit_score, intent_score, pain_score,
        ability_to_pay_score, contactability_score, timing_score,
        evidence_score, signal_freshness_score, expected_value,
        decision_state, why_now_json, priority_tier, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        last_seen_at = excluded.last_seen_at,
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
      opts.id, opts.prospect_id, opts.tenant_id || "founder", mode, opts.title,
      nowIso, nowIso, "open", s,
      opts.fit_score ?? s, opts.intent_score ?? Math.round(s * 0.8),
      opts.pain_score ?? Math.round(s * 0.7), opts.ability_to_pay_score ?? 60,
      opts.contactability_score ?? 70, opts.timing_score ?? 50,
      opts.evidence_score ?? 50, opts.signal_freshness_score ?? 80,
      opts.expected_value ?? 0, opts.decision_state || "identified",
      opts.why_now_json ?? null,
      opts.priority_tier || (s >= 80 ? "high" : s >= 55 ? "medium" : "low"),
      nowIso, nowIso
    ).run();
    return true;
  } catch (e: any) {
    console.warn("[upsertOpportunity] failed:", e?.message || e);
    try {
      const info = await db.prepare("PRAGMA table_info(opportunities)").all();
      const cols = new Set((info.results || []).map((r: any) => String(r.name)));
      const row: Record<string, any> = {
        id: opts.id, prospect_id: opts.prospect_id,
        tenant_id: opts.tenant_id || "founder", mode, title: opts.title,
        first_seen_at: nowIso, last_seen_at: nowIso, status: "open",
        strategic_score: s, fit_score: opts.fit_score ?? s,
        intent_score: opts.intent_score ?? Math.round(s * 0.8),
        pain_score: opts.pain_score ?? Math.round(s * 0.7),
        ability_to_pay_score: opts.ability_to_pay_score ?? 60,
        contactability_score: opts.contactability_score ?? 70,
        timing_score: opts.timing_score ?? 50,
        evidence_score: opts.evidence_score ?? 50,
        signal_freshness_score: opts.signal_freshness_score ?? 80,
        expected_value: opts.expected_value ?? 0,
        decision_state: opts.decision_state || "identified",
        why_now_json: opts.why_now_json ?? null,
        priority_tier: opts.priority_tier || (s >= 80 ? "high" : s >= 55 ? "medium" : "low"),
        created_at: nowIso, updated_at: nowIso,
      };
      const useCols = Object.keys(row).filter((k) => cols.has(k));
      if (useCols.length < 2) return false;
      const sql = `INSERT OR REPLACE INTO opportunities (${useCols.join(",")}) VALUES (${useCols.map(() => "?").join(",")})`;
      await db.prepare(sql).bind(...useCols.map((k) => row[k])).run();
      return true;
    } catch (e2: any) {
      console.warn("[upsertOpportunity] pragma failed:", e2?.message || e2);
      return false;
    }
  }
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
  _city: string,
  _mode: string
): Promise<{ ok: boolean; reason: string }> {
  // "@cf/cloudflare/clef-flash" no existe en el catálogo de Workers AI: cada llamada fallaba y se permitía todo.
  // Ahora se usa directamente el modelo real (llama-3.2-3b) con el filtro de negocio real / cadena / institución.
  return classifyWithWorkersAI(env, name, website || null, trade);
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
 * Conciliación con Resend SIN webhook: consulta el estado real de los correos enviados (RESEND_API_KEY ya existente).
 * Rebote o queja => el prospecto queda bloqueado y su correo/dominio entra a la lista de supresión,
 * para proteger la reputación del dominio aunque nunca llegue un webhook.
 */
export async function reconcileResendDeliveries(env: Env): Promise<{ checked: number; bounced: number; complained: number }> {
  const out = { checked: 0, bounced: 0, complained: 0 };
  const key = String((env as any).RESEND_API_KEY || "").trim();
  if (!key || !env.RADAR_DB) return out;

  const since = new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString();
  const rows = await env.RADAR_DB.prepare(`
    SELECT id, email, dispatch_message_id
    FROM prospects
    WHERE dispatch_provider = 'resend'
      AND dispatch_message_id IS NOT NULL AND dispatch_message_id != ''
      AND COALESCE(dispatch_status, '') NOT IN ('delivered', 'bounced', 'complained', 'opened', 'clicked')
      AND last_contact_at >= ?
    ORDER BY last_contact_at DESC
    LIMIT 20
  `).bind(since).all();

  for (const p of (rows.results || []) as any[]) {
    try {
      const res = await fetch(`https://api.resend.com/emails/${encodeURIComponent(p.dispatch_message_id)}`, {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(6000)
      });
      if (res.status === 429) break; // límite de Resend: seguimos en el próximo cron
      if (!res.ok) continue;
      const data: any = await res.json().catch(() => ({}));
      const ev = String(data?.last_event || "").toLowerCase();
      if (!ev) continue;
      out.checked++;
      const now = new Date().toISOString();

      if (ev === "bounced" || ev === "complained") {
        const email = String(p.email || "").trim().toLowerCase();
        await env.RADAR_DB.prepare(
          "UPDATE prospects SET status = ?, outcome = ?, dispatch_status = ?, updated_at = ? WHERE id = ?"
        ).bind(ev === "complained" ? "suppressed" : "bounced", ev, ev, now, p.id).run();
        if (email) {
          await env.RADAR_DB.prepare("INSERT OR REPLACE INTO suppression (key, reason, created_at) VALUES (?, ?, ?)")
            .bind(email, `resend_${ev}`, now).run();
        }
        if (ev === "bounced") out.bounced++; else out.complained++;
      } else if (["delivered", "opened", "clicked"].includes(ev)) {
        await env.RADAR_DB.prepare("UPDATE prospects SET dispatch_status = ?, updated_at = ? WHERE id = ?")
          .bind(ev, now, p.id).run();
      }
    } catch { /* un correo que falla no frena al resto */ }
    await new Promise(r => setTimeout(r, 600)); // Resend permite ~2 req/s
  }
  return out;
}

/**
 * 1. DISCOVERY JOB: Scrapes directory businesses for 1 city + trade, enqueues enrich jobs
 */
async function handleDiscoveryJob(job: RadarJobMessage, env: Env): Promise<void> {
  const { city, trade, overrides } = job.payload;

  // Skip city+trade pairs already dense in D1 (founder or tenant scope).
  // Prevents burning budget on "todo lo que halla ya existe".
  if (env.RADAR_DB && city && trade) {
    try {
      const scope = (job.tenant_id || "founder").trim() || "founder";
      const row = await env.RADAR_DB.prepare(
        `SELECT COUNT(*) AS c FROM prospects
         WHERE COALESCE(tenant_id,'founder') = ?
           AND lower(trim(city)) = lower(trim(?))
           AND lower(trim(trade)) = lower(trim(?))`
      ).bind(scope, city, trade).first() as any;
      const existingCount = Number(row?.c || 0);
      // Only treat as saturated when we already have enough NON-junk rows.
      // Disqualified/discarded should not freeze the city forever.
      const liveRow = await env.RADAR_DB.prepare(
        `SELECT COUNT(*) AS c FROM prospects
         WHERE COALESCE(tenant_id,'founder') = ?
           AND lower(trim(city)) = lower(trim(?))
           AND lower(trim(trade)) = lower(trim(?))
           AND lower(COALESCE(status,'')) NOT IN ('disqualified','discarded','blocked','bounced')`
      ).bind(scope, city, trade).first() as any;
      const liveCount = Number(liveRow?.c || 0);
      if (liveCount >= 12) {
        console.log(`[Job: discovery] saturated_pair skip ${city} / ${trade} live=${liveCount} total=${existingCount} scope=${scope}`);
        try {
          const place = findPlace(city);
          if (place) {
            await markSearched(env.RADAR_DB, scope, place, trade, {
              candidates: liveCount,
              qualified: 0,
            } as any);
          }
        } catch (_) {}
        return;
      }
    } catch (e) {
      console.warn("[Job: discovery] saturated_pair check failed:", e);
    }
  }

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

  const { businesses: scraped, diagnostics } = await fetchLocalBusinessesWithDiagnostics(city, trade, env, customOsmTags, (job.mode === 'tenant' ? 'tenant' : 'founder'));

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

    // Do NOT burn geo_coverage on infrastructure failures (timeout/4xx/abort).
    // Only mark when sources honestly returned zero matches.
    const reason = String(diagnostics?.reason || "").toLowerCase();
    const isInfraFail =
      reason.includes("timeout") ||
      reason.includes("aborted") ||
      reason.includes("http 4") ||
      reason.includes("http 5") ||
      reason.includes("network") ||
      reason.includes("fetch failed") ||
      reason.includes("econn") ||
      (reason.includes("overpass") && reason.includes("fail"));
    const isHonestEmpty =
      reason.includes("0 matches") ||
      reason.includes("0 businesses") ||
      reason.includes("0 elements") ||
      reason.includes("empty") ||
      reason.includes("no results");
    if (!isInfraFail && (isHonestEmpty || !reason)) {
      const place = findPlace(city);
      if (place) {
        await markSearched(env.RADAR_DB, job.tenant_id || "founder", place, trade, {
          candidates: 0,
          qualified: 0
        });
      }
    } else {
      console.warn(`[Job: discovery] skip markSearched (infra/empty ambiguous) city=${city} trade=${trade} reason=${diagnostics?.reason}`);
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

    // Contactability first (email > phone > real website) — founder lives or dies by outreach
    const contactScore = (x: any) => {
      let s = 0;
      if (x.email && String(x.email).includes('@')) s += 8;
      if (x.phone && String(x.phone).replace(/\D/g, '').length >= 7) s += 4;
      if (x.website && isRealWebsite(String(x.website))) s += 2;
      return s;
    };
    const csB = contactScore(b);
    const csA = contactScore(a);
    if (csB !== csA) return csB - csA;

    return 0;
  });

  const perJobCap = 3;
  // BUG CORREGIDO: antes se cortaba la lista a los 3 primeros ANTES de filtrar duplicados. Cuando esos 3 ya eran
  // prospectos (lo normal desde la segunda corrida de una ciudad+oficio), el job daba 0 leads y los demás
  // candidatos nunca se miraban. Ahora se revisan hasta maxScan candidatos y se corta al llegar a perJobCap aceptados.
  const maxScan = 40;
  const acceptCap = Math.min(remainingBudget, perJobCap);
  const bounded = ranked.slice(0, maxScan);
  let enqueuedEnrich = 0;
  let filteredCount = 0;
  let aiClassifyCalls = 0;

  for (const candidate of bounded) {
    if (enqueuedEnrich >= acceptCap) break;

    // Descartes baratos ANTES de reservar presupuesto (evita 3 escrituras a D1 por cada candidato que se rechaza)
    const preName = (candidate.name || "").toLowerCase();
    const allowGym = job.mode === 'tenant';
    const EXTRA_SYNTACTIC_ICP_EXCLUSION = /\b(store|shop|market|pet|nails|hair|grocery|florist|boutique)\b/i;
    if (isOffIcpName(candidate.name, allowGym) || EXTRA_SYNTACTIC_ICP_EXCLUSION.test(candidate.name)) {
      console.log(`[ICP Gate: Discarded] "${candidate.name}" matched off-ICP exclusion in handleDiscoveryJob`);
      filteredCount++;
      continue;
    }

    const candCoherence = checkTradeCoherence(candidate.name, candidate.trade || trade, candidate.website, JSON.stringify(candidate), job.mode);
    if (!candCoherence.coherent || candCoherence.disqualified) {
      console.log(`[Trade Gate: Discarded] "${candidate.name}" failed trade coherence: ${candCoherence.reason}`);
      filteredCount++;
      continue;
    }
    if (candCoherence.verifiedTrade) {
      candidate.trade = candCoherence.verifiedTrade;
    }

    if (
      (candidate.email || "").toLowerCase().includes("example.com") ||
      (candidate.website || "").toLowerCase().includes("example.com") ||
      preName.includes("test business") ||
      isHardRejectedChain(candidate.name) ||
      isNonBusinessEntity(candidate.name, candidate.website, job.mode) ||
      (job.mode === "tenant" && !tenantBuyerNameFits(candidate.name, trade))
    ) {
      filteredCount++;
      continue;
    }

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

    // Tenant: drop OSM noise that is not a plausible buyer for this ICP
    if (job.mode === "tenant" && !tenantBuyerNameFits(candidate.name, trade)) {
      await releaseBudget(env.RADAR_DB, tenantId, 'discovery_units', 1);
      filteredCount++;
      continue;
    }

    const identityKey = generateIdentityKey(candidate.email, candidate.website, candidate.phone, candidate.name, candidate.city);

    // 2. Composite suppression check
    const suppression = await checkSuppressedComposite(env.RADAR_DB, candidate.email, candidate.website, candidate.phone, candidate.name, candidate.city, job.tenant_id || "founder");
    if (suppression) {
      await releaseBudget(env.RADAR_DB, tenantId, 'discovery_units', 1);
      filteredCount++;
      continue;
    }

    // 3. Duplicate & anti-spam lifecycle check
    const overlap = await findExistingProspectOverlap(env.RADAR_DB, candidate.email, candidate.website, candidate.phone, candidate.name, candidate.city, job.tenant_id || "founder");
    if (overlap) {
      const p = overlap.overlap;
      await associateResearchCandidate(env.RADAR_DB, job.run_id, job.mode, job.tenant_id, p.id);
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
        if (daysSinceContact < 45) {
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

    // Re-validate ICP and trade coherence right before database insertion
    if (isOffIcpName(candidate.name, job.mode === 'tenant')) {
      console.log(`[ICP Gate: Discarded before insert] "${candidate.name}" matched off-ICP`);
      continue;
    }
    const preInsertCoherence = checkTradeCoherence(candidate.name, candidate.trade, candidate.website, null, job.mode);
    if (!preInsertCoherence.coherent || preInsertCoherence.disqualified) {
      console.log(`[Trade Gate: Discarded before insert] "${candidate.name}" failed trade coherence: ${preInsertCoherence.reason}`);
      continue;
    }
    if (preInsertCoherence.verifiedTrade) {
      candidate.trade = preInsertCoherence.verifiedTrade;
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

    await associateResearchCandidate(env.RADAR_DB, job.run_id, job.mode, job.tenant_id, prospectId);

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

  // Aviso operativo a Telegram: solo cuando el autónomo ENCONTRÓ algo nuevo.
  // Founder = clientes para Bvelt. Tenant = clientes potenciales para un cliente Bvelt.
  // No es outreach ni aprobación: es heartbeat de que el radar está trabajando.
  if (enqueuedEnrich > 0) {
    try {
      const isTenant = job.mode === "tenant" && !!job.tenant_id;
      const scopeLabel = isTenant
        ? `Tenant <code>${escapeHtml(String(job.tenant_id))}</code>`
        : "Founder (Bvelt)";
      const purpose = isTenant
        ? "Clientes potenciales para tu cliente Bvelt"
        : "Prospectos para Bvelt";
      const msg =
        `<b>📡 Radar discovery OK</b>\n` +
        `<b>Modo:</b> ${scopeLabel}\n` +
        `<b>Mercado:</b> ${escapeHtml(String(city))} · ${escapeHtml(String(trade))}\n` +
        `<b>Raw:</b> ${scraped.length} · <b>Nuevos en cola:</b> ${enqueuedEnrich}\n` +
        `<b>Objetivo:</b> ${purpose}\n` +
        `<b>run:</b> <code>${escapeHtml(String(job.run_id || "").slice(0, 13))}…</code>`;
      await notifyFounder(env, msg).catch(() => {});
    } catch (tgDiscErr) {
      console.warn("[discovery] telegram summary failed:", tgDiscErr);
    }
  }
}

/**
 * 2. ENRICH JOB: Scrapes candidate website HTML, extracts signals, enqueues score job without burning quotas
 */
async function handleEnrichJob(job: RadarJobMessage, env: Env): Promise<void> {
  const { prospect_id, overrides, permits_90d } = job.payload;
  const prospect = await env.RADAR_DB.prepare("SELECT * FROM prospects WHERE id = ?").bind(prospect_id).first() as any;
  if (!prospect) return;

  // Off-ICP and Trade Coherence Gate
  if (isOffIcpName(prospect.name, prospect.mode === 'tenant')) {
    await env.RADAR_DB.prepare("UPDATE prospects SET status = 'disqualified', outcome = 'off_icp_name', updated_at = ? WHERE id = ?")
      .bind(new Date().toISOString(), prospect.id).run();
    return;
  }
  const enrichCoherence = checkTradeCoherence(prospect.name, prospect.trade, prospect.website, prospect.signals_json, prospect.mode);
  if (!enrichCoherence.coherent && enrichCoherence.disqualified) {
    await env.RADAR_DB.prepare("UPDATE prospects SET status = 'disqualified', outcome = 'off_icp_name', updated_at = ? WHERE id = ?")
      .bind(new Date().toISOString(), prospect.id).run();
    return;
  }
  if (enrichCoherence.verifiedTrade && enrichCoherence.verifiedTrade !== prospect.trade) {
    await env.RADAR_DB.prepare("UPDATE prospects SET trade = ?, updated_at = ? WHERE id = ?")
      .bind(enrichCoherence.verifiedTrade, new Date().toISOString(), prospect.id).run();
    prospect.trade = enrichCoherence.verifiedTrade;
  }

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
    // Free fallback when PageSpeed key missing or failed (local-outreach style evidence)
    if (!webAudit) {
      try {
        const probe = await probeWebsiteHealth(prospect.website);
        webAudit = {
          mobileScore: null,
          fcpSeconds: probe.isSlow ? 3.5 : null,
          latencyMs: probe.ms,
          isSlow: probe.isSlow,
          parked: probe.parked,
          reachable: probe.ok,
        };
        if (probe.parked || !probe.ok) {
          // treat as no real website for scoring/templates
          try {
            const sig = typeof signals === 'object' && signals ? signals : {};
            (sig as any).no_own_website = true;
          } catch {}
        }
      } catch (e) {}
    }
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

  // Step c: Hunter Domain Search BEFORE guessing patterns (bounce killer)
  // Prefer Hunter / scrape over inventing contact@
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

  // Step d: NEVER invent contact@ (primary bounce driver in Resend metrics).
  let emailSource: 'scrape' | 'hunter' | 'pattern' | 'existing' | 'none' = 'none';
  if (prospect.email && emailCandidate === prospect.email) emailSource = 'existing';
  else if (websiteEmail && emailCandidate === websiteEmail) emailSource = 'scrape';
  else if (emailCandidate) emailSource = 'hunter'; // filled by Hunter step above
  if (!emailCandidate && domain && hasValidMx) {
    emailCandidate = `info@${domain}`;
    emailSource = 'pattern';
  }

  // Step e: Deliverability gate — Abstract when available; pattern emails MUST validate
  let isEmailValidated = false;
  let emailQuality = 0;
  if (emailCandidate) {
    if (env.ABSTRACT_API_KEY) {
      try {
        const ver = await verifyEmail(emailCandidate, env);
        emailQuality = Number(ver.quality_score || 0);
        // Stricter: undeliverable/disposable out; pattern needs quality >= 0.7
        const minQ = emailSource === 'pattern' ? 0.72 : 0.55;
        if (!ver.valid || emailQuality < minQ || ver.deliverability === 'UNDELIVERABLE') {
          emailCandidate = null;
          isEmailValidated = false;
        } else {
          isEmailValidated = true;
        }
      } catch (e: any) {
        // API failure: keep scrape/hunter emails, DROP pattern guesses (bounce risk)
        if (emailSource === 'pattern') {
          emailCandidate = null;
          isEmailValidated = false;
        } else {
          isEmailValidated = emailSource === 'hunter' || emailSource === 'scrape' || emailSource === 'existing';
        }
      }
    } else {
      // No Abstract: reject pattern guesses entirely; accept scrape/hunter/existing only
      if (emailSource === 'pattern') {
        emailCandidate = null;
        isEmailValidated = false;
      } else {
        isEmailValidated = true;
        emailQuality = emailSource === 'hunter' ? 0.75 : 0.65;
      }
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
    email_source: emailSource,
    email_quality: emailQuality,
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
  const learningStats = await getLearningStats(env.RADAR_DB, job.mode === "tenant" ? "tenant" : "founder", job.tenant_id || "founder");

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

  let finalScore = 0;
  let breakdown: Record<string, number> = {};
  let confidence = 50;
  let evidenceSummary = "";
  let evidenceItems: any[] = [];
  let painHypothesis: any = {};
  const signalTags: string[] = [];
  let bveltAngle = "";
  let variantId = "missed_calls";

  if (isTenant) {
    let tcRow: any = null;
    let baseCity = "";
    let expansionSegments: any[] = [];
    if (job.tenant_id) {
      try {
        tcRow = await env.RADAR_DB.prepare(
          "SELECT niche, cities_json, icp_expansion_json FROM tenant_config WHERE tenant_id = ?"
        ).bind(job.tenant_id).first();
        if (tcRow?.cities_json) {
          const parsedCities = JSON.parse(tcRow.cities_json);
          if (Array.isArray(parsedCities) && parsedCities.length > 0) {
            baseCity = parsedCities[0];
          }
        }
        if (tcRow?.icp_expansion_json) {
          const exp = typeof tcRow.icp_expansion_json === "string" ? JSON.parse(tcRow.icp_expansion_json) : tcRow.icp_expansion_json;
          if (Array.isArray(exp?.segments)) {
            expansionSegments = exp.segments;
          }
        }
      } catch (e) {}
    }
    if (!baseCity && missionConfig.geographies && missionConfig.geographies.length > 0) {
      baseCity = missionConfig.geographies[0];
    }

    const nameLower = (prospect.name || "").toLowerCase();
    const tradeLower = (prospect.trade || "").toLowerCase();

    // 1. Encaje (0-40): coincidencia del nombre/oficio del prospecto con el segmento (prospect.trade) o con las keywords del segmento en icp_expansion_json (+25 si coincide el segmento, +15 si tiene website real).
    let encaje = 0;
    const targetNiches = (missionConfig?.niches || []).map(n => n.toLowerCase());
    let matchesSegment = targetNiches.some(n => tradeLower.includes(n) || nameLower.includes(n));
    if (!matchesSegment && expansionSegments.length > 0) {
      for (const seg of expansionSegments) {
        const segLabel = (seg.label || "").toLowerCase();
        const kws = Array.isArray(seg.keywords) ? seg.keywords.map((k: any) => String(k).toLowerCase()) : [];
        if (segLabel && (tradeLower.includes(segLabel) || nameLower.includes(segLabel))) {
          matchesSegment = true;
          break;
        }
        if (kws.some((k: string) => tradeLower.includes(k) || nameLower.includes(k))) {
          matchesSegment = true;
          break;
        }
      }
    }
    if (matchesSegment) encaje += 25;
    if (prospect.website && isRealWebsite(prospect.website)) encaje += 15;
    encaje = Math.min(40, encaje);
    breakdown.encaje = encaje;

    // 2. Contacto (0-25): +15 con email validado, +10 con teléfono (suma ambos, tope 25).
    let contacto = 0;
    if (prospect.email && isEmailValidated) {
      contacto += 15;
      signalTags.push("Email validado");
    } else if (prospect.email) {
      contacto += 8;
    }
    if (prospect.phone) {
      contacto += 10;
      signalTags.push("Teléfono directo");
    }
    contacto = Math.min(25, contacto);
    breakdown.contacto = contacto;

    // 3. Cercanía (0-20): distancia en km entre findPlace(prospect.city) y findPlace(primera ciudad de cities_json del tenant) usando haversineKm: <=15 km 20, <=30 km 14, <=60 km 8, si no 3 (si no se puede calcular, 8).
    let cercania = 8;
    let distKm: number | null = null;
    const p1 = findPlace(prospect.city);
    const p2 = baseCity ? findPlace(baseCity) : null;
    if (p1 && p2) {
      distKm = Math.round(haversineKm(p1.lat, p1.lon, p2.lat, p2.lon));
      if (distKm <= 15) cercania = 20;
      else if (distKm <= 30) cercania = 14;
      else if (distKm <= 60) cercania = 8;
      else cercania = 3;
      signalTags.push(`A ${distKm} km de tu base`);
    } else {
      cercania = 8;
    }
    breakdown.cercania = cercania;

    // 4. Señal (0-15): +15 si permits_90d >= 3 (etiqueta "Obra activa"), +8 si el nombre contiene "property management|property manager|facility|hoa|general contractor".
    let senal = 0;
    if (permits_90d >= 3) {
      senal += 15;
      signalTags.push(`Obra activa (${permits_90d} permisos/90d)`);
      signals.active_permits = true;
      signals.permits_label = `Obra activa (${permits_90d} permisos/90d)`;
    } else if (/property management|property manager|facility|hoa|general contractor/i.test(nameLower)) {
      senal += 8;
      signalTags.push("Cliente B2B recurrente");
    }
    senal = Math.min(15, senal);
    breakdown.senal = senal;

    finalScore = Math.min(100, Math.max(0, encaje + contacto + cercania + senal));
    confidence = Math.min(100, 40 + (prospect.phone ? 25 : 0) + (prospect.email ? 20 : 0) + (isEmailValidated ? 15 : 0));
    evidenceSummary = `Comprador B2B para ${tcRow?.niche || prospect.trade} en ${prospect.city}${distKm !== null ? ` (a ${distKm} km)` : ''}`;
    painHypothesis = { mode: "tenant_buyer", icp_match: matchesSegment };
    bveltAngle = "tenant_buyer_opportunity";
    variantId = "tenant_direct";
  } else {
    // Founder mode
    const multiScore = calculateMultiFactorScore(
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
    breakdown = multiScore.breakdown;
    confidence = multiScore.confidence;
    evidenceSummary = multiScore.evidenceSummary;
    evidenceItems = multiScore.evidenceItems || [];
    painHypothesis = multiScore.painHypothesis || {};

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

    finalScore = multiScore.totalScore;
    if (isPermitsSource && permits_90d >= 3) {
      finalScore = Math.min(100, finalScore + 10);
      breakdown.active_permits = 10;
    }

    bveltAngle = "missed_lead_response";
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

    variantId = (hashCode(prospect.name + prospect.city) % 2 === 0) ? "missed_calls" : "dormant_leads";
  }

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

  // Track demo_created event only for Founder prospects
  if (!isTenant) {
    try {
      await env.RADAR_DB.prepare(
        "INSERT INTO prospect_events (prospect_id, event_type, content, created_at) VALUES (?, 'demo_created', ?, ?)"
      ).bind(prospect_id, "Personalized demo token generated based on structured evidence", new Date().toISOString()).run();
    } catch (e) {}
  }

  const strat = isTenant ? {
    fit_score: breakdown.encaje ? Math.round((breakdown.encaje / 40) * 100) : 50,
    intent_score: breakdown.senal ? Math.round((breakdown.senal / 15) * 100) : 50,
    pain_score: 50,
    ability_to_pay_score: 75,
    contactability_score: breakdown.contacto ? Math.round((breakdown.contacto / 25) * 100) : 50,
    timing_score: breakdown.cercania ? Math.round((breakdown.cercania / 20) * 100) : 50,
    evidence_score: 60,
    signal_freshness_score: 100,
    strategic_score: finalScore,
    expected_value: Math.round(finalScore * 25),
    decision_state: finalScore >= 60 ? "actionable" : "identified",
    priority_tier: finalScore >= 75 ? "high" : finalScore >= 50 ? "medium" : "low",
    why_now_json: JSON.stringify({ signals: signalTags }),
    why_now: {
      what_is_happening: `Comprador B2B local para ${prospect.trade} en ${prospect.city}`,
      what_evidence_exists: signalTags,
      why_it_matters: "Cliente de alto valor para contratación y mantenimiento",
      why_now: "Ubicación cercana y canales de contacto activos",
      recommended_action: "Llamar directo o contactar para presentar servicios",
      potential_economic_result: "Contratos de servicio y mantenimiento recurrente",
      distinctions: { observed_facts: signalTags, inferences: [], estimations: [] }
    }
  } : calculateStrategicScores(
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
    const oppId = `opp_${prospect_id}`;
    const tenantId = job.tenant_id || prospect.tenant_id || "founder";
    const title = `${prospect.name} — ${prospect.trade} (${prospect.city})`;
    const nowIso = new Date().toISOString();
    const stratScore = Math.round(strat.strategic_score || finalScore || 50);
    const priority = strat.priority_tier || (stratScore >= 80 ? "high" : stratScore >= 55 ? "medium" : "low");

    await upsertOpportunity(env.RADAR_DB, {
      id: oppId,
      prospect_id,
      tenant_id: tenantId,
      title,
      strategic_score: stratScore,
      fit_score: strat.fit_score || stratScore,
      intent_score: strat.intent_score || Math.round(stratScore * 0.8),
      pain_score: strat.pain_score || Math.round(stratScore * 0.7),
      ability_to_pay_score: strat.ability_to_pay_score || 60,
      contactability_score: strat.contactability_score || 70,
      timing_score: strat.timing_score || 50,
      evidence_score: strat.evidence_score || 50,
      signal_freshness_score: strat.signal_freshness_score || 80,
      expected_value: strat.expected_value || finalScore || 0,
      decision_state: strat.decision_state || "identified",
      why_now_json: strat.why_now_json || JSON.stringify({ signals: signalTags }),
      priority_tier: priority
    });

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
    await sendTenantObservationsToBvelt(env, String(job.tenant_id || ""), {
      prospectIds: [String(prospect_id)]
    }).catch((error) => console.warn("[Tenant Bvelt Sync] Qualified prospect sync failed:", error));
    return;
  }

  // --- HOT LEAD INTERRUPT TRIGGERS ---
  const detectedCount = evidenceItems.filter((e: any) => e.value === 'detected').length;
  // Bvelt Fit Score
  const tradeLower = (prospect.trade || "").toLowerCase();
  const isPreferred = PREFERRED_TRADES.has(tradeLower) || /hvac|plumb|electr|roof|lawn|landscap|pool|clean|handyman/i.test(tradeLower);
  const bveltFitScore = isPreferred ? 15 : 0;

  const isHotLead = (finalScore >= 90 && confidence >= 80) || 
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

        const demoLink = "https://bvelt.app/";

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

  // Deliverability gate — do not burn Resend reputation on guessed contact@
  let signalsMeta: any = {};
  try { signalsMeta = JSON.parse(prospect.signals_json || "{}"); } catch {}
  const emailLocal = String(prospect.email).split("@")[0].toLowerCase();
  const isRiskyLocal = /^(contact|admin|webmaster|mail)$/.test(emailLocal);
  if (signalsMeta.is_email_validated === false || (isRiskyLocal && signalsMeta.is_email_validated !== true)) {
    console.warn(`[Outreach] Skip ${prospect.id} — email not validated or risky local-part ${emailLocal}`);
    try {
      await env.RADAR_DB.prepare(
        "UPDATE prospects SET outcome = 'skipped_unverified_email', updated_at = ? WHERE id = ?"
      ).bind(new Date().toISOString(), prospect_id).run();
    } catch {}
    return;
  }

  // Follow-up: if already sent, only continue when 5+ days, no reply, touch < 3
  {
    const st = String(prospect.status || "").toLowerCase();
    const touchNow = getOutreachTouch(prospect);
    if (prospect.draft_body && ['queued', 'notified'].includes(st)) return;
    if (st === 'sent' && prospect.draft_body) {
      if (prospect.last_reply_at) return;
      const last = prospect.last_contact_at ? new Date(prospect.last_contact_at).getTime() : 0;
      const days = last ? (Date.now() - last) / 86400000 : 999;
      if (days < 5) return;
      if (touchNow >= 3) return; // max 2 follow-ups
      // bump touch for this generation
      prospect.signals_json = JSON.stringify({
        ...((): any => { try { return JSON.parse(prospect.signals_json || "{}"); } catch { return {}; } })(),
        outreach_touch: touchNow + 1,
      });
    }
  }

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
    draft = getTradePsychologyFallback(prospect.name, prospect.trade, prospect.city, prospect.variant_id || 'missed_calls', primaryLanguage, prospect.phone, prospect.demo_token, prospect.signal_event, prospect.signal_area, env, prospect.signals_json || prospect.signals);
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
    const t = getOutreachTouch(prospect);
    await bumpOutreachTouch(env.RADAR_DB, prospect, t);
  } catch { /* ok */ }

  try {
    await env.RADAR_DB.prepare("UPDATE runs SET finalized = finalized + 1 WHERE id = ?").bind(job.run_id).run();
  } catch (e) {}

  // Trust-Stack Governor Gate Check IMMEDIATELY BEFORE SENDING/DISPATCHING
  const gate = await verifyTrustStackGate(prospect, job.run_id, env);
  if (!gate.allowed) {
    console.warn(`[Outreach Gate Blocked] Prospect ${prospect.name} (${prospect_id}) blocked by safety gate: ${gate.reason}`);
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

  // Autonomous founder outreach:
  // - Configured for 5 to 8 daily emails without manual approval
  // - Minimum score: default 50 for qualified leads (with valid email)
  // - Cap sends/day via FOUNDER_AUTO_MAX_PER_DAY (default 8, hard max 12)
  const autoMinScore = Math.min(90, Math.max(45, parseInt(String((env as any).FOUNDER_AUTO_MIN_SCORE || "50"), 10) || 50));
  const autoMaxPerDay = Math.min(12, Math.max(3, parseInt(String((env as any).FOUNDER_AUTO_MAX_PER_DAY || "8"), 10) || 8));
  const scoreVal = Number(prospect.opportunity_score || prospect.score || 0);
  const confVal = Number(prospect.confidence_score || 0);
  const isElite = (scoreVal >= 80 && confVal >= 75) || (scoreVal >= 80 && !prospect.confidence_score);
  const isStrongAuto = scoreVal >= autoMinScore && Boolean(prospect.email);
  const autoFlag = String(env.FOUNDER_AUTO_OUTREACH !== undefined && env.FOUNDER_AUTO_OUTREACH !== "" ? env.FOUNDER_AUTO_OUTREACH : "true").toLowerCase();
  const isAutoOutreachEnabled =
    job.mode === "founder" &&
    (autoFlag === "true" || autoFlag === "1" || autoFlag === "yes") &&
    (isElite || isStrongAuto);

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
    if (isUsOutreachQuietHours()) {
      console.log(`[Auto-Outreach] Quiet hours (America/New_York) — holding ${prospect.id} for daytime send`);
      await env.RADAR_DB.prepare(
        "UPDATE prospects SET status = 'queued', outcome = 'held_quiet_hours', updated_at = ? WHERE id = ?"
      ).bind(new Date().toISOString(), prospect.id).run();
    } else {
    const timestamp = new Date().toISOString();
    let slotReserved = false;
    let sendsTodayCount = 1;

    try {
      // Ensure sender governor state is reset for today if needed
      await checkSenderGovernor(env);

      // Atomic D1 slot check & reservation (FOUNDER_AUTO_MAX_PER_DAY, default 8)
      const updateRes = await env.RADAR_DB.prepare(`
        UPDATE sender_governor_state
        SET sends_today = sends_today + 1, updated_at = ?
        WHERE id = 'global_governor' AND sends_today < ? AND status = 'active' AND last_reset_day = ?
      `).bind(timestamp, autoMaxPerDay, todayDate).run() as any;

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
          `\n\n⚡ <b>AUTO-SENT (${sendsTodayCount}/${autoMaxPerDay})</b>\n📅 <b>Time:</b> <code>${new Date().toISOString()}</code>\n<i>Outreach enviado automáticamente por Founder Auto-Outreach (5-8 diarios sin aprobación manual).</i>`;

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
        // Antes este bloqueo era silencioso: el prospecto quedaba en hold y Telegram no decía nada.
        await notifyOnce(
          env,
          `autosend_blocked_${String(sendRes.reason).split(":")[0]}`,
          `<b>⚠️ Radar: envío automático bloqueado</b>\n` +
          `<b>Motivo:</b> <code>${escapeHtml(String(sendRes.reason).slice(0, 200))}</code>\n` +
          `<b>Prospecto:</b> ${escapeHtml(String(prospect.name || ""))} (${escapeHtml(String(prospect.city || ""))})\n` +
          `<i>Queda en hold. Te aviso 1 vez al día por motivo.</i>`
        );
        return;
      }
    } else {
      console.log(`[Auto-Outreach] Daily auto outreach limit (5) reached or slot unavailable. Falling back to interactive approval queue.`);
    }
  }

  } // end quiet-hours else

  // Fallback / Interactive Approval Flow (when FOUNDER_AUTO_OUTREACH is false or cap reached or quiet hours)
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
  | 'opened'
  | 'clicked'
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
  if (typeLower === 'opened' || typeLower === 'open' || typeLower === 'email.opened') return 'opened';
  if (typeLower === 'clicked' || typeLower === 'click' || typeLower === 'email.clicked') return 'clicked';
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

    case 'opened':
      newStatus = 'opened';
      newOutcome = 'opened';
      break;

    case 'clicked':
      newStatus = 'clicked';
      newOutcome = 'clicked';
      if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
        try {
          await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: env.TELEGRAM_CHAT_ID,
              text: `👀 *PROSPECT CLICKED DEMO / LINK!*\n\n*Business:* ${escapeMarkdown(prospect.name)}\n*City:* ${escapeMarkdown(prospect.city)}\n*Trade:* ${escapeMarkdown(prospect.trade)}\n*Email:* ${escapeMarkdown(prospect.email || "N/A")}\n\n🔥 _El contratista hizo click en el enlace / demo de Bvelt._`,
              parse_mode: "Markdown"
            }),
            signal: AbortSignal.timeout(4000)
          });
        } catch (e) {}
      }
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

  await recordLearningEvent(
    db,
    prospect.city,
    prospect.trade,
    prospect.variant_id,
    false,
    {
      score: prospect.score,
      angle: prospect.bvelt_angle,
      market: prospect.city,
      niche: prospect.trade,
      outcome: newOutcome,
      response_type: classification,
      event_type: classification,
      prospect_id: String(prospect.id),
      mode: prospect.mode,
      tenant_id: prospect.tenant_id || "founder"
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
 * Local send safety only — remote Trust-Stack REMOVED.
 * Blocks hard bounces / missing email only.
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
  _simulatedMode?: string | null
): Promise<TrustGateDecision> {
  const timestamp = new Date().toISOString();
  const isSuppressed = await checkSuppressedComposite(
    env.RADAR_DB,
    prospect.email,
    prospect.website,
    prospect.phone,
    prospect.name,
    prospect.city,
    prospect.tenant_id || "founder"
  );
  if (isSuppressed) {
    const reason = String(isSuppressed.reason || "").toLowerCase();
    const isHard =
      reason.includes("bounce") ||
      reason.includes("complaint") ||
      reason.includes("unsubscribe") ||
      reason.includes("spam");
    if (isHard) {
      const decision: TrustGateDecision = {
        allowed: false,
        status: "rejected",
        reason: `SUPPRESSED: ${isSuppressed.reason}`,
        timestamp,
      };
      try { await recordTrustDecisionInD1(env.RADAR_DB, prospect.id, runId, decision); } catch (_) {}
      return decision;
    }
  }
  if (!prospect.email || !String(prospect.email).includes("@")) {
    const decision: TrustGateDecision = {
      allowed: false,
      status: "rejected",
      reason: "MISSING_EMAIL: Prospect has no valid email.",
      timestamp,
    };
    try { await recordTrustDecisionInD1(env.RADAR_DB, prospect.id, runId, decision); } catch (_) {}
    return decision;
  }
  const decision: TrustGateDecision = {
    allowed: true,
    status: "approved",
    reason: "LOCAL_SAFETY_OK: Trust-Stack disabled; bounce/email checks only.",
    trust_decision_id: crypto.randomUUID(),
    timestamp,
  };
  try { await recordTrustDecisionInD1(env.RADAR_DB, prospect.id, runId, decision); } catch (_) {}
  return decision;
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
          // Tenant discovery targets the tenant's BUYERS, not its own trade or
          // Founder defaults. trades_json is not part of the tenant_config schema.
          config.niches = [];
          config.mode = "tenant";
          config.target = `tenant_${tenantId}_customers`;
          config.countries = JSON.parse(tenantConfig.countries_json || '[]');
          config.languages = JSON.parse(tenantConfig.languages_json || '[]');
          config.services = JSON.parse(tenantConfig.services_json || '[]');
          config.icp = {
            description: String(tenantConfig.icp_description || ""),
            keywords: JSON.parse(tenantConfig.icp_keywords_json || '[]')
          };
          config.min_score = Number(tenantConfig.minimum_score ?? 50);
          config.max_daily_outreach = 0;

          // Prefer an AI-generated ICP of likely recurring buyers. Use the
          // curated map only for recognized trades; unknown trades fail closed.
          let expandedBuyerSegments: Array<{ label: string }> = [];
          if (!skipPicks) {
            const expanded = await expandTenantIcp(env, tenantConfig);
            if (expanded?.segments?.length) expandedBuyerSegments = expanded.segments;
          }
          config.niches = resolveTenantBuyerSegments(tenantConfig.niche || "", expandedBuyerSegments);
        } catch (e) {
          console.error("Error parsing tenant config: ", e);
        }

        const citiesList = JSON.parse(tenantConfig.cities_json || '[]');
        const centerLabel = citiesList[0] || null;
        if (centerLabel && !skipPicks && config.niches.length > 0) {
          try {
            tenantPicks = await pickTargets(env.RADAR_DB, {
              tenantId,
              trades: config.niches,
              count: 6,
              centerLabel,
              serviceRadiusKm: Number(tenantConfig.service_radius_km || 60),
              countries: config.countries,
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
    config.icp = { description: "", keywords: [] };
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

      for (const alter of [
        "ALTER TABLE daily_missions ADD COLUMN tenant_id TEXT DEFAULT 'founder'",
        "ALTER TABLE daily_missions ADD COLUMN status TEXT DEFAULT 'active'",
        "ALTER TABLE daily_missions ADD COLUMN qualified_count INTEGER DEFAULT 0",
        "ALTER TABLE daily_missions ADD COLUMN outreach_count INTEGER DEFAULT 0",
      ]) {
        try { await env.RADAR_DB.prepare(alter).run(); } catch { /* exists */ }
      }

      let seeded = false;
      try {
        await env.RADAR_DB.prepare(`
          INSERT OR IGNORE INTO daily_missions
            (tenant_id, day, goal, markets, icp, budget, target_qualified, target_outreach, status, qualified_count, outreach_count)
          VALUES (?, ?, ?, ?, ?, ?, 3, 3, 'active', 0, 0)
        `).bind(targetTenant, today, goal, marketsJson, icpJson, budgetJson).run();
        seeded = true;
      } catch (e1: any) {
        console.warn("[Daily Mission] tenant insert:", e1?.message || e1);
      }
      if (!seeded) {
        try {
          await env.RADAR_DB.prepare(`
            INSERT OR IGNORE INTO daily_missions
              (day, goal, markets, icp, budget, target_qualified, target_outreach, status, qualified_count, outreach_count)
            VALUES (?, ?, ?, ?, ?, 3, 3, 'active', 0, 0)
          `).bind(today, goal, marketsJson, icpJson, budgetJson).run();
          seeded = true;
        } catch (e2: any) {
          console.warn("[Daily Mission] legacy insert:", e2?.message || e2);
        }
      }
      if (!seeded) {
        try {
          await env.RADAR_DB.prepare(`
            CREATE TABLE IF NOT EXISTS daily_missions (
              tenant_id TEXT DEFAULT 'founder',
              day TEXT NOT NULL,
              goal TEXT,
              markets TEXT,
              icp TEXT,
              budget TEXT,
              target_qualified INTEGER DEFAULT 3,
              target_outreach INTEGER DEFAULT 3,
              qualified_count INTEGER DEFAULT 0,
              outreach_count INTEGER DEFAULT 0,
              status TEXT DEFAULT 'active',
              PRIMARY KEY (tenant_id, day)
            )
          `).run();
          await env.RADAR_DB.prepare(`
            INSERT OR IGNORE INTO daily_missions
              (tenant_id, day, goal, markets, icp, budget, target_qualified, target_outreach, status, qualified_count, outreach_count)
            VALUES (?, ?, ?, ?, ?, ?, 3, 3, 'active', 0, 0)
          `).bind(targetTenant, today, goal, marketsJson, icpJson, budgetJson).run();
        } catch (e3: any) {
          console.warn("[Daily Mission] create failed:", e3?.message || e3);
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
      learningStats = await getLearningStats(env.RADAR_DB, mode === "tenant" ? "tenant" : "founder", tenantId || "founder");
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
        count: Math.min(20, Number(env.RADAR_JOBS_PER_RUN || 15)),
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

  // Hard-reject retail garden centers, nurseries, feed/garden stores, plant stores, supply houses
  // (name~ search matches "Garden Store" / "Feed & Garden" which are NOT field operators)
  if (
    /garden cent(er|re)/i.test(n) ||
    /\bgarden store\b/i.test(n) ||
    /\bfeed\b.*\bgarden\b/i.test(n) ||
    /\bgarden\b.*\bfeed\b/i.test(n) ||
    /\bfeed store\b/i.test(n) ||
    /\bagricultural supply\b/i.test(n) ||
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
    /mulch supply/i.test(n) ||
    /\bpet store\b/i.test(n) ||
    /\bgrocery\b/i.test(n)
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
  if (phone && !email) contactabilityNew += 3; // founder call path — no hard email requirement
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
    "handyman": "general_contractor",
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
  "https://overpass.osm.ch/api/interpreter",
  "https://overpass.openstreetmap.fr/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
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
  
  // El OSM de EE. UU. casi no etiqueta contratistas con craft=*, pero sí les pone nombre ("Green Thumb Lawn Care").
  // Buscar por nombre multiplica el rendimiento (antes: Raw 2 en Houston/lawn_care).
  const nameRegex = (() => {
    const t = cleanTrade;
    if (/lawn|landscap|garden|tree|mow|irrigat/.test(t)) return "lawn|landscap|mowing|turf|sod|tree service|tree care|irrigation|yard|garden|grounds";
    if (/hvac|heating|cooling|air/.test(t)) return "hvac|heating|cooling|air condition|a/c|climate|furnace|refrigeration";
    if (/plumb/.test(t)) return "plumb|drain|rooter|pipe|water heater|sewer";
    if (/electric/.test(t)) return "electric|wiring|lighting";
    if (/roof/.test(t)) return "roof|shingle|gutter";
    if (/clean|maid|janitor/.test(t)) return "clean|maid|janitorial|housekeeping|pressure wash|power wash";
    if (/pool/.test(t)) return "pool|spa |aquatic";
    if (/handyman|repair|appliance/.test(t)) return "handyman|repair|appliance|fix";
    if (/pest|exterminat/.test(t)) return "pest|exterminat|termite|bug|rodent";
    if (/paint/.test(t)) return "paint|coating";
    if (/garage/.test(t)) return "garage door|overhead door";
    if (/fenc/.test(t)) return "fence|fencing";
    if (/floor|carpet|tile/.test(t)) return "floor|carpet|tile|hardwood";
    if (/junk|haul|moving/.test(t)) return "junk|haul|moving|movers|removal";
    return "";
  })();
  const nameTags = nameRegex ? [`name~"${nameRegex}"`] : [];

  const allTags = Array.from(new Set([...specificTags, ...nameTags, ...genericTags]));

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
      out tags 150;
    ` : `
      [out:json][timeout:25];
      area["name"="${cityClean}"]->.searchArea;
      (
        ${tagQueries}
      );
      out tags 150;
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

          results.sort((a, b) =>
            ((b.website ? 2 : 0) + (b.email ? 2 : 0) + (b.phone ? 1 : 0)) - ((a.website ? 2 : 0) + (a.email ? 2 : 0) + (a.phone ? 1 : 0)));
          if (results.length > 60) results.length = 60;
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
  geoapify_status?: string;
  locationiq_status?: string;
  nominatim_poi_status?: string;
  photon_status?: string;
}

/**
 * Multi-Source Discovery Cascade (Nominatim + Overpass Mirrors + BizData Safe Filter)
 */
// ---------------------------------------------------------------------------
// Caché en D1 (reemplaza al KV "CACHE", que NUNCA estuvo enlazado en wrangler.toml, así que no funcionaba).
// D1 gratis: sin tarjeta y con ~100k escrituras/día, frente a las 1.000 escrituras/día de KV para toda la cuenta.
// La tabla se crea sola la primera vez.
// ---------------------------------------------------------------------------
let radarCacheReady = false;
async function ensureRadarCacheTable(db: D1Database): Promise<void> {
  if (radarCacheReady) return;
  await db.prepare("CREATE TABLE IF NOT EXISTS radar_cache (key TEXT PRIMARY KEY, value TEXT NOT NULL, expires_at INTEGER NOT NULL)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_radar_cache_exp ON radar_cache(expires_at)").run();
  radarCacheReady = true;
}
export async function cacheGet(env: Env, key: string): Promise<string | null> {
  try {
    await ensureRadarCacheTable(env.RADAR_DB);
    const row = await env.RADAR_DB.prepare("SELECT value FROM radar_cache WHERE key = ? AND expires_at > ?").bind(key, Date.now()).first() as any;
    return row?.value ?? null;
  } catch { return null; }
}
export async function cachePut(env: Env, key: string, value: string, ttlSeconds: number): Promise<void> {
  try {
    await ensureRadarCacheTable(env.RADAR_DB);
    await env.RADAR_DB.prepare("INSERT OR REPLACE INTO radar_cache (key, value, expires_at) VALUES (?, ?, ?)").bind(key, value, Date.now() + ttlSeconds * 1000).run();
  } catch { /* la caché nunca debe romper el flujo */ }
}
export async function pruneRadarCache(env: Env): Promise<void> {
  try {
    await ensureRadarCacheTable(env.RADAR_DB);
    await env.RADAR_DB.prepare("DELETE FROM radar_cache WHERE expires_at < ?").bind(Date.now()).run();
  } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Geoapify Places (opcional: solo si existe GEOAPIFY_API_KEY). OSM es escaso para contratistas de EE. UU.
// Se usan categorías PADRE (siempre válidas) y se filtra por nombre en el código para no traer ruido.
// ---------------------------------------------------------------------------
const GEOAPIFY_PROFILES: Array<{ match: RegExp; categories: string; name?: RegExp }> = [
  { match: /property|real estate|hoa|apartment|facility|condo/, categories: "office", name: /property|management|realty|real estate|apartment|hoa|association|condo|leasing|rental|residential|communit/i },
  { match: /hotel|vacation|rental|lodging|motel|resort/, categories: "accommodation" },
  { match: /restaurant|cafe|food|catering/, categories: "catering" },
  { match: /gym|fitness|aquatic|pool/, categories: "sport,leisure", name: /gym|fitness|crossfit|yoga|aquatic|swim|pool|athletic|health club/i },
  { match: /school|education/, categories: "education" },
  { match: /plumb/, categories: "service,office,commercial", name: /plumb|drain|rooter|pipe/i },
  { match: /hvac|heating|cooling|air/, categories: "service,office,commercial", name: /hvac|heating|cooling|air cond|a\/c|\bac\b|furnace/i },
  { match: /landscap|lawn|garden|tree|irrigat/, categories: "service,office,commercial", name: /landscap|lawn|garden|tree|mow|irrigat|turf|sod/i },
  { match: /roof/, categories: "service,office,commercial", name: /roof|shingle/i },
  { match: /electric/, categories: "service,office,commercial", name: /electric/i },
  { match: /paint/, categories: "service,office,commercial", name: /paint/i },
  { match: /pest|exterminat/, categories: "service,office,commercial", name: /pest|exterminat|termite|rodent/i },
  { match: /clean|maid|janitor/, categories: "service,office,commercial", name: /clean|maid|janitor|wash/i },
  { match: /floor|carpet|tile/, categories: "service,office,commercial", name: /floor|carpet|tile/i },
  { match: /fenc/, categories: "service,office,commercial", name: /fenc/i },
  { match: /concrete|paving|asphalt|mason/, categories: "service,office,commercial", name: /concrete|paving|asphalt|mason|cement/i },
  { match: /garage|door/, categories: "service,office,commercial", name: /garage|door/i },
  { match: /handyman|repair|appliance/, categories: "service,office,commercial", name: /handyman|repair|appliance|fix/i },
  { match: /moving|junk|haul/, categories: "service,office,commercial", name: /moving|mover|junk|haul|relocat/i },
  { match: /general contractor|construction|builder/, categories: "service,office,commercial", name: /construction|contractor|builder|remodel|build/i },
];

export async function fetchGeoapifyBusinesses(
  city: string,
  trade: string,
  geo: { bbox: number[] } | null,
  apiKey: string | undefined
): Promise<{ businesses: any[]; status: string }> {
  if (!apiKey || !apiKey.trim()) return { businesses: [], status: "skipped (no GEOAPIFY_API_KEY)" };
  if (!geo || !geo.bbox || geo.bbox.length < 4) return { businesses: [], status: "skipped (no bbox)" };
  const t = trade.toLowerCase();
  const profile = GEOAPIFY_PROFILES.find(p => p.match.test(t));
  if (!profile) return { businesses: [], status: "skipped (trade not mapped)" };
  try {
    const rect = `${geo.bbox[2]},${geo.bbox[0]},${geo.bbox[3]},${geo.bbox[1]}`; // lonMin,latMin,lonMax,latMax
    const url = `https://api.geoapify.com/v2/places?categories=${encodeURIComponent(profile.categories)}&filter=rect:${rect}&limit=100&apiKey=${encodeURIComponent(apiKey.trim())}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(14000) });
    if (!res.ok) return { businesses: [], status: `HTTP ${res.status} (skipped)` };
    const data: any = await res.json();
    const out: any[] = [];
    for (const f of (data?.features || [])) {
      const p = f?.properties || {};
      const name = String(p.name || "").trim();
      if (!name) continue;
      if (profile.name && !profile.name.test(name)) continue;
      const raw = p.datasource?.raw || {};
      out.push({
        name,
        city,
        trade,
        website: p.website || p.contact?.website || raw.website || raw["contact:website"] || null,
        phone: p.contact?.phone || p.phone || raw.phone || raw["contact:phone"] || null,
        email: p.contact?.email || p.email || raw.email || raw["contact:email"] || null,
        source: "geoapify"
      });
    }
    return { businesses: out, status: out.length ? `success (${out.length})` : "0 matches after name filter" };
  } catch (e: any) {
    return { businesses: [], status: `error: ${e.message} (skipped)` };
  }
}


/** LocationIQ free tier: search POIs by text (no card). https://locationiq.com */
async function fetchLocationIqBusinesses(
  city: string,
  trade: string,
  apiKey: string
): Promise<{ businesses: any[]; status: string }> {
  if (!apiKey || !apiKey.trim()) return { businesses: [], status: "skipped (no LOCATIONIQ_API_KEY)" };
  try {
    const q = `${trade} ${city}`.trim();
    const url =
      `https://us1.locationiq.com/v1/search?key=${encodeURIComponent(apiKey.trim())}` +
      `&q=${encodeURIComponent(q)}&format=json&addressdetails=1&limit=30&normalizecity=1`;
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "BveltRadar/1.0 (founder@bvelt.app)" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return { businesses: [], status: `HTTP ${res.status}` };
    const data: any = await res.json();
    const out: any[] = [];
    for (const row of Array.isArray(data) ? data : []) {
      const name = String(row.display_name || "").split(",")[0].trim();
      if (!name || name.length < 3) continue;
      const addr = row.address || {};
      out.push({
        name,
        city: addr.city || addr.town || addr.village || city,
        trade,
        website: null,
        phone: null,
        email: null,
        source: "locationiq",
        lat: row.lat ? Number(row.lat) : null,
        lon: row.lon ? Number(row.lon) : null,
      });
    }
    return { businesses: out, status: out.length ? `success (${out.length})` : "0 matches" };
  } catch (e: any) {
    return { businesses: [], status: `error: ${e?.message || e}` };
  }
}


/** Photon (Komoot) — free geocoder/search on OSM, no API key. https://photon.komoot.io */
async function fetchPhotonBusinesses(
  city: string,
  trade: string
): Promise<{ businesses: any[]; status: string }> {
  try {
    const q = `${trade} ${city}`.trim();
    const url =
      `https://photon.komoot.io/api/?lang=en&limit=40&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "BveltRadar/1.0 (https://bvelt.app; radar@bvelt.app)",
      },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return { businesses: [], status: `HTTP ${res.status}` };
    const data: any = await res.json();
    const out: any[] = [];
    const tradeL = trade.toLowerCase();
    for (const f of data?.features || []) {
      const props = f?.properties || {};
      const name = String(props.name || props.osm_value || "").trim();
      if (!name || name.length < 2) continue;
      const osmKey = String(props.osm_key || "");
      const osmVal = String(props.osm_value || "");
      // Prefer shop/craft/office/amenity over pure address
      if (osmKey === "place" || osmKey === "highway" || osmKey === "building") continue;
      const cityName = props.city || props.county || props.state || city;
      const website = props.website || props.url || null;
      const phone = props.phone || props["contact:phone"] || null;
      const email = props.email || props["contact:email"] || null;
      out.push({
        name,
        city: cityName,
        trade,
        website,
        phone,
        email,
        source: "photon",
        osm_key: osmKey,
        osm_value: osmVal,
      });
    }
    // light relevance: name or value mentions trade token
    const tokens = tradeL.split(/[_\s]+/).filter((x) => x.length > 3);
    const scored = out.sort((a, b) => {
      const score = (x: any) => {
        const blob = `${x.name} ${x.osm_value || ""}`.toLowerCase();
        return tokens.reduce((s, tok) => s + (blob.includes(tok) ? 2 : 0), 0) + (x.website ? 1 : 0) + (x.phone ? 1 : 0);
      };
      return score(b) - score(a);
    });
    return { businesses: scored.slice(0, 30), status: scored.length ? `success (${scored.length})` : "0 matches" };
  } catch (e: any) {
    return { businesses: [], status: `error: ${e?.message || e}` };
  }
}


/** Nominatim free POI search (1 req/s policy — use only as fallback). */
async function fetchNominatimPoiBusinesses(
  city: string,
  trade: string
): Promise<{ businesses: any[]; status: string }> {
  try {
    const q = `${trade} company ${city}`;
    const url =
      `https://nominatim.openstreetmap.org/search?format=json&limit=25&addressdetails=1` +
      `&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "BveltRadar/1.0 (https://bvelt.app; founder@bvelt.app)",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return { businesses: [], status: `HTTP ${res.status}` };
    const data: any = await res.json();
    const out: any[] = [];
    for (const row of Array.isArray(data) ? data : []) {
      const name = String(row.display_name || "").split(",")[0].trim();
      if (!name || name.length < 3) continue;
      const cls = `${row.class || ""} ${row.type || ""}`.toLowerCase();
      // skip pure address/place nodes without business-ish class when possible
      out.push({
        name,
        city,
        trade,
        website: null,
        phone: null,
        email: null,
        source: "nominatim_poi",
        osm_class: cls,
      });
    }
    return { businesses: out, status: out.length ? `success (${out.length})` : "0 matches" };
  } catch (e: any) {
    return { businesses: [], status: `error: ${e?.message || e}` };
  }
}

export async function fetchLocalBusinessesWithDiagnostics(
  city: string, 
  trade: string, 
  env: Env,
  customOsmTags?: string[],
  mode: 'founder' | 'tenant' = 'founder'
): Promise<{ businesses: any[]; diagnostics: DiscoveryDiagnostics }> {
  const tagScope = (customOsmTags || []).map(tag => String(tag).trim().toLowerCase()).filter(Boolean).sort().join("_").slice(0, 120);
  const cacheKey = `radar_cache_${mode}_${city.replace(/[^a-z0-9]/gi, "_")}_${trade}_${tagScope}_v4`.toLowerCase();
  
  if (env.RADAR_DB) {
    try {
      const cached = await cacheGet(env, cacheKey);
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
      console.warn("Cache read error: ", e);
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
      permitCandidates = permitContractors.map((p: any) => ({
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

  // Target pool size: founder needs contactable trades; tenant needs broader B2B surface
  const targetPool = mode === 'tenant' ? 40 : 28;

  // 2.5 Geoapify Places — free tier key; fill until target
  let geoapifyStatus = "skipped (no GEOAPIFY_API_KEY)";
  if (env.GEOAPIFY_API_KEY && rawBusinesses.length < targetPool) {
    const geoRes = await fetchGeoapifyBusinesses(city, trade, nominatimGeo, env.GEOAPIFY_API_KEY);
    geoapifyStatus = geoRes.status;
    // Founder: drop pure hotels/restaurants unless trade is hospitality-related
    const geoItems = (geoRes.businesses || []).filter((b: any) => {
      if (mode === 'tenant') return true;
      const n = String(b.name || '').toLowerCase();
      if (/\b(hotel|motel|resort|inn)\b/i.test(n) && !/plumb|hvac|electric|roof|landscap|clean|pest/i.test(trade)) return false;
      if (/\b(restaurant|cafe|bar|grill)\b/i.test(n) && !/clean|pest|hvac|plumb/i.test(trade)) return false;
      return true;
    });
    rawBusinesses.push(...geoItems);
  }

  // 2.6 LocationIQ free search (optional key, no credit card)
  let locationIqStatus = "skipped (no LOCATIONIQ_API_KEY)";
  if (env.LOCATIONIQ_API_KEY && rawBusinesses.length < targetPool) {
    const liq = await fetchLocationIqBusinesses(city, trade, String(env.LOCATIONIQ_API_KEY));
    locationIqStatus = liq.status;
    rawBusinesses.push(...liq.businesses);
  }

  // 2.7 Photon (Komoot) — NO KEY, OSM-based text search worldwide
  let photonStatus = "unattempted";
  if (rawBusinesses.length < targetPool) {
    const ph = await fetchPhotonBusinesses(city, trade);
    photonStatus = ph.status;
    rawBusinesses.push(...ph.businesses);
  }

  // 3. BizData — no key; still useful when OSM thin in US metros
  const bizDataExplicitlyOff = env.ENABLE_BIZDATA === "0" || env.ENABLE_BIZDATA === "false";
  if (rawBusinesses.length < Math.min(12, targetPool) && !bizDataExplicitlyOff) {
    const bizDataRes = await fetchBizDataBusinesses(city, trade);
    bizdataStatus = bizDataRes.status;
    rawBusinesses.push(...bizDataRes.businesses);
  } else {
    bizdataStatus = rawBusinesses.length >= 12
      ? `skipped (have ${rawBusinesses.length} results)`
      : "disabled (ENABLE_BIZDATA=0)";
  }

  // 3.5 Nominatim POI text search — last resort only (fair-use 1 req/s)
  let nominatimPoiStatus = "skipped";
  if (rawBusinesses.length < 6) {
    const nom = await fetchNominatimPoiBusinesses(city, trade);
    nominatimPoiStatus = nom.status;
    rawBusinesses.push(...nom.businesses);
  }

  // Deduplicate: permit candidates go first
  const allCandidates = [...permitCandidates, ...rawBusinesses];
  const seen = new Set<string>();
  const deduped: any[] = [];
  const EXTRA_SYNTACTIC_ICP_EXCLUSION = /\b(store|shop|market|pet|nails|hair|grocery|florist|boutique)\b/i;

  for (const item of allCandidates) {
    const rawName = String(item.name || "").trim();
    const candTrade = item.trade || trade;
    const coherence = checkTradeCoherence(rawName, candTrade, item.website);
    if (isOffIcpName(rawName) || EXTRA_SYNTACTIC_ICP_EXCLUSION.test(rawName) || !coherence.coherent || coherence.disqualified) {
      console.log(`[ICP Gate: Discarded] "${rawName}" matched off-ICP/coherence filter in discovery for ${city} - ${candTrade}`);
      continue;
    }
    const normName = rawName.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (normName && !seen.has(normName)) {
      seen.add(normName);
      if (coherence.verifiedTrade) {
        item.trade = coherence.verifiedTrade;
      }
      deduped.push(item);
    }
  }

  const discoveredRaw = allCandidates.length;
  const filtered = discoveredRaw - deduped.length;
  const reason = deduped.length > 0 
    ? `Discovered ${deduped.length} businesses for ${city} - ${trade} across discovery cascade`
    : `Zero businesses discovered for ${city} - ${trade}. Nominatim: ${nominatimStatus}, Overpass: ${overpassStatus}, Geoapify: ${geoapifyStatus}, BizData: ${bizdataStatus}`;

  const diagnostics: DiscoveryDiagnostics = {
    city,
    trade,
    nominatim_status: nominatimStatus,
    overpass_status: overpassStatus,
    bizdata_status: bizdataStatus,
    discovered_raw: discoveredRaw,
    filtered,
    reason,
    permits_found: permitsFound,
    geoapify_status: geoapifyStatus,
    locationiq_status: typeof locationIqStatus !== 'undefined' ? locationIqStatus : 'n/a',
    photon_status: typeof photonStatus !== 'undefined' ? photonStatus : 'n/a',
    nominatim_poi_status: typeof nominatimPoiStatus !== 'undefined' ? nominatimPoiStatus : 'n/a'
  };

  // Caché en D1: 24 h si hubo resultados; 30 min si salió vacío, con contador de vacíos consecutivos (cooldown de 7 días al llegar a 5)
  if (env.RADAR_DB) {
    const zeroKey = `radar_zero_streak_${city.replace(/[^a-z0-9]/gi, "_")}_${trade}_v3`.toLowerCase();
    if (deduped.length > 0) {
      await cachePut(env, zeroKey, "0", 86400 * 30);
      await cachePut(env, cacheKey, JSON.stringify(deduped), 86400);
    } else {
      let streak = 1;
      try {
        const prev = await cacheGet(env, zeroKey);
        streak = (parseInt(prev || "0", 10) || 0) + 1;
      } catch (e) {}
      await cachePut(env, zeroKey, String(streak), 86400 * 30);

      const ttl = streak >= 5 ? 7 * 86400 : 1800; // 7 días si streak >= 5, si no 30 min
      if (streak >= 5) {
        console.log(`[Discovery Zero-Cache] ${city} - ${trade} reached ${streak} consecutive zeroes. Applying 7-day cooldown.`);
      }
      await cachePut(env, cacheKey, JSON.stringify([]), ttl);
    }
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

/**
 * Short founder identity lines — NO pity, NO long bio.
 * Rotates by prospect id + outreach touch so emails don't repeat the same sentence.
 */
const FOUNDER_VOICE_EN: string[] = [
  "I'm Rainer — solo builder of Bvelt.",
  "I ship Bvelt myself end-to-end, so it stays lean for field crews.",
  "Built Bvelt as a one-person product focused on contractors, not enterprise bloat.",
  "I built Bvelt under tight bandwidth and power limits — that's why it stays fast on a phone.",
  "Solo founder here: every feature has to earn its place for real trade businesses.",
  "I'm Rainer. I built Bvelt from a constrained setup so it still works when the connection is messy.",
  "One-person shop behind Bvelt — designed for crews who live on their phones.",
  "I built Bvelt the hard way so the tool itself stays simple and reliable.",
];

const FOUNDER_VOICE_ES: string[] = [
  "Soy Rainer, el constructor en solitario de Bvelt.",
  "Desarrollo Bvelt de punta a punta para que siga siendo ligero para cuadrillas en campo.",
  "Creé Bvelt como producto de una sola persona, enfocado en contratistas, no en enterprise.",
  "Construí Bvelt con poco ancho de banda y cortes de luz — por eso funciona rápido en el móvil.",
  "Fundador único: cada función tiene que valer la pena para negocios de oficio reales.",
  "Soy Rainer. Hice Bvelt en un entorno limitado para que siga útil con mala conexión.",
  "Bvelt lo lleva una sola persona — pensado para quien trabaja desde el teléfono.",
  "Construí Bvelt a la manera difícil para que la herramienta sea simple y fiable.",
];

function hashPick(seed: string, n: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  return Math.abs(h) % Math.max(1, n);
}

/** touch: 1 = first email, 2+ = follow-up without reply */
export function pickFounderVoiceLine(prospectId: string, touch: number, lang: string): string {
  const list = (lang || "en").toLowerCase().startsWith("es") ? FOUNDER_VOICE_ES : FOUNDER_VOICE_EN;
  const idx = hashPick(`${prospectId || "x"}|t${touch || 1}`, list.length);
  return list[idx];
}

function getOutreachTouch(prospect: any): number {
  try {
    const s = typeof prospect.signals_json === "string" ? JSON.parse(prospect.signals_json || "{}") : (prospect.signals_json || {});
    const t = Number(s.outreach_touch || 1);
    return Number.isFinite(t) && t >= 1 ? t : 1;
  } catch {
    return 1;
  }
}

async function bumpOutreachTouch(db: D1Database, prospect: any, nextTouch: number): Promise<void> {
  try {
    let s: any = {};
    try { s = JSON.parse(prospect.signals_json || "{}"); } catch { s = {}; }
    s.outreach_touch = nextTouch;
    s.last_outreach_touch_at = new Date().toISOString();
    await db.prepare("UPDATE prospects SET signals_json = ?, updated_at = ? WHERE id = ?")
      .bind(JSON.stringify(s), new Date().toISOString(), prospect.id).run();
  } catch (e) {
    console.warn("[bumpOutreachTouch]", e);
  }
}


async function generateAICopy(
  prospect: any, 
  variantId: string, 
  env: Env,
  missionConfig?: MissionConfig
): Promise<{ subject: string; body: string }> {
  const language = (missionConfig?.languages && missionConfig.languages[0]) || "en";
  const isSpanish = language.toLowerCase().startsWith("es");
  const outreachTouch = getOutreachTouch(prospect);
  const founderLine = (!prospect.tenant_id || prospect.tenant_id === "founder" || prospect.mode === "founder")
    ? pickFounderVoiceLine(String(prospect.id || prospect.name || "x"), outreachTouch, language)
    : "";
  const isFollowUp = outreachTouch >= 2;
  const demoLink = "https://bvelt.app/";

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
    // Founder mode: High-converting Technical Audit Hook (mobile load speed + missed calls leak + SMS text-back)
    let signals: any = {};
    try {
      signals = typeof prospect.signals_json === "string" ? JSON.parse(prospect.signals_json || "{}") : (prospect.signals_json || prospect.signals || {});
    } catch { signals = {}; }

    const techAudit = signals.technical_audits || {};
    const fcpSeconds = techAudit.fcp_seconds || (prospect.pagespeed_score ? (prospect.pagespeed_score < 50 ? 3.8 : 2.1) : null);
    const latencyStr = fcpSeconds ? `${fcpSeconds}s` : "más de 3 segundos";
    const latencyStrEn = fcpSeconds ? `${fcpSeconds}s` : "over 3 seconds";

    if (isSpanish) {
      angleFocus = `GANCHO PRINCIPAL: AUDITORÍA TÉCNICA GRATUITA (Llamadas perdidas y velocidad web móvil).
      - Hallazgo técnico: La carga de su web en móviles toma ${latencyStr} y cuando los operarios están en obra o conduciendo, las llamadas entrantes van al buzón de voz sin un SMS de respuesta en menos de 60 segundos.
      - Dolor de negocio: En ${prospect.city}, el 80% de propietarios que llaman por ${prospect.trade || 'servicios de contratista'} y dan con un buzón de voz cuelgan y llaman al siguiente contratista en Google.
      - Solución: Bvelt añade respuesta instantánea por SMS en menos de 60 segundos ante llamadas perdidas y reactiva presupuestos pendientes.
      - Demo interactiva: Invita respetuosamente a ver la demo interactiva de 60 segundos (${demoLink}) para ver cómo recupera clientes automáticamente.`;
    } else {
      angleFocus = `PRIMARY HOOK: FREE TECHNICAL AUDIT (Missed Calls & Mobile Web Speed).
      - Technical finding: Mobile site load takes ~${latencyStrEn} and when crews are busy on-site or driving, incoming phone calls hit voicemail with no instant 60-second SMS text-back.
      - Business pain: In ${prospect.city}, homeowners calling for ${prospect.trade || 'contractor work'} who hit voicemail hang up and tap the next contractor on Google.
      - Solution: Bvelt adds instant SMS text-back in under 60 seconds to lock in missed calls and reactivate old estimates.
      - Interactive Demo: Soft invite to check out the 60-second interactive preview (${demoLink}) to see how it recovers jobs automatically.`;
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
    6. SIN FIRMA NI PIE DE PÁGINA (el sistema añade el legal).
    7. ${!tenantInfo && founderLine ? `FRASE FUNDADOR (úsala una vez, natural, no inventes otra biografía): "${founderLine}"` : "No inventes historia personal del fundador."}
    8. ${isFollowUp ? "Esto es SEGUIMIENTO toque #" + outreachTouch + " sin respuesta. Más corto, otro ángulo, sin culpar. Asunto sin Re: falso." : "Primer correo en frío."}
    9. Formato JSON: {"subject": "...", "body": "..."}
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
    1. Length: ${isFollowUp ? "55 to 80" : "85 to 105"} words. Contractor-friendly and punchy.
    2. Tone: Respectful, direct, guerrilla entrepreneur mindset. Never beg. Never play for pity.
    3. Exactly ONE sentence on tech value: "${tenantInfo ? `We use Bvelt to ensure you never miss an opportunity with us due to response lag.` : "Bvelt automatically re-engages missed leads and recovers lost jobs for contractors via fast, automated SMS."}"
    4. Soft Call-to-Action: "If you'd like to see how it works in 2 minutes → ${demoLink}".
    5. NO SIGNATURE OR FOOTER (system adds legal footer).
    6. ${!tenantInfo && founderLine ? `FOUNDER LINE (use once, natural English, do not invent a different bio): "${founderLine}"` : "Do not invent a personal founder story."}
    7. ${isFollowUp ? "This is FOLLOW-UP touch #" + outreachTouch + " after no reply. Different angle from a first cold email. Shorter. Do not guilt-trip. Subject must NOT start with Re: unless truly a thread. Mention you are checking in once, then offer the demo link again." : "This is the FIRST outreach email."}
    8. JSON format: {"subject": "...", "body": "..."}
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

    // 2. GROQ FALLBACK — free-tier safe (llama-3.3 decommissioned on free)
    if (env.GROQ_API_KEY) {
      const groqModels = ["openai/gpt-oss-20b", "openai/gpt-oss-120b"];
      for (const groqModel of groqModels) {
        console.log(`[Gemini Cascade] Calling Groq backup model: ${groqModel}`);
        try {
          const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${env.GROQ_API_KEY}`
            },
            body: JSON.stringify({
              model: groqModel,
              response_format: { type: "json_object" },
              messages: [{ role: "user", content: prompt }],
              temperature: 0.6
            }),
            signal: AbortSignal.timeout(5500)
          });
          if (response.ok) {
            const data: any = await response.json();
            const raw = data.choices?.[0]?.message?.content;
            if (raw) {
              const content = typeof raw === "string" ? JSON.parse(raw) : raw;
              if (content.subject && content.body) {
                console.log(`[Gemini Cascade] Success using Groq ${groqModel}`);
                await commitBudget(env.RADAR_DB, tenantId, 'ai_units', 1);
                return { subject: content.subject, body: content.body };
              }
            }
          } else {
            const errTxt = await response.text().catch(() => "");
            console.warn(`[Gemini Cascade] Groq ${groqModel} status ${response.status}: ${errTxt.slice(0, 180)}`);
            if (response.status === 404 || response.status === 400) continue;
          }
        } catch (e: any) {
          console.warn(`[Gemini Cascade] Groq ${groqModel} failed:`, e.message);
        }
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
  return getTradePsychologyFallback(prospect.name, prospect.trade, prospect.city, bveltAngle, language, prospect.phone, prospect.demo_token, prospect.signal_event, prospect.signal_area, env, prospect.signals_json || prospect.signals);
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
  const isTenantLead = p.mode === 'tenant' || (p.tenant_id && p.tenant_id !== 'founder');
  const phone = p.phone ? String(p.phone) : null;

  // 1. Off-ICP and Trade Coherence Hard Gate (Barbers, Salons, etc. CANNOT get SMS)
  const coherence = checkTradeCoherence(
    name,
    String(p.trade || ''),
    p.website,
    typeof p.signals_json === 'string' ? p.signals_json : JSON.stringify(p.signals_json || {}),
    isTenantLead ? 'tenant' : 'founder'
  );

  if (coherence.disqualified || !coherence.coherent || !coherence.verifiedTrade) {
    return {
      prospect_id: String(p.id || ""),
      name,
      why_this_lead: `DO NOT CONTACT: ${coherence.reason || 'Off ICP or trade mismatch'}`,
      email: { subject: "", body: "" },
      sms: "",
      call_script: "- DO NOT CONTACT: Business is off-ICP or trade label conflicts with company name.",
      next_action: "DO_NOT_CONTACT — off ICP or trade mismatch",
      angle: "disqualified_off_icp"
    };
  }

  const tradeKey = coherence.verifiedTrade;
  // Human-readable verified trade label
  const tradeLabels: Record<string, string> = {
    lawn_care: "lawn care",
    landscaping: "landscaping",
    plumbing: "plumbing",
    hvac: "HVAC",
    roofing: "roofing",
    electrical: "electrical",
    painting: "painting",
    pool: "pool service",
    pest_control: "pest control",
    cleaning: "cleaning",
    garage_door: "garage door",
    handyman: "handyman & remodeling",
    construction: "general contracting",
    remodeling: "remodeling"
  };
  const tradeLabel = tradeLabels[tradeKey] || tradeKey.replace(/_/g, " ");

  // 2. TENANT MODE: Pitch tenant's services to local property managers / commercial buyers (NO Bvelt SaaS pitch)
  if (isTenantLead) {
    const whyTenant = `${name} en ${city} (${tradeLabel}): comprador B2B potencial para tus servicios con necesidades de mantenimiento o gestión en ${city}.`;
    const subjectTenant = `Disponibilidad de servicio de ${tradeLabel} para ${name} en ${city}`;
    const emailBodyTenant = `Hola equipo de ${name},\n\nNos ponemos en contacto porque gestionan propiedades en ${city} y sabemos lo crítico que es contar con especialistas en ${tradeLabel} de respuesta rápida cuando surge una avería o necesidad de mantenimiento.\n\nContamos con técnicos locales disponibles y tiempos de atención inmediata para instalaciones comerciales y residenciales.\n\n¿Tienen un momento esta semana para una llamada breve y ver si podemos colaborar?\n\nSaludos cordiales,\nEquipo de servicio local`;
    const smsTenant = `Hola ${name}, ofrecemos servicio rápido de ${tradeLabel} en ${city} para propiedades comerciales y residenciales. ¿Tienen necesidades de mantenimiento activas?`;
    const callTenant = `- Contexto: Presentar servicio local de ${tradeLabel} en ${city}.\n- Pregunta: "¿Tienen incidencias abiertas o retrasos con contratistas actuales en sus propiedades?"\n- Propuesta: Ofrecer respuesta local garantizada y presupuestos en el día.\n- Cierre: Pedir contacto del responsable de mantenimiento para coordinar tarifas.`;
    const nextTenant = phone ? "Llamar directo o contactar por WhatsApp (cliente B2B local)." : p.email ? "Enviar propuesta B2B por email." : "Buscar teléfono y llamar.";

    return {
      prospect_id: String(p.id || ""),
      name,
      why_this_lead: whyTenant,
      email: { subject: subjectTenant, body: emailBodyTenant },
      sms: smsTenant,
      call_script: callTenant,
      next_action: nextTenant,
      angle: "tenant_b2b_service"
    };
  }

  // 3. FOUNDER MODE: Selling Bvelt to US home-service contractors
  let signals: any = {};
  try {
    signals = typeof p.signals_json === "string" ? JSON.parse(p.signals_json || "{}") : (p.signals_json || p.signals || {});
  } catch { signals = {}; }

  const angleHint = String(p.bvelt_angle || p.angle || "").toLowerCase();

  // Evidence check for angle selection (never invent facts; phone alone != missed calls)
  const hasWeatherSignal = Boolean(p.signal_event || signals.weather_alert || signals.emergency_weather || signals.storm_surge);
  const hasQuoteSignal = Boolean(signals.quote_request || signals.estimate_form || signals.stale_estimates || signals.quote_followup_gap);
  const hasSmsGapSignal = Boolean(signals.phone_only || signals.no_sms || signals.sms_gap || signals.landline_only || signals.no_texting);
  const hasMissedCallsSignal = Boolean(
    signals.missed_call_evidence ||
    signals.after_hours_voicemail ||
    signals.call_answering_friction ||
    signals.unanswered_call ||
    signals.voicemail_only ||
    (angleHint === "missed_calls" && (signals.missed_call_verified || signals.unanswered_call))
  );

  let selectedAngle: 'weather_surge' | 'stale_quotes' | 'no_sms' | 'missed_calls' | null = null;
  if (hasWeatherSignal) {
    selectedAngle = 'weather_surge';
  } else if (hasQuoteSignal) {
    selectedAngle = 'stale_quotes';
  } else if (hasSmsGapSignal) {
    selectedAngle = 'no_sms';
  } else if (hasMissedCallsSignal) {
    selectedAngle = 'missed_calls';
  }

  if (!selectedAngle) {
    return {
      prospect_id: String(p.id || ""),
      name,
      why_this_lead: `DO NOT CONTACT: no verified friction or observable evidence for outreach angle`,
      email: { subject: "", body: "" },
      sms: "",
      call_script: "- DO NOT CONTACT: No verified friction or observable evidence for outreach angle.",
      next_action: "DO_NOT_CONTACT — no evidence for angle",
      angle: "no_evidence"
    };
  }

  const demoUrl = "https://bvelt.app/";
  const senderSignature = "Rainer — Bvelt";
  const firstName = name.split(/\s+/)[0] || name;
  const variantIndex = hashCode(String(p.id || name + city)) % 3;

  const reasons: string[] = [];
  if (selectedAngle === 'weather_surge') reasons.push(`señal climática/demanda: ${p.signal_event || 'alerta meteorológica'}`);
  else if (selectedAngle === 'stale_quotes') reasons.push("solicitud de presupuestos/estimaciones sin seguimiento");
  else if (selectedAngle === 'no_sms') reasons.push("sin canal SMS/respuesta por texto");
  else reasons.push(`contratista activo de ${tradeLabel} en ${city} con llamadas entrantes no atendidas`);

  const why = `${name} en ${city} (${tradeLabel}): ${reasons.join("; ")}.`;

  let subject = "";
  let emailBody = "";
  let sms = "";
  let call_script = "";

  if (selectedAngle === 'missed_calls') {
    subject = `${name} — missed ${tradeLabel} calls in ${city}`;

    if (variantIndex === 0) {
      sms = `Hi ${firstName} — quick note from Rainer at Bvelt. When ${tradeLabel} calls in ${city} hit voicemail, a lot of homeowners call the next shop. We text them in under a minute so the job doesn't walk. 60-sec demo for ${name}: ${demoUrl} — want it or should I stop? — ${senderSignature}`;
    } else if (variantIndex === 1) {
      sms = `Hi ${firstName} — Rainer here with Bvelt. When your crew is out on a job in ${city} and the phone rings, most callers won't leave a voicemail. Bvelt sends an instant text back so you catch the job. See how it works: ${demoUrl} — worth a glance? — ${senderSignature}`;
    } else {
      sms = `Hi ${firstName} — Rainer from Bvelt. When homeowners call for ${tradeLabel} in ${city} after hours, whoever replies by text first gets the job. We send that automated text response instantly. See how it works: ${demoUrl} — should I send more info or pass? — ${senderSignature}`;
    }

    emailBody = `Hi ${name} team — saw your ${tradeLabel} service in ${city}.\n\nWhen your crew is out on a job or it's after hours, missed calls usually go straight to voicemail. In ${city}, homeowners rarely leave a message — they just call the next contractor on Google.\n\nWe built Bvelt to send an instant text back in under a minute so those calls stay on your calendar instead of walking away.\n\nA quick look at how it works: ${demoUrl}\n\nWould you be open to taking a look, or should I stop reaching out?\n\nBest,\n${senderSignature}`;

    call_script = `- Operator Context: Verified ${tradeLabel} contractor in ${city}.\n- Opening Question: "When your crew is on a job and the phone rings, who catches the call?"\n- Key Point: Homeowners in ${city} call down Google listings and hire whoever texts back first.\n- Next Step: Offer to text over the demo link (${demoUrl}).`;

  } else if (selectedAngle === 'no_sms') {
    subject = `${name} — texting option for ${tradeLabel} in ${city}`;

    if (variantIndex === 0) {
      sms = `Hi ${firstName} — quick note from Rainer at Bvelt. Saw your ${tradeLabel} shop in ${city}. Most homeowners text for estimates now and walk away if there's no SMS option. We add instant text response for missed calls. Demo: ${demoUrl} — interested? — ${senderSignature}`;
    } else if (variantIndex === 1) {
      sms = `Hi ${firstName} — Rainer with Bvelt. If a homeowner in ${city} tries to text your ${tradeLabel} line and gets no reply, that lead goes cold. Bvelt replies by SMS in under a minute automatically. See how it works: ${demoUrl} — worth a look? — ${senderSignature}`;
    } else {
      sms = `Hi ${firstName} — Rainer at Bvelt. A lot of ${tradeLabel} clients in ${city} prefer texting over calling. Bvelt turns missed phone calls into instant text conversations. 60-sec demo for ${name}: ${demoUrl} — want to check it out? — ${senderSignature}`;
    }

    emailBody = `Hi ${name} team — saw your ${tradeLabel} shop in ${city}.\n\nA lot of homeowners in ${city} prefer to text for estimates before calling. If the only option is a phone call or voicemail, those jobs quietly slip away.\n\nWe built Bvelt to add instant automated texting for missed calls and web inquiries so you catch those homeowners immediately.\n\nA quick look at how it works: ${demoUrl}\n\nWould you be open to taking a look?\n\nBest,\n${senderSignature}`;

    call_script = `- Operator Context: ${tradeLabel} contractor in ${city} without instant texting.\n- Opening Question: "Do homeowners ever ask to text photos of the job, or is it phone-only?"\n- Key Point: Homeowners prefer quick text responses over leaving voicemails.\n- Next Step: Offer to text over the demo link (${demoUrl}).`;

  } else if (selectedAngle === 'stale_quotes') {
    subject = `${name} — following up on ${tradeLabel} quotes in ${city}`;

    if (variantIndex === 0) {
      sms = `Hi ${firstName} — quick note from Rainer at Bvelt. Unanswered ${tradeLabel} estimates in ${city} are a quiet revenue leak. Bvelt automatically nudges past quotes so jobs don't go cold. See how it works: ${demoUrl} — open to a quick look? — ${senderSignature}`;
    } else if (variantIndex === 1) {
      sms = `Hi ${firstName} — Rainer here from Bvelt. Most ${tradeLabel} contractors in ${city} don't have time to follow up bids from last week. Bvelt sends automated text check-ins that bring buyers back. See how it works: ${demoUrl} — want a look? — ${senderSignature}`;
    } else {
      sms = `Hi ${firstName} — Rainer at Bvelt. Following up on past ${tradeLabel} bids in ${city} takes hours when done by hand. Bvelt sequences text follow-ups automatically so you win more jobs. See Bvelt: ${demoUrl} — should I send details or stop? — ${senderSignature}`;
    }

    emailBody = `Hi ${name} team — saw your ${tradeLabel} business in ${city}.\n\nFollowing up on estimates that sit unanswered is where most contractors in ${city} leave money on the table. Most homeowners get busy and just need a quick text check-in.\n\nWe built Bvelt to automatically send friendly text follow-ups on past quotes so bids don't go cold.\n\nA quick look at how it works: ${demoUrl}\n\nWould you be open to taking a look?\n\nBest,\n${senderSignature}`;

    call_script = `- Operator Context: ${tradeLabel} contractor in ${city} sending out bids and estimates.\n- Opening Question: "How do you follow up on estimates that don't close right away?"\n- Key Point: Unanswered bids go cold unless sequenced with friendly SMS check-ins.\n- Next Step: Offer to text over the demo link (${demoUrl}).`;

  } else {
    // weather_surge
    subject = `${name} — handling ${tradeLabel} call spikes in ${city}`;

    if (variantIndex === 0) {
      sms = `Hi ${firstName} — quick note from Rainer at Bvelt. With recent severe weather in ${city}, ${tradeLabel} call volume spikes fast. Bvelt texts back missed emergency calls instantly so jobs don't slip away. See how it works: ${demoUrl} — open to a look? — ${senderSignature}`;
    } else if (variantIndex === 1) {
      sms = `Hi ${firstName} — Rainer with Bvelt. Heavy weather in ${city} means phones ring non-stop for ${tradeLabel} work. Bvelt catches missed calls with automated text replies so your crew stays booked. See how it works: ${demoUrl} — worth a glance? — ${senderSignature}`;
    } else {
      sms = `Hi ${firstName} — Rainer from Bvelt. When storm weather hits ${city}, homeowners call multiple ${tradeLabel} companies at once. Bvelt texts back in under 60 seconds to lock in the job. See Bvelt: ${demoUrl} — should I share details? — ${senderSignature}`;
    }

    emailBody = `Hi ${name} team — with the recent weather event in ${city}, call volume for ${tradeLabel} spikes fast.\n\nWhen phones ring non-stop, missed calls go to competitors who answer first.\n\nWe built Bvelt to send instant text replies to missed calls so your crew locks in emergency jobs automatically.\n\nA quick look at how it works: ${demoUrl}\n\nWould you be open to taking a look?\n\nBest,\n${senderSignature}`;

    call_script = `- Operator Context: ${tradeLabel} contractor in ${city} facing weather call surges.\n- Opening Question: "How are you handling the extra call volume after the storm?"\n- Key Point: Instant automated text replies lock in emergency callers before competitors do.\n- Next Step: Offer to text over the demo link (${demoUrl}).`;
  }

  // Enforce max ~300 chars on SMS
  if (sms.length > 310) {
    sms = sms.slice(0, 307) + "...";
  }

  const next =
    phone && !p.email ? "Llamar o contactar por WhatsApp primero (solo teléfono)." :
    p.email ? "Enviar correo + registrar decisión Enviar." :
    "Buscar contacto y luego kit SMS/llamada.";

  return {
    prospect_id: String(p.id || ""),
    name,
    why_this_lead: why,
    email: { subject, body: emailBody },
    sms,
    call_script,
    next_action: next,
    angle: selectedAngle
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
  env?: Env,
  signalsInput?: any
): { subject: string; body: string } {
  const cTrade = String(trade || 'service').replace(/_/g, ' ');
  const isSpanish = language.toLowerCase().startsWith("es");
  const ctaLink = "https://bvelt.app/";

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

  let signals: any = {};
  try {
    signals = typeof signalsInput === "string" ? JSON.parse(signalsInput) : (signalsInput || {});
  } catch { signals = {}; }

  if (signals.no_own_website) {
    const subject = isSpanish
      ? `${name} en ${city}: sin web propia, las llamadas se pierden`
      : `${name} in ${city}: no website of your own — calls go dark`;
    const bodyBase = isSpanish
      ? `Hola equipo de ${name},\n\nVi que ${name} opera ${cTrade} en ${city} sin un sitio web propio (o solo con redes). Cuando un cliente llama y nadie contesta, no hay forma de capturar ese lead por SMS o formulario.\n\nCreé Bvelt para eso: responde automáticamente por SMS a llamadas perdidas en menos de 60 segundos y reactiva presupuestos antiguos.\n\nDemo corta: ${ctaLink}\n\n¿Tiene sentido echarle un vistazo?`
      : `Hi ${name} team,\n\nI noticed ${name} runs ${cTrade} in ${city} without a real website of your own (or only social links). When a homeowner calls and nobody picks up, there is no SMS or form to catch that job.\n\nI built Bvelt for exactly that: automatic SMS on missed calls in under 60 seconds, plus follow-up on old estimates.\n\nShort demo: ${ctaLink}\n\nWorth a look?`;
    const footer = env ? buildLegalFooter(env) : "";
    const fullBody = footer ? `${bodyBase}\n\n${footer}` : bodyBase;
    return { subject, body: fullBody };
  }

  const techAudit = signals.technical_audits || {};
  const fcpSeconds = techAudit.fcp_seconds || (techAudit.is_slow_mobile ? 3.6 : null);
  const latencyStr = fcpSeconds ? `${fcpSeconds}s` : "más de 3 segundos";
  const latencyStrEn = fcpSeconds ? `${fcpSeconds}s` : "over 3 seconds";

  if (isSpanish) {
    const subject = fcpSeconds 
      ? `Auditoría técnica para ${name}: llamadas perdidas y velocidad web (${latencyStr}) en ${city}`
      : `Auditoría técnica para ${name}: llamadas perdidas y respuesta móvil en ${city}`;

    const body = `Hola equipo de ${name},

Hice una revisión técnica rápida de su presencia online en ${city} y noté dos detalles clave:
1. La carga de su sitio en celulares toma ${latencyStr}, lo que hace que clientes con urgencias cuelguen antes de ver su número.
2. Si un cliente llama mientras sus técnicos están en una obra o conduciendo, la llamada va al buzón de voz sin un SMS de respuesta inmediata.

En trabajos de ${cTrade}, la gran mayoría de propietarios que van al buzón cuelgan y llaman al siguiente contratista en Google.

Creé Bvelt para solucionar esto: envía un SMS automático en menos de 60 segundos ante llamadas no atendidas y reactiva presupuestos pendientes.

Les preparé una demo interactiva de 60 segundos para ${name} aquí:
👉 ${ctaLink}

¿Vale la pena echarle un vistazo de 1 minuto?`;

    return { subject, body };
  }

  const subject = fcpSeconds
    ? `Technical audit for ${name}: missed calls & mobile speed (${latencyStrEn}) in ${city}`
    : `Technical audit for ${name}: missed call recovery in ${city}`;

  const body = `Hi ${name} team,

I ran a quick technical check on your site in ${city}. Two things stood out:
1. Mobile visitors wait around ${latencyStrEn} for pages to load on a cell phone.
2. If a customer calls while your crews are on-site or driving, the call goes to voicemail with no instant text-back.

In ${cTrade}, most homeowners who hit voicemail simply tap the next contractor on Google.

I built Bvelt, an automated tool that instantly texts back missed calls in under 60 seconds and follows up on old estimates so you don't leak jobs.

I set up an interactive 60-second preview for ${name} here:
👉 ${ctaLink}

Worth a quick look, or should I leave you alone?`;

  return { subject, body };
}

export function buildLegalFooter(env: Env): string {
  const senderName = env.SENDER_NAME || "Founder";
  const senderAddress = env.SENDER_POSTAL_ADDRESS || "";
  return `--\n${senderName}, founder of Bvelt\n${senderAddress}\nThis is a commercial message. If you'd rather not hear from me, reply "unsubscribe" and I'll remove you right away.`;
}

/**
 * Centralized Outbound Telegram Notification Engine
 */
/**
 * Avisa a Telegram como máximo UNA vez por día por motivo (evita spam cuando el mismo bloqueo se repite).
 * Antes, cuando el envío se bloqueaba (breaker, falta de dirección postal, sin proveedor de email, presupuesto...)
 * el prospecto pasaba a "hold" en D1 SIN avisar, y desde Telegram el radar parecía muerto.
 */
export async function notifyOnce(env: Env, reasonKey: string, text: string): Promise<void> {
  try {
    const day = new Date().toISOString().split("T")[0];
    const key = `radar_notify_once_${day}_${String(reasonKey).toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 60)}`;
    if (env.RADAR_DB) {
      const seen = await cacheGet(env, key);
      if (seen) return;
      await cachePut(env, key, "1", 86400);
    }
    await notifyFounder(env, text);
  } catch (e) {
    console.warn("[notifyOnce] failed:", e);
  }
}

type RadarDigest = {
  verdict: "ok" | "idle" | "blocked";
  headline: string;
  text: string;
  data: Record<string, any>;
};

/**
 * Resumen de salud del radar (últimas 24 h) leído de D1 + configuración.
 * Responde a "¿está vivo o no?" y, si no produce, EN QUÉ ETAPA se corta el embudo.
 */
export async function collectRadarDigest(env: Env): Promise<RadarDigest> {
  const db = env.RADAR_DB;
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const day = new Date().toISOString().split("T")[0];
  const q = async <T = any>(sql: string, ...binds: any[]): Promise<T | null> => {
    try { return (await db.prepare(sql).bind(...binds).first()) as T; } catch { return null; }
  };
  const qAll = async (sql: string, ...binds: any[]): Promise<any[]> => {
    try { return ((await db.prepare(sql).bind(...binds).all()).results || []) as any[]; } catch { return []; }
  };

  const runsRow = await q<any>("SELECT COUNT(*) AS runs, COALESCE(SUM(discovered),0) AS discovered FROM runs WHERE mode = 'founder' AND created_at >= ?", since);
  const discJobs = await q<any>("SELECT COUNT(*) AS c FROM queue_jobs WHERE job_type = 'discovery' AND created_at >= ?", since);
  const zeroJobs = await q<any>("SELECT COUNT(*) AS c FROM queue_jobs WHERE status = 'completed_zero_prospects' AND created_at >= ?", since);
  const failedJobs = await q<any>("SELECT COUNT(*) AS c FROM queue_jobs WHERE status = 'failed' AND created_at >= ?", since);
  const lastFail = await q<any>("SELECT error FROM queue_jobs WHERE status = 'failed' AND error IS NOT NULL AND created_at >= ? ORDER BY created_at DESC LIMIT 1", since);
  const zeroRows = await qAll("SELECT error FROM queue_jobs WHERE status = 'completed_zero_prospects' AND error IS NOT NULL AND created_at >= ? LIMIT 40", since);
  const zeroReasonCounts = new Map<string, number>();
  for (const zr of zeroRows) {
    const txt = String(zr.error || "");
    const ov = (txt.match(/Overpass:\s*([^,]+?)(?:,|$)/) || [])[1] || "";
    const geo = (txt.match(/Geoapify:\s*([^,]+?)(?:,|$)/) || [])[1] || "";
    const norm = (x: string) => x.replace(/\(([^)]*)\)/g, "").replace(/\d+/g, "N").replace(/\s+/g, " ").trim().slice(0, 45);
    const k = `Overpass: ${norm(ov) || "?"} · Geoapify: ${norm(geo) || "?"}`;
    zeroReasonCounts.set(k, (zeroReasonCounts.get(k) || 0) + 1);
  }
  const zeroReasonTop = Array.from(zeroReasonCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const created = await q<any>("SELECT COUNT(*) AS c FROM prospects WHERE COALESCE(tenant_id,'founder') = 'founder' AND created_at >= ?", since);
  const withEmail = await q<any>("SELECT COUNT(*) AS c FROM prospects WHERE COALESCE(tenant_id,'founder') = 'founder' AND created_at >= ? AND email IS NOT NULL AND email != ''", since);
  const sent = await q<any>("SELECT COUNT(*) AS c FROM prospects WHERE COALESCE(tenant_id,'founder') = 'founder' AND status IN ('sent','scheduled') AND updated_at >= ?", since);
  const waiting = await q<any>("SELECT COUNT(*) AS c FROM prospects WHERE COALESCE(tenant_id,'founder') = 'founder' AND status IN ('queued','notified')");
  const blockedRows = await qAll(
    `SELECT COALESCE(outcome,'sin_motivo') AS outcome, COUNT(*) AS c FROM prospects
     WHERE COALESCE(tenant_id,'founder') = 'founder' AND updated_at >= ?
       AND status IN ('hold','held','disqualified','provider_required','provider_error','provider_unknown','blocked')
     GROUP BY outcome ORDER BY c DESC LIMIT 5`, since);
  const gov = await q<any>("SELECT sends_today, status FROM sender_governor_state WHERE id = 'global_governor'");
  const cb = await getCircuitBreakerStatus(db);
  const remDisc = await getRemainingBudget(db, "founder", "discovery_units");
  const remOut = await getRemainingBudget(db, "founder", "outreach_units");

  const runs = Number(runsRow?.runs || 0);
  const nJobs = Number(discJobs?.c || 0);
  const nZero = Number(zeroJobs?.c || 0);
  const nFailed = Number(failedJobs?.c || 0);
  const nCreated = Number(created?.c || 0);
  const nEmail = Number(withEmail?.c || 0);
  const nSent = Number(sent?.c || 0);
  const nWaiting = Number(waiting?.c || 0);

  const has = (v?: string) => !!(v && String(v).trim());
  const hasProvider = has(env.RESEND_API_KEY) || has(env.BREVO_API_KEY) || (has(env.HUNTER_API_KEY) && has(env.HUNTER_SEQUENCE_ID));
  const paused = env.RADAR_GLOBAL_PAUSE === "true" || env.RADAR_GLOBAL_PAUSE === "1";
  const outPaused = env.RADAR_OUTREACH_PAUSE === "true" || env.RADAR_OUTREACH_PAUSE === "1";
  const autoFlag = String(env.FOUNDER_AUTO_OUTREACH !== undefined && env.FOUNDER_AUTO_OUTREACH !== "" ? env.FOUNDER_AUTO_OUTREACH : "true").toLowerCase();
  const autoOn = autoFlag === "true" || autoFlag === "1" || autoFlag === "yes";

  const blockers: string[] = [];
  if (!has(env.TELEGRAM_BOT_TOKEN) || !has(env.TELEGRAM_CHAT_ID)) blockers.push("Falta TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID");
  if (paused) blockers.push("RADAR_GLOBAL_PAUSE está activo (nada corre)");
  if (outPaused) blockers.push("RADAR_OUTREACH_PAUSE está activo (no se envía)");
  if (cb.active) blockers.push(`Circuit breaker abierto: ${cb.reason || "sin motivo"} (requiere reset manual)`);
  if (!hasProvider) blockers.push("Sin proveedor de email (RESEND_API_KEY / BREVO_API_KEY / Hunter)");
  if (autoOn && !has(env.SENDER_POSTAL_ADDRESS)) blockers.push("Falta SENDER_POSTAL_ADDRESS: bloquea todo envío automático");
  if (gov && gov.status && gov.status !== "active") blockers.push(`Sender governor en estado "${gov.status}"`);
  if (!has(env.FOUNDING_CITIES)) blockers.push("FOUNDING_CITIES vacío (OK: rotación geoData/geoFrontier activa — no hace falta lista manual)");

  const hardBlock = blockers.filter(b => !b.startsWith("FOUNDING_CITIES"));
  let verdict: RadarDigest["verdict"] = "ok";
  let headline = "🟢 Funcionando: el embudo está produciendo";
  if (hardBlock.length > 0) {
    verdict = "blocked";
    headline = "🔴 Bloqueado: " + hardBlock[0];
  } else if (runs === 0) {
    verdict = "blocked";
    headline = "🔴 El cron no creó ninguna corrida en 24 h";
  } else if (nCreated === 0) {
    verdict = "idle";
    headline = nZero >= nJobs && nJobs > 0
      ? "🟡 Corre, pero las fuentes devuelven 0 negocios (Overpass/BizData/Geoapify)"
      : "🟡 Corre, pero no encuentra prospectos NUEVOS (todo lo que halla ya existe)";
  } else if (nEmail === 0) {
    verdict = "idle";
    headline = "🟡 Encuentra negocios, pero ninguno llega con email válido (no pasan a Telegram)";
  } else if (nSent === 0 && nWaiting === 0 && blockedRows.length > 0) {
    verdict = "idle";
    headline = `🟡 Hay prospectos con email, pero se frenan en: ${blockedRows[0].outcome}`;
  }

  const lines: string[] = [];
  lines.push(`<b>📡 Radar · estado (24 h)</b>`);
  lines.push(headline);
  lines.push("");
  lines.push(`<b>Corridas:</b> ${runs} · <b>Jobs discovery:</b> ${nJobs} (${nZero} con 0 resultados) · <b>Jobs fallidos:</b> ${nFailed}`);
  lines.push(`<b>Prospectos nuevos:</b> ${nCreated} · <b>con email:</b> ${nEmail}`);
  lines.push(`<b>Enviados/programados:</b> ${nSent} · <b>esperando tu aprobación:</b> ${nWaiting}`);
  lines.push(`<b>Presupuesto hoy:</b> discovery restante ${remDisc} · outreach restante ${remOut}${gov ? ` · envíos hoy ${gov.sends_today ?? 0}` : ""}`);
  if (blockedRows.length > 0) {
    lines.push("");
    lines.push("<b>Dónde se frenan:</b>");
    for (const r of blockedRows) lines.push(`• ${escapeHtml(String(r.outcome).slice(0, 70))}: ${r.c}`);
  }
  if (zeroReasonTop.length > 0) {
    lines.push("");
    lines.push("<b>Por qué salen 0 resultados:</b>");
    for (const [k, c] of zeroReasonTop) lines.push(`• ${escapeHtml(k)}: ${c}`);
  }
  if (blockers.length > 0) {
    lines.push("");
    lines.push("<b>Config a revisar:</b>");
    for (const b of blockers.slice(0, 5)) lines.push(`• ${escapeHtml(b)}`);
  }
  if (nFailed > 0 && lastFail?.error) {
    lines.push("");
    lines.push(`<b>Último error de job:</b> <code>${escapeHtml(String(lastFail.error).slice(0, 160))}</code>`);
  }
  lines.push("");
  lines.push(`<i>${day} · el radar solo avisa de prospectos cuando hay uno listo; este resumen te dice si está vivo.</i>`);

  return {
    verdict,
    headline,
    text: lines.join("\n").slice(0, 3900),
    data: {
      runs, discovery_jobs: nJobs, zero_result_jobs: nZero, failed_jobs: nFailed,
      new_prospects: nCreated, with_email: nEmail, sent: nSent, waiting_approval: nWaiting,
      blocked_by: blockedRows, blockers, remaining: { discovery: remDisc, outreach: remOut },
      circuit_breaker: cb, last_job_error: lastFail?.error || null
    }
  };
}

/**
 * Envía el resumen. Reglas (para no hacer spam):
 *  - force=true: siempre (endpoint manual).
 *  - Cron de las 22:00 UTC: siempre, 1 vez al día (aunque todo vaya bien: es tu "latido").
 *  - Cualquier otro cron: solo si hay problema (🔴/🟡) y no se avisó ya hoy de ese mismo estado.
 */
export async function sendRadarDigest(
  env: Env,
  opts: { force?: boolean; scheduledHourUtc?: number } = {}
): Promise<{ sent: boolean; verdict: string; headline: string; data: Record<string, any>; telegram?: any }> {
  const d = await collectRadarDigest(env);
  const day = new Date().toISOString().split("T")[0];
  const isDailySlot = (opts.scheduledHourUtc ?? -1) >= 22;
  let shouldSend = !!opts.force;

  if (!shouldSend && env.RADAR_DB) {
    const key = `radar_digest_${day}_${isDailySlot ? "daily" : d.verdict}`;
    const already = await cacheGet(env, key);
    if (!already && (isDailySlot || d.verdict !== "ok")) {
      shouldSend = true;
      await cachePut(env, key, "1", 86400);
    }
  }
  if (!shouldSend) return { sent: false, verdict: d.verdict, headline: d.headline, data: d.data };

  const tg = await notifyFounder(env, d.text);
  return { sent: !!tg.ok, verdict: d.verdict, headline: d.headline, data: d.data, telegram: tg };
}

/**
 * Push 24-hour market observations from D1 to BEM ingestion API
 * and optionally notify Telegram via notifyOnce daily digest.
 */
export async function pushMarketObservationsToBem(env: Env): Promise<{
  ok?: boolean;
  skipped?: boolean;
  reason?: string;
  accepted?: number;
  status?: number;
}> {
  const ingestUrl = env.BVELT_INGEST_URL ? String(env.BVELT_INGEST_URL).trim() : "";
  // Bvelt's Founder observation receiver authenticates with RADAR_SERVICE_KEY.
  // Keep the legacy alias for existing deployments, but use the shared service
  // credential when BVELT_INGEST_KEY has not been provisioned.
  const ingestKey = String(env.BVELT_INGEST_KEY || env.RADAR_SERVICE_KEY || "").trim();

  if (!ingestUrl || !ingestKey) {
    return { skipped: true, reason: "missing_config" };
  }

  const day = new Date().toISOString().split("T")[0];

  try {
    await env.RADAR_DB.prepare(`
      CREATE TABLE IF NOT EXISTS radar_bem_sync_state (
        scope TEXT PRIMARY KEY,
        last_synced_at TEXT NOT NULL,
        last_synced_id TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL
      )
    `).run();
    const syncState = await env.RADAR_DB.prepare(
      "SELECT last_synced_at, last_synced_id FROM radar_bem_sync_state WHERE scope = 'founder'"
    ).first() as any;
    // First activation backfills existing Founder prospects in bounded batches.
    // Later runs advance a stable (created_at,id) cursor to prevent recounting.
    const cursorAt = String(syncState?.last_synced_at || "1970-01-01T00:00:00.000Z");
    const cursorId = String(syncState?.last_synced_id || "");
    const rows = await env.RADAR_DB.prepare(`
      SELECT id, tenant_id, name, city, trade, website, phone, email, score, outcome, status, created_at
      FROM prospects
      WHERE (tenant_id IS NULL OR tenant_id = '' OR tenant_id = 'founder')
        AND (datetime(created_at) > datetime(?) OR (datetime(created_at) = datetime(?) AND id > ?))
      ORDER BY datetime(created_at) ASC, id ASC
      LIMIT 500
    `).bind(cursorAt, cursorAt, cursorId).all();

    const results = (rows?.results || []) as any[];

    // Strict guarantee: zero Tenant records can ever be included in the BEM payload
    const founderOnly = results.filter(row => !row.tenant_id || row.tenant_id === "" || row.tenant_id === "founder");

    const items = founderOnly.map(row => {
      const websiteStr = row.website ? String(row.website).trim() : "";
      const phoneStr = row.phone ? String(row.phone).trim() : "";
      const emailStr = row.email ? String(row.email).trim() : "";
      const parsedScore = Number(row.score);

      return {
        mode: "founder",
        tenant_id: "founder",
        city: row.city || "",
        trade: row.trade || "",
        business_name: row.name || "",
        has_website: Boolean(websiteStr && websiteStr.length > 3),
        has_phone: Boolean(phoneStr && phoneStr.length > 0),
        has_email: Boolean(emailStr && emailStr.length > 0),
        score: (!isNaN(parsedScore) && row.score !== null && row.score !== undefined) ? parsedScore : null,
        outcome: row.outcome || row.status || null,
        identity_key: String(row.id),
        source: "bvelt-radar"
      };
    });

    if (items.length === 0) {
      return { ok: true, skipped: true, reason: "no_new_founder_observations", accepted: 0 };
    }

    const payload = {
      source: "bvelt-radar",
      observed_at: new Date().toISOString(),
      run_id: `founder-cursor-${founderOnly[founderOnly.length - 1]?.id || "empty"}`,
      items
    };

    let res: Response;
    try {
      res = await fetch(ingestUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${ingestKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(12000)
      });
    } catch (fetchErr: any) {
      console.warn(`[BEM Ingest] Network/Timeout error sending to ${ingestUrl}:`, fetchErr?.message || fetchErr);
      return { ok: false, reason: fetchErr?.message || "fetch_failed" };
    }

    if (!res.ok) {
      console.warn(`[BEM Ingest] Server returned status ${res.status}`);
      return { ok: false, status: res.status };
    }

    // Advance the cursor only after Bvelt confirms the batch was accepted.
    const lastAccepted = founderOnly[founderOnly.length - 1];
    if (lastAccepted?.created_at && lastAccepted?.id) {
      await env.RADAR_DB.prepare(`
        INSERT INTO radar_bem_sync_state (scope, last_synced_at, last_synced_id, updated_at)
        VALUES ('founder', ?, ?, ?)
        ON CONFLICT(scope) DO UPDATE SET
          last_synced_at = excluded.last_synced_at,
          last_synced_id = excluded.last_synced_id,
          updated_at = excluded.updated_at
      `).bind(String(lastAccepted.created_at), String(lastAccepted.id), new Date().toISOString()).run();
    }

    // Tarea B — Telegram digest (máx 1 vez al día, Founder observations)
    let withoutWebCount = 0;
    let withPhoneCount = 0;

    for (const item of items) {
      if (!item.has_website) withoutWebCount++;
      if (item.has_phone) withPhoneCount++;
    }

    const digestText = [
      "BEM feed diario (Founder)",
      `Prospectos enviados: ${items.length}`,
      `Sin web: ${withoutWebCount} | Con teléfono: ${withPhoneCount}`,
      `OK ingest`
    ].join("\n");

    await notifyOnce(env, `bem_daily_digest_${day}`, digestText);

    return { ok: true, accepted: items.length, status: res.status };
  } catch (err: any) {
    console.warn("[BEM Ingest] Failed to process market observations:", err);
    return { ok: false, reason: err?.message || String(err) };
  }
}

/**
 * Dedicated isolated sender for Tenant observations to Bvelt.
 * Guarantees Tenant observations are kept strictly separate from global Founder BEM.
 */
export async function sendTenantObservationsToBvelt(
  env: Env,
  tenantId: string,
  options?: { limit?: number; since?: string; prospectIds?: string[] }
): Promise<{
  ok?: boolean;
  skipped?: boolean;
  reason?: string;
  sent_count?: number;
  tenant_id: string;
}> {
  if (!tenantId || !tenantId.startsWith("bvelt_")) {
    return { skipped: true, reason: "tenant_id_required", tenant_id: tenantId };
  }
  const ingestUrl = (env as any).BVELT_TENANT_INGEST_URL;
  const ingestKey = (env as any).BVELT_TENANT_INGEST_KEY;
  if (!ingestUrl || !ingestKey) {
    return { skipped: true, reason: "missing_dedicated_tenant_ingest_config", tenant_id: tenantId };
  }
  const limit = Math.min(500, Math.max(1, options?.limit || 100));
  const sinceClause = options?.since ? "AND created_at >= ?" : "";
  const prospectIds = Array.isArray(options?.prospectIds)
    ? options!.prospectIds!.map(id => String(id).trim()).filter(Boolean).slice(0, 100)
    : [];
  const idsClause = prospectIds.length ? `AND id IN (${prospectIds.map(() => "?").join(",")})` : "";
  const params: any[] = [tenantId];
  if (options?.since) params.push(options.since);
  params.push(...prospectIds);
  params.push(limit);

  const rows = await env.RADAR_DB.prepare(`
    SELECT id, tenant_id, name, city, trade, website, phone, email, score, status, tenant_outcome, bvelt_angle, created_at
    FROM prospects
    WHERE tenant_id = ?
      AND mode = 'tenant'
      ${sinceClause}
      ${idsClause}
    ORDER BY created_at DESC
    LIMIT ?
  `).bind(...params).all();

  const results = (rows?.results || []) as any[];
  if (results.length === 0) {
    return { ok: true, sent_count: 0, tenant_id: tenantId };
  }

  const items = results.map(r => ({
    prospect_id: String(r.id),
    tenant_id: tenantId,
    name: r.name,
    city: r.city,
    trade: r.trade,
    website: r.website,
    phone: r.phone,
    email: r.email,
    score: r.score,
    status: r.status,
    outcome: r.tenant_outcome,
    angle: r.bvelt_angle,
    created_at: r.created_at
  }));

  const payload = {
    source: "bvelt-radar",
    mode: "tenant",
    tenant_id: tenantId,
    timestamp: new Date().toISOString(),
    count: items.length,
    items: items.map(item => ({ ...item, mode: "tenant", tenant_id: tenantId }))
  };

  try {
    const res = await fetch(ingestUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${ingestKey}`,
        "Content-Type": "application/json",
        "X-Bvelt-Tenant-Id": tenantId
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(12000)
    });
    if (!res.ok) {
      return { ok: false, reason: `http_${res.status}`, tenant_id: tenantId };
    }
    return { ok: true, sent_count: items.length, tenant_id: tenantId };
  } catch (err: any) {
    return { ok: false, reason: err?.message || String(err), tenant_id: tenantId };
  }
}



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
        signal: AbortSignal.timeout(4500) // 4.5s — slow contractor sites otherwise yield 0 emails
      });

      if (!res.ok) continue;
      pagesFetched++;

      // Lightweight slice to max 50KB to keep within Workers memory limits
      const html = (await res.text()).slice(0, 50000);
      const normalizedHtml = html.toLowerCase();

      // 1. Email extraction if not found yet (sanitized against retina assets & file TLDs)
      if (!finalEmail) {
        const mailtoMatch = html.match(/href="mailto:([^"?#]+)"/i);
        const mailtoCandidate = mailtoMatch ? sanitizeProspectEmail(mailtoMatch[1]) : null;
        if (mailtoCandidate) {
          finalEmail = mailtoCandidate;
        }

        if (!finalEmail) {
          // Many US trades only publish Gmail/Yahoo — do not exclude free mail on business sites
          const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;
          const matches = html.match(emailRegex);
          if (matches && matches.length > 0) {
            const validCandidates = matches
              .map(m => sanitizeProspectEmail(m))
              .filter((m): m is string => Boolean(m));

            if (validCandidates.length > 0) {
              const business = validCandidates.filter(e => /^(info|office|contact|hello|service|admin|support|sales)/i.test(e));
              finalEmail = business.length > 0 ? business[0] : validCandidates[0];
            }
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
  const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
  if (!res.ok) return null;
  const body: any = await res.json();
  const emails: any[] = body.data?.emails || [];
  if (!emails.length) return null;

  // Prefer higher confidence; prefer personal over generic contact@
  const scored = emails
    .map((e: any) => {
      const value = String(e.value || "").toLowerCase();
      const conf = typeof e.confidence === "number" ? e.confidence : 0;
      const local = value.split("@")[0] || "";
      const isContact = /^(contact|admin|office|mail|webmaster)$/i.test(local);
      const isInfo = /^(info|hello|hi|support|sales)$/i.test(local);
      const isPersonal = e.type === "personal" || (local.includes(".") && !isContact);
      let rank = conf;
      if (isPersonal) rank += 15;
      if (isInfo) rank += 5;
      if (isContact) rank -= 25; // contact@ drives permanent bounces
      return { value: e.value as string, conf, rank };
    })
    .filter((e: any) => e.conf >= 40 || e.rank >= 50)
    .sort((a: any, b: any) => b.rank - a.rank);

  if (!scored.length) return null;
  // Absolute floor: confidence 50+ preferred; allow 40+ only if personal-shaped
  const pick = scored.find((e: any) => e.conf >= 50) || scored[0];
  if (pick.conf < 40) return null;
  return pick.value;
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
  const normEmail = (email || "").toLowerCase().trim();
  const timestamp = new Date().toISOString();

  // 1. Strict sanitization check (rejects file extensions, @2x, disposables, system mailboxes, invalid format)
  const sanitized = sanitizeEmail(normEmail);
  if (!sanitized.valid) {
    return {
      valid: false,
      deliverability: sanitized.reason === "disposable_domain" ? "DISPOSABLE" : "INVALID_FORMAT",
      is_disposable: sanitized.reason === "disposable_domain",
      is_catchall: false,
      reason: `Sanitizer rejected: ${sanitized.reason}`
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

        // 0.65 floor reduces permanent bounces (Resend ~38% was driven by weak guesses)
        const isValid = !isUndeliverable && !isDisposable && (qualityScore >= 0.65);
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
  // 0. Off-ICP and Trade Coherence Gate
  if (isOffIcpName(prospect.name, prospect.mode === 'tenant')) {
    await env.RADAR_DB.prepare("UPDATE prospects SET status = 'disqualified', outcome = 'off_icp_name', updated_at = ? WHERE id = ?")
      .bind(new Date().toISOString(), prospect.id).run();
    return { success: false, reason: "OFF_ICP_NAME" };
  }
  const outreachCoherence = checkTradeCoherence(prospect.name, prospect.trade, prospect.website, prospect.signals_json, prospect.mode);
  if (!outreachCoherence.coherent && outreachCoherence.disqualified) {
    await env.RADAR_DB.prepare("UPDATE prospects SET status = 'disqualified', outcome = 'off_icp_name', updated_at = ? WHERE id = ?")
      .bind(new Date().toISOString(), prospect.id).run();
    return { success: false, reason: `TRADE_MISMATCH: ${outreachCoherence.reason}` };
  }
  if (outreachCoherence.verifiedTrade && outreachCoherence.verifiedTrade !== prospect.trade) {
    await env.RADAR_DB.prepare("UPDATE prospects SET trade = ?, updated_at = ? WHERE id = ?")
      .bind(outreachCoherence.verifiedTrade, new Date().toISOString(), prospect.id).run();
    prospect.trade = outreachCoherence.verifiedTrade;
  }

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
    await notifyOnce(
      env,
      "circuit_breaker_active",
      `⚠️ <b>Outreach en HOLD:</b> Circuit Breaker activo (${cb.reason || 'error de proveedor'}). Envíos pausados.`
    );
    return { success: false, reason: `circuit_breaker_active: ${cb.reason}` };
  }

  // 4. Compliance Hard Gate: missing sender postal address MUST block auto-outreach
  if (!env.SENDER_POSTAL_ADDRESS || !env.SENDER_POSTAL_ADDRESS.trim()) {
    console.warn(`[Compliance Gate] Prospect ${prospect.id} blocked: missing_sender_postal_address`);
    await env.RADAR_DB.prepare("UPDATE prospects SET status = 'held', outcome = 'missing_sender_postal_address', updated_at = ? WHERE id = ?")
      .bind(new Date().toISOString(), prospect.id).run();
    await notifyOnce(
      env,
      "missing_sender_postal_address",
      "⚠️ <b>Outreach en HOLD:</b> Falta <code>SENDER_POSTAL_ADDRESS</code> en las variables de Cloudflare. Se requiere dirección postal física para envíos conformes a CAN-SPAM."
    );
    return { success: false, reason: "missing_sender_postal_address" };
  }

  // 5. Suppression check
  const suppression = await checkSuppressedComposite(
    env.RADAR_DB,
    prospect.email,
    prospect.website,
    prospect.phone,
    prospect.name,
    prospect.city,
    prospect.tenant_id || "founder"
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
    prospect.city,
    prospect.tenant_id || "founder"
  );
  if (overlap && isCooldownActive(overlap.overlap.cooldown_until)) {
    await env.RADAR_DB.prepare("UPDATE prospects SET status = 'held', outcome = 'cooldown_active', updated_at = ? WHERE id = ?")
      .bind(new Date().toISOString(), prospect.id).run();
    return { success: false, reason: `COOLDOWN_ACTIVE until ${overlap.overlap.cooldown_until}` };
  }

  // 7. Dedupe check & Recipient email validation
  if (!prospect.email || !prospect.email.trim()) {
    const hasPhone = prospect.phone && String(prospect.phone).replace(/\D/g, '').length >= 7;
    if (hasPhone) {
      await env.RADAR_DB.prepare("UPDATE prospects SET status = 'qualified', outcome = 'phone_only_no_email', updated_at = ? WHERE id = ?")
        .bind(new Date().toISOString(), prospect.id).run();
      return { success: false, reason: "PHONE_ONLY_NO_EMAIL" };
    }
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
    await env.RADAR_DB.prepare("UPDATE prospects SET status = 'held', outcome = 'sender_governor_limit', updated_at = ? WHERE id = ?")
      .bind(new Date().toISOString(), prospect.id).run();
    await notifyOnce(
      env,
      "sender_governor_blocked",
      `⚠️ <b>Outreach en HOLD:</b> Sender Governor límite diario alcanzado (${governor.reason}).`
    );
    return { success: false, reason: `SENDER_GOVERNOR_BLOCKED: ${governor.reason}` };
  }

  // 8. Budget check: Reserve outreach unit from authoritative Daily Budget Governor
  const tenantId = prospect.tenant_id || "founder";
  const outreachReserved = await reserveBudget(env.RADAR_DB, tenantId, 'outreach_units', 1);
  if (!outreachReserved) {
    await env.RADAR_DB.prepare("UPDATE prospects SET status = 'held', outcome = 'outreach_budget_limit_exceeded', updated_at = ? WHERE id = ?")
      .bind(new Date().toISOString(), prospect.id).run();
    await notifyOnce(
      env,
      "outreach_budget_exhausted",
      `⚠️ <b>Outreach en HOLD:</b> Presupuesto diario de outreach agotado para tenant '${tenantId}'.`
    );
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
    await notifyOnce(
      env,
      "missing_email_provider",
      "⚠️ <b>Outreach en HOLD:</b> No hay claves de proveedor configuradas (falta RESEND_API_KEY o BREVO_API_KEY)."
    );
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
  city: string,
  tenantId: string = "founder"
): Promise<{ suppressed: boolean; reason: string } | null> {
  if (tenantId !== "founder") {
    return null;
  }
  const keys: string[] = [];
  if (email) keys.push(email.toLowerCase().trim());
  if (website) {
    const dom = getDomain(website);
    if (dom) keys.push(dom.toLowerCase().trim());
  }
  if (phone) keys.push(phone.replace(/[^0-9]/g, ""));
  keys.push(`${name.toLowerCase().trim()}_${city.toLowerCase().trim()}`.replace(/\s+/g, "_"));

  const now = Date.now();
  const SOFT_MS = 25 * 24 * 60 * 60 * 1000; // contacted cooldown max 25d

  for (const k of keys) {
    try {
      const match = await db.prepare("SELECT * FROM suppression WHERE key = ?").bind(k).first() as any;
      if (!match) continue;
      const reason = String(match.reason || "");
      const reasonL = reason.toLowerCase();
      const isHard =
        reasonL.includes("bounce") ||
        reasonL.includes("complaint") ||
        reasonL.includes("unsubscribe") ||
        reasonL.includes("spam") ||
        reasonL.includes("invalid");
      // Soft "Contacted on ..." rows: respect created_at / cooldown date, auto-expire
      if (!isHard && (reasonL.includes("contacted on") || reasonL.includes("cooldown"))) {
        let expireAt = 0;
        const created = match.created_at ? Date.parse(match.created_at) : NaN;
        if (!isNaN(created)) expireAt = created + SOFT_MS;
        const untilMatch = reason.match(/cooldown until ([0-9T:\-.+Z]+)/i);
        if (untilMatch) {
          const parsed = Date.parse(untilMatch[1]);
          if (!isNaN(parsed)) expireAt = parsed;
        }
        if (expireAt && now > expireAt) {
          try {
            await db.prepare("DELETE FROM suppression WHERE key = ?").bind(k).run();
          } catch (_) {}
          continue; // not suppressed anymore
        }
      }
      return { suppressed: true, reason: match.reason };
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
  city: string,
  tenantId: string = "founder"
): Promise<{ overlap: any; reason: string } | null> {
  const normEmail = email ? email.toLowerCase().trim() : null;
  const normDomain = website ? getDomain(website) : null;
  const normPhone = phone ? phone.replace(/[^0-9]/g, "") : null;
  const identityKey = generateIdentityKey(email, website, phone, name, city);

  try {
    const matchIdentity = await db.prepare("SELECT * FROM prospects WHERE identity_key = ? AND COALESCE(tenant_id, 'founder') = ?").bind(identityKey, tenantId).first();
    if (matchIdentity) return { overlap: matchIdentity, reason: "Same identity_key: " + identityKey };

    if (normEmail) {
      const match = await db.prepare("SELECT * FROM prospects WHERE email = ? AND COALESCE(tenant_id, 'founder') = ?").bind(normEmail, tenantId).first();
      if (match) return { overlap: match, reason: "Same email match: " + normEmail };
    }

    if (normDomain) {
      const match = await db.prepare("SELECT * FROM prospects WHERE website LIKE ? AND COALESCE(tenant_id, 'founder') = ?").bind(`%${normDomain}%`, tenantId).first();
      if (match) return { overlap: match, reason: "Same website domain match: " + normDomain };
    }

    if (normPhone && normPhone.length >= 7) {
      const match = await db.prepare("SELECT * FROM prospects WHERE (phone = ? OR phone LIKE ?) AND COALESCE(tenant_id, 'founder') = ?").bind(normPhone, `%${normPhone}%`, tenantId).first();
      if (match) return { overlap: match, reason: "Same phone number match: " + normPhone };
    }

    const matchNameCity = await db.prepare("SELECT * FROM prospects WHERE name = ? AND city = ? AND COALESCE(tenant_id, 'founder') = ?").bind(name, city, tenantId).first();
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
    event_type?: string;
    prospect_id?: string;
    mode?: string;
    tenant_id?: string;
    value_usd?: number | null;
  }
): Promise<void> {
  const mode = details?.mode === "tenant" ? "tenant" : "founder";
  const tenantId = mode === "tenant" ? String(details?.tenant_id || "") : "founder";
  if (!details?.prospect_id || (mode === "tenant" && (!tenantId || tenantId === "founder"))) {
    console.warn("[Learning Integrity] Skipped event without a valid prospect/scope.");
    return;
  }

  const eventType = String(details?.event_type || (isSent ? "sent" : details?.outcome || "unknown")).toLowerCase();
  const occurredAt = new Date().toISOString();
  try {
    await recordScopedLearningEvent(db, {
      mode,
      tenantId,
      prospectId: String(details.prospect_id),
      eventType,
      city,
      trade,
      variantId,
      angle: details?.angle || null,
      valueUsd: details?.value_usd ?? null,
      occurredAt,
      metadata: {
        score: details?.score,
        response_type: details?.response_type,
        outcome: details?.outcome,
        source: "radar_worker"
      }
    });
  } catch (e) {
    console.warn("[Learning Integrity] Event persistence warning:", e);
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
async function getLearningStats(
  db: D1Database,
  mode: "founder" | "tenant" = "founder",
  tenantId: string = "founder"
): Promise<Record<string, number>> {
  const winRates: Record<string, number> = {};
  const scopedTenantId = mode === "founder" ? "founder" : tenantId;
  if (!db || typeof db.prepare !== "function" || (mode === "tenant" && (!scopedTenantId || scopedTenantId === "founder"))) return winRates;

  try {
    Object.assign(winRates, await readScopedLearningStats(db, mode, scopedTenantId));

    // Backfill signal from prospect rows, strictly within the requested scope.
    const live = await db.prepare(`
      SELECT city, trade,
        SUM(CASE WHEN outcome IN ('won','converted') OR tenant_outcome = 'won' THEN 1 ELSE 0 END) AS wins,
        SUM(CASE WHEN outcome IN ('sent','positive','booked','converted','won') OR status IN ('sent','delivered','replied','converted','won') OR tenant_outcome IN ('contacted','replied','won','lost') THEN 1 ELSE 0 END) AS sent
      FROM prospects
      WHERE mode = ?
        AND COALESCE(tenant_id, 'founder') = ?
        AND city IS NOT NULL AND trade IS NOT NULL
      GROUP BY city, trade
      HAVING sent >= 2
    `).bind(mode, scopedTenantId).all() as any;

    for (const row of (live?.results || []) as any[]) {
      const sent = Math.max(1, Number(row.sent || 0));
      const wins = Math.min(sent, Number(row.wins || 0));
      const rate = (wins + 1) / (sent + 2);
      const cityKey = `city:${row.city}`;
      const tradeKey = `trade:${String(row.trade).toLowerCase()}`;
      const pairKey = `pair:${row.city}|${String(row.trade).toLowerCase()}`;
      if (winRates[cityKey] === undefined) winRates[cityKey] = rate;
      if (winRates[tradeKey] === undefined) winRates[tradeKey] = rate;
      if (winRates[pairKey] === undefined) winRates[pairKey] = rate;
    }

    // Geographic observations are also scoped; replies are not treated as wins.
    const geo = await db.prepare(`
      SELECT place_key, trade, SUM(wins) AS wins, SUM(searches) AS searches
      FROM geo_coverage
      WHERE tenant_id = ?
      GROUP BY place_key, trade
      HAVING searches >= 2
    `).bind(scopedTenantId).all() as any;

    for (const row of (geo?.results || []) as any[]) {
      const cityName = String(row.place_key || "").split("|")[0];
      if (!cityName) continue;
      const searches = Math.max(1, Number(row.searches || 0));
      const wins = Math.min(searches, Number(row.wins || 0));
      const rate = (wins + 1) / (searches + 2);
      const key = `city:${cityName}`;
      if (winRates[key] === undefined) winRates[key] = rate;
    }
  } catch (e) {
    console.warn("[Learning Integrity] Scoped read failed; using uniform prior.", e);
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

export interface TradeInferenceResult {
  trade: string;
  confidence: 'high' | 'medium' | 'low' | 'none';
  isNonHomeService: boolean;
  detectedClue?: string;
}

export function inferTradeFromTextDetailed(...textParts: (string | undefined)[]): TradeInferenceResult {
  const combined = textParts.filter(Boolean).join(' ').toLowerCase();
  if (!combined.trim()) {
    return { trade: 'general', confidence: 'none', isNonHomeService: false };
  }

  // Check off-ICP first
  if (isOffIcpName(combined)) {
    return { trade: 'non_home_service', confidence: 'high', isNonHomeService: true, detectedClue: 'off_icp_token' };
  }

  const tradePatterns: [string, RegExp][] = [
    ['lawn_care', /\b(lawn\s*care|lawn\s*mowing|mowing|turf|weed\s*control|aeration|yard\s*care|lawn\s*service)\b/i],
    ['landscaping', /\b(landscap|irrigation|sprinkler|hardscap|tree\s*service|arborist|tree\s*care)\b/i],
    ['plumbing', /\b(plumb|drain|sewer|water\s*heater|pipe|rooter|leak\s*detection)\b/i],
    ['hvac', /\b(hvac|air\s*conditioning|heating|furnace|heat\s*pump|cooling|a\/c|duct|refrigeration)\b/i],
    ['roofing', /\b(roof|roofer|roofing|shingle|gutters?|siding)\b/i],
    ['electrical', /\b(electric|electrician|wiring|generator|lighting\s*install)\b/i],
    ['painting', /\b(paint|painter|painting|drywall|stucco)\b/i],
    ['pest_control', /\b(pest\s*control|exterminat|termite|bed\s*bug|fumigat|pest\s*solutions)\b/i],
    ['pool', /\b(pool\s*service|pool\s*cleaning|pool\s*repair|pools\s*and\s*spa)\b/i],
    ['cleaning', /\b(cleaning|maid|janitorial|pressure\s*wash|power\s*wash|carpet\s*clean|window\s*clean)\b/i],
    ['garage_door', /\b(garage\s*door|overhead\s*door)\b/i],
    ['handyman', /\b(handyman|general\s*contractor|remodel|renovation|home\s*repair)\b/i],
  ];

  for (const [t, regex] of tradePatterns) {
    const m = combined.match(regex);
    if (m) {
      return { trade: t, confidence: 'high', isNonHomeService: false, detectedClue: m[0] };
    }
  }

  return { trade: 'general', confidence: 'low', isNonHomeService: false };
}

export function inferTradeFromText(...textParts: (string | undefined)[]): string {
  return inferTradeFromTextDetailed(...textParts).trade;
}

export interface TradeCoherenceCheck {
  coherent: boolean;
  verifiedTrade: string | null;
  reason?: string;
  disqualified: boolean;
}

export function checkTradeCoherence(
  name: string,
  declaredTrade: string,
  website?: string | null,
  tags?: string | null,
  mode: string = 'founder'
): TradeCoherenceCheck {
  const allowGym = mode === 'tenant';
  if (isOffIcpName(name, allowGym)) {
    return {
      coherent: false,
      verifiedTrade: null,
      reason: `off_icp_name: "${name}" is off-ICP`,
      disqualified: true
    };
  }

  const inferred = inferTradeFromTextDetailed(name, tags || '', website || '');
  if (inferred.isNonHomeService) {
    return {
      coherent: false,
      verifiedTrade: null,
      reason: `non_home_service: clues indicate off-ICP`,
      disqualified: true
    };
  }

  const normDeclared = (declaredTrade || '').toLowerCase().replace(/[\s-]+/g, '_');

  // If text clues give a specific trade with high confidence
  if (inferred.confidence === 'high' && inferred.trade !== 'general') {
    const compatible =
      inferred.trade === normDeclared ||
      (inferred.trade === 'lawn_care' && normDeclared === 'landscaping') ||
      (inferred.trade === 'landscaping' && normDeclared === 'lawn_care');

    if (!compatible) {
      return {
        coherent: true,
        verifiedTrade: inferred.trade,
        reason: `conflict_resolved_preferring_inferred_${inferred.trade}`,
        disqualified: false
      };
    }

    return {
      coherent: true,
      verifiedTrade: inferred.trade,
      disqualified: false
    };
  }

  // Declared trade fallback check against known valid trades
  const validTrades = new Set([
    'plumbing', 'hvac', 'roofing', 'landscaping', 'lawn_care',
    'electrical', 'painting', 'pool', 'pest_control', 'cleaning',
    'handyman', 'garage_door', 'construction', 'remodeling'
  ]);

  if (validTrades.has(normDeclared)) {
    return {
      coherent: true,
      verifiedTrade: normDeclared,
      disqualified: false
    };
  }

  return {
    coherent: false,
    verifiedTrade: null,
    reason: `unverified_trade: declared "${declaredTrade}" has no supporting contractor clues`,
    disqualified: mode !== 'tenant'
  };
}

export function isLicenseStatusInvalid(statusText?: string): boolean {
  if (!statusText) return false;
  const lower = statusText.toLowerCase();
  return /expired|expirad|revoked|revocad|cancelled|canceled|cancelad|suspended|suspendid|inactive|inactiv/i.test(lower);
}

/** US Eastern quiet hours for auto-outreach. 21:00–08:00 America/New_York. */
function isUsOutreachQuietHours(now: Date = new Date()): boolean {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      hour12: false,
    }).formatToParts(now);
    const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "12");
    return hour >= 21 || hour < 8;
  } catch {
    const h = now.getUTCHours();
    return h >= 2 && h < 13;
  }
}

/** Lightweight website health probe (no paid APIs). */
async function probeWebsiteHealth(url: string): Promise<{ ok: boolean; status: number; parked: boolean; isSlow: boolean; ms: number }> {
  const empty = { ok: false, status: 0, parked: false, isSlow: false, ms: 0 };
  if (!url || !isRealWebsite(url)) return { ...empty, parked: true };
  let target = url.trim();
  if (!/^https?:\/\//i.test(target)) target = "https://" + target;
  const start = Date.now();
  try {
    const res = await fetch(target, {
      method: "GET",
      redirect: "follow",
      headers: { "User-Agent": "BveltRadar/1.0 (health; https://bvelt.app)", "Accept": "text/html" },
      signal: AbortSignal.timeout(4500),
    });
    const ms = Date.now() - start;
    let body = "";
    try { body = (await res.text()).slice(0, 4000).toLowerCase(); } catch { body = ""; }
    const parked = /domain is for sale|buy this domain|parked free|godaddy parking|sedoparking|coming soon|under construction/i.test(body);
    return { ok: res.ok && !parked, status: res.status, parked, isSlow: ms > 2500, ms };
  } catch {
    return { ...empty, ms: Date.now() - start };
  }
}

/**
 * Utilities
 */
function isRealWebsite(url: string): boolean {
  if (!url || typeof url !== "string") return false;
  const lower = url.toLowerCase().trim();
  if (!lower || lower === "null" || lower === "undefined") return false;
  const bad = [
    "facebook.com", "fb.com", "instagram.com", "yelp.com", "yellowpages.com",
    "linktr.ee", "linktree.com", "bit.ly", "tinyurl.com", "business.site",
    "wixsite.com", "nextdoor.com", "angi.com", "homeadvisor.com", "thumbtack.com",
    "bbb.org", "craigslist.org", "twitter.com", "x.com", "tiktok.com",
    "linkedin.com", "google.com/maps", "goo.gl/maps"
  ];
  if (bad.some((b) => lower.includes(b))) return false;
  try {
    const host = lower.replace(/^(https?:\/\/)?(www\.)?/i, "").split("/")[0].split(":")[0];
    if (!host || host.length < 4 || !host.includes(".")) return false;
    return true;
  } catch {
    return false;
  }
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
