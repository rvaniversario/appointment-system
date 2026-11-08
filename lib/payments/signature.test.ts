import { describe, expect, it } from "vitest";
import { signPaymongoPayload, verifyPaymongoSignature } from "./signature";

const secret = "whsk_test_secret";
const body = JSON.stringify({ data: { id: "evt_1", attributes: { type: "checkout_session.payment.paid" } } });
const now = 1_800_000_000;

describe("verifyPaymongoSignature", () => {
  it("accepts a valid test-mode signature", () => {
    const header = signPaymongoPayload(body, secret, now, false);
    expect(verifyPaymongoSignature({ header, rawBody: body, secret, livemode: false, nowSeconds: now })).toBe(true);
  });

  it("checks the live signature in live mode, not the test one", () => {
    const live = signPaymongoPayload(body, secret, now, true);
    const test = signPaymongoPayload(body, secret, now, false);
    expect(verifyPaymongoSignature({ header: live, rawBody: body, secret, livemode: true, nowSeconds: now })).toBe(true);
    expect(verifyPaymongoSignature({ header: test, rawBody: body, secret, livemode: true, nowSeconds: now })).toBe(false);
  });

  it("rejects a changed body, a wrong secret, and a missing header", () => {
    const header = signPaymongoPayload(body, secret, now, false);
    expect(verifyPaymongoSignature({ header, rawBody: body + " ", secret, livemode: false, nowSeconds: now })).toBe(false);
    expect(verifyPaymongoSignature({ header, rawBody: body, secret: "other", livemode: false, nowSeconds: now })).toBe(false);
    expect(verifyPaymongoSignature({ header: null, rawBody: body, secret, livemode: false, nowSeconds: now })).toBe(false);
    expect(verifyPaymongoSignature({ header: "garbage", rawBody: body, secret, livemode: false, nowSeconds: now })).toBe(false);
  });

  it("rejects old signatures, to limit replays", () => {
    const header = signPaymongoPayload(body, secret, now - 600, false);
    expect(verifyPaymongoSignature({ header, rawBody: body, secret, livemode: false, nowSeconds: now })).toBe(false);
  });
});
