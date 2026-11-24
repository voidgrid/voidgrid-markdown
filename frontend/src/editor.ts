import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { type Diagnostic, lintGutter, lintKeymap, linter } from "@codemirror/lint";
import { highlightSelectionMatches, search, searchKeymap } from "@codemirror/search";
import { EditorState, type Extension } from "@codemirror/state";
import { drawSelection, EditorView, highlightActiveLine, keymap, lineNumbers } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { insertLink, wrapSelection } from "./commands";
import { lintMarkdown, type Problem } from "./lint";

const theme = EditorView.theme(
  {
    "&": { height: "100%", color: "var(--text)", backgroundColor: "var(--bg)" },
    ".cm-scroller": { fontFamily: "var(--font)", lineHeight: "1.6", overflow: "auto" },
    ".cm-content": { caretColor: "var(--accent)", padding: "12px 0" },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--accent)", borderLeftWidth: "2px" },
    "&.cm-focused": { outline: "2px solid var(--accent)", outlineOffset: "-2px" },
    ".cm-activeLine": { backgroundColor: "rgba(51, 255, 102, 0.06)" },
    ".cm-selectionBackground, &.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, ::selection": {
      backgroundColor: "rgba(51, 255, 102, 0.28)",
    },
    ".cm-gutters": { backgroundColor: "var(--bg)", color: "var(--muted)", border: "none", borderRight: "1px solid var(--line)" },
    ".cm-activeLineGutter": { backgroundColor: "rgba(51, 255, 102, 0.06)", color: "var(--text)" },
    ".cm-panels": { backgroundColor: "var(--panel)", color: "var(--text)", borderColor: "var(--line)" },
    ".cm-panels input, .cm-panels button": {
      font: "inherit", color: "var(--text)", backgroundColor: "var(--bg)",
      border: "1px solid var(--line)", borderRadius: "2px",
    },
    ".cm-panels button:hover": { borderColor: "var(--accent)" },
    ".cm-searchMatch": { backgroundColor: "rgba(255, 176, 0, 0.35)" },
    ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "rgba(0, 255, 102, 0.45)" },
    ".cm-tooltip": { backgroundColor: "var(--panel)", color: "var(--text)", border: "1px solid var(--line)" },
    ".cm-diagnostic-warning": { borderLeft: "3px solid var(--warn)" },
  },
  { dark: true },
);

const highlightStyle = HighlightStyle.define([
  { tag: tags.heading, color: "#00ff66", fontWeight: "bold" },
  { tag: tags.strong, fontWeight: "bold", color: "#99ffbb" },
  { tag: tags.emphasis, fontStyle: "italic", color: "#99ffbb" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: tags.link, color: "#00ffcc", textDecoration: "underline" },
  { tag: tags.url, color: "#00ffcc" },
  { tag: tags.monospace, color: "#ffb000" },
  { tag: tags.quote, color: "#1fa84a" },
  { tag: tags.processingInstruction, color: "#1fa84a" },
  { tag: tags.contentSeparator, color: "#1fa84a" },
  { tag: tags.comment, color: "#1fa84a" },
]);

export interface EditorCallbacks {
  onChange(text: string): void;
  onProblems(problems: Problem[]): void;
  onCursor(line: number, column: number): void;
}

function toDiagnostics(view: EditorView, problems: Problem[]): Diagnostic[] {
  const doc = view.state.doc;
  return problems
    .filter((p) => p.line >= 1 && p.line <= doc.lines)
    .map((p): Diagnostic => {
      const line = doc.line(p.line);
      const from = p.column > 0 ? Math.min(line.from + p.column - 1, line.to) : line.from;
      const to = p.length > 0 ? Math.min(from + p.length, line.to) : line.to;
      return {
        from,
        to: Math.max(to, from),
        severity: "warning",
        source: p.rule,
        message: p.detail === "" ? p.description : `${p.description} (${p.detail})`,
      };
    });
}

export class Editor {
  readonly view: EditorView;

  constructor(parent: HTMLElement, text: string, private readonly cb: EditorCallbacks) {
    this.view = new EditorView({ parent, state: this.createState(text) });
  }

  createState(text: string): EditorState {
    const extensions: Extension[] = [
      lineNumbers(),
      history(),
      drawSelection(),
      highlightActiveLine(),
      highlightSelectionMatches(),
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({ "aria-label": "Markdown editor", spellcheck: "true" }),
      markdown(),
      theme,
      syntaxHighlighting(highlightStyle),
      search({ top: true }),
      lintGutter(),
      linter(
        async (view) => {
          const problems = await lintMarkdown(view.state.doc.toString());
          this.cb.onProblems(problems);
          return toDiagnostics(view, problems);
        },
        { delay: 500 },
      ),
      keymap.of([
        { key: "Mod-b", run: (v) => (wrapSelection(v, "**"), true) },
        { key: "Mod-i", run: (v) => (wrapSelection(v, "*"), true) },
        { key: "Mod-e", run: (v) => (wrapSelection(v, "`"), true) },
        { key: "Mod-k", run: (v) => (insertLink(v), true) },
        ...defaultKeymap,
        ...historyKeymap,
        ...searchKeymap,
        ...lintKeymap,
      ]),
      EditorView.updateListener.of((u) => {
        if (u.docChanged) this.cb.onChange(u.state.doc.toString());
        if (u.docChanged || u.selectionSet) {
          const head = u.state.selection.main.head;
          const line = u.state.doc.lineAt(head);
          this.cb.onCursor(line.number, head - line.from + 1);
        }
      }),
    ];
    return EditorState.create({ doc: text, extensions });
  }

  getText(): string {
    return this.view.state.doc.toString();
  }

  /** Switches to another document's state; a fresh one is made when `state` is undefined. */
  setState(state: EditorState): void {
    this.view.setState(state);
    this.cb.onChange(state.doc.toString());
    const head = state.selection.main.head;
    const line = state.doc.lineAt(head);
    this.cb.onCursor(line.number, head - line.from + 1);
  }

  replaceAll(text: string): void {
    this.view.dispatch({ changes: { from: 0, to: this.view.state.doc.length, insert: text } });
  }

  /** Moves the cursor to a zero-based line and scrolls it to the top of the editor. */
  goToLine(line: number): void {
    const n = Math.min(Math.max(line + 1, 1), this.view.state.doc.lines);
    const pos = this.view.state.doc.line(n).from;
    this.view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: "start", yMargin: 8 }) });
    this.view.focus();
  }

  focus(): void {
    this.view.focus();
  }
}
