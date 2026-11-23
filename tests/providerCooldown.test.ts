import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyProviderHttpStatus,
  createProviderCooldownStore,
  parseRetryAfterMs,
  providerCooldownDurationMs,
  providerCooldownKey,
  type ProviderCooldownDatabase
} from "../src/providerCooldown";
import { generateAICopy, verifyEmail, WORKERS_AI_FALLBACK_MODEL } from "../src/worker";

type StoredRow = { value: string; expires_at: number };

function createDb(rows: Map<string, StoredRow> = new Map()) {
  const statements: Array<{ sql: string; params: unknown[] }> = [];
  const db: ProviderCooldownDatabase & {
    statements: typeof statements;
    rows: typeof rows;
  } = {
    statements,
    rows,
    prepare(sql: string) {
      return {
        bind(...params: unknown[]) {
          return {
            async first<T = Record<string, unknown>>() {
              if (sql.includes("SELECT value, expires_at FROM radar_cache")) {
                return (rows.get(String(params[0])) || null) as T | null;
              }
              return null;
            },
            async run() {
              statements.push({ sql, params });
              if (sql.includes("INSERT INTO radar_cache")) {
                const key = String(params[0]);
                const prior = rows.get(key);
                const expiresAt = Math.max(Number(prior?.expires_at || 0), Number(params[2] || 0));
                rows.set(key, { value: String(params[1]), expires_at: expiresAt });
              }
              if (sql.includes("UPDATE daily_budgets")) return { meta: { changes: 1 } };
              return { meta: { changes: 1 } };
            }
          };
        }
      };
    }
  };
  return db;
}

describe("provider/model cooldown policy", () => {
  it("parses Retry-After delta-seconds and HTTP-date", () => {
    const now = Date.UTC(2026, 10, 18, 12, 0, 0);
    assert.equal(parseRetryAfterMs("17", now), 17_000);
    const httpDate = new Date(now + 45_000).toUTCString();
    const dateDelay = parseRetryAfterMs(httpDate, now);
    assert.ok(dateDelay !== null && dateDelay >= 44_000 && dateDelay <= 45_000);
    assert.equal(parseRetryAfterMs("not-a-date", now), null);
  });

  it("differentiates rate limits, server errors, timeouts, invalid models and auth failures", () => {
    assert.equal(classifyProviderHttpStatus(429), "rate_limited");
    assert.equal(classifyProviderHttpStatus(503), "server_error");
    assert.equal(classifyProviderHttpStatus(408), "timeout");
    assert.equal(classifyProviderHttpStatus(404), "model_not_found");
    assert.equal(classifyProviderHttpStatus(401), "auth_error");
    assert.equal(providerCooldownDurationMs("rate_limited", 123_000), 123_000);
    assert.equal(providerCooldownDurationMs("server_error"), 30_000);
    assert.equal(providerCooldownDurationMs("timeout"), 20_000);
    assert.equal(providerCooldownDurationMs("model_not_found"), 6 * 60 * 60 * 1000);
  });

  it("persists a provider/model cooldown in shared D1 cache for another isolate", async () => {
    const sharedRows = new Map<string, StoredRow>();
    const storeA = createProviderCooldownStore();
    const storeB = createProviderCooldownStore();
    const dbA = createDb(sharedRows);
    const dbB = createDb(sharedRows);
    const now = Date.UTC(2026, 10, 18, 12, 0, 0);

    const recorded = await storeA.recordFailure(dbA, "groq", "openai/gpt-oss-20b", {
      failureClass: "rate_limited",
      status: 429,
      retryAfter: "120",
      now
    });
    assert.equal(recorded?.cooldownUntil, now + 120_000);

    const shared = await storeB.getCooldown(dbB, "groq", "openai/gpt-oss-20b", now + 1_000);
    assert.equal(shared?.failureClass, "rate_limited");
    assert.equal(shared?.status, 429);
    assert.equal(shared?.cooldownUntil, now + 120_000);
    assert.equal(await storeB.getCooldown(dbB, "groq", "openai/gpt-oss-120b", now + 1_000), null);
    assert.equal(await storeB.getCooldown(dbB, "gemini", "openai/gpt-oss-20b", now + 1_000), null);
    assert.ok(sharedRows.has(providerCooldownKey("groq", "openai/gpt-oss-20b")));
  });

  it("expires a cooldown and never keeps a model blocked after its expiry", async () => {
    const rows = new Map<string, StoredRow>();
    const storeA = createProviderCooldownStore();
    const storeB = createProviderCooldownStore();
    const dbA = createDb(rows);
    const dbB = createDb(rows);
    const now = Date.UTC(2026, 10, 18, 12, 0, 0);

    await storeA.recordFailure(dbA, "gemini", "gemini-paid-test", {
      failureClass: "server_error",
      status: 503,
      now
    });
    assert.ok(await storeB.getCooldown(dbB, "gemini", "gemini-paid-test", now + 1_000));
    assert.equal(await storeB.getCooldown(dbB, "gemini", "gemini-paid-test", now + 31_000), null);
  });

  it("cools down Groq and Gemini after 429, 5xx, timeout and empty responses", async () => {
    const sharedRows = new Map<string, StoredRow>();
    const db = createDb(sharedRows);
    const originalFetch = globalThis.fetch;
    let groqCalls = 0;
    let geminiCalls = 0;
    let workersAiCalls = 0;

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("api.groq.com")) {
        groqCalls += 1;
        const model = JSON.parse(String(init?.body || "{}")).model;
        if (model === "openai/gpt-oss-20b") {
          return new Response("rate limited", { status: 429, headers: { "Retry-After": "120" } });
        }
        if (model === "openai/gpt-oss-120b") {
          return new Response("upstream unavailable", { status: 503 });
        }
        throw new Error("unexpected Groq model");
      }
      if (url.includes("generativelanguage.googleapis.com")) {
        geminiCalls += 1;
        if (url.includes("gemini-3.8-flash")) {
          throw Object.assign(new Error("The operation timed out"), { name: "TimeoutError" });
        }
        return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "" }] } }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
      throw new Error("unexpected test fetch target");
    }) as typeof fetch;

    const env: any = {
      RADAR_DB: db,
      GROQ_API_KEY: "unit-test-key",
      GEMINI_FOUNDER_API_KEY: "unit-test-gemini-key",
      GEMINI_PAID_TIER_CONFIRMED: "true",
      GEMINI_MODELS: "gemini-3.8-flash,gemini-3.5-flash-lite",
      AI: {
        async run() {
          workersAiCalls += 1;
          return { response: JSON.stringify({ subject: "A question", body: "Would it be useful to compare notes?" }) };
        }
      }
    };
    const prospect = {
      id: "cooldown-mixed-failures",
      tenant_id: "founder",
      mode: "founder",
      name: "Example Plumbing",
      trade: "Plumbing",
      city: "Austin"
    };

    try {
      const first = await generateAICopy(prospect, "missed_calls", env, undefined, "email");
      const second = await generateAICopy(prospect, "missed_calls", env, undefined, "email");
      assert.equal(first.source, "workers_ai");
      assert.equal(second.source, "workers_ai");
      assert.equal(groqCalls, 2, "Groq 20B and 120B are each attempted once");
      assert.equal(geminiCalls, 2, "paid Gemini models are each attempted once");
      assert.equal(workersAiCalls, 2, "the healthy fallback remains available for both calls");

      const groq429 = JSON.parse(sharedRows.get(providerCooldownKey("groq", "openai/gpt-oss-20b"))!.value);
      const groq503 = JSON.parse(sharedRows.get(providerCooldownKey("groq", "openai/gpt-oss-120b"))!.value);
      const geminiTimeout = JSON.parse(sharedRows.get(providerCooldownKey("gemini", "gemini-3.8-flash"))!.value);
      const geminiEmpty = JSON.parse(sharedRows.get(providerCooldownKey("gemini", "gemini-3.5-flash-lite"))!.value);
      assert.equal(groq429.failureClass, "rate_limited");
      assert.equal(groq429.status, 429);
      assert.equal(groq429.retryAfterMs, 120_000);
      assert.equal(groq503.failureClass, "server_error");
      assert.equal(geminiTimeout.failureClass, "timeout");
      assert.equal(geminiEmpty.failureClass, "invalid_response");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("backs off Workers AI after its quota returns 429 and uses deterministic copy", async () => {
    const rows = new Map<string, StoredRow>();
    const db = createDb(rows);
    let workersAiCalls = 0;
    const env: any = {
      RADAR_DB: db,
      AI: {
        async run() {
          workersAiCalls += 1;
          throw Object.assign(new Error("Workers AI daily quota exhausted"), { status: 429 });
        }
      }
    };
    const prospect = { id: "cooldown-ai-quota", tenant_id: "founder", mode: "founder", name: "Example Plumbing", trade: "Plumbing", city: "Austin" };

    const first = await generateAICopy(prospect, "missed_calls", env);
    const second = await generateAICopy(prospect, "missed_calls", env);
    const stored = rows.get(providerCooldownKey("workers_ai", WORKERS_AI_FALLBACK_MODEL));

    assert.equal(first.source, "template");
    assert.equal(second.source, "template");
    assert.equal(workersAiCalls, 1, "Workers AI is called once and skipped while its cooldown is active");
    assert.equal(JSON.parse(stored!.value).failureClass, "rate_limited");
  });

  it("applies a shared cooldown to Abstract email verification after provider auth failures", async () => {
    const rows = new Map<string, StoredRow>();
    const db = createDb(rows);
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response("provider unavailable", { status: 401 });
    }) as typeof fetch;

    const env: any = { RADAR_DB: db, ABSTRACT_API_KEY: "unit-test-invalid-key" };
    try {
      const first = await verifyEmail("contact@acmeplumbing.com", env);
      const second = await verifyEmail("owner@otherplumbing.com", env);
      assert.equal(first.deliverability, "UNVERIFIED");
      assert.equal(second.deliverability, "UNVERIFIED");
      assert.equal(calls, 1, "shared provider cooldown prevents a second request for another prospect");
      const stored = rows.get(providerCooldownKey("abstract_email", "emailvalidation"));
      assert.ok(stored, "provider failure is persisted in shared D1 cache");
      assert.equal(JSON.parse(stored.value).failureClass, "auth_error");
      assert.equal(JSON.parse(stored.value).status, 401);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

});
