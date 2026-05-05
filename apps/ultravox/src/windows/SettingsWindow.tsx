import { useEffect, useState } from "react";
import HomePanel from "../panels/HomePanel";
import ModesPanel from "../panels/ModesPanel";
import VocabularyPanel from "../panels/VocabularyPanel";
import ConfigurationPanel from "../panels/ConfigurationPanel";
import SoundPanel from "../panels/SoundPanel";
import HistoryPanel from "../panels/HistoryPanel";
import { loadSettings, saveSettings, type AppSettings } from "../lib/store-bridge";
import { applyTheme } from "@ultravox/design-system";

type Section = "home" | "modes" | "vocabulary" | "configuration" | "sound" | "history";

const BREADCRUMBS: Record<Section, string> = {
  home: "",
  modes: "modes",
  vocabulary: "vocabulary",
  configuration: "configuration",
  sound: "sound",
  history: "history",
};

export default function SettingsWindow() {
  const [section, setSection] = useState<Section>("home");
  const [settings, setSettings] = useState<AppSettings | null>(null);

  useEffect(() => {
    loadSettings().then((s) => {
      setSettings(s);
      applyTheme(s.theme);
    });
  }, []);

  const update = async (patch: Partial<AppSettings>) => {
    if (!settings) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    await saveSettings(next);
    if (patch.theme) applyTheme(patch.theme);
  };

  if (!settings) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-color-primary">
        <p className="text-[14px] text-color-secondary">Loading…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-color-primary text-color-fg flex flex-col">
      <Header
        section={section}
        onBack={section === "home" ? null : () => setSection("home")}
      />

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="flex flex-col gap-5 max-w-md mx-auto">
          {section === "home"          && <HomePanel settings={settings} onNavigate={setSection} onChange={update} />}
          {section === "modes"         && <ModesPanel settings={settings} onChange={update} />}
          {section === "vocabulary"    && <VocabularyPanel settings={settings} onChange={update} />}
          {section === "configuration" && <ConfigurationPanel settings={settings} onChange={update} />}
          {section === "sound"         && <SoundPanel />}
          {section === "history"       && <HistoryPanel />}
        </div>
      </div>
    </main>
  );
}

function Header({
  section,
  onBack,
}: {
  section: Section;
  onBack: (() => void) | null;
}) {
  return (
    <header className="px-4 pt-4 pb-3 border-b border-color-divider-on-dark/20 flex items-start justify-between">
      <div className="flex items-start gap-2">
        {onBack ? (
          <button
            onClick={onBack}
            aria-label="Back"
            className="text-color-fg/90 hover:text-color-fg text-[20px] leading-none mt-1"
          >
            ‹
          </button>
        ) : (
          <span className="w-3" />
        )}
        <div className="flex flex-col">
          <h1
            className="text-[28px] leading-none italic text-color-fg"
            style={{ fontFamily: "var(--font-secondary)" }}
          >
            Settings
          </h1>
          {BREADCRUMBS[section] && (
            <span className="text-[12px] text-color-secondary mt-1">
              / {BREADCRUMBS[section]}
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
