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
