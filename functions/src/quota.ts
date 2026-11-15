import type { Firestore } from "firebase-admin/firestore";

export interface Usage { day: string; count: number }

/** UTC day key, e.g. "2026-11-15". */
export function dayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** Pure quota step: resets on a new day, refuses once `limit` is reached. */
export function nextUsage(prev: Usage | undefined, today: string, limit: number) {
  const count = prev?.day === today ? prev.count : 0;
  if (count >= limit) return { allowed: false as const, usage: { day: today, count } };
  return { allowed: true as const, usage: { day: today, count: count + 1 } };
}

/**
 * Atomically counts one AI call for `uid` in `usage/{uid}`.
 * The `usage` collection has no client rules, so only the server can touch it.
 */
export async function consumeDailyQuota(db: Firestore, uid: string, limit: number, now = new Date()) {
  const ref = db.collection("usage").doc(uid);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const step = nextUsage(snap.data() as Usage | undefined, dayKey(now), limit);
    if (step.allowed) tx.set(ref, step.usage);
    return step;
  });
}

/** Empty allowlist = everyone signed in may use AI. */
export function isAllowed(email: string | undefined, allowlist: string): boolean {
  const list = allowlist.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (list.length === 0) return true;
  return !!email && list.includes(email.toLowerCase());
}
