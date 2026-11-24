import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { insertBlock, insertLink, prefixLines, setHeading, type Target, TABLE_TEMPLATE, wrapSelection } from "../src/commands";
import { buildHtmlDocument, documentTitle, htmlFileName } from "../src/export";
import { FileError, markdownFileName, readTextFile } from "../src/files";
import { splitFrontMatter } from "../src/frontmatter";
import { lintMarkdown } from "../src/lint";
import { extractOutline } from "../src/outline";
import { computeStats, formatStats } from "../src/stats";

/** A target that applies changes to a state, like the editor does. */
function target(doc: string, from = 0, to = from): Target & { text(): string; sel(): [number, number] } {
  const t = {
    state: EditorState.create({ doc, selection: { anchor: from, head: to } }),
    dispatch(spec: Parameters<Target["dispatch"]>[0]) {
      t.state = t.state.update(spec).state;
    },
    text: () => t.state.doc.toString(),
    sel: (): [number, number] => [t.state.selection.main.from, t.state.selection.main.to],
  };
  return t;
}

describe("commands", () => {
  it("wraps a selection and unwraps it again", () => {
    const t = target("a word b", 2, 6);
    wrapSelection(t, "**");
    expect(t.text()).toBe("a **word** b");
    expect(t.sel()).toEqual([4, 8]);
    wrapSelection(t, "**");
    expect(t.text()).toBe("a word b");
  });

  it("inserts a placeholder when nothing is selected", () => {
    const t = target("", 0);
    wrapSelection(t, "*");
    expect(t.text()).toBe("*text*");
    expect(t.sel()).toEqual([1, 5]);
  });

  it("makes links with the url selected", () => {
    const t = target("see docs", 4, 8);
    insertLink(t);
    expect(t.text()).toBe("see [docs](https://)");
    expect(t.text().slice(...t.sel())).toBe("https://");
  });

  it("toggles list prefixes on every selected line", () => {
    const t = target("one\ntwo\nthree", 0, 13);
    prefixLines(t, "- ", /^[-*+] /);
    expect(t.text()).toBe("- one\n- two\n- three");
    prefixLines(t, "- ", /^[-*+] /);
    expect(t.text()).toBe("one\ntwo\nthree");
  });

  it("numbers ordered lists", () => {
    const t = target("a\nb", 0, 3);
    prefixLines(t, (i) => `${String(i + 1)}. `, /^\d+\. /);
    expect(t.text()).toBe("1. a\n2. b");
  });

  it("sets, replaces and clears headings", () => {
    const t = target("title", 0);
    setHeading(t, 2);
    expect(t.text()).toBe("## title");
    setHeading(t, 3);
    expect(t.text()).toBe("### title");
    setHeading(t, 3);
    expect(t.text()).toBe("title");
  });

  it("inserts blocks on their own lines", () => {
    const t = target("text", 4);
    insertBlock(t, TABLE_TEMPLATE, 2);
    expect(t.text()).toBe(`text\n\n${TABLE_TEMPLATE}\n`);
  });
});

describe("front matter split", () => {
  it("counts the lines it takes", () => {
    const s = splitFrontMatter("---\na: 1\n---\n# H\n");
    expect(s.lineOffset).toBe(3);
    expect(s.body).toBe("# H\n");
  });
  it("needs the fence on the first line", () => {
    expect(splitFrontMatter("\n---\na: 1\n---\n").frontMatter).toBeNull();
  });
  it("copes with an empty block and CRLF", () => {
    expect(splitFrontMatter("---\n\n---\nx").frontMatter?.data).toEqual({});
    expect(splitFrontMatter("---\r\na: 1\r\n---\r\nx").frontMatter?.data).toEqual({ a: 1 });
  });
  it("rejects non-mapping YAML", () => {
    expect(splitFrontMatter("---\n- a\n- b\n---\n").frontMatter?.error).toContain("mapping");
  });
});

describe("outline", () => {
  it("lists headings with lines, ignoring code fences and front matter", () => {
    const doc = "---\ntitle: x\n---\n# One\n\n```\n# not a heading\n```\n\n## Two `code`\n\nSetext\n======\n";
    expect(extractOutline(doc)).toEqual([
      { level: 1, text: "One", line: 3 },
      { level: 2, text: "Two code", line: 9 },
      { level: 1, text: "Setext", line: 11 },
    ]);
  });
  it("is empty for a document without headings", () => {
    expect(extractOutline("just text")).toEqual([]);
  });
});

describe("stats", () => {
  it("counts words, characters, lines and reading time", () => {
    const s = computeStats("one two\nthree");
    expect(s).toMatchObject({ words: 3, characters: 13, lines: 2, readingMinutes: 1 });
    expect(formatStats(s)).toBe("3 words · 13 chars · 1 min read");
  });
  it("handles an empty document and counts emoji as one character", () => {
    expect(computeStats("")).toEqual({ words: 0, characters: 0, lines: 0, readingMinutes: 0 });
    expect(computeStats("😄").characters).toBe(1);
  });
});

describe("lint", () => {
  it("reports problems with positions", async () => {
    const problems = await lintMarkdown("# Title\n### Skipped\n");
    const rule = problems.find((p) => p.rule.includes("MD001"));
    expect(rule?.line).toBe(2);
  });
  it("ignores line length and front matter", async () => {
    const long = `# T\n\n${"word ".repeat(80).trimEnd()}\n`;
    expect(await lintMarkdown(long)).toEqual([]);
    expect(await lintMarkdown("---\ntitle: x\n---\n\n# T\n")).toEqual([]);
  });
});

describe("export", () => {
  it("builds a standalone page that allows no scripts", () => {
    const html = buildHtmlDocument("A <b> title", "<p>body</p>");
    expect(html).toContain("<title>A &lt;b&gt; title</title>");
    expect(html).toContain("<p>body</p>");
    expect(html).toContain("default-src 'none'");
    expect(html).not.toContain("<script");
  });
  it("names the html file after the document", () => {
    expect(htmlFileName("notes.md")).toBe("notes.html");
    expect(htmlFileName("../../etc/passwd.md")).toBe("..-..-etc-passwd.html".replace(/^\.+/, ""));
    expect(htmlFileName("")).toBe("untitled.html");
  });
  it("picks the title from front matter, then heading, then name", () => {
    expect(documentTitle("a.md", "FM", "H")).toBe("FM");
    expect(documentTitle("a.md", undefined, "H")).toBe("H");
    expect(documentTitle("a.md", 5, undefined)).toBe("a");
  });
});

describe("files", () => {
  it("makes safe markdown file names", () => {
    expect(markdownFileName("notes")).toBe("notes.md");
    expect(markdownFileName("notes.markdown")).toBe("notes.markdown");
    expect(markdownFileName("a/b\\c:d.md")).toBe("a-b-c-d.md");
    expect(markdownFileName("  ")).toBe("untitled.md");
    expect(markdownFileName(".hidden")).toBe("hidden.md");
  });
  it("reads UTF-8 text and drops a byte order mark", async () => {
    const file = new File([new Uint8Array([0xef, 0xbb, 0xbf, 0x68, 0x69, 0xc3, 0xa9])], "a.md");
    expect(await readTextFile(file)).toBe("hié");
  });
  it("refuses binary and oversized files", async () => {
    await expect(readTextFile(new File([new Uint8Array([1, 2, 0, 3])], "a.bin"))).rejects.toBeInstanceOf(FileError);
    const big = { name: "big.md", size: 11 * 1024 * 1024, arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) } as File;
    await expect(readTextFile(big)).rejects.toThrow("larger than");
  });
});
