import { httpsCallable, FunctionsError } from "firebase/functions";
import { functions } from "./firebase";
import type { OrganizeResult } from "./types";

const organizeCallable = httpsCallable<{ title: string; html: string }, OrganizeResult>(
  functions, "organize", { timeout: 180_000 },
);

export async function organizeWithAI(title: string, html: string): Promise<OrganizeResult> {
  try {
    const { data } = await organizeCallable({ title, html });
    return data;
  } catch (err) {
    // The SDK may append a status suffix like " [503]" — users don't need it.
    if (err instanceof FunctionsError) throw new Error(err.message.replace(/\s*\[\d+\]$/, ""));
    throw err;
  }
}
