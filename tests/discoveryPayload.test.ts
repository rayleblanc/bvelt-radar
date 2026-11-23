import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateDiscoveryPayload } from "../src/discoveryPayload";
import { resolveDiscoveryCompletionStatus } from "../src/worker";

describe("discovery job payload validation", () => {
  it("accepts a complete city and trade payload", () => {
    assert.equal(validateDiscoveryPayload({ city: "Naples, FL, USA", trade: "plumbing" }), null);
  });

  it("rejects missing, null, empty and malformed payloads without throwing", () => {
    assert.equal(validateDiscoveryPayload(undefined), "payload must be an object");
    assert.equal(validateDiscoveryPayload(null), "payload must be an object");
    assert.equal(validateDiscoveryPayload([]), "payload must be an object");
    assert.equal(validateDiscoveryPayload({ city: "Naples, FL, USA" }), "trade is required");
    assert.equal(validateDiscoveryPayload({ trade: "plumbing" }), "city is required");
    assert.equal(validateDiscoveryPayload({ city: " ", trade: "plumbing" }), "city is required");
    assert.equal(validateDiscoveryPayload({ city: "Naples, FL, USA", trade: null }), "trade is required");
  });
  it("distinguishes an infrastructure-degraded discovery from a verified empty market", () => {
    assert.equal(
      resolveDiscoveryCompletionStatus("Zero businesses discovered. Nominatim: 0 matches, Overpass: HTTP 502 (skipped), BizData: cooldown active (server_error)"),
      "completed_source_degraded"
    );
    assert.equal(
      resolveDiscoveryCompletionStatus("Zero businesses discovered. Nominatim: 0 matches, Overpass: 0 elements, BizData: 0 matches"),
      "completed_zero_prospects"
    );
  });

});
