export type AIProviderName = "groq" | "gemini" | "workers_ai" | "abstract";

export type ProviderFailureClass =
  | "rate_limited"
  | "server_error"
  | "timeout"
  | "model_not_found"
  | "auth_error"
  | "invalid_response"
  | "network_error"
  | "provider_error";

export interface ProviderCooldownRecord {
  provider: AIProviderName;
  model: string;
  failureClass: ProviderFailureClass;
  status: number | null;
  recordedAt: number;
  cooldownUntil: number;
  retryAfterMs: number | null;
}

export interface ProviderCooldownDatabase {
  prepare(sql: string): {
    bind(...values: unknown[]): {
      first<T = Record<string, unknown>>(): Promise<T | null>;
      run(): Promise<unknown>;
    };
  };
}

export interface ProviderFailureInput {
  failureClass: ProviderFailureClass;
  status?: number | null;
  retryAfter?: string | null;
  now?: number;
}

const CACHE_PREFIX = "provider_cooldown:v1:";
const MAX_RETRY_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

const DEFAULT_COOLDOWN_MS: Record<ProviderFailureClass, number> = {
  rate_limited: 60_000,
  server_error: 30_000,
  timeout: 20_000,
  model_not_found: 6 * 60 * 60 * 1000,
  auth_error: 15 * 60 * 1000,
  invalid_response: 15_000,
  network_error: 15_000,
  provider_error: 15_000
};

export function providerCooldownKey(provider: AIProviderName, model: string): string {
  const normalizedModel = String(model || "").trim();
  if (!normalizedModel) throw new Error("provider_cooldown_model_required");
  return `${CACHE_PREFIX}${provider}:${encodeURIComponent(normalizedModel)}`;
}

/** Parses both Retry-After delta-seconds and HTTP-date forms. */
export function parseRetryAfterMs(value: string | null | undefined, now = Date.now()): number | null {
  const raw = String(value || "").trim();
  if (!raw) return null;

  if (/^\d+(?:\.\d+)?$/.test(raw)) {
    const seconds = Number(raw);
    if (!Number.isFinite(seconds) || seconds < 0) return null;
    return Math.min(MAX_RETRY_AFTER_MS, Math.ceil(seconds * 1000));
  }

  const retryAt = Date.parse(raw);
  if (!Number.isFinite(retryAt)) return null;
  return Math.min(MAX_RETRY_AFTER_MS, Math.max(0, retryAt - now));
}

export function providerCooldownDurationMs(
  failureClass: ProviderFailureClass,
  retryAfterMs?: number | null
): number {
  if (failureClass === "rate_limited" && retryAfterMs != null) {
    return Math.max(0, Math.min(MAX_RETRY_AFTER_MS, retryAfterMs));
  }
  return DEFAULT_COOLDOWN_MS[failureClass];
}

export function classifyProviderHttpStatus(status: number): ProviderFailureClass {
  if (status === 429) return "rate_limited";
  if (status === 404) return "model_not_found";
  if (status === 401 || status === 403) return "auth_error";
  if (status === 408) return "timeout";
  if (status >= 500 && status <= 599) return "server_error";
  return "provider_error";
}

export function classifyProviderError(error: unknown): ProviderFailureClass {
  const value = error as { name?: unknown; message?: unknown; status?: unknown; statusCode?: unknown; code?: unknown } | null;
  const status = Number(value?.status ?? value?.statusCode ?? value?.code);
  if (Number.isInteger(status) && status >= 400 && status <= 599) {
    return classifyProviderHttpStatus(status);
  }
  const name = String(value?.name || "").toLowerCase();
  const message = String(value?.message || error || "").toLowerCase();
  if (name === "aborterror" || name === "timeouterror" || /timed?\s*out|timeout|aborted/.test(message)) {
    return "timeout";
  }
  if (name === "syntaxerror" || /json|unexpected token|parse error|empty response|invalid response/.test(message)) {
    return "invalid_response";
  }
  return "network_error";
}

function parseRecord(value: unknown): Omit<ProviderCooldownRecord, "cooldownUntil"> | null {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value as any;
    if (
      parsed &&
      (parsed.provider === "groq" || parsed.provider === "gemini" || parsed.provider === "workers_ai" || parsed.provider === "abstract") &&
      typeof parsed.model === "string" &&
      typeof parsed.failureClass === "string" &&
      Number.isFinite(Number(parsed.recordedAt))
    ) {
      return {
        provider: parsed.provider,
        model: parsed.model,
        failureClass: parsed.failureClass as ProviderFailureClass,
        status: Number.isFinite(Number(parsed.status)) ? Number(parsed.status) : null,
        recordedAt: Number(parsed.recordedAt),
        retryAfterMs: Number.isFinite(Number(parsed.retryAfterMs)) ? Number(parsed.retryAfterMs) : null
      };
    }
  } catch {
    // Invalid cache values are ignored; no caller data is stored in this namespace.
  }
  return null;
}

export function createProviderCooldownStore() {
  const local = new Map<string, ProviderCooldownRecord>();
  const readyByDb = new WeakMap<object, Promise<void>>();

  async function ensureCacheTable(db: ProviderCooldownDatabase): Promise<void> {
    const key = db as object;
    let ready = readyByDb.get(key);
    if (!ready) {
      ready = (async () => {
        await db.prepare("CREATE TABLE IF NOT EXISTS radar_cache (key TEXT PRIMARY KEY, value TEXT NOT NULL, expires_at INTEGER NOT NULL)").bind().run();
        await db.prepare("CREATE INDEX IF NOT EXISTS idx_radar_cache_exp ON radar_cache(expires_at)").bind().run();
      })();
      readyByDb.set(key, ready);
      ready.catch(() => readyByDb.delete(key));
    }
    await ready;
  }

  async function getCooldown(
    db: ProviderCooldownDatabase,
    provider: AIProviderName,
    model: string,
    now = Date.now()
  ): Promise<ProviderCooldownRecord | null> {
    const key = providerCooldownKey(provider, model);
    const localRecord = local.get(key);
    const localActive = localRecord && localRecord.cooldownUntil > now ? localRecord : null;

    try {
      await ensureCacheTable(db);
      const row = await db.prepare(
        "SELECT value, expires_at FROM radar_cache WHERE key = ? LIMIT 1"
      ).bind(key).first<{ value?: string; expires_at?: number }>();
      const expiresAt = Number(row?.expires_at || 0);
      if (row && expiresAt > now) {
        const parsed = parseRecord(row.value);
        if (parsed) {
          const shared: ProviderCooldownRecord = { ...parsed, cooldownUntil: expiresAt };
          const effective = localActive && localActive.cooldownUntil > shared.cooldownUntil
            ? localActive
            : shared;
          local.set(key, effective);
          return effective;
        }
      }
    } catch {
      // If D1 is temporarily unavailable, the isolate-local copy still prevents a tight retry loop.
    }

    if (localActive) return localActive;
    if (localRecord) local.delete(key);
    return null;
  }

  async function recordFailure(
    db: ProviderCooldownDatabase,
    provider: AIProviderName,
    model: string,
    input: ProviderFailureInput
  ): Promise<ProviderCooldownRecord | null> {
    const now = input.now ?? Date.now();
    const retryAfterMs = input.failureClass === "rate_limited"
      ? parseRetryAfterMs(input.retryAfter, now)
      : null;
    const durationMs = providerCooldownDurationMs(input.failureClass, retryAfterMs);
    if (durationMs <= 0) return null;

    const key = providerCooldownKey(provider, model);
    const prior = local.get(key);
    const cooldownUntil = Math.max(
      now + durationMs,
      prior && prior.cooldownUntil > now ? prior.cooldownUntil : 0
    );
    const record: ProviderCooldownRecord = {
      provider,
      model,
      failureClass: input.failureClass,
      status: input.status ?? null,
      recordedAt: now,
      cooldownUntil,
      retryAfterMs
    };
    local.set(key, record);

    try {
      await ensureCacheTable(db);
      const serialized = JSON.stringify({
        provider: record.provider,
        model: record.model,
        failureClass: record.failureClass,
        status: record.status,
        recordedAt: record.recordedAt,
        retryAfterMs: record.retryAfterMs
      });
      await db.prepare(`
        INSERT INTO radar_cache (key, value, expires_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          expires_at = MAX(radar_cache.expires_at, excluded.expires_at)
      `).bind(key, serialized, cooldownUntil).run();
    } catch {
      // Shared persistence is preferred; the isolate-local guard remains active as a fallback.
    }
    return record;
  }

  return { getCooldown, recordFailure };
}

const providerCooldownStore = createProviderCooldownStore();

export const getProviderCooldown = providerCooldownStore.getCooldown;
export const recordProviderCooldownFailure = providerCooldownStore.recordFailure;
