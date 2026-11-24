// The only place markup is assigned to the DOM. Everything passed in must already be sanitized
// (see sanitize.ts) or be a trusted constant; ESLint forbids innerHTML anywhere else.

export function setHtml(el: Element, html: string): void {
  el.innerHTML = html;
}

export function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function byId<T extends HTMLElement>(id: string, type: new () => T): T {
  const el = document.getElementById(id);
  if (!(el instanceof type)) throw new Error(`missing element #${id}`);
  return el;
}
