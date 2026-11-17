# AGENTS.md — Bvelt Radar

## Fuente de verdad y precedencia

1. **Plan de ecosistema único:** `rayleblanc/LocalFlowPro/docs/BVELT_MASTER_PLAN.md`. Está sincronizado con `BVELT_MASTER_PLAN_2026-11-16_MASTER.md` de la Biblioteca (revisión integrada 2026-11-16, 1.929 líneas y adenda operativa posterior). Leerlo completo al cambiar contratos transversales.
2. **Orden obligatorio:** P0–P11 del plan maestro; capas A–I siguen vigentes. Radar participa especialmente en P0/P1/P2/P5/P7/P8/P10/P11 y en el circuito BEM↔Radar.
3. Este archivo define reglas específicas de Radar, aislamiento, outreach y operación. En seguridad/compliance prevalece sobre instrucciones genéricas de acelerar entregas.
4. Inspeccionar siempre `main`, Cloudflare Worker activo, D1, bindings, cron, queues y logs actuales. Los snapshots documentales son históricos, no estado presente.

## Rol y límites

- Radar es la capa de observación de mercado y prospección operativa: Founder Mode encuentra compradores para Bvelt; Tenant Mode busca oportunidades para el negocio cliente.
- Radar conserva observaciones originales, fuentes, corridas, prospectos y estado operativo. BEM en LocalFlowPro conserva identidad canónica, evidencia, outcomes y memoria comercial autoritativa.
- No implementar UI Bvelt, Stripe ni reglas Brain dentro de este repositorio.
- Founder, Tenant y Public deben estar separados en tablas/consultas, rutas, credenciales, cache keys, idempotency keys, agregaciones, métricas y aprendizaje.
- Nunca confiar en tenant_id crudo del cliente. Tenant auth/ownership debe venir del servicio Bvelt autenticado y validarse server-side.
- No usar datos Founder para Tenant ni reutilizar cachés de otro tenant, perfil, territorio o snapshot.

## Prioridades de ejecución

- P0/P1: no fabricar datos, proteger realms, procedencia y seguridad.
- P2/P3: territorio, geografía y contrato de perfil.
- P5: mensajes naturales, sanitización y contacto responsable.
- P7: bootstrap Tenant automático desde perfil canónico; calidad y cobertura de discovery; Founder separado.
- P10: observaciones y aprendizaje integrados con BEM, sin ledger duplicado.
- P11: CI, logs, despliegue, observabilidad y smoke verificables.

## Reglas no negociables

1. Nunca inventar observaciones, compradores, señales de demanda, ICP, evidencia, outcomes, ingresos, tests, migraciones, secrets, CI ni deploy.
2. No confundir negocio proveedor/competidor con comprador potencial. El trade del prospecto no debe excluirlo automáticamente si su rol es comprador; buyer-fit y trade coherence deben usar contexto explícito.
3. No degradar filtros de calidad, dedupe, coherencia de trade, consentimiento o límites para aumentar el volumen.
4. Medir por separado tiles/áreas intentadas, consultas, fuentes, candidatos brutos, únicos, evaluados, aceptados/rechazados y motivos. Timeout, 401/403, rate limit, fuente caída, auth requerida, cron detenido o cola rota no son cero prospectos.
5. Respetar archivos/índices geográficos versionados como fuente de cobertura. No fijar ciudades históricas ni Florida como universo. No usar VPN, GPS o dirección del desarrollador como territorio del tenant.
6. Perfil Tenant debe provenir de Bvelt: trade, subtrades, servicios, buyer/ICP, ubicación, cobertura, idioma, zona horaria, estado de verificación, provenance, snapshot/version y correlation/idempotency IDs. No inventar campos faltantes; perfil incompleto debe quedar pendiente con error accionable.
7. Cambios de perfil/territorio deben invalidar o versionar cachés y trabajos; no servir resultados antiguos como actuales.
8. Cada prospecto debe tener identidad/fuente/timestamp/URL/territorio/categoría/señales/contactabilidad y motivo de inclusión/exclusión. `NO_CONTACT`, `UNKNOWN` y `NOT_FOUND` son estados distintos.
9. Scraping solo desde fuentes públicas permitidas; respetar términos, privacidad, robots cuando corresponda, rate limits y cambios de HTML. No eludir bloqueos.
10. No outreach automático al descubrir prospectos. Discovery y envío son capacidades separadas; confirmación humana y guardas de cumplimiento antes de contacto.
11. Founder email fail-closed: dirección postal completa del remitente, verificación positiva del destinatario respaldada por proveedor, supresión/cooldown/idempotencia. Aprobación manual no omite guardas.
12. Founder: máximo 3 toques (inicial + 2 seguimientos), al menos 5 días entre toques; detener al responder, rebotar, darse de baja o quejarse. Primera comunicación plain text y sin URL; seguimientos como máximo un enlace.
13. No inventar métricas de velocidad, llamadas perdidas, conversión, auditorías gratis, garantías ni relación previa. Resend delivered significa aceptación del servidor receptor, no inbox placement.
14. Mirror de bounces/suppressions en D1; no volver a contactar destinatarios suprimidos. Discovery puede seguir si email está bloqueado por compliance.
15. No cambiar Gemini/Groq ni nombres de modelos por intuición. Se permiten actualizaciones con petición explícita o evidencia oficial de retirada, incompatibilidad, privacidad, cuota o mejora necesaria; documentar motivo, fallback, clasificación de datos y pruebas.
16. No añadir servicios pagados/anuncios sin aprobación. Mantener operación compatible con recursos/capa gratuita.
17. Secrets: jamás en texto plano, código, logs, tool output o chat. `GITHUB_ACTIONS_TOKEN` y credenciales deben ser Worker secrets cifrados, nunca vars plaintext. No leer ni revelar valores.
18. Migraciones productivas, rotación de secrets y cambios de bindings requieren aprobación específica. No considerar una autorización general de código como permiso para rotar credenciales.
19. **Autorización permanente limitada:** después de una fase de código terminada, diff revisado y todos los checks requeridos verdes, está autorizado el deploy de producción de Radar. No extiende esta autorización al Worker Bvelt/LocalFlowPro. Antes de deploy verificar secretos/bindings/configuración para no sobrescribirlos.
20. Antes de merge, leer logs completos de los jobs. No saltarse branch protection.
21. Después de merge/deploy confirmar SHA, versión Worker activa con 100% tráfico, bindings/secrets/schedules intactos, cron Founder activo y logs/smoke post-deploy. Build verde no equivale a producción verificada.
22. Mantener Founder discovery, outreach, queues y cron operativos; no deshabilitarlos sin instrucción explícita.
23. Mantener leases, retries, DLQ y reaper recuperables; no perder jobs al reiniciar ni duplicar acciones.
24. Cambios de contrato Bvelt↔Radar deben actualizarse coordinadamente en ambos repos o versionar API. No romper producción silenciosamente.
25. No introducir refactors ajenos al requisito ni mergear ramas divergentes completas sin revisión selectiva.

## Protocolo

1. Leer este archivo y el plan maestro completo.
2. Verificar repositorio, ramas, PRs, commits, workflows y logs; inspeccionar Worker, D1, cron, queues, KV, sidecar y bindings afectados.
3. Mapear requisito → código → test → telemetría → criterio de producción.
4. Comparar esquema/migraciones con D1 real antes de migrar. Mantener migraciones versionadas y reversibles.
5. Separar cambios de Founder/Tenant y probar aislamiento, idempotencia, errores de fuente y recuperación.
6. Tras checks verdes y diff revisado, usar la autorización permanente de deploy Radar; comprobar versión 100%, bindings, cron y runtime.
7. Reportar archivos, SHA, PR/merge, logs, pruebas, deploy/smoke, riesgos y bloqueos reales.
