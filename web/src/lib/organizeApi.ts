import { httpsCallable, FunctionsError } from "firebase/functions";
import { functions } from "./firebase";
import type { OrganizeResult } from "./types";

const organizeCallable = httpsCallable<{ title: string; html: string }, OrganizeResult, { type: string }>(
  functions, "organize", { timeout: 300_000 }, // it checks facts on the web before writing
);

/** "정리하기": tidies the note into rich text and checks its facts on the web, adding source links. */
export async function organizeWithAI(title: string, html: string): Promise<OrganizeResult> {
  try {
    // Streamed: the server sends a heartbeat while it works, so a call that takes over a minute
    // isn't dropped by iOS ("internal" error). The final result comes through `data`.
    const { stream, data } = await organizeCallable.stream({ title, html });
    const drain = (async () => { for await (const _ of stream) { /* heartbeat chunks, nothing to show */ } })();
    const [, result] = await Promise.all([drain, data]);
    return { ...result, sources: result.sources ?? [] };
  } catch (err) {
    // The SDK may append a status suffix like " [503]" — users don't need it.
    if (err instanceof FunctionsError) throw new Error(err.message.replace(/\s*\[\d+\]$/, ""));
    throw err;
  }
}
