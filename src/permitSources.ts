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
  // Chicago Building Permits
  chicago: { domain: "data.cityofchicago.org", dataset: "ydr8-5enu" },
  // SF Building Permits
  "san francisco": { domain: "data.sfgov.org", dataset: "i98e-djp9" },
  // New Orleans
  "new orleans": { domain: "data.nola.gov", dataset: "72f9-bi28" },
  // Los Angeles LADBS (building + related)
  "los angeles": { domain: "data.lacity.org", dataset: "pi9x-tg5x" },
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
    if (matched) {
      source = PERMIT_SOURCES[matched];
    }
  }

  if (!source) {
    return [];
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    // Calculate cutoff date for 90 days ago (YYYY-MM-DD)
    const cutoffDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const yyyy = cutoffDate.getUTCFullYear();
    const mm = String(cutoffDate.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(cutoffDate.getUTCDate()).padStart(2, '0');
    const dateFormatted = `${yyyy}-${mm}-${dd}`;

    const url = new URL(`https://${source.domain}/resource/${source.dataset}.json`);
    url.searchParams.set('$limit', '2000');
    url.searchParams.set('$order', 'issued_date DESC');
    url.searchParams.set('$where', `issued_date > '${dateFormatted}T00:00:00'`);
    url.searchParams.set('$select', 'contractor_company_name,contractor_phone,contractor_trade,contractor_city,contractor_zip,issued_date');

    let response = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        Accept: 'application/json'
      }
    });

    if (!response.ok) {
      url.searchParams.delete('$select');
      response = await fetch(url.toString(), {
        signal: controller.signal,
        headers: {
          Accept: 'application/json'
        }
      });
    }

    if (!response.ok) {
      return [];
    }

    const rows = await response.json();
    if (!Array.isArray(rows)) {
      return [];
    }

    const tradeRegex = getTradeRegex(trade);
    const grouped = new Map<string, {
      name: string;
      phone: string | null;
      trade: string | null;
      city: string | null;
      zip: string | null;
      permits_90d: number;
      last_issued: string | null;
    }>();

    for (const row of rows) {
      if (!row || typeof row !== 'object') continue;

      const rawCompanyName = String(findFieldValue(row, 'contractor_company') || '').trim();
      if (!rawCompanyName) continue;

      const rawTrade = findFieldValue(row, 'contractor_trade');
      const tradeStr = rawTrade ? String(rawTrade).trim() : null;

      // Filter by trade over contractor_trade and contractor_company
      const tradeCandidate = tradeStr ? `${tradeStr} ${rawCompanyName}` : rawCompanyName;
      if (!tradeRegex.test(tradeCandidate)) {
        continue;
      }

      const normalizedKey = normalizeContractorName(rawCompanyName);
      if (!normalizedKey) continue;

      const rawPhone = findFieldValue(row, 'contractor_phone');
      const phoneCandidate = cleanPhone(rawPhone);

      const rawCity = findFieldValue(row, 'contractor_city');
      const cityCandidate = rawCity ? String(rawCity).trim() : null;

      const rawZip = findFieldValue(row, 'contractor_zip');
      const zipCandidate = rawZip ? String(rawZip).trim().slice(0, 10) : null;

      const rawIssued = findFieldValue(row, 'issued_date');
      const issuedCandidate = rawIssued ? String(rawIssued).trim() : null;

      const existing = grouped.get(normalizedKey);
      if (existing) {
        existing.permits_90d += 1;
        if (!existing.phone && phoneCandidate) {
          existing.phone = phoneCandidate;
        }
        if (!existing.city && cityCandidate) {
          existing.city = cityCandidate;
        }
        if (!existing.zip && zipCandidate) {
          existing.zip = zipCandidate;
        }
        if (!existing.trade && tradeStr) {
          existing.trade = tradeStr;
        }
        if (issuedCandidate) {
          if (!existing.last_issued || issuedCandidate > existing.last_issued) {
            existing.last_issued = issuedCandidate;
          }
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

    const contractors: PermitContractor[] = Array.from(grouped.values())
      .map(entry => ({
        ...entry,
        source: "permits" as const
      }))
      .sort((a, b) => b.permits_90d - a.permits_90d)
      .slice(0, limit);

    return contractors;
  } catch {
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}
