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

// Global type declarations for Cloudflare Worker compilation
declare global {
  interface D1Database {
    prepare: (sql: string) => any;
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
  countries: ["US"],
  languages: ["en"],
  icp: {
    description: "Local service businesses with visible phone lines, websites, high-margin jobs, and lead-capture or emergency response friction.",
    keywords: ["plumber", "hvac", "electrician", "contractor", "cleaning", "landscaping"]
  },
  min_score: 50,
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

// OSM Tag mappings by trade for high-precision Overpass queries
const OVERPASS_TRADE_TAGS: Record<string, string[]> = {
  plumbing: ['craft="plumber"', 'shop="plumbing"', 'craft="plumbing"'],
  hvac: ['craft="hvac"', 'craft="electrician"', 'craft="heating_contractor"'],
  landscaping: ['craft="gardener"', 'craft="landscaper"', 'shop="garden_centre"'],
  lawn_care: ['craft="gardener"', 'craft="lawn_mower"'],
  house_cleaning: ['craft="cleaner"', 'office="cleaning"', 'shop="laundry"'],
  pool_cleaning: ['craft="swimming_pool"', 'amenity="swimming_pool"', 'shop="swimming_pool"'],
  handyman: ['craft="handyman"', 'craft="carpenter"', 'craft="joiner"'],
  roofing: ['craft="roofer"', 'craft="roofing"'],
  pest_control: ['craft="pest_control"', 'amenity="pest_control"'],
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    if (method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // 1. Enhanced Health Check (public)
      if (path === "/health" && method === "GET") {
        return await handleHealth(env, corsHeaders);
      }

      // 2. Telegram Webhook Callback Endpoint (handles interactive inline buttons)
      if ((path === "/telegram/webhook" || path === "/telegram-webhook") && method === "POST") {
        return await handleTelegramWebhook(request, env, corsHeaders);
      }

      // 3. Security Verification for Admin/Worker Endpoints
      const authHeader = request.headers.get("Authorization");
      const queryKey = url.searchParams.get("key");
      const serviceKey = env.FOUNDER_SERVICE_KEY;

      let isAuthorized = false;
      if (authHeader && authHeader.startsWith("Bearer ") && authHeader.split(" ")[1] === serviceKey) {
        isAuthorized = true;
      } else if (queryKey && queryKey === serviceKey) {
        isAuthorized = true;
      }

      // Special handling for /run supporting both GET and POST with either auth method
      if (path === "/run") {
        if (!isAuthorized) {
          return Response.json({ error: "Unauthorized. Missing or invalid service key." }, { status: 401, headers: corsHeaders });
        }
        if (method === "GET" || method === "POST") {
          const mode = url.searchParams.get("mode") || "founder";
          const tenantId = url.searchParams.get("tenant_id") || null;
          
          const overrides = {
            cities: url.searchParams.get("cities") || url.searchParams.get("geographies") || null,
            trades: url.searchParams.get("trades") || url.searchParams.get("niches") || null,
            countries: url.searchParams.get("countries") || null,
            languages: url.searchParams.get("languages") || null,
            min_score: url.searchParams.get("min_score") || null,
          };
          
          const runResult = await startProspectingRun(env, mode, tenantId, overrides);

          return Response.json({
            message: "Autonomous prospecting jobs enqueued successfully.",
            run_id: runResult.run_id,
            mode,
            tenant_id: tenantId,
            jobs_enqueued: runResult.jobs_enqueued,
            active_cities: runResult.active_cities,
            active_trades: runResult.active_trades,
            overrides,
            timestamp: new Date().toISOString()
          }, { headers: corsHeaders });
        }
        return Response.json({ error: "Method Not Allowed" }, { status: 405, headers: corsHeaders });
      }

      // Enforce authorization for remaining admin endpoints (/stats, /decision, /suppression)
      if (!isAuthorized) {
        return Response.json({ error: "Unauthorized. Missing or invalid service key." }, { status: 401, headers: corsHeaders });
      }

      // 4. Stats Endpoint (Includes learning performance)
      if (path === "/stats" && method === "GET") {
        return await handleStats(env, corsHeaders);
      }

      // 6. Decision API Endpoint (sent / discard / suppress)
      if (path === "/decision" && method === "POST") {
        const body: any = await request.json();
        const { id, action, notes } = body;
        
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
      if (path === "/prospects" && method === "GET") {
        const limit = url.searchParams.get("limit") || "100";
        const status = url.searchParams.get("status");
        
        let queryStr = "SELECT * FROM prospects";
        const params: any[] = [];
        
        if (status) {
          queryStr += " WHERE status = ?";
          params.push(status);
        }
        
        queryStr += " ORDER BY created_at DESC LIMIT ?";
        params.push(parseInt(limit, 10));

        const results = await env.RADAR_DB.prepare(queryStr).bind(...params).all();
        return Response.json(results.results || [], { headers: corsHeaders });
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

      if (path.startsWith("/api/seeds/") && method === "DELETE") {
        const id = path.split("/").pop();
        await env.RADAR_DB.prepare("DELETE FROM seeds_optional WHERE id = ?").bind(id).run();
        return Response.json({ success: true }, { headers: corsHeaders });
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
        await env.RADAR_DB.prepare(`
          INSERT INTO prospects (id, name, city, trade, email, phone, score, status, outcome, bvelt_angle, variant_id, created_at, updated_at)
          VALUES (?, 'AutoStop Test Contractor', 'Tampa, FL', 'plumbing', 'autostop@example.com', '+18135550100', 80, 'notified', 'sent', 'missed_calls', 'missed_calls', ?, ?)
        `).bind(dummyId, timestamp, timestamp).run();

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

        return Response.json({ success: true, tenant_id: tenantId, message: "Tenant config saved successfully." }, { headers: corsHeaders });
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
          cron_trigger: { ready: true, schedule: "0 12 * * *" },
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
    await startProspectingRun(env, "founder", null);
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

        // Mark completed in radar_jobs & acknowledge
        if (env.RADAR_DB) {
          try {
            await env.RADAR_DB.prepare(
              "UPDATE radar_jobs SET status = 'completed', updated_at = ? WHERE id = ?"
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

  try {
    const todayRun = await db.prepare("SELECT * FROM runs WHERE day = ? ORDER BY created_at DESC LIMIT 1").bind(today).first() as any;
    if (todayRun) {
      prospectsToday = todayRun.finalized || 0;
      hunterUsedToday = todayRun.hunter_calls || 0;
      lastRunDate = todayRun.created_at;
    } else {
      const latestRun = await db.prepare("SELECT created_at FROM runs ORDER BY created_at DESC LIMIT 1").first() as any;
      if (latestRun) lastRunDate = latestRun.created_at;
    }
  } catch (e) {
    console.warn("Health check stats query fallback: ", e);
  }

  try {
    const jobStats = await db.prepare("SELECT status, COUNT(*) as count FROM queue_jobs GROUP BY status").all();
    if (jobStats.results) {
      for (const r of jobStats.results as any[]) {
        if (r.status === 'pending' || r.status === 'processing') pendingJobs += r.count;
        if (r.status === 'completed') completedJobs += r.count;
        if (r.status === 'failed') failedJobs += r.count;
      }
    }
    const lastErrRow = await db.prepare("SELECT error FROM queue_jobs WHERE error IS NOT NULL AND status = 'failed' ORDER BY created_at DESC LIMIT 1").first() as any;
    if (lastErrRow) lastError = lastErrRow.error;
  } catch (e) {
    // queue_jobs table initializing
  }

  const hunterRemaining = Math.max(0, LIMITS.max_hunter_credits_per_day - hunterUsedToday);

  return Response.json({
    status: failedJobs > 0 && pendingJobs === 0 ? "degraded" : "healthy",
    prospects_today: prospectsToday,
    hunter_remaining_estimate: hunterRemaining,
    last_run: lastRunDate,
    queue: {
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
  try {
    const update: any = await request.json();

    if (update.callback_query) {
      const query = update.callback_query;
      const callbackData: string = query.data || "";
      const chatId = query.message?.chat?.id || env.TELEGRAM_CHAT_ID;
      const callbackId = query.id;

      const [action, prospectId] = callbackData.split(":");

      if (action && prospectId) {
        // Execute decision
        await handleDecision(prospectId, action, "Triggered via Telegram Button", env, {});

        // Answer callback query so Telegram spinner stops
        if (env.TELEGRAM_BOT_TOKEN) {
          const actionText = action === "sent" ? "✅ Marcado como Enviado" : action === "discard" ? "❌ Descartado" : "🚫 Dominio Suprimido";
          await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              callback_query_id: callbackId,
              text: `${actionText} (${prospectId.substring(0, 8)})`,
              show_alert: false,
            }),
            signal: AbortSignal.timeout(4000)
          });

          // Send confirmation text in chat
          await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: chatId,
              text: `${actionText}: ID \`${prospectId}\` actualizado y registrado en D1.`,
              parse_mode: "Markdown"
            }),
            signal: AbortSignal.timeout(4000)
          });
        }
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

  return Response.json({
    prospects_by_status: prospectStats.results,
    outcomes: outcomeStats.results,
    runs_summary: totalRuns,
    recent_runs: latestRuns.results,
    suppression_list_size: suppressionCount?.count || 0,
    learning_weights: learningStats,
    limits: LIMITS
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

  if (action === "sent") {
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

    // Update prospect with outcome sent
    await db.prepare(
      "UPDATE prospects SET status = 'sent', outcome = 'sent', updated_at = ? WHERE id = ?"
    ).bind(timestamp, id).run();

    // Auto-suppress email and domain to ensure zero duplicate outreach
    if (prospect.email) {
      await db.prepare("INSERT OR IGNORE INTO suppression (key, reason, created_at) VALUES (?, ?, ?)")
        .bind(prospect.email.toLowerCase(), `Contacted on ${timestamp} (id: ${id})`, timestamp).run();
    }
    if (prospect.website) {
      const domain = getDomain(prospect.website);
      if (domain) {
        await db.prepare("INSERT OR IGNORE INTO suppression (key, reason, created_at) VALUES (?, ?, ?)")
          .bind(domain.toLowerCase(), `Contacted on ${timestamp} (id: ${id})`, timestamp).run();
      }
    }

    // Increment learning table for city, trade, variant
    await recordLearningEvent(db, prospect.city, prospect.trade, prospect.variant_id, true);

    return Response.json({ success: true, message: `Prospect ${id} marked as SENT. Added to suppression.`, id }, { headers });

  } else if (action === "discard") {
    await db.prepare(
      "UPDATE prospects SET status = 'discarded', outcome = 'not_interested', updated_at = ? WHERE id = ?"
    ).bind(timestamp, id).run();
    
    // Add to suppression so this business won't be re-scouted
    const nameCityKey = `${prospect.name.toLowerCase()}_${prospect.city.toLowerCase()}`.replace(/\s+/g, "_");
    await db.prepare("INSERT OR IGNORE INTO suppression (key, reason, created_at) VALUES (?, ?, ?)")
      .bind(nameCityKey, `Discarded on ${timestamp}`, timestamp).run();

    await recordLearningEvent(db, prospect.city, prospect.trade, prospect.variant_id, false);

    return Response.json({ success: true, message: `Prospect ${id} discarded successfully.`, id }, { headers });

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
        WHERE job_id = ?
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
  }
): Promise<{ run_id: string; jobs_enqueued: number; active_cities: string[]; active_trades: string[] }> {
  const db = env.RADAR_DB;
  const runId = crypto.randomUUID();
  const today = new Date().toISOString().split('T')[0];

  const dayOfYear = getDayOfYear(new Date());
  const { activeCities, activeTrades } = await getPriorityTargets(dayOfYear, env, mode, tenantId, overrides);

  // Register run record in D1
  await db.prepare(
    "INSERT INTO runs (id, day, mode, discovered, finalized, ai_calls, hunter_calls, errors_json, created_at) VALUES (?, ?, ?, 0, 0, 0, 0, '[]', ?)"
  ).bind(runId, today, mode, new Date().toISOString()).run();

  let jobsEnqueued = 0;
  for (const city of activeCities) {
    for (const trade of activeTrades) {
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

  console.log(`[Queue Run Initiated] Run ${runId} enqueued ${jobsEnqueued} discovery jobs.`);

  return {
    run_id: runId,
    jobs_enqueued: jobsEnqueued,
    active_cities: activeCities,
    active_trades: activeTrades
  };
}

/**
 * 1. DISCOVERY JOB: Scrapes directory businesses for 1 city + trade, enqueues enrich jobs
 */
async function handleDiscoveryJob(job: RadarJobMessage, env: Env): Promise<void> {
  const { city, trade, overrides } = job.payload;
  console.log(`[Job: discovery] Searching businesses in ${city} for ${trade}...`);

  const scraped = await fetchLocalBusinesses(city, trade, env);

  const seen = new Set<string>();
  const deduped: any[] = [];
  for (const item of scraped) {
    const normName = item.name.toLowerCase().trim().replace(/[^a-z0-9]/g, "");
    const normCity = item.city.toLowerCase().trim().replace(/[^a-z0-9]/g, "");
    const key = `${normName}_${normCity}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(item);
    }
  }

  const bounded = deduped.slice(0, LIMITS.max_discover_per_day);
  let enqueuedEnrich = 0;

  for (const candidate of bounded) {
    const identityKey = generateIdentityKey(candidate.email, candidate.website, candidate.phone, candidate.name, candidate.city);

    // Composite suppression check
    const suppression = await checkSuppressedComposite(env.RADAR_DB, candidate.email, candidate.website, candidate.phone, candidate.name, candidate.city);
    if (suppression) continue;

    // Duplicate & cooldown check
    const overlap = await findExistingProspectOverlap(env.RADAR_DB, candidate.email, candidate.website, candidate.phone, candidate.name, candidate.city);
    if (overlap && isCooldownActive(overlap.overlap.cooldown_until)) continue;

    let prospectId = crypto.randomUUID();
    const existing = await env.RADAR_DB.prepare("SELECT id FROM prospects WHERE identity_key = ?").bind(identityKey).first() as any;
    if (existing) {
      prospectId = existing.id;
    } else {
      await env.RADAR_DB.prepare(`
        INSERT INTO prospects (id, mode, tenant_id, name, city, trade, website, phone, email, score, signals_json, score_breakdown, variant_id, status, source, created_at, updated_at, bvelt_angle, identity_key)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, '{}', '{}', 'missed_calls', 'discovered', ?, ?, ?, 'missed_calls', ?)
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
        candidate.source || 'scraper',
        new Date().toISOString(),
        new Date().toISOString(),
        identityKey
      ).run();
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
        overrides
      }
    });
    enqueuedEnrich++;
  }

  try {
    await env.RADAR_DB.prepare("UPDATE runs SET discovered = discovered + ? WHERE id = ?").bind(enqueuedEnrich, job.run_id).run();
  } catch (e) {}
}

/**
 * 2. ENRICH JOB: Scrapes candidate website HTML, extracts signals, enqueues score job
 */
async function handleEnrichJob(job: RadarJobMessage, env: Env): Promise<void> {
  const { prospect_id, overrides } = job.payload;
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
      payload: { prospect_id, overrides }
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

  if (prospect.website && isRealWebsite(prospect.website)) {
    try {
      const scrapeResult = await scrapeWebsiteContact(prospect.website);
      if (scrapeResult.email) websiteEmail = scrapeResult.email;
      if (scrapeResult.phone && !websitePhone) websitePhone = scrapeResult.phone;
      if (scrapeResult.signals) signals = scrapeResult.signals as any;
    } catch (e: any) {
      console.warn(`Scraping warning on ${prospect.website}: ${e.message}`);
    }
  }

  let emailCandidate = prospect.email || websiteEmail;
  if (!emailCandidate && prospect.website && isRealWebsite(prospect.website) && env.HUNTER_API_KEY) {
    const domain = getDomain(prospect.website);
    if (domain) {
      try {
        const hunterEmail = await fetchHunterEmail(domain, env.HUNTER_API_KEY);
        if (hunterEmail) emailCandidate = hunterEmail;
      } catch (e: any) {}
    }
  }

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

  const signalMetadata = {
    scraped_phone: websitePhone,
    scraped_email: emailCandidate,
    is_email_validated: isEmailValidated,
    signals
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

  await enqueueJob(env, {
    run_id: job.run_id,
    job_id: `score_${prospect_id}`,
    type: 'score',
    mode: job.mode,
    tenant_id: job.tenant_id,
    payload: { prospect_id, overrides }
  });
}

/**
 * 3. SCORE JOB: Computes 0-100 multi-factor score and Bvelt angle
 */
async function handleScoreJob(job: RadarJobMessage, env: Env): Promise<void> {
  const { prospect_id, overrides } = job.payload;
  const prospect = await env.RADAR_DB.prepare("SELECT * FROM prospects WHERE id = ?").bind(prospect_id).first() as any;
  if (!prospect) return;

  if (['approved', 'drafted', 'notified', 'sent'].includes(prospect.status)) return;

  const dayOfYear = getDayOfYear(new Date());
  const { missionConfig } = await getPriorityTargets(dayOfYear, env, job.mode, job.tenant_id, overrides);
  const learningStats = await getLearningStats(env.RADAR_DB);

  let parsedMeta: any = {};
  try {
    parsedMeta = JSON.parse(prospect.signals_json || '{}');
  } catch (e) {}

  const signals = parsedMeta.signals || {};
  const isEmailValidated = !!parsedMeta.is_email_validated;
  const isPriorityCity = missionConfig.geographies.some(c => c.toLowerCase().includes(prospect.city.split(',')[0].toLowerCase()));
  const isPriorityTrade = missionConfig.niches.includes(prospect.trade.toLowerCase());

  const { totalScore, breakdown, confidence, evidenceSummary } = calculateMultiFactorScore(
    prospect,
    prospect.email,
    isEmailValidated,
    prospect.phone,
    isPriorityCity,
    isPriorityTrade,
    learningStats,
    signals
  );

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

  const updatedMeta = {
    ...parsedMeta,
    is_priority_city: isPriorityCity,
    is_priority_trade: isPriorityTrade,
    variant_id: variantId,
    score_breakdown: breakdown,
    bvelt_angle: bveltAngle,
    confidence,
    evidence_summary: evidenceSummary
  };

  await env.RADAR_DB.prepare(`
    UPDATE prospects
    SET score = ?, signals_json = ?, score_breakdown = ?, variant_id = ?, bvelt_angle = ?, status = 'scored', updated_at = ?
    WHERE id = ?
  `).bind(
    totalScore,
    JSON.stringify(updatedMeta),
    JSON.stringify(breakdown),
    variantId,
    bveltAngle,
    new Date().toISOString(),
    prospect_id
  ).run();

  if (totalScore >= (missionConfig.min_score || 50)) {
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
  const { prospect_id, overrides } = job.payload;
  const prospect = await env.RADAR_DB.prepare("SELECT * FROM prospects WHERE id = ?").bind(prospect_id).first() as any;
  if (!prospect) return;

  if (['approved', 'drafted', 'notified', 'sent'].includes(prospect.status)) return;

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
  const { prospect_id, overrides } = job.payload;
  const prospect = await env.RADAR_DB.prepare("SELECT * FROM prospects WHERE id = ?").bind(prospect_id).first() as any;
  if (!prospect) return;

  if (prospect.draft_body && ['drafted', 'notified', 'sent'].includes(prospect.status)) return;

  const dayOfYear = getDayOfYear(new Date());
  const { missionConfig } = await getPriorityTargets(dayOfYear, env, job.mode, job.tenant_id, overrides);
  const primaryLanguage = (missionConfig.languages && missionConfig.languages[0]) || "en";

  let draft: { subject: string; body: string };
  try {
    draft = await generateAICopy(prospect, prospect.variant_id || 'missed_calls', env, missionConfig);
  } catch (e: any) {
    draft = getTradePsychologyFallback(prospect.name, prospect.trade, prospect.city, prospect.variant_id || 'missed_calls', primaryLanguage);
  }

  await env.RADAR_DB.prepare(`
    UPDATE prospects
    SET draft_subject = ?, draft_body = ?, status = 'drafted', updated_at = ?
    WHERE id = ?
  `).bind(draft.subject, draft.body, new Date().toISOString(), prospect_id).run();

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
      "UPDATE prospects SET status = 'hold', outcome = ?, updated_at = ? WHERE id = ?"
    ).bind(gate.reason, new Date().toISOString(), prospect_id).run();
    return; // DO NOT SEND / DO NOT DISPATCH!
  }

  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
    try {
      await dispatchInteractiveTelegramAlert([prospect], [prospect.city], [prospect.trade], env);
      await env.RADAR_DB.prepare("UPDATE prospects SET status = 'notified' WHERE id = ?").bind(prospect_id).run();
    } catch (tgErr: any) {
      console.error("[Queue Outreach] Telegram dispatch error:", tgErr.message);
    }
  }
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
      cooldownUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
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

  // 2. Trust-Stack API Governor Firewall Call
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
  }
): Promise<{ activeCities: string[]; activeTrades: string[]; missionConfig: MissionConfig }> {
  const config: MissionConfig = JSON.parse(JSON.stringify(DEFAULT_FOUNDER_MISSION));

  if (mode === "founder") {
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
  } else if (mode === "tenant" && tenantId) {
    const tenantConfig = await env.RADAR_DB.prepare("SELECT * FROM tenant_config WHERE tenant_id = ?").bind(tenantId).first() as any;
    if (tenantConfig) {
      try {
        config.geographies = JSON.parse(tenantConfig.cities_json);
        config.niches = JSON.parse(tenantConfig.trades_json);
        config.mode = "tenant";
        config.target = `tenant_${tenantId}_customers`;
        if (tenantConfig.countries_json) {
          config.countries = JSON.parse(tenantConfig.countries_json);
        }
        if (tenantConfig.languages_json) {
          config.languages = JSON.parse(tenantConfig.languages_json);
        }
      } catch (e) {
        console.error("Error parsing tenant config: ", e);
      }
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

  // Deterministically rotate 2 cities and 2 trades each day
  const cityIdx1 = dayOfYear % config.geographies.length;
  const cityIdx2 = (dayOfYear + 3) % config.geographies.length;
  
  const tradeIdx1 = (dayOfYear * 2) % config.niches.length;
  const tradeIdx2 = (dayOfYear * 2 + 1) % config.niches.length;

  const activeCities = Array.from(new Set([config.geographies[cityIdx1], config.geographies[cityIdx2]]));
  const activeTrades = Array.from(new Set([config.niches[tradeIdx1], config.niches[tradeIdx2]]));

  return { activeCities, activeTrades, missionConfig: config };
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
): { totalScore: number; breakdown: Record<string, number>; confidence: number; evidenceSummary: string } {
  const isTenantMode = missionConfig?.mode === 'tenant';

  // 1. PLATFORM FIT (0 - 20 pts)
  let platformFitScore = 0;
  if (item.website && isRealWebsite(item.website)) platformFitScore += 5;
  if (signals.lead_capture || signals.contact_form || signals.quote_request) platformFitScore += 8;
  if (signals.emergency || signals.sms_gap) platformFitScore += 7;
  platformFitScore = Math.min(20, platformFitScore);

  // 2. TENANT FIT (0 - 20 pts)
  let tenantFitScore = 0;
  const targetNiches = missionConfig?.niches || [];
  const targetSubniches = missionConfig?.subniches || [];
  const targetKeywords = missionConfig?.icp?.keywords || [];
  const itemText = `${item.name || ''} ${item.trade || ''} ${item.city || ''}`.toLowerCase();

  if (targetNiches.some(n => itemText.includes(n.toLowerCase()) || (item.trade && item.trade.toLowerCase().includes(n.toLowerCase())))) {
    tenantFitScore += 10;
  }
  if (targetSubniches.some(sn => itemText.includes(sn.toLowerCase()))) {
    tenantFitScore += 5;
  }
  if (targetKeywords.some(kw => itemText.includes(kw.toLowerCase()))) {
    tenantFitScore += 5;
  }
  tenantFitScore = Math.min(20, tenantFitScore);

  // 3. EVIDENCE / PAIN SIGNALS (0 - 25 pts)
  let evidenceScore = 0;
  const evidenceList: string[] = [];

  if (signals.emergency) {
    evidenceScore += 7;
    evidenceList.push("24/7 or emergency support language detected");
  }
  if (signals.quote_request || signals.estimate_language) {
    evidenceScore += 6;
    evidenceList.push("Online quote/estimate request option present");
  }
  if (signals.sms_gap) {
    evidenceScore += 6;
    evidenceList.push("SMS/text message CTA absent alongside voice CTA");
  }
  if (signals.multiple_areas || signals.specific_landing_pages) {
    evidenceScore += 3;
    evidenceList.push("Multi-area or targeted service pages");
  }
  if (signals.booking || signals.lead_capture) {
    evidenceScore += 3;
    evidenceList.push("Lead capture or booking widget detected");
  }
  evidenceScore = Math.min(25, evidenceScore);

  // 4. CONTACTABILITY (0 - 20 pts)
  let contactabilityScore = 0;
  if (email) {
    contactabilityScore += isEmailValidated ? 10 : 5;
    if (!email.endsWith("@gmail.com") && !email.endsWith("@yahoo.com") && !email.endsWith("@hotmail.com")) {
      contactabilityScore += 4;
    }
  }
  if (phone) contactabilityScore += 4;
  if (item.website && isRealWebsite(item.website)) contactabilityScore += 2;
  contactabilityScore = Math.min(20, contactabilityScore);

  // 5. COMMERCIAL OPPORTUNITY (0 - 15 pts)
  let commercialScore = 0;
  if (isPriorityCity) commercialScore += 5;
  if (isPriorityTrade) commercialScore += 5;
  
  const tradeKey = `trade:${item.trade}`;
  const winRate = learningStats[tradeKey] || 0;
  if (winRate > 0.6) commercialScore += 5;
  else if (winRate > 0.3) commercialScore += 3;
  commercialScore = Math.min(15, commercialScore);

  const totalScore = Math.min(100, Math.max(0, platformFitScore + tenantFitScore + evidenceScore + contactabilityScore + commercialScore));
  const confidencePercent = email && isEmailValidated ? 90 : email ? 70 : 50;

  const breakdown = {
    platform_fit: platformFitScore,
    tenant_fit: tenantFitScore,
    evidence: evidenceScore,
    contactability: contactabilityScore,
    commercial_opportunity: commercialScore,
    revenue_leak: evidenceScore, // Backwards compatibility alias
    bvelt_fit: platformFitScore + tenantFitScore
  };

  const evidenceSummary = evidenceList.length > 0 
    ? `Evidence: ${evidenceList.join("; ")}.`
    : isTenantMode 
      ? `Qualified prospect matching tenant '${missionConfig?.tenant_id || 'active'}' criteria.`
      : "Standard directory business with active contact details.";

  return { totalScore, breakdown, confidence: confidencePercent, evidenceSummary };
}

/**
 * Fetch Businesses from BizData with fallback to Precise Overpass OSM
 */
async function fetchLocalBusinesses(city: string, trade: string, env: Env): Promise<any[]> {
  const cacheKey = `radar_cache_${city.replace(/[^a-z0-9]/gi, "_")}_${trade}_v2`.toLowerCase();
  
  if (env.CACHE) {
    try {
      const cached = await env.CACHE.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch (e) {
      console.warn("KV Cache read error: ", e);
    }
  }

  const results: any[] = [];

  // 1. Primary: BizData API (No API key needed)
  try {
    const bizDataUrl = `https://bizdata-web.vercel.app/api/businesses?location=${encodeURIComponent(city)}&category=${encodeURIComponent(trade)}&limit=20`;
    const res = await fetch(bizDataUrl, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const data: any = await res.json();
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
    }
  } catch (err: any) {
    console.warn(`BizData lookup bypassed for ${city} - ${trade}: ${err.message}`);
  }

  // 2. Fallback: Overpass OSM with tailored craft/shop/office query
  if (results.length < 5) {
    try {
      const cityClean = city.split(",")[0].trim();
      const cleanTrade = trade.toLowerCase().trim();
      const tradeTags = OVERPASS_TRADE_TAGS[cleanTrade] || [
        `craft="${cleanTrade}"`,
        `shop="${cleanTrade}"`,
        `office="${cleanTrade}"`,
        `amenity="${cleanTrade}"`,
        `craft="contractor"`,
        `amenity="trade"`
      ];
      const tagQueries = tradeTags.map(tag => `nwr[${tag}](area.searchArea);`).join("\n");

      const query = `
        [out:json][timeout:15];
        area["name"="${cityClean}"]->.searchArea;
        (
          ${tagQueries}
        );
        out body 30;
      `;

      const overpassRes = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "BveltRadar/1.0 (contact: radar@bvelt.app)"
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(8000)
      });

      if (overpassRes.ok) {
        const osmData: any = await overpassRes.json();
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
      }
    } catch (overpassErr: any) {
      console.warn("Overpass fallback failed: ", overpassErr.message);
    }
  }

  // Cache in KV for 24h
  if (env.CACHE && results.length > 0) {
    try {
      await env.CACHE.put(cacheKey, JSON.stringify(results), { expirationTtl: 86400 });
    } catch (e) {
      console.warn("KV Cache write error: ", e);
    }
  }

  return results;
}

/**
 * Helper to call Gemini models with 5.5 second timeout and return parsed JSON
 */
async function tryGemini(model: string, apiKey: string, prompt: string): Promise<{ subject: string; body: string } | null> {
  const shortKey = apiKey ? `...${apiKey.substring(apiKey.length - 4)}` : "None";
  console.log(`[Gemini Cascade] Calling model: [${model}] with API Key ending in: [${shortKey}]`);
  
  try {
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const res = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt + " \n\nEnsure you return ONLY valid, raw JSON containing 'subject' and 'body' attributes." }] }],
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
        if (parsed.subject && parsed.body) {
          console.log(`[Gemini Cascade] Success using model: [${model}]`);
          return { subject: parsed.subject, body: parsed.body };
        }
      }
    } else {
      const errText = await res.text();
      console.warn(`[Gemini Cascade] Model [${model}] returned status: [${res.status}]: ${errText}`);
    }
  } catch (e: any) {
    console.warn(`[Gemini Cascade] Model [${model}] request failed:`, e.message || e);
  }
  return null;
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
  const bveltAngle = prospect.bveltAngle || "missed_calls";
  const language = (missionConfig?.languages && missionConfig.languages[0]) || "en";
  const isSpanish = language.toLowerCase().startsWith("es");

  let angleFocus = "";
  if (isSpanish) {
    if (bveltAngle === "after_hours") {
      angleFocus = "ANGLE: AFTER-HOURS EMERGENCY (Urgencias fuera de horario). Veo que se anuncian servicios de urgencia las 24 horas pero solo tienen una línea telefónica de voz. Pregunta respetuosamente qué pasa con esas llamadas de emergencia de alto valor cuando sus técnicos están ocupados en otro servicio.";
    } else if (bveltAngle === "sms_gap") {
      angleFocus = "ANGLE: SMS/TEXT GAP (Falta de mensajería). Veo que muestran el teléfono muy visible, pero no ofrecen opciones de mensajería instantánea ni SMS automáticos para los clientes. Pregunta respetuosamente qué porcentaje de clientes potenciales pierden porque la gente prefiere enviar mensajes en lugar de llamar por teléfono.";
    } else if (bveltAngle === "quote_followup") {
      angleFocus = "ANGLE: QUOTE/ESTIMATE FOLLOW-UP (Seguimiento de presupuestos). Veo que tienen un formulario de solicitud de presupuesto en línea o cotizaciones gratis. Pregunta respetuosamente cómo están haciendo el seguimiento de los presupuestos enviados para asegurarse de cerrar esos trabajos pendientes.";
    } else if (bveltAngle === "lead_reactivation") {
      angleFocus = "ANGLE: LEAD REACTIVATION (Reactivación de prospectos). Veo que atienden múltiples zonas geográficas y tienen formularios de contacto. Pregunta respetuosamente qué pasa con los prospectos fríos o consultas no cerradas una vez que salen de su embudo activo.";
    } else {
      angleFocus = "ANGLE: MISSED CALLS (Llamadas perdidas). Veo su excelente perfil de contratista local. Pregunta respetuosamente qué pasa con las llamadas de clientes nuevos que van directo al correo de voz cuando los técnicos están ocupados en un servicio o bajo un fregadero.";
    }
  } else {
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
  }

  const prompt = isSpanish ? `
    Eres un redactor publicitario experto en ventas (sales copywriter) escribiendo correos fríos directos y profesionales para propietarios de empresas de servicios o contratistas locales de parte de Bvelt (https://bvelt.app).
    
    Destinatario:
    - Empresa: ${prospect.name}
    - Ubicación: ${prospect.city}
    - Trade: ${prospect.trade}

    Instrucciones del ángulo de prospección:
    ${angleFocus}

    REGLAS:
    1. Idioma: Debe estar escrito en Español técnico y profesional (natural de España, México o Latinoamérica según corresponda, sin sonar robótico o traducido). Usa la terminología correcta para el sector ("aire acondicionado", "fontanería" o "plomería", "jardinería", "cerrajería", "reparación de tejados" según aplique).
    2. Longitud: Exactamente entre 90 y 110 palabras totales. Corto, al grano y amigable.
    3. Primera línea: Formula una observación o pregunta concreta y respetuosa basada en las instrucciones del ángulo (e.g. "¿Qué sucede con las llamadas de urgencias cuando el equipo ya está atendiendo un servicio?"). NO afirmes como un hecho probado que están perdiendo dinero o llamadas, pregunta respetuosamente en su lugar.
    4. Exactamente UNA oración que describa qué hace Bvelt: "Bvelt es una aplicación sencilla que reactiva automáticamente prospectos perdidos y recupera trabajos para contratistas mediante SMS automatizados rápidos."
    5. Llamada a la acción suave (Soft CTA): "¿Le interesaría que le envíe un enlace para ver una demo rápida de 2 minutos?" o "Si quiere ver cómo funciona en 2 minutos → https://bvelt.app".
    6. Sin exageraciones, sin promesas vacías de dinero, sin tono de estafa o spam.
    7. PIE DE PÁGINA OBLIGATORIO: Siempre termina el cuerpo del correo con esta línea exacta en inglés para cumplir normativas: "Reply STOP to opt out"

    Responde estrictamente en formato JSON:
    {
      "subject": "Asunto claro y conciso del correo",
      "body": "Cuerpo completo del correo aquí"
    }
  ` : `
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

    Respond strictly in JSON format:
    {
      "subject": "Clear, concise email subject",
      "body": "Complete email body here"
    }
  `;

  // 1. CASCADA GEMINI INTELIGENTE (Primary pipeline to maximize free-tier quota)
  if (env.GEMINI_FOUNDER_API_KEY) {
    const resA1 = await tryGemini("gemini-3.8-flash", env.GEMINI_FOUNDER_API_KEY, prompt);
    if (resA1) return resA1;

    const resA2 = await tryGemini("gemini-3.5-flash-lite", env.GEMINI_FOUNDER_API_KEY, prompt);
    if (resA2) return resA2;

    const resA3 = await tryGemini("gemini-3.1-flash-lite", env.GEMINI_FOUNDER_API_KEY, prompt);
    if (resA3) return resA3;
  }

  if (env.GEMINI_SECONDARY_API_KEY) {
    const resB1 = await tryGemini("gemini-3.8-flash", env.GEMINI_SECONDARY_API_KEY, prompt);
    if (resB1) return resB1;

    const resB2 = await tryGemini("gemini-3.5-flash-lite", env.GEMINI_SECONDARY_API_KEY, prompt);
    if (resB2) return resB2;

    const resB3 = await tryGemini("gemini-3.1-flash-lite", env.GEMINI_SECONDARY_API_KEY, prompt);
    if (resB3) return resB3;
  }

  // 2. GROQ FALLBACK (llama-3.3-70b-versatile)
  if (env.GROQ_API_KEY) {
    console.log(`[Gemini Cascade] Bypassed or failed Gemini cascade. Calling Groq backup...`);
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
          return { subject: content.subject, body: content.body };
        }
      }
    } catch (e: any) {
      console.warn("[Gemini Cascade] Groq API backup failed:", e.message);
    }
  }

  // 3. Static High-Converting Template Fallback
  console.log(`[Gemini Cascade] All AI pipelines failed. Reverting to static backup template.`);
  return getTradePsychologyFallback(prospect.name, prospect.trade, prospect.city, bveltAngle, language);
}

/**
 * Psychological Cold Outreach Templates by Angle
 */
function getTradePsychologyFallback(
  name: string, 
  trade: string, 
  city: string, 
  bveltAngle: string,
  language: string = "en"
): { subject: string; body: string } {
  const cTrade = trade.replace('_', ' ');
  const isSpanish = language.toLowerCase().startsWith("es");

  if (isSpanish) {
    // Technical Spanish fallback templates
    if (bveltAngle === "after_hours") {
      return {
        subject: `¿Servicios de emergencia de ${cTrade} en ${name}?`,
        body: `Hola equipo de ${name},\n\nHe visto su sitio web y me he dado cuenta de que ofrecen servicios de emergencia de ${cTrade} las 24 horas en ${city}, pero dirigen a los clientes exclusivamente a su línea telefónica de voz. ¿Qué pasa con esas llamadas de urgencia cuando sus técnicos ya están ocupados en un servicio?\n\nBvelt es una aplicación sencilla que reactiva automáticamente prospectos perdidos y recupera trabajos para contratistas mediante SMS automatizados rápidos.\n\n¿Le interesaría que le envíe un enlace para ver una demo rápida de 2 minutos?\n\nSaludos cordiales,\nEl equipo de Bvelt\n\nReply STOP to opt out`
      };
    } else if (bveltAngle === "sms_gap") {
      return {
        subject: `¿Sin opción de mensajes de texto para clientes de ${name}?`,
        body: `Hola equipo de ${name},\n\nHe estado revisando su sitio de servicios de ${cTrade} en ${city}. Veo que muestran su teléfono de forma muy visible, pero no ofrecen ninguna opción de chat o SMS de respuesta automática. ¿Qué porcentaje de clientes potenciales se pierden porque prefieren enviar un mensaje de texto en lugar de realizar una llamada de voz?\n\nBvelt es una aplicación sencilla que reactiva automáticamente prospectos perdidos y recupera trabajos para contratistas mediante SMS automatizados rápidos.\n\nSi quiere ver cómo funciona en 2 minutos → https://bvelt.app\n\nSaludos cordiales,\nEl equipo de Bvelt\n\nReply STOP to opt out`
      };
    } else if (bveltAngle === "quote_followup") {
      return {
        subject: `Seguimiento de presupuestos de ${cTrade} en ${name}`,
        body: `Hola equipo de ${name},\n\nHe notado que tienen un formulario de solicitud de presupuesto en línea para sus servicios de ${cTrade} en ${city}. Una vez que envían estas estimaciones de precios, ¿cómo están haciendo el seguimiento actualmente para asegurarse de cerrar esos trabajos pendientes?\n\nBvelt es una aplicación sencilla que reactiva automáticamente prospectos perdidos y recupera trabajos para contratistas mediante SMS automatizados rápidos.\n\n¿Le interesaría que le envíe un enlace para ver una demo rápida de 2 minutos?\n\nSaludos cordiales,\nEl equipo de Bvelt\n\nReply STOP to opt out`
      };
    } else if (bveltAngle === "lead_reactivation") {
      return {
        subject: `Reactivación de prospectos de ${cTrade} en ${city}`,
        body: `Hola equipo de ${name},\n\nHe visto que atienden múltiples zonas en ${city} y que tienen un formulario de contacto en su web. ¿Qué sucede con las consultas que no se cierran inmediatamente cuando salen de su embudo activo?\n\nBvelt es una aplicación sencilla que reactiva automáticamente prospectos perdidos y recupera trabajos para contratistas mediante SMS automatizados rápidos.\n\nSi quiere ver cómo funciona en 2 minutos → https://bvelt.app\n\nSaludos cordiales,\nEl equipo de Bvelt\n\nReply STOP to opt out`
      };
    } else {
      return {
        subject: `Pregunta rápida sobre llamadas perdidas de ${cTrade} en ${name}`,
        body: `Hola equipo de ${name},\n\nHe visto su excelente trabajo de ${cTrade} en ${city}. Cuando su equipo está ocupado atendiendo un servicio o en una instalación, ¿qué ocurre con las llamadas entrantes de clientes que van directo al correo de voz?\n\nBvelt es una aplicación sencilla que reactiva automáticamente prospectos perdidos y recupera trabajos para contratistas mediante SMS automatizados rápidos.\n\nSi quiere ver cómo funciona en 2 minutos → https://bvelt.app\n\nSaludos cordiales,\nEl equipo de Bvelt\n\nReply STOP to opt out`
      };
    }
  }

  // English fallback templates
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

/**
 * Dispatch Interactive Telegram Alert with InlineKeyboardMarkup Action Buttons
 */
async function dispatchInteractiveTelegramAlert(
  topProspects: any[], 
  cities: string[], 
  trades: string[], 
  env: Env
): Promise<void> {
  const botToken = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;
  const today = new Date().toISOString().split('T')[0];

  if (topProspects.length === 0) {
    const emptyMsg = `📡 *Bvelt Radar Report*\n📅 ${today}\n\nRadar hoy: 0 listos. Próximo intento mañana.`;
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: emptyMsg, parse_mode: "Markdown" }),
      signal: AbortSignal.timeout(5000)
    });
    return;
  }

  // 1. Send Daily Digest Header
  const headerText = `📡 *Bvelt Radar Report* 📡\n📅 *${today}*\n📍 *Zonas:* ${cities.join(", ")}\n🛠️ *Trades:* ${trades.join(", ")}\n\nIdentificamos los *Top ${topProspects.length} Prospectos* de hoy:`;
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: headerText, parse_mode: "Markdown" }),
    signal: AbortSignal.timeout(5000)
  });

  // 2. Send Individual Interactive Cards for Top Prospects (Top 5-7)
  const displayProspects = topProspects.slice(0, 7);

  for (let idx = 0; idx < displayProspects.length; idx++) {
    const p = displayProspects[idx];
    const scoreEmoji = p.score >= 80 ? "🔥" : p.score >= 60 ? "⚡" : "🔍";
    const shortReason = Object.entries(p.scoreBreakdown || {})
      .filter(([_, val]) => (val as number) > 0)
      .map(([k]) => k.replace(/_/g, " "))
      .slice(0, 3)
      .join(" · ");

    let cardText = `*${idx + 1}. ${escapeMarkdown(p.name)}* ${scoreEmoji}\n`;
    cardText += `📍 ${escapeMarkdown(p.city)} · 🛠️ ${escapeMarkdown(p.trade)}\n`;
    cardText += `📊 Score: *${p.score}/100* (${shortReason || "high relevance"})\n`;
    cardText += `📧 Email: ${p.emailCandidate ? `\`${escapeMarkdown(p.emailCandidate)}\`` : "None"}\n`;
    cardText += `📞 Tel: ${p.websitePhone ? `\`${escapeMarkdown(p.websitePhone)}\`` : "None"}\n`;
    cardText += `🌐 Web: ${p.website ? `[Link](${p.website})` : "None"}\n\n`;
    cardText += `📝 *Asunto:* _${escapeMarkdown(p.draft_subject)}_\n`;
    cardText += `💬 *Copy Propuesto:*\n\`\`\`\n${escapeMarkdown(p.draft_body)}\n\`\`\``;

    const inlineKeyboard = {
      inline_keyboard: [
        [
          { text: "✅ Mark Sent", callback_data: `sent:${p.id}` },
          { text: "❌ Discard", callback_data: `discard:${p.id}` },
          { text: "🚫 Suppress", callback_data: `suppress:${p.id}` }
        ]
      ]
    };

    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: cardText,
        parse_mode: "Markdown",
        reply_markup: inlineKeyboard
      }),
      signal: AbortSignal.timeout(5000)
    });
  }
}

/**
 * Website Scraper for contact info & revenue-leak signals detection (5s timeout)
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

  try {
    const targetUrl = url.startsWith("http") ? url : `https://${url}`;
    const res = await fetch(targetUrl, {
      headers: { "User-Agent": "BveltRadar/1.0 (contact: radar@bvelt.app)" },
      signal: AbortSignal.timeout(5000)
    });

    if (!res.ok) return { email: null, phone: null, signals };
    const html = await res.text();
    const normalizedHtml = html.toLowerCase();

    // 1. Email extraction
    const mailtoMatch = html.match(/href="mailto:([^"?#]+)"/i);
    let email: string | null = mailtoMatch ? mailtoMatch[1].trim() : null;

    if (!email) {
      const emailRegex = /[a-zA-Z0-9._%+-]+@(?!gmail\.com)(?!yahoo\.com)(?!hotmail\.com)[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;
      const matches = html.match(emailRegex);
      if (matches && matches.length > 0) {
        const business = matches.filter(e => /^(info|office|contact|hello|service|admin|support|sales)/i.test(e));
        email = business.length > 0 ? business[0] : matches[0];
      }
    }

    // 2. Phone extraction
    const telMatch = html.match(/href="tel:([^"]+)"/i);
    let phone: string | null = telMatch ? telMatch[1].trim() : null;

    if (!phone) {
      const phoneRegex = /(?:\+?1[-. ]?)?\(?([0-9]{3})\)?[-. ]?([0-9]{3})[-. ]?([0-9]{4})/g;
      const phoneMatches = html.match(phoneRegex);
      if (phoneMatches && phoneMatches.length > 0) {
        phone = phoneMatches[0];
      }
    }

    // 3. Heuristics Detection
    signals.contact_form = /contact-form|contact_form|contacto|formulario|<form|textarea|input type="text"/i.test(normalizedHtml);
    signals.quote_request = /request-a-quote|get an estimate|free estimate|request quote|request estimate|quote request|presupuesto|cotizacion|cotización|cotizar|estimacion|estimación/i.test(normalizedHtml);
    signals.booking = /book online|book appointment|schedule online|booking|schedule appointment|book now|reservar|reserva|agendar|cita/i.test(normalizedHtml);
    signals.call_cta = /call now|call us|phone:|tel:|click to call|llamar|telefono|teléfono|contacto/i.test(normalizedHtml);
    signals.emergency = /emergency|24\/7|after hours|24 hour|after-hours|emergency service|24 hours|urgencia|urgencias|24 horas|guardia|emergencia/i.test(normalizedHtml);
    signals.multiple_areas = /service areas|serving|areas we serve|locations|serve areas|cobertura|zonas|sucursales|ciudades/i.test(normalizedHtml);
    signals.specific_landing_pages = /href="\/services\/|href="\/service\/|href="\/areas\/|href="\/servicios\/|href="\/cobertura\//i.test(normalizedHtml);
    signals.estimate_language = /estimate|quote|calculator|bidding|bid|presupuesto|cotizar|cotizacion|cotización|estimacion|estimación|tarifa|precio/i.test(normalizedHtml);
    signals.lead_capture = /newsletter|subscribe|opt-in|sign up for|promotions|coupon|boletin|boletín|suscribir|suscríbete|descuento|promocion|promoción/i.test(normalizedHtml);
    
    const hasSmsLanguage = /text us|sms|send a text|text option|escribenos|escríbenos|enviar texto|mensaje de texto|whatsapp|whastapp/i.test(normalizedHtml);
    signals.sms_gap = (signals.call_cta || !!phone) && !hasSmsLanguage;

    return { email, phone, signals };
  } catch (err) {
    return { email: null, phone: null, signals };
  }
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
 * Autonomous Hunter Sequences Outreach Dispatcher
 */
export async function sendOrQueueOutreach(prospect: any, runId: string, env: Env): Promise<{ success: boolean; reason: string }> {
  // Pre-addition Checklist:
  // 1. Suppression check
  const suppression = await checkSuppressedComposite(
    env.RADAR_DB,
    prospect.email,
    prospect.website,
    prospect.phone,
    prospect.name,
    prospect.city
  );
  if (suppression) {
    return { success: false, reason: `SUPPRESSED: ${suppression.reason}` };
  }

  // 2. Cooldown check
  const overlap = await findExistingProspectOverlap(
    env.RADAR_DB,
    prospect.email,
    prospect.website,
    prospect.phone,
    prospect.name,
    prospect.city
  );
  if (overlap && isCooldownActive(overlap.overlap.cooldown_until)) {
    return { success: false, reason: `COOLDOWN_ACTIVE until ${overlap.overlap.cooldown_until}` };
  }

  // 3. Verified email check
  if (!prospect.email) {
    return { success: false, reason: "MISSING_EMAIL" };
  }
  const emailVer = await verifyEmail(prospect.email, env);
  if (!emailVer.valid) {
    return { success: false, reason: `EMAIL_VERIFICATION_FAILED: ${emailVer.reason}` };
  }

  // 4. Score threshold check
  if (prospect.score !== undefined && prospect.score < 30) {
    return { success: false, reason: `SCORE_TOO_LOW: Score ${prospect.score} below threshold 30` };
  }

  // 5. Trust-Stack approval check
  const trustGate = await verifyTrustStackGate(prospect, runId, env);
  if (!trustGate.allowed) {
    return { success: false, reason: `TRUST_STACK_BLOCKED: ${trustGate.reason}` };
  }

  // 6. Sender governor check
  const governor = await checkSenderGovernor(env);
  if (!governor.allowed) {
    return { success: false, reason: `SENDER_GOVERNOR_BLOCKED: ${governor.reason}` };
  }

  // Re-use Hunter Sequences / Leads API
  if (env.HUNTER_API_KEY) {
    try {
      const nameParts = (prospect.name || "").trim().split(" ");
      const firstName = nameParts[0] || "Team";
      const lastName = nameParts.slice(1).join(" ") || "";

      const hunterRes = await fetch(`https://api.hunter.io/v2/leads?api_key=${env.HUNTER_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: prospect.email,
          first_name: firstName,
          last_name: lastName,
          company: prospect.name,
          website: prospect.website || "",
          notes: `Bvelt Radar Prospect - ${prospect.city} (${prospect.trade})`,
          custom_attributes: {
            draft_subject: prospect.draft_subject,
            draft_body: prospect.draft_body,
            bvelt_angle: prospect.bvelt_angle
          }
        }),
        signal: AbortSignal.timeout(5000)
      });

      if (hunterRes.ok || hunterRes.status === 201 || hunterRes.status === 409) {
        await incrementSenderSends(env.RADAR_DB);
        const timestamp = new Date().toISOString();
        await env.RADAR_DB.prepare(
          "UPDATE prospects SET status = 'sent', outcome = 'sent', last_contact_at = ?, updated_at = ? WHERE id = ?"
        ).bind(timestamp, timestamp, prospect.id).run();

        await env.RADAR_DB.prepare(
          "INSERT OR IGNORE INTO suppression (key, reason, created_at) VALUES (?, ?, ?)"
        ).bind(prospect.email.toLowerCase(), `Contacted via Hunter on ${timestamp}`, timestamp).run();

        return { success: true, reason: "Added to Hunter Sequence and marked sent successfully" };
      } else {
        const errBody = await hunterRes.text();
        await recordNegativeSignal(env.RADAR_DB, 'error', `Hunter API HTTP ${hunterRes.status}: ${errBody}`);
        return { success: false, reason: `HUNTER_API_ERROR: HTTP ${hunterRes.status} - ${errBody}` };
      }
    } catch (err: any) {
      await recordNegativeSignal(env.RADAR_DB, 'error', err.message);
      return { success: false, reason: `HUNTER_API_EXCEPTION: ${err.message}` };
    }
  }

  // Local fallback simulation
  await incrementSenderSends(env.RADAR_DB);
  const timestamp = new Date().toISOString();
  await env.RADAR_DB.prepare(
    "UPDATE prospects SET status = 'sent', outcome = 'sent', last_contact_at = ?, updated_at = ? WHERE id = ?"
  ).bind(timestamp, timestamp, prospect.id).run();

  return { success: true, reason: "LOCAL_SIMULATED_OUTREACH: Marked sent and recorded governor send count" };
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

  try {
    if (normEmail) {
      const match = await db.prepare("SELECT * FROM prospects WHERE email = ?").bind(normEmail).first();
      if (match) return { overlap: match, reason: "Same email match: " + normEmail };
    }

    if (normDomain) {
      const match = await db.prepare("SELECT * FROM prospects WHERE website LIKE ?").bind(`%${normDomain}%`).first();
      if (match) return { overlap: match, reason: "Same website domain match: " + normDomain };
    }

    if (normPhone) {
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
  }
): Promise<void> {
  const timestamp = new Date().toISOString();
  const keys = [`city:${city}`, `trade:${trade}`];
  if (variantId) keys.push(`variant:${variantId}`);
  if (details?.angle) keys.push(`angle:${details.angle}`);
  if (details?.response_type) keys.push(`response:${details.response_type}`);
  if (details?.outcome) keys.push(`outcome:${details.outcome}`);

  for (const key of keys) {
    try {
      const existing = await db.prepare("SELECT * FROM learning_stats WHERE key = ?").bind(key).first() as any;
      if (existing) {
        const newSent = existing.sent_count + (isSent ? 1 : 0);
        const newTotal = existing.total_count + 1;
        await db.prepare("UPDATE learning_stats SET sent_count = ?, total_count = ?, updated_at = ? WHERE key = ?")
          .bind(newSent, newTotal, timestamp, key).run();
      } else {
        await db.prepare("INSERT INTO learning_stats (key, sent_count, total_count, updated_at) VALUES (?, ?, 1, ?)")
          .bind(key, isSent ? 1 : 0, timestamp).run();
      }
    } catch (e) {
      console.warn(`Learning event save warning for ${key}: `, e);
    }
  }
}

/**
 * Retrieve Learning Win Rates by City/Trade/Variant
 */
async function getLearningStats(db: D1Database): Promise<Record<string, number>> {
  const winRates: Record<string, number> = {};
  try {
    const rows = await db.prepare("SELECT key, sent_count, total_count FROM learning_stats WHERE total_count >= 5").all() as any;
    if (rows && rows.results) {
      for (const r of rows.results) {
        winRates[r.key] = r.total_count > 0 ? (r.sent_count / r.total_count) : 0;
      }
    }
  } catch (e) {
    console.warn("Learning stats query fallback: ", e);
  }
  return winRates;
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
