import { describe, expect, it } from "vitest";
import { renderMarkdown } from "../src/render";
import { sanitize } from "../src/sanitize";

const payloads: [string, RegExp][] = [
  ["<script>alert(1)</script>", /<script/i],
  ['<img src=x onerror="alert(1)">', /onerror/i],
  ['<a href="javascript:alert(1)">x</a>', /javascript:/i],
  // markdown-it refuses the link and leaves the text, which is harmless: what matters is that no anchor exists.
  ["[x](javascript:alert(1))", /<a\s/i],
  ["[x](JaVaScRiPt:alert(1))", /<a\s/i],
  ['<svg onload="alert(1)"></svg>', /<svg|onload/i],
  ['<iframe src="https://evil.example"></iframe>', /<iframe/i],
  ['<object data="x"></object><embed src="x">', /<object|<embed/i],
  ['<form action="https://evil.example"><input name="pw"><button>go</button></form>', /<form|<button|name="pw"/i],
  ['<input type="text" value="phish">', /<input/i],
  ['<div style="position:fixed;inset:0">cover</div>', /style=/i],
  ["<style>body{display:none}</style>", /<style/i],
  ['<meta http-equiv="refresh" content="0;url=https://evil.example">', /<meta/i],
  ['<base href="https://evil.example/">', /<base/i],
  ['<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>', /data:text\/html/i],
  ['<math><mi xlink:href="javascript:alert(1)">x</mi></math>', /<math|javascript:/i],
  ['<details open ontoggle="alert(1)">x</details>', /ontoggle/i],
];

describe("sanitize", () => {
  it.each(payloads)("neutralises %s", (payload, bad) => {
    for (const flavour of ["commonmark", "gfm", "extended"] as const) {
      expect(renderMarkdown(payload, flavour).html).not.toMatch(bad);
    }
  });

  it("keeps ordinary formatting", () => {
    const html = sanitize("<p>hi <b>there</b> <a href='https://example.com'>link</a></p>");
    expect(html).toContain("<b>there</b>");
    expect(html).toContain("https://example.com");
  });

  it("opens external links in a new tab without opener access", () => {
    const html = sanitize('<a href="https://example.com">x</a>');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("leaves in-page links alone", () => {
    expect(sanitize('<a href="#fn1">x</a>')).not.toContain("_blank");
  });

  it("keeps task list checkboxes but forces them disabled", () => {
    const html = sanitize('<input type="checkbox" checked>');
    expect(html).toContain("checkbox");
    expect(html).toContain("disabled");
  });

  it("allows https images and image data URIs", () => {
    expect(sanitize('<img src="https://example.com/a.png" alt="a">')).toContain("https://example.com/a.png");
    expect(sanitize('<img src="data:image/png;base64,AAAA" alt="a">')).toContain("data:image/png");
  });
});
