# 📡 bvelt-radar v2

**bvelt-radar** es un Cloudflare Worker autónomo para prospección B2B y descubrimiento de contratistas y servicios locales en EE. UU. (plumbing, HVAC, landscaping, limpieza, techos) para **Bvelt**.

> ⚠️ **Nota Importante:** La versión v1 **NO envía emails automáticamente**. El sistema busca, califica con algoritmo multi-factor, redacta el copy con psicología de contratista y te lo entrega por Telegram con botones interactivos. Tú decides, copias y envías.

---

## 🚀 Novedades v2

1. **Ranking Dinámico Sun Belt:** Rotación determinista diaria de 2-3 ciudades y 2-3 oficios de alta demanda (Tampa, Orlando, Austin, Houston, Charlotte, Nashville, Atlanta, etc.).
2. **Scoring Multi-Factor Realista (0-100):** Evalúa web real (+22), email validado (+28), teléfono (+12), handle corporativo (+8), ciudad prioritaria (+10), trade prioritario (+8), datos Overpass (+6), contacto dual (+6) y penalización por supresión (-100).
3. **Copy con Psicología de Trades (A/B Testing):** 90-110 palabras, 1 frase clara de Bvelt, sin promesas falsas de dinero, footer obligatorio "Reply STOP to opt out" y variantes A/B (`missed_calls` vs `dormant_leads`).
4. **Bot de Telegram con Botones Interactivos (`InlineKeyboardMarkup`):** Cada prospecto incluye botones `[✅ Mark Sent]`, `[❌ Discard]` y `[🚫 Suppress Domain]`.
5. **Aprendizaje de Decisiones:** Registro de `outcome` (`sent`, `not_interested`, `suppressed`) en D1. Si una ciudad/oficio tiene $\ge 5$ muestras con alta tasa de aceptación, recibe un boost automático de +5 a +8 puntos de score.
6. **Límites Estrictos y Resiliencia:** Max 10 finalizados/día, max 15 llamadas de IA, max 8 créditos de Hunter/día. Funciona 100% sin keys opcionales (degradación suave a templates estáticos).

---

## 🗄️ Esquema de Base de Datos D1

* **`migrations/0001_initial_schema.sql`**: Tablas base `prospects`, `runs`, `seeds_optional`, `suppression`, `tenant_config`.
* **`migrations/0002_learning_and_outcomes.sql`**: Columnas `outcome`, `variant_id`, `score_breakdown`, índices de aprendizaje y tabla `learning_stats`.

---

## ⚙️ Despliegue en Cloudflare (5 Pasos)

### 1. Crear Base de Datos D1
```bash
npx wrangler d1 create bvelt-radar-db
```
Copia el `database_id` en `wrangler.toml`.

### 2. Aplicar Migraciones SQL
```bash
npx wrangler d1 migrations apply bvelt-radar-db --local   # Desarrollo
npx wrangler d1 migrations apply bvelt-radar-db --remote  # Producción
```

### 3. Configurar Secretos y Variables de Configuración

**Secretos (Sensibles - Configurar vía Cloudflare Secrets o Dashboard):**
```bash
npx wrangler secret put FOUNDER_SERVICE_KEY    # Token de servicio del fundador
npx wrangler secret put TELEGRAM_BOT_TOKEN     # Token de @BotFather
npx wrangler secret put TELEGRAM_CHAT_ID       # Chat ID de Telegram
# Opcionales:
npx wrangler secret put GEMINI_FOUNDER_API_KEY   # Key Principal para Cascada Gemini
npx wrangler secret put GEMINI_SECONDARY_API_KEY # Key Secundaria para ampliación de cuota
npx wrangler secret put GROQ_API_KEY             # Key de Groq (Llama-3.3-70b)
npx wrangler secret put HUNTER_API_KEY           # Búsqueda de emails en dominio (max 8/día)
npx wrangler secret put ABSTRACT_API_KEY         # Validación de entregabilidad
```

**Variables de Configuración [vars] (No sensibles - en `wrangler.toml` o Dashboard > Variables):**
```toml
[vars]
FOUNDING_CITIES = "Tampa, FL;Orlando, FL;Austin, TX;Houston, TX;Atlanta, GA;Nashville, TN"
FOUNDING_TRADES = "landscaping;lawn_care;hvac;plumbing;house_cleaning;pool_cleaning;handyman;roofing;pest_control"
FOUNDING_COUNTRIES = "US;MX;ES;CO;CA;GB"
FOUNDING_LANGUAGES = "en;es"
FOUNDING_MIN_SCORE = "50"
```

### 4. Configurar el Webhook de Telegram (Botones Interactivos)
Para que los botones `[✅ Mark Sent]`, `[❌ Discard]` y `[🚫 Suppress]` funcionen directamente desde Telegram:
```bash
curl -F "url=https://bvelt-radar.TU_SUBDOMINIO.workers.dev/telegram-webhook" \
  https://api.telegram.org/botTU_TELEGRAM_BOT_TOKEN/setWebhook
```

### 5. Desplegar el Worker

En **Cloudflare Workers Builds** configura:

- **Build command:** `npm run build`
- **Deploy command:** `npm run deploy`

El script de despliegue ejecuta `npx wrangler deploy`. No uses `npm wrangler deploy`.

Para un despliegue manual:
```bash
npm run deploy
```

---

## 📡 Endpoints del Worker

* `GET /health`: Estado del servicio, prospectos procesados hoy, créditos Hunter restantes y última ejecución.
* `GET /stats`: Métricas de prospectos por estado, outcomes de aprendizaje y volumen. (Header `Authorization: Bearer FOUNDER_SERVICE_KEY`).
* `POST /run`: Dispara manualmente el pipeline autónomo en background. (Header `Authorization: Bearer FOUNDER_SERVICE_KEY`).
* `POST /decision`: Registra una decisión (`{ id, action: "sent" | "discard" | "suppress" }`).
* `POST /telegram-webhook`: Maneja los callbacks de botones interactivos de Telegram.
* `POST /suppression`: Añade manualmente un dominio o email a la lista negra.


## 🔎 Public Research Enrichment (October 2026)

The Worker can optionally enrich prospects with public evidence without changing the Gemini/Groq cascade:

- **Cloudflare DNS-over-HTTPS** for MX existence checks. The implementation uses the documented `cloudflare-dns.com/dns-query` endpoint.
- **Internet Archive freshness**: a weak signal based on the latest available snapshot. It is never treated as proof that a live site is stale.
- **Municipal permits**: verified Austin and Orlando public datasets plus configurable `PERMIT_SOURCES_JSON`. The Worker does not guess dataset IDs for other cities.
- **Census ZIP housing age**: optional and only activated with `CENSUS_ENABLED=1`, `CENSUS_API_KEY`, and a discovered ZIP code. Census API queries require an API key as of September 2026.
- **Tenant isolation**: Tenant mode requires an explicit tenant configuration and no longer invents fallback cities. Its target niches come from `subniches_json` or the configured trade-to-B2B target map.

### Intentionally not implemented

Some ideas from earlier strategy notes were rejected rather than blindly added:

1. **Direct SMTP handshake from Workers** — not a reliable/appropriate way to prove mailbox deliverability in this runtime.
2. **Indeed scraping/API assumption** — no verified public anonymous search API was found, so Radar does not depend on undocumented endpoints.
3. **Workers AI as a Gemini/Groq fallback** — deliberately not added because the existing Gemini/Groq cascade is preserved exactly.
4. **Vectorize as a mandatory dependency** — not forced into deployment because it would require provisioning an external Vectorize index. Current deterministic D1 dedup remains the fail-safe.

## Radar 16 — Autonomous Opportunity Engine

This build keeps the previous Radar 15 enhancements and adds:

- Tenant-isolated daily missions (`tenant_id + day`) so tenants cannot overwrite each other's mission counters.
- Tenant-isolated run idempotency via `runs.tenant_id`.
- Full Tenant Mission compilation from `industry`, `niche`, `subniches`, `services`, `service_areas`, `countries`, `regions`, `cities`, `languages`, ICP, minimum score, outreach limit, allowed markets, campaign goal and messaging angle.
- Founder mission configuration for ICP, services, markets, campaign goal and messaging angle through existing dashboard variables.
- Qualification no longer requires email; Tenant opportunities can survive until a usable outreach channel is found.
- Outreach still requires a usable channel and keeps the existing Trust-Stack/suppression/cooldown protections.
- Strategic decision dimensions persisted per prospect: fit, intent, pain, ability to pay, contactability, timing, evidence, decision state, why-now evidence, expected value and signal freshness.
- Founder auto-outreach now requires the existing elite threshold PLUS the persisted `auto_candidate` decision and fresh signal evidence.
- Gemini/Groq generation cascade was not changed.
- Existing migrations 0001–0019 were not modified or renamed; new changes are in 0020 and 0021.

## Fusion build: Autonomous + Intelligence

This build keeps the complete Autonomous architecture (migrations 0001–0021, Cloudflare Queue, Budget Governor, Trust-Stack gates, sender/email verification, learning, evidence/strategic scoring, Daily Missions, research/weather signals, multi-tenant missions and auto-outreach controls) and adds migration **0022** for an Opportunity Intelligence layer.

### Opportunity Intelligence

After a prospect is enriched and scored, Radar now maintains:

- Mission → Opportunity → Signal → Action → Outcome relationships.
- Opportunity priority, expected value and confidence.
- `why_now` and `next_action` derived from stored evidence.
- Fresh signal history for contactability, fit, website/pain signals and market evidence.
- A structured graph payload linking business, market and vertical.
- Outcome events feeding the existing learning engine.
- Mobile API endpoints: `/api/opportunities`, `/api/missions`, `/api/learning`, `/api/config`, `/api/opportunity-event`.

### Targeting safety

Founder targets can be persisted in D1 through `/api/config`; these targets take precedence over legacy `FOUNDING_CITIES` / `FOUNDING_TRADES`. No production fallback invents a city or trade when configuration is empty. The legacy environment variables remain supported for compatibility.

### Database upgrade

Apply migrations **0001 through 0022** to the existing `bvelt-radar-db`. Never rename or modify historical migrations that have already been applied. Migration 0022 is additive.

### Validation

The Worker and React source pass TypeScript transpilation checks. A complete dependency-backed `npm run build` must still be run in an environment where the package dependencies can be installed; this environment previously could not complete `npm install` because of network/time limits.
