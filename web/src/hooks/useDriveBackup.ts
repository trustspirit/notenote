import type { User } from "firebase/auth";
import { useCallback, useEffect, useRef, useState } from "react";
import { DriveAuthError, DriveClient } from "../lib/backup/driveClient";
import { googleClientId, preloadGis, requestDriveToken, revokeDriveToken, type DriveToken } from "../lib/backup/googleToken";
import { runBackup } from "../lib/backup/runBackup";
import type { Note, Notebook } from "../lib/types";

export type BackupState =
  | { kind: "unavailable" }          // no OAuth client configured (e.g. emulator)
  | { kind: "off" }
  | { kind: "reconnect" }            // enabled, but the 1-hour token is gone
  | { kind: "syncing" }
  | { kind: "synced"; at: number }
  | { kind: "error"; message: string };

interface Saved { rootFolderId?: string; lastSyncedAt?: number }

/** Edits come in bursts (autosave every ~1s while typing); back up once they settle. */
const AUTO_DELAY_MS = 5000;

// The "backup is on" flag is a per-device preference; losing it just means reconnecting.
const storageKey = (uid: string) => `pensieve.driveBackup.${uid}`;
function readSaved(uid: string): Saved | null {
  try { const raw = localStorage.getItem(storageKey(uid)); return raw ? JSON.parse(raw) as Saved : null; } catch { return null; }
}
function writeSaved(uid: string, v: Saved | null) {
  try { if (v) localStorage.setItem(storageKey(uid), JSON.stringify(v)); else localStorage.removeItem(storageKey(uid)); } catch { /* ignore */ }
}

/**
 * One-way backup of every note to the user's Google Drive as Markdown.
 * Firestore stays the source of truth; Drive gets a readable copy.
 */
export function useDriveBackup(user: User, notes: Note[], notebooks: Notebook[], ready: boolean) {
  const [saved, setSaved] = useState<Saved | null>(() => readSaved(user.uid));
  const [state, setState] = useState<BackupState>(() =>
    !googleClientId ? { kind: "unavailable" } : saved ? { kind: "reconnect" } : { kind: "off" });
  const token = useRef<DriveToken | null>(null);
  const latest = useRef({ notes, notebooks });
  latest.current = { notes, notebooks };
  const running = useRef(false);
  const again = useRef(false);
  // Bumped by disconnect(): results of a sync started before it are dropped.
  const generation = useRef(0);
  const enabled = saved !== null;
  const hasFreshToken = () => !!token.current && Date.now() < token.current.expiresAt;

  useEffect(preloadGis, []);

  const persist = useCallback((v: Saved | null) => { setSaved(v); writeSaved(user.uid, v); }, [user.uid]);

  const sync = useCallback(async () => {
    if (running.current) { again.current = true; return; }
    const t = token.current;
    if (!t || !hasFreshToken()) { token.current = null; setState({ kind: "reconnect" }); return; }
    const gen = generation.current;
    running.current = true;
    setState({ kind: "syncing" });
    try {
      const { notes: n, notebooks: nb } = latest.current;
      const res = await runBackup(new DriveClient(t.value), n, nb);
      if (gen !== generation.current) return; // disconnected meanwhile
      const at = Date.now();
      persist({ rootFolderId: res.rootFolderId, lastSyncedAt: at });
      setState({ kind: "synced", at });
    } catch (err) {
      if (gen !== generation.current) return;
      if (err instanceof DriveAuthError) { token.current = null; setState({ kind: "reconnect" }); }
      else setState({ kind: "error", message: err instanceof Error ? err.message : "백업하지 못했어요." });
    } finally {
      running.current = false;
      if (again.current && gen === generation.current) { again.current = false; void sync(); }
    }
  }, [persist]);

  // Auto backup after edits settle, while connected. Keyed on `enabled`, not on
  // `saved`: every sync rewrites `saved`, which would otherwise schedule the next sync forever.
  useEffect(() => {
    if (!ready || !enabled || !token.current) return;
    const timer = setTimeout(() => void sync(), AUTO_DELAY_MS);
    return () => clearTimeout(timer);
  }, [notes, notebooks, ready, enabled, sync]);

  /** Call from a click: may open Google's consent popup. */
  const connect = useCallback(async () => {
    try {
      token.current = await requestDriveToken(user.email ?? undefined);
      if (!readSaved(user.uid)) persist({});
      await sync();
    } catch (err) {
      setState({ kind: "error", message: err instanceof Error ? err.message : "연결하지 못했어요." });
    }
  }, [persist, sync, user.email, user.uid]);

  const disconnect = useCallback(() => {
    generation.current++;
    again.current = false;
    if (token.current) revokeDriveToken(token.current.value);
    token.current = null;
    persist(null);
    setState({ kind: "off" });
  }, [persist]);

  // An expired token needs the consent popup, which must open inside this click.
  const backupNow = useCallback(() => (hasFreshToken() ? sync() : connect()), [connect, sync]);

  return { state, saved, connect, disconnect, backupNow };
}
