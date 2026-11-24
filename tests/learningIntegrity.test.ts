import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readScopedLearningStats } from "../src/learningIntegrity";

describe("readScopedLearningStats", () => {
  it("materializes the tenant-scoped event set once and preserves the requested scope", async () => {
    let sql = "";
    let bindings: unknown[] = [];
    const db = {
      prepare(query: string) {
        sql = query;
        return {
          bind(...values: unknown[]) {
            bindings = values;
            return {
              all: async () => ({
                results: [
                  { key: "city:Miami", contacted_count: 8, won_count: 2 },
                  { key: "trade:plumbing", contacted_count: 3, won_count: 1 },
                ],
              }),
            };
          },
        };
      },
    };

    const rates = await readScopedLearningStats(db, "tenant", "tenant_alpha");

    assert.match(sql, /WITH scoped_events AS MATERIALIZED/i);
    assert.deepEqual(bindings, ["tenant", "tenant_alpha"]);
    assert.equal(rates["city:Miami"], 3 / 5);
    assert.equal(rates["trade:plumbing"], 2 / 5);
  });

  it("keeps founder scope canonical and rejects tenant access to founder scope", async () => {
    let bindings: unknown[] = [];
    const db = {
      prepare() {
        return {
          bind(...values: unknown[]) {
            bindings = values;
            return { all: async () => ({ results: [] }) };
          },
        };
      },
    };

    await readScopedLearningStats(db, "founder", "any-input-is-normalized");
    assert.deepEqual(bindings, ["founder", "founder"]);

    const rejected = await readScopedLearningStats(db, "tenant", "founder");
    assert.deepEqual(rejected, {});
  });
});
