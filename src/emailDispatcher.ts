/**
 * Outbound Email Dispatcher for Bvelt Radar
 * Providers: Resend → Brevo → simulated
 * Brand: every real email includes Bvelt icon + CTA https://bvelt.app/
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
  resendApiKey?: string;
  brevoApiKey?: string;
  senderName?: string;
  logoUrl?: string;
}

export interface EmailDispatchResult {
  success: boolean;
  provider: 'resend' | 'brevo' | 'simulated';
  messageId: string;
  status: 'dispatched' | 'simulated' | 'failed';
  error?: string;
  details?: string;
}

export function normalizeOutreachBody(body: string): string {
  let b = (body || '').trim();
  b = b.replace(/https?:\/\/bvelt\.app\/demo\?[^\s)\]>"]+/gi, BVELT_SITE);
  b = b.replace(/https?:\/\/bvelt\.app\/demo\b/gi, BVELT_SITE);
  b = b.replace(/https?:\/\/[a-z0-9.-]*workers\.dev\/demo[^\s)\]>"]*/gi, BVELT_SITE);
  if (!/bvelt\.app/i.test(b)) {
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

export function buildBrandedEmailHtml(bodyText: string, logoUrl?: string): string {
  const logo = logoUrl || BVELT_ICON_URL;
  const paragraphs = escapeHtml(bodyText)
    .split(/\n\n+/)
    .map((p) => p.replace(/\n/g, '<br/>'))
    .map((p) => `<p style="margin:0 0 14px 0;line-height:1.5;color:#0f172a;font-size:15px;">${p}</p>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/></head>
<body style="margin:0;padding:0;background:#f1f5f9;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f5f9;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
        <tr>
          <td style="padding:20px 24px 8px 24px;background:#0f172a;">
            <img src="${escapeHtml(logo)}" width="48" height="48" alt="Bvelt" style="display:block;border:0;border-radius:10px;"/>
            <div style="margin-top:10px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:13px;font-weight:700;letter-spacing:0.04em;color:#93c5fd;">BVELT</div>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 24px 8px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
            ${paragraphs}
          </td>
        </tr>
        <tr>
          <td style="padding:8px 24px 24px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
            <a href="${BVELT_SITE}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 18px;border-radius:8px;">Open Bvelt</a>
            <p style="margin:16px 0 0 0;font-size:12px;color:#64748b;line-height:1.4;">
              <a href="${BVELT_SITE}" style="color:#2563eb;text-decoration:none;">${BVELT_SITE}</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
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

  const subject = (options.subject || 'Quick question from Bvelt').trim();
  const body = normalizeOutreachBody(options.body || '');
  const senderName = options.senderName || 'Rainer — Bvelt';
  const html = buildBrandedEmailHtml(body, options.logoUrl);

  if (options.resendApiKey && options.resendApiKey.trim()) {
    try {
      const fromAddress =
        options.from && options.from.includes('@')
          ? options.from.trim()
          : `${senderName} <onboarding@resend.dev>`;

      const payload: Record<string, unknown> = {
        from: fromAddress,
        to: [to],
        subject,
        text: body,
        html,
        headers: { 'X-Entity-Ref-ID': options.prospectId || `lead_${Date.now()}` },
      };
      if (options.replyTo && options.replyTo.includes('@')) {
        payload.reply_to = options.replyTo.trim();
      }

      const reqHeaders: Record<string, string> = {
        Authorization: `Bearer ${options.resendApiKey.trim()}`,
        'Content-Type': 'application/json',
      };
      if (options.prospectId) {
        reqHeaders['Idempotency-Key'] = `send-prospect/${options.prospectId}`.substring(0, 256);
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
      const fromEmail =
        options.from && options.from.includes('@')
          ? options.from.replace(/.*</, '').replace(/>.*/, '').trim()
          : 'noreply@bvelt.app';

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
          htmlContent: html,
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
