import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fetchBizDataBusinesses } from "../src/worker";
import { providerCooldownKey, type ProviderCooldownDatabase } from "../src/providerCooldown";

type StoredRow = { value: string; expires_at: number };

function createDb() {
  const rows = new Map<string, StoredRow>();
  const db: ProviderCooldownDatabase & { rows: typeof rows } = {
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
              if (sql.includes("INSERT INTO radar_cache")) {
                const key = String(params[0]);
                const prior = rows.get(key);
                const expiresAt = Math.max(Number(prior?.expires_at || 0), Number(params[2] || 0));
                rows.set(key, { value: String(params[1]), expires_at: expiresAt });
              }
              return { meta: { changes: 1 } };
            }
          };
        }
      };
    }
  };
  return db;
}

describe("BizData provider cooldown integration", () => {
  it("backs off another city after HTTP 429 and honors Retry-After", async () => {
    const db = createDb();
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response("rate limited", { status: 429, headers: { "Retry-After": "90" } });
    }) as typeof fetch;

    try {
      const env: any = { RADAR_DB: db };
      const first = await fetchBizDataBusinesses("Los Angeles, CA", "medical_clinic", env);
      const second = await fetchBizDataBusinesses("Toronto, ON", "medical_clinic", env);
      assert.match(first.status, /HTTP 429/);
      assert.match(second.status, /cooldown active/);
      assert.equal(calls, 1);
      const stored = db.rows.get(providerCooldownKey("bizdata", "business-directory"));
      assert.ok(stored);
      const record = JSON.parse(stored.value);
      assert.equal(record.failureClass, "rate_limited");
      assert.equal(record.status, 429);
      assert.equal(record.retryAfterMs, 90_000);
      assert.ok(stored.expires_at >= Date.now() + 89_000);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
