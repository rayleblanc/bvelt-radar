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
}

export interface Env {
  RADAR_DB: D1Database;
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
  FOUNDING_CITIES?: string; // e.g. "Tampa, FL;Austin, TX"
  FOUNDING_TRADES?: string; // e.g. "landscaping;hvac;plumbing"
}

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
      const serviceKey = env.FOUNDER_SERVICE_KEY;
      if (!authHeader || !authHeader.startsWith("Bearer ") || authHeader.split(" ")[1] !== serviceKey) {
        return Response.json({ error: "Unauthorized. Missing or invalid service key." }, { status: 401, headers: corsHeaders });
      }

      // 4. Stats Endpoint (Includes learning performance)
      if (path === "/stats" && method === "GET") {
        return await handleStats(env, corsHeaders);
      }

      // 5. Trigger Prospecting Pipeline Manual Execution
      if (path === "/run" && method === "POST") {
        const mode = url.searchParams.get("mode") || "founder";
        const tenantId = url.searchParams.get("tenant_id") || null;
        
        ctx.waitUntil(
          (async () => {
            try {
              await runProspectingPipeline(env, mode, tenantId);
            } catch (err: any) {
              console.error("Pipeline failure in background:", err);
            }
          })()
        );

        return Response.json({
          message: "Autonomous prospecting pipeline started.",
          mode,
          tenant_id: tenantId,
          timestamp: new Date().toISOString()
        }, { headers: corsHeaders });
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

      return Response.json({ error: "Not Found" }, { status: 404, headers: corsHeaders });

    } catch (error: any) {
      return Response.json({ error: error.message || "Internal Server Error" }, { status: 500, headers: corsHeaders });
    }
  },

  // Daily Scheduled Trigger (Cron: "0 12 * * *")
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log(`[Radar Cron] Scheduled trigger initiated at ${new Date().toISOString()}`);
    ctx.waitUntil(runProspectingPipeline(env, "founder", null));
  }
};

/**
 * Enhanced Health Check with usage metrics
 */
async function handleHealth(env: Env, headers: Record<string, string>): Promise<Response> {
  const db = env.RADAR_DB;
  const today = new Date().toISOString().split('T')[0];

  let prospectsToday = 0;
  let hunterUsedToday = 0;
  let lastRunDate: string | null = null;

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

  const hunterRemaining = Math.max(0, LIMITS.max_hunter_credits_per_day - hunterUsedToday);

  return Response.json({
    status: "healthy",
    prospects_today: prospectsToday,
    hunter_remaining_estimate: hunterRemaining,
    last_run: lastRunDate,
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
    // Optional Trust Stack verification before marking
    if (env.TRUST_STACK_URL && env.TRUST_SERVICE_KEY) {
      try {
        await fetch(`${env.TRUST_STACK_URL}/api/budget/check`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${env.TRUST_SERVICE_KEY}`
          },
          body: JSON.stringify({ scope: "founder.outreach", amount: 1, prospect_id: id }),
          signal: AbortSignal.timeout(3000)
        });
      } catch (err) {
        console.warn("Trust Stack unreachable, proceeding locally: ", err);
      }
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
 * Main Autonomous Prospecting Pipeline
 */
async function runProspectingPipeline(env: Env, mode: string, tenantId: string | null): Promise<any> {
  const db = env.RADAR_DB;
  const runId = crypto.randomUUID();
  const today = new Date().toISOString().split('T')[0];

  // Dynamic ranking & targets selection
  const dayOfYear = getDayOfYear(new Date());
  const { activeCities, activeTrades } = await getPriorityTargets(dayOfYear, env, mode, tenantId);

  console.log(`[Pipeline] Running mode: ${mode}. Targets: [${activeCities.join(", ")}] | [${activeTrades.join(", ")}]`);

  let runDiscovered = 0;
  let runFinalized = 0;
  let runAiCalls = 0;
  let runHunterCalls = 0;
  const runErrors: string[] = [];

  // Register run audit row
  await db.prepare(
    "INSERT INTO runs (id, day, mode, discovered, finalized, ai_calls, hunter_calls, errors_json, created_at) VALUES (?, ?, ?, 0, 0, 0, 0, '[]', ?)"
  ).bind(runId, today, mode, new Date().toISOString()).run();

  // Load historical learning feedback stats
  const learningStats = await getLearningStats(db);

  // Discovery phase: BizData & Overpass
  const candidates: any[] = [];

  for (const city of activeCities) {
    for (const trade of activeTrades) {
      try {
        const scraped = await fetchLocalBusinesses(city, trade, env);
        runDiscovered += scraped.length;
        candidates.push(...scraped);
      } catch (err: any) {
        console.error(`Discovery error for ${city} - ${trade}:`, err);
        runErrors.push(`Fetch failed for ${city} - ${trade}: ${err.message}`);
      }
    }
  }

  // Pre-filter: Deduplicate by domain and normalized name+city before enriching
  const seenKeys = new Set<string>();
  const dedupedCandidates: any[] = [];

  for (const item of candidates) {
    const normName = item.name.toLowerCase().trim().replace(/[^a-z0-9]/g, "");
    const normCity = item.city.toLowerCase().trim().replace(/[^a-z0-9]/g, "");
    const nameCityKey = `${normName}_${normCity}`;
    const domainKey = item.website ? getDomain(item.website) : null;

    if (seenKeys.has(nameCityKey) || (domainKey && seenKeys.has(domainKey))) {
      continue;
    }

    seenKeys.add(nameCityKey);
    if (domainKey) seenKeys.add(domainKey);
    dedupedCandidates.push(item);
  }

  const boundedCandidates = dedupedCandidates.slice(0, LIMITS.max_discover_per_day);
  console.log(`[Pipeline] ${boundedCandidates.length} unique candidates ready for multi-factor enrichment.`);

  const finalizedProspects: any[] = [];

  for (const item of boundedCandidates) {
    try {
      // 1. Suppression check
      const suppressKey = `${item.name.toLowerCase()}_${item.city.toLowerCase()}`.replace(/\s+/g, "_");
      const isSuppressedName = await checkSuppressed(db, suppressKey);
      if (isSuppressedName) continue;

      if (item.website) {
        const domain = getDomain(item.website);
        if (domain) {
          const isSuppressedDomain = await checkSuppressed(db, domain);
          if (isSuppressedDomain) continue;
        }
      }

      // 2. HTML Web Scraping (5s timeout)
      let websiteEmail: string | null = null;
      let websitePhone: string | null = item.phone || null;

      if (item.website && isRealWebsite(item.website)) {
        try {
          const scrapeResult = await scrapeWebsiteContact(item.website);
          if (scrapeResult.email) websiteEmail = scrapeResult.email;
          if (scrapeResult.phone && !websitePhone) websitePhone = scrapeResult.phone;
        } catch (e: any) {
          console.warn(`Scraping warning on ${item.website}: ${e.message}`);
        }
      }

      // 3. Hunter.io Email Finder (Only if no email found yet and budget allows)
      let emailCandidate = item.email || websiteEmail;
      if (!emailCandidate && item.website && isRealWebsite(item.website) && env.HUNTER_API_KEY && runHunterCalls < LIMITS.max_hunter_credits_per_day) {
        const domain = getDomain(item.website);
        if (domain) {
          try {
            runHunterCalls++;
            const hunterEmail = await fetchHunterEmail(domain, env.HUNTER_API_KEY);
            if (hunterEmail) {
              emailCandidate = hunterEmail;
            }
          } catch (e: any) {
            runErrors.push(`Hunter query failed for ${domain}: ${e.message}`);
          }
        }
      }

      // 4. Abstract API Email Validation (Only if candidate email present)
      let isEmailValidated = false;
      if (emailCandidate) {
        if (env.ABSTRACT_API_KEY) {
          try {
            const valid = await validateEmailWithAbstract(emailCandidate, env.ABSTRACT_API_KEY);
            if (!valid) {
              emailCandidate = null;
            } else {
              isEmailValidated = true;
            }
          } catch (e: any) {
            isEmailValidated = true; // Graceful degrade
          }
        } else {
          isEmailValidated = true;
        }
      }

      // 5. Multi-Factor Scoring (0-100)
      const isPriorityCity = PRIORITY_CITIES.some(c => c.toLowerCase().includes(item.city.split(',')[0].toLowerCase()));
      const isPriorityTrade = PRIORITY_TRADES.includes(item.trade.toLowerCase());
      
      const { totalScore, breakdown } = calculateMultiFactorScore(
        item,
        emailCandidate,
        isEmailValidated,
        websitePhone,
        isPriorityCity,
        isPriorityTrade,
        learningStats
      );

      // Select A/B testing variant (50% missed_calls, 50% dormant_leads)
      const variantId = (hashCode(item.name + item.city) % 2 === 0) ? "missed_calls" : "dormant_leads";

      const prospectId = crypto.randomUUID();
      const finalStatus = emailCandidate ? "enriched" : "discovered";

      const signalMetadata = {
        scraped_phone: websitePhone,
        scraped_email: emailCandidate,
        is_priority_city: isPriorityCity,
        is_priority_trade: isPriorityTrade,
        variant_id: variantId,
        score_breakdown: breakdown
      };

      await db.prepare(`
        INSERT INTO prospects (id, mode, tenant_id, name, city, trade, website, phone, email, score, signals_json, score_breakdown, variant_id, status, source, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        prospectId,
        mode,
        tenantId,
        item.name,
        item.city,
        item.trade,
        item.website || null,
        websitePhone || null,
        emailCandidate || null,
        totalScore,
        JSON.stringify(signalMetadata),
        JSON.stringify(breakdown),
        variantId,
        finalStatus,
        item.source,
        new Date().toISOString(),
        new Date().toISOString()
      ).run();

      item.id = prospectId;
      item.score = totalScore;
      item.emailCandidate = emailCandidate;
      item.websitePhone = websitePhone;
      item.variantId = variantId;
      item.scoreBreakdown = breakdown;

      finalizedProspects.push(item);

    } catch (itemErr: any) {
      console.error(`Error processing candidate ${item.name}:`, itemErr);
      runErrors.push(`Candidate error (${item.name}): ${itemErr.message}`);
    }
  }

  // Top finalization cutoff (Max 10 prospects per day)
  const topProspects = finalizedProspects
    .sort((a, b) => b.score - a.score)
    .slice(0, LIMITS.max_finalize_per_day);

  console.log(`[Pipeline] Finalizing top ${topProspects.length} prospects with tailored trade copywriting.`);

  // 6. AI Copywriting Generation with Trade Psychology
  for (const prospect of topProspects) {
    if (runAiCalls >= LIMITS.max_ai_calls_per_day) {
      const fallback = getTradePsychologyFallback(prospect.name, prospect.trade, prospect.city, prospect.variantId);
      await db.prepare(`
        UPDATE prospects 
        SET draft_subject = ?, draft_body = ?, status = 'drafted', updated_at = ?
        WHERE id = ?
      `).bind(fallback.subject, fallback.body, new Date().toISOString(), prospect.id).run();
      
      prospect.draft_subject = fallback.subject;
      prospect.draft_body = fallback.body;
      runFinalized++;
      continue;
    }

    try {
      runAiCalls++;
      const draft = await generateAICopy(prospect, prospect.variantId, env);
      
      await db.prepare(`
        UPDATE prospects 
        SET draft_subject = ?, draft_body = ?, status = 'drafted', updated_at = ?
        WHERE id = ?
      `).bind(draft.subject, draft.body, new Date().toISOString(), prospect.id).run();

      prospect.draft_subject = draft.subject;
      prospect.draft_body = draft.body;
      runFinalized++;

    } catch (err: any) {
      console.warn(`AI generation fallback for ${prospect.name}: ${err.message}`);
      runErrors.push(`AI Draft fail for ${prospect.name}: ${err.message}`);
      
      const fallback = getTradePsychologyFallback(prospect.name, prospect.trade, prospect.city, prospect.variantId);
      await db.prepare(`
        UPDATE prospects 
        SET draft_subject = ?, draft_body = ?, status = 'drafted', updated_at = ?
        WHERE id = ?
      `).bind(fallback.subject, fallback.body, new Date().toISOString(), prospect.id).run();
      
      prospect.draft_subject = fallback.subject;
      prospect.draft_body = fallback.body;
      runFinalized++;
    }
  }

  // Update run stats
  await db.prepare(`
    UPDATE runs 
    SET discovered = ?, finalized = ?, ai_calls = ?, hunter_calls = ?, errors_json = ?
    WHERE id = ?
  `).bind(runDiscovered, runFinalized, runAiCalls, runHunterCalls, JSON.stringify(runErrors), runId).run();

  // 7. Telegram Interactive Notification Dispatch
  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
    try {
      await dispatchInteractiveTelegramAlert(topProspects, activeCities, activeTrades, env);
      
      for (const p of topProspects) {
        await db.prepare("UPDATE prospects SET status = 'notified' WHERE id = ?").bind(p.id).run();
      }
    } catch (tgErr: any) {
      console.error("Telegram notification failed: ", tgErr.message);
      runErrors.push(`Telegram dispatch error: ${tgErr.message}`);
    }
  }

  return {
    run_id: runId,
    mode,
    activeCities,
    activeTrades,
    discovered: runDiscovered,
    finalized: runFinalized,
    errors: runErrors
  };
}

/**
 * Deterministic Regional & Trade Target Selector
 */
async function getPriorityTargets(
  dayOfYear: number, 
  env: Env, 
  mode: string, 
  tenantId: string | null
): Promise<{ activeCities: string[]; activeTrades: string[] }> {
  let targetCities = PRIORITY_CITIES;
  let targetTrades = PRIORITY_TRADES;

  if (mode === "founder") {
    if (env.FOUNDING_CITIES) {
      targetCities = env.FOUNDING_CITIES.split(";").map(c => c.trim()).filter(Boolean);
    }
    if (env.FOUNDING_TRADES) {
      targetTrades = env.FOUNDING_TRADES.split(";").map(t => t.trim()).filter(Boolean);
    }
  } else if (mode === "tenant" && tenantId) {
    const tenantConfig = await env.RADAR_DB.prepare("SELECT * FROM tenant_config WHERE tenant_id = ?").bind(tenantId).first() as any;
    if (tenantConfig) {
      try {
        targetCities = JSON.parse(tenantConfig.cities_json);
        targetTrades = JSON.parse(tenantConfig.trades_json);
      } catch (e) {
        console.error("Error parsing tenant config: ", e);
      }
    }
  }

  // Deterministically rotate 2 cities and 2 trades each day
  const cityIdx1 = dayOfYear % targetCities.length;
  const cityIdx2 = (dayOfYear + 3) % targetCities.length;
  
  const tradeIdx1 = (dayOfYear * 2) % targetTrades.length;
  const tradeIdx2 = (dayOfYear * 2 + 1) % targetTrades.length;

  const activeCities = Array.from(new Set([targetCities[cityIdx1], targetCities[cityIdx2]]));
  const activeTrades = Array.from(new Set([targetTrades[tradeIdx1], targetTrades[tradeIdx2]]));

  return { activeCities, activeTrades };
}

/**
 * Multi-Factor Scoring Algorithm (0-100)
 */
function calculateMultiFactorScore(
  item: any,
  email: string | null,
  isEmailValidated: boolean,
  phone: string | null,
  isPriorityCity: boolean,
  isPriorityTrade: boolean,
  learningStats: Record<string, number>
): { totalScore: number; breakdown: Record<string, number> } {
  let score = 0;
  const breakdown: Record<string, number> = {};

  // 1. Real Website (+22)
  if (item.website && isRealWebsite(item.website)) {
    score += 22;
    breakdown.website = 22;
  } else {
    breakdown.website = 0;
  }

  // 2. Business Email Found & Validated (+28)
  if (email && isEmailValidated) {
    score += 28;
    breakdown.email_validated = 28;
  } else if (email) {
    score += 15;
    breakdown.email_validated = 15;
  } else {
    breakdown.email_validated = 0;
  }

  // 3. Phone Available (+12)
  if (phone) {
    score += 12;
    breakdown.phone = 12;
  } else {
    breakdown.phone = 0;
  }

  // 4. Professional Business Handle (+8)
  if (email && /^(info|office|contact|hello|service|admin|support|sales|team|work)@/i.test(email)) {
    score += 8;
    breakdown.business_handle = 8;
  } else {
    breakdown.business_handle = 0;
  }

  // 5. Priority City (+10)
  if (isPriorityCity) {
    score += 10;
    breakdown.priority_city = 10;
  } else {
    breakdown.priority_city = 0;
  }

  // 6. Priority Trade (+8)
  if (isPriorityTrade) {
    score += 8;
    breakdown.priority_trade = 8;
  } else {
    breakdown.priority_trade = 0;
  }

  // 7. Overpass Useful Metadata Tags (+6)
  if (item.source === "overpass" && (item.website || item.phone)) {
    score += 6;
    breakdown.overpass_metadata = 6;
  } else {
    breakdown.overpass_metadata = 0;
  }

  // 8. Dual Contact Scrape Bonus (+6)
  if (phone && email) {
    score += 6;
    breakdown.dual_contact_bonus = 6;
  } else {
    breakdown.dual_contact_bonus = 0;
  }

  // 9. Historical Learning Conversion Boost (+5 to +8)
  const cityKey = `city:${item.city}`;
  const tradeKey = `trade:${item.trade}`;
  const cityWinRate = learningStats[cityKey] || 0;
  const tradeWinRate = learningStats[tradeKey] || 0;

  if (cityWinRate >= 0.5 || tradeWinRate >= 0.5) {
    const boost = Math.min(8, Math.max(5, Math.round((cityWinRate + tradeWinRate) * 4)));
    score += boost;
    breakdown.learning_feedback_boost = boost;
  } else {
    breakdown.learning_feedback_boost = 0;
  }

  const totalScore = Math.min(100, Math.max(0, score));
  return { totalScore, breakdown };
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
      const tradeTags = OVERPASS_TRADE_TAGS[trade.toLowerCase()] || ['craft="contractor"', 'amenity="trade"'];
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
  env: Env
): Promise<{ subject: string; body: string }> {
  const variantFocus = variantId === "missed_calls" 
    ? "FOCUS ON MISSED CALLS & LOST ESTIMATES: When technicians are on a roof or under a sink, calls go straight to voicemail and clients call the next competitor. Bvelt automatically texts back missed callers in seconds to lock in the job."
    : "FOCUS ON DORMANT INQUIRIES & PAST ESTIMATES: Quotes sent weeks ago go cold because following up manually takes too long. Bvelt automatically follows up on unaccepted estimates to recover lost revenue.";

  const prompt = `
    You are an expert sales copywriter writing cold outreach to contractor owners for Bvelt (https://bvelt.app).
    
    Target:
    - Business: ${prospect.name}
    - Location: ${prospect.city}
    - Trade: ${prospect.trade}

    Variant Strategy:
    ${variantFocus}

    RULES:
    1. Length: Exactly 90 to 110 words total. Punchy and contractor-friendly.
    2. First Line: Concrete observation ("I noticed ${prospect.name} provides ${prospect.trade} services in ${prospect.city}.").
    3. Exactly ONE sentence describing what Bvelt does: "Bvelt is a simple app that automatically re-engages missed leads and recovers lost jobs for contractors via fast, automated SMS."
    4. Soft Call-to-Action: "If you'd like to see how it works in 2 minutes → https://bvelt.app" or "Should I send over a quick 2-minute demo link?".
    5. Zero hype, zero guaranteed dollar promises, zero corporate jargon.
    6. MANDATORY FOOTER: Always end the email body with this exact line: "Reply STOP to opt out"

    Respond strictly in JSON format:
    {
      "subject": "Clear, concise email subject",
      "body": "Complete email body here"
    }
  `;

  // 1. CASCADA GEMINI INTELIGENTE (Primary pipeline to maximize free-tier quota)
  if (env.GEMINI_FOUNDER_API_KEY) {
    // a) Key A + "gemini-3.8-flash"
    const resA1 = await tryGemini("gemini-3.8-flash", env.GEMINI_FOUNDER_API_KEY, prompt);
    if (resA1) return resA1;

    // b) Key A + "gemini-3.5-flash-lite"
    const resA2 = await tryGemini("gemini-3.5-flash-lite", env.GEMINI_FOUNDER_API_KEY, prompt);
    if (resA2) return resA2;

    // b-fallback) Key A + "gemini-3.1-flash-lite"
    const resA3 = await tryGemini("gemini-3.1-flash-lite", env.GEMINI_FOUNDER_API_KEY, prompt);
    if (resA3) return resA3;
  }

  if (env.GEMINI_SECONDARY_API_KEY) {
    // c) Key B + "gemini-3.8-flash"
    const resB1 = await tryGemini("gemini-3.8-flash", env.GEMINI_SECONDARY_API_KEY, prompt);
    if (resB1) return resB1;

    // d) Key B + "gemini-3.5-flash-lite"
    const resB2 = await tryGemini("gemini-3.5-flash-lite", env.GEMINI_SECONDARY_API_KEY, prompt);
    if (resB2) return resB2;

    // d-fallback) Key B + "gemini-3.1-flash-lite"
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
  return getTradePsychologyFallback(prospect.name, prospect.trade, prospect.city, variantId);
}

/**
 * Psychological Cold Outreach Templates by Variant
 */
function getTradePsychologyFallback(
  name: string, 
  trade: string, 
  city: string, 
  variantId: string
): { subject: string; body: string } {
  if (variantId === "missed_calls") {
    return {
      subject: `Quick question regarding missed ${trade} calls at ${name}`,
      body: `Hi ${name} team,\n\nI noticed ${name} provides ${trade} services in ${city}.\n\nWhen busy on a job or driving between sites, incoming customer calls often go straight to voicemail and immediately hire the next company on Google. Bvelt is a simple app that automatically re-engages missed leads and recovers lost jobs for contractors via fast, automated SMS.\n\nIf you'd like to see how it works in 2 minutes → https://bvelt.app\n\nBest regards,\nBvelt Team\n\nReply STOP to opt out`
    };
  } else {
    return {
      subject: `Reviving past ${trade} quotes in ${city}`,
      body: `Hi ${name} team,\n\nI noticed ${name} provides ${trade} services in ${city}.\n\nFollowing up on sent estimates takes hours, leaving thousands of dollars in unaccepted quotes on the table each month. Bvelt is a simple app that automatically re-engages missed leads and recovers lost jobs for contractors via fast, automated SMS.\n\nShould I send over a quick 2-minute demo link?\n\nBest regards,\nBvelt Team\n\nReply STOP to opt out`
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
 * Website Scraper for mailto: and tel: links (5s timeout)
 */
async function scrapeWebsiteContact(url: string): Promise<{ email: string | null; phone: string | null }> {
  try {
    const targetUrl = url.startsWith("http") ? url : `https://${url}`;
    const res = await fetch(targetUrl, {
      headers: { "User-Agent": "BveltRadar/1.0 (contact: radar@bvelt.app)" },
      signal: AbortSignal.timeout(5000)
    });

    if (!res.ok) return { email: null, phone: null };
    const html = await res.text();

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

    const telMatch = html.match(/href="tel:([^"]+)"/i);
    let phone: string | null = telMatch ? telMatch[1].trim() : null;

    if (!phone) {
      const phoneRegex = /(?:\+?1[-. ]?)?\(?([0-9]{3})\)?[-. ]?([0-9]{3})[-. ]?([0-9]{4})/g;
      const phoneMatches = html.match(phoneRegex);
      if (phoneMatches && phoneMatches.length > 0) {
        phone = phoneMatches[0];
      }
    }

    return { email, phone };
  } catch (err) {
    return { email: null, phone: null };
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
 * Abstract Email Deliverability Validation
 */
async function validateEmailWithAbstract(email: string, apiKey: string): Promise<boolean> {
  const url = `https://emailvalidation.abstractapi.com/v1/?api_key=${apiKey}&email=${encodeURIComponent(email)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (res.ok) {
    const data: any = await res.json();
    if (data.deliverability === "UNDELIVERABLE" || data.is_disposable_email?.value === true) {
      return false;
    }
    return true;
  }
  return true;
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

/**
 * Lightweight Learning Engine: Record Decision Outcome in D1
 */
async function recordLearningEvent(
  db: D1Database, 
  city: string, 
  trade: string, 
  variantId: string | null, 
  isSent: boolean
): Promise<void> {
  const timestamp = new Date().toISOString();
  const keys = [`city:${city}`, `trade:${trade}`];
  if (variantId) keys.push(`variant:${variantId}`);

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
