/**
 * React provider + hook for the typed message catalog.
 *
 * Subscribes to settings.uiLanguage so a language change in any window
 * propagates everywhere via the existing `settings:saved` broadcast +
 * `lang:changed` event. Default lang is "en"; the provider switches
 * once initial settings load.
 *
 * Usage:
 *   <I18nProvider>
 *     <App />
 *   </I18nProvider>
 *
 *   const t = useT();
 *   <h1>{t.panels.home.sectionVoice}</h1>
 *   <p>{t.tray.versionLabel("0.16.0")}</p>
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { LANGS, type Lang, type MessageCatalog } from "./catalog";
import { CATALOG as MESSAGES } from "./messages";
import { loadSettings } from "../store-bridge";

/** Type guard so the hydration + cross-window paths accept any catalog
 *  Lang (en | de | es | sv | future additions) instead of the old
 *  hardcoded `"en" | "de"` clamp that silently dropped es/sv updates.
 *  Defensive against legacy or malformed stored values — falls through
 *  to the previous lang state when the stored value isn't recognized. */
function isLang(value: unknown): value is Lang {
  return typeof value === "string" && (LANGS as ReadonlyArray<string>).includes(value);
}

interface I18nContextValue {
  lang: Lang;
  t: MessageCatalog;
  setLang: (next: Lang) => void;
}

const I18nContext = createContext<I18nContextValue>({
  lang: "en",
  t: MESSAGES.en,
  setLang: () => {},
});

interface I18nProviderProps {
  children: React.ReactNode;
  /** Optional initial language override — useful for tests. */
  initialLang?: Lang;
}

export function I18nProvider({ children, initialLang }: I18nProviderProps) {
  const [lang, setLang] = useState<Lang>(initialLang ?? "en");

  // Hydrate from persisted settings on mount. We don't block render on
  // this — initial paint uses the default; the lang flip on hydration
  // re-renders consumers within ~50ms.
  useEffect(() => {
    if (initialLang) return;
    let cancelled = false;
    loadSettings()
      .then((s) => {
        if (cancelled) return;
        if (isLang(s.uiLanguage)) {
          setLang(s.uiLanguage);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [initialLang]);

  // Cross-window propagation: any window calling saveSettings broadcasts
  // `settings:saved`. Re-load and pick up the new uiLanguage so the
  // Settings, Pill, and Onboarding windows stay in sync without a
  // dedicated lang event.
  useEffect(() => {
    if (initialLang) return;
    let unsub: (() => void) | undefined;
    listen("settings:saved", async () => {
      try {
        const fresh = await loadSettings();
        if (isLang(fresh.uiLanguage)) {
          const nextLang = fresh.uiLanguage;
          setLang((cur) => (cur === nextLang ? cur : nextLang));
        }
      } catch { /* swallow */ }
    }).then((u) => { unsub = u; });
    return () => { unsub?.(); };
  }, [initialLang]);

  const value = useMemo<I18nContextValue>(
    () => ({
      lang,
      t: MESSAGES[lang],
      setLang: (next) => setLang(next),
    }),
    [lang],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** Read the current message catalog. Re-renders when language changes. */
export function useT(): MessageCatalog {
  return useContext(I18nContext).t;
}

/** Read the current language code (rare — most code should use useT). */
export function useLang(): Lang {
  return useContext(I18nContext).lang;
}

/** Imperative setter — for code that updates settings.uiLanguage; the
 *  provider's settings:saved listener picks up the persisted value, so
 *  this setter is mostly a redundancy guard. */
export function useSetLang(): (next: Lang) => void {
  const ctx = useContext(I18nContext);
  return useCallback((next: Lang) => ctx.setLang(next), [ctx]);
}

// Re-export the catalog instance for non-React callers (e.g. Rust IPC
// senders that don't have access to hooks). Imports from the messages
// module which holds the actual translations.
export { MESSAGES as CATALOG };
