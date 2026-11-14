import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { handleTenantLearningIngest } from "../src/tenantLearningIngest";

function makeEnv() {
  const events = new Map<string, any>();
  return {
    RADAR_SERVICE_KEY: "test-service-key",
    RADAR_DB: {
      prepare: (sql: string) => ({
        bind: (...args: any[]) => ({
          sql,
          args,
          first: async () => {
            if (/idempotency_key/i.test(sql)) {
              const key = String(args[0] ?? "");
              return events.get(key) || null;
            }
            return null;
          },
          run: async () => ({ meta: { changes: 0 } }),
          all: async () => ({ results: [] }),
        }),
      }),
      batch: async (statements: any[]) => {
        const args = statements[0]?.args || [];
        const key = String(args[11] ?? "");
        const existed = Boolean(key && events.has(key));
        if (key && !existed) {
          events.set(key, {
            id: String(args[0]),
            prospect_id: args[1],
            mode: args[2],
            tenant_id: args[3],
            event_type: args[4],
            city: args[5] ?? null,
            trade: args[6] ?? null,
            variant_id: args[7] ?? null,
            angle: args[8] ?? null,
            value_usd: args[9] ?? null,
            metadata_json: args[10] ?? "{}",
            occurred_at: args[12] ?? null,
          });
        }
        return statements.map((_, i) => ({
          meta: { changes: i === 0 && key && !existed ? 1 : 0 },
        }));
      },
    },
  };
}

function jsonRequest(body: any, headers: Record<string, string> = {}) {
  return new Request("https://radar.test/api/learning/events", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer test-service-key",
      "X-Tenant-Id": "bvelt_tenant_alpha",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe("handleTenantLearningIngest", () => {
  it("rejects missing service auth", async () => {
    const env = makeEnv();
    const req = new Request("https://radar.test/api/learning/events", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Tenant-Id": "bvelt_tenant_alpha" },
      body: JSON.stringify({ mode: "tenant", tenant_id: "bvelt_tenant_alpha", items: [] }),
    });
    const res = await handleTenantLearningIngest(req, env, {});
    assert.equal(res.status, 401);
  });

  it("rejects tenant scope mismatch", async () => {
    const env = makeEnv();
    const req = jsonRequest({
      mode: "tenant",
      tenant_id: "bvelt_other",
      items: [{ prospect_id: "p1", event_type: "won", idempotency_key: "k1" }],
    });
    const res = await handleTenantLearningIngest(req, env, {});
    assert.equal(res.status, 403);
  });

  it("accepts explicit CRM outcomes and acknowledges retries", async () => {
    const env = makeEnv();
    const payload = {
      mode: "tenant",
      tenant_id: "bvelt_tenant_alpha",
      items: [
        {
          prospect_id: "prospect_123",
          event_type: "won",
          idempotency_key: "crm:prospect_123:won",
          occurred_at: "2026-11-14T12:00:00.000Z",
          value_usd: 250,
          city: "Toronto, ON",
          trade: "plumbing",
        },
      ],
    };

    const first = await handleTenantLearningIngest(jsonRequest(payload), env, {});
    assert.equal(first.status, 200);
    const firstBody = (await first.json()) as any;
    assert.equal(firstBody.ok, true);
    assert.ok((firstBody.accepted ?? 0) >= 1 || (firstBody.inserted ?? 0) >= 1 || (firstBody.deduplicated ?? 0) >= 1);

    const retry = await handleTenantLearningIngest(jsonRequest(payload), env, {});
    assert.equal(retry.status, 200);
    const retryBody = (await retry.json()) as any;
    assert.equal(retryBody.ok, true);
  });

  it("rejects invalid event types", async () => {
    const env = makeEnv();
    const req = jsonRequest({
      mode: "tenant",
      tenant_id: "bvelt_tenant_alpha",
      items: [{ prospect_id: "p1", event_type: "sent", idempotency_key: "k-sent" }],
    });
    const res = await handleTenantLearningIngest(req, env, {});
    assert.equal(res.status, 400);
  });
});
