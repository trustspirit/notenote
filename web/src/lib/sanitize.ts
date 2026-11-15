import DOMPurify from "dompurify";

// Links that open a new tab must not hand the opener (or the reader's URL) to the target.
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A" && node.getAttribute("target")) node.setAttribute("rel", "noopener noreferrer");
});

/**
 * Shared notes are authored by other people — always sanitize before rendering.
 * The editor never produces images, so <img> is dropped: in a crafted mirror doc it
 * would only serve as a tracking pixel. `class` is dropped so shared HTML can't
 * borrow the app's own UI styles.
 */
export function sanitizeNoteHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["style", "form", "input", "iframe", "img", "picture", "video", "audio", "source"],
    FORBID_ATTR: ["style", "class"],
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
