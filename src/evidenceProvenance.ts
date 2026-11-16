export interface RadarEvidenceProvenanceInput {
  mode: 'founder' | 'tenant';
  tenantId: string;
  prospectId: string;
  sourceId: string;
  sourceUrl: string;
  observedAt: string;
  fetchedAt: string;
  profileSnapshotVersion?: string | null;
  confidence?: number | null;
  item?: Record<string, any> | null;
}

export function buildRadarEvidenceProvenance(input: RadarEvidenceProvenanceInput) {
  const sourceLabel = new URL(input.sourceUrl).hostname.toLowerCase().replace(/^www[.]/, '');
  const item = input.item || {};
  const period = item.period && typeof item.period === 'object' ? {
    start: typeof item.period.start === 'string' && Number.isFinite(Date.parse(item.period.start)) ? item.period.start : null,
    end: typeof item.period.end === 'string' && Number.isFinite(Date.parse(item.period.end)) ? item.period.end : null,
  } : null;
  const limitations = Array.isArray(item.limitations)
    ? item.limitations.filter((value: unknown) => typeof value === 'string').slice(0, 20).map((value: string) => value.slice(0, 240))
    : [];
  const confidence = typeof input.confidence === 'number' && Number.isFinite(input.confidence)
    ? Math.max(0, Math.min(1, input.confidence))
    : null;

  return {
    realm: input.mode === 'tenant' ? 'TENANT' as const : 'FOUNDER' as const,
    evidence_status: 'DECLARED' as const,
    method: 'WEBSITE_SCRAPE' as const,
    subject_id: input.prospectId,
    source_label: sourceLabel,
    observed_at: input.observedAt,
    fetched_at: input.fetchedAt,
    valid_until: null,
    unit: typeof item.unit === 'string' ? item.unit.trim().slice(0, 40) || null : null,
    period_json: period ? JSON.stringify(period) : null,
    sample_size: Number.isInteger(item.sample_size) && item.sample_size >= 0 ? item.sample_size : null,
    limitations_json: JSON.stringify(limitations),
    usage_policy_json: null,
    profile_snapshot_version: input.profileSnapshotVersion || null,
    schema_version: 1,
    confidence,
  };
}
