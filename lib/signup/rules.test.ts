import { describe, expect, it } from "vitest";
import { slugify, slugProblem } from "./rules";

describe("slugify", () => {
  it("turns a firm name into a page address", () => {
    expect(slugify("Santos & Reyes Law Office")).toBe("santos-reyes-law-office");
    expect(slugify("  Peñafrancia  Legal, Inc. ")).toBe("penafrancia-legal-inc");
  });

  it("keeps addresses short without a trailing hyphen", () => {
    const slug = slugify("A Very Long Law Office Name That Goes On And On Forever");
    expect(slug.length).toBeLessThanOrEqual(40);
    expect(slug.endsWith("-")).toBe(false);
  });
});

describe("slugProblem", () => {
  it("accepts ordinary addresses", () => {
    expect(slugProblem("santos-law")).toBeNull();
  });

  it("rejects short, malformed and reserved ones", () => {
    expect(slugProblem("ab")).toMatch(/at least 3/);
    expect(slugProblem("santos--law")).toMatch(/single hyphens/);
    expect(slugProblem("Santos")).toMatch(/lowercase/);
    expect(slugProblem("admin")).toMatch(/reserved/);
    expect(slugProblem("supreme-court")).toMatch(/reserved/);
  });
});
