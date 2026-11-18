# 📡 bvelt-radar v2

## Founder: flujo diario simple
1. Abre **Contactar**: es la pantalla inicial y el espacio principal de trabajo.
2. Revisa negocio, ciudad, sector, score y evidencia; descarta lo que no encaje.
3. Genera o revisa el mensaje con IA y elige el canal disponible.
4. WhatsApp abre un chat manual con el borrador prellenado. Abrirlo no envía el mensaje ni acredita consentimiento. El envío solo se registra con opt-in verificable.
5. Usa **Oportunidades** para priorizar; **Más** conserva Misiones y configuración Tenant.

**GitHub Actions no es requisito para descubrir ni trabajar prospectos.** `POST /run` usa Cloudflare Queues y el Worker; Scrapling/Actions es enriquecimiento opcional. Si falta el secret cifrado, el sidecar se omite sin bloquear el motor principal.

**Plan maestro único:** [Bvelt Ecosystem Master Plan](https://github.com/rayleblanc/LocalFlowPro/blob/main/docs/MASTER_PLAN_BVELT_ECOSYSTEM_2026-12-10.md). Las reglas específicas de Radar están en AGENTS.md; este README es referencia operativa, no un plan paralelo.

**bvelt-radar** es un Cloudflare Worker autónomo para prospección B2B y descubrimiento de negocios de servicios en los mercados y nichos configurados para **Bvelt**.

> **Outbound contact is gated:** Radar may discover, qualify and prepare prospect decisions, but real email delivery is not assumed to be enabled. It requires verified sender/domain configuration, compliance and suppression controls. Scrapling dispatch requires the encrypted Worker Secret GITHUB_ACTIONS_TOKEN_SECRET; the legacy plaintext binding is not accepted.

---

## 🚀 Novedades v2

1. **Mercados abiertos:** Founder rota ciudades del catálogo disponible y usa los segmentos amplios de `market-universe.json` como prioridades, no como allowlist. No hay ciudades ni países fijos; los nichos personalizados siguen siendo válidos.
2. **Scoring Multi-Factor Realista (0-100):** Evalúa web real (+22), email validado (+28), teléfono (+12), handle corporativo (+8), ciudad prioritaria (+10), trade prioritario (+8), datos Overpass (+6), contacto dual (+6) y penalización por supresión (-100).
3. **Copy con Psicología de Trades (A/B Testing):** 90-110 palabras, 1 frase clara de Bvelt, sin promesas falsas de dinero, footer obligatorio "Reply STOP to opt out" y variantes A/B (`missed_calls` vs `dormant_leads`).
4. **Bot de Telegram con Botones Interactivos (`InlineKeyboardMarkup`):** Cada prospecto incluye botones `[✅ Mark Sent]`, `[❌ Discard]` y `[🚫 Suppress Domain]`.
5. **Aprendizaje de Decisiones:** Registro de `outcome` (`sent`, `not_interested`, `suppressed`) en D1. Si una ciudad/oficio tiene $\ge 5$ muestras con alta tasa de aceptación, recibe un boost automático de +5 a +8 puntos de score.
6. **Límites Estrictos y Resiliencia:** Max 10 finalizados/día, max 15 llamadas de IA, max 8 créditos de Hunter/día. Funciona 100% sin keys opcionales (degradación suave a templates estáticos).

---

## 🗄️ Esquema de Base de Datos D1

El árbol actual de migraciones llega a 0032. Hay números de secuencia duplicados (0019, 0020, 0023, 0024 y 0025) por razones históricas. No renombres ni reescribas migraciones ya aplicadas. La base de producción fue observada sin una tabla d1_migrations reconciliada; compara el esquema real y la documentación migrations/README antes de cualquier operación. Consulta la sección P11 del plan maestro canónico.

## ⚙️ Despliegue en Cloudflare (5 Pasos)

### 1. Crear Base de Datos D1
```bash
npx wrangler d1 create bvelt-radar-db
```
Copia el `database_id` en `wrangler.toml`.

### 2. Verificar y aplicar migraciones con seguridad

No ejecutes `wrangler d1 migrations apply` en producción de forma ciega. Primero compara el esquema real de D1 con las migraciones, resuelve el baseline/ledger y revisa los números duplicados. No alteres archivos históricos. Sigue migrations/README y la sección P11 del plan maestro canónico. Las pruebas locales deben utilizar una base efímera o un baseline explícitamente reconciliado.

### 3. Configurar Secretos y Variables de Configuración

**Secretos (Sensibles - Configurar vía Cloudflare Secrets o Dashboard):**
```bash
npx wrangler secret put FOUNDER_SERVICE_KEY    # Token de servicio del fundador
npx wrangler secret put TELEGRAM_BOT_TOKEN     # Token de @BotFather
npx wrangler secret put TELEGRAM_CHAT_ID       # Chat ID de Telegram
# Opcionales:
npx wrangler secret put GEMINI_FOUNDER_API_KEY   # Key Principal para Cascada Gemini
npx wrangler secret put GEMINI_SECONDARY_API_KEY # Key Secundaria para ampliación de cuota
npx wrangler secret put GROQ_API_KEY             # Key de Groq (GPT-OSS 20B/120B)
npx wrangler secret put HUNTER_API_KEY           # Búsqueda de emails en dominio (max 8/día)
npx wrangler secret put ABSTRACT_API_KEY         # Validación de entregabilidad
npx wrangler secret put GITHUB_ACTIONS_TOKEN_SECRET # GitHub Actions: dispatch de Scrapling (Secret cifrado; el binding legacy GITHUB_ACTIONS_TOKEN se ignora)
npx wrangler secret put RADAR_SIDECAR_CALLBACK_KEY # Autenticación del callback Scrapling
```

**Variables de Configuración [vars] (No sensibles - en `wrangler.toml` o Dashboard > Variables):**
```toml
[vars]
# Opcionales: si no defines estas variables, Founder usa los segmentos del market-universe.json.
FOUNDING_TRADES = "trade_one;trade_two"
FOUNDING_LANGUAGES = "en"
FOUNDING_MIN_SCORE = "50"
```

No configures FOUNDING_CITIES ni FOUNDING_COUNTRIES para la rotación automática. Founder toma sus ciudades de los archivos incluidos en el Worker: src/geoData.ts y src/geoDataAnglosphere.ts. Los cuatro mercados principales son US, CA, GB y AU; aproximadamente el 75% de los objetivos se distribuye entre ellos y el 25% restante explora otros países presentes en el gazetteer.

La cobertura no es mundial todavía: geoData.ts contiene la cobertura extensa de US/CA y está generado desde GeoNames mediante el paquete all-the-cities 3.1.0 (atribución requerida: https://www.geonames.org). El archivo suplementario añade centros urbanos de GB, AU, IE, NZ y ZA; sus coordenadas son centros urbanos aproximados y las poblaciones son pesos redondeados para priorización, no datos censales, y no conservan una fuente individual por fila. Trátalo como semilla de arranque, no como gazetteer mundial autoritativo. Para añadir más países hay que ampliar los archivos geográficos con datos redistribuibles y atribución verificable; no basta con añadir un código de país a la configuración. Founder también descarta antes de reservar presupuesto los POI sin email válido, teléfono válido o sitio web real; los candidatos con sitio web siguen habilitados para scraping/enriquecimiento.

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
- **Tenant isolation**: Tenant mode requires an explicit tenant configuration and never invents cities. Buyer segments are derived from AI ICP expansion first, then explicit `subniches_json` / `allowed_markets_json` / `icp_keywords_json`, with the trade-to-B2B map as a fallback. An unmapped industry remains eligible; discovery waits only when no buyer ICP can be inferred.

### Intentionally not implemented

Some ideas from earlier strategy notes were rejected rather than blindly added:

1. **Direct SMTP handshake from Workers** — not a reliable/appropriate way to prove mailbox deliverability in this runtime.
2. **Indeed scraping/API assumption** — no verified public anonymous search API was found, so Radar does not depend on undocumented endpoints.
3. **Workers AI fallback** — enabled after Groq and paid-tier Gemini, using the active GLM-4.7 Flash model; the daily free Neurons allocation is enforced by Cloudflare.
4. **Vectorize as a mandatory dependency** — not forced into deployment because it would require provisioning an external Vectorize index. Current deterministic D1 dedup remains the fail-safe.

## GitHub Actions credential migration

The Worker dispatch code reads **only** `GITHUB_ACTIONS_TOKEN_SECRET`, configured as an encrypted Cloudflare Worker Secret with the minimum repository Actions permission required. The legacy `GITHUB_ACTIONS_TOKEN` plaintext variable is deliberately ignored and cannot authorize dispatch. If the dedicated secret is absent, Scrapling dispatch fails closed and the health diagnostics report the sidecar as not ready.

Operational cleanup remains required: provision the dedicated Worker Secret, verify `github_token_secret_present=true`, rotate/revoke the old GitHub token, and remove the legacy plaintext variable from Cloudflare. Do not read, print, log, or place either token in Wrangler vars, source code, logs, or chat. Secret rotation and binding changes require explicit operator approval.

## AI provider policy (2026-11-17)

Radar uses a privacy-aware provider cascade for tenant business data:

1. **Groq first:** `openai/gpt-oss-20b`, then `openai/gpt-oss-120b`. Both are production models listed in Groq's Free Plan rate-limit table. Published base limits are 30 RPM, 1,000 RPD, 8,000 TPM and 200,000 TPD per model and organization; verify the exact organization limits in Groq Console. Enable Zero Data Retention in Groq Data Controls for the strongest available retention posture.
2. **Gemini only on confirmed paid processing:** stable model order is `gemini-3.8-flash`, then `gemini-3.5-flash-lite`. Gemini 4 Hydrogen is also available in the free tier, but its unpaid terms permit use of submitted content to improve products and free-tier Google Search grounding is unavailable; it is not routed to tenant data. Do not send tenant-confidential or personal data through unpaid Gemini quota. The Worker defaults `GEMINI_PAID_TIER_CONFIRMED=false`; set it to `true` only after verifying that the API project has active billing and is using paid quota.
3. **Cloudflare Workers AI:** `@cf/zai-org/glm-4.7-flash`, with zero data retention and a 10,000-Neuron daily free allocation. Requests set `chat_template_kwargs.enable_thinking=false` for compact classification/copy output and parse the OpenAI-compatible `choices[].message.content` field only (never expose `reasoning`). The Worker falls through to deterministic templates if the provider is unavailable or the free allocation is exhausted.
4. **Deterministic fallback:** never marks an AI-generated message as delivered and never invents evidence.

Tenant ICP expansion follows Groq first and uses Gemini only when paid processing is confirmed. Founder outreach follows the same privacy gate. Model IDs and the paid-tier switch are configured in `wrangler.toml`; provider keys remain Cloudflare Secrets.

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
- Mobile API endpoints: `/api/opportunities`, `/api/missions`, `/api/learning`, `/api/settings`, `/api/opportunity-event`.

### Targeting safety

Founder target selection uses `market-universe.json` and the bundled gazetteer; it does not require a persisted city/country allowlist. `FOUNDING_CITIES` remains an optional explicit override only. With no trade override, Founder expands the broad Bvelt-compatible segments into searchable niches. Tenant geography and ICP remain isolated in `tenant_config`.

### Database migrations

Migration sources currently cover **0001–0029**, including the additive learning and Tenant observation tables. Never rename or modify historical migration files.

The connected production D1 database already contains the newer tables and columns, but its `d1_migrations` history table is absent. **Do not run `wrangler d1 migrations apply` until the existing schema is reconciled with a verified migration baseline**; older files contain non-idempotent `ALTER TABLE` statements.

### Validation

GitHub Actions runs `npm ci`, `npm run build`, `npm run test:radar` and the Sidecar test suite. Cloudflare Workers Builds uses `npm run build` followed by `npm run deploy`.
