import { useEffect, useState } from "react";
import SettingsWindow from "./windows/SettingsWindow";
import OnboardingWizard from "./windows/OnboardingWizard";
import { loadSettings, saveSettings } from "./lib/store-bridge";
import { applyTheme } from "@ultravox/design-system";
import { tokens } from "./components/ui";
import { registerHotkeys } from "./lib/tauri-bridge";
import { checkForUpdate, type UpdateInfo } from "./lib/updater";

export default function App() {
  const [ready, setReady] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [update, setUpdate] = useState<UpdateInfo | null>(null);

  useEffect(() => {
    (async () => {
      const settings = await loadSettings();
      applyTheme(settings.theme);
      // Re-register hotkeys with the user's saved combos (if any).
      try {
        await registerHotkeys(settings.hotkeyRecord, settings.hotkeyModeOverlay);
      } catch (e) {
        console.warn("hotkey register failed:", e);
      }
      setShowOnboarding(!settings.onboardingComplete);
      setReady(true);

      // Defer update check so it doesn't compete with app startup
      setTimeout(async () => {
        const info = await checkForUpdate();
        if (info) setUpdate(info);
      }, 30_000);
    })();
  }, []);

  const completeOnboarding = async () => {
    const current = await loadSettings();
    await saveSettings({ ...current, onboardingComplete: true });
    setShowOnboarding(false);
  };

  if (!ready) {
    return (
      <main
        className="min-h-screen flex items-center justify-center"
        style={{ background: tokens.page }}
      >
        <p className="text-[13px]" style={{ color: tokens.fgMuted }}>Loading…</p>
      </main>
    );
  }

  return (
    <>
      {update && (
        <div
          className="fixed bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 py-2.5 rounded-xl text-[13px] z-50"
          style={{
            background: "var(--color-primary)",
            color: "var(--color-primary-on-dark)",
            boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
            minWidth: 280,
          }}
        >
          <span className="flex-1">Update {update.version} available</span>
          <button
            className="font-medium hover:opacity-80 transition-opacity"
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-accent)", padding: 0 }}
            onClick={() => { update.download(); setUpdate(null); }}
          >
            Install
          </button>
          <button
            className="opacity-60 hover:opacity-100 transition-opacity"
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-primary-on-dark)", padding: 0 }}
            onClick={() => setUpdate(null)}
          >
            Later
          </button>
        </div>
      )}
      {showOnboarding ? (
        <OnboardingWizard onComplete={completeOnboarding} />
      ) : (
        <SettingsWindow />
      )}
    </>
  );
}
