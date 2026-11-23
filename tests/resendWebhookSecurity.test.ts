import test from "node:test";
import assert from "node:assert/strict";
import { normalizeResendDeliveryEvent, resolveAmbiguousResendBounce, verifySvixWebhookSignature } from "../src/resendWebhookSecurity";

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

test("Resend bounce subtype is conservative and only permanent is a hard bounce", () => {
  assert.equal(normalizeResendDeliveryEvent("email.bounced", "Permanent"), "bounced");
  assert.equal(normalizeResendDeliveryEvent("email.bounced", "Transient"), "delivery_delayed");
  assert.equal(normalizeResendDeliveryEvent("email.bounced", undefined), "delivery_delayed");
  assert.equal(normalizeResendDeliveryEvent("email.complained"), "complained");
  assert.equal(normalizeResendDeliveryEvent("email.future_event"), null);
});

test("Svix signature validates exact raw body and rejects tampering", async () => {
  const rawBody = JSON.stringify({ type: "email.delivered", data: { email_id: "email-1" } });
  const id = "evt_123";
  const timestamp = String(Math.floor(Date.now() / 1000));
  const secretBytes = new TextEncoder().encode("local-test-signing-secret");
  const secret = "whsec_" + toBase64(secretBytes);
  const key = await crypto.subtle.importKey(
    "raw",
    secretBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signed = new TextEncoder().encode(`${id}.${timestamp}.${rawBody}`);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, signed));
  const headers = new Headers({
    "svix-id": id,
    "svix-timestamp": timestamp,
    "svix-signature": `v1,${toBase64(signature)}`
  });

  assert.equal(await verifySvixWebhookSignature(rawBody, headers, secret), true);
  assert.equal(await verifySvixWebhookSignature(rawBody + " ", headers, secret), false);
});

test("Svix signature rejects stale timestamps and missing headers", async () => {
  const headers = new Headers({
    "svix-id": "evt_old",
    "svix-timestamp": "1",
    "svix-signature": "v1,AAAA"
  });
  assert.equal(await verifySvixWebhookSignature("{}", headers, "whsec_AA=="), false);
  assert.equal(await verifySvixWebhookSignature("{}", new Headers(), "whsec_AA=="), false);
});

test("ambiguous provider bounce preserves explicit transient event evidence", () => {
  assert.deepEqual(resolveAmbiguousResendBounce(true), {
    logStatus: "delayed",
    dispatchStatus: "delivery_delayed",
    outcome: "delivery_delayed"
  });
  assert.deepEqual(resolveAmbiguousResendBounce(false), {
    logStatus: "delivery_uncertain",
    dispatchStatus: "delivery_uncertain",
    outcome: "delivery_uncertain"
  });
});
