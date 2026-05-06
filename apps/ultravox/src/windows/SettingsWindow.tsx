import { useEffect, useState } from "react";
import HomePanel from "../panels/HomePanel";
import ModesPanel from "../panels/ModesPanel";
import VocabularyPanel from "../panels/VocabularyPanel";
import ConfigurationPanel from "../panels/ConfigurationPanel";
import SoundPanel from "../panels/SoundPanel";
import HistoryPanel from "../panels/HistoryPanel";
import { loadSettings, saveSettings, type AppSettings } from "../lib/store-bridge";
import { applyTheme } from "@ultravox/design-system";
import { registerHotkeys } from "../lib/tauri-bridge";
import { PageHeader, tokens } from "../components/ui";

type Section =
  | "home"
  | "modes"
  | "vocabulary"
  | "configuration"
  | "sound"
  | "history";

const BREADCRUMBS: Record<Section, string> = {
  home: "",
  modes: "Modes",
  vocabulary: "Vocabulary",
  configuration: "Configuration",
  sound: "Sound",
  history: "History",
};

export default function SettingsWindow() {
  const [section, setSection] = useState<Section>("home");
  const [settings, setSettings] = useState<AppSettings | null>(null);

  useEffect(() => {
    loadSettings().then((s) => {
      setSettings(s);
      applyTheme(s.theme);
      // Re-register stored hotkeys so they take effect even after a restart.
      // The Rust side boots with hardcoded defaults; this overwrites them with
      // whatever the user last saved.
      registerHotkeys(s.hotkeyRecord, s.hotkeyModeOverlay).catch(() => {});
    });
  }, []);

  const update = async (patch: Partial<AppSettings>) => {
    if (!settings) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    await saveSettings(next);
    if (patch.theme) applyTheme(patch.theme);
  };

  const back = () => setSection("home");

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
      className="h-screen flex flex-col overflow-hidden"
      style={{ background: tokens.page, color: tokens.fg }}
    >
      <PageHeader
        breadcrumb={BREADCRUMBS[section] || undefined}
        onBack={section === "home" ? null : back}
      />

      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className="flex flex-col gap-4 max-w-md mx-auto">
          {section === "home" && (
            <HomePanel settings={settings} onNavigate={setSection} onChange={update} />
          )}
          {section === "modes" && (
            <ModesPanel settings={settings} onChange={update} />
          )}
          {section === "vocabulary" && (
            <VocabularyPanel settings={settings} onChange={update} />
          )}
          {section === "configuration" && (
            <ConfigurationPanel settings={settings} onChange={update} />
          )}
          {section === "sound" && <SoundPanel settings={settings} onChange={update} />}
          {section === "history" && <HistoryPanel />}
        </div>
      </div>
    </main>
  );
}
