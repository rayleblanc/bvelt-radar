/**
 * Phone helpers for Bvelt Radar.
 * IMPORTANT: syntactic validity is not proof that a line is active or has WhatsApp.
 * Founder prospecting currently defaults to the North American Numbering Plan (US/CA).
 */
export type DefaultPhoneCountry = "US" | "CA";

export function normalizePhoneE164(
  raw: unknown,
  defaultCountry: DefaultPhoneCountry = "US"
): string | null {
  if (raw == null) return null;
  let value = String(raw).trim();
  if (!value) return null;

  // Remove extension suffixes before normalizing.
  value = value.replace(/(?:ext\.?|extension|x|#)\s*\d+\s*$/i, "").trim();
  const hasPlus = value.startsWith("+");
  const has00Prefix = value.startsWith("00");
  let digits = value.replace(/\D/g, "");
  if (has00Prefix && digits.startsWith("00")) digits = digits.slice(2);

  if (hasPlus || has00Prefix) {
    if (digits.length < 8 || digits.length > 15 || digits.startsWith("0")) return null;
    return `+${digits}`;
  }

  // US and Canada share country calling code +1.
  if (defaultCountry === "US" || defaultCountry === "CA") {
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  }
  // Do not guess an international country code from an unprefixed number.
  return null;
}

export function toWhatsAppUrl(
  raw: unknown,
  message = ""
): string | null {
  if (raw == null) return null;
  const value = String(raw).trim();
  // WhatsApp direct links must never guess a country code from a national number.
  if (!value.startsWith("+") && !value.startsWith("00")) return null;
  const e164 = normalizePhoneE164(value);
  if (!e164) return null;
  const digits = e164.slice(1);
  const query = message ? `?text=${encodeURIComponent(message)}` : "";
  return `https://wa.me/${digits}${query}`;
}

/** Opens the user's native SMS composer; it does not send a message or need a provider. */
export function toSmsUrl(
  raw: unknown,
  message = "",
  defaultCountry: DefaultPhoneCountry = "US"
): string | null {
  const e164 = normalizePhoneE164(raw, defaultCountry);
  if (!e164) return null;
  const query = message ? `?body=${encodeURIComponent(message)}` : "";
  return `sms:${e164}${query}`;
}

/** Opens the native dialler. */
export function toTelUrl(
  raw: unknown,
  defaultCountry: DefaultPhoneCountry = "US"
): string | null {
  const e164 = normalizePhoneE164(raw, defaultCountry);
  return e164 ? `tel:${e164}` : null;
}


/**
 * Prefer the installed WhatsApp app on mobile. Android's intent URL targets the
 * WhatsApp package and carries a browser fallback; iOS uses the registered
 * whatsapp:// scheme. Desktop keeps the universal wa.me URL.
 */
export function toWhatsAppLaunchUrl(
  raw: unknown,
  message = "",
  userAgent = ""
): string | null {
  const webUrl = toWhatsAppUrl(raw, message);
  if (!webUrl) return null;
  const value = String(raw).trim();
  const e164 = normalizePhoneE164(value);
  if (!e164) return null;
  const phone = e164.slice(1);
  const text = message ? `&text=${encodeURIComponent(message)}` : "";
  const ua = String(userAgent).toLowerCase();
  if (/android/.test(ua)) {
    return `intent://send?phone=${phone}${text}#Intent;scheme=whatsapp;package=com.whatsapp;S.browser_fallback_url=${encodeURIComponent(webUrl)};end`;
  }
  if (/iphone|ipad|ipod/.test(ua)) {
    return `whatsapp://send?phone=${phone}${text}`;
  }
  return webUrl;
}
