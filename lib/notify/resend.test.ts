import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { fromHeader, ResendError } = await import("./resend");

describe("fromHeader", () => {
  it("puts the firm's name in front of our address", () => {
    expect(fromHeader("Harlow & Reyes", "notifications@mail.example.com")).toBe('"Harlow & Reyes" <notifications@mail.example.com>');
  });

  it("strips characters that could break the header", () => {
    expect(fromHeader('Evil" <x@y.z>\r\nBcc: a@b.c', "n@m.example")).toBe('"Evil x@y.z Bcc: a@b.c" <n@m.example>');
  });

  it("falls back to the bare address", () => {
    expect(fromHeader(' "<>" ', "n@m.example")).toBe("n@m.example");
  });
});

describe("ResendError.retryable", () => {
  it("retries rate limits, server errors and network failures only", () => {
    expect(new ResendError(429, "").retryable).toBe(true);
    expect(new ResendError(503, "").retryable).toBe(true);
    expect(new ResendError(0, "").retryable).toBe(true);
    expect(new ResendError(422, "").retryable).toBe(false);
    expect(new ResendError(403, "").retryable).toBe(false);
  });
});
