/**
 * Weather Signals Integration for Bvelt Radar
 * Fetches active NWS weather alerts and maps severe weather events to contractor trades.
 */

export interface WeatherAlert {
  event: string;
  areaDesc: string;
  expires: string;
}

/**
 * Fetches active weather alerts for specified states from weather.gov
 */
export async function getAlerts(states: string[]): Promise<WeatherAlert[]> {
  if (!states || states.length === 0) return [];

  const cleanStates = Array.from(
    new Set(
      states
        .map(s => (s || "").trim().toUpperCase())
        .filter(s => s.length === 2 && /^[A-Z]{2}$/.test(s))
    )
  );

  if (cleanStates.length === 0) return [];

  const url = `https://api.weather.gov/alerts/active?area=${cleanStates.join(',')}`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "BveltRadar/1 (contact: bvelt.app)",
        "Accept": "application/geo+json"
      },
      signal: AbortSignal.timeout(7000)
    });

    if (!res.ok) return [];

    const data: any = await res.json();
    if (!data || !Array.isArray(data.features)) return [];

    const alerts: WeatherAlert[] = [];
    for (const feature of data.features) {
      const props = feature?.properties;
      if (props && props.event && props.areaDesc) {
        alerts.push({
          event: String(props.event),
          areaDesc: String(props.areaDesc),
          expires: String(props.expires || '')
        });
      }
    }
    return alerts;
  } catch (e) {
    return [];
  }
}

/**
 * Maps a weather event name to relevant contractor/service trades
 */
export const EVENT_TRADE_MAP: { pattern: RegExp; trades: string[] }[] = [
  { pattern: /tornado|hail|wind|thunderstorm|hurricane|tropical/i, trades: ["roofing", "landscaping", "handyman"] },
  { pattern: /heat|excessive heat/i, trades: ["hvac"] },
  { pattern: /freeze|frost|winter|ice|cold|extreme cold/i, trades: ["plumbing", "hvac"] },
  { pattern: /flood|rain|flash flood/i, trades: ["plumbing"] },
  { pattern: /air quality|smoke|dust/i, trades: ["hvac"] },
  { pattern: /fire|red flag/i, trades: ["landscaping", "lawn_care"] },
];

/** True if this weather event is relevant to the prospect trade (avoids AQI on pest control, etc.) */
export function eventAppliesToTrade(event: string, trade: string): boolean {
  if (!event || !trade) return false;
  const t = trade.toLowerCase().replace(/-/g, "_").replace(/\s+/g, "_");
  const trades = tradeForEvent(event);
  if (trades.length === 0) return false;
  return trades.some((x) => {
    const n = x.toLowerCase().replace(/-/g, "_").replace(/\s+/g, "_");
    return t === n || t.includes(n) || n.includes(t);
  });
}

export function tradeForEvent(event: string): string[] {
  if (!event) return [];
  const out = new Set<string>();
  for (const row of EVENT_TRADE_MAP) {
    if (row.pattern.test(event)) {
      for (const t of row.trades) out.add(t);
    }
  }
  return Array.from(out);
}
