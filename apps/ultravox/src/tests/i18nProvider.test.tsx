/**
 * Behavioral tests for I18nProvider's language clamping.
 *
 * Regression test for v0.19.x: I18nProvider had two defensive clamps
 * hardcoded to `"en" | "de"` left over from v0.18.8 — when the user
 * picked "es" or "sv" via the language picker, the saved value
 * propagated through settings:saved but the provider's listener
 * silently ignored it. The UI text stayed in English while the
 * picker showed the new selection. Symptom: "I can see the switch
 * but the translations don't apply."
 *
 * These tests verify all four canonical Lang values flow through.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { I18nProvider, useT } from "../lib/i18n/I18nProvider";

// Mock loadSettings directly — bypasses the full settings-load chain
// (migrations, mergeWithDefaults, etc.) so the test focuses on just
// I18nProvider's hydration clamp behavior.
// vi.mock is hoisted to top-of-file by vitest, so we can't reference
// outer-scope variables in the factory. Use vi.hoisted() to declare
// the mock fn at hoist-time and re-use it in tests.
const { loadSettingsMock } = vi.hoisted(() => ({ loadSettingsMock: vi.fn() }));
vi.mock("../lib/store-bridge", async () => {
  const actual = await vi.importActual<typeof import("../lib/store-bridge")>("../lib/store-bridge");
  return {
    ...actual,
    loadSettings: loadSettingsMock,
  };
});

// Mock the Tauri event listen — we don't need cross-window in these tests.
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
  emit: vi.fn().mockResolvedValue(undefined),
}));

function TestProbe() {
  const t = useT();
  // Pull a single en/de/es/sv-distinct string so we can assert the
  // language flowed all the way through to a consumer.
  return <p data-testid="probe">{t.panels.home.sectionVoice}</p>;
}

describe("I18nProvider — hydration clamping (v0.19.x regression)", () => {
  beforeEach(() => {
    loadSettingsMock.mockReset();
  });

  it("hydrates from saved uiLanguage=en", async () => {
    loadSettingsMock.mockResolvedValue({ uiLanguage: "en" });
    render(
      <I18nProvider>
        <TestProbe />
      </I18nProvider>,
    );
    // English: "Voice"
    await waitFor(() => {
      expect(screen.getByTestId("probe").textContent).toBe("Voice");
    });
  });

  it("hydrates from saved uiLanguage=de", async () => {
    loadSettingsMock.mockResolvedValue({ uiLanguage: "de" });
    render(
      <I18nProvider>
        <TestProbe />
      </I18nProvider>,
    );
    // German: "Sprache"
    await waitFor(() => {
      expect(screen.getByTestId("probe").textContent).toBe("Sprache");
    });
  });

  it("hydrates from saved uiLanguage=es (regression)", async () => {
    loadSettingsMock.mockResolvedValue({ uiLanguage: "es" });
    render(
      <I18nProvider>
        <TestProbe />
      </I18nProvider>,
    );
    // Spanish: "Voz"
    await waitFor(() => {
      expect(screen.getByTestId("probe").textContent).toBe("Voz");
    });
  });

  it("hydrates from saved uiLanguage=sv (regression)", async () => {
    loadSettingsMock.mockResolvedValue({ uiLanguage: "sv" });
    render(
      <I18nProvider>
        <TestProbe />
      </I18nProvider>,
    );
    // Swedish: "Röst"
    await waitFor(() => {
      expect(screen.getByTestId("probe").textContent).toBe("Röst");
    });
  });

  it("ignores invalid uiLanguage values (defensive — defaults to en)", async () => {
    loadSettingsMock.mockResolvedValue({ uiLanguage: "klingon" });
    render(
      <I18nProvider>
        <TestProbe />
      </I18nProvider>,
    );
    // Should NOT crash, should fall back to English.
    await waitFor(() => {
      expect(screen.getByTestId("probe").textContent).toBe("Voice");
    });
  });
});
