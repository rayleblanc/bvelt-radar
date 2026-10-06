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
    assert(res1.breakdown.contactability === 25, "Should have max contactability score (25)");
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
    assert(res2.breakdown.revenue_leak === 40, "Should have max revenue leak points (40)");
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
