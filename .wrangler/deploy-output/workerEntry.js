var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/weatherSignals.ts
async function getAlerts(states) {
  if (!states || states.length === 0) return [];
  const cleanStates = Array.from(
    new Set(
      states.map((s) => (s || "").trim().toUpperCase()).filter((s) => s.length === 2 && /^[A-Z]{2}$/.test(s))
    )
  );
  if (cleanStates.length === 0) return [];
  const url = `https://api.weather.gov/alerts/active?area=${cleanStates.join(",")}`;
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "BveltRadar/1 (contact: bvelt.app)",
        "Accept": "application/geo+json"
      },
      signal: AbortSignal.timeout(7e3)
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (!data || !Array.isArray(data.features)) return [];
    const alerts = [];
    for (const feature of data.features) {
      const props = feature?.properties;
      if (props && props.event && props.areaDesc) {
        alerts.push({
          event: String(props.event),
          areaDesc: String(props.areaDesc),
          expires: String(props.expires || "")
        });
      }
    }
    return alerts;
  } catch (e) {
    return [];
  }
}
__name(getAlerts, "getAlerts");
var EVENT_TRADE_MAP = [
  { pattern: /tornado|hail|wind|thunderstorm|hurricane|tropical/i, trades: ["roofing", "landscaping", "handyman"] },
  { pattern: /heat|excessive heat/i, trades: ["hvac"] },
  { pattern: /freeze|frost|winter|ice|cold|extreme cold/i, trades: ["plumbing", "hvac"] },
  { pattern: /flood|rain|flash flood/i, trades: ["plumbing"] },
  { pattern: /air quality|smoke|dust/i, trades: ["hvac"] },
  { pattern: /fire|red flag/i, trades: ["landscaping", "lawn_care"] }
];
function eventAppliesToTrade(event, trade) {
  if (!event || !trade) return false;
  const t = trade.toLowerCase().replace(/-/g, "_").replace(/\s+/g, "_");
  const trades = tradeForEvent(event);
  if (trades.length === 0) return false;
  return trades.some((x) => {
    const n = x.toLowerCase().replace(/-/g, "_").replace(/\s+/g, "_");
    return t === n || t.includes(n) || n.includes(t);
  });
}
__name(eventAppliesToTrade, "eventAppliesToTrade");
function tradeForEvent(event) {
  if (!event) return [];
  const out = /* @__PURE__ */ new Set();
  for (const row of EVENT_TRADE_MAP) {
    if (row.pattern.test(event)) {
      for (const t of row.trades) out.add(t);
    }
  }
  return Array.from(out);
}
__name(tradeForEvent, "tradeForEvent");

// sidecar/config/market-universe.json
var market_universe_default = {
  version: 1,
  purpose: "Market prioritization hints for Radar. This is not an allowlist and must never exclude other countries, languages, cities, or niches.",
  market_tiers: {
    core_english_commercial: ["US", "CA", "GB", "IE", "AU", "NZ"],
    additional_english_commercial: ["ZA", "SG", "IN", "PH", "MY", "NG", "GH", "KE", "JM", "TT", "BB", "BS", "BZ", "MT", "GY"],
    global_open: "All other countries remain eligible when selected by a Founder mission, Tenant configuration, discovered demand, or market evidence."
  },
  language_policy: {
    default_for_core_english: ["en"],
    allow_multiple_languages_per_market: true,
    do_not_assume_country_equals_language: true,
    tenant_language_configuration_takes_precedence: true
  },
  geography_policy: {
    primary_source: "Existing Radar geoData.ts and geoFrontier.ts",
    current_dataset_note: "The public geoData.ts describes approximately 7,600 US and Canadian places; it is not global coverage.",
    expansion_source: "GeoNames/all-the-cities with attribution, or an equivalent redistributable global gazetteer",
    minimum_population_hint: 5e3,
    fallback: "Geocode configured city + country with a compliant geocoding provider when no local GeoPlace record exists.",
    rotation: "Rotate across countries, regions, cities, and population bands; do not hardcode a small permanent list of US metros."
  },
  niche_policy: {
    closed_allowlist: false,
    unknown_niche_behavior: "Keep the niche eligible. Use tenant ICP keywords, generic business/service discovery, and observed business capabilities rather than rejecting it because it is absent from a map.",
    founder_goal: "Find businesses that can benefit from recovering, converting, retaining, or measuring inbound customer opportunities through Bvelt.",
    tenant_goal: "Find the Tenant's own potential customers using that Tenant's ICP, services, geography, and language configuration. Never substitute Founder targeting for Tenant targeting."
  },
  bvelt_compatible_segments: [
    "home_services",
    "home_property_construction_and_trades",
    "cleaning_facility_and_maintenance",
    "automotive_transport_and_mobility",
    "healthcare_dental_veterinary_and_wellness",
    "beauty_fitness_and_personal_services",
    "legal_financial_insurance_and_professional_services",
    "real_estate_property_management_and_hospitality",
    "education_training_and_child_family_services",
    "restaurants_food_catering_and_events",
    "retail_local_specialty_and_equipment",
    "pet_services_and_animal_care",
    "logistics_storage_and_delivery_services",
    "industrial_b2b_manufacturing_and_maintenance",
    "technology_it_and_managed_services",
    "agriculture_landscape_and_outdoor_services",
    "recreation_sports_tourism_and_venues",
    "other_customer_inquiry_or_appointment_driven_businesses"
  ],
  excluded_business_categories: [
    "pet care",
    "hair/nail salons",
    "tattoo/piercing",
    "gyms/fitness studios",
    "massage",
    "grocery/supermarket",
    "convenience stores",
    "florists",
    "boutiques",
    "pure ecommerce",
    "low-value retail"
  ],
  founder_fit_signals: [
    "inbound_calls_or_messages",
    "quotes_estimates_or_consultations",
    "appointments_or_bookings",
    "repeat_customers_or_reactivation",
    "reviews_and_reputation_management",
    "multiple_contact_channels",
    "multiple_services_or_service_areas",
    "lead_capture_and_follow_up_workflows"
  ],
  scoring_rule: "Industry is descriptive, not a gate. Score the observed business model and Bvelt-compatible workflow. Missing evidence means unknown, not automatically negative."
};

// src/emailSanitizer.ts
var FILE_EXT_TLD_REGEX = /\.(png|jpe?g|svg|webp|gif|ico|woff2?|ttf|eot|css|js|json|map|xml|mp4|pdf|zip|tar|gz)$/i;
var DISPOSABLE_DOMAINS = /* @__PURE__ */ new Set([
  "mailinator.com",
  "tempmail.com",
  "10minutemail.com",
  "yopmail.com",
  "guerrillamail.com",
  "trashmail.com",
  "throwawaymail.com",
  "sharklasers.com",
  "getairmail.com",
  "temp-mail.org",
  "dispostable.com",
  "fakeinbox.com"
]);
var PLACEHOLDER_LOCAL_PARTS = /* @__PURE__ */ new Set(["example", "test", "yourname", "your_name", "your-email", "your_email", "email", "name"]);
var PLACEHOLDER_DOMAINS = /* @__PURE__ */ new Set(["example.com", "example.org", "example.net", "example.test", "invalid", "localhost"]);
var SYSTEM_LOCAL_PARTS = /* @__PURE__ */ new Set([
  "noreply",
  "no-reply",
  "postmaster",
  "abuse",
  "webmaster",
  "mailer-daemon",
  "root",
  "hostmaster",
  "daemon"
]);
var RFC_EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
function sanitizeEmail(rawEmail) {
  if (!rawEmail || typeof rawEmail !== "string") {
    return { valid: false, reason: "empty_or_not_string" };
  }
  const email = rawEmail.trim().toLowerCase();
  if (email.length < 5 || email.length > 254) {
    return { valid: false, reason: "invalid_length" };
  }
  if (/@2x/i.test(email) || /@\d+x\./i.test(email)) {
    return { valid: false, reason: "retina_asset_filename" };
  }
  const parts = email.split("@");
  if (parts.length !== 2) {
    return { valid: false, reason: "invalid_at_syntax" };
  }
  const [localPart, domain] = parts;
  if (PLACEHOLDER_LOCAL_PARTS.has(localPart) || PLACEHOLDER_DOMAINS.has(domain)) {
    return { valid: false, reason: "placeholder_email" };
  }
  if (!localPart || localPart.length > 64) {
    return { valid: false, reason: "invalid_local_part_length" };
  }
  if (SYSTEM_LOCAL_PARTS.has(localPart)) {
    return { valid: false, reason: `system_mailbox_${localPart}` };
  }
  if (!domain || domain.length > 253 || !domain.includes(".")) {
    return { valid: false, reason: "invalid_domain_format" };
  }
  if (/^\[?\d{1,3}(\.\d{1,3}){3}\]?$/.test(domain)) {
    return { valid: false, reason: "ip_address_domain" };
  }
  if (FILE_EXT_TLD_REGEX.test(domain)) {
    return { valid: false, reason: "file_extension_tld" };
  }
  if (DISPOSABLE_DOMAINS.has(domain)) {
    return { valid: false, reason: "disposable_domain" };
  }
  if (!RFC_EMAIL_REGEX.test(email)) {
    return { valid: false, reason: "rfc_syntax_failed" };
  }
  const tld = domain.split(".").pop();
  if (!tld || tld.length < 2 || /^\d+$/.test(tld)) {
    return { valid: false, reason: "invalid_tld" };
  }
  return { valid: true, email };
}
__name(sanitizeEmail, "sanitizeEmail");
function sanitizeProspectEmail(email) {
  const result = sanitizeEmail(email);
  return result.valid && result.email ? result.email : null;
}
__name(sanitizeProspectEmail, "sanitizeProspectEmail");
async function hasMxRecords(domainOrEmail) {
  const domain = domainOrEmail.includes("@") ? domainOrEmail.split("@")[1].trim().toLowerCase() : domainOrEmail.trim().toLowerCase();
  if (!domain || !domain.includes(".")) {
    return false;
  }
  try {
    const dohUrl = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=MX`;
    const res = await fetch(dohUrl, {
      headers: { Accept: "application/dns-json" },
      signal: AbortSignal.timeout(4e3)
    });
    if (!res.ok) {
      return true;
    }
    const json = await res.json();
    if (json && Array.isArray(json.Answer) && json.Answer.length > 0) {
      return true;
    }
    if (json && json.Status === 0 && (!json.Answer || json.Answer.length === 0)) {
      return false;
    }
    return true;
  } catch (err) {
    return true;
  }
}
__name(hasMxRecords, "hasMxRecords");
var MARKET_EXCLUSIONS = new Set(
  (market_universe_default.excluded_business_categories || []).map((value) => String(value).trim().toLowerCase())
);
var FOUNDER_EXCLUSION_RULES = [
  { category: "pet care", pattern: /\b(pet care|pet store|pet grooming|dog grooming|veterinary|vet clinic|animal hospital)\b/i },
  { category: "hair/nail salons", pattern: /\b(barber|barbershop|hairdresser|hair salon|nail salon|beauty salon|salon)\b/i },
  { category: "tattoo/piercing", pattern: /\b(tattoo|piercing)\b/i },
  { category: "gyms/fitness studios", pattern: /\b(gym|fitness studio|crossfit|pilates|yoga)\b/i },
  { category: "massage", pattern: /\b(massage)\b/i },
  { category: "grocery/supermarket", pattern: /\b(grocery|supermarket)\b/i },
  { category: "convenience stores", pattern: /\b(convenience store)\b/i },
  { category: "florists", pattern: /\b(florist|flower shop)\b/i },
  { category: "boutiques", pattern: /\b(boutique)\b/i },
  { category: "pure ecommerce", pattern: /\b(pure e[- ]?commerce|online[- ]only|dropshipping)\b/i },
  { category: "low-value retail", pattern: /\b(dollar store|discount store|thrift store|pawn shop)\b/i }
];
var NON_BUSINESS_ENTITY_REGEX = /\b(church|iglesia|ministry|ministerio|chapel|temple|parish|cathedral)\b/i;
function isOffIcpName(name, allowTenantBuyer = false) {
  if (!name || typeof name !== "string") return true;
  const clean = name.trim().toLowerCase();
  if (!clean) return true;
  if (NON_BUSINESS_ENTITY_REGEX.test(clean)) return true;
  if (allowTenantBuyer) return false;
  return FOUNDER_EXCLUSION_RULES.some(
    (rule) => MARKET_EXCLUSIONS.has(rule.category) && rule.pattern.test(clean)
  );
}
__name(isOffIcpName, "isOffIcpName");

// src/emailDispatcher.ts
var BVELT_SITE = "https://bvelt.app/";
function resolveBveltSender(raw) {
  const value = String(raw || "").trim();
  if (!value) return null;
  const match = value.match(/^(.*?)\s*<([^<>]+)>$/);
  const displayName = match?.[1]?.trim().replace(/[<>\r\n]/g, "") || "Bvelt";
  const candidate = (match?.[2] || value).trim();
  const parsed = sanitizeEmail(candidate);
  if (!parsed.valid || !parsed.email || parsed.email.split("@")[1] !== "bvelt.app") return null;
  return { email: parsed.email, from: `${displayName} <${parsed.email}>` };
}
__name(resolveBveltSender, "resolveBveltSender");
async function inspectOutboundEmailAuth(from, resendApiKey, fetcher = fetch) {
  const sender = resolveBveltSender(from);
  const base = {
    sender: sender?.email || null,
    domain: sender?.email.split("@")[1] || null,
    resendDomainStatus: resendApiKey ? "unknown" : "api_key_missing",
    resendRecordStatuses: [],
    dkimPresent: false,
    spfPresent: false,
    dmarcPresent: false,
    dmarcPolicy: "unknown",
    returnPathMxPresent: false,
    errors: []
  };
  if (!sender) {
    base.errors.push("OUTBOUND_EMAIL_FROM is missing or is not an @bvelt.app sender.");
    return base;
  }
  const domain = base.domain;
  const lookup = /* @__PURE__ */ __name(async (name, type) => {
    try {
      const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`;
      const response = await fetcher(url, {
        headers: { Accept: "application/dns-json" },
        signal: AbortSignal.timeout(5e3)
      });
      if (!response.ok) return [];
      const data = await response.json();
      return Array.isArray(data?.Answer) ? data.Answer : [];
    } catch {
      return [];
    }
  }, "lookup");
  const [dmarc, dkim, spf, returnMx] = await Promise.all([
    lookup(`_dmarc.${domain}`, "TXT"),
    lookup(`resend._domainkey.${domain}`, "TXT"),
    lookup(`send.${domain}`, "TXT"),
    lookup(`send.${domain}`, "MX")
  ]);
  const dmarcText = dmarc.map((x) => String(x.data || "").replace(/^"|"$/g, "")).find((x) => /v=DMARC1/i.test(x)) || "";
  const spfText = spf.map((x) => String(x.data || "").replace(/^"|"$/g, "")).find((x) => /v=spf1/i.test(x)) || "";
  base.dmarcPresent = !!dmarcText;
  base.dmarcPolicy = dmarcText.match(/(?:^|;)\s*p=([a-z]+)/i)?.[1]?.toLowerCase() || "unknown";
  base.dkimPresent = dkim.some((x) => /p=[A-Za-z0-9+/=]+/.test(String(x.data || "")));
  base.spfPresent = !!spfText;
  base.returnPathMxPresent = returnMx.some((x) => /amazonses|resend/i.test(String(x.data || "")));
  if (resendApiKey?.trim()) {
    try {
      const response = await fetcher("https://api.resend.com/domains", {
        headers: { Authorization: `Bearer ${resendApiKey.trim()}`, Accept: "application/json" },
        signal: AbortSignal.timeout(8e3)
      });
      if (!response.ok) {
        base.resendDomainStatus = `api_http_${response.status}`;
      } else {
        const payload = await response.json();
        const domains = Array.isArray(payload?.data) ? payload.data : [];
        const match = domains.find((item) => String(item?.name || "").toLowerCase() === domain.toLowerCase());
        base.resendDomainStatus = match ? String(match.status || "unknown").toLowerCase() : "domain_not_found";
        base.resendRecordStatuses = Array.isArray(match?.records) ? match.records.map((record) => `${String(record.type || "DNS")} ${String(record.name || "")}: ${String(record.status || "unknown")}`.trim()).slice(0, 8) : [];
      }
    } catch {
      base.resendDomainStatus = "api_unreachable";
      base.errors.push("Resend domain verification endpoint could not be reached.");
    }
  }
  if (!base.dkimPresent) base.errors.push("Resend DKIM TXT record was not found by public DNS lookup.");
  if (!base.spfPresent) base.errors.push("SPF TXT record was not found on the configured send subdomain.");
  if (!base.dmarcPresent) base.errors.push("DMARC TXT record was not found.");
  if (!base.returnPathMxPresent) base.errors.push("Custom return-path MX record was not found.");
  if (base.dmarcPolicy === "none") base.errors.push("DMARC is monitoring-only (p=none); alignment is not enforced.");
  if (base.resendDomainStatus !== "verified") base.errors.push(`Resend domain status is ${base.resendDomainStatus}, not verified.`);
  return base;
}
__name(inspectOutboundEmailAuth, "inspectOutboundEmailAuth");
function buildResendIdempotencyKey(prospectId, touchCount = 1) {
  const touch = Math.max(1, Math.floor(Number(touchCount) || 1));
  return `send-prospect/${prospectId}/touch/${touch}`.substring(0, 256);
}
__name(buildResendIdempotencyKey, "buildResendIdempotencyKey");
function normalizeOutreachBody(body, includeSiteLink = true) {
  let b = (body || "").trim();
  b = b.replace(/https?:\/\/bvelt\.app\/demo\?[^\s)\]>"]+/gi, BVELT_SITE);
  b = b.replace(/https?:\/\/bvelt\.app\/demo\b/gi, BVELT_SITE);
  b = b.replace(/https?:\/\/[a-z0-9.-]*workers\.dev\/demo[^\s)\]>"]*/gi, BVELT_SITE);
  if (includeSiteLink && !/bvelt\.app/i.test(b)) {
    b = `${b}

${BVELT_SITE}`;
  }
  return b.trim();
}
__name(normalizeOutreachBody, "normalizeOutreachBody");
function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
__name(escapeHtml, "escapeHtml");
function buildBrandedEmailHtml(bodyText, _logoUrl) {
  const paragraphs = escapeHtml(bodyText).split(/\n\n+/).map((p) => p.replace(/\n/g, "<br/>")).map((p) => `<p style="margin:0 0 14px 0;line-height:1.55;color:#172033;font-size:15px;">${p}</p>`).join("");
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/></head>
<body style="margin:0;padding:20px;background:#ffffff;font-family:Arial,Helvetica,sans-serif;">
  <main style="max-width:600px;margin:0 auto;color:#172033;">
    ${paragraphs}
  </main>
</body>
</html>`;
}
__name(buildBrandedEmailHtml, "buildBrandedEmailHtml");
async function dispatchEmail(options) {
  const sanitizeRes = sanitizeEmail(options.to);
  if (!sanitizeRes.valid || !sanitizeRes.email) {
    return {
      success: false,
      provider: "simulated",
      messageId: "",
      status: "failed",
      error: `Invalid email (${sanitizeRes.reason || "sanitizer_rejected"}). Send cancelled.`
    };
  }
  const to = sanitizeRes.email;
  const mxOk = await hasMxRecords(to);
  if (!mxOk) {
    return {
      success: false,
      provider: "simulated",
      messageId: "",
      status: "failed",
      error: "Recipient domain has no MX records (recipient_domain_no_mx). Send cancelled."
    };
  }
  const sender = resolveBveltSender(options.from);
  const provider = options.resendApiKey?.trim() ? "resend" : options.brevoApiKey?.trim() ? "brevo" : "simulated";
  if (provider !== "simulated" && !sender) {
    return {
      success: false,
      provider,
      messageId: "",
      status: "failed",
      error: "Unverified sender configuration. Set OUTBOUND_EMAIL_FROM to an authenticated @bvelt.app address; sending was blocked."
    };
  }
  const subject = (options.subject || "Quick question from Bvelt").trim();
  const body = normalizeOutreachBody(options.body || "", options.includeSiteLink !== false);
  const senderName = options.senderName || "Rainer \u2014 Bvelt";
  const html = options.plainTextOnly ? void 0 : buildBrandedEmailHtml(body, options.logoUrl);
  if (options.resendApiKey && options.resendApiKey.trim()) {
    try {
      const fromAddress = sender.from;
      const payload = {
        from: fromAddress,
        to: [to],
        subject,
        text: body,
        ...html ? { html } : {},
        headers: { "X-Entity-Ref-ID": options.prospectId || `lead_${Date.now()}` }
      };
      if (options.replyTo && options.replyTo.includes("@")) {
        payload.reply_to = options.replyTo.trim();
      }
      const reqHeaders = {
        Authorization: `Bearer ${options.resendApiKey.trim()}`,
        "Content-Type": "application/json"
      };
      if (options.prospectId) {
        reqHeaders["Idempotency-Key"] = buildResendIdempotencyKey(options.prospectId, options.touchCount);
      }
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: reqHeaders,
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return {
          success: false,
          provider: "resend",
          messageId: "",
          status: "failed",
          error: data?.message || data?.error || `Resend HTTP ${res.status}`,
          details: JSON.stringify(data).slice(0, 400)
        };
      }
      return {
        success: true,
        provider: "resend",
        messageId: String(data?.id || ""),
        status: "dispatched"
      };
    } catch (e) {
      return {
        success: false,
        provider: "resend",
        messageId: "",
        status: "failed",
        error: e?.message || "Resend network error"
      };
    }
  }
  if (options.brevoApiKey && options.brevoApiKey.trim()) {
    try {
      const fromEmail = sender.email;
      const res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": options.brevoApiKey.trim(),
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({
          sender: { name: senderName, email: fromEmail },
          to: [{ email: to, name: options.recipientName || to }],
          subject,
          textContent: body,
          ...html ? { htmlContent: html } : {}
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return {
          success: false,
          provider: "brevo",
          messageId: "",
          status: "failed",
          error: data?.message || `Brevo HTTP ${res.status}`,
          details: JSON.stringify(data).slice(0, 400)
        };
      }
      return {
        success: true,
        provider: "brevo",
        messageId: String(data?.messageId || data?.id || ""),
        status: "dispatched"
      };
    } catch (e) {
      return {
        success: false,
        provider: "brevo",
        messageId: "",
        status: "failed",
        error: e?.message || "Brevo network error"
      };
    }
  }
  console.log("[emailDispatcher] SIMULATED send", { to, subject, preview: body.slice(0, 120) });
  return {
    success: true,
    provider: "simulated",
    messageId: `sim_${Date.now()}`,
    status: "simulated",
    details: "No RESEND_API_KEY or BREVO_API_KEY \u2014 message not delivered to inbox."
  };
}
__name(dispatchEmail, "dispatchEmail");

// src/openAudits.ts
async function auditDomainSecurityAndMx(domain) {
  const cleanDomain = (domain || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
  if (!cleanDomain || cleanDomain.length < 3 || !cleanDomain.includes(".")) {
    return {
      domain: cleanDomain,
      hasCustomMx: false,
      mxHosts: [],
      hasDmarc: false,
      hasSpf: false,
      isVulnerableOrSpamRisk: false
    };
  }
  let hasCustomMx = false;
  const mxHosts = [];
  let hasDmarc = false;
  let hasSpf = false;
  try {
    const mxRes = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(cleanDomain)}&type=MX`, {
      headers: { "Accept": "application/dns-json" },
      signal: AbortSignal.timeout(3500)
    });
    if (mxRes.ok) {
      const mxJson = await mxRes.json();
      if (Array.isArray(mxJson.Answer) && mxJson.Answer.length > 0) {
        hasCustomMx = true;
        for (const ans of mxJson.Answer) {
          if (ans.data) mxHosts.push(String(ans.data));
        }
      }
    }
  } catch (e) {
  }
  try {
    const dmarcRes = await fetch(`https://cloudflare-dns.com/dns-query?name=_dmarc.${encodeURIComponent(cleanDomain)}&type=TXT`, {
      headers: { "Accept": "application/dns-json" },
      signal: AbortSignal.timeout(3500)
    });
    if (dmarcRes.ok) {
      const dmarcJson = await dmarcRes.json();
      if (Array.isArray(dmarcJson.Answer)) {
        for (const ans of dmarcJson.Answer) {
          if (typeof ans.data === "string" && ans.data.toLowerCase().includes("v=dmarc1")) {
            hasDmarc = true;
            break;
          }
        }
      }
    }
  } catch (e) {
  }
  try {
    const spfRes = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(cleanDomain)}&type=TXT`, {
      headers: { "Accept": "application/dns-json" },
      signal: AbortSignal.timeout(3500)
    });
    if (spfRes.ok) {
      const spfJson = await spfRes.json();
      if (Array.isArray(spfJson.Answer)) {
        for (const ans of spfJson.Answer) {
          if (typeof ans.data === "string" && ans.data.toLowerCase().includes("v=spf1")) {
            hasSpf = true;
            break;
          }
        }
      }
    }
  } catch (e) {
  }
  const isVulnerable = !hasDmarc;
  let vulnerabilitySignal;
  if (!hasDmarc) {
    vulnerabilitySignal = `Dominio ${cleanDomain} sin pol\xEDtica DMARC: correos y presupuestos enviados a clientes corren alto riesgo de caer en carpeta SPAM.`;
  }
  return {
    domain: cleanDomain,
    hasCustomMx,
    mxHosts,
    hasDmarc,
    hasSpf,
    isVulnerableOrSpamRisk: isVulnerable,
    vulnerabilitySignal
  };
}
__name(auditDomainSecurityAndMx, "auditDomainSecurityAndMx");
var CITY_COORDINATES = {
  "tampa, fl": { lat: 27.95, lon: -82.46 },
  "tampa": { lat: 27.95, lon: -82.46 },
  "orlando, fl": { lat: 28.54, lon: -81.38 },
  "orlando": { lat: 28.54, lon: -81.38 },
  "austin, tx": { lat: 30.27, lon: -97.74 },
  "austin": { lat: 30.27, lon: -97.74 },
  "houston, tx": { lat: 29.76, lon: -95.37 },
  "houston": { lat: 29.76, lon: -95.37 },
  "dallas, tx": { lat: 32.78, lon: -96.8 },
  "dallas": { lat: 32.78, lon: -96.8 },
  "atlanta, ga": { lat: 33.75, lon: -84.39 },
  "atlanta": { lat: 33.75, lon: -84.39 },
  "nashville, tn": { lat: 36.16, lon: -86.78 },
  "nashville": { lat: 36.16, lon: -86.78 },
  "charlotte, nc": { lat: 35.23, lon: -80.84 },
  "charlotte": { lat: 35.23, lon: -80.84 },
  "miami, fl": { lat: 25.76, lon: -80.19 },
  "miami": { lat: 25.76, lon: -80.19 },
  "phoenix, az": { lat: 33.45, lon: -112.07 },
  "phoenix": { lat: 33.45, lon: -112.07 },
  "madrid, es": { lat: 40.42, lon: -3.7 },
  "madrid": { lat: 40.42, lon: -3.7 },
  "bogota, co": { lat: 4.71, lon: -74.07 },
  "bogota": { lat: 4.71, lon: -74.07 }
};
async function auditCityWeatherEmergency(city) {
  const normCity = (city || "").trim().toLowerCase();
  let coords = CITY_COORDINATES[normCity];
  if (!coords) {
    for (const key of Object.keys(CITY_COORDINATES)) {
      if (normCity.includes(key) || key.includes(normCity)) {
        coords = CITY_COORDINATES[key];
        break;
      }
    }
  }
  const lat = coords ? coords.lat : 27.95;
  const lon = coords ? coords.lon : -82.46;
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,precipitation,weather_code`;
    const res = await fetch(url, { signal: AbortSignal.timeout(3500) });
    if (!res.ok) {
      return { city, isHeatwave: false, isFreezing: false, isStormOrRain: false, relevantTrades: [] };
    }
    const data = await res.json();
    const tempC = data.current?.temperature_2m ?? 24;
    const precip = data.current?.precipitation ?? 0;
    const weatherCode = data.current?.weather_code ?? 0;
    const isHeatwave = tempC >= 32;
    const isFreezing = tempC <= 0;
    const isStormOrRain = precip > 2 || [61, 63, 65, 80, 81, 82, 95, 96, 99].includes(weatherCode);
    const relevantTrades = [];
    let weatherSignal;
    if (isHeatwave) {
      relevantTrades.push("hvac", "roofing", "pool_cleaning");
      weatherSignal = `Ola de calor (${Math.round(tempC)}\xB0C) en ${city}: saturaci\xF3n de llamadas de emergencia por rotura de aire acondicionado.`;
    } else if (isFreezing) {
      relevantTrades.push("plumbing", "hvac");
      weatherSignal = `Helada (${Math.round(tempC)}\xB0C) en ${city}: riesgo cr\xEDtico de congelaci\xF3n de tuber\xEDas y calderas.`;
    } else if (isStormOrRain) {
      relevantTrades.push("roofing", "landscaping", "plumbing");
      weatherSignal = `Lluvias intensas o tormenta en ${city}: pico de goteras, canalones desbordados y llamadas de urgencia.`;
    }
    return {
      city,
      temperatureC: tempC,
      isHeatwave,
      isFreezing,
      isStormOrRain,
      weatherSignal,
      relevantTrades
    };
  } catch (e) {
    return { city, isHeatwave: false, isFreezing: false, isStormOrRain: false, relevantTrades: [] };
  }
}
__name(auditCityWeatherEmergency, "auditCityWeatherEmergency");
async function auditWebsitePerformance(websiteUrl, pageSpeedApiKey) {
  let targetUrl = (websiteUrl || "").trim();
  if (!targetUrl) {
    return { url: "", isSlow: false };
  }
  if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
    targetUrl = "https://" + targetUrl;
  }
  if (pageSpeedApiKey) {
    try {
      const psUrl = `https://pagespeedonline.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(targetUrl)}&strategy=mobile&category=PERFORMANCE&key=${pageSpeedApiKey}`;
      const psRes = await fetch(psUrl, { signal: AbortSignal.timeout(5e3) });
      if (psRes.ok) {
        const psJson = await psRes.json();
        const scoreFraction = psJson.lighthouseResult?.categories?.performance?.score;
        const mobileScore = typeof scoreFraction === "number" ? Math.round(scoreFraction * 100) : void 0;
        const fcpMs = psJson.lighthouseResult?.audits?.["first-contentful-paint"]?.numericValue;
        const fcpSeconds = typeof fcpMs === "number" ? Math.round(fcpMs / 1e3 * 10) / 10 : void 0;
        const isSlow = mobileScore !== void 0 && mobileScore < 50 || fcpSeconds !== void 0 && fcpSeconds > 3;
        let performanceSignal;
        if (isSlow) {
          performanceSignal = `Sitio web m\xF3vil lento (Lighthouse: ${mobileScore ?? "Bajo"}/100, FCP: ${fcpSeconds ?? ">3"}s): los clientes locales en m\xF3vil abandonan la web antes de llamar.`;
        }
        return {
          url: targetUrl,
          mobileScore,
          fcpSeconds,
          isSlow,
          performanceSignal
        };
      }
    } catch (e) {
    }
  }
  try {
    const t0 = Date.now();
    const probeRes = await fetch(targetUrl, {
      method: "HEAD",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; BveltSiteCheck/1.0)" },
      signal: AbortSignal.timeout(3e3)
    });
    const latencyMs = Date.now() - t0;
    const isSlow = latencyMs > 1400 || !probeRes.ok;
    let performanceSignal;
    if (isSlow) {
      performanceSignal = `Tiempo de respuesta del servidor lento (${latencyMs}ms): fricci\xF3n al cargar el sitio web en smartphones de clientes locales.`;
    }
    return {
      url: targetUrl,
      latencyMs,
      isSlow,
      performanceSignal
    };
  } catch (err) {
    return {
      url: targetUrl,
      isSlow: true,
      performanceSignal: `Sitio web con tiempos de respuesta muy lentos o ca\xEDdas intermitentes: p\xE9rdida de prospectos telef\xF3nicos.`
    };
  }
}
__name(auditWebsitePerformance, "auditWebsitePerformance");

// src/geoData.ts
var RAW = [["New York City", "NY", "US", 40.7143, -74.006, 8175133], ["Los Angeles", "CA", "US", 34.0522, -118.2437, 3971883], ["Chicago", "IL", "US", 41.85, -87.65, 2720546], ["Toronto", "ON", "CA", 43.7001, -79.4163, 26e5], ["Brooklyn", "NY", "US", 40.6501, -73.9496, 2300664], ["Houston", "TX", "US", 29.7633, -95.3633, 2296224], ["Queens", "NY", "US", 40.6815, -73.8365, 2272771], ["Montr\xE9al", "QC", "CA", 45.5088, -73.5878, 16e5], ["Philadelphia", "PA", "US", 39.9523, -75.1638, 1567442], ["Phoenix", "AZ", "US", 33.4484, -112.074, 1563025], ["Manhattan", "NY", "US", 40.7834, -73.9663, 1487536], ["San Antonio", "TX", "US", 29.4241, -98.4936, 1469845], ["San Diego", "CA", "US", 32.7157, -117.1647, 1394928], ["The Bronx", "NY", "US", 40.8499, -73.8664, 1385108], ["Dallas", "TX", "US", 32.7831, -96.8067, 1300092], ["San Jose", "CA", "US", 37.3394, -121.895, 1026908], ["Calgary", "AB", "CA", 51.0501, -114.0853, 1019942], ["Austin", "TX", "US", 30.2672, -97.7431, 931830], ["Jacksonville", "FL", "US", 30.3322, -81.6556, 868031], ["San Francisco", "CA", "US", 37.7749, -122.4194, 864816], ["Columbus", "OH", "US", 39.9612, -82.9988, 850106], ["Fort Worth", "TX", "US", 32.7254, -97.3208, 833319], ["Indianapolis", "IN", "US", 39.7684, -86.158, 829718], ["Charlotte", "NC", "US", 35.2271, -80.8431, 827097], ["Ottawa", "ON", "CA", 45.4112, -75.6981, 812129], ["Edmonton", "AB", "CA", 53.5501, -113.4687, 712391], ["Seattle", "WA", "US", 47.6062, -122.3321, 684451], ["Denver", "CO", "US", 39.7392, -104.9847, 682545], ["El Paso", "TX", "US", 31.7587, -106.4869, 681124], ["Detroit", "MI", "US", 42.3314, -83.0457, 677116], ["Mississauga", "ON", "CA", 43.5789, -79.6583, 668549], ["Boston", "MA", "US", 42.3584, -71.0598, 667137], ["Memphis", "TN", "US", 35.1495, -90.049, 655770], ["New South Memphis", "TN", "US", 35.0868, -90.0568, 641608], ["North York", "ON", "CA", 43.7668, -79.4163, 636e3], ["Portland", "OR", "US", 45.5234, -122.6762, 632309], ["Winnipeg", "MB", "CA", 49.8844, -97.147, 632063], ["Oklahoma City", "OK", "US", 35.4676, -97.5164, 631346], ["Las Vegas", "NV", "US", 36.175, -115.1372, 623747], ["Baltimore", "MD", "US", 39.2904, -76.6122, 621849], ["Washington, D.C.", "DC", "US", 38.8951, -77.0364, 601723], ["Milwaukee", "WI", "US", 43.0389, -87.9065, 600155], ["Vancouver", "BC", "CA", 49.2497, -123.1193, 6e5], ["Scarborough", "ON", "CA", 43.7722, -79.2567, 6e5], ["South Boston", "MA", "US", 42.3334, -71.0495, 571281], ["Albuquerque", "NM", "US", 35.0845, -106.6511, 559121], ["Tucson", "AZ", "US", 32.2217, -110.9265, 531641], ["Nashville", "TN", "US", 36.1659, -86.7844, 530852], ["Qu\xE9bec", "QC", "CA", 46.8123, -71.2145, 528595], ["Fresno", "CA", "US", 36.7477, -119.7724, 520052], ["Hamilton", "ON", "CA", 43.2501, -79.8496, 519949], ["Sacramento", "CA", "US", 38.5816, -121.4944, 490712], ["Kansas City", "MO", "US", 39.0997, -94.5786, 475378], ["Long Beach", "CA", "US", 33.767, -118.1892, 474140], ["Mesa", "AZ", "US", 33.4223, -111.8226, 471825], ["Staten Island", "NY", "US", 40.5623, -74.1399, 468730], ["Atlanta", "GA", "US", 33.749, -84.388, 463878], ["Colorado Springs", "CO", "US", 38.8339, -104.8214, 456568], ["Virginia Beach", "VA", "US", 36.8529, -75.978, 452745], ["Raleigh", "NC", "US", 35.7721, -78.6386, 451066], ["Omaha", "NE", "US", 41.2563, -95.9404, 443885], ["Miami", "FL", "US", 25.7743, -80.1937, 441003], ["Brampton", "ON", "CA", 43.6834, -79.7663, 433806], ["Oakland", "CA", "US", 37.8044, -122.2708, 419267], ["Minneapolis", "MN", "US", 44.98, -93.2638, 410939], ["Tulsa", "OK", "US", 36.154, -95.9928, 403505], ["Surrey", "BC", "CA", 49.1063, -122.8251, 394976], ["Wichita", "KS", "US", 37.6922, -97.3375, 389965], ["New Orleans", "LA", "US", 29.9547, -90.0751, 389617], ["Arlington", "TX", "US", 32.7357, -97.1081, 388125], ["Cleveland", "OH", "US", 41.4995, -81.6954, 388072], ["Laval", "QC", "CA", 45.5699, -73.692, 376845], ["Bakersfield", "CA", "US", 35.3733, -119.0187, 373640], ["Honolulu", "HI", "US", 21.3069, -157.8583, 371657], ["Tampa", "FL", "US", 27.9475, -82.4584, 369075], ["Aurora", "CO", "US", 39.7294, -104.8319, 359407], ["Halifax", "NS", "CA", 44.6464, -63.5729, 359111], ["Anaheim", "CA", "US", 33.8353, -117.9145, 350742], ["Etobicoke", "ON", "CA", 43.6542, -79.5671, 347948], ["London", "ON", "CA", 42.9834, -81.233, 346765], ["West Raleigh", "NC", "US", 35.7868, -78.6639, 338759], ["Santa Ana", "CA", "US", 33.7456, -117.8678, 335400], ["Corpus Christi", "TX", "US", 27.8006, -97.3964, 324074], ["Riverside", "CA", "US", 33.9534, -117.3962, 322424], ["St. Louis", "MO", "US", 38.6273, -90.1979, 315685], ["Lexington-Fayette", "KY", "US", 38.0498, -84.4586, 314488], ["Oshawa", "ON", "CA", 43.9001, -78.8496, 308875], ["Stockton", "CA", "US", 37.9577, -121.2908, 305658], ["Pittsburgh", "PA", "US", 40.4406, -79.9959, 304391], ["Anchorage", "AK", "US", 61.2181, -149.9003, 298695], ["Okanagan", "BC", "CA", 50.3639, -119.35, 297601], ["Cincinnati", "OH", "US", 39.1271, -84.5144, 296943], ["Victoria", "BC", "CA", 48.4359, -123.3516, 289625], ["Ironville", "KY", "US", 38.4565, -82.6924, 288649], ["Meads", "KY", "US", 38.4126, -82.7091, 288649], ["Henderson", "NV", "US", 36.0397, -114.9819, 285667], ["Greensboro", "NC", "US", 36.0726, -79.792, 285342], ["Saint Paul", "MN", "US", 44.9444, -93.0933, 285068], ["Plano", "TX", "US", 33.0198, -96.6989, 283558], ["Newark", "NJ", "US", 40.7357, -74.1724, 281944], ["Toledo", "OH", "US", 41.6639, -83.5552, 279789], ["Windsor", "ON", "CA", 42.3001, -83.0165, 278013], ["Lincoln", "NE", "US", 40.8, -96.667, 277348], ["Orlando", "FL", "US", 28.5383, -81.3792, 270934], ["Chula Vista", "CA", "US", 32.6401, -117.0842, 265757], ["Jersey City", "NJ", "US", 40.7282, -74.0776, 264290], ["Markham", "ON", "CA", 43.8668, -79.2663, 261573], ["Chandler", "AZ", "US", 33.3062, -111.8413, 260828], ["Fort Wayne", "IN", "US", 41.1306, -85.1289, 260326], ["Buffalo", "NY", "US", 42.8865, -78.8784, 258071], ["Durham", "NC", "US", 35.994, -78.8986, 257636], ["St. Petersburg", "FL", "US", 27.7709, -82.6793, 257083], ["Irvine", "CA", "US", 33.6695, -117.8231, 256927], ["Laredo", "TX", "US", 27.5064, -99.5075, 255473], ["Lubbock", "TX", "US", 33.5779, -101.8552, 249042], ["Madison", "WI", "US", 43.0731, -89.4012, 248951], ["Gilbert", "AZ", "US", 33.3528, -111.789, 247542], ["Norfolk", "VA", "US", 36.8468, -76.2852, 246393], ["Louisville", "KY", "US", 38.2542, -85.7594, 243639], ["Gatineau", "QC", "CA", 45.4772, -75.7016, 242124], ["Reno", "NV", "US", 39.5296, -119.8138, 241445], ["Winston-Salem", "NC", "US", 36.0999, -80.2442, 241218], ["Glendale", "AZ", "US", 33.5386, -112.186, 240126], ["Vaughan", "ON", "CA", 43.8361, -79.4983, 238866], ["Hialeah", "FL", "US", 25.8576, -80.2781, 237069], ["Garland", "TX", "US", 32.9126, -96.6389, 236897], ["Scottsdale", "AZ", "US", 33.5092, -111.899, 236839], ["Irving", "TX", "US", 32.814, -96.9489, 236607], ["Chesapeake", "VA", "US", 36.819, -76.2749, 235429], ["North Las Vegas", "NV", "US", 36.1989, -115.1175, 234807], ["Kitchener", "ON", "CA", 43.4254, -80.5112, 233700], ["Fremont", "CA", "US", 37.5483, -121.9886, 232206], ["Longueuil", "QC", "CA", 45.5312, -73.5181, 229330], ["Baton Rouge", "LA", "US", 30.4433, -91.1875, 228590], ["Lexington", "KY", "US", 37.9887, -84.4777, 225366], ["Paradise", "NV", "US", 36.0972, -115.1467, 223167], ["Richmond", "VA", "US", 37.5538, -77.4603, 220289], ["Jamaica", "NY", "US", 40.6915, -73.8057, 216866], ["San Bernardino", "CA", "US", 34.1083, -117.2898, 216108], ["Spokane", "WA", "US", 47.6597, -117.4291, 213272], ["Birmingham", "AL", "US", 33.5207, -86.8025, 212461], ["Modesto", "CA", "US", 37.6391, -120.9969, 211266], ["Des Moines", "IA", "US", 41.6005, -93.6091, 210330], ["Rochester", "NY", "US", 43.1548, -77.6156, 209802], ["Maryvale", "AZ", "US", 33.502, -112.1776, 208189], ["Tacoma", "WA", "US", 47.2529, -122.4443, 207948], ["Arlington", "VA", "US", 38.881, -77.1043, 207627], ["Fontana", "CA", "US", 34.0922, -117.4351, 207460], ["Oxnard", "CA", "US", 34.1975, -119.177, 207254], ["Moreno Valley", "CA", "US", 33.9375, -117.2306, 204198], ["Burnaby", "BC", "CA", 49.2664, -122.9526, 202799], ["Fayetteville", "NC", "US", 35.0527, -78.8784, 201963], ["Huntington Beach", "CA", "US", 33.6603, -117.9992, 201899], ["Yonkers", "NY", "US", 40.9312, -73.8988, 201116], ["Glendale", "CA", "US", 34.1425, -118.2551, 201020], ["Aurora", "IL", "US", 41.7606, -88.3201, 200661], ["Montgomery", "AL", "US", 32.3668, -86.3, 200602], ["Columbus", "GA", "US", 32.461, -84.9877, 200579], ["Ladner", "BC", "CA", 49.0894, -123.0824, 2e5], ["Saskatoon", "SK", "CA", 52.1324, -106.6689, 198958], ["Amarillo", "TX", "US", 35.222, -101.8313, 198645], ["Little Rock", "AR", "US", 34.7465, -92.2896, 197992], ["Akron", "OH", "US", 41.0814, -81.519, 197542], ["Shreveport", "LA", "US", 32.5251, -93.7502, 197204], ["Grand Rapids", "MI", "US", 42.9634, -85.6681, 195097], ["Mobile", "AL", "US", 30.6944, -88.043, 194288], ["Salt Lake City", "UT", "US", 40.7608, -111.8911, 192672], ["Huntsville", "AL", "US", 34.7304, -86.5859, 190582], ["Tallahassee", "FL", "US", 30.4383, -84.2807, 189907], ["Sunrise Manor", "NV", "US", 36.2111, -115.0731, 189372], ["Grand Prairie", "TX", "US", 32.746, -96.9978, 187809], ["Overland Park", "KS", "US", 38.9822, -94.6708, 186515], ["Richmond Hill", "ON", "CA", 43.8711, -79.4373, 185541], ["Knoxville", "TN", "US", 35.9606, -83.9207, 185291], ["Worcester", "MA", "US", 42.2626, -71.8023, 184815], ["Brownsville", "TX", "US", 25.9017, -97.4975, 183887], ["Newport News", "VA", "US", 37.0834, -76.4697, 182385], ["Santa Clarita", "CA", "US", 34.3917, -118.5426, 182371], ["Barrie", "ON", "CA", 44.4001, -79.6663, 182041], ["Richmond", "BC", "CA", 49.17, -123.1368, 182e3], ["Nepean", "ON", "CA", 45.3362, -75.7225, 18e4], ["Providence", "RI", "US", 41.824, -71.4128, 179207], ["Fort Lauderdale", "FL", "US", 26.1223, -80.1434, 178590], ["East Flatbush", "NY", "US", 40.6537, -73.9304, 178464], ["Spring Valley", "NV", "US", 36.108, -115.245, 178395], ["Chattanooga", "TN", "US", 35.0456, -85.3097, 176588], ["Regina", "SK", "CA", 50.4501, -104.6178, 176183], ["Tempe", "AZ", "US", 33.4148, -111.9093, 175826], ["Oceanside", "CA", "US", 33.1959, -117.3795, 175691], ["Garden Grove", "CA", "US", 33.7739, -117.9415, 175393], ["Rancho Cucamonga", "CA", "US", 34.1064, -117.5931, 175236], ["Cape Coral", "FL", "US", 26.5629, -81.9495, 175229], ["Santa Rosa", "CA", "US", 38.4405, -122.7144, 174972], ["East New York", "NY", "US", 40.6668, -73.8824, 173198], ["Vancouver", "WA", "US", 45.6387, -122.6615, 172860], ["Sioux Falls", "SD", "US", 43.55, -96.7003, 171544], ["Peoria", "AZ", "US", 33.5806, -112.2374, 171237], ["Ontario", "CA", "US", 34.0633, -117.6509, 171214], ["Jackson", "MS", "US", 32.2988, -90.1848, 170674], ["Hollywood", "CA", "US", 34.0983, -118.3267, 167664], ["Elk Grove", "CA", "US", 38.4088, -121.3716, 166913], ["Springfield", "MO", "US", 37.2153, -93.2982, 166810], ["Pembroke Pines", "FL", "US", 26.0032, -80.2239, 166611], ["Oakville", "ON", "CA", 43.4501, -79.6829, 165697], ["Deer Valley", "AZ", "US", 33.6839, -112.1349, 165656], ["Port Saint Lucie", "FL", "US", 27.2939, -80.3503, 164603], ["Salem", "OR", "US", 44.9429, -123.0351, 164549], ["Burlington", "ON", "CA", 43.3862, -79.8371, 164415], ["Corona", "CA", "US", 33.8753, -117.5664, 164226], ["Eugene", "OR", "US", 44.0521, -123.0867, 163460], ["McKinney", "TX", "US", 33.1976, -96.6153, 162898], ["Fort Collins", "CO", "US", 40.5853, -105.0844, 161175], ["Lancaster", "CA", "US", 34.698, -118.1367, 161103], ["Cary", "NC", "US", 35.7915, -78.7811, 159769], ["Tempe Junction", "AZ", "US", 33.4142, -111.9435, 158368], ["Palmdale", "CA", "US", 34.5794, -118.1165, 158351], ["Hayward", "CA", "US", 37.6688, -122.0808, 158289], ["Greater Sudbury", "ON", "CA", 46.49, -80.99, 157857], ["Salinas", "CA", "US", 36.6777, -121.6555, 157380], ["Frisco", "TX", "US", 33.1507, -96.8236, 154407], ["Springfield", "MA", "US", 42.1015, -72.5898, 154341], ["East Chattanooga", "TN", "US", 35.0654, -85.2491, 154024], ["Pasadena", "TX", "US", 29.6911, -95.2091, 153784], ["Alexandria", "VA", "US", 38.8048, -77.0469, 153511], ["Pomona", "CA", "US", 34.0553, -117.7523, 153266], ["Washington Heights", "NY", "US", 40.8501, -73.9354, 152613], ["Lakewood", "CO", "US", 39.7047, -105.0814, 152597], ["Sunnyvale", "CA", "US", 37.3688, -122.0363, 151754], ["Abbotsford", "BC", "CA", 49.058, -122.2526, 151683], ["Escondido", "CA", "US", 33.1192, -117.0864, 151451], ["Kansas City", "KS", "US", 39.1142, -94.6275, 151306], ["Astoria", "NY", "US", 40.7721, -73.9301, 150165], ["Hollywood", "FL", "US", 26.0112, -80.1495, 149728], ["Borough Park", "NY", "US", 40.634, -73.9968, 149248], ["Clarksville", "TN", "US", 36.5298, -87.3594, 149176], ["Torrance", "CA", "US", 33.8359, -118.3406, 148475], ["Valencia", "CA", "US", 34.4436, -118.6095, 148456], ["Rockford", "IL", "US", 42.2711, -89.094, 148278], ["East Hampton", "VA", "US", 37.0374, -76.3316, 147993], ["Joliet", "IL", "US", 41.5252, -88.0834, 147861], ["Paterson", "NJ", "US", 40.9168, -74.1718, 147754], ["Bridgeport", "CT", "US", 41.1792, -73.1894, 147629], ["Naperville", "IL", "US", 41.7859, -88.1473, 147100], ["Boise", "ID", "US", 43.6135, -116.2035, 145987], ["Savannah", "GA", "US", 32.0835, -81.0998, 145674], ["Mesquite", "TX", "US", 32.7668, -96.5992, 144788], ["Syracuse", "NY", "US", 43.0481, -76.1474, 144142], ["Saguenay", "QC", "CA", 48.4168, -71.0657, 143692], ["Metairie Terrace", "LA", "US", 29.9785, -90.164, 142489], ["Pasadena", "CA", "US", 34.1478, -118.1445, 142250], ["Orange", "CA", "US", 33.7878, -117.8531, 140992], ["Fullerton", "CA", "US", 33.8703, -117.9253, 140847], ["Killeen", "TX", "US", 31.1171, -97.7278, 140806], ["Dayton", "OH", "US", 39.7589, -84.1916, 140599], ["McAllen", "TX", "US", 26.2034, -98.23, 140269], ["Coquitlam", "BC", "CA", 49.2846, -122.7822, 14e4], ["Bellevue", "WA", "US", 47.6104, -122.2007, 139820], ["Metairie", "LA", "US", 29.9841, -90.1529, 138481], ["Miramar", "FL", "US", 25.9873, -80.2323, 137132], ["Hampton", "VA", "US", 37.0299, -76.3452, 136454], ["Van Nuys", "CA", "US", 34.1867, -118.449, 136443], ["West Valley City", "UT", "US", 40.6916, -112.0011, 136208], ["Olathe", "KS", "US", 38.8814, -94.8191, 134305], ["Warren", "MI", "US", 42.4904, -83.013, 134056], ["Columbia", "SC", "US", 34.0007, -81.0348, 133803], ["Thornton", "CO", "US", 39.868, -104.9719, 133451], ["Carrollton", "TX", "US", 32.9537, -96.8903, 133168], ["Midland", "TX", "US", 31.9974, -102.0779, 132950], ["Charleston", "SC", "US", 32.7766, -79.9309, 132609], ["Waco", "TX", "US", 31.5493, -97.1467, 132356], ["Sterling Heights", "MI", "US", 42.5803, -83.0302, 132052], ["St. Catharines", "ON", "CA", 43.1713, -79.2427, 131989], ["Denton", "TX", "US", 33.2148, -97.1331, 131044], ["Cedar Rapids", "IA", "US", 42.0083, -91.6441, 130405], ["New Haven", "CT", "US", 41.3081, -72.9282, 130322], ["Roseville", "CA", "US", 38.7521, -121.288, 130269], ["Gainesville", "FL", "US", 29.6516, -82.3248, 130128], ["Visalia", "CA", "US", 36.3302, -119.2921, 130104], ["Coral Springs", "FL", "US", 26.2712, -80.2706, 129485], ["Sherbrooke", "QC", "CA", 45.4001, -71.8991, 129447], ["Thousand Oaks", "CA", "US", 34.1706, -118.8376, 129339], ["Elizabeth", "NJ", "US", 40.664, -74.2107, 129007], ["Stamford", "CT", "US", 41.0534, -73.5387, 128874], ["Concord", "CA", "US", 37.978, -122.0311, 128667], ["Surprise", "AZ", "US", 33.6306, -112.3332, 128422], ["Alhambra", "AZ", "US", 33.4984, -112.1343, 127764], ["Lafayette", "LA", "US", 30.2241, -92.0198, 127657], ["Topeka", "KS", "US", 39.0483, -95.678, 127265], ["Kent", "WA", "US", 47.3809, -122.2348, 126952], ["Simi Valley", "CA", "US", 34.2694, -118.7815, 126788], ["East Los Angeles", "CA", "US", 34.0239, -118.172, 126496], ["L\xE9vis", "QC", "CA", 46.8033, -71.1779, 126396], ["Santa Clara", "CA", "US", 37.3541, -121.9552, 126215], ["Murfreesboro", "TN", "US", 35.8456, -86.3903, 126118], ["Sunset Park", "NY", "US", 40.6455, -74.0124, 126e3], ["Kelowna", "BC", "CA", 49.8831, -119.4857, 125109], ["Koreatown", "CA", "US", 34.0578, -118.3009, 124281], ["Hartford", "CT", "US", 41.7637, -72.6851, 124006], ["Sheepshead Bay", "NY", "US", 40.5912, -73.9446, 122534], ["Amherst", "NY", "US", 42.9784, -78.7998, 122366], ["Victorville", "CA", "US", 34.5361, -117.2912, 122225], ["Abilene", "TX", "US", 32.4487, -99.7331, 121721], ["Vallejo", "CA", "US", 38.1041, -122.2566, 121253], ["North Stamford", "CT", "US", 41.1382, -73.5435, 121230], ["Berkeley", "CA", "US", 37.8716, -122.2728, 120972], ["Cambridge", "ON", "CA", 43.3601, -80.3127, 120372], ["Norman", "OK", "US", 35.2226, -97.4395, 120284], ["Allentown", "PA", "US", 40.6084, -75.4902, 120207], ["Evansville", "IN", "US", 37.9748, -87.5559, 119943], ["Trois-Rivi\xE8res", "QC", "CA", 46.3451, -72.5477, 119693], ["Columbia", "MO", "US", 38.9517, -92.3341, 119108], ["Odessa", "TX", "US", 31.8457, -102.3676, 118968], ["Fargo", "ND", "US", 46.8772, -96.7898, 118523], ["Beaumont", "TX", "US", 30.0861, -94.1018, 118129], ["Independence", "MO", "US", 39.0911, -94.4155, 117255], ["Ann Arbor", "MI", "US", 42.2776, -83.7409, 117070], ["El Monte", "CA", "US", 34.0686, -118.0276, 116732], ["Athens", "GA", "US", 33.9609, -83.3779, 116714], ["Springfield", "IL", "US", 39.8017, -89.6437, 116565], ["Harlem", "NY", "US", 40.8079, -73.9454, 116345], ["Round Rock", "TX", "US", 30.5083, -97.6789, 115997], ["Wilmington", "NC", "US", 34.2257, -77.9447, 115933], ["East Harlem", "NY", "US", 40.7947, -73.9425, 115921], ["Guelph", "ON", "CA", 43.5459, -80.256, 115760], ["Arvada", "CO", "US", 39.8028, -105.0875, 115368], ["East York", "ON", "CA", 43.6905, -79.3279, 115365], ["Provo", "UT", "US", 40.2338, -111.6585, 115264], ["Peoria", "IL", "US", 40.6936, -89.589, 115070], ["Lansing", "MI", "US", 42.7325, -84.5555, 115056], ["Downey", "CA", "US", 33.94, -118.1326, 114219], ["Kingston", "ON", "CA", 44.2298, -76.481, 114195], ["Carlsbad", "CA", "US", 33.1581, -117.3506, 113453], ["Elmhurst", "NY", "US", 40.7365, -73.8779, 113364], ["Costa Mesa", "CA", "US", 33.6411, -117.9187, 113204], ["Miami Gardens", "FL", "US", 25.942, -80.2456, 113187], ["Westminster", "CO", "US", 39.8366, -105.0372, 113130], ["North Peoria", "IL", "US", 40.7175, -89.5843, 113004], ["Clearwater", "FL", "US", 27.9658, -82.8001, 113003], ["Fairfield", "CA", "US", 38.2494, -122.04, 112970], ["Bushwick", "NY", "US", 40.6943, -73.9188, 112620], ["Gravesend", "NY", "US", 40.5976, -73.9651, 112229], ["Rochester", "MN", "US", 44.0216, -92.4699, 112225], ["Elgin", "IL", "US", 42.0373, -88.2812, 112111], ["Temecula", "CA", "US", 33.4936, -117.1484, 112011], ["West Jordan", "UT", "US", 40.6097, -111.9391, 111946], ["Inglewood", "CA", "US", 33.9617, -118.3531, 111666], ["Richardson", "TX", "US", 32.9482, -96.7297, 110815], ["Lowell", "MA", "US", 42.6334, -71.3162, 110699], ["East Independence", "MO", "US", 39.0956, -94.3552, 110675], ["Gresham", "OR", "US", 45.4982, -122.4315, 110553], ["Antioch", "CA", "US", 38.0049, -121.8058, 110542], ["Cambridge", "MA", "US", 42.3751, -71.1056, 110402], ["High Point", "NC", "US", 35.9557, -80.0053, 110268], ["Billings", "MT", "US", 45.7833, -108.5007, 110263], ["Manchester", "NH", "US", 42.9956, -71.4548, 110229], ["Murrieta", "CA", "US", 33.5539, -117.2139, 109830], ["Centennial", "CO", "US", 39.5792, -104.8769, 109741], ["Richmond", "CA", "US", 37.9358, -122.3478, 109708], ["Corona", "NY", "US", 40.7471, -73.8601, 109698], ["Pueblo", "CO", "US", 38.2544, -104.6091, 109412], ["Pearland", "TX", "US", 29.5636, -95.2861, 108821], ["Waterbury", "CT", "US", 41.5581, -73.0515, 108802], ["Moncton", "NB", "CA", 46.0945, -64.7965, 108620], ["West Covina", "CA", "US", 34.0686, -117.939, 108484], ["Enterprise", "NV", "US", 36.0252, -115.2419, 108481], ["North Charleston", "SC", "US", 32.8546, -79.9748, 108304], ["Everett", "WA", "US", 47.979, -122.2021, 108010], ["College Station", "TX", "US", 30.628, -96.3344, 107889], ["Palm Bay", "FL", "US", 28.0345, -80.5887, 107888], ["Pompano Beach", "FL", "US", 26.2379, -80.1248, 107762], ["Boulder", "CO", "US", 40.015, -105.2706, 107349], ["Norwalk", "CA", "US", 33.9022, -118.0817, 107140], ["West Palm Beach", "FL", "US", 26.7153, -80.0534, 106779], ["Broken Arrow", "OK", "US", 36.0526, -95.7908, 106563], ["Daly City", "CA", "US", 37.7058, -122.4619, 106562], ["Sydney", "NS", "CA", 46.1351, -60.1831, 105968], ["Sandy Springs", "GA", "US", 33.9243, -84.3785, 105330], ["Burbank", "CA", "US", 34.1808, -118.309, 105319], ["Green Bay", "WI", "US", 44.5192, -88.0198, 105207], ["Santa Maria", "CA", "US", 34.953, -120.4357, 105093], ["Universal City", "CA", "US", 34.1389, -118.3534, 105e3], ["Wichita Falls", "TX", "US", 33.9137, -98.4934, 104710], ["Lakeland", "FL", "US", 28.0395, -81.9498, 104401], ["Clovis", "CA", "US", 36.8252, -119.7029, 104180], ["Lewisville", "TX", "US", 33.0462, -96.9942, 104039], ["Tyler", "TX", "US", 32.3513, -95.3011, 103700], ["El Cajon", "CA", "US", 32.7948, -116.9625, 103679], ["San Mateo", "CA", "US", 37.563, -122.3255, 103536], ["Brandon", "FL", "US", 27.9378, -82.2859, 103483], ["Rialto", "CA", "US", 34.1064, -117.3703, 103132], ["Davenport", "IA", "US", 41.5236, -90.5776, 102582], ["Edison", "NJ", "US", 40.5187, -74.4121, 102548], ["Hillsboro", "OR", "US", 45.5229, -122.9898, 102347], ["Milton", "ON", "CA", 43.5168, -79.8829, 101715], ["Delta", "BC", "CA", 49.144, -122.9068, 101668], ["Las Cruces", "NM", "US", 32.3123, -106.7783, 101643], ["South Bend", "IN", "US", 41.6834, -86.25, 101516], ["Dartmouth", "NS", "CA", 44.6713, -63.5772, 101343], ["Vista", "CA", "US", 33.2, -117.2425, 100890], ["Greeley", "CO", "US", 40.4233, -104.7091, 100883], ["Davie", "FL", "US", 26.0629, -80.2331, 100882], ["Chinatown", "CA", "US", 37.7966, -122.4086, 100574], ["San Angelo", "TX", "US", 31.4638, -100.437, 100450], ["Renton", "WA", "US", 47.4829, -122.2171, 100242], ["Roanoke", "VA", "US", 37.271, -79.9414, 99897], ["Kenosha", "WI", "US", 42.5847, -87.8212, 99858], ["Clinton Township", "MI", "US", 42.587, -82.9199, 99753], ["Columbia", "MD", "US", 39.2404, -76.8394, 99615], ["Erie", "PA", "US", 42.1292, -80.0851, 99475], ["Thunder Bay", "ON", "CA", 48.382, -89.2502, 99334], ["St. John's", "NL", "CA", 47.5649, -52.7093, 99182], ["Portsmouth Heights", "VA", "US", 36.821, -76.3688, 99049], ["Richmond Hill", "NY", "US", 40.6998, -73.8312, 98984], ["Alief", "TX", "US", 29.7111, -95.5963, 98725], ["Spring Hill", "FL", "US", 28.4769, -82.5255, 98621], ["Albany", "NY", "US", 42.6526, -73.7562, 98469], ["Compton", "CA", "US", 33.8959, -118.2201, 98462], ["Tuscaloosa", "AL", "US", 33.2098, -87.5692, 98332], ["League City", "TX", "US", 29.5074, -95.0949, 98312], ["Flint", "MI", "US", 43.0125, -83.6875, 98310], ["Allen", "TX", "US", 33.1032, -96.6706, 98143], ["Waterloo", "ON", "CA", 43.4668, -80.5164, 97475], ["Mission Viejo", "CA", "US", 33.6, -117.672, 97156], ["Vacaville", "CA", "US", 38.3566, -121.9877, 96803], ["Ventura", "CA", "US", 34.2783, -119.2932, 96769], ["Highlands Ranch", "CO", "US", 39.5539, -104.9694, 96713], ["Lawton", "OK", "US", 34.6087, -98.3903, 96655], ["Beaverton", "OR", "US", 45.4871, -122.8037, 96577], ["South Gate", "CA", "US", 33.9547, -118.212, 96401], ["Portsmouth", "VA", "US", 36.8354, -76.2983, 96201], ["Sparks", "NV", "US", 39.5349, -119.7527, 96094], ["Brockton", "MA", "US", 42.0834, -71.0184, 95314], ["Dearborn", "MI", "US", 42.3223, -83.1763, 95171], ["Federal Way", "WA", "US", 47.3223, -122.3126, 95171], ["Lee's Summit", "MO", "US", 38.9108, -94.3822, 95094], ["New Bedford", "MA", "US", 41.6353, -70.927, 94958], ["Spokane Valley", "WA", "US", 47.6732, -117.2394, 94919], ["Terrebonne", "QC", "CA", 45.7, -73.6473, 94703], ["Fordham", "NY", "US", 40.8593, -73.8985, 94678], ["Livonia", "MI", "US", 42.3684, -83.3527, 94635], ["Roswell", "GA", "US", 34.0232, -84.3616, 94501], ["Orem", "UT", "US", 40.2969, -111.6946, 94457], ["Yuma", "AZ", "US", 32.7253, -114.6244, 94139], ["Lawrence", "KS", "US", 38.9717, -95.2352, 93917], ["The Woodlands", "TX", "US", 30.158, -95.4894, 93847], ["West Albany", "NY", "US", 42.6831, -73.7785, 93794], ["Yakima", "WA", "US", 46.6021, -120.5059, 93701], ["Quincy", "MA", "US", 42.2529, -71.0023, 93618], ["Flatbush", "NY", "US", 40.6521, -73.959, 93361], ["Hesperia", "CA", "US", 34.4264, -117.3009, 93295], ["Carson", "CA", "US", 33.8314, -118.282, 93281], ["Boca Raton", "FL", "US", 26.3587, -80.0831, 93235], ["Santa Monica", "CA", "US", 34.0194, -118.4912, 93220], ["San Marcos", "CA", "US", 33.1434, -117.1661, 92931], ["Boyle Heights", "CA", "US", 34.0339, -118.2053, 92785], ["Plantation", "FL", "US", 26.1342, -80.2318, 92560], ["Lynn", "MA", "US", 42.4668, -70.9495, 92457], ["Miami Beach", "FL", "US", 25.7906, -80.13, 92312], ["Arden-Arcade", "CA", "US", 38.6025, -121.3785, 92186], ["Westminster", "CA", "US", 33.7592, -118.0067, 92114], ["Longmont", "CO", "US", 40.1672, -105.1019, 92088], ["Santa Barbara", "CA", "US", 34.4208, -119.6982, 91842], ["Redding", "CA", "US", 40.5865, -122.3917, 91582], ["Macon", "GA", "US", 32.8407, -83.6324, 91351], ["Meridian", "ID", "US", 43.6121, -116.3915, 90739], ["San Leandro", "CA", "US", 37.7249, -122.1561, 90712], ["Greenville", "NC", "US", 35.6127, -77.3663, 90597], ["Chico", "CA", "US", 39.7285, -121.8375, 90316], ["Ajax", "ON", "CA", 43.8501, -79.0329, 90167], ["Edmond", "OK", "US", 35.6528, -97.4781, 90092], ["Kanata", "ON", "CA", 45.3001, -75.9161, 9e4], ["Chinatown", "NY", "US", 40.7165, -73.9963, 9e4], ["Nampa", "ID", "US", 43.5407, -116.5635, 89839], ["Sandy Hills", "UT", "US", 40.5811, -111.8508, 89575], ["Newton", "MA", "US", 42.337, -71.2092, 88817], ["Toms River", "NJ", "US", 39.9537, -74.1979, 88791], ["Fall River", "MA", "US", 41.7015, -71.1551, 88777], ["Carmel", "IN", "US", 39.9784, -86.118, 88713], ["Asheville", "NC", "US", 35.6009, -82.554, 88512], ["Norwalk", "CT", "US", 41.1176, -73.4079, 88485], ["Waukegan", "IL", "US", 42.3636, -87.8448, 88475], ["Deltona", "FL", "US", 28.9005, -81.2637, 88474], ["Hawthorne", "CA", "US", 33.9164, -118.3526, 88451], ["Fort Smith", "AR", "US", 35.3859, -94.3986, 88194], ["Suffolk", "VA", "US", 36.7284, -76.585, 88161], ["Sugar Land", "TX", "US", 29.6197, -95.635, 88156], ["Livermore", "CA", "US", 37.6819, -121.768, 88126], ["Nashua", "NH", "US", 42.7654, -71.4676, 87970], ["Reading", "PA", "US", 40.3357, -75.9269, 87879], ["Saint John", "NB", "CA", 45.2708, -66.0562, 87857], ["Pickering", "ON", "CA", 43.9001, -79.1329, 87838], ["Brantford", "ON", "CA", 43.1334, -80.2664, 87759], ["Concord", "NC", "US", 35.4089, -80.5816, 87696], ["Indio", "CA", "US", 33.7207, -116.2168, 87533], ["Rio Rancho", "NM", "US", 35.2334, -106.6645, 87521], ["Enchanted Hills", "NM", "US", 35.3368, -106.593, 87521], ["Sandy", "UT", "US", 40.5916, -111.8841, 87461], ["Whittier", "CA", "US", 33.9792, -118.0328, 87438], ["Canarsie", "NY", "US", 40.6437, -73.9007, 87366], ["Kirkland", "WA", "US", 47.6815, -122.2087, 87281], ["Menifee", "CA", "US", 33.7283, -117.1464, 87174], ["Newport Beach", "CA", "US", 33.6189, -117.929, 87127], ["Tracy", "CA", "US", 37.7399, -121.4262, 87075], ["Citrus Heights", "CA", "US", 38.7071, -121.2811, 87056], ["Bend", "OR", "US", 44.0582, -121.3153, 87014], ["Canton", "MI", "US", 42.3087, -83.4822, 86825], ["Lehigh Acres", "FL", "US", 26.6254, -81.6248, 86784], ["Greenburgh", "NY", "US", 41.0329, -73.8429, 86764], ["Bloomington", "MN", "US", 44.8408, -93.2983, 86435], ["West Town", "IL", "US", 41.8938, -87.6749, 86429], ["Germantown", "MD", "US", 39.1732, -77.2716, 86395], ["Clifton", "NJ", "US", 40.8584, -74.1638, 86334], ["Duluth", "MN", "US", 46.7833, -92.1066, 86110], ["Champaign", "IL", "US", 40.1164, -88.2434, 86096], ["Near North Side", "IL", "US", 41.9, -87.6345, 85711], ["Chino", "CA", "US", 34.0122, -117.6889, 85595], ["Alhambra", "CA", "US", 34.0953, -118.127, 85551], ["Ogden", "UT", "US", 41.223, -111.9738, 85444], ["Redwood City", "CA", "US", 37.4852, -122.2364, 85288], ["Bellingham", "WA", "US", 48.7595, -122.4882, 85146], ["O'Fallon", "MO", "US", 38.8106, -90.6998, 85040], ["Nanaimo", "BC", "CA", 49.1664, -123.94, 84905], ["Hoover", "AL", "US", 33.4054, -86.8114, 84848], ["Danbury", "CT", "US", 41.3948, -73.454, 84657], ["East Norwalk", "CT", "US", 41.1056, -73.3984, 84530], ["Edinburg", "TX", "US", 26.3017, -98.1633, 84497], ["Sunrise", "FL", "US", 26.134, -80.1131, 84439], ["Trenton", "NJ", "US", 40.2171, -74.7429, 84225], ["Santa Fe", "NM", "US", 35.687, -105.9378, 84099], ["Bloomington", "IN", "US", 39.1653, -86.5264, 84067], ["Cicero", "IL", "US", 41.8456, -87.7539, 83886], ["Hemet", "CA", "US", 33.7476, -116.9731, 83861], ["Ahwatukee Foothills", "AZ", "US", 33.3417, -111.984, 83464], ["Johns Creek", "GA", "US", 34.0289, -84.1986, 83335], ["Mission", "TX", "US", 26.2159, -98.3253, 83298], ["Troy", "MI", "US", 42.6056, -83.1499, 83280], ["Buena Park", "CA", "US", 33.8675, -117.9981, 83270], ["Palm Coast", "FL", "US", 29.585, -81.2078, 82893], ["Fayetteville", "AR", "US", 36.0626, -94.1574, 82830], ["Sioux City", "IA", "US", 42.5, -96.4003, 82821], ["Lake Forest", "CA", "US", 33.647, -117.6892, 82492], ["Merced", "CA", "US", 37.3022, -120.483, 82436], ["Longview", "TX", "US", 32.5007, -94.7405, 82287], ["Bryan", "TX", "US", 30.6744, -96.37, 82118], ["Niagara Falls", "ON", "CA", 43.1001, -79.0663, 82e3], ["Westland", "MI", "US", 42.3242, -83.4002, 82e3], ["Warwick", "RI", "US", 41.7001, -71.4162, 81699], ["Lakewood", "CA", "US", 33.8536, -118.134, 81611], ["Farmington Hills", "MI", "US", 42.4853, -83.3772, 81330], ["San Tan Valley", "AZ", "US", 33.1911, -111.528, 81321], ["Mount Pleasant", "SC", "US", 32.7941, -79.8626, 81317], ["Cranston", "RI", "US", 41.7798, -71.4373, 81073], ["Largo", "FL", "US", 27.9098, -82.7884, 81e3], ["South Suffolk", "VA", "US", 36.7171, -76.5902, 80690], ["Avondale", "AZ", "US", 33.4356, -112.3496, 80684], ["Tustin", "CA", "US", 33.7458, -117.8262, 80583], ["Mountain View", "CA", "US", 37.386, -122.0838, 80435], ["Napa", "CA", "US", 38.2971, -122.2855, 80434], ["Somerville", "MA", "US", 42.3876, -71.0995, 80318], ["Lawrence", "MA", "US", 42.707, -71.1631, 80231], ["Melbourne", "FL", "US", 28.0836, -80.6081, 80127], ["Parma", "OH", "US", 41.4048, -81.7229, 79937], ["New Rochelle", "NY", "US", 40.9115, -73.7823, 79846], ["Lynchburg", "VA", "US", 37.4138, -79.1423, 79812], ["Medford", "OR", "US", 42.3265, -122.8756, 79805], ["Deerfield Beach", "FL", "US", 26.3184, -80.0998, 79768], ["Pleasanton", "CA", "US", 37.6624, -121.8747, 79510], ["Willowdale", "ON", "CA", 43.7667, -79.3991, 79440], ["Belmont Cragin", "IL", "US", 41.9317, -87.7687, 79159], ["Brooklyn Park", "MN", "US", 45.0941, -93.3563, 79149], ["Goodyear", "AZ", "US", 33.4353, -112.3582, 79003], ["Kennewick", "WA", "US", 46.2112, -119.1372, 78896], ["Alameda", "CA", "US", 37.771, -122.2609, 78630], ["Town 'n' Country", "FL", "US", 28.0106, -82.5773, 78442], ["Bellflower", "CA", "US", 33.8817, -118.117, 78441], ["San Pedro", "CA", "US", 33.7358, -118.2923, 78405], ["Chino Hills", "CA", "US", 33.9938, -117.7589, 78309], ["Bloomington", "IL", "US", 40.4842, -88.9937, 78292], ["Alafaya", "FL", "US", 28.5641, -81.2114, 78113], ["Springdale", "AR", "US", 36.1867, -94.1288, 77859], ["North Hollywood", "CA", "US", 34.1722, -118.379, 77848], ["Racine", "WI", "US", 42.7261, -87.7828, 77742], ["Hammond", "IN", "US", 41.5834, -87.5, 77614], ["Milpitas", "CA", "US", 37.4283, -121.9066, 77604], ["Saint-Laurent", "QC", "CA", 45.5001, -73.6659, 77391], ["Gary", "IN", "US", 41.5934, -87.3464, 77156], ["Scranton", "PA", "US", 41.4092, -75.6649, 77118], ["Baldwin Park", "CA", "US", 34.0853, -117.9609, 77071], ["Auburn", "WA", "US", 47.3073, -122.2284, 77006], ["Chilliwack", "BC", "CA", 49.1664, -121.9526, 77e3], ["Fishers", "IN", "US", 39.9556, -86.0139, 76794], ["Saint Joseph", "MO", "US", 39.7686, -94.8466, 76780], ["Pharr", "TX", "US", 26.1948, -98.1836, 76538], ["Upland", "CA", "US", 34.0975, -117.6484, 76443], ["Folsom", "CA", "US", 38.678, -121.1761, 76375], ["Baytown", "TX", "US", 29.7355, -94.9774, 76335], ["Repentigny", "QC", "CA", 45.7422, -73.4501, 76237], ["San Ramon", "CA", "US", 37.7799, -121.978, 76134], ["Camden", "NJ", "US", 39.926, -75.1196, 76119], ["Lake Charles", "LA", "US", 30.2131, -93.2044, 76070], ["Kalamazoo", "MI", "US", 42.2917, -85.5872, 76041], ["Fort McMurray", "AB", "CA", 56.7268, -111.381, 76e3], ["Arlington Heights", "IL", "US", 42.0884, -87.9806, 75926], ["Plymouth", "MN", "US", 45.0105, -93.4555, 75907], ["Peterborough", "ON", "CA", 44.3001, -78.3162, 75877], ["Waterford", "MI", "US", 42.693, -83.4118, 75737], ["Evanston", "IL", "US", 42.0411, -87.6901, 75527], ["Manteca", "CA", "US", 37.7974, -121.216, 75448], ["Kendall", "FL", "US", 25.6793, -80.3173, 75371], ["Wyoming", "MI", "US", 42.9134, -85.7053, 75275], ["Loveland", "CO", "US", 40.3978, -105.075, 75182], ["Cheektowaga", "NY", "US", 42.9034, -78.7548, 75178], ["Kings Bridge", "NY", "US", 40.8787, -73.9051, 75132], ["Perris", "CA", "US", 33.7825, -117.2287, 74971], ["Bethlehem", "PA", "US", 40.6259, -75.3705, 74892], ["Albany", "GA", "US", 31.5785, -84.1557, 74843], ["Schaumburg", "IL", "US", 42.0334, -88.0834, 74693], ["Gastonia", "NC", "US", 35.2621, -81.1873, 74543], ["Brownsville", "NY", "US", 40.6609, -73.9201, 74497], ["Union City", "CA", "US", 37.5958, -122.0191, 74494], ["Bolingbrook", "IL", "US", 41.6986, -88.0684, 74306], ["Newmarket", "ON", "CA", 44.0501, -79.4663, 74295], ["Iowa City", "IA", "US", 41.6611, -91.5302, 74220], ["Layton", "UT", "US", 41.0602, -111.9711, 74143], ["Missouri City", "TX", "US", 29.6186, -95.5377, 74139], ["Appleton", "WI", "US", 44.2619, -88.4154, 74139], ["Shelby", "MI", "US", 42.6709, -83.033, 74099], ["La Haute-Saint-Charles", "QC", "CA", 46.8903, -71.3722, 74070], ["Fort Myers", "FL", "US", 26.6217, -81.8406, 74013], ["Boynton Beach", "FL", "US", 26.5253, -80.0664, 73966], ["Jonesboro", "AR", "US", 35.8423, -90.7043, 73907], ["South Lawndale", "IL", "US", 41.8436, -87.7125, 73826], ["Logan Square", "IL", "US", 41.9234, -87.6992, 73702], ["Red Deer", "AB", "CA", 52.2668, -113.802, 73593], ["Rapid City", "SD", "US", 44.0805, -103.231, 73569], ["Warner Robins", "GA", "US", 32.6157, -83.6266, 73490], ["Rochester Hills", "MI", "US", 42.6584, -83.1499, 73424], ["Saint-L\xE9onard", "QC", "CA", 45.5877, -73.595, 73423], ["Decatur", "IL", "US", 39.8403, -88.9548, 73254], ["Southfield", "MI", "US", 42.4734, -83.2219, 73156], ["Saint George", "UT", "US", 37.1041, -113.5841, 72897], ["New Britain", "CT", "US", 41.6612, -72.7795, 72808], ["Franklin", "TN", "US", 35.9251, -86.8689, 72639], ["Turlock", "CA", "US", 37.4947, -120.8466, 72292], ["Temple", "TX", "US", 31.0982, -97.3428, 72277], ["West Ridge", "IL", "US", 41.9997, -87.6928, 72211], ["Apple Valley", "CA", "US", 34.5008, -117.1859, 72174], ["Sarnia", "ON", "CA", 42.9787, -82.4041, 72125], ["Lynwood", "CA", "US", 33.9303, -118.2115, 71989], ["Waukesha", "WI", "US", 43.0117, -88.2315, 71970], ["Wilmington", "DE", "US", 39.746, -75.5466, 71948], ["Canton", "OH", "US", 40.7989, -81.3785, 71885], ["Gulfport", "MS", "US", 30.3674, -89.0928, 71856], ["Saint-Jean-sur-Richelieu", "QC", "CA", 45.3071, -73.2626, 71613], ["Pawtucket", "RI", "US", 41.8787, -71.3826, 71591], ["Lauderhill", "FL", "US", 26.1404, -80.2134, 71579], ["Rock Hill", "SC", "US", 34.9249, -81.0251, 71548], ["Silver Spring", "MD", "US", 38.9907, -77.0261, 71452], ["West Gulfport", "MS", "US", 30.4041, -89.0942, 71329], ["Flower Mound", "TX", "US", 33.0146, -97.097, 71253], ["Bismarck", "ND", "US", 46.8083, -100.7837, 71167], ["Centreville", "VA", "US", 38.8404, -77.4289, 71135], ["Lafayette", "IN", "US", 40.4167, -86.8753, 71111], ["Passaic", "NJ", "US", 40.8568, -74.1285, 71085], ["Riverview", "FL", "US", 27.8661, -82.3265, 71050], ["Redlands", "CA", "US", 34.0556, -117.1825, 71035], ["Missoula", "MT", "US", 46.8721, -113.994, 71022], ["Rancho Cordova", "CA", "US", 38.5891, -121.3027, 71017], ["Lethbridge", "AB", "CA", 49.7, -112.8186, 70617], ["New Braunfels", "TX", "US", 29.703, -98.1244, 70543], ["Cherry Hill", "NJ", "US", 39.9348, -75.0307, 70475], ["Flagstaff", "AZ", "US", 35.1981, -111.6513, 70320], ["Muncie", "IN", "US", 40.1934, -85.3864, 70087], ["Maple Ridge", "BC", "CA", 49.2194, -122.6019, 7e4], ["Mira Mesa", "CA", "US", 32.9156, -117.1439, 7e4], ["Woodland Hills", "CA", "US", 34.1683, -118.6059, 7e4], ["Weston", "FL", "US", 26.1004, -80.3998, 69959], ["Brossard", "QC", "CA", 45.4501, -73.4658, 69575], ["Frederick", "MD", "US", 39.4143, -77.4105, 69479], ["Pasco", "WA", "US", 46.2396, -119.1006, 69451], ["Pittsburg", "CA", "US", 38.028, -121.8847, 69424], ["Ridgewood", "NY", "US", 40.7001, -73.9057, 69317], ["Palatine", "IL", "US", 42.1103, -88.0342, 69308], ["North Richland Hills", "TX", "US", 32.8343, -97.2289, 69204], ["Union City", "NJ", "US", 40.7796, -74.0238, 69156], ["Kissimmee", "FL", "US", 28.3047, -81.4167, 69152], ["Walnut Creek", "CA", "US", 37.9063, -122.065, 68910], ["Kamloops", "BC", "CA", 50.6665, -120.3192, 68714], ["Mount Vernon", "NY", "US", 40.9126, -73.8371, 68628], ["Conroe", "TX", "US", 30.3119, -95.4561, 68602], ["Dothan", "AL", "US", 31.2232, -85.3905, 68567], ["Northridge", "CA", "US", 34.2283, -118.5367, 68469], ["Waterloo", "IA", "US", 42.4928, -92.343, 68460], ["Maple Grove", "MN", "US", 45.0725, -93.4558, 68385], ["Framingham", "MA", "US", 42.2793, -71.4162, 68318], ["Redondo Beach", "CA", "US", 33.8492, -118.3884, 68166], ["Bossier City", "LA", "US", 32.516, -93.7321, 68094], ["Yorba Linda", "CA", "US", 33.8886, -117.8131, 67973], ["Woodbury", "MN", "US", 44.9239, -92.9594, 67855], ["Eau Claire", "WI", "US", 44.8113, -91.4985, 67778], ["Waldorf", "MD", "US", 38.6246, -76.9391, 67752], ["Forest Hills", "NY", "US", 40.7162, -73.8501, 67714], ["Davis", "CA", "US", 38.5449, -121.7405, 67666], ["Glen Burnie", "MD", "US", 39.1626, -76.6247, 67639], ["Camarillo", "CA", "US", 34.2164, -119.0376, 67608], ["Victoria", "TX", "US", 28.8053, -97.0036, 67574], ["Gaithersburg", "MD", "US", 39.1434, -77.2014, 67456], ["Jacksonville", "NC", "US", 34.754, -77.4302, 67357], ["South San Francisco", "CA", "US", 37.6547, -122.4077, 67271], ["Kenner", "LA", "US", 29.9941, -90.2417, 67091], ["Jackson Heights", "NY", "US", 40.7557, -73.8854, 67067], ["Notre-Dame-de-Gr\xE2ce", "QC", "CA", 45.4768, -73.6143, 67e3], ["Rockville", "MD", "US", 39.084, -77.1528, 66980], ["Jackson", "TN", "US", 35.6145, -88.814, 66975], ["Lincoln Park", "IL", "US", 41.9217, -87.6478, 66959], ["Yuba City", "CA", "US", 39.1405, -121.6169, 66941], ["Portland", "ME", "US", 43.6574, -70.2589, 66881], ["Palo Alto", "CA", "US", 37.4419, -122.143, 66853], ["Casas Adobes", "AZ", "US", 32.3234, -110.9951, 66795], ["Marysville", "WA", "US", 48.0518, -122.1771, 66773], ["South Jordan", "UT", "US", 40.5622, -111.9297, 66648], ["Oshkosh", "WI", "US", 44.0247, -88.5426, 66555], ["North Little Rock", "AR", "US", 34.7695, -92.2671, 66504], ["Homestead", "FL", "US", 25.4687, -80.4776, 66498], ["Bayside", "NY", "US", 40.7684, -73.7771, 66455], ["White Rock", "BC", "CA", 49.0164, -122.8026, 66450], ["Sault Ste. Marie", "ON", "CA", 46.5168, -84.3333, 66313], ["Bayonne", "NJ", "US", 40.6687, -74.1143, 66311], ["Eagan", "MN", "US", 44.8041, -93.1669, 66286], ["Delray Beach", "FL", "US", 26.4615, -80.0728, 66255], ["Johnson City", "TN", "US", 36.3134, -82.3535, 66027], ["Dale City", "VA", "US", 38.6371, -77.3111, 65969], ["Cedar Park", "TX", "US", 30.5052, -97.8203, 65945], ["Parkchester", "NY", "US", 40.839, -73.8604, 65876], ["Atascocita", "TX", "US", 29.9988, -95.1766, 65844], ["Saint Cloud", "MN", "US", 45.5608, -94.1625, 65842], ["Ellicott City", "MD", "US", 39.2673, -76.7983, 65834], ["Laguna Niguel", "CA", "US", 33.5225, -117.7075, 65806], ["Saint Charles", "MO", "US", 38.7839, -90.4812, 65794], ["Harlingen", "TX", "US", 26.1906, -97.6961, 65774], ["Prince George", "BC", "CA", 53.9166, -122.753, 65558], ["San Clemente", "CA", "US", 33.427, -117.612, 65526], ["West Lynchburg", "VA", "US", 37.4032, -79.1781, 65517], ["Framingham Center", "MA", "US", 42.2973, -71.437, 65413], ["Schenectady", "NY", "US", 42.8142, -73.9396, 65305], ["Broomfield", "CO", "US", 39.9205, -105.0867, 65065], ["Ames", "IA", "US", 42.0347, -93.6199, 65060], ["Park Slope", "NY", "US", 40.6701, -73.986, 65047], ["Shawnee", "KS", "US", 39.0417, -94.7202, 65046], ["Conway", "AR", "US", 35.0887, -92.4421, 64980], ["East Orange", "NJ", "US", 40.7673, -74.2049, 64949], ["Portage Park", "IL", "US", 41.9578, -87.7651, 64841], ["Skokie", "IL", "US", 42.0334, -87.7334, 64821], ["Daytona Beach", "FL", "US", 29.2108, -81.0228, 64736], ["West Bloomfield Township", "MI", "US", 42.5689, -83.3836, 64690], ["Tamarac", "FL", "US", 26.2129, -80.2498, 64681], ["Youngstown", "OH", "US", 41.0998, -80.6495, 64628], ["Lodi", "CA", "US", 38.1302, -121.2725, 64596], ["Greenville", "SC", "US", 34.8526, -82.394, 64579], ["Mansfield", "TX", "US", 32.5632, -97.1417, 64274], ["Santa Cruz", "CA", "US", 36.9741, -122.0308, 64220], ["Pico Rivera", "CA", "US", 33.9831, -118.0967, 64218], ["Madera", "CA", "US", 36.9613, -120.0607, 64208], ["Janesville", "WI", "US", 42.6828, -89.0187, 64123], ["West Des Moines", "IA", "US", 41.5772, -93.7113, 64113], ["Montebello", "CA", "US", 34.0095, -118.1054, 63921], ["Georgetown", "TX", "US", 30.6327, -97.6772, 63716], ["Alpharetta", "GA", "US", 34.0754, -84.2941, 63693], ["Lorain", "OH", "US", 41.4528, -82.1824, 63647], ["Bowling Green", "KY", "US", 36.9903, -86.4436, 63616], ["Flatlands", "NY", "US", 40.6212, -73.9349, 63601], ["Dundalk", "MD", "US", 39.2507, -76.5205, 63597], ["Eden Prairie", "MN", "US", 44.8547, -93.4708, 63496], ["North Bergen", "NJ", "US", 40.8043, -74.0121, 63484], ["Florence-Graham", "CA", "US", 33.9677, -118.2444, 63387], ["Waltham", "MA", "US", 42.3765, -71.2356, 63378], ["Cheyenne", "WY", "US", 41.14, -104.8203, 63335], ["West Hartford", "CT", "US", 41.762, -72.742, 63268], ["Rogers", "AR", "US", 36.332, -94.1185, 63159], ["Medicine Hat", "AB", "CA", 50.0393, -110.6766, 63138], ["Carol City", "FL", "US", 25.9407, -80.2456, 63031], ["Encinitas", "CA", "US", 33.037, -117.292, 62930], ["East Village", "NY", "US", 40.7293, -73.9874, 62832], ["Haverhill", "MA", "US", 42.7762, -71.0773, 62765], ["Jupiter", "FL", "US", 26.9342, -80.0942, 62707], ["Council Bluffs", "IA", "US", 41.2619, -95.8608, 62597], ["Wellington", "FL", "US", 26.6587, -80.2414, 62560], ["West Coon Rapids", "MN", "US", 45.1597, -93.3497, 62528], ["North Miami", "FL", "US", 25.8901, -80.1867, 62435], ["Hamilton", "OH", "US", 39.3995, -84.5613, 62407], ["North Port", "FL", "US", 27.0442, -82.2359, 62345], ["Tulare", "CA", "US", 36.2077, -119.3473, 62315], ["Coon Rapids", "MN", "US", 45.12, -93.2877, 62240], ["Millcreek", "UT", "US", 40.6869, -111.8755, 62139], ["La Habra", "CA", "US", 33.932, -117.9462, 62131], ["Blaine", "MN", "US", 45.1608, -93.2349, 62124], ["Auburn", "AL", "US", 32.6099, -85.4808, 62059], ["Lake Elsinore", "CA", "US", 33.6681, -117.3273, 61981], ["Carmichael", "CA", "US", 38.6171, -121.3283, 61762], ["Taylor", "MI", "US", 42.2409, -83.2696, 61568], ["Burnsville", "MN", "US", 44.7677, -93.2777, 61481], ["Monterey Park", "CA", "US", 34.0625, -118.1228, 61468], ["Castro Valley", "CA", "US", 37.6941, -122.0863, 61388], ["Irvington", "NJ", "US", 40.7323, -74.2349, 61323], ["Rocklin", "CA", "US", 38.7907, -121.2358, 61213], ["Utica", "NY", "US", 43.1009, -75.2327, 61100], ["Malden", "MA", "US", 42.4251, -71.0662, 61068], ["National City", "CA", "US", 32.6781, -117.0992, 61060], ["Financial District", "NY", "US", 40.7079, -74.0086, 60976], ["Springfield", "OR", "US", 44.0462, -123.022, 60870], ["Bethesda", "MD", "US", 38.9807, -77.1003, 60858], ["Norfolk County", "ON", "CA", 42.8334, -80.383, 60847], ["Terre Haute", "IN", "US", 39.4667, -87.4139, 60825], ["Vineland", "NJ", "US", 39.4862, -75.0257, 60818], ["West Hollywood", "FL", "US", 26.0206, -80.1839, 60806], ["San Marcos", "TX", "US", 29.8833, -97.9414, 60684], ["Brentwood", "NY", "US", 40.7812, -73.2462, 60664], ["Lakeville", "MN", "US", 44.6497, -93.2427, 60633], ["West Allis", "WI", "US", 43.0167, -88.007, 60620], ["Redmond", "WA", "US", 47.674, -122.1215, 60598], ["Canoga Park", "CA", "US", 34.2011, -118.5981, 60578], ["Cupertino", "CA", "US", 37.323, -122.0322, 60572], ["Taylorsville", "UT", "US", 40.6677, -111.9388, 60514], ["Bristol", "CT", "US", 41.6718, -72.9493, 60452], ["Moore", "OK", "US", 35.3395, -97.4867, 60451], ["Gardena", "CA", "US", 33.8884, -118.309, 60447], ["Petaluma", "CA", "US", 38.2324, -122.6367, 60438], ["Grand Junction", "CO", "US", 39.0639, -108.5507, 60358], ["Casper", "WY", "US", 42.8666, -106.3131, 60285], ["Rowlett", "TX", "US", 32.9029, -96.5639, 60236], ["La Mesa", "CA", "US", 32.7678, -117.0231, 60089], ["Pine Hills", "FL", "US", 28.5578, -81.4534, 60076], ["Bensonhurst", "NY", "US", 40.6018, -73.994, 6e4], ["Coney Island", "NY", "US", 40.5779, -73.994, 6e4], ["Rancho Penasquitos", "CA", "US", 32.9595, -117.1153, 6e4], ["Valley Glen", "CA", "US", 34.1899, -118.4495, 6e4], ["Meriden", "CT", "US", 41.5382, -72.807, 59988], ["Pontiac", "MI", "US", 42.6389, -83.291, 59917], ["Port Orange", "FL", "US", 29.1383, -80.9956, 59866], ["Hamden", "CT", "US", 41.3959, -72.8968, 59847], ["Lakewood", "WA", "US", 47.1718, -122.5185, 59829], ["Fountainebleau", "FL", "US", 25.7729, -80.3478, 59764], ["Saint Clair Shores", "MI", "US", 42.497, -82.8888, 59715], ["Springfield", "OH", "US", 39.9242, -83.8088, 59680], ["Great Falls", "MT", "US", 47.5002, -111.3008, 59638], ["Chapel Hill", "NC", "US", 35.9132, -79.0558, 59568], ["Drummondville", "QC", "CA", 45.8834, -72.4824, 59489], ["Huntington Park", "CA", "US", 33.9817, -118.2251, 59430], ["Lancaster", "PA", "US", 40.0379, -76.3055, 59339], ["Coconut Creek", "FL", "US", 26.2518, -80.1789, 59302], ["Idaho Falls", "ID", "US", 43.4666, -112.0341, 59184], ["San Rafael", "CA", "US", 37.9735, -122.5311, 59162], ["Noblesville", "IN", "US", 40.0456, -86.0086, 59093], ["Marietta", "GA", "US", 33.9526, -84.5499, 59067], ["Fairfield", "CT", "US", 41.1412, -73.2637, 59052], ["Owensboro", "KY", "US", 37.7742, -87.1133, 59042], ["Eastvale", "CA", "US", 33.9636, -117.5642, 59039], ["Royal Oak", "MI", "US", 42.4895, -83.1446, 59008], ["Brentwood", "CA", "US", 37.9319, -121.6958, 58968], ["Dubuque", "IA", "US", 42.5006, -90.6646, 58799], ["Brookline", "MA", "US", 42.3318, -71.1212, 58732], ["Novi", "MI", "US", 42.4806, -83.4755, 58723], ["Des Plaines", "IL", "US", 42.0334, -87.8834, 58677], ["Orland Park", "IL", "US", 41.6303, -87.8539, 58619], ["Bartlett", "TN", "US", 35.2045, -89.874, 58579], ["Woodland", "CA", "US", 38.6785, -121.7733, 58567], ["New Westminster", "BC", "CA", 49.2068, -122.9109, 58549], ["Lehi", "UT", "US", 40.3916, -111.8508, 58486], ["White Plains", "NY", "US", 41.034, -73.7629, 58459], ["Arcadia", "CA", "US", 34.1397, -118.0353, 58408], ["Reston", "VA", "US", 38.9687, -77.3411, 58404], ["Ocala", "FL", "US", 29.1872, -82.1401, 58218], ["Central City", "AZ", "US", 33.44, -112.058, 58161], ["South Vineland", "NJ", "US", 39.446, -75.0288, 58122], ["Sanford", "FL", "US", 28.8006, -81.2731, 58111], ["Bowie", "MD", "US", 38.9428, -76.7303, 58025], ["Port Coquitlam", "BC", "CA", 49.2664, -122.7693, 58e3], ["Kokomo", "IN", "US", 40.4864, -86.1336, 57995], ["Wayne", "NJ", "US", 40.9254, -74.2765, 57915], ["Santee", "CA", "US", 32.8384, -116.9739, 57787], ["Dublin", "CA", "US", 37.7022, -121.9358, 57721], ["St. Albert", "AB", "CA", 53.6334, -113.6353, 57719], ["Palm Harbor", "FL", "US", 28.0781, -82.7637, 57439], ["Medford", "MA", "US", 42.4184, -71.1062, 57403], ["Midwest City", "OK", "US", 35.4495, -97.3967, 57249], ["Center City", "PA", "US", 39.9512, -75.1592, 57239], ["Margate", "FL", "US", 26.2445, -80.2064, 57234], ["South Whittier", "CA", "US", 33.9502, -118.0392, 57156], ["Tinley Park", "IL", "US", 41.5734, -87.7845, 57143], ["Pflugerville", "TX", "US", 30.4394, -97.62, 57122], ["New Brunswick", "NJ", "US", 40.4862, -74.4518, 57035], ["Grand Forks", "ND", "US", 47.9253, -97.0328, 57011], ["Fountain Valley", "CA", "US", 33.7092, -117.9537, 56987], ["North Hills", "CA", "US", 34.2364, -118.4847, 56946], ["Diamond Bar", "CA", "US", 34.0286, -117.8103, 56897], ["Taunton", "MA", "US", 41.9001, -71.0898, 56789], ["Oak Lawn", "IL", "US", 41.7109, -87.7581, 56781], ["Union", "NJ", "US", 40.6976, -74.2632, 56771], ["Ankeny", "IA", "US", 41.7297, -93.6058, 56764], ["Chicopee", "MA", "US", 42.1487, -72.6079, 56741], ["Irving Park", "IL", "US", 41.9534, -87.7365, 56520], ["Berwyn", "IL", "US", 41.8506, -87.7937, 56368], ["Manhattan", "KS", "US", 39.1836, -96.5717, 56308], ["Kendale Lakes", "FL", "US", 25.7082, -80.407, 56148], ["Smyrna", "GA", "US", 33.884, -84.5144, 56146], ["Dearborn Heights", "MI", "US", 42.337, -83.2733, 56145], ["Porterville", "CA", "US", 36.0652, -119.0168, 56058], ["Piscataway", "NJ", "US", 40.4993, -74.399, 56044], ["Doral", "FL", "US", 25.8195, -80.3553, 56035], ["Hendersonville", "TN", "US", 36.3048, -86.62, 56018], ["Morningside Heights", "NY", "US", 40.81, -73.9625, 55929], ["Rocky Mount", "NC", "US", 35.9382, -77.7905, 55806], ["Corvallis", "OR", "US", 44.5646, -123.262, 55780], ["Valdosta", "GA", "US", 30.8333, -83.2803, 55724], ["Hanford", "CA", "US", 36.3274, -119.6457, 55659], ["Castle Rock", "CO", "US", 39.3722, -104.8561, 55591], ["Greenwood", "IN", "US", 39.6137, -86.1067, 55586], ["Chicago Lawn", "IL", "US", 41.775, -87.6964, 55551], ["Hempstead", "NY", "US", 40.7062, -73.6187, 55547], ["Novato", "CA", "US", 38.1074, -122.5697, 55530], ["Kettering", "OH", "US", 39.6895, -84.1688, 55525], ["Bellevue", "NE", "US", 41.1367, -95.8908, 55510], ["Aurora", "ON", "CA", 44.0001, -79.4663, 55445], ["Shoreline", "WA", "US", 47.7557, -122.3415, 55439], ["Decatur", "AL", "US", 34.6059, -86.9833, 55437], ["Paramount", "CA", "US", 33.8895, -118.1598, 55412], ["Port Arthur", "TX", "US", 29.8852, -93.9423, 55340], ["Anderson", "IN", "US", 40.1053, -85.6803, 55305], ["Tamiami", "FL", "US", 25.7587, -80.3984, 55271], ["Towson", "MD", "US", 39.4015, -76.6019, 55197], ["North Chicopee", "MA", "US", 42.1834, -72.5995, 55179], ["Uptown", "IL", "US", 41.9659, -87.6526, 55137], ["Sarasota", "FL", "US", 27.3364, -82.5306, 55118], ["Sherwood Park", "AB", "CA", 53.5168, -113.3187, 55063], ["Saint-J\xE9r\xF4me", "QC", "CA", 45.7804, -74.0036, 54948], ["Cypress Hills", "NY", "US", 40.6771, -73.8912, 54944], ["West Haven", "CT", "US", 41.2707, -72.9471, 54927], ["Rosemead", "CA", "US", 34.0806, -118.0729, 54908], ["Edgewater", "IL", "US", 41.9834, -87.6639, 54873], ["Jackson", "NJ", "US", 39.7765, -74.8624, 54856], ["Highland", "CA", "US", 34.1283, -117.2087, 54854], ["Jonqui\xE8re", "QC", "CA", 48.4165, -71.2488, 54842], ["Mount Prospect", "IL", "US", 42.0664, -87.9373, 54747], ["Colton", "CA", "US", 34.0739, -117.3136, 54621], ["Encanto", "AZ", "US", 33.4794, -112.0782, 54614], ["Carson City", "NV", "US", 39.1638, -119.7674, 54521], ["Pocatello", "ID", "US", 42.8713, -112.4455, 54441], ["Bradenton", "FL", "US", 27.4989, -82.5748, 54437], ["Rogers Park", "IL", "US", 42.0086, -87.6667, 54402], ["Weymouth", "MA", "US", 42.2209, -70.9398, 54395], ["Port Charlotte", "FL", "US", 26.9762, -82.0906, 54392], ["Normal", "IL", "US", 40.5142, -88.9906, 54373], ["Spring", "TX", "US", 30.0799, -95.4172, 54298], ["Allapattah", "FL", "US", 25.8145, -80.2239, 54289], ["Richland", "WA", "US", 46.2857, -119.2845, 54248], ["Euless", "TX", "US", 32.8371, -97.082, 54219], ["Blue Springs", "MO", "US", 39.017, -94.2816, 54148], ["East Pensacola Heights", "FL", "US", 30.4288, -87.18, 54104], ["Hacienda Heights", "CA", "US", 33.9931, -117.9687, 54038], ["Ozone Park", "NY", "US", 40.6768, -73.8438, 53985], ["Granby", "QC", "CA", 45.4001, -72.7324, 53979], ["Briarwood", "NY", "US", 40.7094, -73.8153, 53877], ["Cathedral City", "CA", "US", 33.7797, -116.4653, 53826], ["Lakewood", "NJ", "US", 40.0979, -74.2176, 53805], ["Elyria", "OH", "US", 41.3684, -82.1077, 53775], ["Wheaton", "IL", "US", 41.8661, -88.107, 53715], ["Commerce City", "CO", "US", 39.8083, -104.9339, 53696], ["Hoboken", "NJ", "US", 40.744, -74.0324, 53635], ["Watsonville", "CA", "US", 36.9102, -121.7569, 53628], ["Lake Havasu City", "AZ", "US", 34.4839, -114.3225, 53553], ["Revere", "MA", "US", 42.4084, -71.012, 53422], ["West New York", "NJ", "US", 40.7879, -74.0143, 53366], ["Yucaipa", "CA", "US", 34.0336, -117.0431, 53328], ["Gilroy", "CA", "US", 37.0058, -121.5683, 53231], ["Pensacola", "FL", "US", 30.4213, -87.2169, 53193], ["Poinciana", "FL", "US", 28.1403, -81.4584, 53193], ["Kingsport", "TN", "US", 36.5484, -82.5618, 53014], ["Levittown", "PA", "US", 40.1551, -74.8288, 52983], ["Palm Beach Gardens", "FL", "US", 26.8234, -80.1386, 52923], ["Milford", "CT", "US", 41.2223, -73.0565, 52759], ["Delano", "CA", "US", 35.7688, -119.2471, 52733], ["West Sacramento", "CA", "US", 38.5805, -121.5302, 52721], ["Huntersville", "NC", "US", 35.4107, -80.8428, 52704], ["Perth Amboy", "NJ", "US", 40.5068, -74.2654, 52682], ["Sherman Oaks", "CA", "US", 34.1511, -118.4493, 52677], ["Southaven", "MS", "US", 34.989, -90.0126, 52589], ["Saint Peters", "MO", "US", 38.8003, -90.6265, 52575], ["Harrisonburg", "VA", "US", 38.4496, -78.8689, 52538], ["Peabody", "MA", "US", 42.5279, -70.9287, 52504], ["Placentia", "CA", "US", 33.8722, -117.8703, 52495], ["Lenexa", "KS", "US", 38.9536, -94.7336, 52490], ["DeSoto", "TX", "US", 32.5899, -96.8569, 52486], ["Burlington", "NC", "US", 36.0957, -79.4378, 52472], ["South Hill", "WA", "US", 47.1412, -122.2701, 52431], ["Elkhart", "IN", "US", 41.682, -85.9767, 52348], ["Fredericton", "NB", "CA", 45.9454, -66.6656, 52337], ["La Crosse", "WI", "US", 43.8014, -91.2396, 52306], ["Oak Park", "IL", "US", 41.885, -87.7845, 52287], ["Florissant", "MO", "US", 38.7892, -90.3226, 52268], ["Sammamish", "WA", "US", 47.6418, -122.0804, 52253], ["Wakefield", "NY", "US", 40.8979, -73.8524, 52201], ["Albany", "OR", "US", 44.6365, -123.1059, 52175], ["Hoffman Estates", "IL", "US", 42.0428, -88.0798, 52138], ["Albany Park", "IL", "US", 41.9684, -87.7234, 52079], ["Glendora", "CA", "US", 34.1361, -117.8653, 52009], ["Queens Village", "NY", "US", 40.7268, -73.7415, 51919], ["Brookhaven", "GA", "US", 33.8584, -84.3402, 51910], ["Levittown", "NY", "US", 40.7259, -73.5143, 51881], ["Palm Desert", "CA", "US", 33.7225, -116.377, 51869], ["Joplin", "MO", "US", 37.0842, -94.5133, 51818], ["Enid", "OK", "US", 36.3956, -97.8784, 51776], ["Bonita Springs", "FL", "US", 26.3398, -81.7787, 51704], ["Irondequoit", "NY", "US", 43.2134, -77.5797, 51692], ["Caldwell", "ID", "US", 43.6629, -116.6874, 51686], ["Minnetonka", "MN", "US", 44.9133, -93.5033, 51669], ["Pinellas Park", "FL", "US", 27.8428, -82.6995, 51617], ["Battle Creek", "MI", "US", 42.3173, -85.1782, 51589], ["Casa Grande", "AZ", "US", 32.8795, -111.7574, 51460], ["South Shore", "IL", "US", 41.762, -87.5778, 51451], ["Mott Haven", "NY", "US", 40.809, -73.9229, 51450], ["The Villages", "FL", "US", 28.9341, -81.9599, 51442], ["Grand Island", "NE", "US", 40.925, -98.342, 51440], ["Grapevine", "TX", "US", 32.9343, -97.0781, 51404], ["Stratford", "CT", "US", 41.1845, -73.1332, 51384], ["Kentwood", "MI", "US", 42.8695, -85.6448, 51357], ["City of Milford (balance)", "CT", "US", 41.2237, -73.0616, 51271], ["Tigard", "OR", "US", 45.4312, -122.7715, 51253], ["East Hartford", "CT", "US", 41.7823, -72.612, 51252], ["Apple Valley", "MN", "US", 44.7319, -93.2177, 51221], ["Plainfield", "NJ", "US", 40.6337, -74.4074, 51217], ["Leesburg", "VA", "US", 39.1157, -77.5636, 51209], ["Parsippany", "NJ", "US", 40.8579, -74.426, 51144], ["Coral Gables", "FL", "US", 25.7215, -80.2684, 51117], ["The Hammocks", "FL", "US", 25.6715, -80.4445, 51003], ["Buckeye", "AZ", "US", 33.3703, -112.5838, 50876], ["Flagami", "FL", "US", 25.7623, -80.3162, 50834], ["Catalina Foothills", "AZ", "US", 32.2978, -110.9187, 50796], ["Lakewood", "OH", "US", 41.482, -81.7982, 50656], ["North La Crosse", "WI", "US", 43.8464, -91.2482, 50470], ["Burien", "WA", "US", 47.4704, -122.3468, 50467], ["North Bay", "ON", "CA", 46.3168, -79.4663, 50396], ["Logan", "UT", "US", 41.7355, -111.8344, 50371], ["Welland", "ON", "CA", 42.9834, -79.2496, 50331], ["Saint-Hyacinthe", "QC", "CA", 45.6308, -72.957, 50326], ["Olympia", "WA", "US", 47.0379, -122.9007, 50302], ["South Peabody", "MA", "US", 42.5098, -70.9495, 50293], ["Aliso Viejo", "CA", "US", 33.565, -117.7271, 50195], ["Galveston", "TX", "US", 29.3013, -94.7977, 50180], ["Poway", "CA", "US", 32.9628, -117.0359, 50157], ["Edina", "MN", "US", 44.8897, -93.35, 50138], ["Minnetonka Mills", "MN", "US", 44.9411, -93.4419, 50117], ["Stonecrest", "GA", "US", 33.7085, -84.1349, 5e4], ["Cerritos", "CA", "US", 33.8584, -118.0648, 49975], ["Redford", "MI", "US", 42.3834, -83.2966, 49936], ["East Honolulu", "HI", "US", 21.2891, -157.7173, 49914], ["Troy", "NY", "US", 42.7284, -73.6918, 49906], ["Sunnyside", "NY", "US", 40.7398, -73.9354, 49833], ["Charleston", "WV", "US", 38.3498, -81.6326, 49736], ["Wharton", "PA", "US", 39.9268, -75.1571, 49732], ["Whitman", "PA", "US", 39.9168, -75.1555, 49732], ["Downers Grove", "IL", "US", 41.8089, -88.0112, 49732], ["Azusa", "CA", "US", 34.1336, -117.9076, 49690], ["Wilson", "NC", "US", 35.7213, -77.9155, 49643], ["Monroe", "LA", "US", 32.5093, -92.1193, 49598], ["Parker", "CO", "US", 39.5186, -104.7614, 49550], ["La Mirada", "CA", "US", 33.9172, -118.012, 49520], ["Belleville", "ON", "CA", 44.1668, -77.3828, 49454], ["Minot", "ND", "US", 48.2325, -101.2963, 49450], ["Aloha", "OR", "US", 45.4943, -122.8671, 49425], ["Saginaw", "MI", "US", 43.4195, -83.9508, 49347], ["Bedford", "TX", "US", 32.844, -97.1431, 49337], ["Rancho Santa Margarita", "CA", "US", 33.6409, -117.6031, 49324], ["Cypress", "CA", "US", 33.817, -118.0373, 49290], ["Murray", "UT", "US", 40.6669, -111.888, 49250], ["Cuyahoga Falls", "OH", "US", 41.1339, -81.4846, 49146], ["Coeur d'Alene", "ID", "US", 47.6777, -116.7805, 49122], ["Bloomfield", "NJ", "US", 40.8068, -74.1854, 49120], ["Harrisburg", "PA", "US", 40.2737, -76.8844, 49081], ["Rowland Heights", "CA", "US", 33.9761, -117.9053, 48993], ["Covina", "CA", "US", 34.09, -117.8903, 48984], ["Stillwater", "OK", "US", 36.1156, -97.0584, 48967], ["Dollard-Des Ormeaux", "QC", "CA", 45.4945, -73.8242, 48930], ["Niagara Falls", "NY", "US", 43.0945, -79.0567, 48916], ["Collierville", "TN", "US", 35.042, -89.6645, 48863], ["Summerville", "SC", "US", 33.0185, -80.1757, 48848], ["South Bel Air", "MD", "US", 39.5332, -76.3375, 48828], ["Cornwall", "ON", "CA", 45.0181, -74.7281, 48821], ["Sheboygan", "WI", "US", 43.7508, -87.7145, 48797], ["Middletown", "OH", "US", 39.5151, -84.3983, 48760], ["Aspen Hill", "MD", "US", 39.0795, -77.073, 48759], ["Dunwoody", "GA", "US", 33.9462, -84.3346, 48733], ["Huntington", "WV", "US", 38.4192, -82.4451, 48638], ["Maricopa", "AZ", "US", 33.0581, -112.0476, 48602], ["Roswell", "NM", "US", 33.3944, -104.5249, 48544], ["Cedar Hill", "TX", "US", 32.5885, -96.9561, 48507], ["East Brunswick", "NJ", "US", 40.4279, -74.416, 48495], ["East Lansing", "MI", "US", 42.737, -84.4839, 48471], ["Apopka", "FL", "US", 28.6762, -81.5119, 48382], ["Maspeth", "NY", "US", 40.7232, -73.9126, 48325], ["Wheaton", "MD", "US", 39.0398, -77.0553, 48284], ["Mishawaka", "IN", "US", 41.662, -86.1586, 48261], ["Portage", "MI", "US", 42.2011, -85.58, 48177], ["West Orange", "NJ", "US", 40.7987, -74.239, 48131], ["McLean", "VA", "US", 38.9343, -77.1775, 48115], ["Vernon", "BC", "CA", 50.0261, -126.3616, 48073], ["North Vancouver", "BC", "CA", 49.3164, -123.0693, 48e3], ["Newark", "OH", "US", 40.0581, -82.4013, 47986], ["Ceres", "CA", "US", 37.5949, -120.9577, 47963], ["Alexandria", "LA", "US", 31.3113, -92.4451, 47889], ["Chesterfield", "MO", "US", 38.6631, -90.5771, 47864], ["Barnstable", "MA", "US", 41.7001, -70.2995, 47821], ["Salina", "KS", "US", 38.8403, -97.6114, 47813], ["Lawrence", "IN", "US", 39.8387, -86.0253, 47809], ["Bel Air South", "MD", "US", 39.5051, -76.3198, 47709], ["Pearl City", "HI", "US", 21.3973, -157.9752, 47698], ["Euclid", "OH", "US", 41.5931, -81.5268, 47676], ["Roseville", "MI", "US", 42.4973, -82.9371, 47637], ["Texas City", "TX", "US", 29.3838, -94.9027, 47618], ["Wauwatosa", "WI", "US", 43.0495, -88.0076, 47614], ["Florin", "CA", "US", 38.496, -121.4088, 47513], ["Twin Falls", "ID", "US", 42.563, -114.4609, 47468], ["Glenview", "IL", "US", 42.0697, -87.7878, 47446], ["East Providence", "RI", "US", 41.8137, -71.3701, 47408], ["Palm Springs", "CA", "US", 33.8303, -116.5453, 47371], ["San Luis Obispo", "CA", "US", 35.2828, -120.6596, 47339], ["Vernon", "BC", "CA", 50.2673, -119.2734, 47274], ["Methuen", "MA", "US", 42.7262, -71.1909, 47255], ["Mission District", "CA", "US", 37.7599, -122.4191, 47234], ["Country Club", "FL", "US", 25.9481, -80.317, 47105], ["Madison", "AL", "US", 34.6993, -86.7483, 46962], ["Jeffersonville", "IN", "US", 38.2776, -85.7372, 46960], ["San Jacinto", "CA", "US", 33.7839, -116.9586, 46951], ["Mentor", "OH", "US", 41.6662, -81.3396, 46901], ["Mansfield", "OH", "US", 40.7584, -82.5155, 46830], ["Hattiesburg", "MS", "US", 31.3271, -89.2903, 46805], ["Draper", "UT", "US", 40.5247, -111.8638, 46774], ["Middletown", "CT", "US", 41.5623, -72.6506, 46756], ["Wylie", "TX", "US", 33.0151, -96.5389, 46708], ["Columbus", "IN", "US", 39.2014, -85.9214, 46690], ["Laguna", "CA", "US", 38.421, -121.4238, 46621], ["Smyrna", "TN", "US", 35.9828, -86.5186, 46607], ["Charlottesville", "VA", "US", 38.0293, -78.4767, 46597], ["Blainville", "QC", "CA", 45.6668, -73.8825, 46493], ["Lincoln", "CA", "US", 38.8916, -121.293, 46474], ["Lacey", "WA", "US", 47.0343, -122.8232, 46409], ["Littleton", "CO", "US", 39.6133, -105.0166, 46368], ["Beavercreek", "OH", "US", 39.7092, -84.0633, 46277], ["Kannapolis", "NC", "US", 35.4874, -80.6217, 46144], ["Everett", "MA", "US", 42.4084, -71.0537, 46050], ["Binghamton", "NY", "US", 42.0987, -75.918, 46032], ["Cypress", "TX", "US", 29.9691, -95.6972, 46025], ["Elmhurst", "IL", "US", 41.8995, -87.9403, 45957], ["Hell's Kitchen", "NY", "US", 40.765, -73.9909, 45884], ["Auburn Gresham", "IL", "US", 41.7418, -87.6532, 45842], ["City of Sammamish", "WA", "US", 47.6044, -122.0377, 45780], ["Antelope", "CA", "US", 38.7082, -121.3299, 45770], ["Keller", "TX", "US", 32.9346, -97.2517, 45758], ["Biloxi", "MS", "US", 30.396, -88.8853, 45637], ["Apex", "NC", "US", 35.7326, -78.8503, 45585], ["West Lafayette", "IN", "US", 40.4259, -86.9081, 45550], ["Titusville", "FL", "US", 28.6122, -80.8076, 45393], ["Altoona", "PA", "US", 40.5187, -78.3947, 45344], ["Newark", "CA", "US", 37.5297, -122.0402, 45336], ["Saint Louis Park", "MN", "US", 44.9483, -93.348, 45250], ["Enfield", "CT", "US", 41.9762, -72.5918, 45212], ["Dublin", "OH", "US", 40.0992, -83.1141, 45098], ["Tuckahoe", "VA", "US", 37.5902, -77.5564, 44990], ["Potomac", "MD", "US", 39.0182, -77.2086, 44965], ["Cleveland Heights", "OH", "US", 41.52, -81.5562, 44962], ["Sayreville", "NJ", "US", 40.4593, -74.361, 44920], ["Cutler Bay", "FL", "US", 25.5783, -80.3377, 44865], ["Hackensack", "NJ", "US", 40.8859, -74.0435, 44834], ["Pine Bluff", "AR", "US", 34.2284, -92.0032, 44772], ["West Seneca", "NY", "US", 42.8501, -78.7998, 44711], ["Strongsville", "OH", "US", 41.3145, -81.8357, 44668], ["Coachella", "CA", "US", 33.6803, -116.1739, 44635], ["Penn Hills", "PA", "US", 40.5012, -79.8392, 44610], ["Encino", "CA", "US", 34.1592, -118.5012, 44581], ["West End", "BC", "CA", 49.2833, -123.1333, 44560], ["Bentonville", "AR", "US", 36.3728, -94.2088, 44499], ["Fort Pierce", "FL", "US", 27.4467, -80.3256, 44484], ["Bridgewater", "NJ", "US", 40.6008, -74.6482, 44464], ["Danville", "CA", "US", 37.8216, -122, 44400], ["Oakland Park", "FL", "US", 26.1723, -80.132, 44319], ["Attleboro", "MA", "US", 41.9445, -71.2856, 44284], ["Severn", "MD", "US", 39.1371, -76.6983, 44231], ["Blacksburg", "VA", "US", 37.2296, -80.4139, 44215], ["Haltom City", "TX", "US", 32.7996, -97.2692, 44206], ["Brighton Park", "IL", "US", 41.8189, -87.6989, 44202], ["Lompoc", "CA", "US", 34.6392, -120.4579, 44164], ["Wesley Chapel", "FL", "US", 28.2397, -82.3279, 44092], ["Urbandale", "IA", "US", 41.6267, -93.7122, 44062], ["York", "PA", "US", 39.9626, -76.7277, 43992], ["North Miami Beach", "FL", "US", 25.9332, -80.1625, 43971], ["El Centro", "CA", "US", 32.792, -115.5631, 43956], ["Rego Park", "NY", "US", 40.7265, -73.8526, 43925], ["Cleveland", "TN", "US", 35.1595, -84.8766, 43898], ["Echo Park", "CA", "US", 34.0781, -118.2607, 43832], ["North Bethesda", "MD", "US", 39.0446, -77.1189, 43828], ["Beaumont", "CA", "US", 33.9295, -116.9772, 43811], ["Lombard", "IL", "US", 41.88, -88.0078, 43797], ["Bountiful", "UT", "US", 40.8894, -111.8808, 43784], ["North Lauderdale", "FL", "US", 26.2173, -80.2259, 43703], ["Burleson", "TX", "US", 32.5421, -97.3208, 43625], ["Ocoee", "FL", "US", 28.5692, -81.544, 43608], ["Oro Valley", "AZ", "US", 32.3909, -110.9665, 43565], ["Chatham", "ON", "CA", 42.4122, -82.1849, 43550], ["Ashburn", "VA", "US", 39.0437, -77.4875, 43511], ["Augusta", "GA", "US", 33.471, -81.9748, 43459], ["Bozeman", "MT", "US", 45.6797, -111.0386, 43405], ["Sierra Vista", "AZ", "US", 31.5545, -110.3037, 43355], ["Freeport", "NY", "US", 40.6576, -73.5832, 43334], ["Pittsfield", "MA", "US", 42.4501, -73.2454, 43303], ["Hilo", "HI", "US", 19.7299, -155.0907, 43263], ["West Babylon", "NY", "US", 40.7182, -73.3543, 43213], ["DeKalb", "IL", "US", 41.9295, -88.7504, 43211], ["San Bruno", "CA", "US", 37.6305, -122.4111, 43185], ["Jefferson City", "MO", "US", 38.5767, -92.1735, 43169], ["Altamonte Springs", "FL", "US", 28.6611, -81.3656, 43159], ["Bell Gardens", "CA", "US", 33.9653, -118.1515, 43106], ["Timmins", "ON", "CA", 48.4669, -81.3331, 42997], ["Morgan Hill", "CA", "US", 37.1305, -121.6544, 42948], ["Bothell", "WA", "US", 47.7623, -122.2054, 42939], ["Fond du Lac", "WI", "US", 43.775, -88.4388, 42933], ["Sicklerville", "NJ", "US", 39.7173, -74.9693, 42891], ["Sayreville Junction", "NJ", "US", 40.4654, -74.3304, 42890], ["Farmington", "NM", "US", 36.7281, -108.2187, 42871], ["Salem", "MA", "US", 42.5195, -70.8967, 42869], ["Arlington", "MA", "US", 42.4154, -71.1564, 42844], ["La Jolla", "CA", "US", 32.8473, -117.2742, 42808], ["Ch\xE2teauguay", "QC", "CA", 45.3834, -73.7492, 42786], ["Altadena", "CA", "US", 34.1897, -118.1312, 42777], ["Fairfield", "OH", "US", 39.3459, -84.5605, 42767], ["Ashburn", "IL", "US", 41.7475, -87.7112, 42752], ["Rancho Palos Verdes", "CA", "US", 33.7445, -118.387, 42732], ["Quinte West", "ON", "CA", 44.1834, -77.5662, 42697], ["West Vancouver", "BC", "CA", 49.3667, -123.1665, 42694], ["North Highlands", "CA", "US", 38.6857, -121.3722, 42694], ["Moline", "IL", "US", 41.5067, -90.5151, 42681], ["Concord", "NH", "US", 43.2081, -71.5376, 42620], ["East Concord", "NH", "US", 43.242, -71.5381, 42605], ["Rockwall", "TX", "US", 32.9312, -96.4597, 42566], ["Plainfield", "IL", "US", 41.627, -88.204, 42527], ["Burlington", "VT", "US", 44.4759, -73.2121, 42452], ["Rohnert Park", "CA", "US", 38.3396, -122.7011, 42407], ["Charlottetown", "PE", "CA", 46.2346, -63.1256, 42402], ["Urbana", "IL", "US", 40.1106, -88.2073, 42311], ["Southglenn", "CO", "US", 39.5872, -104.9528, 42268], ["Rimouski", "QC", "CA", 48.4488, -68.524, 42240], ["Midland", "MI", "US", 43.6156, -84.2472, 42200], ["Prescott Valley", "AZ", "US", 34.61, -112.3157, 42197], ["State College", "PA", "US", 40.7934, -77.86, 42161], ["Kearny", "NJ", "US", 40.7684, -74.1454, 42137], ["El Dorado Hills", "CA", "US", 38.6857, -121.0822, 42108], ["Danville", "VA", "US", 36.586, -79.395, 42082], ["Saint-Eustache", "QC", "CA", 45.565, -73.9055, 42062], ["Belleville", "IL", "US", 38.52, -89.984, 42034], ["Linden", "NJ", "US", 40.6221, -74.2446, 42021], ["Moorhead", "MN", "US", 46.8739, -96.7695, 42005], ["Woodside", "NY", "US", 40.7454, -73.9054, 41981], ["Brea", "CA", "US", 33.9167, -117.9001, 41944], ["Riverton", "UT", "US", 40.5219, -111.9391, 41900], ["Prescott", "AZ", "US", 34.54, -112.4685, 41899], ["Mount Laurel", "NJ", "US", 39.934, -74.891, 41864], ["The Colony", "TX", "US", 33.089, -96.8864, 41779], ["Manassas", "VA", "US", 38.751, -77.4753, 41764], ["Brentwood", "TN", "US", 36.0331, -86.7828, 41763], ["Westfield", "MA", "US", 42.1251, -72.7495, 41690], ["Sorel-Tracy", "QC", "CA", 46.0418, -73.1136, 41629], ["Hutchinson", "KS", "US", 38.0608, -97.9298, 41569], ["Leominster", "MA", "US", 42.5251, -71.7598, 41569], ["Catonsville", "MD", "US", 39.2721, -76.7319, 41567], ["Hicksville", "NY", "US", 40.7684, -73.5251, 41547], ["Bartlett", "IL", "US", 41.995, -88.1856, 41545], ["Buffalo Grove", "IL", "US", 42.1514, -87.9598, 41496], ["Woonsocket", "RI", "US", 42.0029, -71.5148, 41475], ["Grande Prairie", "AB", "CA", 55.1667, -118.8027, 41462], ["West Hills", "CA", "US", 34.1973, -118.644, 41426], ["Edmonds", "WA", "US", 47.8107, -122.3774, 41375], ["Marana", "AZ", "US", 32.4367, -111.2254, 41315], ["Shelton", "CT", "US", 41.3165, -73.0932, 41296], ["Cedar Falls", "IA", "US", 42.5278, -92.4455, 41255], ["Chatsworth", "CA", "US", 34.2572, -118.6012, 41255], ["Gage Park", "IL", "US", 41.795, -87.6962, 41202], ["Beverly", "MA", "US", 42.5584, -70.88, 41186], ["University", "FL", "US", 28.0739, -82.439, 41163], ["Coppell", "TX", "US", 32.9546, -97.015, 41159], ["Findlay", "OH", "US", 41.0442, -83.6499, 41149], ["Campbell", "CA", "US", 37.2872, -121.95, 41117], ["Lake Ridge", "VA", "US", 38.6879, -77.2978, 41058], ["Burke", "VA", "US", 38.7934, -77.2716, 41055], ["Mankato", "MN", "US", 44.1591, -94.0092, 41044], ["Annandale", "VA", "US", 38.8304, -77.1964, 41008], ["Covington", "KY", "US", 39.0837, -84.5085, 40997], ["New City", "IL", "US", 41.8075, -87.6564, 40997], ["Morris Heights", "NY", "US", 40.8498, -73.9199, 40982], ["Peachtree Corners", "GA", "US", 33.9701, -84.2216, 40978], ["South Valley", "NM", "US", 35.01, -106.6781, 40976], ["Ormond Beach", "FL", "US", 29.2858, -81.0559, 40970], ["Carrollwood Village", "FL", "US", 28.0675, -82.5209, 40949], ["Huntsville", "TX", "US", 30.7235, -95.5508, 40938], ["Venice", "CA", "US", 33.9908, -118.4601, 40885], ["Sumter", "SC", "US", 33.9204, -80.3415, 40816], ["Quincy", "IL", "US", 39.9356, -91.4099, 40780], ["Wilkes-Barre", "PA", "US", 41.2459, -75.8813, 40780], ["Lincoln Square", "IL", "US", 41.9759, -87.6892, 40761], ["La Puente", "CA", "US", 34.02, -117.9495, 40745], ["Holyoke", "MA", "US", 42.2043, -72.6162, 40684], ["Sherman", "TX", "US", 33.6357, -96.6089, 40667], ["Goose Creek", "SC", "US", 32.981, -80.0326, 40633], ["Maplewood", "MN", "US", 44.953, -92.9952, 40567], ["Streamwood", "IL", "US", 42.0256, -88.1784, 40554], ["Fitchburg", "MA", "US", 42.5834, -71.8023, 40545], ["Hilton Head Island", "SC", "US", 32.1938, -80.7382, 40512], ["La Quinta", "CA", "US", 33.6634, -116.31, 40476], ["North Atlanta", "GA", "US", 33.8651, -84.3366, 40456], ["Crystal Lake", "IL", "US", 42.2411, -88.3162, 40448], ["Hagerstown", "MD", "US", 39.6418, -77.72, 40432], ["San Gabriel", "CA", "US", 34.0961, -118.1058, 40424], ["Woodstock", "ON", "CA", 43.1334, -80.7497, 40404], ["Hickory", "NC", "US", 35.7332, -81.3412, 40374], ["Beverly Cove", "MA", "US", 42.5534, -70.8537, 40365], ["Winter Garden", "FL", "US", 28.5653, -81.5862, 40356], ["Carol Stream", "IL", "US", 41.9125, -88.1348, 40356], ["Warren", "OH", "US", 41.2376, -80.8184, 40245], ["Marlboro", "NJ", "US", 40.3154, -74.2463, 40191], ["Teaneck", "NJ", "US", 40.8976, -74.016, 40078], ["Calexico", "CA", "US", 32.679, -115.4989, 40053], ["Florence", "AL", "US", 34.7998, -87.6773, 40026], ["St. Johns", "FL", "US", 30.0815, -81.5477, 4e4], ["Shakopee", "MN", "US", 44.798, -93.5269, 39981], ["Billerica", "MA", "US", 42.5584, -71.269, 39904], ["Norwich", "CT", "US", 41.5243, -72.0759, 39899], ["Amherst", "MA", "US", 42.3672, -72.5185, 39833], ["Duncanville", "TX", "US", 32.6518, -96.9083, 39826], ["New Berlin", "WI", "US", 42.9764, -88.1084, 39825], ["Marlborough", "MA", "US", 42.3459, -71.5523, 39818], ["Oakley", "CA", "US", 37.9974, -121.7125, 39813], ["Lancaster", "OH", "US", 39.7137, -82.5993, 39766], ["Avondale", "IL", "US", 41.9389, -87.7112, 39721], ["Romeoville", "IL", "US", 41.6475, -88.0895, 39719], ["Culver City", "CA", "US", 34.0211, -118.3965, 39717], ["Montclair", "NJ", "US", 40.8259, -74.209, 39701], ["Meridian", "MS", "US", 32.3643, -88.7037, 39661], ["Puyallup", "WA", "US", 47.1854, -122.2929, 39659], ["Woburn", "MA", "US", 42.4793, -71.1523, 39555], ["Bremerton", "WA", "US", 47.5673, -122.6326, 39520], ["Hallandale Beach", "FL", "US", 25.9812, -80.1484, 39488], ["Clovis", "NM", "US", 34.4048, -103.2052, 39480], ["Annapolis", "MD", "US", 38.9786, -76.4918, 39474], ["Weslaco", "TX", "US", 26.1595, -97.9908, 39474], ["Cape Girardeau", "MO", "US", 37.3059, -89.5182, 39462], ["Bullhead City", "AZ", "US", 35.1478, -114.5683, 39445], ["North Fort Myers", "FL", "US", 26.6673, -81.8801, 39407], ["Chelsea", "MA", "US", 42.3918, -71.0328, 39398], ["Grove City", "OH", "US", 39.8815, -83.093, 39388], ["Essex", "MD", "US", 39.3093, -76.475, 39262], ["Atlantic City", "NJ", "US", 39.3642, -74.4231, 39260], ["Pacifica", "CA", "US", 37.6138, -122.4869, 39260], ["Germantown", "TN", "US", 35.0868, -89.8101, 39240], ["Northglenn", "CO", "US", 39.8855, -104.9872, 39197], ["Far Rockaway", "NY", "US", 40.6054, -73.7551, 39189], ["Kensington", "NY", "US", 40.6462, -73.9707, 39120], ["Coram", "NY", "US", 40.8687, -73.0015, 39113], ["Wausau", "WI", "US", 44.9591, -89.6301, 39094], ["Boucherville", "QC", "CA", 45.591, -73.436, 39062], ["Hurst", "TX", "US", 32.8235, -97.1706, 39016], ["Stanton", "CA", "US", 33.8025, -117.9931, 38872], ["Lancaster", "TX", "US", 32.5921, -96.7561, 38801], ["Friendswood", "TX", "US", 29.5294, -95.201, 38800], ["Gainesville", "GA", "US", 34.2979, -83.8241, 38712], ["The Acreage", "FL", "US", 26.794, -80.2675, 38704], ["Montclair", "CA", "US", 34.0775, -117.6898, 38690], ["Salaberry-de-Valleyfield", "QC", "CA", 45.2501, -74.1325, 38662], ["Kailua", "HI", "US", 21.4024, -157.7405, 38635], ["Rock Island", "IL", "US", 41.5095, -90.5787, 38620], ["Whitney", "NV", "US", 36.0983, -115.0363, 38585], ["Oviedo", "FL", "US", 28.67, -81.2081, 38551], ["Carpentersville", "IL", "US", 42.1211, -88.2579, 38512], ["Lake Oswego", "OR", "US", 45.4207, -122.6706, 38496], ["Muskogee", "OK", "US", 35.7479, -95.3697, 38456], ["Hobbs", "NM", "US", 32.7026, -103.136, 38416], ["Muskegon", "MI", "US", 43.2342, -86.2484, 38401], ["Westerville", "OH", "US", 40.1262, -82.9291, 38384], ["Little Elm", "TX", "US", 33.1626, -96.9375, 38341], ["Hanover Park", "IL", "US", 41.9995, -88.1451, 38333], ["Channelview", "TX", "US", 29.7761, -95.1146, 38289], ["Panama City", "FL", "US", 30.1595, -85.6598, 38286], ["Florence", "SC", "US", 34.1954, -79.7626, 38228], ["Waipahu", "HI", "US", 21.3867, -158.0092, 38216], ["Shawinigan", "QC", "CA", 46.5667, -72.7491, 38211], ["Wake Forest", "NC", "US", 35.9799, -78.5097, 38199], ["Huber Heights", "OH", "US", 39.8439, -84.1247, 38176], ["Martinez", "CA", "US", 38.0194, -122.1341, 38137], ["East Meadow", "NY", "US", 40.714, -73.559, 38132], ["Hanover", "MD", "US", 39.1929, -76.7241, 38088], ["Wheeling", "IL", "US", 42.1392, -87.929, 38079], ["Apache Junction", "AZ", "US", 33.4151, -111.5496, 38074], ["Pleasant Grove", "UT", "US", 40.3641, -111.7385, 38052], ["Brookfield", "WI", "US", 43.0606, -88.1065, 38025], ["Delaware", "OH", "US", 40.2987, -83.068, 37995], ["Roy", "UT", "US", 41.1616, -112.0263, 37964], ["Valley Stream", "NY", "US", 40.6643, -73.7085, 37962], ["Schertz", "TX", "US", 29.5522, -98.2697, 37938], ["Spanish Fork", "UT", "US", 40.115, -111.6549, 37935], ["Keizer", "OR", "US", 44.9901, -123.0262, 37895], ["Leander", "TX", "US", 30.5788, -97.8531, 37889], ["Woodlawn", "MD", "US", 39.3229, -76.728, 37879], ["Lima", "OH", "US", 40.7426, -84.1052, 37873], ["Spartanburg", "SC", "US", 34.9496, -81.9321, 37867], ["Park Ridge", "IL", "US", 42.0111, -87.8406, 37757], ["Penticton", "BC", "CA", 49.4806, -119.5858, 37721], ["Winter Haven", "FL", "US", 28.0222, -81.7329, 37689], ["Aventura", "FL", "US", 25.9565, -80.1392, 37649], ["Severna Park", "MD", "US", 39.0704, -76.5452, 37634], ["Royal Palm Beach", "FL", "US", 26.7084, -80.2306, 37633], ["Brighton", "CO", "US", 39.9853, -104.8205, 37585], ["Phenix City", "AL", "US", 32.471, -85.0008, 37570], ["Milton", "GA", "US", 34.1322, -84.3007, 37547], ["Dover", "DE", "US", 39.1582, -75.5244, 37522], ["Sun City", "AZ", "US", 33.5975, -112.2718, 37499], ["Lake Worth", "FL", "US", 26.6171, -80.0723, 37498], ["Kew Gardens Hills", "NY", "US", 40.73, -73.8234, 37479], ["Jamaica Plain", "MA", "US", 42.3098, -71.1203, 37468], ["Monrovia", "CA", "US", 34.1481, -117.9989, 37463], ["Hollister", "CA", "US", 36.8524, -121.4016, 37462], ["Los Banos", "CA", "US", 37.0583, -120.8499, 37457], ["Plant City", "FL", "US", 28.0189, -82.1147, 37406], ["Greenfield", "WI", "US", 42.9614, -88.0126, 37349], ["Marion", "IA", "US", 42.0342, -91.5977, 37330], ["Braintree", "MA", "US", 42.2038, -71.0022, 37297], ["Newnan", "GA", "US", 33.3807, -84.7997, 37291], ["Texarkana", "TX", "US", 33.4251, -94.0477, 37280], ["Addison", "IL", "US", 41.9317, -87.989, 37208], ["Reynoldsburg", "OH", "US", 39.9548, -82.8121, 37158], ["South Jordan Heights", "UT", "US", 40.5638, -111.9494, 37141], ["Odenton", "MD", "US", 39.084, -76.7002, 37132], ["Mableton", "GA", "US", 33.8187, -84.5824, 37115], ["Hilton Head", "SC", "US", 32.2163, -80.7526, 37099], ["Grants Pass", "OR", "US", 42.4393, -123.3307, 37088], ["Indian Trail", "NC", "US", 35.0768, -80.6692, 37073], ["Calumet City", "IL", "US", 41.6156, -87.5295, 37031], ["Lincoln Park", "MI", "US", 42.2506, -83.1785, 37012], ["Lynnwood", "WA", "US", 47.8209, -122.3151, 36997], ["Whitestone", "NY", "US", 40.7946, -73.8185, 36984], ["Beloit", "WI", "US", 42.5084, -89.0318, 36891], ["Belleville", "NJ", "US", 40.7937, -74.1501, 36878], ["Longview", "WA", "US", 46.1382, -122.9382, 36848], ["Columbia", "TN", "US", 35.6151, -87.0353, 36800], ["Portage", "IN", "US", 41.5759, -87.1762, 36738], ["Westfield", "IN", "US", 40.0428, -86.1275, 36738], ["New Albany", "IN", "US", 38.2856, -85.8241, 36732], ["Fort Lee", "NJ", "US", 40.8509, -73.9701, 36672], ["Brighton", "NY", "US", 43.1476, -77.5506, 36609], ["Bartlesville", "OK", "US", 36.7473, -95.9808, 36595], ["Ewing", "NJ", "US", 40.2698, -74.7999, 36559], ["San Juan", "TX", "US", 26.1892, -98.1553, 36556], ["Woodhaven", "NY", "US", 40.6893, -73.8579, 36555], ["Mission Bend", "TX", "US", 29.6938, -95.665, 36501], ["San Juan Capistrano", "CA", "US", 33.5017, -117.6625, 36454], ["Pahrump", "NV", "US", 36.2083, -115.9839, 36441], ["Saint Charles", "MD", "US", 38.6032, -76.9386, 36376], ["Temple City", "CA", "US", 34.1072, -118.0579, 36365], ["Marion", "OH", "US", 40.5887, -83.1285, 36363], ["Mechanicsville", "VA", "US", 37.6088, -77.3733, 36348], ["Lufkin", "TX", "US", 31.3382, -94.7291, 36333], ["Pennsauken", "NJ", "US", 39.9562, -75.058, 36332], ["Rome", "GA", "US", 34.257, -85.1647, 36323], ["Claremont", "CA", "US", 34.0967, -117.7198, 36283], ["Franklin", "WI", "US", 42.8886, -88.0384, 36222], ["West Hollywood", "CA", "US", 34.09, -118.3617, 36222], ["Richfield", "MN", "US", 44.8833, -93.283, 36216], ["Bell", "CA", "US", 33.9775, -118.187, 36205], ["Lewiston", "ME", "US", 44.1003, -70.2148, 36202], ["Dunedin", "FL", "US", 28.0199, -82.7732, 36164], ["Kendall West", "FL", "US", 25.7065, -80.4388, 36154], ["Del Rio", "TX", "US", 29.3627, -100.8968, 36153], ["Oakville", "MO", "US", 38.4701, -90.3046, 36143], ["Spruce Grove", "AB", "CA", 53.5334, -113.9187, 36135], ["Commack", "NY", "US", 40.8429, -73.2929, 36124], ["Menomonee Falls", "WI", "US", 43.1789, -88.1173, 36119], ["St. Thomas", "ON", "CA", 42.7736, -81.1804, 36110], ["Moorpark", "CA", "US", 34.2856, -118.882, 36104], ["Gadsden", "AL", "US", 34.0143, -86.0064, 36084], ["Issaquah", "WA", "US", 47.5301, -122.0326, 36081], ["Spring Hill", "TN", "US", 35.7512, -86.93, 36055], ["Trumbull", "CT", "US", 41.2429, -73.2007, 36018], ["Olive Branch", "MS", "US", 34.9618, -89.8295, 36010], ["Mooresville", "NC", "US", 35.5849, -80.8101, 36009], ["West Torrington", "CT", "US", 41.8184, -73.1437, 36e3], ["Willowbrook", "CA", "US", 33.917, -118.2551, 35983], ["Leavenworth", "KS", "US", 39.3111, -94.9225, 35980], ["Clinton", "MD", "US", 38.7651, -76.8983, 35970], ["Cottage Grove", "MN", "US", 44.8277, -92.9438, 35918], ["Wildwood", "MO", "US", 38.5828, -90.6629, 35899], ["Richmond", "IN", "US", 39.8289, -84.8902, 35854], ["Oregon City", "OR", "US", 45.3573, -122.6068, 35831], ["Goldsboro", "NC", "US", 35.3849, -77.9928, 35826], ["Manhattan Beach", "CA", "US", 33.8847, -118.4109, 35818], ["Parkland", "WA", "US", 47.1554, -122.434, 35803], ["Martinez", "GA", "US", 33.5174, -82.0757, 35795], ["East Florence", "AL", "US", 34.8095, -87.6495, 35733], ["Kyle", "TX", "US", 29.9891, -97.8772, 35733], ["Kearns", "UT", "US", 40.66, -111.9963, 35731], ["Linton Hall", "VA", "US", 38.7598, -77.575, 35725], ["South Miami Heights", "FL", "US", 25.5976, -80.3806, 35696], ["Tupelo", "MS", "US", 34.2581, -88.7046, 35680], ["Hot Springs", "AR", "US", 34.5037, -93.0552, 35635], ["Wildomar", "CA", "US", 33.5989, -117.28, 35632], ["Wentzville", "MO", "US", 38.8114, -90.8529, 35603], ["Roseville", "MN", "US", 45.0061, -93.1566, 35580], ["Valrico", "FL", "US", 27.9379, -82.2364, 35545], ["Coventry", "RI", "US", 41.7001, -71.6828, 35525], ["Rosenberg", "TX", "US", 29.5572, -95.8086, 35510], ["Bettendorf", "IA", "US", 41.5245, -90.5157, 35505], ["Rock Forest", "QC", "CA", 45.357, -71.9968, 35500], ["East Point", "GA", "US", 33.6795, -84.4394, 35467], ["Prattville", "AL", "US", 32.464, -86.4597, 35420], ["Ponte Vedra Beach", "FL", "US", 30.2397, -81.3856, 35400], ["Boardman", "OH", "US", 41.0242, -80.6629, 35376], ["Cooper City", "FL", "US", 26.0573, -80.2717, 35364], ["Oxon Hill-Glassmanor", "MD", "US", 38.7961, -76.975, 35355], ["Egypt Lake-Leto", "FL", "US", 28.0177, -82.5062, 35282], ["North Lawndale", "IL", "US", 41.86, -87.7184, 35276], ["Oak Creek", "WI", "US", 42.8858, -87.8631, 35243], ["Peachtree City", "GA", "US", 33.3968, -84.5958, 35240], ["Merrillville", "IN", "US", 41.4828, -87.3328, 35224], ["Hot Springs National Park", "AR", "US", 34.5317, -93.0638, 35193], ["Saint Cloud", "FL", "US", 28.2489, -81.2812, 35183], ["La Porte", "TX", "US", 29.6658, -95.0194, 35148], ["Prince Albert", "SK", "CA", 53.2001, -105.7677, 35102], ["University City", "MO", "US", 38.6559, -90.3093, 35058], ["Upper Arlington", "OH", "US", 39.9945, -83.0624, 34907], ["Torrington", "CT", "US", 41.8006, -73.1212, 34906], ["Beverly Hills", "CA", "US", 34.0736, -118.4004, 34869], ["Inver Grove Heights", "MN", "US", 44.848, -93.0427, 34857], ["Cumberland", "RI", "US", 41.9668, -71.4328, 34843], ["Pleasant Hill", "CA", "US", 37.948, -122.0608, 34810], ["Stow", "OH", "US", 41.1595, -81.4404, 34797], ["Lauderdale Lakes", "FL", "US", 26.1665, -80.2084, 34796], ["La Vergne", "TN", "US", 36.0156, -86.5819, 34794], ["Winter Springs", "FL", "US", 28.6989, -81.3081, 34789], ["Joliette", "QC", "CA", 46.0164, -73.4236, 34772], ["Merritt Island", "FL", "US", 28.5392, -80.672, 34743], ["Greenpoint", "NY", "US", 40.7237, -73.951, 34719], ["West Little River", "FL", "US", 25.857, -80.237, 34699], ["Brunswick", "OH", "US", 41.2381, -81.8418, 34689], ["San Dimas", "CA", "US", 34.1067, -117.8067, 34630], ["Mascouche", "QC", "CA", 45.7497, -73.5996, 34626], ["Mirabel", "QC", "CA", 45.6501, -74.0825, 34626], ["Monroe", "NC", "US", 34.9854, -80.5495, 34623], ["North Center", "IL", "US", 41.9539, -87.679, 34623], ["Queen Creek", "AZ", "US", 33.2487, -111.6343, 34614], ["Kaneohe", "HI", "US", 21.3999, -157.7989, 34597], ["Gahanna", "OH", "US", 40.0192, -82.8793, 34590], ["Leawood", "KS", "US", 38.9667, -94.6169, 34579], ["Owasso", "OK", "US", 36.2695, -95.8547, 34542], ["Derry Village", "NH", "US", 42.8918, -71.312, 34539], ["Orange", "NJ", "US", 40.7707, -74.2327, 34457], ["Central Islip", "NY", "US", 40.7906, -73.2018, 34450], ["Victoriaville", "QC", "CA", 46.0501, -71.9658, 34426], ["Brant", "ON", "CA", 43.1334, -80.3497, 34415], ["Norristown", "PA", "US", 40.1215, -75.3399, 34412], ["Lower West Side", "IL", "US", 41.8542, -87.6656, 34410], ["Dyker Heights", "NY", "US", 40.6215, -74.0096, 34399], ["Glendale", "NY", "US", 40.7015, -73.8868, 34389], ["Cottonwood Heights", "UT", "US", 40.6197, -111.8102, 34343], ["Gallatin", "TN", "US", 36.3884, -86.4467, 34334], ["Houma", "LA", "US", 29.5958, -90.7195, 34287], ["Rubidoux", "CA", "US", 33.9961, -117.4056, 34280], ["Collinwood", "OH", "US", 41.5584, -81.5693, 34220], ["Glendale Heights", "IL", "US", 41.9146, -88.0649, 34208], ["Butte", "MT", "US", 46.0038, -112.5347, 34190], ["Dana Point", "CA", "US", 33.467, -117.6981, 34181], ["Benton", "AR", "US", 34.5645, -92.5868, 34177], ["Vestavia Hills", "AL", "US", 33.4487, -86.7878, 34174], ["La Presa", "CA", "US", 32.7081, -116.9972, 34169], ["Oakton", "VA", "US", 38.8809, -77.3008, 34166], ["Chester", "PA", "US", 39.8497, -75.3571, 34092], ["Mount Vernon", "WA", "US", 48.4212, -122.3341, 34053], ["Studio City", "CA", "US", 34.1486, -118.3965, 34034], ["Salisbury", "NC", "US", 35.671, -80.4742, 34017], ["Riviera Beach", "FL", "US", 26.7753, -80.0581, 34005], ["Orangevale", "CA", "US", 38.6785, -121.2258, 33960], ["Oswego", "IL", "US", 41.6828, -88.3515, 33955], ["El Mirage", "AZ", "US", 33.6131, -112.3246, 33935], ["West Lake Sammamish", "WA", "US", 47.5776, -122.1012, 33929], ["North Bel Air", "MD", "US", 39.5398, -76.355, 33925], ["Chelmsford", "MA", "US", 42.5998, -71.3673, 33925], ["Bay City", "MI", "US", 43.5945, -83.8889, 33917], ["Nacogdoches", "TX", "US", 31.6035, -94.6555, 33894], ["Shrewsbury", "MA", "US", 42.2959, -71.7129, 33893], ["McMinnville", "OR", "US", 45.2101, -123.1987, 33892], ["Bridgeport", "IL", "US", 41.8381, -87.6512, 33878], ["Dalton", "GA", "US", 34.7698, -84.9702, 33853], ["Olney", "MD", "US", 39.1532, -77.0669, 33844], ["North Providence", "RI", "US", 41.8501, -71.4662, 33835], ["Newark", "DE", "US", 39.6837, -75.7497, 33817], ["Oak Hill", "VA", "US", 38.9258, -77.4016, 33811], ["Deer Park", "TX", "US", 29.7052, -95.1238, 33806], ["Holland", "MI", "US", 42.7875, -86.1089, 33742], ["Throgs Neck", "NY", "US", 40.8226, -73.8196, 33683], ["Northbrook", "IL", "US", 42.1275, -87.829, 33663], ["Hilliard", "OH", "US", 40.0334, -83.1582, 33649], ["Wenatchee", "WA", "US", 47.4235, -120.3103, 33636], ["West Fargo", "ND", "US", 46.875, -96.9004, 33597], ["Fair Lawn", "NJ", "US", 40.9404, -74.1318, 33597], ["Kennesaw", "GA", "US", 34.0234, -84.6155, 33584], ["New City", "NY", "US", 41.1476, -73.9893, 33559], ["Long Beach", "NY", "US", 40.5884, -73.6579, 33550], ["Richmond", "KY", "US", 37.7479, -84.2947, 33533], ["Suitland-Silver Hill", "MD", "US", 38.8469, -76.9259, 33515], ["Chillum", "MD", "US", 38.9637, -76.9908, 33513], ["Foster City", "CA", "US", 37.5585, -122.2711, 33477], ["Fairborn", "OH", "US", 39.8209, -84.0194, 33452], ["Menlo Park", "CA", "US", 37.4538, -122.1822, 33449], ["Chicago Loop", "IL", "US", 41.8841, -87.6333, 33442], ["Campbell River", "BC", "CA", 50.0163, -125.2446, 33430], ["Lawndale", "CA", "US", 33.8872, -118.3526, 33430], ["Hinesville", "GA", "US", 31.8469, -81.596, 33398], ["Waxahachie", "TX", "US", 32.3865, -96.8483, 33384], ["St. Charles", "MD", "US", 38.6073, -76.9248, 33379], ["Woodridge", "IL", "US", 41.747, -88.0503, 33370], ["Carrollwood", "FL", "US", 28.05, -82.4929, 33365], ["Mission", "BC", "CA", 49.133, -122.3026, 33261], ["Elk Grove Village", "IL", "US", 42.0039, -87.9703, 33238], ["Ancaster", "ON", "CA", 43.2181, -79.9872, 33232], ["Pekin", "IL", "US", 40.5675, -89.6407, 33223], ["Socorro", "TX", "US", 31.6546, -106.3033, 33222], ["Elmont", "NY", "US", 40.7009, -73.7129, 33198], ["Adelanto", "CA", "US", 34.5828, -117.4092, 33166], ["Tooele", "UT", "US", 40.5308, -112.2983, 33157], ["Golden Glades", "FL", "US", 25.9118, -80.2003, 33145], ["Marrero", "LA", "US", 29.8994, -90.1004, 33141], ["Jackson", "MI", "US", 42.2459, -84.4013, 33133], ["Foothill Farms", "CA", "US", 38.6788, -121.3511, 33121], ["Englewood", "CO", "US", 39.6478, -104.9878, 33082], ["Copperas Cove", "TX", "US", 31.1241, -97.9031, 33081], ["Bath Beach", "NY", "US", 40.6046, -74.0043, 33080], ["Huntington Station", "NY", "US", 40.8534, -73.4115, 33029], ["Seaside", "CA", "US", 36.6111, -121.8516, 33025], ["Kearney", "NE", "US", 40.6995, -99.0815, 33021], ["Redan", "GA", "US", 33.7454, -84.1316, 33015], ["Manitowoc", "WI", "US", 44.0886, -87.6576, 33010], ["Williamsburg", "NY", "US", 40.7143, -73.9535, 33e3], ["Leamington", "ON", "CA", 42.0501, -82.5998, 32991], ["Goshen", "IN", "US", 41.5823, -85.8344, 32983], ["Saint Charles", "IL", "US", 41.9142, -88.3087, 32974], ["Greenacres City", "FL", "US", 26.6237, -80.1253, 32963], ["Salisbury", "MD", "US", 38.3607, -75.5994, 32899], ["Douglasville", "GA", "US", 33.7515, -84.7477, 32897], ["Silver Lake", "CA", "US", 34.0867, -118.2702, 32890], ["Security-Widefield", "CO", "US", 38.7473, -104.7144, 32882], ["University Place", "WA", "US", 47.2356, -122.5504, 32842], ["Pullman", "WA", "US", 46.7313, -117.1796, 32816], ["Courtenay", "BC", "CA", 49.6866, -124.9936, 32793], ["Juneau", "AK", "US", 58.3019, -134.4197, 32756], ["West Lawn", "IL", "US", 41.7728, -87.7223, 32749], ["Mount Lebanon", "PA", "US", 40.3554, -80.0495, 32730], ["Alabaster", "AL", "US", 33.2443, -86.8164, 32707], ["Farmers Branch", "TX", "US", 32.9265, -96.8961, 32689], ["Oildale", "CA", "US", 35.4197, -119.0195, 32684], ["La Verne", "CA", "US", 34.1008, -117.7678, 32681], ["Mason", "OH", "US", 39.3601, -84.3099, 32662], ["Eastpointe", "MI", "US", 42.4684, -82.9555, 32657], ["Gillette", "WY", "US", 44.2911, -105.5022, 32649], ["Valparaiso", "IN", "US", 41.4731, -87.0611, 32626], ["Midvale", "UT", "US", 40.6111, -111.8999, 32613], ["Spring Valley", "NY", "US", 41.1131, -74.0438, 32598], ["Rome", "NY", "US", 43.2129, -75.4557, 32573], ["Lewiston", "ID", "US", 46.4166, -117.0177, 32544], ["North Ridgeville", "OH", "US", 41.3895, -82.019, 32483], ["Petersburg", "VA", "US", 37.2279, -77.4019, 32477], ["Ken Caryl", "CO", "US", 39.5758, -105.1122, 32438], ["Randallstown", "MD", "US", 39.3673, -76.7952, 32430], ["Westlake", "OH", "US", 41.4553, -81.9179, 32428], ["Bangor", "ME", "US", 44.8012, -68.7778, 32391], ["Clermont", "FL", "US", 28.5494, -81.7729, 32390], ["Sun Prairie", "WI", "US", 43.1836, -89.2137, 32365], ["Georgetown", "KY", "US", 38.2098, -84.5588, 32356], ["Greater Grand Crossing", "IL", "US", 41.7611, -87.6149, 32346], ["Fairbanks", "AK", "US", 64.8378, -147.7164, 32325], ["College Park", "MD", "US", 38.9807, -76.9369, 32301], ["Springville", "UT", "US", 40.1652, -111.6107, 32286], ["Natick", "MA", "US", 42.2834, -71.3495, 32276], ["North Cowichan", "BC", "CA", 48.8413, -123.686, 32272], ["Massillon", "OH", "US", 40.7967, -81.5215, 32252], ["Walla Walla", "WA", "US", 46.0646, -118.343, 32237], ["Florence", "KY", "US", 38.999, -84.6266, 32227], ["Andover", "MN", "US", 45.2333, -93.2913, 32213], ["Hopkinsville", "KY", "US", 36.8656, -87.4912, 32205], ["Moose Jaw", "SK", "CA", 50.4001, -105.5345, 32166], ["Laramie", "WY", "US", 41.3114, -105.5911, 32158], ["Greenville", "MS", "US", 33.409, -91.0598, 32156], ["West Englewood", "IL", "US", 41.7781, -87.6667, 32156], ["Bethel Park", "PA", "US", 40.3276, -80.0395, 32118], ["Cookeville", "TN", "US", 36.1628, -85.5016, 32113], ["Randolph", "MA", "US", 42.1626, -71.0412, 32112], ["Oceanside", "NY", "US", 40.6387, -73.6401, 32109], ["Danville", "IL", "US", 40.1245, -87.63, 32108], ["Montgomery Village", "MD", "US", 39.1768, -77.1953, 32032], ["North Olmsted", "OH", "US", 41.4156, -81.9235, 32004], ["Land O' Lakes", "FL", "US", 28.2189, -82.4576, 31996], ["Richmond West", "FL", "US", 25.6105, -80.4297, 31973], ["Watertown", "MA", "US", 42.3709, -71.1828, 31915], ["Glastonbury", "CT", "US", 41.7123, -72.6081, 31876], ["Westmont", "CA", "US", 33.9414, -118.3023, 31853], ["Garfield", "NJ", "US", 40.8815, -74.1132, 31802], ["Laguna Hills", "CA", "US", 33.6125, -117.7128, 31748], ["West Bend", "WI", "US", 43.4253, -88.1834, 31695], ["Willingboro", "NJ", "US", 40.0279, -74.8691, 31668], ["Mundelein", "IL", "US", 42.2631, -88.004, 31582], ["Centereach", "NY", "US", 40.8584, -73.0995, 31578], ["Mount Juliet", "TN", "US", 36.2, -86.5186, 31540], ["Naugatuck", "CT", "US", 41.4859, -73.0507, 31538], ["San Luis", "AZ", "US", 32.487, -114.7822, 31520], ["Brighton Beach", "NY", "US", 40.5779, -73.9596, 31462], ["Michigan City", "IN", "US", 41.7075, -86.895, 31459], ["Dania Beach", "FL", "US", 26.0523, -80.1439, 31446], ["Lewiston Orchards", "ID", "US", 46.3804, -116.9754, 31422], ["Lloydminster", "AB", "CA", 53.2724, -110.0226, 31400], ["C\xF4te-Saint-Luc", "QC", "CA", 45.4654, -73.6659, 31395], ["Lexington", "MA", "US", 42.4473, -71.2245, 31394], ["Chatham", "IL", "US", 41.7411, -87.6125, 31392], ["Navarre", "FL", "US", 30.4016, -86.8636, 31378], ["Holly Springs", "NC", "US", 35.6513, -78.8336, 31377], ["Shawnee", "OK", "US", 35.3273, -96.9253, 31286], ["Brentwood Estates", "TN", "US", 36.0251, -86.7792, 31279], ["Galesburg", "IL", "US", 40.9478, -90.3712, 31273], ["Bowling Green", "OH", "US", 41.3748, -83.6513, 31246], ["Des Moines", "WA", "US", 47.4018, -122.3243, 31221], ["Wheat Ridge", "CO", "US", 39.7661, -105.0772, 31192], ["Saint-Georges", "QC", "CA", 46.1135, -70.6653, 31173], ["Florence", "AZ", "US", 33.0314, -111.3873, 31110], ["Gurnee", "IL", "US", 42.3703, -87.902, 31056], ["Myrtle Beach", "SC", "US", 33.6891, -78.8867, 31035], ["Parkersburg", "WV", "US", 39.2667, -81.5615, 30991], ["Miami Lakes", "FL", "US", 25.9087, -80.3087, 30972], ["Saratoga", "CA", "US", 37.2638, -122.023, 30968], ["East Lake", "FL", "US", 28.1108, -82.6948, 30962], ["Banning", "CA", "US", 33.9256, -116.8764, 30945], ["Goleta", "CA", "US", 34.4358, -119.8276, 30944], ["Lakeside", "FL", "US", 30.13, -81.7682, 30943], ["Long Branch", "NJ", "US", 40.3043, -73.9924, 30941], ["Fair Oaks", "CA", "US", 38.6446, -121.2722, 30912], ["Wayne", "PA", "US", 40.044, -75.3877, 30892], ["Lake Stevens", "WA", "US", 48.0151, -122.0637, 30886], ["Dover", "NH", "US", 43.1979, -70.8737, 30880], ["Radnor", "PA", "US", 40.0462, -75.3599, 30878], ["Holladay", "UT", "US", 40.6688, -111.8247, 30864], ["Herriman", "UT", "US", 40.5141, -112.033, 30835], ["South Kingstown", "RI", "US", 41.4472, -71.5249, 30826], ["Estero", "FL", "US", 26.4381, -81.8067, 30799], ["Ithaca", "NY", "US", 42.4406, -76.4966, 30788], ["North Tonawanda", "NY", "US", 43.0387, -78.8642, 30785], ["Brooklyn Center", "MN", "US", 45.0761, -93.3327, 30770], ["Pikesville", "MD", "US", 39.3743, -76.7225, 30764], ["New Iberia", "LA", "US", 30.0035, -91.8187, 30754], ["Alamogordo", "NM", "US", 32.8995, -105.9603, 30753], ["Orangeville", "ON", "CA", 43.9168, -80.0997, 30734], ["Parkville", "MD", "US", 39.3773, -76.5397, 30734], ["Statesboro", "GA", "US", 32.4488, -81.7832, 30721], ["Morgantown", "WV", "US", 39.6295, -79.9559, 30708], ["Los Gatos", "CA", "US", 37.2266, -121.9747, 30705], ["Matthews", "NC", "US", 35.1168, -80.7237, 30678], ["Los Altos", "CA", "US", 37.3852, -122.1141, 30671], ["Clearfield", "UT", "US", 41.1108, -112.026, 30653], ["Franklin", "MA", "US", 42.0834, -71.3967, 30636], ["Owings Mills", "MD", "US", 39.4196, -76.7802, 30622], ["Aiken", "SC", "US", 33.5604, -81.7195, 30604], ["Plainfield", "IN", "US", 39.7042, -86.3994, 30590], ["Helena", "MT", "US", 46.5927, -112.0361, 30581], ["Ballwin", "MO", "US", 38.5951, -90.5462, 30577], ["Manchester", "CT", "US", 41.7759, -72.5215, 30577], ["Algonquin", "IL", "US", 42.1656, -88.2943, 30571], ["Bel Air North", "MD", "US", 39.5543, -76.3731, 30568], ["Newington", "CT", "US", 41.6979, -72.7237, 30562], ["Westfield", "NJ", "US", 40.659, -74.3474, 30548], ["Santa Paula", "CA", "US", 34.3542, -119.0593, 30546], ["Fallbrook", "CA", "US", 33.3764, -117.2511, 30534], ["Eldersburg", "MD", "US", 39.4037, -76.9503, 30531], ["Sherwood", "AR", "US", 34.8151, -92.2243, 30517], ["Springfield Gardens", "NY", "US", 40.6631, -73.7622, 30515], ["Lawrenceville", "GA", "US", 33.9562, -83.988, 30493], ["Springfield", "VA", "US", 38.7893, -77.1872, 30484], ["Kaysville", "UT", "US", 41.0352, -111.9386, 30472], ["Granger", "IN", "US", 41.7534, -86.1108, 30465], ["Burlingame", "CA", "US", 37.5841, -122.3661, 30459], ["Post Falls", "ID", "US", 47.718, -116.9516, 30453], ["Liberty", "MO", "US", 39.2461, -94.4191, 30450], ["San Pablo", "CA", "US", 37.9622, -122.3455, 30407], ["Savage", "MN", "US", 44.7791, -93.3363, 30391], ["Poughkeepsie", "NY", "US", 41.7004, -73.921, 30371], ["Texarkana", "AR", "US", 33.4418, -94.0377, 30353], ["North Royalton", "OH", "US", 41.3137, -81.7246, 30311], ["Chicago Heights", "IL", "US", 41.5061, -87.6356, 30284], ["Lebanon", "TN", "US", 36.2081, -86.2911, 30262], ["Walnut", "CA", "US", 34.0203, -117.8653, 30237], ["Stratford", "ON", "CA", 43.3668, -80.9497, 30233], ["Madison Heights", "MI", "US", 42.4859, -83.1052, 30198], ["DeLand", "FL", "US", 29.0283, -81.3031, 30195], ["Cedar City", "UT", "US", 37.6775, -113.0619, 30184], ["Orillia", "ON", "CA", 44.6087, -79.4207, 30178], ["Parkland", "FL", "US", 26.3101, -80.2373, 30177], ["Pointe-Claire", "QC", "CA", 45.4487, -73.8167, 30161], ["West Warwick", "RI", "US", 41.6969, -71.5219, 30146], ["Jamestown", "NY", "US", 42.097, -79.2353, 30075], ["New Bern", "NC", "US", 35.1085, -77.0441, 30070], ["Rochester", "NH", "US", 43.3045, -70.9756, 30038], ["Cleburne", "TX", "US", 32.3476, -97.3867, 30020], ["Winter Park", "FL", "US", 28.6, -81.3392, 29943], ["Carney", "MD", "US", 39.3943, -76.5236, 29941], ["Southlake", "TX", "US", 32.9412, -97.1342, 29941], ["San Carlos", "CA", "US", 37.5072, -122.2605, 29931], ["Woodstock", "GA", "US", 34.1015, -84.5194, 29898], ["East Hill-Meridian", "WA", "US", 47.4105, -122.1737, 29878], ["Niles", "IL", "US", 42.0189, -87.8028, 29876], ["Laplace", "LA", "US", 30.067, -90.4815, 29872], ["Westchester", "FL", "US", 25.7548, -80.3273, 29862], ["Atascadero", "CA", "US", 35.4894, -120.6707, 29819], ["Kent", "OH", "US", 41.1537, -81.3579, 29810], ["Baie-Comeau", "QC", "CA", 49.2168, -68.1489, 29808], ["Gloucester", "MA", "US", 42.614, -70.6631, 29781], ["Nicholasville", "KY", "US", 37.8806, -84.573, 29754], ["Oak Park", "MI", "US", 42.4595, -83.1827, 29752], ["Highland Park", "IL", "US", 42.1817, -87.8003, 29743], ["Elizabethtown", "KY", "US", 37.694, -85.8591, 29678], ["Austintown", "OH", "US", 41.1017, -80.7645, 29677], ["East Palo Alto", "CA", "US", 37.4688, -122.1411, 29662], ["South Gate", "MD", "US", 39.129, -76.6258, 29658], ["Pueblo West", "CO", "US", 38.35, -104.7228, 29637], ["Port Chester", "NY", "US", 41.0018, -73.6657, 29620], ["Princeton", "NJ", "US", 40.3487, -74.659, 29603], ["Fort Hood", "TX", "US", 31.1349, -97.7756, 29589], ["LaGrange", "GA", "US", 33.0393, -85.0313, 29588], ["Salem", "NH", "US", 42.7884, -71.2009, 29549], ["Opelika", "AL", "US", 32.6454, -85.3783, 29527], ["Alma", "QC", "CA", 48.5501, -71.6491, 29526], ["Rahway", "NJ", "US", 40.6082, -74.2776, 29508], ["North Chicago", "IL", "US", 42.3256, -87.8412, 29491], ["Middle Village", "NY", "US", 40.7165, -73.8812, 29491], ["Morristown", "TN", "US", 36.214, -83.2949, 29478], ["Cheshire", "CT", "US", 41.499, -72.9007, 29443], ["Branford", "CT", "US", 41.2795, -72.8151, 29438], ["Raytown", "MO", "US", 39.0086, -94.4636, 29401], ["Fruit Cove", "FL", "US", 30.1111, -81.6418, 29362], ["Port Huron", "MI", "US", 42.9709, -82.4249, 29330], ["Tewksbury", "MA", "US", 42.6106, -71.2342, 29326], ["Franklin Square", "NY", "US", 40.7073, -73.676, 29320], ["Oak Ridge", "TN", "US", 36.0104, -84.2696, 29302], ["Southgate", "MI", "US", 42.2139, -83.1938, 29293], ["East Haven", "CT", "US", 41.2762, -72.8684, 29257], ["Upper Alton", "IL", "US", 38.9114, -90.1507, 29251], ["Johnston", "RI", "US", 41.8219, -71.5067, 29247], ["Atwater", "CA", "US", 37.3477, -120.6091, 29237], ["West Falls Church", "VA", "US", 38.8648, -77.1879, 29207], ["Williamsport", "PA", "US", 41.2412, -77.0011, 29201], ["Duluth", "GA", "US", 34.0029, -84.1446, 29193], ["Fort Bragg", "NC", "US", 35.139, -79.006, 29183], ["Russellville", "AR", "US", 35.2784, -93.1338, 29166], ["Sanford", "NC", "US", 35.4799, -79.1803, 29144], ["Harker Heights", "TX", "US", 31.0835, -97.6597, 29142], ["Voorhees", "NJ", "US", 40.4812, -74.4832, 29131], ["Burbank", "IL", "US", 41.7339, -87.7795, 29128], ["Marion", "IN", "US", 40.5584, -85.6591, 29081], ["Granite City", "IL", "US", 38.7014, -90.1487, 29054], ["Milford Mill", "MD", "US", 39.3479, -76.77, 29042], ["Lake in the Hills", "IL", "US", 42.1817, -88.3304, 29024], ["Sainte-Julie", "QC", "CA", 45.5834, -73.3325, 29019], ["Evans", "GA", "US", 33.5337, -82.1307, 29011], ["O'Fallon", "IL", "US", 38.5923, -89.9112, 29002], ["Fort Hamilton", "NY", "US", 40.6187, -74.0332, 28966], ["Carlsbad", "NM", "US", 32.4207, -104.2288, 28957], ["Ferry Pass", "FL", "US", 30.5102, -87.2125, 28921], ["Kingman", "AZ", "US", 35.1894, -114.053, 28912], ["Orcutt", "CA", "US", 34.8653, -120.436, 28905], ["Henderson", "KY", "US", 37.8362, -87.59, 28890], ["Needham", "MA", "US", 42.2834, -71.2328, 28886], ["Crown Point", "IN", "US", 41.417, -87.3653, 28879], ["Big Spring", "TX", "US", 32.2504, -101.4787, 28862], ["Dracut", "MA", "US", 42.6704, -71.302, 28831], ["West Kelowna", "BC", "CA", 49.8625, -119.5833, 28793], ["Schererville", "IN", "US", 41.4789, -87.4548, 28791], ["Burton", "MI", "US", 42.9995, -83.6163, 28788], ["Ridgecrest", "CA", "US", 35.6225, -117.6709, 28780], ["Windsor", "CT", "US", 41.8526, -72.6437, 28778], ["Eagle Pass", "TX", "US", 28.7091, -100.4995, 28765], ["Agawam", "MA", "US", 42.0695, -72.6148, 28761], ["Weatherford", "TX", "US", 32.7593, -97.7973, 28742], ["West Elkridge", "MD", "US", 39.2071, -76.7269, 28734], ["East Chicago", "IN", "US", 41.6392, -87.4548, 28699], ["Redmond", "OR", "US", 44.2726, -121.1739, 28654], ["Jacksonville", "AR", "US", 34.8662, -92.1102, 28643], ["Socorro Mission Number 1 Colonia", "TX", "US", 31.6362, -106.2905, 28637], ["Norwood", "MA", "US", 42.1945, -71.1995, 28602], ["Northampton", "MA", "US", 42.3251, -72.6412, 28540], ["Englewood", "NJ", "US", 40.8929, -73.9726, 28539], ["Lake Magdalene", "FL", "US", 28.0742, -82.4718, 28509], ["Perry Hall", "MD", "US", 39.4126, -76.4636, 28474], ["Maryville", "TN", "US", 35.7565, -83.9705, 28464], ["Hobart", "IN", "US", 41.5323, -87.255, 28404], ["Fresh Meadows", "NY", "US", 40.7348, -73.7935, 28397], ["Mehlville", "MO", "US", 38.5084, -90.3229, 28380], ["Greer", "SC", "US", 34.9387, -82.2271, 28365], ["Lansing", "IL", "US", 41.5648, -87.5389, 28349], ["Harrison", "NY", "US", 40.969, -73.7126, 28348], ["Monterey", "CA", "US", 36.6002, -121.8947, 28338], ["West Islip", "NY", "US", 40.7062, -73.3062, 28335], ["Desert Hot Springs", "CA", "US", 33.9617, -116.5035, 28335], ["American Fork", "UT", "US", 40.3769, -111.7958, 28326], ["Central", "LA", "US", 30.5543, -91.0368, 28295], ["Newburgh", "NY", "US", 41.5034, -74.0104, 28290], ["Chamblee", "GA", "US", 33.892, -84.2988, 28244], ["Millville", "NJ", "US", 39.4021, -75.0393, 28230], ["North Andover", "MA", "US", 42.6987, -71.1351, 28222], ["SeaTac", "WA", "US", 47.4485, -122.2922, 28215], ["Elmira", "NY", "US", 42.0898, -76.8077, 28213], ["Spring Valley", "CA", "US", 32.7448, -116.9989, 28205], ["Stockbridge", "GA", "US", 33.5443, -84.2338, 28202], ["Glen Ellyn", "IL", "US", 41.8775, -88.067, 28201], ["Monroeville", "PA", "US", 40.4212, -79.7881, 28176], ["Benicia", "CA", "US", 38.0494, -122.1586, 28167], ["Fredericksburg", "VA", "US", 38.3032, -77.4605, 28118], ["Suisun", "CA", "US", 38.2383, -122.0402, 28111], ["Aberdeen", "SD", "US", 45.4647, -98.4865, 28102], ["Cranberry Township", "PA", "US", 40.685, -80.1071, 28098], ["Garfield Heights", "OH", "US", 41.417, -81.606, 28097], ["South Chicago", "IL", "US", 41.7398, -87.5542, 28095], ["Cornelius", "NC", "US", 35.4868, -80.8601, 28092], ["Oakdale", "MN", "US", 44.963, -92.9649, 28080], ["Oak Forest", "IL", "US", 41.6028, -87.7439, 28074], ["Garner", "NC", "US", 35.7113, -78.6142, 28053], ["Drexel Hill", "PA", "US", 39.9471, -75.2921, 28043], ["North Kingstown", "RI", "US", 41.5501, -71.4662, 28042], ["Bella Vista", "AR", "US", 36.4807, -94.2713, 27999], ["Melrose", "MA", "US", 42.4584, -71.0662, 27997], ["Fitchburg", "WI", "US", 42.9608, -89.4698, 27996], ["Gramercy Park", "NY", "US", 40.7375, -73.9861, 27988], ["Wellesley", "MA", "US", 42.2965, -71.2926, 27982], ["Enterprise", "AL", "US", 31.3152, -85.8552, 27978], ["Winchester", "NV", "US", 36.13, -115.1189, 27978], ["Slidell", "LA", "US", 30.2752, -89.7812, 27942], ["University Heights", "NY", "US", 40.8601, -73.9093, 27935], ["West Springfield", "MA", "US", 42.107, -72.6204, 27912], ["Dodge City", "KS", "US", 37.7528, -100.0171, 27912], ["Paragould", "AR", "US", 36.0584, -90.4973, 27900], ["Maywood", "CA", "US", 33.9867, -118.1853, 27888], ["Seguin", "TX", "US", 29.5688, -97.9647, 27864], ["Shirley", "NY", "US", 40.8015, -72.8676, 27854], ["Livingston", "NJ", "US", 40.7959, -74.3149, 27853], ["Round Lake Beach", "IL", "US", 42.3717, -88.0901, 27852], ["Frankfort", "KY", "US", 38.2009, -84.8733, 27830], ["Sterling", "VA", "US", 39.0062, -77.4286, 27822], ["Middletown", "NY", "US", 41.4459, -74.4229, 27812], ["Fountain", "CO", "US", 38.6822, -104.7008, 27767], ["Saratoga Springs", "NY", "US", 43.0831, -73.7846, 27765], ["Kirkwood", "MO", "US", 38.5834, -90.4068, 27750], ["Drexel Heights", "AZ", "US", 32.1412, -111.0284, 27749], ["Deer Park", "NY", "US", 40.7618, -73.3293, 27745], ["Lafayette", "CO", "US", 39.9936, -105.0897, 27729], ["Fridley", "MN", "US", 45.0861, -93.2633, 27713], ["West Scarborough", "ME", "US", 43.5704, -70.3878, 27706], ["Queensbury", "NY", "US", 43.3773, -73.6132, 27703], ["Rexburg", "ID", "US", 43.826, -111.7897, 27663], ["Wheeling", "WV", "US", 40.064, -80.7209, 27648], ["Shaker Heights", "OH", "US", 41.4739, -81.5371, 27646], ["Mililani Town", "HI", "US", 21.4504, -158.015, 27629], ["Bergenfield", "NJ", "US", 40.9276, -73.9974, 27621], ["Marshalltown", "IA", "US", 42.0494, -92.908, 27620], ["Tucker", "GA", "US", 33.8546, -84.2171, 27581], ["Nutley", "NJ", "US", 40.8223, -74.1599, 27572], ["Lake Jackson", "TX", "US", 29.0339, -95.4344, 27533], ["Port Moody", "BC", "CA", 49.2812, -122.8246, 27512], ["Plum", "PA", "US", 40.5003, -79.7495, 27505], ["Windsor", "CA", "US", 38.5471, -122.8164, 27464], ["West Chicago", "IL", "US", 41.8847, -88.204, 27447], ["Allen Park", "MI", "US", 42.2575, -83.211, 27425], ["Wilmette", "IL", "US", 42.0722, -87.7228, 27413], ["Imperial Beach", "CA", "US", 32.5839, -117.1131, 27408], ["Glen Cove", "NY", "US", 40.8623, -73.6337, 27400], ["Syracuse", "UT", "US", 41.0894, -112.0647, 27395], ["Maryland Heights", "MO", "US", 38.7131, -90.4298, 27389], ["Mason City", "IA", "US", 43.1536, -93.201, 27366], ["Crofton", "MD", "US", 39.0018, -76.6875, 27348], ["Anderson", "SC", "US", 34.5034, -82.6501, 27335], ["Eagle Mountain", "UT", "US", 40.3141, -112.0069, 27332], ["College Point", "NY", "US", 40.7876, -73.846, 27307], ["Winchester", "VA", "US", 39.1857, -78.1633, 27284], ["Lindenhurst", "NY", "US", 40.6868, -73.3735, 27277], ["Spanaway", "WA", "US", 47.104, -122.4346, 27227], ["Belmont", "CA", "US", 37.5202, -122.2758, 27218], ["Hunts Point", "NY", "US", 40.8126, -73.884, 27204], ["Holbrook", "NY", "US", 40.8123, -73.0784, 27195], ["New London", "CT", "US", 41.3556, -72.0995, 27179], ["Paso Robles", "CA", "US", 35.6266, -120.691, 27157], ["Tualatin", "OR", "US", 45.384, -122.764, 27154], ["Fleming Island", "FL", "US", 30.0933, -81.719, 27126], ["Winona", "MN", "US", 44.05, -91.6393, 27094], ["Thomasville", "NC", "US", 35.8826, -80.082, 27061], ["Casselberry", "FL", "US", 28.6778, -81.3278, 27056], ["Eureka", "CA", "US", 40.8021, -124.1637, 27017], ["East Saint Louis", "IL", "US", 38.6245, -90.1509, 27006], ["Garden City", "KS", "US", 37.9717, -100.8727, 27005], ["Alton", "IL", "US", 38.8906, -90.1843, 27003], ["Milton", "MA", "US", 42.2495, -71.0662, 27003], ["University Park", "FL", "US", 25.7465, -80.3675, 26995], ["Auburn", "NY", "US", 42.9317, -76.5661, 26985], ["Williston", "ND", "US", 48.147, -103.618, 26977], ["Paramus", "NJ", "US", 40.9445, -74.0754, 26974], ["Back Mountain", "PA", "US", 41.3359, -75.9963, 26973], ["West Milford", "NJ", "US", 41.1312, -74.3674, 26968], ["Jeffersontown", "KY", "US", 38.1942, -85.5644, 26946], ["Garden City", "MI", "US", 42.3256, -83.331, 26920], ["Horn Lake", "MS", "US", 34.9554, -90.0348, 26915], ["Stoughton", "MA", "US", 42.1251, -71.1023, 26915], ["Easton", "PA", "US", 40.6884, -75.2207, 26915], ["Prairieville", "LA", "US", 30.303, -90.972, 26895], ["Hyde Park", "IL", "US", 41.7942, -87.5939, 26893], ["Dix Hills", "NY", "US", 40.8048, -73.3362, 26892], ["Gladstone", "MO", "US", 39.2039, -94.5547, 26861], ["Cutler Ridge", "FL", "US", 25.5807, -80.3467, 26831], ["Independence", "KY", "US", 38.9431, -84.5441, 26819], ["Watertown", "NY", "US", 43.9748, -75.9108, 26780], ["Wooster", "OH", "US", 40.8052, -81.9365, 26749], ["Bessemer", "AL", "US", 33.4018, -86.9544, 26730], ["Merrimack", "NH", "US", 42.8651, -71.4934, 26726], ["Lemon Grove", "CA", "US", 32.7426, -117.0314, 26709], ["Kankakee", "IL", "US", 41.12, -87.8611, 26676], ["Wethersfield", "CT", "US", 41.7143, -72.6526, 26668], ["Bristol", "TN", "US", 36.5951, -82.1887, 26666], ["McHenry", "IL", "US", 42.3334, -88.2668, 26657], ["Cibolo", "TX", "US", 29.5616, -98.227, 26637], ["Saugus", "MA", "US", 42.4648, -71.0101, 26628], ["Stevens Point", "WI", "US", 44.5236, -89.5746, 26604], ["West Linn", "OR", "US", 45.3657, -122.6123, 26593], ["Superior", "WI", "US", 46.7208, -92.1041, 26579], ["Tujunga", "CA", "US", 34.2522, -118.2884, 26527], ["Greenville", "TX", "US", 33.1384, -96.1108, 26515], ["Magna", "UT", "US", 40.7091, -112.1016, 26505], ["Batavia", "IL", "US", 41.85, -88.3126, 26495], ["Cantonment", "FL", "US", 30.6085, -87.34, 26493], ["Danvers", "MA", "US", 42.5751, -70.93, 26493], ["Boisbriand", "QC", "CA", 45.6168, -73.8325, 26483], ["Shoreview", "MN", "US", 45.0791, -93.1472, 26477], ["Paradise", "CA", "US", 39.7596, -121.6219, 26476], ["Fremont", "NE", "US", 41.4333, -96.4981, 26474], ["Smithtown", "NY", "US", 40.8559, -73.2007, 26470], ["Pearl", "MS", "US", 32.2746, -90.132, 26462], ["Mansfield City", "CT", "US", 41.7659, -72.2337, 26439], ["Mercerville-Hamilton Square", "NJ", "US", 40.2313, -74.6722, 26419], ["North Creek", "WA", "US", 47.8195, -122.1762, 26410], ["Carbondale", "IL", "US", 37.7273, -89.2168, 26399], ["Westport", "CT", "US", 41.1415, -73.3579, 26391], ["Medina", "OH", "US", 41.1384, -81.8637, 26339], ["Bay Shore", "NY", "US", 40.7251, -73.2454, 26337], ["Kahului", "HI", "US", 20.8895, -156.4743, 26337], ["Vernon Hills", "IL", "US", 42.2195, -87.9795, 26314], ["Zionsville", "IN", "US", 39.9509, -86.2619, 26296], ["Norco", "CA", "US", 33.9311, -117.5487, 26289], ["Wasco", "CA", "US", 35.5941, -119.341, 26279], ["Mount Pleasant", "WI", "US", 42.6974, -87.8558, 26272], ["Fortuna Foothills", "AZ", "US", 32.6578, -114.4119, 26265], ["Brandon", "MB", "CA", 49.8469, -99.9531, 26234], ["Barberton", "OH", "US", 41.0128, -81.6051, 26234], ["Kingsville", "TX", "US", 27.5159, -97.8561, 26225], ["Statesville", "NC", "US", 35.7826, -80.8873, 26221], ["Plainview", "NY", "US", 40.7765, -73.4673, 26217], ["Laurel", "MD", "US", 39.0993, -76.8483, 26215], ["Carrollton", "GA", "US", 33.5801, -85.0766, 26203], ["South Pasadena", "CA", "US", 34.1161, -118.1504, 26151], ["Howard Beach", "NY", "US", 40.6579, -73.8363, 26148], ["Englewood", "IL", "US", 41.7798, -87.6459, 26121], ["Four Corners", "FL", "US", 28.3329, -81.6474, 26116], ["South Laurel", "MD", "US", 39.0698, -76.8503, 26112], ["Asheboro", "NC", "US", 35.7079, -79.8136, 26103], ["Buenaventura Lakes", "FL", "US", 28.3358, -81.3531, 26079], ["Clinton", "IA", "US", 41.8445, -90.1887, 26064], ["Mount Pleasant", "MI", "US", 43.5978, -84.7675, 26060], ["Twentynine Palms", "CA", "US", 34.1356, -116.0542, 26025], ["Huntley", "IL", "US", 42.1681, -88.4281, 26005], ["Pennsport", "PA", "US", 39.9276, -75.1505, 26e3], ["Xenia", "OH", "US", 39.6848, -83.9296, 25976], ["Reisterstown", "MD", "US", 39.4698, -76.8319, 25968], ["Green", "OH", "US", 40.9459, -81.4832, 25898], ["Brawley", "CA", "US", 32.9787, -115.5303, 25897], ["Yukon", "OK", "US", 35.5067, -97.7625, 25892], ["Opportunity", "WA", "US", 47.6499, -117.2399, 25877], ["Forest Hills", "MI", "US", 42.9595, -85.4898, 25867], ["Lafayette", "CA", "US", 37.8858, -122.118, 25843], ["Ramsey", "MN", "US", 45.2611, -93.45, 25828], ["Suitland", "MD", "US", 38.8487, -76.9239, 25825], ["Pleasure Ridge Park", "KY", "US", 38.1454, -85.8583, 25813], ["Rosedale", "NY", "US", 40.6621, -73.7354, 25812], ["New Lenox", "IL", "US", 41.512, -87.9656, 25800], ["Madison", "MS", "US", 32.4618, -90.1154, 25799], ["Neenah", "WI", "US", 44.1858, -88.4626, 25792], ["Alvin", "TX", "US", 29.4239, -95.2441, 25791], ["Vaudreuil-Dorion", "QC", "CA", 45.4001, -74.0325, 25789], ["Key West", "FL", "US", 24.5552, -81.7816, 25755], ["Randolph", "NJ", "US", 40.8483, -74.5815, 25734], ["Temple Terrace", "FL", "US", 28.0353, -82.3893, 25731], ["Owatonna", "MN", "US", 44.0838, -93.226, 25725], ["Homewood", "AL", "US", 33.4718, -86.8008, 25708], ["Sahuarita", "AZ", "US", 31.9576, -110.9557, 25707], ["Thetford-Mines", "QC", "CA", 46.0937, -71.3054, 25704], ["Maple Valley", "WA", "US", 47.3927, -122.0464, 25686], ["Walnut Grove", "BC", "CA", 49.1647, -122.6404, 25683], ["Hazelwood", "MO", "US", 38.7714, -90.3709, 25661], ["Troy", "OH", "US", 40.0395, -84.2033, 25659], ["Lemoore", "CA", "US", 36.3008, -119.7829, 25647], ["Mint Hill", "NC", "US", 35.1796, -80.6473, 25627], ["Ridgewood", "NJ", "US", 40.9793, -74.1165, 25621], ["Long Island City", "NY", "US", 40.7448, -73.9488, 25595], ["Cabot", "AR", "US", 34.9745, -92.0165, 25587], ["Reedley", "CA", "US", 36.5963, -119.4504, 25569], ["Edgewood", "MD", "US", 39.4187, -76.2944, 25562], ["Meadow Woods", "FL", "US", 28.3856, -81.3665, 25558], ["South Portland", "ME", "US", 43.6415, -70.2409, 25556], ["Val-d'Or", "QC", "CA", 48.0974, -77.7974, 25541], ["West Whittier-Los Nietos", "CA", "US", 33.976, -118.0691, 25540], ["Lebanon", "PA", "US", 40.3409, -76.4113, 25534], ["Zanesville", "OH", "US", 39.9404, -82.0132, 25498], ["Prince Edward", "ON", "CA", 44.0001, -77.2495, 25496], ["Colleyville", "TX", "US", 32.881, -97.155, 25487], ["Canton", "GA", "US", 34.2368, -84.4908, 25469], ["Ossining", "NY", "US", 41.1629, -73.8615, 25441], ["Salem", "VA", "US", 37.2935, -80.0548, 25432], ["Burlington", "IA", "US", 40.8075, -91.1129, 25410], ["Saratoga Springs", "UT", "US", 40.3491, -111.9047, 25407], ["Melrose Park", "IL", "US", 41.9006, -87.8567, 25379], ["Starkville", "MS", "US", 33.4505, -88.8196, 25366], ["Lochearn", "MD", "US", 39.3407, -76.7222, 25333], ["Chanhassen", "MN", "US", 44.8622, -93.5308, 25332], ["Hercules", "CA", "US", 38.0171, -122.2886, 25314], ["Galt", "CA", "US", 38.2546, -121.2999, 25303], ["Prior Lake", "MN", "US", 44.7133, -93.4227, 25282], ["Castlewood", "CO", "US", 39.5847, -104.9011, 25271], ["Grandview", "MO", "US", 38.8858, -94.533, 25256], ["Clinton", "MS", "US", 32.3415, -90.3218, 25254], ["Yarmouth", "MA", "US", 41.7057, -70.2286, 25243], ["Sainte-Th\xE9r\xE8se", "QC", "CA", 45.6392, -73.8276, 25224], ["Sandusky", "OH", "US", 41.4489, -82.708, 25212], ["Balch Springs", "TX", "US", 32.7287, -96.6228, 25210], ["White Bear Lake", "MN", "US", 45.0847, -93.0099, 25205], ["Chaska", "MN", "US", 44.7894, -93.6022, 25199], ["Harvey", "IL", "US", 41.61, -87.6467, 25194], ["Middle River", "MD", "US", 39.3343, -76.4394, 25191], ["Woodstock", "IL", "US", 42.3147, -88.4487, 25189], ["Ardmore", "OK", "US", 34.1743, -97.1436, 25176], ["Lockport", "IL", "US", 41.5895, -88.0578, 25175], ["Woodburn", "OR", "US", 45.1437, -122.8554, 25173], ["Wyandotte", "MI", "US", 42.2142, -83.1499, 25156], ["Mauldin", "SC", "US", 34.7787, -82.3101, 25135], ["Belvidere", "IL", "US", 42.2639, -88.8443, 25132], ["Moscow", "ID", "US", 46.7324, -117.0002, 25060], ["Milford", "MA", "US", 42.1398, -71.5162, 25055], ["West Memphis", "AR", "US", 35.1465, -90.1845, 25052], ["Athens", "OH", "US", 39.3292, -82.1013, 25044], ["Mercer Island", "WA", "US", 47.5707, -122.2221, 25042], ["Bridgeton", "NJ", "US", 39.4273, -75.2341, 25031], ["Maplewood", "NJ", "US", 40.7312, -74.2735, 25008], ["Soledad", "CA", "US", 36.4247, -121.3263, 25003], ["Fallingbrook", "PE", "CA", 45.4756, -75.484, 25e3], ["Farmington", "CT", "US", 41.7198, -72.832, 25e3], ["Brownsburg", "IN", "US", 39.8434, -86.3978, 24996], ["Saginaw Township North", "MI", "US", 43.46, -84.0067, 24994], ["Edwardsville", "IL", "US", 38.8114, -89.9532, 24992], ["Riverside", "OH", "US", 39.7798, -84.1241, 24972], ["Athens", "AL", "US", 34.8024, -86.9722, 24966], ["Sanger", "CA", "US", 36.708, -119.556, 24950], ["Westmont", "IL", "US", 41.7959, -87.9756, 24941], ["Wakefield", "MA", "US", 42.5065, -71.0728, 24932], ["San Fernando", "CA", "US", 34.282, -118.439, 24931], ["Rockledge", "FL", "US", 28.3508, -80.7253, 24926], ["Hastings", "NE", "US", 40.5861, -98.3884, 24924], ["Cave Spring", "VA", "US", 37.2276, -80.0128, 24922], ["North Tustin", "CA", "US", 33.7645, -117.7939, 24917], ["Daphne", "AL", "US", 30.6035, -87.9036, 24896], ["Whitehall Township", "PA", "US", 40.6668, -75.4999, 24896], ["Paducah", "KY", "US", 37.0834, -88.6, 24864], ["Cliffside Park", "NJ", "US", 40.8215, -73.9876, 24857], ["Elmwood Park", "IL", "US", 41.9211, -87.8092, 24840], ["Vineyard", "CA", "US", 38.4645, -121.3469, 24836], ["Lodi", "NJ", "US", 40.8823, -74.0832, 24835], ["Hazleton", "PA", "US", 40.9584, -75.9746, 24825], ["Coronado", "CA", "US", 32.6859, -117.1831, 24812], ["Hillside", "NY", "US", 40.7079, -73.7868, 24808], ["Eagle River", "AK", "US", 61.3214, -149.5678, 24793], ["South Salt Lake", "UT", "US", 40.7188, -111.8883, 24788], ["Paris", "TX", "US", 33.6609, -95.5555, 24782], ["Northport", "AL", "US", 33.229, -87.5772, 24772], ["University Park", "TX", "US", 32.8501, -96.8003, 24759], ["Uniondale", "NY", "US", 40.7004, -73.5929, 24759], ["Ponca City", "OK", "US", 36.707, -97.0856, 24758], ["Muskego", "WI", "US", 42.9059, -88.139, 24755], ["Collinsville", "IL", "US", 38.6703, -89.9845, 24754], ["Reading", "MA", "US", 42.5256, -71.0953, 24747], ["Short Pump", "VA", "US", 37.6504, -77.6125, 24729], ["Belmont", "MA", "US", 42.3959, -71.1787, 24729], ["Dedham", "MA", "US", 42.2418, -71.1662, 24729], ["De Pere", "WI", "US", 44.4489, -88.0604, 24724], ["Caledonia", "WI", "US", 42.8078, -87.9243, 24684], ["Airdrie", "AB", "CA", 51.3001, -114.0353, 24673], ["Inkster", "MI", "US", 42.2942, -83.3099, 24672], ["Mount Pearl", "NL", "CA", 47.5166, -52.7814, 24671], ["Vincentown", "NJ", "US", 39.934, -74.7485, 24664], ["Bixby", "OK", "US", 35.942, -95.8833, 24657], ["Emporia", "KS", "US", 38.4039, -96.1817, 24649], ["Fort Dodge", "IA", "US", 42.4975, -94.168, 24649], ["Walker", "MI", "US", 43.0014, -85.7681, 24647], ["Palmetto Bay", "FL", "US", 25.6218, -80.3248, 24642], ["Ottumwa", "IA", "US", 41.02, -92.4113, 24624], ["Junction City", "KS", "US", 39.0286, -96.8314, 24621], ["Seal Beach", "CA", "US", 33.7414, -118.1048, 24619], ["Tarpon Springs", "FL", "US", 28.1461, -82.7568, 24605], ["Franklin", "IN", "US", 39.4806, -86.055, 24598], ["Herndon", "VA", "US", 38.9695, -77.3861, 24568], ["Austin", "MN", "US", 43.6666, -92.9746, 24563], ["Sachse", "TX", "US", 32.9762, -96.5953, 24554], ["Sun City West", "AZ", "US", 33.662, -112.3413, 24535], ["Watauga", "TX", "US", 32.8579, -97.2547, 24525], ["Burlington", "MA", "US", 42.5048, -71.1956, 24498], ["San Benito", "TX", "US", 26.1326, -97.6311, 24496], ["Freeport", "IL", "US", 42.2967, -89.6212, 24476], ["Staunton", "VA", "US", 38.1499, -79.0732, 24416], ["Selma", "CA", "US", 36.5708, -119.6121, 24414], ["South Windsor", "CT", "US", 41.8237, -72.6212, 24412], ["North Potomac", "MD", "US", 39.0829, -77.265, 24410], ["Homer Glen", "IL", "US", 41.6, -87.9381, 24395], ["Saint-Bruno-de-Montarville", "QC", "CA", 45.5334, -73.3492, 24388], ["Coral Terrace", "FL", "US", 25.7459, -80.3045, 24376], ["Norfolk", "NE", "US", 42.0283, -97.417, 24366], ["Midland", "ON", "CA", 44.7501, -79.883, 24353], ["Ridgeland", "MS", "US", 32.4285, -90.1323, 24351], ["Scaggsville", "MD", "US", 39.1451, -76.9002, 24333], ["Cudahy", "CA", "US", 33.9606, -118.1853, 24311], ["Washington", "UT", "US", 37.1305, -113.5083, 24299], ["New Smyrna Beach", "FL", "US", 29.0258, -80.927, 24298], ["South Plainfield", "NJ", "US", 40.5793, -74.4115, 24290], ["Pasadena", "MD", "US", 39.1073, -76.5711, 24287], ["Columbine", "CO", "US", 39.5878, -105.0694, 24280], ["Greenbelt", "MD", "US", 39.0046, -76.8755, 24272], ["South Riding", "VA", "US", 38.9209, -77.5039, 24256], ["Citrus Park", "FL", "US", 28.0784, -82.5698, 24252], ["Boca Del Mar", "FL", "US", 26.3451, -80.1467, 24244], ["Newport", "RI", "US", 41.4901, -71.3128, 24232], ["Norton Shores", "MI", "US", 43.1689, -86.2639, 24208], ["Barstow Heights", "CA", "US", 34.8697, -117.0562, 24202], ["Rockville Centre", "NY", "US", 40.6587, -73.6412, 24201], ["Searcy", "AR", "US", 35.2506, -91.7362, 24196], ["North Platte", "NE", "US", 41.1239, -100.7654, 24194], ["Rolling Meadows", "IL", "US", 42.0842, -88.0131, 24190], ["Carteret", "NJ", "US", 40.5773, -74.2282, 24170], ["Immokalee", "FL", "US", 26.4187, -81.4173, 24154], ["Woodlawn", "IL", "US", 41.7795, -87.5995, 24150], ["Medford", "NY", "US", 40.8176, -73.0001, 24142], ["Riverbank", "CA", "US", 37.736, -120.9355, 24122], ["Zion", "IL", "US", 42.4461, -87.8328, 24117], ["Trotwood", "OH", "US", 39.7973, -84.3113, 24096], ["North Haven", "CT", "US", 41.3909, -72.8595, 24093], ["Summerlin South", "NV", "US", 36.1171, -115.33, 24085], ["Mahwah", "NJ", "US", 41.0887, -74.1438, 24062], ["Loma Linda", "CA", "US", 34.0483, -117.2612, 24045], ["Peekskill", "NY", "US", 41.2901, -73.9204, 24043], ["Keystone", "FL", "US", 28.1559, -82.6212, 24039], ["Baldwin", "NY", "US", 40.6565, -73.6093, 24033], ["Fairfax", "VA", "US", 38.8462, -77.3064, 24013], ["Maywood", "IL", "US", 41.8792, -87.8431, 24012], ["Sebastian", "FL", "US", 27.8164, -80.4706, 24007], ["East Gwillimbury", "ON", "CA", 44.1009, -79.4378, 23991], ["Holt", "MI", "US", 42.6406, -84.5152, 23973], ["Muscatine", "IA", "US", 41.4245, -91.0432, 23968], ["Elk River", "MN", "US", 45.3038, -93.5672, 23963], ["Rock Springs", "WY", "US", 41.5875, -109.2029, 23962], ["Golden Gate", "FL", "US", 26.1879, -81.6951, 23961], ["Saint-Constant", "QC", "CA", 45.3668, -73.5659, 23957], ["Corsicana", "TX", "US", 32.0954, -96.4689, 23952], ["Hialeah Gardens", "FL", "US", 25.8651, -80.3245, 23926], ["Waverly", "MI", "US", 42.7392, -84.6208, 23925], ["Hunt Valley", "MD", "US", 39.4998, -76.6411, 23915], ["Fuquay-Varina", "NC", "US", 35.5843, -78.8, 23907], ["Fountain Hills", "AZ", "US", 33.6117, -111.7174, 23899], ["Forest Grove", "OR", "US", 45.5198, -123.1107, 23897], ["Unionport", "NY", "US", 40.8273, -73.8501, 23895], ["Champlin", "MN", "US", 45.1889, -93.3975, 23894], ["South Portland Gardens", "ME", "US", 43.639, -70.3153, 23893], ["Brockville", "ON", "CA", 44.5913, -75.687, 23886], ["Centerville", "OH", "US", 39.6284, -84.1594, 23882], ["Bloomington", "CA", "US", 34.0703, -117.3959, 23851], ["Bainbridge Island", "WA", "US", 47.6262, -122.5212, 23840], ["Morrisville", "NC", "US", 35.8235, -78.8256, 23820], ["Marshall", "TX", "US", 32.5449, -94.3674, 23820], ["Watertown", "WI", "US", 43.1947, -88.729, 23819], ["Kernersville", "NC", "US", 36.1199, -80.0737, 23811], ["Dickinson", "ND", "US", 46.8792, -102.7896, 23765], ["Old Bridge", "NJ", "US", 40.4148, -74.3654, 23753], ["Fort Washington", "MD", "US", 38.7073, -77.023, 23717], ["Dinuba", "CA", "US", 36.5433, -119.3871, 23702], ["Van Nest", "NY", "US", 40.8484, -73.8637, 23700], ["Barstow", "CA", "US", 34.8986, -117.0228, 23692], ["Fairland", "MD", "US", 39.0762, -76.9578, 23681], ["Brookings", "SD", "US", 44.3114, -96.7984, 23657], ["Blue Island", "IL", "US", 41.6573, -87.68, 23652], ["Faribault", "MN", "US", 44.295, -93.2688, 23650], ["Baileys Crossroads", "VA", "US", 38.8504, -77.1297, 23643], ["Eagle", "ID", "US", 43.6954, -116.354, 23612], ["Langley", "BC", "CA", 49.1011, -122.6588, 23606], ["Norland", "FL", "US", 25.949, -80.2123, 23604], ["Scotch Plains", "NJ", "US", 40.6554, -74.3899, 23584], ["Glenville", "OH", "US", 41.5334, -81.6174, 23559], ["El Cerrito", "CA", "US", 37.9158, -122.3116, 23549], ["Brandon", "MS", "US", 32.2732, -89.9859, 23529], ["Derby", "KS", "US", 37.5456, -97.2689, 23509], ["Rouyn-Noranda", "QC", "CA", 48.2366, -79.0231, 23504], ["Graham", "WA", "US", 47.0529, -122.2943, 23491], ["Ilchester", "MD", "US", 39.2509, -76.7647, 23476], ["Bayonet Point", "FL", "US", 28.3267, -82.6834, 23467], ["Easton", "MA", "US", 42.0245, -71.1287, 23459], ["Loves Park", "IL", "US", 42.32, -89.0582, 23455], ["Avon Lake", "OH", "US", 41.5053, -82.0282, 23453], ["San Lorenzo", "CA", "US", 37.681, -122.1244, 23452], ["Morton Grove", "IL", "US", 42.0406, -87.7826, 23448], ["Kingston", "NY", "US", 41.927, -73.9974, 23436], ["McDonough", "GA", "US", 33.4473, -84.1469, 23417], ["Romulus", "MI", "US", 42.2223, -83.3966, 23417], ["Rosemount", "MN", "US", 44.7394, -93.1258, 23413], ["Mansfield", "MA", "US", 42.0334, -71.2189, 23380], ["Laguna Beach", "CA", "US", 33.5423, -117.7831, 23365], ["Springfield", "PA", "US", 39.9307, -75.3202, 23363], ["Bellview", "FL", "US", 30.4616, -87.315, 23355], ["Terrytown", "LA", "US", 29.9102, -90.0326, 23319], ["Whitehorse", "YT", "CA", 60.7161, -135.0538, 23272], ["Crestview", "FL", "US", 30.7621, -86.5705, 23270], ["Keene", "NH", "US", 42.9337, -72.2781, 23265], ["Greenwood", "SC", "US", 34.1954, -82.1618, 23260], ["Gallup", "NM", "US", 35.5281, -108.7426, 23240], ["South Old Bridge", "NJ", "US", 40.4082, -74.3543, 23233], ["Duncan", "OK", "US", 34.5023, -97.9578, 23231], ["Griffin", "GA", "US", 33.2468, -84.2641, 23211], ["Dolton", "IL", "US", 41.6389, -87.6073, 23197], ["Webster Groves", "MO", "US", 38.5926, -90.3573, 23177], ["Belton", "MO", "US", 38.812, -94.5319, 23168], ["Columbus", "MS", "US", 33.4957, -88.4273, 23168], ["Denison", "TX", "US", 33.7557, -96.5367, 23150], ["East Elmhurst", "NY", "US", 40.7612, -73.8651, 23150], ["Kerrville", "TX", "US", 30.0474, -99.1403, 23136], ["Pooler", "GA", "US", 32.1155, -81.2471, 23133], ["Mequon", "WI", "US", 43.2156, -88.03, 23132], ["Vicksburg", "MS", "US", 32.3526, -90.8779, 23131], ["Wright", "FL", "US", 30.4557, -86.6383, 23127], ["Morrisania", "NY", "US", 40.8293, -73.9065, 23127], ["Palm City", "FL", "US", 27.1678, -80.2662, 23120], ["Middleborough", "MA", "US", 41.8932, -70.9112, 23116], ["Arnold", "MD", "US", 39.0321, -76.5027, 23106], ["Isla Vista", "CA", "US", 34.4133, -119.861, 23096], ["Vero Beach South", "FL", "US", 27.6164, -80.4131, 23092], ["Van Buren", "AR", "US", 35.4368, -94.3483, 23081], ["East Peoria", "IL", "US", 40.6662, -89.5801, 23080], ["Landover", "MD", "US", 38.934, -76.8966, 23078], ["Windham", "CT", "US", 41.6998, -72.157, 23072], ["Jacksonville Beach", "FL", "US", 30.2947, -81.3931, 23064], ["Calabasas", "CA", "US", 34.1578, -118.6384, 23058], ["Solon", "OH", "US", 41.3898, -81.4412, 23043], ["Chantilly", "VA", "US", 38.8943, -77.4311, 23039], ["Candler-McAfee", "GA", "US", 33.7267, -84.2725, 23025], ["Roselle", "IL", "US", 41.9847, -88.0798, 22994], ["Copiague", "NY", "US", 40.6815, -73.3998, 22993], ["Munster", "IN", "US", 41.5645, -87.5125, 22984], ["Ladera Ranch", "CA", "US", 33.5709, -117.6356, 22980], ["Lisle", "IL", "US", 41.8011, -88.0748, 22964], ["Picnic Point-North Lynnwood", "WA", "US", 47.8628, -122.295, 22953], ["East Naples", "FL", "US", 26.1384, -81.7665, 22951], ["Crystal", "MN", "US", 45.0327, -93.3602, 22943], ["Cloverleaf", "TX", "US", 29.7783, -95.1719, 22942], ["Dixiana", "AL", "US", 33.7402, -86.6494, 22940], ["Highland", "IN", "US", 41.5536, -87.452, 22936], ["Machesney Park", "IL", "US", 42.3472, -89.039, 22927], ["Morgan Park", "IL", "US", 41.6903, -87.6667, 22924], ["Noe Valley", "CA", "US", 37.7502, -122.4337, 22893], ["East Tremont", "NY", "US", 40.8454, -73.891, 22886], ["Pelham", "AL", "US", 33.2857, -86.81, 22885], ["Auburn", "ME", "US", 44.0979, -70.2312, 22871], ["Tremont", "NY", "US", 40.8495, -73.9057, 22870], ["Lincolnia", "VA", "US", 38.8184, -77.1433, 22855], ["Kiryas Joel", "NY", "US", 41.342, -74.1679, 22851], ["Valinda", "CA", "US", 34.0453, -117.9437, 22822], ["Marysville", "OH", "US", 40.2364, -83.3671, 22817], ["Haines City", "FL", "US", 28.1145, -81.6201, 22807], ["Columbus", "NE", "US", 41.4297, -97.3684, 22797], ["Bristol", "RI", "US", 41.6771, -71.2662, 22795], ["Millbrae", "CA", "US", 37.5986, -122.3872, 22795], ["Newberg", "OR", "US", 45.3001, -122.9732, 22780], ["The Crossings", "FL", "US", 25.6707, -80.4012, 22758], ["Valley Station", "KY", "US", 38.1112, -85.8702, 22756], ["Lennox", "CA", "US", 33.9381, -118.3526, 22753], ["East Lake-Orient Park", "FL", "US", 27.9827, -82.3788, 22753], ["Farmington", "MN", "US", 44.6402, -93.1436, 22731], ["Wilsonville", "OR", "US", 45.2998, -122.7737, 22729], ["Hutto", "TX", "US", 30.5427, -97.5467, 22722], ["Bloomingdale", "FL", "US", 27.8936, -82.2404, 22711], ["West Odessa", "TX", "US", 31.8423, -102.4988, 22707], ["Inglewood-Finn Hill", "WA", "US", 47.7205, -122.2317, 22707], ["Oak Harbor", "WA", "US", 48.2932, -122.6432, 22693], ["\u2018Ewa Gentry", "HI", "US", 21.34, -158.0304, 22690], ["Oak Ridge", "FL", "US", 28.4711, -81.4245, 22685], ["Rosemont", "CA", "US", 38.5519, -121.3647, 22681], ["Auburn Hills", "MI", "US", 42.6875, -83.2341, 22672], ["Pottstown", "PA", "US", 40.2454, -75.6496, 22664], ["Leisure City", "FL", "US", 25.4954, -80.4292, 22655], ["West Puente Valley", "CA", "US", 34.0517, -117.9684, 22636], ["Maple Heights", "OH", "US", 41.4153, -81.566, 22631], ["Willoughby", "OH", "US", 41.6398, -81.4065, 22631], ["Benbrook", "TX", "US", 32.6732, -97.4606, 22629], ["Cranford", "NJ", "US", 40.6584, -74.2996, 22627], ["Owen Sound", "ON", "CA", 44.5672, -80.9435, 22625], ["Garden City", "NY", "US", 40.7268, -73.6343, 22612], ["Chambly", "QC", "CA", 45.4501, -73.2825, 22608], ["Sept-\xCEles", "QC", "CA", 50.2001, -66.3821, 22582], ["Farmington", "UT", "US", 40.9805, -111.8874, 22566], ["Wasco", "IL", "US", 41.9381, -88.4045, 22560], ["Hastings", "MN", "US", 44.7433, -92.8524, 22554], ["Avon", "OH", "US", 41.4517, -82.0354, 22544], ["Visitacion Valley", "CA", "US", 37.7171, -122.4043, 22534], ["North Augusta", "SC", "US", 33.5018, -81.9651, 22522], ["Guilford", "CT", "US", 41.289, -72.6818, 22498], ["Cottage Lake", "WA", "US", 47.7443, -122.0773, 22494], ["Corcoran", "CA", "US", 36.098, -119.5604, 22477], ["Melrose", "NY", "US", 40.8246, -73.9104, 22470], ["East Patchogue", "NY", "US", 40.767, -72.9962, 22469], ["West Springfield", "VA", "US", 38.7726, -77.2211, 22460], ["Langford", "BC", "CA", 48.4496, -123.5026, 22459], ["Hudson", "OH", "US", 41.2401, -81.4407, 22437], ["Port Hueneme", "CA", "US", 34.1478, -119.1951, 22423], ["Holiday", "FL", "US", 28.1878, -82.7395, 22403], ["Near South Side", "IL", "US", 41.8567, -87.6248, 22401], ["Radcliff", "KY", "US", 37.8404, -85.9491, 22387], ["Hopewell", "VA", "US", 37.3043, -77.2872, 22378], ["New Castle", "PA", "US", 41.0037, -80.347, 22375], ["Grand Boulevard", "IL", "US", 41.8139, -87.6173, 22373], ["South Elgin", "IL", "US", 41.9942, -88.2923, 22365], ["Prichard", "AL", "US", 30.7388, -88.0789, 22351], ["New Brighton", "MN", "US", 45.0655, -93.2019, 22351], ["Anniston", "AL", "US", 33.6598, -85.8316, 22347], ["Palm Springs", "FL", "US", 26.6359, -80.0961, 22341], ["Ruston", "LA", "US", 32.5232, -92.6379, 22340], ["Wilmington", "MA", "US", 42.5465, -71.1737, 22325], ["Midlothian", "TX", "US", 32.4824, -96.9945, 22318], ["Oxford", "MS", "US", 34.3665, -89.5192, 22314], ["Oakdale", "CA", "US", 37.7666, -120.8471, 22259], ["Darien", "IL", "US", 41.752, -87.974, 22256], ["Bloomingdale", "IL", "US", 41.9575, -88.0809, 22254], ["Venice", "FL", "US", 27.0998, -82.4543, 22211], ["Ludlow", "MA", "US", 42.1601, -72.4759, 22201], ["Duncan", "BC", "CA", 48.7829, -123.7027, 22199], ["South Bradenton", "FL", "US", 27.4631, -82.5818, 22178], ["Hillside", "NJ", "US", 40.7012, -74.2301, 22155], ["North Plainfield", "NJ", "US", 40.6301, -74.4274, 22140], ["Acworth", "GA", "US", 34.0663, -84.6784, 22131], ["Pascagoula", "MS", "US", 30.3658, -88.5561, 22126], ["Sunny Isles Beach", "FL", "US", 25.9506, -80.1228, 22123], ["Roseburg", "OR", "US", 43.2165, -123.3417, 22114], ["Oxford", "OH", "US", 39.507, -84.7452, 22104], ["Merrick", "NY", "US", 40.6629, -73.5515, 22097], ["Somerset", "NJ", "US", 40.4976, -74.4885, 22083], ["Moses Lake", "WA", "US", 47.1301, -119.2781, 22082], ["Saginaw", "TX", "US", 32.8601, -97.3639, 22079], ["Greater Northdale", "FL", "US", 28.1055, -82.5259, 22079], ["Northdale", "FL", "US", 28.0939, -82.5056, 22079], ["Summit", "NJ", "US", 40.7156, -74.3647, 22074], ["Watertown", "SD", "US", 44.8994, -97.1151, 22073], ["Alliance", "OH", "US", 40.9153, -81.1059, 22055], ["LaPorte", "IN", "US", 41.6106, -86.7225, 22053], ["Kalispell", "MT", "US", 48.1958, -114.3129, 22052], ["South Holland", "IL", "US", 41.6009, -87.607, 22043], ["Princeton", "FL", "US", 25.5384, -80.4089, 22038], ["Kenmore", "WA", "US", 47.7573, -122.244, 22030], ["Del City", "OK", "US", 35.442, -97.4409, 22022], ["Derry", "NH", "US", 42.8806, -71.3273, 22015], ["Hamtramck", "MI", "US", 42.3928, -83.0496, 22002], ["Great Kills", "NY", "US", 40.5543, -74.1515, 22e3], ["Wekiwa Springs", "FL", "US", 28.6986, -81.4256, 21998], ["Leesburg", "FL", "US", 28.8108, -81.8779, 21993], ["Duarte", "CA", "US", 34.1394, -117.9773, 21990], ["Converse", "TX", "US", 29.518, -98.3161, 21987], ["Villa Park", "IL", "US", 41.8897, -87.989, 21969], ["Decatur", "GA", "US", 33.7748, -84.2963, 21957], ["Park Forest", "IL", "US", 41.4914, -87.6745, 21954], ["Christiansburg", "VA", "US", 37.1298, -80.4089, 21943], ["Jurupa Valley", "CA", "US", 33.9925, -117.5164, 21930], ["Ashland", "CA", "US", 37.6947, -122.1138, 21925], ["West and East Lealman", "FL", "US", 27.8199, -82.6894, 21924], ["Farragut", "TN", "US", 35.8845, -84.1535, 21919], ["La Porte", "IN", "US", 41.6077, -86.7139, 21916], ["Prairie Village", "KS", "US", 38.9917, -94.6336, 21877], ["Smithfield", "RI", "US", 41.922, -71.5495, 21872], ["Clarksville", "IN", "US", 38.2967, -85.76, 21866], ["Wadsworth", "OH", "US", 41.0256, -81.7298, 21860], ["Camas", "WA", "US", 45.5871, -122.3995, 21846], ["Fort Walton Beach", "FL", "US", 30.4206, -86.6171, 21817], ["Geneva", "IL", "US", 41.8875, -88.3054, 21806], ["Brent", "FL", "US", 30.4688, -87.2361, 21804], ["South Euclid", "OH", "US", 41.5231, -81.5185, 21794], ["Brushy Creek", "TX", "US", 30.5135, -97.7397, 21764], ["La Prairie", "QC", "CA", 45.4168, -73.4992, 21763], ["Windsor", "CO", "US", 40.4775, -104.9014, 21751], ["Westchase", "FL", "US", 28.055, -82.6098, 21747], ["Sugar Hill", "GA", "US", 34.1065, -84.0335, 21747], ["Chillicothe", "OH", "US", 39.3331, -82.9824, 21727], ["South Lake Tahoe", "CA", "US", 38.9332, -119.9844, 21706], ["Anthem", "AZ", "US", 33.8673, -112.1468, 21700], ["West Carson", "CA", "US", 33.8217, -118.2926, 21699], ["Massapequa", "NY", "US", 40.6807, -73.4743, 21685], ["Canton", "MA", "US", 42.1584, -71.1448, 21679], ["Roselle", "NJ", "US", 40.6522, -74.2588, 21670], ["Lincoln", "RI", "US", 41.9211, -71.435, 21670], ["Lumberton", "NC", "US", 34.6183, -79.0105, 21667], ["Taylors", "SC", "US", 34.9204, -82.2962, 21617], ["Yucca Valley", "CA", "US", 34.1142, -116.4322, 21600], ["Tsawwassen", "BC", "CA", 49.0167, -123.0833, 21588], ["Westford", "MA", "US", 42.5793, -71.4378, 21587], ["Edgewater", "FL", "US", 28.9889, -80.9023, 21566], ["Allison Park", "PA", "US", 40.5595, -79.9587, 21552], ["Bay Point", "CA", "US", 38.0291, -121.9616, 21534], ["Portsmouth", "NH", "US", 43.077, -70.7577, 21530], ["Sedalia", "MO", "US", 38.7045, -93.2283, 21516], ["Naples", "FL", "US", 26.1423, -81.796, 21512], ["Patterson", "CA", "US", 37.4716, -121.1297, 21498], ["Greenfield", "IN", "US", 39.785, -85.7694, 21497], ["Waynesboro", "VA", "US", 38.0685, -78.8895, 21491], ["Albertville", "AL", "US", 34.2678, -86.2088, 21462], ["Stoneham", "MA", "US", 42.4801, -71.0995, 21437], ["Perrysburg", "OH", "US", 41.557, -83.6272, 21423], ["Erie", "CO", "US", 40.0503, -105.05, 21420], ["Klamath Falls", "OR", "US", 42.2249, -121.7817, 21399], ["Clinton", "UT", "US", 41.1397, -112.0505, 21399], ["Green Valley", "AZ", "US", 31.8543, -110.9937, 21391], ["Evans", "CO", "US", 40.3764, -104.6922, 21383], ["Mandan", "ND", "US", 46.8267, -100.8896, 21382], ["Lower Sackville", "NS", "CA", 44.776, -63.6786, 21379], ["Winchester", "MA", "US", 42.4523, -71.137, 21374], ["Okemos", "MI", "US", 42.7223, -84.4275, 21369], ["Arnold", "MO", "US", 38.4328, -90.3776, 21357], ["East Moline", "IL", "US", 41.5009, -90.4443, 21350], ["West Pensacola", "FL", "US", 30.4266, -87.2797, 21339], ["Kinston", "NC", "US", 35.2627, -77.5816, 21337], ["Shelbyville", "TN", "US", 35.4834, -86.4603, 21317], ["Marquette", "MI", "US", 46.5435, -87.3954, 21297], ["Fairfield Heights", "IN", "US", 39.8286, -86.3822, 21285], ["Biddeford", "ME", "US", 43.4926, -70.4534, 21282], ["Golden Valley", "MN", "US", 45.0097, -93.3491, 21270], ["Canyon Lake", "TX", "US", 29.8752, -98.2625, 21262], ["Oxford", "AL", "US", 33.6143, -85.835, 21249], ["South Milwaukee", "WI", "US", 42.9106, -87.8606, 21233], ["Marina", "CA", "US", 36.6844, -121.8022, 21229], ["Mukilteo", "WA", "US", 47.9445, -122.3046, 21226], ["Rancho San Diego", "CA", "US", 32.7473, -116.9353, 21208], ["Charleston", "IL", "US", 39.4962, -88.1762, 21196], ["Bedford", "NH", "US", 42.9465, -71.5159, 21188], ["Carrboro", "NC", "US", 35.9101, -79.0753, 21156], ["Crest Hill", "IL", "US", 41.5547, -88.0987, 21153], ["Saint Andrews", "SC", "US", 34.0454, -81.1293, 21151], ["Ashland", "KY", "US", 38.4784, -82.6379, 21108], ["Hays", "KS", "US", 38.8792, -99.3268, 21092], ["Ferguson", "MO", "US", 38.7442, -90.3054, 21059], ["Conway", "SC", "US", 33.836, -79.0478, 21053], ["Laurelton", "NY", "US", 40.6702, -73.7466, 21053], ["Lino Lakes", "MN", "US", 45.1602, -93.0888, 21050], ["West Lake Stevens", "WA", "US", 47.9934, -122.1018, 21047], ["New Hope", "MN", "US", 45.038, -93.3866, 21032], ["Palm River-Clair Mel", "FL", "US", 27.9239, -82.3794, 21024], ["Trussville", "AL", "US", 33.6198, -86.6089, 21023], ["Woodrow", "NY", "US", 40.5434, -74.1976, 21005], ["Keswick", "ON", "CA", 44.2501, -79.4663, 21e3], ["Corinth", "TX", "US", 33.154, -97.0647, 20998], ["Mountlake Terrace", "WA", "US", 47.7882, -122.3087, 20989], ["Chester", "VA", "US", 37.3568, -77.4416, 20987], ["Nixa", "MO", "US", 37.0434, -93.2943, 20984], ["East Ridge", "TN", "US", 35.0142, -85.2519, 20979], ["Varennes", "QC", "CA", 45.6834, -73.4325, 20950], ["Plainview", "TX", "US", 34.1848, -101.7068, 20919], ["Grayslake", "IL", "US", 42.3445, -88.0417, 20915], ["Agoura Hills", "CA", "US", 34.1364, -118.7745, 20915], ["Acton", "MA", "US", 42.4851, -71.4328, 20897], ["Sanford", "ME", "US", 43.4393, -70.7742, 20893], ["Silver Firs", "WA", "US", 47.866, -122.1551, 20891], ["Hauppauge", "NY", "US", 40.8257, -73.2026, 20882], ["K\u012Bhei", "HI", "US", 20.7646, -156.4458, 20881], ["South El Monte", "CA", "US", 34.0519, -118.0467, 20878], ["Arvin", "CA", "US", 35.2091, -118.8284, 20876], ["Johnston", "IA", "US", 41.673, -93.6977, 20871], ["Gardner", "KS", "US", 38.8108, -94.9272, 20868], ["Lathrop", "CA", "US", 37.8227, -121.2766, 20866], ["Ashland", "OR", "US", 42.1946, -122.7095, 20861], ["Sidney", "OH", "US", 40.2842, -84.1555, 20858], ["Birmingham", "MI", "US", 42.5467, -83.2113, 20857], ["Sweetwater", "FL", "US", 25.7634, -80.3731, 20840], ["Milwaukie", "OR", "US", 45.4462, -122.6393, 20830], ["East Millcreek", "UT", "US", 40.7, -111.8105, 20816], ["Grand Island", "NY", "US", 43.0331, -78.9625, 20813], ["Union City", "GA", "US", 33.5871, -84.5424, 20805], ["Woodlawn", "VA", "US", 38.7168, -77.1328, 20804], ["Clarence-Rockland", "ON", "CA", 45.5501, -75.291, 20790], ["Piqua", "OH", "US", 40.1448, -84.2424, 20790], ["Lomita", "CA", "US", 33.7922, -118.3151, 20785], ["Cockeysville", "MD", "US", 39.4812, -76.6439, 20776], ["Easley", "SC", "US", 34.8298, -82.6015, 20765], ["New Springville", "NY", "US", 40.5934, -74.1632, 20756], ["Pleasantville", "NJ", "US", 39.3898, -74.524, 20755], ["Liberal", "KS", "US", 37.0431, -100.921, 20746], ["Palisades Park", "NJ", "US", 40.8482, -73.9976, 20743], ["Jenks", "OK", "US", 36.0229, -95.9683, 20740], ["Simpsonville", "SC", "US", 34.7371, -82.2543, 20736], ["Latham", "NY", "US", 42.747, -73.759, 20736], ["Darien", "CT", "US", 41.0787, -73.4693, 20732], ["Pleasant Prairie", "WI", "US", 42.5531, -87.9334, 20726], ["Port Alberni", "BC", "CA", 49.2413, -124.8028, 20712], ["Mountain Brook", "AL", "US", 33.5009, -86.7522, 20691], ["Chambersburg", "PA", "US", 39.9376, -77.6611, 20691], ["Adrian", "MI", "US", 41.8976, -84.0372, 20691], ["West Melbourne", "FL", "US", 28.0717, -80.6534, 20679], ["East Garfield Park", "IL", "US", 41.8809, -87.7028, 20656], ["Rotterdam", "NY", "US", 42.787, -73.971, 20652], ["Truro", "NS", "CA", 45.3668, -63.2654, 20650], ["Lakeside", "CA", "US", 32.8573, -116.9223, 20648], ["Bethany", "OR", "US", 45.5579, -122.8676, 20646], ["Lake Worth Corridor", "FL", "US", 26.6165, -80.101, 20635], ["Winter Gardens", "CA", "US", 32.8312, -116.9334, 20631], ["Lockport", "NY", "US", 43.1706, -78.6903, 20624], ["Lebanon", "OH", "US", 39.4353, -84.203, 20623], ["Wade Hampton", "SC", "US", 34.9037, -82.3332, 20622], ["Murphy", "TX", "US", 33.0151, -96.6131, 20610], ["Coralville", "IA", "US", 41.6764, -91.5804, 20608], ["Ensley", "FL", "US", 30.5188, -87.2728, 20602], ["Sapulpa", "OK", "US", 35.9987, -96.1142, 20579], ["American Canyon", "CA", "US", 38.1749, -122.2608, 20554], ["South San Jose Hills", "CA", "US", 34.0128, -117.9048, 20551], ["Belton", "TX", "US", 31.056, -97.4644, 20547], ["Agoura", "CA", "US", 34.1431, -118.7379, 20537], ["Bayville", "NJ", "US", 39.9093, -74.1549, 20512], ["Westmount", "QC", "CA", 45.4834, -73.5992, 20494], ["Kirkland", "QC", "CA", 45.4501, -73.8659, 20491], ["Arbutus", "MD", "US", 39.2546, -76.7, 20483], ["Hammond", "LA", "US", 30.5046, -90.4629, 20480], ["Libertyville", "IL", "US", 42.2831, -87.9531, 20436], ["Pittsburg", "KS", "US", 37.4109, -94.705, 20409], ["Portsmouth", "OH", "US", 38.7317, -82.9977, 20409], ["Granite Bay", "CA", "US", 38.7632, -121.1638, 20402], ["Louisville", "CO", "US", 39.9778, -105.1319, 20396], ["Northfield", "MN", "US", 44.4583, -93.1616, 20380], ["Rocky River", "OH", "US", 41.4756, -81.8393, 20376], ["Raymore", "MO", "US", 38.8019, -94.4527, 20374], ["Middletown", "DE", "US", 39.4496, -75.7163, 20372], ["Havelock", "NC", "US", 34.879, -76.9013, 20364], ["Lindsay", "ON", "CA", 44.3501, -78.7329, 20354], ["Harvey", "LA", "US", 29.9035, -90.0773, 20348], ["Gardner", "MA", "US", 42.5751, -71.9981, 20333], ["Golden", "CO", "US", 39.7555, -105.2211, 20330], ["Douglas", "IL", "US", 41.8348, -87.6181, 20323], ["Cartersville", "GA", "US", 34.1653, -84.8023, 20319], ["Ashland", "OH", "US", 40.8687, -82.3182, 20317], ["Oakleaf Plantation", "FL", "US", 30.1708, -81.8355, 20315], ["Affton", "MO", "US", 38.5506, -90.3332, 20307], ["Ramona", "CA", "US", 33.0417, -116.8681, 20292], ["Cambria Heights", "NY", "US", 40.6945, -73.7385, 20287], ["Elmwood Park", "NJ", "US", 40.904, -74.1185, 20279], ["Elko", "NV", "US", 40.8324, -115.7631, 20279], ["Hollis", "NY", "US", 40.7134, -73.7671, 20269], ["Brooklyn Heights", "NY", "US", 40.6954, -73.9938, 20256], ["Nogales", "AZ", "US", 31.3404, -110.9343, 20252], ["Parma Heights", "OH", "US", 41.3901, -81.7596, 20246], ["La Ca\xF1ada Flintridge", "CA", "US", 34.1992, -118.1878, 20246], ["Mustang", "OK", "US", 35.3842, -97.7245, 20226], ["Rose Hill", "VA", "US", 38.7887, -77.1128, 20226], ["East Northport", "NY", "US", 40.8768, -73.3246, 20217], ["Glen Avon", "CA", "US", 34.0117, -117.4848, 20199], ["Sulphur", "LA", "US", 30.2366, -93.3774, 20189], ["Shelby", "NC", "US", 35.2923, -81.5357, 20189], ["Montville Center", "CT", "US", 41.479, -72.1512, 20180], ["Ferndale", "MI", "US", 42.4606, -83.1346, 20177], ["South Saint Paul", "MN", "US", 44.8927, -93.0349, 20160], ["Lynn Haven", "FL", "US", 30.2455, -85.6483, 20156], ["Lents", "OR", "US", 45.4798, -122.5673, 20156], ["Lake Ronkonkoma", "NY", "US", 40.8351, -73.1312, 20155], ["Lexington", "SC", "US", 33.9815, -81.2362, 20138], ["Murrysville", "PA", "US", 40.4284, -79.6976, 20134], ["Cumberland", "MD", "US", 39.6529, -78.7625, 20130], ["Stephenville", "TX", "US", 32.2207, -98.2023, 20120], ["Oregon", "OH", "US", 41.6437, -83.4869, 20102], ["Eastmont", "WA", "US", 47.8974, -122.1815, 20101], ["Monroe", "MI", "US", 41.9164, -83.3977, 20092], ["Coconut Grove", "FL", "US", 25.7126, -80.257, 20076], ["West Mifflin", "PA", "US", 40.3634, -79.8664, 20075], ["Mill Creek", "WA", "US", 47.8601, -122.2043, 20043], ["Pace", "FL", "US", 30.5994, -87.1611, 20039], ["Miamisburg", "OH", "US", 39.6428, -84.2866, 20034], ["Palm Valley", "FL", "US", 30.1775, -81.3876, 20019], ["Rolla", "MO", "US", 37.9514, -91.7713, 20019], ["Tukwila", "WA", "US", 47.474, -122.261, 20018], ["Cole Harbour", "NS", "CA", 44.6724, -63.4751, 2e4], ["DeBary", "FL", "US", 28.8831, -81.3087, 19998], ["Lyndhurst", "NJ", "US", 40.812, -74.1243, 19996], ["Lake Zurich", "IL", "US", 42.197, -88.0934, 19993], ["Germantown", "WI", "US", 43.2286, -88.1104, 19993], ["Bryant", "AR", "US", 34.5959, -92.4891, 19986], ["Eustis", "FL", "US", 28.8528, -81.6853, 19986], ["Universal City", "TX", "US", 29.548, -98.2911, 19986], ["Glace Bay", "NS", "CA", 46.197, -59.957, 19968], ["Newburg", "KY", "US", 38.1601, -85.6597, 19967], ["Johnstown", "PA", "US", 40.3267, -78.922, 19966], ["Socastee", "SC", "US", 33.6835, -78.9984, 19952], ["Ypsilanti", "MI", "US", 42.2411, -83.613, 19945], ["North Bellmore", "NY", "US", 40.6915, -73.5335, 19941], ["King of Prussia", "PA", "US", 40.0893, -75.396, 19936], ["Hayesville", "OR", "US", 44.986, -122.9829, 19936], ["Warrensburg", "MO", "US", 38.7628, -93.7361, 19927], ["Mokena", "IL", "US", 41.5261, -87.8892, 19923], ["Norwood", "OH", "US", 39.1556, -84.4597, 19915], ["Mariners Harbor", "NY", "US", 40.6368, -74.1587, 19905], ["Bonney Lake", "WA", "US", 47.1771, -122.1865, 19903], ["Dickinson", "TX", "US", 29.4608, -95.0513, 19895], ["Clifton", "CO", "US", 39.0919, -108.449, 19889], ["Lealman", "FL", "US", 27.8211, -82.6793, 19879], ["Hermosa Beach", "CA", "US", 33.8622, -118.3995, 19860], ["Selden", "NY", "US", 40.8665, -73.0357, 19851], ["Clemmons", "NC", "US", 36.0215, -80.382, 19844], ["West Chester", "PA", "US", 39.961, -75.608, 19842], ["Evergreen Park", "IL", "US", 41.7206, -87.7017, 19841], ["Southbury", "CT", "US", 41.4815, -73.2132, 19836], ["Baldwin", "PA", "US", 40.3381, -79.9789, 19819], ["Marblehead", "MA", "US", 42.5001, -70.8578, 19808], ["Norton", "MA", "US", 41.9668, -71.187, 19808], ["Plattsburgh", "NY", "US", 44.6995, -73.4529, 19806], ["North Salt Lake", "UT", "US", 40.8486, -111.9069, 19796], ["Sand Springs", "OK", "US", 36.1398, -96.1089, 19783], ["Painesville", "OH", "US", 41.7245, -81.2457, 19776], ["Greenfield", "MA", "US", 42.5876, -72.5995, 19753], ["Pickerington", "OH", "US", 39.8842, -82.7535, 19745], ["New Canaan", "CT", "US", 41.1468, -73.4948, 19738], ["Albany", "CA", "US", 37.8869, -122.2977, 19735], ["Snellville", "GA", "US", 33.8573, -84.0199, 19733], ["Sparta", "NJ", "US", 41.0334, -74.6385, 19722], ["Columbia Heights", "MN", "US", 45.0408, -93.263, 19715], ["Holtsville", "NY", "US", 40.8154, -73.0451, 19714], ["Salmon Creek", "WA", "US", 45.7107, -122.649, 19686], ["La Crescenta-Montrose", "CA", "US", 34.2322, -118.2353, 19653], ["Spanish Lake", "MO", "US", 38.7878, -90.2159, 19650], ["Willmar", "MN", "US", 45.1219, -95.0433, 19638], ["Tysons Corner", "VA", "US", 38.9187, -77.2311, 19627], ["Forest Lake", "MN", "US", 45.2789, -92.9852, 19618], ["Bethany", "OK", "US", 35.5187, -97.6323, 19589], ["Huntsville", "ON", "CA", 45.3334, -79.2163, 19579], ["Sun City", "CA", "US", 33.7092, -117.1973, 19579], ["Montclair", "VA", "US", 38.611, -77.3397, 19570], ["Lynbrook", "NY", "US", 40.6548, -73.6718, 19558], ["Orchards", "WA", "US", 45.6665, -122.5609, 19556], ["Eastchester", "NY", "US", 40.9583, -73.8086, 19554], ["Payson", "UT", "US", 40.0444, -111.7322, 19548], ["West Saint Paul", "MN", "US", 44.9161, -93.1016, 19540], ["Madisonville", "KY", "US", 37.3281, -87.4989, 19539], ["Ives Estates", "FL", "US", 25.9623, -80.1767, 19525], ["Selma", "AL", "US", 32.4074, -87.0211, 19519], ["Papillion", "NE", "US", 41.1544, -96.0422, 19510], ["Montgomery", "IL", "US", 41.7306, -88.3459, 19489], ["Badger", "AK", "US", 64.8, -147.5333, 19482], ["Seymour", "IN", "US", 38.9592, -85.8902, 19478], ["Lake Shore", "MD", "US", 39.1071, -76.485, 19477], ["McKeesport", "PA", "US", 40.3479, -79.8642, 19453], ["Pinecrest", "FL", "US", 25.667, -80.3081, 19452], ["Weirton Heights", "WV", "US", 40.4084, -80.5392, 19450], ["Port Angeles", "WA", "US", 48.1181, -123.4307, 19448], ["Terrace", "BC", "CA", 54.5163, -128.6035, 19443], ["North Battleford", "SK", "CA", 52.7797, -108.2967, 19440], ["Hazel Dell", "WA", "US", 45.6715, -122.6629, 19435], ["Angleton", "TX", "US", 29.1694, -95.4319, 19429], ["Fernley", "NV", "US", 39.608, -119.2518, 19418], ["Alice", "TX", "US", 27.7523, -98.0697, 19408], ["Lake Forest", "IL", "US", 42.2586, -87.8406, 19408], ["Battle Ground", "WA", "US", 45.7809, -122.5334, 19407], ["Dixon", "CA", "US", 38.4455, -121.8233, 19390], ["Forest Park", "GA", "US", 33.6221, -84.3691, 19383], ["Mamaroneck", "NY", "US", 40.9487, -73.7326, 19375], ["Homewood", "IL", "US", 41.5573, -87.6656, 19373], ["Bear", "DE", "US", 39.6293, -75.6583, 19371], ["Bayou Cane", "LA", "US", 29.6241, -90.7512, 19355], ["Orange", "TX", "US", 30.093, -93.7365, 19347], ["Alsip", "IL", "US", 41.6689, -87.7387, 19346], ["Lutz", "FL", "US", 28.1511, -82.4615, 19344], ["Green Haven", "MD", "US", 39.1395, -76.5477, 19326], ["Lexington", "NC", "US", 35.824, -80.2534, 19326], ["Bellwood", "IL", "US", 41.8814, -87.8831, 19308], ["Clayton", "NC", "US", 35.6507, -78.4564, 19304], ["Central Falls", "RI", "US", 41.8907, -71.3923, 19303], ["Sun Valley", "NV", "US", 39.5963, -119.776, 19299], ["Horizon City", "TX", "US", 31.6926, -106.2075, 19288], ["Sherwood", "OR", "US", 45.3565, -122.8401, 19283], ["Waterford", "CT", "US", 41.3417, -72.136, 19281], ["Orinda", "CA", "US", 37.8772, -122.1797, 19279], ["Pinole", "CA", "US", 38.0044, -122.2989, 19269], ["Woodbridge", "NJ", "US", 40.5576, -74.2846, 19265], ["Sun City Center", "FL", "US", 27.7181, -82.3518, 19258], ["Rosedale", "MD", "US", 39.3201, -76.5155, 19257], ["Altamont", "OR", "US", 42.2068, -121.7372, 19257], ["Howard", "WI", "US", 44.5436, -88.0882, 19250], ["Alamo", "TX", "US", 26.1837, -98.1231, 19246], ["Broadview Heights", "OH", "US", 41.3139, -81.6851, 19229], ["Upper Saint Clair", "PA", "US", 40.3359, -80.0834, 19229], ["Haslett", "MI", "US", 42.747, -84.4011, 19220], ["West Elsdon", "IL", "US", 41.7939, -87.7245, 19219], ["Newton", "KS", "US", 38.0467, -97.345, 19216], ["Glassboro", "NJ", "US", 39.7029, -75.1118, 19216], ["Altus", "OK", "US", 34.6381, -99.334, 19214], ["Blythe", "CA", "US", 33.6103, -114.5964, 19208], ["Silverdale", "WA", "US", 47.6445, -122.6949, 19204], ["Covington", "WA", "US", 47.3582, -122.1222, 19197], ["Matteson", "IL", "US", 41.5039, -87.7131, 19195], ["Beaconsfield", "QC", "CA", 45.4334, -73.8659, 19194], ["Tumwater", "WA", "US", 47.0073, -122.9093, 19190], ["Old Jamestown", "MO", "US", 38.8349, -90.2851, 19184], ["Weirton", "WV", "US", 40.419, -80.5895, 19175], ["White Oak", "OH", "US", 39.2131, -84.5994, 19167], ["Carlisle", "PA", "US", 40.2015, -77.1889, 19143], ["Mineola", "NY", "US", 40.7493, -73.6407, 19139], ["Shelbyville", "IN", "US", 39.5214, -85.7769, 19133], ["Tullahoma", "TN", "US", 35.362, -86.2094, 19128], ["Ozark", "MO", "US", 37.0209, -93.206, 19120], ["Secaucus", "NJ", "US", 40.7895, -74.0565, 19104], ["Jacksonville", "IL", "US", 39.7339, -90.229, 19103], ["Fairwood", "WA", "US", 47.4484, -122.1573, 19102], ["Madison", "CT", "US", 41.2795, -72.5984, 19100], ["Camp Springs", "MD", "US", 38.804, -76.9066, 19096], ["Ronkonkoma", "NY", "US", 40.8154, -73.1123, 19082], ["Saco", "ME", "US", 43.5009, -70.4428, 19078], ["Maple Shade", "NJ", "US", 39.9526, -74.9924, 19077], ["Hawthorne", "NJ", "US", 40.9493, -74.1538, 19074], ["Fresno", "TX", "US", 29.5389, -95.4474, 19069], ["East Massapequa", "NY", "US", 40.6734, -73.4365, 19069], ["Amherst Center", "MA", "US", 42.3754, -72.5192, 19065], ["Montrose", "CO", "US", 38.4783, -107.8762, 19062], ["Brownwood", "TX", "US", 31.7093, -98.9912, 19031], ["Southbridge", "MA", "US", 42.0751, -72.0334, 19030], ["Deerfield", "IL", "US", 42.1711, -87.8445, 19019], ["Castaic", "CA", "US", 34.4889, -118.6229, 19015], ["Ennis", "TX", "US", 32.3293, -96.6253, 19007], ["Ellensburg", "WA", "US", 46.9965, -120.5478, 19001], ["Claremore", "OK", "US", 36.3126, -95.6161, 18997], ["Waukee", "IA", "US", 41.6117, -93.8852, 18990], ["Jasmine Estates", "FL", "US", 28.2931, -82.6901, 18989], ["Melville", "NY", "US", 40.7934, -73.4151, 18985], ["Kew Gardens", "NY", "US", 40.7143, -73.831, 18983], ["Middleton", "WI", "US", 43.0972, -89.5043, 18979], ["Bartow", "FL", "US", 27.8964, -81.8431, 18972], ["Sylvania", "OH", "US", 41.7189, -83.713, 18965], ["Rio Rico", "AZ", "US", 31.4715, -110.9765, 18962], ["Murray", "KY", "US", 36.6103, -88.3148, 18954], ["Arlington", "WA", "US", 48.1987, -122.1251, 18949], ["North Druid Hills", "GA", "US", 33.8168, -84.3133, 18947], ["Brookfield", "IL", "US", 41.8239, -87.8517, 18944], ["North Bay Shore", "NY", "US", 40.7362, -73.2626, 18944], ["Mont-Royal", "QC", "CA", 45.5168, -73.6492, 18933], ["Milledgeville", "GA", "US", 33.0801, -83.2321, 18931], ["Beloeil", "QC", "CA", 45.5684, -73.2057, 18927], ["Stillwater", "MN", "US", 45.0564, -92.806, 18924], ["Cortland", "NY", "US", 42.6012, -76.1805, 18907], ["Berea", "OH", "US", 41.3662, -81.8543, 18874], ["Twinsburg", "OH", "US", 41.3126, -81.4401, 18872], ["Wantagh", "NY", "US", 40.6837, -73.5101, 18871], ["West Hempstead", "NY", "US", 40.7048, -73.6501, 18862], ["Ansonia", "CT", "US", 41.3462, -73.079, 18854], ["Troy", "AL", "US", 31.8088, -85.9699, 18853], ["Mayfield Heights", "OH", "US", 41.5192, -81.4579, 18840], ["Laurel", "MS", "US", 31.6941, -89.1306, 18837], ["Syosset", "NY", "US", 40.8262, -73.5021, 18829], ["Alliston", "ON", "CA", 44.1501, -79.8663, 18809], ["Brook Park", "OH", "US", 41.3984, -81.8046, 18809], ["Union Hill-Novelty Hill", "WA", "US", 47.6789, -122.0283, 18805], ["Erlanger", "KY", "US", 39.0167, -84.6008, 18797], ["Rossville", "NY", "US", 40.5557, -74.2135, 18792], ["South Burlington", "VT", "US", 44.467, -73.171, 18791], ["Mount Greenwood", "IL", "US", 41.6981, -87.7087, 18783], ["Casa de Oro-Mount Helix", "CA", "US", 32.764, -116.9688, 18762], ["Langley Park", "MD", "US", 38.9887, -76.9814, 18755], ["Brigham City", "UT", "US", 41.5102, -112.0155, 18752], ["Thomasville", "GA", "US", 30.8366, -83.9788, 18742], ["Fairmont", "WV", "US", 39.4851, -80.1426, 18733], ["Fairhope", "AL", "US", 30.523, -87.9033, 18730], ["Greater Upper Marlboro", "MD", "US", 38.8314, -76.7483, 18720], ["Frederickson", "WA", "US", 47.0962, -122.3587, 18719], ["Iselin", "NJ", "US", 40.5754, -74.3224, 18695], ["Suwanee", "GA", "US", 34.0515, -84.0713, 18694], ["Whitehall", "OH", "US", 39.9667, -82.8855, 18694], ["Corner Brook", "NL", "CA", 48.95, -57.952, 18693], ["Rutherford", "NJ", "US", 40.8265, -74.1068, 18690], ["Islip", "NY", "US", 40.7298, -73.2104, 18689], ["Forest Park", "OH", "US", 39.2903, -84.5041, 18676], ["Westminster", "MD", "US", 39.5754, -76.9958, 18670], ["New Glasgow", "NS", "CA", 45.5834, -62.6486, 18665], ["Frankfort", "IL", "US", 41.4959, -87.8487, 18653], ["Niles", "OH", "US", 41.1828, -80.7654, 18651], ["Marshfield", "WI", "US", 44.6688, -90.1718, 18620], ["Cranbrook", "BC", "CA", 49.4999, -115.7688, 18610], ["Lorton", "VA", "US", 38.7043, -77.2278, 18610], ["Port Colborne", "ON", "CA", 42.9001, -79.2329, 18599], ["Morristown", "NJ", "US", 40.7968, -74.4815, 18594], ["Rivi\xE8re-du-Loup", "QC", "CA", 47.827, -69.5424, 18586], ["Gautier", "MS", "US", 30.3858, -88.6117, 18570], ["Bourbonnais", "IL", "US", 41.1538, -87.8875, 18569], ["Goodings Grove", "IL", "US", 41.6292, -87.9309, 18569], ["Dieppe", "NB", "CA", 46.0784, -64.6873, 18565], ["Macomb", "IL", "US", 40.4592, -90.6718, 18547], ["Point Pleasant", "NJ", "US", 40.0832, -74.0682, 18523], ["Bellaire", "TX", "US", 29.7058, -95.4588, 18518], ["El Reno", "OK", "US", 35.5323, -97.955, 18516], ["Chowchilla", "CA", "US", 37.123, -120.2602, 18510], ["Mead Valley", "CA", "US", 33.8334, -117.2961, 18510], ["Hyattsville", "MD", "US", 38.9559, -76.9455, 18501], ["Happy Valley", "OR", "US", 45.4468, -122.5304, 18493], ["Augusta", "ME", "US", 44.3106, -69.7795, 18471], ["Onalaska", "WI", "US", 43.8844, -91.2351, 18468], ["Round Lake", "IL", "US", 42.3534, -88.0934, 18461], ["Stafford", "TX", "US", 29.6161, -95.5577, 18459], ["Yorkville", "IL", "US", 41.6411, -88.4473, 18451], ["Winchester", "KY", "US", 37.9901, -84.1796, 18446], ["North Ogden", "UT", "US", 41.3072, -111.9602, 18446], ["Bensenville", "IL", "US", 41.955, -87.9401, 18440], ["Forney", "TX", "US", 32.7482, -96.4719, 18418], ["Monsey", "NY", "US", 41.1112, -74.0685, 18412], ["Fern Creek", "KY", "US", 38.1598, -85.5877, 18409], ["Shenandoah", "LA", "US", 30.4013, -91.0009, 18399], ["El Dorado", "AR", "US", 33.2076, -92.6663, 18386], ["Trenton", "MI", "US", 42.1395, -83.1783, 18380], ["Ashtabula", "OH", "US", 41.865, -80.7898, 18371], ["Natchitoches", "LA", "US", 31.7607, -93.0863, 18365], ["Cudahy", "WI", "US", 42.9597, -87.8615, 18353], ["Dover", "NJ", "US", 40.884, -74.5621, 18346], ["Ottawa", "IL", "US", 41.3456, -88.8426, 18342], ["Shafter", "CA", "US", 35.5005, -119.2718, 18336], ["Amesbury", "MA", "US", 42.8584, -70.93, 18313], ["Franklin Park", "IL", "US", 41.9353, -87.8656, 18312], ["Meadowbrook", "VA", "US", 37.4488, -77.4735, 18312], ["McAlester", "OK", "US", 34.9334, -95.7697, 18310], ["Punta Gorda Isles", "FL", "US", 26.9176, -82.0784, 18306], ["Palestine", "TX", "US", 31.7621, -95.6308, 18288], ["Sherrelwood", "CO", "US", 39.8378, -105.0014, 18287], ["Creve Coeur", "MO", "US", 38.6609, -90.4226, 18276], ["Ballenger Creek", "MD", "US", 39.3726, -77.4353, 18274], ["Cinco Ranch", "TX", "US", 29.7388, -95.758, 18274], ["Helena", "AL", "US", 33.2962, -86.8436, 18264], ["Palmer", "MA", "US", 42.1584, -72.3287, 18261], ["Belle Glade", "FL", "US", 26.6845, -80.6676, 18251], ["Makakilo", "HI", "US", 21.3524, -158.0865, 18248], ["Franconia", "VA", "US", 38.7821, -77.1464, 18245], ["Eastlake", "OH", "US", 41.6539, -81.4504, 18232], ["Manchester", "MO", "US", 38.597, -90.5093, 18229], ["Cameron Park", "CA", "US", 38.6688, -120.9872, 18228], ["Thorold", "ON", "CA", 43.1168, -79.1996, 18224], ["Steubenville", "OH", "US", 40.3698, -80.634, 18219], ["Springboro", "OH", "US", 39.5523, -84.2333, 18213], ["Wallingford Center", "CT", "US", 41.4499, -72.8189, 18209], ["Lanham-Seabrook", "MD", "US", 38.9684, -76.8511, 18190], ["Clark-Fulton", "OH", "US", 41.464, -81.7098, 18185], ["Farmington", "MO", "US", 37.7809, -90.4218, 18181], ["Pampa", "TX", "US", 35.5362, -100.9599, 18177], ["Somerset", "MA", "US", 41.7696, -71.1287, 18165], ["Florida Ridge", "FL", "US", 27.5803, -80.3867, 18164], ["Five Corners", "WA", "US", 45.6846, -122.5751, 18159], ["Boone", "NC", "US", 36.2168, -81.6745, 18156], ["Seminole", "FL", "US", 27.8397, -82.7912, 18153], ["Punta Gorda", "FL", "US", 26.9298, -82.0454, 18150], ["Rosamond", "CA", "US", 34.8641, -118.1634, 18150], ["Miramichi", "NB", "CA", 47.029, -65.5019, 18129], ["Cutler", "FL", "US", 25.6151, -80.3106, 18117], ["Mattoon", "IL", "US", 39.4831, -88.3728, 18113], ["Arroyo Grande", "CA", "US", 35.1186, -120.5907, 18108], ["Cobourg", "ON", "CA", 43.9598, -78.1651, 18099], ["Monroe", "WA", "US", 47.8554, -121.971, 18090], ["Dorval", "QC", "CA", 45.4473, -73.7533, 18088], ["Rancho Mirage", "CA", "US", 33.7397, -116.4128, 18083], ["Limerick", "PA", "US", 40.2309, -75.5221, 18074], ["Wilton", "CT", "US", 41.1954, -73.4379, 18062], ["Huntington", "NY", "US", 40.8681, -73.4257, 18046], ["Ojus", "FL", "US", 25.9484, -80.1506, 18036], ["Santa Fe Springs", "CA", "US", 33.9472, -118.0854, 18026], ["Oak Bay", "BC", "CA", 48.4496, -123.3026, 18015], ["Vincennes", "IN", "US", 38.6773, -87.5286, 18012], ["Amsterdam", "NY", "US", 42.9387, -74.1882, 18008], ["Durango", "CO", "US", 37.2753, -107.8801, 18006], ["Dumont", "NJ", "US", 40.9406, -73.9968, 18001], ["Hanahan", "SC", "US", 32.9185, -80.022, 17997], ["Central Point", "OR", "US", 42.376, -122.9164, 17995], ["Highland", "UT", "US", 40.4255, -111.7945, 17989], ["Elizabeth City", "NC", "US", 36.2946, -76.2511, 17988], ["Newburyport", "MA", "US", 42.8126, -70.8773, 17982], ["Rockland", "MA", "US", 42.1307, -70.9162, 17982], ["Westbrook", "ME", "US", 43.677, -70.3712, 17978], ["St. Marys", "GA", "US", 30.7305, -81.5465, 17968], ["Cary", "IL", "US", 42.212, -88.2381, 17965], ["Lackawanna", "NY", "US", 42.8256, -78.8234, 17965], ["Westerly", "RI", "US", 41.3776, -71.8273, 17936], ["Maumelle", "AR", "US", 34.8668, -92.4043, 17931], ["Leland", "NC", "US", 34.2563, -78.0447, 17924], ["Amos", "QC", "CA", 48.5669, -78.1162, 17918], ["Wisconsin Rapids", "WI", "US", 44.3836, -89.8174, 17897], ["Lenoir", "NC", "US", 35.914, -81.539, 17888], ["North Massapequa", "NY", "US", 40.7009, -73.4621, 17886], ["Scarsdale", "NY", "US", 41.0051, -73.7846, 17885], ["Nanuet", "NY", "US", 41.0887, -74.0135, 17882], ["Gretna", "LA", "US", 29.9147, -90.054, 17880], ["Sheridan", "WY", "US", 44.7972, -106.9562, 17873], ["North Amityville", "NY", "US", 40.6976, -73.4251, 17862], ["Arcata", "CA", "US", 40.8665, -124.0828, 17843], ["Hannibal", "MO", "US", 39.7084, -91.3585, 17839], ["Wahiaw\u0101", "HI", "US", 21.5028, -158.0246, 17821], ["Colonial Heights", "VA", "US", 37.268, -77.4073, 17820], ["Marion", "IL", "US", 37.7306, -88.9331, 17803], ["Colonia", "NJ", "US", 40.5746, -74.3021, 17795], ["Logansport", "IN", "US", 40.7545, -86.3567, 17793], ["Oswego", "NY", "US", 43.4554, -76.5105, 17787], ["Linda", "CA", "US", 39.1277, -121.5508, 17773], ["Tinton Falls", "NJ", "US", 40.3043, -74.1004, 17772], ["Godfrey", "IL", "US", 38.9556, -90.1868, 17759], ["Portsmouth", "RI", "US", 41.6023, -71.2503, 17756], ["West Garfield Park", "IL", "US", 41.8806, -87.7292, 17742], ["Willimantic", "CT", "US", 41.7107, -72.2081, 17737], ["Calverton", "MD", "US", 39.0576, -76.9358, 17724], ["Oxon Hill", "MD", "US", 38.8034, -76.9897, 17722], ["Takoma Park", "MD", "US", 38.9779, -77.0075, 17713], ["Wallingford", "CT", "US", 41.457, -72.8232, 17712], ["Sycamore", "IL", "US", 41.9889, -88.6868, 17712], ["Cocoa", "FL", "US", 28.3861, -80.742, 17711], ["Martinsburg", "WV", "US", 39.4562, -77.9639, 17700], ["Marco Island", "FL", "US", 25.9412, -81.7184, 17690], ["Tiffin", "OH", "US", 41.1145, -83.178, 17687], ["Albert Lea", "MN", "US", 43.648, -93.3683, 17674], ["South Hadley", "MA", "US", 42.2584, -72.5745, 17652], ["Shaw", "DC", "US", 38.9121, -77.0214, 17639], ["Ocean Springs", "MS", "US", 30.4113, -88.8278, 17636], ["Hinsdale", "IL", "US", 41.8009, -87.937, 17628], ["New Castle", "IN", "US", 39.9289, -85.3702, 17621], ["Winthrop", "MA", "US", 42.3751, -70.9828, 17618], ["Lindenwold", "NJ", "US", 39.8243, -74.9977, 17613], ["Kenwood", "IL", "US", 41.8092, -87.5975, 17601], ["Bay City", "TX", "US", 28.9828, -95.9694, 17598], ["Hopkins", "MN", "US", 44.925, -93.4627, 17591], ["Squamish", "BC", "CA", 49.6992, -123.1563, 17587], ["Allendale", "MI", "US", 42.9723, -85.9536, 17579], ["Menasha", "WI", "US", 44.2022, -88.4465, 17572], ["Palos Hills", "IL", "US", 41.6967, -87.817, 17565], ["Prunedale", "CA", "US", 36.7758, -121.6697, 17560], ["Culpeper", "VA", "US", 38.4732, -77.9967, 17557], ["Stevenson Ranch", "CA", "US", 34.3905, -118.5737, 17557], ["South Houston", "TX", "US", 29.663, -95.2355, 17544], ["Kirksville", "MO", "US", 40.1947, -92.5833, 17520], ["Tallmadge", "OH", "US", 41.1014, -81.4418, 17512], ["North Babylon", "NY", "US", 40.7165, -73.3218, 17509], ["Mesquite", "NV", "US", 36.8055, -114.0672, 17496], ["New Philadelphia", "OH", "US", 40.4898, -81.4457, 17484], ["Saint Matthews", "KY", "US", 38.2529, -85.6558, 17472], ["Maitland", "FL", "US", 28.6278, -81.3631, 17463], ["North Aurora", "IL", "US", 41.8061, -88.3273, 17456], ["Safety Harbor", "FL", "US", 27.9908, -82.6932, 17454], ["Valley East", "ON", "CA", 46.6677, -81.0003, 17451], ["North Canton", "OH", "US", 40.8759, -81.4023, 17441], ["East Hemet", "CA", "US", 33.74, -116.9389, 17418], ["Pitt Meadows", "BC", "CA", 49.2212, -122.6897, 17410], ["White Oak", "MD", "US", 39.0398, -76.993, 17403], ["Radford", "VA", "US", 37.1318, -80.5764, 17403], ["Deux-Montagnes", "QC", "CA", 45.5346, -73.9017, 17402], ["Fort St. John", "BC", "CA", 56.2499, -120.8529, 17402], ["Tillmans Corner", "AL", "US", 30.5902, -88.1708, 17398], ["Les Coteaux", "QC", "CA", 45.2834, -74.2325, 17396], ["Detroit-Shoreway", "OH", "US", 41.4777, -81.7299, 17382], ["Anoka", "MN", "US", 45.1977, -93.3872, 17350], ["East Cleveland", "OH", "US", 41.5331, -81.579, 17344], ["Sudbury", "MA", "US", 42.3834, -71.4162, 17343], ["Plainville", "CT", "US", 41.6745, -72.8582, 17328], ["Ada", "OK", "US", 34.7745, -96.6783, 17303], ["Middletown", "RI", "US", 41.5457, -71.2914, 17303], ["Glassmanor", "MD", "US", 38.819, -76.9986, 17295], ["South Orange", "NJ", "US", 40.749, -74.2613, 17295], ["Idylwood", "VA", "US", 38.8951, -77.2117, 17288], ["Seabrook", "MD", "US", 38.968, -76.8466, 17287], ["Durant", "OK", "US", 33.994, -96.3708, 17286], ["Killingly Center", "CT", "US", 41.8387, -71.8692, 17282], ["Kings Park", "NY", "US", 40.8862, -73.2573, 17282], ["Saint-Augustin-de-Desmaures", "QC", "CA", 46.7406, -71.4513, 17281], ["Canby", "OR", "US", 45.2629, -122.6926, 17271], ["Poplar Bluff", "MO", "US", 36.757, -90.3929, 17266], ["Moraga", "CA", "US", 37.8349, -122.1297, 17256], ["Redland", "MD", "US", 39.1454, -77.1441, 17242], ["Massapequa Park", "NY", "US", 40.6804, -73.4551, 17232], ["Kuna", "ID", "US", 43.4918, -116.4201, 17226], ["Foley", "AL", "US", 30.4066, -87.6836, 17218], ["Ruskin", "FL", "US", 27.7209, -82.4331, 17208], ["Hermiston", "OR", "US", 45.8404, -119.2895, 17201], ["Nederland", "TX", "US", 29.9744, -93.9924, 17196], ["Greenfield", "CA", "US", 36.3208, -121.2438, 17184], ["Ashwaubenon", "WI", "US", 44.4822, -88.0701, 17176], ["Live Oak", "CA", "US", 36.9836, -121.9805, 17158], ["Bristol", "VA", "US", 36.5965, -82.1885, 17141], ["Okolona", "KY", "US", 38.1412, -85.6877, 17134], ["Bayside", "CA", "US", 40.8424, -124.0637, 17132], ["Wyckoff", "NJ", "US", 41.0095, -74.1729, 17124], ["Woodmere", "NY", "US", 40.632, -73.7126, 17121], ["Huntington", "IN", "US", 40.8831, -85.4975, 17095], ["Imperial", "CA", "US", 32.8475, -115.5694, 17095], ["Conception Bay South", "NL", "CA", 47.4999, -52.9981, 17087], ["Wayne", "MI", "US", 42.2814, -83.3863, 17081], ["White Settlement", "TX", "US", 32.7596, -97.4583, 17077], ["Eloy", "AZ", "US", 32.7559, -111.5548, 17059], ["Beckley", "WV", "US", 37.7782, -81.1882, 17056], ["Broad Ripple", "IN", "US", 39.8667, -86.1416, 17041], ["El Segundo", "CA", "US", 33.9192, -118.4165, 17037], ["Saint-Lazare", "QC", "CA", 45.4001, -74.1326, 17016], ["Holden", "MA", "US", 42.3518, -71.8634, 17016], ["Avenel", "NJ", "US", 40.5804, -74.2852, 17011], ["East Setauket", "NY", "US", 40.9415, -73.1059, 17006], ["Vanier", "ON", "CA", 45.4399, -75.665, 17e3], ["Goodlettsville", "TN", "US", 36.3231, -86.7133, 16994], ["Fayetteville", "GA", "US", 33.4487, -84.4549, 16990], ["Colchester", "VT", "US", 44.5439, -73.1479, 16986], ["Altoona", "IA", "US", 41.6442, -93.4647, 16984], ["Terrell", "TX", "US", 32.736, -96.2753, 16981], ["Artesia", "CA", "US", 33.8659, -118.0831, 16961], ["South Ogden", "UT", "US", 41.1919, -111.9713, 16955], ["La Vista", "NE", "US", 41.1839, -96.0311, 16921], ["Hanover", "MA", "US", 42.1132, -70.812, 16906], ["Tanque Verde", "AZ", "US", 32.2517, -110.7373, 16901], ["Glenvar Heights", "FL", "US", 25.7076, -80.3256, 16898], ["Pendleton", "OR", "US", 45.6721, -118.7886, 16881], ["Centerville", "UT", "US", 40.918, -111.8722, 16877], ["Sayville", "NY", "US", 40.7359, -73.0821, 16853], ["Clarksdale", "MS", "US", 34.2001, -90.5709, 16847], ["Fairview Heights", "IL", "US", 38.5889, -89.9904, 16827], ["Norwalk", "OH", "US", 41.2426, -82.6157, 16827], ["San Carlos Park", "FL", "US", 26.4673, -81.8015, 16824], ["Concord", "MA", "US", 42.4604, -71.349, 16810], ["Springfield", "TN", "US", 36.5092, -86.885, 16808], ["New Milford", "NJ", "US", 40.9351, -74.019, 16801], ["North Attleborough Center", "MA", "US", 41.9726, -71.3247, 16796], ["Country Club Hills", "IL", "US", 41.5681, -87.7203, 16795], ["Lemont", "IL", "US", 41.6736, -88.0017, 16788], ["Sartell", "MN", "US", 45.6216, -94.2069, 16788], ["Dyersburg", "TN", "US", 36.0345, -89.3856, 16781], ["Defiance", "OH", "US", 41.2845, -84.3558, 16776], ["Beltsville", "MD", "US", 39.0348, -76.9075, 16772], ["Sainte-Catherine", "QC", "CA", 45.4001, -73.5825, 16762], ["Centralia", "WA", "US", 46.7162, -122.9543, 16753], ["Chalmette", "LA", "US", 29.943, -89.9654, 16751], ["Shorewood", "IL", "US", 41.52, -88.2017, 16747], ["Ferndale", "MD", "US", 39.1832, -76.6402, 16746], ["Mount Vernon", "OH", "US", 40.3934, -82.4857, 16742], ["Westchester", "IL", "US", 41.8506, -87.882, 16729], ["Bluffton", "SC", "US", 32.2371, -80.8604, 16728], ["Tifton", "GA", "US", 31.4505, -83.5085, 16725], ["Auburn", "MA", "US", 42.1945, -71.8356, 16724], ["Nipomo", "CA", "US", 35.0427, -120.476, 16714], ["Laurel", "VA", "US", 37.6429, -77.5089, 16713], ["Taylor", "TX", "US", 30.5708, -97.4094, 16702], ["North Decatur", "GA", "US", 33.7904, -84.306, 16698], ["Morganton", "NC", "US", 35.7454, -81.6848, 16692], ["Danville", "KY", "US", 37.6456, -84.7722, 16690], ["Buckingham", "QC", "CA", 45.5856, -75.4208, 16685], ["Barrington", "RI", "US", 41.7407, -71.3087, 16669], ["Washington", "IL", "US", 40.7037, -89.4073, 16664], ["Phoenixville", "PA", "US", 40.1304, -75.5149, 16658], ["Mercedes", "TX", "US", 26.1498, -97.9136, 16657], ["Center Point", "AL", "US", 33.6457, -86.6836, 16655], ["Lemay", "MO", "US", 38.5334, -90.2793, 16645], ["Edmundston", "NB", "CA", 47.3737, -68.3251, 16643], ["Wolcott", "CT", "US", 41.6023, -72.9868, 16639], ["Norcross", "GA", "US", 33.9412, -84.2135, 16634], ["Troutdale", "OR", "US", 45.5393, -122.3873, 16631], ["Oak Grove", "OR", "US", 45.4168, -122.6401, 16629], ["North Valley Stream", "NY", "US", 40.6851, -73.7018, 16628], ["Easton", "MD", "US", 38.7743, -76.0763, 16617], ["Easthampton", "MA", "US", 42.2668, -72.669, 16611], ["Bothell West", "WA", "US", 47.8053, -122.2406, 16607], ["Tahlequah", "OK", "US", 35.9154, -94.97, 16598], ["Hazel Park", "MI", "US", 42.4625, -83.1041, 16597], ["Douglas", "AZ", "US", 31.3446, -109.5453, 16592], ["Opelousas", "LA", "US", 30.5335, -92.0815, 16591], ["Grafton", "MA", "US", 42.207, -71.6856, 16583], ["Sandalfoot Cove", "FL", "US", 26.3386, -80.1869, 16582], ["Brenham", "TX", "US", 30.1669, -96.3977, 16579], ["Opa-locka", "FL", "US", 25.9023, -80.2503, 16565], ["Beaver Dam", "WI", "US", 43.4578, -88.8373, 16564], ["Coalinga", "CA", "US", 36.1397, -120.3602, 16564], ["Seymour", "CT", "US", 41.3968, -73.0759, 16562], ["Jenison", "MI", "US", 42.9072, -85.792, 16538], ["Cohoes", "NY", "US", 42.7742, -73.7001, 16538], ["Swansea", "MA", "US", 41.7482, -71.1898, 16525], ["Donna", "TX", "US", 26.1703, -98.052, 16523], ["Vienna", "VA", "US", 38.9012, -77.2653, 16522], ["Pinewood", "FL", "US", 25.869, -80.217, 16520], ["L'Ancienne-Lorette", "QC", "CA", 46.7939, -71.3519, 16516], ["Lansdale", "PA", "US", 40.2415, -75.2838, 16512], ["Sevierville", "TN", "US", 35.8681, -83.5618, 16490], ["Chickasha", "OK", "US", 35.0526, -97.9364, 16488], ["Kingsland", "GA", "US", 30.8, -81.6898, 16487], ["Uvalde", "TX", "US", 29.2097, -99.7862, 16476], ["Hillcrest Heights", "MD", "US", 38.8329, -76.9594, 16469], ["Stuart", "FL", "US", 27.1975, -80.2528, 16462], ["Fairhaven", "MA", "US", 41.6376, -70.9036, 16453], ["Avon", "IN", "US", 39.7628, -86.3997, 16451], ["Zachary", "LA", "US", 30.6485, -91.1565, 16448], ["Red Wing", "MN", "US", 44.5625, -92.5338, 16445], ["Sikeston", "MO", "US", 36.8767, -89.5879, 16436], ["Bethpage", "NY", "US", 40.7443, -73.4821, 16429], ["Concord", "MO", "US", 38.5245, -90.3573, 16421], ["Flowing Wells", "AZ", "US", 32.294, -111.0098, 16419], ["Bridgeview", "IL", "US", 41.75, -87.8042, 16407], ["Fairview Park", "OH", "US", 41.4414, -81.8643, 16407], ["Laguna Woods", "CA", "US", 33.6103, -117.7253, 16406], ["Anacortes", "WA", "US", 48.5126, -122.6127, 16403], ["Mount Clemens", "MI", "US", 42.5973, -82.878, 16400], ["Ca\xF1on City", "CO", "US", 38.441, -105.2425, 16400], ["Saint Michael", "MN", "US", 45.21, -93.665, 16399], ["South River", "NJ", "US", 40.4465, -74.386, 16399], ["Fort Thomas", "KY", "US", 39.0751, -84.4472, 16398], ["Sunset", "FL", "US", 25.7059, -80.3523, 16389], ["Prospect Heights", "IL", "US", 42.0953, -87.9376, 16386], ["Griffith", "IN", "US", 41.5284, -87.4236, 16378], ["Estelle", "LA", "US", 29.8458, -90.1067, 16377], ["Schofield Barracks", "HI", "US", 21.4984, -158.0651, 16370], ["Bon Air", "VA", "US", 37.5249, -77.5578, 16366], ["Cochrane", "AB", "CA", 51.1834, -114.4687, 16365], ["Oconomowoc", "WI", "US", 43.1117, -88.4993, 16360], ["Hough", "OH", "US", 41.512, -81.6365, 16359], ["Vero Beach", "FL", "US", 27.6386, -80.3973, 16358], ["Sunnyside", "WA", "US", 46.3237, -120.0087, 16325], ["Lebanon", "OR", "US", 44.5365, -122.907, 16324], ["Bayshore Gardens", "FL", "US", 27.4253, -82.5904, 16323], ["Streetsboro", "OH", "US", 41.2392, -81.3459, 16312], ["Lutes Mountain", "NB", "CA", 46.1354, -64.905, 16311], ["Calhoun", "GA", "US", 34.5026, -84.951, 16309], ["Morton", "IL", "US", 40.6128, -89.4593, 16306], ["Menomonie", "WI", "US", 44.8755, -91.9193, 16305], ["Truckee", "CA", "US", 39.328, -120.1833, 16299], ["Fremont", "OH", "US", 41.3503, -83.1219, 16297], ["Buckhall", "VA", "US", 38.7318, -77.4311, 16293], ["Gainesville", "TX", "US", 33.6259, -97.1333, 16292], ["Aberdeen", "WA", "US", 46.9754, -123.8157, 16276], ["Baychester", "NY", "US", 40.8693, -73.8364, 16274], ["Hopatcong Hills", "NJ", "US", 40.944, -74.6707, 16267], ["Waterville", "ME", "US", 44.552, -69.6317, 16261], ["Oroville", "CA", "US", 39.5139, -121.5578, 16260], ["Roosevelt", "NY", "US", 40.6787, -73.589, 16258], ["Laconia", "NH", "US", 43.5279, -71.4703, 16227], ["Bellmore", "NY", "US", 40.6687, -73.5271, 16218], ["Sainte-Catherine", "QC", "CA", 46.3184, -72.5663, 16211], ["Hibbing", "MN", "US", 47.4271, -92.9377, 16204], ["Sudley", "VA", "US", 38.7929, -77.4975, 16203], ["Dublin", "GA", "US", 32.5404, -82.9038, 16197], ["Coos Bay", "OR", "US", 43.3665, -124.2179, 16182], ["Hope Mills", "NC", "US", 34.9704, -78.9453, 16163], ["Cimarron Hills", "CO", "US", 38.8586, -104.6989, 16161], ["Katy", "TX", "US", 29.7858, -95.8244, 16158], ["Brunswick", "GA", "US", 31.15, -81.4915, 16157], ["Clarksburg", "WV", "US", 39.2807, -80.3445, 16152], ["Jollyville", "TX", "US", 30.4427, -97.775, 16151], ["Highland Village", "TX", "US", 33.0918, -97.0467, 16149], ["Ocean Acres", "NJ", "US", 39.7435, -74.281, 16142], ["Wolf Trap", "VA", "US", 38.9398, -77.2861, 16131], ["Madison", "NJ", "US", 40.7598, -74.4171, 16126], ["Portland", "TX", "US", 27.8773, -97.3239, 16116], ["Midway", "FL", "US", 30.4065, -87.0055, 16115], ["Sulphur Springs", "TX", "US", 33.1384, -95.6011, 16098], ["Maryland City", "MD", "US", 39.0921, -76.8178, 16093], ["Siloam Springs", "AR", "US", 36.1881, -94.5405, 16081], ["Ham Lake", "MN", "US", 45.2502, -93.2499, 16062], ["West Columbia", "SC", "US", 33.9935, -81.074, 16060], ["Frankfort", "IN", "US", 40.2795, -86.5108, 16060], ["Mount Pleasant", "TX", "US", 33.1568, -94.9683, 16051], ["Dyer", "IN", "US", 41.4942, -87.5217, 16051], ["Rayside-Balfour", "ON", "CA", 46.6087, -81.2076, 16050], ["Rye", "NY", "US", 40.9806, -73.6837, 16046], ["Fort Hunt", "VA", "US", 38.7329, -77.058, 16045], ["Americus", "GA", "US", 32.0724, -84.2327, 16028], ["Hermitage", "PA", "US", 41.2334, -80.4487, 16028], ["Buffalo", "MN", "US", 45.1719, -93.8747, 16026], ["Crawfordsville", "IN", "US", 40.0412, -86.8744, 16024], ["Lake Mary", "FL", "US", 28.7589, -81.3178, 16021], ["Republic", "MO", "US", 37.12, -93.4802, 16005], ["Albemarle", "NC", "US", 35.3501, -80.2001, 16003], ["Cherry Hill", "VA", "US", 38.5698, -77.2669, 16e3], ["Country Walk", "FL", "US", 25.634, -80.4323, 15997], ["Riverdale", "GA", "US", 33.5726, -84.4133, 15989], ["Petawawa", "ON", "CA", 45.8945, -77.2801, 15988], ["Abington", "MA", "US", 42.1048, -70.9453, 15985], ["Floral Park", "NY", "US", 40.7237, -73.7048, 15969], ["Prosper", "TX", "US", 33.2362, -96.8011, 15967], ["Walnut Park", "CA", "US", 33.9681, -118.2251, 15966], ["Pecan Grove", "TX", "US", 29.6261, -95.7316, 15963], ["Overland", "MO", "US", 38.7012, -90.3623, 15959], ["Fort Erie", "ON", "CA", 42.9001, -78.9329, 15953], ["Grandville", "MI", "US", 42.9098, -85.7631, 15953], ["Candiac", "QC", "CA", 45.3834, -73.5159, 15947], ["Four Corners", "OR", "US", 44.9279, -122.9837, 15947], ["Sunland Park", "NM", "US", 31.7965, -106.58, 15940], ["North Liberty", "IA", "US", 41.7492, -91.5979, 15931], ["Burlington", "KY", "US", 39.0276, -84.7241, 15926], ["Parole", "MD", "US", 38.9796, -76.5305, 15922], ["Vincent", "CA", "US", 34.5005, -118.1165, 15922], ["Vincent", "CA", "US", 34.0984, -117.9238, 15922], ["Southchase", "FL", "US", 28.3931, -81.3834, 15921], ["Ukiah", "CA", "US", 39.1502, -123.2078, 15917], ["La Marque", "TX", "US", 29.3686, -94.9713, 15908], ["L'Assomption", "QC", "CA", 45.8232, -73.4294, 15906], ["North Arlington", "NJ", "US", 40.7884, -74.1332, 15904], ["La Palma", "CA", "US", 33.8464, -118.0467, 15904], ["Seagoville", "TX", "US", 32.6396, -96.5383, 15894], ["Lebanon", "IN", "US", 40.0484, -86.4692, 15892], ["Clayton", "MO", "US", 38.6425, -90.3237, 15884], ["Pearl River", "NY", "US", 41.059, -74.0218, 15876], ["Conyers", "GA", "US", 33.6676, -84.0177, 15875], ["Myrtle Grove", "FL", "US", 30.421, -87.3075, 15870], ["Aldine", "TX", "US", 29.9324, -95.3802, 15869], ["Narragansett", "RI", "US", 41.4501, -71.4495, 15868], ["Yellowknife", "NT", "CA", 62.4541, -114.3725, 15865], ["Kaukauna", "WI", "US", 44.278, -88.272, 15854], ["Port Washington", "NY", "US", 40.8257, -73.6982, 15846], ["New Port Richey", "FL", "US", 28.2442, -82.7193, 15842], ["Aurora", "OH", "US", 41.3175, -81.3454, 15838], ["Adams Morgan", "DC", "US", 38.9215, -77.0422, 15830], ["Rutland", "VT", "US", 43.6106, -72.9726, 15824], ["Asbury Park", "NJ", "US", 40.2204, -74.0121, 15818], ["Lutherville-Timonium", "MD", "US", 39.44, -76.611, 15814], ["Collingwood", "ON", "CA", 44.4834, -80.2164, 15809], ["Ashland", "MA", "US", 42.2612, -71.4634, 15802], ["Hybla Valley", "VA", "US", 38.7476, -77.083, 15801], ["Longmeadow", "MA", "US", 42.0501, -72.5829, 15784], ["Elkton", "MD", "US", 39.6068, -75.8333, 15782], ["Grosse Pointe Woods", "MI", "US", 42.4436, -82.9069, 15762], ["Alton", "TX", "US", 26.2873, -98.3133, 15760], ["Pinehurst", "NC", "US", 35.1954, -79.4695, 15752], ["Groves", "TX", "US", 29.9483, -93.9171, 15750], ["West University Place", "TX", "US", 29.718, -95.4338, 15741], ["Wilkinsburg", "PA", "US", 40.4417, -79.882, 15731], ["Manassas Park", "VA", "US", 38.784, -77.4697, 15726], ["Willow Grove", "PA", "US", 40.144, -75.1157, 15726], ["Gatesville", "TX", "US", 31.4352, -97.7439, 15724], ["Avon Center", "OH", "US", 41.4598, -82.0196, 15724], ["La Grange", "IL", "US", 41.805, -87.8692, 15723], ["Mont-Saint-Hilaire", "QC", "CA", 45.5652, -73.1868, 15720], ["Great Bend", "KS", "US", 38.3645, -98.7648, 15717], ["Shively", "KY", "US", 38.2001, -85.8227, 15713], ["Highland Springs", "VA", "US", 37.546, -77.3278, 15711], ["Hueytown", "AL", "US", 33.4512, -86.9967, 15710], ["Talladega", "AL", "US", 33.4359, -86.1058, 15709], ["New Haven", "IN", "US", 41.0706, -85.0144, 15709], ["Mill Creek East", "WA", "US", 47.836, -122.1877, 15709], ["Middleburg Heights", "OH", "US", 41.3614, -81.8129, 15696], ["Camrose", "AB", "CA", 53.0168, -112.8353, 15686], ["Pacific Grove", "CA", "US", 36.6177, -121.9166, 15674], ["Yorkton", "SK", "CA", 51.2167, -102.4677, 15669], ["Mitchell", "SD", "US", 43.7094, -98.0298, 15669], ["Humble", "TX", "US", 29.9988, -95.2622, 15665], ["Greenwood Village", "CO", "US", 39.6172, -104.9508, 15663], ["Bryn Mawr-Skyway", "WA", "US", 47.4943, -122.2409, 15645], ["Bradley", "IL", "US", 41.142, -87.8611, 15617], ["McKinley Park", "IL", "US", 41.8317, -87.6737, 15612], ["Saint-Basile-le-Grand", "QC", "CA", 45.5334, -73.2825, 15605], ["Elkridge", "MD", "US", 39.2126, -76.7136, 15593], ["Aberdeen", "MD", "US", 39.5096, -76.1641, 15580], ["North Myrtle Beach", "SC", "US", 33.816, -78.68, 15579], ["Williamstown", "NJ", "US", 39.6862, -74.9952, 15567], ["Leduc", "AB", "CA", 53.2668, -113.552, 15561], ["Long Beach", "MS", "US", 30.3505, -89.1528, 15555], ["Pembroke", "ON", "CA", 45.8168, -77.1162, 15551], ["Otsego", "MN", "US", 45.2741, -93.5914, 15551], ["Boulder City", "NV", "US", 35.9786, -114.8325, 15551], ["Magog", "QC", "CA", 45.2668, -72.1491, 15550], ["Fillmore", "CA", "US", 34.3992, -118.9181, 15548], ["Lake Wales", "FL", "US", 27.9014, -81.5859, 15541], ["Alum Rock", "CA", "US", 37.3661, -121.8272, 15536], ["Addison", "TX", "US", 32.9618, -96.8292, 15518], ["East Riverdale", "MD", "US", 38.9621, -76.9219, 15509], ["Laurinburg", "NC", "US", 34.7741, -79.4628, 15507], ["Hernando", "MS", "US", 34.824, -89.9937, 15503], ["Hurricane", "UT", "US", 37.1753, -113.29, 15501], ["Plainfield", "CT", "US", 41.6765, -71.9151, 15498], ["Hanover", "PA", "US", 39.8007, -76.983, 15496], ["Lithia Springs", "GA", "US", 33.794, -84.6605, 15491], ["Farmingville", "NY", "US", 40.8312, -73.0296, 15481], ["Mastic", "NY", "US", 40.802, -72.8409, 15481], ["Setauket-East Setauket", "NY", "US", 40.9306, -73.1018, 15477], ["Harrison", "NJ", "US", 40.7465, -74.1563, 15474], ["Martha Lake", "WA", "US", 47.8509, -122.2393, 15473], ["Port Richmond", "NY", "US", 40.6332, -74.1365, 15470], ["Indianola", "IA", "US", 41.358, -93.5574, 15467], ["Perry", "GA", "US", 32.4582, -83.7316, 15457], ["Jasper", "IN", "US", 38.3914, -86.9311, 15451], ["Winder", "GA", "US", 33.9926, -83.7202, 15447], ["Clive", "IA", "US", 41.603, -93.7241, 15447], ["Clemson", "SC", "US", 34.6834, -82.8374, 15446], ["Greenwood", "MS", "US", 33.5162, -90.1795, 15431], ["Tavares", "FL", "US", 28.8042, -81.7256, 15430], ["Great Falls", "VA", "US", 38.9982, -77.2883, 15427], ["Jamestown", "ND", "US", 46.9105, -98.7084, 15422], ["Terrace Heights", "NY", "US", 40.7215, -73.7693, 15421], ["Emerson Hill", "NY", "US", 40.6087, -74.096, 15412], ["Avocado Heights", "CA", "US", 34.0361, -117.9912, 15411], ["Eden", "NC", "US", 36.4885, -79.7667, 15403], ["Bay Village", "OH", "US", 41.4848, -81.9221, 15402], ["Lake Butler", "FL", "US", 28.5017, -81.5409, 15400], ["Makakilo City", "HI", "US", 21.3469, -158.0858, 15383], ["Westbury", "NY", "US", 40.7557, -73.5876, 15379], ["Bostonia", "CA", "US", 32.8075, -116.9364, 15379], ["Iona", "FL", "US", 26.5204, -81.964, 15369], ["Dickson", "TN", "US", 36.077, -87.3878, 15359], ["Newport", "KY", "US", 39.0915, -84.4958, 15354], ["Cullman", "AL", "US", 34.1748, -86.8436, 15350], ["Live Oak", "TX", "US", 29.5652, -98.3364, 15346], ["Roanoke Rapids", "NC", "US", 36.4615, -77.6542, 15345], ["Payson", "AZ", "US", 34.2309, -111.3251, 15345], ["Storrs", "CT", "US", 41.8084, -72.2495, 15344], ["The Dalles", "OR", "US", 45.5946, -121.1787, 15340], ["Los Lunas", "NM", "US", 34.8062, -106.7334, 15336], ["Dixon", "IL", "US", 41.8389, -89.4796, 15319], ["Bellevue", "WI", "US", 44.4442, -87.9201, 15317], ["Sunland", "CA", "US", 34.267, -118.3023, 15316], ["Millbrook", "AL", "US", 32.4799, -86.3619, 15314], ["Brownsville", "FL", "US", 25.8218, -80.2412, 15313], ["Wailuku", "HI", "US", 20.8913, -156.506, 15313], ["Warren Township", "NJ", "US", 40.6082, -74.518, 15311], ["Seaford", "NY", "US", 40.6659, -73.4882, 15294], ["Washougal", "WA", "US", 45.5826, -122.3534, 15288], ["Dallas", "OR", "US", 44.9193, -123.317, 15277], ["Graniteville", "NY", "US", 40.6248, -74.1485, 15272], ["Henderson", "NC", "US", 36.3296, -78.3992, 15271], ["Stallings", "NC", "US", 35.0907, -80.6862, 15270], ["River Falls", "WI", "US", 44.8614, -92.6238, 15269], ["Berkley", "MI", "US", 42.5031, -83.1835, 15268], ["Damascus", "MD", "US", 39.2884, -77.2039, 15257], ["Shelbyville", "KY", "US", 38.212, -85.2236, 15253], ["Susanville", "CA", "US", 40.4163, -120.653, 15247], ["Pataskala", "OH", "US", 39.9956, -82.6743, 15245], ["Traverse City", "MI", "US", 44.7631, -85.6206, 15218], ["South Yuba City", "CA", "US", 39.1166, -121.6391, 15217], ["Merrifield", "VA", "US", 38.8743, -77.2269, 15212], ["Ledyard", "CT", "US", 41.4398, -72.0142, 15212], ["Fords", "NJ", "US", 40.5293, -74.316, 15187], ["New Territory", "TX", "US", 29.5941, -95.6808, 15186], ["Kapolei", "HI", "US", 21.3356, -158.0582, 15186], ["Clearlake", "CA", "US", 38.9582, -122.6264, 15182], ["McKinleyville", "CA", "US", 40.9465, -124.1006, 15177], ["Brunswick", "ME", "US", 43.9145, -69.9653, 15175], ["Highview", "KY", "US", 38.1429, -85.6241, 15167], ["Kenmore", "NY", "US", 42.9659, -78.87, 15160], ["Belvedere Park", "GA", "US", 33.7548, -84.2674, 15152], ["Ripon", "CA", "US", 37.7416, -121.1244, 15151], ["Rossville", "MD", "US", 39.3384, -76.4797, 15147], ["Depew", "NY", "US", 42.904, -78.6923, 15146], ["Seven Oaks", "SC", "US", 34.0488, -81.1465, 15144], ["Wilmington Island", "GA", "US", 32.0035, -80.9737, 15138], ["Parlier", "CA", "US", 36.6116, -119.5271, 15138], ["Gates-North Gates", "NY", "US", 43.1655, -77.7007, 15138], ["East Rancho Dominguez", "CA", "US", 33.8981, -118.1954, 15135], ["Greater Napanee", "ON", "CA", 44.2501, -76.9494, 15132], ["Natchez", "MS", "US", 31.5602, -91.4033, 15128], ["Cloverly", "MD", "US", 39.1082, -76.9977, 15126], ["Newton", "IA", "US", 41.6997, -93.048, 15125], ["Lamont", "CA", "US", 35.2597, -118.9143, 15120], ["East Brainerd", "TN", "US", 34.9959, -85.1502, 15114], ["Vandalia", "OH", "US", 39.8906, -84.1988, 15106], ["Rio Linda", "CA", "US", 38.691, -121.4486, 15106], ["East Longmeadow", "MA", "US", 42.0645, -72.5126, 15102], ["Ramsey", "NJ", "US", 41.0573, -74.141, 15102], ["West Park", "FL", "US", 25.9845, -80.1989, 15097], ["Kenora", "ON", "CA", 49.7674, -94.4899, 15096], ["Greeneville", "TN", "US", 36.1632, -82.831, 15094], ["Mount Vernon", "IL", "US", 38.3173, -88.9031, 15087], ["Adelphi", "MD", "US", 39.0032, -76.9719, 15086], ["Front Royal", "VA", "US", 38.9182, -78.1944, 15070], ["Weston", "WI", "US", 44.8908, -89.5476, 15069], ["Spanish Springs", "NV", "US", 39.6491, -119.7074, 15064], ["Fort Leonard Wood", "MO", "US", 37.7057, -92.1572, 15061], ["Sterling", "IL", "US", 41.7886, -89.6962, 15057], ["Williamsburg", "VA", "US", 37.2707, -76.7075, 15052], ["Somerton", "AZ", "US", 32.5964, -114.7097, 15048], ["Three Lakes", "FL", "US", 25.6421, -80.3984, 15047], ["Auburndale", "FL", "US", 28.0653, -81.7887, 15035], ["Gloversville", "NY", "US", 43.0528, -74.3438, 15023], ["Hereford", "TX", "US", 34.8152, -102.3993, 15021], ["Eggertsville", "NY", "US", 42.9634, -78.8039, 15019], ["Batavia", "NY", "US", 42.9981, -78.1875, 15010], ["Dumas", "TX", "US", 35.8656, -101.9732, 15001], ["le Plateau", "QC", "CA", 45.4351, -75.7803, 15e3], ["Bull Run", "VA", "US", 38.7837, -77.5206, 14983], ["Ammon", "ID", "US", 43.4696, -111.9666, 14960], ["Fort Saskatchewan", "AB", "CA", 53.7168, -113.2187, 14957], ["\u2018Ewa Beach", "HI", "US", 21.3156, -158.0072, 14955], ["New River", "AZ", "US", 33.9159, -112.136, 14952], ["Kilgore", "TX", "US", 32.3863, -94.8758, 14947], ["Fullerton", "PA", "US", 40.6318, -75.4732, 14925], ["Knik-Fairview", "AK", "US", 61.5126, -149.6001, 14923], ["Hudson", "MA", "US", 42.3918, -71.5662, 14907], ["Tonawanda", "NY", "US", 43.0203, -78.8803, 14907], ["Villa Rica", "GA", "US", 33.7321, -84.9191, 14904], ["North New Hyde Park", "NY", "US", 40.7432, -73.6932, 14899], ["Johnstown", "CO", "US", 40.3369, -104.9122, 14896], ["Tolland", "CT", "US", 41.8715, -72.3687, 14891], ["Canyon", "TX", "US", 34.9803, -101.9188, 14887], ["Jacksonville", "TX", "US", 31.9638, -95.2705, 14884], ["Berea", "KY", "US", 37.5687, -84.2963, 14882], ["Tenafly", "NJ", "US", 40.9254, -73.9629, 14880], ["Marco", "FL", "US", 25.9726, -81.729, 14879], ["East San Gabriel", "CA", "US", 34.0917, -118.0912, 14874], ["Jackson", "MO", "US", 37.3823, -89.6662, 14869], ["Corinth", "MS", "US", 34.9342, -88.5223, 14866], ["Coto De Caza", "CA", "US", 33.6042, -117.587, 14866], ["Englewood", "FL", "US", 26.962, -82.3526, 14863], ["Crowley", "TX", "US", 32.579, -97.3625, 14853], ["Saint John", "IN", "US", 41.45, -87.47, 14850], ["Midlothian", "IL", "US", 41.6253, -87.7176, 14847], ["Welby", "CO", "US", 39.8366, -104.9591, 14846], ["Horsham", "PA", "US", 40.1784, -75.1285, 14842], ["Mastic Beach", "NY", "US", 40.7668, -72.8521, 14841], ["Mashpee", "MA", "US", 41.6484, -70.4811, 14834], ["Okotoks", "AB", "CA", 50.7289, -113.9828, 14826], ["Powder Springs", "GA", "US", 33.8595, -84.6838, 14826], ["Masonboro", "NC", "US", 34.1793, -77.8475, 14826], ["Gasp\xE9", "QC", "CA", 48.8334, -64.4819, 14819], ["Jennings", "MO", "US", 38.7192, -90.2604, 14819], ["Matane", "QC", "CA", 48.8286, -67.522, 14812], ["Head of Westport", "MA", "US", 41.6209, -71.062, 14809], ["Summerside", "PE", "CA", 46.3959, -63.7876, 14808], ["Scottsbluff", "NE", "US", 41.8666, -103.6672, 14802], ["Sierra Vista Southeast", "AZ", "US", 31.4538, -110.2164, 14797], ["East Highland Park", "VA", "US", 37.581, -77.4069, 14796], ["Glen Allen", "VA", "US", 37.666, -77.5064, 14774], ["Johnson City", "NY", "US", 42.1156, -75.9588, 14773], ["Douglaston", "NY", "US", 40.7687, -73.7471, 14762], ["Mineral Wells", "TX", "US", 32.8085, -98.1128, 14754], ["Cherryland", "CA", "US", 37.6794, -122.1033, 14728], ["Scottsboro", "AL", "US", 34.6723, -86.0341, 14722], ["Ozark", "AL", "US", 31.4591, -85.6405, 14719], ["Alexander City", "AL", "US", 32.944, -85.9539, 14718], ["Lady Lake", "FL", "US", 28.9175, -81.9229, 14717], ["Niceville", "FL", "US", 30.5169, -86.4822, 14714], ["Prince Rupert", "BC", "CA", 54.3151, -130.321, 14708], ["Swift Current", "SK", "CA", 50.2834, -107.8013, 14703], ["West Norriton", "PA", "US", 40.1296, -75.3785, 14702], ["Owosso", "MI", "US", 42.9978, -84.1766, 14699], ["Blytheville", "AR", "US", 35.9273, -89.919, 14694], ["Ellington", "CT", "US", 41.904, -72.4698, 14693], ["Whitewater", "WI", "US", 42.8336, -88.7323, 14692], ["Lebanon", "MO", "US", 37.6806, -92.6638, 14688], ["Colwood", "BC", "CA", 48.4329, -123.4859, 14687], ["North Fair Oaks", "CA", "US", 37.4744, -122.1966, 14687], ["Hollins", "VA", "US", 37.3413, -79.9431, 14673], ["Forrest City", "AR", "US", 35.0082, -90.7898, 14672], ["Parkway", "CA", "US", 38.496, -121.4588, 14670], ["Colesville", "MD", "US", 39.0757, -77.0019, 14647], ["Graham", "NC", "US", 36.069, -79.4006, 14647], ["Cinnaminson", "NJ", "US", 39.9968, -74.9927, 14646], ["Fraser", "MI", "US", 42.5392, -82.9494, 14636], ["Chaparral", "NM", "US", 32.0238, -106.3857, 14631], ["Clark", "NJ", "US", 40.6409, -74.3107, 14628], ["Norridge", "IL", "US", 41.9634, -87.8273, 14621], ["Hammonton", "NJ", "US", 39.6365, -74.8024, 14618], ["Zephyrhills", "FL", "US", 28.2336, -82.1812, 14611], ["College Park", "GA", "US", 33.6534, -84.4494, 14601], ["Groveton", "VA", "US", 38.7673, -77.0847, 14598], ["Bemidji", "MN", "US", 47.4736, -94.8803, 14594], ["Hawaiian Gardens", "CA", "US", 33.8314, -118.0728, 14592], ["Bloomsburg", "PA", "US", 41.0037, -76.4549, 14585], ["Thibodaux", "LA", "US", 29.7958, -90.8229, 14584], ["Valle Vista", "CA", "US", 33.7478, -116.8934, 14578], ["Alamo", "CA", "US", 37.8502, -122.0322, 14570], ["Druid Hills", "GA", "US", 33.7804, -84.336, 14568], ["Yankton", "SD", "US", 42.8711, -97.3973, 14557], ["Beech Grove", "IN", "US", 39.722, -86.09, 14548], ["Cedar Mill", "OR", "US", 45.5248, -122.8109, 14546], ["Lake Saint Louis", "MO", "US", 38.7976, -90.7857, 14545], ["Northview", "MI", "US", 43.0456, -85.6006, 14541], ["Harrisburg", "NC", "US", 35.324, -80.6578, 14539], ["Warrington", "FL", "US", 30.3841, -87.275, 14531], ["Royal Kunia", "HI", "US", 21.3939, -158.0267, 14525], ["Deming", "NM", "US", 32.2687, -107.7586, 14522], ["Greece", "NY", "US", 43.2098, -77.6931, 14519], ["Springdale", "NJ", "US", 39.9026, -74.9663, 14518], ["Phillipsburg", "NJ", "US", 40.6937, -75.1902, 14515], ["Hopatcong", "NJ", "US", 40.9329, -74.6593, 14510], ["Worthington", "OH", "US", 40.0931, -83.018, 14498], ["Whitman", "MA", "US", 42.0807, -70.9356, 14495], ["Greensburg", "PA", "US", 40.3015, -79.5389, 14495], ["Hartselle", "AL", "US", 34.4434, -86.9353, 14493], ["Miami Springs", "FL", "US", 25.8223, -80.2895, 14490], ["South Farmingdale", "NY", "US", 40.7207, -73.4401, 14486], ["East Islip", "NY", "US", 40.732, -73.1857, 14475], ["Kerman", "CA", "US", 36.7236, -120.0599, 14475], ["Warsaw", "IN", "US", 41.2381, -85.853, 14472], ["Glasgow", "KY", "US", 36.9959, -85.9119, 14470], ["North Branford", "CT", "US", 41.3276, -72.7673, 14454], ["Fairview", "NJ", "US", 40.8126, -73.999, 14451], ["Springfield", "NJ", "US", 40.7049, -74.3172, 14429], ["Chubbuck", "ID", "US", 42.9207, -112.4661, 14428], ["Scott Lake", "FL", "US", 25.9415, -80.232, 14425], ["Robbinsdale", "MN", "US", 45.0322, -93.3386, 14418], ["Franklin Park", "PA", "US", 40.5834, -80.0878, 14415], ["Lindenhurst", "IL", "US", 42.4106, -88.0262, 14408], ["Bridgetown", "OH", "US", 39.1531, -84.6372, 14407], ["Callaway", "FL", "US", 30.153, -85.5699, 14405], ["Rio Grande City", "TX", "US", 26.3798, -98.8203, 14404], ["Pineville", "LA", "US", 31.3224, -92.4343, 14403], ["Cahokia", "IL", "US", 38.5709, -90.1901, 14402], ["Sarasota Springs", "FL", "US", 27.3089, -82.4795, 14395], ["Mill Valley", "CA", "US", 37.906, -122.545, 14394], ["Hugo", "MN", "US", 45.16, -92.9933, 14388], ["Moultrie", "GA", "US", 31.1799, -83.7891, 14377], ["Brooklyn Park", "MD", "US", 39.2284, -76.6164, 14373], ["Chicago Ridge", "IL", "US", 41.7014, -87.7792, 14373], ["Cutlerville", "MI", "US", 42.8409, -85.6636, 14370], ["Morris", "IL", "US", 41.3573, -88.4212, 14363], ["Hartford", "WI", "US", 43.3178, -88.379, 14355], ["Brookside", "DE", "US", 39.6671, -75.7269, 14353], ["Highland Park", "NJ", "US", 40.4959, -74.4243, 14347], ["Beacon", "NY", "US", 41.5048, -73.9696, 14347], ["Woodcrest", "CA", "US", 33.8822, -117.3573, 14347], ["Greendale", "WI", "US", 42.9406, -87.9959, 14333], ["Antioch", "IL", "US", 42.4772, -88.0956, 14329], ["Hunters Creek", "FL", "US", 28.3606, -81.4223, 14321], ["Carthage", "MO", "US", 37.1765, -94.3102, 14319], ["Manorville", "NY", "US", 40.8737, -72.8079, 14314], ["Phelan", "CA", "US", 34.4261, -117.5723, 14304], ["Glasgow", "DE", "US", 39.6048, -75.7452, 14303], ["Berea", "SC", "US", 34.8854, -82.456, 14295], ["Glens Falls", "NY", "US", 43.3095, -73.644, 14291], ["Los Osos", "CA", "US", 35.3111, -120.8324, 14276], ["New Franklin", "OH", "US", 40.9417, -81.5415, 14275], ["Hershey", "PA", "US", 40.2859, -76.6502, 14257], ["Knightdale", "NC", "US", 35.7876, -78.4806, 14256], ["Hewitt", "TX", "US", 31.4624, -97.1958, 14252], ["Alpine", "CA", "US", 32.8351, -116.7664, 14236], ["Gibsonton", "FL", "US", 27.8536, -82.3826, 14234], ["Gantt", "SC", "US", 34.8001, -82.4243, 14229], ["Lakeway", "TX", "US", 30.3638, -97.9796, 14217], ["Moorestown-Lenola", "NJ", "US", 39.9659, -74.9644, 14217], ["Murraysville", "NC", "US", 34.2957, -77.8475, 14215], ["Canton", "IL", "US", 40.5581, -90.0351, 14211], ["Bradley Gardens", "NJ", "US", 40.5629, -74.6546, 14206], ["Elk Plain", "WA", "US", 47.0532, -122.3976, 14205], ["Camano", "WA", "US", 48.174, -122.5282, 14202], ["Berkeley Heights", "NJ", "US", 40.6834, -74.4427, 14179], ["Mount Holly", "NC", "US", 35.2982, -81.0159, 14176], ["Rosem\xE8re", "QC", "CA", 45.6334, -73.7992, 14173], ["Cherry Hill Mall", "NJ", "US", 39.9359, -75.0091, 14171], ["Oldsmar", "FL", "US", 28.0342, -82.6651, 14170], ["Williams Lake", "BC", "CA", 52.1415, -122.1445, 14168], ["Saint-Lin-Laurentides", "QC", "CA", 45.8501, -73.7659, 14159], ["Fort Payne", "AL", "US", 34.4442, -85.7197, 14150], ["Wykagyl", "NY", "US", 40.9415, -73.799, 14146], ["Jefferson Valley-Yorktown", "NY", "US", 41.318, -73.8007, 14142], ["Five Forks", "SC", "US", 34.8048, -82.2296, 14140], ["Hayden", "ID", "US", 47.766, -116.7866, 14133], ["Red Bluff", "CA", "US", 40.1785, -122.2358, 14131], ["New Fairfield", "CT", "US", 41.4665, -73.4857, 14126], ["Forest Park", "IL", "US", 41.8795, -87.8137, 14123], ["Hickory Hills", "IL", "US", 41.7256, -87.8251, 14122], ["Hyannis", "MA", "US", 41.6529, -70.2828, 14120], ["Arverne", "NY", "US", 40.5912, -73.796, 14120], ["Hazel Crest", "IL", "US", 41.5717, -87.6945, 14118], ["Whitefish Bay", "WI", "US", 43.1133, -87.9001, 14110], ["Weehawken", "NJ", "US", 40.7696, -74.0204, 14104], ["Sterling", "CO", "US", 40.6255, -103.2077, 14104], ["North Reading", "MA", "US", 42.5751, -71.0787, 14101], ["Indiana", "PA", "US", 40.6215, -79.1525, 14100], ["Fish Hawk", "FL", "US", 27.8506, -82.2109, 14087], ["Longwood", "FL", "US", 28.7031, -81.3384, 14085], ["Jasper", "AL", "US", 33.8312, -87.2775, 14071], ["Reidsville", "NC", "US", 36.3549, -79.6645, 14067], ["Dentsville", "SC", "US", 34.064, -80.9582, 14062], ["Northbridge", "MA", "US", 42.1515, -71.6495, 14061], ["New Cassel", "NY", "US", 40.759, -73.5696, 14059], ["Rosedale", "CA", "US", 35.3836, -119.1454, 14058], ["Apollo Beach", "FL", "US", 27.7731, -82.4076, 14055], ["Waycross", "GA", "US", 31.2137, -82.3557, 14053], ["Washington", "MO", "US", 38.5581, -91.0121, 14050], ["Chippewa Falls", "WI", "US", 44.9369, -91.3929, 14047], ["Westwood", "MA", "US", 42.214, -71.2245, 14029], ["Mount Washington", "KY", "US", 38.0501, -85.5458, 14028], ["East Bridgewater", "MA", "US", 42.0334, -70.9592, 14021], ["Washington Court House", "OH", "US", 39.5365, -83.4391, 14019], ["Rocky Point", "NY", "US", 40.9526, -72.9254, 14014], ["H\u0101lawa", "HI", "US", 21.3794, -157.9217, 14014], ["Holliston", "MA", "US", 42.2001, -71.4245, 14010], ["Pierre", "SD", "US", 44.3683, -100.351, 14002], ["Collingswood", "NJ", "US", 39.9182, -75.0713, 14e3], ["Horizon West", "FL", "US", 28.4338, -81.6227, 14e3], ["Elfers", "FL", "US", 28.2167, -82.7223, 13986], ["McFarland", "CA", "US", 35.678, -119.2293, 13985], ["Beach Park", "IL", "US", 42.4222, -87.8573, 13976], ["Sun Lakes", "AZ", "US", 33.2112, -111.8754, 13975], ["Fairburn", "GA", "US", 33.5671, -84.581, 13967], ["Lincoln", "IL", "US", 40.1484, -89.3648, 13966], ["Seekonk", "MA", "US", 41.8084, -71.337, 13966], ["Upper Grand Lagoon", "FL", "US", 30.1633, -85.7408, 13963], ["Willowick", "OH", "US", 41.6331, -81.4687, 13957], ["Orange", "CT", "US", 41.2784, -73.0257, 13956], ["Auburn", "CA", "US", 38.8966, -121.0769, 13953], ["South Venice", "FL", "US", 27.0531, -82.4243, 13949], ["Maumee", "OH", "US", 41.5628, -83.6538, 13940], ["Middlesex", "NJ", "US", 40.5726, -74.4926, 13934], ["Allouez", "WI", "US", 44.4775, -88.0162, 13930], ["Simcoe", "ON", "CA", 42.8334, -80.2997, 13922], ["Paradise Valley", "AZ", "US", 33.5311, -111.9427, 13922], ["Moberly", "MO", "US", 39.4184, -92.4382, 13919], ["Wood Dale", "IL", "US", 41.9634, -87.979, 13917], ["Covington", "GA", "US", 33.5968, -83.8602, 13916], ["Saint Simon Mills", "GA", "US", 31.1708, -81.4073, 13915], ["Levelland", "TX", "US", 33.5873, -102.378, 13914], ["Hutchinson", "MN", "US", 44.8877, -94.3697, 13913], ["Amherstburg", "ON", "CA", 42.1001, -83.0999, 13910], ["Saraland", "AL", "US", 30.8207, -88.0706, 13906], ["King City", "CA", "US", 36.2127, -121.126, 13902], ["Livingston", "CA", "US", 37.3869, -120.7235, 13902], ["Marietta", "OH", "US", 39.4153, -81.4548, 13900], ["Falls Church", "VA", "US", 38.8823, -77.1711, 13892], ["Metuchen", "NJ", "US", 40.5432, -74.3632, 13886], ["Olean", "NY", "US", 42.0776, -78.4297, 13870], ["Oneonta", "NY", "US", 42.4529, -75.0638, 13862], ["Ephrata", "PA", "US", 40.1798, -76.1788, 13861], ["Circleville", "OH", "US", 39.6006, -82.946, 13857], ["Forest City", "FL", "US", 28.6668, -81.4433, 13854], ["Harper Woods", "MI", "US", 42.4331, -82.9241, 13836], ["Princeton Meadows", "NJ", "US", 40.3318, -74.5638, 13834], ["Whitehall", "PA", "US", 40.3612, -79.9909, 13834], ["Sault Ste. Marie", "MI", "US", 46.4953, -84.3453, 13827], ["Andrews", "TX", "US", 32.3187, -102.5457, 13816], ["Hendersonville", "NC", "US", 35.3187, -82.4609, 13814], ["Wauconda", "IL", "US", 42.2589, -88.1393, 13814], ["Fort Carson", "CO", "US", 38.7375, -104.7889, 13813], ["Oak Park", "CA", "US", 34.1792, -118.7629, 13811], ["Stanford", "CA", "US", 37.4241, -122.1661, 13809], ["Pottsville", "PA", "US", 40.6857, -76.1955, 13802], ["Homosassa Springs", "FL", "US", 28.8036, -82.5759, 13791], ["Ladson", "SC", "US", 32.9857, -80.1098, 13790], ["Quesnel", "BC", "CA", 52.9784, -122.4931, 13788], ["Swampscott", "MA", "US", 42.4709, -70.9176, 13787], ["Sharonville", "OH", "US", 39.2681, -84.4133, 13774], ["Elizabethton", "TN", "US", 36.3487, -82.2107, 13772], ["Clarksburg", "MD", "US", 39.2387, -77.2794, 13766], ["McMinnville", "TN", "US", 35.6834, -85.77, 13759], ["Cromwell", "CT", "US", 41.5951, -72.6454, 13750], ["Buford", "GA", "US", 34.1207, -84.0044, 13748], ["Wixom", "MI", "US", 42.5248, -83.5363, 13746], ["West Richland", "WA", "US", 46.3043, -119.3614, 13746], ["Greenlawn", "NY", "US", 40.869, -73.3651, 13742], ["Stony Brook", "NY", "US", 40.9256, -73.1409, 13740], ["Bay Roberts", "NL", "CA", 47.5999, -53.2648, 13737], ["Mountain Home", "ID", "US", 43.133, -115.6912, 13730], ["Waimalu", "HI", "US", 21.4047, -157.9433, 13730], ["Carpinteria", "CA", "US", 34.3989, -119.5185, 13727], ["Salida", "CA", "US", 37.7058, -121.0849, 13722], ["Sienna Plantation", "TX", "US", 29.4861, -95.508, 13721], ["Seabrook", "TX", "US", 29.5641, -95.0255, 13716], ["Gardendale", "AL", "US", 33.6601, -86.8128, 13711], ["Hidalgo", "TX", "US", 26.1003, -98.2631, 13709], ["Muscle Shoals", "AL", "US", 34.7448, -87.6675, 13706], ["Buda", "TX", "US", 30.0852, -97.8403, 13705], ["Mebane", "NC", "US", 36.096, -79.267, 13698], ["Baker", "LA", "US", 30.5882, -91.1682, 13695], ["Richton Park", "IL", "US", 41.4845, -87.7034, 13695], ["Lyndhurst", "OH", "US", 41.52, -81.4887, 13691], ["Athens", "TN", "US", 35.4428, -84.593, 13688], ["Fort Campbell North", "KY", "US", 36.6543, -87.4606, 13685], ["East Greenwich", "RI", "US", 41.6604, -71.4559, 13682], ["Palos Verdes Estates", "CA", "US", 33.801, -118.3924, 13682], ["Canton", "MS", "US", 32.6126, -90.0367, 13676], ["Boerne", "TX", "US", 29.7947, -98.732, 13674], ["Roselle Park", "NJ", "US", 40.6645, -74.2643, 13670], ["Fort Mill", "SC", "US", 35.0074, -80.9451, 13662], ["East Wenatchee", "WA", "US", 47.4157, -120.2931, 13659], ["Olivehurst", "CA", "US", 39.0954, -121.5522, 13656], ["Moss Point", "MS", "US", 30.4116, -88.5345, 13654], ["Bexley", "OH", "US", 39.9689, -82.9377, 13654], ["Marshall", "MN", "US", 44.4469, -95.7883, 13652], ["Pell City", "AL", "US", 33.5862, -86.2861, 13646], ["Martinsville", "VA", "US", 36.6915, -79.8725, 13645], ["Monroe", "GA", "US", 33.7948, -83.7132, 13641], ["Copley", "OH", "US", 41.0989, -81.6446, 13641], ["Cayce", "SC", "US", 33.9657, -81.074, 13619], ["West Freehold", "NJ", "US", 40.2421, -74.3013, 13613], ["Miami", "OK", "US", 36.8745, -94.8775, 13611], ["La Grange Park", "IL", "US", 41.8347, -87.8617, 13608], ["Port Orchard", "WA", "US", 47.5404, -122.6363, 13607], ["Millbury", "MA", "US", 42.194, -71.7601, 13606], ["Hampton Bays", "NY", "US", 40.869, -72.5176, 13603], ["Grover Beach", "CA", "US", 35.1216, -120.6213, 13600], ["Bergen Beach", "NY", "US", 40.6204, -73.9068, 13596], ["New Hamburg", "ON", "CA", 43.3834, -80.6997, 13595], ["Strathmore", "AB", "CA", 51.0501, -113.3852, 13592], ["Lebanon", "NH", "US", 43.6423, -72.2518, 13579], ["Lewisville", "NC", "US", 36.0971, -80.4192, 13567], ["Jericho", "NY", "US", 40.792, -73.5399, 13567], ["Hudson", "WI", "US", 44.9747, -92.7569, 13566], ["Sharon", "PA", "US", 41.2331, -80.4934, 13562], ["Verona", "NJ", "US", 40.8298, -74.2401, 13545], ["Swansea", "IL", "US", 38.5339, -89.989, 13543], ["Warrensville Heights", "OH", "US", 41.435, -81.5362, 13542], ["Southern Pines", "NC", "US", 35.1741, -79.3923, 13539], ["Riverdale", "IL", "US", 41.6334, -87.6331, 13536], ["Palmetto Estates", "FL", "US", 25.6215, -80.362, 13535], ["Henderson", "TX", "US", 32.1532, -94.7994, 13529], ["Glenmont", "MD", "US", 39.0579, -77.0497, 13529], ["North Mankato", "MN", "US", 44.1733, -94.0339, 13529], ["Hockessin", "DE", "US", 39.7876, -75.6966, 13527], ["Destin", "FL", "US", 30.3935, -86.4958, 13523], ["Mount Dora", "FL", "US", 28.8025, -81.6445, 13519], ["Lynden", "WA", "US", 48.9465, -122.4521, 13517], ["Havre de Grace", "MD", "US", 39.5493, -76.0916, 13504], ["Washington", "PA", "US", 40.174, -80.2462, 13497], ["Waxhaw", "NC", "US", 34.9246, -80.7434, 13495], ["White Center", "WA", "US", 47.5173, -122.3548, 13495], ["River Ridge", "LA", "US", 29.9602, -90.2156, 13494], ["Olympia Heights", "FL", "US", 25.7268, -80.3553, 13488], ["Village of Campton Hills", "IL", "US", 41.9366, -88.3975, 13483], ["Conway", "FL", "US", 28.5028, -81.3306, 13467], ["Glenn Dale", "MD", "US", 38.9876, -76.8205, 13466], ["San Marino", "CA", "US", 34.1214, -118.1065, 13464], ["Englewood", "OH", "US", 39.8776, -84.3022, 13460], ["Orangeburg", "SC", "US", 33.4918, -80.8556, 13460], ["Solana Beach", "CA", "US", 32.9911, -117.2712, 13449], ["Timberwood Park", "TX", "US", 29.7058, -98.4784, 13447], ["Lockhart", "TX", "US", 29.8849, -97.67, 13446], ["Brecksville", "OH", "US", 41.3198, -81.6268, 13440], ["Chesterton", "IN", "US", 41.6106, -87.0642, 13433], ["Sauk Rapids", "MN", "US", 45.5919, -94.1661, 13424], ["South Park Township", "PA", "US", 40.2986, -79.9941, 13416], ["Oatfield", "OR", "US", 45.4142, -122.6001, 13415], ["H\u0101lawa Heights", "HI", "US", 21.3785, -157.9139, 13408], ["Mont-Laurier", "QC", "CA", 46.5501, -75.4993, 13405], ["Monroe", "OH", "US", 39.4403, -84.3622, 13393], ["Kings Park West", "VA", "US", 38.8144, -77.2958, 13390], ["Nesconset", "NY", "US", 40.852, -73.154, 13387], ["Las Vegas", "NM", "US", 35.5939, -105.2239, 13386], ["Grain Valley", "MO", "US", 39.015, -94.1986, 13379], ["Dunmore", "PA", "US", 41.4198, -75.6324, 13379], ["Brainerd", "MN", "US", 46.358, -94.2008, 13371], ["Western Springs", "IL", "US", 41.8098, -87.9006, 13369], ["Discovery Bay", "CA", "US", 37.9085, -121.6002, 13352], ["Bedford", "IN", "US", 38.8612, -86.4872, 13347], ["Bellair-Meadowbrook Terrace", "FL", "US", 30.1788, -81.7434, 13343], ["Saint James", "NY", "US", 40.879, -73.1568, 13338], ["Ridge", "NY", "US", 40.894, -72.8959, 13336], ["New Ulm", "MN", "US", 44.3125, -94.4605, 13327], ["South Sioux City", "NE", "US", 42.4739, -96.4136, 13319], ["Warrenville", "IL", "US", 41.8178, -88.1734, 13317], ["Huron", "SD", "US", 44.3633, -98.2143, 13313], ["Shorewood", "WI", "US", 43.0892, -87.8876, 13311], ["Waunakee", "WI", "US", 43.1919, -89.4557, 13311], ["Beaufort", "SC", "US", 32.4316, -80.6698, 13306], ["Avenal", "CA", "US", 36.0041, -120.129, 13301], ["Monticello", "MN", "US", 45.3055, -93.7941, 13299], ["Riverhead", "NY", "US", 40.917, -72.662, 13299], ["West Carrollton City", "OH", "US", 39.6723, -84.2522, 13297], ["Franklin Park", "NJ", "US", 40.439, -74.5352, 13295], ["Piney Green", "NC", "US", 34.716, -77.3202, 13293], ["Butler", "PA", "US", 40.8612, -79.8953, 13289], ["Citrus Ridge", "FL", "US", 28.3339, -81.6423, 13285], ["Fergus Falls", "MN", "US", 46.283, -96.0776, 13281], ["Beeville", "TX", "US", 28.401, -97.7497, 13277], ["California City", "CA", "US", 35.1258, -117.9859, 13277], ["Gonzalez", "FL", "US", 30.5816, -87.2914, 13273], ["Vadnais Heights", "MN", "US", 45.0575, -93.0738, 13266], ["North Adams", "MA", "US", 42.7009, -73.1087, 13263], ["Palmetto", "FL", "US", 27.5214, -82.5723, 13249], ["Lake Forest Park", "WA", "US", 47.7568, -122.281, 13243], ["Spring Lake", "NC", "US", 35.1679, -78.9728, 13234], ["Mercerville", "NJ", "US", 40.2371, -74.6865, 13230], ["Colonial Park", "PA", "US", 40.3006, -76.8097, 13229], ["Glenpool", "OK", "US", 35.9554, -96.0089, 13225], ["Fruitville", "FL", "US", 27.3298, -82.4576, 13224], ["Red Hill", "SC", "US", 33.9996, -79.2581, 13223], ["Red Hill", "SC", "US", 33.8207, -79.0189, 13223], ["Lindsay", "CA", "US", 36.203, -119.0882, 13217], ["Calera", "AL", "US", 33.1029, -86.7536, 13213], ["University Heights", "OH", "US", 41.4978, -81.5374, 13202], ["Carriere", "MS", "US", 30.6169, -89.6526, 13198], ["Atlantic Beach", "FL", "US", 30.3344, -81.3987, 13193], ["Streator", "IL", "US", 41.1209, -88.8354, 13182], ["Lea Hill", "WA", "US", 47.3262, -122.1815, 13182], ["Waianae", "HI", "US", 21.4379, -158.1856, 13177], ["Teays Valley", "WV", "US", 38.4501, -81.9293, 13175], ["Lone Tree", "CO", "US", 39.5517, -104.8863, 13175], ["Brandermill", "VA", "US", 37.4321, -77.6497, 13173], ["Soddy-Daisy", "TN", "US", 35.2359, -85.1908, 13171], ["Snoqualmie", "WA", "US", 47.5287, -121.8254, 13169], ["Fostoria", "OH", "US", 41.157, -83.4169, 13167], ["Oakland", "NJ", "US", 41.0132, -74.2643, 13165], ["Short Hills", "NJ", "US", 40.7479, -74.3254, 13165], ["Wayland", "MA", "US", 42.3626, -71.3615, 13155], ["Raynham", "MA", "US", 41.9487, -71.0731, 13153], ["Coatesville", "PA", "US", 39.9832, -75.8238, 13148], ["Clayton", "OH", "US", 39.8631, -84.3605, 13146], ["McPherson", "KS", "US", 38.3708, -97.6642, 13144], ["Crowley", "LA", "US", 30.2141, -92.3746, 13144], ["Harrison", "AR", "US", 36.2298, -93.1077, 13138], ["Saddle Brook", "NJ", "US", 40.899, -74.0926, 13130], ["Bellefontaine", "OH", "US", 40.3612, -83.7597, 13117], ["Black Forest", "CO", "US", 39.013, -104.7008, 13116], ["Ridgefield Park", "NJ", "US", 40.857, -74.0215, 13102], ["Grovetown", "GA", "US", 33.4504, -82.1982, 13093], ["Bardstown", "KY", "US", 37.8092, -85.4669, 13091], ["Windham", "NH", "US", 42.8006, -71.3042, 13091], ["Worthington", "MN", "US", 43.62, -95.5964, 13090], ["Commerce", "CA", "US", 34.0006, -118.1598, 13081], ["La Grande", "OR", "US", 45.3246, -118.0877, 13074], ["Saint Marys", "PA", "US", 41.4278, -78.5609, 13070], ["Stoughton", "WI", "US", 42.9169, -89.2179, 13067], ["Kingsgate", "WA", "US", 47.727, -122.1796, 13065], ["Geneva", "NY", "US", 42.869, -76.9777, 13062], ["Meadville", "PA", "US", 41.6414, -80.1514, 13061], ["Lockhart", "FL", "US", 28.6194, -81.4426, 13060], ["Harwich", "MA", "US", 41.6862, -70.0759, 13059], ["South Charleston", "WV", "US", 38.3684, -81.6996, 13045], ["Medway", "MA", "US", 42.1418, -71.3967, 13042], ["Marshall", "MO", "US", 39.1231, -93.1969, 13039], ["Santa Fe", "TX", "US", 29.378, -95.1058, 13037], ["Newton", "NC", "US", 35.6699, -81.2215, 13035], ["North Auburn", "CA", "US", 38.9313, -121.0819, 13022], ["Tehachapi", "CA", "US", 35.1322, -118.449, 13021], ["Saint Ann", "MO", "US", 38.7273, -90.3832, 13020], ["Thonotosassa", "FL", "US", 28.0614, -82.3023, 13014], ["Endicott", "NY", "US", 42.0984, -76.0494, 13014], ["Connersville", "IN", "US", 39.6412, -85.1411, 13010], ["Arrochar", "NY", "US", 40.5984, -74.0726, 13010], ["Ferndale", "WA", "US", 48.8465, -122.591, 13010], ["Middleburg", "FL", "US", 30.0689, -81.8604, 13008], ["Rantoul", "IL", "US", 40.3084, -88.1559, 13008], ["Greenville", "OH", "US", 40.1028, -84.633, 13006], ["Saint Simons Island", "GA", "US", 31.1505, -81.3695, 13e3], ["Shadow Hills", "CA", "US", 34.2619, -118.3517, 13e3], ["Woodward", "OK", "US", 36.4337, -99.3904, 12993], ["Rochester", "MI", "US", 42.6806, -83.1338, 12993], ["Key Biscayne", "FL", "US", 25.6937, -80.1628, 12990], ["Claremont", "NH", "US", 43.3767, -72.3468, 12984], ["Superior", "CO", "US", 39.9528, -105.1686, 12980], ["Auburn", "IN", "US", 41.367, -85.0589, 12979], ["Saint Augustine", "FL", "US", 29.8947, -81.3145, 12975], ["Powell", "OH", "US", 40.1578, -83.0752, 12972], ["Justice", "IL", "US", 41.7445, -87.8378, 12968], ["Glen Carbon", "IL", "US", 38.7484, -89.9832, 12966], ["West Monroe", "LA", "US", 32.5185, -92.1476, 12966], ["Malibu", "CA", "US", 34.0258, -118.7804, 12965], ["Borger", "TX", "US", 35.6678, -101.3974, 12964], ["College", "AK", "US", 64.8569, -147.8028, 12964], ["Shiloh", "IL", "US", 38.5614, -89.8973, 12961], ["Portage la Prairie", "MB", "CA", 49.9728, -98.2926, 12957], ["Fort Drum", "NY", "US", 44.0584, -75.7619, 12955], ["Grass Valley", "CA", "US", 39.2191, -121.0611, 12944], ["Newington", "VA", "US", 38.7385, -77.185, 12943], ["Greenwich", "CT", "US", 41.0265, -73.6285, 12942], ["Lakeland North", "WA", "US", 47.3334, -122.2769, 12942], ["Kingston", "PA", "US", 41.2617, -75.8969, 12941], ["Fulton", "MO", "US", 38.8467, -91.948, 12939], ["El Dorado", "KS", "US", 37.8172, -96.8623, 12931], ["Wawarsing", "NY", "US", 41.759, -74.3574, 12925], ["Dolbeau-Mistassini", "QC", "CA", 48.8786, -72.2314, 12916], ["Mounds View", "MN", "US", 45.105, -93.2086, 12914], ["Herrin", "IL", "US", 37.8031, -89.0276, 12910], ["Grenada", "MS", "US", 33.769, -89.8084, 12900], ["Dover", "OH", "US", 40.5206, -81.474, 12899], ["Hanover", "NJ", "US", 40.8045, -74.3668, 12898], ["Dardenne Prairie", "MO", "US", 38.7695, -90.729, 12890], ["Saint Helens", "OR", "US", 45.864, -122.8065, 12883], ["Forest Hill", "TX", "US", 32.6721, -97.2692, 12881], ["Salmon Arm", "BC", "CA", 50.6998, -119.3024, 12875], ["Weigelstown", "PA", "US", 39.9837, -76.8225, 12875], ["Dallas", "GA", "US", 33.9237, -84.8408, 12870], ["Glendale", "WI", "US", 43.1353, -87.9356, 12870], ["York Beach", "ME", "US", 43.1715, -70.6089, 12854], ["Holiday City-Berkeley", "NJ", "US", 39.9638, -74.278, 12831], ["Hot Springs Village", "AR", "US", 34.672, -92.9988, 12807], ["Fruita", "CO", "US", 39.1589, -108.729, 12795], ["Kettering", "MD", "US", 38.8846, -76.8147, 12790], ["Athens", "TX", "US", 32.2049, -95.8555, 12788], ["New Carrollton", "MD", "US", 38.9698, -76.88, 12786], ["Port Neches", "TX", "US", 29.9913, -93.9585, 12786], ["Hamilton Square", "NJ", "US", 40.2273, -74.6532, 12784], ["Powell River", "BC", "CA", 49.8328, -124.5237, 12779], ["Fallsburg", "NY", "US", 41.732, -74.6013, 12773], ["Charlton", "MA", "US", 42.1356, -71.9701, 12764], ["Seaside", "NY", "US", 40.5832, -73.8282, 12754], ["Bedford", "OH", "US", 41.3931, -81.5365, 12747], ["Andover", "KS", "US", 37.7139, -97.1364, 12745], ["Brooks", "AB", "CA", 50.5834, -111.8851, 12744], ["Finneytown", "OH", "US", 39.2003, -84.5205, 12741], ["Elk City", "OK", "US", 35.412, -99.4043, 12717], ["Bathurst", "NB", "CA", 47.6181, -65.6511, 12714], ["New Kensington", "PA", "US", 40.5698, -79.7648, 12713], ["Conneaut", "OH", "US", 41.9476, -80.5542, 12712], ["Laurentides", "QC", "CA", 47.1334, -72.2824, 12710], ["Derby", "CT", "US", 41.3207, -73.089, 12700], ["Boone", "IA", "US", 42.0597, -93.8802, 12692], ["Minden", "LA", "US", 32.6154, -93.2868, 12690], ["Middle Valley", "TN", "US", 35.1959, -85.1847, 12684], ["Markham", "IL", "US", 41.5936, -87.6948, 12682], ["Belle Chasse", "LA", "US", 29.8549, -89.9906, 12679], ["Riviera Beach", "MD", "US", 39.1668, -76.508, 12677], ["Pelham", "NH", "US", 42.7345, -71.3245, 12676], ["Pedley", "CA", "US", 33.9753, -117.4759, 12672], ["El Sobrante", "CA", "US", 37.9772, -122.2952, 12669], ["N\u0101n\u0101kuli", "HI", "US", 21.3936, -158.1543, 12666], ["McComb", "MS", "US", 31.2438, -90.4531, 12661], ["Sylacauga", "AL", "US", 33.1732, -86.2516, 12657], ["Half Moon Bay", "CA", "US", 37.4635, -122.4286, 12657], ["Lilburn", "GA", "US", 33.8901, -84.143, 12655], ["Centralia", "IL", "US", 38.5251, -89.1334, 12655], ["West Valley", "WA", "US", 46.5921, -120.6051, 12655], ["San Anselmo", "CA", "US", 37.9746, -122.5616, 12653], ["Artondale", "WA", "US", 47.2995, -122.6207, 12653], ["Lincolnwood", "IL", "US", 42.0045, -87.7301, 12646], ["Kentville", "NS", "CA", 45.0771, -64.496, 12636], ["Panama City Beach", "FL", "US", 30.1766, -85.8055, 12624], ["Montgomeryville", "PA", "US", 40.2473, -75.2438, 12624], ["Joppatowne", "MD", "US", 39.4579, -76.3552, 12616], ["Uxbridge", "MA", "US", 42.0773, -71.6295, 12614], ["Effingham", "IL", "US", 39.12, -88.5434, 12604], ["Eufaula", "AL", "US", 31.8913, -85.1455, 12596], ["Channahon", "IL", "US", 41.4295, -88.2287, 12594], ["Moody", "AL", "US", 33.5909, -86.4908, 12593], ["Port Hope", "ON", "CA", 44.0168, -78.3995, 12587], ["Loveland", "OH", "US", 39.2689, -84.2638, 12585], ["South Daytona", "FL", "US", 29.1658, -81.0045, 12584], ["Platteville", "WI", "US", 42.7342, -90.4785, 12572], ["Gaffney", "SC", "US", 35.0718, -81.6498, 12566], ["Kemp Mill", "MD", "US", 39.039, -77.0191, 12564], ["Rogers", "MN", "US", 45.1889, -93.553, 12562], ["Azalea Park", "FL", "US", 28.5411, -81.3006, 12556], ["Lakeland", "TN", "US", 35.2306, -89.7404, 12553], ["Rendon", "TX", "US", 32.5763, -97.2414, 12552], ["Palos Heights", "IL", "US", 41.6681, -87.7964, 12545], ["Wickliffe", "OH", "US", 41.6053, -81.4535, 12545], ["Verona", "WI", "US", 42.9908, -89.5332, 12540], ["Woodhaven", "MI", "US", 42.1389, -83.2416, 12539], ["Bonita", "CA", "US", 32.6578, -117.03, 12538], ["Kewanee", "IL", "US", 41.2456, -89.9248, 12533], ["Woodland Park", "NJ", "US", 40.8898, -74.1949, 12518], ["Elliot Lake", "ON", "CA", 46.3834, -82.6332, 12508], ["Bainbridge", "GA", "US", 30.9038, -84.5755, 12507], ["Cambridge", "MD", "US", 38.5632, -76.0788, 12507], ["Bedford", "MA", "US", 42.4907, -71.2762, 12502], ["Windsor Locks", "CT", "US", 41.9293, -72.6273, 12498], ["Winnetka", "IL", "US", 42.1081, -87.7359, 12472], ["New Providence", "NJ", "US", 40.6984, -74.4015, 12469], ["Thompson", "MB", "CA", 55.7435, -97.8558, 12467], ["Green River", "WY", "US", 41.5286, -109.4663, 12465], ["Grand Terrace", "CA", "US", 34.0339, -117.3136, 12464], ["Patchogue", "NY", "US", 40.7657, -73.0151, 12463], ["Cedar Grove", "NJ", "US", 40.8518, -74.229, 12457], ["Ardmore", "PA", "US", 40.0068, -75.2855, 12455], ["Wilmington", "OH", "US", 39.4453, -83.8285, 12449], ["Ringwood", "NJ", "US", 41.1134, -74.2454, 12448], ["North Madison", "IN", "US", 38.7678, -85.3966, 12435], ["Steamboat Springs", "CO", "US", 40.485, -106.8317, 12435], ["Abbeville", "LA", "US", 29.9747, -92.1343, 12434], ["Fort Atkinson", "WI", "US", 42.9289, -88.8371, 12426], ["Lake Arrowhead", "CA", "US", 34.2483, -117.1892, 12424], ["Irondale", "AL", "US", 33.5382, -86.7072, 12423], ["Lumberton", "TX", "US", 30.2658, -94.1996, 12421], ["Larkspur", "CA", "US", 37.9341, -122.5353, 12417], ["Port Lavaca", "TX", "US", 28.615, -96.6261, 12416], ["Mount Vernon", "VA", "US", 38.7141, -77.1008, 12416], ["Brookhaven", "MS", "US", 31.5791, -90.4407, 12414], ["Fernway", "PA", "US", 40.6948, -80.1309, 12414], ["Beatrice", "NE", "US", 40.2681, -96.747, 12388], ["Ottawa", "KS", "US", 38.6156, -95.2678, 12387], ["Wilton Manors", "FL", "US", 26.1604, -80.1389, 12385], ["Four Corners", "TX", "US", 29.6686, -95.6577, 12382], ["Federal Heights", "CO", "US", 39.8514, -104.9986, 12381], ["Aldergrove", "BC", "CA", 49.058, -122.4709, 12363], ["Spring Creek", "NV", "US", 40.7266, -115.5859, 12361], ["New Baltimore", "MI", "US", 42.6811, -82.7369, 12354], ["Forestville", "MD", "US", 38.8451, -76.875, 12353], ["Chatham", "IL", "US", 39.6762, -89.7045, 12351], ["Atco", "NJ", "US", 39.7698, -74.8874, 12350], ["Mandeville", "LA", "US", 30.3583, -90.0656, 12345], ["Fernandina Beach", "FL", "US", 30.6697, -81.4626, 12339], ["Miller Place", "NY", "US", 40.9598, -72.9962, 12339], ["Escanaba", "MI", "US", 45.7452, -87.0646, 12334], ["Mountain Home", "AR", "US", 36.3353, -92.3852, 12330], ["Lake Los Angeles", "CA", "US", 34.6125, -117.8281, 12328], ["Cleveland", "MS", "US", 33.744, -90.7248, 12327], ["Portland", "TN", "US", 36.5817, -86.5164, 12323], ["Gulfport", "FL", "US", 27.7484, -82.7034, 12322], ["Plover", "WI", "US", 44.4564, -89.544, 12319], ["Cornelius", "OR", "US", 45.5198, -123.0598, 12317], ["Broadlands", "VA", "US", 39.0182, -77.5203, 12313], ["Northlake", "IL", "US", 41.9173, -87.8956, 12312], ["Big Bear City", "CA", "US", 34.2611, -116.845, 12304], ["North Castle", "NY", "US", 41.14, -73.6839, 12304], ["Eatontown", "NJ", "US", 40.2962, -74.051, 12301], ["Coolidge", "AZ", "US", 32.9778, -111.5176, 12297], ["Marion", "AR", "US", 35.2145, -90.1965, 12292], ["Canmore", "AB", "CA", 51.0834, -115.3521, 12288], ["West Plains", "MO", "US", 36.7281, -91.8524, 12285], ["Plymouth", "CT", "US", 41.672, -73.0529, 12284], ["Hawkesbury", "ON", "CA", 45.6001, -74.6159, 12283], ["Trenton", "OH", "US", 39.4809, -84.4577, 12281], ["Overlea", "MD", "US", 39.3634, -76.5205, 12275], ["North Merrick", "NY", "US", 40.6912, -73.5632, 12272], ["Port Saint John", "FL", "US", 28.4769, -80.7887, 12267], ["Green Valley", "MD", "US", 39.3093, -77.2972, 12262], ["North Perth", "ON", "CA", 43.7251, -80.9672, 12254], ["Okmulgee", "OK", "US", 35.6234, -95.9605, 12244], ["South Miami", "FL", "US", 25.7076, -80.2934, 12242], ["Hasbrouck Heights", "NJ", "US", 40.8582, -74.0807, 12227], ["Jacksonville", "AL", "US", 33.8138, -85.7613, 12222], ["Marysville", "CA", "US", 39.1457, -121.5914, 12216], ["Clarkston", "GA", "US", 33.8096, -84.2396, 12215], ["Kingston", "MA", "US", 41.9945, -70.7245, 12208], ["Davidson", "NC", "US", 35.5023, -80.8391, 12207], ["Winfield", "KS", "US", 37.2398, -96.9956, 12204], ["Red Bank", "NJ", "US", 40.3471, -74.0643, 12204], ["Somerville", "NJ", "US", 40.5743, -74.6099, 12202], ["Kings Point", "FL", "US", 26.4454, -80.1398, 12201], ["East Hanover", "NJ", "US", 40.8201, -74.3649, 12194], ["Tucson Estates", "AZ", "US", 32.1876, -111.0909, 12192], ["Haverstraw", "NY", "US", 41.1976, -73.9646, 12187], ["Suamico", "WI", "US", 44.6319, -88.0393, 12187], ["Timberlake", "VA", "US", 37.3207, -79.2575, 12183], ["Riverview", "MI", "US", 42.1742, -83.1794, 12181], ["Choctaw", "OK", "US", 35.4976, -97.2689, 12179], ["Lake City", "FL", "US", 30.1897, -82.6393, 12161], ["Babylon", "NY", "US", 40.6957, -73.3257, 12161], ["Travilah", "MD", "US", 39.069, -77.263, 12159], ["Blue Ash", "OH", "US", 39.232, -84.3783, 12159], ["Hudson", "FL", "US", 28.3645, -82.6934, 12158], ["Neosho", "MO", "US", 36.869, -94.368, 12156], ["Baraboo", "WI", "US", 43.4711, -89.7443, 12155], ["Freeport", "TX", "US", 28.9541, -95.3597, 12154], ["Stony Point", "NY", "US", 41.2295, -73.9871, 12147], ["Richmond", "TX", "US", 29.5822, -95.7608, 12138], ["Arkansas City", "KS", "US", 37.062, -97.0384, 12136], ["Amherst", "OH", "US", 41.3978, -82.2224, 12135], ["New Kingman-Butler", "AZ", "US", 35.265, -114.0323, 12134], ["Evanston", "WY", "US", 41.2683, -110.9632, 12133], ["Speedway", "IN", "US", 39.8023, -86.2672, 12127], ["Weatherford", "OK", "US", 35.5262, -98.7076, 12126], ["Florida City", "FL", "US", 25.4479, -80.4792, 12122], ["Port Royal", "SC", "US", 32.3791, -80.6926, 12122], ["Wells Branch", "TX", "US", 30.446, -97.6795, 12120], ["Luling", "LA", "US", 29.9322, -90.3665, 12119], ["Mount Sinai", "NY", "US", 40.947, -73.0296, 12118], ["Brown Deer", "WI", "US", 43.1633, -87.9645, 12102], ["Salisbury", "NY", "US", 40.7457, -73.5601, 12093], ["Dunkirk", "NY", "US", 42.4795, -79.3339, 12081], ["Woodmere", "LA", "US", 29.858, -90.0803, 12080], ["Washington", "IN", "US", 38.6592, -87.1728, 12078], ["Grand Falls-Windsor", "NL", "CA", 48.9332, -55.6649, 12076], ["Cloquet", "MN", "US", 46.7216, -92.4594, 12075], ["Festus", "MO", "US", 38.2206, -90.3959, 12065], ["Chelsea", "AL", "US", 33.3401, -86.6303, 12059], ["Poquoson", "VA", "US", 37.1224, -76.3458, 12059], ["Irmo", "SC", "US", 34.086, -81.1831, 12056], ["Lake Station", "IN", "US", 41.575, -87.2389, 12054], ["Glenn Heights", "TX", "US", 32.5487, -96.8567, 12042], ["Madison", "IN", "US", 38.7359, -85.38, 12040], ["Goldenrod", "FL", "US", 28.6103, -81.2887, 12039], ["Norton", "OH", "US", 41.0292, -81.6382, 12036], ["Artesia", "NM", "US", 32.8423, -104.4033, 12036], ["Edgewater", "NJ", "US", 40.827, -73.9757, 12034], ["Fairfax Station", "VA", "US", 38.801, -77.3255, 12030], ["Stafford", "CT", "US", 41.9848, -72.289, 12029], ["Centerton", "AR", "US", 36.3598, -94.2852, 12023], ["Smithfield", "NC", "US", 35.5085, -78.3394, 12022], ["Red Oak", "TX", "US", 32.5176, -96.8044, 12022], ["Los Alamos", "NM", "US", 35.8881, -106.307, 12019], ["North Palm Beach", "FL", "US", 26.8176, -80.082, 12015], ["Clawson", "MI", "US", 42.5334, -83.1463, 12015], ["Salem", "OH", "US", 40.9009, -80.8568, 12003], ["Parksville", "BC", "CA", 49.3195, -124.3157, 12e3], ["Queenswood Heights", "ON", "CA", 45.4708, -75.5056, 12e3], ["Cedar Lake", "IN", "US", 41.3648, -87.4411, 12e3], ["Fortuna", "CA", "US", 40.5982, -124.1573, 12e3], ["Glen Rock", "NJ", "US", 40.9629, -74.1329, 11999], ["Firestone", "CO", "US", 40.1125, -104.9366, 11999], ["Portales", "NM", "US", 34.1862, -103.3344, 11995], ["Gladstone", "OR", "US", 45.3807, -122.5948, 11986], ["La Homa", "TX", "US", 26.2501, -98.3636, 11985], ["Martinsville", "NJ", "US", 40.6012, -74.559, 11980], ["Kailua-Kona", "HI", "US", 19.6402, -155.9991, 11975], ["Waconia", "MN", "US", 44.8508, -93.7869, 11968], ["Shepherdsville", "KY", "US", 37.9884, -85.7158, 11967], ["Crestwood", "MO", "US", 38.557, -90.3818, 11966], ["Youngsville", "LA", "US", 30.0997, -91.9901, 11961], ["North Wantagh", "NY", "US", 40.6934, -73.5076, 11960], ["Freehold", "NJ", "US", 40.2601, -74.2738, 11959], ["Monfort Heights", "OH", "US", 39.1884, -84.5952, 11948], ["Scotts Valley", "CA", "US", 37.0511, -122.0147, 11945], ["Holly Hill", "FL", "US", 29.2436, -81.0376, 11943], ["Leeds", "AL", "US", 33.5482, -86.5444, 11936], ["Richmond Hill", "GA", "US", 31.9383, -81.3034, 11935], ["Bogalusa", "LA", "US", 30.791, -89.8487, 11933], ["Bennsville", "MD", "US", 38.6093, -77.0122, 11923], ["Dranesville", "VA", "US", 39.0007, -77.3458, 11921], ["Guymon", "OK", "US", 36.6828, -101.4815, 11921], ["West Haven", "UT", "US", 41.203, -112.0511, 11921], ["Beauharnois", "QC", "CA", 45.3134, -73.8725, 11918], ["Bucyrus", "OH", "US", 40.8084, -82.9755, 11916], ["Kelso", "WA", "US", 46.1468, -122.9084, 11901], ["Pennsville", "NJ", "US", 39.6534, -75.5166, 11888], ["Maryville", "MO", "US", 40.3461, -94.8725, 11879], ["Ingersoll", "ON", "CA", 43.0334, -80.883, 11874], ["Clayton", "CA", "US", 37.941, -121.9358, 11867], ["California", "MD", "US", 38.3004, -76.5075, 11857], ["Lakeside", "VA", "US", 37.6076, -77.4769, 11849], ["Terryville", "NY", "US", 40.909, -73.0651, 11849], ["Wanaque", "NJ", "US", 41.0382, -74.294, 11848], ["Cypress Lake", "FL", "US", 26.5381, -81.8992, 11846], ["Alexandria", "MN", "US", 45.8852, -95.3775, 11843], ["Westwood Lake", "FL", "US", 25.7293, -80.3728, 11838], ["Morgan City", "LA", "US", 29.6994, -91.2068, 11835], ["Florham Park", "NJ", "US", 40.7879, -74.3882, 11835], ["Kingsburg", "CA", "US", 36.5138, -119.554, 11824], ["Georgetown", "GA", "US", 31.9833, -81.2273, 11823], ["Greensburg", "IN", "US", 39.3373, -85.4836, 11819], ["Cottonwood", "AZ", "US", 34.7392, -112.0099, 11818], ["Schiller Park", "IL", "US", 41.9559, -87.8709, 11806], ["Lovington", "NM", "US", 32.944, -103.3486, 11800], ["Sugarland Run", "VA", "US", 39.0376, -77.3753, 11799], ["Pontiac", "IL", "US", 40.8809, -88.6298, 11794], ["Bridgeton", "MO", "US", 38.767, -90.4115, 11786], ["Franklin", "OH", "US", 39.559, -84.3041, 11783], ["Woodinville", "WA", "US", 47.7543, -122.1635, 11782], ["Red Bank", "TN", "US", 35.1123, -85.2941, 11769], ["Newport East", "RI", "US", 41.5158, -71.2875, 11769], ["Snyder", "TX", "US", 32.7179, -100.9176, 11768], ["Lansing", "KS", "US", 39.2486, -94.9002, 11767], ["Beachwood", "OH", "US", 41.4645, -81.5087, 11762], ["Lower Burrell", "PA", "US", 40.5531, -79.7573, 11761], ["Trophy Club", "TX", "US", 32.9979, -97.1836, 11759], ["Somersworth", "NH", "US", 43.2617, -70.8653, 11759], ["Healdsburg", "CA", "US", 38.6105, -122.8692, 11742], ["Blackfoot", "ID", "US", 43.1905, -112.345, 11740], ["Montmagny", "QC", "CA", 46.9804, -70.5549, 11724], ["South Lyon", "MI", "US", 42.4606, -83.6516, 11722], ["Douglas", "GA", "US", 31.5088, -82.8499, 11718], ["Carver", "MA", "US", 41.8834, -70.7625, 11718], ["Wallington", "NJ", "US", 40.8532, -74.1137, 11716], ["Ocean Pines", "MD", "US", 38.3954, -75.1557, 11710], ["Jensen Beach", "FL", "US", 27.2545, -80.2298, 11707], ["Lahaina", "HI", "US", 20.8743, -156.6766, 11704], ["Foothill Ranch", "CA", "US", 33.6864, -117.6609, 11698], ["Emeryville", "CA", "US", 37.8313, -122.2853, 11694], ["Azle", "TX", "US", 32.8951, -97.5459, 11693], ["East Bethel", "MN", "US", 45.3194, -93.2024, 11692], ["Martinsville", "IN", "US", 39.4278, -86.4283, 11690], ["Seven Hills", "OH", "US", 41.3953, -81.6762, 11690], ["Macedonia", "OH", "US", 41.3137, -81.5084, 11686], ["Weston", "MA", "US", 42.3668, -71.3031, 11682], ["Waipio", "HI", "US", 21.4182, -157.9991, 11674], ["Magnolia", "AR", "US", 33.2671, -93.2393, 11669], ["River Edge", "NJ", "US", 40.9287, -74.0399, 11668], ["Oquirrh", "UT", "US", 40.6305, -112.0338, 11668], ["Guttenberg", "NJ", "US", 40.7921, -74.0037, 11665], ["Mexico", "MO", "US", 39.1698, -91.8829, 11660], ["North Lindenhurst", "NY", "US", 40.7143, -73.3815, 11652], ["Wyandanch", "NY", "US", 40.754, -73.3604, 11647], ["Goshen", "OH", "US", 39.2334, -84.1613, 11644], ["Lexington Park", "MD", "US", 38.2668, -76.4538, 11626], ["Arlington", "TN", "US", 35.2962, -89.6615, 11625], ["Ravenna", "OH", "US", 41.1576, -81.2421, 11619], ["Enumclaw", "WA", "US", 47.2043, -121.9915, 11609], ["Oskaloosa", "IA", "US", 41.2964, -92.6444, 11607], ["Verde Village", "AZ", "US", 34.7105, -112.0115, 11605], ["El Campo", "TX", "US", 29.1966, -96.2697, 11604], ["Lynnfield", "MA", "US", 42.539, -71.0481, 11596], ["Cold Lake", "AB", "CA", 54.4652, -110.1815, 11595], ["Cocoa Beach", "FL", "US", 28.3206, -80.6092, 11595], ["Elizabethtown", "PA", "US", 40.1529, -76.6028, 11586], ["Mack", "OH", "US", 39.1581, -84.6497, 11585], ["Sainte-Marie", "QC", "CA", 46.434, -71.0117, 11584], ["Robstown", "TX", "US", 27.7903, -97.6689, 11576], ["Port Washington", "WI", "US", 43.3872, -87.8756, 11576], ["Lakeland South", "WA", "US", 47.2784, -122.2833, 11574], ["Home Gardens", "CA", "US", 33.8781, -117.5209, 11570], ["Villas", "FL", "US", 26.5504, -81.8687, 11569], ["Upper Montclair", "NJ", "US", 40.8462, -74.2013, 11565], ["Signal Hill", "CA", "US", 33.8045, -118.1679, 11565], ["Sun Village", "CA", "US", 34.5595, -117.9568, 11565], ["Archdale", "NC", "US", 35.9146, -79.972, 11564], ["Tarrytown", "NY", "US", 41.0762, -73.8588, 11560], ["Moss Bluff", "LA", "US", 30.3027, -93.1907, 11557], ["Mountain Park", "GA", "US", 33.8443, -84.1294, 11554], ["Fulton", "NY", "US", 43.3229, -76.4172, 11552], ["Garden City", "ID", "US", 43.6221, -116.2382, 11550], ["Hauterive", "QC", "CA", 49.1957, -68.2581, 11549], ["Urbana", "OH", "US", 40.1084, -83.7524, 11547], ["Valley Falls", "RI", "US", 41.9068, -71.3906, 11547], ["North Bellport", "NY", "US", 40.7743, -72.9429, 11545], ["Troy", "MO", "US", 38.9795, -90.9807, 11542], ["Lakeland Village", "CA", "US", 33.6386, -117.3439, 11541], ["Tomball", "TX", "US", 30.0972, -95.6161, 11540], ["Greatwood", "TX", "US", 29.5541, -95.6758, 11538], ["Gladeview", "FL", "US", 25.8393, -80.2356, 11535], ["Destrehan", "LA", "US", 29.9432, -90.3534, 11535], ["Cheney", "WA", "US", 47.4874, -117.5758, 11534], ["Uxbridge", "ON", "CA", 44.1001, -79.1163, 11531], ["Richfield", "WI", "US", 43.2561, -88.194, 11530], ["Groveland", "FL", "US", 28.5581, -81.8512, 11528], ["Grafton", "WI", "US", 43.3197, -87.9534, 11527], ["Fall River", "NS", "CA", 44.8169, -63.6154, 11526], ["Shady Hills", "FL", "US", 28.41, -82.5429, 11523], ["Yeadon", "PA", "US", 39.939, -75.2555, 11523], ["Hobe Sound", "FL", "US", 27.0595, -80.1364, 11521], ["Byram", "MS", "US", 32.1793, -90.2454, 11509], ["Claiborne", "LA", "US", 32.516, -92.1918, 11507], ["Yulee", "FL", "US", 30.6319, -81.6065, 11491], ["Excelsior Springs", "MO", "US", 39.3392, -94.2261, 11486], ["Rehoboth", "MA", "US", 41.8404, -71.2495, 11486], ["Robinson", "TX", "US", 31.4677, -97.1147, 11484], ["Cedarburg", "WI", "US", 43.2967, -87.9876, 11482], ["Gainesville", "VA", "US", 38.7957, -77.6139, 11481], ["Lewisburg", "TN", "US", 35.4492, -86.7889, 11480], ["Royse City", "TX", "US", 32.9751, -96.3325, 11465], ["Prairie Ridge", "WA", "US", 47.1376, -122.1487, 11464], ["Anna", "TX", "US", 33.349, -96.5486, 11463], ["Bellmawr", "NJ", "US", 39.8676, -75.0946, 11462], ["North Saint Paul", "MN", "US", 45.0125, -92.9919, 11460], ["Hillsborough", "CA", "US", 37.5741, -122.3794, 11451], ["Los Alamitos", "CA", "US", 33.8031, -118.0726, 11449], ["Endwell", "NY", "US", 42.1129, -76.021, 11446], ["Clute", "TX", "US", 29.0247, -95.3988, 11444], ["Fenton", "MI", "US", 42.7978, -83.7049, 11442], ["Somerset", "KY", "US", 37.092, -84.6041, 11439], ["Branson", "MO", "US", 36.6437, -93.2185, 11431], ["Parker", "SC", "US", 34.8507, -82.4535, 11431], ["Mendota", "CA", "US", 36.7536, -120.3816, 11430], ["Lakes by the Bay", "FL", "US", 25.5723, -80.3253, 11422], ["Mays Chapel", "MD", "US", 39.4332, -76.6494, 11420], ["Salem", "WI", "US", 42.5547, -88.1109, 11416], ["Haddonfield", "NJ", "US", 39.8915, -75.0377, 11414], ["Frederick", "CO", "US", 40.0992, -104.9372, 11413], ["Webster", "MA", "US", 42.0501, -71.8801, 11412], ["Crossville", "TN", "US", 35.949, -85.0269, 11411], ["Hawaiian Paradise Park", "HI", "US", 19.5933, -154.9731, 11404], ["D'Iberville", "MS", "US", 30.4263, -88.8909, 11400], ["Summit", "IL", "US", 41.7881, -87.8103, 11389], ["Piedmont", "CA", "US", 37.8244, -122.2316, 11376], ["Ridgefield", "NJ", "US", 40.8343, -74.0088, 11373], ["Lyndon", "KY", "US", 38.2567, -85.6016, 11372], ["Ionia", "MI", "US", 42.9873, -85.0711, 11372], ["Carnot-Moon", "PA", "US", 40.5186, -80.2174, 11372], ["Newcastle", "WA", "US", 47.539, -122.1557, 11370], ["Emmaus", "PA", "US", 40.5395, -75.4968, 11368], ["Greentree", "NJ", "US", 39.8971, -74.9557, 11367], ["Tyngsboro", "MA", "US", 42.6768, -71.4245, 11366], ["Grosse Ile", "MI", "US", 42.1292, -83.1444, 11361], ["Jefferson Hills", "PA", "US", 40.2912, -79.932, 11360], ["Ocean City", "NJ", "US", 39.2776, -74.5746, 11355], ["Camden", "AR", "US", 33.5846, -92.8343, 11347], ["Oxford", "CT", "US", 41.434, -73.1168, 11345], ["Waupun", "WI", "US", 43.6333, -88.7296, 11343], ["Niles", "MI", "US", 41.8298, -86.2542, 11333], ["North Valley", "NM", "US", 35.1734, -106.6234, 11333], ["Oak Hills", "OR", "US", 45.5412, -122.8412, 11333], ["Two Rivers", "WI", "US", 44.1539, -87.5692, 11331], ["Gloucester City", "NJ", "US", 39.8918, -75.1163, 11329], ["Lakewood Park", "FL", "US", 27.5431, -80.4023, 11323], ["Lakewood Park", "FL", "US", 27.4814, -80.3742, 11323], ["Smyrna", "DE", "US", 39.2998, -75.6047, 11319], ["Fort Morgan", "CO", "US", 40.2503, -103.7999, 11319], ["Mango", "FL", "US", 27.9797, -82.3065, 11313], ["Gardnerville Ranchos", "NV", "US", 38.8882, -119.7413, 11312], ["Sainte-Marthe-sur-le-Lac", "QC", "CA", 45.5334, -73.9325, 11311], ["East Grand Rapids", "MI", "US", 42.9411, -85.61, 11311], ["Magalia", "CA", "US", 39.8121, -121.5783, 11310], ["Broussard", "LA", "US", 30.1471, -91.9612, 11303], ["Wetaskiwin", "AB", "CA", 52.9668, -113.3687, 11302], ["Walker Mill", "MD", "US", 38.8754, -76.8883, 11302], ["West Sedona", "AZ", "US", 34.8672, -111.8054, 11299], ["Robertsville", "NJ", "US", 40.3462, -74.2879, 11297], ["Merriam", "KS", "US", 39.0236, -94.6936, 11288], ["Madison Heights", "VA", "US", 37.431, -79.1231, 11285], ["Woods Cross", "UT", "US", 40.8716, -111.8922, 11284], ["Spearfish", "SD", "US", 44.4908, -103.8594, 11283], ["Plano", "IL", "US", 41.6628, -88.537, 11282], ["Warren", "RI", "US", 41.7304, -71.2826, 11280], ["Shiloh", "OH", "US", 39.8187, -84.2285, 11272], ["Guthrie", "OK", "US", 35.8789, -97.4253, 11270], ["Cusseta", "GA", "US", 32.3054, -84.7727, 11267], ["Huntington", "VA", "US", 38.7923, -77.0708, 11267], ["Communications Hill", "CA", "US", 37.289, -121.8551, 11267], ["Lewis Center", "OH", "US", 40.1984, -83.0102, 11261], ["Wrentham", "MA", "US", 42.0668, -71.3281, 11251], ["Loganville", "GA", "US", 33.839, -83.9007, 11248], ["Westwood", "NJ", "US", 40.9912, -74.0326, 11247], ["Munhall", "PA", "US", 40.3923, -79.9, 11247], ["Yazoo City", "MS", "US", 32.8551, -90.4056, 11245], ["Minooka", "IL", "US", 41.4553, -88.2617, 11243], ["Campbellsville", "KY", "US", 37.3434, -85.3419, 11237], ["Lake Grove", "NY", "US", 40.8529, -73.1151, 11235], ["Yorktown", "IN", "US", 40.1737, -85.4941, 11231], ["White House", "TN", "US", 36.4703, -86.6514, 11226], ["Browns Mills", "NJ", "US", 39.9726, -74.5829, 11223], ["Mendota Heights", "MN", "US", 44.8836, -93.1383, 11223], ["Grosse Pointe Park", "MI", "US", 42.3759, -82.9374, 11220], ["Shiloh", "PA", "US", 39.9781, -76.7972, 11218], ["Pike Creek Valley", "DE", "US", 39.7362, -75.6983, 11217], ["Shiloh", "PA", "US", 41.0417, -78.2914, 11217], ["Beachwood", "NJ", "US", 39.939, -74.1929, 11214], ["Haysville", "KS", "US", 37.5645, -97.3523, 11212], ["Spencer", "IA", "US", 43.1414, -95.1444, 11212], ["North Smithfield", "RI", "US", 41.9668, -71.5495, 11212], ["Orange City", "FL", "US", 28.9489, -81.2987, 11210], ["Berkley", "CO", "US", 39.8044, -105.0261, 11207], ["Pompton Lakes", "NJ", "US", 41.0054, -74.2907, 11202], ["Vernal", "UT", "US", 40.4555, -109.5288, 11200], ["River Forest", "IL", "US", 41.8978, -87.814, 11199], ["Pincourt", "QC", "CA", 45.3834, -73.9825, 11197], ["Saint Peter", "MN", "US", 44.3236, -93.958, 11196], ["Jefferson", "LA", "US", 29.966, -90.1531, 11193], ["Jerome", "ID", "US", 42.7241, -114.5186, 11184], ["Springdale", "OH", "US", 39.287, -84.4852, 11182], ["Paris", "ON", "CA", 43.2, -80.3833, 11177], ["Elwood", "NY", "US", 40.8454, -73.3351, 11177], ["Grandview", "WA", "US", 46.251, -119.9017, 11176], ["Leon Valley", "TX", "US", 29.4952, -98.6186, 11174], ["North Scituate", "RI", "US", 41.8318, -71.5873, 11171], ["Webb City", "MO", "US", 37.1465, -94.463, 11165], ["Dudley", "MA", "US", 42.0451, -71.9301, 11165], ["Tarboro", "NC", "US", 35.8968, -77.5358, 11164], ["Sierra Madre", "CA", "US", 34.1617, -118.0529, 11163], ["Galena Park", "TX", "US", 29.7336, -95.2302, 11162], ["Camp Verde", "AZ", "US", 34.5636, -111.8543, 11155], ["Oakwood", "NY", "US", 40.564, -74.116, 11148], ["Mount Kisco", "NY", "US", 41.2043, -73.7271, 11145], ["East Renton Highlands", "WA", "US", 47.4848, -122.1123, 11140], ["Raymondville", "TX", "US", 26.4815, -97.7831, 11139], ["Chino Valley", "AZ", "US", 34.7575, -112.4538, 11137], ["Lantana", "FL", "US", 26.5867, -80.052, 11136], ["B\xE9cancour", "QC", "CA", 46.3411, -72.4322, 11134], ["Oneida", "NY", "US", 43.0926, -75.6513, 11134], ["Gulf Shores", "AL", "US", 30.246, -87.7008, 11131], ["Dobbs Ferry", "NY", "US", 41.0145, -73.8726, 11131], ["Grand Rapids", "MN", "US", 47.2372, -93.5302, 11127], ["Coshocton", "OH", "US", 40.272, -81.8596, 11121], ["Cherry Creek", "CO", "US", 39.6345, -104.8829, 11120], ["Webster", "TX", "US", 29.5377, -95.1183, 11116], ["Helena-West Helena", "AR", "US", 34.5291, -90.59, 11109], ["Town and Country", "MO", "US", 38.6123, -90.4634, 11106], ["Lighthouse Point", "FL", "US", 26.2756, -80.0873, 11104], ["Lawrenceburg", "KY", "US", 38.0373, -84.8966, 11103], ["Village Park", "HI", "US", 21.3981, -158.0303, 11099], ["Fredericksburg", "TX", "US", 30.2752, -98.872, 11094], ["South Yarmouth", "MA", "US", 41.6668, -70.1847, 11092], ["North Saanich", "BC", "CA", 48.6663, -123.4193, 11089], ["Canyon Lake", "CA", "US", 33.685, -117.2731, 11080], ["View Park-Windsor Hills", "CA", "US", 33.9955, -118.3483, 11075], ["East Milton", "FL", "US", 30.6152, -87.0216, 11074], ["Leicester", "MA", "US", 42.2459, -71.9087, 11064], ["Grand Haven", "MI", "US", 43.0631, -86.2284, 11062], ["Peru", "IN", "US", 40.7537, -86.0689, 11060], ["Lakeland Highlands", "FL", "US", 27.9597, -81.9501, 11056], ["Joint Base Lewis McChord", "WA", "US", 47.1079, -122.5769, 11046], ["Saint Albans", "WV", "US", 38.3856, -81.8362, 11044], ["Burkburnett", "TX", "US", 34.0979, -98.5706, 11043], ["Londonderry", "NH", "US", 42.8651, -71.3739, 11037], ["Diamond Springs", "CA", "US", 38.6946, -120.8149, 11037], ["Sonoma", "CA", "US", 38.2919, -122.458, 11037], ["Millington", "TN", "US", 35.3415, -89.8973, 11027], ["Little Chute", "WI", "US", 44.28, -88.3184, 11026], ["Vermilion-on-the-Lake", "OH", "US", 41.4284, -82.3238, 11006], ["Suffern", "NY", "US", 41.1148, -74.1496, 11001], ["Ontario", "OR", "US", 44.0266, -116.9629, 10999], ["Chalco", "NE", "US", 41.1839, -96.1503, 10994], ["West Point", "MS", "US", 33.6076, -88.6503, 10990], ["Crestwood", "IL", "US", 41.6446, -87.7415, 10984], ["Mountain Top", "PA", "US", 41.1695, -75.8774, 10982], ["Doctor Phillips", "FL", "US", 28.4494, -81.4923, 10981], ["Totowa", "NJ", "US", 40.9051, -74.2099, 10973], ["Spuyten Duyvil", "NY", "US", 40.8812, -73.9174, 10971], ["Mitchellville", "MD", "US", 38.9251, -76.7428, 10967], ["Little Ferry", "NJ", "US", 40.8529, -74.0421, 10963], ["Warman", "SK", "CA", 52.3168, -106.5679, 10961], ["Martin", "TN", "US", 36.3434, -88.8503, 10959], ["Union", "MO", "US", 38.45, -91.0085, 10957], ["Damascus", "OR", "US", 45.4176, -122.459, 10952], ["Highland Park", "MI", "US", 42.4056, -83.0969, 10949], ["Vidor", "TX", "US", 30.1316, -94.0155, 10945], ["Cordele", "GA", "US", 31.9635, -83.7824, 10943], ["Bluffdale", "UT", "US", 40.4897, -111.9388, 10931], ["Malvern", "AR", "US", 34.3623, -92.813, 10928], ["Seymour", "TN", "US", 35.8906, -83.7246, 10919], ["Quartz Hill", "CA", "US", 34.6453, -118.2181, 10912], ["Gulf Gate Estates", "FL", "US", 27.2517, -82.5147, 10911], ["Storm Lake", "IA", "US", 42.6411, -95.2097, 10910], ["Trinity", "FL", "US", 28.1808, -82.6818, 10907], ["Fairfield", "AL", "US", 33.4859, -86.9119, 10907], ["Lincolnton", "NC", "US", 35.4738, -81.2545, 10900], ["Ironton", "OH", "US", 38.5367, -82.6829, 10900], ["Franklin Lakes", "NJ", "US", 41.0168, -74.2057, 10899], ["Brooklyn", "OH", "US", 41.4398, -81.7354, 10899], ["Newman", "CA", "US", 37.3138, -121.0208, 10899], ["Summerfield", "MD", "US", 38.9045, -76.8683, 10898], ["Corning", "NY", "US", 42.1429, -77.0547, 10897], ["Doraville", "GA", "US", 33.8982, -84.2833, 10896], ["Sturgis", "MI", "US", 41.7992, -85.4192, 10896], ["DeRidder", "LA", "US", 30.8463, -93.2891, 10890], ["Cowansville", "QC", "CA", 45.2001, -72.7491, 10887], ["Ogdensburg", "NY", "US", 44.6942, -75.4863, 10883], ["Woodbury", "NY", "US", 41.3645, -74.106, 10879], ["Taylorville", "IL", "US", 39.5489, -89.2945, 10873], ["Riverton", "WY", "US", 43.025, -108.3801, 10873], ["Citrus", "CA", "US", 34.115, -117.8917, 10866], ["Summerfield", "NC", "US", 36.2088, -79.9048, 10861], ["Show Low", "AZ", "US", 34.2542, -110.0298, 10860], ["Acushnet", "MA", "US", 41.6807, -70.9078, 10850], ["Waynesboro", "PA", "US", 39.7559, -77.5778, 10848], ["East Liverpool", "OH", "US", 40.6187, -80.5773, 10846], ["Coldwater", "MI", "US", 41.9403, -85.0005, 10844], ["Highland City", "FL", "US", 27.9653, -81.8779, 10834], ["Miami Shores", "FL", "US", 25.8632, -80.1928, 10831], ["Winchester Center", "CT", "US", 41.9001, -73.1348, 10830], ["Maltby", "WA", "US", 47.8051, -122.1132, 10830], ["Burr Ridge", "IL", "US", 41.7489, -87.9184, 10818], ["Sedro-Woolley", "WA", "US", 48.5039, -122.2361, 10815], ["Lindon", "UT", "US", 40.3433, -111.7208, 10810], ["Sweetwater", "TX", "US", 32.471, -100.4059, 10809], ["Pine Castle", "FL", "US", 28.4719, -81.3679, 10805], ["Mount Holly", "NJ", "US", 39.9929, -74.7877, 10804], ["Dawson Creek", "BC", "CA", 55.7598, -120.2403, 10802], ["La Riviera", "CA", "US", 38.5669, -121.3569, 10802], ["Marinette", "WI", "US", 45.1, -87.6307, 10799], ["Bellefontaine Neighbors", "MO", "US", 38.7403, -90.2265, 10798], ["Van Wert", "OH", "US", 40.8695, -84.5841, 10798], ["Muskegon Heights", "MI", "US", 43.2011, -86.239, 10796], ["Monroe", "WI", "US", 42.6011, -89.6385, 10796], ["Holbrook", "MA", "US", 42.1551, -71.0087, 10791], ["Broomall", "PA", "US", 39.9815, -75.3566, 10789], ["Worth", "IL", "US", 41.6897, -87.7973, 10784], ["Jacinto City", "TX", "US", 29.7675, -95.2338, 10782], ["Smithfield", "UT", "US", 41.8383, -111.8327, 10782], ["Farmersville", "CA", "US", 36.2977, -119.2068, 10774], ["Crestline", "CA", "US", 34.242, -117.2856, 10770], ["Kings Mountain", "NC", "US", 35.2451, -81.3412, 10760], ["Viera East", "FL", "US", 28.2623, -80.7145, 10757], ["Lowes Island", "VA", "US", 39.0598, -77.3522, 10756], ["Delhi", "CA", "US", 37.4322, -120.7785, 10755], ["Roessleville", "NY", "US", 42.6951, -73.8071, 10753], ["Sussex", "WI", "US", 43.1339, -88.222, 10753], ["Arkadelphia", "AR", "US", 34.1209, -93.0538, 10745], ["Saks", "AL", "US", 33.6987, -85.8397, 10744], ["Echelon", "NJ", "US", 39.8484, -74.9957, 10743], ["Collegedale", "TN", "US", 35.0531, -85.0502, 10743], ["Vermillion", "SD", "US", 42.7794, -96.9292, 10738], ["Minneola", "FL", "US", 28.5744, -81.7462, 10735], ["Tamalpais-Homestead Valley", "CA", "US", 37.8783, -122.5362, 10735], ["Middlesboro", "KY", "US", 36.6084, -83.7166, 10730], ["Lyons", "IL", "US", 41.8134, -87.8181, 10722], ["Holly Springs", "GA", "US", 34.174, -84.5013, 10719], ["Fort Madison", "IA", "US", 40.6298, -91.3152, 10717], ["Bolivar", "MO", "US", 37.6145, -93.4105, 10714], ["Bastrop", "LA", "US", 32.7783, -91.9114, 10713], ["Atchison", "KS", "US", 39.563, -95.1216, 10712], ["Largo", "MD", "US", 38.8976, -76.8303, 10709], ["Fredonia", "NY", "US", 42.4401, -79.3317, 10705], ["Cheval", "FL", "US", 28.1486, -82.5145, 10702], ["Halfway", "MD", "US", 39.6206, -77.7589, 10701], ["Petal", "MS", "US", 31.3466, -89.2601, 10701], ["Kapa\u2018a", "HI", "US", 22.0752, -159.319, 10699], ["Rosaryville", "MD", "US", 38.7568, -76.8097, 10697], ["Somers Point", "NJ", "US", 39.3176, -74.5946, 10688], ["Little Falls", "NJ", "US", 40.869, -74.2082, 10688], ["Darby", "PA", "US", 39.9184, -75.2591, 10687], ["Sainte-Anne-des-Plaines", "QC", "CA", 45.7647, -73.8116, 10680], ["Vidalia", "GA", "US", 32.2177, -82.4135, 10679], ["Gonzales", "LA", "US", 30.2385, -90.9201, 10678], ["Grimes", "IA", "US", 41.6883, -93.7911, 10676], ["Picayune", "MS", "US", 30.5256, -89.6779, 10675], ["Klahanie", "WA", "US", 47.571, -122.0084, 10674], ["Batesville", "AR", "US", 35.7698, -91.641, 10668], ["Northbrook", "OH", "US", 39.2465, -84.5836, 10668], ["Nelson", "BC", "CA", 49.4999, -117.2855, 10664], ["Kennett", "MO", "US", 36.2362, -90.0556, 10662], ["Lambton Shores", "ON", "CA", 43.1668, -81.9331, 10656], ["Burlington", "WI", "US", 42.6781, -88.2762, 10650], ["Placerville", "CA", "US", 38.7296, -120.7986, 10650], ["Garden Acres", "CA", "US", 37.9638, -121.2294, 10648], ["Muscoy", "CA", "US", 34.1542, -117.3442, 10644], ["Sandy", "OR", "US", 45.3973, -122.2615, 10644], ["Saint-Canut", "QC", "CA", 45.715, -74.0838, 10643], ["Lansdowne", "PA", "US", 39.9382, -75.2719, 10639], ["Morro Bay", "CA", "US", 35.3658, -120.8499, 10639], ["Sainte-Ad\xE8le", "QC", "CA", 45.9501, -74.1325, 10634], ["Satellite Beach", "FL", "US", 28.1761, -80.5901, 10633], ["Scottdale", "GA", "US", 33.7898, -84.2641, 10631], ["Massena", "NY", "US", 44.9281, -74.8919, 10629], ["Old Saybrook", "CT", "US", 41.2918, -72.3762, 10627], ["Bedford Heights", "OH", "US", 41.417, -81.5273, 10625], ["Vashon", "WA", "US", 47.4473, -122.4599, 10624], ["Camp Pendleton South", "CA", "US", 33.2284, -117.3793, 10616], ["Forest Acres", "SC", "US", 34.0193, -80.9898, 10615], ["Winton", "CA", "US", 37.3894, -120.6132, 10613], ["Keokuk", "IA", "US", 40.3973, -91.3849, 10609], ["Eureka", "MO", "US", 38.5025, -90.6279, 10602], ["Norwell", "MA", "US", 42.1618, -70.7939, 10581], ["Gardere", "LA", "US", 30.3457, -91.1401, 10580], ["Accokeek", "MD", "US", 38.6676, -77.0283, 10573], ["Union City", "TN", "US", 36.4242, -89.057, 10573], ["Vernon", "TX", "US", 34.1554, -99.2663, 10573], ["Vienna", "WV", "US", 39.327, -81.5485, 10573], ["Eltingville", "NY", "US", 40.5454, -74.1657, 10573], ["Santaquin", "UT", "US", 39.9755, -111.7852, 10572], ["North Versailles", "PA", "US", 40.3798, -79.8095, 10571], ["Lawrenceburg", "TN", "US", 35.2423, -87.3347, 10569], ["Roscoe", "IL", "US", 42.4134, -89.0093, 10565], ["Hillsdale", "NJ", "US", 41.0026, -74.0404, 10559], ["Salt Spring Island", "BC", "CA", 48.8185, -123.4906, 10557], ["Exeter", "CA", "US", 36.2961, -119.142, 10548], ["Belmont", "NC", "US", 35.2429, -81.0373, 10533], ["Forestville", "OH", "US", 39.0751, -84.3449, 10532], ["Weddington", "NC", "US", 35.0224, -80.7609, 10531], ["Farmington", "MI", "US", 42.4645, -83.3763, 10523], ["Jackson", "WY", "US", 43.4799, -110.7624, 10523], ["Chesapeake Ranch Estates", "MD", "US", 38.3462, -76.4177, 10519], ["Sylvan Lake", "AB", "CA", 52.311, -114.0837, 10518], ["Fox Lake", "IL", "US", 42.3967, -88.1837, 10518], ["Manchester", "TN", "US", 35.4817, -86.0886, 10517], ["The Pinery", "CO", "US", 39.4553, -104.7344, 10517], ["Pine Hill", "NJ", "US", 39.7843, -74.9921, 10510], ["Montgomery", "OH", "US", 39.2281, -84.3541, 10506], ["Redwood Shores", "CA", "US", 37.5319, -122.248, 10500], ["Sebring", "FL", "US", 27.4956, -81.4409, 10497], ["Dent", "OH", "US", 39.1859, -84.6513, 10497], ["Bound Brook", "NJ", "US", 40.5684, -74.5385, 10497], ["Sauk Village", "IL", "US", 41.4884, -87.5675, 10493], ["Rockport", "TX", "US", 28.0208, -97.056, 10490], ["Heath", "OH", "US", 40.0228, -82.4446, 10489], ["Ventnor City", "NJ", "US", 39.3404, -74.4774, 10486], ["Middle Island", "NY", "US", 40.8843, -72.9373, 10483], ["Arizona City", "AZ", "US", 32.7559, -111.671, 10475], ["Richmond Heights", "OH", "US", 41.5528, -81.5101, 10469], ["Wyomissing", "PA", "US", 40.3295, -75.9652, 10469], ["Temiskaming Shores", "ON", "CA", 47.4938, -79.7153, 10442], ["Burley", "ID", "US", 42.5357, -113.7928, 10436], ["Vermilion", "OH", "US", 41.422, -82.3646, 10434], ["Key Largo", "FL", "US", 25.0865, -80.4473, 10433], ["Warr Acres", "OK", "US", 35.5226, -97.6189, 10431], ["Canandaigua", "NY", "US", 42.8742, -77.288, 10431], ["Manville", "NJ", "US", 40.5409, -74.5877, 10429], ["West Haverstraw", "NY", "US", 41.2095, -73.9854, 10421], ["Cantley", "QC", "CA", 45.5668, -75.7827, 10412], ["Lincoln Park", "NJ", "US", 40.9243, -74.3021, 10405], ["Melvindale", "MI", "US", 42.2825, -83.1752, 10404], ["Cambridge", "OH", "US", 40.0312, -81.5885, 10402], ["Greencastle", "IN", "US", 39.6445, -86.8647, 10401], ["Big Rapids", "MI", "US", 43.6981, -85.4837, 10397], ["Kinnelon", "NJ", "US", 41.0018, -74.3671, 10392], ["Palatka", "FL", "US", 29.6486, -81.6376, 10390], ["Columbia", "PA", "US", 40.0337, -76.5044, 10388], ["Sedona", "AZ", "US", 34.8697, -111.761, 10388], ["Celina", "OH", "US", 40.5489, -84.5702, 10387], ["Norfolk", "MA", "US", 42.1195, -71.3251, 10386], ["Portage", "WI", "US", 43.5391, -89.4626, 10382], ["Wabash", "IN", "US", 40.7978, -85.8205, 10381], ["Struthers", "OH", "US", 41.0526, -80.6078, 10375], ["Cadillac", "MI", "US", 44.252, -85.4012, 10373], ["Big Lake", "MN", "US", 45.3325, -93.7461, 10368], ["Pella", "IA", "US", 41.4081, -92.9163, 10363], ["Castle Pines North", "CO", "US", 39.4717, -104.8948, 10360], ["Mount Airy", "NC", "US", 36.4993, -80.6073, 10354], ["Barrington", "IL", "US", 42.1539, -88.1362, 10353], ["Durham", "NH", "US", 43.134, -70.9265, 10345], ["West Point", "UT", "US", 41.1183, -112.0841, 10345], ["Silver Springs", "FL", "US", 29.2166, -82.0576, 10334], ["Newberry", "SC", "US", 34.2746, -81.6187, 10331], ["Linthicum", "MD", "US", 39.2051, -76.6527, 10324], ["Reading", "OH", "US", 39.2237, -84.4422, 10324], ["Bluefield", "WV", "US", 37.2698, -81.2223, 10323], ["Little Canada", "MN", "US", 45.0269, -93.0877, 10319], ["Labrador City", "NL", "CA", 52.9463, -66.9114, 10313], ["Eunice", "LA", "US", 30.4944, -92.4176, 10310], ["Wood River", "IL", "US", 38.8612, -90.0976, 10294], ["Hull", "MA", "US", 42.302, -70.9078, 10293], ["Oak Grove", "SC", "US", 33.9809, -81.1429, 10291], ["Morris Park", "NY", "US", 40.8523, -73.8535, 10289], ["Angus", "ON", "CA", 44.3168, -79.8829, 10269], ["Newport", "OR", "US", 44.6368, -124.0534, 10268], ["Beverly Hills", "MI", "US", 42.5239, -83.2233, 10267], ["Edwards", "CO", "US", 39.645, -106.5942, 10266], ["Cedar Hills", "UT", "US", 40.4141, -111.7585, 10265], ["Pleasant Grove", "AL", "US", 33.4909, -86.9703, 10260], ["Lancaster", "NY", "US", 42.9006, -78.6703, 10258], ["Nanticoke", "PA", "US", 41.2054, -76.0049, 10258], ["Milford", "DE", "US", 38.9126, -75.428, 10252], ["Rossmoor", "CA", "US", 33.7856, -118.0851, 10244], ["Timberlane", "LA", "US", 29.8774, -90.032, 10243], ["Sleepy Hollow", "NY", "US", 41.0857, -73.8585, 10242], ["Fairview Shores", "FL", "US", 28.5911, -81.3942, 10239], ["Waterloo", "IL", "US", 38.3359, -90.1498, 10236], ["Alpine", "UT", "US", 40.4533, -111.778, 10235], ["Beecher", "MI", "US", 43.09, -83.6944, 10232], ["Fairmount", "NY", "US", 43.0473, -76.2385, 10224], ["Espa\xF1ola", "NM", "US", 35.9911, -106.0806, 10224], ["Berwick", "PA", "US", 41.0545, -76.2333, 10223], ["Roma", "TX", "US", 26.4053, -99.0158, 10223], ["Fairmont", "MN", "US", 43.6522, -94.4611, 10221], ["River Grove", "IL", "US", 41.9259, -87.8359, 10219], ["Anderson", "CA", "US", 40.4482, -122.2978, 10217], ["North Branch", "MN", "US", 45.5114, -92.9802, 10215], ["Watervliet", "NY", "US", 42.7301, -73.7012, 10214], ["Vail", "AZ", "US", 32.0479, -110.712, 10208], ["Gages Lake", "IL", "US", 42.3517, -87.9826, 10198], ["Jefferson", "GA", "US", 34.117, -83.5724, 10195], ["Raceland", "LA", "US", 29.7274, -90.599, 10193], ["Columbia", "IL", "US", 38.4437, -90.2012, 10191], ["Bel Air", "MD", "US", 39.5359, -76.3483, 10190], ["Capitola", "CA", "US", 36.9752, -121.9533, 10189], ["North Logan", "UT", "US", 41.7694, -111.8047, 10181], ["Jennings", "LA", "US", 30.2224, -92.6571, 10180], ["Bohemia", "NY", "US", 40.7693, -73.1151, 10180], ["Alpena", "MI", "US", 45.0617, -83.4327, 10175], ["Bellmead", "TX", "US", 31.594, -97.1089, 10164], ["Forestdale", "AL", "US", 33.5701, -86.8964, 10162], ["Wells Beach Station", "ME", "US", 43.324, -70.5914, 10162], ["Lake Morton-Berrydale", "WA", "US", 47.3325, -122.1029, 10160], ["Gold Camp", "AZ", "US", 33.2937, -111.3043, 10159], ["Shasta Lake", "CA", "US", 40.6804, -122.3708, 10159], ["Gold Canyon", "AZ", "US", 33.3715, -111.4369, 10159], ["Lanham", "MD", "US", 38.9688, -76.8634, 10157], ["Paris", "TN", "US", 36.302, -88.3267, 10150], ["Great Neck", "NY", "US", 40.8007, -73.7285, 10143], ["East Stroudsburg", "PA", "US", 40.9995, -75.1813, 10140], ["Oil City", "PA", "US", 41.434, -79.7064, 10137], ["Norwalk", "IA", "US", 41.4755, -93.6788, 10135], ["Marlton", "NJ", "US", 39.8912, -74.9218, 10133], ["Pr\xE9vost", "QC", "CA", 45.8668, -74.0825, 10132], ["Galion", "OH", "US", 40.7337, -82.7899, 10127], ["Denham Springs", "LA", "US", 30.4874, -90.9575, 10125], ["Fort Knox", "KY", "US", 37.8911, -85.9636, 10124], ["Mercier", "QC", "CA", 45.3168, -73.7492, 10121], ["Essex Junction", "VT", "US", 44.4906, -73.111, 10111], ["San Diego Country Estates", "CA", "US", 33.0067, -116.7836, 10109], ["Maynard", "MA", "US", 42.4334, -71.4495, 10106], ["Goulds", "FL", "US", 25.5626, -80.3823, 10103], ["Waldwick", "NJ", "US", 41.0106, -74.1179, 10095], ["Port Salerno", "FL", "US", 27.1442, -80.2006, 10091], ["Parsons", "KS", "US", 37.3403, -95.2611, 10090], ["Comstock Park", "MI", "US", 43.0386, -85.67, 10088], ["Avon Park", "FL", "US", 27.5959, -81.5062, 10086], ["Inwood", "NY", "US", 40.8657, -73.9268, 10082], ["Mayfield", "KY", "US", 36.7417, -88.6367, 10080], ["Bonham", "TX", "US", 33.5773, -96.1783, 10079], ["Lexington", "NE", "US", 40.7808, -99.7415, 10075], ["Countryside", "VA", "US", 39.0409, -77.4136, 10072], ["Waverly", "IA", "US", 42.7258, -92.4755, 10066], ["Canyon Rim", "UT", "US", 40.7066, -111.8219, 10062], ["London", "OH", "US", 39.8865, -83.4483, 10060], ["Lacombe", "AB", "CA", 52.4668, -113.7353, 10059], ["North Andrews Gardens", "FL", "US", 26.1915, -80.1442, 10056], ["Clinton", "TN", "US", 36.1034, -84.1319, 10049], ["Atmore", "AL", "US", 31.0238, -87.4939, 10049], ["Little Neck", "NY", "US", 40.7629, -73.7322, 10049], ["Oregon", "WI", "US", 42.9261, -89.3846, 10043], ["Poulsbo", "WA", "US", 47.7359, -122.6465, 10041], ["Troy", "IL", "US", 38.7292, -89.8832, 10036], ["New Port Richey East", "FL", "US", 28.2603, -82.6926, 10036], ["Plymouth", "IN", "US", 41.3437, -86.3097, 10035], ["Monmouth", "OR", "US", 44.8484, -123.234, 10032], ["Grantsville", "UT", "US", 40.5999, -112.4644, 10027], ["Elon", "NC", "US", 36.1029, -79.5067, 10024], ["Woodbury", "NJ", "US", 39.8382, -75.1527, 10020], ["Waggaman", "LA", "US", 29.9185, -90.2109, 10015], ["Fort Salonga", "NY", "US", 40.9126, -73.301, 10008], ["Bluffton", "IN", "US", 40.7387, -85.1716, 10005], ["Silver City", "NM", "US", 32.7701, -108.2803, 10004], ["Fairview", "CA", "US", 37.6785, -122.0458, 10003], ["Del Aire", "CA", "US", 33.9161, -118.3695, 10001], ["Hanceville", "BC", "CA", 51.9192, -123.0446, 1e4], ["Cross Lanes", "WV", "US", 38.4204, -81.7907, 9995], ["Huguenot", "NY", "US", 40.5373, -74.1946, 9995], ["Veradale", "WA", "US", 47.6499, -117.2074, 9991], ["Uniontown", "PA", "US", 39.9001, -79.7164, 9990], ["Harrisonville", "MO", "US", 38.6533, -94.3488, 9986], ["South Huron", "ON", "CA", 43.3168, -81.5165, 9982], ["Pearsall", "TX", "US", 28.8922, -99.095, 9980], ["Dishman", "WA", "US", 47.6601, -117.276, 9978], ["Bells Corners", "ON", "CA", 45.3159, -75.8301, 9977], ["Benton Harbor", "MI", "US", 42.1167, -86.4542, 9976], ["Fife", "WA", "US", 47.2393, -122.3571, 9970], ["Cottage Grove", "OR", "US", 43.7976, -123.0595, 9969], ["Carroll", "IA", "US", 42.0658, -94.8669, 9968], ["Lambertville", "MI", "US", 41.7659, -83.628, 9953], ["Peru", "IL", "US", 41.3275, -89.129, 9952], ["Arden Hills", "MN", "US", 45.0502, -93.1566, 9951], ["Croydon", "PA", "US", 40.0873, -74.9035, 9950], ["Indianola", "MS", "US", 33.4509, -90.6551, 9943], ["Covington", "LA", "US", 30.4755, -90.1004, 9928], ["L'\xCEle-Perrot", "QC", "CA", 45.3834, -73.9492, 9927], ["Kendallville", "IN", "US", 41.4414, -85.265, 9927], ["Timonium", "MD", "US", 39.437, -76.6197, 9925], ["Lake Monticello", "VA", "US", 37.9232, -78.3347, 9920], ["Lackland Air Force Base", "TX", "US", 29.3866, -98.618, 9918], ["Lake Mohawk", "NJ", "US", 41.0184, -74.6602, 9916], ["Flat Rock", "MI", "US", 42.0964, -83.2919, 9914], ["Cape Canaveral", "FL", "US", 28.4058, -80.6048, 9912], ["Glenwood Springs", "CO", "US", 39.5505, -107.3248, 9906], ["Estevan", "SK", "CA", 49.1334, -102.9842, 9904], ["Corte Madera", "CA", "US", 37.9255, -122.5275, 9901], ["Tipp City", "OH", "US", 39.9584, -84.1722, 9899], ["Harrison", "OH", "US", 39.262, -84.82, 9897], ["Warrenton", "VA", "US", 38.7135, -77.7953, 9897], ["Coral Hills", "MD", "US", 38.8704, -76.9211, 9895], ["Elkhorn", "WI", "US", 42.6728, -88.5445, 9895], ["East Rockaway", "NY", "US", 40.642, -73.6696, 9894], ["Fairfield", "IA", "US", 41.0086, -91.9627, 9892], ["Hope", "AR", "US", 33.6671, -93.5916, 9891], ["Hinton", "AB", "CA", 53.4001, -117.5857, 9889], ["Bloomingdale", "TN", "US", 36.5846, -82.4893, 9888], ["Notre-Dame-de-l'\xCEle-Perrot", "QC", "CA", 45.3668, -73.9325, 9885], ["New Albany", "OH", "US", 40.0812, -82.8088, 9879], ["Andover", "FL", "US", 25.9684, -80.2128, 9877], ["Brownsville", "TN", "US", 35.594, -89.2623, 9876], ["Moncks Corner", "SC", "US", 33.1963, -80.0143, 9873], ["Keansburg", "NJ", "US", 40.4418, -74.1299, 9873], ["Paris", "KY", "US", 38.2098, -84.253, 9870], ["Northampton", "PA", "US", 40.6862, -75.4968, 9860], ["Middleton", "MA", "US", 42.5951, -71.0162, 9859], ["Brandon", "SD", "US", 43.5947, -96.572, 9856], ["Highland", "IL", "US", 38.7395, -89.6712, 9848], ["Russellville", "AL", "US", 34.5079, -87.7286, 9847], ["Fate", "TX", "US", 32.9415, -96.3814, 9847], ["Brambleton", "VA", "US", 38.9821, -77.5386, 9845], ["Rincon", "GA", "US", 32.296, -81.2354, 9843], ["Cameron", "MO", "US", 39.7403, -94.2411, 9836], ["Havre", "MT", "US", 48.55, -109.6841, 9834], ["Shelton", "WA", "US", 47.2151, -123.1007, 9834], ["Christiana", "TN", "US", 35.7101, -86.3994, 9830], ["Pleasanton", "TX", "US", 28.9672, -98.4786, 9829], ["High River", "AB", "CA", 50.5834, -113.8687, 9826], ["Edgewood", "WA", "US", 47.2501, -122.2937, 9826], ["Wapakoneta", "OH", "US", 40.5678, -84.1936, 9823], ["Monticello", "AR", "US", 33.629, -91.791, 9820], ["Alamosa", "CO", "US", 37.4695, -105.87, 9819], ["New Hyde Park", "NY", "US", 40.7351, -73.6879, 9811], ["Waynesville", "NC", "US", 35.4887, -82.9887, 9809], ["Burlington", "NJ", "US", 40.0712, -74.8649, 9808], ["Maywood", "NJ", "US", 40.9026, -74.0618, 9805], ["Fort Oglethorpe", "GA", "US", 34.949, -85.2569, 9803], ["Inwood", "NY", "US", 40.6221, -73.7468, 9792], ["Cody", "WY", "US", 44.5263, -109.0565, 9792], ["Walnut Grove", "WA", "US", 45.6679, -122.599, 9790], ["Washington", "NC", "US", 35.5466, -77.0522, 9788], ["Wyndham", "VA", "US", 37.6985, -77.6125, 9785], ["Hartford", "VT", "US", 43.6606, -72.3384, 9779], ["Lake Arbor", "MD", "US", 38.9079, -76.8297, 9776], ["Merrydale", "LA", "US", 30.5013, -91.1084, 9772], ["Minnehaha", "WA", "US", 45.659, -122.6487, 9771], ["Reserve", "LA", "US", 30.0538, -90.5517, 9766], ["Union Park", "FL", "US", 28.5681, -81.2862, 9765], ["Roma-Los Saenz", "TX", "US", 26.4051, -99.0159, 9765], ["Progress", "PA", "US", 40.2851, -76.8314, 9765], ["Le Mars", "IA", "US", 42.7942, -96.1656, 9761], ["Alachua", "FL", "US", 29.7516, -82.4248, 9757], ["Marysville", "MI", "US", 42.9125, -82.4869, 9757], ["East La Mirada", "CA", "US", 33.9245, -117.989, 9757], ["Woodbury", "CT", "US", 41.5445, -73.209, 9755], ["Silverton", "OR", "US", 45.0051, -122.7832, 9753], ["Cairo", "GA", "US", 30.8775, -84.2021, 9752], ["Baker City", "OR", "US", 44.7749, -117.8344, 9752], ["Cedartown", "GA", "US", 34.0112, -85.2559, 9750], ["Panthersville", "GA", "US", 33.7073, -84.2719, 9749], ["Carleton Place", "ON", "CA", 45.1334, -76.1494, 9743], ["Brownfield", "TX", "US", 33.1812, -102.2743, 9736], ["Vinings", "GA", "US", 33.8648, -84.4644, 9734], ["Dunn", "NC", "US", 35.3063, -78.6089, 9723], ["Trail", "BC", "CA", 49.0998, -117.7022, 9707], ["Hermantown", "MN", "US", 46.8069, -92.2382, 9706], ["Sumner", "WA", "US", 47.2032, -122.2404, 9700], ["Ingleside", "TX", "US", 27.8778, -97.2117, 9695], ["Boaz", "AL", "US", 34.2007, -86.1664, 9688], ["Potsdam", "NY", "US", 44.6698, -74.9813, 9688], ["Southborough", "MA", "US", 42.3056, -71.5245, 9686], ["Safford", "AZ", "US", 32.834, -109.7076, 9683], ["Sparta", "WI", "US", 43.9441, -90.8129, 9679], ["Mountain House", "CA", "US", 37.7833, -121.5427, 9675], ["North Bend", "OR", "US", 43.4065, -124.2243, 9673], ["Snohomish", "WA", "US", 47.9129, -122.0982, 9670], ["Coffeyville", "KS", "US", 37.0373, -95.6164, 9669], ["Park Forest Village", "PA", "US", 40.8067, -77.9169, 9660], ["Winfield", "IL", "US", 41.8617, -88.1609, 9657], ["Hampton", "NH", "US", 42.9376, -70.8389, 9656], ["Clay", "AL", "US", 33.7026, -86.5997, 9655], ["Selkirk", "MB", "CA", 50.1436, -96.8845, 9653], ["Sunbury", "PA", "US", 40.8626, -76.7944, 9652], ["Holmen", "WI", "US", 43.9633, -91.2562, 9651], ["Westview", "FL", "US", 25.882, -80.242, 9650], ["Edgemere", "NY", "US", 40.5962, -73.7676, 9646], ["Soquel", "CA", "US", 36.988, -121.9566, 9644], ["Kalaoa", "HI", "US", 19.7286, -155.9817, 9644], ["Bladensburg", "MD", "US", 38.9393, -76.9339, 9640], ["Jesup", "GA", "US", 31.6078, -81.8863, 9633], ["Milton", "FL", "US", 30.6324, -87.0397, 9628], ["Astoria", "OR", "US", 46.1879, -123.8312, 9626], ["Mooresville", "IN", "US", 39.6128, -86.3742, 9623], ["Red Bank", "SC", "US", 33.9321, -81.2384, 9617], ["Danville", "IN", "US", 39.7606, -86.5264, 9614], ["Saddle Brooke", "AZ", "US", 32.5347, -110.8736, 9614], ["Lorraine", "QC", "CA", 45.6834, -73.7825, 9613], ["Rye Brook", "NY", "US", 41.0193, -73.6835, 9611], ["La Salle", "IL", "US", 41.3334, -89.0918, 9609], ["Tega Cay", "SC", "US", 35.0243, -81.0279, 9608], ["Arnprior", "ON", "CA", 45.4334, -76.3494, 9607], ["Steinbach", "MB", "CA", 49.5258, -96.6845, 9607], ["Lock Haven", "PA", "US", 41.137, -77.4469, 9604], ["Winslow", "AZ", "US", 35.0242, -110.6974, 9600], ["Rosslyn", "VA", "US", 38.8968, -77.0725, 9599], ["Girard", "OH", "US", 41.154, -80.7015, 9599], ["Bee Ridge", "FL", "US", 27.2839, -82.4806, 9598], ["Pine Ridge", "FL", "US", 28.9383, -82.4734, 9598], ["Orange Cove", "CA", "US", 36.6244, -119.3137, 9598], ["Gifford", "FL", "US", 27.6753, -80.4092, 9590], ["Rainbow City", "AL", "US", 33.9548, -86.0419, 9580], ["Hackettstown", "NJ", "US", 40.854, -74.8291, 9579], ["Hamburg", "NY", "US", 42.7159, -78.8295, 9576], ["Bristol", "PA", "US", 40.1007, -74.8518, 9569], ["Clinton", "OK", "US", 35.5156, -98.9673, 9565], ["Picture Rocks", "AZ", "US", 32.3459, -111.2462, 9563], ["Rifle", "CO", "US", 39.5347, -107.7831, 9563], ["Lachute", "QC", "CA", 45.6501, -74.3325, 9562], ["Coweta", "OK", "US", 35.9518, -95.6508, 9559], ["Lake Barcroft", "VA", "US", 38.8479, -77.1558, 9558], ["Brock Hall", "MD", "US", 38.8501, -76.7611, 9552], ["Bethel", "CT", "US", 41.3712, -73.414, 9549], ["Reedsburg", "WI", "US", 43.5325, -90.0026, 9548], ["Chevy Chase", "DC", "US", 38.964, -77.0678, 9545], ["Chevy Chase", "MD", "US", 39.0029, -77.0712, 9545], ["Val-des-Monts", "QC", "CA", 45.6501, -75.666, 9539], ["Prineville", "OR", "US", 44.2998, -120.8345, 9530], ["Dongan Hills", "NY", "US", 40.5884, -74.0962, 9529], ["Howell", "MI", "US", 42.6073, -83.9294, 9521], ["Clifton", "NY", "US", 40.6201, -74.0771, 9519], ["Pecos", "TX", "US", 31.4229, -103.4932, 9517], ["Marine Corps Base Hawaii - MCBH", "HI", "US", 21.4434, -157.7498, 9517], ["Steger", "IL", "US", 41.47, -87.6364, 9515], ["North Kensington", "MD", "US", 39.0304, -77.0725, 9514], ["White Marsh", "MD", "US", 39.3837, -76.4322, 9513], ["Sugar Grove", "IL", "US", 41.7614, -88.4437, 9512], ["North Gates", "NY", "US", 43.1765, -77.7014, 9512], ["Brentwood", "PA", "US", 40.3706, -79.9748, 9512], ["Fort George G Mead Junction", "MD", "US", 39.1259, -76.7891, 9505], ["La Tuque", "QC", "CA", 47.4334, -72.7824, 9503], ["River Vale", "NJ", "US", 40.9954, -74.0121, 9497], ["Taft", "CA", "US", 35.1425, -119.4565, 9495], ["White Horse", "NJ", "US", 40.1907, -74.7024, 9494], ["Mission", "KS", "US", 39.0278, -94.6558, 9491], ["M\u0101\u2018ili", "HI", "US", 21.4163, -158.1753, 9488], ["Chillicothe", "MO", "US", 39.7953, -93.5524, 9487], ["Saint-Amable", "QC", "CA", 45.6501, -73.2992, 9486], ["Amityville", "NY", "US", 40.679, -73.4171, 9486], ["Woodlyn", "PA", "US", 39.8723, -75.3371, 9485], ["Villas", "NJ", "US", 39.0287, -74.9385, 9483], ["Flossmoor", "IL", "US", 41.5428, -87.6848, 9478], ["Braselton", "GA", "US", 34.1093, -83.7627, 9476], ["Prospect", "CT", "US", 41.5023, -72.9787, 9476], ["Orono", "ME", "US", 44.8831, -68.672, 9474], ["Pryor Creek", "OK", "US", 36.3086, -95.3178, 9469], ["Decatur", "IN", "US", 40.8306, -84.9291, 9465], ["Valley", "AL", "US", 32.8187, -85.1794, 9464], ["Winterville", "NC", "US", 35.529, -77.4011, 9464], ["West Perrine", "FL", "US", 25.6059, -80.3628, 9460], ["Somers", "WI", "US", 42.6403, -87.9104, 9454], ["Lowell", "IN", "US", 41.2914, -87.4206, 9450], ["Southwick", "MA", "US", 42.0548, -72.7704, 9444], ["Springfield", "FL", "US", 30.1533, -85.6113, 9442], ["Newcastle", "OK", "US", 35.2473, -97.5998, 9438], ["Marlboro Village", "MD", "US", 38.8305, -76.7696, 9438], ["Clarksville", "AR", "US", 35.4715, -93.4666, 9433], ["Rensselaer", "NY", "US", 42.6426, -73.7429, 9433], ["Lamesa", "TX", "US", 32.7376, -101.951, 9427], ["Kearney", "MO", "US", 39.3678, -94.3622, 9423], ["South Huntington", "NY", "US", 40.8237, -73.3987, 9422], ["Anaconda", "MT", "US", 46.1285, -112.9423, 9417], ["Gloucester Point", "VA", "US", 37.254, -76.4969, 9402], ["The Village", "OK", "US", 35.5609, -97.5514, 9400], ["Lisbon", "ME", "US", 44.0315, -70.1045, 9392], ["Granbury", "TX", "US", 32.4421, -97.7942, 9386], ["Willoughby Hills", "OH", "US", 41.5984, -81.4185, 9382], ["Mount Airy", "MD", "US", 39.3762, -77.1547, 9380], ["Country Club", "CA", "US", 37.9688, -121.3408, 9379], ["Berlin", "NH", "US", 44.4687, -71.1851, 9367], ["Saint Francis", "WI", "US", 42.9675, -87.8776, 9365], ["North Bath", "ME", "US", 43.9348, -69.8159, 9363], ["Economy", "PA", "US", 40.6001, -80.2248, 9363], ["Weyburn", "SK", "CA", 49.6668, -103.8511, 9362], ["Thompson", "CT", "US", 41.9587, -71.8626, 9358], ["Tomah", "WI", "US", 43.9786, -90.504, 9357], ["DuPont", "WA", "US", 47.0968, -122.6312, 9356], ["Woodbridge", "CT", "US", 41.3526, -73.0084, 9355], ["Valencia West", "AZ", "US", 32.1324, -111.1141, 9355], ["Blackhawk", "CA", "US", 37.8208, -121.9077, 9354], ["Harahan", "LA", "US", 29.9405, -90.2031, 9350], ["Bethalto", "IL", "US", 38.9092, -90.0407, 9349], ["Morehead City", "NC", "US", 34.7229, -76.726, 9347], ["Saint Pete Beach", "FL", "US", 27.7253, -82.7412, 9346], ["Kendall Park", "NJ", "US", 40.4209, -74.5607, 9339], ["\u2018Aiea", "HI", "US", 21.3822, -157.9336, 9338], ["Amherst", "NS", "CA", 45.8334, -64.1987, 9336], ["Mound", "MN", "US", 44.9366, -93.6661, 9336], ["Jeannette", "PA", "US", 40.3281, -79.6153, 9335], ["Port Townsend", "WA", "US", 48.117, -122.7605, 9335], ["Warren", "PA", "US", 41.8439, -79.145, 9334], ["North College Hill", "OH", "US", 39.2184, -84.5508, 9332], ["Dorchester", "ON", "CA", 42.9834, -81.0664, 9329], ["Fort Meade", "MD", "US", 39.1082, -76.7432, 9327], ["Greenwood", "AR", "US", 35.2156, -94.2558, 9322], ["Alcoa", "TN", "US", 35.7895, -83.9738, 9316], ["Rockcreek", "OR", "US", 45.5501, -122.877, 9316], ["Pleasant Hill", "IA", "US", 41.5839, -93.5199, 9314], ["Charter Oak", "CA", "US", 34.1031, -117.8459, 9310], ["Rochelle", "IL", "US", 41.9239, -89.0687, 9309], ["Woodfield", "SC", "US", 34.0593, -80.9309, 9303], ["Augusta", "KS", "US", 37.6867, -96.9767, 9299], ["Bala-Cynwyd", "PA", "US", 40.0076, -75.2341, 9299], ["Hebron", "CT", "US", 41.6579, -72.3659, 9298], ["Anthony", "NM", "US", 32.004, -106.6058, 9293], ["Monmouth", "IL", "US", 40.9114, -90.6474, 9291], ["Box Elder", "SD", "US", 44.1125, -103.0682, 9289], ["Roberval", "QC", "CA", 48.5168, -72.2324, 9287], ["Harleysville", "PA", "US", 40.2796, -75.3871, 9286], ["Ellisville", "MO", "US", 38.5926, -90.5871, 9284], ["Wasilla", "AK", "US", 61.5809, -149.4415, 9284], ["Lynwood", "IL", "US", 41.5264, -87.5387, 9280], ["Fairview", "OR", "US", 45.5384, -122.434, 9280], ["Valley Center", "CA", "US", 33.2184, -117.0342, 9277], ["Frankfort Square", "IL", "US", 41.5189, -87.8031, 9276], ["Pleasant View", "UT", "US", 41.3183, -111.9922, 9273], ["Sweet Home", "OR", "US", 44.3976, -122.7362, 9270], ["Huron East", "ON", "CA", 43.6168, -81.2998, 9264], ["Gunbarrel", "CO", "US", 40.0633, -105.1711, 9263], ["Bay Saint Louis", "MS", "US", 30.3088, -89.33, 9260], ["Ecorse", "MI", "US", 42.2445, -83.1458, 9257], ["Seven Corners", "VA", "US", 38.8721, -77.1553, 9255], ["Chanute", "KS", "US", 37.6792, -95.4572, 9252], ["Perryton", "TX", "US", 36.4, -100.8026, 9252], ["Friendly", "MD", "US", 38.7518, -76.9786, 9250], ["Tulalip", "WA", "US", 48.0684, -122.2918, 9246], ["Exeter", "NH", "US", 42.9815, -70.9478, 9242], ["Waseca", "MN", "US", 44.0777, -93.5074, 9241], ["Kapuskasing", "ON", "CA", 49.4169, -82.4331, 9240], ["Brookdale", "NJ", "US", 40.8337, -74.1829, 9239], ["Grants", "NM", "US", 35.1476, -107.8526, 9239], ["Stuarts Draft", "VA", "US", 38.0301, -79.0336, 9235], ["Smithville", "MO", "US", 39.3869, -94.5811, 9233], ["Merrill", "WI", "US", 45.1805, -89.6835, 9233], ["Purcellville", "VA", "US", 39.1368, -77.7147, 9232], ["Brewer", "ME", "US", 44.7967, -68.7614, 9232], ["Grosse Pointe Farms", "MI", "US", 42.4092, -82.8919, 9232], ["Mapleton", "UT", "US", 40.1302, -111.5785, 9232], ["Independence", "OR", "US", 44.8512, -123.1868, 9227], ["Lititz", "PA", "US", 40.1573, -76.3069, 9225], ["Groton", "CT", "US", 41.3501, -72.0784, 9221], ["Rockingham", "NC", "US", 34.9393, -79.7739, 9220], ["Leonia", "NJ", "US", 40.8615, -73.9882, 9219], ["Hartland", "WI", "US", 43.105, -88.342, 9219], ["Rio Del Mar", "CA", "US", 36.9683, -121.9002, 9216], ["Sutton", "MA", "US", 42.1501, -71.7629, 9215], ["Tiburon", "CA", "US", 37.8735, -122.4566, 9214], ["Scotchtown", "NY", "US", 41.4815, -74.3602, 9212], ["Waimea", "HI", "US", 20.0232, -155.6729, 9212], ["Garden City", "SC", "US", 33.593, -79.0087, 9209], ["Brigantine", "NJ", "US", 39.4101, -74.3646, 9204], ["Heber City", "UT", "US", 40.5069, -111.4132, 9198], ["Aliquippa", "PA", "US", 40.6367, -80.2401, 9197], ["Harvard", "IL", "US", 42.4222, -88.6137, 9194], ["Alma", "MI", "US", 43.3789, -84.6597, 9193], ["Good Hope", "CA", "US", 33.7647, -117.267, 9192], ["Saint-Sauveur", "QC", "CA", 45.8869, -74.1794, 9191], ["Centerville", "MA", "US", 41.6487, -70.3481, 9190], ["Highland Park", "TX", "US", 32.8335, -96.7919, 9189], ["Beckett Ridge", "OH", "US", 39.347, -84.4352, 9187], ["Saint Dennis", "KY", "US", 38.1884, -85.8458, 9177], ["Urbana", "MD", "US", 39.3259, -77.3514, 9175], ["Riverdale", "NY", "US", 40.9006, -73.9064, 9174], ["Presque Isle", "ME", "US", 46.6812, -68.0159, 9171], ["Laurens", "SC", "US", 34.499, -82.0143, 9166], ["East Rutherford", "NJ", "US", 40.834, -74.0971, 9164], ["Blackstone", "MA", "US", 42.0179, -71.5412, 9163], ["Madera Acres", "CA", "US", 37.0191, -120.0668, 9163], ["Washington Terrace", "UT", "US", 41.1727, -111.9766, 9157], ["Succasunna", "NJ", "US", 40.8684, -74.6404, 9152], ["Versailles", "KY", "US", 38.0526, -84.73, 9146], ["Grinnell", "IA", "US", 41.743, -92.7224, 9141], ["Shawano", "WI", "US", 44.7822, -88.609, 9128], ["Louisville", "OH", "US", 40.8373, -81.2596, 9126], ["La Plata", "MD", "US", 38.5293, -76.9753, 9125], ["Hondo", "TX", "US", 29.3475, -99.1414, 9119], ["Bay Minette", "AL", "US", 30.883, -87.773, 9118], ["Middletown", "PA", "US", 40.1998, -76.7311, 9117], ["Sheffield", "AL", "US", 34.7651, -87.6986, 9108], ["Selma", "TX", "US", 29.5844, -98.3059, 9108], ["Valley Cottage", "NY", "US", 41.1181, -73.9554, 9107], ["Forest", "VA", "US", 37.3638, -79.2897, 9106], ["Marianna", "FL", "US", 30.7744, -85.2269, 9100], ["Saline", "MI", "US", 42.1667, -83.7816, 9100], ["Roxborough Park", "CO", "US", 39.4739, -105.0853, 9099], ["Lenoir City", "TN", "US", 35.7973, -84.256, 9091], ["Rock Falls", "IL", "US", 41.7797, -89.689, 9087], ["Portola Hills", "CA", "US", 33.6792, -117.6312, 9083], ["Bennington", "VT", "US", 42.8781, -73.1968, 9074], ["Berkeley", "MO", "US", 38.7545, -90.3312, 9073], ["Atoka", "TN", "US", 35.4412, -89.7781, 9064], ["Andalusia", "AL", "US", 31.3081, -86.4824, 9063], ["Georgetown", "SC", "US", 33.3768, -79.2945, 9062], ["College Place", "WA", "US", 46.0493, -118.3883, 9062], ["Shelby", "OH", "US", 40.8815, -82.6618, 9058], ["Stuttgart", "AR", "US", 34.5004, -91.5526, 9056], ["Hernando", "FL", "US", 28.9, -82.3745, 9054], ["Charlotte", "MI", "US", 42.5637, -84.8358, 9054], ["Micco", "FL", "US", 27.8806, -80.5003, 9052], ["Oakwood", "OH", "US", 39.7253, -84.1741, 9052], ["Winston", "FL", "US", 28.0317, -82.0148, 9050], ["Fultondale", "AL", "US", 33.6048, -86.7939, 9048], ["Oakville", "CT", "US", 41.5934, -73.0854, 9047], ["Lake Lucerne", "FL", "US", 25.9651, -80.2414, 9044], ["East Haddam", "CT", "US", 41.4532, -72.4612, 9042], ["Rawlins", "WY", "US", 41.7911, -107.2387, 9040], ["Elgin", "TX", "US", 30.3497, -97.3703, 9039], ["Liberty", "TX", "US", 30.058, -94.7955, 9039], ["Evergreen", "CO", "US", 39.6333, -105.3172, 9038], ["Fort Polk South", "LA", "US", 31.0511, -93.2158, 9038], ["Oakbrook", "KY", "US", 38.9998, -84.6852, 9036], ["Covington", "TN", "US", 35.5643, -89.6465, 9036], ["Thomaston", "GA", "US", 32.8882, -84.3266, 9032], ["Lincoln Village", "OH", "US", 39.9548, -83.1307, 9032], ["Marlton", "MD", "US", 38.7737, -76.79, 9031], ["Sheffield Lake", "OH", "US", 41.4875, -82.1015, 9026], ["Edgewater", "MD", "US", 38.9571, -76.55, 9023], ["Scott", "LA", "US", 30.2358, -92.0946, 9018], ["Fitzgerald", "GA", "US", 31.7149, -83.2527, 9013], ["Alexandria", "KY", "US", 38.9595, -84.388, 9009], ["Olney", "IL", "US", 38.7309, -88.0853, 9005], ["Detroit Lakes", "MN", "US", 46.8172, -95.8453, 9002], ["Garden City", "GA", "US", 32.1144, -81.154, 8999], ["Manteno", "IL", "US", 41.2506, -87.8314, 8999], ["Mechanicsburg", "PA", "US", 40.2143, -77.0086, 8999], ["San Elizario", "TX", "US", 31.5851, -106.2728, 8999], ["Glenwood", "IL", "US", 41.5425, -87.6023, 8996], ["Toppenish", "WA", "US", 46.3773, -120.3087, 8995], ["Chatham", "NJ", "US", 40.7409, -74.3838, 8993], ["Monett", "MO", "US", 36.929, -93.9277, 8988], ["Kitimat", "BC", "CA", 54.0524, -128.6534, 8987], ["Glenshaw", "PA", "US", 40.5329, -79.9676, 8981], ["Madeira", "OH", "US", 39.1909, -84.3636, 8976], ["Molalla", "OR", "US", 45.1473, -122.577, 8972], ["Budd Lake", "NJ", "US", 40.8712, -74.734, 8968], ["Montecito", "CA", "US", 34.4367, -119.6321, 8965], ["Dayton", "NV", "US", 39.2371, -119.593, 8964], ["Stonegate", "CO", "US", 39.5308, -104.8039, 8962], ["Midland", "WA", "US", 47.167, -122.4048, 8962], ["Little River", "SC", "US", 33.8732, -78.6142, 8960], ["Eidson Road", "TX", "US", 28.6772, -100.487, 8960], ["La Malbaie", "QC", "CA", 47.654, -70.1527, 8959], ["Independence", "KS", "US", 37.2242, -95.7083, 8958], ["Fallston", "MD", "US", 39.5145, -76.4111, 8958], ["Lancaster", "SC", "US", 34.7204, -80.7709, 8956], ["Sturgeon Bay", "WI", "US", 44.8342, -87.377, 8956], ["Northwest Harborcreek", "PA", "US", 42.1494, -79.9946, 8949], ["Glencoe", "IL", "US", 42.135, -87.7581, 8945], ["Olds", "AB", "CA", 51.7834, -114.102, 8944], ["Stony Plain", "AB", "CA", 53.5334, -114.002, 8939], ["Princeton", "TX", "US", 33.1801, -96.498, 8939], ["De Forest", "WI", "US", 43.2478, -89.3437, 8936], ["Westerleigh", "NY", "US", 40.6212, -74.1318, 8927], ["New Windsor", "NY", "US", 41.4768, -74.0238, 8922], ["Canonsburg", "PA", "US", 40.2626, -80.1873, 8922], ["Park Ridge", "NJ", "US", 41.0376, -74.0407, 8919], ["Cypress Gardens", "FL", "US", 27.9939, -81.6901, 8917], ["Woodbury", "NY", "US", 40.8257, -73.4676, 8907], ["Liberty Lake", "WA", "US", 47.6759, -117.1182, 8906], ["Plymouth", "MI", "US", 42.3714, -83.4702, 8905], ["Eagle Point", "OR", "US", 42.4726, -122.8028, 8902], ["Clinton", "MO", "US", 38.3686, -93.7783, 8899], ["Pitman", "NJ", "US", 39.7329, -75.1316, 8898], ["Bayport", "NY", "US", 40.7384, -73.0507, 8896], ["Mont-Tremblant", "QC", "CA", 46.2127, -74.5844, 8892], ["Medulla", "FL", "US", 27.9678, -81.9734, 8892], ["Commerce", "TX", "US", 33.2471, -95.9, 8892], ["Harrisburg", "IL", "US", 37.7384, -88.5406, 8891], ["Airmont", "NY", "US", 41.1009, -74.1162, 8891], ["Pulaski", "VA", "US", 37.0479, -80.7798, 8890], ["Olmsted Falls", "OH", "US", 41.3751, -81.9082, 8889], ["Smiths Falls", "ON", "CA", 44.9045, -76.0233, 8885], ["Larkfield-Wikiup", "CA", "US", 38.5134, -122.7509, 8884], ["Oak Hills", "CA", "US", 34.3831, -117.3813, 8879], ["Myrtle Grove", "NC", "US", 34.1346, -77.8816, 8875], ["Marina del Rey", "CA", "US", 33.9803, -118.4517, 8866], ["Graham", "TX", "US", 33.1071, -98.5895, 8865], ["Sitka", "AK", "US", 57.0532, -135.3309, 8863], ["Columbia City", "IN", "US", 41.1573, -85.4883, 8857], ["Concord", "NY", "US", 40.6082, -74.0843, 8857], ["East Wenatchee Bench", "WA", "US", 47.4257, -120.2812, 8856], ["Quakertown", "PA", "US", 40.4418, -75.3416, 8855], ["Swissvale", "PA", "US", 40.4237, -79.8828, 8855], ["Matawan", "NJ", "US", 40.4148, -74.2296, 8853], ["South Amboy", "NJ", "US", 40.4779, -74.2907, 8846], ["Fort Irwin", "CA", "US", 35.2627, -116.6847, 8845], ["Clanton", "AL", "US", 32.8387, -86.6294, 8844], ["Craig", "CO", "US", 40.5153, -107.5464, 8844], ["Newark", "NY", "US", 43.0467, -77.0952, 8843], ["Bernalillo", "NM", "US", 35.3, -106.5511, 8843], ["Isle of Normandy", "FL", "US", 25.8529, -80.1351, 8841], ["Lake Wylie", "SC", "US", 35.1085, -81.0429, 8841], ["Waihee-Waiehu", "HI", "US", 20.9302, -156.5046, 8841], ["White Meadow Lake", "NJ", "US", 40.9237, -74.5107, 8836], ["Riverside", "IL", "US", 41.835, -87.8228, 8835], ["Milford", "NH", "US", 42.8354, -71.649, 8835], ["Conning Towers-Nautilus Park", "CT", "US", 41.3855, -72.0688, 8834], ["Sechelt", "BC", "CA", 49.4751, -123.759, 8832], ["New Albany", "MS", "US", 34.4943, -89.0078, 8830], ["Waterford", "CA", "US", 37.6413, -120.7605, 8824], ["Garrison", "MD", "US", 39.4059, -76.7605, 8823], ["Lake Villa", "IL", "US", 42.417, -88.074, 8821], ["New Richmond", "WI", "US", 45.123, -92.5366, 8821], ["Maysville", "KY", "US", 38.6412, -83.7444, 8819], ["Tuskegee", "AL", "US", 32.4241, -85.691, 8817], ["Plainedge", "NY", "US", 40.7173, -73.4837, 8817], ["Booneville", "MS", "US", 34.6581, -88.5667, 8816], ["Cresskill", "NJ", "US", 40.9415, -73.9593, 8812], ["Cloverdale", "CA", "US", 38.8055, -123.0172, 8811], ["\u2018\u0100huimanu", "HI", "US", 21.4447, -157.8378, 8810], ["Picnic Point", "WA", "US", 47.8811, -122.3284, 8809], ["Oromocto", "NB", "CA", 45.8351, -66.4792, 8805], ["Dunn Loring", "VA", "US", 38.8934, -77.2216, 8803], ["Itasca", "IL", "US", 41.975, -88.0073, 8798], ["Binbrook", "ON", "CA", 43.1213, -79.811, 8796], ["Miles City", "MT", "US", 46.4083, -105.8406, 8796], ["Collingdale", "PA", "US", 39.9118, -75.2771, 8792], ["Delta", "CO", "US", 38.7422, -108.069, 8791], ["Lapeer", "MI", "US", 43.0514, -83.3188, 8790], ["Franklin", "KY", "US", 36.7223, -86.5772, 8787], ["East York", "PA", "US", 39.9737, -76.6864, 8777], ["Woodway", "TX", "US", 31.506, -97.205, 8777], ["Incline Village", "NV", "US", 39.2513, -119.973, 8777], ["Orosi", "CA", "US", 36.545, -119.2873, 8770], ["Meadowbrook", "AL", "US", 33.4021, -86.6967, 8769], ["Edgewood", "KY", "US", 39.0187, -84.5819, 8769], ["Clinton", "NC", "US", 34.998, -78.3233, 8767], ["Whitecourt", "AB", "CA", 54.1501, -115.6855, 8763], ["Lavaltrie", "QC", "CA", 45.8834, -73.2824, 8762], ["Andover", "MA", "US", 42.6584, -71.137, 8762], ["Rotonda West", "FL", "US", 26.8837, -82.2901, 8759], ["Saint Stephens", "NC", "US", 35.7646, -81.2731, 8759], ["Fuller Heights", "FL", "US", 27.9092, -81.9981, 8758], ["Gig Harbor", "WA", "US", 47.3293, -122.5801, 8753], ["Thief River Falls", "MN", "US", 48.1191, -96.1812, 8752], ["Marathon", "FL", "US", 24.7138, -81.0904, 8750], ["Leisure World", "MD", "US", 39.1023, -77.069, 8749], ["Cape Saint Claire", "MD", "US", 39.0432, -76.445, 8747], ["Barre", "VT", "US", 44.197, -72.502, 8746], ["Anderson Mill", "TX", "US", 30.4549, -97.8058, 8744], ["Oxford", "NC", "US", 36.3107, -78.5908, 8742], ["Woodmoor", "CO", "US", 39.1014, -104.8475, 8741], ["Ladysmith", "BC", "CA", 48.9902, -123.817, 8740], ["Poteau", "OK", "US", 35.0537, -94.6236, 8732], ["Audubon", "NJ", "US", 39.8909, -75.073, 8730], ["West Athens", "CA", "US", 33.9233, -118.3034, 8729], ["Wharton", "TX", "US", 29.3116, -96.1027, 8726], ["Pont-Rouge", "QC", "CA", 46.7547, -71.6957, 8723], ["Socorro", "NM", "US", 34.0584, -106.8914, 8722], ["Mentone", "CA", "US", 34.07, -117.1345, 8720], ["Castlegar", "BC", "CA", 49.3232, -117.6583, 8715], ["Cortez", "CO", "US", 37.3489, -108.5859, 8715], ["Whistler", "BC", "CA", 50.1182, -122.954, 8713], ["Wagoner", "OK", "US", 35.9595, -95.3694, 8713], ["Moundsville", "WV", "US", 39.9203, -80.7431, 8710], ["Pryor", "OK", "US", 36.3084, -95.3169, 8708], ["Pine Lake Park", "NJ", "US", 40.0032, -74.2565, 8707], ["Flowood", "MS", "US", 32.3096, -90.139, 8705], ["Orange Park", "FL", "US", 30.1661, -81.7065, 8702], ["Asbury Lake", "FL", "US", 30.0491, -81.8215, 8700], ["Park Hills", "MO", "US", 37.8542, -90.5182, 8692], ["Murphy", "MO", "US", 38.4903, -90.4871, 8690], ["Farmingdale", "NY", "US", 40.7326, -73.4454, 8688], ["Redlands", "CO", "US", 39.0789, -108.6356, 8685], ["Blacklick Estates", "OH", "US", 39.9051, -82.8643, 8682], ["Lacombe", "LA", "US", 30.3135, -89.9431, 8679], ["Seabrook", "NH", "US", 42.8948, -70.8712, 8679], ["Rodeo", "CA", "US", 38.033, -122.2669, 8679], ["Clarendon Hills", "IL", "US", 41.7975, -87.9548, 8676], ["Victoria", "MN", "US", 44.8586, -93.6616, 8676], ["Edgemere", "MD", "US", 39.242, -76.448, 8669], ["East Franklin", "NJ", "US", 40.4933, -74.4711, 8669], ["Frostburg", "MD", "US", 39.6581, -78.9284, 8667], ["Riverdale", "UT", "US", 41.1769, -112.0038, 8666], ["Closter", "NJ", "US", 40.9731, -73.9615, 8662], ["Beaver Falls", "PA", "US", 40.752, -80.3192, 8661], ["Sellersburg", "IN", "US", 38.3981, -85.755, 8659], ["Greenville", "RI", "US", 41.8712, -71.552, 8658], ["Golden Hills", "CA", "US", 35.1425, -118.4904, 8656], ["Westwood", "MI", "US", 42.3028, -85.6336, 8653], ["Hampstead", "NH", "US", 42.8745, -71.1812, 8650], ["Little Falls", "MN", "US", 45.9763, -94.3625, 8649], ["Fort Stockton", "TX", "US", 30.894, -102.8793, 8649], ["Florence", "OR", "US", 43.9826, -124.0998, 8649], ["Angola", "IN", "US", 41.6348, -84.9994, 8644], ["East Grand Forks", "MN", "US", 47.93, -97.0245, 8643], ["Clinton", "SC", "US", 34.4726, -81.8807, 8637], ["Montague", "MA", "US", 42.5356, -72.5351, 8637], ["Hanover", "NH", "US", 43.7023, -72.2895, 8636], ["Harwood Heights", "IL", "US", 41.9672, -87.8076, 8635], ["Burlington", "WA", "US", 48.4757, -122.3254, 8633], ["Monroe", "NY", "US", 41.3306, -74.1868, 8632], ["Princeton", "IN", "US", 38.3553, -87.5675, 8626], ["Old Orchard Beach", "ME", "US", 43.5173, -70.3775, 8624], ["Citrus Springs", "FL", "US", 28.9975, -82.4707, 8622], ["La Grange", "KY", "US", 38.4076, -85.3788, 8619], ["Bacliff", "TX", "US", 29.5069, -94.9924, 8619], ["Willowbrook", "IL", "US", 41.7698, -87.9359, 8613], ["Palm Beach", "FL", "US", 26.7056, -80.0364, 8612], ["Tuba City", "AZ", "US", 36.135, -111.2399, 8611], ["Port Jervis", "NY", "US", 41.3751, -74.6927, 8609], ["Bennettsville", "SC", "US", 34.6174, -79.6848, 8605], ["Morrisville", "PA", "US", 40.2115, -74.7879, 8605], ["Fort Valley", "GA", "US", 32.5538, -83.8874, 8597], ["Ladue", "MO", "US", 38.6498, -90.3807, 8597], ["Sallisaw", "OK", "US", 35.4604, -94.7875, 8596], ["Napoleon", "OH", "US", 41.3923, -84.1252, 8595], ["Alondra Park", "CA", "US", 33.8895, -118.3309, 8592], ["Helotes", "TX", "US", 29.578, -98.6898, 8591], ["Fort Bliss", "TX", "US", 31.8136, -106.4122, 8591], ["Chester", "IL", "US", 37.9137, -89.8221, 8588], ["Virginia", "MN", "US", 47.5233, -92.5366, 8587], ["Weare", "NH", "US", 43.0948, -71.7306, 8583], ["Thompsonville", "CT", "US", 41.997, -72.599, 8577], ["Mecca", "CA", "US", 33.5722, -116.0782, 8577], ["Carencro", "LA", "US", 30.3171, -92.049, 8575], ["Southside", "AL", "US", 33.9245, -86.0225, 8572], ["Des Peres", "MO", "US", 38.6009, -90.4329, 8572], ["Malverne", "NY", "US", 40.679, -73.674, 8571], ["Bonadelle Ranchos-Madera Ranchos", "CA", "US", 36.9847, -119.8746, 8569], ["Carbondale", "PA", "US", 41.5737, -75.5019, 8566], ["Kirby", "TX", "US", 29.4633, -98.3856, 8550], ["Lowell", "AR", "US", 36.2553, -94.1308, 8549], ["North Haledon", "NJ", "US", 40.9551, -74.186, 8548], ["North Madison", "OH", "US", 41.802, -81.049, 8547], ["Country Club Estates", "GA", "US", 31.2127, -81.4643, 8545], ["Cold Springs", "NV", "US", 39.6802, -119.9766, 8544], ["Linganore", "MD", "US", 39.4404, -77.208, 8543], ["Westwego", "LA", "US", 29.906, -90.1423, 8542], ["Calimesa", "CA", "US", 34.0039, -117.062, 8542], ["Richmond Heights", "FL", "US", 25.6315, -80.3689, 8541], ["Sunset Hills", "MO", "US", 38.5389, -90.4073, 8539], ["Winchester", "TN", "US", 35.1859, -86.1122, 8539], ["Lake Park", "FL", "US", 26.8003, -80.0664, 8538], ["H\u014Dlualoa", "HI", "US", 19.6198, -155.9483, 8538], ["Earlimart", "CA", "US", 35.8841, -119.2723, 8537], ["Elsmere", "KY", "US", 39.0126, -84.6047, 8536], ["Lincoln City", "OR", "US", 44.9582, -124.0179, 8536], ["Live Oak", "CA", "US", 39.2757, -121.66, 8531], ["Aransas Pass", "TX", "US", 27.9095, -97.15, 8530], ["Signal Mountain", "TN", "US", 35.1226, -85.3439, 8528], ["North Weeki Wachee", "FL", "US", 28.5501, -82.5589, 8524], ["Alliance", "NE", "US", 42.1016, -102.8722, 8522], ["Northfield", "NJ", "US", 39.3704, -74.5502, 8521], ["Temperance", "MI", "US", 41.7792, -83.5688, 8517], ["Bradford", "PA", "US", 41.9559, -78.6439, 8507], ["Westlake Village", "CA", "US", 34.1458, -118.8056, 8507], ["Monson", "MA", "US", 42.1043, -72.319, 8505], ["Plymouth", "WI", "US", 43.7486, -87.977, 8505], ["Jefferson City", "TN", "US", 36.1223, -83.4924, 8504], ["Corrales", "NM", "US", 35.2378, -106.6067, 8502], ["Clayton", "NJ", "US", 39.6601, -75.0921, 8493], ["Mystic Island", "NJ", "US", 39.5443, -74.3824, 8493], ["Orrville", "OH", "US", 40.8437, -81.764, 8491], ["Franklin", "VA", "US", 36.6776, -76.9225, 8490], ["Northridge", "OH", "US", 39.8076, -84.1969, 8487], ["Wakefield-Peacedale", "RI", "US", 41.4461, -71.5004, 8487], ["Midway City", "CA", "US", 33.7447, -117.9892, 8485], ["Richmond Heights", "MO", "US", 38.6287, -90.3196, 8481], ["Woodburn", "VA", "US", 38.8475, -77.2361, 8480], ["Spotswood", "NJ", "US", 40.3918, -74.3985, 8476], ["Mount Rainier", "MD", "US", 38.9415, -76.965, 8475], ["Tuscumbia", "AL", "US", 34.7312, -87.7025, 8474], ["North Elba", "NY", "US", 44.2434, -73.9543, 8474], ["Gonzales", "CA", "US", 36.5066, -121.4444, 8473], ["Freetown", "MA", "US", 41.7668, -71.0328, 8472], ["Indian Harbour Beach", "FL", "US", 28.1489, -80.5884, 8471], ["Perkasie", "PA", "US", 40.3721, -75.2927, 8471], ["Jerseyville", "IL", "US", 39.12, -90.3285, 8469], ["Fairless Hills", "PA", "US", 40.1795, -74.8552, 8466], ["Dormont", "PA", "US", 40.3959, -80.0331, 8465], ["Otterburn Park", "QC", "CA", 45.5334, -73.2159, 8464], ["South Kensington", "MD", "US", 39.019, -77.08, 8462], ["Hamilton Worcester", "MA", "US", 42.2562, -71.7676, 8460], ["Kensington", "CT", "US", 41.6354, -72.7687, 8459], ["Fallon", "NV", "US", 39.4735, -118.7774, 8458], ["Elwood", "IN", "US", 40.277, -85.8419, 8455], ["Rossmoor", "MD", "US", 39.1037, -77.0711, 8453], ["Cambridge", "MN", "US", 45.5727, -93.2244, 8451], ["Haledon", "NJ", "US", 40.9357, -74.1863, 8451], ["Franklin", "NH", "US", 43.4442, -71.6473, 8450], ["Beverly Hills", "FL", "US", 28.9169, -82.4582, 8445], ["Greenville", "MI", "US", 43.1775, -85.2528, 8444], ["Glens Falls North", "NY", "US", 43.3351, -73.6825, 8443], ["Montvale", "NJ", "US", 41.0468, -74.0229, 8442], ["Alderwood Manor", "WA", "US", 47.822, -122.2821, 8442], ["Boonton", "NJ", "US", 40.9026, -74.4071, 8441], ["Perry Heights", "OH", "US", 40.7953, -81.4734, 8441], ["Oak Grove", "MN", "US", 45.3408, -93.3269, 8439], ["Fairview", "TX", "US", 33.1579, -96.6317, 8438], ["Bryan", "OH", "US", 41.4748, -84.5524, 8436], ["Yelm", "WA", "US", 46.942, -122.606, 8434], ["Mount Pleasant", "IA", "US", 40.9636, -91.5579, 8433], ["Audubon", "PA", "US", 40.1279, -75.4318, 8433], ["Paris", "IL", "US", 39.6112, -87.6961, 8432], ["Pineville", "NC", "US", 35.0832, -80.8923, 8429], ["Mason", "MI", "US", 42.5792, -84.4436, 8427], ["Charlestown", "RI", "US", 41.3832, -71.6417, 8421], ["Millersville", "PA", "US", 39.9979, -76.3541, 8420], ["Los Altos Hills", "CA", "US", 37.3797, -122.1375, 8419], ["Dauphin", "MB", "CA", 51.1494, -100.0502, 8418], ["Barrington", "NH", "US", 43.2229, -71.047, 8417], ["Riverside", "CT", "US", 41.0337, -73.5782, 8416], ["Birch Bay", "WA", "US", 48.9179, -122.7446, 8413], ["Wyoming", "OH", "US", 39.2312, -84.4658, 8411], ["Lansdowne", "MD", "US", 39.2451, -76.6605, 8409], ["Lake Elmo", "MN", "US", 44.9958, -92.8794, 8406], ["Hoquiam", "WA", "US", 46.9809, -123.8893, 8405], ["Boonville", "MO", "US", 38.9736, -92.7432, 8403], ["Bedminster", "PA", "US", 40.4259, -75.1791, 8402], ["Gateway", "FL", "US", 26.5776, -81.7504, 8401], ["Bogota", "NJ", "US", 40.8762, -74.0299, 8400], ["Perryville", "MO", "US", 37.7242, -89.8612, 8398], ["Siler City", "NC", "US", 35.7235, -79.4622, 8396], ["Highland Heights", "OH", "US", 41.552, -81.4784, 8396], ["Breaux Bridge", "LA", "US", 30.2735, -91.8993, 8395], ["Harrodsburg", "KY", "US", 37.7623, -84.8433, 8394], ["Rice Lake", "WI", "US", 45.5061, -91.7382, 8391], ["August", "CA", "US", 37.9788, -121.2622, 8390], ["Delavan", "WI", "US", 42.6331, -88.6437, 8389], ["Guntersville", "AL", "US", 34.3582, -86.2945, 8385], ["Glenside", "PA", "US", 40.1023, -75.1521, 8384], ["Bois-des-Filion", "QC", "CA", 45.6668, -73.7492, 8383], ["Menominee", "MI", "US", 45.1078, -87.6143, 8382], ["Runnemede", "NJ", "US", 39.8523, -75.0679, 8381], ["Bow Bog", "NH", "US", 43.1206, -71.5115, 8381], ["Upper Saddle River", "NJ", "US", 41.0584, -74.0985, 8379], ["Sanatoga", "PA", "US", 40.2451, -75.5952, 8378], ["Price", "UT", "US", 39.5994, -110.8107, 8378], ["Floris", "VA", "US", 38.9371, -77.4128, 8375], ["Tecumseh", "MI", "US", 42.0039, -83.9449, 8372], ["Golden Valley", "AZ", "US", 35.2233, -114.223, 8370], ["Dalhart", "TX", "US", 36.0595, -102.5132, 8370], ["Mahopac", "NY", "US", 41.3723, -73.7335, 8369], ["Saint Joseph", "MI", "US", 42.1098, -86.48, 8365], ["Smithfield", "VA", "US", 36.9824, -76.6311, 8364], ["Lakes", "AK", "US", 61.6071, -149.3086, 8364], ["Congers", "NY", "US", 41.1506, -73.9454, 8363], ["Ocean Pointe", "HI", "US", 21.3107, -158.0364, 8361], ["Bridgeport", "WV", "US", 39.2865, -80.2562, 8359], ["Brockport", "NY", "US", 43.2137, -77.9392, 8357], ["Wesley Chapel", "NC", "US", 35.0071, -80.6745, 8355], ["Half Moon", "NC", "US", 34.826, -77.4594, 8352], ["Oberlin", "OH", "US", 41.2939, -82.2174, 8350], ["Rio Vista", "CA", "US", 38.1639, -121.6958, 8348], ["Johnstown", "NY", "US", 43.0067, -74.3676, 8345], ["Tompkinsville", "NY", "US", 40.6381, -74.078, 8343], ["Skidaway Island", "GA", "US", 31.9349, -81.047, 8341], ["Hornell", "NY", "US", 42.3278, -77.6611, 8336], ["Roxboro", "NC", "US", 36.3937, -78.9828, 8334], ["Denison", "IA", "US", 42.0178, -95.3553, 8334], ["Gering", "NE", "US", 41.8258, -103.6605, 8334], ["Saint Marys", "OH", "US", 40.5423, -84.3894, 8332], ["Fairview", "TN", "US", 35.982, -87.1214, 8331], ["Firebaugh", "CA", "US", 36.8588, -120.456, 8330], ["South Lockport", "NY", "US", 43.1501, -78.6967, 8324], ["Burtonsville", "MD", "US", 39.1112, -76.9325, 8323], ["Folsom", "PA", "US", 39.8898, -75.3252, 8323], ["Hillsboro", "TX", "US", 32.011, -97.13, 8321], ["Center Line", "MI", "US", 42.485, -83.0277, 8320], ["Absecon", "NJ", "US", 39.4284, -74.4957, 8317], ["Fountain Inn", "SC", "US", 34.689, -82.1957, 8317], ["Williston", "VT", "US", 44.4376, -73.0682, 8314], ["Humboldt", "TN", "US", 35.8198, -88.9159, 8313], ["Litchfield", "NH", "US", 42.8443, -71.4798, 8307], ["Fort Mitchell", "KY", "US", 39.0595, -84.5474, 8306], ["Bath", "ME", "US", 43.9106, -69.8206, 8305], ["Naranja", "FL", "US", 25.5182, -80.4228, 8303], ["North Bay Village", "FL", "US", 25.8462, -80.1539, 8302], ["Ashland", "NJ", "US", 39.8632, -75.006, 8302], ["Doylestown", "PA", "US", 40.3101, -75.1299, 8301], ["Cedar Hills", "OR", "US", 45.5048, -122.7984, 8300], ["Mayo", "MD", "US", 38.8876, -76.5119, 8298], ["Cheviot", "OH", "US", 39.157, -84.6133, 8295], ["Arab", "AL", "US", 34.3182, -86.4958, 8295], ["Shiprock", "NM", "US", 36.7856, -108.687, 8295], ["Pleasant Hill", "MO", "US", 38.7875, -94.2694, 8289], ["Topanga", "CA", "US", 34.0936, -118.6015, 8289], ["Sugarmill Woods", "FL", "US", 28.7322, -82.5062, 8287], ["Little Cottonwood Creek Valley", "UT", "US", 40.6044, -111.8294, 8285], ["Toccoa", "GA", "US", 34.5773, -83.3324, 8283], ["Hobart", "WI", "US", 44.4993, -88.1499, 8283], ["Lake Carmel", "NY", "US", 41.4615, -73.671, 8282], ["Blanchard", "OK", "US", 35.1378, -97.6581, 8280], ["Oroville East", "CA", "US", 39.5113, -121.4752, 8280], ["Seneca", "SC", "US", 34.6857, -82.9532, 8279], ["Black Mountain", "NC", "US", 35.6179, -82.3212, 8278], ["Kings Grant", "NC", "US", 34.2629, -77.8636, 8278], ["M\u0101kaha", "HI", "US", 21.4663, -158.2104, 8278], ["Pike Road", "AL", "US", 32.2843, -86.103, 8274], ["Lewistown", "PA", "US", 40.5992, -77.5714, 8271], ["Winkler", "MB", "CA", 49.1817, -97.941, 8270], ["Croton-on-Hudson", "NY", "US", 41.2084, -73.8912, 8269], ["East Foothills", "CA", "US", 37.3811, -121.8174, 8269], ["Bithlo", "FL", "US", 28.5547, -81.1064, 8268], ["Charles Village", "MD", "US", 39.3232, -76.6133, 8267], ["Athol", "MA", "US", 42.5959, -72.2267, 8265], ["Hopkinton", "RI", "US", 41.4612, -71.7776, 8261], ["Rapid Valley", "SD", "US", 44.0625, -103.1463, 8260], ["Rolling Hills Estates", "CA", "US", 33.7878, -118.3581, 8258], ["Fabens", "TX", "US", 31.5023, -106.1586, 8257], ["Concord", "ON", "CA", 43.8001, -79.4829, 8255], ["Claymont", "DE", "US", 39.8007, -75.4596, 8253], ["Nevada", "MO", "US", 37.8392, -94.3547, 8253], ["Bellevue", "PA", "US", 40.494, -80.0517, 8252], ["Pleasant Hills", "PA", "US", 40.3356, -79.9606, 8252], ["Elkhorn", "NE", "US", 41.2864, -96.2345, 8251], ["Wood-Ridge", "NJ", "US", 40.8457, -74.0879, 8249], ["Conover", "NC", "US", 35.7065, -81.2187, 8248], ["Bracebridge", "ON", "CA", 45.0334, -79.3163, 8238], ["Castle Shannon", "PA", "US", 40.3648, -80.0223, 8235], ["Bastrop", "TX", "US", 30.1105, -97.3153, 8231], ["Vinton", "VA", "US", 37.281, -79.897, 8231], ["Notre-Dame-des-Prairies", "QC", "CA", 46.0501, -73.4325, 8230], ["Albion", "MI", "US", 42.2431, -84.753, 8229], ["Tremonton", "UT", "US", 41.7119, -112.1655, 8227], ["Helena Valley Southeast", "MT", "US", 46.6153, -111.9216, 8227], ["Saint Anthony", "MN", "US", 45.0205, -93.218, 8226], ["Fair Oaks", "GA", "US", 33.9165, -84.5447, 8225], ["Sangaree", "SC", "US", 33.0354, -80.1279, 8220], ["Spring Valley Lake", "CA", "US", 34.4936, -117.2683, 8220], ["Boiling Springs", "SC", "US", 35.0465, -81.9818, 8219], ["Oradell", "NJ", "US", 40.9587, -74.0368, 8218], ["Eaton", "OH", "US", 39.7439, -84.6366, 8217], ["Bloomingdale", "NJ", "US", 41.002, -74.3265, 8215], ["Kenilworth", "NJ", "US", 40.6765, -74.2907, 8215], ["Hooper", "UT", "US", 41.1638, -112.1224, 8214], ["Heath", "TX", "US", 32.8365, -96.475, 8211], ["Kenton", "OH", "US", 40.647, -83.6097, 8211], ["McFarland", "WI", "US", 43.0125, -89.2898, 8209], ["Pewaukee", "WI", "US", 43.0806, -88.2612, 8208], ["Lincoln", "MA", "US", 42.4259, -71.304, 8197], ["Ketchikan", "AK", "US", 55.3418, -131.6476, 8197], ["Tanaina", "AK", "US", 61.6269, -149.4281, 8197], ["Dryden", "ON", "CA", 49.7833, -92.7503, 8195], ["Oak Hills Place", "LA", "US", 30.3599, -91.0876, 8195], ["Delmar", "NY", "US", 42.622, -73.8326, 8195], ["Kulpsville", "PA", "US", 40.2429, -75.3366, 8194], ["Wynne", "AR", "US", 35.2245, -90.7868, 8193], ["Grove City", "PA", "US", 41.1578, -80.0887, 8193], ["Crete", "IL", "US", 41.4445, -87.6314, 8191], ["Whitehouse", "TX", "US", 32.2268, -95.2255, 8189], ["Triangle", "VA", "US", 38.5468, -77.3367, 8188], ["Oak Grove", "SC", "US", 33.7782, -80.9668, 8183], ["Ripley", "TN", "US", 35.7454, -89.5298, 8176], ["Geneseo", "NY", "US", 42.7959, -77.817, 8173], ["Laurel", "FL", "US", 27.1438, -82.4616, 8171], ["Farmville", "VA", "US", 37.3021, -78.3919, 8169], ["Greenbriar", "VA", "US", 38.8734, -77.4008, 8166], ["Long Grove", "IL", "US", 42.1784, -87.9978, 8166], ["Bedminster", "NJ", "US", 40.6807, -74.6454, 8165], ["Monona", "WI", "US", 43.0622, -89.334, 8164], ["Taber", "AB", "CA", 49.787, -112.146, 8163], ["Hillsdale", "MI", "US", 41.9201, -84.6305, 8163], ["Pismo Beach", "CA", "US", 35.1427, -120.6413, 8162], ["Chestnut Ridge", "NY", "US", 41.0843, -74.0557, 8158], ["Hillside", "IL", "US", 41.8778, -87.9028, 8155], ["Trinidad", "CO", "US", 37.1695, -104.5005, 8153], ["Fairdale", "KY", "US", 38.1051, -85.7588, 8148], ["Oak Hill", "WV", "US", 37.9723, -81.1487, 8140], ["Buxton", "ME", "US", 43.6379, -70.5189, 8136], ["Hailey", "ID", "US", 43.5196, -114.3153, 8134], ["Savoy", "IL", "US", 40.0547, -88.2517, 8133], ["Diamondhead", "MS", "US", 30.3946, -89.3639, 8132], ["Park City", "UT", "US", 40.6461, -111.498, 8128], ["Shelburne", "ON", "CA", 44.0787, -80.2041, 8126], ["London", "KY", "US", 37.129, -84.0833, 8126], ["Saint Rose", "LA", "US", 29.9469, -90.3231, 8122], ["Abingdon", "VA", "US", 36.7098, -81.9774, 8119], ["New Baltimore", "VA", "US", 38.7673, -77.7283, 8119], ["Haiku-Pauwela", "HI", "US", 20.9219, -156.3051, 8118], ["Mahtomedi", "MN", "US", 45.0697, -92.9516, 8116], ["Wytheville", "VA", "US", 36.9485, -81.0848, 8115], ["Brazil", "IN", "US", 39.5237, -87.125, 8109], ["Morinville", "AB", "CA", 53.8001, -113.652, 8108], ["Boulder Hill", "IL", "US", 41.7125, -88.3362, 8108], ["Oakdale", "NY", "US", 42.2512, -73.7801, 8107], ["Beebe", "AR", "US", 35.0706, -91.8796, 8106], ["Warrenton", "MO", "US", 38.8114, -91.1415, 8106], ["Baldwin Harbor", "NY", "US", 40.6395, -73.6085, 8102], ["Richland Hills", "TX", "US", 32.816, -97.2281, 8098], ["Oak Brook", "IL", "US", 41.8328, -87.929, 8091], ["Silver Berry", "AB", "CA", 53.4579, -113.3817, 8089], ["Perry", "IA", "US", 41.8386, -94.1072, 8089], ["Saint-F\xE9licien", "QC", "CA", 48.6501, -72.4491, 8088], ["Charlestown", "IN", "US", 38.4531, -85.6702, 8088], ["Flushing", "MI", "US", 43.0631, -83.8511, 8086], ["Saint-Hippolyte", "QC", "CA", 45.9334, -74.0159, 8083], ["Latrobe", "PA", "US", 40.3212, -79.3795, 8081], ["Hillview", "KY", "US", 38.0698, -85.6855, 8080], ["Island Lake", "IL", "US", 42.2761, -88.192, 8080], ["Manhasset", "NY", "US", 40.7979, -73.6996, 8080], ["Brookhaven", "PA", "US", 39.8693, -75.3824, 8078], ["West Livingston", "TX", "US", 30.6983, -95.0019, 8071], ["Mount Joy", "PA", "US", 40.1098, -76.5033, 8071], ["Bridgewater", "NS", "CA", 44.3786, -64.5188, 8070], ["Northfield", "NJ", "US", 40.7743, -74.3246, 8070], ["South San Gabriel", "CA", "US", 34.0491, -118.0946, 8070], ["West Frankfort", "IL", "US", 37.8978, -88.9315, 8067], ["Spanish Fort", "AL", "US", 30.6749, -87.9153, 8065], ["Ludington", "MI", "US", 43.9553, -86.4526, 8058], ["Brentwood", "MO", "US", 38.6176, -90.3493, 8057], ["New Square", "NY", "US", 41.1396, -74.0294, 8057], ["Mahomet", "IL", "US", 40.1953, -88.4042, 8056], ["Boston", "NY", "US", 42.629, -78.7375, 8049], ["Old Forge", "PA", "US", 41.3712, -75.7349, 8048], ["Ephrata", "WA", "US", 47.3176, -119.5537, 8047], ["West Gate", "VA", "US", 38.7829, -77.4975, 8046], ["Union", "SC", "US", 34.7154, -81.6237, 8045], ["Millis", "MA", "US", 42.1676, -71.3578, 8040], ["Ashland", "WI", "US", 46.5924, -90.8838, 8040], ["Alamo Heights", "TX", "US", 29.485, -98.4659, 8038], ["Goderich", "ON", "CA", 43.7417, -81.7134, 8032], ["Wild Rose", "AB", "CA", 53.4708, -113.3812, 8031], ["Raritan", "NJ", "US", 40.5695, -74.6329, 8031], ["South Beach", "NY", "US", 40.5833, -74.0761, 8029], ["Belgrade", "MT", "US", 45.776, -111.1769, 8029], ["Briarcliff Manor", "NY", "US", 41.1457, -73.8238, 8028], ["Renfrew", "ON", "CA", 45.4668, -76.6827, 8018], ["Londontowne", "MD", "US", 38.9335, -76.5494, 8018], ["Bothell East", "WA", "US", 47.8063, -122.1843, 8018], ["Marstons Mills", "MA", "US", 41.6562, -70.4161, 8017], ["Rayne", "LA", "US", 30.2349, -92.2685, 8016], ["Hastings-on-Hudson", "NY", "US", 40.9945, -73.8787, 8014], ["York", "SC", "US", 34.9943, -81.242, 8009], ["Orono", "MN", "US", 44.9714, -93.6044, 8006], ["Bellevue", "OH", "US", 41.2737, -82.8416, 8005], ["West Haven-Sylvan", "OR", "US", 45.5161, -122.7681, 8001], ["Davidsonville", "MD", "US", 38.9229, -76.6283, 8e3], ["Wetumpka", "AL", "US", 32.5437, -86.2119, 7994], ["West Long Branch", "NJ", "US", 40.2904, -74.0176, 7994], ["Montrose", "VA", "US", 37.5207, -77.3783, 7993], ["Grand Blanc", "MI", "US", 42.9275, -83.6299, 7993], ["Dexter", "MO", "US", 36.7959, -89.9579, 7992], ["Oak Grove", "KY", "US", 37.3442, -86.7547, 7989], ["Cheat Lake", "WV", "US", 39.672, -79.8534, 7988], ["Wellington", "KS", "US", 37.2653, -97.3717, 7987], ["Summit", "WA", "US", 47.1618, -122.3571, 7985], ["Campbell", "OH", "US", 41.0784, -80.5992, 7982], ["North Star", "DE", "US", 39.7612, -75.7191, 7980], ["Newton", "NJ", "US", 41.0581, -74.7527, 7979], ["South Boston", "VA", "US", 36.6987, -78.9014, 7976], ["Edson", "AB", "CA", 53.5834, -116.4356, 7975], ["West Gate", "FL", "US", 26.7026, -80.0981, 7975], ["Mascoutah", "IL", "US", 38.4903, -89.7931, 7975], ["Blair", "NE", "US", 41.5444, -96.125, 7975], ["White City", "OR", "US", 42.4374, -122.8589, 7975], ["Oakdale", "NY", "US", 40.744, -73.1387, 7974], ["Houghton", "MI", "US", 47.1219, -88.569, 7970], ["Stayton", "OR", "US", 44.8007, -122.7945, 7969], ["Senatobia", "MS", "US", 34.6176, -89.9687, 7963], ["Hyrum", "UT", "US", 41.6341, -111.8522, 7962], ["Hawthorn Woods", "IL", "US", 42.217, -88.0495, 7961], ["Conshohocken", "PA", "US", 40.0793, -75.3016, 7956], ["Manvel", "TX", "US", 29.4627, -95.358, 7950], ["Caldwell", "NJ", "US", 40.8398, -74.2765, 7948], ["Downingtown", "PA", "US", 40.0065, -75.7033, 7946], ["Mammoth Lakes", "CA", "US", 37.6486, -118.9721, 7946], ["Four Corners", "MD", "US", 39.0204, -77.0127, 7945], ["Maplewood", "MO", "US", 38.6125, -90.3246, 7945], ["Francisville", "KY", "US", 39.1051, -84.7244, 7944], ["Bridge City", "TX", "US", 30.0208, -93.8457, 7941], ["Jefferson", "WI", "US", 43.0056, -88.8073, 7941], ["Oak Grove", "MO", "US", 39.005, -94.1294, 7937], ["Baxter", "MN", "US", 46.3433, -94.2867, 7934], ["Cumberland Hill", "RI", "US", 41.9745, -71.467, 7934], ["Fort Frances", "ON", "CA", 48.6167, -93.4003, 7931], ["Carnegie", "PA", "US", 40.4087, -80.0834, 7931], ["Ilion", "NY", "US", 43.0151, -75.0354, 7926], ["Camp Hill", "PA", "US", 40.2398, -76.92, 7923], ["Waller", "WA", "US", 47.2007, -122.3693, 7922], ["Broadview", "IL", "US", 41.8639, -87.8534, 7918], ["Chandler", "QC", "CA", 48.3494, -64.6793, 7914], ["Gold River", "CA", "US", 38.6263, -121.2466, 7912], ["Sutherlin", "OR", "US", 43.3901, -123.3126, 7912], ["Crestwood Village", "NJ", "US", 39.9482, -74.3607, 7907], ["Decorah", "IA", "US", 43.3033, -91.7857, 7907], ["Colonie", "NY", "US", 42.7179, -73.8335, 7906], ["Fairwood", "WA", "US", 47.7668, -117.4174, 7905], ["Maryville", "IL", "US", 38.7237, -89.9559, 7902], ["Holly Springs", "MS", "US", 31.3157, -89.9779, 7901], ["Jersey Village", "TX", "US", 29.8877, -95.563, 7900], ["Wahpeton", "ND", "US", 46.2652, -96.6059, 7899], ["Pike Creek", "DE", "US", 39.7309, -75.7041, 7898], ["Lake Dallas", "TX", "US", 33.1193, -97.0256, 7892], ["Wilmington Manor", "DE", "US", 39.6868, -75.5844, 7889], ["Winnemucca", "NV", "US", 40.973, -117.7357, 7887], ["Plaistow", "NH", "US", 42.8365, -71.0948, 7885], ["Helena Valley West Central", "MT", "US", 46.6629, -112.0604, 7883], ["Skiatook", "OK", "US", 36.3684, -96.0014, 7880], ["Dumbarton", "VA", "US", 37.6038, -77.4914, 7879], ["Ivins", "UT", "US", 37.1686, -113.6794, 7876], ["Kirtland", "NM", "US", 36.7342, -108.3598, 7875], ["Middletown", "KY", "US", 38.2454, -85.5388, 7874], ["Mill Plain", "WA", "US", 45.6429, -122.494, 7874], ["Olivette", "MO", "US", 38.6653, -90.376, 7870], ["Sans Souci", "SC", "US", 34.8779, -82.424, 7869], ["Antigo", "WI", "US", 45.1403, -89.1523, 7869], ["Cushing", "OK", "US", 35.9851, -96.767, 7867], ["Calumet Park", "IL", "US", 41.6628, -87.6606, 7865], ["Saint Johns", "MI", "US", 43.0011, -84.5592, 7865], ["York", "NE", "US", 40.8681, -97.592, 7864], ["Marion", "NC", "US", 35.684, -82.0093, 7861], ["Cleveland", "TX", "US", 30.3413, -95.0855, 7858], ["Lake Purdy", "AL", "US", 33.4301, -86.6805, 7857], ["Ellsworth", "ME", "US", 44.5434, -68.4195, 7857], ["Brooksville", "FL", "US", 28.5555, -82.3899, 7854], ["Creston", "IA", "US", 41.0586, -94.3614, 7854], ["Southwest Ranches", "FL", "US", 26.0587, -80.3373, 7852], ["Temple Hills", "MD", "US", 38.814, -76.9455, 7852], ["Arcadia", "FL", "US", 27.2159, -81.8584, 7851], ["Mount Vista", "WA", "US", 45.7343, -122.6329, 7850], ["Kalifornsky", "AK", "US", 60.4183, -151.29, 7850], ["Saint-Sauveur-des-Monts", "QC", "CA", 45.9001, -74.1659, 7849], ["Gilford", "NH", "US", 43.5476, -71.4067, 7849], ["Memphis", "FL", "US", 27.5359, -82.5612, 7848], ["Greenville", "AL", "US", 31.8296, -86.6178, 7845], ["Port Jefferson", "NY", "US", 40.9465, -73.0693, 7842], ["Bridgewater", "MA", "US", 41.9904, -70.975, 7841], ["Sheboygan Falls", "WI", "US", 43.732, -87.8221, 7840], ["Fort Scott", "KS", "US", 37.8398, -94.7083, 7838], ["Port Jefferson Station", "NY", "US", 40.9254, -73.0473, 7838], ["Sandpoint", "ID", "US", 48.2766, -116.5533, 7835], ["Quincy", "FL", "US", 30.5871, -84.5833, 7830], ["Hartsville", "SC", "US", 34.374, -80.0734, 7826], ["Lexington", "TN", "US", 35.6509, -88.3934, 7822], ["Fort Lupton", "CO", "US", 40.0847, -104.813, 7822], ["Village Green-Green Ridge", "PA", "US", 39.8636, -75.4255, 7822], ["Canal Winchester", "OH", "US", 39.8428, -82.8046, 7818], ["Plainville", "MA", "US", 42.0043, -71.3328, 7817], ["Caribou", "ME", "US", 46.8606, -68.012, 7816], ["Webster City", "IA", "US", 42.4694, -93.8161, 7814], ["Milan", "TN", "US", 35.9198, -88.7589, 7813], ["Wyoming", "MN", "US", 45.3364, -92.9972, 7813], ["Prien", "LA", "US", 30.1819, -93.2738, 7810], ["Othello", "WA", "US", 46.826, -119.1753, 7809], ["Wellington", "CO", "US", 40.7039, -105.0086, 7807], ["Garden City Park", "NY", "US", 40.7409, -73.6626, 7806], ["Bernardsville", "NJ", "US", 40.7187, -74.5693, 7801], ["Star", "ID", "US", 43.6921, -116.4935, 7797], ["Winslow", "ME", "US", 44.547, -69.6212, 7794], ["Donaldsonville", "LA", "US", 30.1011, -90.9941, 7792], ["Grand Ledge", "MI", "US", 42.7534, -84.7464, 7791], ["Crookston", "MN", "US", 47.7741, -96.6081, 7787], ["Wilson", "PA", "US", 40.684, -75.2418, 7781], ["Lake Geneva", "WI", "US", 42.5917, -88.4334, 7778], ["Lake Stickney", "WA", "US", 47.8766, -122.2621, 7777], ["Kirkland Lake", "ON", "CA", 48.1446, -80.0377, 7775], ["White Oak", "PA", "US", 40.3376, -79.8092, 7775], ["Summit Park", "UT", "US", 40.7458, -111.6116, 7775], ["Baldwinsville", "NY", "US", 43.1587, -76.3327, 7770], ["Harrison", "TN", "US", 35.1137, -85.138, 7769], ["Murphysboro", "IL", "US", 37.7645, -89.3351, 7768], ["Newport", "AR", "US", 35.6048, -91.2818, 7767], ["Fort Riley North", "KS", "US", 39.1108, -96.8139, 7761], ["Hales Corners", "WI", "US", 42.9375, -88.0487, 7759], ["Three Rivers", "MI", "US", 41.9439, -85.6325, 7752], ["Butner", "NC", "US", 36.1321, -78.7567, 7751], ["Sanger", "TX", "US", 33.3632, -97.1739, 7747], ["Ruidoso", "NM", "US", 33.3317, -105.673, 7739], ["Brevard", "NC", "US", 35.2334, -82.7343, 7735], ["Saint Martin", "MS", "US", 30.438, -88.8681, 7730], ["Carl Junction", "MO", "US", 37.1767, -94.5655, 7729], ["Scotia", "NY", "US", 42.8265, -73.9643, 7727], ["River Oaks", "TX", "US", 32.7771, -97.3945, 7724], ["Dock Junction", "GA", "US", 31.2024, -81.5168, 7721], ["Mukwonago", "WI", "US", 42.8667, -88.3334, 7721], ["Wading River", "NY", "US", 40.9504, -72.8426, 7719], ["Fort Dix", "NJ", "US", 40.0298, -74.6185, 7716], ["Kennedale", "TX", "US", 32.6468, -97.2258, 7715], ["Thousand Palms", "CA", "US", 33.82, -116.3903, 7715], ["Bloomingdale", "NJ", "US", 40.4976, -74.6474, 7714], ["Lynwood", "IL", "US", 41.6836, -88.3937, 7713], ["Winsted", "CT", "US", 41.9212, -73.0601, 7712], ["Hollis", "NH", "US", 42.7431, -71.5917, 7711], ["Oakdale", "LA", "US", 30.816, -92.6604, 7710], ["Bridge City", "LA", "US", 29.9333, -90.1701, 7706], ["Fern Park", "FL", "US", 28.6492, -81.3512, 7704], ["Butler", "NJ", "US", 41.0037, -74.3415, 7701], ["Ripon", "WI", "US", 43.8422, -88.8359, 7700], ["Celina", "TX", "US", 33.3246, -96.7844, 7697], ["Emerson", "NJ", "US", 40.9762, -74.0263, 7697], ["Saint Johns", "MO", "US", 38.7134, -90.3432, 7690], ["Hollymead", "VA", "US", 38.1171, -78.4417, 7690], ["Monahans", "TX", "US", 31.5943, -102.8927, 7690], ["Lampasas", "TX", "US", 31.0638, -98.1817, 7687], ["Lander", "WY", "US", 42.833, -108.7307, 7686], ["Derby", "CO", "US", 39.8394, -104.9186, 7685], ["Selah", "WA", "US", 46.654, -120.5301, 7682], ["South Beloit", "IL", "US", 42.4931, -89.0368, 7680], ["West Helena", "AR", "US", 34.5507, -90.6418, 7679], ["Sebastopol", "CA", "US", 38.4021, -122.8239, 7678], ["Galliano", "LA", "US", 29.4422, -90.2993, 7676], ["Fruitvale", "CO", "US", 39.0817, -108.4968, 7675], ["Templeton", "CA", "US", 35.5497, -120.706, 7674], ["Duvall", "WA", "US", 47.7423, -121.9857, 7674], ["Milton", "WA", "US", 47.2482, -122.3129, 7670], ["Slave Lake", "AB", "CA", 55.2834, -114.769, 7661], ["Kenai", "AK", "US", 60.5544, -151.2583, 7661], ["Glen Ridge", "NJ", "US", 40.8054, -74.2038, 7660], ["Dunbar", "WV", "US", 38.3606, -81.7374, 7659], ["Southwood Acres", "CT", "US", 41.9626, -72.5715, 7657], ["Woodlake", "CA", "US", 36.4136, -119.0987, 7654], ["Fanwood", "NJ", "US", 40.6409, -74.3835, 7651], ["Pittston", "PA", "US", 41.3259, -75.7894, 7651], ["Hubbard", "OH", "US", 41.1564, -80.5692, 7650], ["Williamsburg", "FL", "US", 28.4144, -81.4429, 7646], ["Ridgefield", "CT", "US", 41.2815, -73.4982, 7645], ["Gilberts", "IL", "US", 42.1034, -88.3729, 7638], ["Port Wentworth", "GA", "US", 32.1491, -81.1632, 7637], ["Maple Glen", "PA", "US", 40.0156, -79.9767, 7635], ["Robinson", "IL", "US", 39.0053, -87.7392, 7631], ["Halifax", "MA", "US", 41.9912, -70.862, 7631], ["Fair Plain", "MI", "US", 42.087, -86.4559, 7631], ["Kronenwetter", "WI", "US", 44.8222, -89.5904, 7630], ["Ojai", "CA", "US", 34.4481, -119.2429, 7627], ["Fairfax", "CA", "US", 37.9871, -122.5889, 7626], ["Easton", "CT", "US", 41.2529, -73.2973, 7625], ["Old Town", "ME", "US", 44.9342, -68.6453, 7624], ["Hood River", "OR", "US", 45.7054, -121.5215, 7624], ["Pebble Creek", "FL", "US", 28.1484, -82.3457, 7622], ["Morehead", "KY", "US", 37.2711, -87.1764, 7622], ["Hitchcock", "TX", "US", 29.3483, -95.016, 7621], ["Jasper", "TX", "US", 30.9202, -93.9966, 7619], ["Park City", "KS", "US", 37.8, -97.3184, 7618], ["Powdersville", "SC", "US", 34.7918, -82.4929, 7618], ["Pulaski", "TN", "US", 35.1998, -87.0308, 7617], ["Ellwood City", "PA", "US", 40.8617, -80.2865, 7617], ["Evergreen", "MT", "US", 48.2258, -114.2762, 7616], ["Shorewood", "MN", "US", 44.9008, -93.5891, 7614], ["West Boylston", "MA", "US", 42.3668, -71.7856, 7612], ["Sound Beach", "NY", "US", 40.9562, -72.9679, 7612], ["Holly Springs", "MS", "US", 34.7676, -89.4487, 7610], ["Brighton", "MI", "US", 42.5295, -83.7802, 7609], ["Gettysburg", "PA", "US", 39.8309, -77.2311, 7608], ["Bonner Springs", "KS", "US", 39.0597, -94.8836, 7606], ["DuBois", "PA", "US", 41.1192, -78.76, 7597], ["Yreka", "CA", "US", 41.7354, -122.6345, 7597], ["Acton", "CA", "US", 34.47, -118.1967, 7596], ["Princeton", "IL", "US", 41.3681, -89.4648, 7594], ["Montpelier", "VT", "US", 44.2601, -72.5754, 7592], ["Richfield", "UT", "US", 38.7725, -112.0841, 7592], ["Berlin", "NJ", "US", 39.7912, -74.9291, 7590], ["Clear Lake", "IA", "US", 43.138, -93.3794, 7590], ["Manor", "TX", "US", 30.3408, -97.557, 7587], ["Seaford", "DE", "US", 38.6412, -75.611, 7586], ["Inverness", "IL", "US", 42.1181, -88.0962, 7583], ["Fletcher", "NC", "US", 35.4307, -82.5012, 7582], ["New Prague", "MN", "US", 44.5433, -93.5761, 7582], ["Sappington", "MO", "US", 38.537, -90.3798, 7580], ["Center Moriches", "NY", "US", 40.8004, -72.7898, 7580], ["McCook", "NE", "US", 40.2019, -100.6257, 7580], ["Seffner", "FL", "US", 27.9836, -82.2756, 7579], ["Willow Street", "PA", "US", 39.9793, -76.2763, 7578], ["Centerville", "GA", "US", 32.6301, -83.6896, 7575], ["Dayton", "TX", "US", 30.0466, -94.8852, 7575], ["Pukalani", "HI", "US", 20.8367, -156.3367, 7574], ["Happy Valley-Goose Bay", "NL", "CA", 53.3038, -60.3258, 7572], ["Northridge", "OH", "US", 39.9917, -83.7785, 7572], ["Sandston", "VA", "US", 37.5235, -77.3158, 7571], ["St Johnsbury", "VT", "US", 44.4253, -72.0151, 7571], ["Meadow Lakes", "AK", "US", 61.6247, -149.6011, 7570], ["Pasadena Hills", "FL", "US", 28.28, -82.2244, 7570], ["Catalina", "AZ", "US", 32.5056, -110.9211, 7569], ["Wasaga Beach", "ON", "CA", 44.5168, -80.0164, 7567], ["Wilson", "PA", "US", 40.3101, -79.8914, 7564], ["Chibougamau", "QC", "CA", 49.9168, -74.3659, 7563], ["Hillcrest", "NY", "US", 41.1279, -74.041, 7558], ["Tiverton", "RI", "US", 41.6259, -71.2134, 7557], ["Country Club Estates", "GA", "US", 33.9893, -83.4096, 7555], ["Lamar", "CO", "US", 38.0872, -102.6208, 7555], ["Orland", "CA", "US", 39.7474, -122.1964, 7550], ["Corning", "CA", "US", 39.9277, -122.1792, 7548], ["Murrells Inlet", "SC", "US", 33.551, -79.0414, 7547], ["River Rouge", "MI", "US", 42.2734, -83.1344, 7546], ["Gonzales", "TX", "US", 29.5016, -97.4525, 7544], ["Garnet", "CA", "US", 33.902, -116.5456, 7543], ["Yorkshire", "VA", "US", 38.7932, -77.4478, 7541], ["Rathdrum", "ID", "US", 47.8124, -116.8966, 7538], ["Revelstoke", "BC", "CA", 50.9971, -118.1953, 7533], ["Waterboro", "ME", "US", 43.5356, -70.7151, 7532], ["Listowel", "ON", "CA", 43.7334, -80.9497, 7530], ["Aylmer", "ON", "CA", 42.7668, -80.983, 7527], ["Rhinelander", "WI", "US", 45.6366, -89.4121, 7526], ["Rockton", "IL", "US", 42.4525, -89.0723, 7525], ["Auburn", "GA", "US", 34.0137, -83.8277, 7524], ["Escalon", "CA", "US", 37.7978, -120.9979, 7523], ["Seminole", "OK", "US", 35.2245, -96.6706, 7522], ["Highlands", "TX", "US", 29.8188, -95.056, 7522], ["Fort Lee", "VA", "US", 37.4957, -77.3353, 7520], ["Chester Springs", "PA", "US", 40.0951, -75.6169, 7520], ["Herkimer", "NY", "US", 43.0256, -74.986, 7519], ["Pont Rouge", "QC", "CA", 48.8833, -72.0825, 7518], ["Waite Park", "MN", "US", 45.5572, -94.2242, 7517], ["Connellsville", "PA", "US", 40.0179, -79.5895, 7515], ["Green", "OR", "US", 43.1604, -123.3679, 7515], ["Haddon Heights", "NJ", "US", 39.8773, -75.0646, 7514], ["Lancaster", "MA", "US", 42.4556, -71.6731, 7509], ["Oak Island", "NC", "US", 33.9166, -78.1611, 7507], ["Camlachie", "ON", "CA", 43.036, -82.1616, 7506], ["Clewiston", "FL", "US", 26.7542, -80.9337, 7505], ["Iron Mountain", "MI", "US", 45.8202, -88.066, 7504], ["Ashland", "VA", "US", 37.759, -77.48, 7503], ["Marengo", "IL", "US", 42.2486, -88.6084, 7503], ["Banff", "AB", "CA", 51.1762, -115.5698, 7502], ["Yarmouth", "NS", "CA", 43.8334, -66.1156, 7500], ["Crystal City", "TX", "US", 28.6775, -99.8281, 7496], ["Plymouth", "MA", "US", 41.9584, -70.6673, 7494], ["Melrose Park", "FL", "US", 26.1134, -80.1934, 7492], ["Silvis", "IL", "US", 41.5123, -90.4151, 7491], ["Page", "AZ", "US", 36.9147, -111.4558, 7490], ["Oakland", "TN", "US", 35.229, -89.5151, 7488], ["Monessen", "PA", "US", 40.1484, -79.8878, 7483], ["Saint Louis", "MI", "US", 43.4084, -84.6067, 7482], ["South Berwick", "ME", "US", 43.2345, -70.8095, 7480], ["Aurora", "MO", "US", 36.9709, -93.718, 7477], ["Navasota", "TX", "US", 30.388, -96.0877, 7476], ["Salem", "UT", "US", 40.053, -111.6735, 7475], ["Rockville", "CT", "US", 41.8668, -72.4495, 7474], ["Swainsboro", "GA", "US", 32.5974, -82.3337, 7471], ["Citrus Hills", "FL", "US", 28.8883, -82.4326, 7470], ["Villa Hills", "KY", "US", 39.0634, -84.593, 7468], ["Fishersville", "VA", "US", 38.099, -78.9692, 7462], ["Sioux Center", "IA", "US", 43.0797, -96.1756, 7461], ["Pembroke", "NH", "US", 43.1467, -71.4576, 7461], ["LaFollette", "TN", "US", 36.3829, -84.1199, 7456], ["Charles City", "IA", "US", 43.0664, -92.6724, 7455], ["Palmyra", "PA", "US", 40.309, -76.5933, 7451], ["Seminole", "TX", "US", 32.719, -102.6449, 7448], ["Essex", "ON", "CA", 42.1751, -82.8248, 7446], ["Irondale", "GA", "US", 33.4807, -84.3588, 7446], ["Nantucket", "MA", "US", 41.2835, -70.0995, 7446], ["Orting", "WA", "US", 47.0979, -122.2043, 7446], ["Cotati", "CA", "US", 38.3269, -122.7072, 7445], ["Oak Grove", "KY", "US", 36.6651, -87.4428, 7444], ["Twin Rivers", "NJ", "US", 40.264, -74.4913, 7443], ["Mentor-on-the-Lake", "OH", "US", 41.705, -81.3604, 7443], ["Middletown", "PA", "US", 40.644, -75.3324, 7441], ["Napanee", "ON", "CA", 44.2501, -76.9494, 7439], ["Pinson", "AL", "US", 33.689, -86.6833, 7438], ["Lemoore Station", "CA", "US", 36.2633, -119.9048, 7438], ["Melissa", "TX", "US", 33.2859, -96.5728, 7436], ["Lugoff", "SC", "US", 34.2274, -80.6893, 7434], ["Gresham Park", "GA", "US", 33.7034, -84.3144, 7432], ["Dunellen", "NJ", "US", 40.5893, -74.4718, 7431], ["Celebration", "FL", "US", 28.3253, -81.5331, 7427], ["Carignan", "QC", "CA", 45.4501, -73.2992, 7426], ["Round Lake Park", "IL", "US", 42.357, -88.0768, 7426], ["Calipatria", "CA", "US", 33.1256, -115.5142, 7424], ["Mount Horeb", "WI", "US", 43.0086, -89.7385, 7421], ["Independent Hill", "VA", "US", 38.636, -77.4378, 7419], ["Brattleboro", "VT", "US", 42.8509, -72.5579, 7414], ["Joshua Tree", "CA", "US", 34.1347, -116.3131, 7414], ["Fairlawn", "OH", "US", 41.1278, -81.6098, 7413], ["Hatboro", "PA", "US", 40.1743, -75.1068, 7411], ["Washington", "IA", "US", 41.2992, -91.6929, 7408], ["Fair Oaks Ranch", "TX", "US", 29.7458, -98.6434, 7407], ["McGregor", "FL", "US", 26.5609, -81.9145, 7406], ["Ormond-by-the-Sea", "FL", "US", 29.3491, -81.0665, 7406], ["Mexia", "TX", "US", 31.6799, -96.4822, 7406], ["Midland Beach", "NY", "US", 40.5732, -74.0946, 7402], ["Larose", "LA", "US", 29.5724, -90.3817, 7400], ["Roanoke", "TX", "US", 33.004, -97.2258, 7400], ["Manhattan", "IL", "US", 41.4225, -87.9859, 7400], ["Globe", "AZ", "US", 33.3942, -110.7865, 7396], ["West Dundee", "IL", "US", 42.0981, -88.2829, 7395], ["Park City", "IL", "US", 42.3484, -87.8842, 7392], ["Philadelphia", "MS", "US", 32.7715, -89.1167, 7391], ["Chehalis", "WA", "US", 46.6621, -122.964, 7391], ["Northport", "NY", "US", 40.9009, -73.3432, 7390], ["Corbin", "KY", "US", 36.9487, -84.0969, 7389], ["Clinton", "MA", "US", 42.4168, -71.6829, 7389], ["Cohasset", "MA", "US", 42.2418, -70.8037, 7388], ["Glastonbury Center", "CT", "US", 41.7009, -72.5995, 7387], ["Edgewater Park", "NJ", "US", 40.0682, -74.9007, 7387], ["Batesville", "MS", "US", 34.3115, -89.9443, 7385], ["Felida", "WA", "US", 45.7096, -122.7073, 7385], ["Campbellton", "NB", "CA", 48.0075, -66.6727, 7384], ["Dayton", "TN", "US", 35.494, -85.0125, 7384], ["Sterling", "MA", "US", 42.4376, -71.7606, 7384], ["Hughson", "CA", "US", 37.5969, -120.866, 7384], ["Carneys Point", "NJ", "US", 39.7112, -75.4702, 7382], ["Payette", "ID", "US", 44.0782, -116.9338, 7380], ["Northgate", "OH", "US", 39.2528, -84.5924, 7377], ["Hampton", "GA", "US", 33.3871, -84.283, 7372], ["Beaumont", "AB", "CA", 53.3501, -113.4187, 7366], ["Sandwich", "IL", "US", 41.6459, -88.6217, 7366], ["Quincy", "WA", "US", 47.2343, -119.8525, 7365], ["Mansfield Center", "MA", "US", 42.0226, -71.2181, 7360], ["Saint Augustine Shores", "FL", "US", 29.8108, -81.3103, 7359], ["Canfield", "OH", "US", 41.0251, -80.7609, 7355], ["Devils Lake", "ND", "US", 48.1128, -98.8651, 7351], ["Bay Wood", "NY", "US", 40.7501, -73.2912, 7350], ["Innisfil", "ON", "CA", 44.3001, -79.6496, 7345], ["Albertville", "MN", "US", 45.2377, -93.6544, 7345], ["Murillo Colonia", "TX", "US", 26.2565, -98.1133, 7344], ["Aberdeen", "NC", "US", 35.1315, -79.4295, 7343], ["Morrow", "GA", "US", 33.5832, -84.3394, 7338], ["La Feria", "TX", "US", 26.159, -97.8239, 7338], ["Hudson", "NH", "US", 42.7648, -71.4398, 7336], ["Flatwoods", "KY", "US", 38.5226, -82.7171, 7335], ["Collinsville", "VA", "US", 36.7151, -79.9153, 7335], ["Nebraska City", "NE", "US", 40.6767, -95.8592, 7335], ["Williston Park", "NY", "US", 40.7565, -73.6449, 7331], ["Midland Park", "NJ", "US", 40.9893, -74.1407, 7329], ["Grandview Heights", "OH", "US", 39.9798, -83.0407, 7328], ["Hudsonville", "MI", "US", 42.8709, -85.865, 7324], ["Laughlin", "NV", "US", 35.1678, -114.573, 7323], ["Delson", "QC", "CA", 45.3668, -73.5492, 7322], ["Floresville", "TX", "US", 29.1336, -98.1561, 7321], ["Altoona", "WI", "US", 44.8047, -91.4432, 7321], ["Interlaken", "CA", "US", 36.9513, -121.7338, 7321], ["Middleborough Center", "MA", "US", 41.8946, -70.9262, 7319], ["Woodlake", "VA", "US", 37.4211, -77.6793, 7319], ["Guadalupe", "CA", "US", 34.9716, -120.5718, 7318], ["Woodlawn", "NY", "US", 40.8982, -73.8674, 7317], ["Clarkston", "WA", "US", 46.4163, -117.0456, 7317], ["Wauseon", "OH", "US", 41.5492, -84.1416, 7316], ["Jennings Lodge", "OR", "US", 45.3912, -122.6126, 7315], ["Palmyra", "NJ", "US", 40.0071, -75.0282, 7314], ["Bloomfield", "NM", "US", 36.7111, -107.9845, 7314], ["Sydney Mines", "NS", "CA", 46.2367, -60.2177, 7312], ["Riverdale Park", "MD", "US", 38.9634, -76.9316, 7305], ["Franklin", "LA", "US", 29.796, -91.5015, 7302], ["Livingston", "MT", "US", 45.6624, -110.561, 7302], ["Harrison", "WI", "US", 44.2278, -88.3359, 7302], ["New Cumberland", "PA", "US", 40.2323, -76.8847, 7295], ["Fort Bragg", "CA", "US", 39.4457, -123.8053, 7289], ["Baie-Saint-Paul", "QC", "CA", 47.4411, -70.4986, 7288], ["Salem", "IL", "US", 38.627, -88.9456, 7287], ["Buechel", "KY", "US", 38.1951, -85.6519, 7287], ["Oceano", "CA", "US", 35.0989, -120.6124, 7286], ["Hastings", "MI", "US", 42.6459, -85.2908, 7284], ["Westmere", "NY", "US", 42.6912, -73.8687, 7284], ["Forest City", "NC", "US", 35.334, -81.8651, 7282], ["Lincolnshire", "IL", "US", 42.19, -87.9084, 7282], ["Bermuda Dunes", "CA", "US", 33.7428, -116.2892, 7282], ["Dry Run", "OH", "US", 39.1042, -84.3305, 7281], ["Green Cove Springs", "FL", "US", 29.9919, -81.6782, 7277], ["Mead", "WA", "US", 47.7674, -117.3549, 7275], ["North Springfield", "VA", "US", 38.8043, -77.2047, 7274], ["Pi\xF1on Hills", "CA", "US", 34.4333, -117.6467, 7272], ["Neptune Beach", "FL", "US", 30.3119, -81.3965, 7269], ["Odessa", "FL", "US", 28.1939, -82.5918, 7267], ["Longboat Key", "FL", "US", 27.4125, -82.659, 7266], ["Westphalia", "MD", "US", 38.8454, -76.8111, 7266], ["Ville Platte", "LA", "US", 30.688, -92.2715, 7264], ["Lexington", "VA", "US", 37.784, -79.4428, 7262], ["Napili-Honokowai", "HI", "US", 20.9753, -156.6783, 7261], ["Strathmore", "NJ", "US", 40.3959, -74.2135, 7258], ["Madison", "SD", "US", 44.0061, -97.114, 7258], ["Grand Centre", "AB", "CA", 54.4163, -110.213, 7256], ["Hanover", "ON", "CA", 44.1501, -81.033, 7255], ["Tell City", "IN", "US", 37.9514, -86.7678, 7255], ["New Dorp", "NY", "US", 40.574, -74.116, 7253], ["Orland Hills", "IL", "US", 41.5853, -87.8431, 7249], ["Knoxville", "IA", "US", 41.3208, -93.1094, 7248], ["Homestead Meadows South", "TX", "US", 31.811, -106.1643, 7247], ["North Patchogue", "NY", "US", 40.787, -73.009, 7246], ["Bryans Road", "MD", "US", 38.6271, -77.073, 7244], ["Smithville", "NJ", "US", 39.494, -74.4571, 7242], ["Southport", "NY", "US", 42.0548, -76.8191, 7238], ["Rockland", "ME", "US", 44.1037, -69.1089, 7237], ["Sanibel", "FL", "US", 26.449, -82.0223, 7236], ["Summit View", "WA", "US", 47.1363, -122.352, 7236], ["Osceola", "AR", "US", 35.7051, -89.9695, 7233], ["Inverness", "FL", "US", 28.8358, -82.3304, 7233], ["Elkins", "WV", "US", 38.9259, -79.8467, 7226], ["Beacon Square", "FL", "US", 28.2086, -82.7554, 7224], ["Swanzey", "NH", "US", 42.8698, -72.2818, 7224], ["Valley Center", "KS", "US", 37.8347, -97.3734, 7222], ["Woodland Park", "CO", "US", 38.9939, -105.0569, 7222], ["Saint Francis", "MN", "US", 45.3869, -93.3594, 7218], ["Putnam", "CT", "US", 41.9151, -71.909, 7214], ["Leola", "PA", "US", 40.0879, -76.185, 7214], ["Mount Sterling", "KY", "US", 38.0565, -83.9433, 7208], ["Mount Vernon", "IN", "US", 40.6695, -85.8242, 7208], ["La Sarre", "QC", "CA", 48.8002, -79.1996, 7206], ["Mendota", "IL", "US", 41.5472, -89.1176, 7204], ["Hiawatha", "IA", "US", 42.0358, -91.6821, 7199], ["El Rio", "CA", "US", 34.2358, -119.1638, 7198], ["Tyrone", "GA", "US", 33.4712, -84.5971, 7194], ["Winooski", "VT", "US", 44.4914, -73.1857, 7193], ["Pompano Beach Highlands", "FL", "US", 26.2829, -80.107, 7192], ["Hudson Falls", "NY", "US", 43.3006, -73.5859, 7191], ["Asbestos", "QC", "CA", 45.7668, -71.9324, 7190], ["Kosciusko", "MS", "US", 33.058, -89.5896, 7187], ["Yardville", "NJ", "US", 40.1812, -74.6643, 7186], ["Makawao", "HI", "US", 20.8569, -156.3131, 7184], ["Highland Heights", "KY", "US", 39.0331, -84.4519, 7183], ["Delafield", "WI", "US", 43.0608, -88.4037, 7180], ["Merritt", "BC", "CA", 50.1123, -120.7942, 7179], ["Minnetrista", "MN", "US", 44.9383, -93.7177, 7178], ["Southgate", "FL", "US", 27.3081, -82.5098, 7173], ["LaFayette", "GA", "US", 34.7048, -85.2819, 7173], ["Glenolden", "PA", "US", 39.9001, -75.2891, 7173], ["Pleasantville", "NY", "US", 41.1329, -73.7926, 7173], ["New London", "WI", "US", 44.3928, -88.7398, 7172], ["Douglas", "MA", "US", 42.0543, -71.7395, 7168], ["Seward", "NE", "US", 40.907, -97.0989, 7167], ["Atherton", "CA", "US", 37.4613, -122.1977, 7167], ["Mills River", "NC", "US", 35.3884, -82.5668, 7162], ["Shamokin", "PA", "US", 40.789, -76.5589, 7162], ["Pacific", "MO", "US", 38.482, -90.7415, 7161], ["Applewood", "CO", "US", 39.7578, -105.1625, 7160], ["Heber Springs", "AR", "US", 35.4915, -92.0313, 7156], ["East Perrine", "FL", "US", 25.6087, -80.3389, 7156], ["Kaufman", "TX", "US", 32.589, -96.3089, 7156], ["Sausalito", "CA", "US", 37.8591, -122.4852, 7156], ["East Hills", "NY", "US", 40.7937, -73.6271, 7155], ["Pinehurst", "MA", "US", 42.5293, -71.2281, 7152], ["Blandon", "PA", "US", 40.4412, -75.8869, 7152], ["Belen", "NM", "US", 34.6628, -106.7764, 7152], ["Demopolis", "AL", "US", 32.5176, -87.8364, 7148], ["Catoosa", "OK", "US", 36.189, -95.7458, 7146], ["Trumann", "AR", "US", 35.6737, -90.5073, 7145], ["Keyport", "NJ", "US", 40.4332, -74.1996, 7145], ["Gulf Hills", "MS", "US", 30.4305, -88.8423, 7144], ["Madison Park", "NJ", "US", 40.4515, -74.3079, 7144], ["West Vero Corridor", "FL", "US", 27.6378, -80.4858, 7138], ["Marshfield", "MO", "US", 37.3387, -92.9071, 7138], ["Jessup", "MD", "US", 39.1493, -76.7752, 7137], ["Sullivan", "MO", "US", 38.2081, -91.1604, 7135], ["Mantua", "VA", "US", 38.8537, -77.2594, 7135], ["Independence", "OH", "US", 41.3687, -81.6379, 7135], ["Bonne Terre", "MO", "US", 37.9231, -90.5554, 7133], ["Islamorada", "FL", "US", 24.9243, -80.6278, 7131], ["Parkwood", "WA", "US", 47.5331, -122.6101, 7126], ["Broadview Park", "FL", "US", 26.0995, -80.2087, 7125], ["Pomona", "NJ", "US", 39.4785, -74.5752, 7124], ["Providence", "UT", "US", 41.7063, -111.8172, 7124], ["Pacific", "WA", "US", 47.2645, -122.2501, 7123], ["Fayetteville", "TN", "US", 35.152, -86.5705, 7121], ["Piedmont", "OK", "US", 35.642, -97.7464, 7118], ["Logan", "OH", "US", 39.5401, -82.4071, 7117], ["Greenville", "NY", "US", 40.9931, -73.8199, 7116], ["Cuero", "TX", "US", 29.0939, -97.2892, 7115], ["Vandalia", "IL", "US", 38.9606, -89.0937, 7112], ["Hempstead", "TX", "US", 30.0974, -96.0783, 7110], ["Walled Lake", "MI", "US", 42.5378, -83.481, 7110], ["Austell", "GA", "US", 33.8126, -84.6344, 7107], ["Pointe-du-Lac", "QC", "CA", 48.5001, -71.7824, 7104], ["Venice Gardens", "FL", "US", 27.0731, -82.4076, 7104], ["Village Saint George", "LA", "US", 30.3621, -91.0673, 7104], ["Fort Belvoir", "VA", "US", 38.7119, -77.1459, 7100], ["Los Serranos", "CA", "US", 33.9728, -117.7081, 7099], ["Richland", "MS", "US", 32.239, -90.1584, 7087], ["Camden", "SC", "US", 34.2465, -80.607, 7085], ["Whitefish", "MT", "US", 48.4111, -114.3376, 7073], ["West Glens Falls", "NY", "US", 43.3001, -73.684, 7071], ["New Paltz", "NY", "US", 41.7476, -74.0868, 7070], ["University Park", "IL", "US", 41.443, -87.6836, 7070], ["Ponchatoula", "LA", "US", 30.4388, -90.4415, 7068], ["Amory", "MS", "US", 33.9843, -88.4881, 7067], ["Dayton", "NJ", "US", 40.3726, -74.5101, 7063], ["Fairfield", "NJ", "US", 40.8837, -74.306, 7063], ["King", "NC", "US", 36.2807, -80.3592, 7059], ["Mims", "FL", "US", 28.6653, -80.8448, 7058], ["Kill Devil Hills", "NC", "US", 36.0307, -75.676, 7058], ["Russellville", "KY", "US", 36.8453, -86.8872, 7056], ["Perry", "FL", "US", 30.1177, -83.5827, 7055], ["Ocean City", "MD", "US", 38.3365, -75.0849, 7055], ["Savage", "MD", "US", 39.1379, -76.8239, 7054], ["Bellbrook", "OH", "US", 39.6356, -84.0708, 7053], ["Georgetown", "DE", "US", 38.6901, -75.3855, 7051], ["Milltown", "NJ", "US", 40.4562, -74.4432, 7049], ["Clinton", "IL", "US", 40.1536, -88.9645, 7048], ["Pelham", "NY", "US", 40.9098, -73.8079, 7048], ["Alta Sierra", "CA", "US", 35.7313, -118.5539, 7047], ["Morehead", "KY", "US", 38.184, -83.4327, 7045], ["Marshall", "MI", "US", 42.2723, -84.9633, 7045], ["Bluewater", "ON", "CA", 43.4668, -81.5998, 7044], ["Coteau-du-Lac", "QC", "CA", 45.3001, -74.1825, 7044], ["Benton", "IL", "US", 37.9967, -88.9201, 7041], ["Eden Isle", "LA", "US", 30.2285, -89.7987, 7041], ["Crete", "NE", "US", 40.6278, -96.9614, 7037], ["Ridley Park", "PA", "US", 39.8812, -75.3238, 7035], ["Milton-Freewater", "OR", "US", 45.9326, -118.3877, 7035], ["Winters", "CA", "US", 38.5249, -121.9708, 7034], ["Lakes of the Four Seasons", "IN", "US", 41.4103, -87.2131, 7033], ["Huntingdon", "PA", "US", 40.4848, -78.0103, 7029], ["Westminster", "MA", "US", 42.5459, -71.9106, 7028], ["Mount Carmel", "IL", "US", 38.4109, -87.7614, 7027], ["Savannah", "TN", "US", 35.2248, -88.2492, 7027], ["San Martin", "CA", "US", 37.0849, -121.6102, 7027], ["Delphos", "OH", "US", 40.8434, -84.3416, 7023], ["Huron", "OH", "US", 41.395, -82.5552, 7022], ["Coaticook", "QC", "CA", 45.1334, -71.7991, 7021], ["Withamsville", "OH", "US", 39.0623, -84.2883, 7021], ["Baltimore Highlands", "MD", "US", 39.2332, -76.6366, 7019], ["Stratford", "NJ", "US", 39.8268, -75.0155, 7013], ["Pikeville", "KY", "US", 37.4793, -82.5188, 7012], ["Dalton", "MA", "US", 42.4737, -73.1662, 7012], ["Lake Lorraine", "FL", "US", 30.4416, -86.5652, 7010], ["Umatilla", "OR", "US", 45.9173, -119.3425, 7009], ["Tolleson", "AZ", "US", 33.45, -112.2593, 7008], ["Idabel", "OK", "US", 33.8957, -94.8263, 7007], ["Nyack", "NY", "US", 41.0906, -73.9179, 7004], ["Eagle Mountain", "TX", "US", 32.8935, -97.4445, 7003], ["Eglin Village", "FL", "US", 30.463, -86.5394, 7e3], ["Tacony", "PA", "US", 40.0312, -75.0443, 7e3], ["Ione", "CA", "US", 38.3527, -120.9327, 7e3], ["Tamalpais Valley", "CA", "US", 37.8796, -122.5458, 7e3], ["Kenton", "OR", "US", 45.5818, -122.6815, 7e3], ["North Portland", "OR", "US", 45.6104, -122.7034, 7e3], ["East End", "AR", "US", 34.5506, -92.341, 6998], ["Hampstead", "QC", "CA", 45.4806, -73.6631, 6996], ["Tallulah", "LA", "US", 32.4085, -91.1868, 6995], ["Fairfield Glade", "TN", "US", 36.0003, -84.8863, 6989], ["Fort Myers Beach", "FL", "US", 26.4527, -81.9501, 6983], ["Duck Lake", "BC", "CA", 50.0088, -119.3967, 6982], ["North Sarasota", "FL", "US", 27.3739, -82.5184, 6982], ["Orange Lake", "NY", "US", 41.5398, -74.0982, 6982], ["Kenwood", "OH", "US", 39.2106, -84.3672, 6981], ["Old Jefferson", "LA", "US", 30.3827, -91.017, 6980], ["Roosevelt", "UT", "US", 40.2994, -109.9888, 6980], ["Burton", "SC", "US", 32.4357, -80.724, 6976], ["Valley Park", "MO", "US", 38.5492, -90.4926, 6974], ["Middlebury", "CT", "US", 41.5279, -73.1276, 6974], ["Kingston", "RI", "US", 41.4804, -71.5226, 6974], ["Linwood", "NJ", "US", 39.3398, -74.5752, 6973], ["South Weber", "UT", "US", 41.1324, -111.9302, 6971], ["King", "ON", "CA", 43.9651, -79.5901, 6970], ["Freeland", "MI", "US", 43.525, -84.1228, 6969], ["Norwich", "NY", "US", 42.5312, -75.5235, 6968], ["Portage Lakes", "OH", "US", 41.0073, -81.5271, 6968], ["Cameron Park", "TX", "US", 25.9645, -97.4767, 6963], ["Cameron Park Colonia", "TX", "US", 25.9715, -97.4783, 6963], ["Archbald", "PA", "US", 41.4948, -75.5369, 6960], ["Sturtevant", "WI", "US", 42.6981, -87.8945, 6960], ["Dade City", "FL", "US", 28.3647, -82.1959, 6955], ["Scappoose", "OR", "US", 45.7543, -122.8776, 6954], ["La Junta", "CO", "US", 37.985, -103.5438, 6951], ["Bridgeport", "MI", "US", 43.3595, -83.8816, 6950], ["Stratham Station", "NH", "US", 43.0529, -70.8953, 6949], ["Black Jack", "MO", "US", 38.7934, -90.2673, 6947], ["Etowah", "NC", "US", 35.3176, -82.5943, 6944], ["Laurel", "MT", "US", 45.6691, -108.7715, 6943], ["Sidney", "NE", "US", 41.1428, -102.978, 6942], ["Nolensville", "TN", "US", 35.9523, -86.6694, 6939], ["Terrace Heights", "WA", "US", 46.6062, -120.4398, 6937], ["Colonial Heights", "TN", "US", 36.4851, -82.5032, 6934], ["Live Oak", "FL", "US", 30.295, -82.984, 6931], ["Milton", "PA", "US", 41.012, -76.8477, 6928], ["Cortland", "OH", "US", 41.3303, -80.7254, 6927], ["Rumson", "NJ", "US", 40.3721, -73.999, 6926], ["Great Neck Plaza", "NY", "US", 40.7868, -73.7265, 6925], ["Moapa Valley", "NV", "US", 36.5805, -114.4703, 6924], ["Gypsum", "CO", "US", 39.6469, -106.9517, 6922], ["Hickam Field", "HI", "US", 21.3397, -157.9602, 6920], ["Robinwood", "MD", "US", 39.637, -77.6569, 6918], ["Templeton", "MA", "US", 42.5556, -72.0676, 6918], ["Belle Plaine", "MN", "US", 44.6227, -93.7686, 6918], ["Saint Albans", "VT", "US", 44.8109, -73.0832, 6918], ["Greenwood", "NS", "CA", 44.9741, -64.9317, 6915], ["Galax", "VA", "US", 36.6612, -80.924, 6914], ["South Cleveland", "TN", "US", 35.1412, -84.8722, 6912], ["Alta Sierra", "CA", "US", 39.1416, -121.0538, 6911], ["Homeacre-Lyndora", "PA", "US", 40.8721, -79.9206, 6906], ["Stratmoor", "CO", "US", 38.7739, -104.7797, 6900], ["Litchfield", "IL", "US", 39.1753, -89.6543, 6897], ["Saint-R\xE9mi", "QC", "CA", 45.2668, -73.6159, 6891], ["Oasis", "CA", "US", 33.4659, -116.0989, 6890], ["Treasure Island", "FL", "US", 27.7692, -82.769, 6887], ["Mountainside", "NJ", "US", 40.6723, -74.3574, 6885], ["Lucas", "TX", "US", 33.0843, -96.5767, 6883], ["Gorham", "ME", "US", 43.6795, -70.4442, 6882], ["Aspen", "CO", "US", 39.1911, -106.8175, 6882], ["Mount Ivy", "NY", "US", 41.1868, -74.0349, 6878], ["Milford", "OH", "US", 39.1753, -84.2944, 6876], ["Blackwell", "OK", "US", 36.8045, -97.2828, 6875], ["Lantana", "TX", "US", 33.0907, -97.1242, 6874], ["Leitchfield", "KY", "US", 37.48, -86.2939, 6873], ["Plaquemine", "LA", "US", 30.2901, -91.235, 6871], ["Pollock Pines", "CA", "US", 38.7616, -120.5861, 6871], ["Viola", "NY", "US", 41.1365, -74.0824, 6868], ["Ambridge", "PA", "US", 40.5892, -80.2251, 6859], ["Jackson", "WI", "US", 43.3239, -88.1668, 6859], ["Mechanicstown", "NY", "US", 41.4429, -74.3885, 6858], ["Ephraim", "UT", "US", 39.3597, -111.5863, 6857], ["Laurel Hill", "VA", "US", 38.7166, -77.2369, 6855], ["Cottage Grove", "WI", "US", 43.0761, -89.1996, 6854], ["Mira Monte", "CA", "US", 34.4336, -119.2851, 6854], ["Schriever", "LA", "US", 29.7421, -90.8104, 6853], ["North Syracuse", "NY", "US", 43.1348, -76.1299, 6853], ["Pratt", "KS", "US", 37.6439, -98.7376, 6849], ["Bargersville", "IN", "US", 39.5209, -86.1678, 6846], ["Carthage", "TX", "US", 32.1574, -94.3374, 6844], ["Santa Clara", "UT", "US", 37.133, -113.6541, 6841], ["Walden", "NY", "US", 41.5612, -74.1885, 6839], ["Huron", "CA", "US", 36.2027, -120.1029, 6836], ["Orchard Mesa", "CO", "US", 39.043, -108.5523, 6836], ["Newport", "TN", "US", 35.967, -83.1877, 6834], ["Atlantic", "IA", "US", 41.4036, -95.0139, 6833], ["Nevada", "IA", "US", 42.0228, -93.4524, 6831], ["Tamaqua", "PA", "US", 40.7973, -75.9694, 6829], ["Middleton", "ID", "US", 43.7068, -116.6201, 6828], ["Sidney", "MT", "US", 47.7167, -104.1563, 6828], ["Roeland Park", "KS", "US", 39.0375, -94.6322, 6827], ["Sequim", "WA", "US", 48.0796, -123.1023, 6826], ["Warwick", "NY", "US", 41.2565, -74.3599, 6823], ["Allendale", "NJ", "US", 41.0415, -74.129, 6822], ["Gibsons", "BC", "CA", 49.3954, -123.5055, 6821], ["North Amherst", "MA", "US", 42.4104, -72.5309, 6819], ["Hewlett", "NY", "US", 40.6432, -73.6957, 6819], ["Winthrop Harbor", "IL", "US", 42.4789, -87.8237, 6818], ["Barrington", "NJ", "US", 39.8648, -75.0552, 6817], ["Carmel Hamlet", "NY", "US", 41.4149, -73.6852, 6817], ["Buena Vista", "MI", "US", 43.4203, -83.8986, 6816], ["Carbonear", "NL", "CA", 47.7332, -53.2148, 6814], ["Wickenburg", "AZ", "US", 33.9686, -112.7296, 6806], ["Tuttle", "OK", "US", 35.2909, -97.8123, 6805], ["Stevensville", "MD", "US", 38.9807, -76.3144, 6803], ["Darnestown", "MD", "US", 39.1034, -77.2908, 6802], ["Lockwood", "MT", "US", 45.8191, -108.4149, 6797], ["Kirtland", "OH", "US", 41.6289, -81.3615, 6793], ["Whitemarsh Island", "GA", "US", 32.0288, -81.0168, 6792], ["Hornsby Bend", "TX", "US", 30.2474, -97.5833, 6791], ["Myers Corner", "NY", "US", 41.6062, -73.8729, 6790], ["Groesbeck", "OH", "US", 39.2231, -84.5869, 6788], ["Lake City", "SC", "US", 33.871, -79.7554, 6788], ["Palmer", "AK", "US", 61.5994, -149.1146, 6788], ["Nappanee", "IN", "US", 41.4428, -86.0014, 6787], ["Stickney", "IL", "US", 41.8214, -87.7828, 6786], ["Martins Ferry", "OH", "US", 40.0959, -80.7245, 6786], ["Landen", "OH", "US", 39.312, -84.283, 6782], ["Atkinson", "NH", "US", 42.8384, -71.147, 6782], ["Stanwood", "WA", "US", 48.2412, -122.3707, 6779], ["Crescent City", "CA", "US", 41.7559, -124.2018, 6774], ["Saint-Zotique", "QC", "CA", 45.2501, -74.2492, 6773], ["Gibsonville", "NC", "US", 36.1057, -79.5422, 6773], ["Hamilton", "AL", "US", 34.1423, -87.9886, 6772], ["Cos Cob", "CT", "US", 41.0334, -73.5996, 6770], ["Fairview", "GA", "US", 34.9456, -85.2844, 6769], ["Taylor Mill", "KY", "US", 38.9976, -84.4963, 6769], ["East Porterville", "CA", "US", 36.0575, -118.9757, 6767], ["Clackamas", "OR", "US", 45.4076, -122.5704, 6767], ["Ogden", "NC", "US", 34.2724, -77.8186, 6766], ["Bayville", "NY", "US", 40.9106, -73.5621, 6764], ["Nitro", "WV", "US", 38.4148, -81.844, 6763], ["West Point", "NY", "US", 41.3915, -73.956, 6763], ["Commerce", "GA", "US", 34.204, -83.4571, 6762], ["Belle Harbor", "NY", "US", 40.5759, -73.8482, 6758], ["Bowleys Quarters", "MD", "US", 39.3354, -76.3902, 6755], ["Fox Point", "WI", "US", 43.1575, -87.9018, 6755], ["Grove", "OK", "US", 36.5937, -94.7691, 6751], ["West Bridgewater", "MA", "US", 42.019, -71.0078, 6750], ["Mount Olympus", "UT", "US", 40.6855, -111.7885, 6748], ["Souderton", "PA", "US", 40.3118, -75.3252, 6747], ["Brook Highland", "AL", "US", 33.4357, -86.6739, 6746], ["Taneytown", "MD", "US", 39.6579, -77.1744, 6746], ["Greenbrier", "TN", "US", 36.4275, -86.8047, 6745], ["Manorhaven", "NY", "US", 40.8432, -73.7148, 6744], ["Kimberly", "WI", "US", 44.2722, -88.339, 6744], ["Maple Glen", "PA", "US", 40.1793, -75.1804, 6742], ["Morrilton", "AR", "US", 35.1509, -92.7441, 6738], ["Loomis", "CA", "US", 38.8213, -121.193, 6733], ["Willow Oak", "FL", "US", 27.9161, -82.0179, 6732], ["Aquia Harbour", "VA", "US", 38.4626, -77.3889, 6727], ["Kincardine", "ON", "CA", 44.1834, -81.6331, 6725], ["Brandywine", "MD", "US", 38.6968, -76.8478, 6719], ["Church Hill", "TN", "US", 36.5223, -82.7135, 6719], ["Anadarko", "OK", "US", 35.0726, -98.2437, 6717], ["Marion", "SC", "US", 34.1782, -79.4006, 6714], ["Watford City", "ND", "US", 47.8022, -103.2832, 6708], ["De Queen", "AR", "US", 34.0379, -94.3413, 6707], ["Oyster Bay", "NY", "US", 40.8657, -73.5321, 6707], ["Parkville", "PA", "US", 39.7812, -76.9633, 6706], ["Wedgefield", "FL", "US", 28.4878, -81.0773, 6705], ["Whitinsville", "MA", "US", 42.1112, -71.6662, 6704], ["Farmington", "AR", "US", 36.042, -94.2472, 6701], ["Millersville", "TN", "US", 36.3712, -86.71, 6700], ["Big Park", "AZ", "US", 34.7803, -111.7626, 6695], ["Lower Allen", "PA", "US", 40.2265, -76.9005, 6694], ["Belle Isle", "FL", "US", 28.4583, -81.3592, 6689], ["Thomson", "GA", "US", 33.4707, -82.5046, 6689], ["Silsbee", "TX", "US", 30.3491, -94.178, 6688], ["Sturgis", "SD", "US", 44.4097, -103.5091, 6688], ["Fircrest", "WA", "US", 47.2395, -122.516, 6687], ["West View", "PA", "US", 40.5223, -80.0342, 6685], ["Clifton Heights", "PA", "US", 39.9293, -75.2963, 6684], ["Flowery Branch", "GA", "US", 34.1851, -83.9252, 6683], ["Ettrick", "VA", "US", 37.2401, -77.43, 6682], ["Belfast", "ME", "US", 44.4259, -69.0064, 6682], ["Cedarhurst", "NY", "US", 40.6229, -73.7243, 6682], ["Seneca Falls", "NY", "US", 42.9106, -76.7966, 6681], ["Clairton", "PA", "US", 40.2923, -79.8817, 6681], ["Air Force Academy", "CO", "US", 38.9943, -104.8637, 6680], ["North Bend", "WA", "US", 47.4957, -121.7868, 6679], ["Eagle", "CO", "US", 39.6553, -106.8286, 6678], ["Plessisville", "QC", "CA", 46.2186, -71.762, 6677], ["Saint Gabriel", "LA", "US", 30.2577, -91.0993, 6677], ["Dillon", "SC", "US", 34.4166, -79.3712, 6677], ["Scottsburg", "IN", "US", 38.6856, -85.7703, 6674], ["Garden Home-Whitford", "OR", "US", 45.464, -122.7589, 6674], ["South Hill", "NY", "US", 42.4292, -76.4949, 6673], ["Oak Ridge", "NC", "US", 36.1735, -79.9889, 6671], ["Carbondale", "CO", "US", 39.4022, -107.2112, 6670], ["Trinity", "NC", "US", 35.8946, -79.9909, 6669], ["Valley City", "ND", "US", 46.9233, -98.0032, 6669], ["Torrington", "WY", "US", 42.0625, -104.1844, 6669], ["Welcome", "SC", "US", 34.8265, -82.439, 6668], ["Normandy Park", "WA", "US", 47.4362, -122.3407, 6668], ["Greenville", "IL", "US", 38.8923, -89.4131, 6666], ["Noble", "OK", "US", 35.1392, -97.3948, 6666], ["East Rochester", "NY", "US", 43.1087, -77.4875, 6666], ["East Shoreham", "NY", "US", 40.9448, -72.8795, 6666], ["North Riverside", "IL", "US", 41.8428, -87.8231, 6665], ["Brownsburg-Chatham", "QC", "CA", 45.6834, -74.4159, 6664], ["Madras", "OR", "US", 44.6335, -121.1295, 6662], ["North Caldwell", "NJ", "US", 40.8648, -74.2582, 6661], ["Ancient Oaks", "PA", "US", 40.5473, -75.5893, 6661], ["Opp", "AL", "US", 31.2827, -86.2555, 6658], ["Litchfield", "MN", "US", 45.1272, -94.528, 6657], ["Ponoka", "AB", "CA", 52.6768, -113.5815, 6656], ["Boyes Hot Springs", "CA", "US", 38.3138, -122.4819, 6656], ["Brier", "WA", "US", 47.7845, -122.2743, 6656], ["Glen Oaks", "NY", "US", 40.7471, -73.7115, 6655], ["Wollochet", "WA", "US", 47.2687, -122.584, 6651], ["Hapeville", "GA", "US", 33.6601, -84.4102, 6650], ["Pea Ridge", "WV", "US", 38.414, -82.3199, 6650], ["Montevallo", "AL", "US", 33.1007, -86.8642, 6648], ["Pingree Grove", "IL", "US", 42.0686, -88.4134, 6648], ["Elsa", "TX", "US", 26.2934, -97.9931, 6647], ["Thermalito", "CA", "US", 39.5113, -121.5869, 6646], ["Tuckahoe", "NY", "US", 40.9504, -73.8274, 6643], ["Viera West", "FL", "US", 28.245, -80.7338, 6641], ["Airway Heights", "WA", "US", 47.6446, -117.5933, 6639], ["Folcroft", "PA", "US", 39.8909, -75.2838, 6637], ["Tecumseh", "OK", "US", 35.2578, -96.9367, 6630], ["Barnesville", "GA", "US", 33.0546, -84.1557, 6625], ["Elmendorf Air Force Base", "AK", "US", 61.257, -149.6314, 6621], ["North Vernon", "IN", "US", 39.0062, -85.6236, 6619], ["Green Hill", "TN", "US", 36.2228, -86.5494, 6618], ["Buena Vista", "VA", "US", 37.7343, -79.3539, 6618], ["East Glenville", "NY", "US", 42.8945, -73.9279, 6616], ["Horseheads", "NY", "US", 42.167, -76.8205, 6616], ["Farr West", "UT", "US", 41.2972, -112.0277, 6616], ["Oneonta", "AL", "US", 33.9481, -86.4728, 6615], ["Wharton", "NJ", "US", 40.8931, -74.5818, 6613], ["Tappan", "NY", "US", 41.022, -73.9474, 6613], ["Youngtown", "AZ", "US", 33.5939, -112.3029, 6613], ["Batesville", "IN", "US", 39.3, -85.2222, 6611], ["Old Greenwich", "CT", "US", 41.0229, -73.5649, 6611], ["Gleneagle", "CO", "US", 39.0453, -104.8244, 6611], ["California", "PA", "US", 40.0656, -79.8917, 6608], ["Irvington", "NY", "US", 41.0392, -73.8682, 6607], ["Lacy-Lakeview", "TX", "US", 31.6293, -97.1028, 6604], ["Emmett", "ID", "US", 43.8735, -116.4993, 6604], ["Springs", "NY", "US", 41.0162, -72.1592, 6592], ["Wildwood", "FL", "US", 28.8654, -82.0406, 6590], ["Middlebury (village)", "VT", "US", 44.0155, -73.1694, 6588], ["Shields", "MI", "US", 43.4153, -84.0564, 6587], ["Centerville", "SC", "US", 34.532, -82.704, 6586], ["Strasburg", "VA", "US", 38.9887, -78.3586, 6586], ["Saint John", "MO", "US", 38.7148, -90.3463, 6584], ["Carrollton", "MI", "US", 43.4586, -83.9303, 6583], ["Forest Glen", "MD", "US", 39.0145, -77.0547, 6582], ["Los Fresnos", "TX", "US", 26.0717, -97.4764, 6582], ["Gridley", "CA", "US", 39.3638, -121.6936, 6582], ["Rittman", "OH", "US", 40.9781, -81.7821, 6580], ["Roslyn Heights", "NY", "US", 40.7887, -73.6474, 6577], ["Lake Shore", "WA", "US", 45.6907, -122.6909, 6571], ["Canton", "NY", "US", 44.5956, -75.1691, 6570], ["Cochituate", "MA", "US", 42.3209, -71.3642, 6569], ["Mont-Joli", "QC", "CA", 48.5839, -68.1921, 6568], ["Siesta Key", "FL", "US", 27.2678, -82.5453, 6565], ["Richboro", "PA", "US", 40.2151, -75.0107, 6563], ["Bedford", "VA", "US", 37.3343, -79.5231, 6561], ["Lawrence", "NY", "US", 40.6157, -73.7296, 6559], ["Abilene", "KS", "US", 38.9172, -97.2139, 6558], ["Hillsboro", "OH", "US", 39.2023, -83.6116, 6557], ["Crockett", "TX", "US", 31.3182, -95.4566, 6554], ["West Slope", "OR", "US", 45.4987, -122.7645, 6554], ["Southeast Arcadia", "FL", "US", 27.1863, -81.8521, 6554], ["Henderson", "TN", "US", 35.4392, -88.6414, 6552], ["Mount Vernon", "IN", "US", 37.9323, -87.895, 6550], ["Lago Vista", "TX", "US", 30.4602, -97.9883, 6550], ["Unionville", "NC", "US", 35.0874, -80.509, 6547], ["Ellettsville", "IN", "US", 39.2339, -86.625, 6544], ["Inverness Highlands South", "FL", "US", 28.8006, -82.3371, 6542], ["Seaside", "OR", "US", 45.9932, -123.9226, 6540], ["Silver Springs Shores", "FL", "US", 29.1044, -82.0206, 6539], ["Cherry Hills Village", "CO", "US", 39.6416, -104.9594, 6539], ["Geneseo", "IL", "US", 41.4481, -90.1543, 6538], ["Laurence Harbor", "NJ", "US", 40.4568, -74.2465, 6536], ["Yorketown", "NJ", "US", 40.3079, -74.3376, 6535], ["Lake Hallie", "WI", "US", 44.8758, -91.4407, 6535], ["Saint Joseph", "MN", "US", 45.565, -94.3183, 6534], ["Douglas", "WY", "US", 42.7597, -105.3822, 6531], ["Eliot", "ME", "US", 43.1531, -70.8001, 6528], ["Rocky Mountain House", "AB", "CA", 52.3668, -114.9188, 6527], ["Upper Sandusky", "OH", "US", 40.8273, -83.2813, 6527], ["Catasauqua", "PA", "US", 40.6548, -75.4746, 6525], ["Lincoln", "AL", "US", 33.6132, -86.1183, 6524], ["New Milford", "CT", "US", 41.577, -73.4085, 6523], ["Decatur", "TX", "US", 33.2343, -97.5861, 6521], ["Eatonton", "GA", "US", 33.3268, -83.3885, 6520], ["Boyette", "FL", "US", 27.8175, -82.2226, 6518], ["Belle Haven", "VA", "US", 38.7854, -77.063, 6518], ["Kimberley", "BC", "CA", 49.6707, -115.9776, 6513], ["Rossford", "OH", "US", 41.6098, -83.5644, 6512], ["Calverton", "NY", "US", 40.9065, -72.7434, 6510], ["Riverside", "MD", "US", 39.1734, -76.8852, 6507], ["Monticello", "NY", "US", 41.6557, -74.6893, 6505], ["Ambler", "PA", "US", 40.1546, -75.2216, 6505], ["Avon", "CO", "US", 39.6314, -106.5222, 6505], ["Lutherville", "MD", "US", 39.4212, -76.6261, 6504], ["Washington", "NJ", "US", 40.7584, -74.9793, 6498], ["Ladera Heights", "CA", "US", 33.9942, -118.3753, 6498], ["Champion Heights", "OH", "US", 41.29, -80.846, 6498], ["Vandenberg Village", "CA", "US", 34.7083, -120.4677, 6497], ["De Soto", "MO", "US", 38.1395, -90.5551, 6495], ["Rockaway", "NJ", "US", 40.9012, -74.5143, 6494], ["Hurricane", "WV", "US", 38.4326, -82.0201, 6493], ["Collinsville", "OK", "US", 36.3645, -95.8389, 6492], ["Johnson Lane", "NV", "US", 39.048, -119.7221, 6490], ["Macclenny", "FL", "US", 30.2822, -82.1221, 6487], ["Lovejoy", "GA", "US", 33.4362, -84.3144, 6487], ["Cheverly", "MD", "US", 38.9282, -76.9158, 6485], ["Kentfield", "CA", "US", 37.9522, -122.5572, 6485], ["East Farmingdale", "NY", "US", 40.7293, -73.4168, 6484], ["Medfield", "MA", "US", 42.1876, -71.3064, 6483], ["Ishpeming", "MI", "US", 46.4885, -87.6676, 6483], ["Prospect Park", "PA", "US", 39.8879, -75.3082, 6481], ["Castroville", "CA", "US", 36.7658, -121.758, 6481], ["Belpre", "OH", "US", 39.274, -81.5729, 6476], ["Brookings", "OR", "US", 42.0526, -124.284, 6476], ["Fort Pierce North", "FL", "US", 27.4736, -80.3593, 6474], ["Spring Lake Park", "MN", "US", 45.1077, -93.238, 6473], ["Milford", "MI", "US", 42.5936, -83.5994, 6472], ["Plattsmouth", "NE", "US", 41.0114, -95.8822, 6462], ["Powell", "WY", "US", 44.7538, -108.7574, 6462], ["Union", "OH", "US", 39.8978, -84.3063, 6461], ["Lauderdale-by-the-Sea", "FL", "US", 26.192, -80.0964, 6460], ["Ridgefield", "WA", "US", 45.8151, -122.7426, 6455], ["Lihue", "HI", "US", 21.9812, -159.3721, 6455], ["Thurmont", "MD", "US", 39.6237, -77.4108, 6454], ["Hamlet", "NC", "US", 34.8849, -79.6942, 6454], ["Lanett", "AL", "US", 32.8687, -85.1905, 6452], ["Kula", "HI", "US", 20.7909, -156.327, 6452], ["Nibley", "UT", "US", 41.6744, -111.833, 6451], ["Bethel", "AK", "US", 60.7922, -161.7558, 6450], ["Covedale", "OH", "US", 39.1212, -84.6063, 6447], ["Geneva", "OH", "US", 39.662, -82.4335, 6447], ["Nuevo", "CA", "US", 33.8014, -117.1459, 6447], ["Mattydale", "NY", "US", 43.0978, -76.1452, 6446], ["Forest Hills", "PA", "US", 40.4198, -79.85, 6443], ["Oakmont", "PA", "US", 40.5217, -79.8423, 6443], ["Sudden Valley", "WA", "US", 48.7229, -122.3465, 6441], ["Pocahontas", "AR", "US", 36.2615, -90.9712, 6438], ["Bronxville", "NY", "US", 40.9382, -73.8321, 6438], ["Wheelersburg", "OH", "US", 38.7304, -82.8555, 6437], ["Landing", "NJ", "US", 40.9051, -74.6652, 6436], ["Hudson", "NY", "US", 42.2529, -73.791, 6436], ["Kermit", "TX", "US", 31.8576, -103.0927, 6434], ["South Monroe", "MI", "US", 41.8959, -83.4177, 6433], ["Gladewater", "TX", "US", 32.5365, -94.9427, 6432], ["Exeter", "RI", "US", 41.5776, -71.5376, 6426], ["Riverside", "MD", "US", 39.4737, -76.2413, 6425], ["Solvay", "NY", "US", 43.0581, -76.2074, 6425], ["Cynthiana", "KY", "US", 38.3903, -84.2941, 6423], ["Whitmore Lake", "MI", "US", 42.4397, -83.7453, 6423], ["Corry", "PA", "US", 41.9203, -79.6403, 6420], ["Monument", "CO", "US", 39.0917, -104.8728, 6420], ["Hillsborough", "NC", "US", 36.0754, -79.0997, 6415], ["Talent", "OR", "US", 42.2457, -122.7887, 6411], ["Riverton", "WA", "US", 47.4843, -122.2946, 6407], ["Holtville", "CA", "US", 32.8112, -115.3803, 6404], ["Inwood", "FL", "US", 28.037, -81.7651, 6403], ["Sealy", "TX", "US", 29.7808, -96.1572, 6403], ["Pointe-Calumet", "QC", "CA", 45.5001, -73.9659, 6396], ["Morden", "MB", "CA", 49.1919, -98.1014, 6395], ["Dahlonega", "GA", "US", 34.5326, -83.9849, 6394], ["Waveland", "MS", "US", 30.2869, -89.3762, 6391], ["Milliken", "CO", "US", 40.3294, -104.8552, 6388], ["Camp Swift", "TX", "US", 30.1908, -97.2922, 6383], ["Bartonville", "IL", "US", 40.6503, -89.6521, 6382], ["Bridgeport", "TX", "US", 33.2101, -97.7548, 6381], ["Eudora", "KS", "US", 38.9433, -95.0986, 6378], ["Mattapoisett", "MA", "US", 41.6584, -70.8161, 6378], ["Wimauma", "FL", "US", 27.7125, -82.299, 6373], ["Moraine", "OH", "US", 39.7062, -84.2194, 6373], ["Purcell", "OK", "US", 35.0137, -97.3611, 6370], ["Prairie View", "TX", "US", 30.0933, -95.9877, 6369], ["Cherry Valley", "CA", "US", 33.9725, -116.9772, 6362], ["Hampstead", "MD", "US", 39.6048, -76.85, 6359], ["Bremen", "GA", "US", 33.7212, -85.1455, 6355], ["Everman", "TX", "US", 32.631, -97.2892, 6352], ["Bellwood", "VA", "US", 37.4218, -77.4375, 6352], ["Howland Center", "OH", "US", 41.2512, -80.7454, 6351], ["Woodfin", "NC", "US", 35.6334, -82.5821, 6349], ["Pelican Bay", "FL", "US", 26.2312, -81.8056, 6346], ["White Oak", "TX", "US", 32.5279, -94.8613, 6345], ["Iowa Park", "TX", "US", 33.9515, -98.6687, 6344], ["Garrett", "IN", "US", 41.3495, -85.1355, 6344], ["Eastwood", "MI", "US", 42.3031, -85.5503, 6340], ["Huntington Woods", "MI", "US", 42.4806, -83.1669, 6340], ["Edinboro", "PA", "US", 41.8742, -80.1317, 6335], ["Metropolis", "IL", "US", 37.1512, -88.732, 6334], ["Woodlawn", "MD", "US", 38.9496, -76.8914, 6334], ["Blakely", "PA", "US", 41.4809, -75.5946, 6334], ["Linglestown", "PA", "US", 40.334, -76.7891, 6334], ["Pembroke Park", "FL", "US", 25.9879, -80.1748, 6333], ["Leesville", "LA", "US", 31.1435, -93.261, 6333], ["Arlington Heights", "PA", "US", 40.9901, -75.2163, 6333], ["Kathleen", "FL", "US", 28.1209, -82.0231, 6332], ["Glenarden", "MD", "US", 38.9293, -76.8616, 6326], ["Clarkston Heights-Vineland", "WA", "US", 46.3874, -117.083, 6326], ["Roseland", "CA", "US", 38.4221, -122.728, 6325], ["Gulf Breeze", "FL", "US", 30.3571, -87.1639, 6323], ["Parry Sound", "ON", "CA", 45.3473, -80.0353, 6321], ["Red Lion", "PA", "US", 39.9009, -76.6058, 6321], ["Canutillo", "TX", "US", 31.9115, -106.6003, 6321], ["Walker", "LA", "US", 30.488, -90.8615, 6318], ["Coaldale", "AB", "CA", 49.7167, -112.6185, 6317], ["Mulvane", "KS", "US", 37.4745, -97.2439, 6314], ["Louisville", "MS", "US", 33.1237, -89.0551, 6314], ["Willis", "TX", "US", 30.4249, -95.4799, 6313], ["Johnsburg", "IL", "US", 42.38, -88.242, 6310], ["Selma", "NC", "US", 35.5365, -78.2844, 6307], ["Franklin", "PA", "US", 41.3978, -79.8314, 6302], ["Zuni Pueblo", "NM", "US", 35.0725, -108.8506, 6302], ["Valley Falls", "SC", "US", 35.0159, -81.9748, 6299], ["Plain City", "UT", "US", 41.298, -112.0861, 6299], ["Skowhegan", "ME", "US", 44.7651, -69.7192, 6297], ["Parkville", "MO", "US", 39.195, -94.6822, 6296], ["Homeland Park", "SC", "US", 34.4707, -82.6707, 6296], ["Summerland", "BC", "CA", 49.5998, -119.6691, 6292], ["Bee Cave", "TX", "US", 30.3085, -97.945, 6292], ["Columbiana", "OH", "US", 40.8884, -80.694, 6291], ["Rolesville", "NC", "US", 35.9232, -78.4575, 6289], ["Wendell", "NC", "US", 35.781, -78.3697, 6285], ["Dighton", "MA", "US", 41.814, -71.1203, 6283], ["Marble Falls", "TX", "US", 30.5784, -98.2751, 6281], ["South Williamsport", "PA", "US", 41.232, -76.9991, 6281], ["Carlstadt", "NJ", "US", 40.8404, -74.0907, 6279], ["Stephenville", "NL", "CA", 48.55, -58.5818, 6278], ["Knottsville", "KY", "US", 37.7717, -86.9042, 6270], ["Fowler", "CA", "US", 36.6305, -119.6785, 6266], ["Enoch", "UT", "US", 37.7733, -113.0244, 6265], ["Amqui", "QC", "CA", 48.4638, -67.4313, 6261], ["Red Chute", "LA", "US", 32.556, -93.6132, 6261], ["Clyde", "OH", "US", 41.3042, -82.9752, 6260], ["Estes Park", "CO", "US", 40.3772, -105.5217, 6257], ["Shrewsbury", "MO", "US", 38.5903, -90.3368, 6254], ["Kodiak", "AK", "US", 57.7885, -152.4053, 6253], ["Bellefonte", "PA", "US", 40.9134, -77.7783, 6248], ["Wilmore", "KY", "US", 37.862, -84.6616, 6247], ["Merrimac", "MA", "US", 42.8306, -71.0023, 6245], ["Jackson", "OH", "US", 39.052, -82.6365, 6243], ["Danville", "AL", "US", 34.4145, -87.0875, 6242], ["Ramtown", "NJ", "US", 40.121, -74.1437, 6242], ["Burnet", "TX", "US", 30.7582, -98.2284, 6239], ["Margate City", "NJ", "US", 39.3279, -74.5035, 6237], ["East Aurora", "NY", "US", 42.7678, -78.6134, 6236], ["Dunlap", "IN", "US", 41.6378, -85.9217, 6235], ["Ben Lomond", "CA", "US", 37.0891, -122.0863, 6234], ["Eldridge", "IA", "US", 41.6581, -90.5846, 6232], ["Columbia", "MS", "US", 31.2518, -89.8376, 6229], ["Conley", "GA", "US", 33.6448, -84.3258, 6228], ["Cullowhee", "NC", "US", 35.3137, -83.1765, 6228], ["Beauceville", "QC", "CA", 46.2178, -70.7787, 6226], ["Chillicothe", "IL", "US", 40.9223, -89.4862, 6226], ["Kingston", "NH", "US", 42.9365, -71.0534, 6225], ["Harriman", "TN", "US", 35.934, -84.5524, 6224], ["Mila Doce", "TX", "US", 26.2262, -97.9589, 6222], ["Harrisville", "UT", "US", 41.2813, -111.9883, 6221], ["Hobart", "WA", "US", 47.4218, -121.9729, 6221], ["Indian River Estates", "FL", "US", 27.3645, -80.3098, 6220], ["Aptos", "CA", "US", 36.9772, -121.8994, 6220], ["Otis Orchards-East Farms", "WA", "US", 47.7099, -117.0798, 6220], ["Salem", "IN", "US", 38.6056, -86.1011, 6217], ["Swarthmore", "PA", "US", 39.9021, -75.3499, 6211], ["Steilacoom", "WA", "US", 47.1698, -122.6026, 6211], ["Tarrant", "AL", "US", 33.5834, -86.7728, 6210], ["East Garden City", "NY", "US", 40.7308, -73.5981, 6208], ["Pepper Pike", "OH", "US", 41.4784, -81.4637, 6204], ["New Dorp Beach", "NY", "US", 40.5654, -74.1029, 6201], ["Green Knoll", "NJ", "US", 40.6001, -74.6121, 6200], ["Orange City", "IA", "US", 43.0072, -96.0584, 6198], ["Saint-Joseph-du-Lac", "QC", "CA", 45.5334, -73.9992, 6195], ["Saint Johnsbury", "VT", "US", 44.4192, -72.0151, 6193], ["Lionville", "PA", "US", 40.0537, -75.6599, 6189], ["Raton", "NM", "US", 36.9034, -104.4391, 6187], ["Portland", "IN", "US", 40.4345, -84.9778, 6186], ["Satsuma", "AL", "US", 30.8532, -88.0561, 6182], ["Marvin", "NC", "US", 34.9918, -80.8148, 6181], ["Keene", "TX", "US", 32.3968, -97.3239, 6181], ["Boonville", "IN", "US", 38.0492, -87.2742, 6180], ["Inniswold", "LA", "US", 30.4049, -91.0834, 6180], ["Goddard", "MD", "US", 38.9896, -76.8533, 6177], ["Plymouth Meeting", "PA", "US", 40.1023, -75.2743, 6177], ["Guadalupe", "AZ", "US", 33.3709, -111.9629, 6177], ["Saint Augustine Beach", "FL", "US", 29.8505, -81.2653, 6176], ["East Alton", "IL", "US", 38.8803, -90.1112, 6176], ["Princeton", "KY", "US", 37.1092, -87.882, 6174], ["Braidwood", "IL", "US", 41.265, -88.2123, 6172], ["Elm Grove", "WI", "US", 43.0431, -88.079, 6172], ["Pigeon Forge", "TN", "US", 35.7884, -83.5543, 6171], ["Schuyler", "NE", "US", 41.4472, -97.0595, 6171], ["Cold Spring", "KY", "US", 39.0217, -84.4399, 6170], ["Ware", "MA", "US", 42.2598, -72.2398, 6170], ["Holly", "MI", "US", 42.792, -83.6277, 6169], ["Kennett Square", "PA", "US", 39.8468, -75.7116, 6167], ["Northborough", "MA", "US", 42.3195, -71.6412, 6167], ["Grafton", "OH", "US", 41.2726, -82.0546, 6165], ["Jamul", "CA", "US", 32.717, -116.8761, 6163], ["International Falls", "MN", "US", 48.6011, -93.411, 6158], ["Darlington", "SC", "US", 34.2999, -79.8762, 6155], ["Sky Lake", "FL", "US", 28.4572, -81.3915, 6153], ["Oelwein", "IA", "US", 42.6733, -91.9135, 6153], ["Pauls Valley", "OK", "US", 34.7401, -97.2223, 6152], ["Aztec", "NM", "US", 36.8222, -107.9929, 6147], ["Village of Oak Creek (Big Park)", "AZ", "US", 34.7809, -111.7623, 6147], ["Elsmere", "DE", "US", 39.7393, -75.598, 6146], ["Miramar Beach", "FL", "US", 30.3744, -86.3586, 6146], ["Sooke", "BC", "CA", 48.3746, -123.7276, 6145], ["District Heights", "MD", "US", 38.8576, -76.8894, 6144], ["East Pasadena", "CA", "US", 34.1381, -118.0738, 6144], ["Groveland", "MA", "US", 42.7604, -71.0315, 6143], ["L\u0101\u2018ie", "HI", "US", 21.6455, -157.9225, 6138], ["Carolina Beach", "NC", "US", 34.0352, -77.8936, 6137], ["Lincroft", "NJ", "US", 40.3307, -74.121, 6135], ["West Greenwich", "RI", "US", 41.637, -71.66, 6135], ["Rockford", "MI", "US", 43.12, -85.56, 6134], ["Lynchburg", "TN", "US", 35.2831, -86.3742, 6132], ["Larchmont", "NY", "US", 40.9279, -73.7518, 6132], ["Theodore", "AL", "US", 30.5477, -88.1753, 6130], ["Hampshire", "IL", "US", 42.0978, -88.5304, 6130], ["Eldorado at Santa Fe", "NM", "US", 35.5264, -105.9347, 6130], ["Iqaluit", "NU", "CA", 63.747, -68.5173, 6124], ["Orlovista", "FL", "US", 28.5383, -81.4604, 6123], ["Kasson", "MN", "US", 44.03, -92.7507, 6123], ["Brunswick", "MD", "US", 39.3143, -77.6278, 6116], ["Saint Martinville", "LA", "US", 30.1252, -91.8334, 6114], ["Ontario", "OH", "US", 40.7595, -82.5902, 6111], ["Enola", "PA", "US", 40.2901, -76.9339, 6111], ["Monroeville", "AL", "US", 31.5279, -87.3247, 6110], ["Stone Mountain", "GA", "US", 33.8082, -84.1702, 6109], ["Munford", "TN", "US", 35.4492, -89.8151, 6108], ["\u2018Ewa Villages", "HI", "US", 21.3413, -158.0397, 6108], ["Patterson", "LA", "US", 29.6933, -91.302, 6106], ["Monticello", "KY", "US", 37.9923, -84.5502, 6103], ["Oxford", "MA", "US", 42.1168, -71.8648, 6103], ["Twin Lakes", "CO", "US", 39.825, -105.0047, 6101], ["Childress", "TX", "US", 34.4265, -100.204, 6101], ["Osprey", "FL", "US", 27.1962, -82.4904, 6100], ["Drayton Valley", "AB", "CA", 53.2168, -114.9854, 6099], ["Ulysses", "KS", "US", 37.5814, -101.3552, 6097], ["Pimmit Hills", "VA", "US", 38.9129, -77.2008, 6094], ["Twin Lakes", "WI", "US", 42.5311, -88.2481, 6094], ["Sheridan", "OR", "US", 45.0993, -123.3948, 6094], ["Lucas Valley-Marinwood", "CA", "US", 38.0401, -122.5755, 6094], ["Monticello", "KY", "US", 36.8298, -84.8491, 6090], ["Littlefield", "TX", "US", 33.9173, -102.3249, 6090], ["Clarion", "PA", "US", 41.2148, -79.3853, 6089], ["Harvard", "MA", "US", 42.5001, -71.5828, 6085], ["Manistee", "MI", "US", 44.2445, -86.3243, 6084], ["Indiantown", "FL", "US", 27.0273, -80.4856, 6083], ["Latimer", "MS", "US", 30.5346, -88.8667, 6079], ["Truth or Consequences", "NM", "US", 33.1284, -107.2528, 6079], ["Rushville", "IN", "US", 39.6092, -85.4464, 6077], ["Jordan", "MN", "US", 44.6669, -93.6269, 6076], ["Gunnison", "CO", "US", 38.5458, -106.9253, 6076], ["De Soto", "KS", "US", 38.9792, -94.9686, 6074], ["Slaton", "TX", "US", 33.4373, -101.6435, 6072], ["Fruit Heights", "UT", "US", 41.0322, -111.9022, 6072], ["Pahokee", "FL", "US", 26.8201, -80.6653, 6071], ["Willows", "CA", "US", 39.5243, -122.1936, 6069], ["Blue Bell", "PA", "US", 40.1523, -75.2663, 6067], ["Joshua", "TX", "US", 32.4615, -97.3881, 6066], ["Rochester", "IN", "US", 41.0648, -86.2158, 6065], ["Willard", "OH", "US", 41.0531, -82.7263, 6063], ["Los Ranchos de Albuquerque", "NM", "US", 35.162, -106.6428, 6063], ["Farnham", "QC", "CA", 45.2834, -72.9824, 6061], ["The Pas", "MB", "CA", 53.8251, -101.2541, 6055], ["Red Lion", "PA", "US", 40.4806, -75.616, 6055], ["Bangor Trident Base", "WA", "US", 47.7227, -122.7145, 6054], ["Geneva", "OH", "US", 41.8051, -80.9481, 6051], ["Avra Valley", "AZ", "US", 32.4378, -111.3154, 6050], ["Sylvester", "GA", "US", 31.5309, -83.8369, 6049], ["Rindge", "NH", "US", 42.7512, -72.0098, 6049], ["Sunnyvale", "TX", "US", 32.7965, -96.5608, 6044], ["Hillandale", "MD", "US", 39.0265, -76.9741, 6043], ["Mount Healthy", "OH", "US", 39.2337, -84.5458, 6039], ["Sheridan", "CO", "US", 39.6469, -105.0253, 6039], ["East Falmouth", "MA", "US", 41.5784, -70.5586, 6038], ["Stewartville", "MN", "US", 43.8555, -92.4885, 6037], ["Las Flores", "CA", "US", 34.0372, -118.6359, 6037], ["Union Gap", "WA", "US", 46.5573, -120.4751, 6037], ["Bay Harbor Islands", "FL", "US", 25.8876, -80.1312, 6036], ["Huntingburg", "IN", "US", 38.2989, -86.955, 6035], ["Princeton", "WV", "US", 37.3662, -81.1026, 6035], ["Somerset", "PA", "US", 40.0084, -79.0781, 6032], ["Cambria", "CA", "US", 35.5641, -121.0807, 6032], ["Berthoud", "CO", "US", 40.3083, -105.0811, 6031], ["Kingsland", "TX", "US", 30.6582, -98.4406, 6030], ["Clearfield", "PA", "US", 41.0273, -78.4392, 6030], ["Saint-F\xE9lix-de-Valois", "QC", "CA", 46.1698, -73.4253, 6029], ["Fair Haven", "NJ", "US", 40.3607, -74.0382, 6029], ["Jamesburg", "NJ", "US", 40.3526, -74.4402, 6029], ["Independence", "IA", "US", 42.4686, -91.8893, 6028], ["West Concord", "MA", "US", 42.4584, -71.3953, 6028], ["Taylor", "PA", "US", 41.3948, -75.7066, 6025], ["Surfside", "FL", "US", 25.8784, -80.1256, 6024], ["Meridianville", "AL", "US", 34.8515, -86.5722, 6021], ["Yoakum", "TX", "US", 29.2877, -97.1519, 6016], ["Old Tappan", "NJ", "US", 41.0106, -73.9912, 6016], ["Lakemoor", "IL", "US", 42.3286, -88.199, 6015], ["Waupaca", "WI", "US", 44.358, -89.0859, 6014], ["Whitestown", "IN", "US", 39.9973, -86.3458, 6013], ["West Yarmouth", "MA", "US", 41.6501, -70.2411, 6012], ["Finley", "WA", "US", 46.154, -119.0339, 6012], ["Estherville", "IA", "US", 43.4016, -94.8328, 6011], ["Northville", "MI", "US", 42.4312, -83.4833, 6010], ["Lake Mohegan", "NY", "US", 41.3179, -73.8462, 6010], ["McKees Rocks", "PA", "US", 40.4656, -80.0656, 6010], ["West Haven", "OR", "US", 45.5176, -122.7695, 6009], ["Roanoke", "AL", "US", 33.1512, -85.3722, 6005], ["Stow", "MA", "US", 42.437, -71.5056, 6005], ["Bonnyville", "AB", "CA", 54.2668, -110.7351, 6003], ["Flin Flon", "MB", "CA", 54.767, -101.8743, 6002], ["Countryside", "IL", "US", 41.7828, -87.8781, 6002], ["Battlefield", "MO", "US", 37.1156, -93.3702, 6001], ["Ganges", "BC", "CA", 48.8534, -123.5003, 6e3], ["James Island", "SC", "US", 32.7237, -79.9628, 6e3], ["Albion", "NY", "US", 43.2465, -78.1936, 5998], ["Ralston", "NE", "US", 41.2053, -96.0425, 5994], ["Walkersville", "MD", "US", 39.4862, -77.3519, 5993], ["Posen", "IL", "US", 41.6317, -87.6814, 5992], ["Hartford City", "IN", "US", 40.4511, -85.37, 5992], ["Paulsboro", "NJ", "US", 39.8304, -75.2405, 5989], ["Maquoketa", "IA", "US", 42.0689, -90.6657, 5989], ["Gun Barrel City", "TX", "US", 32.3346, -96.1514, 5985], ["Milan", "MI", "US", 42.0853, -83.6824, 5983], ["Spring Hill", "KS", "US", 38.7431, -94.8255, 5981], ["Erwin", "TN", "US", 36.1451, -82.4168, 5979], ["Peoria Heights", "IL", "US", 40.7473, -89.574, 5979], ["Cut Off", "LA", "US", 29.5427, -90.3381, 5976], ["Fort Meade", "FL", "US", 27.7523, -81.8017, 5975], ["Cherryville", "NC", "US", 35.3787, -81.379, 5974], ["Medina", "MN", "US", 45.0352, -93.5825, 5973], ["Notre Dame", "IN", "US", 41.7002, -86.2379, 5973], ["North Manchester", "IN", "US", 41.0006, -85.7686, 5971], ["Las Flores", "CA", "US", 33.5881, -117.6267, 5971], ["Homeland", "CA", "US", 33.7431, -117.1092, 5969], ["Gas City", "IN", "US", 40.4873, -85.613, 5968], ["Naples Park", "FL", "US", 26.2617, -81.8093, 5967], ["Belmont", "VA", "US", 39.0648, -77.51, 5966], ["West Miami", "FL", "US", 25.7634, -80.2962, 5965], ["Villa Park", "CA", "US", 33.8145, -117.8131, 5964], ["South Valley Stream", "NY", "US", 40.6559, -73.7176, 5962], ["Marion", "VA", "US", 36.8348, -81.5148, 5957], ["Port Clinton", "OH", "US", 41.512, -82.9377, 5957], ["Chickasaw", "AL", "US", 30.7638, -88.0747, 5954], ["Prospect Park", "NJ", "US", 40.937, -74.1743, 5953], ["Alpine", "TX", "US", 30.3586, -103.6621, 5952], ["Silver Hill", "MD", "US", 38.8418, -76.9458, 5950], ["Du Quoin", "IL", "US", 38.0114, -89.2362, 5949], ["Yaphank", "NY", "US", 40.8368, -72.9171, 5945], ["Pontotoc", "MS", "US", 34.2479, -88.9987, 5944], ["Wailea", "HI", "US", 20.6897, -156.4419, 5938], ["Wesley Hills", "NY", "US", 41.1593, -74.0699, 5935], ["Colusa", "CA", "US", 39.2143, -122.0094, 5935], ["Steelton", "PA", "US", 40.2354, -76.8414, 5932], ["Sweetwater", "TN", "US", 35.6015, -84.461, 5931], ["Topsham", "ME", "US", 43.9276, -69.9759, 5931], ["Caruthersville", "MO", "US", 36.1931, -89.6556, 5930], ["Laveen", "AZ", "US", 33.3628, -112.1693, 5930], ["Hebron", "KY", "US", 39.0659, -84.7011, 5929], ["Glendale", "MO", "US", 38.5959, -90.3771, 5927], ["Rensselaer", "IN", "US", 40.9367, -87.1509, 5927], ["Cocoa West", "FL", "US", 28.3594, -80.7711, 5925], ["Progreso", "TX", "US", 26.0923, -97.9572, 5922], ["Hilton", "NY", "US", 43.2881, -77.7933, 5921], ["East Port Orchard", "WA", "US", 47.5234, -122.6243, 5919], ["Walpole", "MA", "US", 42.1418, -71.2495, 5918], ["Woodcliff Lake", "NJ", "US", 41.0234, -74.0665, 5917], ["Watchung", "NJ", "US", 40.6379, -74.451, 5916], ["Little Silver", "NJ", "US", 40.3368, -74.0471, 5913], ["Roseburg North", "OR", "US", 43.2645, -123.3033, 5912], ["West Hattiesburg", "MS", "US", 31.3191, -89.3751, 5909], ["Ramblewood", "NJ", "US", 39.9287, -74.9438, 5907], ["New Whiteland", "IN", "US", 39.5581, -86.0953, 5906], ["Brookville", "OH", "US", 39.8367, -84.4113, 5900], ["James City", "NC", "US", 35.0888, -77.0349, 5899], ["Charles Town", "WV", "US", 39.289, -77.8597, 5899], ["Attalla", "AL", "US", 34.0218, -86.0886, 5899], ["Norwood", "PA", "US", 39.8918, -75.2996, 5898], ["Carrizo Springs", "TX", "US", 28.5219, -99.8606, 5898], ["Heathrow", "FL", "US", 28.7633, -81.3722, 5896], ["Trenton", "MO", "US", 40.0789, -93.6166, 5896], ["Raleigh Hills", "OR", "US", 45.4807, -122.762, 5896], ["Robertsdale", "AL", "US", 30.5538, -87.7119, 5894], ["Bellevue", "KY", "US", 39.1065, -84.4788, 5892], ["Central City", "KY", "US", 37.2939, -87.1233, 5892], ["Tanglewilde-Thompson Place", "WA", "US", 47.0512, -122.7808, 5892], ["Tanglewilde", "WA", "US", 47.0515, -122.7824, 5892], ["Harrah", "OK", "US", 35.4895, -97.1636, 5891], ["Laurel Bay", "SC", "US", 32.4502, -80.7848, 5891], ["New Brighton", "PA", "US", 40.7303, -80.3101, 5891], ["Bridgewater", "VA", "US", 38.3821, -78.9767, 5889], ["Vancleave", "MS", "US", 30.5405, -88.6875, 5886], ["Fulshear", "TX", "US", 29.69, -95.8997, 5886], ["Lecanto", "FL", "US", 28.8516, -82.4876, 5882], ["Dickson City", "PA", "US", 41.4715, -75.6077, 5877], ["Roseland", "NJ", "US", 40.8207, -74.2938, 5876], ["Crafton", "PA", "US", 40.4351, -80.0662, 5876], ["South Patrick Shores", "FL", "US", 28.2022, -80.6095, 5875], ["Delano", "MN", "US", 45.0419, -93.7891, 5875], ["Lewistown", "MT", "US", 47.0625, -109.4282, 5874], ["Chesapeake Beach", "MD", "US", 38.6862, -76.5347, 5873], ["Wescosville", "PA", "US", 40.5668, -75.553, 5872], ["Yarmouth", "ME", "US", 43.8006, -70.1867, 5869], ["Norwood", "NJ", "US", 40.9982, -73.9618, 5869], ["Prosser", "WA", "US", 46.2068, -119.7689, 5869], ["Zephyrhills West", "FL", "US", 28.2308, -82.2056, 5865], ["Richmond", "MI", "US", 42.8092, -82.7558, 5864], ["Mount Zion", "IL", "US", 39.7714, -88.8742, 5862], ["Portland", "CT", "US", 41.5729, -72.6406, 5862], ["Punxsutawney", "PA", "US", 40.9437, -78.9709, 5861], ["Lee Acres", "NM", "US", 35.1487, -106.647, 5858], ["Lee Acres", "NM", "US", 36.6989, -108.0367, 5858], ["Plumas Lake", "CA", "US", 39.0207, -121.558, 5853], ["Port-Cartier", "QC", "CA", 50.0334, -66.8654, 5851], ["Dowagiac", "MI", "US", 41.9842, -86.1086, 5851], ["Orange Beach", "AL", "US", 30.2944, -87.5736, 5850], ["Berkley", "MA", "US", 41.8459, -71.0828, 5849], ["Kingston", "TN", "US", 35.8809, -84.5085, 5846], ["Junction City", "OR", "US", 44.2193, -123.2057, 5842], ["Woodland", "WA", "US", 45.9046, -122.744, 5842], ["Country Homes", "WA", "US", 47.7485, -117.4044, 5841], ["Gravenhurst", "ON", "CA", 44.9168, -79.3663, 5839], ["Buckner", "KY", "US", 38.3837, -85.44, 5837], ["Simsbury Center", "CT", "US", 41.8809, -72.8112, 5836], ["Plymouth", "PA", "US", 41.2404, -75.9446, 5832], ["High Springs", "FL", "US", 29.8269, -82.5968, 5831], ["Sandown", "NH", "US", 42.9287, -71.187, 5827], ["Medina", "NY", "US", 43.2201, -78.387, 5827], ["Hellertown", "PA", "US", 40.5795, -75.3407, 5824], ["Byron Center", "MI", "US", 42.8122, -85.7228, 5822], ["Heathcote", "NJ", "US", 40.3887, -74.5757, 5821], ["Louiseville", "QC", "CA", 46.2559, -72.9415, 5819], ["Bensley", "VA", "US", 37.4468, -77.4433, 5819], ["Greenville", "PA", "US", 41.4045, -80.3912, 5819], ["Branford Center", "CT", "US", 41.2774, -72.8151, 5819], ["Carterville", "IL", "US", 37.76, -89.0773, 5818], ["Meraux", "LA", "US", 29.9302, -89.9162, 5816], ["Charleston", "MO", "US", 36.9209, -89.3506, 5815], ["Manasquan", "NJ", "US", 40.1262, -74.0493, 5815], ["Saint Helena", "CA", "US", 38.5052, -122.4703, 5814], ["Ada", "OH", "US", 40.7695, -83.8227, 5811], ["Lucerne Valley", "CA", "US", 34.4439, -116.9678, 5811], ["Warren", "AR", "US", 33.6126, -92.0646, 5804], ["Shady Side", "MD", "US", 38.8418, -76.5122, 5803], ["Volney", "NY", "US", 43.3428, -76.3577, 5801], ["Fruitridge Pocket", "CA", "US", 38.5326, -121.4558, 5800], ["The Village of Indian Hill", "OH", "US", 39.1795, -84.3352, 5798], ["Lake Mills", "WI", "US", 43.0814, -88.9118, 5798], ["Ranchettes", "WY", "US", 41.2186, -104.7903, 5798], ["Tierra Buena", "CA", "US", 39.1488, -121.6669, 5797], ["DeFuniak Springs", "FL", "US", 30.721, -86.1152, 5795], ["Union", "KY", "US", 38.9459, -84.6805, 5795], ["Spring Ridge", "MD", "US", 39.4015, -77.3525, 5795], ["Windcrest", "TX", "US", 29.5155, -98.3803, 5794], ["Prospect Park", "NJ", "US", 40.2404, -74.7663, 5794], ["Edna", "TX", "US", 28.9786, -96.6461, 5792], ["Belvedere", "SC", "US", 33.531, -81.9448, 5792], ["Selinsgrove", "PA", "US", 40.799, -76.8622, 5792], ["Tellico Village", "TN", "US", 35.6832, -84.2552, 5791], ["Locust Grove", "GA", "US", 33.346, -84.1091, 5790], ["Boiling Spring Lakes", "NC", "US", 34.0305, -78.0672, 5789], ["Washingtonville", "NY", "US", 41.4279, -74.166, 5788], ["Cheshire Village", "CT", "US", 41.5026, -72.8995, 5786], ["Hollidaysburg", "PA", "US", 40.4273, -78.3889, 5784], ["Fort Wright", "KY", "US", 39.0517, -84.5341, 5781], ["Melfort", "SK", "CA", 52.8667, -104.6177, 5778], ["Cheraw", "SC", "US", 34.6977, -79.8834, 5778], ["Chadron", "NE", "US", 42.8294, -102.9999, 5775], ["Lewisburg", "PA", "US", 40.9645, -76.8844, 5774], ["McCordsville", "IN", "US", 39.9081, -85.9228, 5773], ["Belding", "MI", "US", 43.0978, -85.2289, 5769], ["Henryetta", "OK", "US", 35.4398, -95.9819, 5765], ["Luling", "TX", "US", 29.6805, -97.6475, 5764], ["Vine Grove", "KY", "US", 37.8101, -85.9814, 5760], ["Prairie du Chien", "WI", "US", 43.0517, -91.1412, 5757], ["Malone", "NY", "US", 44.8487, -74.2949, 5756], ["Gustine", "CA", "US", 37.2577, -120.9988, 5756], ["Jamestown", "RI", "US", 41.4971, -71.3673, 5755], ["Sandersville", "GA", "US", 32.9815, -82.8101, 5752], ["Moosic", "PA", "US", 41.3534, -75.7382, 5751], ["Holdenville", "OK", "US", 35.0804, -96.3992, 5750], ["Bay Harbor", "MI", "US", 45.3641, -85.0821, 5749], ["Elburn", "IL", "US", 41.8922, -88.4723, 5748], ["Southold", "NY", "US", 41.0648, -72.4262, 5748], ["Granville", "OH", "US", 40.0681, -82.5196, 5747], ["Centerville", "IA", "US", 42.0928, -93.9355, 5745], ["Clover", "SC", "US", 35.1112, -81.2265, 5744], ["Trooper", "PA", "US", 40.1498, -75.4018, 5744], ["South Oroville", "CA", "US", 39.4965, -121.5522, 5742], ["Solvang", "CA", "US", 34.5958, -120.1376, 5741], ["McRae", "GA", "US", 32.068, -82.9007, 5740], ["Taos", "NM", "US", 36.4072, -105.5731, 5740], ["Oceanport", "NJ", "US", 40.3182, -74.0151, 5739], ["Beardstown", "IL", "US", 40.0175, -90.4243, 5738], ["Groveport", "OH", "US", 39.8784, -82.8838, 5737], ["Grayson Valley", "AL", "US", 33.6482, -86.6394, 5736], ["Sinton", "TX", "US", 28.0367, -97.5092, 5736], ["Citra", "FL", "US", 29.4119, -82.1098, 5732], ["Loudon", "TN", "US", 35.7328, -84.3338, 5731], ["St. Paul", "AB", "CA", 53.9835, -111.2851, 5728], ["South Apopka", "FL", "US", 28.6619, -81.5095, 5728], ["Mount Carmel", "PA", "US", 40.797, -76.4119, 5728], ["Center", "TX", "US", 31.5107, -96.4247, 5727], ["Hutchins", "TX", "US", 32.6493, -96.713, 5727], ["Hillsboro", "IL", "US", 39.1613, -89.4954, 5726], ["White Rock", "NM", "US", 35.8275, -106.2039, 5725], ["Gulf Park Estates", "MS", "US", 30.3919, -88.7611, 5719], ["Petoskey", "MI", "US", 45.3733, -84.9553, 5719], ["Cumming", "GA", "US", 34.2073, -84.1402, 5718], ["Palmview", "TX", "US", 26.2334, -98.3709, 5715], ["South Tucson", "AZ", "US", 32.1995, -110.9684, 5715], ["Belmar", "NJ", "US", 40.1784, -74.0218, 5712], ["Spring Grove", "IL", "US", 42.4436, -88.2365, 5711], ["Sainte-Agathe-des-Monts", "QC", "CA", 46.0501, -74.2825, 5706], ["Rupert", "ID", "US", 42.6191, -113.6772, 5705], ["Waynesboro", "GA", "US", 33.0899, -82.0157, 5704], ["Sharon Hill", "PA", "US", 39.9065, -75.2716, 5702], ["Spencer", "MA", "US", 42.244, -71.9923, 5700], ["Ocean Shores", "WA", "US", 46.9737, -124.1563, 5699], ["Penn Wynne", "PA", "US", 39.9862, -75.2755, 5697], ["Belle Fourche", "SD", "US", 44.6714, -103.8521, 5696], ["Forest", "MS", "US", 32.3646, -89.4742, 5695], ["Willow Springs", "IL", "US", 41.7409, -87.8603, 5695], ["Wilmington", "IL", "US", 41.3078, -88.1467, 5694], ["Princeville", "QC", "CA", 46.1716, -71.8746, 5693], ["Bright", "IN", "US", 39.2184, -84.8561, 5693], ["New Carlisle", "OH", "US", 39.9362, -84.0255, 5693], ["Lindale", "TX", "US", 32.5157, -95.4094, 5692], ["Blauvelt", "NY", "US", 41.0634, -73.9576, 5689], ["South Gate Ridge", "FL", "US", 27.2864, -82.4968, 5688], ["Corunna", "ON", "CA", 42.8834, -82.4331, 5686], ["Kingston Estates", "NJ", "US", 39.9237, -74.9879, 5685], ["Moores Mill", "AL", "US", 34.844, -86.5183, 5682], ["Barnhart", "MO", "US", 38.3442, -90.3935, 5682], ["Deer Park", "OH", "US", 39.2053, -84.3947, 5682], ["Marlin", "TX", "US", 31.3063, -96.898, 5682], ["West Modesto", "CA", "US", 37.6175, -121.0391, 5682], ["Nazareth", "PA", "US", 40.7404, -75.3096, 5681], ["Lebanon", "KY", "US", 37.5698, -85.2527, 5680], ["Vegreville", "AB", "CA", 53.5001, -112.0518, 5678], ["Oreland", "PA", "US", 40.1184, -75.1777, 5678], ["Edgemoor", "DE", "US", 39.7501, -75.4996, 5677], ["Hopkinton", "NH", "US", 43.1915, -71.6753, 5676], ["Corona de Tucson", "AZ", "US", 31.9654, -110.7756, 5675], ["Lake Bluff", "IL", "US", 42.2789, -87.8342, 5674], ["La Ronge", "SK", "CA", 55.1001, -105.2842, 5671], ["Nicolet", "QC", "CA", 46.2168, -72.6158, 5669], ["Douglass Hills", "KY", "US", 38.2379, -85.5527, 5669], ["West Rancho Dominguez", "CA", "US", 33.8939, -118.2706, 5669], ["Snowflake", "AZ", "US", 34.5134, -110.0785, 5666], ["Fountainhead-Orchard Hills", "MD", "US", 39.6864, -77.719, 5666], ["Carlinville", "IL", "US", 39.2798, -89.8818, 5665], ["Briar", "TX", "US", 32.9951, -97.5428, 5665], ["Westville", "IN", "US", 41.5414, -86.9006, 5662], ["Richland", "NY", "US", 43.5695, -76.0477, 5661], ["Barberton", "WA", "US", 45.6932, -122.599, 5661], ["Covington", "VA", "US", 37.7935, -79.9939, 5658], ["Sharon", "MA", "US", 42.1237, -71.1787, 5658], ["Buckhannon", "WV", "US", 38.994, -80.232, 5657], ["Gardnerville", "NV", "US", 38.9413, -119.7496, 5656], ["Mena", "AR", "US", 34.5862, -94.2397, 5653], ["Morristown", "VT", "US", 44.5573, -72.6237, 5653], ["Pevely", "MO", "US", 38.2834, -90.3951, 5652], ["Rib Mountain", "WI", "US", 44.9128, -89.6754, 5651], ["Hingham", "MA", "US", 42.2418, -70.8898, 5650], ["Monaca", "PA", "US", 40.6873, -80.2715, 5649], ["Highland", "NY", "US", 41.7209, -73.9601, 5647], ["Vinita", "OK", "US", 36.6387, -95.1541, 5643], ["Ashburnham", "MA", "US", 42.6362, -71.9078, 5643], ["Pontoon Beach", "IL", "US", 38.7317, -90.0804, 5637], ["Bath", "NY", "US", 42.337, -77.3178, 5635], ["Lac-Brome", "QC", "CA", 45.2168, -72.5158, 5629], ["Tequesta", "FL", "US", 26.9681, -80.1286, 5629], ["Ashton-Sandy Spring", "MD", "US", 39.1498, -77.005, 5628], ["Indian Hills", "NV", "US", 39.086, -119.7841, 5627], ["Zeeland", "MI", "US", 42.8125, -86.0186, 5626], ["Foxborough", "MA", "US", 42.0654, -71.2478, 5625], ["Lakeview", "NY", "US", 42.432, -75.8655, 5625], ["Pawcatuck", "CT", "US", 41.3773, -71.8337, 5624], ["Silver Lakes", "CA", "US", 34.7456, -117.341, 5623], ["Marlow Heights", "MD", "US", 38.8334, -76.9516, 5618], ["Long Beach", "NC", "US", 33.9104, -78.1178, 5618], ["Rusk", "TX", "US", 31.796, -95.1502, 5618], ["Sterling", "AK", "US", 60.5372, -150.7647, 5617], ["Lakeview", "NY", "US", 40.6854, -73.6526, 5615], ["Big Stone Gap", "VA", "US", 36.8818, -82.7471, 5614], ["Potomac Mills", "VA", "US", 38.6459, -77.2942, 5614], ["Snyderville", "UT", "US", 40.6944, -111.5438, 5612], ["Bellaire", "NY", "US", 40.714, -73.754, 5610], ["Dresher", "PA", "US", 40.1409, -75.1668, 5610], ["Rockdale", "TX", "US", 30.6555, -97.0014, 5609], ["Lively", "ON", "CA", 46.4334, -81.1497, 5608], ["Okeechobee", "FL", "US", 27.2439, -80.8298, 5608], ["Pana", "IL", "US", 39.3889, -89.0801, 5607], ["Atlanta", "TX", "US", 33.1137, -94.1643, 5605], ["Sainte-Anne-des-Monts", "QC", "CA", 49.124, -66.4924, 5602], ["Keyes", "CA", "US", 37.5566, -120.9155, 5601], ["Marieville", "QC", "CA", 45.4334, -73.1659, 5600], ["Finderne", "NJ", "US", 40.5632, -74.5777, 5600], ["Silver Lake", "NC", "US", 34.1488, -77.9136, 5598], ["Gardiner", "ME", "US", 44.2301, -69.7753, 5597], ["Exeter", "PA", "US", 41.3206, -75.8191, 5596], ["Richmond", "MO", "US", 39.2786, -93.9769, 5595], ["Union Beach", "NJ", "US", 40.4465, -74.1782, 5595], ["Charlemagne", "QC", "CA", 45.7168, -73.4825, 5594], ["Pelham Manor", "NY", "US", 40.8954, -73.8071, 5594], ["Milton", "WI", "US", 42.7756, -88.944, 5593], ["West Hills", "NY", "US", 40.8162, -73.4323, 5592], ["Breckenridge", "TX", "US", 32.7557, -98.9023, 5590], ["Coraopolis", "PA", "US", 40.5184, -80.1667, 5590], ["Whiteville", "NC", "US", 34.3388, -78.7031, 5589], ["Woods Creek", "WA", "US", 47.8787, -121.8985, 5589], ["Salamanca", "NY", "US", 42.1578, -78.715, 5586], ["Gray", "LA", "US", 29.6977, -90.7865, 5584], ["Wadesboro", "NC", "US", 34.9682, -80.0767, 5584], ["West Samoset", "FL", "US", 27.4695, -82.5568, 5583], ["Three Points", "AZ", "US", 32.0767, -111.3137, 5581], ["Hidden Valley Lake", "CA", "US", 38.808, -122.5583, 5579], ["Combee Settlement", "FL", "US", 28.0584, -81.9054, 5577], ["Alma", "AR", "US", 35.4779, -94.2219, 5575], ["Weldon Spring", "MO", "US", 38.7134, -90.6893, 5575], ["Palmview South", "TX", "US", 26.2156, -98.3786, 5575], ["Paoli", "PA", "US", 40.0421, -75.4763, 5575], ["Perth", "ON", "CA", 44.9001, -76.2494, 5573], ["Jan-Phyl Village", "FL", "US", 28.0147, -81.7717, 5573], ["Princeville", "NS", "CA", 45.7668, -61.2985, 5571], ["Falcon Heights", "MN", "US", 44.9916, -93.1663, 5571], ["Greenwood", "MO", "US", 38.8517, -94.3438, 5569], ["Wayne", "NE", "US", 42.2306, -97.0178, 5569], ["Swartz Creek", "MI", "US", 42.9573, -83.8305, 5567], ["Greenacres", "CA", "US", 35.3833, -119.1098, 5566], ["Crozet", "VA", "US", 38.0696, -78.7006, 5565], ["Donnacona", "QC", "CA", 46.6804, -71.7239, 5564], ["Newberry", "FL", "US", 29.6464, -82.6065, 5564], ["Naples Manor", "FL", "US", 26.0887, -81.7262, 5562], ["Fussels Corner", "FL", "US", 28.0542, -81.8606, 5561], ["Holdrege", "NE", "US", 40.4403, -99.3698, 5561], ["Woodside", "CA", "US", 37.4299, -122.2539, 5561], ["Nephi", "UT", "US", 39.7102, -111.8363, 5560], ["Lake Fenton", "MI", "US", 42.8461, -83.7077, 5559], ["Shippensburg", "PA", "US", 40.0506, -77.5203, 5559], ["Corcoran", "MN", "US", 45.0952, -93.5475, 5552], ["Wappingers Falls", "NY", "US", 41.5965, -73.911, 5552], ["Gateway", "AK", "US", 61.5728, -149.2408, 5552], ["Ocean City", "FL", "US", 30.441, -86.6136, 5550], ["Brady", "TX", "US", 31.1352, -99.3351, 5549], ["Helena", "AR", "US", 34.5296, -90.5918, 5548], ["Bessemer City", "NC", "US", 35.2849, -81.284, 5548], ["Eastham", "MA", "US", 41.8301, -69.9739, 5548], ["Nurillo", "TX", "US", 26.267, -98.1214, 5547], ["Marbletown", "NY", "US", 41.8834, -74.1132, 5544], ["Alton North (historical)", "TX", "US", 26.2953, -98.3045, 5541], ["Grissom Air Force Base", "IN", "US", 40.6575, -86.1475, 5537], ["Duquesne", "PA", "US", 40.3815, -79.8598, 5535], ["Webster", "NY", "US", 43.2123, -77.43, 5534], ["Marksville", "LA", "US", 31.128, -92.0662, 5533], ["Litchfield Park", "AZ", "US", 33.4934, -112.3579, 5533], ["Morris Plains", "NJ", "US", 40.8218, -74.481, 5532], ["Edgerton", "WI", "US", 42.8353, -89.0676, 5532], ["Paola", "KS", "US", 38.5722, -94.8791, 5527], ["Jeanerette", "LA", "US", 29.911, -91.6634, 5527], ["Old Bethpage", "NY", "US", 40.7626, -73.4532, 5523], ["Lake Forest", "FL", "US", 25.9776, -80.1831, 5522], ["Glencoe", "MN", "US", 44.7691, -94.1516, 5521], ["Hamlin", "NY", "US", 43.3031, -77.9211, 5521], ["Minot Air Force Base", "ND", "US", 48.4209, -101.3391, 5521], ["Rochelle Park", "NJ", "US", 40.9073, -74.0751, 5518], ["Durham", "CA", "US", 39.6463, -121.8, 5518], ["Hightstown", "NJ", "US", 40.2696, -74.5232, 5517], ["Anthony", "TX", "US", 31.9993, -106.6055, 5517], ["West Side Highway", "WA", "US", 46.184, -122.9172, 5517], ["Adams", "MA", "US", 42.6243, -73.1176, 5515], ["Fairview", "NY", "US", 41.7237, -73.9199, 5515], ["Mayflower Village", "CA", "US", 34.115, -118.0098, 5515], ["Homer", "AK", "US", 59.6425, -151.5494, 5515], ["Crystal Lake", "FL", "US", 28.0356, -81.9084, 5514], ["Fellsmere", "FL", "US", 27.7678, -80.6014, 5514], ["Waterville", "OH", "US", 41.5009, -83.7183, 5514], ["Century City", "CA", "US", 34.0556, -118.4179, 5513], ["West Bountiful", "UT", "US", 40.8938, -111.9019, 5511], ["Monticello", "IL", "US", 40.0278, -88.5734, 5509], ["Williamston", "NC", "US", 35.8546, -77.0555, 5508], ["Centerport", "NY", "US", 40.8854, -73.3762, 5508], ["Harris Hill", "NY", "US", 42.9648, -78.6775, 5508], ["Richlands", "VA", "US", 37.0932, -81.7937, 5504], ["Germantown", "OH", "US", 39.6262, -84.3694, 5503], ["Pass Christian", "MS", "US", 30.3158, -89.2475, 5498], ["Wyndmoor", "PA", "US", 40.0812, -75.1893, 5498], ["Harrisburg", "SD", "US", 43.4314, -96.6973, 5498], ["Emporia", "VA", "US", 36.686, -77.5425, 5496], ["Lyndon", "VT", "US", 44.5142, -72.0109, 5496], ["Stettler", "AB", "CA", 52.3168, -112.7186, 5494], ["Wellston", "OH", "US", 39.1234, -82.5329, 5494], ["Elverta", "CA", "US", 38.7138, -121.4627, 5492], ["Glendive", "MT", "US", 47.1053, -104.7125, 5490], ["Coal City", "IL", "US", 41.2878, -88.2856, 5489], ["Rancho Murieta", "CA", "US", 38.5018, -121.0947, 5488], ["Fort Myers Shores", "FL", "US", 26.7092, -81.7459, 5487], ["Canal Fulton", "OH", "US", 40.8898, -81.5976, 5487], ["Chester", "SC", "US", 34.7049, -81.2143, 5486], ["Saint Clair", "MI", "US", 42.8209, -82.486, 5485], ["Northfield", "IL", "US", 42.0998, -87.7809, 5484], ["Lake Murray of Richland", "SC", "US", 34.1205, -81.2645, 5484], ["Southampton", "MA", "US", 42.2293, -72.7301, 5481], ["Robbins", "IL", "US", 41.6439, -87.7037, 5480], ["Lake Alfred", "FL", "US", 28.092, -81.7234, 5475], ["Mascotte", "FL", "US", 28.5783, -81.8868, 5473], ["Red Oak", "IA", "US", 41.0097, -95.2255, 5472], ["Hawkinsville", "GA", "US", 32.2838, -83.4721, 5471], ["Wake Village", "TX", "US", 33.4268, -94.1063, 5471], ["Iola", "KS", "US", 37.9245, -95.4, 5470], ["Algona", "IA", "US", 43.07, -94.233, 5470], ["Turner", "ME", "US", 44.2565, -70.2562, 5470], ["Anamosa", "IA", "US", 42.1083, -91.2852, 5469], ["Northwood", "OH", "US", 40.4728, -83.7324, 5469], ["Cumberland", "IN", "US", 39.7762, -85.9572, 5467], ["El Granada", "CA", "US", 37.5027, -122.4694, 5467], ["Salida", "CO", "US", 38.5347, -105.9989, 5467], ["Isanti", "MN", "US", 45.4902, -93.2477, 5464], ["Vail", "CO", "US", 39.6403, -106.3742, 5461], ["Nashville", "NC", "US", 35.9746, -77.9655, 5460], ["Somerdale", "NJ", "US", 39.844, -75.0227, 5460], ["Cameron", "TX", "US", 30.8532, -96.9769, 5460], ["Brush", "CO", "US", 40.2589, -103.6238, 5459], ["Gananoque", "ON", "CA", 44.3334, -76.1661, 5458], ["Centerport", "NY", "US", 43.0409, -76.5927, 5457], ["Chamberlayne", "VA", "US", 37.6265, -77.4286, 5456], ["Comstock Northwest", "MI", "US", 42.3218, -85.5176, 5455], ["Willard", "MO", "US", 37.3051, -93.4285, 5454], ["La Habra Heights", "CA", "US", 33.9609, -117.9506, 5454], ["Waimanalo", "HI", "US", 21.3461, -157.7238, 5451], ["Lebanon", "ME", "US", 43.3945, -70.8509, 5446], ["Fort Washington", "PA", "US", 40.1418, -75.2091, 5446], ["Los Chavez", "NM", "US", 34.7257, -106.7573, 5446], ["Connell", "WA", "US", 46.6635, -118.8611, 5446], ["North Hills", "NY", "US", 40.7809, -73.6765, 5444], ["Stroudsburg", "PA", "US", 40.9868, -75.1946, 5444], ["Batesburg-Leesville", "SC", "US", 33.9101, -81.5373, 5441], ["Saint-Pie", "QC", "CA", 45.5028, -72.9089, 5438], ["Smithers", "BC", "CA", 54.7804, -127.1743, 5438], ["Williamson", "AZ", "US", 34.69, -112.541, 5438], ["Macon", "MO", "US", 39.7423, -92.4727, 5436], ["Brewton", "AL", "US", 31.1052, -87.0722, 5434], ["Dayton", "KY", "US", 39.1128, -84.4727, 5433], ["New Holland", "PA", "US", 40.1018, -76.0852, 5430], ["Glasgow Village", "MO", "US", 38.7537, -90.1984, 5429], ["Mount Carmel", "TN", "US", 36.5454, -82.661, 5425], ["Rockwood", "TN", "US", 35.8656, -84.6849, 5425], ["Sayre", "PA", "US", 41.979, -76.5155, 5424], ["Berlin", "WI", "US", 43.968, -88.9434, 5420], ["Clarinda", "IA", "US", 40.7398, -95.038, 5418], ["South Hooksett", "NH", "US", 43.0265, -71.4353, 5418], ["Colby", "KS", "US", 39.3958, -101.0524, 5417], ["Manchester", "WA", "US", 47.5557, -122.5451, 5413], ["Paxtonia", "PA", "US", 40.3173, -76.7944, 5412], ["Sherwood Manor", "CT", "US", 42.0134, -72.5643, 5410], ["Windsor", "QC", "CA", 45.5668, -71.9991, 5408], ["White City", "UT", "US", 40.5658, -111.8644, 5407], ["Winfield", "IN", "US", 41.4053, -87.2753, 5406], ["Uhrichsville", "OH", "US", 40.3931, -81.3465, 5404], ["Englewood Cliffs", "NJ", "US", 40.8854, -73.9524, 5403], ["Basehor", "KS", "US", 39.1417, -94.9386, 5402], ["Brownsfield", "LA", "US", 30.5466, -91.1207, 5401], ["Diboll", "TX", "US", 31.1871, -94.781, 5400], ["Starke", "FL", "US", 29.9441, -82.1098, 5397], ["Aberdeen", "MS", "US", 33.8251, -88.5437, 5397], ["Goshen", "NY", "US", 41.402, -74.3243, 5397], ["Strawberry", "CA", "US", 37.8969, -122.5089, 5393], ["Winston", "OR", "US", 43.1223, -123.4126, 5393], ["Progress Village", "FL", "US", 27.9003, -82.3645, 5392], ["Lochbuie", "CO", "US", 40.0072, -104.7161, 5390], ["New Gloucester", "ME", "US", 43.9629, -70.2826, 5389], ["Islip Terrace", "NY", "US", 40.7431, -73.1926, 5389], ["Titusville", "PA", "US", 41.627, -79.6737, 5389], ["Bowling Green", "MO", "US", 39.342, -91.1951, 5388], ["Hidden Valley", "IN", "US", 39.1623, -84.843, 5387], ["Terryville", "CT", "US", 41.6782, -73.0109, 5387], ["Huntertown", "IN", "US", 41.2284, -85.1725, 5387], ["Timber Pines", "FL", "US", 28.4703, -82.6032, 5386], ["Pinckneyville", "IL", "US", 38.0803, -89.382, 5385], ["Oxford", "PA", "US", 39.7854, -75.9788, 5385], ["Fox Chapel", "PA", "US", 40.5134, -79.8798, 5383], ["New Castle", "DE", "US", 39.6621, -75.5663, 5382], ["Palermo", "CA", "US", 39.4354, -121.538, 5382], ["Wainwright", "AB", "CA", 52.8348, -110.8534, 5380], ["Suncook", "NH", "US", 43.1306, -71.4531, 5379], ["Mendon", "MA", "US", 42.1056, -71.5523, 5378], ["Eureka", "IL", "US", 40.7214, -89.2729, 5377], ["Perezville", "TX", "US", 26.2245, -98.4006, 5376], ["Petrolia", "ON", "CA", 42.8668, -82.1498, 5375], ["Ballston Spa", "NY", "US", 43.0009, -73.849, 5375], ["Waynesville", "MO", "US", 37.8287, -92.2007, 5374], ["Centerville", "IA", "US", 40.7342, -92.8741, 5372], ["Summit", "AZ", "US", 32.067, -110.9515, 5372], ["Worland", "WY", "US", 44.0169, -107.9554, 5372], ["Berryville", "AR", "US", 36.3648, -93.568, 5371], ["Manchester-by-the-Sea", "MA", "US", 42.5779, -70.7689, 5366], ["Stapleton", "NY", "US", 40.6265, -74.0776, 5365], ["Old Fig Garden", "CA", "US", 36.7989, -119.8051, 5365], ["Waldon", "CA", "US", 37.9263, -122.0555, 5364], ["Contra Costa Centre", "CA", "US", 37.9275, -122.0579, 5364], ["Media", "PA", "US", 39.9168, -75.3877, 5363], ["Wilton", "CA", "US", 38.4119, -121.2722, 5363], ["Waterford", "WI", "US", 42.7631, -88.2143, 5358], ["Ripley", "MS", "US", 34.7298, -88.9506, 5357], ["Tyrone", "PA", "US", 40.6706, -78.2386, 5353], ["Highwood", "IL", "US", 42.1998, -87.8092, 5352], ["Morris", "MN", "US", 45.5861, -95.9139, 5352], ["Fairport", "NY", "US", 43.0987, -77.4419, 5351], ["Zimmerman", "MN", "US", 45.4433, -93.59, 5350], ["Northwood", "OH", "US", 41.6073, -83.4688, 5350], ["Post", "TX", "US", 33.1912, -101.379, 5349], ["Wind Lake", "WI", "US", 42.8295, -88.1587, 5342], ["Hazard", "KY", "US", 37.2495, -83.1932, 5341], ["Cave Creek", "AZ", "US", 33.8333, -111.9508, 5341], ["Peace River", "AB", "CA", 56.2371, -117.2918, 5340], ["Stokesdale", "NC", "US", 36.2371, -79.9795, 5340], ["Cape May Court House", "NJ", "US", 39.0826, -74.8238, 5338], ["Nassau Village-Ratliff", "FL", "US", 30.5111, -81.8093, 5337], ["Manitou Springs", "CO", "US", 38.8597, -104.9172, 5334], ["Dacula", "GA", "US", 33.9887, -83.898, 5330], ["Calistoga", "CA", "US", 38.5788, -122.5797, 5330], ["Rothschild", "WI", "US", 44.8872, -89.6201, 5329], ["Byron", "MN", "US", 44.0327, -92.6455, 5328], ["Pumphrey", "MD", "US", 39.2173, -76.6372, 5322], ["Monticello", "IN", "US", 40.7453, -86.7647, 5322], ["Yarmouth Port", "MA", "US", 41.702, -70.2495, 5320], ["Weiser", "ID", "US", 44.251, -116.9693, 5317], ["Adel", "GA", "US", 31.1373, -83.4241, 5316], ["Spring Valley", "IL", "US", 41.3275, -89.1998, 5314], ["Poland", "ME", "US", 44.0606, -70.3937, 5314], ["Lehighton", "PA", "US", 40.8337, -75.7138, 5314], ["Eucalyptus Hills", "CA", "US", 32.8798, -116.9467, 5313], ["South Gastonia", "NC", "US", 35.2193, -81.2056, 5312], ["New Hempstead", "NY", "US", 41.1498, -74.0337, 5312], ["Palmerton", "PA", "US", 40.8014, -75.6119, 5305], ["Edgewater", "CO", "US", 39.753, -105.0641, 5302], ["Hardeeville", "SC", "US", 32.2871, -81.0807, 5301], ["Smiths Station", "AL", "US", 32.5401, -85.0986, 5300], ["Mount Arlington", "NJ", "US", 40.9259, -74.6349, 5300], ["Sussex", "NB", "CA", 45.7227, -65.5066, 5298], ["Mount Carmel", "TN", "US", 35.4978, -88.0078, 5298], ["Newmarket", "NH", "US", 43.0829, -70.9351, 5297], ["Greenbrier", "AR", "US", 35.234, -92.3876, 5296], ["McKenzie", "TN", "US", 36.1326, -88.5187, 5296], ["Silver Springs", "NV", "US", 39.4155, -119.2246, 5296], ["Pecan Plantation", "TX", "US", 32.3604, -97.6756, 5294], ["Williamsburg", "KY", "US", 36.7434, -84.1597, 5293], ["Hartsdale", "NY", "US", 41.019, -73.7982, 5293], ["Jonesborough", "TN", "US", 36.2943, -82.4735, 5291], ["Asbury", "IA", "US", 42.5144, -90.7515, 5291], ["Indian Wells", "CA", "US", 33.7179, -116.3431, 5289], ["Centerville", "SC", "US", 32.9957, -80.1704, 5288], ["Cahaba Heights", "AL", "US", 33.464, -86.7319, 5287], ["Terrell Hills", "TX", "US", 29.4749, -98.4509, 5287], ["Collegeville", "PA", "US", 40.1857, -75.4516, 5287], ["Boulevard Park", "WA", "US", 47.4893, -122.3151, 5287], ["Eastman", "GA", "US", 32.1977, -83.1776, 5285], ["Linton", "IN", "US", 39.0348, -87.1659, 5284], ["New Ipswich", "NH", "US", 42.7481, -71.8542, 5283], ["South Haven", "IN", "US", 41.542, -87.1373, 5282], ["Warrenton", "OR", "US", 46.1651, -123.9238, 5282], ["Harvest", "AL", "US", 34.8556, -86.7508, 5281], ["Harpswell Center", "ME", "US", 43.8017, -69.9842, 5281], ["Bliss Corner", "MA", "US", 41.6118, -70.9384, 5280], ["Oliver", "BC", "CA", 49.1831, -119.5524, 5279], ["Bluefield", "VA", "US", 37.2526, -81.2712, 5279], ["Saint Paul Park", "MN", "US", 44.8422, -92.9913, 5279], ["Walterboro", "SC", "US", 32.9052, -80.6668, 5278], ["Rye", "NH", "US", 43.0134, -70.7709, 5277], ["Big Flats", "NY", "US", 42.1373, -76.9369, 5277], ["Zephyrhills South", "FL", "US", 28.2149, -82.1887, 5276], ["Saranac Lake", "NY", "US", 44.3295, -74.1313, 5274], ["Creve Coeur", "IL", "US", 40.6473, -89.5912, 5272], ["Turtle Creek", "PA", "US", 40.4059, -79.8251, 5272], ["Meadow Lake", "SK", "CA", 54.1335, -108.4347, 5266], ["Schlusser", "PA", "US", 40.2418, -77.1769, 5265], ["Shillington", "PA", "US", 40.3079, -75.9655, 5265], ["Hampden", "MA", "US", 42.064, -72.4134, 5261], ["West Clarkston-Highland", "WA", "US", 46.4029, -117.064, 5261], ["Delhi Hills", "OH", "US", 39.0928, -84.6127, 5259], ["Carlisle", "OH", "US", 39.582, -84.3202, 5259], ["Fairfield", "IL", "US", 42.2192, -88.0615, 5255], ["Williamsville", "NY", "US", 42.9639, -78.7378, 5254], ["Palm Springs North", "FL", "US", 25.9351, -80.3338, 5253], ["Glenwood", "IA", "US", 41.0469, -95.7425, 5253], ["East Moriches", "NY", "US", 40.8051, -72.7609, 5249], ["Tonganoxie", "KS", "US", 39.1097, -95.0877, 5248], ["Woodstock", "VA", "US", 38.8818, -78.5058, 5248], ["Keyser", "WV", "US", 39.4409, -78.9739, 5248], ["Folkston", "GA", "US", 30.831, -82.0113, 5247], ["Scituate", "MA", "US", 42.1959, -70.7259, 5245], ["Forked River", "NJ", "US", 39.8398, -74.1901, 5244], ["Dove Valley", "CO", "US", 39.5777, -104.8294, 5243], ["Pea Ridge", "AR", "US", 36.454, -94.1152, 5242], ["De Witt", "IA", "US", 41.8234, -90.5382, 5242], ["Chester", "NH", "US", 42.9567, -71.2573, 5236], ["Waipi\u2018o Acres", "HI", "US", 21.4648, -158.0133, 5236], ["Moab", "UT", "US", 38.5733, -109.5498, 5235], ["Tracyton", "WA", "US", 47.609, -122.6551, 5233], ["Grosse Pointe", "MI", "US", 42.3862, -82.9119, 5232], ["Paulden", "AZ", "US", 34.8856, -112.4682, 5231], ["Schuylkill Haven", "PA", "US", 40.6307, -76.171, 5228], ["Evansville", "WI", "US", 42.7803, -89.2993, 5228], ["Devon", "AB", "CA", 53.3668, -113.7353, 5225], ["Eaton Rapids", "MI", "US", 42.5092, -84.6558, 5225], ["Hugo", "OK", "US", 34.0107, -95.5097, 5224], ["Midfield", "AL", "US", 33.4615, -86.9089, 5222], ["River Park", "FL", "US", 27.3142, -80.3473, 5222], ["Crossett", "AR", "US", 33.1282, -91.9612, 5220], ["Hoopeston", "IL", "US", 40.4673, -87.6684, 5220], ["Pine Island Ridge", "FL", "US", 26.0948, -80.2739, 5218], ["Concordia", "KS", "US", 39.5708, -97.6625, 5218], ["New Martinsville", "WV", "US", 39.6445, -80.8576, 5218], ["Floral City", "FL", "US", 28.75, -82.2968, 5217], ["Dumfries", "VA", "US", 38.5676, -77.328, 5217], ["Montevideo", "MN", "US", 44.948, -95.717, 5217], ["Fruitland", "MD", "US", 38.3221, -75.6202, 5215], ["Kennebunk", "ME", "US", 43.384, -70.5448, 5214], ["Lone Grove", "OK", "US", 34.1754, -97.2628, 5213], ["Marion", "MA", "US", 41.7001, -70.7628, 5213], ["Big Bear Lake", "CA", "US", 34.2439, -116.9114, 5213], ["Preston", "ID", "US", 42.0963, -111.8766, 5212], ["Center", "TX", "US", 31.7954, -94.1791, 5211], ["Oak Park", "IN", "US", 38.3056, -85.6963, 5209], ["Grambling", "LA", "US", 32.5277, -92.714, 5209], ["Richelieu", "QC", "CA", 45.4434, -73.246, 5208], ["Slinger", "WI", "US", 43.3336, -88.2862, 5208], ["Bisbee", "AZ", "US", 31.4481, -109.9284, 5208], ["Chelsea", "MI", "US", 42.3181, -84.0218, 5205], ["Berkeley", "IL", "US", 41.8889, -87.9034, 5203], ["Bangor", "PA", "US", 40.8657, -75.2066, 5203], ["Grandwood Park", "IL", "US", 42.3931, -87.9867, 5202], ["Saranap", "CA", "US", 37.8849, -122.0761, 5202], ["Poolesville", "MD", "US", 39.1459, -77.4169, 5201], ["Hutchinson Island South", "FL", "US", 27.2995, -80.2204, 5201], ["Camp Pendleton North", "CA", "US", 33.3147, -117.316, 5200], ["Creswell", "OR", "US", 43.9179, -123.0245, 5199], ["Rockingham", "VT", "US", 43.1876, -72.489, 5198], ["Glendale", "CO", "US", 39.705, -104.9336, 5198], ["Sainte-Anne-de-Bellevue", "QC", "CA", 45.4062, -73.9456, 5197], ["Nelsonville", "OH", "US", 39.4587, -82.2318, 5197], ["Orchard Homes", "MT", "US", 46.8633, -114.0484, 5197], ["Hilmar-Irwin", "CA", "US", 37.4045, -120.8504, 5197], ["Genoa", "IL", "US", 42.0973, -88.6929, 5196], ["Williams", "CA", "US", 39.1546, -122.1494, 5196], ["South Highpoint", "FL", "US", 27.917, -82.7129, 5195], ["Iowa Falls", "IA", "US", 42.5225, -93.2513, 5195], ["Mont Belvieu", "TX", "US", 29.8477, -94.8908, 5193], ["Springfield", "MI", "US", 42.3264, -85.2392, 5192], ["Abbeville", "SC", "US", 34.1782, -82.379, 5191], ["Kayenta", "AZ", "US", 36.7278, -110.2546, 5189], ["Rawdon", "QC", "CA", 46.0501, -73.7159, 5188], ["Wailua Homesteads", "HI", "US", 22.0724, -159.3768, 5188], ["Gilmer", "TX", "US", 32.7287, -94.9424, 5187], ["Prairie Grove", "AR", "US", 35.9759, -94.3177, 5186], ["Muleshoe", "TX", "US", 34.2265, -102.7238, 5185], ["Montr\xE9al-Ouest", "QC", "CA", 45.4529, -73.6492, 5184], ["Saint Clairsville", "OH", "US", 40.0806, -80.9001, 5184], ["Sunset", "UT", "US", 41.1363, -112.031, 5183], ["Albertson", "NY", "US", 40.7734, -73.6432, 5182], ["White Hall", "AR", "US", 34.274, -92.091, 5180], ["Alva", "OK", "US", 36.805, -98.6672, 5180], ["Odessa", "MO", "US", 38.9992, -93.9536, 5178], ["Chackbay", "LA", "US", 29.8835, -90.7973, 5177], ["Montrose-Ghent", "OH", "US", 41.1538, -81.6438, 5177], ["Winterset", "IA", "US", 41.3308, -94.0138, 5176], ["Monticello", "LA", "US", 30.4891, -91.0487, 5172], ["Livingston", "TX", "US", 30.711, -94.933, 5172], ["Bear Valley Springs", "CA", "US", 35.1591, -118.6284, 5172], ["Brookhaven", "WV", "US", 39.6118, -79.9045, 5171], ["Layhill", "MD", "US", 39.0923, -77.0444, 5169], ["Mechanicville", "NY", "US", 42.9029, -73.6873, 5169], ["Central", "SC", "US", 34.7243, -82.7813, 5167], ["Northumberland", "NY", "US", 43.1273, -73.5882, 5159], ["Birdsboro", "PA", "US", 40.2645, -75.8041, 5159], ["Flat River", "MO", "US", 37.8501, -90.5168, 5157], ["Glencoe", "AL", "US", 33.957, -85.9325, 5153], ["Sunnyslope", "CA", "US", 34.012, -117.4334, 5153], ["Bret Harte", "CA", "US", 37.6021, -121.0052, 5152], ["Mocksville", "NC", "US", 35.894, -80.5614, 5151], ["Lakehills", "TX", "US", 29.6047, -98.9431, 5150], ["Wildwood", "NJ", "US", 38.9918, -74.8149, 5149], ["Grafton", "WV", "US", 39.3409, -80.019, 5148], ["Vinton", "IA", "US", 42.1686, -92.0235, 5148], ["Chardon", "OH", "US", 41.6142, -81.149, 5148], ["Stansbury park", "UT", "US", 40.6377, -112.2961, 5145], ["Tipton", "IN", "US", 40.2823, -86.0411, 5144], ["Tottenham", "ON", "CA", 44.0244, -79.8055, 5143], ["Daleville", "AL", "US", 31.3102, -85.713, 5141], ["Poplar Grove", "IL", "US", 42.3683, -88.8221, 5139], ["Maplewood", "WA", "US", 47.4018, -122.5571, 5138], ["Acton Vale", "QC", "CA", 45.6501, -72.5658, 5135], ["Tichigan", "WI", "US", 42.8289, -88.1976, 5133], ["Kaser", "NY", "US", 41.1212, -74.0671, 5131], ["Kings Point", "NY", "US", 40.8198, -73.7351, 5131], ["Port Allen", "LA", "US", 30.4521, -91.2101, 5130], ["Wheatley Heights", "NY", "US", 40.7637, -73.3698, 5130], ["Bowie", "TX", "US", 33.559, -97.8487, 5126], ["Tara Hills", "CA", "US", 37.9935, -122.3164, 5126], ["Dos Palos", "CA", "US", 36.9861, -120.6266, 5125], ["Homestead Meadows North", "TX", "US", 31.8496, -106.1728, 5124], ["New Haven", "MI", "US", 43.0936, -84.1533, 5123], ["Brookshire", "TX", "US", 29.7861, -95.9511, 5120], ["Sugarcreek", "PA", "US", 41.4215, -79.8812, 5120], ["Carmi", "IL", "US", 38.0909, -88.1586, 5119], ["Shaw Heights", "CO", "US", 39.8525, -105.0431, 5116], ["Olyphant", "PA", "US", 41.4684, -75.603, 5111], ["Savannah", "MO", "US", 39.9417, -94.8303, 5108], ["Dunlap", "TN", "US", 35.3715, -85.3905, 5108], ["Byron", "GA", "US", 32.6538, -83.7596, 5105], ["Sawmills", "NC", "US", 35.8248, -81.4745, 5104], ["Pound Ridge", "NY", "US", 41.2087, -73.5748, 5104], ["Piedmont", "SC", "US", 34.7023, -82.4646, 5103], ["South Bay", "FL", "US", 26.664, -80.7162, 5101], ["Colona", "IL", "US", 41.4839, -90.3532, 5100], ["El Cerrito Corona", "CA", "US", 33.8406, -117.5228, 5100], ["Turpin Hills", "OH", "US", 39.1101, -84.3799, 5099], ["Springhill", "LA", "US", 33.006, -93.4668, 5097], ["Perry", "OK", "US", 36.2895, -97.2881, 5097], ["Sulphur", "OK", "US", 34.5079, -96.9684, 5097], ["Sunbury", "OH", "US", 40.2426, -82.8591, 5097], ["Sparta", "TN", "US", 35.9259, -85.4641, 5096], ["Milan", "IL", "US", 41.4531, -90.5721, 5096], ["Dayton", "MN", "US", 45.2439, -93.515, 5096], ["Chestertown", "MD", "US", 39.209, -76.0666, 5093], ["Bolivar", "TN", "US", 35.2562, -88.9878, 5093], ["Columbia Falls", "MT", "US", 48.3725, -114.1815, 5093], ["Bridgeville", "PA", "US", 40.3562, -80.1101, 5092], ["Wahneta", "FL", "US", 27.9528, -81.727, 5091], ["Doffing", "TX", "US", 26.2745, -98.3859, 5091], ["Camilla", "GA", "US", 31.2313, -84.2105, 5089], ["Zapata", "TX", "US", 26.9073, -99.2714, 5089], ["Auburn", "NH", "US", 43.0045, -71.3484, 5089], ["Hudson", "QC", "CA", 45.4501, -74.1492, 5088], ["Sheldon", "IA", "US", 43.1811, -95.8561, 5088], ["Fruitland", "ID", "US", 44.0077, -116.9166, 5087], ["Shannon", "QC", "CA", 46.8803, -71.5146, 5086], ["Glennville", "GA", "US", 31.9366, -81.9284, 5086], ["Summerside", "OH", "US", 39.1048, -84.2883, 5083], ["Monee", "IL", "US", 41.42, -87.7417, 5082], ["Buellton", "CA", "US", 34.6136, -120.1927, 5082], ["South Pasadena", "FL", "US", 27.755, -82.7376, 5081], ["North Scituate", "MA", "US", 42.219, -70.7856, 5077], ["Kensington", "CA", "US", 37.9105, -122.2802, 5077], ["Deschutes River Woods", "OR", "US", 43.9915, -121.3584, 5077], ["Boiling Springs", "SC", "US", 33.1352, -81.4312, 5076], ["Lake Norman of Catawba", "NC", "US", 35.5868, -80.9595, 5075], ["Manchester", "IA", "US", 42.4841, -91.4554, 5073], ["Paris", "ME", "US", 44.2598, -70.5006, 5073], ["Kenneth City", "FL", "US", 27.8156, -82.7201, 5072], ["Granite Shoals", "TX", "US", 30.5891, -98.3839, 5071], ["Allegan", "MI", "US", 42.5292, -85.8553, 5071], ["Watseka", "IL", "US", 40.7762, -87.7364, 5070], ["Cold Spring Harbor", "NY", "US", 40.8715, -73.4568, 5070], ["New Burlington", "OH", "US", 39.2595, -84.5572, 5069], ["Kingsford", "MI", "US", 45.795, -88.0721, 5069], ["Wapato", "WA", "US", 46.4476, -120.4203, 5068], ["Giddings", "TX", "US", 30.1827, -96.9364, 5064], ["McGregor", "TX", "US", 31.4441, -97.4092, 5064], ["Fort Pierce South", "FL", "US", 27.4096, -80.3548, 5062], ["Warm Mineral Springs", "FL", "US", 27.0598, -82.2601, 5061], ["Redwood Falls", "MN", "US", 44.5394, -95.1169, 5061], ["Apple Valley", "OH", "US", 40.4389, -82.3539, 5058], ["Blaine", "WA", "US", 48.9937, -122.7471, 5056], ["Ayden", "NC", "US", 35.4727, -77.4155, 5053], ["Hampton", "MD", "US", 39.4229, -76.5847, 5052], ["Eagleton Village", "TN", "US", 35.7951, -83.9318, 5052], ["Shanor-Northvue", "PA", "US", 40.9104, -79.9156, 5051], ["Demarest", "NJ", "US", 40.9573, -73.9635, 5050], ["Northfield", "NH", "US", 43.4331, -71.5923, 5049], ["Alexandria", "IN", "US", 40.2628, -85.6758, 5047], ["Samsula-Spruce Creek", "FL", "US", 29.0493, -81.0619, 5047], ["Childersburg", "AL", "US", 33.2782, -86.355, 5046], ["Gretna", "NE", "US", 41.1408, -96.2397, 5046], ["Fairfield", "IL", "US", 38.3789, -88.3598, 5040], ["Morganville", "NJ", "US", 40.3765, -74.2443, 5040], ["Lemmon Valley", "NV", "US", 39.636, -119.8432, 5040], ["Forest Hills", "TN", "US", 36.0684, -86.8442, 5039], ["Mathis", "TX", "US", 28.0945, -97.8281, 5037], ["Waterloo", "NY", "US", 42.9048, -76.8627, 5036], ["Moultonborough", "NH", "US", 43.7548, -71.3967, 5034], ["Thiells", "NY", "US", 41.2107, -74.0176, 5032], ["Vandergrift", "PA", "US", 40.6028, -79.5648, 5032], ["Rainsville", "AL", "US", 34.4943, -85.8478, 5031], ["Fairwood", "MD", "US", 38.9567, -76.7777, 5031], ["Cherokee", "IA", "US", 42.7494, -95.5517, 5030], ["Kutztown", "PA", "US", 40.5173, -75.7774, 5028], ["Centreville", "IL", "US", 38.5834, -90.1251, 5027], ["Lake City", "MN", "US", 44.4497, -92.2682, 5027], ["Frankenmuth", "MI", "US", 43.3317, -83.738, 5025], ["Sea Cliff", "NY", "US", 40.849, -73.6449, 5025], ["Tucumcari", "NM", "US", 35.1719, -103.7269, 5025], ["Robinwood", "MD", "US", 38.9543, -76.5147, 5024], ["Saint-Henri", "QC", "CA", 46.6931, -71.0693, 5023], ["Valparaiso", "FL", "US", 30.5085, -86.5027, 5023], ["Sainte Catherine de la Jacques Cartier", "QC", "CA", 46.8524, -71.6206, 5021], ["Shenandoah", "IA", "US", 40.7655, -95.3722, 5021], ["Fernie", "BC", "CA", 49.5, -115.0687, 5019], ["Munroe Falls", "OH", "US", 41.1445, -81.4398, 5019], ["Holbrook", "AZ", "US", 34.9023, -110.1582, 5019], ["Staunton", "IL", "US", 39.0123, -89.7912, 5018], ["Spirit Lake", "IA", "US", 43.4222, -95.1022, 5018], ["Port Isabel", "TX", "US", 26.0734, -97.2086, 5016], ["Penn Yan", "NY", "US", 42.6609, -77.0539, 5014], ["West Salem", "WI", "US", 43.8991, -91.0812, 5014], ["Richland Center", "WI", "US", 43.3347, -90.3868, 5013], ["Dellwood", "MO", "US", 38.7495, -90.2857, 5011], ["West Sayville", "NY", "US", 40.7279, -73.0976, 5011], ["Bryn Mawr", "PA", "US", 40.304, -80.0867, 5009], ["Saltillo", "MS", "US", 34.3765, -88.6817, 5004], ["Shady Hollow", "TX", "US", 30.1649, -97.8622, 5004], ["North Fond du Lac", "WI", "US", 43.8114, -88.4834, 5004], ["Antigonish", "NS", "CA", 45.6168, -61.9986, 5003], ["Harlan", "IA", "US", 41.653, -95.3256, 5002], ["Houlton", "ME", "US", 46.1262, -67.8403, 5002], ["Ironwood", "MI", "US", 46.4547, -90.171, 5002], ["Mendham", "NJ", "US", 40.7759, -74.6007, 5001], ["Breakeyville", "QC", "CA", 46.6804, -71.2233, 5e3], ["Preston City", "CT", "US", 41.529, -71.974, 5e3], ["Eastchester", "NY", "US", 40.886, -73.828, 5e3], ["Cutler", "CA", "US", 36.5233, -119.2868, 5e3], ["Sorrento Valley", "CA", "US", 32.8999, -117.1945, 5e3]];
var GEO_PLACES = RAW.map((r) => ({
  name: r[0],
  region: r[1],
  country: r[2],
  lat: r[3],
  lon: r[4],
  population: r[5]
}));

// src/geoFrontier.ts
function placeKey(p) {
  return `${p.name}|${p.region}|${p.country}`;
}
__name(placeKey, "placeKey");
function radiusKm(pop) {
  return pop >= 5e5 ? 25 : pop >= 1e5 ? 15 : pop >= 25e3 ? 10 : 7;
}
__name(radiusKm, "radiusKm");
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
__name(haversineKm, "haversineKm");
function normalizeStr(str) {
  const s = (str || "").trim();
  const base = /[^\x00-\x7f]/.test(s) ? s.normalize("NFD").replace(/[\u0300-\u036f]/g, "") : s;
  return base.toLowerCase().replace(/\./g, "").replace(/\s+/g, " ").trim();
}
__name(normalizeStr, "normalizeStr");
var REGION_NAMES = {
  alabama: "al",
  alaska: "ak",
  arizona: "az",
  arkansas: "ar",
  california: "ca",
  colorado: "co",
  connecticut: "ct",
  delaware: "de",
  "district of columbia": "dc",
  florida: "fl",
  georgia: "ga",
  hawaii: "hi",
  idaho: "id",
  illinois: "il",
  indiana: "in",
  iowa: "ia",
  kansas: "ks",
  kentucky: "ky",
  louisiana: "la",
  maine: "me",
  maryland: "md",
  massachusetts: "ma",
  michigan: "mi",
  minnesota: "mn",
  mississippi: "ms",
  missouri: "mo",
  montana: "mt",
  nebraska: "ne",
  nevada: "nv",
  "new hampshire": "nh",
  "new jersey": "nj",
  "new mexico": "nm",
  "new york": "ny",
  "north carolina": "nc",
  "north dakota": "nd",
  ohio: "oh",
  oklahoma: "ok",
  oregon: "or",
  pennsylvania: "pa",
  "rhode island": "ri",
  "south carolina": "sc",
  "south dakota": "sd",
  tennessee: "tn",
  texas: "tx",
  utah: "ut",
  vermont: "vt",
  virginia: "va",
  washington: "wa",
  "west virginia": "wv",
  wisconsin: "wi",
  wyoming: "wy",
  alberta: "ab",
  "british columbia": "bc",
  manitoba: "mb",
  "new brunswick": "nb",
  "newfoundland and labrador": "nl",
  newfoundland: "nl",
  "nova scotia": "ns",
  ontario: "on",
  "prince edward island": "pe",
  quebec: "qc",
  saskatchewan: "sk",
  yukon: "yt",
  "northwest territories": "nt",
  nunavut: "nu"
};
function regionCode(raw) {
  const n = normalizeStr(raw);
  return REGION_NAMES[n] || n;
}
__name(regionCode, "regionCode");
var BY_NAME = /* @__PURE__ */ new Map();
for (const p of GEO_PLACES) {
  const k = normalizeStr(p.name);
  const arr = BY_NAME.get(k);
  if (arr) arr.push(p);
  else BY_NAME.set(k, [p]);
}
function findNearestPlace(lat, lon, maxKm = 80) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  let best = null;
  let bestD = Infinity;
  for (const p of GEO_PLACES) {
    if (Math.abs(p.lat - lat) > 1.2) continue;
    const d = haversineKm(lat, lon, p.lat, p.lon);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  if (!best || bestD > maxKm) return null;
  return best;
}
__name(findNearestPlace, "findNearestPlace");
function formatPlaceLabel(p) {
  return `${p.name}, ${p.region}`;
}
__name(formatPlaceLabel, "formatPlaceLabel");
function findPlace(label) {
  if (!label || typeof label !== "string") return null;
  const parts = label.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  const name = normalizeStr(parts[0]);
  const candidates = BY_NAME.get(name);
  if (parts.length >= 2) {
    const region = regionCode(parts[1]);
    if (candidates) {
      const hit = candidates.find((p) => normalizeStr(p.region) === region);
      if (hit) return hit;
    }
    return null;
  }
  if (candidates && candidates.length > 0) return candidates[0];
  return null;
}
__name(findPlace, "findPlace");
var DAY_MS = 864e5;
function withTuple(p) {
  return Object.assign({}, p, { 0: p.name, 1: p.region, 2: p.country });
}
__name(withTuple, "withTuple");
async function pickTargets(db, o) {
  const count = Math.max(1, Math.min(30, o.count || 5));
  const trades = (o.trades || []).map((t) => String(t).trim()).filter(Boolean);
  const isTenantArea = !!o.centerLabel;
  let center = null;
  if (isTenantArea) {
    center = findPlace(o.centerLabel);
    if (!center) return [];
  }
  const countries = (o.countries && o.countries.length > 0 ? o.countries : center ? [center.country] : []).map((c) => String(c).trim().toUpperCase()).filter(Boolean);
  const priorityCountries = new Set((o.priorityCountries || []).map((country) => String(country).trim().toUpperCase()).filter(Boolean));
  if (trades.length === 0) return [];
  const maxDist = o.serviceRadiusKm ?? 60;
  const allowedCenters = [];
  if (o.allowedCities && o.allowedCities.length > 0) {
    for (const label of o.allowedCities) {
      const pl = findPlace(label);
      if (pl) allowedCenters.push(pl);
    }
  }
  let rows = [];
  try {
    if (db && typeof db.prepare === "function") {
      const res = await db.prepare("SELECT * FROM geo_coverage WHERE tenant_id=?").bind(o.tenantId).all();
      if (res && Array.isArray(res.results)) rows = res.results;
    }
  } catch {
    rows = [];
  }
  const now = Date.now();
  const hist = /* @__PURE__ */ new Map();
  const regionStats = /* @__PURE__ */ new Map();
  const recentByTrade = /* @__PURE__ */ new Map();
  const keyToPlace = /* @__PURE__ */ new Map();
  for (const row of rows) {
    const trade = (row.trade || "").toLowerCase();
    hist.set(`${row.place_key}::${trade}`, row);
    const region = ((row.place_key || "").split("|")[1] || "").toLowerCase();
    const rk = `${trade}::${region}`;
    const st = regionStats.get(rk) || { q: 0, c: 0 };
    st.q += row.qualified || 0;
    st.c += row.candidates || 0;
    regionStats.set(rk, st);
    if (row.last_searched_at) {
      const days = (now - new Date(row.last_searched_at).getTime()) / DAY_MS;
      if (days < 30) {
        const nm = (row.place_key || "").split("|");
        const list = BY_NAME.get(normalizeStr(nm[0] || ""));
        const pl = list ? list.find((p) => p.region === nm[1] && p.country === nm[2]) : void 0;
        if (pl) {
          keyToPlace.set(row.place_key, pl);
          const arr = recentByTrade.get(trade) || [];
          arr.push({ lat: pl.lat, lon: pl.lon, r: radiusKm(pl.population || 0) });
          recentByTrade.set(trade, arr);
        }
      }
    }
  }
  let pool;
  if (center) {
    const dLat = maxDist / 111 + 0.05;
    pool = [];
    for (const p of GEO_PLACES) {
      if (!countries.includes(p.country)) continue;
      if (Math.abs(p.lat - center.lat) > dLat) continue;
      if (haversineKm(center.lat, center.lon, p.lat, p.lon) <= maxDist) pool.push(p);
    }
  } else if (allowedCenters.length > 0 && isTenantArea) {
    const radius = 40;
    const dLat = radius / 111 + 0.05;
    const seen = /* @__PURE__ */ new Set();
    pool = [];
    for (const c of allowedCenters) {
      const ck = placeKey(c);
      if (!seen.has(ck)) {
        seen.add(ck);
        pool.push(c);
      }
      for (const p of GEO_PLACES) {
        if (!countries.includes(p.country)) continue;
        if (Math.abs(p.lat - c.lat) > dLat) continue;
        if (haversineKm(c.lat, c.lon, p.lat, p.lon) > radius) continue;
        const pk = placeKey(p);
        if (seen.has(pk)) continue;
        seen.add(pk);
        pool.push(p);
      }
    }
  } else {
    const eligible = GEO_PLACES.filter((p) => countries.length === 0 || countries.includes(p.country));
    const byPop = [...eligible].sort((a, b) => {
      const priorityA = priorityCountries.has(a.country) ? 1.15 : 1;
      const priorityB = priorityCountries.has(b.country) ? 1.15 : 1;
      return Math.log(Math.max(b.population || 1, 1)) * priorityB - Math.log(Math.max(a.population || 1, 1)) * priorityA;
    });
    const top = byPop.slice(0, 150);
    const mid = byPop.slice(150).filter((p) => (p.population || 0) >= 15e3);
    const extra = [];
    const midCopy = [...mid];
    for (let i = 0; i < 150 && midCopy.length > 0; i++) {
      const idx = Math.floor(Math.random() * midCopy.length);
      extra.push(midCopy.splice(idx, 1)[0]);
    }
    const seen = /* @__PURE__ */ new Set();
    pool = [];
    for (const p of [...top, ...extra]) {
      const k = placeKey(p);
      if (seen.has(k)) continue;
      seen.add(k);
      pool.push(p);
    }
  }
  if (pool.length === 0) return [];
  const cands = [];
  for (const place of pool) {
    const pk = placeKey(place);
    const pop = Math.max(place.population || 1e3, 100);
    const region = place.region.toLowerCase();
    const dist = center ? haversineKm(center.lat, center.lon, place.lat, place.lon) : 0;
    for (const trade of trades) {
      const t = trade.toLowerCase();
      const h = hist.get(`${pk}::${t}`);
      let fresh = 1;
      let isNew = true;
      if (h && h.last_searched_at) {
        isNew = false;
        const days = (now - new Date(h.last_searched_at).getTime()) / DAY_MS;
        const prevCandidates = Number(h.candidates || 0);
        const cooldownDays = prevCandidates <= 0 ? 5 : 14;
        if (days < cooldownDays) continue;
        fresh = Math.min(1, days / Math.max(cooldownDays, 1));
      }
      const recents = recentByTrade.get(t);
      if (recents) {
        let near = false;
        for (const r of recents) {
          if (Math.abs(r.lat - place.lat) > 0.3) continue;
          if (haversineKm(place.lat, place.lon, r.lat, r.lon) < r.r) {
            near = true;
            break;
          }
        }
        if (near) continue;
      }
      const st = regionStats.get(`${t}::${region}`) || { q: 0, c: 0 };
      const prior = (st.q + 1) / (st.c + 8);
      let score = Math.log(pop) * fresh * (0.5 + prior);
      if (priorityCountries.has(place.country)) score *= 1.15;
      if (center) score *= 1 / (1 + dist / 30);
      cands.push({ place, trade, score, prior, isNew, dist });
    }
  }
  if (cands.length === 0) return [];
  cands.sort((a, b) => b.score - a.score);
  const out = [];
  const regionCount = /* @__PURE__ */ new Map();
  const tradeCount = /* @__PURE__ */ new Map();
  const chosen = [];
  const chosenKeys = /* @__PURE__ */ new Set();
  const regionCap = isTenantArea ? count : 2;
  const tradeCap = isTenantArea ? count : Math.ceil(count / Math.min(3, trades.length));
  const allowed = /* @__PURE__ */ __name((c) => {
    const key = `${placeKey(c.place)}::${c.trade.toLowerCase()}`;
    if (chosenKeys.has(key)) return false;
    if ((regionCount.get(c.place.region) || 0) >= regionCap) return false;
    if ((tradeCount.get(c.trade.toLowerCase()) || 0) >= tradeCap) return false;
    if (!isTenantArea) {
      for (const ch of chosen) {
        if (Math.abs(ch.lat - c.place.lat) > 0.3) continue;
        if (haversineKm(c.place.lat, c.place.lon, ch.lat, ch.lon) < Math.max(ch.r, radiusKm(c.place.population || 0))) {
          return false;
        }
      }
    }
    return true;
  }, "allowed");
  const take = /* @__PURE__ */ __name((c, why) => {
    out.push({ place: withTuple(c.place), trade: c.trade, why });
    chosenKeys.add(`${placeKey(c.place)}::${c.trade.toLowerCase()}`);
    regionCount.set(c.place.region, (regionCount.get(c.place.region) || 0) + 1);
    tradeCount.set(c.trade.toLowerCase(), (tradeCount.get(c.trade.toLowerCase()) || 0) + 1);
    chosen.push({ lat: c.place.lat, lon: c.place.lon, r: radiusKm(c.place.population || 0) });
  }, "take");
  const describe = /* @__PURE__ */ __name((c) => {
    if (isTenantArea) return `cerca de tu base (${Math.round(c.dist)} km)`;
    if (c.prior > 0.2) return `alto rendimiento en ${c.place.region}`;
    if (c.isNew) return "nunca explorada";
    return `refresco en ${c.place.region}`;
  }, "describe");
  const neverList = isTenantArea ? [] : cands.filter((c) => c.isNew && (c.place.population || 0) >= 2e4);
  let cursor = 0;
  while (out.length < count) {
    const turn = out.length + 1;
    let picked = false;
    if (!isTenantArea && turn % 4 === 0 && neverList.length > 0) {
      for (let tries = 0; tries < 30; tries++) {
        const c = neverList[Math.floor(Math.random() * neverList.length)];
        if (allowed(c)) {
          take(c, "exploraci\xF3n");
          picked = true;
          break;
        }
      }
    }
    if (!picked) {
      while (cursor < cands.length) {
        const c = cands[cursor++];
        if (allowed(c)) {
          take(c, describe(c));
          picked = true;
          break;
        }
      }
    }
    if (!picked) break;
  }
  return out;
}
__name(pickTargets, "pickTargets");
async function markSearched(db, tenantId, place, trade, s) {
  try {
    if (!db || typeof db.prepare !== "function") return;
    await db.prepare(
      `INSERT INTO geo_coverage (tenant_id, place_key, trade, last_searched_at, searches, candidates, qualified, replies, wins)
         VALUES (?, ?, ?, ?, 1, ?, ?, 0, 0)
         ON CONFLICT(tenant_id, place_key, trade) DO UPDATE SET
           last_searched_at = excluded.last_searched_at,
           searches = searches + 1,
           candidates = candidates + excluded.candidates,
           qualified = qualified + excluded.qualified`
    ).bind(
      tenantId,
      placeKey(place),
      String(trade || "").toLowerCase(),
      (/* @__PURE__ */ new Date()).toISOString(),
      Math.max(0, s.candidates || 0),
      Math.max(0, s.qualified || 0)
    ).run();
  } catch {
  }
}
__name(markSearched, "markSearched");

// src/research/githubActions.ts
var DEFAULT_REPOSITORY = "rayleblanc/bvelt-radar";
var WORKFLOW_FILE = "radar-research.yml";
async function dispatchScraplingResearch(env, input) {
  const token = String(env.GITHUB_ACTIONS_TOKEN || "").trim();
  if (!token) return { queued: false, reason: "GITHUB_ACTIONS_TOKEN_NOT_CONFIGURED" };
  const repository = String(env.RADAR_RESEARCH_REPOSITORY || DEFAULT_REPOSITORY).trim();
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    return { queued: false, reason: "INVALID_GITHUB_REPOSITORY" };
  }
  if (!input.run_id || !["founder", "tenant"].includes(input.mode)) {
    return { queued: false, reason: "INVALID_RESEARCH_RUN" };
  }
  if (input.mode === "founder" && input.tenant_id !== "founder") {
    return { queued: false, reason: "FOUNDER_TENANT_MISMATCH" };
  }
  if (input.mode === "tenant" && (!input.tenant_id || input.tenant_id === "founder")) {
    return { queued: false, reason: "TENANT_ID_REQUIRED" };
  }
  const endpoint = `https://api.github.com/repos/${repository}/actions/workflows/${WORKFLOW_FILE}/dispatches`;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
        "User-Agent": "BveltRadarResearch/1.0 (+https://bvelt.app)"
      },
      body: JSON.stringify({
        ref: "main",
        inputs: {
          run_id: input.run_id,
          mode: input.mode,
          tenant_id: input.tenant_id
        }
      }),
      signal: AbortSignal.timeout(1e4)
    });
    if (response.status === 204) return { queued: true, status: 204 };
    const body = (await response.text()).slice(0, 500);
    return {
      queued: false,
      status: response.status,
      reason: `GITHUB_DISPATCH_HTTP_${response.status}: ${body}`
    };
  } catch (error) {
    return {
      queued: false,
      reason: String(error?.message || error || "GITHUB_DISPATCH_FAILED").slice(0, 300)
    };
  }
}
__name(dispatchScraplingResearch, "dispatchScraplingResearch");

// src/learningIntegrity.ts
function learningCounterDelta(eventType) {
  const event = String(eventType || "unknown").trim().toLowerCase();
  const delta = {
    sent_count: 0,
    delivered_count: 0,
    opened_count: 0,
    clicked_count: 0,
    bounced_count: 0,
    replied_count: 0,
    qualified_count: 0,
    booked_count: 0,
    won_count: 0,
    lost_count: 0,
    contacted_count: 0,
    unknown_count: 0,
    event_count: 1
  };
  if (event === "sent") delta.sent_count = 1;
  else if (event === "delivered") delta.delivered_count = 1;
  else if (event === "opened") delta.opened_count = 1;
  else if (event === "clicked") delta.clicked_count = 1;
  else if (event === "bounced") delta.bounced_count = 1;
  else if (["replied", "positive", "question", "negative", "not_now", "unsubscribe", "out_of_office"].includes(
    event
  )) {
    delta.replied_count = 1;
  } else if (event === "qualified") delta.qualified_count = 1;
  else if (event === "booked") delta.booked_count = 1;
  else if (["won", "converted"].includes(event)) delta.won_count = 1;
  else if (event === "lost") delta.lost_count = 1;
  else if (event === "contacted") delta.contacted_count = 1;
  else if (["unknown", "discarded", "suppressed"].includes(event)) delta.unknown_count = 1;
  else delta.unknown_count = 1;
  return delta;
}
__name(learningCounterDelta, "learningCounterDelta");
function normalizeScope(mode, tenantId) {
  if (mode === "founder") return "founder";
  const value = String(tenantId || "").trim();
  if (!value || value === "founder") {
    throw new Error("Tenant learning requires its exact tenant_id.");
  }
  return value;
}
__name(normalizeScope, "normalizeScope");
function normalizeNullable(value) {
  if (value === void 0 || value === null || value === "") return null;
  return String(value);
}
__name(normalizeNullable, "normalizeNullable");
function normalizeValueUsd(value) {
  if (value === void 0 || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
__name(normalizeValueUsd, "normalizeValueUsd");
async function recordScopedLearningEvent(db, input) {
  if (!db || !input.prospectId || !input.eventType) return false;
  try {
    const tenantId = normalizeScope(input.mode, input.tenantId);
    const occurredAt = input.occurredAt || (/* @__PURE__ */ new Date()).toISOString();
    const eventType = String(input.eventType).trim().toLowerCase();
    const delta = learningCounterDelta(eventType);
    const eventId = crypto.randomUUID();
    const idempotencyKey = input.idempotencyKey ? `${input.mode}:${tenantId}:${input.idempotencyKey}` : `${input.mode}:${tenantId}:${input.prospectId}:${eventType}:${occurredAt}`;
    const metadataJson = JSON.stringify(input.metadata || {});
    const keys = /* @__PURE__ */ new Set();
    if (input.city) keys.add(`city:${input.city}`);
    if (input.trade) keys.add(`trade:${String(input.trade).toLowerCase()}`);
    if (input.city && input.trade) {
      keys.add(`pair:${input.city}|${String(input.trade).toLowerCase()}`);
    }
    if (input.variantId) keys.add(`variant:${input.variantId}`);
    if (input.angle) keys.add(`angle:${input.angle}`);
    const statements = [
      db.prepare(
        `
      INSERT OR IGNORE INTO learning_events
        (id, prospect_id, mode, tenant_id, event_type, city, trade, variant_id, angle, value_usd, metadata_json, idempotency_key, occurred_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
      ).bind(
        eventId,
        input.prospectId,
        input.mode,
        tenantId,
        eventType,
        input.city || null,
        input.trade || null,
        input.variantId || null,
        input.angle || null,
        typeof input.valueUsd === "number" && Number.isFinite(input.valueUsd) ? input.valueUsd : null,
        metadataJson,
        idempotencyKey,
        occurredAt
      )
    ];
    for (const key of keys) {
      statements.push(
        db.prepare(
          `
      INSERT INTO learning_stats_scoped (
        mode, tenant_id, key, sent_count, delivered_count, opened_count, clicked_count,
        bounced_count, replied_count, qualified_count, booked_count, won_count,
        lost_count, contacted_count,
        unknown_count, total_events, updated_at
      )
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM learning_events WHERE id = ?)
      ON CONFLICT(mode, tenant_id, key) DO UPDATE SET
        sent_count = sent_count + excluded.sent_count,
        delivered_count = delivered_count + excluded.delivered_count,
        opened_count = opened_count + excluded.opened_count,
        clicked_count = clicked_count + excluded.clicked_count,
        bounced_count = bounced_count + excluded.bounced_count,
        replied_count = replied_count + excluded.replied_count,
        qualified_count = qualified_count + excluded.qualified_count,
        booked_count = booked_count + excluded.booked_count,
        won_count = won_count + excluded.won_count,
        lost_count = lost_count + excluded.lost_count,
        contacted_count = contacted_count + excluded.contacted_count,
        unknown_count = unknown_count + excluded.unknown_count,
        total_events = total_events + excluded.total_events,
        updated_at = excluded.updated_at
    `
        ).bind(
          input.mode,
          tenantId,
          key,
          delta.sent_count,
          delta.delivered_count,
          delta.opened_count,
          delta.clicked_count,
          delta.bounced_count,
          delta.replied_count,
          delta.qualified_count,
          delta.booked_count,
          delta.won_count,
          delta.lost_count,
          delta.contacted_count,
          delta.unknown_count,
          delta.event_count,
          occurredAt,
          eventId
        )
      );
    }
    const results = await db.batch(statements);
    if (Number(results?.[0]?.meta?.changes || 0) > 0) return "inserted";
    const existing = await db.prepare(
      `SELECT prospect_id, mode, tenant_id, event_type, city, trade, variant_id, angle, value_usd, metadata_json, occurred_at
         FROM learning_events WHERE idempotency_key = ? LIMIT 1`
    ).bind(idempotencyKey).first();
    if (!existing) return false;
    const expectedValue = typeof input.valueUsd === "number" && Number.isFinite(input.valueUsd) ? input.valueUsd : null;
    const sameCore = String(existing.prospect_id) === String(input.prospectId) && String(existing.mode) === input.mode && String(existing.tenant_id) === tenantId && String(existing.event_type) === eventType && normalizeNullable(existing.city) === normalizeNullable(input.city) && normalizeNullable(existing.trade) === normalizeNullable(input.trade) && normalizeNullable(existing.variant_id) === normalizeNullable(input.variantId) && normalizeNullable(existing.angle) === normalizeNullable(input.angle) && normalizeValueUsd(existing.value_usd) === expectedValue;
    if (!sameCore) return false;
    if (existing.metadata_json != null && String(existing.metadata_json) !== metadataJson) {
      return false;
    }
    if (existing.occurred_at != null && String(existing.occurred_at) !== String(occurredAt)) {
      return false;
    }
    return "duplicate";
  } catch (err) {
    console.warn("[learningIntegrity] recordScopedLearningEvent skipped:", err?.message || err);
    return false;
  }
}
__name(recordScopedLearningEvent, "recordScopedLearningEvent");
async function readScopedLearningStats(db, mode, tenantIdInput) {
  const rates = {};
  if (!db) return rates;
  try {
    const tenantId = normalizeScope(mode, tenantIdInput);
    const rows = await db.prepare(
      `
    WITH scoped_events AS (
      SELECT prospect_id, event_type, city, trade, variant_id, angle
      FROM learning_events
      WHERE mode = ? AND tenant_id = ?
        AND event_type IN (
          'sent', 'delivered', 'opened', 'clicked', 'bounced',
          'contacted', 'replied', 'positive', 'question', 'negative',
          'not_now', 'unsubscribe', 'out_of_office',
          'booked', 'won', 'converted', 'lost'
        )
    ),
    dimensions AS (
      SELECT prospect_id, event_type, 'city:' || city AS key
      FROM scoped_events WHERE city IS NOT NULL AND TRIM(city) <> ''
      UNION ALL
      SELECT prospect_id, event_type, 'trade:' || LOWER(TRIM(trade)) AS key
      FROM scoped_events WHERE trade IS NOT NULL AND TRIM(trade) <> ''
      UNION ALL
      SELECT prospect_id, event_type, 'pair:' || city || '|' || LOWER(TRIM(trade)) AS key
      FROM scoped_events
      WHERE city IS NOT NULL AND TRIM(city) <> ''
        AND trade IS NOT NULL AND TRIM(trade) <> ''
      UNION ALL
      SELECT prospect_id, event_type, 'variant:' || variant_id AS key
      FROM scoped_events WHERE variant_id IS NOT NULL AND TRIM(variant_id) <> ''
      UNION ALL
      SELECT prospect_id, event_type, 'angle:' || angle AS key
      FROM scoped_events WHERE angle IS NOT NULL AND TRIM(angle) <> ''
    )
    SELECT
      key,
      COUNT(DISTINCT prospect_id) AS contacted_count,
      COUNT(DISTINCT CASE WHEN event_type IN ('won', 'converted') THEN prospect_id END) AS won_count
    FROM dimensions
    GROUP BY key
    HAVING COUNT(DISTINCT prospect_id) >= 2
  `
    ).bind(mode, tenantId).all();
    for (const row of rows?.results || []) {
      const contacted = Math.max(1, Number(row.contacted_count || 0));
      const won = Math.min(contacted, Number(row.won_count || 0));
      rates[String(row.key)] = (won + 1) / (contacted + 2);
    }
  } catch (err) {
    console.warn("[learningIntegrity] readScopedLearningStats skipped:", err?.message || err);
  }
  return rates;
}
__name(readScopedLearningStats, "readScopedLearningStats");

// src/permitSources.ts
var PERMIT_SOURCES = {
  austin: { domain: "data.austintexas.gov", dataset: "3syk-w9eu" },
  chicago: { domain: "data.cityofchicago.org", dataset: "ydr8-5enu" },
  "san francisco": { domain: "data.sfgov.org", dataset: "i98e-djp9" },
  "new orleans": { domain: "data.nola.gov", dataset: "72f9-bi28" },
  "los angeles": { domain: "data.lacity.org", dataset: "pi9x-tg5x" },
  seattle: { domain: "data.seattle.gov", dataset: "76t5-zqzr" },
  "new york": { domain: "data.cityofnewyork.us", dataset: "ipu4-2q9a" }
};
function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
__name(escapeRegex, "escapeRegex");
function getTradeRegex(trade) {
  const t = trade.toLowerCase().trim();
  if (t === "hvac") {
    return /hvac|air|heating|mechanical|cool/i;
  }
  if (t === "plumbing") {
    return /plumb/i;
  }
  if (t === "electrical") {
    return /electric/i;
  }
  if (t === "roofing") {
    return /roof/i;
  }
  if (t === "landscaping" || t === "lawn_care" || t === "lawn") {
    return /landscap|lawn|irrigat/i;
  }
  return new RegExp(escapeRegex(t), "i");
}
__name(getTradeRegex, "getTradeRegex");
function normalizeContractorName(name) {
  return name.toUpperCase().replace(/[^A-Z0-9\s]/g, " ").replace(/\b(LLC|INC)\b/g, "").replace(/\s+/g, " ").trim();
}
__name(normalizeContractorName, "normalizeContractorName");
function cleanPhone(rawPhone) {
  if (!rawPhone) return null;
  const digits = String(rawPhone).replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return digits.slice(1);
  }
  return digits.length === 10 ? digits : null;
}
__name(cleanPhone, "cleanPhone");
function findFieldValue(record, pattern) {
  if (!record || typeof record !== "object") return null;
  const targetPattern = pattern.toLowerCase();
  const matchedKey = Object.keys(record).find((k) => k.toLowerCase().includes(targetPattern));
  return matchedKey ? record[matchedKey] : null;
}
__name(findFieldValue, "findFieldValue");
async function fetchPermitContractors(city, trade, limit = 60) {
  const cityKey = (city || "").toLowerCase().trim();
  let source = PERMIT_SOURCES[cityKey];
  if (!source) {
    const matched = Object.keys(PERMIT_SOURCES).find((k) => cityKey.includes(k));
    if (matched) source = PERMIT_SOURCES[matched];
    else if (cityKey.includes("nyc")) source = PERMIT_SOURCES["new york"];
  }
  if (!source) return [];
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 9e3);
  try {
    const base = `https://${source.domain}/resource/${source.dataset}.json?$limit=2000`;
    let response = await fetch(`${base}&$order=${encodeURIComponent(":updated_at DESC")}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" }
    }).catch(() => null);
    if (!response || !response.ok) {
      response = await fetch(base, { signal: controller.signal, headers: { Accept: "application/json" } }).catch(() => null);
    }
    if (!response || !response.ok) return [];
    const rows = await response.json();
    if (!Array.isArray(rows)) return [];
    const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1e3;
    const tradeRegex = getTradeRegex(trade);
    const grouped = /* @__PURE__ */ new Map();
    const NAME_KEYS = ["contractor_company_name", "contractors_business_name", "contractorcompanyname", "permittee_s_business_name", "contractor_name", "contractor"];
    const PHONE_KEYS = ["contractor_phone", "contractor_phone_number", "contractorphone", "permittee_s_phone__", "contact_1_phone"];
    const DATE_KEYS = ["issued_date", "issue_date", "issuance_date", "issueddate", "permit_issue_date", "issued"];
    const DESC_KEYS = ["description", "work_description", "permit_description", "permit_type", "permit_type_desc", "work_type", "worktype"];
    const firstOf = /* @__PURE__ */ __name((row, keys, frag) => {
      for (const k of keys) {
        const v = row[k];
        if (v !== void 0 && v !== null && String(v).trim() !== "") return String(v).trim();
      }
      if (frag) {
        const v = findFieldValue(row, frag);
        if (v !== null && v !== void 0 && String(v).trim() !== "") return String(v).trim();
      }
      return "";
    }, "firstOf");
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const r = row;
      let rawCompanyName = firstOf(r, NAME_KEYS, "contractor");
      if (!rawCompanyName) {
        for (let i = 1; i <= 5; i++) {
          const type = String(r[`contact_${i}_type`] || "").toLowerCase();
          const nm = String(r[`contact_${i}_name`] || "").trim();
          if (nm && /contractor|plumb|electric|hvac|roof|mechanical/.test(type)) {
            rawCompanyName = nm;
            break;
          }
        }
      }
      if (!rawCompanyName) continue;
      const dateStr = firstOf(r, DATE_KEYS, "issue");
      const issuedMs = dateStr ? Date.parse(dateStr) : NaN;
      if (!Number.isFinite(issuedMs) || issuedMs < cutoff || issuedMs > Date.now() + 24 * 60 * 60 * 1e3) continue;
      const desc = firstOf(r, DESC_KEYS);
      const tradeStr = firstOf(r, ["contractor_trade", "contractor_trade_description"]) || null;
      const tradeCandidate = `${tradeStr || ""} ${rawCompanyName} ${desc}`;
      if (!tradeRegex.test(tradeCandidate)) continue;
      const normalizedKey = normalizeContractorName(rawCompanyName);
      if (!normalizedKey) continue;
      const phoneCandidate = cleanPhone(firstOf(r, PHONE_KEYS, "phone"));
      const cityCandidate = firstOf(r, ["contractor_city", "contractor_address_city"]) || null;
      const zipCandidate = (firstOf(r, ["contractor_zip", "contractor_zipcode"]) || "").slice(0, 10) || null;
      const issuedCandidate = dateStr || null;
      const existing = grouped.get(normalizedKey);
      if (existing) {
        existing.permits_90d += 1;
        if (!existing.phone && phoneCandidate) existing.phone = phoneCandidate;
        if (!existing.city && cityCandidate) existing.city = cityCandidate;
        if (!existing.zip && zipCandidate) existing.zip = zipCandidate;
        if (!existing.trade && tradeStr) existing.trade = tradeStr;
        if (issuedCandidate && (!existing.last_issued || issuedCandidate > existing.last_issued)) {
          existing.last_issued = issuedCandidate;
        }
      } else {
        grouped.set(normalizedKey, {
          name: rawCompanyName,
          phone: phoneCandidate,
          trade: tradeStr,
          city: cityCandidate,
          zip: zipCandidate,
          permits_90d: 1,
          last_issued: issuedCandidate
        });
      }
    }
    return Array.from(grouped.values()).map((entry) => ({ ...entry, source: "permits" })).sort((a, b) => b.permits_90d - a.permits_90d).slice(0, limit);
  } catch {
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}
__name(fetchPermitContractors, "fetchPermitContractors");

// src/worker.ts
function getBudgetLimit(unitType) {
  switch (unitType) {
    case "discovery_units":
      return 30;
    case "enrichment_units":
      return 20;
    case "ai_units":
      return 10;
    case "hunter_units":
      return 8;
    case "outreach_units":
      return 3;
    case "finalize_units":
      return 10;
    default:
      return 0;
  }
}
__name(getBudgetLimit, "getBudgetLimit");
async function reserveBudget(db, tenantId, unitType, amount = 1) {
  const day = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
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
    `).bind(amount, tenantId, day, amount, limit).run();
    return !!(res && res.meta && res.meta.changes > 0);
  } catch (e) {
    console.error(`[Budget Governor] Failed to reserve ${unitType} for tenant ${tenantId}:`, e);
    return false;
  }
}
__name(reserveBudget, "reserveBudget");
async function isValidCorporateDomain(domain) {
  try {
    const response = await fetch(`https://1.1.1.1/dns-query?name=${domain}&type=MX`, {
      headers: { "Accept": "application/dns-json" }
    });
    const data = await response.json();
    return data.Answer && data.Answer.length > 0;
  } catch (e) {
    return false;
  }
}
__name(isValidCorporateDomain, "isValidCorporateDomain");
async function fetchPublicPermits(city) {
  if (city.toLowerCase() === "orlando") {
    try {
      const response = await fetch("https://data.cityoforlando.net/resource/4v5t-j59e.json?$limit=50&$order=issued_date DESC");
      return await response.json();
    } catch (e) {
      console.error("Error fetching Orlando permits:", e);
    }
  }
  return [];
}
__name(fetchPublicPermits, "fetchPublicPermits");
async function fetchPermitContractors2(city, trade) {
  try {
    const municipal = await fetchPermitContractors(city, trade, 60);
    if (municipal.length) {
      return municipal.map((item) => ({
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
    const permits = await fetchPublicPermits(city);
    if (!Array.isArray(permits)) return [];
    const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1e3;
    const tradeKey = String(trade || "").toLowerCase().replace(/[_-]+/g, " ");
    const tradePattern = tradeKey.includes("hvac") ? /hvac|air|heating|cooling|mechanical/i : tradeKey.includes("plumb") ? /plumb|drain|sewer/i : tradeKey.includes("roof") ? /roof/i : tradeKey.includes("electric") ? /electric/i : tradeKey.includes("landscap") || tradeKey.includes("lawn") ? /landscap|lawn|irrigat/i : tradeKey.includes("pest") ? /pest|exterminat/i : tradeKey.includes("clean") ? /clean|janitorial/i : tradeKey.includes("paint") ? /paint/i : tradeKey.includes("pool") ? /pool/i : null;
    const results = [];
    for (const permit of permits) {
      const name = String(permit.contractor_name || permit.company_name || permit.applicant_name || "").trim();
      if (!name) continue;
      const dateValue = permit.issued_date || permit.issue_date || permit.issuance_date || permit.permit_date;
      const issuedAt = dateValue ? Date.parse(String(dateValue)) : NaN;
      if (!Number.isFinite(issuedAt) || issuedAt < cutoff || issuedAt > Date.now() + 24 * 60 * 60 * 1e3) continue;
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
__name(fetchPermitContractors2, "fetchPermitContractors");
async function releaseBudget(db, tenantId, unitType, amount = 1) {
  const day = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
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
__name(releaseBudget, "releaseBudget");
async function commitBudget(db, tenantId, unitType, amount = 1) {
  console.log(`[Budget Governor] Committed ${amount} units of ${unitType} for tenant ${tenantId}`);
}
__name(commitBudget, "commitBudget");
async function getRemainingBudget(db, tenantId, unitType) {
  const day = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  const limit = getBudgetLimit(unitType);
  try {
    const row = await db.prepare(`SELECT ${unitType} FROM daily_budgets WHERE tenant_id = ? AND day = ?`).bind(tenantId, day).first();
    if (!row) return limit;
    return Math.max(0, limit - (row[unitType] || 0));
  } catch (e) {
    return 0;
  }
}
__name(getRemainingBudget, "getRemainingBudget");
async function getCircuitBreakerStatus(db) {
  try {
    const row = await db.prepare("SELECT * FROM circuit_breakers WHERE id = 'outreach'").first();
    if (row && row.status === "open") {
      return { active: true, reason: row.reason };
    }
  } catch (e) {
    return { active: true, reason: "Circuit breaker state query failed (fail closed)" };
  }
  return { active: false, reason: null };
}
__name(getCircuitBreakerStatus, "getCircuitBreakerStatus");
async function tripCircuitBreaker(db, reason, errorMsg) {
  const timestamp = (/* @__PURE__ */ new Date()).toISOString();
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
__name(tripCircuitBreaker, "tripCircuitBreaker");
async function trackProviderFailure(db, errorMsg) {
  const isAuthError = errorMsg.includes("401") || errorMsg.includes("Authentication") || errorMsg.includes("Unauthorized");
  const isUnexpectedFormat = errorMsg.includes("response format") || errorMsg.includes("JSON") || errorMsg.includes("Unexpected token");
  let reason = "repeated provider failures";
  if (isAuthError) reason = "repeated authentication errors";
  else if (isUnexpectedFormat) reason = "unexpected provider response format";
  await tripCircuitBreaker(db, reason, errorMsg);
}
__name(trackProviderFailure, "trackProviderFailure");
var MARKET_UNIVERSE_POLICY = market_universe_default;
var MARKET_PRIORITY_COUNTRIES = Array.from(new Set([
  ...MARKET_UNIVERSE_POLICY.market_tiers?.core_english_commercial || [],
  ...MARKET_UNIVERSE_POLICY.market_tiers?.additional_english_commercial || [],
  ...MARKET_UNIVERSE_POLICY.geography_policy?.default_priority_countries || [],
  ...MARKET_UNIVERSE_POLICY.geography_policy?.priority_countries || []
].map((country) => String(country).trim().toUpperCase()).filter(Boolean)));
var DEFAULT_FOUNDER_SEGMENTS = (MARKET_UNIVERSE_POLICY.bvelt_compatible_segments || []).map((segment) => String(segment).trim().toLowerCase()).filter(Boolean);
var FOUNDER_SEGMENT_DISCOVERY_MAP = {
  home_services: ["plumbing", "hvac", "roofing", "landscaping", "lawn_care", "house_cleaning", "pool_cleaning", "handyman", "pest_control", "electrical"],
  home_property_construction_and_trades: ["roofing", "painting", "garage_door", "appliance_repair", "fencing", "flooring", "general_contractor"],
  cleaning_facility_and_maintenance: ["cleaning", "commercial_cleaning", "janitorial", "window_cleaning", "carpet_cleaning", "pressure_washing", "tree_service"],
  automotive_transport_and_mobility: ["auto_repair", "auto_body", "towing", "car_wash", "car_rental"],
  healthcare_dental_veterinary_and_wellness: ["dental_clinic", "medical_clinic", "optometry"],
  beauty_fitness_and_personal_services: [],
  legal_financial_insurance_and_professional_services: ["law_firm", "accounting_firm", "insurance_agency"],
  real_estate_property_management_and_hospitality: ["property_management", "real_estate", "hotel"],
  education_training_and_child_family_services: ["school", "tutoring_center", "training_center"],
  restaurants_food_catering_and_events: ["restaurant", "catering", "event_venue"],
  retail_local_specialty_and_equipment: ["hardware_store", "equipment_rental", "repair_shop"],
  pet_services_and_animal_care: [],
  logistics_storage_and_delivery_services: ["moving", "storage_facility", "delivery_service"],
  industrial_b2b_manufacturing_and_maintenance: ["industrial_maintenance", "manufacturer", "machine_shop"],
  technology_it_and_managed_services: ["it_services", "managed_it"],
  agriculture_landscape_and_outdoor_services: ["landscaping", "tree_service", "irrigation"],
  recreation_sports_tourism_and_venues: ["travel_agency", "event_venue", "sports_club"],
  other_customer_inquiry_or_appointment_driven_businesses: ["local_service_business"]
};
function expandFounderDiscoveryNiches(niches) {
  const expanded = [];
  const seen = /* @__PURE__ */ new Set();
  for (const raw of niches || []) {
    const label = String(raw || "").trim();
    if (!label) continue;
    const key = label.toLowerCase().replace(/[\s-]+/g, "_");
    const mapped = FOUNDER_SEGMENT_DISCOVERY_MAP[key];
    for (const value of mapped !== void 0 ? mapped : [label]) {
      const clean = String(value || "").trim();
      const normalized = clean.toLowerCase();
      if (!clean || seen.has(normalized)) continue;
      seen.add(normalized);
      expanded.push(clean);
    }
  }
  return expanded;
}
__name(expandFounderDiscoveryNiches, "expandFounderDiscoveryNiches");
var DEFAULT_FOUNDER_MISSION = {
  mode: "founder",
  target: "bvelt_customers",
  // Broad Bvelt-compatible segments are exploration priorities, not an allowlist.
  // Custom niches remain valid through FOUNDING_TRADES or dashboard configuration.
  niches: [...DEFAULT_FOUNDER_SEGMENTS],
  subniches: [],
  services: [],
  geographies: [],
  countries: [],
  languages: [],
  icp: {
    description: "",
    keywords: []
  },
  min_score: 0,
  max_daily_outreach: 12
};
var US_STATE_CODES = /* @__PURE__ */ new Set([
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
  "DC"
]);
function extractUsStateCodes(cityLabels) {
  return Array.from(new Set(
    cityLabels.map((label) => String(label || "").split(",").pop()?.trim().toUpperCase() || "").filter((code) => US_STATE_CODES.has(code))
  ));
}
__name(extractUsStateCodes, "extractUsStateCodes");
var LIMITS = {
  max_discover_per_day: 40,
  max_finalize_per_day: 12,
  max_ai_calls_per_day: 20,
  max_hunter_credits_per_day: 10
};
var TENANT_TARGET_MAP = {
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
  locksmith: ["property management", "apartment complex", "hotel", "real estate", "facility manager"]
};
function resolveTenantBuyerSegments(niche, expandedSegments = []) {
  const expanded = Array.from(new Set(
    expandedSegments.map((segment) => typeof segment === "string" ? segment : String(segment?.label || "")).map((label) => label.trim()).filter(Boolean)
  ));
  if (expanded.length) return expanded.slice(0, 6);
  const normalized = String(niche || "").trim().toLowerCase();
  const key = normalized.replace(/\s+/g, "_");
  const mapped = TENANT_TARGET_MAP[key] || TENANT_TARGET_MAP[normalized] || [];
  return [...mapped];
}
__name(resolveTenantBuyerSegments, "resolveTenantBuyerSegments");
var OVERPASS_TRADE_TAGS = {
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
  auto_repair: ['shop="car_repair"', 'craft="mechanic"', 'name~"auto repair"', 'name~"mechanic"'],
  auto_body: ['shop="car_repair"', 'name~"collision repair"', 'name~"auto body"'],
  towing: ['craft="tow_truck"', 'name~"towing"', 'name~"tow truck"'],
  car_wash: ['amenity="car_wash"', 'shop="car_repair"', 'name~"car wash"'],
  car_rental: ['amenity="car_rental"', 'shop="car_rental"', 'name~"car rental"'],
  dental_clinic: ['amenity="dentist"', 'healthcare="dentist"', 'name~"dental"', 'name~"dentist"'],
  medical_clinic: ['amenity="clinic"', 'healthcare="clinic"', 'name~"medical clinic"', 'name~"medical center"'],
  optometry: ['healthcare="optometrist"', 'shop="optician"', 'name~"optometry"', 'name~"eye care"'],
  law_firm: ['office="lawyer"', 'name~"law firm"', 'name~"attorney"', 'name~"law office"'],
  accounting_firm: ['office="accountant"', 'name~"accounting"', 'name~"accountant"', 'name~"tax service"'],
  tutoring_center: ['office="educational_institution"', 'name~"tutoring"', 'name~"tutor"'],
  training_center: ['office="educational_institution"', 'name~"training center"', 'name~"training academy"'],
  catering: ['craft="caterer"', 'office="catering"', 'name~"catering"'],
  event_venue: ['amenity="events_venue"', 'leisure="venue"', 'name~"event venue"', 'name~"wedding venue"'],
  hardware_store: ['shop="hardware"', 'shop="trade"', 'name~"hardware"', 'name~"building supply"'],
  equipment_rental: ['shop="tool_hire"', 'name~"equipment rental"', 'name~"tool rental"'],
  repair_shop: ['craft="repair"', 'shop="repair"', 'name~"repair shop"', 'name~"repair service"'],
  storage_facility: ['shop="self_storage"', 'name~"self storage"', 'name~"storage facility"'],
  delivery_service: ['office="logistics"', 'name~"delivery"', 'name~"courier"', 'name~"logistics"'],
  industrial_maintenance: ['industrial="factory"', 'craft="industrial_maintenance"', 'name~"industrial maintenance"'],
  manufacturer: ['industrial="factory"', 'industrial="manufacture"', 'name~"manufacturer"', 'name~"manufacturing"'],
  machine_shop: ['craft="metal_construction"', 'name~"machine shop"', 'name~"machining"'],
  it_services: ['office="it"', 'office="company"', 'name~"IT services"', 'name~"computer services"'],
  managed_it: ['office="it"', 'name~"managed IT"', 'name~"IT support"'],
  tree_service: ['craft="arborist"', 'name~"tree service"', 'name~"arborist"'],
  irrigation: ['craft="irrigation"', 'name~"irrigation"', 'name~"sprinkler system"'],
  sports_club: ['leisure="sports_centre"', 'club="sport"', 'name~"sports club"'],
  travel_agency: ['shop="travel_agency"', 'office="travel_agent"', 'tourism="information"', 'name~"travel agency"'],
  local_service_business: ['craft="contractor"', 'amenity="trade"', 'office="company"'],
  "property management": [
    'office="property_management"',
    'amenity="property_management"',
    'name~"property management"',
    'name~"property manager"',
    'name~"prop management"',
    'office="estate_agent"',
    'name~"apartment management"',
    'name~"community management"'
  ],
  "property manager": [
    'office="property_management"',
    'name~"property manager"',
    'name~"property management"'
  ],
  "real estate": [
    'office="estate_agent"',
    'amenity="real_estate"',
    'name~"real estate"',
    'name~"realty"',
    'name~"realtor"',
    'office="realtor"'
  ],
  hotel: ['tourism="hotel"', 'tourism="motel"', 'tourism="guest_house"', 'tourism="hostel"'],
  restaurant: ['amenity="restaurant"', 'amenity="cafe"', 'amenity="fast_food"'],
  "facility manager": ['office="facility_management"', 'name~"facility"', 'name~"facilities management"'],
  "homeowners association": [
    'office="association"',
    'name~"HOA"',
    'name~"homeowners association"',
    'name~"homeowner association"',
    'name~"community association"'
  ],
  hoa: ['office="association"', 'name~"HOA"', 'name~"homeowners"', 'name~"community association"'],
  "apartment complex": [
    'building="apartments"',
    'name~"apartment"',
    'name~"apartments"',
    'name~"residential community"',
    'landuse="residential"'
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
  "golf course": ['leisure="golf_course"', 'name~"golf"']
};
function isAuthorized(request, env, serviceKey, validSessionHash) {
  const cookieHeader = request.headers.get("Cookie") || "";
  const parsedCookies = {};
  cookieHeader.split(";").forEach((c) => {
    const [k, ...v] = c.trim().split("=");
    if (k) parsedCookies[k.trim()] = decodeURIComponent(v.join("=").trim());
  });
  const authHeader = request.headers.get("Authorization");
  const sessionCookie = parsedCookies["bvelt_session"];
  if (validSessionHash && sessionCookie === validSessionHash) {
    return true;
  }
  const bearerToken = authHeader && authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;
  if (bearerToken && (serviceKey && bearerToken === serviceKey || env.FOUNDER_SERVICE_KEY && bearerToken === env.FOUNDER_SERVICE_KEY)) return true;
  return false;
}
__name(isAuthorized, "isAuthorized");
function resolveTenantAuthContext(request, env, serviceKey, validSessionHash) {
  const cookieHeader = request.headers.get("Cookie") || "";
  const parsedCookies = {};
  cookieHeader.split(";").forEach((c) => {
    const [k, ...v] = c.trim().split("=");
    if (k) parsedCookies[k.trim()] = decodeURIComponent(v.join("=").trim());
  });
  const authHeader = request.headers.get("Authorization") || "";
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;
  const sessionCookie = parsedCookies["bvelt_session"];
  const tenantCookie = parsedCookies["bvelt_tenant_id"];
  const isFounderService = Boolean(bearerToken && (serviceKey && bearerToken === serviceKey || env.FOUNDER_SERVICE_KEY && bearerToken === env.FOUNDER_SERVICE_KEY));
  const isRadarService = Boolean(bearerToken && env.RADAR_SERVICE_KEY && bearerToken === env.RADAR_SERVICE_KEY);
  const isService = isFounderService || isRadarService;
  const isFounderSession = Boolean(validSessionHash && sessionCookie === validSessionHash);
  const headerTenantId = request.headers.get("X-Tenant-Id") || request.headers.get("x-tenant-id");
  const callerTenantId = isFounderSession || isFounderService ? "founder" : headerTenantId || tenantCookie || null;
  const authorized = isFounderService || isFounderSession || isRadarService && !!callerTenantId && callerTenantId !== "founder";
  return {
    authorized,
    isService,
    isFounderSession: isFounderSession || isFounderService,
    tenantId: callerTenantId,
    canAccessTenant: /* @__PURE__ */ __name((targetTenant) => {
      if (!authorized || !targetTenant) return false;
      if (isFounderService || isFounderSession) return true;
      return isRadarService && callerTenantId === targetTenant && targetTenant !== "founder";
    }, "canAccessTenant")
  };
}
__name(resolveTenantAuthContext, "resolveTenantAuthContext");
var worker_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    const requestOrigin = request.headers.get("Origin") || "*";
    const allowedOrigins = env.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS.split(";").map((o) => o.trim()) : [];
    let allowOriginHeader = requestOrigin;
    if (allowedOrigins.length > 0) {
      allowOriginHeader = allowedOrigins.includes(requestOrigin) ? requestOrigin : allowedOrigins[0];
    }
    const corsHeaders = {
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
        validSessionHash = Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
      }
      if (path === "/health" && method === "GET") {
        const tenantId = url.searchParams.get("tenant_id") || "founder";
        return await handleHealth(env, corsHeaders, tenantId);
      }
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
          let webhookSetupResult = null;
          if (setWebhook) {
            const webhookUrl = `${url.origin}/telegram-webhook`;
            const setupPayload = { url: webhookUrl };
            if (env.TELEGRAM_WEBHOOK_SECRET && env.TELEGRAM_WEBHOOK_SECRET.trim()) {
              setupPayload.secret_token = env.TELEGRAM_WEBHOOK_SECRET.trim();
            }
            const setRes = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(setupPayload),
              signal: AbortSignal.timeout(6e3)
            });
            webhookSetupResult = await setRes.json().catch(() => ({ ok: false }));
          }
          let webhookInfo = null;
          try {
            const infoRes = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`, {
              signal: AbortSignal.timeout(15e3)
            });
            webhookInfo = await infoRes.json().catch(() => null);
          } catch (e) {
          }
          const testRes = await notifyFounder(
            env,
            "<b>\u{1F4E1} Bvelt Radar LIVE test OK</b> \u2014 Bot conectado y operativo a Telegram.\n\nNotificaciones outbound y botones interactivos configurados correctamente."
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
        } catch (err) {
          return Response.json({
            success: false,
            ok: false,
            error: err.message
          }, { status: 502, headers: corsHeaders });
        }
      }
      if (path === "/demo" && method === "GET") {
        const token = url.searchParams.get("p");
        let companyName = "Tu Negocio";
        let tradeName = "Servicios";
        let phone = "";
        let prospectId = null;
        let evidenceJson = "[]";
        if (token) {
          try {
            const prospect = await env.RADAR_DB.prepare("SELECT id, name, trade, phone, evidence_json FROM prospects WHERE demo_token = ?").bind(token).first();
            if (prospect) {
              companyName = prospect.name || "Tu Negocio";
              tradeName = prospect.trade || "Servicios";
              phone = prospect.phone || "";
              prospectId = prospect.id;
              evidenceJson = prospect.evidence_json || "[]";
              const timestamp = (/* @__PURE__ */ new Date()).toISOString();
              const ua = request.headers.get("User-Agent") || "";
              await env.RADAR_DB.prepare("INSERT INTO demo_views (prospect_id, viewed_at, ua) VALUES (?, ?, ?)").bind(prospectId, timestamp, ua).run();
              await env.RADAR_DB.prepare("INSERT INTO prospect_events (prospect_id, event_type, content, created_at) VALUES (?, 'demo_viewed', ?, ?)").bind(prospectId, "demo_viewed", `Personalized demo viewed. UA: ${ua}`, timestamp).run();
              const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1e3).toISOString();
              const otherViews = await env.RADAR_DB.prepare(
                "SELECT COUNT(*) as c FROM demo_views WHERE prospect_id = ? AND viewed_at >= ? AND viewed_at < ?"
              ).bind(prospectId, twentyFourHoursAgo, timestamp).first();
              if (!otherViews || otherViews.c === 0) {
                if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
                  const tgMsg = `\u{1F525} <b>${escapeHtml2(companyName)}</b> abri\xF3 su demo`;
                  await notifyFounder(env, tgMsg).catch(() => {
                  });
                }
              }
            }
          } catch (e) {
            console.warn("Error resolving demo token or logging view:", e);
          }
        }
        return handleEdgeDemoPage(companyName, tradeName, phone);
      }
      if (path === "/demo/cta" && method === "GET") {
        const token = url.searchParams.get("p");
        if (token) {
          try {
            const prospect = await env.RADAR_DB.prepare("SELECT id, name FROM prospects WHERE demo_token = ?").bind(token).first();
            if (prospect) {
              const timestamp = (/* @__PURE__ */ new Date()).toISOString();
              await env.RADAR_DB.prepare("INSERT INTO prospect_events (prospect_id, event_type, content, created_at) VALUES (?, 'demo_cta_clicked', ?, ?)").bind(prospect.id, "demo_cta_clicked", "Clicked CTA button in personalized demo", timestamp).run();
              await env.RADAR_DB.prepare("UPDATE prospects SET outcome = 'demo_cta_clicked', updated_at = ? WHERE id = ?").bind(timestamp, prospect.id).run();
              if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
                const ctaMsg = `\u{1F3AF} <b>${escapeHtml2(prospect.name)}</b> hizo clic en el CTA de su demo interactiva!`;
                await notifyFounder(env, ctaMsg).catch(() => {
                });
              }
            }
          } catch (e) {
            console.warn("Error tracking demo CTA click:", e);
          }
        }
        return Response.redirect("https://bvelt.app", 302);
      }
      const cleanTelegramPath = path.replace(/\/$/, "");
      const isTelegramWebhookRoute = cleanTelegramPath === "/telegram/webhook" || cleanTelegramPath === "/telegram-webhook" || cleanTelegramPath === "/api/telegram-webhook" || cleanTelegramPath === "/api/telegram/webhook" || cleanTelegramPath === "/webhook/telegram" || cleanTelegramPath === "/webhook" || cleanTelegramPath === "/telegram";
      if (isTelegramWebhookRoute) {
        if (request.method === "GET") {
          const rawBotToken = env.TELEGRAM_BOT_TOKEN ? String(env.TELEGRAM_BOT_TOKEN).trim() : "";
          const botToken = rawBotToken.replace(/^["']|["']$/g, "").replace(/^bot/i, "");
          const chatId = env.TELEGRAM_CHAT_ID ? String(env.TELEGRAM_CHAT_ID).trim() : "";
          const action = url.searchParams.get("action") || "";
          const shouldSetWebhook = url.searchParams.get("set_webhook") === "true" || action === "set_webhook";
          let webhookSetupResult = null;
          let webhookInfo = null;
          let botSelfTest = null;
          if (botToken) {
            try {
              const meRes = await fetch(`https://api.telegram.org/bot${botToken}/getMe`, {
                signal: AbortSignal.timeout(15e3)
              });
              botSelfTest = await meRes.json().catch(() => null);
            } catch (e) {
              botSelfTest = { ok: false, error: e.message };
            }
            if (shouldSetWebhook) {
              const webhookUrl = `${url.origin}/telegram-webhook`;
              const setupPayload = {
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
                  signal: AbortSignal.timeout(6e3)
                });
                webhookSetupResult = await setRes.json().catch(() => ({ ok: false }));
              } catch (e) {
                webhookSetupResult = { ok: false, error: e.message };
              }
            }
            try {
              const infoRes = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`, {
                signal: AbortSignal.timeout(15e3)
              });
              webhookInfo = await infoRes.json().catch(() => null);
            } catch (e) {
              webhookInfo = { ok: false, error: e.message };
            }
          }
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
            setup_tip: shouldSetWebhook ? webhookSetupResult?.ok ? "Webhook registrado exitosamente en Telegram." : "Fallo al registrar webhook. Revisa bot_info y error." : "Para registrar este webhook URL en Telegram, visita esta URL con ?set_webhook=true"
          }, { headers: corsHeaders });
        }
        if (request.method === "POST") {
          return await handleTelegramWebhook(request, env, corsHeaders);
        }
        return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
      }
      if ((path === "/api/email-test" || path === "/email-test" || path === "/api/radar/test-email") && (method === "GET" || method === "POST")) {
        if (!isAuthorized(request, env, serviceKey, validSessionHash)) {
          return Response.json({ error: "unauthorized" }, { status: 401, headers: corsHeaders });
        }
        let recipient = "";
        if (method === "POST") {
          try {
            const body = await request.json();
            recipient = body.to || body.email || "";
          } catch (e) {
          }
        }
        if (!recipient) {
          recipient = url.searchParams.get("to") || url.searchParams.get("email") || (env.OUTBOUND_EMAIL_FROM || "").replace(/.*<([^>]+)>.*/, "$1") || "test@example.com";
        }
        const testRes = await dispatchEmail({
          to: recipient,
          recipientName: "Bvelt Founder Test",
          subject: "Bvelt email delivery check",
          body: `Hello,

You requested an email delivery check from Bvelt Radar. This message confirms that the configured sender can submit email to this mailbox.

No action is required.

Sent at: ${(/* @__PURE__ */ new Date()).toISOString()}`,
          includeSiteLink: false,
          plainTextOnly: true,
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
      if ((path === "/verify-key" || path === "/api/verify-key") && method === "POST") {
        const body = await request.json().catch(() => ({}));
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
      if ((path === "/logout" || path === "/api/logout") && method === "POST") {
        const resHeaders = new Headers(corsHeaders);
        resHeaders.set("Set-Cookie", "bvelt_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0");
        resHeaders.set("Content-Type", "application/json");
        return new Response(JSON.stringify({ success: true, logged_out: true }), {
          status: 200,
          headers: resHeaders
        });
      }
      const isWorkerApiPath = path.startsWith("/api/") || path.startsWith("/webhook") || path.startsWith("/telegram") || path.startsWith("/opportunities") || path.startsWith("/missions") || path.startsWith("/prospects") || path.startsWith("/seeds") || path.startsWith("/demo") || [
        "/run",
        "/health",
        "/stats",
        "/decision",
        "/suppression",
        "/fix-suppression",
        "/verify-key",
        "/logout",
        "/telegram-webhook",
        "/telegram/webhook"
      ].includes(path);
      if (env.ASSETS && !isWorkerApiPath) {
        const assetRes = await env.ASSETS.fetch(request);
        if (assetRes.status !== 404) {
          return assetRes;
        }
      }
      const authorized = isAuthorized(request, env, serviceKey, validSessionHash);
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
            min_score: url.searchParams.get("min_score") || null
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
            timestamp: (/* @__PURE__ */ new Date()).toISOString()
          }, { headers: corsHeaders });
        }
        return Response.json({ error: "Method Not Allowed" }, { status: 405, headers: corsHeaders });
      }
      const isWebhookPath = method === "POST" && ["/api/events", "/events", "/api/reply", "/webhook/events", "/webhook/resend", "/webhook/brevo"].includes(path);
      const webhookSecret = (env.WEBHOOK_SECRET || env.TELEGRAM_WEBHOOK_SECRET || "").trim() || void 0;
      const webhookOk = isWebhookPath && !!webhookSecret && url.searchParams.get("token") === webhookSecret;
      const isResearchCallbackPath = path.startsWith("/api/research/") || path.startsWith("/research/");
      const isTenantScopedRequest = (method === "GET" || method === "POST") && ["/api/tenants/config", "/tenants/config"].includes(path) || method === "POST" && ["/api/tenants/search", "/tenants/search", "/api/bvelt/bootstrap", "/bvelt/bootstrap", "/api/prospects/outcome", "/prospects/outcome"].includes(path) || method === "GET" && ["/api/tenants/leads.csv", "/tenants/leads.csv", "/api/tenants/roi", "/tenants/roi", "/api/bvelt/leads", "/bvelt/leads"].includes(path);
      if (isResearchCallbackPath) {
        if (!isSidecarCallbackAuthorized(request, env)) {
          return Response.json({ error: "Unauthorized. Missing or invalid callback key." }, { status: 401, headers: corsHeaders });
        }
      } else if (!authorized && !webhookOk && !isTenantScopedRequest) {
        return Response.json({ error: "Unauthorized. Missing or invalid service key." }, { status: 401, headers: corsHeaders });
      }
      if (path === "/stats" && method === "GET") {
        return await handleStats(env, corsHeaders);
      }
      if ((path === "/api/digest/now" || path === "/digest/now") && (method === "GET" || method === "POST")) {
        const r = await sendRadarDigest(env, { force: true });
        return Response.json({ success: r.sent, verdict: r.verdict, headline: r.headline, telegram: r.telegram, data: r.data }, { headers: corsHeaders });
      }
      if (path === "/decision" && method === "POST") {
        const body = await request.json();
        const id = body.id || body.prospect_id;
        const action = body.action || body.event_type;
        const notes = body.notes || body.content || body.text;
        if (!id || !action) {
          return Response.json({ error: "Missing required fields: id and action" }, { status: 400, headers: corsHeaders });
        }
        return await handleDecision(id, action, notes, env, corsHeaders);
      }
      if (path === "/suppression" && method === "POST") {
        const { key, reason } = await request.json();
        if (!key || !reason) {
          return Response.json({ error: "Missing key or reason" }, { status: 400, headers: corsHeaders });
        }
        await env.RADAR_DB.prepare(
          "INSERT OR REPLACE INTO suppression (key, reason, created_at) VALUES (?, ?, ?)"
        ).bind(key.toLowerCase(), reason, (/* @__PURE__ */ new Date()).toISOString()).run();
        return Response.json({ success: true, message: `Added ${key} to suppression list.` }, { headers: corsHeaders });
      }
      if ((path === "/fix-suppression" || path === "/api/fix-suppression") && method === "POST") {
        if (!authorized) {
          return Response.json({ error: "Unauthorized. Missing or invalid service key." }, { status: 401, headers: corsHeaders });
        }
        let deletedInvalidSuppressions = 0;
        let reactivatedProspects = 0;
        try {
          const suppRows = await env.RADAR_DB.prepare(
            "SELECT key, reason FROM suppression WHERE lower(reason) LIKE '%invalid%' OR lower(reason) LIKE '%bounced%'"
          ).all();
          const items = suppRows.results || [];
          for (const item of items) {
            const check = sanitizeEmail(item.key);
            if (!check.valid) {
              await env.RADAR_DB.prepare("DELETE FROM suppression WHERE key = ?").bind(item.key).run();
              deletedInvalidSuppressions++;
            }
          }
        } catch (e) {
          console.warn("[fix-suppression] Error cleaning suppression entries:", e);
        }
        let retriedResendBounces = 0;
        let reactivatedBouncedProspects = 0;
        try {
          let reqBody = {};
          try {
            reqBody = await request.json();
          } catch {
            reqBody = {};
          }
          const retryFlag = String(reqBody?.retry_resend_bounces || url.searchParams.get("retry_resend_bounces") || "").trim().toLowerCase() === "true";
          if (retryFlag) {
            const bounceRows = await env.RADAR_DB.prepare(
              "SELECT key FROM suppression WHERE lower(COALESCE(reason,'')) = 'resend_bounced'"
            ).all();
            const bouncedEmails = [];
            for (const item of bounceRows.results || []) {
              await env.RADAR_DB.prepare("DELETE FROM suppression WHERE key = ?").bind(item.key).run();
              retriedResendBounces++;
              bouncedEmails.push(String(item.key).trim().toLowerCase());
            }
            if (bouncedEmails.length > 0) {
              const placeholders = bouncedEmails.map(() => "?").join(",");
              const react = await env.RADAR_DB.prepare(
                `UPDATE prospects SET status = 'qualified', cooldown_until = NULL, updated_at = ? WHERE lower(COALESCE(email,'')) IN (${placeholders}) AND status IN ('suppressed','bounced')`
              ).bind((/* @__PURE__ */ new Date()).toISOString(), ...bouncedEmails).run();
              reactivatedBouncedProspects = react?.meta?.changes || 0;
            }
          }
        } catch (e) {
          console.warn("[fix-suppression] resend_bounced retry error:", e);
        }
        try {
          const softRows = await env.RADAR_DB.prepare(
            "SELECT key, reason, created_at FROM suppression WHERE lower(reason) LIKE '%contacted on%' OR lower(reason) LIKE '%cooldown%'"
          ).all();
          const nowMs = Date.now();
          const softMs = 25 * 24 * 60 * 60 * 1e3;
          for (const item of softRows.results || []) {
            const reason = String(item.reason || "");
            const rl = reason.toLowerCase();
            if (rl.includes("bounce") || rl.includes("complaint") || rl.includes("unsubscribe")) continue;
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
        try {
          const future40d = new Date(Date.now() + 40 * 24 * 60 * 60 * 1e3).toISOString();
          const reactivateResult = await env.RADAR_DB.prepare(`
            UPDATE prospects
            SET status = 'qualified', cooldown_until = NULL, updated_at = ?
            WHERE cooldown_until > ? AND COALESCE(score, opportunity_score, 0) >= 50
          `).bind((/* @__PURE__ */ new Date()).toISOString(), future40d).run();
          reactivatedProspects = reactivateResult?.meta?.changes || 0;
        } catch (e) {
          console.warn("[fix-suppression] Error reactivating prospects:", e);
        }
        return Response.json({
          success: true,
          deleted_invalid_suppressions: deletedInvalidSuppressions,
          reactivated_prospects: reactivatedProspects,
          retried_resend_bounces: retriedResendBounces,
          reactivated_bounced_prospects: reactivatedBouncedProspects,
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        }, { headers: corsHeaders });
      }
      if ((path === "/prospects" || path === "/api/prospects") && method === "GET") {
        const limit = url.searchParams.get("limit") || "100";
        const status = url.searchParams.get("status");
        const tenantId = url.searchParams.get("tenant_id") || "founder";
        let queryStr = "SELECT * FROM prospects WHERE COALESCE(tenant_id,'founder') = ?";
        const params = [tenantId];
        if (status) {
          queryStr += " AND status = ?";
          params.push(status);
        }
        queryStr += " ORDER BY created_at DESC LIMIT ?";
        params.push(parseInt(limit, 10));
        const results = await env.RADAR_DB.prepare(queryStr).bind(...params).all();
        return Response.json(results.results || [], { headers: corsHeaders });
      }
      if ((path === "/opportunities" || path === "/api/opportunities") && method === "GET") {
        const limit = parseInt(url.searchParams.get("limit") || "100", 10);
        const tenantId = url.searchParams.get("tenant_id");
        const minScore = parseInt(url.searchParams.get("min_score") || "0", 10);
        const scopeTenant = (tenantId || "founder").trim() || "founder";
        try {
          await ensureOpportunitiesSchema(env.RADAR_DB);
          await env.RADAR_DB.prepare(`
            UPDATE opportunities
            SET tenant_id = 'founder'
            WHERE tenant_id IS NULL OR TRIM(tenant_id) = '' OR LOWER(TRIM(tenant_id)) = 'null'
          `).run();
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
        } catch (normErr) {
          console.warn("[GET /opportunities] tenant normalize:", normErr?.message || normErr);
        }
        try {
          const cnt = await env.RADAR_DB.prepare(
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
            const nowIso = (/* @__PURE__ */ new Date()).toISOString();
            for (const pr of ps.results || []) {
              const strat = Math.round(pr.opportunity_score || pr.score || 50);
              const tid = scopeTenant;
              const ttl = `${pr.name} \u2014 ${pr.trade || "service"} (${pr.city || ""})`;
              try {
                await env.RADAR_DB.prepare(`
                  INSERT OR IGNORE INTO opportunities (
                    id, prospect_id, tenant_id, mode, title, first_seen_at, last_seen_at, status, strategic_score,
                    fit_score, intent_score, pain_score, expected_value, decision_state, why_now_json, priority_tier, created_at, updated_at
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).bind(
                  `opp_${pr.id}`,
                  pr.id,
                  tid,
                  tid === "founder" ? "founder" : "tenant",
                  ttl,
                  nowIso,
                  nowIso,
                  strat,
                  pr.fit_score || strat,
                  pr.intent_score || Math.round(strat * 0.8),
                  pr.pain_score || 50,
                  pr.expected_value || 0,
                  pr.decision_state || "identified",
                  pr.why_now_json || null,
                  strat >= 80 ? "high" : strat >= 55 ? "medium" : "low",
                  nowIso,
                  nowIso
                ).run();
              } catch {
                try {
                  await env.RADAR_DB.prepare(`
                    INSERT OR IGNORE INTO opportunities (id, prospect_id, tenant_id, mode, title, first_seen_at, last_seen_at, strategic_score, priority_tier, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                  `).bind(
                    `opp_${pr.id}`,
                    pr.id,
                    tid,
                    tid === "founder" ? "founder" : "tenant",
                    ttl,
                    nowIso,
                    nowIso,
                    strat,
                    strat >= 80 ? "high" : strat >= 55 ? "medium" : "low",
                    nowIso,
                    nowIso
                  ).run();
                } catch {
                }
              }
            }
          }
        } catch (healErr) {
          console.warn("[GET /opportunities] auto-heal failed:", healErr?.message || healErr);
        }
        const attempts = [
          {
            sql: `SELECT o.*, p.name as prospect_name, p.city as prospect_city, p.trade as prospect_trade,
                         p.website as prospect_website, p.phone as prospect_phone, p.email as prospect_email,
                         p.status as prospect_status, p.draft_subject, p.draft_body
                  FROM opportunities o
                  LEFT JOIN prospects p ON o.prospect_id = p.id
                  WHERE COALESCE(o.strategic_score, 0) >= ?
                    AND COALESCE(NULLIF(TRIM(o.tenant_id), ''), 'founder') = ?
                  ORDER BY COALESCE(o.strategic_score, 0) DESC, o.created_at DESC LIMIT ?`,
            binds: [minScore, scopeTenant, limit]
          },
          {
            sql: `SELECT * FROM opportunities
                  WHERE COALESCE(strategic_score, 0) >= ?
                    AND COALESCE(NULLIF(TRIM(tenant_id), ''), 'founder') = ?
                  ORDER BY COALESCE(strategic_score, 0) DESC LIMIT ?`,
            binds: [minScore, scopeTenant, limit]
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
            binds: [scopeTenant, minScore, limit]
          },
          {
            sql: `SELECT * FROM opportunities
                  WHERE COALESCE(NULLIF(TRIM(tenant_id), ''), 'founder') = ?
                  ORDER BY rowid DESC LIMIT ?`,
            binds: [scopeTenant, limit]
          }
        ];
        for (const a of attempts) {
          try {
            const res = await env.RADAR_DB.prepare(a.sql).bind(...a.binds).all();
            const rows = res.results || [];
            if (rows.length > 0 || a === attempts[attempts.length - 1]) {
              return Response.json(rows, { headers: corsHeaders });
            }
          } catch (e) {
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
        } catch (e) {
          return Response.json({ error: e.message }, { status: 500, headers: corsHeaders });
        }
      }
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
          let prospects = [];
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
          const errors = [];
          for (const p of prospects) {
            const oppId = `opp_${p.id}`;
            try {
              const already = await env.RADAR_DB.prepare(`SELECT id FROM opportunities WHERE id = ? OR prospect_id = ? LIMIT 1`).bind(oppId, p.id).first();
              if (already) {
                skippedExisting++;
                continue;
              }
            } catch {
            }
            const stratScore = Math.round(Number(p.opportunity_score || p.score || 50));
            try {
              const ok = await upsertOpportunity(env.RADAR_DB, {
                id: oppId,
                prospect_id: p.id,
                tenant_id: scopeTenant,
                mode: scopeTenant === "founder" ? "founder" : "tenant",
                title: `${p.name} \u2014 ${p.trade || "service"} (${p.city || ""})`,
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
                priority_tier: stratScore >= 80 ? "high" : stratScore >= 55 ? "medium" : "low"
              });
              if (ok) created++;
              else {
                failed++;
                errors.push("upsert false " + p.id);
              }
            } catch (e) {
              failed++;
              if (errors.length < 5) errors.push(String(e?.message || e).slice(0, 140));
            }
          }
          const hasMore = prospects.length >= batchSize;
          return Response.json({
            success: true,
            scope_tenant: scopeTenant,
            prospects_scanned: prospects.length,
            opportunities_created: created,
            skipped_existing: skippedExisting,
            failed,
            offset,
            batch_size: batchSize,
            next_offset: hasMore ? offset + batchSize : null,
            has_more: hasMore,
            errors: errors.length ? errors : void 0,
            message: `Lote: ${created} creadas, ${skippedExisting} ya exist\xEDan, ${failed} fallos.`
          }, { headers: corsHeaders });
        } catch (e) {
          return Response.json({ error: e.message || String(e) }, { status: 500, headers: corsHeaders });
        }
      }
      if ((path === "/missions" || path === "/api/missions") && method === "GET") {
        const tenantId = url.searchParams.get("tenant_id") || "founder";
        let missions = [];
        let daily = [];
        try {
          const customMissions = await env.RADAR_DB.prepare(
            "SELECT * FROM missions WHERE COALESCE(tenant_id,'founder') = ? ORDER BY created_at DESC"
          ).bind(tenantId).all();
          missions = customMissions.results || [];
        } catch {
          try {
            const all = await env.RADAR_DB.prepare("SELECT * FROM missions ORDER BY created_at DESC LIMIT 50").all();
            missions = all.results || [];
          } catch {
          }
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
          } catch (e2) {
            console.warn("[GET /missions]", e2?.message || e2);
          }
        }
        return Response.json({ missions, daily_missions: daily }, { headers: corsHeaders });
      }
      if ((path === "/missions" || path === "/api/missions") && method === "POST") {
        const body = await request.json().catch(() => ({}));
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
        const nowIso = (/* @__PURE__ */ new Date()).toISOString();
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
        } catch (e) {
          return Response.json({ error: e.message }, { status: 500, headers: corsHeaders });
        }
      }
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
        const body = await request.json().catch(() => ({}));
        const tenantId = body.tenant_id || "founder";
        const key = body.key || body.setting_key;
        const value = body.value !== void 0 ? body.value : body.setting_value;
        if (!key) {
          return Response.json({ error: "Missing setting key" }, { status: 400, headers: corsHeaders });
        }
        const id = `set_${tenantId}_${key}`;
        const nowIso = (/* @__PURE__ */ new Date()).toISOString();
        try {
          await env.RADAR_DB.prepare(`
            INSERT INTO radar_settings (id, tenant_id, setting_key, setting_value_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              setting_value_json = excluded.setting_value_json,
              updated_at = excluded.updated_at
          `).bind(id, tenantId, key, JSON.stringify(value), nowIso, nowIso).run();
          return Response.json({ success: true, key }, { headers: corsHeaders });
        } catch (e) {
          return Response.json({ error: e.message }, { status: 500, headers: corsHeaders });
        }
      }
      if ((path === "/api/suppression" || path === "/suppression") && method === "GET") {
        const results = await env.RADAR_DB.prepare("SELECT * FROM suppression ORDER BY created_at DESC").all();
        return Response.json(results.results || [], { headers: corsHeaders });
      }
      if (path.startsWith("/api/suppression/") && method === "DELETE") {
        const key = decodeURIComponent(path.split("/").pop() || "");
        await env.RADAR_DB.prepare("DELETE FROM suppression WHERE key = ?").bind(key.toLowerCase()).run();
        return Response.json({ success: true }, { headers: corsHeaders });
      }
      if ((path === "/api/seeds" || path === "/seeds") && method === "GET") {
        const results = await env.RADAR_DB.prepare("SELECT * FROM seeds_optional ORDER BY city ASC").all();
        return Response.json(results.results || [], { headers: corsHeaders });
      }
      if ((path === "/api/seeds" || path === "/seeds") && method === "POST") {
        const body = await request.json();
        const id = crypto.randomUUID();
        await env.RADAR_DB.prepare("INSERT INTO seeds_optional (id, city, trade, notes) VALUES (?, ?, ?, ?)").bind(id, body.city, body.trade, body.notes || "").run();
        return Response.json({ id, city: body.city, trade: body.trade, notes: body.notes || "" }, { headers: corsHeaders });
      }
      if (path.startsWith("/api/seeds/") && path !== "/api/seeds/import" && method === "DELETE") {
        const id = path.split("/").pop();
        await env.RADAR_DB.prepare("DELETE FROM seeds_optional WHERE id = ?").bind(id).run();
        return Response.json({ success: true }, { headers: corsHeaders });
      }
      if ((path === "/api/seeds/import" || path === "/seeds/import") && method === "POST") {
        let csvText = "";
        const contentType = request.headers.get("content-type") || "";
        if (contentType.includes("json")) {
          const jsonBody = await request.json().catch(() => ({}));
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
        const dataRows = lines.slice(1, 1501);
        const colMap = {};
        headersRow.forEach((h, idx) => {
          const clean = h.toLowerCase().replace(/[^a-z0-9_]/g, "");
          if (colMap.name === void 0 && (clean.includes("business") || clean.includes("company") || clean.includes("name") || clean.includes("licensee") || clean.includes("dba"))) {
            colMap.name = idx;
          } else if (colMap.city === void 0 && (clean.includes("city") || clean.includes("municipality"))) {
            colMap.city = idx;
          } else if (colMap.state === void 0 && (clean === "state" || clean === "st" || clean.includes("state"))) {
            colMap.state = idx;
          } else if (colMap.zip === void 0 && (clean.includes("zip") || clean.includes("postal"))) {
            colMap.zip = idx;
          } else if (colMap.phone === void 0 && (clean.includes("phone") || clean.includes("tel") || clean.includes("mobile"))) {
            colMap.phone = idx;
          } else if (colMap.website === void 0 && (clean.includes("website") || clean.includes("url") || clean.includes("web") || clean.includes("domain"))) {
            colMap.website = idx;
          } else if (colMap.email === void 0 && (clean.includes("email") || clean.includes("mail"))) {
            colMap.email = idx;
          } else if (colMap.status === void 0 && (clean.includes("status") || clean.includes("classification") || clean.includes("type"))) {
            colMap.status = idx;
          } else if (colMap.issued === void 0 && (clean.includes("issued") || clean.includes("issue") || clean.includes("date"))) {
            colMap.issued = idx;
          }
        });
        if (colMap.name === void 0) colMap.name = 0;
        let importedCount = 0;
        let discardedCount = 0;
        const prepareStatements = [];
        for (const row of dataRows) {
          const name = row[colMap.name] || "";
          if (!name || !name.trim()) continue;
          const status = colMap.status !== void 0 ? row[colMap.status] || "" : "";
          if (isLicenseStatusInvalid(status)) {
            discardedCount++;
            continue;
          }
          const city = colMap.city !== void 0 ? row[colMap.city] || "" : "";
          const state = colMap.state !== void 0 ? row[colMap.state] || "" : "";
          const zip = colMap.zip !== void 0 ? row[colMap.zip] || "" : "";
          const phone = colMap.phone !== void 0 ? row[colMap.phone] || "" : "";
          const website = colMap.website !== void 0 ? row[colMap.website] || "" : "";
          const email = colMap.email !== void 0 ? row[colMap.email] || "" : "";
          const issued = colMap.issued !== void 0 ? row[colMap.issued] || "" : "";
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
          ).bind(`${dummyProspect.name.toLowerCase()}_${dummyProspect.city.toLowerCase()}`.replace(/\s+/g, "_"), "Manual test suppression", (/* @__PURE__ */ new Date()).toISOString()).run();
        }
        const gateResult = await verifyTrustStackGate(dummyProspect, "test-run-001", env, testCase);
        return Response.json({
          test_case: testCase,
          prospect: dummyProspect,
          gate_result: gateResult
        }, { headers: corsHeaders });
      }
      if ((path === "/api/events" || path === "/events" || path === "/api/reply" || path === "/webhook/events" || path === "/webhook/resend" || path === "/webhook/brevo") && method === "POST") {
        const rawBody = await request.json().catch(() => ({}));
        const rawEvents = Array.isArray(rawBody) ? rawBody : [rawBody];
        const results = [];
        for (const body of rawEvents) {
          let prospectId = body.prospect_id || body.id || null;
          let email = body.email || null;
          let eventType = body.event_type || body.event || body.action || null;
          let content = body.content || body.text || body.body || body.notes || null;
          if (body.type && body.data) {
            const resendType = String(body.type).toLowerCase();
            if (resendType.includes("opened") || resendType.includes("open")) eventType = "opened";
            else if (resendType.includes("clicked") || resendType.includes("click")) eventType = "clicked";
            else if (resendType.includes("bounced") || resendType.includes("bounce")) eventType = "bounced";
            else if (resendType.includes("delivered")) eventType = "delivered";
            else if (resendType.includes("complained") || resendType.includes("spam")) eventType = "negative";
            else if (resendType.includes("received")) {
              eventType = "replied";
              const inboundFrom = String(body.data.from || "").trim();
              if (inboundFrom) email = inboundFrom.toLowerCase();
              try {
                const inboundId = String(body.data.email_id || "");
                const apiKey = String(env.RESEND_API_KEY || "").trim();
                if (inboundId && apiKey) {
                  const inboundRes = await fetch(`https://api.resend.com/emails/${encodeURIComponent(inboundId)}`, {
                    headers: { Authorization: `Bearer ${apiKey}` },
                    signal: AbortSignal.timeout(8e3)
                  });
                  if (inboundRes.ok) {
                    const inboundData = await inboundRes.json().catch(() => ({}));
                    content = inboundData?.text || inboundData?.subject || content;
                    const forwardTo = String(env.REPLY_FORWARD_TO || "").trim();
                    if (forwardTo) {
                      const fwdHtml = String(inboundData?.html || "");
                      const fwdText = String(inboundData?.text || "");
                      const fwdPayload = {
                        from: String(env.OUTBOUND_EMAIL_FROM || "").trim() || Array.isArray(inboundData?.to) && inboundData.to[0] || "replies@bvelt.app",
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
                        signal: AbortSignal.timeout(8e3)
                      });
                    }
                  }
                }
              } catch (e) {
                console.warn("[webhook] email.received processing error:", e?.message || e);
              }
            } else if (resendType.includes("incoming") || resendType.includes("reply") || resendType.includes("replied")) {
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
        const matrix = testCases.map((tc) => {
          const classified = classifyReplyText(tc.rawType, tc.content);
          return {
            case_name: tc.name,
            input_type: tc.rawType,
            input_content: tc.content,
            classified_as: classified,
            pass: classified === tc.name
          };
        });
        const allPassed = matrix.every((m) => m.pass);
        return Response.json({
          all_tests_passed: allPassed,
          total_cases: matrix.length,
          results: matrix
        }, { headers: corsHeaders });
      }
      if (path === "/api/test/auto-stop") {
        const testCaseType = url.searchParams.get("type") || "positive";
        const dummyId = `test-autostop-${Date.now()}`;
        const timestamp = (/* @__PURE__ */ new Date()).toISOString();
        const dummyToken = crypto.randomUUID().replace(/-/g, "");
        await env.RADAR_DB.prepare(`
          INSERT INTO prospects (id, name, city, trade, email, phone, score, status, outcome, bvelt_angle, variant_id, created_at, updated_at, demo_token)
          VALUES (?, 'AutoStop Test Contractor', 'Tampa, FL', 'plumbing', 'autostop@example.com', '+18135550100', 80, 'notified', 'sent', 'missed_calls', 'missed_calls', ?, ?, ?)
        `).bind(dummyId, timestamp, timestamp, dummyToken).run();
        const sampleContentMap = {
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
          email: "autostop@example.com",
          event_type: testCaseType === "bounced" ? "bounced" : "replied",
          content: sampleContent
        }, env);
        const updatedProspect = await env.RADAR_DB.prepare("SELECT * FROM prospects WHERE id = ?").bind(dummyId).first();
        await env.RADAR_DB.prepare("DELETE FROM prospects WHERE id = ?").bind(dummyId).run();
        return Response.json({
          test_case: testCaseType,
          event_result: eventResult,
          updated_status: updatedProspect?.status,
          updated_outcome: updatedProspect?.outcome,
          response_type: updatedProspect?.response_type,
          cooldown_until: updatedProspect?.cooldown_until,
          auto_sequence_stopped: eventResult.auto_stopped && updatedProspect?.status !== "notified"
        }, { headers: corsHeaders });
      }
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
        const body = await request.json().catch(() => ({}));
        const tenantId = String(body.tenant_id || "").trim();
        if (!tenantId) {
          return Response.json({ error: "tenant_id required" }, { status: 400, headers: corsHeaders });
        }
        if (tenantId === "founder") {
          return Response.json({ error: "tenant_id_invalid" }, { status: 400, headers: corsHeaders });
        }
        if (!auth.canAccessTenant(tenantId)) {
          return Response.json({ error: "Forbidden: cannot modify configuration for another tenant" }, { status: 403, headers: corsHeaders });
        }
        const industry = String(body.industry || body.trade || "").trim();
        const niche = String(body.niche || body.trade || "").trim();
        const cities = (Array.isArray(body.cities) ? body.cities : body.city ? [body.city] : []).map((value) => String(value || "").trim()).filter(Boolean);
        const missingFields = [
          !industry ? "industry" : null,
          !niche ? "niche" : null,
          cities.length === 0 ? "cities" : null
        ].filter(Boolean);
        if (missingFields.length > 0) {
          return Response.json({
            error: "tenant_profile_incomplete",
            missing_fields: missingFields
          }, { status: 409, headers: corsHeaders });
        }
        const timestamp = (/* @__PURE__ */ new Date()).toISOString();
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
          industry,
          niche,
          JSON.stringify(Array.isArray(body.subniches) ? body.subniches : []),
          JSON.stringify(Array.isArray(body.services) ? body.services : []),
          JSON.stringify(Array.isArray(body.service_areas) ? body.service_areas : []),
          JSON.stringify(Array.isArray(body.countries) ? body.countries : []),
          JSON.stringify(Array.isArray(body.regions) ? body.regions : []),
          JSON.stringify(cities),
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
        return Response.json({ success: true, tenant_id: tenantId, run_id: null, message: "Tenant config saved. Prospecting has not started." }, { headers: corsHeaders });
      }
      if ((path === "/api/tenants/search" || path === "/tenants/search") && method === "POST") {
        const auth = resolveTenantAuthContext(request, env, serviceKey, validSessionHash);
        if (!auth.authorized) return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
        const body = await request.json().catch(() => ({}));
        const tenantId = String(body.tenant_id || auth.tenantId || "").trim();
        const trigger = body.trigger === "activity" ? "activity" : "manual";
        if (!tenantId || tenantId === "founder") return Response.json({ error: "tenant_id_required" }, { status: 400, headers: corsHeaders });
        if (!auth.canAccessTenant(tenantId)) return Response.json({ error: "Forbidden" }, { status: 403, headers: corsHeaders });
        const config = await env.RADAR_DB.prepare("SELECT tenant_id, niche, subniches_json, cities_json, countries_json, languages_json FROM tenant_config WHERE tenant_id = ?").bind(tenantId).first();
        if (!config) return Response.json({ error: "tenant_configuration_not_found" }, { status: 404, headers: corsHeaders });
        let cities = [];
        let niches = [];
        try {
          cities = JSON.parse(config.cities_json || "[]");
        } catch {
        }
        try {
          niches = JSON.parse(config.subniches_json || "[]");
        } catch {
        }
        if (!niches.length && config.niche) niches = [String(config.niche)];
        cities = cities.map((v) => String(v).trim()).filter(Boolean);
        niches = niches.map((v) => String(v).trim()).filter(Boolean);
        if (!cities.length || !niches.length) {
          return Response.json({ error: "tenant_profile_incomplete", missing_fields: [!niches.length ? "niche" : null, !cities.length ? "city" : null].filter(Boolean) }, { status: 409, headers: corsHeaders });
        }
        await env.RADAR_DB.prepare("CREATE TABLE IF NOT EXISTS tenant_refresh_log (tenant_id TEXT PRIMARY KEY, last_at TEXT NOT NULL)").run();
        const previous = await env.RADAR_DB.prepare("SELECT last_at FROM tenant_refresh_log WHERE tenant_id = ?").bind(tenantId).first();
        if (trigger === "activity" && previous?.last_at && Date.now() - Date.parse(previous.last_at) < 6 * 60 * 60 * 1e3) {
          return Response.json({ success: true, status: "recent_results_available", tenant_id: tenantId, last_started_at: previous.last_at }, { headers: corsHeaders });
        }
        if (previous?.last_at && Date.now() - Date.parse(previous.last_at) < 60 * 1e3) {
          return Response.json({ success: true, status: "already_started", tenant_id: tenantId }, { headers: corsHeaders });
        }
        const now = (/* @__PURE__ */ new Date()).toISOString();
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
        } catch (error) {
          await env.RADAR_DB.prepare("DELETE FROM tenant_refresh_log WHERE tenant_id = ? AND last_at = ?").bind(tenantId, now).run();
          return Response.json({ error: error?.message || "tenant_search_failed" }, { status: 500, headers: corsHeaders });
        }
      }
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
          const esc = /* @__PURE__ */ __name((v) => {
            const s = v == null ? "" : String(v);
            if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
            return s;
          }, "esc");
          const header = "name,trade,city,phone,email,website,score,status,tenant_outcome,won_value_usd,angle,created_at";
          const lines = [header];
          for (const r of rows.results || []) {
            lines.push([r.name, r.trade, r.city, r.phone, r.email, r.website, r.score, r.status, r.tenant_outcome, r.won_value_usd, r.bvelt_angle, r.created_at].map(esc).join(","));
          }
          return new Response(lines.join("\n"), {
            headers: {
              ...corsHeaders,
              "Content-Type": "text/csv; charset=utf-8",
              "Content-Disposition": 'attachment; filename="tenant-leads.csv"'
            }
          });
        } catch (e) {
          return Response.json({ error: e.message }, { status: 500, headers: corsHeaders });
        }
      }
      if ((path === "/api/bvelt/bootstrap" || path === "/bvelt/bootstrap") && method === "POST") {
        const auth = resolveTenantAuthContext(request, env, serviceKey, validSessionHash);
        if (!auth.authorized) {
          return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
        }
        try {
          const body = await request.json().catch(() => ({}));
          const targetTenantId = body.tenant_id || body.user_id;
          if (targetTenantId && !auth.canAccessTenant(targetTenantId)) {
            return Response.json({ error: "Forbidden: cross-tenant bootstrap denied" }, { status: 403, headers: corsHeaders });
          }
          const result = await bootstrapBveltTenant(env, body, ctx);
          return Response.json(result, { headers: corsHeaders });
        } catch (e) {
          return Response.json({ error: e.message || String(e) }, { status: 500, headers: corsHeaders });
        }
      }
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
          const leads = (rows.results || []).map((p) => ({
            ...p,
            attack_kit: buildAttackKit(p)
          }));
          return Response.json({ tenant_id: tenantId, leads, count: leads.length }, { headers: corsHeaders });
        } catch (e) {
          return Response.json({ tenant_id: tenantId, leads: [], count: 0, error: e.message }, { headers: corsHeaders });
        }
      }
      if ((path === "/api/prospects/outcome" || path === "/prospects/outcome") && method === "POST") {
        const auth = resolveTenantAuthContext(request, env, serviceKey, validSessionHash);
        if (!auth.authorized) {
          return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
        }
        const body = await request.json().catch(() => ({}));
        const { prospect_id, tenant_id, outcome, value_usd } = body;
        if (!prospect_id || !tenant_id || !outcome) {
          return Response.json({ error: "Missing required fields: prospect_id, tenant_id, outcome" }, { status: 400, headers: corsHeaders });
        }
        if (!auth.canAccessTenant(tenant_id)) {
          return Response.json({ error: "Forbidden: cross-tenant outcome submission denied" }, { status: 403, headers: corsHeaders });
        }
        const validOutcomes = ["contacted", "replied", "booked", "won", "lost"];
        if (!validOutcomes.includes(outcome)) {
          return Response.json({ error: "Invalid outcome value" }, { status: 400, headers: corsHeaders });
        }
        const prospect = await env.RADAR_DB.prepare("SELECT * FROM prospects WHERE id = ? AND mode = 'tenant' AND tenant_id = ?").bind(prospect_id, tenant_id).first();
        if (!prospect) {
          return Response.json({ error: "Prospect not found for this tenant" }, { status: 404, headers: corsHeaders });
        }
        const parsedValue = value_usd === void 0 || value_usd === null || value_usd === "" ? null : Number(value_usd);
        if (parsedValue !== null && (!Number.isFinite(parsedValue) || parsedValue < 0)) {
          return Response.json({ error: "value_usd must be a finite non-negative number" }, { status: 400, headers: corsHeaders });
        }
        const timestamp = (/* @__PURE__ */ new Date()).toISOString();
        const outcomeChanged = String(prospect.tenant_outcome || "") !== outcome;
        await env.RADAR_DB.prepare(
          "UPDATE prospects SET tenant_outcome = ?, won_value_usd = CASE WHEN ? = 'won' THEN COALESCE(?, won_value_usd) ELSE won_value_usd END, updated_at = ? WHERE id = ? AND mode = 'tenant' AND tenant_id = ?"
        ).bind(outcome, outcome, parsedValue, timestamp, prospect_id, tenant_id).run();
        if (outcome !== "contacted") {
          await recordLearningEvent(
            env.RADAR_DB,
            prospect.city,
            prospect.trade,
            prospect.variant_id || null,
            false,
            {
              event_type: "contacted",
              prospect_id: String(prospect.id),
              mode: "tenant",
              tenant_id,
              idempotency_key: `tenant-outcome:${prospect.id}:contacted`
            }
          );
        }
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
            tenant_id,
            value_usd: parsedValue,
            idempotency_key: `tenant-outcome:${prospect.id}:${outcome}`
          }
        );
        await sendTenantObservationsToBvelt(env, tenant_id, {
          prospectIds: [String(prospect_id)]
        }).catch((error) => console.warn("[Tenant Bvelt Sync] Outcome sync failed:", error));
        if (outcomeChanged && prospect.city && prospect.trade) {
          try {
            const place = findPlace(prospect.city);
            if (place) {
              const placeKeyStr = placeKey(place);
              if (prospect.tenant_outcome === "won" && outcome !== "won") {
                await env.RADAR_DB.prepare(
                  "UPDATE geo_coverage SET wins = MAX(0, wins - 1) WHERE tenant_id = ? AND place_key = ? AND trade = ?"
                ).bind(tenant_id, placeKeyStr, prospect.trade.toLowerCase()).run();
              }
              if (outcome === "won" && prospect.tenant_outcome !== "won") {
                await env.RADAR_DB.prepare(
                  "UPDATE geo_coverage SET wins = wins + 1 WHERE tenant_id = ? AND place_key = ? AND trade = ?"
                ).bind(tenant_id, placeKeyStr, prospect.trade.toLowerCase()).run();
              }
              const wasReplyStage = prospect.tenant_outcome === "replied" || prospect.tenant_outcome === "booked";
              const isReplyStage = outcome === "replied" || outcome === "booked";
              if (!wasReplyStage && isReplyStage) {
                await env.RADAR_DB.prepare(
                  "UPDATE geo_coverage SET replies = replies + 1 WHERE tenant_id = ? AND place_key = ? AND trade = ?"
                ).bind(tenant_id, placeKeyStr, prospect.trade.toLowerCase()).run();
              }
            }
          } catch (e) {
          }
        }
        return Response.json({ success: true, prospect_id, outcome }, { headers: corsHeaders });
      }
      if ((path === "/api/tenants/roi" || path === "/tenants/roi") && method === "GET") {
        const tenantId = url.searchParams.get("tenant_id") || "founder";
        const auth = resolveTenantAuthContext(request, env, serviceKey, validSessionHash);
        if (!auth.authorized) {
          return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
        }
        if (!auth.canAccessTenant(tenantId)) {
          return Response.json({ error: "Forbidden: cross-tenant ROI access denied" }, { status: 403, headers: corsHeaders });
        }
        try {
          const res = await env.RADAR_DB.prepare(`
            SELECT 
              COUNT(*) as total,
              SUM(CASE WHEN status IN ('scouted','qualified','scored','enriched') THEN 1 ELSE 0 END) as pipeline,
              SUM(CASE WHEN status IN ('sent','queued','approved','notified') THEN 1 ELSE 0 END) as outreach,
              SUM(CASE WHEN status IN ('sent','queued','approved','notified','replied','booked','converted','won','lost')
                         OR outcome IN ('sent','positive','replied','booked','won','lost','converted')
                         OR tenant_outcome IN ('contacted','replied','booked','won','lost') THEN 1 ELSE 0 END) as conversion_denominator,
              SUM(CASE WHEN status IN ('replied','booked') OR outcome IN ('positive','replied','booked')
                         OR tenant_outcome IN ('replied','booked') THEN 1 ELSE 0 END) as replied,
              SUM(CASE WHEN status = 'booked' OR outcome = 'booked' OR tenant_outcome = 'booked' THEN 1 ELSE 0 END) as booked,
              SUM(CASE WHEN status IN ('won','converted') OR outcome IN ('won','converted') OR tenant_outcome = 'won' THEN 1 ELSE 0 END) as won,
              SUM(CASE WHEN status = 'lost' OR outcome = 'lost' OR tenant_outcome = 'lost' THEN 1 ELSE 0 END) as lost,
              SUM(CASE WHEN status IN ('sent','queued','approved','notified','replied','booked','converted','won','lost')
                         OR outcome IN ('sent','positive','replied','booked','won','lost','converted')
                         OR tenant_outcome IN ('contacted','replied','booked','won','lost') THEN 1 ELSE 0 END) as contacted,
              SUM(COALESCE(won_value_usd, 0)) as won_value_usd_total,
              SUM(COALESCE(expected_value, opportunity_score, score, 0)) as pipeline_ev_raw,
              AVG(COALESCE(score, opportunity_score, 0)) as avg_score
            FROM prospects
            WHERE COALESCE(tenant_id, 'founder') = ?
              AND status NOT IN ('discarded','suppressed','blocked')
          `).bind(tenantId).first();
          const total = Number(res?.total || 0);
          const outreach = Number(res?.outreach || 0);
          const conversionDenominator = Number(res?.conversion_denominator || 0);
          const replied = Number(res?.replied || 0);
          const booked = Number(res?.booked || 0);
          const won = Number(res?.won || 0);
          const lost = Number(res?.lost || 0);
          const pipelineEv = Math.round(Number(res?.pipeline_ev_raw || 0));
          const replyRate = conversionDenominator > 0 ? Math.round(replied / conversionDenominator * 1e3) / 10 : 0;
          const winRate = conversionDenominator > 0 ? Math.round(won / conversionDenominator * 1e3) / 10 : 0;
          return Response.json({
            tenant_id: tenantId,
            total,
            pipeline: Number(res?.pipeline || 0),
            outreach,
            conversion_denominator: conversionDenominator,
            contacted: Number(res?.contacted || 0),
            replied,
            booked,
            won,
            lost,
            won_value_usd_total: Number(res?.won_value_usd_total || 0),
            pipeline_ev_usd: pipelineEv,
            avg_score: Math.round(Number(res?.avg_score || 0)),
            reply_rate_pct: replyRate,
            win_rate_pct: winRate
          }, { headers: corsHeaders });
        } catch (e) {
          return Response.json({
            tenant_id: tenantId,
            total: 0,
            pipeline: 0,
            outreach: 0,
            conversion_denominator: 0,
            contacted: 0,
            replied: 0,
            booked: 0,
            won: 0,
            lost: 0,
            won_value_usd_total: 0,
            pipeline_ev_usd: 0,
            avg_score: 0,
            reply_rate_pct: 0,
            win_rate_pct: 0
          }, { headers: corsHeaders });
        }
      }
      if ((path === "/api/prospects/attack-kit" || path === "/prospects/attack-kit") && method === "GET") {
        const prospectId = url.searchParams.get("id");
        if (!prospectId) {
          return Response.json({ error: "Missing id" }, { status: 400, headers: corsHeaders });
        }
        try {
          const p = await env.RADAR_DB.prepare("SELECT * FROM prospects WHERE id = ?").bind(prospectId).first();
          if (!p) return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
          const kit = buildAttackKit(p);
          return Response.json(kit, { headers: corsHeaders });
        } catch (e) {
          return Response.json({ error: e.message }, { status: 500, headers: corsHeaders });
        }
      }
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
          `).bind(tenantId).first();
          const leads = (top.results || []).map((p) => ({
            ...p,
            attack_kit: buildAttackKit(p)
          }));
          return Response.json({
            tenant_id: tenantId,
            generated_at: (/* @__PURE__ */ new Date()).toISOString(),
            total_prospects: Number(stats?.n || 0),
            outreach_sent: Number(stats?.sent_n || 0),
            top_leads: leads
          }, { headers: corsHeaders });
        } catch (e) {
          return Response.json({ error: e.message }, { status: 500, headers: corsHeaders });
        }
      }
      if (path === "/api/test/tenant-mode") {
        const dayOfYear = getDayOfYear(/* @__PURE__ */ new Date());
        const founderTargets = await getPriorityTargets(dayOfYear, env, "founder", null);
        const sampleRoofingTenantConfig = {
          tenant_id: "tenant_roofing_co_01",
          tenant_name: "Apex Commercial Roofing",
          industry: "Commercial Roofing Contractor",
          niche: "property_management",
          // Target niche is Property Managers, NOT roofing companies!
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
          created_at: (/* @__PURE__ */ new Date()).toISOString(),
          updated_at: (/* @__PURE__ */ new Date()).toISOString()
        };
        await env.RADAR_DB.prepare(`
          INSERT INTO tenant_config (
            tenant_id, tenant_name, industry, niche, subniches_json, services_json, service_areas_json,
            countries_json, regions_json, cities_json, languages_json, icp_description, icp_keywords_json,
            minimum_score, daily_outreach_limit, allowed_markets_json, campaign_goal, messaging_angle, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(tenant_id) DO UPDATE SET tenant_name = excluded.tenant_name
        `).bind(
          sampleRoofingTenantConfig.tenant_id,
          sampleRoofingTenantConfig.tenant_name,
          sampleRoofingTenantConfig.industry,
          sampleRoofingTenantConfig.niche,
          sampleRoofingTenantConfig.subniches_json,
          sampleRoofingTenantConfig.services_json,
          sampleRoofingTenantConfig.service_areas_json,
          sampleRoofingTenantConfig.countries_json,
          sampleRoofingTenantConfig.regions_json,
          sampleRoofingTenantConfig.cities_json,
          sampleRoofingTenantConfig.languages_json,
          sampleRoofingTenantConfig.icp_description,
          sampleRoofingTenantConfig.icp_keywords_json,
          sampleRoofingTenantConfig.minimum_score,
          sampleRoofingTenantConfig.daily_outreach_limit,
          sampleRoofingTenantConfig.allowed_markets_json,
          sampleRoofingTenantConfig.campaign_goal,
          sampleRoofingTenantConfig.messaging_angle,
          sampleRoofingTenantConfig.created_at,
          sampleRoofingTenantConfig.updated_at
        ).run();
        const tenantTargets = await getPriorityTargets(dayOfYear, env, "tenant", "tenant_roofing_co_01");
        const sampleContractorBusiness = { name: "Tampa Bay HVAC & Plumbing", trade: "hvac", city: "Tampa, FL", website: "tampahvac.com" };
        const samplePropertyManagerBusiness = { name: "Sunstate Property Management", trade: "property_management", city: "Tampa, FL", website: "sunstatepm.com" };
        const founderScore = calculateMultiFactorScore(
          sampleContractorBusiness,
          "contact@tampahvac.com",
          true,
          "+18135550199",
          true,
          true,
          {},
          { emergency: true, sms_gap: true },
          founderTargets.missionConfig
        );
        const tenantScore = calculateMultiFactorScore(
          samplePropertyManagerBusiness,
          "info@sunstatepm.com",
          true,
          "+18135550188",
          true,
          true,
          {},
          { quote_request: true, lead_capture: true },
          tenantTargets.missionConfig
        );
        const isNicheIndependent = founderTargets.missionConfig.target !== tenantTargets.missionConfig.target && founderTargets.missionConfig.niches[0] !== tenantTargets.missionConfig.niches[0];
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
      if (path === "/api/test/preflight") {
        const diagnostics = {
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
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
        try {
          const countRow = await env.RADAR_DB.prepare("SELECT COUNT(*) as c FROM prospects").first();
          diagnostics.d1_database = { ready: true, details: `D1 Connected. Prospects count: ${countRow?.c || 0}` };
        } catch (e) {
          diagnostics.d1_database = { ready: false, details: `D1 Error: ${e.message}` };
        }
        if (env.RADAR_QUEUE) {
          diagnostics.queue_system = { ready: true, details: "Cloudflare Queue RADAR_QUEUE binding active" };
        } else {
          diagnostics.queue_system = { ready: true, details: "Direct Queue Async execution fallback active" };
        }
        if (env.HUNTER_API_KEY) {
          try {
            const hRes = await fetch(`https://api.hunter.io/v2/account?api_key=${env.HUNTER_API_KEY}`, { signal: AbortSignal.timeout(4e3) });
            if (hRes.ok) {
              const hData = await hRes.json();
              diagnostics.hunter_api = {
                ready: true,
                key_present: true,
                details: `Hunter Account Verified: ${hData.data?.email || "Active"}. Plan: ${hData.data?.plan_name || "Free"}`
              };
            } else {
              diagnostics.hunter_api = {
                ready: false,
                key_present: true,
                details: `Hunter API HTTP ${hRes.status}: Invalid key or account issue`
              };
            }
          } catch (e) {
            diagnostics.hunter_api = { ready: false, key_present: true, details: `Hunter API fetch exception: ${e.message}` };
          }
        } else {
          diagnostics.hunter_api = {
            ready: false,
            key_present: false,
            details: "HUNTER_API_KEY secret variable is NOT configured in environment secrets."
          };
        }
        if (env.ABSTRACT_API_KEY) {
          diagnostics.abstract_api = { ready: true, key_present: true, details: "ABSTRACT_API_KEY configured for deliverability checks" };
        } else {
          diagnostics.abstract_api = { ready: true, key_present: false, details: "Basic regex & disposable domain validation fallback active" };
        }
        try {
          const testProspect = { id: "preflight-test", name: "Preflight Business", city: "Tampa, FL", trade: "hvac", email: "preflight@example.com", score: 85 };
          const gate = await verifyTrustStackGate(testProspect, "preflight-run", env);
          diagnostics.trust_stack = {
            ready: gate.allowed || gate.status === "approved",
            url_present: !!env.TRUST_STACK_URL,
            details: gate.reason
          };
        } catch (e) {
          diagnostics.trust_stack = { ready: false, url_present: !!env.TRUST_STACK_URL, details: e.message };
        }
        const isReadyForOutreach = diagnostics.d1_database.ready;
        return Response.json({
          system_ready_for_outreach: isReadyForOutreach,
          diagnostics
        }, { headers: corsHeaders });
      }
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
        const mode = rawMode;
        if (mode === "founder" && rawTenantId && rawTenantId !== "founder") {
          return Response.json({ error: "Founder mode requires tenant_id='founder'" }, { status: 400, headers: corsHeaders });
        }
        if (mode === "tenant" && (!rawTenantId || rawTenantId === "founder")) {
          return Response.json({ error: "Tenant mode requires its exact tenant_id" }, { status: 400, headers: corsHeaders });
        }
        const tenantId = mode === "founder" ? "founder" : rawTenantId || "";
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
        const results = await env.RADAR_DB.prepare(query).bind(runId, mode, tenantId, mode, tenantId).all();
        const records = (results && results.results || []).map((row) => ({
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
        let body;
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
        const mode = rawMode;
        if (mode === "founder" && rawTenantId && rawTenantId !== "founder") {
          return Response.json({ error: "Founder mode requires tenant_id='founder'" }, { status: 400, headers: corsHeaders });
        }
        if (mode === "tenant" && (!rawTenantId || rawTenantId === "founder")) {
          return Response.json({ error: "Tenant mode requires its exact tenant_id" }, { status: 400, headers: corsHeaders });
        }
        const tenantId = mode === "founder" ? "founder" : rawTenantId || "";
        const records = Array.isArray(body.records) ? body.records : Array.isArray(body) ? body : [];
        if (records.length > 100) {
          return Response.json({ error: "Batch size exceeds maximum limit of 100 items." }, { status: 400, headers: corsHeaders });
        }
        let insertedCount = 0;
        let duplicatedCount = 0;
        let rejectedCount = 0;
        const now = (/* @__PURE__ */ new Date()).toISOString();
        if (body.status === "failed" || body.run_status === "failed") {
          const failReason = body.error || body.last_error || "Research sidecar execution failed";
          try {
            await env.RADAR_DB.prepare(`
              UPDATE sidecar_dispatches 
              SET status = 'failed', last_error = ?, updated_at = ? 
              WHERE run_id = ? AND tenant_id = ?
            `).bind(failReason, now, runId, tenantId).run();
          } catch (e) {
          }
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
          const confidence = typeof item.confidence === "number" && Number.isFinite(item.confidence) ? Math.min(1, Math.max(0, item.confidence)) : 0.65;
          const observedAt = item.observed_at || now;
          const evidenceData = item.evidence || {};
          if (!prospectId || !sourceUrl || !/^[a-f0-9]{64}$/i.test(String(contentHash))) {
            rejectedCount++;
            continue;
          }
          const candidateMatch = await env.RADAR_DB.prepare(`
            SELECT 1 FROM research_run_candidates 
            WHERE run_id = ? AND mode = ? AND tenant_id = ? AND prospect_id = ?
          `).bind(runId, mode, tenantId, prospectId).first();
          if (!candidateMatch) {
            console.warn(`[ResearchEvidence] Rejected evidence for prospect ${prospectId}: not associated with run ${runId} and tenant ${tenantId}`);
            rejectedCount++;
            continue;
          }
          const prospectRow = await env.RADAR_DB.prepare(`
            SELECT id, signals_json, website FROM prospects
            WHERE id = ? AND mode = ? AND COALESCE(tenant_id, 'founder') = ?
          `).bind(prospectId, mode, tenantId).first();
          if (!prospectRow) {
            console.warn(`[ResearchEvidence] Rejected evidence for prospect ${prospectId}: mode/tenant mismatch in prospects table`);
            rejectedCount++;
            continue;
          }
          try {
            const submittedUrl = new URL(String(sourceUrl));
            const originalValue = String(prospectRow.website || "").trim();
            const originalUrl = new URL(/^https?:\/\//i.test(originalValue) ? originalValue : `https://${originalValue}`);
            const normalizedHost = /* @__PURE__ */ __name((host) => host.toLowerCase().replace(/^www\./, ""), "normalizedHost");
            if (!["http:", "https:"].includes(submittedUrl.protocol) || submittedUrl.username || submittedUrl.password || !originalUrl.hostname || normalizedHost(submittedUrl.hostname) !== normalizedHost(originalUrl.hostname)) {
              rejectedCount++;
              continue;
            }
          } catch {
            rejectedCount++;
            continue;
          }
          const existingEvidence = await env.RADAR_DB.prepare(`
            SELECT id FROM source_evidence 
            WHERE prospect_id = ? AND source_id = ? AND evidence_type = ? AND content_hash = ?
          `).bind(prospectId, sourceId, evidenceType, contentHash).first();
          const evidenceId = existingEvidence ? existingEvidence.id : item.id || `ev_${crypto.randomUUID().replace(/-/g, "").substring(0, 16)}`;
          const evidenceJson = typeof evidenceData === "string" ? evidenceData : JSON.stringify(evidenceData);
          if (existingEvidence) {
            duplicatedCount++;
          } else {
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
            } catch (insertErr) {
              if (insertErr.message && insertErr.message.toLowerCase().includes("unique")) {
                duplicatedCount++;
              } else {
                console.error(`[ResearchEvidence] Error saving evidence:`, insertErr);
                rejectedCount++;
                continue;
              }
            }
          }
          try {
            let signalsObj = {};
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
                ...prevScrapling.facts || {},
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
        try {
          await env.RADAR_DB.prepare(`
            UPDATE sidecar_dispatches 
            SET status = 'completed', completed_at = ?, updated_at = ? 
            WHERE run_id = ? AND tenant_id = ?
          `).bind(now, now, runId, tenantId).run();
        } catch (e) {
        }
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
    } catch (error) {
      return Response.json({ error: error.message || "Internal Server Error" }, { status: 500, headers: corsHeaders });
    }
  },
  // Daily Scheduled Trigger (Cron: "0 12 * * *")
  async scheduled(event, env, ctx) {
    console.log(`[Radar Cron] Scheduled trigger initiated at ${(/* @__PURE__ */ new Date()).toISOString()}`);
    const run = startProspectingRun(env, "founder", null);
    const heal = (async () => {
      try {
        await run.catch(() => void 0);
        await ensureOpportunitiesSchema(env.RADAR_DB);
        const rows = await env.RADAR_DB.prepare(`
          SELECT id, name, city, trade, score, opportunity_score, tenant_id, expected_value,
                 fit_score, intent_score, pain_score, decision_state, why_now_json
          FROM prospects
          WHERE COALESCE(score, opportunity_score, 0) >= 45
            AND status NOT IN ('discarded','suppressed','blocked','disqualified')
          ORDER BY COALESCE(score, opportunity_score, 0) DESC LIMIT 12
        `).all();
        const nowIso = (/* @__PURE__ */ new Date()).toISOString();
        let n = 0;
        for (const p of rows.results || []) {
          const oppId = `opp_${p.id}`;
          const stratScore = Math.round(p.opportunity_score || p.score || 50);
          const tenantId = p.tenant_id || "founder";
          const title = `${p.name} \u2014 ${p.trade || "service"} (${p.city || ""})`;
          try {
            await env.RADAR_DB.prepare(`
              INSERT OR IGNORE INTO opportunities (
                id, prospect_id, tenant_id, mode, title,
                first_seen_at, last_seen_at, status, strategic_score,
                fit_score, intent_score, pain_score, expected_value,
                decision_state, why_now_json, priority_tier, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).bind(
              oppId,
              p.id,
              tenantId,
              tenantId === "founder" ? "founder" : "tenant",
              title,
              nowIso,
              nowIso,
              stratScore,
              p.fit_score || stratScore,
              p.intent_score || Math.round(stratScore * 0.8),
              p.pain_score || 50,
              p.expected_value || 0,
              p.decision_state || "identified",
              p.why_now_json || null,
              stratScore >= 80 ? "high" : stratScore >= 55 ? "medium" : "low",
              nowIso,
              nowIso
            ).run();
            n++;
          } catch {
          }
        }
        console.log(`[Radar Cron] Self-heal opportunities created: ${n}`);
      } catch (e) {
        console.warn("[Radar Cron] opportunity heal failed:", e);
      }
    })();
    const tenantRefresh = Promise.resolve();
    const followUps = (async () => {
      try {
        if (!env.RADAR_DB) return;
        const rows = await env.RADAR_DB.prepare(`
          SELECT id FROM prospects
          WHERE COALESCE(NULLIF(TRIM(tenant_id),''),'founder') = 'founder'
            AND lower(status) IN ('sent','delivered','opened','clicked')
            AND (last_reply_content IS NULL OR TRIM(last_reply_content) = '')
            AND last_contact_at IS NOT NULL
            AND last_contact_at <= datetime('now', '-5 days')
            AND last_contact_at >= datetime('now', '-45 days')
          ORDER BY last_contact_at ASC
          LIMIT 8
        `).all();
        const list = rows.results || [];
        for (const r of list) {
          try {
            const p = await env.RADAR_DB.prepare("SELECT * FROM prospects WHERE id = ?").bind(r.id).first();
            if (!p) continue;
            const history = await env.RADAR_DB.prepare("SELECT COUNT(DISTINCT message_id) AS touch_count FROM email_dispatch_logs WHERE prospect_id = ?").bind(r.id).first();
            const touch = resolveOutreachTouchCount(getOutreachTouch(p), history?.touch_count);
            if (touch >= 3) continue;
            if (env.RADAR_QUEUE && typeof env.RADAR_QUEUE.send === "function") {
              await env.RADAR_QUEUE.send({
                run_id: `fu-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}`,
                job_id: `outreach-fu-${r.id}-${touch + 1}`,
                type: "outreach",
                mode: "founder",
                tenant_id: "founder",
                payload: { prospect_id: r.id },
                created_at: (/* @__PURE__ */ new Date()).toISOString()
              });
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
    const reconcile = reconcileResendDeliveries(env).catch((e) => console.warn("[Radar Cron] resend reconcile failed:", e));
    const digest = (async () => {
      try {
        await heal.catch(() => void 0);
        const hour = new Date(event?.scheduledTime || Date.now()).getUTCHours();
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
  async queue(batch, env, ctx) {
    for (const msg of batch.messages) {
      try {
        const body = msg.body || {};
        const jobId = body.job_id || msg.id;
        const jobType = body.job_type || body.type || "unknown";
        const runId = body.run_id || null;
        const prospectId = body.prospect_id || null;
        if (!jobId || !jobType) {
          console.warn(`[Queue Consumer] Invalid job message format received. Missing job_id or job_type:`, body);
          msg.ack();
          continue;
        }
        if (env.RADAR_DB) {
          try {
            const existing = await env.RADAR_DB.prepare(
              "SELECT status FROM radar_jobs WHERE id = ?"
            ).bind(jobId).first();
            if (existing && existing.status === "completed") {
              console.log(`[Queue Consumer] Job ${jobId} already completed. Acknowledging & skipping.`);
              msg.ack();
              continue;
            }
            const timestamp = (/* @__PURE__ */ new Date()).toISOString();
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
        await processQueueJob(body, env);
        if (env.RADAR_DB) {
          try {
            await env.RADAR_DB.prepare(
              "UPDATE radar_jobs SET status = 'completed', updated_at = ? WHERE id = ? AND status != 'completed_zero_prospects'"
            ).bind((/* @__PURE__ */ new Date()).toISOString(), jobId).run();
          } catch (e) {
          }
        }
        msg.ack();
      } catch (err) {
        console.error(`[Queue Consumer Error] Job execution failed:`, err);
        const jobId = msg.body?.job_id || msg.id;
        if (jobId && env.RADAR_DB) {
          try {
            await env.RADAR_DB.prepare(
              "UPDATE radar_jobs SET status = 'failed', last_error = ?, updated_at = ? WHERE id = ?"
            ).bind(err.message || String(err), (/* @__PURE__ */ new Date()).toISOString(), jobId).run();
          } catch (e) {
          }
        }
        msg.retry();
      }
    }
  }
};
var researchSchemaEnsured = false;
async function ensureResearchSchema(db) {
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
__name(ensureResearchSchema, "ensureResearchSchema");
async function associateResearchCandidate(db, runId, mode, tenantId, prospectId) {
  if (!runId || !prospectId || !db) return;
  await ensureResearchSchema(db);
  const m = mode === "tenant" ? "tenant" : "founder";
  const t = m === "founder" ? "founder" : tenantId || "";
  if (m === "tenant" && (!t || t === "founder")) {
    console.warn(`[associateResearchCandidate] Tenant mode requires valid non-founder tenant_id`);
    return;
  }
  try {
    await db.prepare(`
      INSERT OR IGNORE INTO research_run_candidates (run_id, mode, tenant_id, prospect_id, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).bind(runId, m, t, prospectId, (/* @__PURE__ */ new Date()).toISOString()).run();
  } catch (err) {
    console.warn(`[associateResearchCandidate] Error linking prospect ${prospectId} to run ${runId}:`, err);
  }
}
__name(associateResearchCandidate, "associateResearchCandidate");
async function maybeDispatchSidecarResearch(env, runId, mode, tenantId) {
  if (!runId || !env.RADAR_DB) return false;
  await ensureResearchSchema(env.RADAR_DB);
  const m = mode === "tenant" ? "tenant" : "founder";
  const t = m === "founder" ? "founder" : tenantId || "";
  if (m === "tenant" && (!t || t === "founder")) {
    console.warn(`[maybeDispatchSidecarResearch] Tenant mode requires valid non-founder tenant_id`);
    return false;
  }
  try {
    const pendingRes = await env.RADAR_DB.prepare(`
      SELECT COUNT(*) as c FROM queue_jobs 
      WHERE run_id = ? AND job_type = 'discovery' AND status IN ('pending', 'processing')
    `).bind(runId).first();
    if (pendingRes && pendingRes.c > 0) {
      console.log(`[maybeDispatchSidecarResearch] Discovery jobs still running for run ${runId} (count=${pendingRes.c})`);
      return false;
    }
    const candidatesRes = await env.RADAR_DB.prepare(`
      SELECT COUNT(*) as cnt 
      FROM research_run_candidates c
      JOIN prospects p ON c.prospect_id = p.id
      WHERE c.run_id = ? AND c.mode = ? AND c.tenant_id = ?
        AND p.mode = ? AND COALESCE(p.tenant_id, 'founder') = ?
        AND p.website IS NOT NULL AND p.website != ''
    `).bind(runId, m, t, m, t).first();
    const candidateCount = candidatesRes?.cnt || 0;
    if (candidateCount === 0) {
      console.log(`[maybeDispatchSidecarResearch] No website candidates found for run ${runId}, tenant ${t}`);
      return false;
    }
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const existingDispatch = await env.RADAR_DB.prepare(`
      SELECT id, status, attempts, updated_at FROM sidecar_dispatches WHERE run_id = ? AND tenant_id = ?
    `).bind(runId, t).first();
    let dispatchId;
    if (existingDispatch) {
      if (existingDispatch.status === "completed") return false;
      if (["queued", "running", "dispatching"].includes(existingDispatch.status)) {
        const lastUpdate = Date.parse(String(existingDispatch.updated_at || ""));
        const stale = !Number.isFinite(lastUpdate) || Date.now() - lastUpdate > 40 * 60 * 1e3;
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
        if (!reclaimed?.meta?.changes) return false;
      } else if (existingDispatch.status === "failed") {
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
        if (!updateRes || updateRes.meta?.changes === 0) {
          return false;
        }
      } else {
        return false;
      }
    } else {
      dispatchId = `disp_${Date.now()}_${crypto.randomUUID().replace(/-/g, "").substring(0, 8)}`;
      try {
        await env.RADAR_DB.prepare(`
          INSERT INTO sidecar_dispatches (
            id, run_id, mode, tenant_id, status, attempts, workflow_file, created_at, updated_at
          ) VALUES (?, ?, ?, ?, 'dispatching', 1, 'radar-research.yml', ?, ?)
        `).bind(dispatchId, runId, m, t, now, now).run();
      } catch (insertErr) {
        console.log(`[maybeDispatchSidecarResearch] Dispatch already created concurrently: ${insertErr.message}`);
        return false;
      }
    }
    const dispatchResult = await dispatchScraplingResearch(env, {
      run_id: runId,
      mode: m,
      tenant_id: t
    });
    const updateTime = (/* @__PURE__ */ new Date()).toISOString();
    if (dispatchResult.queued) {
      await env.RADAR_DB.prepare(`
        UPDATE sidecar_dispatches 
        SET status = 'queued', updated_at = ? 
        WHERE id = ? AND status NOT IN ('completed', 'running')
      `).bind(updateTime, dispatchId).run();
      console.log(`[maybeDispatchSidecarResearch] Successfully dispatched Scrapling research for run ${runId} (${candidateCount} candidates)`);
      return true;
    } else {
      await env.RADAR_DB.prepare(`
        UPDATE sidecar_dispatches 
        SET status = 'failed', last_error = ?, updated_at = ? 
        WHERE id = ?
      `).bind(dispatchResult.reason || "DISPATCH_FAILED", updateTime, dispatchId).run();
      console.warn(`[maybeDispatchSidecarResearch] Dispatch failed: ${dispatchResult.reason}`);
      return false;
    }
  } catch (err) {
    console.error(`[maybeDispatchSidecarResearch] Error in dispatch check for run ${runId}:`, err);
    return false;
  }
}
__name(maybeDispatchSidecarResearch, "maybeDispatchSidecarResearch");
function isSidecarCallbackAuthorized(request, env) {
  const secret = (env.RADAR_SIDECAR_CALLBACK_KEY || "").trim();
  if (!secret) return false;
  const authHeader = request.headers.get("authorization") || "";
  const callbackKeyHeader = request.headers.get("x-callback-key") || "";
  if (callbackKeyHeader && callbackKeyHeader === secret) return true;
  if (authHeader && authHeader === `Bearer ${secret}`) return true;
  return false;
}
__name(isSidecarCallbackAuthorized, "isSidecarCallbackAuthorized");
async function handleHealth(env, headers, tenantId = "founder") {
  const db = env.RADAR_DB;
  const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  let prospectsToday = 0;
  let hunterUsedToday = 0;
  let lastRunDate = null;
  let pendingJobs = 0;
  let completedJobs = 0;
  let failedJobs = 0;
  let lastError = null;
  let lastDiagnostics = null;
  const prospectsByStatus = {};
  const telegramConfigured = Boolean(
    env.TELEGRAM_BOT_TOKEN && String(env.TELEGRAM_BOT_TOKEN).trim() !== "" && env.TELEGRAM_CHAT_ID && String(env.TELEGRAM_CHAT_ID).trim() !== ""
  );
  let lastTelegramOk = null;
  try {
    const todayRun = await db.prepare("SELECT * FROM runs WHERE day = ? ORDER BY created_at DESC LIMIT 1").bind(today).first();
    if (todayRun) {
      prospectsToday = todayRun.finalized || 0;
      hunterUsedToday = todayRun.hunter_calls || 0;
      lastRunDate = todayRun.created_at;
      if (todayRun.errors_json && todayRun.errors_json !== "[]") {
        try {
          const errList = JSON.parse(todayRun.errors_json);
          if (Array.isArray(errList) && errList.length > 0) {
            lastDiagnostics = errList[errList.length - 1];
            const tgError = errList.find((e) => e.source === "telegram_outbound" || e.source === "telegram_outbound_exception");
            if (tgError) {
              lastTelegramOk = false;
            } else if (telegramConfigured) {
              lastTelegramOk = true;
            }
          }
        } catch (e) {
        }
      } else if (telegramConfigured) {
        lastTelegramOk = true;
      }
    } else {
      const latestRun = await db.prepare("SELECT * FROM runs ORDER BY created_at DESC LIMIT 1").first();
      if (latestRun) {
        lastRunDate = latestRun.created_at;
        if (latestRun.errors_json && latestRun.errors_json !== "[]") {
          try {
            const errList = JSON.parse(latestRun.errors_json);
            if (Array.isArray(errList) && errList.length > 0) {
              lastDiagnostics = errList[errList.length - 1];
              const tgError = errList.find((e) => e.source === "telegram_outbound" || e.source === "telegram_outbound_exception");
              if (tgError) {
                lastTelegramOk = false;
              } else if (telegramConfigured) {
                lastTelegramOk = true;
              }
            }
          } catch (e) {
          }
        }
      }
    }
  } catch (e) {
    console.warn("Health check stats query fallback: ", e);
  }
  try {
    const notifiedProspect = await db.prepare(
      "SELECT updated_at FROM prospects WHERE status IN ('notified', 'sent', 'approved') ORDER BY updated_at DESC LIMIT 1"
    ).first();
    if (notifiedProspect && notifiedProspect.updated_at) {
      lastTelegramOk = notifiedProspect.updated_at;
    } else if (lastTelegramOk === null && telegramConfigured) {
      lastTelegramOk = true;
    }
  } catch (e) {
  }
  try {
    const statusRows = await db.prepare("SELECT status, COUNT(*) as count FROM prospects WHERE COALESCE(tenant_id,'founder') = ? GROUP BY status").bind(tenantId).all();
    if (statusRows.results) {
      for (const row of statusRows.results) {
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
      for (const r of jobStats.results) {
        if (r.status === "pending" || r.status === "processing") pendingJobs += r.count;
        if (r.status === "completed" || r.status === "completed_zero_prospects") completedJobs += r.count;
        if (r.status === "failed") failedJobs += r.count;
      }
    }
    const lastErrRow = await db.prepare("SELECT error FROM queue_jobs WHERE error IS NOT NULL AND status = 'failed' ORDER BY created_at DESC LIMIT 1").first();
    if (lastErrRow) lastError = lastErrRow.error;
  } catch (e) {
  }
  const hunterRemaining = Math.max(0, LIMITS.max_hunter_credits_per_day - hunterUsedToday);
  let prospectsTotal = 0;
  let prospectsUniqueToday = 0;
  let suppressedCount = 0;
  try {
    const totalRow = await db.prepare("SELECT COUNT(*) as count FROM prospects WHERE COALESCE(tenant_id,'founder') = ?").bind(tenantId).first();
    if (totalRow) prospectsTotal = totalRow.count;
  } catch (e) {
  }
  try {
    const uniqueRow = await db.prepare("SELECT COUNT(DISTINCT identity_key) as count FROM prospects WHERE created_at >= ? AND COALESCE(tenant_id,'founder') = ?").bind(`${today}T00:00:00.000Z`, tenantId).first();
    if (uniqueRow) prospectsUniqueToday = uniqueRow.count;
  } catch (e) {
  }
  try {
    const supRow = await db.prepare("SELECT COUNT(*) as count FROM suppression").first();
    if (supRow) suppressedCount = supRow.count;
  } catch (e) {
  }
  const globalPause = env.RADAR_GLOBAL_PAUSE === "true" || env.RADAR_GLOBAL_PAUSE === "1";
  const outreachPause = env.RADAR_OUTREACH_PAUSE === "true" || env.RADAR_OUTREACH_PAUSE === "1";
  let budgetRow = await db.prepare("SELECT * FROM daily_budgets WHERE tenant_id = 'founder' AND day = ?").bind(today).first();
  if (!budgetRow) {
    budgetRow = {
      discovery_units: 0,
      enrichment_units: 0,
      ai_units: 0,
      hunter_units: 0,
      outreach_units: 0,
      finalize_units: 0
    };
  }
  const cb = await db.prepare("SELECT * FROM circuit_breakers WHERE id = 'outreach'").first();
  const circuitBreakerActive = cb ? cb.status === "open" : false;
  const circuitBreakerReason = cb ? cb.reason : null;
  let sidecarDiagnostics = {
    ready: true,
    dispatches_count: 0,
    evidence_count: 0,
    latest_dispatch_status: null
  };
  try {
    await ensureResearchSchema(db);
    const dispRow = await db.prepare("SELECT COUNT(*) as c FROM sidecar_dispatches").first();
    if (dispRow) sidecarDiagnostics.dispatches_count = dispRow.c || 0;
    const latestDisp = await db.prepare("SELECT status FROM sidecar_dispatches ORDER BY created_at DESC LIMIT 1").first();
    if (latestDisp) sidecarDiagnostics.latest_dispatch_status = latestDisp.status;
    const evRow = await db.prepare("SELECT COUNT(*) as c FROM source_evidence").first();
    if (evRow) sidecarDiagnostics.evidence_count = evRow.c || 0;
  } catch (e) {
  }
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
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    limits: LIMITS
  }, { headers });
}
__name(handleHealth, "handleHealth");
async function handleTelegramWebhook(request, env, headers) {
  const rawBotToken = env.TELEGRAM_BOT_TOKEN ? String(env.TELEGRAM_BOT_TOKEN).trim() : "";
  const botToken = rawBotToken.replace(/^["']|["']$/g, "").replace(/^bot/i, "");
  const configuredChatId = env.TELEGRAM_CHAT_ID ? String(env.TELEGRAM_CHAT_ID).trim().replace(/^["']|["']$/g, "") : "";
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
    const update = await request.json();
    const chatId = update.message?.chat?.id || update.callback_query?.message?.chat?.id || update.callback_query?.from?.id;
    if (!configuredChatId) {
      if (chatId && update.message && botToken) {
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: `\u{1F44B} <b>\xA1Hola desde Bvelt Radar!</b>

Tu <b>Telegram Chat ID</b> es:
<code>${chatId}</code>

Para activar el bot y recibir alertas, agrega esta variable en tus Secretos de Cloudflare:
<code>TELEGRAM_CHAT_ID = ${chatId}</code>`,
            parse_mode: "HTML"
          }),
          signal: AbortSignal.timeout(15e3)
        }).catch((e) => console.warn("Error sending setup message:", e));
      }
      return Response.json({ ok: true, notice: "TELEGRAM_CHAT_ID not configured" }, { headers });
    }
    if (!chatId || String(chatId).trim() !== configuredChatId) {
      console.warn(`[Telegram Webhook] Chat ID mismatch: got ${chatId}, expected ${configuredChatId}`);
      if (chatId && botToken) {
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: `\u26A0\uFE0F <b>Chat ID no autorizado</b>

Tu Telegram Chat ID actual es: <code>${chatId}</code>
Pero en Cloudflare est\xE1 configurado: <code>${configuredChatId ? configuredChatId.substring(0, 4) + "..." : "Ninguno"}</code>

Si este es tu chat personal, actualiza en Cloudflare Dashboard:
<code>TELEGRAM_CHAT_ID = ${chatId}</code>`,
            parse_mode: "HTML"
          }),
          signal: AbortSignal.timeout(15e3)
        }).catch(() => {
        });
      }
      return Response.json({ ok: true, ignored: "Unauthorized Chat ID" }, { headers });
    }
    if (update.callback_query) {
      const query = update.callback_query;
      const callbackData = (query.data || "").trim();
      const callbackId = query.id;
      const [action, prospectId] = callbackData.split(":");
      if (action && prospectId) {
        const decisionAction = action === "approve" || action === "sent" ? "sent" : action === "discard" ? "discard" : action;
        const decisionRes = await handleDecision(prospectId, decisionAction, `Triggered via Telegram Button (${action})`, env, {});
        const decisionJson = await decisionRes.json().catch(() => ({}));
        if (botToken) {
          const actionText = action === "approve" || action === "sent" ? decisionJson?.success === false && decisionJson?.dispatch?.error ? "\u274C No se pudo enviar" : "\u2705 Aprobado y puesto en cola de env\xEDo" : action === "discard" ? "\u274C Descartado" : "\u{1F6AB} Dominio Suprimido";
          await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              callback_query_id: callbackId,
              text: `${actionText} (${prospectId.substring(0, 8)})`,
              show_alert: false
            }),
            signal: AbortSignal.timeout(15e3)
          }).catch((e) => console.warn("answerCallbackQuery warning: ", e));
          let dispatchInfo = "";
          if (decisionJson?.dispatch?.status === "dispatched") {
            dispatchInfo = `

\u{1F4E7} <b>Email despachado de verdad</b> v\xEDa <code>${decisionJson.dispatch.provider}</code> (ID: <code>${escapeHtml2(decisionJson.dispatch.messageId)}</code>).`;
          } else if (decisionJson?.dispatch?.status === "simulated") {
            dispatchInfo = `

\u26A0\uFE0F <i>Email guardado en modo simulado. Configura RESEND_API_KEY en Cloudflare para env\xEDos reales gratis (3,000/mes).</i>`;
          } else if (decisionJson?.dispatch?.error) {
            dispatchInfo = `

\u274C <i>Error al despachar email: ${escapeHtml2(decisionJson.dispatch.error)}</i>`;
          }
          await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: chatId,
              text: `<b>${actionText}</b>: ID <code>${escapeHtml2(prospectId)}</code> registrado en D1.${dispatchInfo}`,
              parse_mode: "HTML"
            }),
            signal: AbortSignal.timeout(15e3)
          }).catch((e) => console.warn("sendMessage confirmation warning: ", e));
        }
      } else {
        if (botToken) {
          const lowerAction = (action || callbackData).toLowerCase();
          if (lowerAction === "status" || lowerAction === "ver_estado" || lowerAction === "estado") {
            await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ callback_query_id: callbackId, text: "\u{1F4CA} Consultando estado...", show_alert: false }),
              signal: AbortSignal.timeout(15e3)
            }).catch(() => {
            });
            const provStatus = env.RESEND_API_KEY ? "\u2705 Resend (3,000/mes gratis)" : env.BREVO_API_KEY ? "\u2705 Brevo (300/d\xEDa gratis)" : "\u26A0\uFE0F Simulado (Falta RESEND_API_KEY)";
            const webhookStatus = env.TELEGRAM_WEBHOOK_SECRET ? "\u{1F512} Protegido con Secret Token" : "\u26A1 Activo (validaci\xF3n por Chat ID)";
            const statusMsg = `<b>\u{1F4CA} Bvelt Radar Status</b>

<b>Email Outbound:</b> ${provStatus}
<b>Bot Telegram:</b> \u2705 Conectado (${webhookStatus})
<b>Chat ID:</b> <code>${chatId}</code>
<b>Plataforma:</b> <a href="https://bvelt.app">https://bvelt.app</a>

<i>Escribe /digest para ver las 3 mejores oportunidades o /testmail tu@correo.com para probar el env\xEDo.</i>`;
            await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ chat_id: chatId, text: statusMsg, parse_mode: "HTML" }),
              signal: AbortSignal.timeout(15e3)
            }).catch(() => {
            });
          } else if (lowerAction === "digest" || lowerAction === "resumen" || lowerAction === "oportunidades") {
            await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ callback_query_id: callbackId, text: "\u{1F50D} Cargando oportunidades...", show_alert: false }),
              signal: AbortSignal.timeout(15e3)
            }).catch(() => {
            });
            const topOpps = await env.RADAR_DB.prepare(
              "SELECT * FROM prospects WHERE email IS NOT NULL AND status IN ('queued', 'enriched', 'drafted') ORDER BY score DESC LIMIT 3"
            ).all();
            if (topOpps.results && topOpps.results.length > 0) {
              await dispatchInteractiveTelegramAlert(topOpps.results, [], [], env);
            } else {
              await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ chat_id: chatId, text: "\u{1F50D} No hay prospectos pendientes en cola en este momento.", parse_mode: "HTML" }),
                signal: AbortSignal.timeout(15e3)
              }).catch(() => {
              });
            }
          } else {
            await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ callback_query_id: callbackId, text: `Acci\xF3n recibida: ${callbackData}` }),
              signal: AbortSignal.timeout(15e3)
            }).catch(() => {
            });
          }
        }
      }
    }
    if (update.message?.text && botToken) {
      const msgText = (update.message.text || "").trim();
      const lower = msgText.toLowerCase();
      const rawCommand = lower.split(/\s+/)[0] || "";
      const command = rawCommand.replace(/@[a-zA-Z0-9_]+$/, "");
      if (command === "/testmail" || command === "testmail" || command === "/test" || command === "test") {
        const parts = msgText.split(/\s+/);
        const targetEmail = parts[1] || (env.OUTBOUND_EMAIL_FROM || "").replace(/.*<([^>]+)>.*/, "$1") || "test@example.com";
        const testRes = await dispatchEmail({
          to: targetEmail,
          recipientName: "Bvelt Founder Test",
          subject: "Bvelt email delivery check",
          body: `Hello,

You requested an email delivery check from Bvelt Radar. Provider: ${env.RESEND_API_KEY ? "Resend" : env.BREVO_API_KEY ? "Brevo" : "simulated"}.

No action is required.

Sent at: ${(/* @__PURE__ */ new Date()).toISOString()}`,
          includeSiteLink: false,
          plainTextOnly: true,
          from: env.OUTBOUND_EMAIL_FROM,
          resendApiKey: env.RESEND_API_KEY,
          brevoApiKey: env.BREVO_API_KEY,
          senderName: env.SENDER_NAME
        });
        let replyMsg = "";
        if (testRes.status === "dispatched") {
          replyMsg = `\u2705 <b>Email despachado exitosamente!</b>

<b>Destinatario:</b> <code>${escapeHtml2(targetEmail)}</code>
<b>Proveedor:</b> <code>${testRes.provider}</code>
<b>Message ID:</b> <code>${escapeHtml2(testRes.messageId)}</code>`;
        } else if (testRes.status === "simulated") {
          replyMsg = `\u26A0\uFE0F <b>Modo Simulado Activo</b>

No tienes configurada ninguna clave de env\xEDo de correos.

<b>Pasos para env\xEDos reales gratis:</b>
1. Ve a <a href="https://resend.com">resend.com</a> y obt\xE9n tu API Key (3,000 emails/mes gratis).
2. En Cloudflare Dashboard > Settings > Variables and Secrets, agrega:
\u2022 <code>RESEND_API_KEY</code> = tu clave re_...
\u2022 <code>OUTBOUND_EMAIL_FROM</code> = tu email o <code>onboarding@resend.dev</code>`;
        } else {
          replyMsg = `\u274C <b>Fallo al enviar correo:</b>
${escapeHtml2(testRes.error || "Error desconocido")}`;
        }
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text: replyMsg, parse_mode: "HTML" }),
          signal: AbortSignal.timeout(15e3)
        }).catch(() => {
        });
      } else if (command === "/emailstatus" || command === "emailstatus" || command === "/mailstatus") {
        const auth = await inspectOutboundEmailAuth(env.OUTBOUND_EMAIL_FROM, env.RESEND_API_KEY);
        const report = [
          "<b>\u{1F4E8} Bvelt outbound email authentication</b>",
          `<b>Sender:</b> <code>${escapeHtml2(auth.sender || "invalid")}</code>`,
          `<b>Resend domain:</b> <code>${escapeHtml2(auth.resendDomainStatus)}</code>`,
          `<b>DKIM:</b> ${auth.dkimPresent ? "present" : "MISSING"}`,
          `<b>SPF (send subdomain):</b> ${auth.spfPresent ? "present" : "MISSING"}`,
          `<b>Return-path MX:</b> ${auth.returnPathMxPresent ? "present" : "MISSING"}`,
          `<b>DMARC:</b> ${auth.dmarcPresent ? escapeHtml2(auth.dmarcPolicy) : "MISSING"}`,
          ...auth.resendRecordStatuses.map((item) => `\u2022 ${escapeHtml2(item)}`),
          ...auth.errors.map((item) => `\u26A0\uFE0F ${escapeHtml2(item)}`)
        ].join("\n");
        await notifyFounder(env, report);
      } else if (command === "/status" || command === "status" || command === "/estado" || command === "estado") {
        const provStatus = env.RESEND_API_KEY ? "\u2705 Resend (3,000/mes gratis)" : env.BREVO_API_KEY ? "\u2705 Brevo (300/d\xEDa gratis)" : "\u26A0\uFE0F Simulado (Falta RESEND_API_KEY)";
        const webhookStatus = env.TELEGRAM_WEBHOOK_SECRET ? "\u{1F512} Protegido con Secret Token" : "\u26A1 Activo (validaci\xF3n por Chat ID)";
        const statusMsg = `<b>\u{1F4CA} Bvelt Radar Status</b>

<b>Email Outbound:</b> ${provStatus}
<b>Bot Telegram:</b> \u2705 Conectado (${webhookStatus})
<b>Chat ID:</b> <code>${chatId}</code>
<b>Plataforma:</b> <a href="https://bvelt.app">https://bvelt.app</a>

<i>Escribe /digest para ver las 3 mejores oportunidades o /testmail tu@correo.com para probar el env\xEDo.</i>`;
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text: statusMsg, parse_mode: "HTML" }),
          signal: AbortSignal.timeout(15e3)
        }).catch(() => {
        });
      } else if (command === "/digest" || command === "digest" || command === "/resumen" || command === "resumen") {
        const topOpps = await env.RADAR_DB.prepare(
          "SELECT * FROM prospects WHERE email IS NOT NULL AND status IN ('queued', 'enriched', 'drafted') ORDER BY score DESC LIMIT 3"
        ).all();
        if (topOpps.results && topOpps.results.length > 0) {
          await dispatchInteractiveTelegramAlert(topOpps.results, [], [], env);
        } else {
          await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chatId, text: "\u{1F50D} No hay prospectos pendientes en cola en este momento.", parse_mode: "HTML" }),
            signal: AbortSignal.timeout(15e3)
          }).catch(() => {
          });
        }
      } else if (command === "/id" || command === "id" || command === "/chatid" || command === "chatid") {
        const idMsg = `\u{1F194} <b>Tu Telegram Chat ID:</b>
<code>${chatId}</code>`;
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text: idMsg, parse_mode: "HTML" }),
          signal: AbortSignal.timeout(15e3)
        }).catch(() => {
        });
      } else if (command === "/start" || command === "start" || command === "/help" || command === "help" || command === "/ayuda" || command === "ayuda" || command === "hola" || command === "hi" || command === "hey") {
        const provStatus = env.RESEND_API_KEY ? "\u2705 Resend Activo" : env.BREVO_API_KEY ? "\u2705 Brevo Activo" : "\u26A0\uFE0F Simulado (Configura RESEND_API_KEY)";
        const helpMsg = `\u{1F916} <b>Bvelt Radar Founder Bot</b>

\xA1Bot conectado y listo para interactuar!

<b>Comandos disponibles:</b>
\u2022 /status - Ver cuotas y estado de proveedores
\u2022 /digest - Enviar las 3 mejores oportunidades con botones para aprobar
\u2022 /testmail &lt;correo&gt; - Enviar email de prueba inmediato
\u2022 /emailstatus - Comprobar SPF, DKIM, DMARC y Resend
\u2022 /id - Ver tu Telegram Chat ID
\u2022 /help - Mostrar este men\xFA

<b>Email Outbound:</b> ${provStatus}`;
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text: helpMsg, parse_mode: "HTML" }),
          signal: AbortSignal.timeout(15e3)
        }).catch(() => {
        });
      } else {
        const snippet = msgText.length > 60 ? msgText.substring(0, 60) + "..." : msgText;
        const fallbackMsg = `\u{1F916} <b>Bvelt Radar Founder Bot</b>

Recib\xED tu mensaje: <i>"${escapeHtml2(snippet)}"</i>

<b>Comandos disponibles:</b>
\u2022 /status - Ver estado del sistema
\u2022 /digest - Ver oportunidades pendientes de aprobaci\xF3n
\u2022 /testmail &lt;correo&gt; - Probar env\xEDo de email
\u2022 /emailstatus - Diagn\xF3stico de autenticaci\xF3n de correo
\u2022 /help - Ayuda y comandos
\u2022 /id - Ver tu Telegram Chat ID`;
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text: fallbackMsg, parse_mode: "HTML" }),
          signal: AbortSignal.timeout(15e3)
        }).catch(() => {
        });
      }
    }
    return Response.json({ ok: true }, { headers });
  } catch (err) {
    console.error("Telegram webhook error: ", err);
    return Response.json({ ok: false, error: err.message }, { status: 200, headers });
  }
}
__name(handleTelegramWebhook, "handleTelegramWebhook");
async function handleStats(env, headers) {
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
  const learningStats = await getLearningStats(db, "founder", "founder");
  const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  let budgetRow = await db.prepare("SELECT * FROM daily_budgets WHERE tenant_id = 'founder' AND day = ?").bind(today).first();
  if (!budgetRow) {
    budgetRow = {
      discovery_units: 0,
      enrichment_units: 0,
      ai_units: 0,
      hunter_units: 0,
      outreach_units: 0,
      finalize_units: 0
    };
  }
  const cb = await db.prepare("SELECT * FROM circuit_breakers WHERE id = 'outreach'").first();
  const circuitBreakerActive = cb ? cb.status === "open" : false;
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
__name(handleStats, "handleStats");
async function handleDecision(id, action, notes, env, headers) {
  const db = env.RADAR_DB;
  const prospect = await db.prepare("SELECT * FROM prospects WHERE id = ?").bind(id).first();
  if (!prospect) {
    return Response.json({ error: "Prospect not found." }, { status: 404, headers });
  }
  const timestamp = (/* @__PURE__ */ new Date()).toISOString();
  if (action === "sent" || action === "approve") {
    const gate = await verifyTrustStackGate(prospect, "manual_send", env);
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
    let dispatchOutcome = { success: true, provider: "simulated", status: "simulated", messageId: `sim_${id.substring(0, 8)}` };
    if (prospect.email && prospect.email.includes("@")) {
      const draftSubject = prospect.draft_subject || `Bvelt - Pregunta sobre llamadas de clientes (${prospect.name || "su negocio"})`;
      const draftBody = prospect.draft_body || `Hola equipo de ${prospect.name},

\xBFQu\xE9 ocurre cuando un cliente potencial llama a su negocio mientras est\xE1n ocupados en obra y no pueden atender el tel\xE9fono?

Bvelt responde autom\xE1ticamente por SMS en 15 segundos para no perder ning\xFAn trabajo: https://bvelt.app

Saludos,
Equipo Bvelt

Reply STOP to opt out`;
      const safeBody = typeof normalizeOutreachBody === "function" ? normalizeOutreachBody(draftBody) : draftBody;
      if ((env.RESEND_API_KEY || env.BREVO_API_KEY) && !env.SENDER_POSTAL_ADDRESS?.trim()) {
        await notifyOnce(
          env,
          "missing_sender_postal_address",
          "\u26A0\uFE0F <b>Outreach en HOLD:</b> Falta <code>SENDER_POSTAL_ADDRESS</code> en las variables de Cloudflare. Se requiere direcci\xF3n postal f\xEDsica para env\xEDos conformes a CAN-SPAM."
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
        body: typeof safeBody !== "undefined" ? safeBody : draftBody,
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
        } catch (e) {
        }
        try {
          await db.prepare(`
            INSERT INTO email_dispatch_logs (id, prospect_id, tenant_id, recipient_email, subject, provider, status, message_id, error_message, payload_preview, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            `disp_${crypto.randomUUID()}`,
            id,
            prospect.tenant_id || "founder",
            prospect.email,
            prospect.draft_subject || "Outreach",
            dispatchOutcome.provider,
            "failed",
            dispatchOutcome.messageId || null,
            dispatchOutcome.error || null,
            (prospect.draft_body || "").substring(0, 150),
            timestamp
          ).run();
        } catch (e) {
        }
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
    const cooldown21d = new Date(Date.now() + 21 * 24 * 60 * 60 * 1e3).toISOString();
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
          prospect.tenant_id || "founder",
          prospect.email,
          prospect.draft_subject || "Outreach",
          dispatchOutcome.provider,
          dispatchOutcome.status,
          dispatchOutcome.messageId || null,
          dispatchOutcome.error || null,
          (prospect.draft_body || "").substring(0, 150),
          timestamp
        ).run();
      }
    } catch (e) {
    }
    if (prospect.email) {
      await db.prepare("INSERT OR REPLACE INTO suppression (key, reason, created_at) VALUES (?, ?, ?)").bind(prospect.email.toLowerCase(), `Contacted on ${timestamp} (cooldown until ${cooldown21d})`, timestamp).run();
    }
    if (prospect.website) {
      const domain = getDomain(prospect.website);
      if (domain) {
        await db.prepare("INSERT OR REPLACE INTO suppression (key, reason, created_at) VALUES (?, ?, ?)").bind(domain.toLowerCase(), `Contacted on ${timestamp} (cooldown until ${cooldown21d})`, timestamp).run();
      }
    }
    await recordLearningEvent(db, prospect.city, prospect.trade, prospect.variant_id, true, { event_type: "sent", prospect_id: id, mode: prospect.mode, tenant_id: prospect.tenant_id || "founder" });
    if (prospect.name && prospect.city) {
      try {
        await db.prepare(
          "UPDATE seed_businesses SET used_at = ? WHERE LOWER(name) = LOWER(?) AND LOWER(city) = LOWER(?) AND used_at IS NULL"
        ).bind(timestamp, prospect.name, prospect.city).run();
      } catch (e) {
      }
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
      } catch (e) {
      }
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
      } catch (e) {
      }
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
      } catch (e) {
      }
    }
    await recordLearningEvent(db, prospect.city, prospect.trade, prospect.variant_id, false, { event_type: "won", response_type: "converted", is_win: true, prospect_id: id, mode: prospect.mode, tenant_id: prospect.tenant_id || "founder" });
    return Response.json({ success: true, message: `Prospect ${id} marked as WON/CONVERTED.`, id }, { headers });
  } else if (action === "discard") {
    const cooldown30d = new Date(Date.now() + 30 * 24 * 60 * 60 * 1e3).toISOString();
    await db.prepare(
      "UPDATE prospects SET status = 'discarded', outcome = 'rejected', cooldown_until = ?, updated_at = ? WHERE id = ?"
    ).bind(cooldown30d, timestamp, id).run();
    const nameCityKey = `${prospect.name.toLowerCase()}_${prospect.city.toLowerCase()}`.replace(/\s+/g, "_");
    await db.prepare("INSERT OR REPLACE INTO suppression (key, reason, created_at) VALUES (?, ?, ?)").bind(nameCityKey, `Discarded on ${timestamp} (cooldown until ${cooldown30d})`, timestamp).run();
    if (prospect.email) {
      await db.prepare("INSERT OR REPLACE INTO suppression (key, reason, created_at) VALUES (?, ?, ?)").bind(prospect.email.toLowerCase(), `Discarded on ${timestamp} (cooldown until ${cooldown30d})`, timestamp).run();
    }
    if (prospect.website) {
      const domain = getDomain(prospect.website);
      if (domain) {
        await db.prepare("INSERT OR REPLACE INTO suppression (key, reason, created_at) VALUES (?, ?, ?)").bind(domain.toLowerCase(), `Discarded on ${timestamp} (cooldown until ${cooldown30d})`, timestamp).run();
      }
    }
    await recordLearningEvent(db, prospect.city, prospect.trade, prospect.variant_id, false, { event_type: "discarded", prospect_id: id, mode: prospect.mode, tenant_id: prospect.tenant_id || "founder" });
    return Response.json({ success: true, message: `Prospect ${id} discarded with 30-day cooldown.`, id }, { headers });
  } else if (action === "suppress") {
    await db.prepare(
      "UPDATE prospects SET status = 'suppressed', outcome = 'suppressed', updated_at = ? WHERE id = ?"
    ).bind(timestamp, id).run();
    const nameCityKey = `${prospect.name.toLowerCase()}_${prospect.city.toLowerCase()}`.replace(/\s+/g, "_");
    await db.prepare("INSERT OR REPLACE INTO suppression (key, reason, created_at) VALUES (?, ?, ?)").bind(nameCityKey, "Manual suppression decision", timestamp).run();
    if (prospect.email) {
      await db.prepare("INSERT OR REPLACE INTO suppression (key, reason, created_at) VALUES (?, ?, ?)").bind(prospect.email.toLowerCase(), "Manual suppression decision", timestamp).run();
    }
    if (prospect.website) {
      const domain = getDomain(prospect.website);
      if (domain) {
        await db.prepare("INSERT OR REPLACE INTO suppression (key, reason, created_at) VALUES (?, ?, ?)").bind(domain.toLowerCase(), "Manual suppression decision", timestamp).run();
      }
    }
    await recordLearningEvent(db, prospect.city, prospect.trade, prospect.variant_id, false, { event_type: "suppressed", prospect_id: id, mode: prospect.mode, tenant_id: prospect.tenant_id || "founder" });
    return Response.json({ success: true, message: `Prospect ${id} fully suppressed.`, id }, { headers });
  }
  return Response.json({ error: `Unknown action: ${action}` }, { status: 400, headers });
}
__name(handleDecision, "handleDecision");
async function enqueueJob(env, job) {
  const timestamp = (/* @__PURE__ */ new Date()).toISOString();
  job.created_at = job.created_at || timestamp;
  job.attempt = job.attempt || 1;
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
    console.log(`[Queue Direct Fallback] Executing job ${job.type} (${job.job_id}) directly.`);
    await processQueueJob(job, env);
  }
}
__name(enqueueJob, "enqueueJob");
async function recordQueueJobStatus(db, job_id, run_id, job_type, status, error, payload) {
  const timestamp = (/* @__PURE__ */ new Date()).toISOString();
  try {
    if (status === "processing") {
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
__name(recordQueueJobStatus, "recordQueueJobStatus");
async function processQueueJob(job, env) {
  await recordQueueJobStatus(env.RADAR_DB, job.job_id, job.run_id, job.type, "processing", null, job.payload);
  try {
    switch (job.type) {
      case "discovery":
        await handleDiscoveryJob(job, env);
        break;
      case "enrich":
        await handleEnrichJob(job, env);
        break;
      case "technical_audit":
        await handleTechnicalAuditJob(job, env);
        break;
      case "verify":
      case "score":
        await handleScoreJob(job, env);
        break;
      case "approve":
        await handleApproveJob(job, env);
        break;
      case "outreach":
        await handleOutreachJob(job, env);
        break;
      case "reply_event":
        await handleReplyEventJob(job, env);
        break;
      default:
        console.warn(`[Queue Router] Unknown job type: ${job.type}`);
    }
    await recordQueueJobStatus(env.RADAR_DB, job.job_id, job.run_id, job.type, "completed");
    if (job.type === "discovery") {
      await maybeDispatchSidecarResearch(env, job.run_id, job.mode || "founder", job.tenant_id || (job.mode === "tenant" ? job.tenant_id : "founder"));
    }
  } catch (err) {
    console.error(`[Queue Router Error] Job [${job.type} / ${job.job_id}] failed:`, err);
    await recordQueueJobStatus(env.RADAR_DB, job.job_id, job.run_id, job.type, "failed", err.message || String(err));
    if (job.type === "discovery") {
      await maybeDispatchSidecarResearch(env, job.run_id, job.mode || "founder", job.tenant_id || (job.mode === "tenant" ? job.tenant_id : "founder"));
    }
    throw err;
  }
}
__name(processQueueJob, "processQueueJob");
async function bootstrapBveltTenant(env, body, ctx) {
  const source = String(body.source || "free_analysis");
  const rawTrade = String(body.trade || body.niche || body.industry || "").trim();
  const tenantId = String(body.tenant_id || body.user_id || `bvelt_${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, "_") || `bvelt_${Date.now()}`;
  const tenantName = String(body.tenant_name || body.business_name || "Bvelt Client");
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
      message: "city_required: falta ciudad o coordenadas del cliente; Radar no inventa ubicaci\xF3n.",
      missing_fields: ["city"],
      source
    };
  }
  const toStringList = /* @__PURE__ */ __name((value) => {
    const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[;,]/) : [];
    return Array.from(new Set(raw.map((item) => typeof item === "string" ? item : String(item?.label || "")).map((item) => item.trim()).filter(Boolean)));
  }, "toStringList");
  const tradeKey = userTrade.replace(/-/g, "_");
  const mappedNiches = TENANT_TARGET_MAP[tradeKey] || TENANT_TARGET_MAP[tradeKey.replace(/_/g, " ")] || [];
  const niches = toStringList(body.target_niches).length ? toStringList(body.target_niches) : toStringList(body.subniches).length ? toStringList(body.subniches) : toStringList(body.allowed_markets).length ? toStringList(body.allowed_markets) : toStringList(body.icp_keywords).length ? toStringList(body.icp_keywords) : mappedNiches;
  const primaryNiche = String(body.niche || rawTrade).trim().toLowerCase().replace(/\s+/g, "_");
  const primaryBuyerSegment = niches[0] || "";
  const searchTrade = primaryBuyerSegment ? primaryBuyerSegment.toLowerCase().includes("property") ? "property management" : primaryBuyerSegment.toLowerCase().includes("hotel") ? "hotel" : primaryBuyerSegment.toLowerCase().includes("hoa") ? "property management" : primaryBuyerSegment : "";
  const suppliedCountries = toStringList(body.countries);
  const explicitCountries = suppliedCountries.length ? suppliedCountries : body.country_code || body.country ? [body.country_code || body.country] : [];
  const resolvedCountry = findPlace(cityLabel)?.country;
  const countries = Array.from(new Set(
    (explicitCountries.length ? explicitCountries : resolvedCountry ? [resolvedCountry] : []).map((value) => String(value).trim().toUpperCase()).filter(Boolean)
  ));
  const languages = toStringList(body.languages || body.language).map((value) => value.toLowerCase());
  const services = toStringList(body.services).length ? toStringList(body.services) : [userTrade];
  const serviceAreas = toStringList(body.service_areas).length ? toStringList(body.service_areas) : [cityLabel];
  const regions = toStringList(body.regions);
  const cities = toStringList(body.cities).length ? toStringList(body.cities) : [cityLabel];
  const icpKeywords = toStringList(body.icp_keywords);
  const allowedMarkets = toStringList(body.allowed_markets).length ? toStringList(body.allowed_markets) : niches;
  const icpDescription = String(body.icp_description || `Customers likely to buy ${userTrade} services in ${cityLabel}.`);
  const minimumScore = Number.isFinite(Number(body.minimum_score)) ? Number(body.minimum_score) : 45;
  const dailyOutreachLimit = Number.isFinite(Number(body.daily_outreach_limit)) ? Number(body.daily_outreach_limit) : 15;
  const campaignGoal = String(body.campaign_goal || "Book qualified jobs from nearby buyers");
  const messagingAngle = String(body.messaging_angle || "fast_response_guarantee");
  const timestamp = (/* @__PURE__ */ new Date()).toISOString();
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
    tenantName,
    String(body.industry || userTrade).trim().toLowerCase(),
    primaryNiche,
    JSON.stringify(niches.slice(0, 6)),
    JSON.stringify(services),
    JSON.stringify(serviceAreas),
    JSON.stringify(countries),
    JSON.stringify(regions),
    JSON.stringify(cities),
    JSON.stringify(languages),
    icpDescription,
    JSON.stringify(icpKeywords),
    minimumScore,
    dailyOutreachLimit,
    JSON.stringify(allowedMarkets),
    campaignGoal,
    messagingAngle,
    timestamp,
    timestamp
  ).run();
  const leads = [];
  try {
    const businesses = body.skip_fast_discovery || !searchTrade ? [] : (await fetchLocalBusinessesWithDiagnostics(cityLabel, searchTrade, env, void 0, "tenant")).businesses;
    const ranked = (businesses || []).filter((b) => b && b.name && tenantBuyerNameFits(b.name, searchTrade)).map((b) => {
      const name = String(b.name);
      const isChain = /walmart|home depot|lowes|costco|mcdonald|starbucks|cvs|walgreens/i.test(name);
      let score = 55;
      if (b.phone) score += 10;
      if (b.website && !/facebook|instagram|wixsite/i.test(String(b.website))) score += 8;
      else score += 12;
      if (/property|management|hoa|apartment|realty|real estate|facility/i.test(name)) score += 15;
      if (isChain) score = 15;
      return { ...b, city: b.city || cityLabel, trade: searchTrade, _score: Math.min(100, score) };
    }).filter((b) => b._score >= 45).sort((a, b) => b._score - a._score).slice(0, 40);
    let newInserted = 0;
    for (const b of ranked) {
      if (newInserted >= 5 || leads.length >= 8) break;
      const prospectId = crypto.randomUUID();
      const demoToken = crypto.randomUUID().replace(/-/g, "");
      const identityKey = `${String(b.name).toLowerCase()}_${cityLabel.toLowerCase()}`.replace(/\s+/g, "_");
      const exists = await env.RADAR_DB.prepare(
        "SELECT id FROM prospects WHERE identity_key = ? AND COALESCE(tenant_id,'founder') = ? LIMIT 1"
      ).bind(identityKey, tenantId).first();
      if (exists) {
        const existing = await env.RADAR_DB.prepare("SELECT * FROM prospects WHERE id = ?").bind(exists.id).first();
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
        JSON.stringify({ fast_score: b._score, why: "Near you \xB7 buyer segment for your trade" }),
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
  } catch (e) {
    console.warn("[bootstrapBveltTenant] fast discovery error:", e?.message || e);
  }
  let runId = null;
  const runPromise = startProspectingRun(env, "tenant", tenantId, {
    cities: cityLabel,
    trades: searchTrade || null,
    countries: countries.join(";") || null,
    languages: languages.join(";") || null,
    min_score: String(minimumScore)
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
    } catch {
    }
  }
  const pendingBuyerIcp = niches.length === 0 && (!runId || runId === "no_buyer_segments" || runId === "no_targets");
  return {
    success: true,
    status: pendingBuyerIcp ? "pending_configuration" : "active",
    tenant_id: tenantId,
    city: cityLabel,
    niches,
    run_id: runId,
    leads,
    message: leads.length > 0 ? `Listo: ${leads.length} cliente(s) potencial(es) cerca de ${cityLabel}. M\xE1s en camino.` : pendingBuyerIcp ? "Perfil guardado. El buyer ICP se intentar\xE1 expandir con la informaci\xF3n del negocio; si no hay segmentos suficientes, a\xF1ade target_niches, allowed_markets o icp_keywords." : `Tenant listo en ${cityLabel}. Buscando compradores: ${niches.slice(0, 4).join(", ")}.`,
    missing_fields: pendingBuyerIcp ? ["target_niches_or_icp_keywords"] : void 0,
    source
  };
}
__name(bootstrapBveltTenant, "bootstrapBveltTenant");
async function startProspectingRun(env, mode, tenantId, overrides, force) {
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
  const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  const tId = tenantId || "founder";
  if (!force) {
    try {
      const existingRun = await db.prepare("SELECT id, created_at FROM runs WHERE day = ? AND mode = ? AND COALESCE(tenant_id,'founder') = ? ORDER BY created_at DESC LIMIT 1").bind(today, mode, tId).first();
      if (existingRun) {
        const createdAtMs = existingRun.created_at ? new Date(existingRun.created_at).getTime() : 0;
        const diffMs = Date.now() - createdAtMs;
        const fourHoursMs = 4 * 60 * 60 * 1e3;
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
  const dayOfYear = getDayOfYear(/* @__PURE__ */ new Date());
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
  if ((!activeCities || activeCities.length === 0 || !activeTrades || activeTrades.length === 0) && (!pairs || pairs.length === 0)) {
    const reason = mode === "tenant" ? `Tenant "${tId}" no tiene mercados o segmentos compradores v\xE1lidos. Configura cities_json e ICP buyer segments antes de correr el Radar.` : "No hay mercados y nichos activos para discovery. Configura FOUNDING_CITIES + FOUNDING_TRADES, o FOUNDING_COUNTRIES + FOUNDING_TRADES.";
    console.warn(`[startProspectingRun] ${reason}`);
    return {
      run_id: "no_targets",
      jobs_enqueued: 0,
      active_cities: activeCities || [],
      active_trades: activeTrades || [],
      diagnostics: { reason, city: null, trade: null, discovered_raw: 0 }
    };
  }
  await db.prepare(
    "INSERT INTO runs (id, day, mode, tenant_id, discovered, finalized, ai_calls, hunter_calls, errors_json, created_at) VALUES (?, ?, ?, ?, 0, 0, 0, 0, '[]', ?)"
  ).bind(runId, today, mode, tId, (/* @__PURE__ */ new Date()).toISOString()).run();
  let jobsEnqueued = 0;
  const hasOverrides = !!(overrides && (overrides.cities || overrides.trades || overrides.countries || overrides.languages || overrides.min_score));
  const MAX_JOBS = Math.min(8, Number(env.RADAR_JOBS_PER_RUN || 8));
  if (pairs && pairs.length > 0 && !hasOverrides) {
    for (const pair of pairs.slice(0, MAX_JOBS)) {
      const jobId = `discovery_${runId}_${pair.city.replace(/[^a-z0-9]/gi, "_")}_${pair.trade.replace(/[^a-z0-9]/gi, "_")}`.toLowerCase();
      await enqueueJob(env, {
        run_id: runId,
        job_id: jobId,
        type: "discovery",
        mode,
        tenant_id: tenantId,
        payload: { city: pair.city, trade: pair.trade, overrides }
      });
      jobsEnqueued++;
    }
  } else {
    outer: for (const city of activeCities) {
      for (const trade of activeTrades) {
        if (jobsEnqueued >= MAX_JOBS) break outer;
        const jobId = `discovery_${runId}_${city.replace(/[^a-z0-9]/gi, "_")}_${trade}`.toLowerCase();
        await enqueueJob(env, {
          run_id: runId,
          job_id: jobId,
          type: "discovery",
          mode,
          tenant_id: tenantId,
          payload: { city, trade, overrides }
        });
        jobsEnqueued++;
      }
    }
  }
  console.log(`[Queue Run Initiated] Run ${runId} enqueued ${jobsEnqueued} discovery jobs for cities=[${activeCities.join(", ")}] trades=[${activeTrades.join(", ")}]`);
  return {
    run_id: runId,
    jobs_enqueued: jobsEnqueued,
    active_cities: activeCities,
    active_trades: activeTrades,
    diagnostics: {
      bizdata_status: env.ENABLE_BIZDATA === "0" || env.ENABLE_BIZDATA === "false" ? "disabled" : "auto-fallback",
      overpass_status: "ready",
      nominatim_status: "ready",
      discovered_raw: 0,
      filtered: 0,
      reason: `Enqueued ${jobsEnqueued} discovery jobs across ${activeCities.join(", ") || "pairs"} for ${activeTrades.join(", ")}`
    }
  };
}
__name(startProspectingRun, "startProspectingRun");
function tenantBuyerNameFits(name, nicheOrTrade) {
  if (!name) return false;
  const n = name.toLowerCase();
  const niche = (nicheOrTrade || "").toLowerCase();
  const propertyNiche = /property|real estate|hoa|condo|apartment|realty|facility|building management|community management|office park|industrial park|warehouse/.test(niche);
  const hotelNiche = /hotel|hospitality|lodging|extended stay|senior living|assisted living|nursing home/.test(niche);
  if (propertyNiche) {
    return /property|management|manager|hoa|condo|apartment|realty|real estate|facility|building management|community management|office park|industrial park|warehouse/i.test(n);
  }
  if (hotelNiche) {
    return /hotel|inn|suites|lodge|motel|resort|senior living|assisted living|nursing home/i.test(n);
  }
  return true;
}
__name(tenantBuyerNameFits, "tenantBuyerNameFits");
function isNonBusinessEntity(name, website, mode) {
  if (website && mode !== "tenant") {
    try {
      const parsedUrl = new URL(website.startsWith("http") ? website : `http://${website}`);
      if (parsedUrl.hostname.toLowerCase().endsWith(".gov")) return true;
    } catch {
      const lowerWeb = website.toLowerCase();
      if (lowerWeb.endsWith(".gov") || lowerWeb.includes(".gov/")) return true;
    }
  }
  if (name) {
    const lowerName = name.toLowerCase();
    const publicAgencyPattern = /\b(police department|fire department|city government|county government|government agency|public authority)\b/;
    if (publicAgencyPattern.test(lowerName)) return true;
    if (mode !== "tenant") {
      const founderNonBuyerPattern = /\b(church|ministry|association|hoa|homeowners)\b/;
      if (founderNonBuyerPattern.test(lowerName)) return true;
    }
  }
  return false;
}
__name(isNonBusinessEntity, "isNonBusinessEntity");
async function ensureOpportunitiesSchema(db) {
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
    "prospect_id TEXT"
  ];
  for (const col of cols) {
    try {
      await db.prepare(`ALTER TABLE opportunities ADD COLUMN ${col}`).run();
    } catch {
    }
  }
  const nowIso = (/* @__PURE__ */ new Date()).toISOString();
  for (const sql of [
    `UPDATE opportunities SET mode = 'founder' WHERE mode IS NULL OR mode = ''`,
    `UPDATE opportunities SET first_seen_at = COALESCE(first_seen_at, created_at, '${nowIso}') WHERE first_seen_at IS NULL OR first_seen_at = ''`,
    `UPDATE opportunities SET last_seen_at = COALESCE(last_seen_at, updated_at, created_at, '${nowIso}') WHERE last_seen_at IS NULL OR last_seen_at = ''`,
    `UPDATE opportunities SET status = COALESCE(NULLIF(status,''), 'open') WHERE status IS NULL OR status = ''`,
    `UPDATE opportunities SET created_at = COALESCE(created_at, '${nowIso}') WHERE created_at IS NULL`,
    `UPDATE opportunities SET updated_at = COALESCE(updated_at, '${nowIso}') WHERE updated_at IS NULL`
  ]) {
    try {
      await db.prepare(sql).run();
    } catch {
    }
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
  } catch {
  }
}
__name(ensureOpportunitiesSchema, "ensureOpportunitiesSchema");
var _oppSchemaReady = false;
async function upsertOpportunity(db, opts) {
  if (!_oppSchemaReady) {
    await ensureOpportunitiesSchema(db);
    _oppSchemaReady = true;
  }
  const nowIso = (/* @__PURE__ */ new Date()).toISOString();
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
      opts.id,
      opts.prospect_id,
      opts.tenant_id || "founder",
      mode,
      opts.title,
      nowIso,
      nowIso,
      "open",
      s,
      opts.fit_score ?? s,
      opts.intent_score ?? Math.round(s * 0.8),
      opts.pain_score ?? Math.round(s * 0.7),
      opts.ability_to_pay_score ?? 60,
      opts.contactability_score ?? 70,
      opts.timing_score ?? 50,
      opts.evidence_score ?? 50,
      opts.signal_freshness_score ?? 80,
      opts.expected_value ?? 0,
      opts.decision_state || "identified",
      opts.why_now_json ?? null,
      opts.priority_tier || (s >= 80 ? "high" : s >= 55 ? "medium" : "low"),
      nowIso,
      nowIso
    ).run();
    return true;
  } catch (e) {
    console.warn("[upsertOpportunity] failed:", e?.message || e);
    try {
      const info = await db.prepare("PRAGMA table_info(opportunities)").all();
      const cols = new Set((info.results || []).map((r) => String(r.name)));
      const row = {
        id: opts.id,
        prospect_id: opts.prospect_id,
        tenant_id: opts.tenant_id || "founder",
        mode,
        title: opts.title,
        first_seen_at: nowIso,
        last_seen_at: nowIso,
        status: "open",
        strategic_score: s,
        fit_score: opts.fit_score ?? s,
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
        created_at: nowIso,
        updated_at: nowIso
      };
      const useCols = Object.keys(row).filter((k) => cols.has(k));
      if (useCols.length < 2) return false;
      const sql = `INSERT OR REPLACE INTO opportunities (${useCols.join(",")}) VALUES (${useCols.map(() => "?").join(",")})`;
      await db.prepare(sql).bind(...useCols.map((k) => row[k])).run();
      return true;
    } catch (e2) {
      console.warn("[upsertOpportunity] pragma failed:", e2?.message || e2);
      return false;
    }
  }
}
__name(upsertOpportunity, "upsertOpportunity");
async function classifyWithClef(env, name, website, trade, _city, _mode) {
  return classifyWithWorkersAI(env, name, website || null, trade);
}
__name(classifyWithClef, "classifyWithClef");
async function classifyWithWorkersAI(env, name, website, trade) {
  if (!env.AI || typeof env.AI.run !== "function") {
    return { ok: true, reason: "no_ai" };
  }
  try {
    const response = await env.AI.run("@cf/meta/llama-3.2-3b-instruct", {
      messages: [
        {
          role: "system",
          content: 'Responde SOLO JSON {"real_local_business":boolean,"matches_trade":boolean,"reason":string}. real_local_business=false si es instituci\xF3n p\xFAblica, universidad, iglesia, asociaci\xF3n, directorio, tienda de cadena o no ofrece servicios al p\xFAblico.'
        },
        {
          role: "user",
          content: `Nombre: ${name}
Web: ${website || "n/a"}
Oficio buscado: ${trade}`
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
  } catch (e) {
    return { ok: true, reason: e.message || "error_open" };
  }
}
__name(classifyWithWorkersAI, "classifyWithWorkersAI");
async function reconcileResendDeliveries(env) {
  const out = { checked: 0, bounced: 0, complained: 0 };
  const key = String(env.RESEND_API_KEY || "").trim();
  if (!key || !env.RADAR_DB) return out;
  const since = new Date(Date.now() - 10 * 24 * 3600 * 1e3).toISOString();
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
  for (const p of rows.results || []) {
    try {
      const res = await fetch(`https://api.resend.com/emails/${encodeURIComponent(p.dispatch_message_id)}`, {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(6e3)
      });
      if (res.status === 429) break;
      if (!res.ok) continue;
      const data = await res.json().catch(() => ({}));
      const ev = String(data?.last_event || "").toLowerCase();
      if (!ev) continue;
      out.checked++;
      const now = (/* @__PURE__ */ new Date()).toISOString();
      if (ev === "bounced" || ev === "complained") {
        const email = String(p.email || "").trim().toLowerCase();
        await env.RADAR_DB.prepare(
          "UPDATE prospects SET status = ?, outcome = ?, dispatch_status = ?, updated_at = ? WHERE id = ?"
        ).bind(ev === "complained" ? "suppressed" : "bounced", ev, ev, now, p.id).run();
        if (email) {
          await env.RADAR_DB.prepare("INSERT OR REPLACE INTO suppression (key, reason, created_at) VALUES (?, ?, ?)").bind(email, `resend_${ev}`, now).run();
        }
        if (ev === "bounced") out.bounced++;
        else out.complained++;
      } else if (["delivered", "opened", "clicked"].includes(ev)) {
        await env.RADAR_DB.prepare("UPDATE prospects SET dispatch_status = ?, updated_at = ? WHERE id = ?").bind(ev, now, p.id).run();
      }
    } catch {
    }
    await new Promise((r) => setTimeout(r, 600));
  }
  return out;
}
__name(reconcileResendDeliveries, "reconcileResendDeliveries");
async function handleDiscoveryJob(job, env) {
  const { city, trade, overrides } = job.payload;
  if (env.RADAR_DB && city && trade) {
    try {
      const scope = (job.tenant_id || "founder").trim() || "founder";
      const row = await env.RADAR_DB.prepare(
        `SELECT COUNT(*) AS c FROM prospects
         WHERE COALESCE(tenant_id,'founder') = ?
           AND lower(trim(city)) = lower(trim(?))
           AND lower(trim(trade)) = lower(trim(?))`
      ).bind(scope, city, trade).first();
      const existingCount = Number(row?.c || 0);
      const liveRow = await env.RADAR_DB.prepare(
        `SELECT COUNT(*) AS c FROM prospects
         WHERE COALESCE(tenant_id,'founder') = ?
           AND lower(trim(city)) = lower(trim(?))
           AND lower(trim(trade)) = lower(trim(?))
           AND lower(COALESCE(status,'')) NOT IN ('disqualified','discarded','blocked','bounced')`
      ).bind(scope, city, trade).first();
      const liveCount = Number(liveRow?.c || 0);
      if (liveCount >= 12) {
        console.log(`[Job: discovery] saturated_pair skip ${city} / ${trade} live=${liveCount} total=${existingCount} scope=${scope}`);
        try {
          const place2 = findPlace(city);
          if (place2) {
            await markSearched(env.RADAR_DB, scope, place2, trade, {
              candidates: liveCount,
              qualified: 0
            });
          }
        } catch (_) {
        }
        return;
      }
    } catch (e) {
      console.warn("[Job: discovery] saturated_pair check failed:", e);
    }
  }
  let customOsmTags = void 0;
  if (job.mode === "tenant" && job.tenant_id && env.RADAR_DB) {
    const cleanTrade = trade.toLowerCase().trim();
    if (!OVERPASS_TRADE_TAGS[cleanTrade]) {
      try {
        const tcRow = await env.RADAR_DB.prepare(
          "SELECT icp_expansion_json FROM tenant_config WHERE tenant_id = ?"
        ).bind(job.tenant_id).first();
        if (tcRow && tcRow.icp_expansion_json) {
          const expansion = typeof tcRow.icp_expansion_json === "string" ? JSON.parse(tcRow.icp_expansion_json) : tcRow.icp_expansion_json;
          if (expansion && Array.isArray(expansion.segments)) {
            const matchingSeg = expansion.segments.find(
              (s) => (s.label || "").toLowerCase().trim() === cleanTrade
            );
            if (matchingSeg && Array.isArray(matchingSeg.osm_tags) && matchingSeg.osm_tags.length > 0) {
              customOsmTags = matchingSeg.osm_tags;
            } else {
              const allSegTags = expansion.segments.flatMap((s) => Array.isArray(s.osm_tags) ? s.osm_tags : []);
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
  const { businesses: scraped, diagnostics } = await fetchLocalBusinessesWithDiagnostics(city, trade, env, customOsmTags, job.mode === "tenant" ? "tenant" : "founder");
  if (scraped.length === 0) {
    console.warn(`[Job: discovery] 0 businesses found for ${city} - ${trade}:`, diagnostics.reason);
    if (env.RADAR_DB) {
      try {
        const existingRun = await env.RADAR_DB.prepare("SELECT errors_json FROM runs WHERE id = ?").bind(job.run_id).first();
        let errorsArr = [];
        if (existingRun && existingRun.errors_json) {
          try {
            errorsArr = JSON.parse(existingRun.errors_json);
          } catch (e) {
          }
        }
        errorsArr.push(diagnostics);
        await env.RADAR_DB.prepare("UPDATE runs SET errors_json = ? WHERE id = ?").bind(JSON.stringify(errorsArr), job.run_id).run();
        await env.RADAR_DB.prepare("UPDATE radar_jobs SET status = 'completed_zero_prospects', last_error = ?, updated_at = ? WHERE id = ?").bind(diagnostics.reason, (/* @__PURE__ */ new Date()).toISOString(), job.job_id).run();
        await env.RADAR_DB.prepare("UPDATE queue_jobs SET status = 'completed_zero_prospects', error = ?, completed_at = ? WHERE job_id = ?").bind(diagnostics.reason, (/* @__PURE__ */ new Date()).toISOString(), job.job_id).run();
      } catch (e) {
      }
    }
    const reason = String(diagnostics?.reason || "").toLowerCase();
    const isInfraFail = reason.includes("timeout") || reason.includes("aborted") || reason.includes("http 4") || reason.includes("http 5") || reason.includes("network") || reason.includes("fetch failed") || reason.includes("econn") || reason.includes("overpass") && reason.includes("fail");
    const isHonestEmpty = reason.includes("0 matches") || reason.includes("0 businesses") || reason.includes("0 elements") || reason.includes("empty") || reason.includes("no results");
    if (!isInfraFail && (isHonestEmpty || !reason)) {
      const place2 = findPlace(city);
      if (place2) {
        await markSearched(env.RADAR_DB, job.tenant_id || "founder", place2, trade, {
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
  const remainingBudget = await getRemainingBudget(env.RADAR_DB, tenantId, "discovery_units");
  if (remainingBudget <= 0) {
    console.log(`[Job: discovery] 0 discovery units available for tenant: ${tenantId}`);
    return;
  }
  const ranked = [...scraped].sort((a, b) => {
    const permitsA = typeof a.permits_90d === "number" ? a.permits_90d : 0;
    const permitsB = typeof b.permits_90d === "number" ? b.permits_90d : 0;
    if (permitsB !== permitsA) {
      return permitsB - permitsA;
    }
    const contactScore = /* @__PURE__ */ __name((x) => {
      let s = 0;
      if (x.email && String(x.email).includes("@")) s += 8;
      if (x.phone && String(x.phone).replace(/\D/g, "").length >= 7) s += 4;
      if (x.website && isRealWebsite(String(x.website))) s += 2;
      return s;
    }, "contactScore");
    const csB = contactScore(b);
    const csA = contactScore(a);
    if (csB !== csA) return csB - csA;
    return 0;
  });
  const perJobCap = 3;
  const maxScan = 40;
  const acceptCap = Math.min(remainingBudget, perJobCap);
  const bounded = ranked.slice(0, maxScan);
  let enqueuedEnrich = 0;
  let filteredCount = 0;
  let aiClassifyCalls = 0;
  for (const candidate of bounded) {
    if (enqueuedEnrich >= acceptCap) break;
    const preName = (candidate.name || "").toLowerCase();
    const allowTenantBuyer = job.mode === "tenant";
    if (isOffIcpName(candidate.name, allowTenantBuyer)) {
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
    if ((candidate.email || "").toLowerCase().includes("example.com") || (candidate.website || "").toLowerCase().includes("example.com") || preName.includes("test business") || isHardRejectedChain(candidate.name) || isNonBusinessEntity(candidate.name, candidate.website, job.mode) || job.mode === "tenant" && !tenantBuyerNameFits(candidate.name, trade)) {
      filteredCount++;
      continue;
    }
    const reserved = await reserveBudget(env.RADAR_DB, tenantId, "discovery_units", 1);
    if (!reserved) {
      console.log(`[Job: discovery] Failed to reserve discovery unit. Budget exhausted for tenant: ${tenantId}`);
      break;
    }
    const isMock = candidate.email && candidate.email.toLowerCase().includes("example.com") || candidate.website && candidate.website.toLowerCase().includes("example.com") || candidate.name && (candidate.name.toLowerCase().includes("test business") || candidate.name.toLowerCase().includes("test contractor"));
    if (isMock || isHardRejectedChain(candidate.name) || isNonBusinessEntity(candidate.name, candidate.website, job.mode)) {
      await releaseBudget(env.RADAR_DB, tenantId, "discovery_units", 1);
      filteredCount++;
      continue;
    }
    if (isHardRejectedChain(candidate.name) || isNonBusinessEntity(candidate.name, candidate.website, job.mode)) {
      await releaseBudget(env.RADAR_DB, tenantId, "discovery_units", 1);
      filteredCount++;
      continue;
    }
    if (job.mode === "tenant" && !tenantBuyerNameFits(candidate.name, trade)) {
      await releaseBudget(env.RADAR_DB, tenantId, "discovery_units", 1);
      filteredCount++;
      continue;
    }
    const identityKey = generateIdentityKey(candidate.email, candidate.website, candidate.phone, candidate.name, candidate.city);
    const suppression = await checkSuppressedComposite(env.RADAR_DB, candidate.email, candidate.website, candidate.phone, candidate.name, candidate.city, job.tenant_id || "founder");
    if (suppression) {
      await releaseBudget(env.RADAR_DB, tenantId, "discovery_units", 1);
      filteredCount++;
      continue;
    }
    const overlap = await findExistingProspectOverlap(env.RADAR_DB, candidate.email, candidate.website, candidate.phone, candidate.name, candidate.city, job.tenant_id || "founder");
    if (overlap) {
      const p = overlap.overlap;
      await associateResearchCandidate(env.RADAR_DB, job.run_id, job.mode, job.tenant_id, p.id);
      const status = (p.status || "").toLowerCase();
      const outcome = (p.outcome || "").toLowerCase();
      if (status === "discarded" || outcome === "rejected" || status === "suppressed" || status === "blocked" || status === "unsubscribed") {
        await releaseBudget(env.RADAR_DB, tenantId, "discovery_units", 1);
        filteredCount++;
        continue;
      }
      if (isCooldownActive(p.cooldown_until)) {
        await releaseBudget(env.RADAR_DB, tenantId, "discovery_units", 1);
        filteredCount++;
        continue;
      }
      if (p.last_contact_at) {
        const contactTime = new Date(p.last_contact_at).getTime();
        const daysSinceContact = (Date.now() - contactTime) / (1e3 * 60 * 60 * 24);
        if (daysSinceContact < 45) {
          await releaseBudget(env.RADAR_DB, tenantId, "discovery_units", 1);
          filteredCount++;
          continue;
        }
      }
      if (["approved", "drafted", "queued", "notified", "sent", "human_review", "scored", "enriched"].includes(status)) {
        await releaseBudget(env.RADAR_DB, tenantId, "discovery_units", 1);
        filteredCount++;
        continue;
      }
      await releaseBudget(env.RADAR_DB, tenantId, "discovery_units", 1);
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
        await releaseBudget(env.RADAR_DB, tenantId, "discovery_units", 1);
        filteredCount++;
        continue;
      }
    }
    let signalEvent = candidate.signal_event || null;
    let signalArea = candidate.signal_area || null;
    if (!signalEvent) {
      try {
        const cityLabel = String(job.payload?.city || candidate.city || env.FOUNDING_CITIES || "");
        const configuredCountries = String(env.FOUNDING_COUNTRIES || "").split(";").map((value) => value.trim().toUpperCase());
        const isUsMarket = String(candidate.country || job.payload?.country || "").toUpperCase() === "US" || configuredCountries.includes("US");
        const extractedStates = isUsMarket ? extractUsStateCodes(cityLabel.split(";")) : [];
        if (extractedStates.length > 0) {
          const alerts = await getAlerts(extractedStates);
          const candCity = (candidate.city || "").split(",")[0].trim().toLowerCase();
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
        }
      } catch (e) {
      }
    }
    if (isOffIcpName(candidate.name, job.mode === "tenant")) {
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
      candidate.source || "scraper",
      (/* @__PURE__ */ new Date()).toISOString(),
      (/* @__PURE__ */ new Date()).toISOString(),
      identityKey,
      demoToken,
      signalEvent,
      signalArea,
      postalCode
    ).run();
    await associateResearchCandidate(env.RADAR_DB, job.run_id, job.mode, job.tenant_id, prospectId);
    if (candidate.seed_id) {
      try {
        await env.RADAR_DB.prepare("UPDATE seed_businesses SET used_at = ? WHERE id = ?").bind((/* @__PURE__ */ new Date()).toISOString(), candidate.seed_id).run();
      } catch (e) {
      }
    }
    await enqueueJob(env, {
      run_id: job.run_id,
      job_id: `enrich_${prospectId}`,
      type: "enrich",
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
    diagnostics.filtered = scraped.length - bounded.length + filteredCount;
    diagnostics.reason = `Discovered ${scraped.length} raw, ${enqueuedEnrich} enqueued for enrichment, ${diagnostics.filtered} filtered`;
    const existingRun = await env.RADAR_DB.prepare("SELECT errors_json FROM runs WHERE id = ?").bind(job.run_id).first();
    let errorsArr = [];
    if (existingRun && existingRun.errors_json) {
      try {
        errorsArr = JSON.parse(existingRun.errors_json);
      } catch (e) {
      }
    }
    errorsArr.push(diagnostics);
    await env.RADAR_DB.prepare("UPDATE runs SET discovered = discovered + ?, errors_json = ? WHERE id = ?").bind(enqueuedEnrich, JSON.stringify(errorsArr), job.run_id).run();
  } catch (e) {
  }
  const place = findPlace(city);
  if (place) {
    await markSearched(env.RADAR_DB, job.tenant_id || "founder", place, trade, {
      candidates: scraped.length,
      qualified: enqueuedEnrich
    });
  }
  if (enqueuedEnrich > 0) {
    try {
      const isTenant = job.mode === "tenant" && !!job.tenant_id;
      const scopeLabel = isTenant ? `Tenant <code>${escapeHtml2(String(job.tenant_id))}</code>` : "Founder (Bvelt)";
      const purpose = isTenant ? "Clientes potenciales para tu cliente Bvelt" : "Prospectos para Bvelt";
      const msg = `<b>\u{1F4E1} Radar discovery OK</b>
<b>Modo:</b> ${scopeLabel}
<b>Mercado:</b> ${escapeHtml2(String(city))} \xB7 ${escapeHtml2(String(trade))}
<b>Raw:</b> ${scraped.length} \xB7 <b>Nuevos en cola:</b> ${enqueuedEnrich}
<b>Objetivo:</b> ${purpose}
<b>run:</b> <code>${escapeHtml2(String(job.run_id || "").slice(0, 13))}\u2026</code>`;
      await notifyFounder(env, msg).catch(() => {
      });
    } catch (tgDiscErr) {
      console.warn("[discovery] telegram summary failed:", tgDiscErr);
    }
  }
}
__name(handleDiscoveryJob, "handleDiscoveryJob");
async function handleEnrichJob(job, env) {
  const { prospect_id, overrides, permits_90d } = job.payload;
  const prospect = await env.RADAR_DB.prepare("SELECT * FROM prospects WHERE id = ?").bind(prospect_id).first();
  if (!prospect) return;
  if (isOffIcpName(prospect.name, prospect.mode === "tenant")) {
    await env.RADAR_DB.prepare("UPDATE prospects SET status = 'disqualified', outcome = 'off_icp_name', updated_at = ? WHERE id = ?").bind((/* @__PURE__ */ new Date()).toISOString(), prospect.id).run();
    return;
  }
  const enrichCoherence = checkTradeCoherence(prospect.name, prospect.trade, prospect.website, prospect.signals_json, prospect.mode);
  if (!enrichCoherence.coherent && enrichCoherence.disqualified) {
    await env.RADAR_DB.prepare("UPDATE prospects SET status = 'disqualified', outcome = 'off_icp_name', updated_at = ? WHERE id = ?").bind((/* @__PURE__ */ new Date()).toISOString(), prospect.id).run();
    return;
  }
  if (enrichCoherence.verifiedTrade && enrichCoherence.verifiedTrade !== prospect.trade) {
    await env.RADAR_DB.prepare("UPDATE prospects SET trade = ?, updated_at = ? WHERE id = ?").bind(enrichCoherence.verifiedTrade, (/* @__PURE__ */ new Date()).toISOString(), prospect.id).run();
    prospect.trade = enrichCoherence.verifiedTrade;
  }
  if (["enriched", "scored", "approved", "drafted", "notified", "sent"].includes(prospect.status)) {
    await enqueueJob(env, {
      run_id: job.run_id,
      job_id: `score_${prospect_id}`,
      type: "score",
      mode: job.mode,
      tenant_id: job.tenant_id,
      payload: { prospect_id, overrides, permits_90d }
    });
    return;
  }
  let websiteEmail = null;
  let websitePhone = prospect.phone || null;
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
  const tenantId = job.tenant_id || "founder";
  let enrichmentReserved = false;
  if (prospect.website && isRealWebsite(prospect.website)) {
    enrichmentReserved = await reserveBudget(env.RADAR_DB, tenantId, "enrichment_units", 1);
    if (enrichmentReserved) {
      try {
        const scrapeResult = await scrapeWebsiteContact(prospect.website);
        if (scrapeResult.email) websiteEmail = scrapeResult.email;
        if (scrapeResult.phone && !websitePhone) websitePhone = scrapeResult.phone;
        if (scrapeResult.signals) signals = scrapeResult.signals;
        await commitBudget(env.RADAR_DB, tenantId, "enrichment_units", 1);
      } catch (e) {
        console.warn(`Scraping warning on ${prospect.website}: ${e.message}`);
        await releaseBudget(env.RADAR_DB, tenantId, "enrichment_units", 1);
      }
    }
  }
  let emailCandidate = prospect.email || websiteEmail;
  const domain = prospect.website && isRealWebsite(prospect.website) ? getDomain(prospect.website) : null;
  if (domain && env.HUNTER_API_KEY) {
    try {
      const reserved = await reserveBudget(env.RADAR_DB, tenantId, "hunter_units", 1);
      if (reserved) {
        const hunterEmail = await fetchHunterEmail(domain, env.HUNTER_API_KEY);
        if (hunterEmail) {
          emailCandidate = hunterEmail;
          await env.RADAR_DB.prepare("UPDATE runs SET hunter_calls = hunter_calls + 1 WHERE id = ?").bind(job.run_id).run();
          await commitBudget(env.RADAR_DB, tenantId, "hunter_units", 1);
        } else {
          await releaseBudget(env.RADAR_DB, tenantId, "hunter_units", 1);
        }
      }
    } catch (e) {
    }
  }
  let emailSource = "none";
  if (prospect.email && emailCandidate === prospect.email) emailSource = "existing";
  else if (websiteEmail && emailCandidate === websiteEmail) emailSource = "scrape";
  else if (emailCandidate) emailSource = "hunter";
  let isEmailValidated = false;
  let emailQuality = 0;
  if (emailCandidate) {
    const verification = await verifyEmail(emailCandidate, env);
    emailQuality = Number(verification.quality_score || 0);
    if (verification.valid) {
      isEmailValidated = true;
    } else {
      const temporary = ["UNKNOWN", "UNVERIFIED", "UNVERIFIED_PASSED"].includes(String(verification.deliverability || "").toUpperCase());
      if (!temporary) emailCandidate = null;
    }
  }
  let existingMeta = {};
  try {
    existingMeta = JSON.parse(prospect.signals_json || "{}");
  } catch (e) {
  }
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
    technical_audits: buildTechnicalAuditSnapshot(null, null, null)
  };
  await env.RADAR_DB.prepare(`
    UPDATE prospects
    SET phone = COALESCE(?, phone), email = COALESCE(?, email), signals_json = ?, status = 'enriched', updated_at = ?
    WHERE id = ?
  `).bind(
    websitePhone,
    emailCandidate,
    JSON.stringify(signalMetadata),
    (/* @__PURE__ */ new Date()).toISOString(),
    prospect_id
  ).run();
  await enqueueJob(env, {
    run_id: job.run_id,
    job_id: `technical_${prospect_id}`,
    type: "technical_audit",
    mode: job.mode,
    tenant_id: job.tenant_id,
    payload: { prospect_id, overrides, permits_90d: effectivePermits }
  });
}
__name(handleEnrichJob, "handleEnrichJob");
function buildTechnicalAuditSnapshot(webAudit, dmarcAudit, weatherAudit) {
  return {
    pagespeed_score: webAudit?.mobileScore ?? null,
    fcp_seconds: webAudit?.fcpSeconds ?? null,
    latency_ms: webAudit?.latencyMs ?? null,
    is_slow_mobile: webAudit ? Boolean(webAudit.isSlow) : null,
    has_dmarc: dmarcAudit ? Boolean(dmarcAudit.hasDmarc) : null,
    has_spf: dmarcAudit ? Boolean(dmarcAudit.hasSpf) : null,
    weather_alert: weatherAudit?.weatherSignal ?? null
  };
}
__name(buildTechnicalAuditSnapshot, "buildTechnicalAuditSnapshot");
async function handleTechnicalAuditJob(job, env) {
  const { prospect_id, overrides, permits_90d } = job.payload;
  const prospect = await env.RADAR_DB.prepare("SELECT id, website, city FROM prospects WHERE id = ?").bind(prospect_id).first();
  if (!prospect) return;
  const website = prospect.website && isRealWebsite(prospect.website) ? prospect.website : null;
  const domain = website ? getDomain(website) : null;
  let dmarcAudit = null;
  let webAudit = null;
  let weatherAudit = null;
  let probe = null;
  if (domain) {
    try {
      dmarcAudit = await auditDomainSecurityAndMx(domain);
    } catch (error) {
      console.warn("[Technical Audit] DNS audit unavailable:", error?.message || error);
    }
  }
  if (website) {
    try {
      webAudit = await auditWebsitePerformance(website, env.PAGESPEED_API_KEY);
    } catch (error) {
      console.warn("[Technical Audit] PageSpeed unavailable:", error?.message || error);
    }
    try {
      probe = await probeWebsiteHealth(website);
    } catch (error) {
      console.warn("[Technical Audit] Website probe unavailable:", error?.message || error);
    }
    if (!webAudit && probe) {
      webAudit = {
        mobileScore: null,
        fcpSeconds: probe.isSlow ? 3.5 : null,
        latencyMs: probe.ms,
        isSlow: probe.isSlow,
        parked: probe.parked,
        reachable: probe.ok
      };
    }
  }
  if (prospect.city) {
    try {
      weatherAudit = await auditCityWeatherEmergency(prospect.city);
    } catch (error) {
      console.warn("[Technical Audit] Weather unavailable:", error?.message || error);
    }
  }
  const snapshot = buildTechnicalAuditSnapshot(webAudit, dmarcAudit, weatherAudit);
  const noOwnWebsite = website ? probe ? Boolean(probe.parked || !probe.ok) : null : true;
  try {
    if (noOwnWebsite === null) {
      await env.RADAR_DB.prepare(`
        UPDATE prospects
        SET pagespeed_score = COALESCE(?, pagespeed_score),
            dns_has_dmarc = COALESCE(?, dns_has_dmarc),
            weather_context = COALESCE(?, weather_context),
            signals_json = json_set(COALESCE(signals_json, '{}'), '$.technical_audits', json(?)),
            updated_at = ?
        WHERE id = ?
      `).bind(
        webAudit?.mobileScore ?? null,
        dmarcAudit ? dmarcAudit.hasDmarc ? 1 : 0 : null,
        weatherAudit?.weatherSignal ?? null,
        JSON.stringify(snapshot),
        (/* @__PURE__ */ new Date()).toISOString(),
        prospect_id
      ).run();
    } else {
      await env.RADAR_DB.prepare(`
        UPDATE prospects
        SET pagespeed_score = COALESCE(?, pagespeed_score),
            dns_has_dmarc = COALESCE(?, dns_has_dmarc),
            weather_context = COALESCE(?, weather_context),
            signals_json = json_set(COALESCE(signals_json, '{}'), '$.technical_audits', json(?), '$.no_own_website', ?),
            updated_at = ?
        WHERE id = ?
      `).bind(
        webAudit?.mobileScore ?? null,
        dmarcAudit ? dmarcAudit.hasDmarc ? 1 : 0 : null,
        weatherAudit?.weatherSignal ?? null,
        JSON.stringify(snapshot),
        noOwnWebsite ? 1 : 0,
        (/* @__PURE__ */ new Date()).toISOString(),
        prospect_id
      ).run();
    }
  } catch (error) {
    console.warn("[Technical Audit] Persist failed; scoring continues with available evidence:", error?.message || error);
  }
  await enqueueJob(env, {
    run_id: job.run_id,
    job_id: `score_${prospect_id}`,
    type: "score",
    mode: job.mode,
    tenant_id: job.tenant_id,
    payload: { prospect_id, overrides, permits_90d }
  });
}
__name(handleTechnicalAuditJob, "handleTechnicalAuditJob");
async function handleScoreJob(job, env) {
  const isTenant = job.mode === "tenant";
  const { prospect_id, overrides, permits_90d: payloadPermits } = job.payload;
  const prospect = await env.RADAR_DB.prepare("SELECT * FROM prospects WHERE id = ?").bind(prospect_id).first();
  if (!prospect) return;
  if (["approved", "drafted", "notified", "sent"].includes(prospect.status)) return;
  const dayOfYear = getDayOfYear(/* @__PURE__ */ new Date());
  const { missionConfig } = await getPriorityTargets(dayOfYear, env, job.mode, job.tenant_id, overrides, true);
  const learningStats = await getLearningStats(env.RADAR_DB, job.mode === "tenant" ? "tenant" : "founder", job.tenant_id || "founder");
  let parsedMeta = {};
  try {
    parsedMeta = JSON.parse(prospect.signals_json || "{}");
  } catch (e) {
  }
  const permits_90d = Number(payloadPermits ?? parsedMeta.permits_90d ?? prospect.permits_90d ?? 0);
  const isPermitsSource = prospect.source === "permits" || job.payload.source === "permits";
  const signals = parsedMeta.signals || {};
  const isEmailValidated = !!parsedMeta.is_email_validated;
  const isPriorityCity = missionConfig.geographies.some((c) => c.toLowerCase().includes(prospect.city.split(",")[0].toLowerCase()));
  const isPriorityTrade = missionConfig.niches.includes(prospect.trade.toLowerCase());
  if (isHardRejectedChain(prospect.name)) {
    console.warn(`[Quality Gate] Hard-rejected retail chain: ${prospect.name}`);
    await env.RADAR_DB.prepare(`
      UPDATE prospects
      SET status = 'blocked', outcome = 'hard_rejected_chain', suppression_reason = 'Retail chain', updated_at = ?
      WHERE id = ?
    `).bind((/* @__PURE__ */ new Date()).toISOString(), prospect_id).run();
    return;
  }
  let finalScore = 0;
  let breakdown = {};
  let confidence = 50;
  let evidenceSummary = "";
  let evidenceItems = [];
  let painHypothesis = {};
  const signalTags = [];
  let bveltAngle = "";
  let variantId = "missed_calls";
  if (isTenant) {
    let tcRow = null;
    let baseCity = "";
    let expansionSegments = [];
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
      } catch (e) {
      }
    }
    if (!baseCity && missionConfig.geographies && missionConfig.geographies.length > 0) {
      baseCity = missionConfig.geographies[0];
    }
    const nameLower = (prospect.name || "").toLowerCase();
    const tradeLower2 = (prospect.trade || "").toLowerCase();
    let encaje = 0;
    const targetNiches = (missionConfig?.niches || []).map((n) => n.toLowerCase());
    let matchesSegment = targetNiches.some((n) => tradeLower2.includes(n) || nameLower.includes(n));
    if (!matchesSegment && expansionSegments.length > 0) {
      for (const seg of expansionSegments) {
        const segLabel = (seg.label || "").toLowerCase();
        const kws = Array.isArray(seg.keywords) ? seg.keywords.map((k) => String(k).toLowerCase()) : [];
        if (segLabel && (tradeLower2.includes(segLabel) || nameLower.includes(segLabel))) {
          matchesSegment = true;
          break;
        }
        if (kws.some((k) => tradeLower2.includes(k) || nameLower.includes(k))) {
          matchesSegment = true;
          break;
        }
      }
    }
    if (matchesSegment) encaje += 25;
    if (prospect.website && isRealWebsite(prospect.website)) encaje += 15;
    encaje = Math.min(40, encaje);
    breakdown.encaje = encaje;
    let contacto = 0;
    if (prospect.email && isEmailValidated) {
      contacto += 15;
      signalTags.push("Email validado");
    } else if (prospect.email) {
      contacto += 8;
    }
    if (prospect.phone) {
      contacto += 10;
      signalTags.push("Tel\xE9fono directo");
    }
    contacto = Math.min(25, contacto);
    breakdown.contacto = contacto;
    let cercania = 8;
    let distKm = null;
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
    evidenceSummary = `Comprador B2B para ${tcRow?.niche || prospect.trade} en ${prospect.city}${distKm !== null ? ` (a ${distKm} km)` : ""}`;
    painHypothesis = { mode: "tenant_buyer", icp_match: matchesSegment };
    bveltAngle = "tenant_buyer_opportunity";
    variantId = "tenant_direct";
  } else {
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
        signal_type: "active_permits",
        value: "detected",
        source_url: "municipal_permits",
        source_type: "permit_records",
        observed_at: (/* @__PURE__ */ new Date()).toISOString(),
        evidence_text: `Obra activa (${permits_90d} permisos/90d)`,
        confidence: 1,
        freshness: 1,
        page_type: "permits"
      });
    }
    if (signals.emergency) signalTags.push("24/7 / Urgencias");
    if (signals.sms_gap) signalTags.push("SMS Gap");
    if (signals.quote_request) signalTags.push("Presupuesto");
    if (signals.booking) signalTags.push("Reserva");
    if (signals.multiple_areas) signalTags.push("Multi-\xE1rea");
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
    variantId = hashCode(prospect.name + prospect.city) % 2 === 0 ? "missed_calls" : "dormant_leads";
  }
  const evidenceSummaryWithPermits = isPermitsSource && permits_90d >= 3 ? `Obra activa (${permits_90d} permisos/90d); ${evidenceSummary}` : evidenceSummary;
  const updatedMeta = {
    ...parsedMeta,
    permits_90d,
    signal_tags: signalTags,
    active_signals: signalTags,
    permits_tag: isPermitsSource && permits_90d >= 3 ? `Obra activa (${permits_90d} permisos/90d)` : void 0,
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
  if (!isTenant) {
    try {
      await env.RADAR_DB.prepare(
        "INSERT INTO prospect_events (prospect_id, event_type, content, created_at) VALUES (?, 'demo_created', ?, ?)"
      ).bind(prospect_id, "Personalized demo token generated based on structured evidence", (/* @__PURE__ */ new Date()).toISOString()).run();
    } catch (e) {
    }
  }
  const strat = isTenant ? {
    fit_score: breakdown.encaje ? Math.round(breakdown.encaje / 40 * 100) : 50,
    intent_score: breakdown.senal ? Math.round(breakdown.senal / 15 * 100) : 50,
    pain_score: 50,
    ability_to_pay_score: 75,
    contactability_score: breakdown.contacto ? Math.round(breakdown.contacto / 25 * 100) : 50,
    timing_score: breakdown.cercania ? Math.round(breakdown.cercania / 20 * 100) : 50,
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
      why_it_matters: "Cliente de alto valor para contrataci\xF3n y mantenimiento",
      why_now: "Ubicaci\xF3n cercana y canales de contacto activos",
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
  const valueBand = finalScore >= 80 ? "premium" : finalScore >= 60 ? "high" : finalScore >= 45 ? "medium" : "low";
  const contactable = !!(prospect.email || prospect.phone);
  const minScoreGate = isTenant ? Number(overrides?.min_score) || Number(missionConfig?.min_score) || 40 : 45;
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
      (/* @__PURE__ */ new Date()).toISOString(),
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
    (/* @__PURE__ */ new Date()).toISOString(),
    prospect_id
  ).run();
  try {
    const oppId = `opp_${prospect_id}`;
    const tenantId = job.tenant_id || prospect.tenant_id || "founder";
    const title = `${prospect.name} \u2014 ${prospect.trade} (${prospect.city})`;
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
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
          sigId,
          oppId,
          fact,
          strat.why_now?.distinctions?.inferences?.[0] || null,
          strat.signal_freshness_score || 80,
          nowIso,
          nowIso
        ).run();
      }
      const actionId = `act_${crypto.randomUUID().replace(/-/g, "")}`;
      await env.RADAR_DB.prepare(`
        INSERT INTO opportunity_actions (
          id, opportunity_id, action_type, status, details_json, proposed_at, executed_at
        ) VALUES (?, ?, 'outreach_draft', 'proposed', ?, ?, NULL)
      `).bind(
        actionId,
        oppId,
        JSON.stringify({ recommended: strat.why_now?.recommended_action || "Contact", angle: bveltAngle }),
        nowIso
      ).run();
    } catch (inner) {
      console.warn("[Opportunity Intelligence] signals/actions optional fail:", inner);
    }
  } catch (e) {
    console.warn("[Opportunity Intelligence] Error registering opportunity:", e);
  }
  try {
    const todayStr = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    const tenantKey = job.mode === "tenant" && job.tenant_id ? job.tenant_id : "founder";
    await env.RADAR_DB.prepare("UPDATE daily_missions SET qualified_count = qualified_count + 1 WHERE tenant_id = ? AND day = ?").bind(tenantKey, todayStr).run();
  } catch (e) {
  }
  if (isTenant) {
    await env.RADAR_DB.prepare("UPDATE prospects SET status = 'qualified' WHERE id = ?").bind(prospect_id).run();
    await sendTenantObservationsToBvelt(env, String(job.tenant_id || ""), {
      prospectIds: [String(prospect_id)]
    }).catch((error) => console.warn("[Tenant Bvelt Sync] Qualified prospect sync failed:", error));
    return;
  }
  const detectedCount = evidenceItems.filter((e) => e.value === "detected").length;
  const tradeLower = (prospect.trade || "").toLowerCase();
  const isPreferred = PREFERRED_TRADES.has(tradeLower) || /hvac|plumb|electr|roof|lawn|landscap|pool|clean|handyman/i.test(tradeLower);
  const bveltFitScore = isPreferred ? 15 : 0;
  const isHotLead = finalScore >= 90 && confidence >= 80 || detectedCount >= 3 && !!prospect.signal_event && bveltFitScore >= 15;
  if (isHotLead && prospect.email) {
    try {
      const alreadyAlerted = await env.RADAR_DB.prepare(
        "SELECT COUNT(*) as c FROM prospect_events WHERE prospect_id = ? AND event_type = 'hot_lead_alert_sent'"
      ).bind(prospect_id).first();
      if (!alreadyAlerted || alreadyAlerted.c === 0) {
        await env.RADAR_DB.prepare(
          "INSERT INTO prospect_events (prospect_id, event_type, content, created_at) VALUES (?, 'hot_lead_alert_sent', ?, ?)"
        ).bind(prospect_id, "Hot lead Telegram notification sent", (/* @__PURE__ */ new Date()).toISOString()).run();
        const demoLink = "https://bvelt.app/";
        const hotMsg = `\u{1F525} <b>BVELT HOT OPPORTUNITY</b>

\u{1F3E2} <b>Business:</b> ${escapeHtml2(prospect.name)}
\u{1F4CD} <b>Market:</b> ${escapeHtml2(prospect.city)}
\u{1F6E0} <b>Trade:</b> ${escapeHtml2(prospect.trade)}

\u{1F4CA} <b>Score:</b> <b>${finalScore}/100</b>
\u{1F3AF} <b>Confidence:</b> <b>${confidence}%</b>

\u26A1 <b>Why Now:</b>
` + (prospect.signal_event ? `\u2022 Severe weather event active: ${escapeHtml2(prospect.signal_event)}
` : "") + (signals.sms_gap ? `\u2022 Active mobile visitors drop-off detected (no SMS support)
` : "") + `\u2022 High-converting contractor profile match

\u{1F50E} <b>Evidence:</b>
` + (evidenceSummary ? `\u2022 ${escapeHtml2(evidenceSummary)}
` : "\u2022 Standard verified active presence\n") + `\u2022 Smart crawl completed across up to 3 same-domain pages

\u{1F4A1} <b>Recommended Angle:</b>
\u2022 ${escapeHtml2(bveltAngle.replace(/_/g, " "))}

\u{1F517} <b>Personalized Demo Link:</b>
<a href="${demoLink}">${demoLink}</a>`;
        await notifyFounder(env, hotMsg).catch(() => {
        });
      }
    } catch (e) {
      console.warn("Error triggering Hot Lead alert:", e);
    }
  }
  if (finalScore >= 45 && prospect.email && !isHardRejectedChain(prospect.name)) {
    await enqueueJob(env, {
      run_id: job.run_id,
      job_id: `approve_${prospect_id}`,
      type: "approve",
      mode: job.mode,
      tenant_id: job.tenant_id,
      payload: { prospect_id, overrides }
    });
  }
}
__name(handleScoreJob, "handleScoreJob");
async function handleApproveJob(job, env) {
  if (job.mode === "tenant") return;
  const { prospect_id, overrides } = job.payload;
  const prospect = await env.RADAR_DB.prepare("SELECT * FROM prospects WHERE id = ?").bind(prospect_id).first();
  if (!prospect) return;
  if (isHardRejectedChain(prospect.name)) {
    await env.RADAR_DB.prepare("UPDATE prospects SET status = 'blocked', outcome = 'hard_rejected_chain', updated_at = ? WHERE id = ?").bind((/* @__PURE__ */ new Date()).toISOString(), prospect_id).run();
    return;
  }
  if ((prospect.score || 0) < 45 || !prospect.email) {
    await env.RADAR_DB.prepare("UPDATE prospects SET status = 'disqualified', outcome = 'low_score_or_no_email', updated_at = ? WHERE id = ?").bind((/* @__PURE__ */ new Date()).toISOString(), prospect_id).run();
    return;
  }
  if (["approved", "drafted", "queued", "notified", "sent", "delivered", "opened", "clicked", "bounced", "unsubscribed", "complained", "replied"].includes(String(prospect.status || "").toLowerCase())) return;
  await env.RADAR_DB.prepare(`
    UPDATE prospects SET status = 'approved', updated_at = ? WHERE id = ?
  `).bind((/* @__PURE__ */ new Date()).toISOString(), prospect_id).run();
  await enqueueJob(env, {
    run_id: job.run_id,
    job_id: `outreach_${prospect_id}`,
    type: "outreach",
    mode: job.mode,
    tenant_id: job.tenant_id,
    payload: { prospect_id, overrides }
  });
}
__name(handleApproveJob, "handleApproveJob");
async function handleOutreachJob(job, env) {
  if (job.mode === "tenant") return;
  const { prospect_id, overrides } = job.payload;
  const prospect = await env.RADAR_DB.prepare("SELECT * FROM prospects WHERE id = ?").bind(prospect_id).first();
  if (!prospect) return;
  if (isHardRejectedChain(prospect.name)) {
    await env.RADAR_DB.prepare("UPDATE prospects SET status = 'blocked', outcome = 'hard_rejected_chain', updated_at = ? WHERE id = ?").bind((/* @__PURE__ */ new Date()).toISOString(), prospect_id).run();
    return;
  }
  if ((prospect.score || 0) < 45 || !prospect.email) {
    return;
  }
  let signalsMeta = {};
  try {
    signalsMeta = JSON.parse(prospect.signals_json || "{}");
  } catch {
  }
  const emailLocal = String(prospect.email).split("@")[0].toLowerCase();
  const isRiskyLocal = /^(contact|admin|webmaster|mail)$/.test(emailLocal);
  if (signalsMeta.is_email_validated === false || isRiskyLocal && signalsMeta.is_email_validated !== true) {
    console.warn(`[Outreach] Skip ${prospect.id} \u2014 email not validated or risky local-part ${emailLocal}`);
    try {
      await env.RADAR_DB.prepare(
        "UPDATE prospects SET outcome = 'skipped_unverified_email', updated_at = ? WHERE id = ?"
      ).bind((/* @__PURE__ */ new Date()).toISOString(), prospect_id).run();
    } catch {
    }
    return;
  }
  let followupAuthorized = false;
  {
    const st = String(prospect.status || "").toLowerCase();
    const touchNow = getOutreachTouch(prospect);
    if (prospect.draft_body && ["queued", "notified"].includes(st)) return;
    if (["bounced", "unsubscribed", "complained", "replied", "blocked"].includes(st)) return;
    if (["sent", "delivered", "opened", "clicked"].includes(st)) {
      const history = await env.RADAR_DB.prepare("SELECT COUNT(DISTINCT message_id) AS touch_count FROM email_dispatch_logs WHERE prospect_id = ?").bind(prospect.id).first();
      const effectiveTouch = resolveOutreachTouchCount(touchNow, history?.touch_count);
      if (!shouldSendFounderFollowUp(st, prospect.last_contact_at, prospect.last_reply_content, effectiveTouch)) return;
      prospect.signals_json = JSON.stringify({
        ...(() => {
          try {
            return JSON.parse(prospect.signals_json || "{}");
          } catch {
            return {};
          }
        })(),
        outreach_touch: effectiveTouch + 1
      });
      followupAuthorized = true;
    }
  }
  const dayOfYear = getDayOfYear(/* @__PURE__ */ new Date());
  const { missionConfig } = await getPriorityTargets(dayOfYear, env, job.mode, job.tenant_id, overrides, true);
  const primaryLanguage = missionConfig.languages && missionConfig.languages[0] || "en";
  const tenantId = job.tenant_id || "founder";
  const finalizeReserved = await reserveBudget(env.RADAR_DB, tenantId, "finalize_units", 1);
  if (!finalizeReserved) {
    console.warn(`[Outreach Job] Budget exceeded for finalize_units for tenant: ${tenantId}`);
    return;
  }
  let draft;
  try {
    draft = await generateAICopy(prospect, prospect.variant_id || "missed_calls", env, missionConfig);
    const lowerSub = (draft.subject || "").trim().toLowerCase();
    if (lowerSub.startsWith("re:") || lowerSub.startsWith("fwd:")) {
      throw new Error(`Subject rejected: Prohibited prefix detected ("${draft.subject}")`);
    }
  } catch (e) {
    console.warn(`[Copy/Subject Cascade Fallback] AI generation failed or rejected: ${e.message}`);
    draft = getTradePsychologyFallback(prospect.name, prospect.trade, prospect.city, prospect.variant_id || "missed_calls", primaryLanguage, prospect.phone, prospect.demo_token, prospect.signal_event, prospect.signal_area, env, prospect.signals_json || prospect.signals);
  }
  if (draft.subject.toLowerCase().trim().startsWith("re:") || draft.subject.toLowerCase().trim().startsWith("fwd:")) {
    draft.subject = draft.subject.replace(/^(re:|fwd:)\s*/i, "").trim();
  }
  draft.body = draft.body.replace(/\n\nReply STOP to opt out/gi, "").replace(/Reply STOP to opt out/gi, "").trim();
  draft.body = draft.body + "\n\n" + buildLegalFooter(env);
  prospect.draft_subject = draft.subject;
  prospect.draft_body = draft.body;
  try {
    const t = getOutreachTouch(prospect);
    await bumpOutreachTouch(env.RADAR_DB, prospect, t);
  } catch {
  }
  try {
    await env.RADAR_DB.prepare("UPDATE runs SET finalized = finalized + 1 WHERE id = ?").bind(job.run_id).run();
  } catch (e) {
  }
  const gate = await verifyTrustStackGate(prospect, job.run_id, env);
  if (!gate.allowed) {
    console.warn(`[Outreach Gate Blocked] Prospect ${prospect.name} (${prospect_id}) blocked by safety gate: ${gate.reason}`);
    await env.RADAR_DB.prepare(
      "UPDATE prospects SET draft_subject = ?, draft_body = ?, status = 'hold', outcome = ?, updated_at = ? WHERE id = ?"
    ).bind(draft.subject, draft.body, gate.reason, (/* @__PURE__ */ new Date()).toISOString(), prospect_id).run();
    const holdMsg = formatProspectTelegramMessage({ ...prospect, status: "hold" }, env) + `

\u26A0\uFE0F <b>Estado:</b> EN ESPERA (HOLD) - ${escapeHtml2(gate.reason)}`;
    const inlineButtons2 = [
      [
        { text: "\u2705 Approve", callback_data: `approve:${prospect_id}` },
        { text: "\u274C Discard", callback_data: `discard:${prospect_id}` }
      ]
    ];
    await notifyFounder(env, holdMsg, inlineButtons2);
    return;
  }
  const autoMinScore = Math.min(90, Math.max(45, parseInt(String(env.FOUNDER_AUTO_MIN_SCORE || "50"), 10) || 50));
  const autoMaxPerDay = Math.min(12, Math.max(3, parseInt(String(env.FOUNDER_AUTO_MAX_PER_DAY || "8"), 10) || 8));
  const scoreVal = Number(prospect.opportunity_score || prospect.score || 0);
  const confVal = Number(prospect.confidence_score || 0);
  const isElite = scoreVal >= 80 && confVal >= 75 || scoreVal >= 80 && !prospect.confidence_score;
  const isStrongAuto = scoreVal >= autoMinScore && Boolean(prospect.email);
  const autoFlag = String(env.FOUNDER_AUTO_OUTREACH !== void 0 && env.FOUNDER_AUTO_OUTREACH !== "" ? env.FOUNDER_AUTO_OUTREACH : "true").toLowerCase();
  const isAutoOutreachEnabled = job.mode === "founder" && (autoFlag === "true" || autoFlag === "1" || autoFlag === "yes") && (isElite || isStrongAuto);
  const todayDate = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  const idempotencyKey = `idempotency:${prospect.id}:${(prospect.email || "").toLowerCase().trim()}:${todayDate}`;
  if (["sent", "delivered", "opened", "clicked"].includes(String(prospect.status || "").toLowerCase()) && !followupAuthorized) {
    console.log(`[Outreach Idempotency] Prospect ${prospect.id} (${prospect.email}) already contacted; no eligible follow-up. Marking already_sent.`);
    try {
      await env.RADAR_DB.prepare(
        "INSERT OR IGNORE INTO outreach_idempotency (idempotency_key, prospect_id, email, status, created_at, updated_at) VALUES (?, ?, ?, 'already_sent', ?, ?)"
      ).bind(idempotencyKey, prospect.id, prospect.email || "", (/* @__PURE__ */ new Date()).toISOString(), (/* @__PURE__ */ new Date()).toISOString()).run();
    } catch (e) {
    }
    return;
  }
  if (isAutoOutreachEnabled) {
    if (isUsOutreachQuietHours()) {
      console.log(`[Auto-Outreach] Quiet hours (America/New_York) \u2014 holding ${prospect.id} for daytime send`);
      await env.RADAR_DB.prepare(
        "UPDATE prospects SET status = 'queued', outcome = 'held_quiet_hours', updated_at = ? WHERE id = ?"
      ).bind((/* @__PURE__ */ new Date()).toISOString(), prospect.id).run();
    } else {
      const timestamp = (/* @__PURE__ */ new Date()).toISOString();
      let slotReserved = false;
      let sendsTodayCount = 1;
      try {
        await checkSenderGovernor(env);
        const updateRes = await env.RADAR_DB.prepare(`
        UPDATE sender_governor_state
        SET sends_today = sends_today + 1, updated_at = ?
        WHERE id = 'global_governor' AND sends_today < ? AND status = 'active' AND last_reset_day = ?
      `).bind(timestamp, autoMaxPerDay, todayDate).run();
        if (updateRes && updateRes.meta && updateRes.meta.changes > 0) {
          slotReserved = true;
          const govState = await env.RADAR_DB.prepare("SELECT sends_today FROM sender_governor_state WHERE id = 'global_governor'").first();
          sendsTodayCount = govState?.sends_today || 1;
          await env.RADAR_DB.prepare(`
          INSERT OR REPLACE INTO outreach_idempotency (idempotency_key, prospect_id, email, status, created_at, updated_at)
          VALUES (?, ?, ?, 'reserved', ?, ?)
        `).bind(idempotencyKey, prospect.id, prospect.email || "", timestamp, timestamp).run();
        }
      } catch (e) {
        console.warn("[Auto-Outreach Governor Slot] Error attempting atomic reservation:", e);
      }
      if (slotReserved) {
        const sendRes = await sendOrQueueOutreach({ ...prospect, draft_subject: draft.subject, draft_body: draft.body }, job.run_id, env);
        if (sendRes.success) {
          try {
            await env.RADAR_DB.prepare(
              "UPDATE outreach_idempotency SET status = 'sent', updated_at = ? WHERE idempotency_key = ?"
            ).bind((/* @__PURE__ */ new Date()).toISOString(), idempotencyKey).run();
          } catch (e) {
          }
          const autoSentMsg = formatProspectTelegramMessage({ ...prospect, draft_subject: draft.subject, draft_body: draft.body, status: "sent" }, env) + `

\u26A1 <b>AUTO-SENT (${sendsTodayCount}/${autoMaxPerDay})</b>
\u{1F4C5} <b>Time:</b> <code>${(/* @__PURE__ */ new Date()).toISOString()}</code>
<i>Outreach enviado autom\xE1ticamente por Founder Auto-Outreach (5-8 diarios sin aprobaci\xF3n manual).</i>`;
          await notifyFounder(env, autoSentMsg);
          return;
        } else {
          console.warn(`[Auto-Outreach] Send blocked or failed: ${sendRes.reason}`);
          try {
            await env.RADAR_DB.prepare(`
            UPDATE sender_governor_state
            SET sends_today = sends_today - 1, updated_at = ?
            WHERE id = 'global_governor' AND sends_today > 0 AND last_reset_day = ?
          `).bind((/* @__PURE__ */ new Date()).toISOString(), todayDate).run();
          } catch (govErr) {
            console.warn("[Auto-Outreach] Error releasing sender governor slot:", govErr);
          }
          await env.RADAR_DB.prepare(
            "UPDATE prospects SET status = 'hold', outcome = ?, updated_at = ? WHERE id = ?"
          ).bind(sendRes.reason, (/* @__PURE__ */ new Date()).toISOString(), prospect.id).run();
          await notifyOnce(
            env,
            `autosend_blocked_${String(sendRes.reason).split(":")[0]}`,
            `<b>\u26A0\uFE0F Radar: env\xEDo autom\xE1tico bloqueado</b>
<b>Motivo:</b> <code>${escapeHtml2(String(sendRes.reason).slice(0, 200))}</code>
<b>Prospecto:</b> ${escapeHtml2(String(prospect.name || ""))} (${escapeHtml2(String(prospect.city || ""))})
<i>Queda en hold. Te aviso 1 vez al d\xEDa por motivo.</i>`
          );
          return;
        }
      } else {
        console.log(`[Auto-Outreach] Daily auto outreach limit (5) reached or slot unavailable. Falling back to interactive approval queue.`);
      }
    }
  }
  await env.RADAR_DB.prepare(`
    UPDATE prospects
    SET draft_subject = ?, draft_body = ?, status = 'queued', updated_at = ?
    WHERE id = ?
  `).bind(draft.subject, draft.body, (/* @__PURE__ */ new Date()).toISOString(), prospect_id).run();
  const actionableMsg = formatProspectTelegramMessage({ ...prospect, status: "queued" }, env);
  const inlineButtons = [
    [
      { text: "\u2705 Approve", callback_data: `approve:${prospect_id}` },
      { text: "\u274C Discard", callback_data: `discard:${prospect_id}` }
    ]
  ];
  await notifyFounder(env, actionableMsg, inlineButtons);
}
__name(handleOutreachJob, "handleOutreachJob");
function classifyReplyText(rawType, content) {
  const typeLower = (rawType || "").toLowerCase().trim();
  if (typeLower === "sent") return "sent";
  if (typeLower === "delivered") return "delivered";
  if (typeLower === "opened" || typeLower === "open" || typeLower === "email.opened") return "opened";
  if (typeLower === "clicked" || typeLower === "click" || typeLower === "email.clicked") return "clicked";
  if (typeLower === "bounced" || typeLower === "bounce" || typeLower === "hard_bounce" || typeLower === "soft_bounce") return "bounced";
  if (typeLower === "unsubscribe" || typeLower === "stop" || typeLower === "opt_out") return "unsubscribe";
  if (typeLower === "out_of_office" || typeLower === "ooo" || typeLower === "vacation") return "out_of_office";
  if (typeLower === "not_now" || typeLower === "later") return "not_now";
  if (typeLower === "positive" || typeLower === "interested") return "positive";
  if (typeLower === "question" || typeLower === "inquiry") return "question";
  if (typeLower === "negative" || typeLower === "not_interested") return "negative";
  if (!content || !content.trim()) {
    if (typeLower === "replied" || typeLower === "reply" || typeLower === "email_reply") {
      return "replied";
    }
    return "unknown";
  }
  const text = content.toLowerCase();
  if (/unsubscribe|darse de baja|opt out|opt-out|cancelar suscripcion|no me escribas|remover|remove me|stop emailing|don't email|do not email|take me off/i.test(text) || /^(stop|unsubscribe|baja)$/i.test(text.trim())) {
    return "unsubscribe";
  }
  if (/out of office|automatic reply|respuesta automatica|de vacaciones|fuera de la oficina|auto-reply|ooo|on leave|back in office/i.test(text)) {
    return "out_of_office";
  }
  if (/not now|next month|next quarter|next year|busy right now|check back|reach out in|contact me in|ahora no|el proximo mes|mas adelante|en unos meses|llamame en/i.test(text)) {
    return "not_now";
  }
  if (/how much|what is|price|pricing|cost|how does it work|tell me more|details|cuanto|que es|precio|como funciona|detalles|donde|where/i.test(text) || /\?/i.test(text)) {
    return "question";
  }
  if (/interested|sounds good|let's talk|demo|call me|yes|sure|book a time|send info|me interesa|si|informacion|me gustaria|agenda|reunion|llamada|interesado/i.test(text)) {
    return "positive";
  }
  if (/not interested|no thanks|no thank you|no nos interesa|no gracias|don't bother|spam|no me interesa|pasamos|wrong person/i.test(text)) {
    return "negative";
  }
  return "replied";
}
__name(classifyReplyText, "classifyReplyText");
async function handleProspectEvent(params, env) {
  const db = env.RADAR_DB;
  const timestamp = (/* @__PURE__ */ new Date()).toISOString();
  const replyAt = params.content && String(params.content).trim() ? timestamp : null;
  let prospect = null;
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
  const classification = classifyReplyText(params.event_type, params.content || void 0);
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
  let cooldownUntil = prospect.cooldown_until || null;
  switch (classification) {
    case "sent":
      newStatus = "sent";
      newOutcome = "sent";
      break;
    case "delivered":
      newStatus = "delivered";
      newOutcome = "delivered";
      break;
    case "opened":
      newStatus = "opened";
      newOutcome = "opened";
      break;
    case "clicked":
      newStatus = "clicked";
      newOutcome = "clicked";
      if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
        try {
          await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: env.TELEGRAM_CHAT_ID,
              text: `\u{1F440} *PROSPECT CLICKED DEMO / LINK!*

*Business:* ${escapeMarkdown(prospect.name)}
*City:* ${escapeMarkdown(prospect.city)}
*Trade:* ${escapeMarkdown(prospect.trade)}
*Email:* ${escapeMarkdown(prospect.email || "N/A")}

\u{1F525} _El contratista hizo click en el enlace / demo de Bvelt._`,
              parse_mode: "Markdown"
            }),
            signal: AbortSignal.timeout(15e3)
          });
        } catch (e) {
        }
      }
      break;
    case "bounced":
      autoStopped = true;
      newStatus = "bounced";
      newOutcome = "bounced";
      await recordNegativeSignal(db, "bounce", `Bounced email for ${prospect.name}`);
      if (prospect.email) {
        await db.prepare("INSERT OR REPLACE INTO suppression (key, reason, created_at) VALUES (?, ?, ?)").bind(prospect.email.toLowerCase(), `Bounced on ${timestamp}`, timestamp).run();
      }
      break;
    case "unsubscribe":
      autoStopped = true;
      newStatus = "unsubscribed";
      newOutcome = "unsubscribe";
      if (prospect.email) {
        await db.prepare("INSERT OR REPLACE INTO suppression (key, reason, created_at) VALUES (?, ?, ?)").bind(prospect.email.toLowerCase(), `Unsubscribed on ${timestamp}`, timestamp).run();
      }
      if (prospect.website) {
        const dom = getDomain(prospect.website);
        if (dom) {
          await db.prepare("INSERT OR REPLACE INTO suppression (key, reason, created_at) VALUES (?, ?, ?)").bind(dom, `Unsubscribed on ${timestamp}`, timestamp).run();
        }
      }
      const nameCityKey = `${prospect.name.toLowerCase()}_${prospect.city.toLowerCase()}`.replace(/\s+/g, "_");
      await db.prepare("INSERT OR REPLACE INTO suppression (key, reason, created_at) VALUES (?, ?, ?)").bind(nameCityKey, `Unsubscribed on ${timestamp}`, timestamp).run();
      break;
    case "not_now":
      autoStopped = true;
      newStatus = "paused";
      newOutcome = "not_now";
      cooldownUntil = new Date(Date.now() + 21 * 24 * 60 * 60 * 1e3).toISOString();
      break;
    case "positive":
      autoStopped = true;
      newStatus = "human_review";
      newOutcome = "positive";
      if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
        try {
          await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: env.TELEGRAM_CHAT_ID,
              text: `\u{1F525} *POSITIVE RESPONSE DETECTED!*

*Business:* ${escapeMarkdown(prospect.name)}
*City:* ${escapeMarkdown(prospect.city)}
*Trade:* ${escapeMarkdown(prospect.trade)}
*Email:* ${escapeMarkdown(prospect.email || "N/A")}

*Message:* "${escapeMarkdown(params.content || "Interested")}"

\u26A0\uFE0F _Automation STOPPED. Requires human follow-up._`,
              parse_mode: "Markdown"
            }),
            signal: AbortSignal.timeout(15e3)
          });
        } catch (e) {
        }
      }
      break;
    case "question":
      autoStopped = true;
      newStatus = "human_review";
      newOutcome = "question";
      if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
        try {
          await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: env.TELEGRAM_CHAT_ID,
              text: `\u2753 *PROSPECT QUESTION DETECTED!*

*Business:* ${escapeMarkdown(prospect.name)}
*City:* ${escapeMarkdown(prospect.city)}
*Trade:* ${escapeMarkdown(prospect.trade)}
*Email:* ${escapeMarkdown(prospect.email || "N/A")}

*Question:* "${escapeMarkdown(params.content || "Inquiry")}"

\u26A0\uFE0F _Automation STOPPED. Requires human answer._`,
              parse_mode: "Markdown"
            }),
            signal: AbortSignal.timeout(15e3)
          });
        } catch (e) {
        }
      }
      break;
    case "negative":
      autoStopped = true;
      newStatus = "discarded";
      newOutcome = "negative";
      if (prospect.email) {
        await db.prepare("INSERT OR REPLACE INTO suppression (key, reason, created_at) VALUES (?, ?, ?)").bind(prospect.email.toLowerCase(), `Negative response on ${timestamp}`, timestamp).run();
      }
      break;
    case "out_of_office":
      autoStopped = true;
      newStatus = "paused";
      newOutcome = "out_of_office";
      cooldownUntil = new Date(Date.now() + 14 * 24 * 60 * 60 * 1e3).toISOString();
      break;
    case "replied":
    case "unknown":
    default:
      autoStopped = true;
      newStatus = "human_review";
      newOutcome = classification;
      break;
  }
  await db.prepare(`
    UPDATE prospects
    SET status = ?,
        outcome = ?,
        response_type = ?,
        last_reply_content = COALESCE(?, last_reply_content),
        last_reply_at = COALESCE(?, last_reply_at),
        cooldown_until = ?,
        updated_at = ?
    WHERE id = ?
  `).bind(
    newStatus,
    newOutcome,
    classification,
    params.content && String(params.content).trim() ? params.content : null,
    replyAt,
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
    message: autoStopped ? `Event '${classification}' processed. Automation STOPPED for prospect ${prospect.name}. Status updated to ${newStatus}.` : `Event '${classification}' logged. Prospect status set to ${newStatus}.`
  };
}
__name(handleProspectEvent, "handleProspectEvent");
async function handleReplyEventJob(job, env) {
  const { prospect_id, email, action, event_type, content, text } = job.payload;
  await handleProspectEvent({
    prospect_id: prospect_id || null,
    email: email || null,
    event_type: event_type || action || "replied",
    content: content || text || null
  }, env);
}
__name(handleReplyEventJob, "handleReplyEventJob");
async function verifyTrustStackGate(prospect, runId, env, _simulatedMode) {
  const timestamp = (/* @__PURE__ */ new Date()).toISOString();
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
    const isHard = reason.includes("bounce") || reason.includes("complaint") || reason.includes("unsubscribe") || reason.includes("spam");
    if (isHard) {
      const decision2 = {
        allowed: false,
        status: "rejected",
        reason: `SUPPRESSED: ${isSuppressed.reason}`,
        timestamp
      };
      try {
        await recordTrustDecisionInD1(env.RADAR_DB, prospect.id, runId, decision2);
      } catch (_) {
      }
      return decision2;
    }
  }
  if (!prospect.email || !String(prospect.email).includes("@")) {
    const decision2 = {
      allowed: false,
      status: "rejected",
      reason: "MISSING_EMAIL: Prospect has no valid email.",
      timestamp
    };
    try {
      await recordTrustDecisionInD1(env.RADAR_DB, prospect.id, runId, decision2);
    } catch (_) {
    }
    return decision2;
  }
  const decision = {
    allowed: true,
    status: "approved",
    reason: "LOCAL_SAFETY_OK: Trust-Stack disabled; bounce/email checks only.",
    trust_decision_id: crypto.randomUUID(),
    timestamp
  };
  try {
    await recordTrustDecisionInD1(env.RADAR_DB, prospect.id, runId, decision);
  } catch (_) {
  }
  return decision;
}
__name(verifyTrustStackGate, "verifyTrustStackGate");
async function recordTrustDecisionInD1(db, prospectId, runId, decision) {
  const timestamp = (/* @__PURE__ */ new Date()).toISOString();
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
__name(recordTrustDecisionInD1, "recordTrustDecisionInD1");
async function getPriorityTargets(dayOfYear, env, mode, tenantId, overrides, skipPicks) {
  const config = JSON.parse(JSON.stringify(DEFAULT_FOUNDER_MISSION));
  let tenantPicks = [];
  if (mode === "tenant" && tenantId) {
    try {
      const tenantConfig = await env.RADAR_DB.prepare("SELECT * FROM tenant_config WHERE tenant_id = ?").bind(tenantId).first();
      if (tenantConfig) {
        try {
          config.geographies = JSON.parse(tenantConfig.cities_json || "[]");
          config.niches = [];
          config.mode = "tenant";
          config.target = `tenant_${tenantId}_customers`;
          config.countries = JSON.parse(tenantConfig.countries_json || "[]");
          config.languages = JSON.parse(tenantConfig.languages_json || "[]");
          config.services = JSON.parse(tenantConfig.services_json || "[]");
          config.icp = {
            description: String(tenantConfig.icp_description || ""),
            keywords: JSON.parse(tenantConfig.icp_keywords_json || "[]")
          };
          config.min_score = Number(tenantConfig.minimum_score ?? 50);
          config.max_daily_outreach = 0;
          const parseTenantList = /* @__PURE__ */ __name((value) => {
            try {
              const parsed = typeof value === "string" ? JSON.parse(value || "[]") : value;
              return Array.isArray(parsed) ? parsed : [];
            } catch {
              return [];
            }
          }, "parseTenantList");
          const explicitBuyerSegments = [
            ...parseTenantList(tenantConfig.subniches_json),
            ...parseTenantList(tenantConfig.allowed_markets_json),
            ...parseTenantList(tenantConfig.icp_keywords_json)
          ];
          let expandedBuyerSegments = [...explicitBuyerSegments];
          if (!skipPicks) {
            const expanded = await expandTenantIcp(env, tenantConfig);
            if (expanded?.segments?.length) {
              expandedBuyerSegments = [...expanded.segments, ...explicitBuyerSegments];
            }
          }
          config.niches = resolveTenantBuyerSegments(
            tenantConfig.niche || tenantConfig.industry || "",
            expandedBuyerSegments
          );
        } catch (e) {
          console.error("Error parsing tenant config: ", e);
        }
        const citiesList = JSON.parse(tenantConfig.cities_json || "[]");
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
        if (!citiesList || citiesList.length === 0) {
          config.geographies = [];
          console.warn(`[getPriorityTargets] Tenant ${tenantId} has no cities configured. Discovery will not run.`);
        }
      } else {
        config.geographies = [];
        config.niches = [];
        console.warn(`[getPriorityTargets] Tenant config not found for ${tenantId}`);
      }
    } catch (e) {
    }
  } else if (mode === "tenant") {
    config.geographies = [];
    config.niches = [];
    config.icp = { description: "", keywords: [] };
  } else {
    if (env.FOUNDING_CITIES) {
      config.geographies = env.FOUNDING_CITIES.split(";").map((c) => c.trim()).filter(Boolean);
    }
    if (env.FOUNDING_TRADES) {
      config.niches = env.FOUNDING_TRADES.split(";").map((t) => t.trim()).filter(Boolean);
    }
    if (env.FOUNDING_COUNTRIES) {
      config.countries = String(env.FOUNDING_COUNTRIES).split(";").map((c) => c.trim().toUpperCase()).filter(Boolean);
    }
    if (env.FOUNDING_LANGUAGES) {
      config.languages = String(env.FOUNDING_LANGUAGES).split(";").map((l) => l.trim().toLowerCase()).filter(Boolean);
    }
    if (env.FOUNDING_MIN_SCORE) {
      const parsedMin = parseInt(String(env.FOUNDING_MIN_SCORE), 10);
      if (!isNaN(parsedMin)) {
        config.min_score = parsedMin;
      }
    }
    config.niches = expandFounderDiscoveryNiches(config.niches);
  }
  if (env.RADAR_DB && typeof env.RADAR_DB.prepare === "function") {
    try {
      const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
      const targetTenant = mode === "tenant" && tenantId ? tenantId : "founder";
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
        "ALTER TABLE daily_missions ADD COLUMN outreach_count INTEGER DEFAULT 0"
      ]) {
        try {
          await env.RADAR_DB.prepare(alter).run();
        } catch {
        }
      }
      let seeded = false;
      try {
        await env.RADAR_DB.prepare(`
          INSERT OR IGNORE INTO daily_missions
            (tenant_id, day, goal, markets, icp, budget, target_qualified, target_outreach, status, qualified_count, outreach_count)
          VALUES (?, ?, ?, ?, ?, ?, 3, 3, 'active', 0, 0)
        `).bind(targetTenant, today, goal, marketsJson, icpJson, budgetJson).run();
        seeded = true;
      } catch (e1) {
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
        } catch (e2) {
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
        } catch (e3) {
          console.warn("[Daily Mission] create failed:", e3?.message || e3);
        }
      }
    } catch (e) {
      console.warn("[Daily Mission] Failed to seed daily mission:", e);
    }
  }
  if (overrides) {
    if (overrides.cities) {
      config.geographies = overrides.cities.split(";").map((c) => c.trim()).filter(Boolean);
    }
    if (overrides.trades) {
      config.niches = overrides.trades.split(";").map((t) => t.trim()).filter(Boolean);
    }
    if (overrides.countries) {
      config.countries = overrides.countries.split(";").map((c) => c.trim().toUpperCase()).filter(Boolean);
    }
    if (overrides.languages) {
      config.languages = overrides.languages.split(";").map((l) => l.trim().toLowerCase()).filter(Boolean);
    }
    if (overrides.min_score) {
      const parsedOverrideMin = parseInt(overrides.min_score, 10);
      if (!isNaN(parsedOverrideMin)) {
        config.min_score = parsedOverrideMin;
      }
    }
  }
  let learningStats = {};
  if (env.RADAR_DB) {
    try {
      learningStats = await getLearningStats(env.RADAR_DB, mode === "tenant" ? "tenant" : "founder", tenantId || "founder");
    } catch (e) {
    }
  }
  const sortedGeographies = [...config.geographies].sort((a, b) => {
    const rateA = learningStats[`city:${a}`] ?? 0.5;
    const rateB = learningStats[`city:${b}`] ?? 0.5;
    const trialsA = Math.max(2, Math.round(Math.abs(rateA - 0.5) * 40));
    const trialsB = Math.max(2, Math.round(Math.abs(rateB - 0.5) * 40));
    const winsA = rateA * trialsA;
    const winsB = rateB * trialsB;
    const sampleA = thompsonSample(winsA, trialsA);
    const sampleB = thompsonSample(winsB, trialsB);
    return sampleB - sampleA;
  });
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
    const evA = thompsonSample(rateA * trialsA, trialsA) * estimateTicketUsd(aL);
    const evB = thompsonSample(rateB * trialsB, trialsB) * estimateTicketUsd(bL);
    return evB - evA;
  });
  let picks = [];
  if (!skipPicks && mode === "founder" && sortedGeographies.length === 0 && sortedNiches.length > 0) {
    try {
      picks = await pickTargets(env.RADAR_DB, {
        tenantId: "founder",
        trades: sortedNiches,
        count: Math.min(20, Number(env.RADAR_JOBS_PER_RUN || 15)),
        countries: config.countries,
        priorityCountries: MARKET_PRIORITY_COUNTRIES
      });
    } catch (e) {
      console.warn("[getPriorityTargets] pickTargets error:", e);
      picks = [];
    }
  }
  if (tenantPicks.length === 0 && picks.length === 0 && (sortedGeographies.length === 0 || sortedNiches.length === 0)) {
    config.weather_alerts = [];
    return { activeCities: [], activeTrades: [], missionConfig: config, pairs: [] };
  }
  const pickedUsStates = picks.filter((p) => (p.place && p.place.country || p.place?.pa\u00EDs || p.place?.[2] || "").toUpperCase() === "US").map((p) => (p.place && p.place.region || p.place?.regi\u00F3n || p.place?.[1] || "").toUpperCase().trim());
  const explicitUsStates = config.countries.includes("US") ? extractUsStateCodes(config.geographies) : [];
  const extractedStates = Array.from(/* @__PURE__ */ new Set([
    ...pickedUsStates.filter((state) => US_STATE_CODES.has(state)),
    ...explicitUsStates
  ]));
  let weatherAlerts = [];
  if (!skipPicks && extractedStates.length > 0) {
    try {
      weatherAlerts = await getAlerts(extractedStates);
    } catch (e) {
      console.warn("[Weather Signals] getAlerts warning:", e);
    }
  }
  if (weatherAlerts.length > 0) {
    for (const alert of weatherAlerts) {
      const alertTrades = tradeForEvent(alert.event);
      const areaDescLower = (alert.areaDesc || "").toLowerCase();
      for (let i = 0; i < sortedGeographies.length; i++) {
        const cityName = sortedGeographies[i].split(",")[0].trim().toLowerCase();
        if (cityName && areaDescLower.includes(cityName)) {
          const [matchedCity] = sortedGeographies.splice(i, 1);
          sortedGeographies.unshift(matchedCity);
          break;
        }
      }
      for (const tr of alertTrades) {
        const trIdx = sortedNiches.findIndex((n) => n.toLowerCase() === tr.toLowerCase());
        if (trIdx > 0) {
          const [matchedTrade] = sortedNiches.splice(trIdx, 1);
          sortedNiches.unshift(matchedTrade);
        }
      }
    }
  }
  config.weather_alerts = weatherAlerts;
  let activeCities;
  let activeTrades;
  let pairs = void 0;
  if (mode === "tenant" && tenantId && tenantPicks.length > 0) {
    activeCities = tenantPicks.map((p) => `${p.place[0]}, ${p.place[1]}`);
    activeTrades = Array.from(new Set(tenantPicks.map((p) => p.trade)));
    pairs = tenantPicks.map((p) => ({
      city: `${p.place[0]}, ${p.place[1]}`,
      trade: p.trade
    }));
  } else if (mode === "founder" && !(overrides && overrides.cities) && picks.length > 0) {
    activeCities = picks.map((p) => `${p.place[0]}, ${p.place[1]}`);
    activeTrades = Array.from(new Set(picks.map((p) => p.trade)));
    pairs = picks.map((p) => ({
      city: `${p.place[0]}, ${p.place[1]}`,
      trade: p.trade
    }));
  } else {
    const cityIdx1 = dayOfYear % sortedGeographies.length;
    const cityIdx2 = (dayOfYear + 3) % sortedGeographies.length;
    const tradeIdx1 = dayOfYear * 2 % sortedNiches.length;
    const tradeIdx2 = (dayOfYear * 2 + 1) % sortedNiches.length;
    activeCities = Array.from(/* @__PURE__ */ new Set([sortedGeographies[cityIdx1], sortedGeographies[cityIdx2]]));
    activeTrades = Array.from(/* @__PURE__ */ new Set([sortedNiches[tradeIdx1], sortedNiches[tradeIdx2]]));
  }
  return { activeCities, activeTrades, missionConfig: config, pairs };
}
__name(getPriorityTargets, "getPriorityTargets");
function isHardRejectedChain(name) {
  if (!name) return false;
  const n = name.toLowerCase().trim();
  const banned = [
    "walmart",
    "lowe's",
    "lowes",
    "home depot",
    "costco",
    "target",
    "sam's club",
    "sams club",
    "menards",
    "ace hardware",
    "true value",
    "harbor freight",
    "tractor supply",
    "best buy",
    "kroger",
    "publix",
    "walgreens",
    "cvs",
    "dollar tree",
    "dollar general",
    "family dollar",
    "autozone",
    "auto zone",
    "advance auto",
    "o'reilly",
    "sherwin-williams",
    "floor & decor",
    "staples",
    "office depot",
    "target store"
  ];
  if (banned.some((b) => n.includes(b))) return true;
  if (/garden cent(er|re)/i.test(n) || /\bgarden store\b/i.test(n) || /\bfeed\b.*\bgarden\b/i.test(n) || /\bgarden\b.*\bfeed\b/i.test(n) || /\bfeed store\b/i.test(n) || /\bagricultural supply\b/i.test(n) || /plant nursery/i.test(n) || /tree nursery/i.test(n) || /\bnursery\b/i.test(n) || /plant (shop|store|boutique)/i.test(n) || /greenhouse & (nursery|gifts|retail)/i.test(n) || /flower (shop|market|store)/i.test(n) || /\bflorist\b/i.test(n) || /building supplies/i.test(n) || /landscape supply/i.test(n) || /stone supply/i.test(n) || /mulch supply/i.test(n) || /\bpet store\b/i.test(n) || /\bgrocery\b/i.test(n)) {
    return true;
  }
  return false;
}
__name(isHardRejectedChain, "isHardRejectedChain");
var PREFERRED_TRADES = /* @__PURE__ */ new Set([
  "hvac",
  "plumbing",
  "electrical",
  "electrician",
  "roofing",
  "lawn_care",
  "landscaping",
  "pool",
  "pool_cleaning",
  "cleaning",
  "house_cleaning",
  "handyman"
]);
function calculateStrategicScores(item, email, isEmailValidated, phone, isPriorityCity, isPriorityTrade, learningStats, signals, missionConfig) {
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
      decision_state: "rejected",
      priority_tier: "low",
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
  const isPreferredTrade = PREFERRED_TRADES.has(tradeLower) || /hvac|plumb|electr|roof|lawn|landscap|pool|clean|handyman/i.test(tradeLower);
  const targetNiches = missionConfig?.niches || [];
  const matchesTargetNiches = targetNiches.some(
    (n) => tradeLower.includes(n.toLowerCase()) || nameLower.includes(n.toLowerCase())
  );
  let fit_score = 0;
  if (matchesTargetNiches || isPriorityTrade) fit_score += 45;
  else if (isPreferredTrade) fit_score += 35;
  else fit_score += 20;
  const isIndependent = /brothers|sons|family|llc|services|pro|tech|contracting|group|co\b/i.test(nameLower);
  if (isIndependent) fit_score += 25;
  if (isPriorityCity) fit_score += 15;
  if (item.website && isRealWebsite(item.website)) fit_score += 15;
  fit_score = Math.min(100, Math.max(0, fit_score));
  let intent_score = 0;
  const hasPermit = item.source === "permits" || !!item.signal_event;
  if (hasPermit) intent_score += 40;
  if (signals.quote_request || signals.estimate_language) intent_score += 30;
  if (signals.multiple_areas || signals.specific_landing_pages) intent_score += 20;
  if (signals.contact_form || signals.lead_capture) intent_score += 10;
  intent_score = Math.min(100, Math.max(0, intent_score));
  let pain_score = 0;
  if (signals.sms_gap) pain_score += 40;
  if (!signals.booking) pain_score += 25;
  if (signals.emergency) pain_score += 20;
  if (!signals.quote_request && !signals.estimate_language) pain_score += 15;
  pain_score = Math.min(100, Math.max(0, pain_score));
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
  let timing_score = 0;
  if (item.signal_event) timing_score += 45;
  if (item.source === "permits") timing_score += 35;
  if (isPreferredTrade) timing_score += 20;
  timing_score = Math.min(100, Math.max(0, timing_score));
  const observedSignalsCount = [
    signals.emergency,
    signals.sms_gap,
    signals.quote_request || signals.estimate_language,
    signals.booking,
    signals.multiple_areas,
    signals.contact_form,
    signals.lead_capture
  ].filter(Boolean).length;
  let evidence_score = 30 + observedSignalsCount * 12;
  if (item.website && isRealWebsite(item.website)) evidence_score += 10;
  if (email && isEmailValidated) evidence_score += 10;
  evidence_score = Math.min(100, Math.max(0, evidence_score));
  let signal_freshness_score = 100;
  if (item.created_at) {
    const ageDays = (Date.now() - new Date(item.created_at).getTime()) / (1e3 * 60 * 60 * 24);
    if (ageDays > 30) signal_freshness_score = 50;
    else if (ageDays > 14) signal_freshness_score = 70;
    else if (ageDays > 7) signal_freshness_score = 85;
    else signal_freshness_score = 100;
  }
  const freshnessMultiplier = signal_freshness_score / 100;
  let strategic_score = Math.round(
    fit_score * 0.2 + pain_score * 0.2 + intent_score * 0.15 + timing_score * 0.15 + contactability_score * 0.15 + ability_to_pay_score * 0.1 + evidence_score * freshnessMultiplier * 0.05
  );
  strategic_score = Math.min(100, Math.max(0, strategic_score));
  let priority_tier = "medium";
  if (strategic_score >= 80 && contactability_score >= 60 && timing_score >= 40) {
    priority_tier = "critical";
  } else if (strategic_score >= 65 && contactability_score >= 45) {
    priority_tier = "high";
  } else if (strategic_score >= 45) {
    priority_tier = "medium";
  } else {
    priority_tier = "low";
  }
  let decision_state = "identified";
  if (priority_tier === "critical" || priority_tier === "high") {
    decision_state = "actionable";
  } else if (priority_tier === "medium") {
    decision_state = "analyzing";
  } else {
    decision_state = "closed";
  }
  const avgJobValue = estimateTicketUsd(item.trade || "");
  const estimatedMonthlyRecoveredValue = Math.round(avgJobValue * (pain_score / 100) * 2.2);
  const conversionProb = strategic_score / 100 * (contactability_score / 100) * 0.32;
  const expected_value = Math.round(estimatedMonthlyRecoveredValue * conversionProb);
  const observed_facts = [];
  if (phone) observed_facts.push(`Observed phone line: ${phone}`);
  if (email) observed_facts.push(`Observed direct email: ${email} (verified: ${isEmailValidated})`);
  if (item.website) observed_facts.push(`Observed domain: ${item.website}`);
  if (signals.sms_gap) observed_facts.push("Observed phone CTA with absence of SMS/text-back capability");
  if (signals.emergency) observed_facts.push("Observed 24/7 or emergency service promise on website");
  if (item.signal_event) observed_facts.push(`Active weather event signal: ${item.signal_event} (${item.signal_area || item.city})`);
  if (item.source === "permits") observed_facts.push(`Building permit activity recorded in ${item.city}`);
  const inferences = [];
  if (signals.sms_gap) {
    inferences.push("High probability of dropping mobile visitors who prefer asynchronous messaging over voice calls");
  }
  if (signals.emergency && !signals.booking) {
    inferences.push("Technicians engaged in field jobs leave incoming calls to voicemail during surge hours");
  }
  if (item.signal_event) {
    inferences.push("Elevated local call volume creates immediate backlog and customer leakage");
  }
  const estimations = [
    `Estimated average contractor ticket for ${item.trade}: $${avgJobValue}`,
    `Estimated monthly revenue at risk from dropped leads: $${estimatedMonthlyRecoveredValue}`,
    `Calculated expected value under current timing window: $${expected_value}`
  ];
  const why_now = {
    what_is_happening: item.signal_event ? `Active demand surge in ${item.city} driven by ${item.signal_event} with high contractor need` : `${item.name} is actively advertising ${item.trade} in ${item.city} with evident lead response gaps`,
    what_evidence_exists: observed_facts,
    why_it_matters: "Every missed call or slow estimate follow-up redirects high-margin jobs to prompt competitors.",
    why_now: item.signal_event ? `Event window is live right now; immediate automated outreach produces peak response rates.` : `High contactability and verifiable pain signal create an optimal window for high-relevance outreach.`,
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
__name(calculateStrategicScores, "calculateStrategicScores");
async function syncOpportunityDecision(db, prospectId, action, notes) {
  try {
    const opp = await db.prepare("SELECT id FROM opportunities WHERE prospect_id = ?").bind(prospectId).first();
    if (opp) {
      const nowIso = (/* @__PURE__ */ new Date()).toISOString();
      let state = "analyzing";
      if (action === "sent" || action === "approve") state = "dispatched";
      else if (action === "won" || action === "converted") state = "closed_won";
      else if (action === "replied" || action === "positive") state = "actionable_replied";
      else if (action === "discard") state = "closed_discarded";
      else if (action === "demo") state = "in_demo";
      await db.prepare("UPDATE opportunities SET decision_state = ?, updated_at = ? WHERE id = ?").bind(state, nowIso, opp.id).run();
      const actId = `act_${crypto.randomUUID().replace(/-/g, "")}`;
      await db.prepare(`
        INSERT INTO opportunity_actions (id, opportunity_id, action_type, status, details_json, proposed_at, executed_at)
        VALUES (?, ?, ?, 'executed', ?, ?, ?)
      `).bind(actId, opp.id, action, JSON.stringify({ notes: notes || action }), nowIso, nowIso).run();
      if (["won", "converted", "replied", "positive", "demo"].includes(action)) {
        const outId = `out_${crypto.randomUUID().replace(/-/g, "")}`;
        const val = action === "won" || action === "converted" ? 1800 : action === "demo" ? 450 : 0;
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
__name(syncOpportunityDecision, "syncOpportunityDecision");
function calculateMultiFactorScore(item, email, isEmailValidated, phone, isPriorityCity, isPriorityTrade, learningStats, signals, missionConfig) {
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
  const isTenantMode = missionConfig?.mode === "tenant";
  const tradeLower = (item.trade || "").toLowerCase();
  const nameLower = (item.name || "").toLowerCase();
  if (isTenantMode) {
    let tenantScore = 0;
    const breakdownT = {};
    let icpFit = 10;
    const targetNiches2 = (missionConfig?.niches || []).map((n) => n.toLowerCase());
    const icpKeywords = (missionConfig?.icp?.keywords || []).map((k) => k.toLowerCase());
    const haystack = `${nameLower} ${tradeLower}`;
    if (targetNiches2.some((n) => haystack.includes(n) || tradeLower.includes(n.replace(/\s+/g, "_")))) {
      icpFit += 15;
    }
    if (icpKeywords.some((k) => haystack.includes(k))) {
      icpFit += 10;
    }
    if (/property|management|manager|hoa|homeowner|apartment|condo|facility|realty|real estate|hotel|motel|resort/i.test(haystack)) {
      icpFit += 8;
    }
    icpFit = Math.min(35, icpFit);
    breakdownT.icp_fit = icpFit;
    tenantScore += icpFit;
    let contact = 0;
    if (email) contact += isEmailValidated ? 14 : 10;
    if (phone) contact += 10;
    if (item.website && isRealWebsite(item.website)) contact += 6;
    contact = Math.min(30, contact);
    breakdownT.contactability = contact;
    tenantScore += contact;
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
  const webLower = String(item.website || "").toLowerCase();
  const isSocialOnlySite = !!webLower && /facebook\.com|fb\.com|instagram\.com|linktr\.ee|bit\.ly|business\.site|wixsite\.com/i.test(webLower);
  const hasNoRealWebsite = !item.website || !isRealWebsite(item.website) || isSocialOnlySite;
  if (hasNoRealWebsite) {
    signals.no_own_website = true;
  }
  let needEvidenceScore = 0;
  if (signals.sms_gap) needEvidenceScore += 12;
  if (!signals.booking) needEvidenceScore += 8;
  if (!signals.quote_request && !signals.estimate_language) needEvidenceScore += 8;
  if (signals.emergency && signals.sms_gap) needEvidenceScore += 4;
  if (phone && !email) needEvidenceScore += 4;
  if (hasNoRealWebsite) needEvidenceScore += 12;
  needEvidenceScore = Math.min(30, Math.max(0, needEvidenceScore));
  let bveltFitScore = 0;
  const isPreferred = PREFERRED_TRADES.has(tradeLower) || /hvac|plumb|electr|roof|lawn|landscap|pool|clean|handyman/i.test(tradeLower);
  if (isPreferred) bveltFitScore += 15;
  const isIndependent = /brothers|sons|family|llc|services|pro|tech|contracting|group|co\b/i.test(item.name || "");
  if (isIndependent) bveltFitScore += 5;
  bveltFitScore = Math.min(20, Math.max(0, bveltFitScore));
  let timingScore = 0;
  if (item.signal_event) timingScore += 8;
  const isHiring = /hiring|career|join our team|empleo|trabaja con nosotros/i.test(item.name || "") || !!signals.specific_landing_pages;
  if (isHiring) timingScore += 7;
  if (isPreferred) timingScore += 5;
  timingScore = Math.min(15, Math.max(0, timingScore));
  let commercialValueScore = 0;
  if (isPriorityCity) commercialValueScore += 10;
  const tradeKey = `trade:${tradeLower}`;
  const winRate = learningStats[tradeKey] || 0;
  if (winRate > 0.6) commercialValueScore += 5;
  else if (winRate > 0.3) commercialValueScore += 3;
  else commercialValueScore += 1;
  commercialValueScore = Math.min(15, Math.max(0, commercialValueScore));
  let contactabilityNew = 0;
  if (email) {
    contactabilityNew += isEmailValidated ? 6 : 4;
    if (!email.endsWith("@gmail.com") && !email.endsWith("@yahoo.com") && !email.endsWith("@hotmail.com") && !email.endsWith("@outlook.com")) {
      contactabilityNew += 2;
    }
  }
  if (phone) contactabilityNew += 2;
  if (phone && !email) contactabilityNew += 3;
  if (item.website && isRealWebsite(item.website)) contactabilityNew += 2;
  contactabilityNew = Math.min(10, Math.max(0, contactabilityNew));
  const evidenceItems = [];
  const addEvidence = /* @__PURE__ */ __name((type, isDetected, text) => {
    let conf = 0.65;
    if (isDetected) {
      conf = 0.9;
    }
    evidenceItems.push({
      signal_type: type,
      value: isDetected ? "detected" : "not_detected",
      source_url: item.website || "local_db",
      source_type: item.website ? "website_scrape" : "directory_claim",
      observed_at: (/* @__PURE__ */ new Date()).toISOString(),
      evidence_text: isDetected ? text : `No signals of ${type} found.`,
      confidence: conf,
      freshness: 1,
      page_type: "homepage"
    });
  }, "addEvidence");
  addEvidence("emergency_service", !!signals.emergency, "Emergency or 24/7 support detected on website.");
  addEvidence("quote_form", !!(signals.quote_request || signals.estimate_language), "Online quote or estimate option present.");
  addEvidence("booking_flow", !!signals.booking, "Booking flow or scheduling widget detected.");
  addEvidence("lead_form", !!signals.contact_form, "Standard contact form detected.");
  addEvidence("lead_capture", !!signals.lead_capture, "Lead capture widget detected.");
  addEvidence("sms_cta", !signals.sms_gap && !!phone, "SMS call-to-action detected.");
  addEvidence("service_area_expansion", !!signals.multiple_areas, "Multiple service areas detected.");
  const detectedCount = evidenceItems.filter((e) => e.value === "detected").length;
  let evidenceConfidenceScore = 6.5;
  if (detectedCount > 0) {
    evidenceConfidenceScore = Math.min(10, 6.5 + detectedCount * 0.7);
  }
  evidenceConfidenceScore = Math.min(10, Math.max(0, evidenceConfidenceScore));
  const totalScore = Math.round(needEvidenceScore + bveltFitScore + timingScore + commercialValueScore + contactabilityNew + evidenceConfidenceScore);
  let confidenceScore = 50;
  if (email && isEmailValidated) confidenceScore += 25;
  else if (email) confidenceScore += 15;
  if (phone) confidenceScore += 15;
  if (item.website && isRealWebsite(item.website)) confidenceScore += 10;
  confidenceScore = Math.min(100, Math.max(0, confidenceScore));
  let legacyPlatformFit = 0;
  if (item.website && isRealWebsite(item.website)) legacyPlatformFit += 5;
  if (signals.lead_capture || signals.contact_form || signals.quote_request) legacyPlatformFit += 7;
  if (signals.emergency || signals.sms_gap) legacyPlatformFit += 8;
  legacyPlatformFit = Math.min(20, Math.max(0, legacyPlatformFit));
  let legacyTenantFit = 0;
  const targetNiches = missionConfig?.niches || [];
  const itemText = `${item.name || ""} ${item.trade || ""} ${item.city || ""}`.toLowerCase();
  if (targetNiches.some((n) => itemText.includes(n.toLowerCase()) || item.trade && item.trade.toLowerCase().includes(n.toLowerCase()))) {
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
  if (isPriorityCity) legacyCommercial += 5;
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
  const evidenceList = [];
  if (signals.emergency) evidenceList.push("24/7 or emergency support language detected");
  if (signals.quote_request || signals.estimate_language) evidenceList.push("Online quote/estimate request option present");
  if (signals.sms_gap) evidenceList.push("SMS/text message CTA absent alongside voice CTA");
  if (signals.multiple_areas || signals.specific_landing_pages) evidenceList.push("Multi-area or targeted service pages");
  if (signals.booking || signals.lead_capture) evidenceList.push("Lead capture or booking widget detected");
  const evidenceSummary = evidenceList.length > 0 ? `Evidence: ${evidenceList.join("; ")}.` : isTenantMode ? `Qualified prospect matching tenant '${missionConfig?.tenant_id || "active"}' criteria.` : "Standard directory business with active contact details.";
  const painHypothesis = {};
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
    item,
    email,
    isEmailValidated,
    phone,
    isPriorityCity,
    isPriorityTrade,
    learningStats,
    signals,
    missionConfig
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
__name(calculateMultiFactorScore, "calculateMultiFactorScore");
var BIZDATA_OFFICIAL_CATEGORIES = /* @__PURE__ */ new Set([
  "accounting",
  "accountant",
  "attorney",
  "auto_repair",
  "bakery",
  "bank",
  "bar",
  "beauty_salon",
  "book_store",
  "cafe",
  "car_dealer",
  "car_rental",
  "car_repair",
  "car_wash",
  "dentist",
  "doctor",
  "drugstore",
  "dry_cleaning",
  "electrician",
  "florist",
  "gas_station",
  "general_contractor",
  "gym",
  "hair_care",
  "hairdresser",
  "hardware_store",
  "hospital",
  "insurance_agency",
  "laundry",
  "lawyer",
  "locksmith",
  "lodging",
  "moving_company",
  "painter",
  "pharmacy",
  "physiotherapist",
  "plumber",
  "real_estate_agency",
  "real_estate",
  "restaurant",
  "roofing_contractor",
  "school",
  "shoe_store",
  "shopping_mall",
  "spa",
  "supermarket",
  "travel_agency",
  "veterinary_care"
]);
function mapTradeToBizDataCategory(trade) {
  if (!trade) return null;
  const norm = trade.toLowerCase().trim().replace(/[\s-]+/g, "_");
  if (BIZDATA_OFFICIAL_CATEGORIES.has(norm)) return norm;
  const mapping = {
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
    "handyman": "general_contractor",
    "real_estate": "real_estate_agency",
    "auto_repair": "auto_repair",
    "auto_body": "car_repair",
    "medical_clinic": "doctor",
    "accounting_firm": "accounting",
    "hotel": "lodging",
    "tutoring_center": "school",
    "training_center": "school",
    "catering": "restaurant",
    "moving": "moving_company",
    "hardware_store": "hardware_store",
    "car_wash": "car_wash",
    "car_rental": "car_rental"
  };
  const mapped = mapping[norm];
  if (mapped && BIZDATA_OFFICIAL_CATEGORIES.has(mapped)) {
    return mapped;
  }
  return null;
}
__name(mapTradeToBizDataCategory, "mapTradeToBizDataCategory");
async function fetchNominatimGeocoding(city) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=json&limit=1`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "BveltRadar-Discovery/1.0 (founder@bvelt.app)",
        "Accept": "application/json"
      },
      signal: AbortSignal.timeout(6e3)
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      const item = data[0];
      const bb = item.boundingbox;
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
__name(fetchNominatimGeocoding, "fetchNominatimGeocoding");
var OVERPASS_MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://lz4.overpass-api.de/api/interpreter",
  "https://z.overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.osm.ch/api/interpreter",
  "https://overpass.openstreetmap.fr/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter"
];
async function fetchOverpassBusinesses(city, trade, nominatimGeo, customOsmTags) {
  const cleanTrade = trade.toLowerCase().trim();
  const cityClean = city.split(",")[0].trim();
  const specificTags = customOsmTags && customOsmTags.length > 0 ? customOsmTags : OVERPASS_TRADE_TAGS[cleanTrade] || [];
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
  const allTags = Array.from(/* @__PURE__ */ new Set([...specificTags, ...nameTags, ...genericTags]));
  async function queryOverpassWithGeo(geo, isWidened = false) {
    const tagQueries = allTags.map((tag) => {
      if (tag.includes("~")) {
        const cleanTag = tag.replace(/,\s*i$/, "");
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
        try {
          hostname = new URL(mirror).hostname;
        } catch (e) {
        }
        const res = await fetch(mirror, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "BveltRadar-Discovery/1.0 (founder@bvelt.app)"
          },
          body: `data=${encodeURIComponent(query)}`,
          signal: AbortSignal.timeout(12e3)
        });
        if (res.ok) {
          const osmData = await res.json();
          const results = [];
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
          results.sort((a, b) => (b.website ? 2 : 0) + (b.email ? 2 : 0) + (b.phone ? 1 : 0) - ((a.website ? 2 : 0) + (a.email ? 2 : 0) + (a.phone ? 1 : 0)));
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
      } catch (e) {
        let hostname = mirror;
        try {
          hostname = new URL(mirror).hostname;
        } catch (e2) {
        }
        lastStatus = `timeout/error from ${hostname}: ${e.message}`;
      }
    }
    return null;
  }
  __name(queryOverpassWithGeo, "queryOverpassWithGeo");
  const res1 = await queryOverpassWithGeo(nominatimGeo, false);
  if (res1 && res1.businesses.length > 0) {
    return res1;
  }
  if (nominatimGeo) {
    console.log(`[Overpass Fallback] 0 results with initial bbox. Widening radius one step...`);
    const widenedGeo = {
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
__name(fetchOverpassBusinesses, "fetchOverpassBusinesses");
async function fetchBizDataBusinesses(city, trade) {
  const category = mapTradeToBizDataCategory(trade);
  if (!category) {
    return { businesses: [], status: "skipped_unsupported_category" };
  }
  try {
    const bizDataUrl = `https://bizdata-web.vercel.app/api/businesses?location=${encodeURIComponent(city)}&category=${encodeURIComponent(category)}&limit=20`;
    const res = await fetch(bizDataUrl, {
      headers: { "User-Agent": "BveltRadar-Discovery/1.0 (founder@bvelt.app)" },
      signal: AbortSignal.timeout(8e3)
    });
    if (res.ok) {
      const data = await res.json();
      const results = [];
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
  } catch (err) {
    console.warn(`[BizData] Error for ${city} - ${trade}: ${err.message}, skipping source (do not abort)`);
    return { businesses: [], status: `error: ${err.message} (skipped)` };
  }
}
__name(fetchBizDataBusinesses, "fetchBizDataBusinesses");
var radarCacheReady = false;
async function ensureRadarCacheTable(db) {
  if (radarCacheReady) return;
  await db.prepare("CREATE TABLE IF NOT EXISTS radar_cache (key TEXT PRIMARY KEY, value TEXT NOT NULL, expires_at INTEGER NOT NULL)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_radar_cache_exp ON radar_cache(expires_at)").run();
  radarCacheReady = true;
}
__name(ensureRadarCacheTable, "ensureRadarCacheTable");
async function cacheGet(env, key) {
  try {
    await ensureRadarCacheTable(env.RADAR_DB);
    const row = await env.RADAR_DB.prepare("SELECT value FROM radar_cache WHERE key = ? AND expires_at > ?").bind(key, Date.now()).first();
    return row?.value ?? null;
  } catch {
    return null;
  }
}
__name(cacheGet, "cacheGet");
async function cachePut(env, key, value, ttlSeconds) {
  try {
    await ensureRadarCacheTable(env.RADAR_DB);
    await env.RADAR_DB.prepare("INSERT OR REPLACE INTO radar_cache (key, value, expires_at) VALUES (?, ?, ?)").bind(key, value, Date.now() + ttlSeconds * 1e3).run();
  } catch {
  }
}
__name(cachePut, "cachePut");
async function pruneRadarCache(env) {
  try {
    await ensureRadarCacheTable(env.RADAR_DB);
    await env.RADAR_DB.prepare("DELETE FROM radar_cache WHERE expires_at < ?").bind(Date.now()).run();
  } catch {
  }
}
__name(pruneRadarCache, "pruneRadarCache");
var GEOAPIFY_PROFILES = [
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
  { match: /auto|car_repair|towing/, categories: "service,office,commercial", name: /auto|car repair|mechanic|towing|tow truck|collision/i },
  { match: /dental|medical|optometry/, categories: "service,office,commercial", name: /dental|dentist|clinic|medical|optometry|optometrist|eye care/i },
  { match: /law_firm|accounting|insurance/, categories: "office,commercial", name: /law|attorney|accounting|accountant|insurance|tax/i },
  { match: /tutoring|training|school/, categories: "education", name: /school|tutor|training|academy|learning/i },
  { match: /restaurant|catering|event_venue/, categories: "catering", name: /restaurant|catering|event|venue|banquet|wedding/i },
  { match: /hardware|equipment|repair_shop/, categories: "service,office,commercial", name: /hardware|equipment|rental|repair|supply/i },
  { match: /moving|storage|delivery/, categories: "service,office,commercial", name: /moving|mover|storage|delivery|courier|logistics/i },
  { match: /industrial|manufacturer|machine_shop/, categories: "service,office,commercial", name: /industrial|manufactur|machine|fabrication|machining/i },
  { match: /it_services|managed_it/, categories: "office,commercial", name: /IT services|managed IT|computer services|IT support/i },
  { match: /travel_agency|sports_club/, categories: "sport,leisure", name: /travel|tour|sports club|athletic|venue/i },
  { match: /local_service_business/, categories: "service,office,commercial" }
];
async function fetchGeoapifyBusinesses(city, trade, geo, apiKey) {
  if (!apiKey || !apiKey.trim()) return { businesses: [], status: "skipped (no GEOAPIFY_API_KEY)" };
  if (!geo || !geo.bbox || geo.bbox.length < 4) return { businesses: [], status: "skipped (no bbox)" };
  const t = trade.toLowerCase();
  const profile = GEOAPIFY_PROFILES.find((p) => p.match.test(t));
  if (!profile) return { businesses: [], status: "skipped (trade not mapped)" };
  try {
    const rect = `${geo.bbox[2]},${geo.bbox[0]},${geo.bbox[3]},${geo.bbox[1]}`;
    const url = `https://api.geoapify.com/v2/places?categories=${encodeURIComponent(profile.categories)}&filter=rect:${rect}&limit=100&apiKey=${encodeURIComponent(apiKey.trim())}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(14e3) });
    if (!res.ok) return { businesses: [], status: `HTTP ${res.status} (skipped)` };
    const data = await res.json();
    const out = [];
    for (const f of data?.features || []) {
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
  } catch (e) {
    return { businesses: [], status: `error: ${e.message} (skipped)` };
  }
}
__name(fetchGeoapifyBusinesses, "fetchGeoapifyBusinesses");
async function fetchLocationIqBusinesses(city, trade, apiKey) {
  if (!apiKey || !apiKey.trim()) return { businesses: [], status: "skipped (no LOCATIONIQ_API_KEY)" };
  try {
    const q = `${trade} ${city}`.trim();
    const url = `https://us1.locationiq.com/v1/search?key=${encodeURIComponent(apiKey.trim())}&q=${encodeURIComponent(q)}&format=json&addressdetails=1&limit=30&normalizecity=1`;
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "BveltRadar/1.0 (founder@bvelt.app)" },
      signal: AbortSignal.timeout(1e4)
    });
    if (!res.ok) return { businesses: [], status: `HTTP ${res.status}` };
    const data = await res.json();
    const out = [];
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
        lon: row.lon ? Number(row.lon) : null
      });
    }
    return { businesses: out, status: out.length ? `success (${out.length})` : "0 matches" };
  } catch (e) {
    return { businesses: [], status: `error: ${e?.message || e}` };
  }
}
__name(fetchLocationIqBusinesses, "fetchLocationIqBusinesses");
async function fetchPhotonBusinesses(city, trade) {
  try {
    const q = `${trade} ${city}`.trim();
    const url = `https://photon.komoot.io/api/?lang=en&limit=40&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "BveltRadar/1.0 (https://bvelt.app; radar@bvelt.app)"
      },
      signal: AbortSignal.timeout(12e3)
    });
    if (!res.ok) return { businesses: [], status: `HTTP ${res.status}` };
    const data = await res.json();
    const out = [];
    const tradeL = trade.toLowerCase();
    for (const f of data?.features || []) {
      const props = f?.properties || {};
      const name = String(props.name || props.osm_value || "").trim();
      if (!name || name.length < 2) continue;
      const osmKey = String(props.osm_key || "");
      const osmVal = String(props.osm_value || "");
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
        osm_value: osmVal
      });
    }
    const tokens = tradeL.split(/[_\s]+/).filter((x) => x.length > 3);
    const scored = out.sort((a, b) => {
      const score = /* @__PURE__ */ __name((x) => {
        const blob = `${x.name} ${x.osm_value || ""}`.toLowerCase();
        return tokens.reduce((s, tok) => s + (blob.includes(tok) ? 2 : 0), 0) + (x.website ? 1 : 0) + (x.phone ? 1 : 0);
      }, "score");
      return score(b) - score(a);
    });
    return { businesses: scored.slice(0, 30), status: scored.length ? `success (${scored.length})` : "0 matches" };
  } catch (e) {
    return { businesses: [], status: `error: ${e?.message || e}` };
  }
}
__name(fetchPhotonBusinesses, "fetchPhotonBusinesses");
async function fetchNominatimPoiBusinesses(city, trade) {
  try {
    const q = `${trade} company ${city}`;
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=25&addressdetails=1&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "BveltRadar/1.0 (https://bvelt.app; founder@bvelt.app)"
      },
      signal: AbortSignal.timeout(1e4)
    });
    if (!res.ok) return { businesses: [], status: `HTTP ${res.status}` };
    const data = await res.json();
    const out = [];
    for (const row of Array.isArray(data) ? data : []) {
      const name = String(row.display_name || "").split(",")[0].trim();
      if (!name || name.length < 3) continue;
      const cls = `${row.class || ""} ${row.type || ""}`.toLowerCase();
      out.push({
        name,
        city,
        trade,
        website: null,
        phone: null,
        email: null,
        source: "nominatim_poi",
        osm_class: cls
      });
    }
    return { businesses: out, status: out.length ? `success (${out.length})` : "0 matches" };
  } catch (e) {
    return { businesses: [], status: `error: ${e?.message || e}` };
  }
}
__name(fetchNominatimPoiBusinesses, "fetchNominatimPoiBusinesses");
async function fetchLocalBusinessesWithDiagnostics(city, trade, env, customOsmTags, mode = "founder") {
  const tagScope = (customOsmTags || []).map((tag) => String(tag).trim().toLowerCase()).filter(Boolean).sort().join("_").slice(0, 120);
  const cacheKey = `radar_cache_${mode}_${city.replace(/[^a-z0-9]/gi, "_")}_${trade}_${tagScope}_v5`.toLowerCase();
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
  const rawBusinesses = [];
  let nominatimStatus = "unattempted";
  let overpassStatus = "unattempted";
  let bizdataStatus = "unattempted";
  let seedStatus = "unattempted";
  let cityOnly = city;
  let stateOnly = "";
  const cityParts = city.split(",").map((s) => s.trim());
  if (cityParts.length >= 2) {
    cityOnly = cityParts[0];
    stateOnly = cityParts[1];
  }
  try {
    let seedQuery = "SELECT * FROM seed_businesses WHERE used_at IS NULL AND LOWER(trade) = LOWER(?)";
    const seedParams = [trade];
    if (stateOnly) {
      seedQuery += " AND LOWER(state) = LOWER(?)";
      seedParams.push(stateOnly);
    }
    seedQuery += " ORDER BY CASE WHEN LOWER(city) = LOWER(?) THEN 0 ELSE 1 END LIMIT 30";
    seedParams.push(cityOnly);
    const seedRows = await env.RADAR_DB.prepare(seedQuery).bind(...seedParams).all();
    if (seedRows && seedRows.results && seedRows.results.length > 0) {
      const seedList = seedRows.results;
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
  } catch (e) {
    seedStatus = `error: ${e.message}`;
  }
  let nominatimGeo = null;
  const knownPlace = findPlace(city);
  if (knownPlace) {
    const r = Math.min(radiusKm(knownPlace.population || 5e4), 12);
    const dLat = r / 111;
    const dLon = r / (111 * Math.cos(knownPlace.lat * Math.PI / 180));
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
    nominatimStatus = `local_bbox r=${r.toFixed(1)}km [${nominatimGeo.bbox.map((n) => n.toFixed(3)).join(", ")}]`;
  } else {
    nominatimGeo = await fetchNominatimGeocoding(city);
    nominatimStatus = nominatimGeo ? `resolved_bbox [${nominatimGeo.bbox.join(", ")}]` : "geocoding_fallback";
  }
  let permitCandidates = [];
  try {
    const permitContractors = await fetchPermitContractors2(city, trade);
    if (permitContractors && permitContractors.length > 0) {
      permitCandidates = permitContractors.map((p) => ({
        name: p.name,
        phone: p.phone,
        city: p.city || city,
        website: null,
        email: null,
        source: "permits",
        permits_90d: p.permits_90d
      }));
    }
  } catch (e) {
    permitCandidates = [];
  }
  const permitsFound = permitCandidates.length;
  const overpassRes = await fetchOverpassBusinesses(city, trade, nominatimGeo, customOsmTags);
  overpassStatus = overpassRes.status;
  rawBusinesses.push(...overpassRes.businesses);
  const targetPool = mode === "tenant" ? 40 : 28;
  let geoapifyStatus = "skipped (no GEOAPIFY_API_KEY)";
  if (env.GEOAPIFY_API_KEY && rawBusinesses.length < targetPool) {
    const geoRes = await fetchGeoapifyBusinesses(city, trade, nominatimGeo, env.GEOAPIFY_API_KEY);
    geoapifyStatus = geoRes.status;
    const geoItems = (geoRes.businesses || []).filter((b) => {
      if (mode === "tenant") return true;
      const n = String(b.name || "").toLowerCase();
      if (/\b(hotel|motel|resort|inn)\b/i.test(n) && !/plumb|hvac|electric|roof|landscap|clean|pest/i.test(trade)) return false;
      if (/\b(restaurant|cafe|bar|grill)\b/i.test(n) && !/clean|pest|hvac|plumb/i.test(trade)) return false;
      return true;
    });
    rawBusinesses.push(...geoItems);
  }
  let locationIqStatus = "skipped (no LOCATIONIQ_API_KEY)";
  if (env.LOCATIONIQ_API_KEY && rawBusinesses.length < targetPool) {
    const liq = await fetchLocationIqBusinesses(city, trade, String(env.LOCATIONIQ_API_KEY));
    locationIqStatus = liq.status;
    rawBusinesses.push(...liq.businesses);
  }
  let photonStatus = "unattempted";
  if (rawBusinesses.length < targetPool) {
    const ph = await fetchPhotonBusinesses(city, trade);
    photonStatus = ph.status;
    rawBusinesses.push(...ph.businesses);
  }
  const bizDataExplicitlyOff = env.ENABLE_BIZDATA === "0" || env.ENABLE_BIZDATA === "false";
  if (rawBusinesses.length < Math.min(12, targetPool) && !bizDataExplicitlyOff) {
    const bizDataRes = await fetchBizDataBusinesses(city, trade);
    bizdataStatus = bizDataRes.status;
    rawBusinesses.push(...bizDataRes.businesses);
  } else {
    bizdataStatus = rawBusinesses.length >= 12 ? `skipped (have ${rawBusinesses.length} results)` : "disabled (ENABLE_BIZDATA=0)";
  }
  let nominatimPoiStatus = "skipped";
  if (rawBusinesses.length < 6) {
    const nom = await fetchNominatimPoiBusinesses(city, trade);
    nominatimPoiStatus = nom.status;
    rawBusinesses.push(...nom.businesses);
  }
  const allCandidates = [...permitCandidates, ...rawBusinesses];
  const seen = /* @__PURE__ */ new Set();
  const deduped = [];
  for (const item of allCandidates) {
    const rawName = String(item.name || "").trim();
    const candTrade = item.trade || trade;
    const coherence = checkTradeCoherence(rawName, candTrade, item.website, JSON.stringify(item), mode);
    if (isOffIcpName(rawName, mode === "tenant") || !coherence.coherent || coherence.disqualified) {
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
  const reason = deduped.length > 0 ? `Discovered ${deduped.length} businesses for ${city} - ${trade} across discovery cascade` : `Zero businesses discovered for ${city} - ${trade}. Nominatim: ${nominatimStatus}, Overpass: ${overpassStatus}, Geoapify: ${geoapifyStatus}, BizData: ${bizdataStatus}`;
  const diagnostics = {
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
    locationiq_status: typeof locationIqStatus !== "undefined" ? locationIqStatus : "n/a",
    photon_status: typeof photonStatus !== "undefined" ? photonStatus : "n/a",
    nominatim_poi_status: typeof nominatimPoiStatus !== "undefined" ? nominatimPoiStatus : "n/a"
  };
  if (env.RADAR_DB) {
    const zeroKey = `radar_zero_streak_${city.replace(/[^a-z0-9]/gi, "_")}_${trade}_v4`.toLowerCase();
    if (deduped.length > 0) {
      await cachePut(env, zeroKey, "0", 86400 * 30);
      await cachePut(env, cacheKey, JSON.stringify(deduped), 86400);
    } else {
      let streak = 1;
      try {
        const prev = await cacheGet(env, zeroKey);
        streak = (parseInt(prev || "0", 10) || 0) + 1;
      } catch (e) {
      }
      await cachePut(env, zeroKey, String(streak), 86400 * 30);
      const ttl = streak >= 5 ? 7 * 86400 : 1800;
      if (streak >= 5) {
        console.log(`[Discovery Zero-Cache] ${city} - ${trade} reached ${streak} consecutive zeroes. Applying 7-day cooldown.`);
      }
      await cachePut(env, cacheKey, JSON.stringify([]), ttl);
    }
  }
  return { businesses: deduped, diagnostics };
}
__name(fetchLocalBusinessesWithDiagnostics, "fetchLocalBusinessesWithDiagnostics");
async function fetchLocalBusinesses(city, trade, env) {
  const res = await fetchLocalBusinessesWithDiagnostics(city, trade, env);
  return res.businesses;
}
__name(fetchLocalBusinesses, "fetchLocalBusinesses");
async function tryGemini(model, apiKey, prompt) {
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
      const data = await res.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (rawText) {
        const parsed = JSON.parse(rawText.trim());
        if (parsed) {
          if (parsed.subject && parsed.body) {
            console.log(`[Gemini Cascade] Success using model: [${model}]`);
            return parsed;
          } else if (parsed.segments) {
            console.log(`[Gemini Cascade] Success parsed segments using model: [${model}]`);
            return parsed;
          }
          return parsed;
        }
      }
    } else {
      console.warn(`[Gemini Cascade] Model [${model}] returned status: [${res.status}]`);
    }
  } catch (e) {
    console.warn(`[Gemini Cascade] Model [${model}] request failed:`, e.message || e);
  }
  return null;
}
__name(tryGemini, "tryGemini");
async function expandTenantIcp(env, tc) {
  if (!tc) return null;
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
  const apiKey = env.GEMINI_FOUNDER_API_KEY || env.GEMINI_SECONDARY_API_KEY;
  if (!apiKey) {
    return null;
  }
  const modelsStr = env.GEMINI_MODELS || "gemini-3.5-flash-lite";
  const modelList = modelsStr.split(",").map((m) => m.trim()).filter(Boolean);
  const modelsToTry = modelList.slice(0, 2);
  const readList = /* @__PURE__ */ __name((value) => {
    try {
      const parsed = typeof value === "string" ? JSON.parse(value || "[]") : value;
      return Array.isArray(parsed) ? parsed.map((item) => String(item?.label || item || "").trim()).filter(Boolean) : [];
    } catch {
      return [];
    }
  }, "readList");
  const services = readList(tc.services_json);
  const serviceAreas = readList(tc.service_areas_json);
  const countries = readList(tc.countries_json);
  const languages = readList(tc.languages_json);
  const keywords = readList(tc.icp_keywords_json);
  const allowedMarkets = readList(tc.allowed_markets_json);
  const prompt = `Negocio: ${tc.tenant_name || ""}. Industria: ${tc.industry || ""}. Nicho propio: ${tc.niche || ""}. Servicios: ${services.join(", ")}. Zonas: ${serviceAreas.join(", ")}. Pa\xEDses: ${countries.join(", ")}. Idiomas: ${languages.join(", ")}. ICP: ${tc.icp_description || ""}. Keywords ICP: ${keywords.join(", ")}. Mercados indicados: ${allowedMarkets.join(", ")}.
Genera hasta 6 segmentos de CLIENTES que compran a este negocio; no devuelvas competidores ni empresas del mismo oficio. No limites el resultado a un mapa cerrado de industrias: usa el perfil completo y deduce compradores B2B o consumidores seg\xFAn el modelo de negocio. Si el ICP no permite una inferencia fiable, devuelve segments vac\xEDo. Devuelve SOLO JSON {segments:[{label,osm_tags,keywords,why}]}, ordenado por probabilidad de compra recurrente. osm_tags: 1 a 3 etiquetas OSM v\xE1lidas como office=estate_agent o amenity=restaurant. Sin texto extra.`;
  let geminiResult = null;
  for (const model of modelsToTry) {
    geminiResult = await tryGemini(model, apiKey, prompt);
    if (geminiResult) break;
  }
  if (!geminiResult || !Array.isArray(geminiResult.segments)) {
    return null;
  }
  const osmTagRegex = /^[a-z_]+=[a-z_]+$/;
  const validatedSegments = [];
  for (const seg of geminiResult.segments.slice(0, 6)) {
    if (!seg || typeof seg !== "object") continue;
    const label = String(seg.label || "").trim();
    if (!label) continue;
    const rawTags = Array.isArray(seg.osm_tags) ? seg.osm_tags : [];
    const validTags = rawTags.map((t) => String(t || "").trim().toLowerCase()).filter((t) => osmTagRegex.test(t));
    const keywords2 = Array.isArray(seg.keywords) ? seg.keywords.map((k) => String(k || "").trim()).filter(Boolean) : [];
    const why = String(seg.why || "").trim();
    validatedSegments.push({
      label,
      osm_tags: validTags,
      keywords: keywords2,
      why
    });
  }
  if (validatedSegments.length === 0) {
    return null;
  }
  const expansionResult = { segments: validatedSegments };
  const expandedAt = (/* @__PURE__ */ new Date()).toISOString();
  const expansionJson = JSON.stringify(expansionResult);
  if (env.RADAR_DB && tc.tenant_id) {
    try {
      await env.RADAR_DB.prepare(
        "UPDATE tenant_config SET icp_expansion_json = ?, icp_expanded_at = ? WHERE tenant_id = ?"
      ).bind(expansionJson, expandedAt, tc.tenant_id).run();
    } catch (saveErr) {
      console.warn("[expandTenantIcp] Failed to save icp_expansion_json to D1 (migration 0024 may be pending):", saveErr);
    }
  }
  tc.icp_expansion_json = expansionJson;
  tc.icp_expanded_at = expandedAt;
  return expansionResult;
}
__name(expandTenantIcp, "expandTenantIcp");
var FOUNDER_VOICE_EN = [
  "I'm Rainer \u2014 solo builder of Bvelt.",
  "I ship Bvelt myself end-to-end, so it stays lean for field crews.",
  "Built Bvelt as a one-person product focused on contractors, not enterprise bloat.",
  "I built Bvelt under tight bandwidth and power limits \u2014 that's why it stays fast on a phone.",
  "Solo founder here: every feature has to earn its place for real trade businesses.",
  "I'm Rainer. I built Bvelt from a constrained setup so it still works when the connection is messy.",
  "One-person shop behind Bvelt \u2014 designed for crews who live on their phones.",
  "I built Bvelt the hard way so the tool itself stays simple and reliable."
];
var FOUNDER_VOICE_ES = [
  "Soy Rainer, el constructor en solitario de Bvelt.",
  "Desarrollo Bvelt de punta a punta para que siga siendo ligero para cuadrillas en campo.",
  "Cre\xE9 Bvelt como producto de una sola persona, enfocado en contratistas, no en enterprise.",
  "Constru\xED Bvelt con poco ancho de banda y cortes de luz \u2014 por eso funciona r\xE1pido en el m\xF3vil.",
  "Fundador \xFAnico: cada funci\xF3n tiene que valer la pena para negocios de oficio reales.",
  "Soy Rainer. Hice Bvelt en un entorno limitado para que siga \xFAtil con mala conexi\xF3n.",
  "Bvelt lo lleva una sola persona \u2014 pensado para quien trabaja desde el tel\xE9fono.",
  "Constru\xED Bvelt a la manera dif\xEDcil para que la herramienta sea simple y fiable."
];
function hashPick(seed, n) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h << 5) - h + seed.charCodeAt(i) | 0;
  return Math.abs(h) % Math.max(1, n);
}
__name(hashPick, "hashPick");
function pickFounderVoiceLine(prospectId, touch, lang) {
  const list = (lang || "en").toLowerCase().startsWith("es") ? FOUNDER_VOICE_ES : FOUNDER_VOICE_EN;
  const idx = hashPick(`${prospectId || "x"}|t${touch || 1}`, list.length);
  return list[idx];
}
__name(pickFounderVoiceLine, "pickFounderVoiceLine");
function getOutreachTouch(prospect) {
  try {
    const s = typeof prospect.signals_json === "string" ? JSON.parse(prospect.signals_json || "{}") : prospect.signals_json || {};
    const t = Number(s.outreach_touch || 1);
    return Number.isFinite(t) && t >= 1 ? t : 1;
  } catch {
    return 1;
  }
}
__name(getOutreachTouch, "getOutreachTouch");
async function bumpOutreachTouch(db, prospect, nextTouch) {
  try {
    let s = {};
    try {
      s = JSON.parse(prospect.signals_json || "{}");
    } catch {
      s = {};
    }
    s.outreach_touch = nextTouch;
    s.last_outreach_touch_at = (/* @__PURE__ */ new Date()).toISOString();
    await db.prepare("UPDATE prospects SET signals_json = ?, updated_at = ? WHERE id = ?").bind(JSON.stringify(s), (/* @__PURE__ */ new Date()).toISOString(), prospect.id).run();
  } catch (e) {
    console.warn("[bumpOutreachTouch]", e);
  }
}
__name(bumpOutreachTouch, "bumpOutreachTouch");
function resolveOutreachTouchCount(signalTouch, historicalTouchCount) {
  const signal = Number(signalTouch);
  const historical = Number(historicalTouchCount);
  return Math.max(1, Number.isFinite(signal) ? Math.floor(signal) : 1, Number.isFinite(historical) ? Math.floor(historical) : 1);
}
__name(resolveOutreachTouchCount, "resolveOutreachTouchCount");
function evaluateFounderOutreachEligibility(status, lastReplyContent, historicalTouchCount, lastSendAt, lastContactAt, cooldownUntil, now = Date.now()) {
  const state = String(status || "").toLowerCase();
  if (["bounced", "unsubscribed", "complained", "suppressed", "replied", "blocked"].includes(state)) return { allowed: false, reason: "terminal_contact_state", nextTouch: 0 };
  if (lastReplyContent && String(lastReplyContent).trim()) return { allowed: false, reason: "reply_received", nextTouch: 0 };
  const touches = Math.max(0, Math.floor(Number(historicalTouchCount) || 0));
  if (touches >= 3) return { allowed: false, reason: "three_touch_cap_reached", nextTouch: 0 };
  const cooldown = Date.parse(String(cooldownUntil || ""));
  if (Number.isFinite(cooldown) && cooldown > now) return { allowed: false, reason: "cooldown_active", nextTouch: 0 };
  const contactStates = ["sent", "delivered", "opened", "clicked", "scheduled"];
  if (contactStates.includes(state) && touches === 0 && !lastContactAt) return { allowed: false, reason: "last_send_unknown", nextTouch: 0 };
  if (touches > 0 || lastContactAt && contactStates.includes(state)) {
    const raw = String(lastSendAt || lastContactAt || "").trim();
    if (!raw) return { allowed: false, reason: "last_send_unknown", nextTouch: 0 };
    const parsed = Date.parse(raw.includes("T") ? raw : raw.replace(" ", "T") + "Z");
    if (!Number.isFinite(parsed)) return { allowed: false, reason: "last_send_invalid", nextTouch: 0 };
    const age = now - parsed;
    if (age < 5 * 864e5) return { allowed: false, reason: "five_day_contact_cooldown", nextTouch: 0 };
    if (age > 45 * 864e5) return { allowed: false, reason: "followup_window_expired", nextTouch: 0 };
  }
  return { allowed: true, reason: "eligible", nextTouch: touches + 1 };
}
__name(evaluateFounderOutreachEligibility, "evaluateFounderOutreachEligibility");
async function getFounderOutreachEligibility(db, prospect, now = Date.now()) {
  if (String(prospect.mode || "").toLowerCase() === "tenant") {
    return { allowed: true, reason: "tenant_policy", nextTouch: getOutreachTouch(prospect) };
  }
  const [history, idempotency] = await Promise.all([
    db.prepare("SELECT COUNT(DISTINCT message_id) AS touch_count, MAX(created_at) AS last_send_at FROM email_dispatch_logs WHERE prospect_id = ? AND message_id IS NOT NULL").bind(prospect.id).first(),
    db.prepare("SELECT COUNT(DISTINCT idempotency_key) AS touch_count, MAX(updated_at) AS last_send_at FROM outreach_idempotency WHERE prospect_id = ? AND status IN ('queued','sent','scheduled','provider_unknown')").bind(prospect.id).first()
  ]);
  const state = String(prospect.status || "").toLowerCase();
  const fallbackTouch = prospect.last_contact_at ? 1 : 0;
  const touches = Math.max(Number(history?.touch_count || 0), Number(idempotency?.touch_count || 0), fallbackTouch);
  const sendTimes = [history?.last_send_at, idempotency?.last_send_at].filter(Boolean);
  const lastSendAt = sendTimes.sort((a, b) => Date.parse(String(b)) - Date.parse(String(a)))[0] || prospect.last_contact_at || null;
  return evaluateFounderOutreachEligibility(
    state,
    prospect.last_reply_content || null,
    touches,
    lastSendAt,
    prospect.last_contact_at || null,
    prospect.cooldown_until || null,
    now
  );
}
__name(getFounderOutreachEligibility, "getFounderOutreachEligibility");
function shouldSendFounderFollowUp(status, lastContactAt, lastReplyContent, touchCount, now = Date.now()) {
  const state = String(status || "").toLowerCase();
  if (!["sent", "delivered", "opened", "clicked"].includes(state)) return false;
  if (lastReplyContent && String(lastReplyContent).trim()) return false;
  const raw = String(lastContactAt || "").trim();
  if (!raw) return false;
  const parsed = Date.parse(raw.includes("T") ? raw : raw.replace(" ", "T") + "Z");
  if (!Number.isFinite(parsed)) return false;
  const age = now - parsed;
  if (age < 5 * 864e5 || age > 45 * 864e5) return false;
  const touch = Number(touchCount);
  return Number.isFinite(touch) && touch >= 1 && touch < 3;
}
__name(shouldSendFounderFollowUp, "shouldSendFounderFollowUp");
function buildOutreachIdempotencyKey(tenantId, prospectId, sequenceId, touchCount) {
  const touch = Math.max(1, Math.floor(Number(touchCount) || 1));
  return `idempotency:${tenantId}:${prospectId}:${sequenceId}:touch:${touch}`;
}
__name(buildOutreachIdempotencyKey, "buildOutreachIdempotencyKey");
async function generateAICopy(prospect, variantId, env, missionConfig) {
  const language = missionConfig?.languages && missionConfig.languages[0] || "en";
  const isSpanish = language.toLowerCase().startsWith("es");
  const outreachTouch = getOutreachTouch(prospect);
  const founderLine = !prospect.tenant_id || prospect.tenant_id === "founder" || prospect.mode === "founder" ? pickFounderVoiceLine(String(prospect.id || prospect.name || "x"), outreachTouch, language) : "";
  const isFollowUp = outreachTouch >= 2;
  const demoLink = "https://bvelt.app/";
  let tenantInfo = null;
  if (prospect.mode === "tenant" && prospect.tenant_id) {
    try {
      tenantInfo = await env.RADAR_DB.prepare("SELECT * FROM tenant_config WHERE tenant_id = ?").bind(prospect.tenant_id).first();
    } catch (e) {
    }
  }
  if (prospect.signal_event && prospect.signal_area && !tenantInfo) {
    const subject = isSpanish ? `${prospect.signal_event} para ${prospect.signal_area} - consulta para ${prospect.name}` : `${prospect.signal_event} for ${prospect.signal_area} - quick question for ${prospect.name}`;
    const bodyBase = isSpanish ? `Hola equipo de ${prospect.name}, vi la ${prospect.signal_event} para ${prospect.signal_area}. D\xEDas como hoy suelen traer un aluvi\xF3n de llamadas, y cada llamada que va al buz\xF3n de voz es un trabajo que puede irse a otra parte. Soy Rainer y cre\xE9 Bvelt, una aplicaci\xF3n sencilla que ayuda a peque\xF1as empresas de servicios a dar seguimiento a llamadas perdidas y presupuestos antiguos. Prepar\xE9 una breve demo para ${prospect.name} aqu\xED: ${demoLink}. \xBFVale la pena echarle un vistazo?` : `Hi ${prospect.name} team, I saw the ${prospect.signal_event} for ${prospect.signal_area}. Days like this usually bring a rush of calls, and every call that goes to voicemail is a job that may go to someone else. I'm Rainer, and I built Bvelt, a simple app that helps small service businesses follow up on missed calls and old estimates. I made a short demo for ${prospect.name} here: ${demoLink}. Worth a look?`;
    const footer = buildLegalFooter(env);
    const fullBody = footer ? `${bodyBase}

${footer}` : bodyBase;
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
      angleFocus = `ACT\xDAA COMO: Representante de ${tenantInfo.tenant_name}. Somos expertos en ${tenantInfo.industry}.
      ENFOQUE: Ofrecemos servicios de ${tenantInfo.niche} para ${prospect.trade}.
      VALOR: Garantizamos respuesta en menos de 60 segundos 24/7 mediante nuestra plataforma Bvelt. Sabemos que en ${prospect.city} la velocidad es lo que cierra contratos.`;
    } else {
      angleFocus = `ACT AS: Representative of ${tenantInfo.tenant_name}. We are experts in ${tenantInfo.industry}.
      FOCUS: Offering ${tenantInfo.niche} services for ${prospect.trade}.
      VALUE: We guarantee response in under 60 seconds 24/7 via our Bvelt platform. We know that in ${prospect.city}, speed is what closes contracts.`;
    }
  } else {
    let signals = {};
    try {
      signals = typeof prospect.signals_json === "string" ? JSON.parse(prospect.signals_json || "{}") : prospect.signals_json || prospect.signals || {};
    } catch {
      signals = {};
    }
    const techAudit = signals.technical_audits || {};
    const fcpSeconds = techAudit.fcp_seconds || (prospect.pagespeed_score ? prospect.pagespeed_score < 50 ? 3.8 : 2.1 : null);
    const latencyStr = fcpSeconds ? `${fcpSeconds}s` : "m\xE1s de 3 segundos";
    const latencyStrEn = fcpSeconds ? `${fcpSeconds}s` : "over 3 seconds";
    if (isSpanish) {
      angleFocus = `GANCHO PRINCIPAL: AUDITOR\xCDA T\xC9CNICA GRATUITA (Llamadas perdidas y velocidad web m\xF3vil).
      - Hallazgo t\xE9cnico: La carga de su web en m\xF3viles toma ${latencyStr} y cuando los operarios est\xE1n en obra o conduciendo, las llamadas entrantes van al buz\xF3n de voz sin un SMS de respuesta en menos de 60 segundos.
      - Dolor de negocio: En ${prospect.city}, el 80% de propietarios que llaman por ${prospect.trade || "servicios de contratista"} y dan con un buz\xF3n de voz cuelgan y llaman al siguiente contratista en Google.
      - Soluci\xF3n: Bvelt a\xF1ade respuesta instant\xE1nea por SMS en menos de 60 segundos ante llamadas perdidas y reactiva presupuestos pendientes.
      - Demo interactiva: Invita respetuosamente a ver la demo interactiva de 60 segundos (${demoLink}) para ver c\xF3mo recupera clientes autom\xE1ticamente.`;
    } else {
      angleFocus = `PRIMARY HOOK: FREE TECHNICAL AUDIT (Missed Calls & Mobile Web Speed).
      - Technical finding: Mobile site load takes ~${latencyStrEn} and when crews are busy on-site or driving, incoming phone calls hit voicemail with no instant 60-second SMS text-back.
      - Business pain: In ${prospect.city}, homeowners calling for ${prospect.trade || "contractor work"} who hit voicemail hang up and tap the next contractor on Google.
      - Solution: Bvelt adds instant SMS text-back in under 60 seconds to lock in missed calls and reactivate old estimates.
      - Interactive Demo: Soft invite to check out the 60-second interactive preview (${demoLink}) to see how it recovers jobs automatically.`;
    }
  }
  const prompt = isSpanish ? `
    Eres un redactor publicitario experto en ventas (sales copywriter). Escribes correos fr\xEDos directos y profesionales.
    ${tenantInfo ? `Remitente: ${tenantInfo.tenant_name} (${tenantInfo.industry})` : "Remitente: Bvelt (https://bvelt.app)"}
    
    Destinatario:
    - Empresa: ${prospect.name}
    - Ubicaci\xF3n: ${prospect.city}
    - Trade: ${prospect.trade}
 
    Instrucciones del \xE1ngulo de prospecci\xF3n:
    ${angleFocus}

    REGLAS:
    1. Idioma: Espa\xF1ol t\xE9cnico y profesional.
    2. Longitud: 85 a 105 palabras.
    3. Tono: Respetuoso, directo, mentalidad de emprendedor de guerrilla.
    4. Exactamente UNA oraci\xF3n sobre el valor tecnol\xF3gico: "${tenantInfo ? `Usamos Bvelt para garantizar que nunca pierdas una oportunidad con nosotros por falta de respuesta.` : "Bvelt reactiva autom\xE1ticamente prospectos perdidos y recupera trabajos para contratistas mediante SMS automatizados r\xE1pidos."}"
    5. Soft CTA: "Si quiere ver c\xF3mo funciona en 2 minutos \u2192 ${demoLink}".
    6. SIN FIRMA NI PIE DE P\xC1GINA (el sistema a\xF1ade el legal).
    7. ${!tenantInfo && founderLine ? `FRASE FUNDADOR (\xFAsala una vez, natural, no inventes otra biograf\xEDa): "${founderLine}"` : "No inventes historia personal del fundador."}
    8. ${isFollowUp ? "Esto es SEGUIMIENTO toque #" + outreachTouch + " sin respuesta. M\xE1s corto, otro \xE1ngulo, sin culpar. Asunto sin Re: falso." : "Primer correo en fr\xEDo."}
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
    4. Soft Call-to-Action: "If you'd like to see how it works in 2 minutes \u2192 ${demoLink}".
    5. NO SIGNATURE OR FOOTER (system adds legal footer).
    6. ${!tenantInfo && founderLine ? `FOUNDER LINE (use once, natural English, do not invent a different bio): "${founderLine}"` : "Do not invent a personal founder story."}
    7. ${isFollowUp ? "This is FOLLOW-UP touch #" + outreachTouch + " after no reply. Different angle from a first cold email. Shorter. Do not guilt-trip. Subject must NOT start with Re: unless truly a thread. Mention you are checking in once, then offer the demo link again." : "This is the FIRST outreach email."}
    8. JSON format: {"subject": "...", "body": "..."}
  `;
  const modelsStr = env.GEMINI_MODELS || "gemini-3.5-flash-lite";
  const modelList = modelsStr.split(",").map((m) => m.trim()).filter(Boolean);
  const modelsToTry = modelList.slice(0, 2);
  const apiKey = env.GEMINI_FOUNDER_API_KEY || env.GEMINI_SECONDARY_API_KEY;
  let aiUnitReserved = false;
  const tenantId = prospect.tenant_id || "founder";
  if (apiKey || env.GROQ_API_KEY) {
    aiUnitReserved = await reserveBudget(env.RADAR_DB, tenantId, "ai_units", 1);
  }
  if (aiUnitReserved) {
    if (apiKey) {
      for (const model of modelsToTry) {
        const res = await tryGemini(model, apiKey, prompt);
        if (res) {
          await commitBudget(env.RADAR_DB, tenantId, "ai_units", 1);
          return res;
        }
      }
    }
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
            const data = await response.json();
            const raw = data.choices?.[0]?.message?.content;
            if (raw) {
              const content = typeof raw === "string" ? JSON.parse(raw) : raw;
              if (content.subject && content.body) {
                console.log(`[Gemini Cascade] Success using Groq ${groqModel}`);
                await commitBudget(env.RADAR_DB, tenantId, "ai_units", 1);
                return { subject: content.subject, body: content.body };
              }
            }
          } else {
            const errTxt = await response.text().catch(() => "");
            console.warn(`[Gemini Cascade] Groq ${groqModel} status ${response.status}: ${errTxt.slice(0, 180)}`);
            if (response.status === 404 || response.status === 400) continue;
          }
        } catch (e) {
          console.warn(`[Gemini Cascade] Groq ${groqModel} failed:`, e.message);
        }
      }
    }
    if (env.AI && typeof env.AI.run === "function") {
      console.log(`[Gemini Cascade] Calling Workers AI (Llama) backup...`);
      try {
        const response = await env.AI.run("@cf/meta/llama-3.2-3b-instruct", {
          messages: [
            { role: "system", content: 'Reply ONLY with valid JSON: {"subject":string,"body":string}. No markdown.' },
            { role: "user", content: prompt }
          ],
          max_tokens: 400
        });
        let rawText = "";
        if (typeof response === "string") rawText = response;
        else if (response && typeof response.response === "string") rawText = response.response;
        else rawText = JSON.stringify(response);
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const content = JSON.parse(jsonMatch[0]);
          if (content.subject && content.body) {
            console.log(`[Gemini Cascade] Success using Workers AI backup`);
            await commitBudget(env.RADAR_DB, tenantId, "ai_units", 1);
            return { subject: String(content.subject), body: String(content.body) };
          }
        }
      } catch (e) {
        console.warn("[Gemini Cascade] Workers AI backup failed:", e.message);
      }
    }
    await releaseBudget(env.RADAR_DB, tenantId, "ai_units", 1);
  }
  console.log(`[Gemini Cascade] All AI pipelines failed or budget exceeded. Reverting to deterministic backup template.`);
  return getTradePsychologyFallback(prospect.name, prospect.trade, prospect.city, bveltAngle, language, prospect.phone, prospect.demo_token, prospect.signal_event, prospect.signal_area, env, prospect.signals_json || prospect.signals);
}
__name(generateAICopy, "generateAICopy");
function buildAttackKit(p) {
  const name = String(p.name || "there");
  const city = String(p.city || "");
  const isTenantLead = p.mode === "tenant" || p.tenant_id && p.tenant_id !== "founder";
  const phone = p.phone ? String(p.phone) : null;
  const coherence = checkTradeCoherence(
    name,
    String(p.trade || ""),
    p.website,
    typeof p.signals_json === "string" ? p.signals_json : JSON.stringify(p.signals_json || {}),
    isTenantLead ? "tenant" : "founder"
  );
  if (coherence.disqualified || !coherence.coherent || !coherence.verifiedTrade) {
    return {
      prospect_id: String(p.id || ""),
      name,
      why_this_lead: `DO NOT CONTACT: ${coherence.reason || "Off ICP or trade mismatch"}`,
      email: { subject: "", body: "" },
      sms: "",
      call_script: "- DO NOT CONTACT: Business is off-ICP or trade label conflicts with company name.",
      next_action: "DO_NOT_CONTACT \u2014 off ICP or trade mismatch",
      angle: "disqualified_off_icp"
    };
  }
  const tradeKey = coherence.verifiedTrade;
  const tradeLabels = {
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
  if (isTenantLead) {
    const whyTenant = `${name} en ${city} (${tradeLabel}): comprador B2B potencial para tus servicios con necesidades de mantenimiento o gesti\xF3n en ${city}.`;
    const subjectTenant = `Disponibilidad de servicio de ${tradeLabel} para ${name} en ${city}`;
    const emailBodyTenant = `Hola equipo de ${name},

Nos ponemos en contacto porque gestionan propiedades en ${city} y sabemos lo cr\xEDtico que es contar con especialistas en ${tradeLabel} de respuesta r\xE1pida cuando surge una aver\xEDa o necesidad de mantenimiento.

Contamos con t\xE9cnicos locales disponibles y tiempos de atenci\xF3n inmediata para instalaciones comerciales y residenciales.

\xBFTienen un momento esta semana para una llamada breve y ver si podemos colaborar?

Saludos cordiales,
Equipo de servicio local`;
    const smsTenant = `Hola ${name}, ofrecemos servicio r\xE1pido de ${tradeLabel} en ${city} para propiedades comerciales y residenciales. \xBFTienen necesidades de mantenimiento activas?`;
    const callTenant = `- Contexto: Presentar servicio local de ${tradeLabel} en ${city}.
- Pregunta: "\xBFTienen incidencias abiertas o retrasos con contratistas actuales en sus propiedades?"
- Propuesta: Ofrecer respuesta local garantizada y presupuestos en el d\xEDa.
- Cierre: Pedir contacto del responsable de mantenimiento para coordinar tarifas.`;
    const nextTenant = phone ? "Llamar directo o contactar por WhatsApp (cliente B2B local)." : p.email ? "Enviar propuesta B2B por email." : "Buscar tel\xE9fono y llamar.";
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
  let signals = {};
  try {
    signals = typeof p.signals_json === "string" ? JSON.parse(p.signals_json || "{}") : p.signals_json || p.signals || {};
  } catch {
    signals = {};
  }
  const angleHint = String(p.bvelt_angle || p.angle || "").toLowerCase();
  const hasWeatherSignal = Boolean(p.signal_event || signals.weather_alert || signals.emergency_weather || signals.storm_surge);
  const hasQuoteSignal = Boolean(signals.quote_request || signals.estimate_form || signals.stale_estimates || signals.quote_followup_gap);
  const hasSmsGapSignal = Boolean(signals.phone_only || signals.no_sms || signals.sms_gap || signals.landline_only || signals.no_texting);
  const hasMissedCallsSignal = Boolean(
    signals.missed_call_evidence || signals.after_hours_voicemail || signals.call_answering_friction || signals.unanswered_call || signals.voicemail_only || angleHint === "missed_calls" && (signals.missed_call_verified || signals.unanswered_call)
  );
  let selectedAngle = null;
  if (hasWeatherSignal) {
    selectedAngle = "weather_surge";
  } else if (hasQuoteSignal) {
    selectedAngle = "stale_quotes";
  } else if (hasSmsGapSignal) {
    selectedAngle = "no_sms";
  } else if (hasMissedCallsSignal) {
    selectedAngle = "missed_calls";
  }
  if (!selectedAngle) {
    return {
      prospect_id: String(p.id || ""),
      name,
      why_this_lead: `DO NOT CONTACT: no verified friction or observable evidence for outreach angle`,
      email: { subject: "", body: "" },
      sms: "",
      call_script: "- DO NOT CONTACT: No verified friction or observable evidence for outreach angle.",
      next_action: "DO_NOT_CONTACT \u2014 no evidence for angle",
      angle: "no_evidence"
    };
  }
  const demoUrl = "https://bvelt.app/";
  const senderSignature = "Rainer \u2014 Bvelt";
  const firstName = name.split(/\s+/)[0] || name;
  const variantIndex = hashCode(String(p.id || name + city)) % 3;
  const reasons = [];
  if (selectedAngle === "weather_surge") reasons.push(`se\xF1al clim\xE1tica/demanda: ${p.signal_event || "alerta meteorol\xF3gica"}`);
  else if (selectedAngle === "stale_quotes") reasons.push("solicitud de presupuestos/estimaciones sin seguimiento");
  else if (selectedAngle === "no_sms") reasons.push("sin canal SMS/respuesta por texto");
  else reasons.push(`contratista activo de ${tradeLabel} en ${city} con llamadas entrantes no atendidas`);
  const why = `${name} en ${city} (${tradeLabel}): ${reasons.join("; ")}.`;
  let subject = "";
  let emailBody = "";
  let sms = "";
  let call_script = "";
  if (selectedAngle === "missed_calls") {
    subject = `${name} \u2014 missed ${tradeLabel} calls in ${city}`;
    if (variantIndex === 0) {
      sms = `Hi ${firstName} \u2014 quick note from Rainer at Bvelt. When ${tradeLabel} calls in ${city} hit voicemail, a lot of homeowners call the next shop. We text them in under a minute so the job doesn't walk. 60-sec demo for ${name}: ${demoUrl} \u2014 want it or should I stop? \u2014 ${senderSignature}`;
    } else if (variantIndex === 1) {
      sms = `Hi ${firstName} \u2014 Rainer here with Bvelt. When your crew is out on a job in ${city} and the phone rings, most callers won't leave a voicemail. Bvelt sends an instant text back so you catch the job. See how it works: ${demoUrl} \u2014 worth a glance? \u2014 ${senderSignature}`;
    } else {
      sms = `Hi ${firstName} \u2014 Rainer from Bvelt. When homeowners call for ${tradeLabel} in ${city} after hours, whoever replies by text first gets the job. We send that automated text response instantly. See how it works: ${demoUrl} \u2014 should I send more info or pass? \u2014 ${senderSignature}`;
    }
    emailBody = `Hi ${name} team \u2014 saw your ${tradeLabel} service in ${city}.

When your crew is out on a job or it's after hours, missed calls usually go straight to voicemail. In ${city}, homeowners rarely leave a message \u2014 they just call the next contractor on Google.

We built Bvelt to send an instant text back in under a minute so those calls stay on your calendar instead of walking away.

A quick look at how it works: ${demoUrl}

Would you be open to taking a look, or should I stop reaching out?

Best,
${senderSignature}`;
    call_script = `- Operator Context: Verified ${tradeLabel} contractor in ${city}.
- Opening Question: "When your crew is on a job and the phone rings, who catches the call?"
- Key Point: Homeowners in ${city} call down Google listings and hire whoever texts back first.
- Next Step: Offer to text over the demo link (${demoUrl}).`;
  } else if (selectedAngle === "no_sms") {
    subject = `${name} \u2014 texting option for ${tradeLabel} in ${city}`;
    if (variantIndex === 0) {
      sms = `Hi ${firstName} \u2014 quick note from Rainer at Bvelt. Saw your ${tradeLabel} shop in ${city}. Most homeowners text for estimates now and walk away if there's no SMS option. We add instant text response for missed calls. Demo: ${demoUrl} \u2014 interested? \u2014 ${senderSignature}`;
    } else if (variantIndex === 1) {
      sms = `Hi ${firstName} \u2014 Rainer with Bvelt. If a homeowner in ${city} tries to text your ${tradeLabel} line and gets no reply, that lead goes cold. Bvelt replies by SMS in under a minute automatically. See how it works: ${demoUrl} \u2014 worth a look? \u2014 ${senderSignature}`;
    } else {
      sms = `Hi ${firstName} \u2014 Rainer at Bvelt. A lot of ${tradeLabel} clients in ${city} prefer texting over calling. Bvelt turns missed phone calls into instant text conversations. 60-sec demo for ${name}: ${demoUrl} \u2014 want to check it out? \u2014 ${senderSignature}`;
    }
    emailBody = `Hi ${name} team \u2014 saw your ${tradeLabel} shop in ${city}.

A lot of homeowners in ${city} prefer to text for estimates before calling. If the only option is a phone call or voicemail, those jobs quietly slip away.

We built Bvelt to add instant automated texting for missed calls and web inquiries so you catch those homeowners immediately.

A quick look at how it works: ${demoUrl}

Would you be open to taking a look?

Best,
${senderSignature}`;
    call_script = `- Operator Context: ${tradeLabel} contractor in ${city} without instant texting.
- Opening Question: "Do homeowners ever ask to text photos of the job, or is it phone-only?"
- Key Point: Homeowners prefer quick text responses over leaving voicemails.
- Next Step: Offer to text over the demo link (${demoUrl}).`;
  } else if (selectedAngle === "stale_quotes") {
    subject = `${name} \u2014 following up on ${tradeLabel} quotes in ${city}`;
    if (variantIndex === 0) {
      sms = `Hi ${firstName} \u2014 quick note from Rainer at Bvelt. Unanswered ${tradeLabel} estimates in ${city} are a quiet revenue leak. Bvelt automatically nudges past quotes so jobs don't go cold. See how it works: ${demoUrl} \u2014 open to a quick look? \u2014 ${senderSignature}`;
    } else if (variantIndex === 1) {
      sms = `Hi ${firstName} \u2014 Rainer here from Bvelt. Most ${tradeLabel} contractors in ${city} don't have time to follow up bids from last week. Bvelt sends automated text check-ins that bring buyers back. See how it works: ${demoUrl} \u2014 want a look? \u2014 ${senderSignature}`;
    } else {
      sms = `Hi ${firstName} \u2014 Rainer at Bvelt. Following up on past ${tradeLabel} bids in ${city} takes hours when done by hand. Bvelt sequences text follow-ups automatically so you win more jobs. See Bvelt: ${demoUrl} \u2014 should I send details or stop? \u2014 ${senderSignature}`;
    }
    emailBody = `Hi ${name} team \u2014 saw your ${tradeLabel} business in ${city}.

Following up on estimates that sit unanswered is where most contractors in ${city} leave money on the table. Most homeowners get busy and just need a quick text check-in.

We built Bvelt to automatically send friendly text follow-ups on past quotes so bids don't go cold.

A quick look at how it works: ${demoUrl}

Would you be open to taking a look?

Best,
${senderSignature}`;
    call_script = `- Operator Context: ${tradeLabel} contractor in ${city} sending out bids and estimates.
- Opening Question: "How do you follow up on estimates that don't close right away?"
- Key Point: Unanswered bids go cold unless sequenced with friendly SMS check-ins.
- Next Step: Offer to text over the demo link (${demoUrl}).`;
  } else {
    subject = `${name} \u2014 handling ${tradeLabel} call spikes in ${city}`;
    if (variantIndex === 0) {
      sms = `Hi ${firstName} \u2014 quick note from Rainer at Bvelt. With recent severe weather in ${city}, ${tradeLabel} call volume spikes fast. Bvelt texts back missed emergency calls instantly so jobs don't slip away. See how it works: ${demoUrl} \u2014 open to a look? \u2014 ${senderSignature}`;
    } else if (variantIndex === 1) {
      sms = `Hi ${firstName} \u2014 Rainer with Bvelt. Heavy weather in ${city} means phones ring non-stop for ${tradeLabel} work. Bvelt catches missed calls with automated text replies so your crew stays booked. See how it works: ${demoUrl} \u2014 worth a glance? \u2014 ${senderSignature}`;
    } else {
      sms = `Hi ${firstName} \u2014 Rainer from Bvelt. When storm weather hits ${city}, homeowners call multiple ${tradeLabel} companies at once. Bvelt texts back in under 60 seconds to lock in the job. See Bvelt: ${demoUrl} \u2014 should I share details? \u2014 ${senderSignature}`;
    }
    emailBody = `Hi ${name} team \u2014 with the recent weather event in ${city}, call volume for ${tradeLabel} spikes fast.

When phones ring non-stop, missed calls go to competitors who answer first.

We built Bvelt to send instant text replies to missed calls so your crew locks in emergency jobs automatically.

A quick look at how it works: ${demoUrl}

Would you be open to taking a look?

Best,
${senderSignature}`;
    call_script = `- Operator Context: ${tradeLabel} contractor in ${city} facing weather call surges.
- Opening Question: "How are you handling the extra call volume after the storm?"
- Key Point: Instant automated text replies lock in emergency callers before competitors do.
- Next Step: Offer to text over the demo link (${demoUrl}).`;
  }
  if (sms.length > 310) {
    sms = sms.slice(0, 307) + "...";
  }
  const next = phone && !p.email ? "Llamar o contactar por WhatsApp primero (solo tel\xE9fono)." : p.email ? "Enviar correo + registrar decisi\xF3n Enviar." : "Buscar contacto y luego kit SMS/llamada.";
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
__name(buildAttackKit, "buildAttackKit");
function getTradePsychologyFallback(name, trade, city, bveltAngle, language = "en", phone, demoToken, signalEvent, signalArea, env, signalsInput) {
  const cTrade = String(trade || "service").replace(/_/g, " ");
  const isSpanish = language.toLowerCase().startsWith("es");
  const ctaLink = "https://bvelt.app/";
  if (signalEvent && signalArea) {
    const subject2 = isSpanish ? `${signalEvent} para ${signalArea} - consulta para ${name}` : `${signalEvent} for ${signalArea} - quick question for ${name}`;
    const bodyBase = isSpanish ? `Hola equipo de ${name}, vi la ${signalEvent} para ${signalArea}. D\xEDas como hoy suelen traer un aluvi\xF3n de llamadas, y cada llamada que va al buz\xF3n de voz es un trabajo que puede irse a otra parte. Soy Rainer y cre\xE9 Bvelt, una aplicaci\xF3n sencilla que ayuda a peque\xF1as empresas de servicios a dar seguimiento a llamadas perdidas y presupuestos antiguos. Prepar\xE9 una breve demo para ${name} aqu\xED: ${ctaLink}. \xBFVale la pena echarle un vistazo?` : `Hi ${name} team, I saw the ${signalEvent} for ${signalArea}. Days like this usually bring a rush of calls, and every call that goes to voicemail is a job that may go to someone else. I'm Rainer, and I built Bvelt, a simple app that helps small service businesses follow up on missed calls and old estimates. I made a short demo for ${name} here: ${ctaLink}. Worth a look?`;
    const footer = env ? buildLegalFooter(env) : "";
    const fullBody = footer ? `${bodyBase}

${footer}` : bodyBase;
    return { subject: subject2, body: fullBody };
  }
  let signals = {};
  try {
    signals = typeof signalsInput === "string" ? JSON.parse(signalsInput) : signalsInput || {};
  } catch {
    signals = {};
  }
  if (signals.no_own_website) {
    const subject2 = isSpanish ? `${name} en ${city}: sin web propia, las llamadas se pierden` : `${name} in ${city}: no website of your own \u2014 calls go dark`;
    const bodyBase = isSpanish ? `Hola equipo de ${name},

Vi que ${name} opera ${cTrade} en ${city} sin un sitio web propio (o solo con redes). Cuando un cliente llama y nadie contesta, no hay forma de capturar ese lead por SMS o formulario.

Cre\xE9 Bvelt para eso: responde autom\xE1ticamente por SMS a llamadas perdidas en menos de 60 segundos y reactiva presupuestos antiguos.

Demo corta: ${ctaLink}

\xBFTiene sentido echarle un vistazo?` : `Hi ${name} team,

I noticed ${name} runs ${cTrade} in ${city} without a real website of your own (or only social links). When a homeowner calls and nobody picks up, there is no SMS or form to catch that job.

I built Bvelt for exactly that: automatic SMS on missed calls in under 60 seconds, plus follow-up on old estimates.

Short demo: ${ctaLink}

Worth a look?`;
    const footer = env ? buildLegalFooter(env) : "";
    const fullBody = footer ? `${bodyBase}

${footer}` : bodyBase;
    return { subject: subject2, body: fullBody };
  }
  const techAudit = signals.technical_audits || {};
  const fcpSeconds = techAudit.fcp_seconds || (techAudit.is_slow_mobile ? 3.6 : null);
  const latencyStr = fcpSeconds ? `${fcpSeconds}s` : "m\xE1s de 3 segundos";
  const latencyStrEn = fcpSeconds ? `${fcpSeconds}s` : "over 3 seconds";
  if (isSpanish) {
    const subject2 = fcpSeconds ? `Auditor\xEDa t\xE9cnica para ${name}: llamadas perdidas y velocidad web (${latencyStr}) en ${city}` : `Auditor\xEDa t\xE9cnica para ${name}: llamadas perdidas y respuesta m\xF3vil en ${city}`;
    const body2 = `Hola equipo de ${name},

Hice una revisi\xF3n t\xE9cnica r\xE1pida de su presencia online en ${city} y not\xE9 dos detalles clave:
1. La carga de su sitio en celulares toma ${latencyStr}, lo que hace que clientes con urgencias cuelguen antes de ver su n\xFAmero.
2. Si un cliente llama mientras sus t\xE9cnicos est\xE1n en una obra o conduciendo, la llamada va al buz\xF3n de voz sin un SMS de respuesta inmediata.

En trabajos de ${cTrade}, la gran mayor\xEDa de propietarios que van al buz\xF3n cuelgan y llaman al siguiente contratista en Google.

Cre\xE9 Bvelt para solucionar esto: env\xEDa un SMS autom\xE1tico en menos de 60 segundos ante llamadas no atendidas y reactiva presupuestos pendientes.

Les prepar\xE9 una demo interactiva de 60 segundos para ${name} aqu\xED:
\u{1F449} ${ctaLink}

\xBFVale la pena echarle un vistazo de 1 minuto?`;
    return { subject: subject2, body: body2 };
  }
  const subject = fcpSeconds ? `Technical audit for ${name}: missed calls & mobile speed (${latencyStrEn}) in ${city}` : `Technical audit for ${name}: missed call recovery in ${city}`;
  const body = `Hi ${name} team,

I ran a quick technical check on your site in ${city}. Two things stood out:
1. Mobile visitors wait around ${latencyStrEn} for pages to load on a cell phone.
2. If a customer calls while your crews are on-site or driving, the call goes to voicemail with no instant text-back.

In ${cTrade}, most homeowners who hit voicemail simply tap the next contractor on Google.

I built Bvelt, an automated tool that instantly texts back missed calls in under 60 seconds and follows up on old estimates so you don't leak jobs.

I set up an interactive 60-second preview for ${name} here:
\u{1F449} ${ctaLink}

Worth a quick look, or should I leave you alone?`;
  return { subject, body };
}
__name(getTradePsychologyFallback, "getTradePsychologyFallback");
function buildLegalFooter(env) {
  const senderName = env.SENDER_NAME || "Founder";
  const senderAddress = env.SENDER_POSTAL_ADDRESS || "";
  return `--
${senderName}, founder of Bvelt
${senderAddress}
This is a commercial message. If you'd rather not hear from me, reply "unsubscribe" and I'll remove you right away.`;
}
__name(buildLegalFooter, "buildLegalFooter");
async function notifyOnce(env, reasonKey, text, dependencies = {}) {
  try {
    const day = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    const key = `radar_notify_once_${day}_${String(reasonKey).toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 60)}`;
    const readCache = dependencies.cacheGet || cacheGet;
    const writeCache = dependencies.cachePut || cachePut;
    const send = dependencies.send || notifyFounder;
    if (env.RADAR_DB) {
      const seen = await readCache(env, key);
      if (seen) return;
    }
    const delivery = await send(env, text);
    if (env.RADAR_DB && delivery.ok) {
      await writeCache(env, key, "1", 86400);
    }
  } catch (e) {
    console.warn("[notifyOnce] failed:", e);
  }
}
__name(notifyOnce, "notifyOnce");
async function collectRadarDigest(env) {
  const db = env.RADAR_DB;
  const since = new Date(Date.now() - 24 * 3600 * 1e3).toISOString();
  const day = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  const q = /* @__PURE__ */ __name(async (sql, ...binds) => {
    try {
      return await db.prepare(sql).bind(...binds).first();
    } catch {
      return null;
    }
  }, "q");
  const qAll = /* @__PURE__ */ __name(async (sql, ...binds) => {
    try {
      return (await db.prepare(sql).bind(...binds).all()).results || [];
    } catch {
      return [];
    }
  }, "qAll");
  const runsRow = await q("SELECT COUNT(*) AS runs, COALESCE(SUM(discovered),0) AS discovered FROM runs WHERE mode = 'founder' AND created_at >= ?", since);
  const discJobs = await q("SELECT COUNT(*) AS c FROM queue_jobs WHERE job_type = 'discovery' AND created_at >= ?", since);
  const zeroJobs = await q("SELECT COUNT(*) AS c FROM queue_jobs WHERE status = 'completed_zero_prospects' AND created_at >= ?", since);
  const failedJobs = await q("SELECT COUNT(*) AS c FROM queue_jobs WHERE status = 'failed' AND created_at >= ?", since);
  const lastFail = await q("SELECT error FROM queue_jobs WHERE status = 'failed' AND error IS NOT NULL AND created_at >= ? ORDER BY created_at DESC LIMIT 1", since);
  const zeroRows = await qAll("SELECT error FROM queue_jobs WHERE status = 'completed_zero_prospects' AND error IS NOT NULL AND created_at >= ? LIMIT 40", since);
  const zeroReasonCounts = /* @__PURE__ */ new Map();
  for (const zr of zeroRows) {
    const txt = String(zr.error || "");
    const ov = (txt.match(/Overpass:\s*([^,]+?)(?:,|$)/) || [])[1] || "";
    const geo = (txt.match(/Geoapify:\s*([^,]+?)(?:,|$)/) || [])[1] || "";
    const norm = /* @__PURE__ */ __name((x) => x.replace(/\(([^)]*)\)/g, "").replace(/\d+/g, "N").replace(/\s+/g, " ").trim().slice(0, 45), "norm");
    const k = `Overpass: ${norm(ov) || "?"} \xB7 Geoapify: ${norm(geo) || "?"}`;
    zeroReasonCounts.set(k, (zeroReasonCounts.get(k) || 0) + 1);
  }
  const zeroReasonTop = Array.from(zeroReasonCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const created = await q("SELECT COUNT(*) AS c FROM prospects WHERE COALESCE(tenant_id,'founder') = 'founder' AND created_at >= ?", since);
  const withEmail = await q("SELECT COUNT(*) AS c FROM prospects WHERE COALESCE(tenant_id,'founder') = 'founder' AND created_at >= ? AND email IS NOT NULL AND email != ''", since);
  const sent = await q("SELECT COUNT(*) AS c FROM prospects WHERE COALESCE(tenant_id,'founder') = 'founder' AND status IN ('sent','scheduled') AND updated_at >= ?", since);
  const waiting = await q("SELECT COUNT(*) AS c FROM prospects WHERE COALESCE(tenant_id,'founder') = 'founder' AND status IN ('queued','notified')");
  const blockedRows = await qAll(
    `SELECT COALESCE(outcome,'sin_motivo') AS outcome, COUNT(*) AS c FROM prospects
     WHERE COALESCE(tenant_id,'founder') = 'founder' AND updated_at >= ?
       AND status IN ('hold','held','disqualified','provider_required','provider_error','provider_unknown','blocked')
     GROUP BY outcome ORDER BY c DESC LIMIT 5`,
    since
  );
  const gov = await q("SELECT sends_today, status FROM sender_governor_state WHERE id = 'global_governor'");
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
  const has = /* @__PURE__ */ __name((v) => !!(v && String(v).trim()), "has");
  const hasProvider = has(env.RESEND_API_KEY) || has(env.BREVO_API_KEY) || has(env.HUNTER_API_KEY) && has(env.HUNTER_SEQUENCE_ID);
  const paused = env.RADAR_GLOBAL_PAUSE === "true" || env.RADAR_GLOBAL_PAUSE === "1";
  const outPaused = env.RADAR_OUTREACH_PAUSE === "true" || env.RADAR_OUTREACH_PAUSE === "1";
  const autoFlag = String(env.FOUNDER_AUTO_OUTREACH !== void 0 && env.FOUNDER_AUTO_OUTREACH !== "" ? env.FOUNDER_AUTO_OUTREACH : "true").toLowerCase();
  const autoOn = autoFlag === "true" || autoFlag === "1" || autoFlag === "yes";
  const blockers = [];
  if (!has(env.TELEGRAM_BOT_TOKEN) || !has(env.TELEGRAM_CHAT_ID)) blockers.push("Falta TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID");
  if (paused) blockers.push("RADAR_GLOBAL_PAUSE est\xE1 activo (nada corre)");
  if (outPaused) blockers.push("RADAR_OUTREACH_PAUSE est\xE1 activo (no se env\xEDa)");
  if (cb.active) blockers.push(`Circuit breaker abierto: ${cb.reason || "sin motivo"} (requiere reset manual)`);
  if (!hasProvider) blockers.push("Sin proveedor de email (RESEND_API_KEY / BREVO_API_KEY / Hunter)");
  if (autoOn && !has(env.SENDER_POSTAL_ADDRESS)) blockers.push("Falta SENDER_POSTAL_ADDRESS: bloquea todo env\xEDo autom\xE1tico");
  if (gov && gov.status && gov.status !== "active") blockers.push(`Sender governor en estado "${gov.status}"`);
  if (!has(env.FOUNDING_CITIES)) blockers.push("FOUNDING_CITIES vac\xEDo (OK: rotaci\xF3n geoData/geoFrontier activa \u2014 no hace falta lista manual)");
  const hardBlock = blockers.filter((b) => !b.startsWith("FOUNDING_CITIES"));
  let verdict = "ok";
  let headline = "\u{1F7E2} Funcionando: el embudo est\xE1 produciendo";
  if (hardBlock.length > 0) {
    verdict = "blocked";
    headline = "\u{1F534} Bloqueado: " + hardBlock[0];
  } else if (runs === 0) {
    verdict = "blocked";
    headline = "\u{1F534} El cron no cre\xF3 ninguna corrida en 24 h";
  } else if (nCreated === 0) {
    verdict = "idle";
    headline = nZero >= nJobs && nJobs > 0 ? "\u{1F7E1} Corre, pero las fuentes devuelven 0 negocios (Overpass/BizData/Geoapify)" : "\u{1F7E1} Corre, pero no encuentra prospectos NUEVOS (todo lo que halla ya existe)";
  } else if (nEmail === 0) {
    verdict = "idle";
    headline = "\u{1F7E1} Encuentra negocios, pero ninguno llega con email v\xE1lido (no pasan a Telegram)";
  } else if (nSent === 0 && nWaiting === 0 && blockedRows.length > 0) {
    verdict = "idle";
    headline = `\u{1F7E1} Hay prospectos con email, pero se frenan en: ${blockedRows[0].outcome}`;
  }
  const lines = [];
  lines.push(`<b>\u{1F4E1} Radar \xB7 estado (24 h)</b>`);
  lines.push(headline);
  lines.push("");
  lines.push(`<b>Corridas:</b> ${runs} \xB7 <b>Jobs discovery:</b> ${nJobs} (${nZero} con 0 resultados) \xB7 <b>Jobs fallidos:</b> ${nFailed}`);
  lines.push(`<b>Prospectos nuevos:</b> ${nCreated} \xB7 <b>con email:</b> ${nEmail}`);
  lines.push(`<b>Enviados/programados:</b> ${nSent} \xB7 <b>esperando tu aprobaci\xF3n:</b> ${nWaiting}`);
  lines.push(`<b>Presupuesto hoy:</b> discovery restante ${remDisc} \xB7 outreach restante ${remOut}${gov ? ` \xB7 env\xEDos hoy ${gov.sends_today ?? 0}` : ""}`);
  if (blockedRows.length > 0) {
    lines.push("");
    lines.push("<b>D\xF3nde se frenan:</b>");
    for (const r of blockedRows) lines.push(`\u2022 ${escapeHtml2(String(r.outcome).slice(0, 70))}: ${r.c}`);
  }
  if (zeroReasonTop.length > 0) {
    lines.push("");
    lines.push("<b>Por qu\xE9 salen 0 resultados:</b>");
    for (const [k, c] of zeroReasonTop) lines.push(`\u2022 ${escapeHtml2(k)}: ${c}`);
  }
  if (blockers.length > 0) {
    lines.push("");
    lines.push("<b>Config a revisar:</b>");
    for (const b of blockers.slice(0, 5)) lines.push(`\u2022 ${escapeHtml2(b)}`);
  }
  if (nFailed > 0 && lastFail?.error) {
    lines.push("");
    lines.push(`<b>\xDAltimo error de job:</b> <code>${escapeHtml2(String(lastFail.error).slice(0, 160))}</code>`);
  }
  lines.push("");
  lines.push(`<i>${day} \xB7 el radar solo avisa de prospectos cuando hay uno listo; este resumen te dice si est\xE1 vivo.</i>`);
  return {
    verdict,
    headline,
    text: lines.join("\n").slice(0, 3900),
    data: {
      runs,
      discovery_jobs: nJobs,
      zero_result_jobs: nZero,
      failed_jobs: nFailed,
      new_prospects: nCreated,
      with_email: nEmail,
      sent: nSent,
      waiting_approval: nWaiting,
      blocked_by: blockedRows,
      blockers,
      remaining: { discovery: remDisc, outreach: remOut },
      circuit_breaker: cb,
      last_job_error: lastFail?.error || null
    }
  };
}
__name(collectRadarDigest, "collectRadarDigest");
async function sendRadarDigest(env, opts = {}) {
  const d = await collectRadarDigest(env);
  const day = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  const isDailySlot = (opts.scheduledHourUtc ?? -1) >= 22;
  let shouldSend = !!opts.force;
  let digestCacheKey = null;
  if (!shouldSend && env.RADAR_DB) {
    const key = `radar_digest_v2_${day}_${isDailySlot ? "daily" : d.verdict}`;
    const already = await cacheGet(env, key);
    if (!already && (isDailySlot || d.verdict !== "ok")) {
      shouldSend = true;
      digestCacheKey = key;
    }
  }
  if (!shouldSend) return { sent: false, verdict: d.verdict, headline: d.headline, data: d.data };
  const tg = await notifyFounder(env, d.text);
  if (tg.ok && digestCacheKey) await cachePut(env, digestCacheKey, "1", 86400);
  return { sent: !!tg.ok, verdict: d.verdict, headline: d.headline, data: d.data, telegram: tg };
}
__name(sendRadarDigest, "sendRadarDigest");
async function pushMarketObservationsToBem(env) {
  const ingestUrl = env.BVELT_INGEST_URL ? String(env.BVELT_INGEST_URL).trim() : "";
  const ingestKey = String(env.BVELT_INGEST_KEY || env.RADAR_SERVICE_KEY || "").trim();
  if (!ingestUrl || !ingestKey) {
    return { skipped: true, reason: "missing_config" };
  }
  const day = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
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
    ).first();
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
    const results = rows?.results || [];
    const founderOnly = results.filter((row) => !row.tenant_id || row.tenant_id === "" || row.tenant_id === "founder");
    const items = founderOnly.map((row) => {
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
        score: !isNaN(parsedScore) && row.score !== null && row.score !== void 0 ? parsedScore : null,
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
      observed_at: (/* @__PURE__ */ new Date()).toISOString(),
      run_id: `founder-cursor-${founderOnly[founderOnly.length - 1]?.id || "empty"}`,
      items
    };
    let res;
    try {
      res = await fetch(ingestUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${ingestKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(12e3)
      });
    } catch (fetchErr) {
      console.warn(`[BEM Ingest] Network/Timeout error sending to ${ingestUrl}:`, fetchErr?.message || fetchErr);
      return { ok: false, reason: fetchErr?.message || "fetch_failed" };
    }
    if (!res.ok) {
      console.warn(`[BEM Ingest] Server returned status ${res.status}`);
      return { ok: false, status: res.status };
    }
    const lastAccepted = founderOnly[founderOnly.length - 1];
    if (lastAccepted?.created_at && lastAccepted?.id) {
      await env.RADAR_DB.prepare(`
        INSERT INTO radar_bem_sync_state (scope, last_synced_at, last_synced_id, updated_at)
        VALUES ('founder', ?, ?, ?)
        ON CONFLICT(scope) DO UPDATE SET
          last_synced_at = excluded.last_synced_at,
          last_synced_id = excluded.last_synced_id,
          updated_at = excluded.updated_at
      `).bind(String(lastAccepted.created_at), String(lastAccepted.id), (/* @__PURE__ */ new Date()).toISOString()).run();
    }
    let withoutWebCount = 0;
    let withPhoneCount = 0;
    for (const item of items) {
      if (!item.has_website) withoutWebCount++;
      if (item.has_phone) withPhoneCount++;
    }
    const digestText = [
      "BEM feed diario (Founder)",
      `Prospectos enviados: ${items.length}`,
      `Sin web: ${withoutWebCount} | Con tel\xE9fono: ${withPhoneCount}`,
      `OK ingest`
    ].join("\n");
    await notifyOnce(env, `bem_daily_digest_${day}`, digestText);
    return { ok: true, accepted: items.length, status: res.status };
  } catch (err) {
    console.warn("[BEM Ingest] Failed to process market observations:", err);
    return { ok: false, reason: err?.message || String(err) };
  }
}
__name(pushMarketObservationsToBem, "pushMarketObservationsToBem");
async function sendTenantObservationsToBvelt(env, tenantId, options) {
  if (!tenantId || !tenantId.startsWith("bvelt_") || tenantId === "bvelt_founder") {
    return { skipped: true, reason: "invalid_bvelt_tenant_scope", tenant_id: tenantId };
  }
  const ingestUrl = env.BVELT_TENANT_INGEST_URL;
  const ingestKey = env.BVELT_TENANT_INGEST_KEY;
  if (!ingestUrl || !ingestKey) {
    return { skipped: true, reason: "missing_dedicated_tenant_ingest_config", tenant_id: tenantId };
  }
  const limit = Math.min(500, Math.max(1, options?.limit || 100));
  const sinceClause = options?.since ? "AND created_at >= ?" : "";
  const prospectIds = Array.isArray(options?.prospectIds) ? options.prospectIds.map((id) => String(id).trim()).filter(Boolean).slice(0, 100) : [];
  const idsClause = prospectIds.length ? `AND id IN (${prospectIds.map(() => "?").join(",")})` : "";
  const params = [tenantId];
  if (options?.since) params.push(options.since);
  params.push(...prospectIds);
  params.push(limit);
  const rows = await env.RADAR_DB.prepare(`
    SELECT id, tenant_id, name, city, trade, website, phone, email, score, status, tenant_outcome, bvelt_angle, created_at, updated_at
    FROM prospects
    WHERE tenant_id = ?
      AND mode = 'tenant'
      ${sinceClause}
      ${idsClause}
    ORDER BY created_at DESC
    LIMIT ?
  `).bind(...params).all();
  const results = rows?.results || [];
  if (results.length === 0) {
    return { ok: true, sent_count: 0, tenant_id: tenantId };
  }
  const items = results.map((r) => ({
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
    created_at: r.created_at,
    updated_at: r.updated_at
  }));
  const payload = {
    source: "bvelt-radar",
    mode: "tenant",
    tenant_id: tenantId,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    count: items.length,
    items: items.map((item) => ({ ...item, mode: "tenant", tenant_id: tenantId }))
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
      signal: AbortSignal.timeout(12e3)
    });
    if (!res.ok) {
      return { ok: false, reason: `http_${res.status}`, tenant_id: tenantId };
    }
    try {
      const observedAt = String(payload.timestamp);
      const historyStatements = await Promise.all(items.map(async (item) => {
        const snapshot = {
          prospect_id: item.prospect_id,
          name: item.name,
          city: item.city,
          trade: item.trade,
          website: item.website,
          score: item.score,
          status: item.status,
          outcome: item.outcome,
          angle: item.angle,
          created_at: item.created_at
        };
        const canonical = JSON.stringify(snapshot);
        const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
        const snapshotHash = Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, "0")).join("");
        return env.RADAR_DB.prepare(`
          INSERT OR IGNORE INTO tenant_observation_events
            (event_id, tenant_id, prospect_id, event_type, snapshot_hash, snapshot_json, observed_at)
          VALUES (?, ?, ?, 'snapshot_observed', ?, ?, ?)
        `).bind(
          crypto.randomUUID(),
          tenantId,
          item.prospect_id,
          snapshotHash,
          canonical,
          observedAt
        );
      }));
      let historyCount = 0;
      for (let offset = 0; offset < historyStatements.length; offset += 50) {
        const batchResult = await env.RADAR_DB.batch(historyStatements.slice(offset, offset + 50));
        historyCount += (batchResult || []).reduce((sum, result) => sum + Number(result?.meta?.changes || 0), 0);
      }
      return { ok: true, sent_count: items.length, history_count: historyCount, tenant_id: tenantId };
    } catch (historyError) {
      console.warn("[Tenant Observation History] Append failed:", historyError);
      return { ok: true, sent_count: items.length, history_count: 0, history_error: true, tenant_id: tenantId };
    }
  } catch (err) {
    return { ok: false, reason: err?.message || String(err), tenant_id: tenantId };
  }
}
__name(sendTenantObservationsToBvelt, "sendTenantObservationsToBvelt");
async function notifyFounder(env, text, inlineButtons) {
  const rawBotToken = env.TELEGRAM_BOT_TOKEN ? String(env.TELEGRAM_BOT_TOKEN).trim() : "";
  const botToken = rawBotToken.replace(/^["']|["']$/g, "").replace(/^bot/i, "");
  const chatId = env.TELEGRAM_CHAT_ID ? String(env.TELEGRAM_CHAT_ID).trim().replace(/^["']|["']$/g, "") : "";
  if (!botToken || !chatId) {
    const desc = "TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is not configured in environment";
    console.warn(`[notifyFounder] ${desc}`);
    return { ok: false, description: desc };
  }
  const payload = {
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
      signal: AbortSignal.timeout(2e4)
    });
    const data = await res.json().catch(() => ({ ok: false, description: `HTTP ${res.status}: Failed to parse JSON` }));
    if (!res.ok || !data.ok) {
      console.error(`[notifyFounder] Telegram API error (${res.status}):`, data);
      if (env.RADAR_DB) {
        try {
          const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
          const latestRun = await env.RADAR_DB.prepare(
            "SELECT id, errors_json FROM runs WHERE day = ? ORDER BY created_at DESC LIMIT 1"
          ).bind(today).first() || await env.RADAR_DB.prepare(
            "SELECT id, errors_json FROM runs ORDER BY created_at DESC LIMIT 1"
          ).first();
          if (latestRun) {
            let errList = [];
            try {
              errList = JSON.parse(latestRun.errors_json || "[]");
            } catch (e) {
            }
            errList.push({
              source: "telegram_outbound",
              status: res.status,
              description: data.description || "Telegram API rejected sendMessage",
              chat_id: String(chatId).trim(),
              timestamp: (/* @__PURE__ */ new Date()).toISOString()
            });
            await env.RADAR_DB.prepare("UPDATE runs SET errors_json = ? WHERE id = ?").bind(JSON.stringify(errList), latestRun.id).run();
          }
        } catch (dbErr) {
          console.error("[notifyFounder] Failed to log error to D1 runs:", dbErr);
        }
      }
      return { ok: false, description: data.description || `HTTP ${res.status}` };
    }
    return { ok: true, description: "Sent successfully", result: data.result };
  } catch (err) {
    console.error("[notifyFounder] Network/Exception error:", err.message);
    if (env.RADAR_DB) {
      try {
        const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
        const latestRun = await env.RADAR_DB.prepare(
          "SELECT id, errors_json FROM runs WHERE day = ? ORDER BY created_at DESC LIMIT 1"
        ).bind(today).first();
        if (latestRun) {
          let errList = [];
          try {
            errList = JSON.parse(latestRun.errors_json || "[]");
          } catch (e) {
          }
          errList.push({
            source: "telegram_outbound_exception",
            error: err.message,
            timestamp: (/* @__PURE__ */ new Date()).toISOString()
          });
          await env.RADAR_DB.prepare("UPDATE runs SET errors_json = ? WHERE id = ?").bind(JSON.stringify(errList), latestRun.id).run();
        }
      } catch (e) {
      }
    }
    return { ok: false, description: err.message };
  }
}
__name(notifyFounder, "notifyFounder");
function formatProspectTelegramMessage(prospect, env) {
  const scoreEmoji = (prospect.score || 0) >= 80 ? "\u{1F525}" : (prospect.score || 0) >= 60 ? "\u26A1" : "\u{1F50D}";
  const draftBody = prospect.draft_body || "";
  const draftPreview = draftBody.substring(0, 300);
  const angle = prospect.bvelt_angle ? prospect.bvelt_angle.replace(/_/g, " ") : "Missed lead & call recovery";
  let warning = "";
  if (env && !env.SENDER_POSTAL_ADDRESS) {
    warning += `\u26A0 <b>Falta direcci\xF3n postal: no enviar</b>

`;
  }
  let emailVerified = false;
  try {
    emailVerified = JSON.parse(prospect.signals_json || "{}").is_email_validated === true;
  } catch {
  }
  if (prospect.email && !emailVerified) {
    warning += `\u26A0 <b>Email sin verificaci\xF3n positiva: env\xEDo bloqueado</b>

`;
  }
  let msg = `<b>\u{1F4E1} Bvelt Radar: Prospecto Calificado</b> ${scoreEmoji}

`;
  if (warning) {
    msg = warning + msg;
  }
  msg += `\u{1F3E2} <b>${escapeHtml2(prospect.name)}</b>
`;
  msg += `\u{1F4CD} <b>Ciudad:</b> ${escapeHtml2(prospect.city)}
`;
  msg += `\u{1F6E0} <b>Rubro:</b> ${escapeHtml2(prospect.trade)}
`;
  msg += `\u{1F4CA} <b>Score:</b> <b>${prospect.score}/100</b>
`;
  msg += `\u{1F4E7} <b>Email:</b> <code>${escapeHtml2(prospect.email || "No email")}</code>
`;
  if (prospect.phone) {
    msg += `\u{1F4DE} <b>Tel:</b> <code>${escapeHtml2(prospect.phone)}</code>
`;
  }
  if (prospect.website) {
    msg += `\u{1F310} <b>Web:</b> <a href="${escapeHtml2(prospect.website)}">${escapeHtml2(prospect.website)}</a>
`;
  }
  msg += `\u{1F4A1} <b>\xC1ngulo:</b> ${escapeHtml2(angle)}
`;
  msg += `\u{1F517} <b>Plataforma:</b> <a href="https://bvelt.app">https://bvelt.app</a>

`;
  if (draftPreview) {
    msg += `\u{1F4DD} <b>Borrador (${escapeHtml2(prospect.draft_subject || "Propuesta")}):</b>
<pre>${escapeHtml2(draftPreview)}${draftBody.length > 300 ? "..." : ""}</pre>`;
  }
  return msg;
}
__name(formatProspectTelegramMessage, "formatProspectTelegramMessage");
async function dispatchInteractiveTelegramAlert(topProspects, cities, trades, env) {
  for (const p of topProspects) {
    if (p.score < 45 || !p.email || isHardRejectedChain(p.name)) continue;
    const text = formatProspectTelegramMessage(p, env);
    const inlineButtons = [
      [
        { text: "\u2705 Approve", callback_data: `approve:${p.id}` },
        { text: "\u274C Discard", callback_data: `discard:${p.id}` }
      ]
    ];
    await notifyFounder(env, text, inlineButtons);
  }
}
__name(dispatchInteractiveTelegramAlert, "dispatchInteractiveTelegramAlert");
async function scrapeWebsiteContact(url) {
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
  let finalEmail = null;
  let finalPhone = null;
  let hasLiveChat = false;
  let hasSmsLanguage = false;
  const targetHost = getDomain(url);
  if (!targetHost) return { email: null, phone: null, signals };
  const rootUrl = url.startsWith("http") ? url : `https://${url}`;
  const crawlQueue = [
    { url: rootUrl, pageType: "homepage", priority: 1 }
  ];
  const visitedUrls = /* @__PURE__ */ new Set();
  let pagesFetched = 0;
  while (crawlQueue.length > 0 && pagesFetched < 3) {
    crawlQueue.sort((a, b) => a.priority - b.priority);
    const nextItem = crawlQueue.shift();
    const normalizedTarget = nextItem.url.toLowerCase().replace(/\/$/, "");
    if (visitedUrls.has(normalizedTarget)) continue;
    visitedUrls.add(normalizedTarget);
    try {
      const res = await fetch(nextItem.url, {
        headers: { "User-Agent": "BveltRadar/1.0 (contact: radar@bvelt.app)" },
        signal: AbortSignal.timeout(4500)
        // 4.5s — slow contractor sites otherwise yield 0 emails
      });
      if (!res.ok) continue;
      pagesFetched++;
      const html = (await res.text()).slice(0, 5e4);
      const normalizedHtml = html.toLowerCase();
      if (!finalEmail) {
        const mailtoMatch = html.match(/href="mailto:([^"?#]+)"/i);
        const mailtoCandidate = mailtoMatch ? sanitizeProspectEmail(mailtoMatch[1]) : null;
        if (mailtoCandidate) {
          finalEmail = mailtoCandidate;
        }
        if (!finalEmail) {
          const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;
          const matches = html.match(emailRegex);
          if (matches && matches.length > 0) {
            const validCandidates = matches.map((m) => sanitizeProspectEmail(m)).filter((m) => Boolean(m));
            if (validCandidates.length > 0) {
              const business = validCandidates.filter((e) => /^(info|office|contact|hello|service|admin|support|sales)/i.test(e));
              finalEmail = business.length > 0 ? business[0] : validCandidates[0];
            }
          }
        }
      }
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
      if (finalEmail && finalPhone && signals.booking && signals.quote_request) {
        break;
      }
    } catch (e) {
    }
  }
  signals.sms_gap = (signals.call_cta || !!finalPhone) && !hasSmsLanguage && !hasLiveChat;
  return { email: finalEmail, phone: finalPhone, signals };
}
__name(scrapeWebsiteContact, "scrapeWebsiteContact");
async function fetchHunterEmail(domain, apiKey) {
  const url = `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&api_key=${apiKey}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(6e3) });
  if (!res.ok) return null;
  const body = await res.json();
  const emails = body.data?.emails || [];
  if (!emails.length) return null;
  const scored = emails.map((e) => {
    const value = String(e.value || "").toLowerCase();
    const conf = typeof e.confidence === "number" ? e.confidence : 0;
    const local = value.split("@")[0] || "";
    const isContact = /^(contact|admin|office|mail|webmaster)$/i.test(local);
    const isInfo = /^(info|hello|hi|support|sales)$/i.test(local);
    const isPersonal = e.type === "personal" || local.includes(".") && !isContact;
    let rank = conf;
    if (isPersonal) rank += 15;
    if (isInfo) rank += 5;
    if (isContact) rank -= 25;
    return { value: e.value, conf, rank };
  }).filter((e) => e.conf >= 40 || e.rank >= 50).sort((a, b) => b.rank - a.rank);
  if (!scored.length) return null;
  const pick = scored.find((e) => e.conf >= 50) || scored[0];
  if (pick.conf < 40) return null;
  return pick.value;
}
__name(fetchHunterEmail, "fetchHunterEmail");
function isVerifiedDeliverableEmail(deliverability, qualityScore, isDisposable, isCatchall) {
  return String(deliverability || "").toUpperCase() === "DELIVERABLE" && Number.isFinite(Number(qualityScore)) && Number(qualityScore) >= 0.7 && !isDisposable && !isCatchall;
}
__name(isVerifiedDeliverableEmail, "isVerifiedDeliverableEmail");
async function verifyEmail(email, env) {
  const normEmail = (email || "").toLowerCase().trim();
  const timestamp = (/* @__PURE__ */ new Date()).toISOString();
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
  try {
    const cached = await env.RADAR_DB.prepare("SELECT * FROM email_verifications WHERE email = ?").bind(normEmail).first();
    if (cached) {
      const deliverability = String(cached.deliverability || "UNKNOWN").toUpperCase();
      const verifiedAt = Date.parse(String(cached.verified_at || ""));
      const ageMs = Date.now() - verifiedAt;
      const cacheTtl = deliverability === "DELIVERABLE" || deliverability === "UNDELIVERABLE" ? 30 * 864e5 : 6 * 36e5;
      if (deliverability !== "UNVERIFIED_PASSED" && Number.isFinite(verifiedAt) && ageMs >= 0 && ageMs < cacheTtl) {
        const isDisposable = cached.is_disposable === 1;
        const isCatchall = cached.is_catchall === 1;
        const qualityScore = Number(cached.quality_score || 0);
        const valid = isVerifiedDeliverableEmail(deliverability, qualityScore, isDisposable, isCatchall);
        return {
          valid,
          deliverability,
          is_disposable: isDisposable,
          is_catchall: isCatchall,
          quality_score: qualityScore,
          reason: valid ? "Recently verified deliverable by Abstract API" : cached.reason || "Email is not positively verified as deliverable"
        };
      }
    }
  } catch (e) {
  }
  let providerFailure = env.ABSTRACT_API_KEY ? "Abstract API verification unavailable" : "ABSTRACT_API_KEY missing";
  if (env.ABSTRACT_API_KEY) {
    try {
      const url = `https://emailvalidation.abstractapi.com/v1/?api_key=${env.ABSTRACT_API_KEY}&email=${encodeURIComponent(normEmail)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5e3) });
      if (res.ok) {
        const data = await res.json();
        const deliverability = String(data.deliverability || "UNKNOWN").toUpperCase();
        const isDisposable = data.is_disposable_email?.value === true;
        const isCatchall = data.is_catchall_email?.value === true;
        const qualityScore = Number(data.quality_score);
        const isValid = isVerifiedDeliverableEmail(deliverability, qualityScore, isDisposable, isCatchall);
        const reason = isValid ? "Abstract API confirmed deliverable" : deliverability === "UNDELIVERABLE" ? "Abstract API marked as UNDELIVERABLE" : isDisposable ? "Abstract API marked as DISPOSABLE" : isCatchall ? "Catch-all mailbox excluded from cold outreach" : deliverability !== "DELIVERABLE" ? `Abstract API did not confirm DELIVERABLE status (${deliverability})` : `Abstract API quality score below 0.70 (${Number.isFinite(qualityScore) ? qualityScore : "unknown"})`;
        const result = {
          valid: isValid,
          deliverability,
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
        } catch (e) {
        }
        return result;
      }
      providerFailure = `Abstract API HTTP ${res.status}`;
      console.warn(`[Abstract API Verification Warning] ${providerFailure}`);
    } catch (e) {
      providerFailure = "Abstract API request failed";
      console.warn("[Abstract API Verification Warning]", e?.message || e);
    }
  }
  return {
    valid: false,
    deliverability: "UNVERIFIED",
    is_disposable: false,
    is_catchall: false,
    quality_score: 0,
    reason: `${providerFailure}; outbound send held to protect sender reputation`
  };
}
__name(verifyEmail, "verifyEmail");
async function checkSenderGovernor(env) {
  const db = env.RADAR_DB;
  const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  const timestamp = (/* @__PURE__ */ new Date()).toISOString();
  let state = null;
  try {
    state = await db.prepare("SELECT * FROM sender_governor_state WHERE id = 'global_governor'").first();
  } catch (e) {
  }
  if (!state) {
    state = {
      id: "global_governor",
      daily_limit: 5,
      sends_today: 0,
      bounces_today: 0,
      complaints_today: 0,
      unsubscribes_today: 0,
      last_reset_day: today,
      status: "active",
      reason: "Initialized conservative policy"
    };
    try {
      await db.prepare(`
        INSERT INTO sender_governor_state (id, daily_limit, sends_today, bounces_today, complaints_today, unsubscribes_today, last_reset_day, status, reason, updated_at)
        VALUES ('global_governor', 5, 0, 0, 0, 0, ?, 'active', 'Initial conservative policy', ?)
      `).bind(today, timestamp).run();
    } catch (e) {
    }
  }
  if (state.last_reset_day !== today) {
    let newLimit = state.daily_limit || 5;
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
    state.status = "active";
    try {
      await db.prepare(`
        UPDATE sender_governor_state
        SET daily_limit = ?, sends_today = 0, bounces_today = 0, complaints_today = 0, unsubscribes_today = 0, last_reset_day = ?, status = 'active', updated_at = ?
        WHERE id = 'global_governor'
      `).bind(newLimit, today, timestamp).run();
    } catch (e) {
    }
  }
  if (state.status === "paused" || state.status === "throttled") {
    return {
      allowed: false,
      daily_limit: state.daily_limit,
      sends_today: state.sends_today,
      reason: `SENDER_GOVERNOR_PAUSED: ${state.reason || "Volume paused due to risk signals"}`
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
__name(checkSenderGovernor, "checkSenderGovernor");
async function incrementSenderSends(db) {
  const timestamp = (/* @__PURE__ */ new Date()).toISOString();
  try {
    await db.prepare(`
      UPDATE sender_governor_state
      SET sends_today = sends_today + 1, updated_at = ?
      WHERE id = 'global_governor'
    `).bind(timestamp).run();
  } catch (e) {
  }
}
__name(incrementSenderSends, "incrementSenderSends");
async function recordNegativeSignal(db, signalType, reason) {
  const timestamp = (/* @__PURE__ */ new Date()).toISOString();
  try {
    if (signalType === "bounce") {
      await db.prepare("UPDATE sender_governor_state SET bounces_today = bounces_today + 1, updated_at = ? WHERE id = 'global_governor'").bind(timestamp).run();
    } else if (signalType === "complaint") {
      await db.prepare("UPDATE sender_governor_state SET complaints_today = complaints_today + 1, status = 'throttled', reason = ?, updated_at = ? WHERE id = 'global_governor'").bind(`Complaint signal: ${reason}`, timestamp).run();
    } else if (signalType === "unsubscribe") {
      await db.prepare("UPDATE sender_governor_state SET unsubscribes_today = unsubscribes_today + 1, updated_at = ? WHERE id = 'global_governor'").bind(timestamp).run();
    }
  } catch (e) {
  }
}
__name(recordNegativeSignal, "recordNegativeSignal");
async function sendOrQueueOutreach(prospect, runId, env) {
  if (isOffIcpName(prospect.name, prospect.mode === "tenant")) {
    await env.RADAR_DB.prepare("UPDATE prospects SET status = 'disqualified', outcome = 'off_icp_name', updated_at = ? WHERE id = ?").bind((/* @__PURE__ */ new Date()).toISOString(), prospect.id).run();
    return { success: false, reason: "OFF_ICP_NAME" };
  }
  const outreachCoherence = checkTradeCoherence(prospect.name, prospect.trade, prospect.website, prospect.signals_json, prospect.mode);
  if (!outreachCoherence.coherent && outreachCoherence.disqualified) {
    await env.RADAR_DB.prepare("UPDATE prospects SET status = 'disqualified', outcome = 'off_icp_name', updated_at = ? WHERE id = ?").bind((/* @__PURE__ */ new Date()).toISOString(), prospect.id).run();
    return { success: false, reason: `TRADE_MISMATCH: ${outreachCoherence.reason}` };
  }
  if (outreachCoherence.verifiedTrade && outreachCoherence.verifiedTrade !== prospect.trade) {
    await env.RADAR_DB.prepare("UPDATE prospects SET trade = ?, updated_at = ? WHERE id = ?").bind(outreachCoherence.verifiedTrade, (/* @__PURE__ */ new Date()).toISOString(), prospect.id).run();
    prospect.trade = outreachCoherence.verifiedTrade;
  }
  if (env.RADAR_GLOBAL_PAUSE === "true" || env.RADAR_GLOBAL_PAUSE === "1") {
    await env.RADAR_DB.prepare("UPDATE prospects SET status = 'held', outcome = 'RADAR_GLOBAL_PAUSED', updated_at = ? WHERE id = ?").bind((/* @__PURE__ */ new Date()).toISOString(), prospect.id).run();
    return { success: false, reason: "RADAR_GLOBAL_PAUSED" };
  }
  if (env.RADAR_OUTREACH_PAUSE === "true" || env.RADAR_OUTREACH_PAUSE === "1") {
    await env.RADAR_DB.prepare("UPDATE prospects SET status = 'held', outcome = 'RADAR_OUTREACH_PAUSED', updated_at = ? WHERE id = ?").bind((/* @__PURE__ */ new Date()).toISOString(), prospect.id).run();
    return { success: false, reason: "RADAR_OUTREACH_PAUSED" };
  }
  const cb = await getCircuitBreakerStatus(env.RADAR_DB);
  if (cb.active) {
    await env.RADAR_DB.prepare("UPDATE prospects SET status = 'held', outcome = 'circuit_breaker_active', updated_at = ? WHERE id = ?").bind((/* @__PURE__ */ new Date()).toISOString(), prospect.id).run();
    await notifyOnce(
      env,
      "circuit_breaker_active",
      `\u26A0\uFE0F <b>Outreach en HOLD:</b> Circuit Breaker activo (${cb.reason || "error de proveedor"}). Env\xEDos pausados.`
    );
    return { success: false, reason: `circuit_breaker_active: ${cb.reason}` };
  }
  if (!env.SENDER_POSTAL_ADDRESS || !env.SENDER_POSTAL_ADDRESS.trim()) {
    console.warn(`[Compliance Gate] Prospect ${prospect.id} blocked: missing_sender_postal_address`);
    await env.RADAR_DB.prepare("UPDATE prospects SET status = 'held', outcome = 'missing_sender_postal_address', updated_at = ? WHERE id = ?").bind((/* @__PURE__ */ new Date()).toISOString(), prospect.id).run();
    await notifyOnce(
      env,
      "missing_sender_postal_address",
      "\u26A0\uFE0F <b>Outreach en HOLD:</b> Falta <code>SENDER_POSTAL_ADDRESS</code> en las variables de Cloudflare. Se requiere direcci\xF3n postal f\xEDsica para env\xEDos conformes a CAN-SPAM."
    );
    return { success: false, reason: "missing_sender_postal_address" };
  }
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
    await env.RADAR_DB.prepare("UPDATE prospects SET status = 'suppressed', outcome = ?, updated_at = ? WHERE id = ?").bind(`SUPPRESSED: ${suppression.reason}`, (/* @__PURE__ */ new Date()).toISOString(), prospect.id).run();
    return { success: false, reason: `SUPPRESSED: ${suppression.reason}` };
  }
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
    await env.RADAR_DB.prepare("UPDATE prospects SET status = 'held', outcome = 'cooldown_active', updated_at = ? WHERE id = ?").bind((/* @__PURE__ */ new Date()).toISOString(), prospect.id).run();
    return { success: false, reason: `COOLDOWN_ACTIVE until ${overlap.overlap.cooldown_until}` };
  }
  if (!prospect.email || !prospect.email.trim()) {
    const hasPhone = prospect.phone && String(prospect.phone).replace(/\D/g, "").length >= 7;
    if (hasPhone) {
      await env.RADAR_DB.prepare("UPDATE prospects SET status = 'qualified', outcome = 'phone_only_no_email', updated_at = ? WHERE id = ?").bind((/* @__PURE__ */ new Date()).toISOString(), prospect.id).run();
      return { success: false, reason: "PHONE_ONLY_NO_EMAIL" };
    }
    await env.RADAR_DB.prepare("UPDATE prospects SET status = 'disqualified', outcome = 'missing_email', updated_at = ? WHERE id = ?").bind((/* @__PURE__ */ new Date()).toISOString(), prospect.id).run();
    return { success: false, reason: "MISSING_EMAIL" };
  }
  const emailVer = await verifyEmail(prospect.email, env);
  if (!emailVer.valid) {
    const temporary = ["UNKNOWN", "UNVERIFIED", "UNVERIFIED_PASSED"].includes(String(emailVer.deliverability || "").toUpperCase());
    const nextStatus = temporary ? "hold" : "disqualified";
    const nextOutcome = temporary ? "email_verification_pending" : "email_verification_failed";
    await env.RADAR_DB.prepare("UPDATE prospects SET status = ?, outcome = ?, updated_at = ? WHERE id = ?").bind(nextStatus, nextOutcome, (/* @__PURE__ */ new Date()).toISOString(), prospect.id).run();
    return { success: false, reason: `EMAIL_VERIFICATION_FAILED: ${emailVer.reason}` };
  }
  if (prospect.score !== void 0 && prospect.score < 30) {
    return { success: false, reason: `SCORE_TOO_LOW: Score ${prospect.score} below threshold 30` };
  }
  const trustGate = await verifyTrustStackGate(prospect, runId, env);
  if (!trustGate.allowed) {
    return { success: false, reason: `TRUST_STACK_BLOCKED: ${trustGate.reason}` };
  }
  const governor = await checkSenderGovernor(env);
  if (!governor.allowed) {
    await env.RADAR_DB.prepare("UPDATE prospects SET status = 'held', outcome = 'sender_governor_limit', updated_at = ? WHERE id = ?").bind((/* @__PURE__ */ new Date()).toISOString(), prospect.id).run();
    await notifyOnce(
      env,
      "sender_governor_blocked",
      `\u26A0\uFE0F <b>Outreach en HOLD:</b> Sender Governor l\xEDmite diario alcanzado (${governor.reason}).`
    );
    return { success: false, reason: `SENDER_GOVERNOR_BLOCKED: ${governor.reason}` };
  }
  const tenantId = prospect.tenant_id || "founder";
  const founderEligibility = await getFounderOutreachEligibility(env.RADAR_DB, prospect);
  if (!founderEligibility.allowed) {
    return { success: false, reason: "FOUNDER_OUTREACH_GUARD: " + founderEligibility.reason };
  }
  const nextTouch = founderEligibility.nextTouch;
  const outreachReserved = await reserveBudget(env.RADAR_DB, tenantId, "outreach_units", 1);
  if (!outreachReserved) {
    await env.RADAR_DB.prepare("UPDATE prospects SET status = 'held', outcome = 'outreach_budget_limit_exceeded', updated_at = ? WHERE id = ?").bind((/* @__PURE__ */ new Date()).toISOString(), prospect.id).run();
    await notifyOnce(
      env,
      "outreach_budget_exhausted",
      `\u26A0\uFE0F <b>Outreach en HOLD:</b> Presupuesto diario de outreach agotado para tenant '${tenantId}'.`
    );
    return { success: false, reason: "outreach_budget_limit_exceeded" };
  }
  const hasResend = !!(env.RESEND_API_KEY && env.RESEND_API_KEY.trim());
  const hasBrevo = !!(env.BREVO_API_KEY && env.BREVO_API_KEY.trim());
  const hasHunter = !!(env.HUNTER_API_KEY && env.HUNTER_SEQUENCE_ID);
  if (!hasResend && !hasBrevo && !hasHunter) {
    await releaseBudget(env.RADAR_DB, tenantId, "outreach_units", 1);
    const missingOutcome = "missing_email_provider_keys";
    await env.RADAR_DB.prepare("UPDATE prospects SET status = 'provider_required', outcome = ?, updated_at = ? WHERE id = ?").bind(missingOutcome, (/* @__PURE__ */ new Date()).toISOString(), prospect.id).run();
    await notifyOnce(
      env,
      "missing_email_provider",
      "\u26A0\uFE0F <b>Outreach en HOLD:</b> No hay claves de proveedor configuradas (falta RESEND_API_KEY o BREVO_API_KEY)."
    );
    return { success: false, reason: `provider_required: ${missingOutcome}` };
  }
  const sequenceId = hasHunter ? env.HUNTER_SEQUENCE_ID.trim() : hasResend ? "resend_live" : "brevo_live";
  const idempotencyKey = buildOutreachIdempotencyKey(tenantId, prospect.id, sequenceId, nextTouch);
  try {
    const existingRecord = await env.RADAR_DB.prepare(
      "SELECT * FROM outreach_idempotency WHERE idempotency_key = ?"
    ).bind(idempotencyKey).first();
    if (existingRecord) {
      if (["scheduled", "queued", "sent"].includes(existingRecord.status)) {
        console.log(`[Idempotency] Prospect ${prospect.id} already processed for sequence ${sequenceId}. Skipping resend.`);
        await releaseBudget(env.RADAR_DB, tenantId, "outreach_units", 1);
        return { success: true, reason: "Already accepted by provider (idempotent skip)" };
      }
      if (existingRecord.status === "provider_unknown") {
        console.warn(`[Idempotency] Prospect ${prospect.id} in provider_unknown state. Reconciling before resend.`);
        await releaseBudget(env.RADAR_DB, tenantId, "outreach_units", 1);
        await env.RADAR_DB.prepare("UPDATE prospects SET status = 'provider_unknown', outcome = 'reconciliation_required', updated_at = ? WHERE id = ?").bind((/* @__PURE__ */ new Date()).toISOString(), prospect.id).run();
        return { success: false, reason: "provider_unknown: Reconciliation required before resend" };
      }
    }
  } catch (e) {
  }
  const timestamp = (/* @__PURE__ */ new Date()).toISOString();
  try {
    await env.RADAR_DB.prepare(`
      INSERT OR REPLACE INTO outreach_idempotency (idempotency_key, prospect_id, tenant_id, email, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'reserved', ?, ?)
    `).bind(idempotencyKey, prospect.id, tenantId, prospect.email.toLowerCase().trim(), timestamp, timestamp).run();
  } catch (e) {
  }
  if (hasResend || hasBrevo) {
    const dispatch = await dispatchEmail({
      to: prospect.email,
      recipientName: prospect.name,
      subject: prospect.draft_subject,
      body: prospect.draft_body,
      from: env.OUTBOUND_EMAIL_FROM,
      prospectId: prospect.id,
      touchCount: nextTouch,
      resendApiKey: env.RESEND_API_KEY,
      brevoApiKey: env.BREVO_API_KEY,
      senderName: env.SENDER_NAME
    });
    if (dispatch.success && dispatch.status === "dispatched") {
      await incrementSenderSends(env.RADAR_DB);
      await commitBudget(env.RADAR_DB, tenantId, "outreach_units", 1);
      try {
        const todayStr = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
        await env.RADAR_DB.prepare("UPDATE daily_missions SET outreach_count = outreach_count + 1 WHERE tenant_id = ? AND day = ?").bind(prospect.tenant_id || "founder", todayStr).run();
      } catch (e) {
      }
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
      await releaseBudget(env.RADAR_DB, tenantId, "outreach_units", 1);
      await env.RADAR_DB.prepare("UPDATE prospects SET status = 'hold', outcome = ?, updated_at = ? WHERE id = ?").bind(dispatch.error || "dispatch_failed", timestamp, prospect.id).run();
      return { success: false, reason: dispatch.error || "dispatch_failed" };
    }
  }
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
      signal: AbortSignal.timeout(6e3)
    });
    const responseText = await hunterRes.text();
    let jsonBody = {};
    try {
      jsonBody = JSON.parse(responseText);
    } catch (e) {
    }
    if (hunterRes.ok || hunterRes.status === 201 || hunterRes.status === 200) {
      const recipientData = jsonBody.data || {};
      const recipientId = recipientData.id ? String(recipientData.id) : `rec_${crypto.randomUUID()}`;
      const recipientStatus = recipientData.status || "scheduled";
      if (recipientData.sequence_status === "draft") {
        await releaseBudget(env.RADAR_DB, tenantId, "outreach_units", 1);
        await env.RADAR_DB.prepare("UPDATE prospects SET status = 'provider_error', outcome = 'hunter_sequence_draft', updated_at = ? WHERE id = ?").bind(timestamp, prospect.id).run();
        return { success: false, reason: "Hunter sequence is in draft state" };
      }
      try {
        const startUrl = `https://api.hunter.io/v2/sequences/${encodeURIComponent(sequenceId)}/start?api_key=${env.HUNTER_API_KEY}`;
        const startRes = await fetch(startUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(5e3)
        });
        if (!startRes.ok) {
          console.warn(`[Hunter API] Start sequence endpoint returned HTTP ${startRes.status}`);
        }
      } catch (startErr) {
        console.warn(`[Hunter API] Failed to call start sequence endpoint: ${startErr.message}`);
      }
      await incrementSenderSends(env.RADAR_DB);
      await commitBudget(env.RADAR_DB, tenantId, "outreach_units", 1);
      try {
        const todayStr = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
        await env.RADAR_DB.prepare("UPDATE daily_missions SET outreach_count = outreach_count + 1 WHERE tenant_id = ? AND day = ?").bind(prospect.tenant_id || "founder", todayStr).run();
      } catch (e) {
      }
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
      await releaseBudget(env.RADAR_DB, tenantId, "outreach_units", 1);
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
      await releaseBudget(env.RADAR_DB, tenantId, "outreach_units", 1);
      await recordNegativeSignal(env.RADAR_DB, "error", `Hunter API HTTP ${hunterRes.status}`);
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
  } catch (err) {
    console.error("[sendOrQueueOutreach] Hunter API Exception:", err.message);
    await releaseBudget(env.RADAR_DB, tenantId, "outreach_units", 1);
    await recordNegativeSignal(env.RADAR_DB, "error", err.message);
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
__name(sendOrQueueOutreach, "sendOrQueueOutreach");
function generateIdentityKey(email, website, phone, name, city) {
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
__name(generateIdentityKey, "generateIdentityKey");
async function checkSuppressedComposite(db, email, website, phone, name, city, tenantId = "founder") {
  if (tenantId !== "founder") {
    return null;
  }
  const keys = [];
  if (email) keys.push(email.toLowerCase().trim());
  if (website) {
    const dom = getDomain(website);
    if (dom) keys.push(dom.toLowerCase().trim());
  }
  if (phone) keys.push(phone.replace(/[^0-9]/g, ""));
  keys.push(`${name.toLowerCase().trim()}_${city.toLowerCase().trim()}`.replace(/\s+/g, "_"));
  const now = Date.now();
  const SOFT_MS = 25 * 24 * 60 * 60 * 1e3;
  for (const k of keys) {
    try {
      const match = await db.prepare("SELECT * FROM suppression WHERE key = ?").bind(k).first();
      if (!match) continue;
      const reason = String(match.reason || "");
      const reasonL = reason.toLowerCase();
      const isHard = reasonL.includes("bounce") || reasonL.includes("complaint") || reasonL.includes("unsubscribe") || reasonL.includes("spam") || reasonL.includes("invalid");
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
          } catch (_) {
          }
          continue;
        }
      }
      return { suppressed: true, reason: match.reason };
    } catch (e) {
    }
  }
  return null;
}
__name(checkSuppressedComposite, "checkSuppressedComposite");
async function findExistingProspectOverlap(db, email, website, phone, name, city, tenantId = "founder") {
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
  }
  return null;
}
__name(findExistingProspectOverlap, "findExistingProspectOverlap");
function isCooldownActive(cooldownUntil) {
  if (!cooldownUntil) return false;
  return new Date(cooldownUntil).getTime() > Date.now();
}
__name(isCooldownActive, "isCooldownActive");
async function recordLearningEvent(db, city, trade, variantId, isSent, details) {
  const mode = details?.mode === "tenant" ? "tenant" : "founder";
  const tenantId = mode === "tenant" ? String(details?.tenant_id || "") : "founder";
  if (!details?.prospect_id || mode === "tenant" && (!tenantId || tenantId === "founder")) {
    console.warn("[Learning Integrity] Skipped event without a valid prospect/scope.");
    return false;
  }
  const eventType = String(details?.event_type || (isSent ? "sent" : details?.outcome || "unknown")).toLowerCase();
  const occurredAt = (/* @__PURE__ */ new Date()).toISOString();
  try {
    const recorded = await recordScopedLearningEvent(db, {
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
      idempotencyKey: details?.idempotency_key || `${String(details.prospect_id)}:${eventType}`,
      metadata: {
        score: details?.score,
        response_type: details?.response_type,
        outcome: details?.outcome,
        source: "radar_worker"
      }
    });
    return recorded !== false;
  } catch (e) {
    console.warn("[Learning Integrity] Event persistence warning:", e);
    return false;
  }
}
__name(recordLearningEvent, "recordLearningEvent");
function thompsonSample(wins, total) {
  const a = Math.max(0.5, wins + 1);
  const b = Math.max(0.5, total - wins + 1);
  const sampleGamma = /* @__PURE__ */ __name((k) => {
    if (k < 1) {
      const u = Math.random();
      return sampleGamma(1 + k) * Math.pow(u, 1 / k);
    }
    const d = k - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);
    for (; ; ) {
      let x, v;
      do {
        x = normal01();
        v = 1 + c * x;
      } while (v <= 0);
      v = v * v * v;
      const u = Math.random();
      if (u < 1 - 0.0331 * (x * x) * (x * x)) return d * v;
      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
    }
  }, "sampleGamma");
  const g1 = sampleGamma(a);
  const g2 = sampleGamma(b);
  return g1 / (g1 + g2);
}
__name(thompsonSample, "thompsonSample");
function normal01() {
  const u = 1 - Math.random();
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
__name(normal01, "normal01");
function estimateTicketUsd(trade) {
  const t = (trade || "").toLowerCase();
  if (/hvac|roof|electr/.test(t)) return 2800;
  if (/plumb|water/.test(t)) return 2200;
  if (/pool/.test(t)) return 1600;
  if (/landscap|lawn|pest|clean|paint|floor/.test(t)) return 1200;
  if (/property|hotel|hoa|facility|real estate/.test(t)) return 3500;
  return 1500;
}
__name(estimateTicketUsd, "estimateTicketUsd");
async function getLearningStats(db, mode = "founder", tenantId = "founder") {
  const winRates = {};
  const scopedTenantId = mode === "founder" ? "founder" : tenantId;
  if (!db || typeof db.prepare !== "function" || mode === "tenant" && (!scopedTenantId || scopedTenantId === "founder")) return winRates;
  try {
    Object.assign(winRates, await readScopedLearningStats(db, mode, scopedTenantId));
    const live = await db.prepare(`
      SELECT city, trade,
        SUM(CASE WHEN outcome IN ('won','converted') OR tenant_outcome = 'won' THEN 1 ELSE 0 END) AS wins,
        SUM(CASE WHEN outcome IN ('sent','positive','booked','won','lost','converted')
                  OR status IN ('sent','delivered','replied','booked','converted','won','lost','contacted')
                  OR tenant_outcome IN ('contacted','replied','booked','won','lost') THEN 1 ELSE 0 END) AS sent
      FROM prospects
      WHERE mode = ?
        AND COALESCE(tenant_id, 'founder') = ?
        AND city IS NOT NULL AND trade IS NOT NULL
      GROUP BY city, trade
      HAVING sent >= 2
    `).bind(mode, scopedTenantId).all();
    for (const row of live?.results || []) {
      const sent = Math.max(1, Number(row.sent || 0));
      const wins = Math.min(sent, Number(row.wins || 0));
      const rate = (wins + 1) / (sent + 2);
      const cityKey = `city:${row.city}`;
      const tradeKey = `trade:${String(row.trade).toLowerCase()}`;
      const pairKey = `pair:${row.city}|${String(row.trade).toLowerCase()}`;
      if (winRates[cityKey] === void 0) winRates[cityKey] = rate;
      if (winRates[tradeKey] === void 0) winRates[tradeKey] = rate;
      if (winRates[pairKey] === void 0) winRates[pairKey] = rate;
    }
    const geo = await db.prepare(`
      SELECT place_key, trade, SUM(wins) AS wins, SUM(searches) AS searches
      FROM geo_coverage
      WHERE tenant_id = ?
      GROUP BY place_key, trade
      HAVING searches >= 2
    `).bind(scopedTenantId).all();
    for (const row of geo?.results || []) {
      const cityName = String(row.place_key || "").split("|")[0];
      if (!cityName) continue;
      const searches = Math.max(1, Number(row.searches || 0));
      const wins = Math.min(searches, Number(row.wins || 0));
      const rate = (wins + 1) / (searches + 2);
      const key = `city:${cityName}`;
      if (winRates[key] === void 0) winRates[key] = rate;
    }
  } catch (e) {
    console.warn("[Learning Integrity] Scoped read failed; using uniform prior.", e);
  }
  return winRates;
}
__name(getLearningStats, "getLearningStats");
function parseCSV(text) {
  const lines = [];
  let row = [];
  let entry = "";
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
    } else if (c === "," && !inQuotes) {
      row.push(entry.trim());
      entry = "";
    } else if ((c === "\r" || c === "\n") && !inQuotes) {
      if (c === "\r" && next === "\n") {
        i++;
      }
      row.push(entry.trim());
      if (row.some((field) => field.length > 0)) {
        lines.push(row);
      }
      row = [];
      entry = "";
    } else {
      entry += c;
    }
  }
  if (entry || row.length > 0) {
    row.push(entry.trim());
    if (row.some((field) => field.length > 0)) {
      lines.push(row);
    }
  }
  return lines;
}
__name(parseCSV, "parseCSV");
function inferTradeFromTextDetailed(...textParts) {
  const combined = textParts.filter(Boolean).join(" ").toLowerCase();
  if (!combined.trim()) {
    return { trade: "general", confidence: "none", isNonHomeService: false };
  }
  const tradePatterns = [
    ["lawn_care", /\b(lawn\s*care|lawn\s*mowing|mowing|turf|weed\s*control|aeration|yard\s*care|lawn\s*service)\b/i],
    ["landscaping", /\b(landscap|irrigation|sprinkler|hardscap|tree\s*service|arborist|tree\s*care)\b/i],
    ["plumbing", /\b(plumb|drain|sewer|water\s*heater|pipe|rooter|leak\s*detection)\b/i],
    ["hvac", /\b(hvac|air\s*conditioning|heating|furnace|heat\s*pump|cooling|a\/c|duct|refrigeration)\b/i],
    ["roofing", /\b(roof|roofer|roofing|shingle|gutters?|siding)\b/i],
    ["electrical", /\b(electric|electrician|wiring|generator|lighting\s*install)\b/i],
    ["painting", /\b(paint|painter|painting|drywall|stucco)\b/i],
    ["pest_control", /\b(pest\s*control|exterminat|termite|bed\s*bug|fumigat|pest\s*solutions)\b/i],
    ["pool", /\b(pool\s*service|pool\s*cleaning|pool\s*repair|pools\s*and\s*spa)\b/i],
    ["cleaning", /\b(cleaning|maid|janitorial|pressure\s*wash|power\s*wash|carpet\s*clean|window\s*clean)\b/i],
    ["garage_door", /\b(garage\s*door|overhead\s*door)\b/i],
    ["handyman", /\b(handyman|general\s*contractor|remodel|renovation|home\s*repair)\b/i]
  ];
  for (const [t, regex] of tradePatterns) {
    const m = combined.match(regex);
    if (m) {
      return { trade: t, confidence: "high", isNonHomeService: false, detectedClue: m[0] };
    }
  }
  return { trade: "general", confidence: "low", isNonHomeService: false };
}
__name(inferTradeFromTextDetailed, "inferTradeFromTextDetailed");
function inferTradeFromText(...textParts) {
  return inferTradeFromTextDetailed(...textParts).trade;
}
__name(inferTradeFromText, "inferTradeFromText");
function checkTradeCoherence(name, declaredTrade, website, tags, mode = "founder") {
  const allowTenantBuyer = mode === "tenant";
  if (isOffIcpName(name, allowTenantBuyer)) {
    return {
      coherent: false,
      verifiedTrade: null,
      reason: `off_icp_name: "${name}" is off-ICP`,
      disqualified: true
    };
  }
  const inferred = inferTradeFromTextDetailed(name, tags || "", website || "");
  if (inferred.isNonHomeService) {
    return {
      coherent: false,
      verifiedTrade: null,
      reason: `non_home_service: clues indicate off-ICP`,
      disqualified: true
    };
  }
  const normDeclared = (declaredTrade || "").toLowerCase().replace(/[\s-]+/g, "_");
  if (inferred.confidence === "high" && inferred.trade !== "general") {
    const compatible = inferred.trade === normDeclared || inferred.trade === "lawn_care" && normDeclared === "landscaping" || inferred.trade === "landscaping" && normDeclared === "lawn_care";
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
  const validTrades = /* @__PURE__ */ new Set([
    "plumbing",
    "hvac",
    "roofing",
    "landscaping",
    "lawn_care",
    "electrical",
    "painting",
    "pool",
    "pest_control",
    "cleaning",
    "handyman",
    "garage_door",
    "construction",
    "remodeling",
    "commercial_cleaning",
    "janitorial",
    "window_cleaning",
    "carpet_cleaning",
    "pressure_washing",
    "tree_service",
    "appliance_repair",
    "fencing",
    "flooring",
    "general_contractor",
    "auto_repair",
    "auto_body",
    "towing",
    "car_wash",
    "car_rental",
    "dental_clinic",
    "medical_clinic",
    "optometry",
    "law_firm",
    "accounting_firm",
    "insurance_agency",
    "property_management",
    "real_estate",
    "hotel",
    "school",
    "tutoring_center",
    "training_center",
    "restaurant",
    "catering",
    "event_venue",
    "hardware_store",
    "equipment_rental",
    "repair_shop",
    "moving",
    "storage_facility",
    "delivery_service",
    "industrial_maintenance",
    "manufacturer",
    "machine_shop",
    "it_services",
    "managed_it",
    "irrigation",
    "travel_agency",
    "sports_club",
    "local_service_business"
  ]);
  if (validTrades.has(normDeclared)) {
    return {
      coherent: true,
      verifiedTrade: normDeclared,
      disqualified: false
    };
  }
  const hasContactEvidence = Boolean(
    website && website.trim() || /"(?:phone|email)"\s*:\s*"[^"]+"/i.test(tags || "")
  );
  if (mode !== "tenant" && normDeclared && hasContactEvidence) {
    return {
      coherent: true,
      verifiedTrade: normDeclared,
      reason: "custom_trade_with_contact_evidence",
      disqualified: false
    };
  }
  return {
    coherent: false,
    verifiedTrade: null,
    reason: `unverified_trade: declared "${declaredTrade}" has no supporting business/contact clues`,
    disqualified: mode !== "tenant"
  };
}
__name(checkTradeCoherence, "checkTradeCoherence");
function isLicenseStatusInvalid(statusText) {
  if (!statusText) return false;
  const lower = statusText.toLowerCase();
  return /expired|expirad|revoked|revocad|cancelled|canceled|cancelad|suspended|suspendid|inactive|inactiv/i.test(lower);
}
__name(isLicenseStatusInvalid, "isLicenseStatusInvalid");
function isUsOutreachQuietHours(now = /* @__PURE__ */ new Date()) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      hour12: false
    }).formatToParts(now);
    const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "12");
    return hour >= 21 || hour < 8;
  } catch {
    const h = now.getUTCHours();
    return h >= 2 && h < 13;
  }
}
__name(isUsOutreachQuietHours, "isUsOutreachQuietHours");
async function probeWebsiteHealth(url) {
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
      signal: AbortSignal.timeout(4500)
    });
    const ms = Date.now() - start;
    let body = "";
    try {
      body = (await res.text()).slice(0, 4e3).toLowerCase();
    } catch {
      body = "";
    }
    const parked = /domain is for sale|buy this domain|parked free|godaddy parking|sedoparking|coming soon|under construction/i.test(body);
    return { ok: res.ok && !parked, status: res.status, parked, isSlow: ms > 2500, ms };
  } catch {
    return { ...empty, ms: Date.now() - start };
  }
}
__name(probeWebsiteHealth, "probeWebsiteHealth");
function isRealWebsite(url) {
  if (!url || typeof url !== "string") return false;
  const lower = url.toLowerCase().trim();
  if (!lower || lower === "null" || lower === "undefined") return false;
  const bad = [
    "facebook.com",
    "fb.com",
    "instagram.com",
    "yelp.com",
    "yellowpages.com",
    "linktr.ee",
    "linktree.com",
    "bit.ly",
    "tinyurl.com",
    "business.site",
    "wixsite.com",
    "nextdoor.com",
    "angi.com",
    "homeadvisor.com",
    "thumbtack.com",
    "bbb.org",
    "craigslist.org",
    "twitter.com",
    "x.com",
    "tiktok.com",
    "linkedin.com",
    "google.com/maps",
    "goo.gl/maps"
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
__name(isRealWebsite, "isRealWebsite");
function getDomain(url) {
  try {
    let hostname = url.replace(/^(https?:\/\/)?(www\.)?/i, "");
    hostname = hostname.split("/")[0].split(":")[0];
    return hostname.toLowerCase();
  } catch (e) {
    return null;
  }
}
__name(getDomain, "getDomain");
function getDayOfYear(now) {
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  const oneDay = 1e3 * 60 * 60 * 24;
  return Math.floor(diff / oneDay);
}
__name(getDayOfYear, "getDayOfYear");
function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0;
  }
  return Math.abs(hash);
}
__name(hashCode, "hashCode");
function escapeMarkdown(text) {
  if (!text) return "";
  return text.replace(/_/g, "\\_").replace(/\*/g, "\\*").replace(/\[/g, "\\[").replace(/\]/g, "\\]").replace(/`/g, "\\`").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}
__name(escapeMarkdown, "escapeMarkdown");
function escapeHtml2(str) {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
__name(escapeHtml2, "escapeHtml");
function handleEdgeDemoPage(companyName, tradeName, phone) {
  const safeName = escapeHtml2(companyName);
  const safeTrade = escapeHtml2(tradeName);
  const safePhone = escapeHtml2(phone || "(L\xEDnea de Voz)");
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bvelt Demo \xB7 ${safeName}</title>
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
    <div class="badge">Simulador Interactivo Bvelt \u2014 Demostraci\xF3n de Capacidades</div>
    <h1>\xBFQu\xE9 pasa si un cliente llama a ${safeName} fuera de horario?</h1>
    <p class="sub">Los clientes que necesitan servicios de <strong>${safeTrade}</strong> llaman al primer n\xFAmero que encuentran. Si nadie contesta en 30 segundos, llaman a tu competidor.</p>

    <div class="card">
      <div class="sim-header">
        <div class="sim-title"><span class="status-dot"></span> Bvelt Call Recovery en Acci\xF3n</div>
        <span style="font-size: 11px; color: #64748b;">${safePhone}</span>
      </div>

      <div class="timeline">
        <div class="event">
          <div class="event-time">8:42 PM</div>
          <div class="event-body">
            <div class="call-box">\u{1F4DE} Llamada perdida de cliente nuevo (t\xE9cnicos ocupados en un servicio)</div>
          </div>
        </div>
        <div class="event">
          <div class="event-time">8:42 PM</div>
          <div class="event-body">
            <div style="font-size: 10px; color: #60a5fa; margin-bottom: 2px;">\u26A1 SMS instant\xE1neo en 6 segundos</div>
            <div class="sms-box">"Hola, gracias por llamar a <strong>${safeName}</strong>. Estamos terminando un servicio urgente. \xBFEn qu\xE9 podemos ayudarte de inmediato?"</div>
          </div>
        </div>
        <div class="event">
          <div class="event-time">8:43 PM</div>
          <div class="event-body">
            <div class="client-box">"Hola, tengo un problema urgente y necesito cotizaci\xF3n para ma\xF1ana por la ma\xF1ana."</div>
          </div>
        </div>
        <div class="event">
          <div class="event-time">8:44 PM</div>
          <div class="event-body">
            <div class="booked-box">\u2705 Trabajo agendado y notificado al propietario de ${safeName}. Cliente retenido.</div>
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

    <a href="https://bvelt.app" class="cta-btn" target="_blank" rel="noopener">Activar Bvelt para ${safeName} \u2192</a>
    <div class="footer">Bvelt \xB7 Autonomous Call Recovery & SMS Engine para Contratistas Locales</div>
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
__name(handleEdgeDemoPage, "handleEdgeDemoPage");

// src/tenantLearningIngest.ts
async function handleTenantLearningIngest(request, env, corsHeaders) {
  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const serviceKey = String(env.RADAR_SERVICE_KEY || "").trim();
  if (!serviceKey || !token || token !== serviceKey) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401, headers: corsHeaders });
  }
  const headerTenantId = String(request.headers.get("X-Tenant-Id") || "").trim();
  if (!headerTenantId.startsWith("bvelt_") || headerTenantId === "bvelt_founder") {
    return Response.json({ ok: false, error: "valid_tenant_scope_required" }, { status: 400, headers: corsHeaders });
  }
  const body = await request.json().catch(() => null);
  if (!body || body.mode !== "tenant" || String(body.tenant_id || "").trim() !== headerTenantId) {
    return Response.json({ ok: false, error: "tenant_scope_mismatch" }, { status: 403, headers: corsHeaders });
  }
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 100) {
    return Response.json({ ok: false, error: "items_must_contain_1_to_100_events" }, { status: 400, headers: corsHeaders });
  }
  const allowedEvents = /* @__PURE__ */ new Set(["contacted", "replied", "qualified", "booked", "won", "lost"]);
  let insertedCount = 0;
  let duplicateCount = 0;
  try {
    for (const item of body.items) {
      const prospectId = String(item?.prospect_id || "").trim().slice(0, 180);
      const eventType = String(item?.event_type || "").trim().toLowerCase();
      const idempotencyKey = String(item?.idempotency_key || "").trim().slice(0, 180);
      if (!prospectId || !allowedEvents.has(eventType) || !idempotencyKey) {
        return Response.json({ ok: false, error: "invalid_learning_event" }, { status: 400, headers: corsHeaders });
      }
      const occurredAt = String(item?.occurred_at || (/* @__PURE__ */ new Date()).toISOString()).slice(0, 40);
      if (!Number.isFinite(Date.parse(occurredAt))) {
        return Response.json({ ok: false, error: "invalid_occurred_at" }, { status: 400, headers: corsHeaders });
      }
      const valueUsd = item?.value_usd == null ? null : Number(item.value_usd);
      if (valueUsd !== null && (!Number.isFinite(valueUsd) || valueUsd < 0)) {
        return Response.json({ ok: false, error: "invalid_value_usd" }, { status: 400, headers: corsHeaders });
      }
      const input = {
        mode: "tenant",
        tenantId: headerTenantId,
        prospectId,
        eventType,
        city: item?.city ? String(item.city).trim().slice(0, 200) : null,
        trade: item?.trade ? String(item.trade).trim().slice(0, 160) : null,
        variantId: item?.variant_id ? String(item.variant_id).trim().slice(0, 120) : null,
        angle: item?.angle ? String(item.angle).trim().slice(0, 160) : null,
        valueUsd,
        occurredAt,
        idempotencyKey: `bvelt-outcome:${idempotencyKey}`
      };
      const result = await recordScopedLearningEvent(env.RADAR_DB, input);
      if (result === "inserted") {
        insertedCount++;
        continue;
      }
      if (result === "duplicate") {
        duplicateCount++;
        continue;
      }
      const storedKey = `tenant:${headerTenantId}:${input.idempotencyKey}`;
      const existing = await env.RADAR_DB.prepare(
        "SELECT id FROM learning_events WHERE mode = 'tenant' AND tenant_id = ? AND idempotency_key = ? LIMIT 1"
      ).bind(headerTenantId, storedKey).first();
      if (existing) {
        return Response.json(
          { ok: false, error: "idempotency_conflict" },
          { status: 409, headers: corsHeaders }
        );
      }
      return Response.json(
        { ok: false, error: "learning_event_persistence_unconfirmed" },
        { status: 503, headers: corsHeaders }
      );
    }
  } catch (error) {
    console.error("[Radar Learning Ingest] Persistence failed:", error?.message || error);
    return Response.json(
      { ok: false, error: "learning_event_persistence_failed" },
      { status: 503, headers: corsHeaders }
    );
  }
  return Response.json(
    {
      ok: true,
      mode: "tenant",
      tenant_id: headerTenantId,
      accepted: insertedCount + duplicateCount,
      inserted: insertedCount,
      deduplicated: duplicateCount
    },
    { headers: corsHeaders }
  );
}
__name(handleTenantLearningIngest, "handleTenantLearningIngest");

// src/workerEntry.ts
var baseFetch = worker_default.fetch.bind(worker_default);
worker_default.fetch = async (request, env, ctx) => {
  try {
    const url = new URL(request.url);
    if (url.pathname === "/api/learning/events" && request.method === "POST") {
      const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Tenant-Id"
      };
      return await handleTenantLearningIngest(request, env, corsHeaders);
    }
  } catch (err) {
    console.error("[workerEntry] learning ingest intercept failed:", err);
  }
  return baseFetch(request, env, ctx);
};
var workerEntry_default = worker_default;
export {
  BIZDATA_OFFICIAL_CATEGORIES,
  DEFAULT_FOUNDER_MISSION,
  PREFERRED_TRADES,
  associateResearchCandidate,
  bootstrapBveltTenant,
  buildAttackKit,
  buildLegalFooter,
  buildOutreachIdempotencyKey,
  buildTechnicalAuditSnapshot,
  cacheGet,
  cachePut,
  calculateMultiFactorScore,
  calculateStrategicScores,
  checkSenderGovernor,
  checkSuppressedComposite,
  checkTradeCoherence,
  classifyReplyText,
  classifyWithClef,
  classifyWithWorkersAI,
  collectRadarDigest,
  commitBudget,
  workerEntry_default as default,
  enqueueJob,
  ensureResearchSchema,
  evaluateFounderOutreachEligibility,
  expandFounderDiscoveryNiches,
  expandTenantIcp,
  fetchBizDataBusinesses,
  fetchGeoapifyBusinesses,
  fetchLocalBusinesses,
  fetchLocalBusinessesWithDiagnostics,
  fetchNominatimGeocoding,
  fetchOverpassBusinesses,
  fetchPermitContractors2 as fetchPermitContractors,
  fetchPublicPermits,
  findExistingProspectOverlap,
  formatProspectTelegramMessage,
  generateIdentityKey,
  getBudgetLimit,
  getCircuitBreakerStatus,
  getFounderOutreachEligibility,
  getPriorityTargets,
  getRemainingBudget,
  handleProspectEvent,
  incrementSenderSends,
  inferTradeFromText,
  inferTradeFromTextDetailed,
  isAuthorized,
  isCooldownActive,
  isHardRejectedChain,
  isLicenseStatusInvalid,
  isNonBusinessEntity,
  isSidecarCallbackAuthorized,
  isValidCorporateDomain,
  isVerifiedDeliverableEmail,
  mapTradeToBizDataCategory,
  maybeDispatchSidecarResearch,
  notifyFounder,
  notifyOnce,
  parseCSV,
  pickFounderVoiceLine,
  processQueueJob,
  pruneRadarCache,
  pushMarketObservationsToBem,
  reconcileResendDeliveries,
  recordNegativeSignal,
  recordQueueJobStatus,
  recordTrustDecisionInD1,
  releaseBudget,
  reserveBudget,
  resolveOutreachTouchCount,
  resolveTenantAuthContext,
  resolveTenantBuyerSegments,
  sendOrQueueOutreach,
  sendRadarDigest,
  sendTenantObservationsToBvelt,
  shouldSendFounderFollowUp,
  startProspectingRun,
  syncOpportunityDecision,
  tenantBuyerNameFits,
  trackProviderFailure,
  tripCircuitBreaker,
  verifyEmail,
  verifyTrustStackGate
};
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Bvelt Radar — Public Municipal Permit Sources Engine
 */
//# sourceMappingURL=workerEntry.js.map
