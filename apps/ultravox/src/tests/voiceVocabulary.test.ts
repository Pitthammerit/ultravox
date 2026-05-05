import { describe, it, expect } from "vitest";
import { buildHintString, getReplacePairs } from "../lib/voiceVocabulary";

describe("voiceVocabulary", () => {
  it("buildHintString includes only entries without a replacement", () => {
    const hints = buildHintString([
      { input: "Kafka", replace: "" },        // hint-only ✓
      { input: "Brötchen", replace: null },   // hint-only ✓
      { input: "kafka", replace: "Kafka" },    // replacement, excluded
      { input: "", replace: "" },              // empty input, excluded
    ]);
    expect(hints).toContain("Kafka");
    expect(hints).toContain("Brötchen");
    // The replacement-style entry should NOT appear as a hint.
    expect(hints.split(",").map((s) => s.trim())).toHaveLength(2);
  });

  it("getReplacePairs returns only entries with non-empty replacement", () => {
    const pairs = getReplacePairs([
      { input: "kafka", replace: "Kafka" },
      { input: "hint-only", replace: "" },
      { input: "another", replace: null },
    ]);
    expect(pairs).toEqual([{ input: "kafka", replace: "Kafka" }]);
  });

  it("buildHintString returns empty string for empty array", () => {
    expect(buildHintString([])).toBe("");
  });

  it("getReplacePairs returns empty array for empty input", () => {
    expect(getReplacePairs([])).toEqual([]);
  });

  it("buildHintString truncates strings longer than the limit", () => {
    const big = Array.from({ length: 50 }, (_, i) => ({
      input: `looooooong-name-${i}`,
      replace: "",
    }));
    const hints = buildHintString(big);
    expect(hints.length).toBeLessThanOrEqual(200);
  });

  it("handles non-array input gracefully", () => {
    // @ts-expect-error testing runtime safety
    expect(buildHintString(null)).toBe("");
    // @ts-expect-error testing runtime safety
    expect(getReplacePairs(undefined)).toEqual([]);
  });
});
