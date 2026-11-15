# AGENTS.md — Bvelt Radar (bvelt-radar)

Operating guide for any AI coding agent working in this repository.

## Source of truth

1. **Ecosystem plan:** LocalFlowPro `docs/BVELT_MASTER_PLAN.md` (2026-11-15+).  
   Radar is the **capture layer** of that circuit. Fetch/read that plan when changing cross-repo contracts (learning events, tenant bootstrap, identity links).
2. **This file (AGENTS.md):** Radar-specific non-negotiables (Founder outreach compliance, deploy, isolation).  
   Safety/compliance here wins over generic “ship faster” pressure.
3. **Live `main` + Cloudflare Worker state:** inspect before editing. Another agent may have changed the same zone.

Legacy name `Bvelt_Intelligence_Documento_Maestro_v2.1.md` is superseded by LocalFlowPro `docs/BVELT_MASTER_PLAN.md`.

---

## What Radar is (one paragraph)

Radar **observes real markets**: discovers businesses, scores ICP/email trust/trade coherence, serves Founder prospecting and **Tenant buyer search**, emits learning/observation history, and never pretends a reply is a sale. Canonical **outcomes and revenue truth live in BEM (LocalFlowPro)**. Radar keeps source observations and operational prospecting records.

---

## Place in the Master Plan circuit

```
Radar (this repo) → BEM → Intelligence → Bvelt UI → Brain → outcomes → BEM → learning back to Radar
```

Relevant Master Plan layers for this repo:

| Layer | Radar responsibility |
|-------|----------------------|
| **B** Territory → Leads | Tenant bootstrap/search/leads quality; no silent empty; diagnostics |
| **D** Learning closed | Accept BEM outbox events; Founder≠Tenant counters; idempotent writes |
| **G** Radar depth | ICP coverage, change detection, dedup, observation history, cost-controlled sidecar |
| **I** Anti-extinction | Secrets encrypted; degradable paths; no fabricated prod events |

Do **not** implement Bvelt UI, Stripe, or Brain rules inside this repo.

---

## Non-negotiable rules

1. **Full ambition.** Do not silently delete target capabilities from the ecosystem architecture because of missing customers or budget.
2. **Never invent** evidence, outcomes, revenue, tests, migrations, secrets, CI results, or deployments.
3. Label fixtures, modeled metrics, real observations, and verified outcomes **distinctly**.
4. Before changing code: inspect `main`, PRs, CI **job logs**, recent collaborator commits. Diff first.
5. Do not merge stale branches without reconciling against current `main`.
6. **Isolate** Founder, Tenant, and Public scopes in storage, routes, credentials, idempotency keys, aggregation, and reporting.
7. Tenant identity/authorization for learning is **service-to-service** and scoped to what Bvelt authenticated — never trust a raw client tenant id as authority.
8. **BEM is memory; Brain is intelligence** (both primarily in LocalFlowPro). Radar does not become a second outcome ledger of record.
9. Learning writes are **idempotent**. Conflicts → **409**. Unconfirmed persistence → retryable failure, **never** success.
10. Unknown revenue is **NULL**. Sent/delivered ≠ reply ≠ booking ≠ win ≠ sale. Tenant counters must not conflate those events.
11. Never create fictitious production events. Inspect real post-deploy Founder runs for discovery, filters, email, Telegram.
12. Do not change Gemini/Groq cascade or model names without Ray’s explicit instruction (if used here).
13. Do not introduce new paid services/ads without approval.
14. Never expose secrets in code, logs, tool output, or chat. Rotate leaks. Keep `GITHUB_ACTIONS_TOKEN` and credentials as **encrypted Worker secrets**, never plaintext vars.
15. Production migrations / secret rotation / binding changes require Ray’s explicit approval unless already granted for the task.
16. **Standing authorization for `bvelt-radar` only:** after a completed code phase, exact diff reviewed, and every required GitHub check **green**, deploy to production Worker. This does **not** authorize Bvelt (LocalFlowPro) deploys.
17. Before merge: read Actions job logs, not only badges. Never bypass branch protection.
18. After merge/deploy: confirm Worker version at **100%**, bindings/secrets/schedules intact, Founder cron active. Do not claim deploy without Cloudflare confirmation.
19. Keep Radar operational. Do not disable Founder discovery, outreach, queues, or cron unless Ray explicitly instructs.
20. Founder outreach: **max three touches** (initial + two follow-ups), ≥5 days apart; stop on reply, bounce, unsubscribe, or complaint. Per-touch idempotency + historical counts protect legacy prospects.
21. Founder email **fail closed** unless: sender has complete physical postal address, recipient has positive provider-backed verification, and suppression/cooldown/idempotency pass. Manual approval does not bypass these controls.
22. Founder first-touch: **plain text, no URL**. Follow-ups: at most one product link. Never invent site-speed metrics, missed-call facts, conversion %, free audits, or response-time guarantees.
23. Resend “delivered” = receiving server accepted the message, **not** inbox placement. State Gmail-folder limits when unknown.
24. Mirror provider bounce suppressions into Radar D1; never contact suppressed addresses again. Discovery may continue while email is held for compliance.
25. Never claim production success from a green build or “Worker exists” alone.
26. End of session: report files, commit/PR, CI logs, Cloudflare deploy evidence, post-deploy runtime evidence, risks, Ray actions.

---

## Repository ownership — bvelt-radar

- Owns **original market observations** and operational prospecting records.
- Preserve source records; link to BEM via canonical business IDs when available — do not silently steal ownership of outcomes.
- Tenant learning ingestion is authenticated and tenant-scoped from Bvelt.
- Founder learning is a **separate** scope and contract; never route Founder through Tenant learning ingestion.
- Keep Founder and Tenant datasets separate in storage, routes, aggregation, and reporting.

### Contracts with LocalFlowPro

- Tenant bootstrap / search / leads APIs consumed by `radarBootstrapService` and related Bvelt clients.
- Learning events from BEM outbox (`/learning/events` or equivalent) — idempotent, realm-separated counters.
- Observation history append-only for tenant territory snapshots when Master Plan **Territory Lock** is implemented.

When changing request/response shapes, update both repos or version the API; do not break Bvelt prod silently.

---

## Working sequence

1. Verify repo + Cloudflare state.
2. Prefer Master Plan items that unblock **B** (tenant leads quality/diagnostics) and **D** (learning integrity) over speculative features.
3. Keep migrations separate, versioned, reconciled against live D1, with rollback notes.
4. CI green before merge; deploy per standing Radar authorization only when checks pass.

---

## Anti-patterns

- Treating a positive reply as a won deal in counters.
- Mixing Founder and Tenant learning tables or routes.
- Returning success when D1 write was not confirmed.
- Plaintext secrets in `wrangler` vars or logs.
- Disabling Founder cron “temporarily” without Ray.
- Inventing compliance-sensitive claims in outreach copy.
- Changing Bvelt app code in this repository.

---

## Collaboration with other AIs

- Read current `main` before writes.
- Coordinate learning/bootstrap contract changes with LocalFlowPro agents.
- Tag work to Master Plan layer IDs (`B6`, `D3`, `G2`, …) when possible.

---

*Aligned to BVELT_MASTER_PLAN · bvelt-radar · 2026-11-15*
