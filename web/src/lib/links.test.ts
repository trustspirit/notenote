// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { keepKnownLinks, linkHrefs, openableHref, urlKey } from "./links";

describe("urlKey", () => {
  it("ignores trailing slash, fragment, host case and utm params", () => {
    expect(urlKey("https://Example.org/talk/?utm_source=x#p3")).toBe(urlKey("https://example.org/talk"));
  });
  it("keeps meaningful query params", () => {
    expect(urlKey("https://example.org/t?lang=kor")).not.toBe(urlKey("https://example.org/t?lang=eng"));
  });
  it("rejects non-http links", () => {
    expect(urlKey("javascript:alert(1)")).toBeNull();
    expect(urlKey("not a url")).toBeNull();
  });
});

describe("keepKnownLinks", () => {
  const sources = ["https://example.org/talk"];

  it("keeps links to sources, unwraps the rest but keeps their text", () => {
    const html = '<p><a href="https://example.org/talk/">말씀</a> 그리고 <a href="https://made.up/x">추측</a></p>';
    const out = keepKnownLinks(html, sources);
    expect(out.removed).toBe(1);
    expect(out.html).toBe('<p><a href="https://example.org/talk/">말씀</a> 그리고 추측</p>');
  });

  it("unwraps links without a usable href", () => {
    expect(keepKnownLinks('<p><a>x</a><a href="javascript:x">y</a></p>', sources).html).toBe("<p>xy</p>");
  });

  it("keeps links the author already had", () => {
    const original = '<p><a href="https://my.blog/post">내 글</a></p>';
    const out = keepKnownLinks(original, [...sources, ...linkHrefs(original)]);
    expect(out.removed).toBe(0);
  });
});

describe("openableHref", () => {
  it("allows http, https and mailto links as written", () => {
    expect(openableHref("https://example.org/a?b=1")).toBe("https://example.org/a?b=1");
    expect(openableHref("http://example.org")).toBe("http://example.org");
    expect(openableHref("mailto:a@b.co")).toBe("mailto:a@b.co");
  });
  it("adds https:// to a bare domain the author typed", () => {
    expect(openableHref("example.org/talk")).toBe("https://example.org/talk");
  });
  it("refuses script and data schemes, and empty values", () => {
    expect(openableHref("javascript:alert(1)")).toBeNull();
    expect(openableHref("data:text/html,<b>x</b>")).toBeNull();
    expect(openableHref("  ")).toBeNull();
    expect(openableHref(undefined)).toBeNull();
  });
});
