import { escapeHtml } from "./dom";

// A standalone page: one file, no scripts, no outside loads except https images the document asked for.
const EXPORT_CSS = `
:root { color-scheme: dark; }
body { margin: 0; background: #000; color: #33ff66; font: 16px/1.6 ui-monospace, "JetBrains Mono", Menlo, Consolas, monospace; }
main { max-width: 52rem; margin: 0 auto; padding: 24px 16px 64px; overflow-wrap: anywhere; }
h1, h2, h3, h4, h5, h6 { color: #00ff66; line-height: 1.25; }
h1, h2 { border-bottom: 1px dashed #0f4a22; padding-bottom: .3em; }
a { color: #00ff66; }
code, pre { font-family: inherit; background: #040a05; border: 1px solid #0f4a22; border-radius: 2px; }
code { padding: .1em .3em; }
pre { padding: 12px; overflow-x: auto; }
pre code { border: 0; padding: 0; background: none; }
blockquote { margin-left: 0; padding-left: 1em; border-left: 3px solid #1fa84a; color: #1fa84a; }
table { border-collapse: collapse; display: block; overflow-x: auto; }
th, td { border: 1px solid #0f4a22; padding: 6px 10px; }
img { max-width: 100%; }
hr { border: 0; border-top: 1px dashed #0f4a22; }
mark { background: #00ff66; color: #000; }
.hljs-comment, .hljs-quote { color: #1fa84a; }
.hljs-keyword, .hljs-selector-tag, .hljs-literal { color: #99ffbb; font-weight: bold; }
.hljs-string, .hljs-number, .hljs-attr, .hljs-built_in { color: #ffb000; }
.hljs-title, .hljs-name, .hljs-type { color: #00ffcc; }
.markdown-alert { border-left: 4px solid #1fa84a; padding: 0 1em; background: #040a05; }
.markdown-alert-title { font-weight: bold; text-transform: capitalize; }
.front-matter { border: 1px solid #0f4a22; padding: 4px 10px; margin-bottom: 1em; }
.mermaid-img { max-width: 100%; background: #000; }
.footnotes { font-size: .9em; color: #1fa84a; }
@media print { body { background: #fff; color: #000; } h1, h2, h3, h4, h5, h6, a { color: #000; } code, pre { background: #f4f4f4; border-color: #ccc; } }
`;

export function buildHtmlDocument(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'unsafe-inline'">
<title>${escapeHtml(title)}</title>
<style>${EXPORT_CSS}</style>
</head>
<body>
<main>
${bodyHtml}
</main>
</body>
</html>
`;
}

export function htmlFileName(docName: string): string {
  const base = docName.replace(/\.(md|markdown|mdown|mkd|txt)$/i, "");
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").trim().replace(/^\.+/, "");
  return `${cleaned === "" ? "untitled" : cleaned}.html`;
}

/** Title for exports: front matter title, else the first heading, else the file name. */
export function documentTitle(docName: string, frontMatterTitle: unknown, firstHeading: string | undefined): string {
  if (typeof frontMatterTitle === "string" && frontMatterTitle.trim() !== "") return frontMatterTitle.trim();
  if (firstHeading) return firstHeading;
  return docName.replace(/\.(md|markdown|mdown|mkd|txt)$/i, "");
}
