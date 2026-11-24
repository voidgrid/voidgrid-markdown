import type { EditorState } from "@codemirror/state";
import { openSearchPanel } from "@codemirror/search";
import {
  CODE_BLOCK_TEMPLATE, insertBlock, insertLink, prefixLines, setHeading, TABLE_TEMPLATE, type Target, wrapSelection,
} from "./commands";
import { byId, setHtml } from "./dom";
import { Editor } from "./editor";
import { buildHtmlDocument, documentTitle, htmlFileName } from "./export";
import {
  canPickSaveTarget, downloadBlob, downloadMarkdown, FileError, type FileHandleLike, markdownFileName,
  type OpenedFile, openFromDisk, readDropped, saveAs, writeToHandle,
} from "./files";
import { FLAVOURS, isFlavour } from "./flavours";
import type { Problem } from "./lint";
import { renderDiagrams } from "./mermaid";
import { extractOutline } from "./outline";
import { renderMarkdown } from "./render";
import { computeStats, formatStats } from "./stats";
import { browserStorage, type Doc, DocStore, type ViewMode } from "./store";

const store = new DocStore(browserStorage());
const handles = new Map<string, FileHandleLike>();
const states = new Map<string, EditorState>();
let currentId = store.active().id;
let problems: Problem[] = [];
let renderToken = 0;
let storageWarned = false;

const $ = {
  docName: byId("doc-name", HTMLInputElement),
  flavour: byId("flavour", HTMLSelectElement),
  workspace: byId("workspace", HTMLElement),
  editor: byId("editor", HTMLElement),
  preview: byId("preview", HTMLElement),
  tabs: byId("tabs", HTMLElement),
  outline: byId("outline", HTMLElement),
  outlineList: byId("outline-list", HTMLElement),
  problemsPanel: byId("problems", HTMLElement),
  problemList: byId("problem-list", HTMLElement),
  problemNone: byId("problem-none", HTMLElement),
  problemCount: byId("problem-count", HTMLElement),
  btnOutline: byId("btn-outline", HTMLButtonElement),
  btnProblems: byId("btn-problems", HTMLButtonElement),
  sync: byId("sync-scroll", HTMLInputElement),
  stCursor: byId("st-cursor", HTMLElement),
  stStats: byId("st-stats", HTMLElement),
  stSaved: byId("st-saved", HTMLElement),
  hint: byId("flavour-hint", HTMLElement),
  toast: byId("toast", HTMLElement),
  drop: byId("drop", HTMLElement),
  confirm: byId("confirm", HTMLDialogElement),
  confirmText: byId("confirm-text", HTMLElement),
  confirmOk: byId("confirm-ok", HTMLButtonElement),
  confirmCancel: byId("confirm-cancel", HTMLButtonElement),
  exportMenu: byId("export-menu", HTMLDetailsElement),
};

function debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number): ((...a: A) => void) & { flush(): void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: A | undefined;
  const run = (): void => {
    timer = undefined;
    if (pending) {
      const a = pending;
      pending = undefined;
      fn(...a);
    }
  };
  const wrapped = (...a: A): void => {
    pending = a;
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(run, ms);
  };
  wrapped.flush = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    run();
  };
  return wrapped;
}

function toast(message: string, ok = false): void {
  $.toast.textContent = message;
  $.toast.classList.toggle("ok", ok);
  $.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    $.toast.hidden = true;
  }, 4500);
}
let toastTimer: ReturnType<typeof setTimeout> | undefined;

function askConfirm(message: string, okLabel: string): Promise<boolean> {
  $.confirmText.textContent = message;
  $.confirmOk.textContent = okLabel;
  return new Promise((resolve) => {
    const done = (v: boolean): void => {
      $.confirm.close();
      $.confirmOk.removeEventListener("click", ok);
      $.confirmCancel.removeEventListener("click", cancel);
      $.confirm.removeEventListener("cancel", cancel);
      resolve(v);
    };
    const ok = (): void => {
      done(true);
    };
    const cancel = (): void => {
      done(false);
    };
    $.confirmOk.addEventListener("click", ok);
    $.confirmCancel.addEventListener("click", cancel);
    $.confirm.addEventListener("cancel", cancel);
    $.confirm.showModal();
  });
}

function currentDoc(): Doc {
  const d = store.get(currentId);
  if (!d) throw new Error("current document is missing");
  return d;
}

// ---------- autosave ----------

const flushDraft = debounce(() => {
  store.update(currentId, { text: editor.getText() });
  if (store.lastError !== null && !storageWarned) {
    storageWarned = true;
    toast("Browser storage is full or blocked: drafts are not being kept. Save to disk.");
  }
  renderTabs();
  renderSaved();
}, 400);

// ---------- preview, outline, status ----------

function currentText(): string {
  return editor.getText();
}

async function renderPreviewNow(): Promise<void> {
  renderToken += 1;
  const token = renderToken;
  const text = currentText();
  try {
    const { html } = renderMarkdown(text, store.settings.flavour);
    setHtml($.preview, html);
    await renderDiagrams($.preview, () => token === renderToken);
  } catch (e) {
    $.preview.textContent = `Could not render this document: ${e instanceof Error ? e.message : String(e)}`;
  }
}

const schedulePreview = debounce(() => {
  if (store.settings.view !== "edit") void renderPreviewNow();
}, 120);

function renderOutline(): void {
  const headings = extractOutline(currentText());
  $.outlineList.replaceChildren();
  if (headings.length === 0) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "No headings yet.";
    $.outlineList.append(li);
    return;
  }
  const minLevel = Math.min(...headings.map((h) => h.level));
  for (const h of headings) {
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = h.text;
    b.title = h.text;
    b.style.paddingLeft = `${String((h.level - minLevel) * 14 + 4)}px`;
    b.addEventListener("click", () => {
      editor.goToLine(h.line);
    });
    li.append(b);
    $.outlineList.append(li);
  }
}
const scheduleOutline = debounce(() => {
  if (store.settings.outline) renderOutline();
}, 250);

function renderStats(): void {
  $.stStats.textContent = formatStats(computeStats(currentText()));
}
const scheduleStats = debounce(renderStats, 150);

function renderSaved(): void {
  const doc = currentDoc();
  const dirty = DocStore.isDirty({ ...doc, text: currentText() });
  $.stSaved.textContent = dirty ? "unsaved changes" : handles.has(doc.id) ? "saved to disk" : doc.saved === null ? "empty" : "saved";
  $.stSaved.classList.toggle("unsaved", dirty);
}

function renderTabs(): void {
  $.tabs.replaceChildren();
  for (const doc of store.list()) {
    const text = doc.id === currentId ? currentText() : doc.text;
    const dirty = DocStore.isDirty({ ...doc, text });
    const tab = document.createElement("div");
    tab.className = "tab";
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-selected", String(doc.id === currentId));
    const pick = document.createElement("button");
    pick.type = "button";
    pick.textContent = doc.name;
    if (dirty) pick.className = "dirty";
    pick.addEventListener("click", () => {
      switchTo(doc.id);
    });
    const close = document.createElement("button");
    close.type = "button";
    close.className = "close";
    close.textContent = "×";
    close.setAttribute("aria-label", `Close ${doc.name}`);
    close.addEventListener("click", () => {
      void closeDoc(doc.id);
    });
    tab.append(pick, close);
    $.tabs.append(tab);
  }
  const add = document.createElement("div");
  add.className = "tab new";
  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.textContent = "+";
  addBtn.setAttribute("aria-label", "New document");
  addBtn.addEventListener("click", newDoc);
  add.append(addBtn);
  $.tabs.append(add);
}

function renderProblems(): void {
  $.problemCount.textContent = String(problems.length);
  $.problemList.replaceChildren();
  $.problemNone.hidden = problems.length > 0;
  for (const p of problems) {
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.type = "button";
    const pos = document.createElement("span");
    pos.className = "pos";
    pos.textContent = `${String(p.line)}:${String(Math.max(p.column, 1))}`;
    const rule = document.createElement("span");
    rule.className = "rule";
    rule.textContent = p.rule;
    const msg = document.createElement("span");
    msg.textContent = p.detail === "" ? p.description : `${p.description} (${p.detail})`;
    b.append(pos, rule, msg);
    b.addEventListener("click", () => {
      editor.goToLine(p.line - 1);
    });
    li.append(b);
    $.problemList.append(li);
  }
}

function applySettings(): void {
  const s = store.settings;
  $.workspace.dataset["view"] = s.view;
  for (const b of document.querySelectorAll<HTMLButtonElement>(".seg button")) {
    b.setAttribute("aria-pressed", String(b.dataset["view"] === s.view));
  }
  $.flavour.value = s.flavour;
  $.hint.textContent = FLAVOURS.find((f) => f.id === s.flavour)?.hint ?? "";
  $.sync.checked = s.syncScroll;
  $.outline.hidden = !s.outline;
  $.btnOutline.setAttribute("aria-pressed", String(s.outline));
  $.problemsPanel.hidden = !s.problems;
  $.btnProblems.setAttribute("aria-pressed", String(s.problems));
}

// ---------- documents ----------

function switchTo(id: string): void {
  if (id === currentId) return;
  flushDraft.flush();
  states.set(currentId, editor.view.state);
  currentId = id;
  store.setActive(id);
  const doc = currentDoc();
  editor.setState(states.get(id) ?? editor.createState(doc.text));
  $.docName.value = doc.name;
  renderTabs();
  renderSaved();
  renderOutline();
  void renderPreviewNow();
}

function newDoc(): void {
  flushDraft.flush();
  const doc = store.create("untitled.md", "");
  states.set(currentId, editor.view.state);
  currentId = doc.id;
  editor.setState(editor.createState(""));
  $.docName.value = doc.name;
  renderTabs();
  renderSaved();
  renderOutline();
  void renderPreviewNow();
  editor.focus();
}

async function closeDoc(id: string): Promise<void> {
  const doc = store.get(id);
  if (!doc) return;
  const text = id === currentId ? currentText() : doc.text;
  if (DocStore.isDirty({ ...doc, text })) {
    const ok = await askConfirm(`${doc.name} has changes that are not saved to disk. Close it and delete the draft?`, "Discard");
    if (!ok) return;
  }
  flushDraft.flush();
  store.remove(id);
  handles.delete(id);
  states.delete(id);
  if (id === currentId) {
    currentId = store.active().id;
    const next = currentDoc();
    editor.setState(states.get(currentId) ?? editor.createState(next.text));
    $.docName.value = next.name;
    void renderPreviewNow();
    renderOutline();
  }
  renderTabs();
  renderSaved();
}

function openFiles(files: OpenedFile[]): void {
  if (files.length === 0) return;
  flushDraft.flush();
  states.set(currentId, editor.view.state);
  let last: Doc | undefined;
  for (const f of files) {
    last = store.create(f.name, f.text, f.text);
    if (f.handle) handles.set(last.id, f.handle);
  }
  if (!last) return;
  currentId = last.id;
  editor.setState(editor.createState(last.text));
  $.docName.value = last.name;
  renderTabs();
  renderSaved();
  renderOutline();
  void renderPreviewNow();
  toast(files.length === 1 ? `Opened ${last.name}` : `Opened ${String(files.length)} files`, true);
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

async function openCommand(): Promise<void> {
  try {
    openFiles(await openFromDisk());
  } catch (e) {
    toast(e instanceof FileError ? e.message : `Could not open the file: ${errorMessage(e)}`);
  }
}

function markSaved(id: string, text: string): void {
  store.update(id, { text, saved: text });
  renderTabs();
  renderSaved();
}

async function saveAsCommand(): Promise<void> {
  const doc = currentDoc();
  const text = currentText();
  try {
    const result = await saveAs(doc.name, text);
    if (!result) return;
    if (result.handle) handles.set(doc.id, result.handle);
    else handles.delete(doc.id);
    store.update(doc.id, { name: result.name });
    $.docName.value = result.name;
    markSaved(doc.id, text);
    toast(result.handle ? `Saved ${result.name}` : `Downloaded ${result.name}`, true);
  } catch (e) {
    toast(`Could not save: ${errorMessage(e)}`);
  }
}

async function saveCommand(): Promise<void> {
  const doc = currentDoc();
  const handle = handles.get(doc.id);
  if (!handle) {
    // No file to write back to yet: a native Save dialog where there is one, otherwise a download.
    await saveAsCommand();
    return;
  }
  const text = currentText();
  try {
    await writeToHandle(handle, text);
    markSaved(doc.id, text);
    toast(`Saved ${handle.name}`, true);
  } catch (e) {
    toast(`Could not write ${handle.name}: ${errorMessage(e)}. Use Save as .md.`);
  }
}

// ---------- export ----------

function exportTitle(): string {
  const text = currentText();
  const { frontMatter } = renderMarkdown(text, store.settings.flavour);
  return documentTitle(currentDoc().name, frontMatter?.data?.["title"], extractOutline(text)[0]?.text);
}

async function exportCommand(kind: string): Promise<void> {
  $.exportMenu.open = false;
  const doc = currentDoc();
  if (kind === "md") {
    toast(`Downloaded ${downloadMarkdown(doc.name, currentText())}`, true);
    return;
  }
  await renderPreviewNow();
  const title = exportTitle();
  if (kind === "html") {
    const name = htmlFileName(doc.name);
    downloadBlob(name, buildHtmlDocument(title, $.preview.innerHTML), "text/html;charset=utf-8");
    toast(`Downloaded ${name}`, true);
  } else if (kind === "pdf") {
    const previous = document.title;
    document.title = title;
    const restore = (): void => {
      document.title = previous;
      window.removeEventListener("afterprint", restore);
    };
    window.addEventListener("afterprint", restore);
    window.print();
  }
}

// ---------- formatting toolbar ----------

function runCommand(cmd: string): void {
  const t: Target = editor.view;
  switch (cmd) {
    case "bold": wrapSelection(t, "**"); break;
    case "italic": wrapSelection(t, "*"); break;
    case "strike": wrapSelection(t, "~~"); break;
    case "code": wrapSelection(t, "`"); break;
    case "link": insertLink(t); break;
    case "h1": setHeading(t, 1); break;
    case "h2": setHeading(t, 2); break;
    case "h3": setHeading(t, 3); break;
    case "ul": prefixLines(t, "- ", /^[-*+] /); break;
    case "ol": prefixLines(t, (i) => `${String(i + 1)}. `, /^\d+\. /); break;
    case "task": prefixLines(t, "- [ ] ", /^- \[[ xX]\] /); break;
    case "quote": prefixLines(t, "> ", /^> ?/); break;
    case "codeblock": insertBlock(t, CODE_BLOCK_TEMPLATE, 4); break;
    case "table": insertBlock(t, TABLE_TEMPLATE, 2); break;
    case "hr": insertBlock(t, "---"); break;
    case "find": openSearchPanel(editor.view); return;
    default: return;
  }
  editor.focus();
}

// ---------- scroll sync ----------

let syncing = false;
function syncFrom(source: HTMLElement, target: HTMLElement): void {
  if (syncing || !store.settings.syncScroll || store.settings.view !== "split") return;
  const span = source.scrollHeight - source.clientHeight;
  const ratio = span > 0 ? source.scrollTop / span : 0;
  syncing = true;
  target.scrollTop = ratio * (target.scrollHeight - target.clientHeight);
  requestAnimationFrame(() => {
    syncing = false;
  });
}

// ---------- boot ----------

const editor = new Editor($.editor, currentDoc().text, {
  onChange() {
    flushDraft();
    schedulePreview();
    scheduleOutline();
    scheduleStats();
    renderSaved();
    renderTabs();
  },
  onProblems(list) {
    problems = list;
    renderProblems();
  },
  onCursor(line, col) {
    $.stCursor.textContent = `Ln ${String(line)}, Col ${String(col)}`;
  },
});

for (const f of FLAVOURS) {
  const o = document.createElement("option");
  o.value = f.id;
  o.textContent = f.label;
  $.flavour.append(o);
}

$.docName.value = currentDoc().name;
applySettings();
renderTabs();
renderStats();
renderSaved();
if (store.settings.outline) renderOutline();
void renderPreviewNow();

$.flavour.addEventListener("change", () => {
  if (!isFlavour($.flavour.value)) return;
  store.updateSettings({ flavour: $.flavour.value });
  applySettings();
  void renderPreviewNow();
});
for (const b of document.querySelectorAll<HTMLButtonElement>(".seg button")) {
  b.addEventListener("click", () => {
    const view = b.dataset["view"] as ViewMode;
    store.updateSettings({ view });
    applySettings();
    if (view !== "edit") void renderPreviewNow();
  });
}
$.sync.addEventListener("change", () => {
  store.updateSettings({ syncScroll: $.sync.checked });
});
$.btnOutline.addEventListener("click", () => {
  store.updateSettings({ outline: !store.settings.outline });
  applySettings();
  if (store.settings.outline) renderOutline();
});
$.btnProblems.addEventListener("click", () => {
  store.updateSettings({ problems: !store.settings.problems });
  applySettings();
});
$.docName.addEventListener("change", () => {
  const name = $.docName.value.trim();
  const doc = currentDoc();
  if (name === "" || name === doc.name) {
    $.docName.value = doc.name;
    return;
  }
  const finalName = markdownFileName(name);
  store.update(doc.id, { name: finalName });
  // A renamed document is a different file: the next Save asks where to put it.
  handles.delete(doc.id);
  $.docName.value = finalName;
  renderTabs();
  renderSaved();
});

byId("btn-new", HTMLButtonElement).addEventListener("click", newDoc);
byId("btn-open", HTMLButtonElement).addEventListener("click", () => void openCommand());
byId("btn-save", HTMLButtonElement).addEventListener("click", () => void saveCommand());
byId("btn-save-as", HTMLButtonElement).addEventListener("click", () => void saveAsCommand());
for (const b of document.querySelectorAll<HTMLButtonElement>("[data-export]")) {
  b.addEventListener("click", () => void exportCommand(b.dataset["export"] ?? ""));
}
for (const b of document.querySelectorAll<HTMLButtonElement>("[data-cmd]")) {
  b.addEventListener("click", () => {
    runCommand(b.dataset["cmd"] ?? "");
  });
}

window.addEventListener("keydown", (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
  const key = e.key.toLowerCase();
  if (key === "s") {
    e.preventDefault();
    void (e.shiftKey ? saveAsCommand() : saveCommand());
  } else if (key === "o" && !e.shiftKey) {
    e.preventDefault();
    void openCommand();
  }
});

// Scroll sync, both directions.
editor.view.scrollDOM.addEventListener("scroll", () => {
  syncFrom(editor.view.scrollDOM, $.preview.parentElement ?? $.preview);
});
($.preview.parentElement ?? $.preview).addEventListener("scroll", () => {
  syncFrom($.preview.parentElement ?? $.preview, editor.view.scrollDOM);
});

// In-page links (footnotes) scroll the preview instead of the whole page.
$.preview.addEventListener("click", (e) => {
  const a = e.target instanceof Element ? e.target.closest("a") : null;
  const href = a?.getAttribute("href");
  if (!a || !href?.startsWith("#")) return;
  e.preventDefault();
  const id = decodeURIComponent(href.slice(1));
  for (const el of $.preview.querySelectorAll("[id]")) {
    if (el.id === id) {
      el.scrollIntoView({ block: "start" });
      break;
    }
  }
});

// Drag and drop: open every markdown or text file dropped on the window.
let dragDepth = 0;
const hasFiles = (e: DragEvent): boolean => Array.from(e.dataTransfer?.types ?? []).includes("Files");
window.addEventListener("dragenter", (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth += 1;
  $.drop.hidden = false;
});
window.addEventListener("dragover", (e) => {
  if (hasFiles(e)) e.preventDefault();
});
window.addEventListener("dragleave", (e) => {
  if (!hasFiles(e)) return;
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) $.drop.hidden = true;
});
window.addEventListener("drop", (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth = 0;
  $.drop.hidden = true;
  const files = Array.from(e.dataTransfer?.files ?? []);
  readDropped(files)
    .then(({ opened, skipped }) => {
      openFiles(opened);
      if (skipped.length > 0) toast(`Skipped (not a text file): ${skipped.join(", ")}`);
    })
    .catch((err: unknown) => {
      toast(err instanceof FileError ? err.message : `Could not open the file: ${errorMessage(err)}`);
    });
});

// Keep the last edit if the tab is hidden or closed inside the debounce window.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") flushDraft.flush();
});
window.addEventListener("pagehide", () => {
  flushDraft.flush();
});
// Drafts survive a reload, unless the browser would not store them: then warn before leaving.
window.addEventListener("beforeunload", (e) => {
  if (store.lastError !== null && store.list().some((d) => DocStore.isDirty(d))) e.preventDefault();
});

if (!canPickSaveTarget()) {
  byId("btn-save", HTMLButtonElement).title = "Download the file (this browser cannot save in place) (Ctrl+S)";
}
