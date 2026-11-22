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
- Core Founder discovery, D1 persistence, queue processing, AI drafting and contact execution must not depend on GitHub Actions. Actions/Scrapling is optional enrichment only; its failure is a visible degraded state, never a reason to suppress core discovery.
- The Founder PWA is an owner-only contact workbench. Current primary destinations are **Contactar** and **Configuración Tenant** only. Missions, opportunity scoring, research, budgets, queues and learning remain backend capabilities; do not restore separate Missions or Opportunities dashboards unless a concrete founder action requires them. This 18-11 P7.1 contract supersedes earlier navigation descriptions in this file.
- Every contact flow distinguishes contact data, channel readiness, applicable email lawful basis, channel opened, message sent and reply received. Email policy is jurisdiction/subscriber-specific: auto-send only on SEND_ALLOWED; owner-confirmed manual send can proceed for a syntactically valid address when the owner attests to an applicable lawful basis and accepts unverified-mailbox bounce risk. WhatsApp/SMS retain separate consent and account-verification requirements; a deep-link click never records a send.
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
11. Email Founder usa policy por jurisdicción: AUTO_SEND solo con SEND_ALLOWED, buzón provider-verified, sender/domain, identidad y dirección postal exigibles, suppression, opt-out, bounce/complaint, cooldown, frequency, idempotency y budget. En OWNER_REVIEW/CONSENT_REQUIRED/POLICY_UNKNOWN no auto-send; la interfaz puede ofrecer envío manual con confirmación explícita del propietario y advertencia de riesgo. La confirmación manual no elimina requisitos aplicables de identidad del remitente, dirección postal, opt-out ni suppression; rebotes, quejas y bajas nunca se reintentan. Email sintácticamente válido/MX-capable entra a revisión aunque no esté provider-verified; UI advierte riesgo de rebote. WhatsApp/SMS conservan opt-in y verificación propios. No habilitar producción antes de CI + sender preflight + smoke.
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

## Regla fundamental de adquisición y outreach — 19-11-2026 (prioridad P7)
- Objetivo Founder: descubrir y convertir oportunidades para Bvelt; Tenant: oportunidades para el negocio autenticado. No convertir el motor en un filtro de empresas perfectas. Un negocio válido no comprador hoy puede recomendar, derivar o convertirse en comprador más adelante.
- No descalificar por fit bajo, industria no prioritaria, score bajo, falta de señales de dolor, falta de teléfono, falta de WhatsApp, falta de email o ausencia de datos. Mantener esos estados como LOW_PRIORITY, UNKNOWN, NEEDS_ENRICHMENT, REFERRAL_POTENTIAL o NO_CHANNEL_YET; solo suprimir por razones objetivas (opt-out/complaint, hard bounce, duplicado confirmado, entidad no comercial/no válida, fraude/abuso, prohibición legal aplicable o hard exclusion explícita justificada). Las listas de exclusión de mercado dejan de ser gates de descarte comercial y pasan a señales negativas/segmentos de baja prioridad, salvo prohibición objetiva.
- Separar tres ejes que hoy se mezclan: (1) opportunity_score — potencial comercial/referral, no contactabilidad; (2) evidence_confidence — hechos observados vs inferencias/unknown; (3) channel_readiness — dirección/contacto auténtico, entregabilidad, política de envío, sender readiness y suppression. Ningún eje debe reescribir a otro.
- Rehacer la fórmula: no sumar pain por ausencia de booking/quote ni por falta de señales; ausencia = UNKNOWN. No premiar automáticamente LLC/Group/Services en el nombre como prueba de capacidad de pago. Priorizar buyer workflows (llamadas, formularios, presupuestos, reservas, recurrencia, áreas/servicios, reseñas) cuando estén observados. Mantener expected_value claramente modelado y separado del score; no inventar dolor ni ingresos.
- Email trust escalonado: SYNTAX_ONLY, DOMAIN_MX, DOMAIN_ALIGNED, SOURCE_PUBLISHED, PROVIDER_VERIFIED, BOUNCE_CONFIRMED. Verificación de buzón no es lo mismo que verificación de persona. No bloquear oportunidad por no tener Hunter/Abstract ni por cuota agotada. Enviar solo si dirección es auténtica con confianza suficiente y no hay señales de invalidez; no presentar MX como prueba de buzón individual.
- No exigir opt-in universal para email B2B. Resolver política por jurisdicción + tipo de suscriptor + fuente/rol de la dirección. Estados explícitos SEND_ALLOWED, OWNER_REVIEW, CONSENT_REQUIRED, SUPPRESSED, POLICY_UNKNOWN. Donde la norma permita primer contacto B2B sin opt-in (p.ej. ciertos corporate subscribers UK y CAN-SPAM USA con obligaciones de contenido), permitir envío con identidad veraz, dirección postal/contacto exigible, asunto honesto, identificación comercial cuando proceda y baja funcional. Donde se requiera consentimiento (p.ej. CASL Canada y Spam Act Australia según caso), registrar la base válida; una dirección pública por sí sola no es autorización universal. Jurisdicción desconocida => OWNER_REVIEW, no descartar al prospecto.
- Founder outreach mode: configuración global AUTO_SEND_ALLOWED o CONFIRM_EACH_SEND. En el primer modo, Radar envía automáticamente solo si la política por jurisdicción lo permite, sender/domain está autenticado, email pasa autenticidad/entregabilidad, suppression/opt-out/bounce/cooldown/frequency/idempotency pasan y hay presupuesto. En el segundo, Radar crea una cola de mensajes con destinatario, evidencia, fuente, motivo de política, asunto y cuerpo; el propietario confirma el envío. No pedir permiso individual al propietario para cada registro en modo auto. Tenant requiere configuración/autorización del tenant y nunca hereda Founder credentials/settings.
- WhatsApp y SMS tienen políticas propias; teléfono válido/E.164 no prueba cuenta WhatsApp ni permiso. No trasladar reglas de email a WhatsApp.
- Cualquier correo enviado debe identificar al remitente real, tener asunto no engañoso, información de contacto/dirección requerida en jurisdicción, opt-out claro y operativo, suppression global por destinatario y dominio cuando corresponda, webhooks de bounce/complaint/unsubscribe, idempotencia y límites conservadores de volumen/reputación. Respetar provider ToS y no intentar evadir spam filters.
- Respuestas negativas/opt-out/complaint y hard bounce sí suprimen; not_interested no convierte al negocio en malo, pero detiene futuros contactos directos a ese destinatario conforme a la solicitud. Referral potential puede seguir registrado sin volver a contactar al mismo destinatario.
- Scoring no es autorización de envío. No usar score como legal gate ni channel-ready como medida de buyer quality. Mantener todos los negocios válidos visibles con una acción siguiente y razón clara.
- Esta política prevalece sobre instrucciones antiguas que exijan consentimiento indiscriminadamente para todo email. No elimina las protecciones de WhatsApp/SMS ni los requisitos de suppression y sender identity.
### Estado técnico de envío email — hallazgo 19-11-2026
- Main documenta FOUNDER_AUTO_OUTREACH=false: hoy el flujo Founder prepara draft/approval; no está habilitado el envío automático.
- emailDispatcher.ts usa Resend/Brevo solo si hay key; sin proveedor real cae a simulated. Requiere remitente @bvelt.app y valida sintaxis + MX; MX no demuestra existencia del buzón individual.
- `ensureLegalFooter` aplica el mismo footer de dirección postal + reply-unsubscribe a los envíos manuales y automáticos; elimina el legado `Reply STOP` y evita duplicar o conservar direcciones parciales. `emailDispatcher.ts` añade `List-Unsubscribe: mailto:` en Resend/Brevo; las respuestas llegan por Resend Receiving webhook.
- El envío real sigue bloqueado si `SENDER_POSTAL_ADDRESS` no es una dirección postal física completa. No inferirla ni inventarla. `FOUNDER_AUTO_OUTREACH=false` permanece en producción; no activarlo hasta confirmar dirección, policy matrix, reputación y envío controlado.
- Resend: dominio `bvelt.app` verificado, webhook operativo (29 eventos revisados, todos success). Ventana consultada: 39 envíos, 4 rebotes (10,26%), 0 complaints; 23 suppressions. Mantener el governor conservador (la tasa actual implica cap dinámico 2/día al siguiente preflight) y revisar rebotes antes de subir volumen.
## P7.2 — checkpoint consolidado 19-11-2026 06:05Z
- PR #54 P7.2 está mergeado en main (`89f14bbf36296e0a367576ffd27a79d8ca704fd8`): adquisición de mercado amplio, scoring separado de contactabilidad, policy resolver, owner review para email manual y auto-send solo con policy SEND_ALLOWED + provider verification.
- PR #55 mergeado (`eb90ff0e90a2f7340eb478c7956f66a38a90bc4a`), CI #842 verde, producción Worker versión 272: recupera correos manuales en estados no terminales, evita que WhatsApp sustituya email utilizable, expone general_intro, separa llamada/SMS de WhatsApp account, corrige clasificación comercial y Geoapify facility.
- PR #56 mergeado, CI #846 verde: contadores de finalización email/WhatsApp y AI draft generation idempotentes ante retries.
- PR #57 mergeado, CI #849 verde: Geoapify normaliza underscore/hyphen, añade wealth management/financial advisory y conserva legal/real-estate/storage en categorías correctas.
- PR #58 mergeado (`cc6d34462e400ae168ab58c3b36695bf30ab7adb`), CI #851 verde, producción Worker versión 277 (100% traffic): footer legal común manual/automático, dirección postal completa, email-specific reply-unsubscribe y List-Unsubscribe mailto.
- El Worker productivo sigue con `FOUNDER_AUTO_OUTREACH=false`. El cron global Founder es `0 12,17,22 * * *`; Tenant es demand-driven y no hereda el cron ni credenciales Founder. La URL activa es `https://bvelt-radar.raybg.workers.dev`.
- D1 read-only: Founder 596 prospectos, 239 con email, 356 con teléfono. Cohortes históricas: 60 emails en `below_minimum_score` y 13 en `low_score_or_no_email`; el resolver ahora permite owner review a direcciones sintácticamente válidas, salvo estados terminales/suppression. Tras refrescar dashboard, buscar etiqueta EMAIL · OWNER REVIEW; no interpretar un E.164 como WhatsApp verificado.
- Tenant: `tenant_custom_01` tiene 21 qualified históricos, 5 hold y sin actividad nueva desde 06-11; su ICP expansion contiene buyer segments pero el perfil base usa `commercial_services` genérico. Segundo tenant incompleto (Local Services sin services/service areas/ICP) debe permanecer pending_configuration. No fabricar ICP ni disparar discovery con configuración vacía.
- Fuentes: Overpass/Geoapify principales; LocationIQ escaso; Photon tuvo HTTP 521 y BizData timeout/502. Nominatim POI Founder se omite si no trae contacto/dominio enriquecible, para no gastar cuotas a ciegas. Scrapling/Actions continúa opcional.
- Hunter: D1 mostró 1 unidad Hunter consumida en el día, pero `runs.hunter_calls` permaneció 0 y no se encontró `hunter_search_outcome` en el cohort inspeccionado; reconciliar el run/prospect exacto antes de afirmar que Hunter aporta direcciones. No asumir que la existencia del secret implica key válida.
- Resend: dominio verificado, 29 eventos webhook entregados correctamente, 39 mensajes en métricas y 4 rebotes (10,26%), 0 complaints, 23 suppressions. Los últimos envíos externos de prospecting observados fueron 14-11; después hubo pruebas internas. La reputación actual exige cap dinámico bajo; no activar auto-send.
- Dirección postal: mensajes históricos contenían solo `25100` o carecían de dirección. El secreto actual no es legible; comprobar que contenga dirección física completa antes de cualquier envío real. No pedir/pegar secretos en chat.
- Estado: **IMPLEMENTACIÓN P7.2 MERGEADA Y DESPLEGADA; CI #842/#846/#849/#851 VERDE; OPERACIÓN PENDIENTE DE VALIDAR DIRECCIÓN, BOUNCES, HUNTER Y TENANT E2E.** No se modificaron filas D1 ni se enviaron emails durante estas tareas.
- Próximas acciones: (1) confirmar sender postal address completa y realizar un envío de prueba controlado a una dirección propia, comprobando footer/List-Unsubscribe y eventos; (2) revisar 4 bounces y mantener suppression; (3) reconciliar Hunter; (4) ejecutar Tenant solo con ICP/geografía válidos y verificar aislamiento; (5) validar que dashboard muestra EMAIL · OWNER REVIEW en el conjunto recuperado; (6) mantener auto-send off hasta cerrar esos gates.
## Test log follow-up — 19-11-2026 06:12Z
- Radar CI #851 job logs were inspected, not just the summary. Build job passed; test:radar reported 35/35 pass; Sidecar pytest 21 passed. worker-bundle was skipped by design because Cloudflare Workers Builds handles deployment. Node 20 and punycode deprecation warnings remain.
- The test log also showed Daily Mission create failed and Learning Integrity falling back to uniform prior because two getPriorityTargets test mocks omitted D1 `.run()`/`.all()` methods. Test-only correction is now on main in `380d783aa4103f27c2627d3664d75224b59b1138` (`src/test_radar.ts`). No rerun yet; do not claim the warnings are resolved until rerun after Actions hold.
- Circuit-breaker trip logs, duplicate sidecar dispatch and GitHub 403 logs are exercised failure/concurrency paths in the custom tests; they are not job failures, but must remain asserted as fail-closed behavior.
- Latest Radar main is now `380d783aa4103f27c2627d3664d75224b59b1138`; commit has no checks reported. No PR open. Production Worker remains v277 at 100%; test-only change does not require deployment.
## Founder manual outreach unpause — 19-11-2026
- `RADAR_OUTREACH_PAUSE` is a Tenant-scoped pause, not a Founder-wide stop. Founder owner-confirmed manual email sends must not be blocked by this binding; Tenant manual/automatic outreach remains blocked while it is active.
- Founder manual sends still require an explicit owner action and acknowledgement, a syntactically valid email, authenticated sender/domain and complete postal footer for live dispatch, suppression/opt-out/bounce/complaint checks, per-recipient idempotency/cooldown, sender governor and available budget. Global kill switch and circuit breaker remain effective.
- Paused Founder records are surfaced as `EMAIL · OWNER REVIEW` only when their email is usable and the composite suppression check is clear. Suppressed/cooldown records remain blocked.
- `FOUNDER_AUTO_OUTREACH=false` remains unchanged. This change restores owner-directed manual outreach; it does not enable autonomous Founder sending or relax Tenant controls.

## Founder PWA action inbox — requested UX contract (21-11-2026)

The owner requests a simpler, mobile-first commercial workbench. This section is a future implementation contract, not a claim that the UI is already changed.

- Keep primary navigation limited to Contactar and Configuración Tenant. Contactar opens one canonical Centro de acción / Para actuar inbox. Its tabs are Todos, Para actuar, Nuevos, Enviados, Respuestas and Bloqueados. Labels map to explicit lifecycle states.
- Para actuar is one unified ranked list, not separate email and WhatsApp pages. Each row shows one primary next action, strategic opportunity score, evidence/confidence, reason for priority, channel availability, policy/readiness and whether owner approval is required. A high score is not permission to send.
- Separate axes: (1) opportunity_score / strategic_score = commercial potential; (2) evidence confidence = observed facts vs inferred/unknown; (3) channel readiness = authentic contact data, provider verification/deliverability, policy, suppression and sender readiness. Never substitute legacy prospects.score for strategic score without an explicit compatibility contract. Do not silently mix prospects.opportunity_score with opportunities.strategic_score; select one canonical score per API response and expose provenance/version.
- Initial Para actuar priority threshold may be 65/100, configurable and tested. It is work-queue prioritization only, never a legal, consent, suppression or auto-send gate. Include lower-score valid prospects in Todos with a reasoned next step.
- Never show 0/100 when scoring is pending, missing, stale or failed. Render distinct states: Evaluación pendiente, Sin datos suficientes, Evaluación no disponible, Evaluado (score), and error/retry. Only a completed numeric score may render as a score. Expose queue state and last evaluation time; revalidate after async jobs finish and when the PWA resumes. Use bounded backoff plus explicit refresh, not unbounded polling.
- Channel badges must be truthful and orthogonal: EMAIL · OWNER REVIEW, EMAIL · SEND ALLOWED, EMAIL · PROVIDER VERIFIED, EMAIL · INVALID/BOUNCED/SUPPRESSED, WHATSAPP · NUMBER ONLY, WHATSAPP · ACCOUNT UNVERIFIED, WHATSAPP · CONSENT REQUIRED, PHONE, SMS · REVIEW, NO CHANNEL. An email field only means an address is stored; it does not prove mailbox/person identity or legal send permission. E.164 phone does not prove WhatsApp registration or consent. Never label phone-only as WhatsApp.
- Cards show email presence and verification/policy state; phone presence; WhatsApp account verification and consent independently; SMS/voice separately. Next action must be explicit: review draft, owner-confirm email, open WhatsApp (manual; opening is not sending), call, SMS review, enrich contact, or no safe channel.
- Distinguish discovered, scored, owner review/notified, owner-approved, dispatch attempted, provider accepted, delivered, replied, bounced, complained, suppressed, blocked, discarded and terminal outcomes. Never call notified/queued/approved/scheduled a sent email, or provider accepted delivered/received.
- Telegram digest and PWA metrics use one server-side aggregation contract and identical time windows/definitions. Label discovery budget separately from owner-approval backlog and send budget. State scope/window and avoid channel double-counting.
- Replace fallback Missed Calls with evidence-backed angle labels. Unknown angle becomes Por calificar / Hipótesis por validar; never claim missed calls without an observation.
- Founder auto-send remains disabled (FOUNDER_AUTO_OUTREACH=false). Keep owner-confirmed manual sends and Tenant controls isolated. This UX request does not authorize changing auto-send, sender governor, suppression, consent, legal policy, budgets, webhook subscriptions or secrets.
- Keep scoring formula/weights unchanged until golden fixtures validate the full pipeline and score provenance. Show compact expandable breakdown with actual dimensions and evidence; unknown remains unknown, not zero.

### Live D1 baseline — read-only, 21-11-2026
- Founder cohort: 675 prospect rows; 275 have a non-empty email field; 431 have a non-empty phone field; 422 have a non-empty website field. These are field-presence counts, not verified or send-ready channels.
- Active/non-terminal cohort (excluding lowercase disqualified, blocked and discarded): 329 rows. opportunity_score is positive for 300; 30 have decision_state=unscored; score_breakdown was populated for the inspected cohort.
- Same cohort contact fields: 191 email+phone, 4 email-only, 117 phone-only, 17 no channel. Phone-only must not be labelled WhatsApp without separate account verification and consent evidence.
- opportunities contains 142 Founder rows with strategic_score 0–90. This differs in coverage from 329 prospect rows and must be reconciled before selecting canonical display score; never average or silently substitute them.
- All Founder statuses: disqualified 336, identified 72, scored 63, hold 48, notified 40, bounced 37, sent 32, delivered 25, discarded 8, held 7, qualified 4, blocked 2, human_review 1. Status counts are not available-action counts without eligibility joins.
- No D1 data/schema was changed.

### Acceptance gates after Actions hold
1. Trace /prospects, /health, scoring queue consumer, Telegram digest and UI mapping end-to-end. Define a versioned response contract for score provenance, evidence, evaluation state, channel readiness and next action.
2. Reconcile prospects.opportunity_score, opportunities.strategic_score, decision_state and score dimensions with production D1 reads; no schema migration until live schema/ledger comparison and rollback plan.
3. Add pure/golden tests for score source selection, null/unknown/pending/error rendering, 65-point prioritization, channel truth table, policy/suppression precedence and lifecycle counts; include them in test:radar.
4. Add endpoint/UI tests for mobile layout, single inbox, all history tabs, search/filter, sorting, pagination, PWA resume/revalidation and async queue completion.
5. Prove Telegram/PWA parity for identical scope/window; label budgets and approval backlog separately.
6. Verify outbound actions remain explicit and safe: no WhatsApp/SMS send from a deep link, no send recorded on open, no auto-send enablement, no cross-mode/tenant leakage.
7. After Actions hold release (2026-12-01T00:00:00Z), implement on a fresh branch from then-current main, run CI and inspect full diff. Do not bypass the hold or deploy before checks and operational gates pass.

### P7 operational finding — 22-11-2026

Live Resend + D1 inspection found a delivery-state regression that is more urgent than the PWA redesign:

- Resend domain bvelt.app is verified; sending/receiving enabled.
- Resend account lists 76 recent email records: 50 delivered, 23 bounced, 3 other statuses. Webhook delivery itself reports success for all 65 returned events (43 delivered, 20 bounced, 2 received); this means Resend successfully posted events to Radar, not that all emails were delivered.
- D1 email_dispatch_logs has 157 rows but only 127 distinct provider message IDs, so status-history rows must not be counted as unique emails.
- Confirmed sample: Florida Plumbing HVAC received a Resend event with bounce.type=Transient and DNS lookup timeout (temporary). Radar webhook correctly recorded delivery_delayed, but scheduled reconciliation later overwrote prospect and dispatch status to bounced and inserted resend_bounced suppression. This is a confirmed permanent-vs-transient classification bug in reconcileResendDeliveries: it treats last_event='bounced' as permanent without checking data.bounce.type.
- Current suppression table has 48 entries reason resend_bounced. Do not assume all are permanent until audited.
- Webhook route currently authenticates using a query-string token; code does not verify Svix signature/timestamp. It also lacks provider-event idempotency and can overwrite later states with older events. Unknown event types default to replied. These are P7 security/state-integrity defects.
- Current Resend webhook subscribes to email.received, delivered, complained and bounced; it does not subscribe to delivery_delayed, failed or suppressed. Bounce payloads still carry transient/permanent classification.
- No data was changed; no emails sent/replayed; no webhook or secret altered.


### Log/source isolation check — 22-11-2026
- GitHub default-branch code search for both "remesa" and "remittance" returned no matches in rayleblanc/bvelt-radar or rayleblanc/LocalFlowPro.
- Cloudflare Workers Observability lists the active services bvelt and bvelt-radar; full-text needle "remit" returned zero events over the inspected 7-day window. This only rules out matching events in that Worker dataset/window, not other external notification systems.
- Datadog log search was unavailable because the connected account returned "No valid indexes specified"; no claim is made about Datadog logs.
- Do not import, add or process remittance logs as Bvelt/Radar project work unless a future requirement explicitly makes them relevant.


### P7 refinement — reconciliation must not infer bounce permanence from email status (22-11-2026)
- The canonical Resend GET email record for the confirmed sample reports status=bounced, while the webhook event payload contains bounce.type=Transient and a temporary DNS lookup timeout. Therefore the email GET/last_event alone does not preserve bounce permanence. Persist the verified webhook event subtype and make reconciliation consume that stored provider evidence. If subtype is missing/unknown, keep the prospect in HOLD/DELIVERY_UNCERTAIN and do not add suppression or count it as a permanent bounce.
- The webhook's email.bounced event is a provider event, but a transient bounce is operationally delivery_delayed, not a terminal bounce. Only permanent bounce or complaint should create hard suppression.
- Observability warnings in the inspected seven-day window include repeated Abstract API 401 and 429 responses, Overpass zero results across mirrors, Geoapify and BizData timeouts, and one Groq cascade 400 on the attack-kit endpoint. These are provider/degraded-source warnings; D1 discovery/enrich/score/technical-audit jobs in the inspected period completed. Preserve source-level degradation diagnostics and do not convert them into false zero-market conclusions. Do not change Gemini/Groq model cascade or identifiers as part of this repair.


### Founder PWA action inbox — implementation started (22-11-2026)

Branch: `feat/founder-action-center-2026-11-22`
Commit: `253f2c034780eae0d1872c89673db79f48f9f1d5`

Implemented in `src/App.tsx`:
- Prospect fetch now requests up to 1,000 rows, retaining strict tenant scoping; it no longer requests only status=approved for the READY tab.
- Canonical per-prospect UI score now prefers `prospects.opportunity_score`, then legacy `score`, `overall_score`, `total_score`. Missing evaluation is represented as PENDIENTE instead of 0/100.
- READY is now the single human-priority inbox (score >=65, at least one contact path, no known suppression), sorted highest score first. This is not send authorization, consent, or automation.
- Contact channel chips explicitly distinguish registered email / owner review, phone with WhatsApp unverified, website-only and no channel.
- Tab labels now read Todos, Nuevos, Para actuar, Enviados, Respuestas and Bloqueados.

Not yet validated or deployed:
- No production Worker/D1 data or schema changed.
- No emails, WhatsApp messages or Telegram messages sent.
- No auto-send flags, secrets, webhooks or provider settings changed.
- Full TypeScript/Vite build and mobile/browser regression tests still required before merge/deploy.
- Follow-up: show action queue count and improve metric strip; add tests for score-source precedence and channel truth table. Confirm whether `opportunity_score` is populated by current scoring pipeline for all current prospects before declaring score reconciliation complete.


### Founder PWA action inbox — CI and merge result (22-11-2026)
- Fixed the initial JSX wrapper regression found by CI; final PR head `de0891e2e63278a22eed919a41cd63e906822fb4`.
- Radar CI run #860 passed: TypeScript/Vite build, `test:radar`, and Python sidecar tests.
- PR #63 merged to main as `6ea2e446ab8f28fdb56d792c9fcd4792fc52cfee`.
- Production deployment is NOT yet confirmed. Cloudflare's latest observed Worker deployment remains the pre-change version from 2026-11-22 00:15:36Z. Do not claim the PWA UI is live until a new Worker version with the merged assets is deployed and verified.


### GitHub Actions follow-up — Founder inbox merge verified (22-11-2026)

- The two earlier failed Radar CI runs (#858/#859; run IDs 44966430112 and 44966459558) failed only at `npm run build` due to the JSX wrapper placement in the new prospect card channel badges. The signal-container wrapper was restored in commit `de0891e2e63278a22eed919a41cd63e906822fb4`.
- Latest run #860 (ID 44966486972) is GREEN: `typescript-build` passed (includes `tsc && vite build` and `npm run test:radar`); `sidecar-tests` passed; `worker-bundle` was skipped by workflow conditions.
- PR #63 was merged at 2026-11-22T00:25:23Z. Merge commit `6ea2e446ab8f28fdb56d792c9fcd4792fc52cfee`; current main includes all Founder inbox UI code. Confirmed by fetching main `src/App.tsx`.
- The CI failures are corrected; no outstanding failing run on this feature branch was observed. Older unrelated historical failures exist in repository Actions history.
- This merge changes the PWA bundle source, not production deployment. Cloudflare production rollout/runtime verification remains separate and has not been claimed.
