import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { handleTenantLearningIngest } from "../src/tenantLearningIngest";

function makeEnv() {
  return {
    RADAR_SERVICE_KEY: "test-service-key",
    RADAR_DB: {
      prepare: () => ({
        bind: () => ({
          first: async () => null,
          run: async () => ({ meta: { changes: 0 } }),
          all: async () => ({ results: [] }),
        }),
      }),
      batch: async () => [{ meta: { changes: 1 } }],
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

  it("rejects founder tenant scope", async () => {
    const env = makeEnv();
    const req = jsonRequest(
      {
        mode: "tenant",
        tenant_id: "bvelt_founder",
        items: [{ prospect_id: "p1", event_type: "won", idempotency_key: "k1" }],
      },
      { "X-Tenant-Id": "bvelt_founder" }
    );
    const res = await handleTenantLearningIngest(req, env, {});
    assert.equal(res.status, 400);
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

  it("rejects empty items", async () => {
    const env = makeEnv();
    const req = jsonRequest({
      mode: "tenant",
      tenant_id: "bvelt_tenant_alpha",
      items: [],
    });
    const res = await handleTenantLearningIngest(req, env, {});
    assert.equal(res.status, 400);
  });
});
