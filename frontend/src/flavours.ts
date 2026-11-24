import hljs from "highlight.js/lib/common";
import MarkdownIt, { type MarkdownIt as MD } from "markdown-it";
import abbr from "markdown-it-abbr";
import container from "markdown-it-container";
import deflist from "markdown-it-deflist";
import { full as emoji } from "markdown-it-emoji";
import footnote from "markdown-it-footnote";
import mark from "markdown-it-mark";
import sub from "markdown-it-sub";
import sup from "markdown-it-sup";
import { alert } from "@mdit/plugin-alert";
import { tasklist } from "@mdit/plugin-tasklist";
import { escapeHtml } from "./dom";

export type Flavour = "commonmark" | "gfm" | "extended";

export const FLAVOURS: readonly { id: Flavour; label: string; hint: string }[] = [
  { id: "commonmark", label: "CommonMark", hint: "The strict spec. No tables, strikethrough, task lists or diagrams." },
  { id: "gfm", label: "GitHub (GFM)", hint: "Tables, strikethrough, task lists, autolinks, alerts, Mermaid." },
  { id: "extended", label: "Extended", hint: "GFM plus footnotes, definition lists, sub/sup, mark, abbreviations, emoji, containers." },
];

export const DEFAULT_FLAVOUR: Flavour = "gfm";

export function isFlavour(v: unknown): v is Flavour {
  return v === "commonmark" || v === "gfm" || v === "extended";
}

function highlight(code: string, lang: string): string {
  if (lang && hljs.getLanguage(lang)) {
    try {
      const out = hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
      return `<pre><code class="hljs language-${escapeHtml(lang)}">${out}</code></pre>`;
    } catch {
      // fall through to the plain block
    }
  }
  return "";
}

/** Fenced mermaid blocks become a placeholder that mermaid.ts replaces with a rendered diagram. */
function mermaidFence(md: MD): void {
  const original = md.renderer.rules.fence;
  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    if (token && token.info.trim().split(/\s+/)[0] === "mermaid") {
      return `<div class="mermaid-diagram"><pre class="mermaid-source">${escapeHtml(token.content)}</pre></div>\n`;
    }
    return original ? original(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options);
  };
}

const CONTAINERS = ["note", "tip", "info", "warning", "danger"] as const;

export function createRenderer(flavour: Flavour): MD {
  if (flavour === "commonmark") {
    return new MarkdownIt("commonmark", { html: true, highlight });
  }
  const md = new MarkdownIt({ html: true, linkify: true, highlight });
  md.use(tasklist, { disabled: true }).use(alert);
  mermaidFence(md);
  if (flavour === "extended") {
    md.use(footnote).use(deflist).use(sub).use(sup).use(mark).use(abbr).use(emoji);
    for (const name of CONTAINERS) md.use(container, name);
  }
  return md;
}
