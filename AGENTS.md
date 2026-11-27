# AGENTS.md — Bvelt Radar

## 1. Fuente canónica y alcance
- Plan único activo: https://github.com/rayleblanc/LocalFlowPro/blob/main/docs/MASTER_PLAN_BVELT_ECOSYSTEM_2026-12-10.md
- Archivo íntegro anterior: docs/archive/MASTER_PLAN_LEGACY_2026-11-26.md en LocalFlowPro; referencia histórica, no roadmap activo.
- Este archivo define ownership y reglas operativas de Radar. No crear otro roadmap.
- Repositorio: rayleblanc/bvelt-radar. El producto Bvelt vive en rayleblanc/LocalFlowPro.
- No incorporar remesas/remittance, Trust-Stack, VOLT ni otros proyectos/Workers.

## 2. Misión y jerarquía
Radar Tenant es una capacidad principal y pagada de Bvelt: inteligencia comercial por servicios, compradores, relaciones, territorio y señales de demanda. No debe reducirse a directorio o lista de prospects.
Radar Founder es una herramienta interna reemplazable para captar clientes de Bvelt; mantenerla simple y fiable, sin desplazar Tenant/BEM/Brain.
Radar descubre y conserva evidencia original; BEM en LocalFlowPro es memoria canónica; Brain decide; Bvelt muestra y ejecuta bajo policy.

## 3. Separación de realms
- FOUNDER, TENANT y PROSPECT/PUBLIC separados en identidad, D1 rows, keys, budgets, caches, metrics, claims, contacts, suppression, actions y learning.
- Tenant/owner/realm se resuelven desde auth/profile/business verificados por servidor. Nunca confiar en tenant_id, ownerUid, businessId o role enviado por cliente.
- No mezclar tenants ni atribuir prospects históricos a un tenant por similitud de nombre, trade o ciudad.
- DEMO/public/prospect research no se convierte en BEM evidence/outcome de Tenant sin owner binding y contrato autenticado.

## 4. Tenant profile y ciclo de oportunidad
El perfil versionado debe contener owner identity, trade/subtrades, services, capabilities, service areas, geografía, país/región/ciudad, ICP, buyer segments, exclusiones, idioma, IANA timezone, verification, provenance, snapshot version/hash y correlation/idempotency IDs.
Perfil incompleto produce PENDING_CONFIGURATION; no crear misión genérica ni inferir ciudad/servicio/cobertura. Sanitize persisted target arrays before ranking or enqueueing: discard null, blank, and non-string city/trade values; `startProspectingRun` must reject incomplete city+trade pairs before creating Queue jobs. The historical 2026-11-09 Naples job with a missing trade is not replayable and must not be reactivated.
Ciclo requerido:
profile confirmado → discovery → source evidence → entity resolution → opportunity/relationship → D1 durable → authenticated BEM ingest → {ok:true} → receipt/read-back → UI → action eligibility → outcome → learning.
HTTP 2xx sin aceptación JSON explícita no es receipt.

Cada oportunidad conserva:
- canonical/external entity identity, aliases, duplicates y conflicts;
- relationship_type y service_fit;
- source URL, published/observed/retrieved timestamps, freshness, method/version, confidence, coverage y limitations;
- buyer_fit, timing_signal, evidence_refs, missing_evidence y suggested_next_step;
- contactability, channel_readiness, policy_eligibility y send eligibility como dimensiones separadas.
No fabricar contactos, nombres, dirección, website, fit, intención, ingresos ni señales.

## 5. Inteligencia de mercado y fuentes
- Market universe configurable; nunca hardcodear ciudades/países/nichos como defaults universales.
- Overture Places/GERS: fuente candidata de POIs/taxonomía e ID externo; validar cobertura, freshness, schema y licencia/lineage por fuente. GERS no reemplaza identidad interna BEM.
- Foursquare OS Places: contraste/enriquecimiento después de medir calidad; coincidencia entre datasets con upstream compartido no cuenta como independencia.
- OSM/Overpass/Nominatim/Photon: fuentes auxiliares, límites, fair use, cache, atribución y ODbL. Instancias públicas no son SLA ni API masiva.
- Permits/tenders/procurement: señales potenciales de alta intención, específicas por jurisdicción y fuente. No inferir universalidad.
- H3: territorios/celdas/spatial joins; no routing ni travel time.
- Entity resolution: normalización, exact keys, blocking, multi-metric similarity, MATCH/NO_MATCH/REVIEW_REQUIRED. No fuzzy merge automático.
- Fuse/Talisman/MiniSearch solo con benchmark/corpus acotado; SQL indexes/FTS primero.
- No contar mirror/repeated fetch/records derivados como evidencias independientes.
- Respetar ToS, robots, privacy, licensing, attribution, rate limits, SSRF y source policies. robots.txt no es autorización legal.

## 6. Opportunity intelligence
Radar Tenant debe identificar compradores directos, referral partners, prescribers, complementary providers, property/facility managers, GCs/CMs, HOAs, institutional buyers y procurement/project opportunities según el perfil del tenant.
Conservar las familias de señales EXPLICIT_DEMAND, PAIN, WORKAROUND, SWITCHING y TIMING.
Separar:
- buyer/opportunity fit;
- evidence confidence/freshness;
- contactability;
- channel readiness;
- policy/send eligibility.
No descartar automáticamente por score bajo, falta de canal o datos incompletos; usar NEEDS_ENRICHMENT/UNKNOWN/LOW_PRIORITY/REVIEW cuando proceda.
Provider 401/403/429/5xx/timeout, source degraded, coverage gap o ausencia de datos no son cero oportunidades ni ausencia universal.
El ranking debe explicar servicio/relación, evidencia, momento, incertidumbre, esfuerzo y siguiente paso.

## 7. Seguridad y outreach
- Founder auto-outreach permanece false salvo cambio explícito y policy aprobada.
- No outreach Tenant/Founder sin lawful basis/jurisdiction, consent cuando aplique, opt-out/suppression, sender readiness, quiet hours IANA, frequency caps, budget, cooldown, idempotency y owner approval cuando corresponda.
- Owner approval no sustituye base legal ni consentimiento.
- Email webhook: Svix raw-body signature, timestamp/replay protection e idempotencia por provider event ID. Los eventos de entrega deben mapearse al recibo exacto de email_dispatch_logs (provider + message_id + tenant + recipient); inbound replies solo se asocian si el email del remitente mapea inequívocamente a un dispatch histórico. Nunca confiar solo en prospect_id/email del payload. Ignorar targets ausentes/ambiguos/mismatch sin mutación. Transiciones monotónicas: eventos débiles tardíos no degradan delivered/opened/clicked ni respuestas humanas; bounce/complaint/suppression/unsubscribe prevalecen como safety states. No actualizar dispatch log si el evento fue duplicado, rechazado o no aplicado.
- Delayed, delivered, permanent bounce, transient bounce, failed, suppressed, complaint y negative reply son eventos distintos.
- Founder manual puede omitir solo automated daily quota; nunca reputation circuit breaker, suppression, cooldown, idempotency ni per-tenant limits.
- WhatsApp/mailto/SMS link abierto es HANDOFF_REQUESTED, no SENT/DELIVERED.
- No enviar ni replayar mensajes durante auditorías. No tocar recipients/suppressions reales para smoke.

## 8. Resiliencia, coste y rendimiento
- D1 queries tenant/realm scoped, bounded, paginated y con proyecciones explícitas; no SELECT * indiscriminado.
- Jobs durables, leases, retries bounded, Retry-After, dedupe, outbox, DLQ y estados de reconciliación.
- No repetir discovery/ICP expansion/geo ranking en requests de UI innecesariamente.
- Token bucket distribuido requiere estado persistente/atómico; no memoria del isolate ni KV eventual como garantía estricta.
- Sidecar/Scrapling es opcional; ausencia no bloquea core discovery/ingest/learning. No restaurar plaintext GITHUB_ACTIONS_TOKEN. No leer/imprimir secretos.
- Presupuesto incremental objetivo USD 0; no añadir card-gated APIs, R2, paid AI o provider premium como dependencia.
- Mantener cascade Gemini/Groq/Workers AI, provider order y model IDs. No introducir Grok/xAI.

## 9. Protocolo de ejecución para agentes
Cuando el propietario diga «continúa con el plan»:
1. Leer este archivo y el checkpoint del plan único.
2. Revalidar main SHA, branches, PRs, GitHub workflows/logs, Cloudflare build/deploy/logs y D1 schema/ledger de solo lectura.
3. Ejecutar la primera fase incompleta hasta cerrarla, sin pedir confirmaciones rutinarias. La falta de clientes no bloquea fases técnicas: usar tenants/fixtures sintéticos y sandbox; nunca usar prospects reales para smoke ni fabricar outcomes.
4. Hacer inspección dirigida una vez; implementar, testear, corregir y desplegar si el plan/hold lo permite. No quedarse en auditorías sucesivas.
5. OWNER_ACTION/BLOCKED_EXTERNAL no detiene trabajo independiente. No ejecutar acciones externas sensibles sin autorización.
6. Integrar en main; PR temporal solo si branch protection lo exige y debe fusionarse/cerrarse durante la misma fase. Cero PR propios abiertos al final.
7. Revisar logs completos; no confundir build con test suite ni deployment con Tenant end-to-end.
8. Al cerrar, eliminar la fase de la lista activa, registrar commit/tests/deploy/logs y actualizar el checkpoint y este AGENTS.md.
9. Respuesta final breve: fase, commits, pruebas, deployment, logs y bloqueo real. Sin explicación extensa.

## 10. Hold y despliegue
- La falta de créditos GitHub Actions hasta 2026-12-01T00:00:00Z bloquea solo esos workflows; no congela el trabajo Radar ni los despliegues Cloudflare.
- Cloudflare Workers Builds es el gate de release independiente de Actions. `wrangler.toml` invoca `npm run verify:release`, que ejecuta TypeScript lint, `test:radar`, pytest del sidecar y build Vite/Worker; cualquier fallo debe detener el deploy. No asumir que corrió hasta leer el log exact-SHA.
- Después de cada push a main, comprobar el build exact-SHA, logs completos, Worker version, deployment ID y traffic. Si un build queda queued/failed, investigar y no declarar deploy.
- GitHub Actions queda como fallback opcional; ningún requisito de release debe depender exclusivamente de sus minutos.
- El Worker no despacha ni importa GitHub Actions. Scrapling queda como enriquecimiento manual/externo opcional; nunca condiciona Queue, cron, discovery, Tenant, BEM ni release. No añadir credenciales PAT al Worker ni restaurar dispatch automático. Una futura ejecución nativa requiere diseño/benchmark y SSRF/robots/rate-limit/aislamiento antes de activarse.
- No afirmar Tenant operativo por prospects D1. Requiere acknowledgement BEM, receipt/read-back, UI y outcome.
- No dejar PR abierto, branch temporal huérfana, migration sin read-back o error propio sin corregir.

## 11. Scope freeze
No añadir ideas nuevas al plan activo durante el programa salvo vulnerabilidad/incidente real, requisito legal/proveedor o bloqueo directo demostrado de cliente. Las mejoras nuevas aprobadas ya están distribuidas en las fases 1–9 del plan único.


## 12. Cierre finito y no-regresión
- El plan maestro de LocalFlowPro es la única fuente de fases activas. Este archivo no debe convertirse en roadmap paralelo.
- Ejecutar solo la primera fase incompleta. Al cerrarla, eliminarla de la lista activa del plan y dejar un registro histórico conciso; no conservar tareas resueltas como pendientes ni reabrir por mejoras opcionales.
- Las reglas permanentes descubiertas durante una fase se conservan aquí como invariantes, no como tareas repetidas.
- Reabrir una fase cerrada únicamente ante regresión demostrada, incidente real, obligación legal/proveedor o bloqueo directo de cliente con evidencia. Documentar el motivo y alcance exacto.
- Después de cada cambio significativo, actualizar el checkpoint del plan y este AGENTS cuando cambie una regla operativa; releer los archivos y comprobar SHA/main, PRs y Cloudflare Builds/deployments disparados por documentación.
- No declarar Tenant completo por build, D1 prospects ni HTTP 2xx: exige el ciclo autenticado hasta receipt/read-back, UI, acción elegible, outcome y aislamiento probado.
- Radar Tenant es capacidad primaria pagada; Founder es reemplazable. No permitir que trabajo Founder consuma el presupuesto o retrase los gates de Tenant.
- Mantener adquisición Founder sin outreach automático por defecto y sin exceder consentimiento, suppression, reputación ni jurisdicción. Los objetivos comerciales y límites de marketing están definidos en el plan maestro; no inventar canales ni presupuesto.
