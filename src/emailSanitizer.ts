/**
 * Email Sanitizer & ICP Guard for Bvelt Radar
 * Prevents invalid emails (e.g. clock@2x.png, system mailboxes, disposables)
 * and filters out off-ICP consumer/retail businesses.
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

// Basic RFC 5322 regex validation
const RFC_EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

export interface SanitizeResult {
  valid: boolean;
  reason?: string;
  email?: string;
}

/**
 * Sanitize and strictly validate an email address.
 * Rejects file TLDs (.png, .jpg, .svg), @2x assets, system locals, disposables, IP domains.
 */
export function sanitizeEmail(rawEmail: string | null | undefined): SanitizeResult {
  if (!rawEmail || typeof rawEmail !== 'string') {
    return { valid: false, reason: 'empty_or_not_string' };
  }

  const email = rawEmail.trim().toLowerCase();

  // 1. Length check
  if (email.length < 5 || email.length > 254) {
    return { valid: false, reason: 'invalid_length' };
  }

  // 2. Reject @2x or asset-like strings (e.g. clock@2x.png, logo@2x.jpg)
  if (/@2x/i.test(email) || /@\d+x\./i.test(email)) {
    return { valid: false, reason: 'retina_asset_filename' };
  }

  // 3. Must contain exactly one @ symbol
  const parts = email.split('@');
  if (parts.length !== 2) {
    return { valid: false, reason: 'invalid_at_syntax' };
  }

  const [localPart, domain] = parts;

  // 4. Local part validation
  if (!localPart || localPart.length > 64) {
    return { valid: false, reason: 'invalid_local_part_length' };
  }

  if (SYSTEM_LOCAL_PARTS.has(localPart)) {
    return { valid: false, reason: `system_mailbox_${localPart}` };
  }

  // 5. Domain validation
  if (!domain || domain.length > 253 || !domain.includes('.')) {
    return { valid: false, reason: 'invalid_domain_format' };
  }

  // Reject IP address domain format: @192.168.1.1 or @[192.168.1.1]
  if (/^\[?\d{1,3}(\.\d{1,3}){3}\]?$/.test(domain)) {
    return { valid: false, reason: 'ip_address_domain' };
  }

  // Reject file extensions disguised as TLDs (e.g. user@site.png, clock@2x.png)
  if (FILE_EXT_TLD_REGEX.test(domain)) {
    return { valid: false, reason: 'file_extension_tld' };
  }

  // Reject known disposable domains
  if (DISPOSABLE_DOMAINS.has(domain)) {
    return { valid: false, reason: 'disposable_domain' };
  }

  // 6. Strict RFC format check
  if (!RFC_EMAIL_REGEX.test(email)) {
    return { valid: false, reason: 'rfc_syntax_failed' };
  }

  // 7. Ensure valid TLD (at least 2 letters, not numeric)
  const tld = domain.split('.').pop();
  if (!tld || tld.length < 2 || /^\d+$/.test(tld)) {
    return { valid: false, reason: 'invalid_tld' };
  }

  return { valid: true, email };
}

/**
 * Gate helper: returns cleaned email if valid, or null if invalid.
 */
export function sanitizeProspectEmail(email: string | null | undefined): string | null {
  const result = sanitizeEmail(email);
  return result.valid && result.email ? result.email : null;
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
      // Fail-open on HTTP errors from resolver
      return true;
    }

    const json: any = await res.json();
    if (json && Array.isArray(json.Answer) && json.Answer.length > 0) {
      return true;
    }

    // Check if domain itself has an A record fallback if no MX
    if (json && json.Status === 0 && (!json.Answer || json.Answer.length === 0)) {
      // DoH returned NOERROR but no MX records
      return false;
    }

    // Fail-open on unknown status
    return true;
  } catch (err) {
    // Fail-open on timeout or network error so DNS outage does not halt outreach
    return true;
  }
}

/**
 * Detects if a business name is clearly off-ICP (consumer retail, restaurants, beauty, etc.)
 */
export function isOffIcpName(name: string | null | undefined): boolean {
  if (!name || typeof name !== 'string') {
    return true;
  }

  const offIcpRegex =
    /tamal|taquer|restaurant|cafe|catering|taco|pizza|bakery|beauty|salon|barber|nail|spa|church|iglesia|feed|clothing|boutique|florist|jewelry|pawn|casino|cannabis|dispensary|daycare|dental|massage|tattoo/i;

  return offIcpRegex.test(name.trim());
}
