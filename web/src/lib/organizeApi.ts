import { httpsCallable, FunctionsError } from "firebase/functions";
import { functions } from "./firebase";
import type { OrganizeResult } from "./types";

const organizeCallable = httpsCallable<{ title: string; html: string; research: boolean }, OrganizeResult>(
  functions, "organize", { timeout: 300_000 }, // research mode searches the web first
);

/** `research`: also check facts on the web and add source links ("자료 보완"). */
export async function organizeWithAI(title: string, html: string, research = false): Promise<OrganizeResult> {
  try {
    const { data } = await organizeCallable({ title, html, research });
    return { ...data, sources: data.sources ?? [] };
  } catch (err) {
    // The SDK may append a status suffix like " [503]" — users don't need it.
    if (err instanceof FunctionsError) throw new Error(err.message.replace(/\s*\[\d+\]$/, ""));
    throw err;
  }
}
