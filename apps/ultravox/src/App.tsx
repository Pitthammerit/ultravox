import { useEffect, useState } from "react";
import SettingsWindow from "./windows/SettingsWindow";
import OnboardingWizard from "./windows/OnboardingWizard";
import { loadSettings, saveSettings } from "./lib/store-bridge";
import { applyTheme } from "@ultravox/design-system";
import { tokens } from "./components/ui";
import { registerHotkeys } from "./lib/tauri-bridge";

export default function App() {
  const [ready, setReady] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

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

  return showOnboarding ? (
    <OnboardingWizard onComplete={completeOnboarding} />
  ) : (
    <SettingsWindow />
  );
}
