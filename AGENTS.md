# AGENTS.md — Bvelt Radar

## Fuente canónica
- **Único plan del ecosistema:** https://github.com/rayleblanc/LocalFlowPro/blob/main/docs/MASTER_PLAN_BVELT_ECOSYSTEM_2026-12-10.md
- No mantener un roadmap alternativo en este repositorio.
- El plan canónico gobierna alcance, fechas, conectores, prioridades P0–P11 y arquitectura A–I.
- Este archivo mantiene únicamente responsabilidades y reglas técnicas específicas de Radar.
- Si el agente no puede leer el plan canónico, debe informar el bloqueo; no reconstruirlo desde snapshots antiguos.

## Rol de Radar
- Radar observa y descubre empresas, buyers, señales y oportunidades originales.
- Founder Mode encuentra compradores potenciales para Bvelt.
- Core Founder discovery, D1 persistence, queue processing, AI drafting and manual contact must not depend on GitHub Actions. Actions/Scrapling is optional enrichment only; its failure is a visible degraded state, never a reason to suppress core discovery.
- The Founder PWA is an owner-only contact workbench. Current primary destinations are **Contactar** and **Configuración Tenant** only. Missions, opportunity scoring, research, budgets, queues and learning remain backend capabilities; do not restore separate Missions or Opportunities dashboards unless a concrete founder action requires them. This 18-11 P7.1 contract supersedes earlier navigation descriptions in this file.
- Every contact flow distinguishes channel opened, account verified, opt-in evidenced, message sent and reply received. WhatsApp deep links are manual; never mark a send from a link click. Server-side confirmation requires the existing verifiable opt-in evidence and cooldown gates.
- Tenant Mode encuentra oportunidades para cada negocio autenticado a partir del perfil/ICP/territorio canónico de Bvelt.
- Prospect research C23 usa realm=PROSPECT; no es evidencia Tenant ni entra en BEM Tenant outcomes/metrics/learning.
- BEM en LocalFlowPro es memoria canónica; Brain decide; Radar no convierte puntuaciones de fuente en verdad comercial.

## Límites críticos
1. Founder, Tenant y PROSPECT tienen IDs, credentials, runs, candidate associations, budgets, suppression, queues, metrics y learning aislados.
2. No confiar en tenant_id de request sin validación server-side y asociación D1 exacta.
3. No confundir proveedor/competidor con comprador. Buyer-fit y trade coherence usan rol y contexto.
4. No degradar ICP, buyer-fit, dedupe, evidencia, confianza, geolocalización, consentimiento ni quality gates para subir volumen.
5. Medir tiles/areas/queries/sources, candidatos brutos, únicos, evaluados, aceptados/rechazados y motivos. Timeout, 401/403, rate limit, source error, Cron detenido o queue rota no son cero prospectos.
6. No hardcodear ciudades/países ni usar Miami/Florida/Fort Myers como fallback. Geo data versionada y redistribuible con attribution/license; market universe prioriza, no restringe.
7. Perfil Tenant viene de Bvelt: trade, subtrades, services, buyer ICP, ubicación, cobertura, country/region/city, language, timezone, verification, provenance, snapshot/version y correlation/idempotency IDs. Campo requerido ausente produce estado accionable.
8. Cada observation conserva source URL, observed_at, extraction method/version, hash, scope, confidence, evidence status y limitations. No HTML dumps ni PII innecesaria.
9. Sidecar es adquisición acotada de webs públicas. SSRF, DNS privado, redirects, schemes, robots/ToS, files, body size, deadlines, per-domain rate/concurrency, retries y prompt injection son controles obligatorios.
10. Optional provider key ausente = UNAVAILABLE explícito; nunca inventar señales.
11. Outreach permanece manual y bajo volumen hasta pasar compliance, domain/sender identity, suppression, opt-out, bounce, idempotency y autorización.
12. Sent/delivered/reply/quote/appointment/model score no equivalen a sale/revenue.
13. Preservar budgets global/tenant, Retry-After, provider/model cooldown compartido en D1, bounded retries, leases, reaper, Queue recovery y DLQ.
14. No perder jobs en restart ni duplicar dispatch/evidence. Run+tenant idempotency requerida.
15. Secrets solo como Cloudflare encrypted secrets. Nunca restaurar fallback plaintext GITHUB_ACTIONS_TOKEN. Revisar binding names, nunca values.
16. Migraciones históricas inmutables. Hay sequence numbers duplicados 0019/0020/0023/0024/0025 y baseline de D1 productiva. No ejecutar migrations apply a ciegas; comparar schema/ledger y documentar recovery.
17. Contratos Bvelt↔Radar se actualizan coordinadamente o se versionan.
18. No alterar AI provider cascade ni model IDs sin evidencia oficial y autorización apropiada.

## Estado base documentado al consolidar — 18-11-2026
- Radar main observado en a742a4186df9babac86ffcc50be6282a6c67fbe1. Reconsultar siempre.
- No se devolvieron PRs abiertos en la lectura de consolidación.
- Producción: Worker bvelt-radar versión #253 / 43268c95-3a1b-4123-bdcb-ba82973e6021 con 100% traffic en la inspección; cron 0 12,17,22 * * *; D1, Queues y Workers AI bindings presentes.
- Cloudflare no expuso SHA de Git para esa versión. No afirmar parity exacta con main.
- Logs persistentes e invocations activos; redact_query_string=true; traces desactivados.
- Provider cooldown C19 integrado; CI histórico del PR #48 no prueba el SHA actual ni runtime productivo.
- Sidecar workflow, runner, scraper, URL policy y prospect-finding schema existen en main; ejecutar suites y smoke de callback/read-back antes de declarar funcionalidad de producción.
- **Owner credential blocker:** GITHUB_ACTIONS_TOKEN heredado sigue plain_text y falta GITHUB_ACTIONS_TOKEN_SECRET. Código actual falla cerrado para dispatch. El propietario debe revocar/rotar token antiguo, añadir reemplazo de mínimo privilegio como Worker Secret GITHUB_ACTIONS_TOKEN_SECRET y retirar la variable plaintext. No leer/transmitir el valor.
- Verificar source SHA/deployment, provider fallback, tenant ai_units, receipts Tenant y source-evidence persistence antes de declararlos probados.
- La documentación antigua docs/AI_STUDIO_INTEGRATION_PROMPT.md fue retirada tras migrar requisitos al plan canónico. No recrearla ni usar prompts/snapshots viejos.

## Estado actualizado tras ejecución — 18-11-2026 21:25Z
- Radar main: `df8423042a2541daa5812e0280914a76540c0c80`. PR #49, #50, #51 y #52 están merged; comprobación final: cero PRs abiertos.
- CI exitoso en los cuatro PRs. El PR #52 valida el guard de sidecar opcional; Sidecar tests y TypeScript build + test:radar pasaron.
- Cloudflare Worker #260, version `30b2fb0c-f87a-443d-a2f7-a4dda5569786`, 100% traffic. Founder `FOUNDER_AUTO_OUTREACH=false` confirmado en bindings activos.
- Observability `redact_query_string=true` se reaplicó por API después del deploy #260 y se verificó. Wrangler no lo mantuvo en el deploy previo; volver a verificar/reaplicar después de cada deploy hasta que se valide una configuración declarativa que lo preserve.
- El binding plaintext `GITHUB_ACTIONS_TOKEN` continúa presente en Cloudflare; no utilizarlo. `GITHUB_ACTIONS_TOKEN_SECRET` aún falta. El propietario debe revocar el PAT anterior, borrar el binding plaintext desde Cloudflare y configurar un nuevo secret cifrado de mínimo privilegio. No leer ni compartir el valor.
- Sin el secret cifrado, `maybeDispatchSidecarResearch` ahora sale antes de reservar dispatch D1 y emite INFO; core discovery no depende de Actions.
- D1 queue reconciliation: cero jobs pending/processing; un registro approve que ya tenía completed_at fue reconciliado a completed. Permanece un único failed histórico del 2026-11-09 (`Cannot read properties of undefined (reading 'toLowerCase')`), sin jobs activos.
- Última lectura de budget Founder: discovery 45/45, enrichment 20/20, AI 10/10, finalize 8/10. No elevar cuotas sin medición.
- 24 prospects con `whatsapp_manual_ready`, 0 opt-ins confirmados. El enlace abre WhatsApp manualmente; el backend bloquea registro de envío sin consentimiento verificable.
- El dashboard prioriza Contactar; PR #50 expone WhatsApp para drafts preparados y reutiliza el draft guardado. Smoke visual/autenticado real en Android sigue pendiente del propietario.
- `redact_query_string` y el binding plaintext son dos estados distintos: redacción ya activa; token antiguo todavía debe ser revocado/eliminado por el propietario.

## Protocolo de implementación
1. Leer este archivo y el plan canónico.
2. Inspeccionar main, branches, PRs, workflows/logs, Worker version/traffic, bindings/secrets by name, D1 schema/migrations, queues/DLQ, cron y sidecar.
3. Mapear requisito → archivo/endpoint/table → test → log/metric → acceptance.
4. Buscar módulos equivalentes antes de añadir helpers, schemas, endpoints, tables o migrations.
5. Ejecutar npm ci, npm run build, npm run test:radar, tests Sidecar y py_compile según los archivos afectados; incluir regresiones de realms Founder/Tenant/PROSPECT.
6. Comparar schema de D1 con producción. No renombrar migraciones previas ni ejecutar migrations apply sin baseline reconciliado.
7. Tras diff revisado y checks requeridos verdes, la autorización limitada preexistente permite deploy de Radar; verificar versión 100% traffic, bindings, cron, queues, logs, smoke y source SHA si disponible. Esta autorización no se extiende al Worker Bvelt.
8. Mantener Founder discovery, Tenant search, queues, cron y recovery operativos. Nunca deshabilitar silenciosamente.

## Entrega de sesión
Archivos, diff, commit/SHA, PR/merge, tests realmente ejecutados, logs completos, migración/baseline, deployment version/traffic, binding names, cron/queue/DLQ, smoke, source SHA parity, owner actions y customer signals. No afirmar éxito si no hubo resultado observable.


## Founder workbench contract — 18-11-2026
- Founder UI is a contact workbench, not a CRM/operations console. Primary work is review → AI draft → email/WhatsApp handoff → explicit outcome.
- Keep Missions, opportunity scoring, research, budgets, queues, learning and provider diagnostics in backend/telemetry. Do not restore a separate Missions or Opportunities dashboard unless a concrete founder action requires it.
- UI destinations: Contactar and Tenant configuration. Founder/Tenant mode selector and strict server-side tenant scope remain.
- Dashboard metrics must come from server-side D1 aggregates, scoped to the active realm/tenant. Never compute all-time totals from a client-side capped prospect list.
- Correo listo means status=approved, valid verified email, no suppression, no active cooldown. Borradores WhatsApp is a separate draft count and is not consent or sent. Contactados requires a confirmed persisted send/outcome; opening mailto/wa.me is telemetry only.
- A manual action must move the persisted state; refresh metrics from the server after it. approved is not a pending approval state.
- Unknown or absent expected value is N/D. Never use score, fixed fallback dollars or fabricated monthly revenue as economic value. Keep modeled estimates labeled as modeled and sourced.
- Backend opportunity/missions schemas and learning are preserved; remove only redundant user-facing surfaces, not historical data or engine functionality.
- Founder contact-first workbench is integrated and deployed: Radar main commit 1abc9331767e6bedede41bba27cf2dc7201480eb; Worker #262 version 52150d7e-006b-4530-9034-f5f136da66ed at 100% traffic. CI #828 passed (build, 35/35 Radar tests, Sidecar tests); Cloudflare Workers Build 77e1d7cf-9e43-4408-89e9-92fc0c319f80 succeeded. P7.1 is closed; keep Missions/Opportunities backend-only unless a concrete founder action justifies a UI surface.

## Checkpoint de adquisición Founder/Tenant — 19-11-2026
- Propósito operativo confirmado: Founder descubre compradores potenciales para Bvelt; Tenant descubre los compradores del negocio autenticado a partir de su ICP/servicios/territorio. Radar no es una lista genérica de empresas ni un automatizador de WhatsApp. Pipeline: descubrimiento → evidencia → buyer-fit/contactabilidad → decisión → canal → outcome.
- D1 producción, lectura de solo lectura: 587 prospects Founder (la captura anterior mostraba 574; el run posterior añadió 13). 235 tienen algún email almacenado y 347 algún teléfono; esto no significa que estén verificados ni autorizados. Workbench actual: 40 pending_email, 28 whatsapp_manual_ready, 39 contacted.
- UI root cause confirmado: `GET /prospects` limita por defecto a 100 filas recientes; el contador `pending_email` agrega toda D1. El filtro READY se calculaba localmente sobre esas 100 filas, ocultando prospectos aprobados más antiguos aunque el contador los incluya.
- Fix preparado en branch `fix/founder-ready-filter-full-set-20261119`, HEAD `a754d9cd6b3e03ad1eba3061cd0a6ede54285e71`: al seleccionar READY, la PWA pide `status=approved` al endpoint ya existente, manteniendo tenant_id; vuelve a cargar al cambiar filtro. No descarga todos los registros al móvil.
- Bug de medición/contabilidad Hunter confirmado en `handleEnrichJob`: se liberaba `hunter_units` y no se incrementaba `hunter_calls` cuando una respuesta HTTP exitosa no encontraba email. Por tanto 0 unidades/calls no demostraba que no se consultara Hunter. Fix preparado en la misma rama: contabiliza y confirma presupuesto para todo HTTP 2xx, incluso no-match; libera solo HTTP no exitoso/exception; guarda `hunter_search_outcome` sin PII. Añadida prueba de selección de emails Hunter.
- El run más reciente inspeccionado: 13 nuevos prospects; 13 unidades enrichment; 8 AI; 4 finalize; 4 borradores WhatsApp; ningún email nuevo validado en esos 13. Los candidatos incluyen law firms, real estate, wealth management y una fundación etiquetados en parte como `storage_facility`. Esto es señal de baja coherencia de segmento/etiquetado en Founder, no una prueba de que Overpass o Scrapling sean el único cuello de botella.
- Las fuentes principales siguen funcionando sin Scrapling: Geoapify, LocationIQ, Photon, Overpass y BizData según disponibilidad. El run más reciente registró varios Overpass mirrors con 0 elementos y BizData 502/unsupported en algunas categorías; no detener el core por esperar GitHub Actions.
- WhatsApp: el número en formato internacional solo permite construir un enlace wa.me; no verifica que exista una cuenta WhatsApp activa. `whatsapp_manual_ready` es un borrador manual, no cuenta confirmada ni consentimiento. Mantener confirmación manual y opt-in explícito.
- Tenant D1 observado: `tenant_custom_01` tiene 21 qualified, 5 hold por `TRUST_STACK_UNAVAILABLE: HTTP 530 / error 1016`, 2 por falta de email verificado y 1 disqualified. Su configuración actual es genérica (`commercial_services`, Austin, ICP sin keywords); otro perfil importado carece de servicios/ICP/timezone. No declarar Tenant listo solo porque el endpoint/run existe.
- Binding de nombre `HUNTER_API_KEY` existe como secret_text; no se leyó ningún valor secreto. No se puede afirmar que la credencial funcione sin una prueba de preflight autorizada.
- Estado de rama tras checkpoint documental: 3 commits ahead / 1 behind respecto a main (el commit posterior de main es documental); 3 archivos de código/tests cambiados; sin PR. No tests/build/CI ejecutados; no merge ni deploy. Scrapling queda como enriquecimiento opcional, no bloqueo del descubrimiento principal.
- Siguientes gates: (1) ejecutar test:radar/build cuando vuelva Actions; (2) validar READY con los 40 registros en Android; (3) mejorar precisión de buyer-fit/segment mapping y no etiquetar candidatos por el query trade sin evidencia; (4) medir Hunter requests, matches, verification y no-match por separado; (5) arreglar/validar Trust-Stack HTTP 530 y completar perfil/ICP Tenant antes de declarar Tenant funcional.
