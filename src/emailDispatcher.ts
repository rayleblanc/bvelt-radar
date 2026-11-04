/**
 * Outbound Email Dispatcher for Bvelt Radar
 * Supports 100% free outbound providers:
 * 1. Resend (Free 3,000 emails/month, 100/day) - High deliverability REST API
 * 2. Brevo (Free 300 emails/day) - Transactional SMTP REST API
 * 3. Simulated Mode (when no keys provided) - Logs diagnostic details & guides user
 */

import { sanitizeEmail } from './emailSanitizer';

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
}

export interface EmailDispatchResult {
  success: boolean;
  provider: 'resend' | 'brevo' | 'simulated';
  messageId: string;
  status: 'dispatched' | 'simulated' | 'failed';
  error?: string;
  details?: string;
}

/**
 * Dispatches an outbound cold outreach email using the available free tier provider
 */
export async function dispatchEmail(options: EmailDispatchOptions): Promise<EmailDispatchResult> {
  const sanitizeRes = sanitizeEmail(options.to);
  if (!sanitizeRes.valid || !sanitizeRes.email) {
    return {
      success: false,
      provider: 'simulated',
      messageId: '',
      status: 'failed',
      error: `Dirección de correo electrónico no válida (${sanitizeRes.reason || 'sanitizer_rejected'}). Envío cancelado sin marcar como rebote.`
    };
  }

  const to = sanitizeRes.email;

  const subject = (options.subject || 'Bvelt - Pregunta rápida').trim();
  const body = (options.body || '').trim();
  const senderName = options.senderName || 'Bvelt';

  // -------------------------------------------------------------
  // Provider 1: Resend (Free tier: 3,000/mo, 100/day)
  // -------------------------------------------------------------
  if (options.resendApiKey && options.resendApiKey.trim()) {
    try {
      // Default Resend test sender is onboarding@resend.dev unless user has verified custom domain
      const fromAddress = options.from && options.from.includes('@')
        ? options.from.trim()
        : 'Bvelt <onboarding@resend.dev>';

      const payload: any = {
        from: fromAddress,
        to: [to],
        subject: subject,
        text: body,
        headers: {
          'X-Entity-Ref-ID': options.prospectId || `lead_${Date.now()}`
        }
      };

      if (options.replyTo && options.replyTo.includes('@')) {
        payload.reply_to = options.replyTo.trim();
      }

      const reqHeaders: Record<string, string> = {
        'Authorization': `Bearer ${options.resendApiKey.trim()}`,
        'Content-Type': 'application/json'
      };

      if (options.prospectId) {
        reqHeaders['Idempotency-Key'] = `send-prospect/${options.prospectId}`.substring(0, 256);
      }

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: reqHeaders,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(8000)
      });

      const resJson: any = await res.json().catch(() => ({}));

      if (res.ok && resJson.id) {
        return {
          success: true,
          provider: 'resend',
          messageId: String(resJson.id),
          status: 'dispatched',
          details: `Enviado con éxito a través de Resend API a ${to}`
        };
      } else {
        if (res.status === 409) {
          return {
            success: false,
            provider: 'resend',
            messageId: '',
            status: 'failed',
            error: resJson.message,
            details: resJson.name ? `${resJson.name}: ${resJson.message}` : resJson.message
          };
        }

        let errorMsg = resJson.message || `Error HTTP ${res.status} en Resend`;
        const resendMsg = (resJson.message || '').toLowerCase();
        if (res.status === 403 && (resendMsg.includes('testing emails') || resendMsg.includes('verify a domain'))) {
          errorMsg = 'Resend: el dominio resend.dev solo envía a tu propio correo. Verifica un dominio en resend.com/domains y usa un From de ese dominio.';
        }

        return {
          success: false,
          provider: 'resend',
          messageId: '',
          status: 'failed',
          error: errorMsg,
          details: resJson.name ? `${resJson.name}: ${errorMsg}` : errorMsg
        };
      }
    } catch (err: any) {
      return {
        success: false,
        provider: 'resend',
        messageId: '',
        status: 'failed',
        error: `Excepción de red conectando con Resend: ${err.message}`
      };
    }
  }

  // -------------------------------------------------------------
  // Provider 2: Brevo / Sendinblue (Free tier: 300/day)
  // -------------------------------------------------------------
  if (options.brevoApiKey && options.brevoApiKey.trim()) {
    try {
      const fromEmail = options.from && options.from.includes('@')
        ? options.from.trim()
        : 'founder@bvelt.app';

      const payload: any = {
        sender: { name: senderName, email: fromEmail },
        to: [{ email: to, name: options.recipientName || 'Contractor' }],
        subject: subject,
        textContent: body
      };

      if (options.replyTo && options.replyTo.includes('@')) {
        payload.replyTo = { email: options.replyTo.trim() };
      }

      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': options.brevoApiKey.trim(),
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(8000)
      });

      const resJson: any = await res.json().catch(() => ({}));

      if (res.ok && (resJson.messageId || resJson.messageIds)) {
        const mid = resJson.messageId || resJson.messageIds?.[0] || `brevo_${Date.now()}`;
        return {
          success: true,
          provider: 'brevo',
          messageId: String(mid),
          status: 'dispatched',
          details: `Enviado con éxito a través de Brevo API a ${to}`
        };
      } else {
        const errorMsg = resJson.message || `Error HTTP ${res.status} en Brevo`;
        return {
          success: false,
          provider: 'brevo',
          messageId: '',
          status: 'failed',
          error: errorMsg
        };
      }
    } catch (err: any) {
      return {
        success: false,
        provider: 'brevo',
        messageId: '',
        status: 'failed',
        error: `Excepción de red conectando con Brevo: ${err.message}`
      };
    }
  }

  // -------------------------------------------------------------
  // Simulation Mode (Dry-run with clear guidance)
  // -------------------------------------------------------------
  const simId = `sim_${Math.random().toString(36).substring(2, 10)}`;
  return {
    success: true,
    provider: 'simulated',
    messageId: simId,
    status: 'simulated',
    details: 'Modo Simulado: Correo registrado en base de datos. Para que los correos salgan a la bandeja del destinatario, configura RESEND_API_KEY en variables de Cloudflare (3,000 correos/mes gratis en resend.com).'
  };
}
