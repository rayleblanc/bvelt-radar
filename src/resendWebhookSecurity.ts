export type ResendDeliveryEvent = "opened" | "clicked" | "bounced" | "delivery_delayed" | "failed" | "suppressed" | "delivered" | "complained" | "replied" | null;

/** Map provider event semantics without promoting unknown bounce subtypes to permanent suppression. */
export function normalizeResendDeliveryEvent(type: unknown, bounceType?: unknown): ResendDeliveryEvent {
  const event = String(type || "").trim().toLowerCase();
  if (event === "email.opened" || event.endsWith(".opened")) return "opened";
  if (event === "email.clicked" || event.endsWith(".clicked")) return "clicked";
  if (event === "email.bounced" || event.endsWith(".bounced")) {
    return String(bounceType || "").trim().toLowerCase() === "permanent" ? "bounced" : "delivery_delayed";
  }
  if (event === "email.delivery_delayed" || event.endsWith(".delivery_delayed")) return "delivery_delayed";
  if (event === "email.failed" || event.endsWith(".failed")) return "failed";
  if (event === "email.suppressed" || event.endsWith(".suppressed")) return "suppressed";
  if (event === "email.delivered" || event.endsWith(".delivered")) return "delivered";
  if (event === "email.complained" || event.endsWith(".complained")) return "complained";
  if (event === "email.received" || event.endsWith(".received") || event === "email.incoming") return "replied";
  return null;
}

/** Verify Svix v1 signature over the exact raw request body. */
export async function verifySvixWebhookSignature(
  rawBody: string,
  headers: Headers,
  signingSecret: string,
  nowMs = Date.now(),
  toleranceSeconds = 300
): Promise<boolean> {
  try {
    const id = headers.get("svix-id") || "";
    const timestamp = headers.get("svix-timestamp") || "";
    const signatureHeader = headers.get("svix-signature") || "";
    const secret = String(signingSecret || "").trim();
    if (!id || !timestamp || !signatureHeader || !secret) return false;

    const timestampSeconds = Number(timestamp);
    if (!Number.isFinite(timestampSeconds) || Math.abs(nowMs / 1000 - timestampSeconds) > toleranceSeconds) return false;

    const encodedSecret = secret.startsWith("whsec_") ? secret.slice(6) : secret;
    const secretBytes = Uint8Array.from(atob(encodedSecret), (character) => character.charCodeAt(0));
    const key = await crypto.subtle.importKey(
      "raw",
      secretBytes,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const signedContent = new TextEncoder().encode(`${id}.${timestamp}.${rawBody}`);
    const candidates = signatureHeader.split(" ").map((part) => part.trim()).filter(Boolean);
    for (const candidate of candidates) {
      const [version, encodedSignature] = candidate.split(",", 2);
      if (version !== "v1" || !encodedSignature) continue;
      const signature = Uint8Array.from(atob(encodedSignature), (character) => character.charCodeAt(0));
      if (await crypto.subtle.verify("HMAC", key, signature, signedContent)) return true;
    }
    return false;
  } catch {
    return false;
  }
}
