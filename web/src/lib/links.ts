/**
 * Guards against made-up links in "자료 보완" results: a link survives only if its
 * URL appeared in the model's search results or was already in the note.
 * Any other <a> is unwrapped — its text stays, the link goes.
 */

/**
 * Comparison key for a URL. Sources and links refer to the same page in slightly
 * different spellings (trailing slash, #fragment, host case, tracking params).
 */
export function urlKey(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  url.hash = "";
  for (const p of [...url.searchParams.keys()]) if (p.startsWith("utm_")) url.searchParams.delete(p);
  const path = url.pathname.replace(/\/+$/, "");
  return `${url.hostname.toLowerCase()}${path}${url.search}`;
}

/** Hrefs of every link in a note's HTML. */
export function linkHrefs(html: string): string[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return [...doc.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")!);
}

/** Unwraps every <a> whose href isn't one of `allowed` (compared by urlKey). */
export function keepKnownLinks(html: string, allowed: string[]): { html: string; removed: number } {
  const keys = new Set(allowed.map(urlKey).filter((k): k is string => k !== null));
  const doc = new DOMParser().parseFromString(html, "text/html");
  let removed = 0;
  for (const a of [...doc.querySelectorAll("a")]) {
    const key = urlKey(a.getAttribute("href") ?? "");
    if (key && keys.has(key)) continue;
    a.replaceWith(...a.childNodes);
    removed++;
  }
  return { html: doc.body.innerHTML, removed };
}
