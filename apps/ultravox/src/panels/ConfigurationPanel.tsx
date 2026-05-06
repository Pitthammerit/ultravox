import { useState, useEffect, useCallback } from "react";
import type { AppSettings } from "../lib/store-bridge";
import { applyTheme, type ThemeChoice } from "@ultravox/design-system";
import { resetSettings, DEFAULT_SETTINGS } from "../lib/store-bridge";
import { Button, Row, Section, Segmented } from "../components/ui";
import { HotkeyRecorder } from "../components/HotkeyRecorder";
import { registerHotkeys, checkAccessibilityPermission, requestAccessibilityPermission } from "../lib/tauri-bridge";

interface ConfigurationPanelProps {
  settings: AppSettings;
  onChange: (patch: Partial<AppSettings>) => Promise<void>;
}

export default function ConfigurationPanel({ settings, onChange }: ConfigurationPanelProps) {
  const [axGranted, setAxGranted] = useState<boolean | null>(null);
  const [axRequesting, setAxRequesting] = useState(false);
  const [resetConfirming, setResetConfirming] = useState(false);

  useEffect(() => {
    checkAccessibilityPermission().then(setAxGranted).catch(() => setAxGranted(false));
  }, []);

  const grantAx = useCallback(async () => {
    setAxRequesting(true);
    const already = await requestAccessibilityPermission().catch(() => false);
    setAxRequesting(false);
    if (already) {
      setAxGranted(true);
    }
    // If not already granted, user must go to System Settings and then click Refresh.
  }, []);

  const recheckAx = useCallback(async () => {
    const granted = await checkAccessibilityPermission().catch(() => false);
    setAxGranted(granted);
  }, []);
  const appearance: "light" | "dark" | "auto" =
    settings.theme === "auto"
      ? "auto"
      : settings.theme === "light"
      ? "light"
      : "dark";
  const darkVariant: "ocean" | "night" =
    settings.theme === "dark-night" ? "night" : "ocean";

  const setAppearance = async (next: "light" | "dark" | "auto") => {
    let theme: ThemeChoice;
    if (next === "light") theme = "light";
    else if (next === "auto") theme = "auto";
    else theme = darkVariant === "night" ? "dark-night" : "dark-ocean";
    await onChange({ theme });
    applyTheme(theme);
  };

  const setDarkVariant = async (next: "ocean" | "night") => {
    const theme: ThemeChoice = next === "night" ? "dark-night" : "dark-ocean";
    await onChange({ theme });
    applyTheme(theme);
  };

  const recordDup =
    settings.hotkeyRecord !== "" &&
    settings.hotkeyRecord === settings.hotkeyModeOverlay;

  const updateHotkey = async (key: "hotkeyRecord" | "hotkeyModeOverlay", v: string) => {
    const next = { ...settings, [key]: v };
    await onChange({ [key]: v });
    // Re-register globally so the new combo takes effect immediately.
    try {
      await registerHotkeys(next.hotkeyRecord, next.hotkeyModeOverlay);
    } catch (e) {
      console.warn("hotkey register failed:", e);
    }
  };

  const reset = async () => {
    if (!resetConfirming) {
      setResetConfirming(true);
      // Auto-cancel after 4 s if the user doesn't confirm.
      setTimeout(() => setResetConfirming(false), 4000);
      return;
    }
    setResetConfirming(false);
    await resetSettings();
    applyTheme(DEFAULT_SETTINGS.theme);
    try {
      await registerHotkeys(
        DEFAULT_SETTINGS.hotkeyRecord,
        DEFAULT_SETTINGS.hotkeyModeOverlay,
      );
    } catch { /* ignore */ }
    window.location.reload();
  };

  return (
    <>
      <Section label="Appearance">
        <Row
          label="Theme"
          control={
            <Segmented<"light" | "dark" | "auto">
              options={[
                { id: "light", label: "Light" },
                { id: "dark", label: "Dark" },
                { id: "auto", label: "Auto" },
              ]}
              value={appearance}
              onChange={setAppearance}
            />
          }
        />
        {appearance !== "light" && (
          <Row
            label="Dark variant"
            control={
              <Segmented<"ocean" | "night">
                options={[
                  { id: "ocean", label: "Ocean" },
                  { id: "night", label: "Night" },
                ]}
                value={darkVariant}
                onChange={setDarkVariant}
              />
            }
          />
        )}
      </Section>

      <Section
        label="Shortcuts"
        help="Click a chip to record a new combo. Esc cancels, Backspace clears."
      >
        <Row
          label="Record toggle"
          control={
            <HotkeyRecorder
              value={settings.hotkeyRecord}
              onChange={(v) => updateHotkey("hotkeyRecord", v)}
              error={recordDup}
            />
          }
        />
        <Row
          label="Mode switcher"
          control={
            <HotkeyRecorder
              value={settings.hotkeyModeOverlay}
              onChange={(v) => updateHotkey("hotkeyModeOverlay", v)}
              error={recordDup}
            />
          }
        />
      </Section>

      <Section
        label="Permissions"
        help="Required for Ultravox to paste transcriptions into other apps."
      >
        <Row
          label="Accessibility access"
          description={
            axGranted === true
              ? "Granted — paste works correctly."
              : axGranted === false
              ? "Not granted — transcriptions can't be pasted."
              : "Checking…"
          }
          control={
            axGranted ? (
              <span className="text-[12px] text-color-accent font-medium">✓ Granted</span>
            ) : (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="xs"
                  onClick={grantAx}
                  disabled={axRequesting}
                >
                  {axRequesting ? "Waiting…" : "Grant Access"}
                </Button>
                {axGranted === false && !axRequesting && (
                  <button
                    onClick={recheckAx}
                    className="text-[12px] text-color-secondary hover:text-color-primary underline"
                  >
                    Refresh
                  </button>
                )}
              </div>
            )
          }
        />
      </Section>

      <Section label="Maintenance">
        <Row
          label="Reset to defaults"
          description="Restore all preferences. History is preserved."
          control={
            <Button
              variant="outline"
              size="xs"
              onClick={reset}
              style={resetConfirming ? { borderColor: "var(--color-warning)", color: "var(--color-warning)" } : {}}
            >
              {resetConfirming ? "Click again to confirm" : "Reset"}
            </Button>
          }
        />
      </Section>
    </>
  );
}
