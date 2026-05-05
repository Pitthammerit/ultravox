export interface VocabularyEntry {
  input: string;
  replace: string | null;
}

const HINT_MAX_CHARS = 200;

export function buildHintString(vocabulary: VocabularyEntry[]): string {
  if (!Array.isArray(vocabulary)) return "";
  const hints = vocabulary
    .filter(
      (e) =>
        e && typeof e.input === "string" && (e.replace == null || e.replace === ""),
    )
    .map((e) => e.input.trim())
    .filter(Boolean);

  if (hints.length === 0) return "";
  const joined = hints.join(", ");
  if (joined.length <= HINT_MAX_CHARS) return joined;
  return joined.slice(0, HINT_MAX_CHARS - 3).replace(/[,\s]+$/, "") + "...";
}

export function getReplacePairs(
  vocabulary: VocabularyEntry[],
): Array<{ input: string; replace: string }> {
  if (!Array.isArray(vocabulary)) return [];
  return vocabulary
    .filter(
      (e) =>
        e &&
        typeof e.input === "string" &&
        e.input.trim() !== "" &&
        typeof e.replace === "string" &&
        e.replace !== "",
    )
    .map((e) => ({ input: e.input, replace: e.replace as string }));
}
