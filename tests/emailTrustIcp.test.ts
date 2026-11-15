import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  sanitizeEmail,
  assessEmailTrust,
  isOffIcpName,
  isCategoryNameMismatch,
  outreachQualityBlocked,
} from "../src/emailSanitizer";

describe("email trust", () => {
  it("rejects example@mail.com as placeholder", () => {
    const r = sanitizeEmail("example@mail.com");
    assert.equal(r.valid, false);
    assert.equal(r.reason, "placeholder_email");
    const t = assessEmailTrust("example@mail.com");
    assert.equal(t.level, "rejected");
    assert.equal(t.outreachEligible, false);
  });

  it("accepts plausible business email at syntax layer only", () => {
    const t = assessEmailTrust("office@jameslewiselectrical.ca");
    assert.equal(t.outreachEligible, true);
    assert.equal(t.level, "syntax_ok");
  });

  it("upgrades to business_aligned when domain matches website", () => {
    const t = assessEmailTrust("hello@acmeplumbing.com", {
      websiteHost: "www.acmeplumbing.com",
      mxOk: true,
    });
    assert.equal(t.level, "business_aligned");
  });
});

describe("ICP / category coherence", () => {
  it("flags East York Minor Soccer Club as non-business", () => {
    assert.equal(isOffIcpName("East York Minor Soccer Club"), true);
  });

  it("flags restaurant labeled as landscaping", () => {
    assert.equal(isCategoryNameMismatch("Sun Garden Chinese", "landscaping"), true);
    assert.equal(isOffIcpName("Sun Garden Chinese", false, "landscaping"), true);
  });

  it("flags wholesale lighting as contractor mismatch", () => {
    assert.equal(
      isCategoryNameMismatch("Prestige Lighting", "electrical contractor"),
      true
    );
  });

  it("allows genuine electrical contractor", () => {
    assert.equal(isOffIcpName("James Lewis Electrical", false, "electrician"), false);
  });

  it("outreach quality blocks bad ICP even with high score context", () => {
    const gate = outreachQualityBlocked({
      name: "East York Minor Soccer Club",
      categoryOrTrade: "services",
      email: "info@eastyorksoccer.ca",
    });
    assert.equal(gate.blocked, true);
    assert.ok(gate.reasons.includes("off_icp_or_category_mismatch"));
  });
});
