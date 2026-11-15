// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAutosave } from "./useAutosave";

/** A save whose completion the test controls. */
function controlledSave() {
  const pending: { resolve: () => void; reject: (e: Error) => void }[] = [];
  let concurrent = 0;
  let maxConcurrent = 0;
  const save = vi.fn(() => {
    concurrent++;
    maxConcurrent = Math.max(maxConcurrent, concurrent);
    return new Promise<void>((resolve, reject) => {
      pending.push({
        resolve: () => { concurrent--; resolve(); },
        reject: (e) => { concurrent--; reject(e); },
      });
    });
  });
  return { save, pending, maxConcurrent: () => maxConcurrent };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useAutosave", () => {
  it("debounces bursts of edits into one save", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAutosave(save, 800));

    act(() => { result.current.schedule(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    act(() => { result.current.schedule(); });
    expect(result.current.status).toBe("dirty");
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(save).not.toHaveBeenCalled(); // timer restarted by the second edit

    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(save).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("saved");
  });

  it("retries a failed save with backoff and reports it through flush()", async () => {
    const save = vi.fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(undefined);
    const { result } = renderHook(() => useAutosave(save));

    act(() => { result.current.schedule(); });
    let ok: boolean | undefined;
    await act(async () => { ok = await result.current.flush(); });
    expect(ok).toBe(false);
    expect(result.current.status).toBe("error");

    await act(async () => { await vi.advanceTimersByTimeAsync(1999); });
    expect(save).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); }); // 2s: second try fails
    expect(save).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(3999); });
    expect(save).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); }); // 4s: third try succeeds
    expect(save).toHaveBeenCalledTimes(3);
    expect(result.current.status).toBe("saved");
  });

  it("never runs two saves at once; an edit during a save is saved after it", async () => {
    const c = controlledSave();
    const { result } = renderHook(() => useAutosave(c.save));

    act(() => { result.current.schedule(); });
    let first!: Promise<boolean>;
    act(() => { first = result.current.flush(); });
    await act(async () => { await Promise.resolve(); });
    expect(c.save).toHaveBeenCalledTimes(1);

    act(() => { result.current.schedule(); }); // edit while the first save is in flight
    let second!: Promise<boolean>;
    act(() => { second = result.current.flush(); });
    await act(async () => { await Promise.resolve(); });
    expect(c.save).toHaveBeenCalledTimes(1); // waits for the first

    await act(async () => { c.pending[0].resolve(); await first; });
    await act(async () => { await Promise.resolve(); });
    expect(c.save).toHaveBeenCalledTimes(2);
    await act(async () => { c.pending[1].resolve(); expect(await second).toBe(true); });
    expect(c.maxConcurrent()).toBe(1);
  });

  it("discard() drops pending edits, so unmount does not save", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result, unmount } = renderHook(() => useAutosave(save));
    act(() => { result.current.schedule(); result.current.discard(); });
    unmount();
    await act(async () => { await vi.runAllTimersAsync(); });
    expect(save).not.toHaveBeenCalled();
  });

  it("saves pending edits on unmount (switching notes)", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result, unmount } = renderHook(() => useAutosave(save));
    act(() => { result.current.schedule(); });
    unmount();
    await act(async () => { await Promise.resolve(); });
    expect(save).toHaveBeenCalledTimes(1);
  });
});
