import { GEO_PLACES, GeoPlace } from "./geoData";

export function placeKey(place: any): string {
  if (Array.isArray(place)) {
    return `${place[0]}:${place[1]}`;
  }
  if (place && typeof place === "object") {
    return `${place.name || place[0] || "Unknown"}:${place.region || place[1] || "US"}`;
  }
  return String(place || "unknown:US");
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function radiusKm(center: [number, number], point: [number, number]): number {
  return haversineKm(center[0], center[1], point[0], point[1]);
}

export function findPlace(cityName: string): any | null {
  if (!cityName) return null;
  const clean = cityName.toLowerCase().trim();
  for (const p of GEO_PLACES) {
    const name = (p.name || p[0] || "").toLowerCase();
    const region = (p.region || p[1] || "").toLowerCase();
    const full = `${name}, ${region}`;
    if (clean === name || clean === full || clean.startsWith(name)) {
      return [p.name || p[0], p.region || p[1], p.country || p[2], p.lat, p.lon];
    }
  }
  // Fallback to first place if not found
  const first = GEO_PLACES[0];
  if (first) {
    return [first.name || first[0], first.region || first[1], first.country || first[2], first.lat, first.lon];
  }
  return null;
}

export async function pickTargets(
  db: any,
  options: {
    tenantId?: string;
    trades: string[];
    count?: number;
    centerLabel?: string;
    serviceRadiusKm?: number;
    countries?: string[];
  }
): Promise<{ place: any; trade: string; why: string }[]> {
  const tenantId = options.tenantId || "founder";
  const trades = options.trades && options.trades.length > 0 ? options.trades : ["plumber", "electrician"];
  const count = options.count || 10;
  const countries = options.countries || ["US", "CA"];

  let candidatePlaces = GEO_PLACES.filter(p => countries.includes(p.country || p[2] as string));

  if (options.centerLabel) {
    const center = GEO_PLACES.find(p => 
      (p.name || p[0] || "").toLowerCase() === options.centerLabel!.toLowerCase() ||
      `${p.name}, ${p.region}`.toLowerCase() === options.centerLabel!.toLowerCase()
    );
    if (center && options.serviceRadiusKm) {
      candidatePlaces = candidatePlaces.filter(p => {
        const dist = haversineKm(center.lat, center.lon, p.lat, p.lon);
        return dist <= (options.serviceRadiusKm || 60);
      });
    }
  }

  if (candidatePlaces.length === 0) {
    candidatePlaces = [...GEO_PLACES];
  }

  let coverageMap = new Map<string, any>();
  if (db && typeof db.prepare === "function") {
    try {
      const rows = await db.prepare("SELECT * FROM geo_coverage WHERE tenant_id = ?").bind(tenantId).all();
      if (rows && rows.results) {
        for (const r of rows.results) {
          coverageMap.set(`${r.place_key}:${r.trade}`, r);
        }
      }
    } catch (e) {
      // table might not exist yet or query failed
    }
  }

  const picks: { place: any; trade: string; why: string }[] = [];

  // Sort candidate places by least searches / oldest last_searched_at if coverage exists
  const scoredPlaces = candidatePlaces.map(p => {
    const placeArr = [p.name || p[0], p.region || p[1], p.country || p[2], p.lat, p.lon];
    const pKey = placeKey(placeArr);
    let totalSearches = 0;
    let oldestDate = "";
    for (const trade of trades) {
      const cov = coverageMap.get(`${pKey}:${trade}`);
      if (cov) {
        totalSearches += (cov.searches || 0);
        if (!oldestDate || (cov.last_searched_at && cov.last_searched_at < oldestDate)) {
          oldestDate = cov.last_searched_at;
        }
      }
    }
    return { place: placeArr, totalSearches, oldestDate, raw: p };
  });

  scoredPlaces.sort((a, b) => {
    if (a.totalSearches !== b.totalSearches) {
      return a.totalSearches - b.totalSearches;
    }
    return (a.oldestDate || "").localeCompare(b.oldestDate || "");
  });

  for (let i = 0; i < count; i++) {
    const sp = scoredPlaces[i % scoredPlaces.length];
    const trade = trades[i % trades.length];
    const pKey = placeKey(sp.place);
    const cov = coverageMap.get(`${pKey}:${trade}`);
    const why = cov ? `Searched ${cov.searches} times, last at ${cov.last_searched_at || 'never'}` : 'Fresh high-priority frontier target';

    picks.push({
      place: sp.place,
      trade,
      why
    });
  }

  return picks;
}

export async function markSearched(
  db: any,
  tenantId: string,
  place: any,
  trade: string,
  stats: { candidates: number; qualified: number }
): Promise<void> {
  if (!db || !place || !trade) return;
  const pKey = placeKey(place);
  const now = new Date().toISOString();
  const tradeLower = trade.toLowerCase();

  try {
    const existing = await db.prepare(
      "SELECT * FROM geo_coverage WHERE tenant_id = ? AND place_key = ? AND trade = ?"
    ).bind(tenantId, pKey, tradeLower).first();

    if (existing) {
      await db.prepare(`
        UPDATE geo_coverage 
        SET last_searched_at = ?, searches = searches + 1, candidates = candidates + ?, qualified = qualified + ?
        WHERE tenant_id = ? AND place_key = ? AND trade = ?
      `).bind(now, stats.candidates, stats.qualified, tenantId, pKey, tradeLower).run();
    } else {
      await db.prepare(`
        INSERT INTO geo_coverage (tenant_id, place_key, trade, last_searched_at, searches, candidates, qualified, replies, wins)
        VALUES (?, ?, ?, ?, 1, ?, ?, 0, 0)
      `).bind(tenantId, pKey, tradeLower, now, stats.candidates, stats.qualified).run();
    }
  } catch (e) {
    console.warn("[geoFrontier] markSearched error:", e);
  }
}
