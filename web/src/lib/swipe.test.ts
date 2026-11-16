import { describe, expect, it } from "vitest";
import { ACTION_WIDTH, lockAxis, settleOpen, swipeOffset } from "./swipe";

describe("lockAxis", () => {
  it("stays pending below the slop", () => {
    expect(lockAxis(3, 2)).toBe("pending");
  });
  it("locks horizontal when x dominates", () => {
    expect(lockAxis(-20, 5)).toBe("horizontal");
  });
  it("locks vertical when y dominates, including mostly-vertical diagonals", () => {
    expect(lockAxis(10, -20)).toBe("vertical");
    expect(lockAxis(-15, 18)).toBe("vertical");
  });
});

describe("swipeOffset", () => {
  it("clamps to the action width when closed and dragged far left", () => {
    expect(swipeOffset(false, -200)).toBe(-ACTION_WIDTH);
  });
  it("never goes past 0 when closed and dragged right", () => {
    expect(swipeOffset(false, 30)).toBe(0);
  });
  it("starts from fully open when startOpen", () => {
    expect(swipeOffset(true, 40)).toBe(-32);
    expect(swipeOffset(true, -50)).toBe(-ACTION_WIDTH);
  });
});

describe("settleOpen", () => {
  it("opens past 40% of the action width", () => {
    expect(settleOpen(-28.8)).toBe(true);
    expect(settleOpen(-28)).toBe(false);
  });
});
