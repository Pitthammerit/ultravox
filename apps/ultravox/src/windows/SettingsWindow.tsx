import { useEffect, useState } from "react";
import { BRANDING } from "../branding";
import HomePanel from "../panels/HomePanel";
import ModesPanel from "../panels/ModesPanel";
import VocabularyPanel from "../panels/VocabularyPanel";
import ConfigurationPanel from "../panels/ConfigurationPanel";
import SoundPanel from "../panels/SoundPanel";
import HistoryPanel from "../panels/HistoryPanel";
import { loadSettings, saveSettings, type AppSettings } from "../lib/store-bridge";

type PanelId = "home" | "modes" | "vocabulary" | "configuration" | "sound" | "history";

const SIDEBAR: Array<{ id: PanelId; label: string }> = [
  { id: "home",          label: "Home" },
  { id: "modes",         label: "Modes" },
  { id: "vocabulary",    label: "Vocabulary" },
  { id: "configuration", label: "Configuration" },
  { id: "sound",         label: "Sound" },
  { id: "history",       label: "History" },
];

export default function SettingsWindow() {
  const [active, setActive] = useState<PanelId>("home");
  const [settings, setSettings] = useState<AppSettings | null>(null);

  useEffect(() => {
    loadSettings().then(setSettings);
  }, []);

  const update = async (patch: Partial<AppSettings>) => {
    if (!settings) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    await saveSettings(next);
  };

  if (!settings) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-color-bg-light">
        <p className="typography-body text-color-secondary">Loading…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex bg-color-bg-light text-color-text">
      <aside className="w-56 shrink-0 border-r border-color-ink-15 bg-color-surface flex flex-col">
        <div className="px-4 py-5 border-b border-color-ink-15">
          <h1 className="typography-h3 text-color-primary">{BRANDING.appName}</h1>
        </div>
        <nav className="flex-1 p-2 flex flex-col gap-0.5">
          {SIDEBAR.map((item) => {
            const isActive = item.id === active;
            return (
              <button
                key={item.id}
                onClick={() => setActive(item.id)}
                className={`text-left px-3 py-2 rounded-md typography-menu-text transition-colors ${
                  isActive
                    ? "bg-color-primary text-primary-on-dark"
                    : "text-color-text hover:bg-color-surface-hover"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="px-4 py-3 border-t border-color-ink-15">
          <p className="typography-meta text-color-secondary">v0.1.0</p>
        </div>
      </aside>

      <section className="flex-1 overflow-auto">
        <div className="max-w-3xl mx-auto p-8">
          {active === "home"          && <HomePanel settings={settings} />}
          {active === "modes"         && <ModesPanel settings={settings} onChange={update} />}
          {active === "vocabulary"    && <VocabularyPanel settings={settings} onChange={update} />}
          {active === "configuration" && <ConfigurationPanel settings={settings} onChange={update} />}
          {active === "sound"         && <SoundPanel />}
          {active === "history"       && <HistoryPanel />}
        </div>
      </section>
    </main>
  );
}
