import type { AppSettings } from "../lib/store-bridge";
import { applyTheme, type ThemeChoice } from "@ultravox/design-system";
import { resetSettings, DEFAULT_SETTINGS } from "../lib/store-bridge";
import { Button, Row, Section, Segmented } from "../components/ui";
import { HotkeyRecorder } from "../components/HotkeyRecorder";
import { registerHotkeys } from "../lib/tauri-bridge";

interface ConfigurationPanelProps {
  settings: AppSettings;
  onChange: (patch: Partial<AppSettings>) => Promise<void>;
}

export default function ConfigurationPanel({ settings, onChange }: ConfigurationPanelProps) {
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
    if (!confirm("Reset all settings to defaults? This won't clear your history."))
      return;
    await resetSettings();
    applyTheme(DEFAULT_SETTINGS.theme);
    try {
      await registerHotkeys(
        DEFAULT_SETTINGS.hotkeyRecord,
        DEFAULT_SETTINGS.hotkeyModeOverlay,
      );
    } catch { /* ignore */ }
    // Force a reload so the React state mirrors disk.
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

      <Section label="Maintenance">
        <Row
          label="Reset to defaults"
          description="Restore all preferences. History is preserved."
          control={
            <Button variant="outline" size="xs" onClick={reset}>
              Reset
            </Button>
          }
        />
      </Section>
    </>
  );
}
