/**
 * Runs `work` while sending a small chunk every `intervalMs`.
 *
 * A callable that takes over a minute with no bytes on the wire gets dropped by some mobile
 * clients (iOS WebKit times out a request after 60s without data), which the Firebase SDK
 * reports as a generic "internal" error even though the server finished. Streaming a chunk
 * now and then keeps the connection alive. `send` is a no-op for clients that didn't ask for
 * a stream, and a failed send never fails the work.
 */
export async function withHeartbeat<T>(
  send: (chunk: { type: "working" }) => Promise<boolean>,
  work: () => Promise<T>,
  intervalMs = 10_000,
): Promise<T> {
  const timer = setInterval(() => { void send({ type: "working" }).catch(() => undefined); }, intervalMs);
  try {
    return await work();
  } finally {
    clearInterval(timer);
  }
}
