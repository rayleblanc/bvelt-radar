import { GEO_PLACES, GeoPlace } from "./geoData";

export type D1Like = {
  prepare(q: string): {
    bind(...a: any[]): {
      all(): Promise<{ results: any[] }>;
      run(): Promise<any>;
    };
  };
};

// ---------------------------------------------------------------------------
// Utilidades básicas
// ---------------------------------------------------------------------------

/** Clave única: `${nombre}|${región}|${país}` */
export function placeKey(p: GeoPlace): string {
  return `${p.name}|${p.region}|${p.country}`;
}

/** Radio de influencia (km) según población */
export function radiusKm(pop: number): number {
  return pop >= 500000 ? 25 : pop >= 100000 ? 15 : pop >= 25000 ? 10 : 7;
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalizeStr(str: string): string {
  const s = (str || "").trim();
  // Solo normaliza (NFD) si hay caracteres no ASCII: es más barato en CPU
  const base = /[^\x00-\x7f]/.test(s) ? s.normalize("NFD").replace(/[\u0300-\u036f]/g, "") : s;
  return base.toLowerCase().replace(/\./g, "").replace(/\s+/g, " ").trim();
}

const REGION_NAMES: Record<string, string> = {
  alabama: "al", alaska: "ak", arizona: "az", arkansas: "ar", california: "ca", colorado: "co",
  connecticut: "ct", delaware: "de", "district of columbia": "dc", florida: "fl", georgia: "ga",
  hawaii: "hi", idaho: "id", illinois: "il", indiana: "in", iowa: "ia", kansas: "ks", kentucky: "ky",
  louisiana: "la", maine: "me", maryland: "md", massachusetts: "ma", michigan: "mi", minnesota: "mn",
  mississippi: "ms", missouri: "mo", montana: "mt", nebraska: "ne", nevada: "nv", "new hampshire": "nh",
  "new jersey": "nj", "new mexico": "nm", "new york": "ny", "north carolina": "nc", "north dakota": "nd",
  ohio: "oh", oklahoma: "ok", oregon: "or", pennsylvania: "pa", "rhode island": "ri",
  "south carolina": "sc", "south dakota": "sd", tennessee: "tn", texas: "tx", utah: "ut", vermont: "vt",
  virginia: "va", washington: "wa", "west virginia": "wv", wisconsin: "wi", wyoming: "wy",
  alberta: "ab", "british columbia": "bc", manitoba: "mb", "new brunswick": "nb",
  "newfoundland and labrador": "nl", newfoundland: "nl", "nova scotia": "ns", ontario: "on",
  "prince edward island": "pe", quebec: "qc", saskatchewan: "sk", yukon: "yt",
  "northwest territories": "nt", nunavut: "nu",
};

/** "Texas" / "TX" / "tx." -> "tx" */
function regionCode(raw: string): string {
  const n = normalizeStr(raw);
  return REGION_NAMES[n] || n;
}

// Índice por nombre, construido una sola vez por isolate (lista ya ordenada por población desc)
const BY_NAME = new Map<string, GeoPlace[]>();
for (const p of GEO_PLACES) {
  const k = normalizeStr(p.name);
  const arr = BY_NAME.get(k);
  if (arr) arr.push(p);
  else BY_NAME.set(k, [p]);
}
const POP_DESC = (a: GeoPlace, b: GeoPlace) => (b.population || 0) - (a.population || 0);

/**
 * Nearest known city to browser geolocation (US/CA). Used by Bvelt free-analysis bootstrap.
 */
export function findNearestPlace(lat: number, lon: number, maxKm = 80): GeoPlace | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  let best: GeoPlace | null = null;
  let bestD = Infinity;
  for (const p of GEO_PLACES) {
    if (Math.abs(p.lat - lat) > 1.2) continue;
    const d = haversineKm(lat, lon, p.lat, p.lon);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  if (!best || bestD > maxKm) return null;
  return best;
}

export function formatPlaceLabel(p: GeoPlace): string {
  return `${p.name}, ${p.region}`;
}

/**
 * Busca un lugar a partir de "Austin, TX", "Austin, Texas" o "Austin".
 * - Con región: solo devuelve coincidencias de esa región (si no hay, null; nunca otro estado).
 * - Sin región: el de mayor población con ese nombre.
 */
export function findPlace(label: string): GeoPlace | null {
  if (!label || typeof label !== "string") return null;
  const parts = label.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  const name = normalizeStr(parts[0]);
  const candidates = BY_NAME.get(name);

  if (parts.length >= 2) {
    const region = regionCode(parts[1]);
    if (candidates) {
      const hit = candidates.find((p) => normalizeStr(p.region) === region);
      if (hit) return hit;
    }
    return null;
  }
  if (candidates && candidates.length > 0) return candidates[0];
  return null;
}

// ---------------------------------------------------------------------------
// Selección de objetivos
// ---------------------------------------------------------------------------

interface CoverageRecord {
  tenant_id: string;
  place_key: string;
  trade: string;
  last_searched_at?: string | null;
  searches?: number;
  candidates?: number;
  qualified?: number;
  replies?: number;
  wins?: number;
}

interface Cand {
  place: GeoPlace;
  trade: string;
  score: number;
  prior: number;
  isNew: boolean;
  dist: number; // km al centro (solo tenant)
}

const DAY_MS = 86400000;

function withTuple(p: GeoPlace): GeoPlace {
  // El worker lee place[0], place[1], place[2]
  return Object.assign({}, p, { 0: p.name, 1: p.region, 2: p.country }) as GeoPlace;
}

export async function pickTargets(
  db: D1Like,
  o: {
    tenantId: string;
    trades: string[];
    count: number;
    centerLabel?: string;
    serviceRadiusKm?: number;
    countries?: string[];
    /** Soft ranking only; never excludes countries from the global pool. */
    priorityCountries?: string[];
    /** Restrict pool to these city labels (e.g. "City A, Region"). Prevents national drift to unrelated markets. */
    allowedCities?: string[];
  }
): Promise<{ place: GeoPlace; trade: string; why: string }[]> {
  const count = Math.max(1, Math.min(30, o.count || 5));
  const trades = (o.trades || [])
    .map((t) => String(t).trim())
    .filter(Boolean);
  const isTenantArea = !!o.centerLabel;

  // 1) Resolve the configured center before deriving its country.
  let center: GeoPlace | null = null;
  if (isTenantArea) {
    center = findPlace(o.centerLabel as string);
    if (!center) return [];
  }

  // No implicit trade defaults. Explicit countries narrow the pool; otherwise
  // Founder can explore the available global gazetteer. A Tenant center supplies
  // its country when no explicit country scope was provided.
  const countries = (o.countries && o.countries.length > 0
    ? o.countries
    : center ? [center.country] : [])
    .map((c) => String(c).trim().toUpperCase())
    .filter(Boolean);
  const priorityCountries = new Set((o.priorityCountries || [])
    .map((country) => String(country).trim().toUpperCase())
    .filter(Boolean));
  if (trades.length === 0) return [];

  const maxDist = o.serviceRadiusKm ?? 60;

  // Resolve allowedCities into GeoPlace centers (strict configured markets only)
  const allowedCenters: GeoPlace[] = [];
  if (o.allowedCities && o.allowedCities.length > 0) {
    for (const label of o.allowedCities) {
      const pl = findPlace(label);
      if (pl) allowedCenters.push(pl);
    }
  }

  // 2) Historial (una sola consulta)
  let rows: CoverageRecord[] = [];
  try {
    if (db && typeof db.prepare === "function") {
      const res = await db.prepare("SELECT * FROM geo_coverage WHERE tenant_id=?").bind(o.tenantId).all();
      if (res && Array.isArray(res.results)) rows = res.results;
    }
  } catch {
    rows = [];
  }

  const now = Date.now();
  const hist = new Map<string, CoverageRecord>();
  const regionStats = new Map<string, { q: number; c: number }>();
  const recentByTrade = new Map<string, { lat: number; lon: number; r: number }[]>();
  const keyToPlace = new Map<string, GeoPlace>();

  for (const row of rows) {
    const trade = (row.trade || "").toLowerCase();
    hist.set(`${row.place_key}::${trade}`, row);
    const region = ((row.place_key || "").split("|")[1] || "").toLowerCase();
    const rk = `${trade}::${region}`;
    const st = regionStats.get(rk) || { q: 0, c: 0 };
    st.q += row.qualified || 0;
    st.c += row.candidates || 0;
    regionStats.set(rk, st);

    if (row.last_searched_at) {
      const days = (now - new Date(row.last_searched_at).getTime()) / DAY_MS;
      if (days < 30) {
        const nm = (row.place_key || "").split("|");
        const list = BY_NAME.get(normalizeStr(nm[0] || ""));
        const pl = list ? list.find((p) => p.region === nm[1] && p.country === nm[2]) : undefined;
        if (pl) {
          keyToPlace.set(row.place_key, pl);
          const arr = recentByTrade.get(trade) || [];
          arr.push({ lat: pl.lat, lon: pl.lon, r: radiusKm(pl.population || 0) });
          recentByTrade.set(trade, arr);
        }
      }
    }
  }

  // 3) Pool de lugares
  // Tenant (centerLabel): radio alrededor de la base.
  // allowedCities: solo cuando se pasa explícito (p.ej. tenant multi-ciudad).
  // Founder sin centro: solo países configurados; sin fallback geográfico implícito.
  let pool: GeoPlace[];
  if (center) {
    const dLat = maxDist / 111 + 0.05;
    pool = [];
    for (const p of GEO_PLACES) {
      if (!countries.includes(p.country)) continue;
      if (Math.abs(p.lat - center.lat) > dLat) continue;
      if (haversineKm(center.lat, center.lon, p.lat, p.lon) <= maxDist) pool.push(p);
    }
  } else if (allowedCenters.length > 0 && isTenantArea) {
    // Solo tenant multi-ciudad: restringe a ciudades configuradas
    const radius = 40;
    const dLat = radius / 111 + 0.05;
    const seen = new Set<string>();
    pool = [];
    for (const c of allowedCenters) {
      const ck = placeKey(c);
      if (!seen.has(ck)) {
        seen.add(ck);
        pool.push(c);
      }
      for (const p of GEO_PLACES) {
        if (!countries.includes(p.country)) continue;
        if (Math.abs(p.lat - c.lat) > dLat) continue;
        if (haversineKm(c.lat, c.lon, p.lat, p.lon) > radius) continue;
        const pk = placeKey(p);
        if (seen.has(pk)) continue;
        seen.add(pk);
        pool.push(p);
      }
    }
  } else {
    // Founder: explore every available country unless the operator explicitly narrows scope.
    // Priority countries are ranked higher, never used as an allowlist.
    const eligible = GEO_PLACES.filter((p) => countries.length === 0 || countries.includes(p.country));
    const byPop = [...eligible].sort((a, b) => {
      const priorityA = priorityCountries.has(a.country) ? 1.15 : 1;
      const priorityB = priorityCountries.has(b.country) ? 1.15 : 1;
      return (Math.log(Math.max(b.population || 1, 1)) * priorityB) -
        (Math.log(Math.max(a.population || 1, 1)) * priorityA);
    });
    const top = byPop.slice(0, 150);
    const mid = byPop.slice(150).filter((p) => (p.population || 0) >= 15000);
    const extra: GeoPlace[] = [];
    const midCopy = [...mid];
    for (let i = 0; i < 150 && midCopy.length > 0; i++) {
      const idx = Math.floor(Math.random() * midCopy.length);
      extra.push(midCopy.splice(idx, 1)[0]);
    }
    const seen = new Set<string>();
    pool = [];
    for (const p of [...top, ...extra]) {
      const k = placeKey(p);
      if (seen.has(k)) continue;
      seen.add(k);
      pool.push(p);
    }
  }
  if (pool.length === 0) return [];

  // 4) Candidatos (lugar, oficio) con score
  const cands: Cand[] = [];
  for (const place of pool) {
    const pk = placeKey(place);
    const pop = Math.max(place.population || 1000, 100);
    const region = place.region.toLowerCase();
    const dist = center ? haversineKm(center.lat, center.lon, place.lat, place.lon) : 0;
    for (const trade of trades) {
      const t = trade.toLowerCase();
      const h = hist.get(`${pk}::${t}`);
      let fresh = 1;
      let isNew = true;
      if (h && h.last_searched_at) {
        isNew = false;
        const days = (now - new Date(h.last_searched_at).getTime()) / DAY_MS;
        // Empty/failed scans (0 candidates) must not lock a city+trade for a month.
        // Real hits cool down longer so we do not spam the same market.
        const prevCandidates = Number(h.candidates || 0);
        const cooldownDays = prevCandidates <= 0 ? 5 : 14;
        if (days < cooldownDays) continue;
        fresh = Math.min(1, days / Math.max(cooldownDays, 1));
      }
      // No repetir zonas cubiertas hace <30 días con el mismo oficio
      const recents = recentByTrade.get(t);
      if (recents) {
        let near = false;
        for (const r of recents) {
          if (Math.abs(r.lat - place.lat) > 0.3) continue; // 0.3° ~ 33 km > radio máximo
          if (haversineKm(place.lat, place.lon, r.lat, r.lon) < r.r) {
            near = true;
            break;
          }
        }
        if (near) continue;
      }
      const st = regionStats.get(`${t}::${region}`) || { q: 0, c: 0 };
      const prior = (st.q + 1) / (st.c + 8);
      let score = Math.log(pop) * fresh * (0.5 + prior);
      if (priorityCountries.has(place.country)) score *= 1.15;
      if (center) score *= 1 / (1 + dist / 30); // más cerca de la base = mejor
      cands.push({ place, trade, score, prior, isNew, dist });
    }
  }
  if (cands.length === 0) return [];
  cands.sort((a, b) => b.score - a.score);

  // 5) Selección
  const out: { place: GeoPlace; trade: string; why: string }[] = [];
  const regionCount = new Map<string, number>();
  const tradeCount = new Map<string, number>();
  const chosen: { lat: number; lon: number; r: number }[] = [];
  const chosenKeys = new Set<string>();
  const regionCap = isTenantArea ? count : 2;
  const tradeCap = isTenantArea ? count : Math.ceil(count / Math.min(3, trades.length));

  const allowed = (c: Cand): boolean => {
    const key = `${placeKey(c.place)}::${c.trade.toLowerCase()}`;
    if (chosenKeys.has(key)) return false;
    if ((regionCount.get(c.place.region) || 0) >= regionCap) return false;
    if ((tradeCount.get(c.trade.toLowerCase()) || 0) >= tradeCap) return false;
    if (!isTenantArea) {
      // Founder: un lugar por zona y por corrida (evita NYC + Brooklyn)
      for (const ch of chosen) {
        if (Math.abs(ch.lat - c.place.lat) > 0.3) continue;
        if (haversineKm(c.place.lat, c.place.lon, ch.lat, ch.lon) < Math.max(ch.r, radiusKm(c.place.population || 0))) {
          return false;
        }
      }
    }
    return true;
  };

  const take = (c: Cand, why: string) => {
    out.push({ place: withTuple(c.place), trade: c.trade, why });
    chosenKeys.add(`${placeKey(c.place)}::${c.trade.toLowerCase()}`);
    regionCount.set(c.place.region, (regionCount.get(c.place.region) || 0) + 1);
    tradeCount.set(c.trade.toLowerCase(), (tradeCount.get(c.trade.toLowerCase()) || 0) + 1);
    chosen.push({ lat: c.place.lat, lon: c.place.lon, r: radiusKm(c.place.population || 0) });
  };

  const describe = (c: Cand): string => {
    if (isTenantArea) return `cerca de tu base (${Math.round(c.dist)} km)`;
    if (c.prior > 0.2) return `alto rendimiento en ${c.place.region}`;
    if (c.isNew) return "nunca explorada";
    return `refresco en ${c.place.region}`;
  };

  const neverList = isTenantArea ? [] : cands.filter((c) => c.isNew && (c.place.population || 0) >= 20000);

  let cursor = 0;
  while (out.length < count) {
    const turn = out.length + 1;
    let picked = false;

    // Cada 4º pick (solo founder): exploración aleatoria entre lugares nunca buscados
    if (!isTenantArea && turn % 4 === 0 && neverList.length > 0) {
      for (let tries = 0; tries < 30; tries++) {
        const c = neverList[Math.floor(Math.random() * neverList.length)];
        if (allowed(c)) {
          take(c, "exploración");
          picked = true;
          break;
        }
      }
    }
    if (!picked) {
      while (cursor < cands.length) {
        const c = cands[cursor++];
        if (allowed(c)) {
          take(c, describe(c));
          picked = true;
          break;
        }
      }
    }
    if (!picked) break;
  }

  return out;
}

/** Registra o actualiza una búsqueda en geo_coverage (oficio siempre en minúsculas). */
export async function markSearched(
  db: D1Like,
  tenantId: string,
  place: GeoPlace,
  trade: string,
  s: { candidates: number; qualified: number }
): Promise<void> {
  try {
    if (!db || typeof db.prepare !== "function") return;
    await db
      .prepare(
        `INSERT INTO geo_coverage (tenant_id, place_key, trade, last_searched_at, searches, candidates, qualified, replies, wins)
         VALUES (?, ?, ?, ?, 1, ?, ?, 0, 0)
         ON CONFLICT(tenant_id, place_key, trade) DO UPDATE SET
           last_searched_at = excluded.last_searched_at,
           searches = searches + 1,
           candidates = candidates + excluded.candidates,
           qualified = qualified + excluded.qualified`
      )
      .bind(
        tenantId,
        placeKey(place),
        String(trade || "").toLowerCase(),
        new Date().toISOString(),
        Math.max(0, s.candidates || 0),
        Math.max(0, s.qualified || 0)
      )
      .run();
  } catch {
    // si geo_coverage no existe, no lanza error
  }
}
