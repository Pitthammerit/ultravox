import { useEffect } from "react";
import type { AppSettings } from "../lib/store-bridge";
import { applyTheme, type ThemeChoice } from "@ultravox/design-system";

interface ConfigurationPanelProps {
  settings: AppSettings;
  onChange: (patch: Partial<AppSettings>) => Promise<void>;
}

const THEMES: Array<{ id: ThemeChoice; label: string; bg: string; accent: string }> = [
  { id: "auto",       label: "Auto",       bg: "#EDE7DC", accent: "#224160" },
  { id: "light",      label: "Light",      bg: "#EDE7DC", accent: "#224160" },
  { id: "dark-ocean", label: "Dark Ocean", bg: "#0F2A40", accent: "#7696AD" },
  { id: "dark-night", label: "Dark Night", bg: "#0A0E14", accent: "#7696AD" },
];

export default function ConfigurationPanel({ settings, onChange }: ConfigurationPanelProps) {
  // Apply theme immediately on mount + on change
  useEffect(() => {
    applyTheme(settings.theme);
  }, [settings.theme]);

  const setTheme = async (theme: ThemeChoice) => {
    await onChange({ theme });
    applyTheme(theme);
  };

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h2 className="typography-h3 text-color-primary">Configuration</h2>
      </header>

      <section className="flex flex-col gap-3">
        <div className="typography-label">Theme</div>
        <div className="grid grid-cols-4 gap-2">
          {THEMES.map((t) => {
            const isActive = t.id === settings.theme;
            return (
              <button
                key={t.id}
                onClick={() => setTheme(t.id)}
                className={`flex flex-col gap-2 p-3 rounded-lg border transition-colors ${
                  isActive
                    ? "border-color-primary bg-color-primary text-primary-on-dark"
                    : "border-color-ink-15 bg-color-surface text-color-text hover:bg-color-surface-hover"
                }`}
              >
                <div className="flex gap-1">
                  <div
                    className="w-5 h-5 rounded-full border border-color-ink-15"
                    style={{ background: t.bg }}
                  />
                  <div
                    className="w-5 h-5 rounded-full border border-color-ink-15"
                    style={{ background: t.accent }}
                  />
                </div>
                <span className="typography-menu-text">{t.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="typography-label">Hotkeys</div>
        <Row label="Record toggle" value={settings.hotkeyRecord} />
        <Row label="Mode switcher" value={settings.hotkeyModeOverlay} />
        <p className="typography-meta text-color-secondary">
          Hotkey editing will arrive in v1.1. Defaults are active now.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <div className="typography-label">Recording style</div>
        <div className="flex gap-2">
          {(["toggle", "push-to-talk"] as const).map((style) => {
            const isActive = settings.recordingStyle === style;
            return (
              <button
                key={style}
                onClick={() => onChange({ recordingStyle: style })}
                className={`px-4 py-2 rounded-full typography-menu-text border transition-colors ${
                  isActive
                    ? "bg-color-primary text-primary-on-dark border-color-primary"
                    : "bg-color-surface text-color-text border-color-ink-15 hover:bg-color-surface-hover"
                }`}
              >
                {style === "toggle" ? "Toggle (tap to start/stop)" : "Push-to-talk (hold)"}
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-color-ink-15 bg-color-surface px-4 py-3">
      <span className="typography-body">{label}</span>
      <code className="typography-meta px-2 py-1 rounded bg-color-bg-light text-color-primary">
        {value}
      </code>
    </div>
  );
}
