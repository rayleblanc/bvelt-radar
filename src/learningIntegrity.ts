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
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}

export interface LearningCounterDelta {
  sent_count: number;
  delivered_count: number;
  opened_count: number;
  clicked_count: number;
  bounced_count: number;
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
    opened_count: 0,
    clicked_count: 0,
    bounced_count: 0,
    replied_count: 0,
    qualified_count: 0,
    booked_count: 0,
    won_count: 0,
    lost_count: 0,
    contacted_count: 0,
    unknown_count: 0,
    event_count: 1,
  };

  if (event === "sent") delta.sent_count = 1;
  else if (event === "delivered") delta.delivered_count = 1;
  else if (event === "opened") delta.opened_count = 1;
  else if (event === "clicked") delta.clicked_count = 1;
  else if (event === "bounced") delta.bounced_count = 1;
  else if (
    ["replied", "positive", "question", "negative", "not_now", "unsubscribe", "out_of_office"].includes(
      event
    )
  ) {
    delta.replied_count = 1;
  } else if (event === "qualified") delta.qualified_count = 1;
  else if (event === "booked") delta.booked_count = 1;
  else if (["won", "converted"].includes(event)) delta.won_count = 1;
  else if (event === "lost") delta.lost_count = 1;
  else if (event === "contacted") delta.contacted_count = 1;
  else if (["unknown", "discarded", "suppressed"].includes(event)) delta.unknown_count = 1;
  else delta.unknown_count = 1;

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
  if (!db || !input.prospectId || !input.eventType) return false;

  try {
    const tenantId = normalizeScope(input.mode, input.tenantId);
    const occurredAt = input.occurredAt || new Date().toISOString();
    const eventType = String(input.eventType).trim().toLowerCase();
    const delta = learningCounterDelta(eventType);
    const eventId = crypto.randomUUID();
    const idempotencyKey = input.idempotencyKey
      ? `${input.mode}:${tenantId}:${input.idempotencyKey}`
      : `${input.mode}:${tenantId}:${input.prospectId}:${eventType}:${occurredAt}`;
    const metadataJson = JSON.stringify(input.metadata || {});

    const keys = new Set<string>();
    if (input.city) keys.add(`city:${input.city}`);
    if (input.trade) keys.add(`trade:${String(input.trade).toLowerCase()}`);
    if (input.city && input.trade) {
      keys.add(`pair:${input.city}|${String(input.trade).toLowerCase()}`);
    }
    if (input.variantId) keys.add(`variant:${input.variantId}`);
    if (input.angle) keys.add(`angle:${input.angle}`);

    const statements = [
      db
        .prepare(
          `
      INSERT OR IGNORE INTO learning_events
        (id, prospect_id, mode, tenant_id, event_type, city, trade, variant_id, angle, value_usd, metadata_json, idempotency_key, occurred_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
        )
        .bind(
          eventId,
          input.prospectId,
          input.mode,
          tenantId,
          eventType,
          input.city || null,
          input.trade || null,
          input.variantId || null,
          input.angle || null,
          typeof input.valueUsd === "number" && Number.isFinite(input.valueUsd)
            ? input.valueUsd
            : null,
          metadataJson,
          idempotencyKey,
          occurredAt
        ),
    ];

    // Event and derived counters commit together. Aggregate updates only apply
    // if this exact event row was inserted (idempotent retries no-op cleanly).
    for (const key of keys) {
      statements.push(
        db
          .prepare(
            `
      INSERT INTO learning_stats_scoped (
        mode, tenant_id, key, sent_count, delivered_count, opened_count, clicked_count,
        bounced_count, replied_count, qualified_count, booked_count, won_count,
        lost_count, contacted_count,
        unknown_count, total_events, updated_at
      )
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM learning_events WHERE id = ?)
      ON CONFLICT(mode, tenant_id, key) DO UPDATE SET
        sent_count = sent_count + excluded.sent_count,
        delivered_count = delivered_count + excluded.delivered_count,
        opened_count = opened_count + excluded.opened_count,
        clicked_count = clicked_count + excluded.clicked_count,
        bounced_count = bounced_count + excluded.bounced_count,
        replied_count = replied_count + excluded.replied_count,
        qualified_count = qualified_count + excluded.qualified_count,
        booked_count = booked_count + excluded.booked_count,
        won_count = won_count + excluded.won_count,
        lost_count = lost_count + excluded.lost_count,
        contacted_count = contacted_count + excluded.contacted_count,
        unknown_count = unknown_count + excluded.unknown_count,
        total_events = total_events + excluded.total_events,
        updated_at = excluded.updated_at
    `
          )
          .bind(
            input.mode,
            tenantId,
            key,
            delta.sent_count,
            delta.delivered_count,
            delta.opened_count,
            delta.clicked_count,
            delta.bounced_count,
            delta.replied_count,
            delta.qualified_count,
            delta.booked_count,
            delta.won_count,
            delta.lost_count,
            delta.contacted_count,
            delta.unknown_count,
            delta.event_count,
            occurredAt,
            eventId
          )
      );
    }

    const results = await db.batch(statements);
    if (Number(results?.[0]?.meta?.changes || 0) > 0) return true;

    // A retry after a lost response is acknowledged only when the existing
    // event matches this exact scoped payload. Reusing a key for another
    // outcome or value is rejected without changing any aggregate.
    const existing = await db
      .prepare(
        `SELECT prospect_id, mode, tenant_id, event_type, city, trade, variant_id, angle, value_usd
         FROM learning_events WHERE idempotency_key = ? LIMIT 1`
      )
      .bind(idempotencyKey)
      .first();
    const expectedValue =
      typeof input.valueUsd === "number" && Number.isFinite(input.valueUsd)
        ? input.valueUsd
        : null;
    return Boolean(
      existing &&
      String(existing.prospect_id) === String(input.prospectId) &&
      String(existing.mode) === input.mode &&
      String(existing.tenant_id) === tenantId &&
      String(existing.event_type) === eventType &&
      (existing.city || null) === (input.city || null) &&
      (existing.trade || null) === (input.trade || null) &&
      (existing.variant_id || null) === (input.variantId || null) &&
      (existing.angle || null) === (input.angle || null) &&
      (existing.value_usd ?? null) === expectedValue
    );
  } catch (err: any) {
    // Tables may not exist until migrations 0023/0024 are applied.
    // Never take down outreach / decision paths for learning storage failures.
    console.warn("[learningIntegrity] recordScopedLearningEvent skipped:", err?.message || err);
    return false;
  }
}

export async function readScopedLearningStats(
  db: any,
  mode: LearningMode,
  tenantIdInput: string
): Promise<Record<string, number>> {
  const rates: Record<string, number> = {};
  if (!db) return rates;

  try {
    const tenantId = normalizeScope(mode, tenantIdInput);
    const rows = await db
      .prepare(
        `
    WITH scoped_events AS (
      SELECT prospect_id, event_type, city, trade, variant_id, angle
      FROM learning_events
      WHERE mode = ? AND tenant_id = ?
        AND event_type IN (
          'sent', 'delivered', 'opened', 'clicked', 'bounced',
          'contacted', 'replied', 'positive', 'question', 'negative',
          'not_now', 'unsubscribe', 'out_of_office',
          'booked', 'won', 'converted', 'lost'
        )
    ),
    dimensions AS (
      SELECT prospect_id, event_type, 'city:' || city AS key
      FROM scoped_events WHERE city IS NOT NULL AND TRIM(city) <> ''
      UNION ALL
      SELECT prospect_id, event_type, 'trade:' || LOWER(TRIM(trade)) AS key
      FROM scoped_events WHERE trade IS NOT NULL AND TRIM(trade) <> ''
      UNION ALL
      SELECT prospect_id, event_type, 'pair:' || city || '|' || LOWER(TRIM(trade)) AS key
      FROM scoped_events
      WHERE city IS NOT NULL AND TRIM(city) <> ''
        AND trade IS NOT NULL AND TRIM(trade) <> ''
      UNION ALL
      SELECT prospect_id, event_type, 'variant:' || variant_id AS key
      FROM scoped_events WHERE variant_id IS NOT NULL AND TRIM(variant_id) <> ''
      UNION ALL
      SELECT prospect_id, event_type, 'angle:' || angle AS key
      FROM scoped_events WHERE angle IS NOT NULL AND TRIM(angle) <> ''
    )
    SELECT
      key,
      COUNT(DISTINCT prospect_id) AS contacted_count,
      COUNT(DISTINCT CASE WHEN event_type IN ('won', 'converted') THEN prospect_id END) AS won_count
    FROM dimensions
    GROUP BY key
    HAVING COUNT(DISTINCT prospect_id) >= 2
  `
      )
      .bind(mode, tenantId)
      .all();

    for (const row of (rows?.results || []) as any[]) {
      const contacted = Math.max(1, Number(row.contacted_count || 0));
      const won = Math.min(contacted, Number(row.won_count || 0));
      rates[String(row.key)] = (won + 1) / (contacted + 2);
    }
  } catch (err: any) {
    console.warn("[learningIntegrity] readScopedLearningStats skipped:", err?.message || err);
  }
  return rates;
}
