import test from "node:test";
import assert from "node:assert/strict";
import { buildRadarEvidenceProvenance } from "../src/evidenceProvenance";

test("scraped website claims are recorded as DECLARED with complete tenant provenance", () => {
  const result = buildRadarEvidenceProvenance({
    mode: "tenant", tenantId: "bvelt-user-1", prospectId: "prospect-1",
    sourceId: "website", sourceUrl: "https://www.example.com/services", observedAt: "2026-11-16T10:00:00.000Z",
    fetchedAt: "2026-11-16T10:01:00.000Z", profileSnapshotVersion: "a".repeat(64), confidence: 1.4,
    item: { unit: "reviews", sample_size: 12, period: { start: "2026-01-01", end: "2026-10-01" }, limitations: ["public website only"] },
  });
  assert.equal(result.realm, "TENANT");
  assert.equal(result.evidence_status, "DECLARED");
  assert.equal(result.method, "WEBSITE_SCRAPE");
  assert.equal(result.subject_id, "prospect-1");
  assert.equal(result.source_label, "example.com");
  assert.equal(result.confidence, 1);
  assert.equal(result.profile_snapshot_version, "a".repeat(64));
  assert.equal(result.sample_size, 12);
  assert.equal(JSON.parse(result.limitations_json)[0], "public website only");
});

test("Founder research remains isolated from Tenant realm", () => {
  const result = buildRadarEvidenceProvenance({
    mode: "founder", tenantId: "founder", prospectId: "prospect-2", sourceId: "website",
    sourceUrl: "https://example.org", observedAt: "2026-11-16T10:00:00.000Z", fetchedAt: "2026-11-16T10:01:00.000Z",
  });
  assert.equal(result.realm, "FOUNDER");
  assert.equal(result.evidence_status, "DECLARED");
});
