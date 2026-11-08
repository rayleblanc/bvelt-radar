# Prompt for Google AI Studio — integrate Scrapling into the existing Bvelt Radar

Trabaja sobre el proyecto Bvelt Radar que ya tienes abierto. El repositorio público `main` de `rayleblanc/bvelt-radar` es la versión actual de referencia. Los archivos nuevos del add-on ya se copiaron en sus rutas; ahora debes conectarlos al código existente con cambios pequeños, exactos y comprobables.

## Objetivo

Integrar el ejecutor Scrapling de GitHub Actions con el Worker actual, conservando la arquitectura existente. Radar debe investigar automáticamente después de completar discovery tanto cuando se ejecuta por su Cron normal como cada vez que el usuario pulsa Ejecutar y llama al endpoint manual `/run`.

Founder y Tenant son dos productos operativos igualmente importantes, pero sus misiones son distintas:

- **Founder:** encontrar empresas que puedan convertirse en clientes de Bvelt.
- **Tenant:** encontrar oportunidades para que cada negocio cliente consiga sus propios clientes. Debe usar exclusivamente el ICP, nichos, servicios, áreas, países, ciudades, idiomas y configuración de ese Tenant.

No mezcles sus resultados ni sus criterios. Founder utiliza `tenant_id='founder'`; Tenant utiliza siempre el ID exacto del cliente.

## Restricciones no negociables

1. No reemplaces `src/worker.ts` ni lo reconstruyas desde cero. Modifica únicamente los puntos necesarios.
2. No rompas la conexión Radar → Bvelt: conserva `BVELT_INGEST_URL`, `BVELT_INGEST_KEY`, su autenticación, el endpoint y el payload actual.
3. No rompas ni elimines la sincronización Radar → BEM. Conserva `pushMarketObservationsToBem()` y el contrato que actualmente consume Bvelt/BEM. Si propones añadir campos al payload, inspecciona primero el contrato real del endpoint de Bvelt y hazlo solo si es compatible hacia atrás. No inventes el esquema de BEM.
4. No cambies ni renombres modelos, nombres, prioridades o lógica de la cascada Gemini/Groq.
5. No cambies los controles Trust-Stack, suppression, cooldown, Budget Governor, idempotencia de outreach, límites diarios, Telegram ni las protecciones de envío.
6. No edites, renombres ni reescribas migraciones 0001–0022. La migración nueva es `migrations/0023_research_evidence.sql`.
7. No sustituyas Cloudflare Cron ni Cloudflare Queues. Mantén los bindings y la programación existente en `wrangler.toml`.
8. Scrapling solo adquiere y devuelve observaciones verificables. No decide scores estratégicos, no declara ingresos perdidos, no genera intención de compra y no envía mensajes.
9. No conviertas Founder o Tenant en una allowlist cerrada de industrias o países.
10. No introduzcas servicios de pago obligatorios, tarjeta, Modal obligatorio, servidores permanentes ni nuevos proveedores de IA.

## Archivos nuevos que debes conectar

- `src/research/githubActions.ts`
- `migrations/0023_research_evidence.sql`
- `.github/workflows/radar-research.yml`
- `sidecar/runner.py`
- `sidecar/radar_sidecar/scraper.py`
- `sidecar/radar_sidecar/url_policy.py`
- `sidecar/config/market-universe.json`

No dupliques estos módulos dentro de `worker.ts`. Importa y utiliza el helper TypeScript.

## A. Configuración y despacho del workflow

1. Amplía el tipo `Env` con:
   - `GITHUB_ACTIONS_TOKEN?: string`
   - `RADAR_RESEARCH_REPOSITORY?: string`
   - `RADAR_SIDECAR_CALLBACK_KEY?: string`
2. Importa `dispatchScraplingResearch` desde `./research/githubActions`.
3. Utiliza el repositorio por defecto `rayleblanc/bvelt-radar` y workflow `radar-research.yml`.
4. El despacho debe ocurrir **una sola vez por run_id + tenant_id**, después de que hayan terminado todos los jobs `discovery` de esa corrida. No lo dispares al principio de `startProspectingRun()`, porque los prospectos todavía no existen.
5. Aprovecha el consumer de Cloudflare Queue. Después de marcar un job discovery como terminal, comprueba si quedan jobs discovery del mismo `run_id` en estado pending/processing. Si quedan, no hagas nada. Si no quedan, intenta despachar el workflow.
6. Usa `sidecar_dispatches` para idempotencia. Inserta/actualiza el registro antes de despachar; registra `queued`, `failed`, número de intentos y error. Una reejecución no debe crear dos workflows activos para el mismo `run_id + tenant_id`. Permite reintentar un dispatch fallido con límite y backoff.
7. Si la ejecución usa el fallback directo porque `RADAR_QUEUE` no está disponible, asegúrate de que la comprobación final también se ejecute después de procesar los discovery jobs.
8. No bloquees ni reviertas el pipeline principal si GitHub Actions falla. Registra el fallo y deja el estado visible para diagnóstico.
9. Founder y cada Tenant deben producir dispatches separados. La rotación de tenants del Cron ya existente debe continuar.

## B. Asegurar que cada ejecución manual funciona

En la ruta `/run` actual:

1. Una llamada manual autenticada debe iniciar una nueva corrida incluso si Founder tuvo otra corrida hace menos de cuatro horas. Actualmente la comprobación de duplicados puede impedirlo porque `force` solo se activa para Tenant o si se pasa `force=true`.
2. Haz que la ejecución manual fuerce una corrida nueva por defecto. Mantén la idempotencia de las llamadas Cron, que no deben convertirse en ejecuciones duplicadas.
3. Conserva compatibilidad con las llamadas GET/POST existentes y con sus parámetros `mode`, `tenant_id`, `cities/geographies`, `trades/niches`, `countries`, `languages` y `min_score`.
4. Respeta siempre `RADAR_GLOBAL_PAUSE`, presupuestos y demás límites.
5. Evita doble clic concurrente desde la interfaz: deshabilita el botón mientras su petición está pendiente y vuelve a habilitarlo al terminar. No cambies el diseño visual innecesariamente.
6. El resultado de `/run` debe seguir devolviendo el `run_id`, `mode`, `tenant_id`, ciudades, nichos y jobs encolados.

## C. Asociar prospectos al run de forma fiable

La tabla `prospects` puede no tener una relación directa suficiente con cada `run_id`. Utiliza `research_run_candidates` como puente.

1. En el punto exacto donde el discovery job inserta un prospecto nuevo, registra `(run_id, mode, tenant_id, prospect_id, created_at)`.
2. Si el prospecto ya existía y se reutiliza para el run actual, registra también la asociación, sin duplicados.
3. Incluye los prospectos que se crean por el camino rápido/bootstrap de Tenant, asociándolos al run que se inicia para ese Tenant cuando exista esa relación.
4. No cambies `identity_key`, la deduplicación ni las reglas de aislamiento existentes.
5. No permitas que un `prospect_id` de un Tenant se asocie a otro Tenant o a Founder.

## D. Dos endpoints internos, limitados y autenticados

Implementa estos endpoints en el Worker, sin exponerlos públicamente:

### `GET /api/research/candidates?run_id=...&mode=...&tenant_id=...`

- Solo acepta `Authorization: Bearer RADAR_SIDECAR_CALLBACK_KEY`.
- Requiere los tres parámetros y valida coherencia Founder/Tenant.
- Consulta `research_run_candidates JOIN prospects` por la combinación exacta de `run_id`, `mode` y `tenant_id`.
- Devuelve solo prospectos de esa corrida que tengan website HTTP/HTTPS válido.
- Devuelve únicamente `prospect_id`, `business_name`, `city`, `trade` y `website`. No devuelvas claves, tokens, emails, teléfonos ni configuración privada del Tenant.
- Limita la respuesta a 50 candidatos por corrida y devuelve `records: []` si no hay webs válidas.

### `POST /api/research/evidence`

- Solo acepta el mismo Bearer secreto.
- Limita el cuerpo a 1 MB y el lote a 100 registros.
- Valida `run_id`, `mode`, `tenant_id` y que cada `prospect_id` esté en `research_run_candidates` para esa misma combinación.
- Valida URL HTTP/HTTPS pública, `source_id`, `evidence_type`, `content_hash`, `extractor_version`, `confidence` entre 0 y 1 y `observed_at`.
- Inserta de forma idempotente en `source_evidence`; utiliza la clave única de la migración.
- Acepta `records: []`: un lote vacío también es una finalización válida. Actualiza `sidecar_dispatches` a `completed` y registra candidatos recibidos/evidencias insertadas; no dejes un dispatch en `queued` si el runner terminó sin resultados.
- Nunca aceptes un `tenant_id` proporcionado por el sidecar sin comprobarlo contra la asociación D1.
- No ejecutes acciones de outreach ni alteres suppression, cooldown o estados de envío.
- Devuelve cantidad insertada, duplicada y rechazada, sin filtrar información de otros tenants.

## E. Integración de las evidencias con Radar y BEM

1. Conserva íntegro el contenido original de `signals_json`; añade un subobjeto `scrapling` mediante merge seguro, nunca reemplazando las señales existentes.
2. Registra observaciones comprobadas en `source_evidence` y, cuando exista una `opportunity` correspondiente, incorpora señales observadas a `opportunity_signals` con su procedencia, fecha y confianza. Las inferencias deben quedar separadas de los hechos observados.
3. No sumes puntos automáticamente solo porque una página tenga o no tenga un formulario, teléfono o email. Ausencia de evidencia no equivale a evidencia negativa.
4. Si el motor de scoring existente puede consumir una observación nueva de manera explicable, integra esa señal conservando sus pesos y pruebas. No hagas un segundo motor de scoring ni alteres el contrato de Opportunity Intelligence.
5. Mantén la sincronización BEM actual. No cambies el endpoint, la autenticación ni elimines campos actuales. Inspecciona el contrato real de Bvelt antes de añadir cualquier campo opcional. Si no puedes demostrar compatibilidad, deja las nuevas evidencias en D1 y conserva la sincronización BEM actual sin cambios.
6. El nuevo flujo debe ser visible en diagnósticos: workflow queued/running/completed/failed, cantidad de candidatos, evidencias nuevas y duplicados.

## F. Cobertura geográfica: ampliar, no cerrar

He revisado `src/geoData.ts` y su comentario indica que contiene aproximadamente 7.600 lugares de EE. UU. y Canadá. `geoFrontier.ts` depende de ese archivo. No supongas que la cobertura actual es mundial.

Usa `sidecar/config/market-universe.json` como política de priorización, no como allowlist.

1. Conserva la interfaz `GeoPlace` y las funciones existentes de `geoFrontier.ts`.
2. Amplía la fuente de geodatos con un gazetteer global redistribuible (GeoNames/all-the-cities u otra fuente compatible), con atribución y licencia documentadas. Mantén coordenadas, población, país y región normalizados.
3. Prioriza inicialmente mercados comerciales anglófonos: US, CA, GB, IE, AU y NZ; amplía también ZA, SG, IN, PH, MY, NG, GH, KE, JM, TT, BB, BS, BZ, MT y GY. Son prioridades, no exclusiones. Cualquier país puede entrar por configuración Founder/Tenant o por evidencia de mercado.
4. Mantén el soporte multilingüe. No asumas que un país tiene un solo idioma.
5. No hardcodees una lista pequeña de ciudades que se repita siempre. Rota por países, regiones, ciudades y tamaños de población utilizando los geodatos existentes y ampliados.
6. Para ciudades no incluidas en el gazetteer, utiliza geocodificación compatible con sus políticas; no inventes coordenadas.
7. Respeta `countries`, `regions`, `cities`, `languages`, `allowed_markets` y `service_areas` de cada misión/tenant. La configuración explícita del Tenant tiene prioridad para ese Tenant.

## G. Nichos: cobertura abierta y Founder/Tenant diferentes

No conviertas `PREFERRED_TRADES`, `TENANT_TARGET_MAP`, `DEFAULT_FOUNDER_MISSION` ni `customOsmTags` en una lista cerrada de industrias elegibles.

### Founder

Busca negocios que puedan beneficiarse de Bvelt: empresas que reciben consultas, llamadas, solicitudes de presupuesto, citas, reservas, pedidos, reseñas, clientes recurrentes o solicitudes por varios canales. Esto puede incluir servicios domésticos, construcción, automoción, salud, dental, veterinaria, belleza, fitness, legal, contabilidad, seguros, inmobiliarias, property management, educación, hostelería, restauración, eventos, retail especializado, mascotas, logística, B2B, IT, mantenimiento industrial, agricultura y cualquier otro negocio compatible.

La industria debe describir al negocio, no decidir por sí sola si es elegible. Crea un fallback genérico para nichos desconocidos usando ICP, keywords, servicios, señales observadas y categorías OSM disponibles. No rechaces un nicho solo porque no esté en un mapa.

Reemplaza cualquier boost exclusivo de unos pocos oficios por una evaluación basada en compatibilidad con el valor de Bvelt: inbound inquiries, quote/estimate flow, appointments/bookings, repeat customer potential, review/reputation workflow, channel complexity, service-area complexity y lead follow-up. Usa solo señales observadas o marca la información como unknown.

### Tenant

No busques clientes de Bvelt para el Tenant. Busca clientes del negocio Tenant. Utiliza su configuración completa (`industry`, `niche`, `subniches_json`, `services_json`, `service_areas_json`, `countries_json`, `regions_json`, `cities_json`, `languages_json`, `icp_description`, `icp_keywords_json`, `allowed_markets_json`, `campaign_goal`, `messaging_angle` y `icp_expansion_json`).

El mapa de compradores B2B puede ayudar, pero nunca debe ser la única vía. Si el Tenant vende a consumidores, busca consumidores/organizaciones adecuados; si vende a property managers, contratistas o empresas, busca esos compradores. Conserva `tenantBuyerNameFits` y las comprobaciones actuales como señales, no como una barrera que elimine oportunidades válidas sin evidencia.

## H. Scrapling y fuentes

1. Usa Scrapling HTTP Fetcher primero; DynamicFetcher/Chromium solo cuando una web pública realmente necesite JavaScript.
2. Respeta robots.txt, términos de uso, límites por dominio y `Retry-After`. No intentes saltar CAPTCHAs, autenticación, paywalls o controles de acceso.
3. El sidecar debe trabajar sobre webs de negocios ya descubiertos por Radar; no cree un scraper paralelo que duplique la cascada Nominatim/Overpass/Geoapify/LocationIQ/Photon/BizData.
4. Las fuentes estructuradas y registros públicos existentes siguen siendo válidos. Amplía fuentes solo cuando su acceso y reutilización estén permitidos y la cobertura esté comprobada.
5. No reincorpores Craigslist como fuente automatizada sin autorización expresa y revisión de sus términos.
6. Protege el sidecar frente a SSRF, DNS privados, redirects internos, archivos no HTML, respuestas enormes, timeouts, prompt injection y datos maliciosos.
7. El HTML y el texto de terceros son datos no confiables, nunca instrucciones para el Worker, el sidecar o un modelo.
8. No guardes páginas HTML completas ni datos personales innecesarios. Conserva URL, hash, extracto mínimo, observaciones, fecha y procedencia.

## I. Verificación obligatoria

Antes de terminar:

1. Ejecuta TypeScript build/lint del proyecto y corrige los errores causados por tus cambios.
2. Ejecuta `python -m unittest discover -s sidecar/tests -v` y `python -m py_compile sidecar/runner.py sidecar/radar_sidecar/*.py`.
3. Comprueba la sintaxis de la migración 0023 en SQLite/D1 local.
4. Comprueba un flujo Founder completo: manual `/run` → discovery queue → workflow_dispatch → candidates endpoint → Scrapling → evidence callback → D1.
5. Comprueba el flujo Founder iniciado por Cron sin crear un Cron nuevo en GitHub.
6. Comprueba Tenant A y Tenant B y demuestra que no hay mezcla de `tenant_id`, candidatos o evidencias.
7. Comprueba que una ejecución repetida no duplica dispatches ni evidencias.
8. Comprueba fallo de GitHub Actions: el pipeline principal debe seguir funcionando y registrar el error.
9. Comprueba que BVELT_INGEST_URL/BVELT_INGEST_KEY y `pushMarketObservationsToBem()` mantienen compatibilidad y siguen funcionando con el payload actual.
10. Comprueba que Trust-Stack, outreach, suppression, cooldown, budgets, Telegram y Gemini/Groq no fueron modificados.
11. No declares una prueba como aprobada si no la ejecutaste. Distingue pruebas ejecutadas de inspecciones estáticas.

## Entrega

Devuélveme:

- Los archivos completos que modificaste, con sus rutas exactas.
- Los archivos nuevos que conectaste y los que permanecen intactos.
- El SQL completo de `0023_research_evidence.sql` sin modificar migraciones anteriores.
- Variables y secretos que debo configurar, indicando en qué panel y en qué nombre exacto.
- Resultado real de cada prueba.
- Un resumen de cómo manual `/run` y Cron activan el mismo flujo sin depender de horarios de GitHub.

No me entregues un análisis, un plan futuro, pseudocódigo, fragmentos aislados ni una lista de tareas para hacer después. Implementa los cambios compatibles ahora y entrega el código completo. Si una prueba no se puede ejecutar, dilo explícitamente y no simules que pasó.
