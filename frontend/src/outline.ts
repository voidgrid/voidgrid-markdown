import MarkdownIt from "markdown-it";
import { splitFrontMatter } from "./frontmatter";

export interface Heading {
  level: number;
  text: string;
  /** Zero-based line in the whole document, front matter included. */
  line: number;
}

const parser = new MarkdownIt("commonmark");

export function extractOutline(text: string): Heading[] {
  const { body, lineOffset } = splitFrontMatter(text);
  const tokens = parser.parse(body, {});
  const out: Heading[] = [];
  tokens.forEach((t, i) => {
    if (t.type !== "heading_open" || !t.map) return;
    const inline = tokens[i + 1];
    const label = (inline?.children ?? [])
      .filter((c) => c.type === "text" || c.type === "code_inline")
      .map((c) => c.content)
      .join("")
      .trim();
    out.push({ level: Number(t.tag.slice(1)), text: label === "" ? "(empty heading)" : label, line: t.map[0] + lineOffset });
  });
  return out;
}
