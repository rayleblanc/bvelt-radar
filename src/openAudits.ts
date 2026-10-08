/**
 * Open Technical Audits for Bvelt Radar
 * Uses 100% free, zero-cost, open APIs:
 * 1. Cloudflare DNS-over-HTTPS (DoH) for MX, SPF, DMARC security checks
 * 2. Open-Meteo API for real-time severe weather emergencies
 * 3. PageSpeed Insights / Fast HTTP Latency probe for mobile performance
 */

export interface DomainSecurityAudit {
  domain: string;
  hasCustomMx: boolean;
  mxHosts: string[];
  hasDmarc: boolean;
  hasSpf: boolean;
  isVulnerableOrSpamRisk: boolean;
  vulnerabilitySignal?: string;
}

export interface WebsitePerformanceAudit {
  url: string;
  mobileScore?: number;
  fcpSeconds?: number;
  latencyMs?: number;
  isSlow: boolean;
  performanceSignal?: string;
}

export interface WeatherEmergencyAudit {
  city: string;
  temperatureC?: number;
  isHeatwave: boolean;
  isFreezing: boolean;
  isStormOrRain: boolean;
  weatherSignal?: string;
  relevantTrades: string[];
}

/**
 * Audit domain MX, SPF, and DMARC using Cloudflare DNS-over-HTTPS (Free, open, fast)
 */
export async function auditDomainSecurityAndMx(domain: string): Promise<DomainSecurityAudit> {
  const cleanDomain = (domain || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/^www\./, '');

  if (!cleanDomain || cleanDomain.length < 3 || !cleanDomain.includes('.')) {
    return {
      domain: cleanDomain,
      hasCustomMx: false,
      mxHosts: [],
      hasDmarc: false,
      hasSpf: false,
      isVulnerableOrSpamRisk: false
    };
  }

  let hasCustomMx = false;
  const mxHosts: string[] = [];
  let hasDmarc = false;
  let hasSpf = false;

  try {
    // 1. Check MX records via Cloudflare DoH
    const mxRes = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(cleanDomain)}&type=MX`, {
      headers: { "Accept": "application/dns-json" },
      signal: AbortSignal.timeout(3500)
    });
    if (mxRes.ok) {
      const mxJson: any = await mxRes.json();
      if (Array.isArray(mxJson.Answer) && mxJson.Answer.length > 0) {
        hasCustomMx = true;
        for (const ans of mxJson.Answer) {
          if (ans.data) mxHosts.push(String(ans.data));
        }
      }
    }
  } catch (e) {}

  try {
    // 2. Check DMARC record (_dmarc.domain)
    const dmarcRes = await fetch(`https://cloudflare-dns.com/dns-query?name=_dmarc.${encodeURIComponent(cleanDomain)}&type=TXT`, {
      headers: { "Accept": "application/dns-json" },
      signal: AbortSignal.timeout(3500)
    });
    if (dmarcRes.ok) {
      const dmarcJson: any = await dmarcRes.json();
      if (Array.isArray(dmarcJson.Answer)) {
        for (const ans of dmarcJson.Answer) {
          if (typeof ans.data === 'string' && ans.data.toLowerCase().includes('v=dmarc1')) {
            hasDmarc = true;
            break;
          }
        }
      }
    }
  } catch (e) {}

  try {
    // 3. Check SPF record (domain TXT)
    const spfRes = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(cleanDomain)}&type=TXT`, {
      headers: { "Accept": "application/dns-json" },
      signal: AbortSignal.timeout(3500)
    });
    if (spfRes.ok) {
      const spfJson: any = await spfRes.json();
      if (Array.isArray(spfJson.Answer)) {
        for (const ans of spfJson.Answer) {
          if (typeof ans.data === 'string' && ans.data.toLowerCase().includes('v=spf1')) {
            hasSpf = true;
            break;
          }
        }
      }
    }
  } catch (e) {}

  const isVulnerable = !hasDmarc;
  let vulnerabilitySignal: string | undefined;
  if (!hasDmarc) {
    vulnerabilitySignal = `Dominio ${cleanDomain} sin política DMARC: correos y presupuestos enviados a clientes corren alto riesgo de caer en carpeta SPAM.`;
  }

  return {
    domain: cleanDomain,
    hasCustomMx,
    mxHosts,
    hasDmarc,
    hasSpf,
    isVulnerableOrSpamRisk: isVulnerable,
    vulnerabilitySignal
  };
}

/**
 * City coordinates lookup for fast free Open-Meteo queries
 */
const CITY_COORDINATES: Record<string, { lat: number; lon: number }> = {
  "tampa, fl": { lat: 27.95, lon: -82.46 },
  "tampa": { lat: 27.95, lon: -82.46 },
  "orlando, fl": { lat: 28.54, lon: -81.38 },
  "orlando": { lat: 28.54, lon: -81.38 },
  "austin, tx": { lat: 30.27, lon: -97.74 },
  "austin": { lat: 30.27, lon: -97.74 },
  "houston, tx": { lat: 29.76, lon: -95.37 },
  "houston": { lat: 29.76, lon: -95.37 },
  "dallas, tx": { lat: 32.78, lon: -96.80 },
  "dallas": { lat: 32.78, lon: -96.80 },
  "atlanta, ga": { lat: 33.75, lon: -84.39 },
  "atlanta": { lat: 33.75, lon: -84.39 },
  "nashville, tn": { lat: 36.16, lon: -86.78 },
  "nashville": { lat: 36.16, lon: -86.78 },
  "charlotte, nc": { lat: 35.23, lon: -80.84 },
  "charlotte": { lat: 35.23, lon: -80.84 },
  "miami, fl": { lat: 25.76, lon: -80.19 },
  "miami": { lat: 25.76, lon: -80.19 },
  "phoenix, az": { lat: 33.45, lon: -112.07 },
  "phoenix": { lat: 33.45, lon: -112.07 },
  "madrid, es": { lat: 40.42, lon: -3.70 },
  "madrid": { lat: 40.42, lon: -3.70 },
  "bogota, co": { lat: 4.71, lon: -74.07 },
  "bogota": { lat: 4.71, lon: -74.07 }
};

/**
 * Audit live weather emergencies using Open-Meteo (100% Free, zero auth, worldwide)
 */
export async function auditCityWeatherEmergency(city: string): Promise<WeatherEmergencyAudit> {
  const normCity = (city || '').trim().toLowerCase();
  let coords = CITY_COORDINATES[normCity];

  if (!coords) {
    for (const key of Object.keys(CITY_COORDINATES)) {
      if (normCity.includes(key) || key.includes(normCity)) {
        coords = CITY_COORDINATES[key];
        break;
      }
    }
  }

  // Default fallback to Tampa coordinates if city is not mapped
  const lat = coords ? coords.lat : 27.95;
  const lon = coords ? coords.lon : -82.46;

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,precipitation,weather_code`;
    const res = await fetch(url, { signal: AbortSignal.timeout(3500) });
    if (!res.ok) {
      return { city, isHeatwave: false, isFreezing: false, isStormOrRain: false, relevantTrades: [] };
    }

    const data: any = await res.json();
    const tempC = data.current?.temperature_2m ?? 24;
    const precip = data.current?.precipitation ?? 0;
    const weatherCode = data.current?.weather_code ?? 0;

    const isHeatwave = tempC >= 32; // > 90°F
    const isFreezing = tempC <= 0;  // <= 32°F
    const isStormOrRain = precip > 2.0 || [61, 63, 65, 80, 81, 82, 95, 96, 99].includes(weatherCode);

    const relevantTrades: string[] = [];
    let weatherSignal: string | undefined;

    if (isHeatwave) {
      relevantTrades.push("hvac", "roofing", "pool_cleaning");
      weatherSignal = `Ola de calor (${Math.round(tempC)}°C) en ${city}: saturación de llamadas de emergencia por rotura de aire acondicionado.`;
    } else if (isFreezing) {
      relevantTrades.push("plumbing", "hvac");
      weatherSignal = `Helada (${Math.round(tempC)}°C) en ${city}: riesgo crítico de congelación de tuberías y calderas.`;
    } else if (isStormOrRain) {
      relevantTrades.push("roofing", "landscaping", "plumbing");
      weatherSignal = `Lluvias intensas o tormenta en ${city}: pico de goteras, canalones desbordados y llamadas de urgencia.`;
    }

    return {
      city,
      temperatureC: tempC,
      isHeatwave,
      isFreezing,
      isStormOrRain,
      weatherSignal,
      relevantTrades
    };
  } catch (e) {
    return { city, isHeatwave: false, isFreezing: false, isStormOrRain: false, relevantTrades: [] };
  }
}

/**
 * Audit Website Mobile Performance with PageSpeed or Fast HEAD Response Latency probe
 */
export async function auditWebsitePerformance(
  websiteUrl: string,
  pageSpeedApiKey?: string
): Promise<WebsitePerformanceAudit> {
  let targetUrl = (websiteUrl || '').trim();
  if (!targetUrl) {
    return { url: '', isSlow: false };
  }
  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    targetUrl = 'https://' + targetUrl;
  }

  // 1. Try Google PageSpeed Insights API if key provided or first attempt
  if (pageSpeedApiKey) {
    try {
      const psUrl = `https://pagespeedonline.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(targetUrl)}&strategy=mobile&category=PERFORMANCE&key=${pageSpeedApiKey}`;
      const psRes = await fetch(psUrl, { signal: AbortSignal.timeout(5000) });
      if (psRes.ok) {
        const psJson: any = await psRes.json();
        const scoreFraction = psJson.lighthouseResult?.categories?.performance?.score;
        const mobileScore = typeof scoreFraction === 'number' ? Math.round(scoreFraction * 100) : undefined;
        const fcpMs = psJson.lighthouseResult?.audits?.['first-contentful-paint']?.numericValue;
        const fcpSeconds = typeof fcpMs === 'number' ? Math.round((fcpMs / 1000) * 10) / 10 : undefined;

        const isSlow = (mobileScore !== undefined && mobileScore < 50) || (fcpSeconds !== undefined && fcpSeconds > 3.0);
        let performanceSignal: string | undefined;
        if (isSlow) {
          performanceSignal = `Sitio web móvil lento (Lighthouse: ${mobileScore ?? 'Bajo'}/100, FCP: ${fcpSeconds ?? '>3'}s): los clientes locales en móvil abandonan la web antes de llamar.`;
        }

        return {
          url: targetUrl,
          mobileScore,
          fcpSeconds,
          isSlow,
          performanceSignal
        };
      }
    } catch (e) {}
  }

  // 2. High-speed resilient fallback: Measure direct HTTP HEAD/GET server latency
  try {
    const t0 = Date.now();
    const probeRes = await fetch(targetUrl, {
      method: 'HEAD',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BveltSiteCheck/1.0)' },
      signal: AbortSignal.timeout(3000)
    });
    const latencyMs = Date.now() - t0;
    const isSlow = latencyMs > 1400 || !probeRes.ok;

    let performanceSignal: string | undefined;
    if (isSlow) {
      performanceSignal = `Tiempo de respuesta del servidor lento (${latencyMs}ms): fricción al cargar el sitio web en smartphones de clientes locales.`;
    }

    return {
      url: targetUrl,
      latencyMs,
      isSlow,
      performanceSignal
    };
  } catch (err: any) {
    // If request timed out or failed, it's definitely a slow or fragile web
    return {
      url: targetUrl,
      isSlow: true,
      performanceSignal: `Sitio web con tiempos de respuesta muy lentos o caídas intermitentes: pérdida de prospectos telefónicos.`
    };
  }
}
