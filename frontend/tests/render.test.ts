import { describe, expect, it } from "vitest";
import { renderMarkdown } from "../src/render";

const render = (md: string, f: "commonmark" | "gfm" | "extended" = "gfm"): string => renderMarkdown(md, f).html;

describe("flavours", () => {
  const table = "| a | b |\n| - | - |\n| 1 | 2 |\n";

  it("commonmark does not render tables, strikethrough or task lists", () => {
    expect(render(table, "commonmark")).not.toContain("<table");
    expect(render("~~gone~~", "commonmark")).not.toContain("<s>");
    expect(render("- [x] done", "commonmark")).not.toContain("checkbox");
  });

  it("commonmark does not autolink bare URLs", () => {
    expect(render("see https://example.com now", "commonmark")).not.toContain("<a ");
  });

  it("gfm renders tables, strikethrough, task lists and autolinks", () => {
    expect(render(table)).toContain("<table");
    expect(render("~~gone~~")).toContain("<s>gone</s>");
    const tasks = render("- [x] done\n- [ ] todo");
    expect(tasks).toContain('type="checkbox"');
    expect(tasks).toContain("checked");
    expect(tasks).toContain("disabled");
    expect(render("see https://example.com now")).toContain('<a href="https://example.com"');
  });

  it("gfm renders alerts", () => {
    expect(render("> [!NOTE]\n> hello")).toContain("markdown-alert");
  });

  it("only extended has footnotes, definition lists, sub/sup, mark, abbreviations and emoji", () => {
    expect(render("text[^1]\n\n[^1]: note", "extended")).toContain("footnote");
    expect(render("text[^1]\n\n[^1]: note", "gfm")).not.toContain("footnote");
    expect(render("Term\n: Definition", "extended")).toContain("<dl>");
    expect(render("H~2~O and x^2^", "extended")).toContain("<sub>2</sub>");
    expect(render("==marked==", "extended")).toContain("<mark>marked</mark>");
    expect(render("==marked==", "gfm")).not.toContain("<mark>");
    expect(render("*[HTML]: Hyper Text\n\nHTML", "extended")).toContain("<abbr");
    expect(render(":smile:", "extended")).toContain("😄");
    expect(render("::: warning\nbe careful\n:::", "extended")).toContain('class="warning"');
  });

  it("highlights fenced code", () => {
    const html = render("```js\nconst a = 1;\n```");
    expect(html).toContain("hljs");
    expect(html).toContain("hljs-keyword");
  });

  it("leaves unknown languages as plain escaped code", () => {
    const html = render("```nosuchlang\n<b>x</b>\n```");
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
  });

  it("turns mermaid fences into placeholders in gfm and extended, but not in commonmark", () => {
    const src = "```mermaid\ngraph LR\n  A --> B\n```";
    expect(render(src)).toContain("mermaid-source");
    expect(render(src, "extended")).toContain("mermaid-source");
    expect(render(src, "commonmark")).not.toContain("mermaid-source");
  });

  it("escapes mermaid source so it cannot inject markup", () => {
    const html = render('```mermaid\ngraph LR\n  A["<img src=x onerror=alert(1)>"]\n```');
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });
});

describe("front matter", () => {
  it("shows parsed keys as a table and removes the block from the body", () => {
    const html = render("---\ntitle: Hello\ntags: [a, b]\n---\n\n# Body");
    expect(html).toContain("front-matter");
    expect(html).toContain("<th>title</th><td>Hello</td>");
    expect(html).toContain("<th>tags</th>");
    expect(html).toContain("<h1>Body</h1>");
    expect(html).not.toContain("---");
  });

  it("reports invalid YAML instead of throwing", () => {
    const html = render("---\nkey: [unclosed\n---\n\ntext");
    expect(html).toContain("Invalid YAML");
    expect(html).toContain("<p>text</p>");
  });

  it("escapes values", () => {
    const html = render("---\ntitle: <script>alert(1)</script>\n---\n");
    expect(html).not.toContain("<script");
  });

  it("does not treat a later --- pair as front matter", () => {
    const html = render("# Title\n\n---\n\ntext\n\n---\n");
    expect(html).not.toContain("front-matter");
  });

  it("exposes the parsed data", () => {
    expect(renderMarkdown("---\ntitle: T\n---\n", "gfm").frontMatter?.data).toEqual({ title: "T" });
  });
});
