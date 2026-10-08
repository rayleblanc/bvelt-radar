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
```bash
npx wrangler deploy
```

---

## 📡 Endpoints del Worker

* `GET /health`: Estado del servicio, prospectos procesados hoy, créditos Hunter restantes y última ejecución.
* `GET /stats`: Métricas de prospectos por estado, outcomes de aprendizaje y volumen. (Header `Authorization: Bearer FOUNDER_SERVICE_KEY`).
* `POST /run`: Dispara manualmente el pipeline autónomo en background. (Header `Authorization: Bearer FOUNDER_SERVICE_KEY`).
* `POST /decision`: Registra una decisión (`{ id, action: "sent" | "discard" | "suppress" }`).
* `POST /telegram-webhook`: Maneja los callbacks de botones interactivos de Telegram.
* `POST /suppression`: Añade manualmente un dominio o email a la lista negra.
