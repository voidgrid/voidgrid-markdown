import { parse } from "yaml";

export interface FrontMatter {
  /** The text between the --- fences, without them. */
  raw: string;
  /** Parsed top-level mapping, or null when the YAML is invalid or not a mapping. */
  data: Record<string, unknown> | null;
  error: string | null;
}

export interface Split {
  frontMatter: FrontMatter | null;
  body: string;
  /** Number of lines the front matter block (fences included) takes at the top of the document. */
  lineOffset: number;
}

const FENCE = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

export function splitFrontMatter(text: string): Split {
  const m = FENCE.exec(text);
  if (!m) return { frontMatter: null, body: text, lineOffset: 0 };
  const raw = m[1] ?? "";
  let data: Record<string, unknown> | null = null;
  let error: string | null = null;
  try {
    const parsed: unknown = parse(raw);
    if (parsed === null || parsed === undefined) {
      data = {};
    } else if (typeof parsed === "object" && !Array.isArray(parsed)) {
      data = parsed as Record<string, unknown>;
    } else {
      error = "front matter is not a mapping";
    }
  } catch (e) {
    error = e instanceof Error ? e.message.split("\n")[0] ?? "invalid YAML" : "invalid YAML";
  }
  const consumed = m[0];
  const lineOffset = consumed.endsWith("\n") ? consumed.split("\n").length - 1 : consumed.split("\n").length;
  return { frontMatter: { raw, data, error }, body: text.slice(consumed.length), lineOffset };
}
