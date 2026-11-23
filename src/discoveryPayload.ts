export function validateDiscoveryPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return "payload must be an object";
  }
  const value = payload as Record<string, unknown>;
  if (typeof value.city !== "string" || !value.city.trim()) {
    return "city is required";
  }
  if (typeof value.trade !== "string" || !value.trade.trim()) {
    return "trade is required";
  }
  return null;
}
