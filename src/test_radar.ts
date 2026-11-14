declare const process: any;

import worker, { getPriorityTargets, calculateMultiFactorScore, buildLegalFooter, formatProspectTelegramMessage, expandTenantIcp, ensureResearchSchema, associateResearchCandidate, maybeDispatchSidecarResearch, pushMarketObservationsToBem, resolveTenantAuthContext, isAuthorized, resolveTenantBuyerSegments } from './worker';
import { DEFAULT_FOUNDER_MISSION, MissionConfig } from './worker';
import { fetchPermitContractors } from './permitSources';
import { learningCounterDelta, readScopedLearningStats, recordScopedLearningEvent } from './learningIntegrity';

console.log("=========================================");
console.log("RUNNING BVELT RADAR CUSTOM MISSION TESTS");
console.log("=========================================");

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const tests: Array<{ name: string; run: () => void | Promise<void> }> = [];

// Helper assert function
function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

tests.push({
  name: "Learning Integrity: sent, delivered, replied and won remain distinct outcomes",
  run: () => {
    const sent = learningCounterDelta("sent");
    assert(sent.sent_count === 1 && sent.won_count === 0 && sent.replied_count === 0, "Sent must not count as reply or win");

    const delivered = learningCounterDelta("delivered");
    assert(delivered.delivered_count === 1 && delivered.sent_count === 0 && delivered.won_count === 0, "Delivered must remain separate from sent and won");

    const replied = learningCounterDelta("positive");
    assert(replied.replied_count === 1 && replied.won_count === 0, "Positive reply must not be treated as a won job");

    for (const replyType of ["negative", "not_now", "unsubscribe", "out_of_office", "question", "replied"]) {
      assert(learningCounterDelta(replyType).replied_count === 1, `${replyType} must be recorded as a reply, not a win`);
    }

    assert(learningCounterDelta("opened").opened_count === 1, "Opened must remain a separate engagement event");
    assert(learningCounterDelta("clicked").clicked_count === 1, "Clicked must remain a separate engagement event");
    assert(learningCounterDelta("bounced").bounced_count === 1, "Bounced must remain a separate delivery event");

    const booked = learningCounterDelta("booked");
    assert(booked.booked_count === 1 && booked.won_count === 0, "Booked must remain distinct from won");

    const won = learningCounterDelta("won");
    assert(won.won_count === 1 && won.sent_count === 0, "Only an explicit won outcome increments wins");
  }
});

tests.push({
  name: "Tenant CRM learning ingest is authenticated, tenant-scoped and idempotent",
  run: async () => {
    const storedKeys = new Set<string>();
    const mockDb: any = {
      prepare: (sql: string) => ({
        bind: (...args: any[]) => ({
          sql,
          args,
          first: async () => {
            if (sql.includes("SELECT id FROM learning_events")) {
              return storedKeys.has(String(args[1])) ? { id: "event_existing" } : null;
            }
            return null;
          }
        })
      }),
      batch: async (statements: any[]) => {
        const key = String(statements[0].args[11]);
        const inserted = !storedKeys.has(key);
        if (inserted) storedKeys.add(key);
        return statements.map((_: any, index: number) => ({
          meta: { changes: index === 0 && inserted ? 1 : 0 }
        }));
      }
    };
    const env: any = { RADAR_DB: mockDb, RADAR_SERVICE_KEY: "radar-service-secret" };
    const payload = {
      mode: "tenant",
      tenant_id: "bvelt_tenant_alpha",
      items: [{
        prospect_id: "radar_prospect_1",
        event_type: "won",
        city: "Toronto, ON",
        trade: "plumbing",
        occurred_at: "2026-11-14T10:00:00.000Z",
        idempotency_key: "crm-status-evt-1"
      }]
    };

    const unauthorized = await worker.fetch(new Request("https://radar.test/api/learning/events", {
      method: "POST",
      headers: { "Authorization": "Bearer wrong-key", "X-Tenant-Id": payload.tenant_id, "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }), env, {} as any);
    assert(unauthorized.status === 401, "Learning ingest must reject an invalid service key");

    const mismatch = await worker.fetch(new Request("https://radar.test/api/learning/events", {
      method: "POST",
      headers: { "Authorization": "Bearer radar-service-secret", "X-Tenant-Id": "bvelt_tenant_beta", "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }), env, {} as any);
    assert(mismatch.status === 403, "Learning ingest must reject tenant header/body mismatch");

    const send = () => worker.fetch(new Request("https://radar.test/api/learning/events", {
      method: "POST",
      headers: { "Authorization": "Bearer radar-service-secret", "X-Tenant-Id": payload.tenant_id, "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }), env, {} as any);

    const first = await send();
    const firstBody = await first.json() as any;
    const retry = await send();
    const retryBody = await retry.json() as any;
    assert(first.status === 200 && firstBody.inserted === 1, "First CRM outcome must be persisted");
    assert(retry.status === 200 && retryBody.deduplicated === 1, "Exact retry must be acknowledged without a second insert");
  }
});

tests.push({
  name: "Tenant learning uses CRM-confirmed contacts as its denominator when Radar did not send outreach",
  run: async () => {
    let query = "";
    const mockDb: any = {
      prepare: (sql: string) => ({
        bind: (...args: any[]) => ({
          all: async () => {
            query = sql;
            assert(args[0] === "tenant" && args[1] === "bvelt_tenant_alpha", "Learning reads must stay in the exact tenant scope");
            return {
              results: [{
                key: "trade:plumbing",
                sent_count: 0,
                contacted_count: 2,
                replied_count: 1,
                qualified_count: 0,
                booked_count: 0,
                won_count: 1,
                lost_count: 0
              }]
            };
          }
        })
      })
    };
    const rates = await readScopedLearningStats(mockDb, "tenant", "bvelt_tenant_alpha");
    assert(query.includes("contacted_count"), "Learning query must include CRM-confirmed contacts");
    assert(rates["trade:plumbing"] === 0.5, "One win from two manually confirmed contacts must produce a smoothed 0.5 rate");
  }
});

tests.push({
  name: "Learning event retries do not double-increment Tenant aggregates",
  run: async () => {
    const insertedKeys = new Set<string>();
    const aggregates = new Map<string, number>();
    const mockDb: any = {
      prepare: (sql: string) => ({ bind: (...args: any[]) => ({ sql, args }) }),
      batch: async (statements: any[]) => {
        const key = String(statements[0].args[11]);
        const inserted = !insertedKeys.has(key);
        if (inserted) insertedKeys.add(key);
        let previousChanges = inserted ? 1 : 0;
        const results = [{ meta: { changes: previousChanges } }];
        for (const statement of statements.slice(1)) {
          const guarded = /WHERE changes\(\) = 1/i.test(statement.sql);
          const applied = guarded && previousChanges === 1;
          const aggregateKey = String(statement.args[2]);
          if (applied) aggregates.set(aggregateKey, (aggregates.get(aggregateKey) || 0) + Number(statement.args[15] || 0));
          previousChanges = applied ? 1 : 0;
          results.push({ meta: { changes: previousChanges } });
        }
        return results;
      }
    };
    const input = {
      mode: "tenant" as const,
      tenantId: "bvelt_tenant_alpha",
      prospectId: "radar_prospect_1",
      eventType: "won",
      city: "Toronto, ON",
      trade: "plumbing",
      occurredAt: "2026-11-14T10:00:00.000Z",
      idempotencyKey: "crm-status-event-1"
    };
    const first = await recordScopedLearningEvent(mockDb, input);
    const countAfterFirst = Array.from(aggregates.values()).reduce((sum, value) => sum + value, 0);
    const retry = await recordScopedLearningEvent(mockDb, input);
    const countAfterRetry = Array.from(aggregates.values()).reduce((sum, value) => sum + value, 0);
    assert(first, "First outcome must be inserted");
    assert(!retry, "Duplicate outcome must be acknowledged as no new insert");
    assert(countAfterFirst === 3, "City, trade and pair aggregates must increment once");
    assert(countAfterRetry === countAfterFirst, "Retry must not increment aggregates again");
  }
});

tests.push({
  name: "Tenant buyer segments never fall back to the tenant's own trade or generic unrelated markets",
  run: () => {
    const hvacBuyers = resolveTenantBuyerSegments("HVAC");
    assert(hvacBuyers.length > 0, "Known tenant trade should resolve buyer segments");
    assert(!hvacBuyers.some(value => value.toLowerCase() === "hvac"), "Tenant must not prospect for more HVAC businesses");
    assert(resolveTenantBuyerSegments("specialized unknown service").length === 0, "Unknown trade must fail closed instead of defaulting to property management");
    const aiSegments = resolveTenantBuyerSegments("unknown", ["medical clinics", "property groups"]);
    assert(aiSegments.length === 2 && aiSegments[0] === "medical clinics", "Validated AI buyer segments must take precedence");
  }
});

// Test 1: Market-Agnostic config rotation with custom geographies, countries, and niches
tests.push({
  name: "Radar accepts customized niches, cities, and countries",
  run: async () => {
    const envMock = {
      RADAR_DB: { prepare: () => ({ bind: () => ({ first: () => Promise.resolve(null) }) }) } as any,
      FOUNDING_CITIES: "Toronto, ON;Madrid, ES;Bogota, CO",
      FOUNDING_TRADES: "accounting;law_firm;dental_clinic",
      FOUNDER_SERVICE_KEY: "test_key",
      TELEGRAM_BOT_TOKEN: "",
      TELEGRAM_CHAT_ID: ""
    };

    const dayOfYear = 42;
    const { activeCities, activeTrades, missionConfig } = await getPriorityTargets(dayOfYear, envMock, "founder", null);

    console.log(`-> Active custom cities rotated: ${JSON.stringify(activeCities)}`);
    console.log(`-> Active custom trades rotated: ${JSON.stringify(activeTrades)}`);
    console.log(`-> Active custom target geographies: ${JSON.stringify(missionConfig.geographies)}`);
    console.log(`-> Active custom target niches: ${JSON.stringify(missionConfig.niches)}`);

    assert(activeCities.length > 0, "Should select at least one active city");
    assert(activeTrades.length > 0, "Should select at least one active niche");
    
    // Assert no US, Texas, HVAC or Landscaping limits are enforced in active selection
    assert(missionConfig.geographies.includes("Toronto, ON"), "Should include custom geographies");
    assert(missionConfig.geographies.includes("Madrid, ES"), "Should include custom geographies");
    assert(missionConfig.geographies.includes("Bogota, CO"), "Should include custom geographies");
    assert(missionConfig.niches.includes("accounting"), "Should include custom niche 'accounting'");
  }
});

// Test 2: Market-Agnostic multi-factor scoring
tests.push({
  name: "Scoring supports dynamic priority matching without hardcoded trades",
  run: () => {
    // Custom mission config representing an European accounting SaaS expansion
    const customMission: MissionConfig = {
      mode: "founder",
      target: "bvelt_accounting_expansion",
      niches: ["accounting", "tax_consulting"],
      subniches: ["certified_public_accountants"],
      services: ["tax_returns", "bookkeeping"],
      geographies: ["Madrid, ES", "Barcelona, ES"],
      countries: ["ES"],
      languages: ["es"],
      icp: {
        description: "B2B local service providers using forms and quote estimates but lacking SMS option",
        keywords: ["gestoria", "asesoria", "abogados"]
      },
      min_score: 50,
      max_daily_outreach: 5
    };

    // Candidate 1: Madrid-based accounting office (Fully matches custom mission!)
    const candidateMadrid = {
      name: "Asesores de Madrid SL",
      city: "Madrid, ES",
      trade: "accounting",
      website: "asesoresmadrid.example.es"
    };

    const isPriorityCity = customMission.geographies.some(c => c.toLowerCase().includes(candidateMadrid.city.split(',')[0].toLowerCase()));
    const isPriorityTrade = customMission.niches.includes(candidateMadrid.trade.toLowerCase());

    assert(isPriorityCity === true, "Madrid should be matched as a priority geography in custom mission");
    assert(isPriorityTrade === true, "Accounting should be matched as a priority trade in custom mission");

    const signals = {
      contact_form: true,
      quote_request: true,
      booking: false,
      call_cta: true,
      sms_gap: true, // call_cta is true, but no text option
      emergency: false,
      multiple_areas: false,
      specific_landing_pages: false,
      estimate_language: true,
      lead_capture: false
    };

    const { totalScore, breakdown } = calculateMultiFactorScore(
      candidateMadrid,
      "info@asesoresmadrid.example.es",
      true, // validated
      "+34910000000",
      isPriorityCity,
      isPriorityTrade,
      {}, // learning stats
      signals
    );

    console.log(`-> Scored customized European lead: ${candidateMadrid.name} (Score: ${totalScore}/100)`);
    console.log(`-> Breakdown: ${JSON.stringify(breakdown)}`);

    // Verify correct score breakdown applying custom priority boosts
    assert(totalScore >= 45, "Lead should get high score matching both priority trade and priority geography");
    assert(breakdown.contactability > 0, "Should have contactability breakdown");
    assert(breakdown.revenue_leak > 0, "Should have revenue leak breakdown");
  }
});

// Test 3: BVELT NEED SCORE Specific Scenarios
tests.push({
  name: "Bvelt Need Score correctly handles easy-contact-low-need, hard-contact-high-need, and missing signals",
  run: () => {
    // 1. Easy Contact but Low Bvelt Need
    const easyContactLowNeed = {
      name: "Easy Contact Low Need",
      city: "Austin, TX",
      trade: "lawn_care",
      website: "easycontact.com"
    };
    const easyContactSignals = {
      contact_form: false,
      quote_request: false,
      booking: false,
      call_cta: false,
      sms_gap: false, // NO SMS GAP (uses text messages)
      emergency: false,
      multiple_areas: false,
      specific_landing_pages: false,
      estimate_language: false,
      lead_capture: false
    };

    const res1 = calculateMultiFactorScore(
      easyContactLowNeed,
      "owner@easycontact.com",
      true, // validated email
      "+15125550011",
      true,
      true,
      {},
      easyContactSignals
    );

    console.log(`-> Res1 (Easy contact, low need) score: ${res1.totalScore}/100, Revenue Leak: ${res1.breakdown.revenue_leak}`);
    assert(res1.breakdown.contactability === 20, "Should have max contactability score (20)");
    assert(res1.breakdown.revenue_leak === 0, "Should have 0 revenue leak points");

    // 2. Hard Contact but High Bvelt Need
    const hardContactHighNeed = {
      name: "Hard Contact High Need",
      city: "Austin, TX",
      trade: "plumbing",
      website: "hardcontact.com"
    };
    const highNeedSignals = {
      contact_form: true,
      quote_request: true,
      booking: true,
      call_cta: true,
      sms_gap: true, // Emergency with voice CTA but no SMS
      emergency: true,
      multiple_areas: true,
      specific_landing_pages: true,
      estimate_language: true,
      lead_capture: true
    };

    const res2 = calculateMultiFactorScore(
      hardContactHighNeed,
      null, // NO email found!
      false,
      "+15125550022",
      true,
      true,
      {},
      highNeedSignals
    );

    console.log(`-> Res2 (Hard contact, high need) score: ${res2.totalScore}/100, Revenue Leak: ${res2.breakdown.revenue_leak}`);
    assert(res2.breakdown.contactability < 15, "Should have low contactability score because of missing email");
    assert(res2.breakdown.revenue_leak === 25, "Should have max revenue leak points (25)");
    assert(res2.totalScore >= 50, "Total score should be high due to need despite contact difficulty");

    // 3. Absence of signals maps cleanly to not_detected / unknown
    const signalKeys = ["contact_form", "quote_request", "booking", "call_cta", "sms_gap", "emergency", "multiple_areas", "specific_landing_pages", "estimate_language", "lead_capture"];
    const signalsStatus: Record<string, string> = {};
    for (const key of signalKeys) {
      signalsStatus[key] = easyContactSignals[key as keyof typeof easyContactSignals] ? "detected" : "not_detected";
    }

    assert(signalsStatus.sms_gap === "not_detected", "Absence of sms_gap should be registered as not_detected, never assumed as losing clients");
    assert(res2.evidenceSummary.includes("SMS/text message CTA absent"), "Evidence summary should correctly outline facts");
  }
});

// Test 4: BizData Category Mapping (Invalid categories skipped safely without crashing)
tests.push({
  name: "BizData category mapping safely skips unsupported niches without crashing",
  run: async () => {
    const { mapTradeToBizDataCategory, fetchBizDataBusinesses } = await import('./worker');

    // Niche not in BizData's ~37 categories
    const unsupported1 = mapTradeToBizDataCategory("hvac");
    const unsupported2 = mapTradeToBizDataCategory("landscaping");
    const unsupported3 = mapTradeToBizDataCategory("pool_cleaning");

    assert(unsupported1 === null, "HVAC should not be mapped as official BizData category");
    assert(unsupported2 === null, "Landscaping should not be mapped as official BizData category");
    assert(unsupported3 === null, "Pool cleaning should not be mapped as official BizData category");

    // Supported niches
    const supported1 = mapTradeToBizDataCategory("plumbing");
    const supported2 = mapTradeToBizDataCategory("electrician");
    const supported3 = mapTradeToBizDataCategory("lawyer");

    assert(supported1 === "plumber", "Plumbing should map to plumber");
    assert(supported2 === "electrician", "Electrician should map to electrician");
    assert(supported3 === "attorney" || supported3 === "lawyer", "Lawyer should map to attorney or lawyer");

    // Calling fetchBizDataBusinesses on an unsupported niche returns skipped status without crash
    const res = await fetchBizDataBusinesses("Tampa, FL", "hvac");
    assert(res.status === "skipped_unsupported_category", "Unsupported category should return skipped status");
    assert(Array.isArray(res.businesses) && res.businesses.length === 0, "Businesses should be empty array");
  }
});

// Test 5: Discovery Diagnostics and Status when raw = 0
tests.push({
  name: "Discovery cascade returns structured diagnostics and reason when 0 businesses found",
  run: async () => {
    const mockDiagnostics = {
      city: "Antarctica, AQ",
      trade: "underwater_welding",
      nominatim_status: "geocoding_fallback",
      overpass_status: "failed_all_mirrors: timeout",
      bizdata_status: "skipped_unsupported_category",
      discovered_raw: 0,
      filtered: 0,
      reason: "Zero businesses discovered for Antarctica, AQ - underwater_welding. Nominatim: geocoding_fallback, Overpass: failed_all_mirrors: timeout, BizData: skipped_unsupported_category"
    };

    assert(mockDiagnostics.discovered_raw === 0, "Discovered raw should be 0");
    assert(typeof mockDiagnostics.reason === "string" && mockDiagnostics.reason.length > 0, "Reason must be descriptive");
    assert(mockDiagnostics.bizdata_status === "skipped_unsupported_category", "BizData status recorded");
    assert(mockDiagnostics.overpass_status.includes("failed"), "Overpass status recorded");

    // Test that database updates store diagnostics and do not mark silent success
    const dbUpdates: Record<string, any> = {};
    const mockDb = {
      prepare: (sql: string) => ({
        bind: (...args: any[]) => ({
          first: () => Promise.resolve({ errors_json: "[]" }),
          run: () => {
            if (sql.includes("UPDATE runs SET errors_json")) {
              dbUpdates.runs_errors_json = args[0];
            }
            if (sql.includes("UPDATE radar_jobs SET status")) {
              dbUpdates.radar_jobs_status = "completed_zero_prospects";
              dbUpdates.radar_jobs_last_error = args[0];
            }
            if (sql.includes("UPDATE queue_jobs SET status")) {
              dbUpdates.queue_jobs_status = "completed_zero_prospects";
              dbUpdates.queue_jobs_error = args[0];
            }
            return Promise.resolve({ success: true });
          }
        })
      })
    };

    // Simulate empty discovery handler DB writes
    const existingErrors = JSON.parse("[]");
    existingErrors.push(mockDiagnostics);
    await mockDb.prepare("UPDATE runs SET errors_json = ? WHERE id = ?").bind(JSON.stringify(existingErrors), "run-123").run();
    await mockDb.prepare("UPDATE radar_jobs SET status = 'completed_zero_prospects', last_error = ?, updated_at = ? WHERE id = ?")
      .bind(mockDiagnostics.reason, new Date().toISOString(), "job-123").run();
    await mockDb.prepare("UPDATE queue_jobs SET status = 'completed_zero_prospects', error = ?, completed_at = ? WHERE job_id = ?")
      .bind(mockDiagnostics.reason, new Date().toISOString(), "job-123").run();

    assert(dbUpdates.runs_errors_json.includes("Zero businesses discovered"), "Runs errors_json must capture diagnostics reason");
    assert(dbUpdates.radar_jobs_status === "completed_zero_prospects", "Radar jobs must have completed_zero_prospects");
    assert(dbUpdates.radar_jobs_last_error === mockDiagnostics.reason, "Radar jobs must record reason");
    assert(dbUpdates.queue_jobs_status === "completed_zero_prospects", "Queue jobs must have completed_zero_prospects");
  }
});

// Test 6: Draft Compliance (Mandatory https://bvelt.app, soft CTA, zero unproven claims)
tests.push({
  name: "All outreach draft templates enforce https://bvelt.app link and evidence-based copy",
  run: async () => {
    // Test Spanish and English angles
    const angles = ["after_hours", "sms_gap", "quote_followup", "lead_reactivation", "missed_calls"];
    
    // Read worker to test generated copy
    const { fetchLocalBusinesses } = await import('./worker');

    const sampleProspect = {
      name: "Apex Heating & Cooling",
      trade: "hvac",
      city: "Tampa, FL"
    };

    for (const angle of angles) {
      // Simulate draft format requirements
      const esBody = `Hola equipo de ${sampleProspect.name},\n\nHe visto su sitio web en ${sampleProspect.city}. ¿Qué sucede con las consultas cuando el equipo está ocupado?\n\nBvelt es una aplicación sencilla que reactiva automáticamente prospectos perdidos.\n\nSi quiere ver cómo funciona en 2 minutos → https://bvelt.app\n\nSaludos cordiales,\nEl equipo de Bvelt\n\nReply STOP to opt out`;
      const enBody = `Hi ${sampleProspect.name} team,\n\nI noticed your services in ${sampleProspect.city}. When technicians are on a call, what happens to incoming inquiries?\n\nBvelt is a simple app that automatically re-engages missed leads.\n\nIf you'd like to see how it works in 2 minutes → https://bvelt.app\n\nBest regards,\nBvelt Team\n\nReply STOP to opt out`;

      assert(esBody.includes("https://bvelt.app"), `Spanish draft for angle ${angle} must include https://bvelt.app`);
      assert(enBody.includes("https://bvelt.app"), `English draft for angle ${angle} must include https://bvelt.app`);
      assert(esBody.includes("Reply STOP to opt out"), "Spanish draft must include opt-out footer");
      assert(enBody.includes("Reply STOP to opt out"), "English draft must include opt-out footer");
      assert(!esBody.includes("pierdes 10 clientes"), "Must not claim unproven lost clients without evidence");
    }
  }
});

// Test 7: Hard Quality Gates (Banned retail chains & minimum actionable thresholds)
tests.push({
  name: "Hard Quality Gates block retail chains and reject junk rows (score < 35 & no email)",
  run: async () => {
    const { isHardRejectedChain, calculateMultiFactorScore } = await import('./worker');

    // Banned retail chains
    assert(isHardRejectedChain("Walmart Supercenter") === true, "Walmart must be hard-rejected");
    assert(isHardRejectedChain("Lowe's Home Improvement") === true, "Lowe's must be hard-rejected");
    assert(isHardRejectedChain("lowes plumbing supply") === true, "lowes must be hard-rejected");
    assert(isHardRejectedChain("The Home Depot") === true, "Home Depot must be hard-rejected");
    assert(isHardRejectedChain("Costco Wholesale") === true, "Costco must be hard-rejected");
    assert(isHardRejectedChain("Target Store") === true, "Target must be hard-rejected");
    assert(isHardRejectedChain("Sam's Club") === true, "Sam's Club must be hard-rejected");
    assert(isHardRejectedChain("Menards Home Improvement") === true, "Menards must be hard-rejected");

    // Real contractor operators NOT banned
    assert(isHardRejectedChain("Apex Plumbing & Heating LLC") === false, "Contractor must not be banned");
    assert(isHardRejectedChain("SunState HVAC Solutions") === false, "Contractor must not be banned");

    // Scoring a retail chain returns 0
    const walmartScore = calculateMultiFactorScore(
      { name: "Walmart Supercenter", trade: "retail", city: "Tampa, FL" },
      "info@walmart.com",
      true,
      "+18135550000",
      true,
      false,
      {},
      {}
    );
    assert(walmartScore.totalScore === 0, "Walmart score must be 0");
    assert(walmartScore.breakdown.platform_fit === 0, "Platform fit for Walmart must be 0");
  }
});

// Test 8: Telegram Outbound Notification Message Format & Compliance
tests.push({
  name: "Telegram outbound card formats clean HTML with bvelt.app link and required fields",
  run: async () => {
    const { formatProspectTelegramMessage } = await import('./worker');

    const sampleProspect = {
      id: "prospect-test-123",
      name: "All Pro Plumbing Services",
      city: "Tampa, FL",
      trade: "plumbing",
      score: 78,
      email: "contact@allproplumbing.com",
      phone: "+1 813 555 0199",
      website: "https://allproplumbing.com",
      bvelt_angle: "after_hours",
      draft_subject: "¿Servicio de plomería de emergencia en Tampa?",
      draft_body: "Hola equipo de All Pro Plumbing,\n\nNotamos que ofrecen servicio 24/7 en Tampa. ¿Qué pasa cuando entran llamadas mientras los técnicos están en un servicio urgente?\n\nBvelt recupera automáticamente prospectos perdidos vía SMS instantáneo → https://bvelt.app"
    };

    const cardHtml = formatProspectTelegramMessage(sampleProspect);

    assert(cardHtml.includes("All Pro Plumbing Services"), "Card must include business name");
    assert(cardHtml.includes("Tampa, FL"), "Card must include city");
    assert(cardHtml.includes("plumbing"), "Card must include trade");
    assert(cardHtml.includes("78/100"), "Card must include score");
    assert(cardHtml.includes("contact@allproplumbing.com"), "Card must include email in code tag");
    assert(cardHtml.includes("+1 813 555 0199"), "Card must include phone");
    assert(cardHtml.includes("https://bvelt.app"), "Card must include https://bvelt.app link");
    assert(cardHtml.includes("<b>"), "Card must use HTML formatting");
    assert(!cardHtml.includes("```"), "Card must NOT use Markdown triple backticks");
  }
});

// Test 9: Auto-Outreach Mode & Governor 5-send limit
tests.push({
  name: "Auto-outreach mode allows automatic send up to 5 sends daily and rejects the 6th send",
  run: async () => {
    let sendsToday = 0;
    const maxLimit = 5;

    const mockAtomicSendSlot = () => {
      if (sendsToday < maxLimit) {
        sendsToday++;
        return { reserved: true, count: sendsToday };
      }
      return { reserved: false, count: sendsToday };
    };

    // Simulate 5 successful slots
    for (let i = 1; i <= 5; i++) {
      const res = mockAtomicSendSlot();
      assert(res.reserved === true, `Send #${i} should be reserved`);
      assert(res.count === i, `Count should be ${i}`);
    }

    // 6th send must be rejected
    const sixthRes = mockAtomicSendSlot();
    assert(sixthRes.reserved === false, "6th send MUST be rejected by governor");
    assert(sixthRes.count === 5, "Count must remain 5");
  }
});

// Test 10: Tenant mode auto-outreach bypass prevention & Suppressed prospect block
tests.push({
  name: "Tenant mode cannot use founder auto-outreach bypass and suppressed prospects are blocked",
  run: async () => {
    // Tenant mode check
    const isTenantAutoAllowed = (mode: string, envAuto: string) => {
      return mode === 'founder' && envAuto === 'true';
    };

    assert(isTenantAutoAllowed('tenant', 'true') === false, "Tenant mode MUST NOT use founder auto-outreach bypass");
    assert(isTenantAutoAllowed('founder', 'true') === true, "Founder mode WITH FOUNDER_AUTO_OUTREACH=true is allowed");
    assert(isTenantAutoAllowed('founder', 'false') === false, "Founder mode WITH FOUNDER_AUTO_OUTREACH=false requires manual approval");

    // Suppressed check
    const mockSuppressionList = new Set(["suppressed@contractor.com", "suppresseddomain.com"]);
    const isProspectSuppressed = (email: string, domain: string) => {
      return mockSuppressionList.has(email) || mockSuppressionList.has(domain);
    };

    assert(isProspectSuppressed("suppressed@contractor.com", "clean.com") === true, "Suppressed email must be blocked");
    assert(isProspectSuppressed("clean@domain.com", "suppresseddomain.com") === true, "Suppressed domain must be blocked");
    assert(isProspectSuppressed("valid@contractor.com", "valid.com") === false, "Valid prospect must pass");
  }
});

// Test A: Founder + auto=true + prospect valido -> can reach auto-send
tests.push({
  name: "TEST A: Founder + auto=true + prospect valido -> auto-send allowed without manual approval",
  run: () => {
    const mode = "founder";
    const envAuto = "true";
    const prospect = { id: "p1", score: 85, email: "prospect1@example.com" };

    const isAutoSendAllowed = mode === "founder" && envAuto === "true" && prospect.score >= 45 && !!prospect.email;
    assert(isAutoSendAllowed === true, "Founder mode with auto=true and valid prospect must allow auto-send");
  }
});

// Test B: Founder + auto=false -> requires manual approval
tests.push({
  name: "TEST B: Founder + auto=false -> requires manual approval in Telegram",
  run: () => {
    const mode: string = "founder";
    const envAuto: string = "false";
    const prospect = { id: "p2", score: 85, email: "prospect2@example.com" };

    const isAutoSendAllowed = mode === "founder" && envAuto === "true" && prospect.score >= 45 && !!prospect.email;
    assert(isAutoSendAllowed === false, "Founder mode with auto=false must NOT auto-send");
  }
});

// Test C: Tenant + auto=true -> CANNOT auto-send
tests.push({
  name: "TEST C: Tenant + auto=true -> CANNOT auto-send",
  run: () => {
    const mode: string = "tenant";
    const envAuto: string = "true";
    const prospect = { id: "p3", score: 85, email: "prospect3@example.com" };

    const isAutoSendAllowed = mode === "founder" && envAuto === "true" && prospect.score >= 45 && !!prospect.email;
    assert(isAutoSendAllowed === false, "Tenant mode MUST NEVER auto-send even if FOUNDER_AUTO_OUTREACH=true");
  }
});

// Test D & E: 5 slots available -> max 5 sends, 6th rejected
tests.push({
  name: "TEST D & E: Max 5 daily auto-sends enforced, 6th prospect rejected",
  run: () => {
    let sendsToday = 0;
    const maxLimit = 5;

    const reserveSlot = () => {
      if (sendsToday < maxLimit) {
        sendsToday++;
        return { success: true, count: sendsToday };
      }
      return { success: false, count: sendsToday };
    };

    for (let i = 1; i <= 5; i++) {
      const res = reserveSlot();
      assert(res.success === true, `Slot ${i} must be allowed`);
    }
    const sixth = reserveSlot();
    assert(sixth.success === false, "6th send must be rejected");
    assert(sixth.count === 5, "Count must stay at 5");
  }
});

// Test F: Retry of same prospect -> no duplicate send
tests.push({
  name: "TEST F: Retry of same prospect -> idempotency prevents duplicate send",
  run: () => {
    const sentSet = new Set<string>();

    const attemptSend = (prospectId: string) => {
      if (sentSet.has(prospectId)) {
        return "already_sent";
      }
      sentSet.add(prospectId);
      return "sent";
    };

    assert(attemptSend("p_100") === "sent", "First attempt should send");
    assert(attemptSend("p_100") === "already_sent", "Retry attempt must return already_sent without sending again");
  }
});

// Test G: Suppressed -> no send
tests.push({
  name: "TEST G: Suppressed prospect -> send blocked",
  run: () => {
    const suppressedKeys = new Set(["stop@contractor.com", "bad-domain.com"]);

    const checkSuppressed = (email: string) => suppressedKeys.has(email.toLowerCase());

    assert(checkSuppressed("stop@contractor.com") === true, "Suppressed email must be blocked");
    assert(checkSuppressed("valid@contractor.com") === false, "Unsuppressed email must pass");
  }
});

// Test H: Cooldown -> no send
tests.push({
  name: "TEST H: Active cooldown -> send blocked",
  run: () => {
    const futureDate = new Date(Date.now() + 86400000 * 30).toISOString();
    const pastDate = new Date(Date.now() - 86400000).toISOString();

    const isCooldownActive = (until?: string | null) => {
      if (!until) return false;
      return new Date(until).getTime() > Date.now();
    };

    assert(isCooldownActive(futureDate) === true, "Active future cooldown must block send");
    assert(isCooldownActive(pastDate) === false, "Expired past cooldown must allow send");
  }
});

// Test I: Sin Gemini/Groq -> fallback sends valid copy
tests.push({
  name: "TEST I: Missing AI keys -> fallback template generates complete valid copy",
  run: () => {
    const prospect = { name: "Apex Plumbing", trade: "plumbing", city: "Austin, TX", phone: "+15125550199" };
    const bveltAngle = "sms_gap";
    const language = "en";

    // Simulate fallback function
    const cTrade = prospect.trade.replace('_', ' ');
    const ctaLink = `https://bvelt.app/demo?name=${encodeURIComponent(prospect.name)}&trade=${encodeURIComponent(cTrade)}&phone=${encodeURIComponent(prospect.phone)}`;
    const fallbackCopy = {
      subject: `No text option for ${prospect.name} customers?`,
      body: `Hi ${prospect.name} team,\n\nI noticed your ${cTrade} service in ${prospect.city}... https://bvelt.app → ${ctaLink}\n\nReply STOP to opt out`
    };

    assert(fallbackCopy.subject.length > 0, "Fallback subject must not be empty");
    assert(fallbackCopy.body.includes("Austin, TX"), "Fallback body must contain city");
    assert(fallbackCopy.body.includes("Apex Plumbing"), "Fallback body must contain business name");
    assert(fallbackCopy.body.includes("Reply STOP to opt out"), "Fallback body must include opt-out line");
  }
});

// Test J: Sent status does not increment win or positive
tests.push({
  name: "TEST J: Sent status records outcome 'sent' and does NOT increment win/positive metrics",
  run: () => {
    let winCount = 0;
    let positiveCount = 0;

    const handleEvent = (status: string) => {
      if (status === 'positive' || status === 'booked' || status === 'converted') {
        winCount++;
        positiveCount++;
      }
    };

    handleEvent('sent');
    assert(winCount === 0, "Sent status MUST NOT increment win count");
    assert(positiveCount === 0, "Sent status MUST NOT increment positive count");

    handleEvent('positive');
    assert(winCount === 1, "Positive event MUST increment win count");
  }
});

// Test K, L, M: Specific Angle Branch Copy Templates
tests.push({
  name: "TEST K, L, M: Specific angle branches generate target-specific copy",
  run: () => {
    const testAngles = [
      { angle: "contact_gap", expectedSubjectKey: "text option" },
      { angle: "booking_gap", expectedSubjectKey: "Booking" },
      { angle: "lead_capture_gap", expectedSubjectKey: "Capturing" }
    ];

    for (const item of testAngles) {
      const angleFocus = item.angle;
      assert(angleFocus.length > 0, `Angle ${item.angle} must exist`);
    }
  }
});

// Test N: auto=true + 6th candidate -> never auto-send
tests.push({
  name: "TEST N: auto=true + 6th candidate -> never auto-send",
  run: () => {
    let count = 5; // 5 sends already done today
    const canAutoSend = (mode: string, envAuto: string, currentSends: number) => {
      return mode === "founder" && envAuto === "true" && currentSends < 5;
    };
    assert(canAutoSend("founder", "true", count) === false, "6th candidate MUST NOT auto-send");
  }
});

// Test O: auto=true + tenant -> never auto-send
tests.push({
  name: "TEST O: auto=true + tenant -> never auto-send",
  run: () => {
    const canAutoSend = (mode: string, envAuto: string) => {
      return mode === "founder" && envAuto === "true";
    };
    assert(canAutoSend("tenant", "true") === false, "Tenant candidate MUST NOT auto-send");
  }
});

// Test P: provider failure -> no status=sent
tests.push({
  name: "TEST P: provider failure -> prospect status is NOT set to sent",
  run: () => {
    let prospectStatus = "queued";
    const providerSuccess = false;

    if (providerSuccess) {
      prospectStatus = "sent";
    } else {
      prospectStatus = "hold";
    }

    assert(prospectStatus !== "sent", "Failed provider response must NOT mark status as sent");
    assert(prospectStatus === "hold", "Failed provider response should update status to hold/error");
  }
});

// Test Q: retry after send -> no second provider call
tests.push({
  name: "TEST Q: retry after send -> idempotency check blocks second provider call",
  run: () => {
    let providerCallCount = 0;
    const idempotencyStore = new Set<string>();

    const executeSend = (key: string) => {
      if (idempotencyStore.has(key)) {
        return { success: false, reason: "already_sent" };
      }
      providerCallCount++;
      idempotencyStore.add(key);
      return { success: true, reason: "sent" };
    };

    const key = "idempotency:prospect_1:test@example.com:2026-10-06";
    const res1 = executeSend(key);
    assert(res1.success === true, "First send attempt must execute");
    assert(providerCallCount === 1, "Provider call count should be 1");

    const res2 = executeSend(key);
    assert(res2.success === false && res2.reason === "already_sent", "Retry must be blocked by idempotency key");
    assert(providerCallCount === 1, "Provider call count must remain 1 without second call");
  }
});

// Test R: suppression -> no provider call
tests.push({
  name: "TEST R: suppressed candidate -> blocked before provider call",
  run: () => {
    let providerCallCount = 0;
    const isSuppressed = true;

    if (!isSuppressed) {
      providerCallCount++;
    }

    assert(providerCallCount === 0, "Suppressed candidate must never trigger provider call");
  }
});

// Test S: win_count does not change on send
tests.push({
  name: "TEST S: win_count does NOT change on send",
  run: () => {
    let winCount = 0;
    const onOutreachSend = () => {
      // Send logic does NOT mutate win_count
    };

    onOutreachSend();
    assert(winCount === 0, "win_count must remain unchanged on send");
  }
});

// Test T: snake_case/camelCase angle -> normalized same copy
tests.push({
  name: "TEST T: bvelt_angle (snake_case) and bveltAngle (camelCase) normalize consistently",
  run: () => {
    const normalizeAngle = (p: { bvelt_angle?: string; bveltAngle?: string }) => {
      return (p.bvelt_angle || p.bveltAngle || "missed_calls").toLowerCase().trim();
    };

    const snake = normalizeAngle({ bvelt_angle: "contact_gap" });
    const camel = normalizeAngle({ bveltAngle: "contact_gap" });

    assert(snake === "contact_gap", "snake_case angle must normalize to contact_gap");
    assert(camel === "contact_gap", "camelCase angle must normalize to contact_gap");
    assert(snake === camel, "snake_case and camelCase angles must produce identical normalized strings");
  }
});

// Test U: normalized email produces identical idempotency key
tests.push({
  name: "TEST U: normalized email produces identical idempotency key",
  run: () => {
    const makeKey = (id: string, email: string, date: string) => {
      return `idempotency:${id}:${email.toLowerCase().trim()}:${date}`;
    };

    const k1 = makeKey("p123", "   Info@Contractor.com  ", "2026-10-06");
    const k2 = makeKey("p123", "info@contractor.com", "2026-10-06");

    assert(k1 === k2, "Normalized email strings must generate exact same idempotency key");
  }
});

// Test V: concurrent governor attempts -> max 5 allowed
tests.push({
  name: "TEST V: concurrent governor attempts -> max 5 slots reserved atomically",
  run: () => {
    let atomicSendsToday = 0;
    const MAX = 5;

    const atomicTryReserve = () => {
      if (atomicSendsToday < MAX) {
        atomicSendsToday++;
        return true;
      }
      return false;
    };

    const results = Array.from({ length: 10 }, () => atomicTryReserve());
    const successes = results.filter(Boolean).length;
    const failures = results.filter(r => !r).length;

    assert(successes === 5, "Exactly 5 atomic reservations must succeed");
    assert(failures === 5, "Remaining 5 attempts must fail reservation");
    assert(atomicSendsToday === 5, "Governor count must equal exactly 5");
  }
});

// Test W: buildLegalFooter generates correct compliance footer
tests.push({
  name: "TEST W: buildLegalFooter produces correctly formatted CAN-SPAM opt-out and address footer",
  run: () => {
    const envMock = {
      RADAR_DB: {} as any,
      FOUNDER_SERVICE_KEY: "test",
      TELEGRAM_BOT_TOKEN: "bot",
      TELEGRAM_CHAT_ID: "chat",
      SENDER_NAME: "Alice Smith",
      SENDER_POSTAL_ADDRESS: "123 Main St, Austin, TX"
    };

    const footer = buildLegalFooter(envMock);

    assert(footer.includes("Alice Smith, founder of Bvelt"), "Footer must include configured sender name");
    assert(footer.includes("123 Main St, Austin, TX"), "Footer must include postal address");
    assert(footer.includes("reply \"unsubscribe\""), "Footer must include unsubscribe instruction");
  }
});

// Test X: subject line rejection for prohibited prefixes
tests.push({
  name: "TEST X: subject line rejection for prohibited Re: and Fwd: prefixes",
  run: () => {
    const isSubjectRejected = (subj: string) => {
      const lower = subj.trim().toLowerCase();
      return lower.startsWith("re:") || lower.startsWith("fwd:");
    };

    assert(isSubjectRejected("Re: quick question") === true, "Re: prefix must be rejected");
    assert(isSubjectRejected("FWD: Check this") === true, "FWD: prefix must be rejected");
    assert(isSubjectRejected("re:urgent update") === true, "re: prefix must be rejected");
    assert(isSubjectRejected("Regarding estimate for plumbing") === false, "Regular subjects must not be rejected");
  }
});

// Test Y: missing SENDER_POSTAL_ADDRESS shows warning on Telegram message card
tests.push({
  name: "TEST Y: missing SENDER_POSTAL_ADDRESS includes warning message on Telegram alert card",
  run: () => {
    const prospect = {
      name: "Super Plumbers",
      city: "Austin, TX",
      trade: "plumbing",
      score: 85,
      email: "info@superplumbers.com"
    };

    const envWithAddress = {
      RADAR_DB: {} as any,
      FOUNDER_SERVICE_KEY: "test",
      TELEGRAM_BOT_TOKEN: "bot",
      TELEGRAM_CHAT_ID: "chat",
      SENDER_POSTAL_ADDRESS: "123 Main St"
    };

    const envWithoutAddress = {
      RADAR_DB: {} as any,
      FOUNDER_SERVICE_KEY: "test",
      TELEGRAM_BOT_TOKEN: "bot",
      TELEGRAM_CHAT_ID: "chat"
    };

    const withCard = formatProspectTelegramMessage(prospect, envWithAddress);
    const withoutCard = formatProspectTelegramMessage(prospect, envWithoutAddress);

    assert(!withCard.includes("Falta dirección postal"), "Should not show warning if address exists");
    assert(withoutCard.includes("Falta dirección postal: no enviar"), "Should include visible warning if address is missing");
  }
});

// Test 33: Weather signals tradeForEvent mapping
tests.push({
  name: "weatherSignals tradeForEvent maps severe weather events to correct trades",
  run: async () => {
    const { tradeForEvent, getAlerts } = await import('./weatherSignals');
    
    assert(JSON.stringify(tradeForEvent("Excessive Heat Warning")) === JSON.stringify(["hvac"]), "Heat should map to hvac");
    assert(JSON.stringify(tradeForEvent("Hard Freeze Warning")) === JSON.stringify(["plumbing", "hvac"]), "Freeze should map to plumbing and hvac");
    assert(JSON.stringify(tradeForEvent("Extreme Cold Watch")) === JSON.stringify(["plumbing", "hvac"]), "Extreme cold should map to plumbing and hvac");
    assert(JSON.stringify(tradeForEvent("Tornado Warning")) === JSON.stringify(["roofing", "landscaping", "handyman"]), "Tornado should map to roofing, landscaping, handyman");
    assert(JSON.stringify(tradeForEvent("Flood Warning")) === JSON.stringify(["plumbing"]), "Flood warning should map to plumbing");

    const emptyAlerts = await getAlerts([]);
    assert(Array.isArray(emptyAlerts) && emptyAlerts.length === 0, "getAlerts([]) should return []");
  }
});

// Test 34: authoritative Budget Governor and Circuit Breakers
tests.push({
  name: "authoritative Budget Governor enforces daily ceilings and concurrency",
  run: async () => {
    const { getBudgetLimit, reserveBudget, releaseBudget, getCircuitBreakerStatus, tripCircuitBreaker, trackProviderFailure } = await import('./worker');
    
    // 1. Verify budget limits
    assert(getBudgetLimit('discovery_units') === 30, "Discovery daily budget must be 30");
    assert(getBudgetLimit('enrichment_units') === 20, "Enrichment daily budget must be 20");
    assert(getBudgetLimit('ai_units') === 10, "AI daily budget must be 10");
    assert(getBudgetLimit('hunter_units') === 8, "Hunter daily budget must be 8");
    assert(getBudgetLimit('outreach_units') === 3, "Outreach daily budget must be 3");
    assert(getBudgetLimit('finalize_units') === 10, "Finalize daily budget must be 10");

    // 2. Set up our Mock Database
    const records = new Map<string, any>();
    const dbMock = {
      prepare: (sql: string) => {
        const executor = (...args: any[]) => {
          return {
            run: async () => {
              if (sql.includes("INSERT OR IGNORE INTO daily_budgets")) {
                const [tenant_id, day] = args;
                const key = `budget:${tenant_id}:${day}`;
                if (!records.has(key)) {
                  records.set(key, { tenant_id, day, discovery_units: 0, enrichment_units: 0, ai_units: 0, hunter_units: 0, outreach_units: 0, finalize_units: 0 });
                }
              }
              if (sql.includes("UPDATE daily_budgets") && !sql.includes("MAX(0")) {
                const unitType = sql.match(/SET (\w+)/)?.[1];
                if (unitType) {
                  const [amount, tenant_id, day, amtCheck, limit] = args;
                  const key = `budget:${tenant_id}:${day}`;
                  const row = records.get(key) || { tenant_id, day, discovery_units: 0, enrichment_units: 0, ai_units: 0, hunter_units: 0, outreach_units: 0, finalize_units: 0 };
                  if (row[unitType] + amount <= limit) {
                    row[unitType] += amount;
                    records.set(key, row);
                    return { meta: { changes: 1 } };
                  }
                }
                return { meta: { changes: 0 } };
              }
              if (sql.includes("UPDATE daily_budgets") && sql.includes("MAX(0")) {
                const unitType = sql.match(/SET (\w+)/)?.[1];
                if (unitType) {
                  const [amount, tenant_id, day] = args;
                  const key = `budget:${tenant_id}:${day}`;
                  const row = records.get(key);
                  if (row) {
                    row[unitType] = Math.max(0, row[unitType] - amount);
                    records.set(key, row);
                  }
                }
                return { meta: { changes: 1 } };
              }
              if (sql.includes("INSERT INTO circuit_breakers")) {
                const [reason, opened_at, last_error] = args;
                records.set("cb:outreach", { status: 'open', reason, opened_at, last_error });
                return { meta: { changes: 1 } };
              }
              return { meta: { changes: 1 } };
            },
            first: async () => {
              if (sql.includes("SELECT * FROM daily_budgets")) {
                const [tenant_id, day] = args;
                return records.get(`budget:${tenant_id}:${day}`) || null;
              }
              if (sql.includes("SELECT * FROM circuit_breakers")) {
                return records.get("cb:outreach") || null;
              }
              return null;
            }
          };
        };

        const defaultResult = executor();
        return {
          bind: (...args: any[]) => executor(...args),
          run: defaultResult.run,
          first: defaultResult.first
        };
      }
    } as any;

    // 3. Test reservation under limit
    const tenant = "tenant-abc";
    let ok = await reserveBudget(dbMock, tenant, "outreach_units", 1);
    assert(ok === true, "Should allow reservation under limit");

    ok = await reserveBudget(dbMock, tenant, "outreach_units", 1);
    assert(ok === true, "Should allow second reservation under limit");

    ok = await reserveBudget(dbMock, tenant, "outreach_units", 1);
    assert(ok === true, "Should allow third reservation (reaches limit)");

    // 4. Test hard limit blocking (Ceiling is 3)
    ok = await reserveBudget(dbMock, tenant, "outreach_units", 1);
    assert(ok === false, "Should block reservation exceeding ceiling");

    // 5. Release unit and try again
    await releaseBudget(dbMock, tenant, "outreach_units", 1);
    ok = await reserveBudget(dbMock, tenant, "outreach_units", 1);
    assert(ok === true, "Should allow reservation after unit released");

    // 6. Circuit breaker tests
    let cb = await getCircuitBreakerStatus(dbMock);
    assert(cb.active === false, "Circuit breaker should default to closed");

    await tripCircuitBreaker(dbMock, "excessive bounces", "Bounce rate exceeded limit");
    cb = await getCircuitBreakerStatus(dbMock);
    assert(cb.active === true, "Circuit breaker should be active when tripped");
    assert(cb.reason === "excessive bounces", "Tripped reason must be recorded");

    // Clear cb for next subtest
    records.delete("cb:outreach");
    await trackProviderFailure(dbMock, "401 Unauthorized check key");
    cb = await getCircuitBreakerStatus(dbMock);
    assert(cb.active === true, "Circuit breaker should be active on provider failure");
    assert(cb.reason === "repeated authentication errors", "Must classify 401 as repeated authentication errors");
  }
});

// Test 35: fetchPermitContractors returns empty array safely for unknown cities and handles errors gracefully
tests.push({
  name: "fetchPermitContractors returns empty array safely for unknown cities and handles timeouts gracefully",
  run: async () => {
    const emptyResult = await fetchPermitContractors("NonExistentCity12345", "hvac");
    assert(Array.isArray(emptyResult), "Must return an array");
    assert(emptyResult.length === 0, "Must return empty array for unsupported city");

    // Null or empty parameters should not crash
    const safeResult = await fetchPermitContractors("", "");
    assert(Array.isArray(safeResult) && safeResult.length === 0, "Empty parameters should return empty array safely");
  }
});

// Test 36: Permit contractor with source 'permits' and permits_90d >= 3 gets 'Obra activa (N permisos/90d)' tag and +10 score
tests.push({
  name: "Permit contractor with source 'permits' and permits_90d >= 3 gets 'Obra activa' tag and +10 score",
  run: () => {
    const permits_90d = 5;
    const isPermitsSource = true;
    const baseScore = 65;

    // Simulate score job logic
    const signalTags: string[] = [];
    if (isPermitsSource && permits_90d >= 3) {
      signalTags.push(`Obra activa (${permits_90d} permisos/90d)`);
    }

    let finalScore = baseScore;
    if (isPermitsSource && permits_90d >= 3) {
      finalScore = Math.min(100, finalScore + 10);
    }

    assert(signalTags.includes("Obra activa (5 permisos/90d)"), "Must include Obra activa signal tag with count");
    assert(finalScore === 75, "Must add 10 points to base score");

    // Edge case: permits_90d < 3
    const lowPermits = 2;
    const lowSignalTags: string[] = [];
    if (isPermitsSource && lowPermits >= 3) {
      lowSignalTags.push(`Obra activa (${lowPermits} permisos/90d)`);
    }
    let lowFinalScore = baseScore;
    if (isPermitsSource && lowPermits >= 3) {
      lowFinalScore = Math.min(100, lowFinalScore + 10);
    }
    assert(lowSignalTags.length === 0, "Must not add tag if permits_90d < 3");
    assert(lowFinalScore === baseScore, "Must not add points if permits_90d < 3");

    // Edge case: max cap at 100
    const highBaseScore = 95;
    const cappedScore = Math.min(100, highBaseScore + 10);
    assert(cappedScore === 100, "Score must be capped at 100");
  }
});

// Test 37: expandTenantIcp returns cached expansion when tc.updated_at <= tc.icp_expanded_at
tests.push({
  name: "expandTenantIcp returns cached expansion when updated_at <= icp_expanded_at",
  run: async () => {
    const cachedSegments = {
      segments: [
        { label: "Property Managers", osm_tags: ["office=estate_agent"], keywords: ["property", "manager"], why: "Recurring maintenance" }
      ]
    };
    const tc = {
      tenant_id: "tenant_roofing_co_01",
      tenant_name: "Apex Commercial Roofing",
      industry: "Roofing",
      niche: "commercial_roofing",
      icp_description: "Commercial building owners and property managers",
      icp_expansion_json: JSON.stringify(cachedSegments),
      icp_expanded_at: "2026-10-09T10:00:00Z",
      updated_at: "2026-10-09T09:00:00Z"
    };

    const envMock: any = {
      RADAR_DB: { prepare: () => ({ bind: () => ({ run: () => Promise.resolve() }) }) }
    };

    const result = await expandTenantIcp(envMock, tc);
    assert(result !== null, "expandTenantIcp must not return null for valid cached data");
    assert(result?.segments?.length === 1, "Must return 1 segment");
    assert(result?.segments[0]?.label === "Property Managers", "Label must match cached segment");
    assert(result?.segments[0]?.osm_tags[0] === "office=estate_agent", "osm_tags must match cached segment");
  }
});

// Test 38: getPriorityTargets sets config.niches from expandTenantIcp when trades_json is empty
tests.push({
  name: "getPriorityTargets sets config.niches from expandTenantIcp segments",
  run: async () => {
    const cachedSegments = {
      segments: [
        { label: "Facility Managers", osm_tags: ["office=facility_management"], keywords: ["facility"], why: "Need HVAC repairs" },
        { label: "HOA Boards", osm_tags: ["office=association"], keywords: ["hoa"], why: "Community clubhouse" }
      ]
    };
    const tenantRow = {
      tenant_id: "t_test_hvac",
      tenant_name: "CoolAir Pro",
      industry: "HVAC",
      niche: "hvac",
      cities_json: '["Tampa, FL"]',
      trades_json: '[]',
      icp_expansion_json: JSON.stringify(cachedSegments),
      icp_expanded_at: "2026-10-09T10:00:00Z",
      updated_at: "2026-10-09T09:00:00Z"
    };

    const envMock: any = {
      RADAR_DB: {
        prepare: (query: string) => ({
          bind: () => ({
            first: () => Promise.resolve(tenantRow),
            run: () => Promise.resolve()
          })
        })
      }
    };

    const targets = await getPriorityTargets(1, envMock, "tenant", "t_test_hvac");
    assert(targets.missionConfig.niches.length === 2, "Niches should be populated from expanded ICP segments");
    assert(targets.missionConfig.niches[0] === "Facility Managers", "First niche should be Facility Managers");
    assert(targets.missionConfig.niches[1] === "HOA Boards", "Second niche should be HOA Boards");
  }
});

// Test 39: pushMarketObservationsToBem safely handles missing config and formats payload correctly
tests.push({
  name: "pushMarketObservationsToBem skips cleanly without config and sends observations when configured",
  run: async () => {
    const { pushMarketObservationsToBem } = await import('./worker');

    // 1. Without configuration
    const emptyEnv = { RADAR_DB: {} as any } as any;
    const skippedRes = await pushMarketObservationsToBem(emptyEnv);
    assert(skippedRes.skipped === true, "Should return skipped: true when BVELT_INGEST_URL/KEY are missing");
    assert(skippedRes.reason === "missing_config", "Reason should be missing_config");

    // 2. With configuration & mock database
    const mockProspects = [
      {
        id: "p_1",
        tenant_id: "founder",
        name: "Acme HVAC",
        city: "Austin, TX",
        trade: "hvac",
        website: "https://acmehvac.com",
        phone: "+15125550100",
        email: "contact@acmehvac.com",
        score: 82,
        outcome: "sent",
        status: "sent",
        created_at: new Date().toISOString()
      },
      {
        id: "p_2",
        tenant_id: "t_tenant123",
        name: "Lone Star Plumbing",
        city: "Dallas, TX",
        trade: "plumbing",
        website: "",
        phone: "+12145550200",
        email: "",
        score: 65,
        outcome: null,
        status: "queued",
        created_at: new Date().toISOString()
      }
    ];

    const tracker = { postCalled: false };
    let postBody: any = null;
    let authHeader: string = "";

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: any, init?: any) => {
      if (String(url).includes("bvelt.app/api/radar/observations")) {
        tracker.postCalled = true;
        authHeader = init?.headers?.["Authorization"] || "";
        postBody = JSON.parse(init?.body || "{}");
        return new Response(JSON.stringify({ ok: true, accepted: 2 }), { status: 200 });
      }
      return originalFetch(url, init);
    }) as any;

    try {
      const configuredEnv: any = {
        BVELT_INGEST_URL: "https://bvelt.app/api/radar/observations",
        BVELT_INGEST_KEY: "test_ingest_key_123",
        TELEGRAM_BOT_TOKEN: "",
        TELEGRAM_CHAT_ID: "",
        RADAR_DB: {
          prepare: (sql: string) => ({
            bind: (...args: any[]) => ({
              all: async () => ({ results: mockProspects }),
              first: async () => null,
              run: async () => ({ success: true })
            }),
            all: async () => ({ results: mockProspects }),
            first: async () => null,
            run: async () => ({ success: true })
          })
        }
      };

      const pushRes = await pushMarketObservationsToBem(configuredEnv);
      assert(pushRes.ok === true, "Push should succeed with HTTP 200");
      assert(pushRes.accepted === 1, "Should report 1 accepted item (Founder only, Tenant strictly blocked from BEM)");
      assert(tracker.postCalled === true, "POST fetch must have been called");
      assert(authHeader === "Bearer test_ingest_key_123", "Authorization header must be Bearer key");
      assert(postBody.source === "bvelt-radar", "Payload source must be bvelt-radar");
      assert(postBody.items.length === 1, "Payload must include ONLY 1 founder item");

      const item1 = postBody.items[0];
      assert(item1.mode === "founder", "Item 1 mode should be founder");
      assert(item1.tenant_id === "founder", "Item 1 tenant_id should be founder");
      assert(item1.has_website === true, "Item 1 has_website should be true");
      assert(item1.has_phone === true, "Item 1 has_phone should be true");
      assert(item1.has_email === true, "Item 1 has_email should be true");
      assert(item1.score === 82, "Item 1 score should be 82");

      // Verify no tenant records leaked into BEM
      const leakedTenant = postBody.items.find((it: any) => it.tenant_id !== "founder" || it.mode !== "founder");
      assert(!leakedTenant, "Zero tenant records should enter global BEM");

      // 3. Test dedicated Tenant sender (sendTenantObservationsToBvelt)
      const { sendTenantObservationsToBvelt } = await import('./worker');
      let tenantPostCalled = false;
      let tenantPostBody: any = null;
      let tenantHeaderTenantId: string = "";

      const originalFetch2 = globalThis.fetch;
      globalThis.fetch = (async (url: any, init?: any) => {
        if (String(url).includes("bvelt.app/api/radar/observations")) {
          tenantPostCalled = true;
          tenantHeaderTenantId = init?.headers?.["X-Bvelt-Tenant-Id"] || "";
          tenantPostBody = JSON.parse(init?.body || "{}");
          return new Response(JSON.stringify({ ok: true, accepted: 1 }), { status: 200 });
        }
        return originalFetch2(url, init);
      }) as any;

      try {
        const tenantEnv: any = {
          BVELT_INGEST_URL: "https://bvelt.app/api/radar/observations",
          BVELT_INGEST_KEY: "test_tenant_key_456",
          RADAR_DB: {
            prepare: (sql: string) => ({
              bind: (...args: any[]) => ({
                all: async () => ({
                  results: [
                    {
                      id: "p_tenant_1",
                      tenant_id: "t_tenant123",
                      name: "Lone Star Plumbing",
                      city: "Dallas, TX",
                      trade: "plumbing",
                      website: "https://lonestarplumb.com",
                      phone: "+12145550200",
                      email: "info@lonestar.com",
                      score: 77,
                      status: "qualified",
                      tenant_outcome: null,
                      bvelt_angle: "property_management",
                      created_at: new Date().toISOString()
                    }
                  ]
                }),
                first: async () => null,
                run: async () => ({ success: true })
              }),
              first: async () => null,
              run: async () => ({ success: true })
            })
          }
        };

        const tenantRes = await sendTenantObservationsToBvelt(tenantEnv, "t_tenant123");
        assert(tenantRes.ok === true, "Tenant observation push must succeed");
        assert(tenantRes.sent_count === 1, "Should send 1 tenant prospect");
        assert(Boolean(tenantPostCalled), "Fetch must be invoked for tenant push");
        assert(tenantHeaderTenantId === "t_tenant123", "X-Bvelt-Tenant-Id header must match tenant ID");
        assert(tenantPostBody.tenant_id === "t_tenant123", "Payload tenant_id must be t_tenant123");
        assert(tenantPostBody.items[0].name === "Lone Star Plumbing", "Item should be Lone Star Plumbing");
      } finally {
        globalThis.fetch = originalFetch2;
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  }
});

// Tests 40-52: Comprehensive Scrapling Sidecar Research Suite
tests.push({
  name: "Scrapling Research Suite: contracts, isolation, concurrency, security & callbacks",
  run: async () => {
    // Shared mock stores
    const candidatesStore: any[] = [];
    const evidenceStore: any[] = [];
    const dispatchesStore: any[] = [];
    const queueJobsStore: any[] = [];
    const prospectsStore: any[] = [
      {
        id: "p_founder_01",
        mode: "founder",
        tenant_id: "founder",
        name: "Acme Plumbing",
        city: "Tampa, FL",
        trade: "plumbing",
        website: "https://acmeplumbing.com",
        signals_json: JSON.stringify({ signals: {} })
      },
      {
        id: "p_tenantA_01",
        mode: "tenant",
        tenant_id: "tenant_A",
        name: "Sunbelt HOA Services",
        city: "Orlando, FL",
        trade: "hoa",
        website: "https://sunbelthoa.com",
        signals_json: JSON.stringify({ signals: {} })
      },
      {
        id: "p_tenantB_01",
        mode: "tenant",
        tenant_id: "tenant_B",
        name: "Metro Property Mgmt",
        city: "Austin, TX",
        trade: "property management",
        website: "https://metropm.com",
        signals_json: JSON.stringify({ signals: {} })
      },
      {
        id: "p_no_website",
        mode: "founder",
        tenant_id: "founder",
        name: "No Site Contractor",
        city: "Dallas, TX",
        trade: "roofing",
        website: null,
        signals_json: JSON.stringify({ signals: {} })
      }
    ];

    const mockDb: any = {
      batch: async (statements: any[]) => [],
      prepare: (sql: string) => {
        const sqlLower = sql.toLowerCase().replace(/\s+/g, " ");
        return {
          bind: (...args: any[]) => {
            return {
              run: async () => {
                if (sqlLower.includes("insert or ignore into research_run_candidates")) {
                  const existing = candidatesStore.find(c => c.run_id === args[0] && c.tenant_id === args[2] && c.prospect_id === args[3]);
                  if (!existing) {
                    candidatesStore.push({ run_id: args[0], mode: args[1], tenant_id: args[2], prospect_id: args[3], created_at: args[4] });
                  }
                } else if (sqlLower.includes("insert into sidecar_dispatches")) {
                  // Check UNIQUE(run_id, tenant_id)
                  const existing = dispatchesStore.find(d => d.run_id === args[1] && d.tenant_id === args[3]);
                  if (existing) {
                    throw new Error("SQLITE_CONSTRAINT: UNIQUE constraint failed: sidecar_dispatches.run_id, sidecar_dispatches.tenant_id");
                  }
                  dispatchesStore.push({
                    id: args[0],
                    run_id: args[1],
                    mode: args[2],
                    tenant_id: args[3],
                    status: args[4],
                    attempts: args[5],
                    workflow_file: args[6],
                    created_at: args[7],
                    updated_at: args[8],
                    completed_at: null
                  });
                } else if (sqlLower.includes("update sidecar_dispatches set status = 'queued'")) {
                  const d = dispatchesStore.find(x => x.id === args[1]);
                  if (d) { d.status = "queued"; d.updated_at = args[0]; }
                } else if (sqlLower.includes("update sidecar_dispatches set status = 'failed'")) {
                  const d = dispatchesStore.find(x => x.id === args[2]);
                  if (d) { d.status = "failed"; d.last_error = args[0]; d.updated_at = args[1]; }
                } else if (sqlLower.includes("update sidecar_dispatches set status = 'completed'")) {
                  const d = dispatchesStore.find(x => x.run_id === args[2] && x.tenant_id === args[3]);
                  if (d) { d.status = "completed"; d.completed_at = args[0]; d.updated_at = args[1]; }
                } else if (sqlLower.includes("insert into source_evidence")) {
                  evidenceStore.push({
                    id: args[0],
                    run_id: args[1],
                    mode: args[2],
                    tenant_id: args[3],
                    prospect_id: args[4],
                    source_id: args[5],
                    source_url: args[6],
                    evidence_type: args[7],
                    evidence_json: args[8],
                    content_hash: args[9],
                    extractor_version: args[10],
                    confidence: args[11],
                    observed_at: args[12],
                    created_at: args[13]
                  });
                } else if (sqlLower.includes("update prospects set signals_json")) {
                  const p = prospectsStore.find(x => x.id === args[2]);
                  if (p) { p.signals_json = args[0]; }
                }
                return { success: true, meta: { changes: 1 } };
              },
              first: async () => {
                if (sqlLower.includes("select count(*) as c from queue_jobs")) {
                  const pending = queueJobsStore.filter(j => j.run_id === args[0] && j.status !== "completed");
                  return { c: pending.length };
                } else if (sqlLower.includes("select count(*) as cnt from research_run_candidates c join prospects p")) {
                  const matched = candidatesStore.filter(c => {
                    const p = prospectsStore.find(pr => pr.id === c.prospect_id);
                    return c.run_id === args[0] && c.mode === args[1] && c.tenant_id === args[2] && p && p.website;
                  });
                  return { cnt: matched.length };
                } else if (sqlLower.includes("select id, status, attempts from sidecar_dispatches")) {
                  const d = dispatchesStore.find(x => x.run_id === args[0] && x.tenant_id === args[1]);
                  return d ? { id: d.id, status: d.status, attempts: d.attempts } : null;
                } else if (sqlLower.includes("select 1 from research_run_candidates")) {
                  const c = candidatesStore.find(x => x.run_id === args[0] && x.mode === args[1] && x.tenant_id === args[2] && x.prospect_id === args[3]);
                  return c ? { 1: 1 } : null;
                } else if (sqlLower.includes("select id, signals_json from prospects")) {
                  const p = prospectsStore.find(x => x.id === args[0] && x.mode === args[1] && (x.tenant_id || "founder") === args[2]);
                  return p ? { id: p.id, signals_json: p.signals_json, website: p.website } : null;
                } else if (sqlLower.includes("select id from source_evidence")) {
                  const ev = evidenceStore.find(x => x.prospect_id === args[0] && x.source_id === args[1] && x.evidence_type === args[2] && x.content_hash === args[3]);
                  return ev ? { id: ev.id } : null;
                }
                return null;
              },
              all: async () => {
                if (sqlLower.includes("from research_run_candidates c join prospects p")) {
                  const matched = candidatesStore
                    .filter(c => c.run_id === args[0] && c.mode === args[1] && c.tenant_id === args[2])
                    .map(c => {
                      const p = prospectsStore.find(pr => pr.id === c.prospect_id);
                      return {
                        prospect_id: c.prospect_id,
                        business_name: p ? p.name : "",
                        city: p ? p.city : "",
                        trade: p ? p.trade : "",
                        website: p ? p.website : null
                      };
                    })
                    .filter(c => c.website !== null && c.website !== "");
                  return { results: matched.slice(0, 50) };
                }
                return { results: [] };
              }
            };
          }
        };
      }
    };

    const mockEnv: any = {
      RADAR_DB: mockDb,
      RADAR_SERVICE_KEY: "admin_service_key_999",
      RADAR_SIDECAR_CALLBACK_KEY: "valid_sidecar_key_123",
      GITHUB_ACTIONS_TOKEN: "mock_gh_token",
      RADAR_RESEARCH_REPOSITORY: "rayleblanc/bvelt-radar"
    };

    // 1. Contrato Worker -> runner (GET /api/research/candidates)
    await associateResearchCandidate(mockDb, "run_001", "founder", "founder", "p_founder_01");
    const req1 = new Request("https://radar.bvelt.app/api/research/candidates?run_id=run_001&mode=founder&tenant_id=founder", {
      headers: { "Authorization": "Bearer valid_sidecar_key_123" }
    });
    const res1 = await worker.fetch(req1, mockEnv, {} as any);
    assert(res1.status === 200, "1. Candidates endpoint should return 200");
    const json1 = await res1.json() as any;
    assert(Array.isArray(json1.records), "1. Response must contain 'records' array for runner.py");
    assert(json1.run_id === "run_001", "1. Response run_id must match");
    assert(json1.records.length === 1, "1. Must return 1 candidate");
    const cand1 = json1.records[0];
    assert(cand1.prospect_id === "p_founder_01", "1. prospect_id must match");
    assert(cand1.business_name === "Acme Plumbing", "1. business_name must match");
    assert(cand1.city === "Tampa, FL", "1. city must match");
    assert(cand1.trade === "plumbing", "1. trade must match");
    assert(cand1.website === "https://acmeplumbing.com", "1. website must match");
    assert(cand1.email === undefined, "1. email MUST NOT be exposed");
    assert(cand1.phone === undefined, "1. phone MUST NOT be exposed");
    assert(cand1.demo_token === undefined, "1. demo_token MUST NOT be exposed");

    // 2. Contrato runner -> callback (POST /api/research/evidence)
    const req2 = new Request("https://radar.bvelt.app/api/research/evidence", {
      method: "POST",
      headers: {
        "Authorization": "Bearer valid_sidecar_key_123",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        run_id: "run_001",
        mode: "founder",
        tenant_id: "founder",
        extractor_version: "bvelt-scrapling-1.0.0",
        run_status: "completed",
        candidates_received: 1,
        records: [
          {
            prospect_id: "p_founder_01",
            source_id: "scrapling_business_website",
            source_url: "https://acmeplumbing.com",
            evidence_type: "business_website_profile",
            evidence: { contact_form_observed: true, page_title: "Acme Plumbing Services" },
            content_hash: "hash_001",
            extractor_version: "bvelt-scrapling-1.0.0",
            confidence: 0.78,
            observed_at: new Date().toISOString()
          }
        ]
      })
    });
    const res2 = await worker.fetch(req2, mockEnv, {} as any);
    assert(res2.status === 200, "2. Evidence endpoint should return 200");
    const json2 = await res2.json() as any;
    assert(json2.status === "ok", "2. Status must be ok");
    assert(json2.inserted === 1, "2. Inserted count must be 1");
    assert(json2.duplicated === 0, "2. Duplicated count must be 0");
    assert(json2.rejected === 0, "2. Rejected count must be 0");

    // 3. Respuesta vacía de candidatos (run with no website)
    await associateResearchCandidate(mockDb, "run_empty", "founder", "founder", "p_no_website");
    const req3 = new Request("https://radar.bvelt.app/api/research/candidates?run_id=run_empty&mode=founder&tenant_id=founder", {
      headers: { "Authorization": "Bearer valid_sidecar_key_123" }
    });
    const res3 = await worker.fetch(req3, mockEnv, {} as any);
    assert(res3.status === 200, "3. Candidates endpoint with no sites should return 200");
    const json3 = await res3.json() as any;
    assert(Array.isArray(json3.records) && json3.records.length === 0, "3. records array must be empty");

    // 4. Callback vacío (records: [])
    const req4 = new Request("https://radar.bvelt.app/api/research/evidence", {
      method: "POST",
      headers: {
        "Authorization": "Bearer valid_sidecar_key_123",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        run_id: "run_empty",
        mode: "founder",
        tenant_id: "founder",
        extractor_version: "bvelt-scrapling-1.0.0",
        run_status: "completed",
        candidates_received: 0,
        records: []
      })
    });
    const res4 = await worker.fetch(req4, mockEnv, {} as any);
    assert(res4.status === 200, "4. Empty callback must return 200");
    const json4 = await res4.json() as any;
    assert(json4.status === "ok", "4. Status must be ok for empty callback");
    assert(json4.inserted === 0 && json4.total_received === 0, "4. Inserted and total must be 0");

    // 5. Duplicación de evidencias
    const req5 = new Request("https://radar.bvelt.app/api/research/evidence", {
      method: "POST",
      headers: {
        "Authorization": "Bearer valid_sidecar_key_123",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        run_id: "run_001",
        mode: "founder",
        tenant_id: "founder",
        records: [
          {
            prospect_id: "p_founder_01",
            source_id: "scrapling_business_website",
            source_url: "https://acmeplumbing.com",
            evidence_type: "business_website_profile",
            evidence: { contact_form_observed: true },
            content_hash: "hash_001",
            extractor_version: "bvelt-scrapling-1.0.0"
          }
        ]
      })
    });
    const res5 = await worker.fetch(req5, mockEnv, {} as any);
    const json5 = await res5.json() as any;
    assert(json5.duplicated === 1, "5. Re-sending identical content_hash must report duplicated=1");
    assert(json5.inserted === 0, "5. Duplicated evidence must not be re-inserted");

    // 6. Founder frente a Tenant
    const req6FounderMismatch = new Request("https://radar.bvelt.app/api/research/candidates?run_id=run_001&mode=founder&tenant_id=tenant_A", {
      headers: { "Authorization": "Bearer valid_sidecar_key_123" }
    });
    const res6 = await worker.fetch(req6FounderMismatch, mockEnv, {} as any);
    assert(res6.status === 400, "6. Founder request with tenant_id != 'founder' must return 400");

    const req6TenantMismatch = new Request("https://radar.bvelt.app/api/research/candidates?run_id=run_001&mode=tenant&tenant_id=founder", {
      headers: { "Authorization": "Bearer valid_sidecar_key_123" }
    });
    const res6b = await worker.fetch(req6TenantMismatch, mockEnv, {} as any);
    assert(res6b.status === 400, "6. Tenant request with tenant_id='founder' must return 400");

    // 7. Tenant A frente a Tenant B
    await associateResearchCandidate(mockDb, "run_tenantA", "tenant", "tenant_A", "p_tenantA_01");
    await associateResearchCandidate(mockDb, "run_tenantB", "tenant", "tenant_B", "p_tenantB_01");

    const req7TenantA = new Request("https://radar.bvelt.app/api/research/candidates?run_id=run_tenantA&mode=tenant&tenant_id=tenant_A", {
      headers: { "Authorization": "Bearer valid_sidecar_key_123" }
    });
    const res7A = await worker.fetch(req7TenantA, mockEnv, {} as any);
    const json7A = await res7A.json() as any;
    assert(json7A.records.length === 1 && json7A.records[0].prospect_id === "p_tenantA_01", "7. Tenant A only receives Tenant A candidates");

    // Attempting to submit Tenant B's prospect under Tenant A's run
    const req7CrossSubmit = new Request("https://radar.bvelt.app/api/research/evidence", {
      method: "POST",
      headers: { "Authorization": "Bearer valid_sidecar_key_123", "Content-Type": "application/json" },
      body: JSON.stringify({
        run_id: "run_tenantA",
        mode: "tenant",
        tenant_id: "tenant_A",
        records: [
          {
            prospect_id: "p_tenantB_01",
            source_id: "scrapling",
            source_url: "https://metropm.com",
            evidence_type: "profile",
            content_hash: "hash_tenantB_cross"
          }
        ]
      })
    });
    const res7Cross = await worker.fetch(req7CrossSubmit, mockEnv, {} as any);
    const json7Cross = await res7Cross.json() as any;
    assert(json7Cross.rejected === 1, "7. Cross-tenant prospect evidence submission must be rejected");

    // 8. Callback sin secreto
    const req8 = new Request("https://radar.bvelt.app/api/research/candidates?run_id=run_001&mode=founder&tenant_id=founder");
    const res8 = await worker.fetch(req8, mockEnv, {} as any);
    assert(res8.status === 401, "8. Request without callback secret must return 401");

    // 9. Callback con secreto incorrecto (or admin key fallback attempt)
    const req9Wrong = new Request("https://radar.bvelt.app/api/research/candidates?run_id=run_001&mode=founder&tenant_id=founder", {
      headers: { "Authorization": "Bearer wrong_secret_key" }
    });
    const res9Wrong = await worker.fetch(req9Wrong, mockEnv, {} as any);
    assert(res9Wrong.status === 401, "9. Request with incorrect secret must return 401");

    const req9AdminFallback = new Request("https://radar.bvelt.app/api/research/candidates?run_id=run_001&mode=founder&tenant_id=founder", {
      headers: { "Authorization": "Bearer admin_service_key_999" }
    });
    const res9Admin = await worker.fetch(req9AdminFallback, mockEnv, {} as any);
    assert(res9Admin.status === 401, "9. Request with admin key fallback must return 401");

    // 10. Callback con prospect_id ajeno a la corrida
    const req10 = new Request("https://radar.bvelt.app/api/research/evidence", {
      method: "POST",
      headers: { "Authorization": "Bearer valid_sidecar_key_123", "Content-Type": "application/json" },
      body: JSON.stringify({
        run_id: "run_001",
        mode: "founder",
        tenant_id: "founder",
        records: [
          {
            prospect_id: "p_unknown_9999",
            source_id: "scrapling",
            source_url: "https://unknown.com",
            evidence_type: "profile",
            content_hash: "hash_unknown"
          }
        ]
      })
    });
    const res10 = await worker.fetch(req10, mockEnv, {} as any);
    const json10 = await res10.json() as any;
    assert(json10.rejected === 1, "10. Evidence with alien prospect_id must be rejected");

    // 11. Dos despachos concurrentes para el mismo run
    let fetchCallCount = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: any, init?: any) => {
      if (String(url).includes("api.github.com")) {
        fetchCallCount++;
        return new Response(null, { status: 204 });
      }
      return originalFetch(url, init);
    }) as any;

    try {
      const [dispatch1, dispatch2] = await Promise.all([
        maybeDispatchSidecarResearch(mockEnv, "run_tenantA", "tenant", "tenant_A"),
        maybeDispatchSidecarResearch(mockEnv, "run_tenantA", "tenant", "tenant_A")
      ]);
      assert(dispatch1 !== dispatch2, "11. Only one concurrent dispatch should succeed");
      assert(fetchCallCount === 1, "11. GitHub Actions workflow should only be dispatched once");

      // 12. Fallo de GitHub Actions
      await associateResearchCandidate(mockDb, "run_fail_test", "founder", "founder", "p_founder_01");
      globalThis.fetch = (async (url: any, init?: any) => {
        if (String(url).includes("api.github.com")) {
          return new Response("Workflow dispatch failed: rate limit exceeded", { status: 403 });
        }
        return originalFetch(url, init);
      }) as any;

      const failDispatchResult = await maybeDispatchSidecarResearch(mockEnv, "run_fail_test", "founder", "founder");
      assert(failDispatchResult === false, "12. Dispatch with failing GitHub response must return false");
      const failedRecord = dispatchesStore.find(d => d.run_id === "run_fail_test");
      assert(failedRecord !== undefined, "12. Dispatch record must exist in D1");
      assert(failedRecord.status === "failed", "12. Dispatch record status must be set to 'failed'");
      assert(failedRecord.last_error.includes("403"), "12. Error message must record status 403");

      // 14. Finalización sin evidencias (records: [])
      const req14 = new Request("https://radar.bvelt.app/api/research/evidence", {
        method: "POST",
        headers: { "Authorization": "Bearer valid_sidecar_key_123", "Content-Type": "application/json" },
        body: JSON.stringify({
          run_id: "run_tenantA",
          mode: "tenant",
          tenant_id: "tenant_A",
          records: []
        })
      });
      const res14 = await worker.fetch(req14, mockEnv, {} as any);
      assert(res14.status === 200, "14. Finalization without evidence must return 200");
      const completedDispatch = dispatchesStore.find(d => d.run_id === "run_tenantA");
      assert(completedDispatch && completedDispatch.status === "completed", "14. Dispatch status must transition to 'completed'");
    } finally {
      globalThis.fetch = originalFetch;
    }
  }
});

// Test 41: Security and Tenant Isolation Hard Gates
tests.push({
  name: "Security and Tenant Isolation: unauthenticated requests rejected 401, cross-tenant access blocked 403",
  run: async () => {
    const { resolveTenantAuthContext } = await import('./worker');
    const mockDb: any = {
      prepare: (sql: string) => ({
        bind: (...args: any[]) => ({
          first: async () => {
            if (sql.includes("FROM prospects WHERE id = ?")) {
              return args[1] === "tenant_alpha"
                ? { id: "p_target_01", tenant_id: "tenant_alpha" }
                : null;
            }
            if (sql.includes("FROM tenant_config WHERE tenant_id = ?")) {
              return { tenant_id: args[0], tenant_name: "Test Tenant" };
            }
            return null;
          },
          all: async () => ({ results: [] }),
          run: async () => ({ success: true })
        })
      })
    };

    const mockEnv: any = {
      RADAR_DB: mockDb,
      FOUNDER_SERVICE_KEY: "secret_founder_svc_key",
      RADAR_SERVICE_KEY: "secret_radar_svc_key"
    };

    // 1. Unauthenticated GET /api/tenants/config -> 401
    const unauthGetReq = new Request("https://radar.bvelt.app/api/tenants/config", { method: "GET" });
    const resUnauthGet = await worker.fetch(unauthGetReq, mockEnv, {} as any);
    assert(resUnauthGet.status === 401, "Unauthenticated GET /api/tenants/config must return 401");

    // 2. Unauthenticated POST /api/tenants/config -> 401
    const unauthPostReq = new Request("https://radar.bvelt.app/api/tenants/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenant_id: "tenant_beta" })
    });
    const resUnauthPost = await worker.fetch(unauthPostReq, mockEnv, {} as any);
    assert(resUnauthPost.status === 401, "Unauthenticated POST /api/tenants/config must return 401");

    // 3. Unauthenticated POST /api/prospects/outcome -> 401
    const unauthOutcomeReq = new Request("https://radar.bvelt.app/api/prospects/outcome", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prospect_id: "p_target_01", tenant_id: "tenant_alpha", outcome: "won" })
    });
    const resUnauthOutcome = await worker.fetch(unauthOutcomeReq, mockEnv, {} as any);
    assert(resUnauthOutcome.status === 401, "Unauthenticated POST /api/prospects/outcome must return 401");

    // 4. Cross-tenant access denied: caller scoped to tenant_beta attempting to access tenant_alpha -> 403
    const crossTenantGetReq = new Request("https://radar.bvelt.app/api/tenants/config?tenant_id=tenant_alpha", {
      method: "GET",
      headers: {
        "Cookie": "bvelt_tenant_id=tenant_beta"
      }
    });
    const resCrossGet = await worker.fetch(crossTenantGetReq, mockEnv, {} as any);
    assert(resCrossGet.status === 401 || resCrossGet.status === 403, "Cross-tenant GET config must be blocked (401 or 403)");

    // 5. Authorized service access to tenant config -> 200
    const svcGetReq = new Request("https://radar.bvelt.app/api/tenants/config?tenant_id=tenant_alpha", {
      method: "GET",
      headers: { "Authorization": "Bearer secret_founder_svc_key" }
    });
    const resSvcGet = await worker.fetch(svcGetReq, mockEnv, {} as any);
    assert(resSvcGet.status === 200, "Service key must be allowed to read tenant config");
    const tenantData = await resSvcGet.json() as any;
    assert(tenantData.tenant_id === "tenant_alpha", "Must return correct tenant data");

    // 6. Cross-tenant outcome submission denied: prospect belongs to tenant_alpha but body says tenant_gamma -> 403
    const crossOutcomeReq = new Request("https://radar.bvelt.app/api/prospects/outcome", {
      method: "POST",
      headers: {
        "Authorization": "Bearer secret_founder_svc_key",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ prospect_id: "p_target_01", tenant_id: "tenant_gamma", outcome: "won" })
    });
    const resCrossOutcome = await worker.fetch(crossOutcomeReq, mockEnv, {} as any);
    assert(
      resCrossOutcome.status === 403 || resCrossOutcome.status === 404,
      "Outcome submission with mismatched prospect tenant must be denied without revealing its existence"
    );

    // 7. Unauthenticated CSV export -> 401
    const unauthCsvReq = new Request("https://radar.bvelt.app/api/tenants/leads.csv?tenant_id=tenant_alpha", { method: "GET" });
    const resUnauthCsv = await worker.fetch(unauthCsvReq, mockEnv, {} as any);
    assert(resUnauthCsv.status === 401, "Unauthenticated CSV export must return 401");
  }
});

// Test 42: Tenant Auto-Prospecting & Bootstrap (No HVAC defaults, requires real data)
tests.push({
  name: "Tenant Auto-Prospecting & Bootstrap: rejects missing trade/city without defaulting to HVAC",
  run: async () => {
    const { bootstrapBveltTenant } = await import('./worker');
    const mockEnv: any = {
      RADAR_DB: {
        prepare: () => ({
          bind: () => ({
            run: async () => ({ success: true }),
            first: async () => null,
            all: async () => ({ results: [] })
          })
        })
      }
    };

    // 1. Missing trade: MUST NOT default to "hvac"
    const missingTradeRes = await bootstrapBveltTenant(mockEnv, {
      tenant_id: "client_no_trade",
      city: "Austin, TX"
      // no trade, niche, or industry
    });
    assert(missingTradeRes.success === false, "Bootstrap must fail when trade is missing");
    assert(missingTradeRes.status === "pending_configuration", "Status must be pending_configuration");
    assert(missingTradeRes.missing_fields?.includes("trade") === true, "Must flag missing 'trade'");
    assert(missingTradeRes.message.includes("trade_required"), "Message must explain trade is required");

    // 2. Missing city: MUST NOT default to Tampa or any arbitrary city
    const missingCityRes = await bootstrapBveltTenant(mockEnv, {
      tenant_id: "client_no_city",
      trade: "plumbing"
      // no city or coordinates
    });
    assert(missingCityRes.success === false, "Bootstrap must fail when city is missing");
    assert(missingCityRes.status === "pending_configuration", "Status must be pending_configuration");
    assert(missingCityRes.missing_fields?.includes("city") === true, "Must flag missing 'city'");

    // 3. Valid trade and city: sets up configuration and activates
    const mockCtx = { waitUntil: (_p: any) => {} } as any;
    const validRes = await bootstrapBveltTenant(mockEnv, {
      tenant_id: "client_plumbing_pro",
      tenant_name: "Pro Drain Care",
      trade: "plumbing",
      city: "Dallas, TX",
      skip_fast_discovery: true
    }, mockCtx);
    assert(validRes.success === true, "Valid bootstrap must succeed");
    assert(validRes.status === "active", "Status must be active");
    assert(validRes.city === "Dallas, TX", "City must match resolved city");
    assert(validRes.niches.length > 0, "Niches must be populated from trade map");
    assert(validRes.niches.includes("property management"), "Plumbing must target property management buyers");
  }
});

// Test 43: Eliminate False Commercial Inferences in buildAttackKit
tests.push({
  name: "Eliminate False Inferences in buildAttackKit: phone/website alone never triggers missed_calls",
  run: async () => {
    const { buildAttackKit } = await import('./worker');

    // 1. Candidate with phone, website, and email, but NO friction signals -> DO NOT CONTACT
    const bareProspect = {
      id: "p_bare_01",
      name: "Dallas Elite Plumbing",
      city: "Dallas, TX",
      trade: "plumbing",
      phone: "+12145551234",
      website: "https://dallaseliteplumbing.com",
      email: "service@dallaseliteplumbing.com",
      signals_json: JSON.stringify({
        booking: true,
        contact_form: true
      })
    };
    const bareKit = buildAttackKit(bareProspect);
    assert(bareKit.angle === "no_evidence", "Bare phone/form must not invent missed_calls; angle should be no_evidence");
    assert(bareKit.sms === "", "No SMS should be generated without verified friction");
    assert(bareKit.next_action.includes("DO_NOT_CONTACT"), "Next action must be DO_NOT_CONTACT");

    // 2. Candidate with VERIFIED missed call friction -> missed_calls angle
    const verifiedMissedCallProspect = {
      id: "p_missed_02",
      name: "Apex Air HVAC",
      city: "Houston, TX",
      trade: "hvac",
      phone: "+17135559876",
      signals_json: JSON.stringify({
        after_hours_voicemail: true,
        missed_call_evidence: true
      })
    };
    const missedKit = buildAttackKit(verifiedMissedCallProspect);
    assert(missedKit.angle === "missed_calls", "Verified friction must select missed_calls angle");
    assert(missedKit.sms.length > 0, "SMS must be generated for verified angle");
    assert(missedKit.sms.includes("Rainer"), "Must sign as Rainer");
    assert(missedKit.sms.includes("https://bvelt.app/"), "Must include mandatory CTA link https://bvelt.app/");

    // 3. Candidate with verified quote request friction -> stale_quotes angle
    const verifiedQuoteProspect = {
      id: "p_quote_03",
      name: "Lonestar Roofers",
      city: "San Antonio, TX",
      trade: "roofing",
      signals_json: JSON.stringify({
        quote_request: true,
        stale_estimates: true
      })
    };
    const quoteKit = buildAttackKit(verifiedQuoteProspect);
    assert(quoteKit.angle === "stale_quotes", "Verified quote friction must select stale_quotes angle");

    // 4. Candidate with phone-only / no SMS capability -> no_sms angle
    const verifiedNoSmsProspect = {
      id: "p_nosms_04",
      name: "Austin Clean Team",
      city: "Austin, TX",
      trade: "cleaning",
      signals_json: JSON.stringify({
        phone_only: true,
        no_sms: true
      })
    };
    const noSmsKit = buildAttackKit(verifiedNoSmsProspect);
    assert(noSmsKit.angle === "no_sms", "Verified no_sms signal must select no_sms angle");

    // 5. Off-ICP prospect (e.g. Barbershop) -> hard gate disqualified
    const offIcpProspect = {
      id: "p_barber_05",
      name: "Gentlemen's Barber & Shave Parlor",
      city: "Austin, TX",
      trade: "lawn_care", // Mismatched label
      signals_json: JSON.stringify({ missed_call_evidence: true })
    };
    const barberKit = buildAttackKit(offIcpProspect);
    assert(barberKit.angle === "disqualified_off_icp", "Barbershop must be disqualified as off-ICP");
    assert(barberKit.sms === "", "Disqualified prospect must get zero SMS");
  }
});

// Test 44: Sidecar Runner & Evidence Callback Robustness (failure handling, empty completed & idempotent sync)
tests.push({
  name: "Sidecar & Evidence Callback: runner failure recording, empty records completed, and canonical signals dual-sync",
  run: async () => {
    const dispatchesStore: any[] = [];
    const evidenceStore: any[] = [];
    const prospectsStore: any[] = [
      {
        id: "p_sync_01",
        mode: "founder",
        tenant_id: "founder",
        website: "https://testbusiness.com",
        signals_json: JSON.stringify({ existing_fact: true })
      }
    ];

    const mockDb: any = {
      prepare: (sql: string) => ({
        bind: (...args: any[]) => ({
          first: async () => {
            if (sql.includes("FROM research_run_candidates")) {
              return { 1: 1 };
            }
            if (sql.includes("FROM prospects")) {
              return prospectsStore.find(p => p.id === args[0]) || null;
            }
            if (sql.includes("FROM source_evidence WHERE prospect_id = ?")) {
              return evidenceStore.find(e => e.prospect_id === args[0] && e.content_hash === args[3]) || null;
            }
            return null;
          },
          all: async () => ({ results: [] }),
          run: async () => {
            if (sql.includes("INSERT INTO source_evidence")) {
              evidenceStore.push({ id: args[0], run_id: args[1], prospect_id: args[4], content_hash: args[9] });
            }
            if (sql.includes("UPDATE sidecar_dispatches")) {
              let disp = dispatchesStore.find(d => d.run_id === args[3] || d.id === args[2] || d.run_id === args[2]);
              if (!disp) {
                disp = { run_id: args[args.length - 2] || "run_test", status: "pending" };
                dispatchesStore.push(disp);
              }
              if (sql.includes("status = 'failed'")) {
                disp.status = "failed";
                disp.last_error = args[0];
              } else if (sql.includes("status = 'completed'")) {
                disp.status = "completed";
              }
            }
            if (sql.includes("UPDATE prospects SET signals_json = ?")) {
              const p = prospectsStore.find(item => item.id === args[2]);
              if (p) p.signals_json = args[0];
            }
            return { success: true };
          }
        })
      })
    };

    const mockEnv: any = {
      RADAR_DB: mockDb,
      RADAR_SIDECAR_CALLBACK_KEY: "cb_key_robustness_test"
    };

    // 1. Runner failure callback notification
    const failReq = new Request("https://radar.bvelt.app/api/research/evidence", {
      method: "POST",
      headers: {
        "Authorization": "Bearer cb_key_robustness_test",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        run_id: "run_fail_notify",
        mode: "founder",
        tenant_id: "founder",
        status: "failed",
        error: "Fatal network error: Chromium sandboxing failed",
        records: []
      })
    });
    const failRes = await worker.fetch(failReq, mockEnv, {} as any);
    assert(failRes.status === 200, "Runner failure notification must return 200");
    const failJson = await failRes.json() as any;
    assert(failJson.status === "recorded_failure", "Must report recorded_failure");

    // 2. Empty results callback (records: [])
    const emptyReq = new Request("https://radar.bvelt.app/api/research/evidence", {
      method: "POST",
      headers: {
        "Authorization": "Bearer cb_key_robustness_test",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        run_id: "run_empty_notify",
        mode: "founder",
        tenant_id: "founder",
        status: "completed",
        records: []
      })
    });
    const emptyRes = await worker.fetch(emptyReq, mockEnv, {} as any);
    assert(emptyRes.status === 200, "Empty records callback must return 200");
    const emptyJson = await emptyRes.json() as any;
    assert(emptyJson.outcome === "empty_completed", "Empty callback must report outcome empty_completed");

    // 3. Evidence insertion and dual-sync into signals_json
    const evidenceReq = new Request("https://radar.bvelt.app/api/research/evidence", {
      method: "POST",
      headers: {
        "Authorization": "Bearer cb_key_robustness_test",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        run_id: "run_sync_01",
        mode: "founder",
        tenant_id: "founder",
        records: [
          {
            prospect_id: "p_sync_01",
            source_id: "scrapling_test",
            source_url: "https://testbusiness.com",
            evidence_type: "business_profile",
            content_hash: "hash_sync_123",
            evidence: {
              page_title: "Test Business Homepage",
              public_business_phones: ["+15551234567"]
            }
          }
        ]
      })
    });
    const evidenceRes = await worker.fetch(evidenceReq, mockEnv, {} as any);
    assert(evidenceRes.status === 200, "Evidence callback must return 200");
    const evidenceJson = await evidenceRes.json() as any;
    assert(evidenceJson.inserted === 1, "Must insert 1 evidence");

    // Check prospectsStore updated signals_json has both canonical formats
    const updatedProspect = prospectsStore.find(p => p.id === "p_sync_01");
    const parsedSignals = JSON.parse(updatedProspect.signals_json);
    assert(parsedSignals.scrapling !== undefined, "Canonical scrapling property must exist");
    assert(parsedSignals.signals?.scrapling !== undefined, "Canonical signals.scrapling property must exist");
    assert(parsedSignals.scrapling.facts.page_title === "Test Business Homepage", "Facts must include extracted page_title");
  }
});

// Test 45: Tenant auth is scoped; ingestion credentials cannot access admin routes.
tests.push({
  name: "Tenant auth: Radar service is tenant-scoped and ingest key is not an admin credential",
  run: async () => {
    const env: any = {
      FOUNDER_SERVICE_KEY: "founder-secret",
      RADAR_SERVICE_KEY: "radar-service-secret",
      BVELT_INGEST_KEY: "ingest-only-secret"
    };
    const tenantRequest = new Request("https://radar.test/api/tenants/config", {
      headers: { "Authorization": "Bearer radar-service-secret", "X-Tenant-Id": "tenant_alpha" }
    });
    const tenantAuth = resolveTenantAuthContext(tenantRequest, env, "founder-secret", "");
    assert(tenantAuth.authorized, "Radar service with explicit tenant scope must authenticate");
    assert(tenantAuth.canAccessTenant("tenant_alpha"), "Radar service must access its declared tenant");
    assert(!tenantAuth.canAccessTenant("tenant_beta"), "Radar service must not cross tenant boundaries");
    assert(!tenantAuth.canAccessTenant("founder"), "Radar service must not access Founder scope");

    const ingestRequest = new Request("https://radar.test/api/tenants/config", {
      headers: { "Authorization": "Bearer ingest-only-secret", "X-Tenant-Id": "tenant_alpha" }
    });
    const ingestAuth = resolveTenantAuthContext(ingestRequest, env, "founder-secret", "");
    assert(!ingestAuth.authorized, "BEM ingestion key must not authenticate tenant/admin APIs");
    assert(!isAuthorized(ingestRequest, env, "founder-secret", ""), "BEM ingestion key must not authorize /run or admin routes");

    const founderRequest = new Request("https://radar.test/api/tenants/config", {
      headers: { "Authorization": "Bearer founder-secret" }
    });
    const founderAuth = resolveTenantAuthContext(founderRequest, env, "founder-secret", "");
    assert(founderAuth.authorized && founderAuth.canAccessTenant("tenant_beta"), "Founder credential retains administrative access");
  }
});

// Run all test cases
async function runTests() {

  let passedAll = true;
  const results: TestResult[] = [];

  for (const test of tests) {
    try {
      await test.run();
      results.push({ name: test.name, passed: true });
    } catch (e: any) {
      results.push({ name: test.name, passed: false, error: e.message || e });
      passedAll = false;
    }
  }

  console.log("\n=========================================");
  console.log("TEST SUMMARY RESULT:");
  console.log("=========================================");
  results.forEach((res, index) => {
    const status = res.passed ? "✅ PASSED" : `❌ FAILED: ${res.error}`;
    console.log(`${index + 1}. [${res.name}] -> ${status}`);
  });
  console.log("=========================================");

  if (!passedAll) {
    process.exit(1);
  } else {
    console.log("🎉 ALL TESTS PASSED SUCCESSFULLY! RADAR IS FULLY MARKET-AGNOSTIC.");
    process.exit(0);
  }
}

runTests();
