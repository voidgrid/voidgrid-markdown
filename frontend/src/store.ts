// Documents live in the browser's localStorage so a closed tab or crash loses nothing. Each document is
// its own key, so one big document does not rewrite the others on every keystroke.

import { DEFAULT_FLAVOUR, type Flavour, isFlavour } from "./flavours";

export type ViewMode = "edit" | "split" | "preview";

export interface Doc {
  id: string;
  name: string;
  text: string;
  /** Text as last opened from or saved to disk; null if it never was. Dirty means text differs from it. */
  saved: string | null;
  updated: number;
}

export interface Settings {
  flavour: Flavour;
  view: ViewMode;
  syncScroll: boolean;
  outline: boolean;
  problems: boolean;
}

const INDEX_KEY = "vgm:index";
const DOC_PREFIX = "vgm:doc:";

interface Index {
  order: string[];
  active: string;
  settings: Settings;
}

export const DEFAULT_SETTINGS: Settings = {
  flavour: DEFAULT_FLAVOUR,
  view: "split",
  syncScroll: true,
  outline: false,
  problems: false,
};

export const WELCOME = `---
title: Welcome to voidgrid-markdown
---

# Welcome

Everything stays in your browser. **Open** a file from disk, edit, then **Save** it back
(Chrome and Edge write to the same file; other browsers download it).

## Try it

- [x] Pick a flavour in the top bar
- [ ] Open the outline and problems panels
- [ ] Press Ctrl+S to save

| Feature | Where |
| ------- | ----- |
| Lint    | problems panel |
| Export  | Export menu |

\`\`\`mermaid
graph LR
  Edit --> Preview --> Save
\`\`\`
`;

function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseDoc(id: string, raw: string | null): Doc | null {
  if (raw === null) return null;
  try {
    const v: unknown = JSON.parse(raw);
    if (!isRecord(v) || typeof v["name"] !== "string" || typeof v["text"] !== "string") return null;
    return {
      id,
      name: v["name"],
      text: v["text"],
      saved: typeof v["saved"] === "string" ? v["saved"] : null,
      updated: typeof v["updated"] === "number" ? v["updated"] : 0,
    };
  } catch {
    return null;
  }
}

function parseSettings(v: unknown): Settings {
  const s = { ...DEFAULT_SETTINGS };
  if (!isRecord(v)) return s;
  if (isFlavour(v["flavour"])) s.flavour = v["flavour"];
  if (v["view"] === "edit" || v["view"] === "split" || v["view"] === "preview") s.view = v["view"];
  if (typeof v["syncScroll"] === "boolean") s.syncScroll = v["syncScroll"];
  if (typeof v["outline"] === "boolean") s.outline = v["outline"];
  if (typeof v["problems"] === "boolean") s.problems = v["problems"];
  return s;
}

export class DocStore {
  private docs = new Map<string, Doc>();
  private order: string[] = [];
  private activeId = "";
  settings: Settings = { ...DEFAULT_SETTINGS };
  /** Set when the last write failed (storage full or blocked), so the UI can say drafts are not kept. */
  lastError: string | null = null;

  constructor(private readonly storage: Storage) {
    this.load();
    if (this.order.length === 0) this.create("welcome.md", WELCOME);
  }

  private load(): void {
    let index: unknown;
    try {
      const raw = this.storage.getItem(INDEX_KEY);
      index = raw === null ? null : JSON.parse(raw);
    } catch {
      index = null;
    }
    if (!isRecord(index)) return;
    this.settings = parseSettings(index["settings"]);
    const order = Array.isArray(index["order"]) ? index["order"].filter((x): x is string => typeof x === "string") : [];
    for (const id of order) {
      let raw: string | null;
      try {
        raw = this.storage.getItem(DOC_PREFIX + id);
      } catch {
        raw = null;
      }
      const doc = parseDoc(id, raw);
      if (doc) {
        this.docs.set(id, doc);
        this.order.push(id);
      }
    }
    const active = typeof index["active"] === "string" ? index["active"] : "";
    this.activeId = this.docs.has(active) ? active : (this.order[0] ?? "");
  }

  private write(key: string, value: string): void {
    try {
      this.storage.setItem(key, value);
      this.lastError = null;
    } catch (e) {
      this.lastError = e instanceof Error || e instanceof DOMException ? e.message : "storage unavailable";
    }
  }

  private saveIndex(): void {
    const index: Index = { order: this.order, active: this.activeId, settings: this.settings };
    this.write(INDEX_KEY, JSON.stringify(index));
  }

  private saveDoc(doc: Doc): void {
    this.write(DOC_PREFIX + doc.id, JSON.stringify({ name: doc.name, text: doc.text, saved: doc.saved, updated: doc.updated }));
  }

  list(): Doc[] {
    return this.order.flatMap((id) => {
      const d = this.docs.get(id);
      return d ? [d] : [];
    });
  }

  get(id: string): Doc | undefined {
    return this.docs.get(id);
  }

  active(): Doc {
    const doc = this.docs.get(this.activeId);
    if (!doc) throw new Error("no active document");
    return doc;
  }

  setActive(id: string): void {
    if (!this.docs.has(id)) return;
    this.activeId = id;
    this.saveIndex();
  }

  create(name: string, text: string, saved: string | null = null): Doc {
    const doc: Doc = { id: newId(), name, text, saved, updated: Date.now() };
    this.docs.set(doc.id, doc);
    this.order.push(doc.id);
    this.activeId = doc.id;
    this.saveDoc(doc);
    this.saveIndex();
    return doc;
  }

  update(id: string, patch: Partial<Pick<Doc, "name" | "text" | "saved">>): void {
    const doc = this.docs.get(id);
    if (!doc) return;
    Object.assign(doc, patch, { updated: Date.now() });
    this.saveDoc(doc);
  }

  /** Removes a document; the store always keeps at least one (an empty untitled one replaces the last). */
  remove(id: string): void {
    if (!this.docs.delete(id)) return;
    this.order = this.order.filter((x) => x !== id);
    try {
      this.storage.removeItem(DOC_PREFIX + id);
    } catch {
      // nothing to do: the index no longer lists it
    }
    if (this.order.length === 0) {
      this.create("untitled.md", "");
      return;
    }
    if (this.activeId === id) this.activeId = this.order[0] ?? "";
    this.saveIndex();
  }

  updateSettings(patch: Partial<Settings>): void {
    this.settings = { ...this.settings, ...patch };
    this.saveIndex();
  }

  static isDirty(doc: Doc): boolean {
    return doc.saved === null ? doc.text !== "" : doc.text !== doc.saved;
  }
}

/** localStorage, or an in-memory stand-in when the browser blocks it (private windows, blocked cookies). */
export function browserStorage(): Storage {
  try {
    const s = window.localStorage;
    const probe = "vgm:probe";
    s.setItem(probe, "1");
    s.removeItem(probe);
    return s;
  } catch {
    return memoryStorage();
  }
}

export function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => {
      m.clear();
    },
    getItem: (k) => m.get(k) ?? null,
    key: (i) => Array.from(m.keys())[i] ?? null,
    removeItem: (k) => {
      m.delete(k);
    },
    setItem: (k, v) => {
      m.set(k, v);
    },
  };
}
