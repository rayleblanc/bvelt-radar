import { recordScopedLearningEvent } from "./learningIntegrity";

type LearningEnv = {
  RADAR_DB: any;
  RADAR_SERVICE_KEY?: string;
};

/**
 * Authenticated server-to-server Tenant CRM outcome ingest.
 * Accepts only explicit CRM funnel events and writes through scoped learning integrity.
 */
export async function handleTenantLearningIngest(
  request: Request,
  env: LearningEnv,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const serviceKey = String(env.RADAR_SERVICE_KEY || "").trim();
  if (!serviceKey || !token || token !== serviceKey) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401, headers: corsHeaders });
  }

  const headerTenantId = String(request.headers.get("X-Tenant-Id") || "").trim();
  if (!headerTenantId.startsWith("bvelt_") || headerTenantId === "bvelt_founder") {
    return Response.json({ ok: false, error: "valid_tenant_scope_required" }, { status: 400, headers: corsHeaders });
  }

  const body = await request.json().catch(() => null) as any;
  if (!body || body.mode !== "tenant" || String(body.tenant_id || "").trim() !== headerTenantId) {
    return Response.json({ ok: false, error: "tenant_scope_mismatch" }, { status: 403, headers: corsHeaders });
  }
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 100) {
    return Response.json({ ok: false, error: "items_must_contain_1_to_100_events" }, { status: 400, headers: corsHeaders });
  }

  const allowedEvents = new Set(["contacted", "replied", "qualified", "booked", "won", "lost"]);
  let insertedCount = 0;
  let duplicateCount = 0;

  try {
    for (const item of body.items) {
      const prospectId = String(item?.prospect_id || "").trim().slice(0, 180);
      const eventType = String(item?.event_type || "").trim().toLowerCase();
      const idempotencyKey = String(item?.idempotency_key || "").trim().slice(0, 180);
      if (!prospectId || !allowedEvents.has(eventType) || !idempotencyKey) {
        return Response.json({ ok: false, error: "invalid_learning_event" }, { status: 400, headers: corsHeaders });
      }

      const occurredAt = String(item?.occurred_at || new Date().toISOString()).slice(0, 40);
      if (!Number.isFinite(Date.parse(occurredAt))) {
        return Response.json({ ok: false, error: "invalid_occurred_at" }, { status: 400, headers: corsHeaders });
      }
      const valueUsd = item?.value_usd == null ? null : Number(item.value_usd);
      if (valueUsd !== null && (!Number.isFinite(valueUsd) || valueUsd < 0)) {
        return Response.json({ ok: false, error: "invalid_value_usd" }, { status: 400, headers: corsHeaders });
      }

      const input = {
        mode: "tenant" as const,
        tenantId: headerTenantId,
        prospectId,
        eventType,
        city: item?.city ? String(item.city).trim().slice(0, 200) : null,
        trade: item?.trade ? String(item.trade).trim().slice(0, 160) : null,
        variantId: item?.variant_id ? String(item.variant_id).trim().slice(0, 120) : null,
        angle: item?.angle ? String(item.angle).trim().slice(0, 160) : null,
        valueUsd,
        occurredAt,
        idempotencyKey: `bvelt-outcome:${idempotencyKey}`,
      };

      const inserted = await recordScopedLearningEvent(env.RADAR_DB, input);
      if (inserted) {
        insertedCount++;
        continue;
      }

      const storedKey = `tenant:${headerTenantId}:${input.idempotencyKey}`;
      const existing = await env.RADAR_DB.prepare(
        "SELECT id FROM learning_events WHERE mode = 'tenant' AND tenant_id = ? AND idempotency_key = ? LIMIT 1"
      )
        .bind(headerTenantId, storedKey)
        .first();
      if (!existing) {
        return Response.json(
          { ok: false, error: "learning_event_persistence_unconfirmed" },
          { status: 503, headers: corsHeaders }
        );
      }
      duplicateCount++;
    }
  } catch (error: any) {
    console.error("[Radar Learning Ingest] Persistence failed:", error?.message || error);
    return Response.json(
      { ok: false, error: "learning_event_persistence_failed" },
      { status: 503, headers: corsHeaders }
    );
  }

  return Response.json(
    {
      ok: true,
      mode: "tenant",
      tenant_id: headerTenantId,
      accepted: insertedCount + duplicateCount,
      inserted: insertedCount,
      deduplicated: duplicateCount,
    },
    { headers: corsHeaders }
  );
}
