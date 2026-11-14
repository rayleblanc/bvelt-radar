# AGENTS.md — Bvelt Intelligence

## Source of truth
Read the project reference document `Bvelt_Intelligence_Documento_Maestro_v2.1.md` supplied by Ray before cross-repository or architectural work. This file is the short mandatory operating guide; the master document defines the complete architecture and execution plan.

## Non-negotiable rules
1. Preserve the full ecosystem ambition. Lack of customers, data, budget, or time does not justify silently deleting capabilities from the target architecture.
2. Never invent evidence, outcomes, revenue, tests, migrations, secrets, CI results, or deployments.
3. Label fixtures/simulations, modeled metrics, real observations, and verified outcomes distinctly.
4. Assign M1–M5 maturity per capability and cite concrete evidence. Code, tests, production configuration, real operation, and continuous validation are different things.
5. Before changing code, inspect current main, branches, commits, open PRs, CI, and recent collaborator/Grok work. Compare diffs; do not overwrite or duplicate.
6. Do not merge stale branches. Rebase/reimplement only after reviewing every relevant change against current main.
7. Keep Founder, Tenant, and Public scopes isolated in storage, routes, credentials, idempotency keys, and analytics.
8. Derive tenant identity and authorization scope on the server from authenticated identity. Never trust client-supplied tenant IDs as authority.
9. BEM is the verifiable business memory; Brain is the reasoning/orchestration layer. Do not create a competing memory store in Brain.
10. Outcomes are append-only. Exact retries are idempotent; same idempotency key with different payload returns 409.
11. Unknown revenue is NULL, never zero by default. A sent/delivered event is not a reply, booking, win, or sale.
12. Never create fictitious production events. M4 may use Ray's own Tenant account and a genuine action through the normal authenticated flow; never fabricate a business outcome.
13. Until the Tenant outcome circuit reaches M4, parallel implementation is limited to security, regression tests, and execution-plan Blocks 6–7. Other future capabilities may receive written contracts only.
14. Do not change the Gemini/Groq cascade or model names without Ray's explicit instruction.
15. Do not introduce paid services, card requirements, paid AI, or advertising without explicit approval.
16. Never expose secret values in code, logs, tool output, reports, or chat. A plaintext credential must be rotated and stored as a secret.
17. Do not apply production migrations, change production secrets/configuration, or deploy without Ray's explicit authorization.
18. A merge to main may trigger production deployment. Verify the deployment path first; if uncertain, stop before merging.
19. Merge only after reviewing the exact diff, required CI green, branch protections confirmed, and no unapproved schema/secret/config/deploy changes.
20. If branch protection or auto-deploy behavior cannot be verified, prepare a branch/PR and stop before integration.
21. Never claim production success from a passing build or the presence of a Worker deployment alone.
22. At the end, report changed files, commit/PR, CI evidence, maturity, unresolved risks, and any action required from Ray.

## Working sequence
- Verify current repository and Cloudflare state before acting.
- Continue the lowest-dependency incomplete execution block; do not skip the M4 gate.
- Keep migrations separate, versioned, reconciled against live D1, and paired with rollback.

## Repository ownership — bvelt-radar
- Radar owns original market observations and operational prospecting records.
- Preserve Radar's source records; link to BEM through canonical business IDs when available.
- Tenant learning is authenticated service-to-service and strictly scoped to the tenant derived/authorized by Bvelt.
- Founder learning must remain a separate scope and contract; never route it through Tenant learning ingestion.
- Idempotency conflicts return 409. Unconfirmed persistence returns a retryable failure, never success.
- Keep `GITHUB_ACTIONS_TOKEN` and all service credentials as encrypted Worker secrets, never plaintext variables.
- Keep the Founder and Tenant datasets separate in storage, routes, aggregation, and reporting.
