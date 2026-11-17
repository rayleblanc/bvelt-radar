import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { expandTenantIcp, WORKERS_AI_FALLBACK_MODEL } from "../src/worker";

function createDb(reservationChanges = 1) {
  const statements: Array<{ sql: string; params: unknown[] }> = [];
  const db = {
    statements,
    prepare(sql: string) {
      return {
        bind(...params: unknown[]) {
          return {
            async run() {
              statements.push({ sql, params });
              if (sql.includes("UPDATE daily_budgets") && sql.includes("SET ai_units = ai_units +")) {
                return { meta: { changes: reservationChanges } };
              }
              return { meta: { changes: 1 } };
            },
            async first() { return null; }
          };
        }
      };
    }
  };
  return db;
}

const tenant = {
  tenant_id: "tenant-123",
  tenant_name: "Example Services",
  industry: "Plumbing",
  niche: "Commercial plumbing",
  services_json: '["Drain repair"]',
  service_areas_json: '["Austin"]',
  countries_json: '["US"]',
  languages_json: '["en"]',
  icp_keywords_json: '["property management"]',
  allowed_markets_json: '["Austin"]',
  icp_description: "Commercial property operators"
};

describe("expandTenantIcp provider fallback and tenant budget", () => {
  it("uses cached expansion without reserving AI budget", async () => {
    const db = createDb();
    const cached = { segments: [{ label: "Cached buyers", osm_tags: [], keywords: [], why: "Stored" }] };
    const result = await expandTenantIcp({ RADAR_DB: db as any } as any, {
      ...tenant,
      updated_at: "2026-11-16T00:00:00.000Z",
      icp_expanded_at: "2026-11-17T00:00:00.000Z",
      icp_expansion_json: JSON.stringify(cached)
    });
    assert.deepEqual(result, cached);
    assert.equal(db.statements.length, 0);
  });

  it("uses Workers AI when Groq and paid Gemini are unavailable, and meters the tenant", async () => {
    const db = createDb();
    let calledModel = "";
    const env: any = {
      RADAR_DB: db,
      AI: {
        async run(model: string) {
          calledModel = model;
          return { response: JSON.stringify({ segments: [{
            label: "Property managers",
            osm_tags: ["office=estate_agent"],
            keywords: ["property"],
            why: "Potential recurring buyer"
          }] }) };
        }
      }
    };
    const result = await expandTenantIcp(env, { ...tenant });
    assert.equal(calledModel, WORKERS_AI_FALLBACK_MODEL);
    assert.equal(result?.segments[0]?.label, "Property managers");
    assert.ok(db.statements.some(x => x.sql.includes("UPDATE daily_budgets") && x.sql.includes("ai_units = ai_units +")));
    assert.ok(db.statements.some(x => x.sql.includes("UPDATE tenant_config SET icp_expansion_json")));
    assert.ok(!db.statements.some(x => x.sql.includes("SET ai_units = MAX(0, ai_units -")));
  });

  it("does not call a provider when the tenant AI budget is exhausted", async () => {
    const db = createDb(0);
    let calls = 0;
    const env: any = { RADAR_DB: db, AI: { async run() { calls += 1; return {}; } } };
    const result = await expandTenantIcp(env, tenant);
    assert.equal(result, null);
    assert.equal(calls, 0);
  });

  it("releases the reserved unit when every provider returns unusable output", async () => {
    const db = createDb();
    const env: any = { RADAR_DB: db, AI: { async run() { return { response: "not json" }; } } };
    const result = await expandTenantIcp(env, tenant);
    assert.equal(result, null);
    assert.ok(db.statements.some(x => x.sql.includes("SET ai_units = MAX(0, ai_units -")));
  });
});
