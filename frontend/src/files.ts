// Reading and writing files in the browser. Chrome and Edge can open a file and write straight back to
// it (File System Access API). Everywhere else a save is a download, and opening uses a file input.

export const MAX_BYTES = 10 * 1024 * 1024;
export const ACCEPT_EXTENSIONS = [".md", ".markdown", ".mdown", ".mkd", ".txt"];

export interface WritableLike {
  write(data: string): Promise<void>;
  close(): Promise<void>;
}
export interface FileHandleLike {
  readonly name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<WritableLike>;
}
export interface OpenedFile {
  name: string;
  text: string;
  handle: FileHandleLike | null;
}

interface PickerWindow {
  showOpenFilePicker?: (opts: unknown) => Promise<FileHandleLike[]>;
  showSaveFilePicker?: (opts: unknown) => Promise<FileHandleLike>;
}

const PICKER_TYPES = [
  { description: "Markdown", accept: { "text/markdown": [".md", ".markdown", ".mdown", ".mkd"], "text/plain": [".txt"] } },
];

function pickers(): PickerWindow {
  return window as unknown as PickerWindow;
}

export function canPickFiles(): boolean {
  return typeof pickers().showOpenFilePicker === "function";
}
export function canPickSaveTarget(): boolean {
  return typeof pickers().showSaveFilePicker === "function";
}

function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === "AbortError";
}

export function hasMarkdownExtension(name: string): boolean {
  return /\.(md|markdown|mdown|mkd)$/i.test(name);
}

/** A safe file name: no path parts, no control characters, always a markdown extension. */
export function markdownFileName(name: string): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").trim().replace(/^\.+/, "");
  const base = cleaned === "" ? "untitled" : cleaned;
  return hasMarkdownExtension(base) ? base : `${base}.md`;
}

export class FileError extends Error {}

/** Reads a File as UTF-8 text, refusing files that are too big or look binary. */
export async function readTextFile(file: File): Promise<string> {
  if (file.size > MAX_BYTES) {
    throw new FileError(`${file.name} is larger than ${String(MAX_BYTES / 1024 / 1024)} MB`);
  }
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  if (bytes.subarray(0, 8000).includes(0)) {
    throw new FileError(`${file.name} does not look like a text file`);
  }
  const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes);
  return text.startsWith(String.fromCharCode(0xfeff)) ? text.slice(1) : text;
}

export function isAcceptable(file: File): boolean {
  const lower = file.name.toLowerCase();
  return ACCEPT_EXTENSIONS.some((e) => lower.endsWith(e)) || file.type.startsWith("text/");
}

export async function openFromDisk(): Promise<OpenedFile[]> {
  const picker = pickers().showOpenFilePicker;
  if (typeof picker === "function") {
    try {
      const handles = await picker.call(window, { multiple: true, types: PICKER_TYPES, excludeAcceptAllOption: false });
      const out: OpenedFile[] = [];
      for (const handle of handles) {
        const file = await handle.getFile();
        out.push({ name: handle.name, text: await readTextFile(file), handle });
      }
      return out;
    } catch (e) {
      if (isAbort(e)) return [];
      throw e;
    }
  }
  return openWithInput();
}

function openWithInput(): Promise<OpenedFile[]> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = [...ACCEPT_EXTENSIONS, "text/*"].join(",");
    input.addEventListener("change", () => {
      const files = Array.from(input.files ?? []);
      Promise.all(files.map(async (f) => ({ name: f.name, text: await readTextFile(f), handle: null })))
        .then(resolve, reject);
    });
    input.addEventListener("cancel", () => {
      resolve([]);
    });
    input.click();
  });
}

export async function readDropped(files: Iterable<File>): Promise<{ opened: OpenedFile[]; skipped: string[] }> {
  const opened: OpenedFile[] = [];
  const skipped: string[] = [];
  for (const f of files) {
    if (!isAcceptable(f)) {
      skipped.push(f.name);
      continue;
    }
    opened.push({ name: f.name, text: await readTextFile(f), handle: null });
  }
  return { opened, skipped };
}

export async function writeToHandle(handle: FileHandleLike, text: string): Promise<void> {
  const w = await handle.createWritable();
  try {
    await w.write(text);
  } finally {
    await w.close();
  }
}

export function downloadBlob(name: string, data: BlobPart, mime: string): void {
  const url = URL.createObjectURL(new Blob([data], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 10_000);
}

export function downloadMarkdown(name: string, text: string): string {
  const fileName = markdownFileName(name);
  downloadBlob(fileName, text, "text/markdown;charset=utf-8");
  return fileName;
}

export interface SaveResult {
  name: string;
  handle: FileHandleLike | null;
}

/** Asks where to save (a native Save dialog where supported, otherwise a download). Null if cancelled. */
export async function saveAs(name: string, text: string): Promise<SaveResult | null> {
  const picker = pickers().showSaveFilePicker;
  if (typeof picker === "function") {
    try {
      const handle = await picker.call(window, { suggestedName: markdownFileName(name), types: PICKER_TYPES });
      await writeToHandle(handle, text);
      return { name: handle.name, handle };
    } catch (e) {
      if (isAbort(e)) return null;
      throw e;
    }
  }
  return { name: downloadMarkdown(name, text), handle: null };
}
