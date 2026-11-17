import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveTenantBuyerSegmentsForProfile } from "../src/tenantBuyerSegments";

describe("resolveTenantBuyerSegmentsForProfile", () => {
  it("uses the tenant industry/trade map before a narrower service niche", () => {
    const segments = resolveTenantBuyerSegmentsForProfile("Plumbing", "Water Heater Repair");
    assert.ok(segments.includes("property management"));
    assert.ok(segments.includes("real estate"));
    assert.ok(!segments.includes("Water Heater Repair"));
  });

  it("falls back to a specific niche when industry is generic", () => {
    const segments = resolveTenantBuyerSegmentsForProfile("Local Services", "Plumbing");
    assert.ok(segments.includes("property management"));
    assert.ok(segments.includes("hotel"));
  });

  it("keeps explicit buyer segments ahead of the curated trade map", () => {
    const segments = resolveTenantBuyerSegmentsForProfile(
      "Plumbing",
      "Water Heater Repair",
      ["Property Managers", "Facility Directors"]
    );
    assert.deepEqual(segments, ["Property Managers", "Facility Directors"]);
  });

  it("does not invent buyers for an unmapped generic industry", () => {
    assert.deepEqual(resolveTenantBuyerSegmentsForProfile("Commercial Services", "Commercial Services"), []);
  });
});
