import { describe, it, expect } from "vitest";
import { __test__stripSoundAnnotations as stripSoundAnnotations } from "../lib/transcribe";

describe("stripSoundAnnotations — BLANK_AUDIO and related variants", () => {
  it("strips [BLANK_AUDIO] anywhere in the text", () => {
    expect(stripSoundAnnotations("Hello [BLANK_AUDIO] world")).toBe("Hello world");
  });
  it("strips lowercase variant", () => {
    expect(stripSoundAnnotations("[blank_audio]")).toBe("");
  });
  it("strips spaced variant", () => {
    expect(stripSoundAnnotations("foo [blank audio] bar")).toBe("foo bar");
  });
  it("strips a transcript that is ONLY the tag", () => {
    expect(stripSoundAnnotations("[BLANK_AUDIO]")).toBe("");
  });
});

describe("stripSoundAnnotations — language-aware sound tags", () => {
  it("strips [SPEAKING GERMAN]", () => {
    expect(stripSoundAnnotations("Hallo [SPEAKING GERMAN] welt")).toBe("Hallo welt");
  });
  it("strips [SPEAKING SPANISH]", () => {
    expect(stripSoundAnnotations("[SPEAKING SPANISH]")).toBe("");
  });
  it("strips multi-word language [SPEAKING NON-ENGLISH]", () => {
    expect(stripSoundAnnotations("[SPEAKING NON-ENGLISH]")).toBe("");
  });
  it("strips [FOREIGN LANGUAGE]", () => {
    expect(stripSoundAnnotations("foo [FOREIGN LANGUAGE] bar")).toBe("foo bar");
  });
  it("strips [NON-ENGLISH SPEECH]", () => {
    expect(stripSoundAnnotations("[NON-ENGLISH SPEECH]")).toBe("");
  });
  it("strips [SINGING IN ITALIAN]", () => {
    expect(stripSoundAnnotations("Lyrics: [SINGING IN ITALIAN] more lyrics")).toBe("Lyrics: more lyrics");
  });
  it("strips compound tags [BACKGROUND CONVERSATION] and [CROWD CHATTER]", () => {
    expect(stripSoundAnnotations("[BACKGROUND CONVERSATION]")).toBe("");
    expect(stripSoundAnnotations("[CROWD CHATTER] now back to me")).toBe("now back to me");
  });
  it("strips [INSTRUMENTAL] and [MUSIC PLAYING]", () => {
    expect(stripSoundAnnotations("[INSTRUMENTAL]")).toBe("");
    expect(stripSoundAnnotations("[MUSIC PLAYING] hello")).toBe("hello");
  });
  it("does NOT strip user content that happens to use brackets", () => {
    // Plain non-tag bracketed text should stay (the speaker may have dictated
    // a bracket character). Only matches against the curated list.
    expect(stripSoundAnnotations("note: [TODO refactor this]")).toBe("note: [TODO refactor this]");
    expect(stripSoundAnnotations("citation [smith 2024]")).toBe("citation [smith 2024]");
  });
});
