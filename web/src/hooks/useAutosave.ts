import { useCallback, useEffect, useRef, useState } from "react";

export type SaveStatus = "saved" | "dirty" | "saving" | "error";

const RETRY_MAX_MS = 30_000;

/**
 * Evernote-style autosave: `schedule()` after every edit, the save runs once
 * edits pause for `delay` ms. `flush()` saves immediately and resolves to
 * whether everything is persisted. Failed saves retry with backoff.
 */
export function useAutosave(save: () => Promise<void>, delay = 800) {
  const saveRef = useRef(save);
  saveRef.current = save;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false);
  const inFlight = useRef<Promise<boolean> | null>(null);
  const retryMs = useRef(0);
  const [status, setStatus] = useState<SaveStatus>("saved");

  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const flush = useCallback(async (): Promise<boolean> => {
    clearTimer();
    // Saves run one at a time, so an older save can never land after a newer one.
    if (inFlight.current) await inFlight.current;
    if (!dirty.current) return true;
    dirty.current = false;
    setStatus("saving");
    const run = (async () => {
      try {
        await saveRef.current();
        retryMs.current = 0;
        setStatus(dirty.current ? "dirty" : "saved");
        return true;
      } catch (err) {
        console.error(err);
        dirty.current = true;
        setStatus("error");
        retryMs.current = Math.min(RETRY_MAX_MS, retryMs.current ? retryMs.current * 2 : 2000);
        timer.current = setTimeout(() => void flush(), retryMs.current);
        return false;
      }
    })();
    inFlight.current = run;
    try { return await run; } finally { if (inFlight.current === run) inFlight.current = null; }
  }, []);

  const schedule = useCallback(() => {
    dirty.current = true;
    setStatus("dirty");
    clearTimer();
    timer.current = setTimeout(() => void flush(), delay);
  }, [delay, flush]);

  /** Drop unsaved edits (the note is being deleted). */
  const discard = useCallback(() => {
    clearTimer();
    dirty.current = false;
  }, []);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirty.current && !inFlight.current) return;
      void flush();
      // An async write may not finish while the page unloads: ask the browser to confirm.
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      void flush();
    };
  }, [flush]);

  return { status, schedule, flush, discard };
}
