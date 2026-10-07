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
export function tradeForEvent(event: string): string[] {
  if (!event) return [];
  const e = event.toLowerCase();

  if (e.includes("freeze") || e.includes("extreme cold")) {
    return ["plumbing", "hvac"];
  }

  if (
    e.includes("tornado") ||
    e.includes("hurricane") ||
    e.includes("tropical storm") ||
    e.includes("severe thunderstorm warning") ||
    e.includes("high wind warning")
  ) {
    return ["roofing", "landscaping", "handyman"];
  }

  if (e.includes("flood warning") || e.includes("flood")) {
    return ["plumbing"];
  }

  if (e.includes("heat")) {
    return ["hvac"];
  }

  return [];
}
