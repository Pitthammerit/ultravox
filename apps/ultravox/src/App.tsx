import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import SettingsWindow from "./windows/SettingsWindow";
import OnboardingWizard from "./windows/OnboardingWizard";
import { loadSettings, patchSettings, saveSettings, purgeStaleRecordings } from "./lib/store-bridge";
import { applyTheme } from "@ultravox/design-system";
import { tokens } from "./components/ui";
import { registerHotkeys, unregisterAllHotkeys, copyToClipboard, claudeCodeCheck } from "./lib/tauri-bridge";
import { secureStoreHas, KEY_OPENROUTER_API } from "./lib/secure-store";
import { checkForUpdate, type UpdateInfo } from "./lib/updater";

export default function App() {
  const [ready, setReady] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [update, setUpdate] = useState<UpdateInfo | null>(null);

  useEffect(() => {
    (async () => {
      const settings = await loadSettings();
      applyTheme(settings.theme);
      const onboardingNeeded = !settings.onboardingComplete;
      // While the wizard is open the user is *learning* the hotkey — and on
      // step 5 they're literally typing it into the HotkeyRecorder. We don't
      // want every keystroke to also start a recording. Suppress globals
      // while onboarding is showing; re-arm them on completion.
      if (onboardingNeeded) {
        try { await unregisterAllHotkeys(); } catch (e) { console.warn("unregister hotkeys failed:", e); }
      } else {
        try {
          await registerHotkeys(
            settings.hotkeyRecord,
            settings.hotkeyModeOverlay,
            settings.pttHotkey,
            settings.recordingStyle,
          );
        } catch (e) {
          console.warn("hotkey register failed:", e);
        }
      }
      setShowOnboarding(onboardingNeeded);
      setReady(true);

      // Defer update check so it doesn't compete with app startup
      setTimeout(async () => {
        const info = await checkForUpdate();
        if (info) setUpdate(info);
      }, 30_000);

      // Retention sweep for the recordings dir: delete files past their
      // retention window AND any orphans (entry evicted by the 50-cap but
      // file still on disk). Best-effort, errors swallowed inside the fn.
      // Deferred 5s after launch so it doesn't compete with the initial
      // settings/UI render. Skipped automatically when saveLocal is off.
      setTimeout(() => { void purgeStaleRecordings(); }, 5_000);

      // BYO-key migration hint. Existing modes that were written when the
      // worker held a managed OpenRouter key now require either (a) the
      // user adding their own OR key in Configuration → API Keys, or (b)
      // switching the mode to Claude Code if available. We don't auto-
      // rewrite the mode (the user may have a key incoming) — just log a
      // console hint so the dev console / debug log shows the recommended
      // next step. Deferred so it doesn't compete with launch render.
      setTimeout(async () => {
        try {
          const usesOpenRouter = (settings.modes ?? []).some(
            (m) => m.languageModelProvider === "openrouter",
          );
          if (!usesOpenRouter) return;
          const hasKey = await secureStoreHas(KEY_OPENROUTER_API).catch(() => false);
          if (hasKey) return;
          const cc = await claudeCodeCheck().catch(() => null);
          if (cc?.available) {
            console.info(
              "[ultravox] One or more modes use OpenRouter but no API key is set. Claude Code CLI is detected — switch any OpenRouter mode to Claude Code (in Modes), or add a key in Configuration → API Keys.",
            );
          } else {
            console.info(
              "[ultravox] One or more modes use OpenRouter but no API key is set. Add one in Configuration → API Keys, or install Claude Code (https://claude.com/claude-code) and switch the mode's Processing Provider.",
            );
          }
        } catch { /* hint is best-effort; never break startup */ }
      }, 6_000);
    })();
  }, []);

  /* ── Tray-driven events ─────────────────────────────────────── */
  useEffect(() => {
    const unsubs: Array<() => void> = [];

    listen("tray:check-update", async () => {
      const info = await checkForUpdate();
      if (info) setUpdate(info);
    }).then((u) => unsubs.push(u));

    listen<string>("tray:set-mode", (e) => {
      const id = e.payload;
      if (typeof id === "string" && id.length > 0) {
        patchSettings({ activeModeId: id }).catch((err) => console.warn("[App] tray:set-mode failed:", err));
      }
    }).then((u) => unsubs.push(u));

    listen("settings:launch-onboarding", async () => {
      try { await unregisterAllHotkeys(); } catch (e) { console.warn("unregister hotkeys failed:", e); }
      setShowOnboarding(true);
    }).then((u) => unsubs.push(u));

    // Tray "Copy Last Transcription" + macOS app-menu "Copy Last
    // Transcription" (⌘⇧C): load fresh settings, write the most-recent
    // history entry to the system clipboard via the Rust path. Routing
    // through Rust avoids the WKWebView clipboard policy — a tray-menu
    // click and an app-menu click are both AppKit gestures (not DOM
    // gestures), so navigator.clipboard.writeText would silently fail
    // with no user activation. The Rust clipboard plugin has no such
    // restriction. Both surfaces emit different event names, but the
    // handler is identical — DRY.
    const copyLastFromHistory = async () => {
      try {
        const fresh = await loadSettings();
        const last = fresh.history?.[0];
        if (last?.text) {
          await copyToClipboard(last.text);
        }
      } catch (e) {
        console.warn("[App] copy-last-transcription failed:", e);
      }
    };
    listen("tray:copy-last", copyLastFromHistory).then((u) => unsubs.push(u));
    listen("menu:copy-last", copyLastFromHistory).then((u) => unsubs.push(u));

    return () => { for (const u of unsubs) u(); };
  }, []);

  const completeOnboarding = async () => {
    const current = await loadSettings();
    // Clear onboardingStep so a future reset (e.g. tester wiping the flag)
    // starts at step 0 rather than wherever the user last left off.
    const { onboardingStep: _, ...rest } = current;
    await saveSettings({ ...rest, onboardingComplete: true });
    // Re-arm the global hotkeys now that the wizard is done. Use whatever
    // values the user chose on the hotkey step (they're already persisted).
    try {
      await registerHotkeys(
        current.hotkeyRecord,
        current.hotkeyModeOverlay,
        current.pttHotkey,
        current.recordingStyle,
      );
    } catch (e) {
      console.warn("re-register hotkeys after onboarding failed:", e);
    }
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
            boxShadow: "0 4px 16px color-mix(in srgb, var(--color-primary) 40%, transparent)",
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
