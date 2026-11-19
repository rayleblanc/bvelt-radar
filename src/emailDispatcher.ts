/**
 * Outbound Email Dispatcher for Bvelt Radar
 * Providers: Resend → Brevo → simulated
 * Brand: lightweight text-first email body; no tracking image or injected CTA
 */

import { sanitizeEmail, hasMxRecords } from './emailSanitizer';

/** Official product URL — never /demo?p= tokens */
export const BVELT_SITE = 'https://bvelt.app/';

/** Public brand mark (upload public/bvelt-icon.png to bvelt.app) */
export const BVELT_ICON_URL = 'https://bvelt.app/bvelt-icon.png';

export interface EmailDispatchOptions {
  to: string;
  recipientName?: string;
  subject: string;
  body: string;
  from?: string;
  replyTo?: string;
  prospectId?: string;
  touchCount?: number;
  resendApiKey?: string;
  brevoApiKey?: string;
  senderName?: string;
  logoUrl?: string;
  includeSiteLink?: boolean;
  plainTextOnly?: boolean;
}

export function resolveBveltSender(raw?: string): { email: string; from: string } | null {
  const value = String(raw || '').trim();
  if (!value) return null;
  const match = value.match(/^(.*?)\s*<([^<>]+)>$/);
  const displayName = match?.[1]?.trim().replace(/[<>\r\n]/g, '') || 'Bvelt';
  const candidate = (match?.[2] || value).trim();
  const parsed = sanitizeEmail(candidate);
  if (!parsed.valid || !parsed.email || parsed.email.split('@')[1] !== 'bvelt.app') return null;
  return { email: parsed.email, from: `${displayName} <${parsed.email}>` };
}

export function buildListUnsubscribeHeader(rawFrom?: string): string | null {
  const sender = resolveBveltSender(rawFrom);
  if (!sender) return null;
  // Replies are ingested by Resend Receiving and classified by Radar's
  // inbound webhook; the explicit body token makes unsubscribe unambiguous.
  return `<mailto:${sender.email}?subject=unsubscribe&body=unsubscribe>`;
}

export interface OutboundEmailAuthDiagnostics {
  sender: string | null;
  domain: string | null;
  resendDomainStatus: string;
  resendRecordStatuses: string[];
  dkimPresent: boolean;
  spfPresent: boolean;
  dmarcPresent: boolean;
  dmarcPolicy: string;
  returnPathMxPresent: boolean;
  errors: string[];
  warnings: string[];
}

export async function inspectOutboundEmailAuth(
  from?: string,
  resendApiKey?: string,
  fetcher: typeof fetch = fetch
): Promise<OutboundEmailAuthDiagnostics> {
  const sender = resolveBveltSender(from);
  const base: OutboundEmailAuthDiagnostics = {
    sender: sender?.email || null,
    domain: sender?.email.split('@')[1] || null,
    resendDomainStatus: resendApiKey ? 'unknown' : 'api_key_missing',
    resendRecordStatuses: [],
    dkimPresent: false,
    spfPresent: false,
    dmarcPresent: false,
    dmarcPolicy: 'unknown',
    returnPathMxPresent: false,
    errors: [],
    warnings: []
  };
  if (!sender) {
    base.errors.push('OUTBOUND_EMAIL_FROM is missing or is not an @bvelt.app sender.');
    return base;
  }

  const domain = base.domain!;
  const lookup = async (name: string, type: 'TXT' | 'MX'): Promise<any[]> => {
    try {
      const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`;
      const response = await fetcher(url, {
        headers: { Accept: 'application/dns-json' },
        signal: AbortSignal.timeout(5000)
      });
      if (!response.ok) return [];
      const data: any = await response.json();
      return Array.isArray(data?.Answer) ? data.Answer : [];
    } catch {
      return [];
    }
  };

  const [dmarc, dkim, spf, returnMx] = await Promise.all([
    lookup(`_dmarc.${domain}`, 'TXT'),
    lookup(`resend._domainkey.${domain}`, 'TXT'),
    lookup(`send.${domain}`, 'TXT'),
    lookup(`send.${domain}`, 'MX')
  ]);
  const dmarcText = dmarc.map(x => String(x.data || '').replace(/^"|"$/g, '')).find(x => /v=DMARC1/i.test(x)) || '';
  const spfText = spf.map(x => String(x.data || '').replace(/^"|"$/g, '')).find(x => /v=spf1/i.test(x)) || '';
  base.dmarcPresent = !!dmarcText;
  base.dmarcPolicy = dmarcText.match(/(?:^|;)\s*p=([a-z]+)/i)?.[1]?.toLowerCase() || 'unknown';
  base.dkimPresent = dkim.some(x => /p=[A-Za-z0-9+/=]+/.test(String(x.data || '')));
  base.spfPresent = !!spfText;
  base.returnPathMxPresent = returnMx.some(x => /amazonses|resend/i.test(String(x.data || '')));

  if (resendApiKey?.trim()) {
    try {
      const response = await fetcher('https://api.resend.com/domains', {
        headers: { Authorization: `Bearer ${resendApiKey.trim()}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(8000)
      });
      if (!response.ok) {
        base.resendDomainStatus = `api_http_${response.status}`;
      } else {
        const payload: any = await response.json();
        const domains = Array.isArray(payload?.data) ? payload.data : [];
        const match = domains.find((item: any) => String(item?.name || '').toLowerCase() === domain.toLowerCase());
        base.resendDomainStatus = match ? String(match.status || 'unknown').toLowerCase() : 'domain_not_found';
        base.resendRecordStatuses = Array.isArray(match?.records)
          ? match.records.map((record: any) => `${String(record.type || 'DNS')} ${String(record.name || '')}: ${String(record.status || 'unknown')}`.trim()).slice(0, 8)
          : [];
      }
    } catch {
      base.resendDomainStatus = 'api_unreachable';
      base.errors.push('Resend domain verification endpoint could not be reached.');
    }
  }

  if (!base.dkimPresent) base.errors.push('Resend DKIM TXT record was not found by public DNS lookup.');
  if (!base.spfPresent) base.errors.push('SPF TXT record was not found on the configured send subdomain.');
  if (!base.dmarcPresent) base.errors.push('DMARC TXT record was not found.');
  if (!base.returnPathMxPresent) base.errors.push('Custom return-path MX record was not found.');
  if (base.dmarcPolicy === 'none') base.warnings.push('DMARC is in monitoring mode (p=none); receivers are not instructed to quarantine or reject authentication failures.');
  if (base.resendDomainStatus !== 'verified') base.errors.push(`Resend domain status is ${base.resendDomainStatus}, not verified.`);
  return base;
}

export function buildResendIdempotencyKey(prospectId: string, touchCount = 1): string {
  const touch = Math.max(1, Math.floor(Number(touchCount) || 1));
  return `send-prospect/${prospectId}/touch/${touch}`.substring(0, 256);
}

export interface EmailDispatchResult {
  success: boolean;
  provider: 'resend' | 'brevo' | 'simulated';
  messageId: string;
  status: 'dispatched' | 'simulated' | 'failed';
  error?: string;
  details?: string;
}

export function normalizeOutreachBody(body: string, includeSiteLink = true): string {
  let b = (body || '').trim();
  b = b.replace(/https?:\/\/bvelt\.app\/demo\?[^\s)\]>"]+/gi, BVELT_SITE);
  b = b.replace(/https?:\/\/bvelt\.app\/demo\b/gi, BVELT_SITE);
  b = b.replace(/https?:\/\/[a-z0-9.-]*workers\.dev\/demo[^\s)\]>"]*/gi, BVELT_SITE);
  if (!includeSiteLink) {
    b = b.replace(/https?:\/\/[^\s)\]>"]+/gi, "");
    b = b.replace(/(?:→|👉)\s*/g, "");
    b = b.replace(/[ \t]{2,}/g, " ").replace(/\n[ \t]*\n[ \t]*\n+/g, "\n\n");
  } else if (!/bvelt\.app/i.test(b)) {
    b = `${b}\n\n${BVELT_SITE}`;
  }
  return b.trim();
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildBrandedEmailHtml(bodyText: string, _logoUrl?: string): string {
  const paragraphs = escapeHtml(bodyText)
    .split(/\n\n+/)
    .map((p) => p.replace(/\n/g, "<br/>"))
    .map((p) => `<p style="margin:0 0 14px 0;line-height:1.55;color:#172033;font-size:15px;">${p}</p>`)
    .join("");

  // Lightweight, text-first markup: no tracking image, button, or duplicate CTA links.
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

export async function dispatchEmail(options: EmailDispatchOptions): Promise<EmailDispatchResult> {
  const sanitizeRes = sanitizeEmail(options.to);
  if (!sanitizeRes.valid || !sanitizeRes.email) {
    return {
      success: false,
      provider: 'simulated',
      messageId: '',
      status: 'failed',
      error: `Invalid email (${sanitizeRes.reason || 'sanitizer_rejected'}). Send cancelled.`,
    };
  }

  const to = sanitizeRes.email;

  // Pre-send MX gate: a domain without MX records cannot receive email.
  // hasMxRecords() is fail-open (DNS outages never halt outreach).
  const mxOk = await hasMxRecords(to);
  if (!mxOk) {
    return {
      success: false,
      provider: 'simulated',
      messageId: '',
      status: 'failed',
      error: 'Recipient domain has no MX records (recipient_domain_no_mx). Send cancelled.',
    };
  }

  const sender = resolveBveltSender(options.from);
  const provider = options.resendApiKey?.trim() ? 'resend' : options.brevoApiKey?.trim() ? 'brevo' : 'simulated';
  if (provider !== 'simulated' && !sender) {
    return {
      success: false,
      provider,
      messageId: '',
      status: 'failed',
      error: 'Unverified sender configuration. Set OUTBOUND_EMAIL_FROM to an authenticated @bvelt.app address; sending was blocked.',
    };
  }

  const subject = (options.subject || 'Quick question from Bvelt').trim();
  const body = normalizeOutreachBody(options.body || '', options.includeSiteLink !== false);
  const senderName = options.senderName || 'Rainer — Bvelt';
  const html = options.plainTextOnly ? undefined : buildBrandedEmailHtml(body, options.logoUrl);
  const providerHeaders: Record<string, string> = {
    'X-Entity-Ref-ID': options.prospectId || `lead_${Date.now()}`,
  };
  const unsubscribeHeader = buildListUnsubscribeHeader(options.from);
  if (unsubscribeHeader) providerHeaders['List-Unsubscribe'] = unsubscribeHeader;

  if (options.resendApiKey && options.resendApiKey.trim()) {
    try {
      const fromAddress = sender!.from;

      const payload: Record<string, unknown> = {
        from: fromAddress,
        to: [to],
        subject,
        text: body,
        ...(html ? { html } : {}),
        headers: providerHeaders,
      };
      if (options.replyTo && options.replyTo.includes('@')) {
        payload.reply_to = options.replyTo.trim();
      }

      const reqHeaders: Record<string, string> = {
        Authorization: `Bearer ${options.resendApiKey.trim()}`,
        'Content-Type': 'application/json',
      };
      if (options.prospectId) {
        reqHeaders['Idempotency-Key'] = buildResendIdempotencyKey(options.prospectId, options.touchCount);
      }

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: reqHeaders,
        body: JSON.stringify(payload),
      });
      const data: any = await res.json().catch(() => ({}));
      if (!res.ok) {
        return {
          success: false,
          provider: 'resend',
          messageId: '',
          status: 'failed',
          error: data?.message || data?.error || `Resend HTTP ${res.status}`,
          details: JSON.stringify(data).slice(0, 400),
        };
      }
      return {
        success: true,
        provider: 'resend',
        messageId: String(data?.id || ''),
        status: 'dispatched',
      };
    } catch (e: any) {
      return {
        success: false,
        provider: 'resend',
        messageId: '',
        status: 'failed',
        error: e?.message || 'Resend network error',
      };
    }
  }

  if (options.brevoApiKey && options.brevoApiKey.trim()) {
    try {
      const fromEmail = sender!.email;

      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': options.brevoApiKey.trim(),
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          sender: { name: senderName, email: fromEmail },
          to: [{ email: to, name: options.recipientName || to }],
          subject,
          textContent: body,
          ...(html ? { htmlContent: html } : {}),
          headers: providerHeaders,
        }),
      });
      const data: any = await res.json().catch(() => ({}));
      if (!res.ok) {
        return {
          success: false,
          provider: 'brevo',
          messageId: '',
          status: 'failed',
          error: data?.message || `Brevo HTTP ${res.status}`,
          details: JSON.stringify(data).slice(0, 400),
        };
      }
      return {
        success: true,
        provider: 'brevo',
        messageId: String(data?.messageId || data?.id || ''),
        status: 'dispatched',
      };
    } catch (e: any) {
      return {
        success: false,
        provider: 'brevo',
        messageId: '',
        status: 'failed',
        error: e?.message || 'Brevo network error',
      };
    }
  }

  console.log('[emailDispatcher] SIMULATED send', { to, subject, preview: body.slice(0, 120) });
  return {
    success: true,
    provider: 'simulated',
    messageId: `sim_${Date.now()}`,
    status: 'simulated',
    details: 'No RESEND_API_KEY or BREVO_API_KEY — message not delivered to inbox.',
  };
}
