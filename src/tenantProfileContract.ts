export interface ValidatedTenantProfileContract {
  contractVersion: 1;
  realm: 'TENANT';
  profileId: string;
  businessId: string;
  profileSnapshotVersion: string;
  profileSnapshotAt: string;
  profileSource: 'FIRESTORE_PROFILE';
  locationSource: string;
  verificationState: string;
  correlationId: string;
  idempotencyKey: string;
  timezone: string | null;
  language: string | null;
  source: string;
  territory: Record<string, unknown>;
  territoryJson: string;
}

export function validateTenantProfileContract(body: any, tenantId: string):
  | { ok: true; value: ValidatedTenantProfileContract }
  | { ok: false; status: 400 | 403; error: string } {
  const contractVersion = Number(body?.contract_version);
  const realm = String(body?.realm || '').trim().toUpperCase();
  const profileId = String(body?.profile_id || '').trim();
  const businessId = String(body?.business_id || '').trim().slice(0, 180);
  const profileSnapshotVersion = String(body?.profile_snapshot_version || '').trim().toLowerCase();
  const profileSnapshotAt = String(body?.profile_snapshot_at || '').trim();
  const profileSource = String(body?.profile_source || '').trim().toUpperCase();
  const locationSource = String(body?.location_source || 'UNKNOWN').trim().toUpperCase();
  const verificationState = String(body?.verification_state || 'UNKNOWN').trim().toUpperCase();
  const correlationId = String(body?.correlation_id || '').trim().slice(0, 120);
  const idempotencyKey = String(body?.idempotency_key || '').trim().slice(0, 220);
  const timezone = String(body?.timezone || '').trim().slice(0, 80) || null;
  const language = String(body?.language || '').trim().slice(0, 20) || null;
  const source = String(body?.source || 'profile').trim().slice(0, 40);
  const territory = body?.territory && typeof body.territory === 'object' && !Array.isArray(body.territory) ? body.territory : {};
  const territoryJson = JSON.stringify(territory);
  const expectedProfileId = tenantId.startsWith('bvelt_') ? tenantId.slice('bvelt_'.length) : '';
  const validLocationSources = new Set(['DEVICE', 'BROWSER_NETWORK', 'USER_ENTERED', 'DEMO_EXAMPLE', 'UNKNOWN']);
  const validVerificationStates = new Set(['CONNECTED', 'PENDING_RE-AUTH', 'DISCONNECTED', 'DISCONNECTED_RE-AUTH_NEEDED', 'NOT_CONNECTED', 'VERIFIED', 'UNVERIFIED', 'UNKNOWN']);

  if (contractVersion !== 1 || realm !== 'TENANT' || profileSource !== 'FIRESTORE_PROFILE') {
    return { ok: false, status: 400, error: 'tenant_profile_contract_invalid' };
  }
  if (!expectedProfileId || profileId !== expectedProfileId) {
    return { ok: false, status: 403, error: 'profile_id_tenant_mismatch' };
  }
  if (!/^[a-f0-9]{64}$/.test(profileSnapshotVersion) || !Number.isFinite(Date.parse(profileSnapshotAt)) ||
      !/^[A-Za-z0-9-]{16,120}$/.test(correlationId) || !idempotencyKey || territoryJson.length > 8000 ||
      !validLocationSources.has(locationSource) || !validVerificationStates.has(verificationState)) {
    return { ok: false, status: 400, error: 'tenant_profile_contract_metadata_invalid' };
  }

  return {
    ok: true,
    value: {
      contractVersion: 1,
      realm: 'TENANT',
      profileId,
      businessId: businessId || profileId,
      profileSnapshotVersion,
      profileSnapshotAt,
      profileSource: 'FIRESTORE_PROFILE',
      locationSource,
      verificationState,
      correlationId,
      idempotencyKey,
      timezone,
      language,
      source,
      territory,
      territoryJson,
    },
  };
}
