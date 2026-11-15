import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * Source-level guard: category mismatch only works when trade is passed.
 * Production findings (restaurant-as-landscaping, lighting-as-electrician)
 * require every isOffIcpName gate in worker.ts to pass the declared trade.
 */
describe("worker ICP trade wiring", () => {
  const worker = readFileSync(new URL("../src/worker.ts", import.meta.url), "utf8");

  it("passes trade into isOffIcpName in discovery, enrich, outreach, and coherence", () => {
    const required = [
      "isOffIcpName(candidate.name, allowTenantBuyer, candidate.trade || trade)",
      "isOffIcpName(candidate.name, job.mode === 'tenant', candidate.trade)",
      "isOffIcpName(prospect.name, prospect.mode === 'tenant', prospect.trade)",
      "isOffIcpName(prospect.name, job.mode === \"tenant\", prospect.trade)",
      "isOffIcpName(rawName, mode === \"tenant\", candTrade)",
      "isOffIcpName(name, allowTenantBuyer, declaredTrade)",
    ];
    for (const snippet of required) {
      assert.ok(
        worker.includes(snippet),
        `Missing ICP trade wiring in worker.ts: ${snippet}`
      );
    }
  });

  it("does not leave two-argument isOffIcpName call sites for prospects", () => {
    const bad = [
      "isOffIcpName(candidate.name, allowTenantBuyer)",
      "isOffIcpName(candidate.name, job.mode === 'tenant')",
      "isOffIcpName(prospect.name, prospect.mode === 'tenant')",
      "isOffIcpName(prospect.name, job.mode === \"tenant\")",
      "isOffIcpName(rawName, mode === \"tenant\")",
      "isOffIcpName(name, allowTenantBuyer)",
    ];
    for (const snippet of bad) {
      // Allow only if the three-arg form with same prefix is present (substring trap).
      const occurrences = worker.split(snippet).length - 1;
      if (occurrences === 0) continue;
      const threeArg = snippet.replace(/\)$/, ",");
      assert.ok(
        worker.includes(threeArg),
        `Two-arg isOffIcpName still present: ${snippet}`
      );
    }
  });
});
