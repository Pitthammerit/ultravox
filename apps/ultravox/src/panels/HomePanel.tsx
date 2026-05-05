import type { AppSettings } from "../lib/store-bridge";
import {
  HotkeyChip,
  NavCard,
  Row,
  Section,
  ToggleRow,
  tokens,
} from "../components/ui";

interface HomePanelProps {
  settings: AppSettings;
  onNavigate: (s: "modes" | "vocabulary" | "configuration" | "sound" | "history") => void;
  onChange: (patch: Partial<AppSettings>) => Promise<void>;
}

export default function HomePanel({ settings, onNavigate, onChange }: HomePanelProps) {
  const activeMode = settings.modes.find((m) => m.id === settings.activeModeId);

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

      <Section label="Shortcuts">
        <Row label="Record toggle" control={<HotkeyChip>{settings.hotkeyRecord}</HotkeyChip>} />
        <Row label="Mode switcher" control={<HotkeyChip>{settings.hotkeyModeOverlay}</HotkeyChip>} />
      </Section>

      <Section label="Recording">
        <ToggleRow
          label="Push-to-talk"
          description="Hold the hotkey while speaking instead of toggle"
          checked={settings.recordingStyle === "push-to-talk"}
          onChange={(v) => onChange({ recordingStyle: v ? "push-to-talk" : "toggle" })}
        />
      </Section>

      <Section title="App">
        <NavCard
          title="Configuration"
          subtitle="Theme · appearance"
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
