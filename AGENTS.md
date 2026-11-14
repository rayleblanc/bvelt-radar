# AGENTS.md — Bvelt Intelligence

## Source of truth
Read `Bvelt_Intelligence_Documento_Maestro_v2.1.md` when it is present in the current working context. If it is not available, use the latest explicit direction from Ray and verified repository state; never assume a missing plan file or invent its contents.

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
17. Production migrations, secret rotation, and binding/configuration changes still require Ray's explicit approval.
18. Standing authorization for `bvelt-radar`: deploy to production after each completed code phase once the exact diff is reviewed and every required GitHub check is green. This authorization applies only to Radar, not Bvelt.
19. Before merging, inspect GitHub Actions workflow runs, jobs, and logs—not only the green summary. Never bypass branch protection; if GitHub rejects the merge, stop and report the blocker.
20. After merge, verify the new Cloudflare Worker version is deployed at 100%, preserve bindings/secrets/schedules, and confirm the Founder cron remains active. Do not claim deployment if Cloudflare does not confirm it.
21. Keep Radar operational during development. Do not disable Founder discovery, outreach, queues, or cron unless Ray explicitly instructs.
22. Do not close an operational recovery phase until a genuine post-deploy Founder run has been inspected for discovery results, source diagnostics, filtering, email dispatch, and Telegram delivery. Never fabricate production events.
23. Founder outreach is capped at three total touches (initial + two follow-ups), at least five days apart, and stops on reply, bounce, unsubscribe, or complaint. Use per-touch idempotency and historical message counts to protect legacy prospects.
24. Keep `GITHUB_ACTIONS_TOKEN` and all credentials as encrypted Worker secrets. A plaintext credential must be rotated, not merely hidden in logs.
25. Never claim production success from a passing build or the presence of a Worker deployment alone.
26. At the end, report changed files, commit/PR, CI logs, Cloudflare deployment evidence, post-deploy runtime evidence, unresolved risks, and any action required from Ray.

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
