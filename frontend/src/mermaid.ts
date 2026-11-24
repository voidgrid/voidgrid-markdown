// Mermaid is large, so it is only loaded the first time a document contains a diagram. Diagrams are
// rendered to SVG and shown through <img src="data:image/svg+xml">, which the browser treats as an
// inert picture: no script, no links and no outside loads can run inside it.

type MermaidApi = typeof import("mermaid").default;

let loading: Promise<MermaidApi> | null = null;
let counter = 0;
const cache = new Map<string, string>();
const CACHE_LIMIT = 50;

async function load(): Promise<MermaidApi> {
  loading ??= import("mermaid").then((m) => {
    m.default.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: "base",
      htmlLabels: false,
      themeVariables: {
        background: "#000000",
        primaryColor: "#040a05",
        primaryTextColor: "#33ff66",
        primaryBorderColor: "#1fa84a",
        lineColor: "#33ff66",
        secondaryColor: "#0f4a22",
        tertiaryColor: "#040a05",
        fontFamily: "ui-monospace, Menlo, Consolas, monospace",
      },
    });
    return m.default;
  });
  return loading;
}

function toDataUri(svg: string): string {
  const bytes = new TextEncoder().encode(svg);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return `data:image/svg+xml;base64,${btoa(bin)}`;
}

export async function diagramUri(code: string): Promise<string> {
  const hit = cache.get(code);
  if (hit) return hit;
  const mermaid = await load();
  await mermaid.parse(code);
  counter += 1;
  const { svg } = await mermaid.render(`vgm-mermaid-${String(counter)}`, code);
  const uri = toDataUri(svg);
  if (cache.size >= CACHE_LIMIT) {
    const first = cache.keys().next();
    if (!first.done) cache.delete(first.value);
  }
  cache.set(code, uri);
  return uri;
}

export function cachedDiagram(code: string): string | undefined {
  return cache.get(code);
}

function show(host: Element, uri: string): void {
  const img = document.createElement("img");
  img.className = "mermaid-img";
  img.alt = "Mermaid diagram";
  img.src = uri;
  host.replaceChildren(img);
}

function showError(host: Element, message: string): void {
  const box = document.createElement("div");
  box.className = "mermaid-error";
  box.textContent = `Mermaid: ${message}`;
  host.replaceChildren(box);
}

/**
 * Replaces each mermaid placeholder under root with its diagram. `isCurrent` lets a caller drop the
 * result when the preview was re-rendered in the meantime.
 */
export async function renderDiagrams(root: Element, isCurrent: () => boolean = () => true): Promise<void> {
  const hosts = Array.from(root.querySelectorAll(".mermaid-diagram"));
  // Cached diagrams go in at once so typing elsewhere in the document does not make them flicker.
  const pending: { host: Element; code: string }[] = [];
  for (const host of hosts) {
    const code = host.querySelector(".mermaid-source")?.textContent ?? "";
    const hit = cachedDiagram(code);
    if (hit) show(host, hit);
    else pending.push({ host, code });
  }
  for (const { host, code } of pending) {
    try {
      const uri = await diagramUri(code);
      if (!isCurrent()) return;
      show(host, uri);
    } catch (e) {
      if (!isCurrent()) return;
      const msg = e instanceof Error ? e.message : String(e);
      showError(host, (msg.split("\n")[0] ?? msg).slice(0, 200));
      document.getElementById(`dvgm-mermaid-${String(counter)}`)?.remove();
    }
  }
}
