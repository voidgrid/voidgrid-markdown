// Formatting commands for the toolbar and shortcuts. They only need a state and a dispatch function, so
// they can be tested without a browser editor.

import { EditorSelection, type EditorState, type TransactionSpec } from "@codemirror/state";

export interface Target {
  state: EditorState;
  dispatch(spec: TransactionSpec): void;
}

/** Wraps the selection in before/after, or unwraps it when it is already wrapped. */
export function wrapSelection(t: Target, before: string, after: string = before, placeholder = "text"): void {
  const { state } = t;
  t.dispatch(
    state.changeByRange((range) => {
      const doc = state.doc;
      const selected = state.sliceDoc(range.from, range.to);
      const outerBefore = state.sliceDoc(Math.max(0, range.from - before.length), range.from);
      const outerAfter = state.sliceDoc(range.to, Math.min(doc.length, range.to + after.length));
      if (!range.empty && outerBefore === before && outerAfter === after) {
        return {
          changes: [
            { from: range.from - before.length, to: range.from },
            { from: range.to, to: range.to + after.length },
          ],
          range: EditorSelection.range(range.from - before.length, range.to - before.length),
        };
      }
      if (selected.startsWith(before) && selected.endsWith(after) && selected.length >= before.length + after.length) {
        const inner = selected.slice(before.length, selected.length - after.length);
        return {
          changes: { from: range.from, to: range.to, insert: inner },
          range: EditorSelection.range(range.from, range.from + inner.length),
        };
      }
      const text = selected === "" ? placeholder : selected;
      const insert = before + text + after;
      const start = range.from + before.length;
      return {
        changes: { from: range.from, to: range.to, insert },
        range: EditorSelection.range(start, start + text.length),
      };
    }),
  );
}

/** Adds a prefix to every selected line, or removes it when all of them already have it. */
export function prefixLines(t: Target, prefix: string | ((index: number) => string), strip: RegExp): void {
  const { state } = t;
  const changes: { from: number; to: number; insert: string }[] = [];
  const seen = new Set<number>();
  const lines: { from: number; text: string }[] = [];
  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from).number;
    const last = state.doc.lineAt(range.to).number;
    for (let n = first; n <= last; n++) {
      if (seen.has(n)) continue;
      seen.add(n);
      const line = state.doc.line(n);
      lines.push({ from: line.from, text: line.text });
    }
  }
  const make = (i: number): string => (typeof prefix === "function" ? prefix(i) : prefix);
  const allHave = lines.length > 0 && lines.every((l) => strip.test(l.text));
  lines.forEach((l, i) => {
    if (allHave) {
      const m = strip.exec(l.text);
      changes.push({ from: l.from, to: l.from + (m?.[0].length ?? 0), insert: "" });
    } else {
      changes.push({ from: l.from, to: l.from, insert: make(i) });
    }
  });
  t.dispatch({ changes });
}

export function setHeading(t: Target, level: number): void {
  const { state } = t;
  const marker = "#".repeat(level) + " ";
  const changes: { from: number; to: number; insert: string }[] = [];
  const seen = new Set<number>();
  for (const range of state.selection.ranges) {
    for (let n = state.doc.lineAt(range.from).number; n <= state.doc.lineAt(range.to).number; n++) {
      if (seen.has(n)) continue;
      seen.add(n);
      const line = state.doc.line(n);
      const existing = /^#{1,6}\s+/.exec(line.text)?.[0] ?? "";
      const same = existing === marker;
      changes.push({ from: line.from, to: line.from + existing.length, insert: same ? "" : marker });
    }
  }
  t.dispatch({ changes });
}

export function insertLink(t: Target): void {
  const { state } = t;
  t.dispatch(
    state.changeByRange((range) => {
      const label = state.sliceDoc(range.from, range.to) || "link text";
      const insert = `[${label}](https://)`;
      const urlStart = range.from + label.length + 3;
      return {
        changes: { from: range.from, to: range.to, insert },
        range: EditorSelection.range(urlStart, urlStart + "https://".length),
      };
    }),
  );
}

/** Inserts a block on its own lines, with a blank line before and after as markdown needs. */
export function insertBlock(t: Target, block: string, cursorOffset: number = block.length): void {
  const { state } = t;
  const range = state.selection.main;
  const line = state.doc.lineAt(range.to);
  const atLineEnd = range.to === line.to;
  const lead = line.text.trim() === "" ? "" : atLineEnd ? "\n\n" : "\n\n";
  const from = line.text.trim() === "" ? line.from : range.to;
  const to = line.text.trim() === "" ? line.to : range.to;
  const insert = `${lead}${block}\n`;
  t.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + lead.length + cursorOffset },
  });
}

export const TABLE_TEMPLATE = "| Column | Column |\n| ------ | ------ |\n| Cell   | Cell   |";
export const CODE_BLOCK_TEMPLATE = "```\ncode\n```";
