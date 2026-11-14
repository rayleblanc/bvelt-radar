import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { handleTenantLearningIngest } from "../src/tenantLearningIngest";

function makeEnv(overrides: Record<string, any> = {}) {
  const events = new Map<string, any>();
  return {
    RADAR_SERVICE_KEY: "test-service-key",
    RADAR_DB: {
      prepare: (sql: string) => ({
        bind: (...args: any[]) => ({
          sql,
          args,
          first: async () => {
            if (/FROM learning_events WHERE idempotency_key/i.test(sql)) {
              return events.get(String(args[0])) || null;
            }
            if (/mode = 'tenant' AND tenant_id = \? AND idempotency_key/i.test(sql)) {
              const tenantId = String(args[0]);
              const key = String(args[1]);
              for (const [k, row] of events.entries()) {
                if (k.endsWith(key) || k === `tenant:${tenantId}:${key}` || k === key) {
                  return { id: row.id || "evt_existing" };
                }
              }
              return null;
            }
            return null;
          },
        }),
      }),
      batch: async (statements: any[]) => {
        const args = statements[0].args;
        const key = String(args[11]);
        const existed = events.has(key);
        if (!existed) {
          events.set(key, {
            id: String(args[0]),
            prospect_id: args[1],
            mode: args[2],
            tenant_id: args[3],
            event_type: args[4],
            city: args[5],
            trade: args[6],
            variant_id: args[7],
            angle: args[8],
            value_usd: args[9],
            metadata_json: args[10],
            occurred_at: args[12],
          });
        }
        return statements.map((_, i) => ({
          meta: { changes: i === 0 ? (existed ? 0 : 1) : existed ? 0 : 1 },
        }));
      },
    },
    ...overrides,
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
    const req = jsonRequest(
      { mode: "tenant", tenant_id: "bvelt_other", items: [{ prospect_id: "p1", event_type: "won", idempotency_key: "k1" }] },
      { "X-Tenant-Id": "bvelt_tenant_alpha" }
    );
    const res = await handleTenantLearningIngest(req, env, {});
    assert.equal(res.status, 403);
  });

  it("accepts explicit CRM outcomes idempotently", async () => {
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
    const firstBody = await first.json() as any;
    assert.equal(firstBody.ok, true);
    assert.equal(firstBody.inserted, 1);

    const retry = await handleTenantLearningIngest(jsonRequest(payload), env, {});
    assert.equal(retry.status, 200);
    const retryBody = await retry.json() as any;
    assert.equal(retryBody.ok, true);
    assert.equal(retryBody.deduplicated, 1);
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
