import type { AppSettings } from "../lib/store-bridge";
import { applyTheme, type ThemeChoice } from "@ultravox/design-system";
import {
  NavCard,
  Row,
  Section,
  Segmented,
  ToggleRow,
  tokens,
} from "../components/ui";
import { HotkeyRecorder } from "../components/HotkeyRecorder";
import { registerHotkeys } from "../lib/tauri-bridge";

interface HomePanelProps {
  settings: AppSettings;
  onNavigate: (s: "modes" | "vocabulary" | "configuration" | "sound" | "history") => void;
  onChange: (patch: Partial<AppSettings>) => Promise<void>;
}

export default function HomePanel({ settings, onNavigate, onChange }: HomePanelProps) {
  const activeMode = settings.modes.find((m) => m.id === settings.activeModeId);

  /* ── Theme ────────────────────────────────────────────────── */
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

  /* ── Shortcuts ────────────────────────────────────────────── */
  const recordDup =
    settings.hotkeyRecord !== "" &&
    settings.hotkeyRecord === settings.hotkeyModeOverlay;

  const updateHotkey = async (
    key: "hotkeyRecord" | "hotkeyModeOverlay",
    v: string,
  ) => {
    const next = { ...settings, [key]: v };
    await onChange({ [key]: v });
    try {
      await registerHotkeys(next.hotkeyRecord, next.hotkeyModeOverlay);
    } catch (e) {
      console.warn("hotkey register failed:", e);
    }
  };

  return (
    <>
      <Section title="Voice">
        <NavCard
          title="Modes"
          subtitle={`${settings.modes.length} saved · active: ${activeMode?.name ?? "none"}`}
          onClick={() => onNavigate("modes")}
        />
        <NavCard
          title="Vocabulary"
          subtitle={`${settings.vocabulary.length} entries · find/replace globally`}
          onClick={() => onNavigate("vocabulary")}
        />
        <NavCard
          title="Sound & Microphone"
          subtitle="Input device · auto-gain · sound effects"
          onClick={() => onNavigate("sound")}
        />
      </Section>

      <Section
        label="Recording"
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
        <ToggleRow
          label="Push-to-talk"
          description="Hold the hotkey while speaking instead of toggle"
          checked={settings.recordingStyle === "push-to-talk"}
          onChange={(v) => onChange({ recordingStyle: v ? "push-to-talk" : "toggle" })}
        />
      </Section>

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
        {appearance === "dark" && (
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

      <Section title="App">
        <NavCard
          title="Configuration"
          subtitle="Permissions · reset"
          onClick={() => onNavigate("configuration")}
        />
        <NavCard
          title="History"
          subtitle="Coming in v1.1"
          onClick={() => onNavigate("history")}
        />
      </Section>

      <p className="text-[11.5px] leading-relaxed pt-1" style={{ color: tokens.fgSubtle }}>
        Ultravox v0.1.0 · keys are managed server-side · audio is never stored.
      </p>
    </>
  );
}
