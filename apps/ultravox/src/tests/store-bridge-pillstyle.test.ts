import { describe, it, expect } from "vitest";
import { __test__mergeWithDefaults as mergeWithDefaults } from "../lib/store-bridge";

describe("mergeWithDefaults — pillStyle ↔ compactPill lockstep", () => {
  it("preserves explicit pillStyle when stored", () => {
    const out = mergeWithDefaults({ pillStyle: "classic" } as never);
    expect(out.pillStyle).toBe("classic");
  });

  it("falls back to compactPill when pillStyle missing", () => {
    const out = mergeWithDefaults({ sound: { compactPill: true } } as never);
    expect(out.pillStyle).toBe("mini");
  });

  it("heals diverged state: pillStyle=classic + compactPill=true → both classic", () => {
    const out = mergeWithDefaults({
      pillStyle: "classic",
      sound: { compactPill: true },
    } as never);
    expect(out.pillStyle).toBe("classic");
    expect(out.sound.compactPill).toBe(false);
  });

  it("heals diverged state: pillStyle=mini + compactPill=false → both mini", () => {
    const out = mergeWithDefaults({
      pillStyle: "mini",
      sound: { compactPill: false },
    } as never);
    expect(out.pillStyle).toBe("mini");
    expect(out.sound.compactPill).toBe(true);
  });

  it("default: no stored value → classic + compactPill=false", () => {
    const out = mergeWithDefaults(null as never);
    expect(out.pillStyle).toBe("classic");
    expect(out.sound.compactPill).toBe(false);
  });
});
