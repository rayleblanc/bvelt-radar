/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Bvelt Radar — Public Municipal Permit Sources Engine
 */

export interface PermitContractor {
  name: string;
  phone: string | null;
  trade: string | null;
  city: string | null;
  zip: string | null;
  permits_90d: number;
  last_issued: string | null;
  source: "permits";
}

/**
 * Free municipal open-data permit feeds (Socrata SODA — no API key for moderate use).
 * Keys are lowercase city names matched against discovery city labels.
 * Expand carefully: only verified public datasets.
 */
export const PERMIT_SOURCES: Record<string, { domain: string; dataset: string }> = {
  austin: { domain: "data.austintexas.gov", dataset: "3syk-w9eu" },
  chicago: { domain: "data.cityofchicago.org", dataset: "ydr8-5enu" },
  "san francisco": { domain: "data.sfgov.org", dataset: "i98e-djp9" },
  "new orleans": { domain: "data.nola.gov", dataset: "72f9-bi28" },
  "los angeles": { domain: "data.lacity.org", dataset: "pi9x-tg5x" },
  seattle: { domain: "data.seattle.gov", dataset: "76t5-zqzr" },
  "new york": { domain: "data.cityofnewyork.us", dataset: "ipu4-2q9a" },
};

/**
 * Escapes regex special characters for generic trade fallback queries.
 */
function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Returns trade matching regex based on trade name.
 */
function getTradeRegex(trade: string): RegExp {
  const t = trade.toLowerCase().trim();
  if (t === 'hvac') {
    return /hvac|air|heating|mechanical|cool/i;
  }
  if (t === 'plumbing') {
    return /plumb/i;
  }
  if (t === 'electrical') {
    return /electric/i;
  }
  if (t === 'roofing') {
    return /roof/i;
  }
  if (t === 'landscaping' || t === 'lawn_care' || t === 'lawn') {
    return /landscap|lawn|irrigat/i;
  }
  return new RegExp(escapeRegex(t), 'i');
}

/**
 * Normalizes company name: uppercase, removes punctuation and LLC/INC suffixes.
 */
function normalizeContractorName(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\b(LLC|INC)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalizes phone number strictly to 10 digits; otherwise returns null.
 */
function cleanPhone(rawPhone: unknown): string | null {
  if (!rawPhone) return null;
  const digits = String(rawPhone).replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return digits.slice(1);
  }
  return digits.length === 10 ? digits : null;
}

/**
 * Defensively extracts value from record matching a substring pattern in key names.
 */
function findFieldValue(record: Record<string, unknown>, pattern: string): unknown {
  if (!record || typeof record !== 'object') return null;
  const targetPattern = pattern.toLowerCase();
  const matchedKey = Object.keys(record).find(k => k.toLowerCase().includes(targetPattern));
  return matchedKey ? record[matchedKey] : null;
}

/**
 * Fetches and groups recent municipal permit records for local contractors.
 * 
 * @param city City name (e.g. "Austin" or "austin")
 * @param trade Trade name (e.g. "plumbing", "hvac", "roofing")
 * @param limit Max grouped contractors to return (default: 60)
 */
export async function fetchPermitContractors(
  city: string,
  trade: string,
  limit = 60
): Promise<PermitContractor[]> {
  const cityKey = (city || '').toLowerCase().trim();
  let source = PERMIT_SOURCES[cityKey];
  if (!source) {
    const matched = Object.keys(PERMIT_SOURCES).find(k => cityKey.includes(k));
    if (matched) source = PERMIT_SOURCES[matched];
    else if (cityKey.includes('nyc')) source = PERMIT_SOURCES['new york'];
  }
  if (!source) return [];

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 9000);

  try {
    // Cada ciudad usa columnas distintas: antes solo Austin funcionaba. Ahora se leen con nombres candidatos
    // y sin $select/$where por columna (que rompían en otras ciudades); el filtro de fecha se hace aquí.
    const base = `https://${source.domain}/resource/${source.dataset}.json?$limit=2000`;
    let response = await fetch(`${base}&$order=${encodeURIComponent(':updated_at DESC')}`, {
      signal: controller.signal, headers: { Accept: 'application/json' }
    }).catch(() => null);
    if (!response || !response.ok) {
      response = await fetch(base, { signal: controller.signal, headers: { Accept: 'application/json' } }).catch(() => null);
    }
    if (!response || !response.ok) return [];

    const rows = await response.json();
    if (!Array.isArray(rows)) return [];

    const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
    const tradeRegex = getTradeRegex(trade);
    const grouped = new Map<string, {
      name: string; phone: string | null; trade: string | null; city: string | null;
      zip: string | null; permits_90d: number; last_issued: string | null;
    }>();

    const NAME_KEYS = ['contractor_company_name', 'contractors_business_name', 'contractorcompanyname', 'permittee_s_business_name', 'contractor_name', 'contractor'];
    const PHONE_KEYS = ['contractor_phone', 'contractor_phone_number', 'contractorphone', 'permittee_s_phone__', 'contact_1_phone'];
    const DATE_KEYS = ['issued_date', 'issue_date', 'issuance_date', 'issueddate', 'permit_issue_date', 'issued'];
    const DESC_KEYS = ['description', 'work_description', 'permit_description', 'permit_type', 'permit_type_desc', 'work_type', 'worktype'];

    const firstOf = (row: Record<string, unknown>, keys: string[], frag?: string): string => {
      for (const k of keys) {
        const v = row[k];
        if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
      }
      if (frag) {
        const v = findFieldValue(row, frag);
        if (v !== null && v !== undefined && String(v).trim() !== '') return String(v).trim();
      }
      return '';
    };

    for (const row of rows) {
      if (!row || typeof row !== 'object') continue;
      const r = row as Record<string, unknown>;

      let rawCompanyName = firstOf(r, NAME_KEYS, 'contractor');
      // Chicago: contactos numerados con su tipo; se toma el que sea contratista
      if (!rawCompanyName) {
        for (let i = 1; i <= 5; i++) {
          const type = String(r[`contact_${i}_type`] || '').toLowerCase();
          const nm = String(r[`contact_${i}_name`] || '').trim();
          if (nm && /contractor|plumb|electric|hvac|roof|mechanical/.test(type)) { rawCompanyName = nm; break; }
        }
      }
      if (!rawCompanyName) continue;

      const dateStr = firstOf(r, DATE_KEYS, 'issue');
      if (dateStr) {
        const ms = new Date(dateStr).getTime();
        if (!isNaN(ms) && ms < cutoff) continue;
      }

      const desc = firstOf(r, DESC_KEYS);
      const tradeStr = firstOf(r, ['contractor_trade', 'contractor_trade_description']) || null;
      const tradeCandidate = `${tradeStr || ''} ${rawCompanyName} ${desc}`;
      if (!tradeRegex.test(tradeCandidate)) continue;

      const normalizedKey = normalizeContractorName(rawCompanyName);
      if (!normalizedKey) continue;

      const phoneCandidate = cleanPhone(firstOf(r, PHONE_KEYS, 'phone'));
      const cityCandidate = firstOf(r, ['contractor_city', 'contractor_address_city']) || null;
      const zipCandidate = (firstOf(r, ['contractor_zip', 'contractor_zipcode']) || '').slice(0, 10) || null;
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
          name: rawCompanyName, phone: phoneCandidate, trade: tradeStr,
          city: cityCandidate, zip: zipCandidate, permits_90d: 1, last_issued: issuedCandidate
        });
      }
    }

    return Array.from(grouped.values())
      .map(entry => ({ ...entry, source: "permits" as const }))
      .sort((a, b) => b.permits_90d - a.permits_90d)
      .slice(0, limit);
  } catch {
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}
