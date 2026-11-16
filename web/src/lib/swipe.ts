/** Width of the revealed action button, in px. */
export const ACTION_WIDTH = 72;

export type SwipeAxis = "pending" | "horizontal" | "vertical";

/** Decide whether a touch is a horizontal swipe or a vertical scroll once it moves past `slop` px. */
export function lockAxis(dx: number, dy: number, slop = 8): SwipeAxis {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < slop) return "pending";
  return Math.abs(dx) > Math.abs(dy) ? "horizontal" : "vertical";
}

/** Row translateX for a drag of `dx`, clamped to [-ACTION_WIDTH, 0]. */
export function swipeOffset(startOpen: boolean, dx: number): number {
  const base = startOpen ? -ACTION_WIDTH : 0;
  return Math.min(0, Math.max(-ACTION_WIDTH, base + dx));
}

/** Whether a released row should settle open (dragged past 40% of the button). */
export function settleOpen(offset: number): boolean {
  return offset <= -ACTION_WIDTH * 0.4;
}
