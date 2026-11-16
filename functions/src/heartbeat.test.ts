import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withHeartbeat } from "./heartbeat.js";

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe("withHeartbeat", () => {
  it("sends a chunk every interval while the work runs, then stops", async () => {
    const send = vi.fn().mockResolvedValue(true);
    let finish!: (v: string) => void;
    const work = new Promise<string>((resolve) => { finish = resolve; });
    const result = withHeartbeat(send, () => work, 10_000);

    await vi.advanceTimersByTimeAsync(25_000);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenCalledWith({ type: "working" });

    finish("done");
    await expect(result).resolves.toBe("done");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("stops the heartbeat and rethrows when the work fails", async () => {
    const send = vi.fn().mockResolvedValue(true);
    const result = withHeartbeat(send, () => new Promise<string>((_, reject) => setTimeout(() => reject(new Error("boom")), 15_000)), 10_000);
    const assertion = expect(result).rejects.toThrow("boom");
    await vi.advanceTimersByTimeAsync(15_000);
    await assertion;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("keeps going if a chunk can't be sent (client gone or not streaming)", async () => {
    const send = vi.fn().mockRejectedValue(new Error("closed"));
    const result = withHeartbeat(send, () => new Promise<string>((resolve) => setTimeout(() => resolve("ok"), 25_000)), 10_000);
    await vi.advanceTimersByTimeAsync(25_000);
    await expect(result).resolves.toBe("ok");
  });
});
