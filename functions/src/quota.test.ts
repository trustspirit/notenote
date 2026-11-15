import { describe, expect, it } from "vitest";
import { dayKey, isAllowed, nextUsage, refundUsage } from "./quota.js";

describe("nextUsage", () => {
  it("starts counting on a fresh day", () => {
    expect(nextUsage(undefined, "2026-11-15", 3)).toEqual({ allowed: true, usage: { day: "2026-11-15", count: 1 } });
    expect(nextUsage({ day: "2026-11-14", count: 3 }, "2026-11-15", 3).allowed).toBe(true);
  });
  it("refuses at the limit", () => {
    expect(nextUsage({ day: "2026-11-15", count: 3 }, "2026-11-15", 3).allowed).toBe(false);
  });
});

describe("isAllowed", () => {
  it("allows everyone when the list is empty", () => {
    expect(isAllowed(undefined, "")).toBe(true);
  });
  it("matches emails case-insensitively", () => {
    expect(isAllowed("Me@Example.com", "me@example.com, other@x.com")).toBe(true);
    expect(isAllowed("stranger@x.com", "me@example.com")).toBe(false);
    expect(isAllowed(undefined, "me@example.com")).toBe(false);
  });
});

it("dayKey uses UTC date", () => {
  expect(dayKey(new Date("2026-11-15T23:30:00Z"))).toBe("2026-11-15");
});

describe("refundUsage", () => {
  it("gives back one call of today only", () => {
    expect(refundUsage({ day: "2026-11-15", count: 3 }, "2026-11-15")).toEqual({ day: "2026-11-15", count: 2 });
    expect(refundUsage({ day: "2026-11-14", count: 3 }, "2026-11-15")).toBeNull();
    expect(refundUsage({ day: "2026-11-15", count: 0 }, "2026-11-15")).toBeNull();
    expect(refundUsage(undefined, "2026-11-15")).toBeNull();
  });
});
