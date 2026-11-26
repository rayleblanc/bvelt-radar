import test from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { normalizeResendDeliveryEvent, resolveAmbiguousResendBounce, shouldApplyResendProspectEvent, shouldBlockBulkResendBounceRetry, verifySvixWebhookSignature } from "../src/resendWebhookSecurity";

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

test("bulk Resend bounce retry requests are blocked until each recipient has event-level evidence", () => {
  assert.equal(shouldBlockBulkResendBounceRetry(true), true);
  assert.equal(shouldBlockBulkResendBounceRetry("true"), true);
  assert.equal(shouldBlockBulkResendBounceRetry(" TRUE "), true);
  assert.equal(shouldBlockBulkResendBounceRetry(false), false);
  assert.equal(shouldBlockBulkResendBounceRetry(undefined), false);
});


test("automated approve queue never records human send authorization", () => {
  const workerSource = readFileSync(new URL("../src/worker.ts", import.meta.url), "utf8");
  const start = workerSource.indexOf("async function handleApproveJob");
  const end = workerSource.indexOf("async function handleOutreachJob", start);
  assert.ok(start >= 0 && end > start, "approve and outreach handlers must remain discoverable");
  const handler = workerSource.slice(start, end);
  assert.doesNotMatch(handler, /UPDATE prospects SET status = 'approved'/);
  assert.doesNotMatch(handler, /message_send_authorized|telegram_human_approval/);
  assert.match(handler, /await enqueueJob\(env/);
});

test("send authorization remains behind explicit owner confirmation", () => {
  const workerSource = readFileSync(new URL("../src/worker.ts", import.meta.url), "utf8");
  const start = workerSource.indexOf("async function handleDecision");
  assert.ok(start >= 0, "manual decision handler must exist");
  const handler = workerSource.slice(start, start + 24000);
  const ownerGuard = handler.indexOf("if (!ownerManualApprovalAsserted)");
  const authorization = handler.indexOf('authorization: "explicit_user_action"');
  assert.ok(ownerGuard >= 0, "manual send must require owner confirmation");
  assert.ok(authorization > ownerGuard, "authorization event must follow the owner confirmation guard");
});


test("Resend delivery callbacks cannot regress later delivery or owner states", () => {
  assert.equal(shouldApplyResendProspectEvent("opened", "opened", "delivered"), false);
  assert.equal(shouldApplyResendProspectEvent("clicked", "clicked", "opened"), false);
  assert.equal(shouldApplyResendProspectEvent("delivered", "delivered", "delivery_delayed"), false);
  assert.equal(shouldApplyResendProspectEvent("hold", "delivery_delayed", "delivered"), true);
  assert.equal(shouldApplyResendProspectEvent("sent", "sent", "delivered"), true);
  assert.equal(shouldApplyResendProspectEvent("delivered", "delivered", "opened"), true);
  assert.equal(shouldApplyResendProspectEvent("human_review", "positive", "delivered"), false);
  assert.equal(shouldApplyResendProspectEvent("bounced", "bounced", "delivered"), false);
  assert.equal(shouldApplyResendProspectEvent("suppressed", "complained", "opened"), false);
  assert.equal(shouldApplyResendProspectEvent("delivered", "delivered", "complained"), true);
  assert.equal(shouldApplyResendProspectEvent("delivered", "delivered", "unsubscribe"), true);
});


test("Resend webhook resolves targets only through tenant-scoped dispatch receipts", () => {
  const workerSource = readFileSync(new URL("../src/worker.ts", import.meta.url), "utf8");
  const start = workerSource.indexOf("export async function handleProspectEvent");
  const end = workerSource.indexOf("\nasync function handleReplyEventJob", start);
  assert.ok(start >= 0 && end > start, "provider event handler must exist");
  const handler = workerSource.slice(start, end);
  assert.match(handler, /params\.provider_source === "resend"/);
  assert.match(handler, /WHERE message_id = \? AND lower\(provider\) = 'resend'/);
  assert.match(handler, /COALESCE\(tenant_id,'founder'\) = \?/);
  assert.match(handler, /Ambiguous provider target ignored/);
  assert.match(handler, /Provider recipient does not match dispatch receipt/);
});
