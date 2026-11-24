export interface Stats {
  words: number;
  characters: number;
  lines: number;
  readingMinutes: number;
}

const WORDS_PER_MINUTE = 200;

export function computeStats(text: string): Stats {
  const trimmed = text.trim();
  const words = trimmed === "" ? 0 : trimmed.split(/\s+/).length;
  return {
    words,
    characters: Array.from(text).length,
    lines: text === "" ? 0 : text.split("\n").length,
    readingMinutes: words === 0 ? 0 : Math.max(1, Math.round(words / WORDS_PER_MINUTE)),
  };
}

export function formatStats(s: Stats): string {
  return `${String(s.words)} words · ${String(s.characters)} chars · ${String(s.readingMinutes)} min read`;
}
