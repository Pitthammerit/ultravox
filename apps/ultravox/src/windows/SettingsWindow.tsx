import { useEffect, useState } from "react";
import HomePanel from "../panels/HomePanel";
import ModesPanel from "../panels/ModesPanel";
import VocabularyPanel from "../panels/VocabularyPanel";
import ConfigurationPanel from "../panels/ConfigurationPanel";
import SoundPanel from "../panels/SoundPanel";
import HistoryPanel from "../panels/HistoryPanel";
import { loadSettings, saveSettings, type AppSettings } from "../lib/store-bridge";
import { applyTheme } from "@ultravox/design-system";
import { PageHeader, tokens } from "../components/ui";

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
      <main
        className="min-h-screen flex items-center justify-center"
        style={{ background: tokens.page }}
      >
        <p className="text-[13px]" style={{ color: tokens.fgMuted }}>
          Loading…
        </p>
      </main>
    );
  }

  return (
    <main
      className="min-h-screen flex flex-col"
      style={{ background: tokens.page, color: tokens.fg }}
    >
      <PageHeader
        breadcrumb={BREADCRUMBS[section] || undefined}
        onBack={section === "home" ? null : () => setSection("home")}
      />

      <div className="flex-1 overflow-y-auto px-5 py-5">
        <div className="flex flex-col gap-6 max-w-md mx-auto">
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
