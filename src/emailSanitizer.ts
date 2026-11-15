import marketUniverse from "../sidecar/config/market-universe.json";

/**
 * Email Sanitizer & ICP Guard for Bvelt Radar
 * Prevents invalid emails (e.g. clock@2x.png, system mailboxes, disposables)
 * and filters out off-ICP consumer/retail businesses.
 *
 * Email trust is layered: syntax ≠ deliverable ≠ business-owned ≠ provider-verified.
 */

const FILE_EXT_TLD_REGEX = /\.(png|jpe?g|svg|webp|gif|ico|woff2?|ttf|eot|css|js|json|map|xml|mp4|pdf|zip|tar|gz)$/i;

const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com',
  'tempmail.com',
  '10minutemail.com',
  'yopmail.com',
  'guerrillamail.com',
  'trashmail.com',
  'throwawaymail.com',
  'sharklasers.com',
  'getairmail.com',
  'temp-mail.org',
  'dispostable.com',
  'fakeinbox.com',
]);

const PLACEHOLDER_LOCAL_PARTS = new Set([
  'example', 'test', 'yourname', 'your_name', 'your-email', 'your_email',
  'email', 'name', 'user', 'username', 'sample', 'demo', 'placeholder',
  'changeme', 'me', 'foo', 'bar',
]);

const PLACEHOLDER_DOMAINS = new Set([
  'example.com', 'example.org', 'example.net', 'example.test',
  'invalid', 'localhost', 'test.com', 'email.com', 'domain.com',
  'mail.com', 'mail.org', 'mail.net', 'email.org',
]);

const SYSTEM_LOCAL_PARTS = new Set([
  'noreply',
  'no-reply',
  'postmaster',
  'abuse',
  'webmaster',
  'mailer-daemon',
  'root',
  'hostmaster',
  'daemon',
]);

const RFC_EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

export interface SanitizeResult {
  valid: boolean;
  reason?: string;
  email?: string;
}

/** Layered commercial email trust — never treat syntax-only as verified. */
export type EmailTrustLevel =
  | 'rejected'
  | 'syntax_ok'
  | 'mx_ok'
  | 'business_aligned'
  | 'provider_verified';

export interface EmailTrustAssessment {
  level: EmailTrustLevel;
  email: string | null;
  reason?: string;
  /** True only when level is at least syntax_ok and not placeholder/disposable. */
  outreachEligible: boolean;
}

export function sanitizeEmail(rawEmail: string | null | undefined): SanitizeResult {
  if (!rawEmail || typeof rawEmail !== 'string') {
    return { valid: false, reason: 'empty_or_not_string' };
  }

  const email = rawEmail.trim().toLowerCase();

  if (email.length < 5 || email.length > 254) {
    return { valid: false, reason: 'invalid_length' };
  }

  if (/@2x/i.test(email) || /@\d+x\./i.test(email)) {
    return { valid: false, reason: 'retina_asset_filename' };
  }

  const parts = email.split('@');
  if (parts.length !== 2) {
    return { valid: false, reason: 'invalid_at_syntax' };
  }

  const [localPart, domain] = parts;

  if (PLACEHOLDER_LOCAL_PARTS.has(localPart) || PLACEHOLDER_DOMAINS.has(domain)) {
    return { valid: false, reason: 'placeholder_email' };
  }

  if (!localPart || localPart.length > 64) {
    return { valid: false, reason: 'invalid_local_part_length' };
  }

  if (SYSTEM_LOCAL_PARTS.has(localPart)) {
    return { valid: false, reason: `system_mailbox_${localPart}` };
  }

  if (!domain || domain.length > 253 || !domain.includes('.')) {
    return { valid: false, reason: 'invalid_domain_format' };
  }

  if (/^\[?\d{1,3}(\.\d{1,3}){3}\]?$/.test(domain)) {
    return { valid: false, reason: 'ip_address_domain' };
  }

  if (FILE_EXT_TLD_REGEX.test(domain)) {
    return { valid: false, reason: 'file_extension_tld' };
  }

  if (DISPOSABLE_DOMAINS.has(domain)) {
    return { valid: false, reason: 'disposable_domain' };
  }

  if (!RFC_EMAIL_REGEX.test(email)) {
    return { valid: false, reason: 'rfc_syntax_failed' };
  }

  const tld = domain.split('.').pop();
  if (!tld || tld.length < 2 || /^\d+$/.test(tld)) {
    return { valid: false, reason: 'invalid_tld' };
  }

  return { valid: true, email };
}

export function sanitizeProspectEmail(email: string | null | undefined): string | null {
  const result = sanitizeEmail(email);
  return result.valid && result.email ? result.email : null;
}

/**
 * Assess commercial email trust without claiming provider verification.
 * websiteHost optional: when email domain matches business site → business_aligned.
 */
export function assessEmailTrust(
  rawEmail: string | null | undefined,
  opts?: { websiteHost?: string | null; mxOk?: boolean | null }
): EmailTrustAssessment {
  const sanitized = sanitizeEmail(rawEmail);
  if (!sanitized.valid || !sanitized.email) {
    return {
      level: 'rejected',
      email: null,
      reason: sanitized.reason || 'invalid',
      outreachEligible: false,
    };
  }

  const email = sanitized.email;
  const domain = email.split('@')[1];

  let level: EmailTrustLevel = 'syntax_ok';
  if (opts?.mxOk === true) {
    level = 'mx_ok';
  }

  const host = String(opts?.websiteHost || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0];

  if (host && (host === domain || host.endsWith('.' + domain) || domain.endsWith('.' + host))) {
    level = 'business_aligned';
  }

  return {
    level,
    email,
    outreachEligible: true,
  };
}

/**
 * Checks if domain has valid MX records via Cloudflare DoH (fail-open).
 */
export async function hasMxRecords(domainOrEmail: string): Promise<boolean> {
  const domain = domainOrEmail.includes('@')
    ? domainOrEmail.split('@')[1].trim().toLowerCase()
    : domainOrEmail.trim().toLowerCase();

  if (!domain || !domain.includes('.')) {
    return false;
  }

  try {
    const dohUrl = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=MX`;
    const res = await fetch(dohUrl, {
      headers: { Accept: 'application/dns-json' },
      signal: AbortSignal.timeout(4000),
    });

    if (!res.ok) {
      return true;
    }

    const json: any = await res.json();
    if (json && Array.isArray(json.Answer) && json.Answer.length > 0) {
      return true;
    }

    if (json && json.Status === 0 && (!json.Answer || json.Answer.length === 0)) {
      return false;
    }

    return true;
  } catch {
    return true;
  }
}

const MARKET_EXCLUSIONS = new Set(
  (((marketUniverse as any).excluded_business_categories || []) as string[])
    .map((value) => String(value).trim().toLowerCase())
);

const FOUNDER_EXCLUSION_RULES: Array<{ category: string; pattern: RegExp }> = [
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
  { category: "low-value retail", pattern: /\b(dollar store|discount store|thrift store|pawn shop)\b/i },
];

/** Institutions and non-commercial entities — always excluded from commercial ICP. */
const NON_BUSINESS_ENTITY_REGEX =
  /\b(church|iglesia|ministry|ministerio|chapel|temple|parish|cathedral|mosque|synagogue|school|college|university|library|museum|hospital(?!ity)|clinic\b|soccer|hockey|baseball|football club|minor (?:soccer|hockey|baseball)|sports? club|recreation centre|recreation center|community centre|community center|hoa\b|homeowners? association|city of\b|town of\b|municipality|charity|non[- ]?profit|ngo\b)\b/i;

/**
 * Detect name vs claimed trade/category incoherence (production findings):
 * restaurant labeled landscaping, sports club as services, wholesale supply as contractor.
 */
export function isCategoryNameMismatch(
  name: string | null | undefined,
  categoryOrTrade: string | null | undefined
): boolean {
  if (!name || typeof name !== 'string') return false;
  const n = name.trim().toLowerCase();
  const c = String(categoryOrTrade || '').trim().toLowerCase();
  if (!n || !c) return false;

  const tradeish =
    /\b(landscap|lawn|garden|electric|electr|plumb|hvac|h\.?v\.?a\.?c|contractor|roofer|roofing|hvac|heating|cooling|pest|cleaning|handyman)\b/i.test(
      c
    );

  if (!tradeish) return false;

  if (/\b(restaurant|cafe|caf[eé]|diner|pizzeria|chinese|sushi|bistro|bar\b|pub\b|grill|kitchen|food truck)\b/i.test(n)) {
    return true;
  }
  if (/\b(soccer|hockey|baseball|football|sports?\s+club|minor\s+\w+|ymca|recreation)\b/i.test(n)) {
    return true;
  }
  if (/\b(wholesale|distributor|distribution|supply\s+house|lighting\s+supply|building\s+supply)\b/i.test(n)) {
    // Wholesale can sell to contractors but is not itself a residential service contractor ICP for Founder outreach.
    if (/\b(contractor|electrician|plumber|residential|service)\b/i.test(c)) {
      return true;
    }
  }
  return false;
}

/**
 * Non-business institutions always excluded.
 * Founder consumer-category exclusions from market-universe.json.
 * Tenant buyer mode bypasses Founder category exclusions; still applies non-business + name/category mismatch.
 */
export function isOffIcpName(
  name: string | null | undefined,
  allowTenantBuyer: boolean = false,
  categoryOrTrade?: string | null
): boolean {
  if (!name || typeof name !== "string") return true;
  const clean = name.trim().toLowerCase();
  if (!clean) return true;

  if (/\b(?:variation|variant)\s*#?\s*\d+\b/i.test(clean)) return true;

  if (NON_BUSINESS_ENTITY_REGEX.test(clean)) return true;

  if (isCategoryNameMismatch(name, categoryOrTrade)) return true;

  if (allowTenantBuyer) return false;

  return FOUNDER_EXCLUSION_RULES.some((rule) =>
    MARKET_EXCLUSIONS.has(rule.category) && rule.pattern.test(clean)
  );
}

/**
 * Outreach quality gate: do not let a high score compensate for bad ICP or weak email.
 */
export function outreachQualityBlocked(input: {
  name?: string | null;
  categoryOrTrade?: string | null;
  email?: string | null;
  allowTenantBuyer?: boolean;
  emailTrust?: EmailTrustAssessment | null;
}): { blocked: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (isOffIcpName(input.name, Boolean(input.allowTenantBuyer), input.categoryOrTrade)) {
    reasons.push('off_icp_or_category_mismatch');
  }
  const trust =
    input.emailTrust ||
    assessEmailTrust(input.email);
  if (!trust.outreachEligible) {
    reasons.push(`email_${trust.reason || trust.level}`);
  }
  return { blocked: reasons.length > 0, reasons };
}
