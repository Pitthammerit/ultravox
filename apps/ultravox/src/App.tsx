import { useEffect, useState } from "react";
import SettingsWindow from "./windows/SettingsWindow";
import OnboardingWizard from "./windows/OnboardingWizard";
import { loadSettings, saveSettings } from "./lib/store-bridge";
import { applyTheme } from "@ultravox/design-system";

export default function App() {
  const [ready, setReady] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    (async () => {
      const settings = await loadSettings();
      applyTheme(settings.theme);
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
      <main className="min-h-screen flex items-center justify-center bg-color-bg-light">
        <p className="typography-body text-color-secondary">Loading…</p>
      </main>
    );
  }

  return showOnboarding ? (
    <OnboardingWizard onComplete={completeOnboarding} />
  ) : (
    <SettingsWindow />
  );
}
