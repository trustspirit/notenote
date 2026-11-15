import DOMPurify from "dompurify";

/** Shared notes are authored by other people — always sanitize before rendering. */
export function sanitizeNoteHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["style", "form", "input", "iframe"],
    FORBID_ATTR: ["style"],
    ADD_ATTR: ["data-type", "data-checked", "target"],
  });
}

/** Plain-text excerpt for note list previews. */
export function excerpt(html: string, max = 120): string {
  // textContent glues blocks together ("<p>a</p><p>b</p>" -> "ab"), so pad block ends first.
  const spaced = html.replace(/<\/(p|li|h[1-6]|div|blockquote|pre)>|<br\s*\/?>/gi, "$& ");
  const text = new DOMParser().parseFromString(spaced, "text/html").body.textContent ?? "";
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}
