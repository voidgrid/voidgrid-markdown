import { escapeHtml } from "./dom";
import { createRenderer, type Flavour } from "./flavours";
import { type FrontMatter, splitFrontMatter } from "./frontmatter";
import { sanitize } from "./sanitize";

const renderers = new Map<Flavour, ReturnType<typeof createRenderer>>();

function rendererFor(flavour: Flavour): ReturnType<typeof createRenderer> {
  let md = renderers.get(flavour);
  if (!md) {
    md = createRenderer(flavour);
    renderers.set(flavour, md);
  }
  return md;
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString();
  return JSON.stringify(v);
}

export function frontMatterHtml(fm: FrontMatter): string {
  if (fm.error !== null) {
    return `<details class="front-matter" open><summary>front matter</summary><p class="front-matter-error">Invalid YAML: ${escapeHtml(fm.error)}</p></details>\n`;
  }
  const rows = Object.entries(fm.data ?? {})
    .map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(formatValue(v))}</td></tr>`)
    .join("");
  if (rows === "") return "";
  return `<details class="front-matter" open><summary>front matter</summary><table><tbody>${rows}</tbody></table></details>\n`;
}

export interface Rendered {
  /** Sanitized HTML, ready for the preview. Mermaid blocks are placeholders until renderDiagrams runs. */
  html: string;
  frontMatter: FrontMatter | null;
}

export function renderMarkdown(text: string, flavour: Flavour): Rendered {
  const { frontMatter, body } = splitFrontMatter(text);
  const bodyHtml = rendererFor(flavour).render(body);
  const head = frontMatter ? frontMatterHtml(frontMatter) : "";
  return { html: sanitize(head + bodyHtml), frontMatter };
}
