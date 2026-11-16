import test from "node:test";
import assert from "node:assert/strict";
import { validateTenantProfileContract } from "../src/tenantProfileContract";

const valid = {
  contract_version: 1, realm: "TENANT", tenant_id: "bvelt_user-1", profile_id: "user-1",
  business_id: "biz-1", profile_snapshot_version: "a".repeat(64), profile_snapshot_at: "2026-11-16T12:00:00.000Z",
  profile_source: "FIRESTORE_PROFILE", location_source: "USER_ENTERED", verification_state: "UNKNOWN",
  correlation_id: "550e8400-e29b-41d4-a716-446655440000", idempotency_key: "bootstrap:v1:tenant:hash",
  territory: { city: "Tampa", country: "US" },
};

test("Tenant profile contract accepts valid owner-bound snapshots", () => {
  const result = validateTenantProfileContract(valid, "bvelt_user-1");
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.profileId, "user-1");
    assert.equal(result.value.realm, "TENANT");
    assert.equal(result.value.contractVersion, 1);
  }
});

test("Tenant profile contract rejects mismatched tenants and invalid metadata", () => {
  assert.deepEqual(validateTenantProfileContract(valid, "bvelt_user-2"), {
    ok: false, status: 403, error: "profile_id_tenant_mismatch",
  });
  assert.equal(validateTenantProfileContract({ ...valid, contract_version: 2 }, "bvelt_user-1").ok, false);
  assert.equal(validateTenantProfileContract({ ...valid, profile_snapshot_version: "bad" }, "bvelt_user-1").ok, false);
  assert.equal(validateTenantProfileContract({ ...valid, location_source: "CITY_GUESS" }, "bvelt_user-1").ok, false);
  assert.equal(validateTenantProfileContract({ ...valid, territory: { data: "x".repeat(9000) } }, "bvelt_user-1").ok, false);
});
