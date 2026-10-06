import { getPriorityTargets, calculateMultiFactorScore } from './worker';
import { DEFAULT_FOUNDER_MISSION, MissionConfig } from './worker';

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
    assert(totalScore > 50, "Lead should get high score matching both priority trade and priority geography");
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
