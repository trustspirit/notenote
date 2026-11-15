import type { Firestore } from "firebase-admin/firestore";

export interface Usage { day: string; count: number }

/** UTC day key, e.g. "2026-11-15". */
export function dayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** Pure quota step: resets on a new day, refuses a call that would go past `limit`. */
export function nextUsage(prev: Usage | undefined, today: string, limit: number, units = 1) {
  const count = prev?.day === today ? prev.count : 0;
  if (count + units > limit) return { allowed: false as const, usage: { day: today, count } };
  return { allowed: true as const, usage: { day: today, count: count + units } };
}

/**
 * Atomically counts one AI call for `uid` in `usage/{uid}`.
 * The `usage` collection has no client rules, so only the server can touch it.
 */
export async function consumeDailyQuota(db: Firestore, uid: string, limit: number, units = 1, now = new Date()) {
  const ref = db.collection("usage").doc(uid);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const step = nextUsage(snap.data() as Usage | undefined, dayKey(now), limit, units);
    if (step.allowed) tx.set(ref, step.usage);
    return step;
  });
}

/** Pure refund step: gives back `units` of `today` (never below zero, never for a past day). */
export function refundUsage(prev: Usage | undefined, today: string, units = 1): Usage | null {
  if (!prev || prev.day !== today || prev.count <= 0) return null;
  return { day: today, count: Math.max(0, prev.count - units) };
}

/**
 * Gives a call back when the AI request failed before producing anything
 * (bad key, overload, outage). Refusals/truncations used tokens, so they stay counted.
 */
export async function refundDailyQuota(db: Firestore, uid: string, units = 1, now = new Date()) {
  const ref = db.collection("usage").doc(uid);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const next = refundUsage(snap.data() as Usage | undefined, dayKey(now), units);
    if (next) tx.set(ref, next);
  });
}

/** Empty allowlist = everyone signed in may use AI. */
export function isAllowed(email: string | undefined, allowlist: string): boolean {
  const list = allowlist.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (list.length === 0) return true;
  return !!email && list.includes(email.toLowerCase());
}
