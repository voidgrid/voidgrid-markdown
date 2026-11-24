# Using the editor

Everything happens in your browser. The server only delivers the app; your text is never sent to it.

## Layout

- **Top bar:** the file name (editable), the flavour picker, and the Edit / Split / Preview switch. On a
  narrow screen Split shows only the editor; use Preview to read.
- **File bar:** New, Open, Save, Save as .md, Export, Sync scroll, Outline and Problems.
- **Tabs:** one per document. A dot marks unsaved changes; × closes the tab.
- **Formatting bar:** bold, italic, strikethrough, code, link, headings, lists, task, quote, code block,
  table, rule, and Find.
- **Status bar:** cursor position, word, character and reading-time counts (200 words a minute), the
  flavour's description, and whether the document is saved.

## Documents and autosave

Each document is a tab. Edits are kept in the browser's local storage about 0.4 seconds after you stop
typing, and when the tab is hidden or closed, so a crash, reload or closed tab loses nothing. The next visit
restores your tabs, the active one, and your settings (flavour, view, outline, problems, scroll sync).

Things to know:

- Storage belongs to one browser profile on one site address. Another browser, a private window or a
  different URL starts empty, and anyone sharing your browser profile sees your drafts.
- Browsers allow about 5 MB per site. If storage is full or blocked you get a warning and drafts stop
  being kept; save to disk. In a private window the app falls back to memory and forgets everything on close.
- Closing a tab with unsaved changes asks before it throws the draft away.

## Opening files

- **Open** (Ctrl+O): pick one or more files. In Chrome and Edge this is the native dialog and the document
  remembers its file; elsewhere it is a file input.
- **Drag and drop** files onto the window. Names ending in `.md`, `.markdown`, `.mdown`, `.mkd` or `.txt`,
  or files the browser calls text, are opened; others are skipped with a message.
- Files over **10 MB** or that contain NUL bytes (binary) are refused. Text is read as UTF-8 and a leading
  byte order mark is dropped.

## Saving

| Action | Chrome, Edge | Firefox, Safari |
|---|---|---|
| **Save** (Ctrl+S), file known | Writes back to the same file | Downloads the file |
| **Save** with no file yet | Native Save dialog | Downloads the file |
| **Save as .md** (Ctrl+Shift+S) | Native Save dialog | Downloads the file |
| **Export → Markdown (.md)** | Downloads the file | Downloads the file |

- File names always end in a markdown extension; unsafe characters become `-`.
- Save in place needs a secure context: `https://` or `http://localhost`.
- A document knows its disk file only for the current page load. After a reload the draft is restored but
  the next Save asks where to put it. Renaming the document also makes the next Save ask.
- The status bar reads `saved to disk`, `saved` (downloaded), or `unsaved changes`.

## Export

- **HTML:** one standalone file with the rendered document and its own dark stylesheet, no scripts, and a
  policy that blocks everything except https and inline images. The title comes from the front matter
  `title`, else the first heading, else the file name.
- **PDF:** opens the browser's print dialog showing only the rendered document on white; choose "Save as
  PDF". Print the Preview or Split view; Edit view prints an empty page.

## Flavours

Pick one in the top bar. It applies to the preview and exports and is remembered.

| Flavour | Adds |
|---|---|
| **CommonMark** | The strict spec: no tables, strikethrough, task lists, autolinks, alerts or diagrams. Raw HTML allowed (sanitized). |
| **GitHub (GFM)** | Tables, strikethrough, task lists (read-only checkboxes), autolinked URLs, alerts (`> [!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]`), Mermaid. |
| **Extended** | GFM plus footnotes (`[^1]`), definition lists, subscript `H~2~O`, superscript `x^2^`, `==mark==`, abbreviations (`*[HTML]: ...`), `:emoji:` shortcodes, and `::: note`, `tip`, `info`, `warning`, `danger` containers closed by `:::`. |

## Preview

- **Code:** fenced blocks with a known language are highlighted (highlight.js "common" set); unknown
  languages show as plain code.
- **Front matter:** a `---` YAML block on the very first line is shown as a collapsible table and left out
  of the body. Invalid YAML is reported instead of failing.
- **Mermaid:** a fence tagged `mermaid` becomes a diagram (GFM and Extended). The library loads the first
  time a document has one. Errors in the diagram source are shown in place.
- **Raw HTML** is allowed but sanitized; see [Security](security.md).
- **Sync scroll** keeps editor and preview aligned in Split view.

## Validator

markdownlint checks as you type. Warnings appear as underlines and gutter markers, and in the **Problems**
panel, where a click jumps to the line. Line length (MD013) is off. Front matter is understood, and a
`title:` in it does not count as a heading.

## Outline

**Outline** lists the document's headings, indented by level; click one to jump there.

## Shortcuts

| Keys | Action |
|---|---|
| Ctrl+O | Open |
| Ctrl+S | Save |
| Ctrl+Shift+S | Save as .md |
| Ctrl+B, Ctrl+I, Ctrl+E | Bold, italic, inline code |
| Ctrl+K | Link |
| Ctrl+F | Find and replace |
| Ctrl+Z, Ctrl+Shift+Z | Undo, redo |

Use Cmd instead of Ctrl on a Mac.
