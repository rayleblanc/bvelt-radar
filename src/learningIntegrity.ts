export type LearningMode = "founder" | "tenant";

export interface ScopedLearningEventInput {
  mode: LearningMode;
  tenantId: string;
  prospectId: string;
  eventType: string;
  city?: string | null;
  trade?: string | null;
  variantId?: string | null;
  angle?: string | null;
  valueUsd?: number | null;
  occurredAt?: string;
  metadata?: Record<string, unknown>;
}

export interface LearningCounterDelta {
  sent_count: number;
  delivered_count: number;
  replied_count: number;
  qualified_count: number;
  booked_count: number;
  won_count: number;
  lost_count: number;
  contacted_count: number;
  unknown_count: number;
  event_count: number;
}

export function learningCounterDelta(eventType: string): LearningCounterDelta {
  const event = String(eventType || "unknown").trim().toLowerCase();
  const delta: LearningCounterDelta = {
    sent_count: 0,
    delivered_count: 0,
    replied_count: 0,
    qualified_count: 0,
    booked_count: 0,
    won_count: 0,
    lost_count: 0,
    contacted_count: 0,
    unknown_count: 0,
    event_count: 1
  };

  if (event === "sent") delta.sent_count = 1;
  else if (event === "delivered") delta.delivered_count = 1;
  else if (["replied", "positive", "question"].includes(event)) delta.replied_count = 1;
  else if (event === "qualified") delta.qualified_count = 1;
  else if (event === "booked") delta.booked_count = 1;
  else if (["won", "converted"].includes(event)) delta.won_count = 1;
  else if (event === "lost") delta.lost_count = 1;
  else if (event === "contacted") delta.contacted_count = 1;
  else if (event === "unknown") delta.unknown_count = 1;

  return delta;
}

function normalizeScope(mode: LearningMode, tenantId: string): string {
  if (mode === "founder") return "founder";
  const value = String(tenantId || "").trim();
  if (!value || value === "founder") {
    throw new Error("Tenant learning requires its exact tenant_id.");
  }
  return value;
}

export async function recordScopedLearningEvent(
  db: any,
  input: ScopedLearningEventInput
): Promise<boolean> {
  if (!input.prospectId || !input.eventType) return false;
  const tenantId = normalizeScope(input.mode, input.tenantId);
  const occurredAt = input.occurredAt || new Date().toISOString();
  const eventType = String(input.eventType).trim().toLowerCase();
  const delta = learningCounterDelta(eventType);
  const eventId = crypto.randomUUID();
  const idempotencyKey = `${input.mode}:${tenantId}:${input.prospectId}:${eventType}:${occurredAt}`;
  const metadataJson = JSON.stringify(input.metadata || {});

  const inserted = await db.prepare(`
    INSERT OR IGNORE INTO learning_events
      (id, prospect_id, mode, tenant_id, event_type, city, trade, variant_id, angle, value_usd, metadata_json, idempotency_key, occurred_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    eventId,
    input.prospectId,
    input.mode,
    tenantId,
    eventType,
    input.city || null,
    input.trade || null,
    input.variantId || null,
    input.angle || null,
    typeof input.valueUsd === "number" && Number.isFinite(input.valueUsd) ? input.valueUsd : null,
    metadataJson,
    idempotencyKey,
    occurredAt
  ).run();

  if (inserted?.meta?.changes === 0) return false;


  return true;
}

export async function readScopedLearningStats(
  db: any,
  mode: LearningMode,
  tenantIdInput: string
): Promise<Record<string, number>> {
  const tenantId = normalizeScope(mode, tenantIdInput);
  const rates: Record<string, number> = {};
  // The append-only event log is canonical. Aggregated rows are a rebuildable projection.
  const rows = await db.prepare(`
    SELECT key,
      SUM(CASE WHEN event_type = 'sent' THEN 1 ELSE 0 END) AS sent_count,
      SUM(CASE WHEN event_type = 'contacted' THEN 1 ELSE 0 END) AS contacted_count,
      SUM(CASE WHEN event_type IN ('won','converted') THEN 1 ELSE 0 END) AS won_count
    FROM (
      SELECT mode, tenant_id, 'city:' || city AS key, event_type
      FROM learning_events WHERE city IS NOT NULL AND city != ''
      UNION ALL
      SELECT mode, tenant_id, 'trade:' || lower(trade) AS key, event_type
      FROM learning_events WHERE trade IS NOT NULL AND trade != ''
      UNION ALL
      SELECT mode, tenant_id, 'pair:' || city || '|' || lower(trade) AS key, event_type
      FROM learning_events WHERE city IS NOT NULL AND city != '' AND trade IS NOT NULL AND trade != ''
      UNION ALL
      SELECT mode, tenant_id, 'variant:' || variant_id AS key, event_type
      FROM learning_events WHERE variant_id IS NOT NULL AND variant_id != ''
      UNION ALL
      SELECT mode, tenant_id, 'angle:' || angle AS key, event_type
      FROM learning_events WHERE angle IS NOT NULL AND angle != ''
    ) scoped_events
    WHERE mode = ? AND tenant_id = ?
    GROUP BY key
    HAVING
      SUM(CASE WHEN event_type = 'sent' THEN 1 ELSE 0 END) +
      SUM(CASE WHEN event_type = 'contacted' THEN 1 ELSE 0 END) >= 2
  `).bind(mode, tenantId).all();

  for (const row of (rows?.results || []) as any[]) {
    const attempts = Math.max(1, Number(row.sent_count || 0) + Number(row.contacted_count || 0));
    const won = Math.min(attempts, Number(row.won_count || 0));
    rates[String(row.key)] = (won + 1) / (attempts + 2);
  }
  return rates;
}
