import { useCallback, useEffect, useRef, useState } from "react";

export type SaveStatus = "saved" | "dirty" | "saving" | "error";

/**
 * Evernote-style autosave: `schedule()` after every edit, the save runs once
 * edits pause for `delay` ms. `flush()` saves immediately (used before AI
 * organize, and automatically on unmount / tab close).
 */
export function useAutosave(save: () => Promise<void>, delay = 800) {
  const saveRef = useRef(save);
  saveRef.current = save;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false);
  const [status, setStatus] = useState<SaveStatus>("saved");

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (!dirty.current) return;
    dirty.current = false;
    setStatus("saving");
    try {
      await saveRef.current();
      setStatus(dirty.current ? "dirty" : "saved");
    } catch (err) {
      console.error(err);
      dirty.current = true;
      setStatus("error");
    }
  }, []);

  const schedule = useCallback(() => {
    dirty.current = true;
    setStatus("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), delay);
  }, [delay, flush]);

  useEffect(() => {
    const onHide = () => void flush();
    window.addEventListener("beforeunload", onHide);
    return () => {
      window.removeEventListener("beforeunload", onHide);
      void flush();
    };
  }, [flush]);

  return { status, schedule, flush };
}
