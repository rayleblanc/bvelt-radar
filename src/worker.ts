/**
 * bvelt-radar Cloudflare Worker API & Background Engine
 */

export interface Env {
  RADAR_DB?: any;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  TELEGRAM_OPS_NOTIFY?: string;
  FOUNDER_AUTO_OUTREACH?: string;
  FOUNDER_AUTO_MIN_SCORE?: string;
  FOUNDER_AUTO_MAX_PER_DAY?: string;
  RESEND_API_KEY?: string;
  BREVO_API_KEY?: string;
}

export interface EmailTemplateVariants {
  casual: string;
  profesional: string;
  urgente: string;
}

export interface TenantConfig {
  tenant_id: string;
  tenant_name: string;
  industry: string;
  niche: string;
  icp_description: string;
  service_areas: string[];
  tenant_telegram_chat_id?: string;
  active_variant?: 'casual' | 'profesional' | 'urgente';
  email_templates?: EmailTemplateVariants;
}

export function renderEmailTemplate(
  templateText: string,
  variables: Record<string, string>
): string {
  let result = templateText;
  for (const [key, value] of Object.entries(variables)) {
    const placeholder = new RegExp(`{{\\s*${key}\\s*}}`, 'gi');
    result = result.replace(placeholder, value || '');
  }
  return result;
}

export function validateIcpAlignment(
  niche: string,
  icpDescription: string,
  serviceAreas: string[]
): {
  isValid: boolean;
  warnings: string[];
  missingFields: {
    niche: boolean;
    icpDescription: boolean;
    serviceAreas: boolean;
    alignmentRisk: boolean;
  };
} {
  const warnings: string[] = [];
  const missingFields = {
    niche: !niche || niche.trim().length === 0,
    icpDescription: !icpDescription || icpDescription.trim().length < 10,
    serviceAreas: !serviceAreas || serviceAreas.length === 0 || serviceAreas.every(a => !a.trim()),
    alignmentRisk: false
  };

  if (missingFields.niche) {
    warnings.push("El campo 'Nicho' es obligatorio para orientar la prospección.");
  }

  if (missingFields.icpDescription) {
    warnings.push("La 'Descripción de ICP' está incompleta o es muy breve (mínimo 10 caracteres).");
  }

  if (missingFields.serviceAreas) {
    warnings.push("Debes especificar al menos un 'Área de Servicio' (ej. Tampa, FL).");
  }

  // Check semantic alignment keywords
  if (!missingFields.niche && !missingFields.icpDescription) {
    const lowerNiche = niche.toLowerCase().trim();
    const lowerDesc = icpDescription.toLowerCase().trim();

    // Key domain words check
    const nicheKeywordsMap: Record<string, string[]> = {
      plumbing: ["fontanería", "plumbing", "tubería", "agua", "fuga", "desagüe", "plumber"],
      hvac: ["aire", "acondicionado", "climatización", "hvac", "calefacción", "ducto", "cooling", "heating"],
      roofing: ["techo", "cubierta", "roof", "roofing", "goteras", "teja"],
      electrical: ["electricidad", "electricista", "electric", "cableado", "voltaje"],
      lawn_care: ["jardín", "césped", "lawn", "landscaping", "patios", "piscina"],
      property_management: ["propiedades", "alquiler", "renta", "inquilino", "mantenimiento", "property", "tenant", "edificio"]
    };

    const expectedKeywords = nicheKeywordsMap[lowerNiche] || [lowerNiche];
    const hasOverlap = expectedKeywords.some(kw => lowerDesc.includes(kw));

    if (!hasOverlap) {
      missingFields.alignmentRisk = true;
      warnings.push(`Posible desalineación: La descripción del ICP no contiene términos típicos del nicho '${niche}'. Se recomienda incluir palabras clave relacionadas.`);
    }
  }

  const isValid = !missingFields.niche && !missingFields.icpDescription && !missingFields.serviceAreas && !missingFields.alignmentRisk;

  return {
    isValid,
    warnings,
    missingFields
  };
}

export async function sendTelegramAlert(
  env: Env,
  text: string,
  customChatId?: string
): Promise<{ ok: boolean; targetChat: string; error?: string }> {
  const token = env.TELEGRAM_BOT_TOKEN ? env.TELEGRAM_BOT_TOKEN.trim() : "";
  const targetChat = (customChatId && customChatId.trim()) ? customChatId.trim() : (env.TELEGRAM_CHAT_ID ? env.TELEGRAM_CHAT_ID.trim() : "");

  if (!token || !targetChat) {
    return {
      ok: false,
      targetChat: targetChat || "No configurado",
      error: "Falta TELEGRAM_BOT_TOKEN o CHAT_ID en la configuración."
    };
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: targetChat,
        text,
        parse_mode: "HTML"
      })
    });

    const data: any = await res.json().catch(() => ({}));
    return {
      ok: res.ok && data.ok !== false,
      targetChat,
      error: data.description || (res.ok ? undefined : `HTTP ${res.status}`)
    };
  } catch (e: any) {
    return {
      ok: false,
      targetChat,
      error: e?.message || "Error de red al conectar con Telegram"
    };
  }
}
