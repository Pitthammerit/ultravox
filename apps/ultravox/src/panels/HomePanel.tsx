import type { AppSettings } from "../lib/store-bridge";
import { BRANDING } from "../branding";

interface HomePanelProps {
  settings: AppSettings;
}

export default function HomePanel({ settings }: HomePanelProps) {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h2 className="typography-h2 text-color-primary">Welcome to {BRANDING.appName}</h2>
        <p className="typography-body-narrative text-color-text">
          Voice-dictate into any app on your Mac. Press the hotkey, speak, release —
          the cleaned text appears where your cursor is.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-4">
        <Card label="Record hotkey"   value={settings.hotkeyRecord} />
        <Card label="Mode switcher"   value={settings.hotkeyModeOverlay} />
        <Card label="Active mode"     value={settings.activeModeId} />
        <Card label="Saved modes"     value={String(settings.modes.length)} />
        <Card label="Vocabulary"      value={`${settings.vocabulary.length} entries`} />
        <Card label="Theme"           value={settings.theme} />
      </div>

      <p className="typography-meta text-color-secondary">
        Tip: Try dictating into Mail, Slack, or Notes — Ultravox auto-picks the best mode for the focused app.
      </p>
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-color-ink-15 bg-color-surface p-4 flex flex-col gap-1">
      <div className="typography-label">{label}</div>
      <div className="typography-h4 text-color-primary">{value}</div>
    </div>
  );
}
