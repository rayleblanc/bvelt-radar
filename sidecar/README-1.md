# Radar Research Sidecar

Este paquete realiza investigación web acotada de candidatos ya asociados a un run de Radar. No crea un universo de prospección paralelo, no decide scores estratégicos, no declara revenue perdido y no inicia outreach.

**Plan único de referencia:** https://github.com/rayleblanc/LocalFlowPro/blob/main/docs/MASTER_PLAN_BVELT_ECOSYSTEM_2026-12-10.md  
**Secciones principales:** P0, P1, P7, P10, P11, C23 y C26.

El antiguo docs/AI_STUDIO_INTEGRATION_PROMPT.md se retiró. Sus requisitos de dispatch, candidate association, endpoints autenticados, callback, geografía, realms y pruebas se consolidaron en el plan canónico. No usar prompts o snapshots obsoletos.

Reglas:
- Candidates y evidence endpoints requieren autenticación.
- Cada candidato debe pertenecer a la combinación exacta run_id + mode + tenant_id.
- Lookup acotado a 50 candidatos por corrida; callback acotado, validado e idempotente.
- Founder, Tenant y realm=PROSPECT jamás se mezclan.
- URLs HTTP(S) públicas y válidas; SSRF/DNS/redirect checks obligatorios.
- Respetar robots, términos, tamaño de páginas, deadlines, per-domain rate/concurrency y protección prompt injection.
- Un batch vacío puede completar correctamente con cero records; no dejar dispatch stuck en queued.
- El sidecar solo registra observaciones. No outreach, scoring, claims, revenue ni tenant learning.
- Falta GITHUB_ACTIONS_TOKEN_SECRET significa fail closed; nunca usar variable plaintext heredada.
- Ejecutar pruebas, leer logs completos y confirmar callback read-back antes de afirmar producción lista.
