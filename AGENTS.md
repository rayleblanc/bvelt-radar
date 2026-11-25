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


### WhatsApp PWA handoff fix — 22-11-2026

- Root cause: PWA used only the universal `https://wa.me/{number}?text=...` link, opened in a new browser tab. On mobile/browser configurations this can land on WhatsApp's web/official handoff page instead of preferring the installed app.
- Added `toWhatsAppLaunchUrl` in `src/phoneUtils.ts`: Android uses an explicit WhatsApp package intent with wa.me browser fallback; iOS uses the registered `whatsapp://send` scheme; desktop/other clients retain the universal wa.me link.
- Updated the primary Founder/Tenant PWA WhatsApp action to use the platform-aware launch URL and same-tab handoff.
- Commits: `b0252ff8828dbf5acd3208c70020bb9493ea9cbb` (helper), `56fe743d00750a5151229c31f1779397836cad3c` (PWA action).
- No changes to prospect phone data, score, send authorization, WhatsApp consent, automation, or outbound dispatch. This opens a manual chat only; it does not send.
- Validation: source edits confirmed on main. GitHub Actions run for these two commits has not yet appeared in Actions history; Android/iOS device smoke tests and production Cloudflare deployment are still outstanding. Do not claim the live PWA has changed until deployed.


## P7 implementation merged — 23-11-2026
- PR #64 `fix(p7): harden Resend webhook lifecycle and bounce reconciliation` merged to `main` as `1c72c0fbbd7373753cbe7735640e2c721a02f0b5`.
- CI run `45153883299` passed TypeScript/Vite build, `npm run test:radar`, and Sidecar tests. `worker-bundle` was skipped by workflow conditions.
- Added `src/resendWebhookSecurity.ts` with Svix v1 raw-body HMAC verification and 300-second timestamp tolerance. Configure secret `RESEND_WEBHOOK_SIGNING_SECRET` in Cloudflare before production deployment. If present, signed verification is mandatory; until then, existing query-token auth remains as compatibility fallback. Do not claim production Svix verification until secret and deployment are confirmed.
- Resend provider `svix-id` is used as the existing `prospect_events.id` idempotency key. Duplicate events are ignored; persistence failure skips side effects. No migration required.
- Unknown Resend event types are ignored; provider complaints are separate from negative sales replies; transient/unknown bounce subtype is held as `delivery_delayed`, does not increment hard-bounce budget and is not permanently suppressed.
- Reconciliation of GET `last_event=bounced` now produces `delivery_uncertain` / HOLD, because that status alone does not prove bounce subtype.
- Live D1 read-back: 49 suppression rows with reason `resend_bounced` (older checkpoint had 48); 163 email dispatch log rows / 133 distinct message IDs. No historical row was changed. Audit all 49 against original Resend event payloads using a dry-run report before any suppression correction; never bulk-unsuppress.
- Current webhook subscriptions remain `email.received`, `email.delivered`, `email.complained`, `email.bounced`. Add failed/delayed/suppressed event types only during a controlled Resend configuration update.
- Last-seven-day Worker logs: 0 error-level Radar events, 24 warnings, mostly Abstract API 401/429 and isolated external-source/provider degradation. Do not confuse these with failed queue jobs or zero market coverage.
- No Cloudflare secret, webhook setting, D1 row, suppression record, outbound email or production deployment was changed. Production deployment SHA remains unverified against current main.
- Canonical full evidence and next actions are in the Bvelt plan section **Live audit and P7 correction — 23-11-2026**. This AGENTS file remains implementation rules, not a separate roadmap.


### P7 retry-on-persistence-failure follow-up — 23-11-2026
- PR #65 merged to main as `753a8cf20dd73aa6fe987a11f25d1eb05ce24553`; CI run `45154963151` passed TypeScript/Vite build, Radar tests and Sidecar tests.
- When the provider event idempotency receipt cannot be persisted to D1, webhook returns HTTP 503 so Resend retries. No side effects are applied before receipt persistence.
- Both PR #64 and PR #65 are merged; no open PR remains. Production is still not deployed and the dedicated Svix secret remains unconfigured.
- See the canonical plan's 23-11-2026 live audit checkpoint for exact evidence and remaining production gates.


### Resend suppression audit result — 23-11-2026
- A read-only reconciliation of original Resend bounce payloads against D1 confirmed **4 transient bounces are incorrectly marked as permanent `resend_bounced` suppressions**. Sixteen other matched events were explicitly permanent. Of 49 unique historical suppression keys, 29 remain unverified against the current webhook history.
- All 49 keys match a prospect; 48 match a dispatch log. Do not bulk-unsuppress. Keep the 29 unknown keys suppressed. Any correction must be a per-key, evidence-backed change to HOLD/DELIVERY_DELAYED, not automatic send eligibility, and must preserve consent/jurisdiction/cooldown gates.
- No D1 or contact state was changed during the audit. Full counts and evidence are in the canonical Bvelt plan section **Resend suppression dry-run — original payload reconciliation (23-11-2026)**.


### Four transient bounce rows corrected — 23-11-2026
- PR #66 merged as `f2d9b6b920a671bc622701019ed8b31792478ed7`; CI run `45155676578` passed TypeScript/Vite build, Radar tests and Sidecar tests. Reconciliation preserves `delivery_delayed` evidence; ambiguous GET `last_event=bounced` remains `delivery_uncertain`.
- Four original Resend payloads with `bounce.type=Transient` were reconciled in D1. Their prospect state is now HOLD / DELIVERY_DELAYED, dispatch logs are `delayed`, and suppression reason is `resend_transient_hold`. Suppression remains active; no contact was re-enabled or emailed.
- To protect against the still-deployed old Worker, raw `dispatch_status` remains `bounced` until the new Worker is deployed; this excludes these four rows from the old reconciliation loop. After deployment, set it to `delivery_delayed` and verify reconciliation.
- Remaining suppression counts: 45 `resend_bounced` (16 direct permanent evidence, 29 unverified) + 4 `resend_transient_hold`.
- NEVER call `/fix-suppression` with `retry_resend_bounces=true`: it bulk-deletes all remaining exact `resend_bounced` suppression rows and reactivates prospects, including permanent and unverified rows. Use targeted, evidence-backed corrections only.
- No outbound email, bulk unsuppression or production deployment occurred. Full handoff evidence is in the canonical Bvelt plan.


### Live continuation handoff — 23-11-2026 13:56 UTC
- Canonical program state is in LocalFlowPro `docs/MASTER_PLAN_BVELT_ECOSYSTEM_2026-12-10.md`, latest section **Live continuation audit — 23-11-2026 13:56 UTC**.
- PR #67 merged: `8cbee655ce66391554b4f28913000423f3a25535`; CI run `45188565664` green (build, Radar tests including malformed discovery payload regression, Sidecar tests). No open PRs.
- Production D1 contains one historical failed tenant discovery job from 2026-11-09 because `trade` was missing. New mainline guard rejects malformed city/trade payloads and records an explicit failed state; the historical record was not rewritten or retried.
- Last 24h exact Worker logs: 0 error-level Radar events, 23 warning-level provider/source degradations (Abstract 401/429, BizData 502/timeouts, one zero-result observation). No pending/processing queue backlog.
- D1 suppressions: 45 `resend_bounced` (16 permanent evidence, 29 unverified) + 4 `resend_transient_hold`; all four transient rows remain blocked with HOLD/DELIVERY_DELAYED and delayed dispatch-log state. Never invoke bulk `retry_resend_bounces=true`.
- Latest 100% Radar deployment is version `bb91b6c3-5f50-4feb-8c81-fc8c23a3e098` from 2026-11-23 10:27:54 UTC; exact Git SHA parity is not exposed and this deployment predates PR #67.
- `RESEND_WEBHOOK_SIGNING_SECRET` is not listed in current Worker bindings; Svix enforcement is not active in production. Existing query-token fallback remains. `GITHUB_ACTIONS_TOKEN_SECRET` is not listed; the empty legacy plain-text binding is not a usable credential, so optional Sidecar remains unavailable.
- Do not change provider/model IDs or enable Founder auto-outreach. No production deploy, secret/webhook change, D1 mutation, or email send occurred in this continuation.


### Post-merge deployment / webhook update — 23-11-2026 14:05 UTC
- PR #67 merge SHA `8cbee655ce66391554b4f28913000423f3a25535` passed Cloudflare Workers Builds; active production version `838e088d-ee60-4c43-af28-8da1b3ac1f41` serves 100% traffic from 2026-11-23 13:56:28Z.
- Last 60 minutes exact Radar Worker telemetry: 0 errors/0 warnings.
- Resend webhook subscriptions now include `email.delivery_delayed`, `email.failed`, `email.suppressed` in addition to received/delivered/complained/bounced. Endpoint remains enabled.
- `RESEND_WEBHOOK_SIGNING_SECRET` is still absent from Cloudflare Worker secrets. Cloudflare secret-write was blocked by tool safety; do not bypass. Production still uses query-token compatibility auth; Svix enforcement is not active.
- No D1 data, suppression, outbound email, or auto-outreach changes were made. Four transient contacts remain blocked; 45 `resend_bounced` remain blocked (16 permanent evidence, 29 unverified).


### Live handoff — 23-11-2026 14:08 UTC
- Canonical state is LocalFlowPro `docs/MASTER_PLAN_BVELT_ECOSYSTEM_2026-12-10.md`, section **Continuation checkpoint — 23-11-2026 14:08 UTC**.
- PR #68 merged to Radar main: `fdf794383f512357e150d86d1d4a8a7b6560777e`. CI run `45190534940` green (TypeScript/Vite build, full Radar suite, Sidecar tests). No open PRs. Duplicate PR #69 closed unmerged.
- Abstract API verification now has shared D1-backed cooldown for auth/rate-limit/server/network failures. Email verification remains fail-closed/UNVERIFIED; Gemini/Groq cascade untouched.
- Current production deployment read-back predates PR #68: version `001e85a9-5105-4fb4-96eb-bae2c01890ed`, created 14:01:29Z. Do not claim this code is live until a post-merge deployment serves 100%.
- Last 60-minute Radar telemetry: 0 errors/0 warnings; last 24h contains 23 external provider/source warnings (Abstract 401/429; BizData 502/timeouts). D1: 3,298 completed, 1,152 completed_zero_prospects, one historical failed Naples discovery job; no active backlog.
- Datadog log/metric/monitor connectors return no usable project data; use Cloudflare telemetry + D1.
- No D1, secrets, suppressions, outbound email, or auto-outreach mutation was made.


### Live handoff — 23-11-2026 14:23 UTC
- Canonical plan: LocalFlowPro `docs/MASTER_PLAN_BVELT_ECOSYSTEM_2026-12-10.md`, latest section **Continuation checkpoint — 23-11-2026 14:23 UTC**.
- Radar main SHA `1b7c6da1cf6f44b33a0e5447f7beae65b11994d3`; PR #70 BizData cooldown and PR #74 Vite/esbuild security fix are merged; PR #73 adds npm audit reporting. Final PR #74 CI run `45193387788` passed full Radar and Sidecar tests; npm audit is zero vulnerabilities. Cloudflare build for this exact main SHA was queued at 14:22:42Z; wait for deployment read-back.
- Production currently includes BizData cooldown commit `9b58597e...` as version `a5c23f67-149c-4c4f-b6a2-80d400300038` at 100%. Last 30m telemetry 0 errors/0 warnings, but no discovery work was active, so provider recovery is unproven.
- D1 suppressions remain 45 `resend_bounced` (16 permanent / 29 unknown) + 4 `resend_transient_hold`. No active queue backlog. Keep all blocked.
- Resend webhook has seven event subscriptions; `RESEND_WEBHOOK_SIGNING_SECRET` absent, legacy query-token compatibility remains. Do not claim Svix active or bypass Cloudflare secret-write safety.
- Datadog currently provides no usable logs/metrics/monitors/service entities; Cloudflare telemetry is authoritative.
- `FOUNDER_AUTO_OUTREACH=false`; no emails, D1 mutations, suppression changes or credentials changed.


### Live handoff — 23-11-2026 14:30 UTC
- Canonical plan: LocalFlowPro `docs/MASTER_PLAN_BVELT_ECOSYSTEM_2026-12-10.md`, latest section **Continuation checkpoint — 23-11-2026 14:30 UTC**.
- Radar main SHA `4315bdc6298d4e305cb633f5026e0bfd47c41612`; PR #77 separates source-degraded jobs from honest empty-market jobs and updates health/Telegram digest. CI run `45194498525` green including npm audit, Radar tests and Sidecar tests.
- Historical D1 read-only audit: 705/1,152 `completed_zero_prospects` rows contain infra/provider failure markers. New code writes `completed_source_degraded`; health/digest classify legacy rows read-only. No D1 backfill.
- Latest production deployment is version `a91badb5-6317-46e2-8755-62b255da3f41` from PR #74 at 100%. PR #77 commit build `125ae673-754f-4a11-8732-2e3c50b57c32` was queued at 14:28:59Z; await success and deployment read-back.
- Resend: 45 bounced rows (16 permanent, 29 unverified) + 4 transient holds; all remain blocked. Seven webhook subscriptions active. Svix signing secret absent; query-token fallback remains.
- No open PRs. `FOUNDER_AUTO_OUTREACH=false`. No production D1 mutation, email send, suppression change or secret update.


## Live handoff — 2026-11-23

Canonical ecosystem plan: https://github.com/rayleblanc/LocalFlowPro/blob/main/docs/MASTER_PLAN_BVELT_ECOSYSTEM_2026-12-10.md (latest alignment checkpoint commit b9f6a5a).

Radar application-code baseline: 1b8972c. PR #79 is open and unmerged; the latest GitHub API response reports mergeability unknown. TypeScript, sidecar and Cloudflare Workers Builds preview checks pass, while worker-bundle is skipped. It is not merged. Active production Worker version 304 at 100% traffic still contains the pre-PR-79 missing-diagnostics fallback; do not call the PR deployed.

Current D1 read-back: Radar used 1,950,942 rows read / 6,589 rows written on 2026-11-22 and 525,544 / 1,793 on the partial 2026-11-23 day. Tenant observation events remain zero; Radar-to-BEM sync state observed Founder scope only. Full data counts, D1 analytics, and the next technical block are in the canonical Bvelt master plan.

No Radar code merge, D1 mutation, secret change or production deployment was performed in this documentation alignment run.


### Live handoff — 24-11-2026 14:00 UTC
- Canonical handoff: LocalFlowPro `docs/MASTER_PLAN_BVELT_ECOSYSTEM_2026-12-10.md`, section **Continuation checkpoint — 24-11-2026 14:00 UTC**.
- Radar main SHA `3c308ef3758d5e052f77034d4d0e4f6946de6ca7`, PR #80 merged. CI run `45408251307` passed TypeScript build, full Radar tests, npm audit and Sidecar tests; Cloudflare preview and main build succeeded.
- Production deployment `5bced316-9f65-4474-aab7-99e6f8ef104d`: version `1ac1f7b0-cb3c-4401-8dd2-f3481dc57ea8` / Worker 307 at 100% traffic.
- Scoped learning query now materializes exact mode/tenant events once; monitor D1 rows_read and duration.
- Last 30m: 0 errors/0 warnings for Bvelt and Radar. Last 24h: Bvelt 0/0; Radar 0 errors and 4 provider warnings (2 Abstract 401, 2 BizData 502) before the current deployment. Current queue has no backlog; one historical 9-Nov malformed Naples failure remains.
- No production D1 mutations, migrations, secret changes, Resend suppressions, outbound email or auto-outreach changes.
- Bvelt CI gate remains until 2026-12-01; P8/P9/P0 stay open. Exact remaining gates and BEM NULL-default schema drift are in the canonical plan.
- No open PRs. Use Cloudflare telemetry + D1 + GitHub CI + Resend for operational evidence; Datadog has no usable project data.


### Live handoff — 24-11-2026 14:12 UTC
- Canonical handoff: LocalFlowPro `docs/MASTER_PLAN_BVELT_ECOSYSTEM_2026-12-10.md`, section **Continuation checkpoint — 24-11-2026 14:12 UTC**.
- Radar main `d6208863f402ee98f33b0e53b32d843857137717`; PR #81 merged. Full TypeScript/Radar/Sidecar CI and npm audit passed. Cloudflare Build `3741b59c-1911-4d94-953a-1a40d41c1d87` succeeded; version `8f1d7c83-8561-48be-be4c-ca9947fa47c3` / Worker 309 is at 100%.
- P7: bulk `retry_resend_bounces=true` is disabled; no bulk unsuppression or prospect reactivation. One historical transient suppression row corrected to `resend_transient_hold`, prospect remains hold. D1 counts 44 bounced + 5 transient holds.
- Last 30m logs: 0 errors/0 warnings for both Bvelt and Radar. Prior 24h Radar has four older provider warnings; no active queue backlog, one historical Naples failed row.
- Resend Svix signing secret is still absent from Worker; legacy query-token auth remains. Do not claim Svix active.
- Bvelt CI guard remains until 2026-12-01; P8/P9/P0 remain open. Exact BEM NULL-default migration finding and next steps are in the canonical plan.
- No open PRs. No outbound emails, auto-outreach, or unblocking occurred.


### Live handoff — 24-11-2026 14:38 UTC
- Canonical plan: LocalFlowPro `docs/MASTER_PLAN_BVELT_ECOSYSTEM_2026-12-10.md`, section **Continuation checkpoint — 24-11-2026 14:38 UTC**.
- Radar main `bf1c9691b961e6ed7b039dadd692e30815418caf`; PR #82 merged. Automated `handleApproveJob` no longer records a false `message_send_authorized/telegram_human_approval` event or marks the prospect `approved`. Real send authorization remains behind `handleDecision` and `ownerManualApprovalAsserted`. Historical records remain untouched.
- CI run `45415110532`: TypeScript/Vite build passed, npm audit 0, Radar 50/50, Sidecar 21/21. Cloudflare Worker version 312 is active at 100%; source read-back confirms the fix, but Cloudflare metadata lacks a Git SHA annotation.
- `RESEND_WEBHOOK_SIGNING_SECRET` is configured; Resend endpoint no longer contains a query token. Await a natural signed webhook event before calling live signature delivery fully verified.
- D1 suppression ledger 44 `resend_bounced` + 5 `resend_transient_hold`; provider API has 39, leaving 10 internal-only blocked records (5/5) for recipient-level evidence reconciliation. Never bulk unsuppress.
- `FOUNDER_AUTO_OUTREACH=false`. Do not send email during validation. Three historical queued prospects have no dispatch record or provider ID; historical synthetic authorization events are not proof of human approval.
- No production D1 changes. No remittance systems queried. No open PRs.


## Operational handoff — 24-11-2026 17:55 UTC
- Radar main after P7 authorization fix: `90e8c13607bf07d126c7e931a22ab23421ee30ca`; application fix PR #82 is merged as `bf1c9691b961e6ed7b039dadd692e30815418caf`. PR #79–#82 are merged; no open Radar PRs.
- Production Worker version 313 (`372d53ba-73be-42b8-81b5-dbc7b3323829`) is at 100% traffic. Dedicated Resend signing-secret binding is present; Founder auto-outreach remains false.
- Natural post-cutover webhook deliveries are arriving: latest ten queried events were `email.delivered`; latest endpoint attempt returned HTTP 200 and `success=true`. No production replay. This confirms endpoint acceptance through the configured path, not inbox receipt or an independent cryptographic signature test.
- D1 still has 44 `resend_bounced` + 5 `resend_transient_hold`. Resend has 39 bounce suppressions and all 39 match D1; five internal bounce-only and five transient-hold records remain unresolved. Keep all ten blocked. Three prospect rows still show `sent` while a bounce suppression exists; their only dispatch records predate suppression and no bounce event exists in `prospect_events`. Treat as stale state; suppression wins.
- Cloudflare telemetry scoped to `bvelt-radar`: ten CPU-exceeded error records clustered 2026-11-24 15:03:53–15:03:56Z, returning 503 on `GET /prospects`, `GET /api/prospects`, and `POST /api/prospects/attack-kit`; observed CPU 9–27ms. Last two-hour aggregate is zero. List handler defaults to 100 `SELECT *` rows and maps contactability; attack-kit performs auth/lookup/build and POST adds priority-target + AI-copy work. Root cause is not yet proven; profile and add bounded pagination/performance tests after the current release hold.
- Datadog has no valid project indexes. Cloudflare telemetry, D1, GitHub CI and Resend are the current evidence sources. No remittance service or repository belongs in Radar diagnostics.
- Do not bypass the canonical hold, mutate D1, unsuppress recipients, replay webhooks or enable auto-outreach. No application code, schema, settings or production data changed in this read-only audit. Canonical plan details are in LocalFlowPro `docs/MASTER_PLAN_BVELT_ECOSYSTEM_2026-12-10.md`.


## CPU incident root cause confirmed — 24-11-2026 18:00 UTC
- `src/App.tsx` requests `limit=1000` for the prospects inbox and retries the alias `/api/prospects` on any non-OK response. `src/worker.ts` accepts the unbounded parsed limit, runs `SELECT *`, then maps all rows through contactability/suppression checks. This confirms the paired list-route CPU failures and retry amplification.
- After the hold: clamp limits server-side, add cursor pagination, project only required columns, and do not retry aliases on 5xx. Test large/invalid limits, cursor correctness, tenant isolation, counts and CPU budget.
- The `POST /api/prospects/attack-kit` CPU failure is separate; it performs priority-target resolution, AI copy generation and kit building. Profile separately; preserve the Gemini/Groq cascade and model IDs.
- No code was changed; do not bypass the canonical release hold.

## Product/evidence checkpoint — 25-11-2026
Canonical source: LocalFlowPro `docs/MASTER_PLAN_BVELT_ECOSYSTEM_2026-12-10.md`, section **Strategic product and evidence expansion — 25-11-2026**. This is additive; keep every existing Radar implementation item, migration, P7/P8/P9 gate and open owner action.

- **Founder Mode = businesses that may buy Bvelt. Tenant Mode = the authenticated Bvelt customer's own buyers/referral partners.** Never treat Tenant search as another Founder pool or search only same-trade competitors. Resolve tenant ICP from the verified profile contract, service areas, services, niche/subniche and location.
- Shared evidence methodology may be reused; Founder/Tenant identity, prospects, config, outcomes, contact permissions, score history, CRM, learning and reports remain mode/tenant scoped. Never leak one tenant's evidence or outcomes into another tenant or the Founder market.
- Add signal taxonomy: `EXPLICIT_DEMAND`, `PAIN`, `WORKAROUND`, `SWITCHING`, `TIMING`. Every signal needs canonical source/entity identity, URL, published/observed/fetched time, method, confidence, status, freshness/expiry, limitations and observed-vs-inferred distinction. Deduplicate the same post/source and mirrors; stale evidence needs revalidation.
- The reviewed First Customer Finder weights (pain 25%, product fit 25%, timing 20%, reachability 15%, evidence 15%; 0–5 → 0–100) are an **offline research lens**, not permission to replace current `opportunity_score`, `strategic_score`, evidence-confidence or channel-readiness contracts. Compare offline first with test fixtures. Preserve strategic opportunity, evidence confidence and buying/contact readiness as separate dimensions. Economic Readiness requires observable commercial evidence; never infer private wealth or spend capacity.
- Founder signals must support a specific real Bvelt capability and a credible first-contact angle, not generic scraping or an unsupported “business pain” label. Tenant discovers direct buyers and complementary referral partners for the tenant's configured services and market; identify the difference in the report/action.
- Every recommendation explains CONTACT / RESEARCH / WAIT / REFER / SUPPRESS / DISQUALIFY and cites evidence. A signal, score, phone number, email open or generated message is not consent or send authorization. Existing suppression, opt-in, manual approval, frequency caps and P7/P9 safeguards remain authoritative.
- Reuse existing `source_evidence`, `opportunity_signals`, `prospect_events`, `opportunity_outcomes`, `tenant_config`, tenant observation history and existing learning tables. Do not create parallel signal stores, a new database or a second score engine. Preserve current distinct BVELT Founder/Tenant ingest credentials/contracts.
- Confirmed CPU root cause remains a release-blocking implementation item after the Bvelt Actions hold: `src/App.tsx` requests `limit=1000` and retries the alias on any non-OK; `src/worker.ts` accepts the unbounded limit, executes `SELECT *` and maps all rows. Fix with server clamp, cursor pagination, minimal projection and no 5xx alias retry; test cursor boundaries, tenant isolation per page, count parity, invalid/large limits and CPU budget. Separately profile `POST /api/prospects/attack-kit`; preserve the Gemini/Groq cascade and model IDs.
- Datadog has no valid project indexes. Use Cloudflare observability, Radar D1, GitHub CI and Resend. Radar top-level Worker observability was enabled at the last Cloudflare read-back; this is not proof all recent logs were checked. Never report empty issue-list/Datadog results as zero runtime errors.
- Latest Radar main before this docs commit: `a494819d4615e3d14d113d3a7e3d8e72c1595290`. Active Cloudflare deployment read-back: `9e3c9a1c-9908-4b4d-af74-cda593ba927c`, version `4e58e019-8157-4cc3-95f1-9e902dc55c89`, 100% traffic. The exact release boundaries, unresolved ten D1 suppression records, three stale `sent` labels, BEM NULL-default migration and sequence are in the canonical plan. Do not send, unsuppress, replay or mutate production during diagnostics.


### Live continuation handoff — 25-11-2026 16:30 UTC
- Canonical ecosystem plan: LocalFlowPro `docs/MASTER_PLAN_BVELT_ECOSYSTEM_2026-12-10.md`, latest section **Live continuation checkpoint — 2026-11-25 16:30 UTC**. Preserve all earlier Radar P7/P8/P9, migrations and owner actions.
- Radar main before this docs update: `00b2aa7e0be477f527e0b3973677db93271545ab`; no open PRs. Current Worker deployment `a96ca143-1050-47de-9725-7e5c72b2f15e`, version `d16df1bc-a49c-439f-af78-cb1d60f9e7dc`, 100%; Cloudflare does not expose verified Git SHA parity.
- Rolling 24h logs: 179 info, 11 warnings, zero error-level events. Warnings: Abstract API 401, BizData 502/timeouts and correctly classified source-degraded discovery. Observability enabled, persisted logs and query-string redaction enabled; traces disabled.
- D1 read-only snapshot: queue 4,694 total (3,533 completed, 1,157 completed_zero_prospects, 3 completed_source_degraded, 1 historical failed); suppression 44 resend_bounced + 5 resend_transient_hold; prospects 789 Founder legacy NULL tenant_id + 47 Tenant tenant_custom_01; source_evidence 63 Founder only; tenant_observation_events 0.
- Critical Tenant gap: 47 Tenant prospects do not prove evidence or BEM sync; no Tenant source_evidence or observation receipts were present. Trace existing discovery → evidence → observation → authenticated BEM bridge without parallel stores.
- CPU defects remain confirmed in `src/App.tsx` and `src/worker.ts`: 1,000-row inbox request, retry of alias on all non-OK, unbounded Worker limit, SELECT * and per-row work. Attack-kit has a separate CPU hotspot. Implement bounded cursor pagination, minimal projection, tenant-safe counts and fallback semantics; profile attack-kit independently. Do not change Gemini/Groq provider/model IDs.
- Keep P7 blocks authoritative: 10 D1-only suppression reconciliation cases and 3 stale sent labels remain unresolved. No bulk unsuppression, recipient reactivation, status rewrite, webhook replay, outbound email or auto-outreach.
- Bvelt application-code hold remains through 2026-12-01T00:00:00Z. Until release gate opens, prepare and inspect only; no restricted bypass. The plan checkpoint defines exact post-gate test and merge order.
- Owner action: rotate/revoke legacy plaintext GITHUB_ACTIONS_TOKEN, remove plaintext binding, set least-privilege GITHUB_ACTIONS_TOKEN_SECRET via supported secret path. Never read/print token values.
- No D1 writes, migrations, secrets, outbound communication or production deploy were performed in this audit. No remittance services or repositories are in scope.


### 25-11-2026 — CPU incident fixes merged, not yet deployed
- PR #83 merged: `5be3c20a3e62fd48906c2a0b0b47d410ac4e6030`; Radar CI #893 passed. Prospect reads now clamp to 100, use keyset cursor `created_at DESC, id DESC`, explicit projection, validated cursor and bounded UI page traversal. 5xx no longer triggers alias retry.
- Migration `0033_prospects_keyset_pagination.sql` adds index `COALESCE(tenant_id,'founder'), created_at DESC, id DESC` and records itself in the migration ledger. It is registered in migrations/README. Production ledger read-back is still 0030–0032; do not claim 0033 applied.
- PR #84 merged: `b8362a6a60b0b303dad29ec49bde92e3c71d545a`; Radar CI #895 passed. Attack Kit POST skips getPriorityTargets/ICP expansion/geo ranking/daily_missions schema writes for a one-prospect draft. Message language resolves mission → tenant languages_json → Founder env → English. Gemini/Groq cascade and IDs untouched.
- Latest main SHA `b8362a6a60b0b303dad29ec49bde92e3c71d545a`; zero open PRs.
- Current production Worker deployment remains pre-merge version `35c62d4b-c393-446f-95dc-8fa2e97d9c46`, 100%, created 2026-11-25 16:36:26Z. Both code fixes are merged but NOT deployed.
- Deployment order after release gate: inspect D1 schema/ledger; apply and verify 0033; build Worker bundle from exact main; deploy through established Cloudflare Workers Build; verify exact version and 100% traffic; smoke Founder/Tenant pagination (no duplicate/missing rows across page boundaries, strict tenant scope), Attack Kit GET/POST, then CPU telemetry.
- No production D1 rows, suppressions, outbound email, secrets, queue state or Worker settings changed. No Gemini/Groq cascade/model IDs changed.
- Keep open: Tenant evidence bridge (47 Tenant prospects, zero Tenant source_evidence/observation receipts in last read); P7 suppression reconciliation and natural Svix receipt; BEM monetary NULL migration; owner rotation of legacy plaintext GITHUB_ACTIONS_TOKEN. No replay, unsuppression or auto-outreach.


### Tenant observation bridge identity mismatch — 25-11-2026 17:05 UTC
- Production D1 read-only: legacy `tenant_custom_01` has 47 Tenant prospects (31 qualified), contract_version 0, verification UNKNOWN, no profile_id/business_id/profile snapshot. A separate `bvelt_…` Tenant config has zero prospects, empty tenant name, contract_version 0 and UNKNOWN verification.
- `sendTenantObservationsToBvelt` rejects IDs not starting `bvelt_`; Bvelt endpoint requires canonical `bvelt_…` exact header/body identity. The 47 legacy prospects therefore cannot pass the current sender guard. Do not rekey or merge rows until verified owner-bound Bvelt profile mapping exists.
- Sender call after queue qualification/outcome is present but skipped for the legacy ID. The refresh route's immediate post-enqueue call is too early to prove post-job sync. Tenant `source_evidence` callback path remains a separate trace item.
- Preserve both scopes as UNKNOWN/unlinked. Resolve identity through versioned canonical profile bootstrap and read-back; then use idempotent mapping and verify accepted receipt + `radar_tenant_observation_events` / Bvelt receipt. Never bulk rewrite IDs or fabricate observations.
- Radar CPU fixes are merged to main: PR #83 `5be3c20a3e62fd48906c2a0b0b47d410ac4e6030` (CI #893 passed) and PR #84 `b8362a6a60b0b303dad29ec49bde92e3c71d545a` (CI #895 passed). They are not yet deployed; migration 0033 is not applied. See canonical plan checkpoint in LocalFlowPro.


### Sidecar credential read-back — 25-11-2026 17:08 UTC
- Cloudflare Worker secret-name inventory only (no secret values): `BVELT_TENANT_INGEST_KEY` and `RADAR_SIDECAR_CALLBACK_KEY` exist; `GITHUB_ACTIONS_TOKEN_SECRET` is absent.
- `maybeDispatchSidecarResearch` intentionally returns before reserving dispatch state when that secret is missing. Sidecar/Scrapling enrichment is therefore unavailable in current production; core discovery must continue without it.
- This independently blocks new source_evidence from the Sidecar callback. Do not restore plaintext `GITHUB_ACTIONS_TOKEN`; owner must rotate/revoke any legacy token and set only least-privilege encrypted `GITHUB_ACTIONS_TOKEN_SECRET` through authorized secret-write flow. Never read/print values.
- Tenant sync ID mismatch is separate: legacy `tenant_custom_01` cannot pass the canonical `bvelt_…` sender guard. Resolve both gates independently, then run a controlled fixture callback and verify receipts.


### P7 Resend/D1 read-only reconciliation — 25-11-2026 17:20 UTC
- Webhook `5c77f537-b331-4e7e-a923-804af31d0093` enabled for received/delivered/complained/bounced/delivery_delayed/failed/suppressed. 81 events read, all webhook delivery status success; latest natural delivered events 2026-11-24 15:03Z.
- Provider: 92 emails (65 delivered,24 bounced,3 suppressed), 39 permanent suppressions. All 39 normalized provider suppression keys match D1.
- D1 `email_dispatch_logs`: 173 rows (64 delivered,36 bounced,4 delayed,69 dispatched), every row has provider message_id. D1 suppression: 44 resend_bounced + 5 resend_transient_hold. Five permanent-bounce keys are D1-only and predate webhook cutover; keep blocked, do not unsuppress/re-add automatically. Five transient holds are not permanent provider suppressions.
- One inspected transient maps to Resend `email.bounced` with `bounce.type=Transient`; event name alone is insufficient. Four delayed/transient records still need exact message ID/subtype/order reconciliation.
- 18 Founder prospects status=sent match latest D1 dispatch delivered; 10 match dispatched. Four hold records have D1 delayed but provider latest status bounced; preserve UNKNOWN until event-level evidence.
- No outbound sends, webhook replay, suppression changes, status rewrites or production D1 writes. Continue reconciliation only; do not increase volume.


### Production build/deploy read-back — 25-11-2026 17:25 UTC
- Workers Builds auto-build on main is enabled. Both CPU fixes deployed successfully:
  - Pagination main commit `5be3c20a3e62fd48906c2a0b0b47d410ac4e6030`: build `4d5d5546-fe40-4817-aa97-225fce5f2fdd` success; version `35b5df9a-61b6-4ede-a067-9d9d2b60badb`, 100%, 16:52:19Z.
  - Attack Kit main commit `b8362a6a60b0b303dad29ec49bde92e3c71d545a`: build `41daeb19-4801-4be3-a9c4-a8aeed3b87c8` success; version `cc4f52db-0400-4de3-a04a-2d1987fcf37a`, 100%, 16:55:37Z.
- Post-deploy 60m telemetry: zero errors, one Abstract API HTTP 401 warning, no CPU-limit event observed.
- Migration 0033 not applied; existing query plan uses `idx_prospects_identity_scoped` and temp B-tree for sort. Keep migration pending until allowed D1 gate.
- Authenticated Founder/Tenant pagination and Attack Kit POST smoke tests are still pending; don't claim them passed.
- Docs-only commit `d99f954557de80fd050a167d45097f4eaed3dfc7` generated queued build `1fb0967e-5eff-4f4c-b302-8d767f808c56` at 17:05Z; re-check completion.


### Founder outreach automation and Sidecar bindings — 25-11-2026 18:05 UTC
- Production Worker binding `FOUNDER_AUTO_OUTREACH=false`; queue auto-email remains off and falls back to interactive Telegram approval. Keep false. `FOUNDER_AUTO_MAX_PER_DAY=8`, `FOUNDER_AUTO_MIN_SCORE=70`, `FOUNDER_WA_MAX_PER_DAY=5`.
- `GITHUB_ACTIONS_TOKEN` exists as plaintext binding; `GITHUB_ACTIONS_TOKEN_SECRET` is absent. Sidecar dispatch requires the encrypted secret and does not fall back to plaintext. Owner must rotate/revoke legacy token and remove plaintext binding; never use plaintext token.
- `RADAR_GLOBAL_PAUSE` unset; this does not change explicit auto-outreach false. Do not enable automatic sends. Tenant/Founder dispatch remains human-approved.


### 25-11-2026 — latest production read-back
- Latest main documentation SHA `fd83fc26f85726d97aadc058e507d0d9ca1209e5` is built successfully by Cloudflare Build `472ef1c7-ec96-4c17-b4d1-3cb27797dc73`; deployment version `03ba02fe-5e4d-4a2d-a7b1-6fed7d68f2e0` at 100%, 17:21:13Z. No open PRs.
- D1 counts: Founder 810 (4 qualified); Tenant `tenant_custom_01` 47 (31 qualified). Migration ledger 0030–0032 only; 0033 remains pending.
- Four D1 `delayed` dispatch rows each have a Resend email ID; provider `get_email` now reports `bounced` for all four. Do not change D1 state until exact webhook `data.email_id`, bounce subtype and ordering are matched. Keep suppression/cooldown holds.
- Existing outbound message bodies include a physical street address in the founder signature. Keep sends paused and review legal mailing-address handling before any future outreach. Never copy the address into source, docs or logs.
- The latest 10 Resend messages are delivered on Nov 24; no later messages in the current 92-message listing. Webhook delivery history: 81 events, all accepted.
- Current telemetry query returned empty rows due an unvalidated dataset/filter; do not call this a zero-error window.
- No D1 writes, email sends, webhook replay, suppression changes, secrets or Worker setting changes.


### 25-11-2026 — Worker credential binding correction
- Live production settings show `GITHUB_ACTIONS_TOKEN` as a plain-text binding with an empty value; encrypted `GITHUB_ACTIONS_TOKEN_SECRET` remains absent. Sidecar dispatch stays fail-closed. This supersedes the earlier statement that a non-empty plaintext token remained bound.
- If the former token was valid/exposed, owner should still revoke it at GitHub. Do not restore it, add a new token, or enable Sidecar without explicit approval.
- `SENDER_POSTAL_ADDRESS` and `RESEND_WEBHOOK_SIGNING_SECRET` exist as encrypted secrets; values were not read. Previously sent email body contains a physical address in its footer; do not log or reproduce the address.
- `FOUNDER_AUTO_OUTREACH=false`; no autonomous outreach change. No secrets/settings/code/D1/email/deploy mutations.


### 25-11-2026 — Nov 24 Founder send provenance verified
- Resend's latest 10 delivered messages match 10 D1 dispatch rows and 10 Founder prospects exactly; all are `delivered`.
- Every authorization event has `authorization=explicit_user_action` and `owner_manual_approval_asserted=true` (10/10); each run is `manual_send` and event sequence includes generated → authorized → confirmed → delivered.
- `/decision` is behind Worker admin authorization and rejects a send unless the explicit owner approval assertion is true; Telegram callback uses the authorized callback flow.
- These 10 messages were owner-approved manual sends, not autonomous campaign sends. `FOUNDER_AUTO_OUTREACH=false` remains unchanged. No send occurred during audit.
- Local Trust-Stack integration is disabled (decision reason `LOCAL_SAFETY_OK: Trust-Stack disabled; bounce/email checks only`); keep Trust-Stack evidence/consent gates open. Manual owner approval is not recipient opt-in.


### 25-11-2026 — manual email jurisdiction gate live
- PR #85 merged to main as `4645fa3213f53924c584bae2c83031fb59c513f3`; CI #897 passed (TypeScript, npm audit, Radar custom/integration tests, Sidecar tests).
- Cloudflare Build `0609411f-3ee6-41fd-98b4-468dda95d150` succeeded; deployed version `12b7cb90-f86d-4cda-9ed3-212d83357ae0` at 100% traffic (deployment `8f955535-3c8e-4f3c-a8a7-1ea17f9e3ede`, 17:44:45Z).
- Manual Founder/Tenant email preflight now requires `resolveFounderEmailPolicy(...).status === SEND_ALLOWED`. `CONSENT_REQUIRED`, `POLICY_UNKNOWN`, and `OWNER_REVIEW` fail closed before dispatch. Owner approval is not a substitute for jurisdictional lawful basis.
- The 10 Nov 24 manual sends were explicitly owner-approved (10/10 authorization events assert `explicit_user_action` and `owner_manual_approval_asserted=true`); 1 policy was SEND_ALLOWED, 2 CONSENT_REQUIRED, 7 POLICY_UNKNOWN. Historical sends were not rewritten. No email was sent during this remediation.
- Post-deploy settings read-back confirms `FOUNDER_AUTO_OUTREACH=false`, Founder caps unchanged, Gemini paid tier false, Gemini model list unchanged, `GITHUB_ACTIONS_TOKEN` empty. No secret values read or changed.
- Bvelt D1 read-only: 789 market observations, 321 daily aggregates, 22 Founder ingest batches; 0 Tenant observations/events, 0 Radar learning outbox. Founder market ingest is active; Tenant identity/observation bridge remains unresolved.
- No production D1 writes, migrations, suppression changes, secret changes, webhook replay or outbound email.
