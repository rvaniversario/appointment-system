import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { buildAgreement } = await import("./agreement");

describe("buildAgreement", () => {
  it("states the firm's own cancellation cutoff in the standard agreement", () => {
    const text = buildAgreement({ name: "Santos Law", agreementText: null, cutoffHours: 48 }).paragraphs.join("\n");
    expect(text).toContain("Santos Law");
    expect(text).toContain("up to 48 hours in advance");
  });

  it("words a zero or one-hour cutoff naturally", () => {
    expect(buildAgreement({ name: "F", agreementText: null, cutoffHours: 0 }).paragraphs.join(" ")).toContain("at any time before it starts");
    expect(buildAgreement({ name: "F", agreementText: null, cutoffHours: 1 }).paragraphs.join(" ")).toContain("up to 1 hour in advance");
  });

  it("gives a different version when the cutoff changes, so signatures prove which text was shown", () => {
    const a = buildAgreement({ name: "F", agreementText: null, cutoffHours: 24 });
    const b = buildAgreement({ name: "F", agreementText: null, cutoffHours: 48 });
    expect(a.version).not.toBe(b.version);
  });

  it("uses the firm's own text as written, split into paragraphs", () => {
    const own = buildAgreement({ name: "F", agreementText: "First.\r\n\r\nSecond.", cutoffHours: 24 });
    expect(own.paragraphs).toEqual(["First.", "Second."]);
  });
});
