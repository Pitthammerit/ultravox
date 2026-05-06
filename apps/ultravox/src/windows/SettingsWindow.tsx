import { useEffect, useState } from "react";
import HomePanel from "../panels/HomePanel";
import ModesPanel from "../panels/ModesPanel";
import ModeEditor from "../panels/ModeEditor";
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
  | "modes-edit"
  | "vocabulary"
  | "configuration"
  | "sound"
  | "history";

const BREADCRUMBS: Record<Section, string> = {
  home: "",
  modes: "modes",
  "modes-edit": "modes / edit",
  vocabulary: "vocabulary",
  configuration: "configuration",
  sound: "sound",
  history: "history",
};

export default function SettingsWindow() {
  const [section, setSection] = useState<Section>("home");
  const [editingModeId, setEditingModeId] = useState<string>("");
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

  const startEditMode = (modeId: string) => {
    setEditingModeId(modeId);
    setSection("modes-edit");
  };

  const back = () => {
    if (section === "modes-edit") setSection("modes");
    else setSection("home");
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
        onBack={section === "home" ? null : back}
      />

      <div className="flex-1 overflow-y-auto px-5 py-5">
        <div className="flex flex-col gap-6 max-w-md mx-auto">
          {section === "home" && (
            <HomePanel settings={settings} onNavigate={setSection} onChange={update} />
          )}
          {section === "modes" && (
            <ModesPanel settings={settings} onChange={update} onEdit={startEditMode} />
          )}
          {section === "modes-edit" && (
            <ModeEditor
              settings={settings}
              modeId={editingModeId}
              onChange={update}
              onClose={() => setSection("modes")}
            />
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
