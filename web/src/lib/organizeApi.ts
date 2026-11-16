import { httpsCallable, FunctionsError } from "firebase/functions";
import { functions } from "./firebase";
import type { OrganizeResult } from "./types";

const organizeCallable = httpsCallable<{ title: string; html: string }, OrganizeResult>(
  functions, "organize", { timeout: 300_000 }, // it checks facts on the web before writing
);

/** "정리하기": tidies the note into rich text and checks its facts on the web, adding source links. */
export async function organizeWithAI(title: string, html: string): Promise<OrganizeResult> {
  try {
    const { data } = await organizeCallable({ title, html });
    return { ...data, sources: data.sources ?? [] };
  } catch (err) {
    // The SDK may append a status suffix like " [503]" — users don't need it.
    if (err instanceof FunctionsError) throw new Error(err.message.replace(/\s*\[\d+\]$/, ""));
    throw err;
  }
}
