import { useDeferredValue, useMemo, useRef } from "react";
import { excerpt } from "../lib/sanitize";
import type { Note } from "../lib/types";

/**
 * Search over title + plain text (not raw HTML, which would match tag names like
 * "strong"). Each note's text is extracted once per version and cached, and the
 * query is deferred so typing stays responsive with many notes.
 */
export function useNoteSearch(notes: Note[], query: string) {
  const cache = useRef(new Map<string, { updatedAt: number; text: string }>());
  const deferred = useDeferredValue(query.trim().toLowerCase());

  const index = useMemo(() => {
    const next = new Map<string, { updatedAt: number; text: string }>();
    for (const n of notes) {
      const hit = cache.current.get(n.id);
      next.set(n.id, hit && hit.updatedAt === n.updatedAt
        ? hit
        : { updatedAt: n.updatedAt, text: `${n.title}\n${n.tags.join(" ")}\n${excerpt(n.contentHtml, Infinity)}`.toLowerCase() });
    }
    cache.current = next; // drops deleted notes
    return next;
  }, [notes]);

  return useMemo(() => {
    if (!deferred) return () => true;
    return (n: Note) => index.get(n.id)?.text.includes(deferred) ?? false;
  }, [index, deferred]);
}
