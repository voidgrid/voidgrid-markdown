import { lint } from "markdownlint/promise";

export interface Problem {
  /** One-based. */
  line: number;
  /** One-based, or 0 when the rule reports the whole line. */
  column: number;
  length: number;
  rule: string;
  description: string;
  detail: string;
}

// Line length is the one default rule that is noise in a prose editor, and a front matter "title:" next
// to a "# heading" is normal (the site generator shows one, the preview shows the other); everything
// else stays on.
const CONFIG = { default: true, MD013: false, MD025: { front_matter_title: "" } };

export async function lintMarkdown(text: string): Promise<Problem[]> {
  const result = await lint({ strings: { doc: text }, config: CONFIG });
  const errors = result["doc"] ?? [];
  return errors
    .map((e) => ({
      line: e.lineNumber,
      column: e.errorRange?.[0] ?? 0,
      length: e.errorRange?.[1] ?? 0,
      rule: e.ruleNames.join("/"),
      description: e.ruleDescription,
      detail: e.errorDetail ?? "",
    }))
    .sort((a, b) => a.line - b.line || a.column - b.column);
}
