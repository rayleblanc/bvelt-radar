import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const schema = JSON.parse(readFileSync(
  new URL("../schemas/prospect-finding.v1.schema.json", import.meta.url),
  "utf8"
));

test("prospect finding contract is explicitly separate from tenant evidence", () => {
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(schema.properties.realm.const, "PROSPECT");
  assert.equal(schema.additionalProperties, false);
  assert.ok(schema.required.includes("prospectId"));
  assert.ok(schema.required.includes("subjectId"));
  assert.ok(schema.required.includes("sourceUrl"));
  assert.ok(schema.required.includes("deterministicMethodVersion"));
  assert.ok(schema.required.includes("coverage"));
  assert.equal(schema.properties.schemaVersion.const, 1);
});

test("prospect finding evidence vocabulary matches Bvelt canonical statuses", () => {
  assert.deepEqual(schema.properties.evidenceStatus.enum, [
    "VERIFIED", "DECLARED", "ESTIMATED", "MODELED", "BENCHMARK", "DEMO", "UNKNOWN"
  ]);
  const unavailable = schema.allOf.find((rule: any) => rule.if?.properties?.resultStatus?.const === "UNAVAILABLE");
  const notObserved = schema.allOf.find((rule: any) => rule.if?.properties?.resultStatus?.const === "NOT_OBSERVED_IN_SCOPE");
  assert.equal(unavailable.then.properties.evidenceStatus.const, "UNKNOWN");
  assert.equal(notObserved.then.properties.evidenceStatus.const, "VERIFIED");
});

test("prospect finding requires reproducible source and bounded scan coverage", () => {
  assert.equal(schema.properties.sourceUrl.format, "uri");
  assert.equal(schema.properties.observedAt.format, "date-time");
  assert.equal(schema.properties.fetchedAt.format, "date-time");
  assert.equal(schema.properties.confidence.minimum, 0);
  assert.equal(schema.properties.confidence.maximum, 1);
  assert.equal(schema.properties.sourceExcerpt.maxLength, 500);
  assert.equal(schema.properties.limitations.maxItems, 20);
  assert.equal(schema.properties.coverage.properties.scannedUrls.maxItems, 20);
  assert.equal(schema.properties.coverage.properties.skippedPaths.maxItems, 20);
});
