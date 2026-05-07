import { useState, useCallback, useEffect, useRef } from "react";
import { BRANDING } from "../branding";
import {
  checkAccessibilityPermission,
  requestAccessibilityPermission,
  getSystemLanguage,
  openPrivacySettings,
} from "../lib/tauri-bridge";
import { loadSettings, saveSettings, type AppSettings } from "../lib/store-bridge";
import { applyTheme } from "@ultravox/design-system";
import { HotkeyRecorder, prettifyShortcut } from "../components/HotkeyRecorder";
import { ModeGlyph } from "../components/ModeIcons";
import { DEFAULT_MODES } from "../lib/voiceModes";

interface OnboardingWizardProps {
  onComplete: () => void;
}

type PermStatus = "idle" | "requesting" | "granted" | "denied";
type Lang = "en" | "de";
type ThemeChoice = AppSettings["theme"];

// Steps:
//   0 = language picker
//   1 = let's get started
//   2 = name
//   3 = theme
//   4 = default mode (moved up — we explain modes BEFORE asking for a hotkey
//       so users know what the hotkey will operate on)
//   5 = hotkey customisation
//   6 = recording style (toggle vs PTT)
//   7 = microphone permission
//   8 = accessibility permission
//   9 = "you're all set" / done
// AI placeholder step has been removed — that's a v1.5+ thing and was just
// adding noise here.
const TOTAL_STEPS = 10;

/* ── Wizard uses live design-system tokens so picking a theme on Step 3
   immediately repaints the entire wizard, not just the swatch grid. ── */
const LIGHT_BG = "var(--color-bg-light)";
const FG_PRIMARY = "var(--color-fg)";
const FG_BODY = "var(--color-text)";
const FG_MUTED = "var(--color-secondary)";
const ACCENT = "var(--color-accent)";
const WARNING = "var(--color-warning)";
const SURFACE = "var(--color-surface-popover)";
const SURFACE_BORDER = "var(--color-surface-border)";
const TRACK_INACTIVE = "var(--color-ink-15)";
/* Inverts per theme — navy/white in light, white/dark in dark. Use for any
   solid-fill primary action button so it never collapses to white-on-white. */
const BTN_BG = "var(--color-button-primary-bg)";
const BTN_FG = "var(--color-button-primary-fg)";

/** Theme preview swatches (hand-tuned approximations of the design tokens). */
const THEME_PREVIEWS: Record<ThemeChoice, { bg: string; surface: string; fg: string; accent: string }> = {
  auto:         { bg: "linear-gradient(135deg, #EDE7DC 50%, #1A2533 50%)", surface: "#FFFFFF", fg: "#224160", accent: "#2DAD71" },
  light:        { bg: "#EDE7DC", surface: "#FFFFFF", fg: "#224160", accent: "#2DAD71" },
  "dark-ocean": { bg: "#1A2533", surface: "#243042", fg: "#FFFFFF", accent: "#2DAD71" },
  "dark-night": { bg: "#0F0F11", surface: "#1B1B1E", fg: "#FFFFFF", accent: "#2DAD71" },
};

const COPY: Record<Lang, {
  // step 0
  langTitle: string;
  langPrompt: string;
  langHintLine1: string;
  langHintLine2: string;
  english: string;
  deutsch: string;
  // step 1
  startedTitle: string;
  startedBody: string;
  // step 2
  nameTitle: string;
  namePlaceholder: string;
  // step 3
  themeTitle: string;
  themeBody: string;
  themeAuto: string;
  themeLight: string;
  themeDarkOcean: string;
  themeDarkNight: string;
  // step 4 - hotkey
  hotkeyTitle: string;
  hotkeyBody: string;
  hotkeyRecordLabel: string;
  hotkeyOverlayLabel: string;
  // step 5 - recording style
  styleTitle: string;
  styleBody: string;
  styleToggle: string;
  styleToggleDesc: string;
  stylePtt: string;
  stylePttDesc: string;
  // step 6 - default mode
  modeTitle: string;
  modeBody: string;
  // step 7
  micTitle: string;
  micBody: string;
  micLabel: string;
  micGranted: string;
  micDenied: string;
  allowMic: string;
  // step 5
  axTitle: string;
  axBody: string;
  axLabel: string;
  axGranted: string;
  axIdleHint: string;
  axNotGranted: string;
  allowAx: string;
  refresh: string;
  // step 6
  doneTitle: string;
  doneBody: (kbd: React.ReactNode) => React.ReactNode;
  open: string;
  // shared
  continueBtn: string;
  tryAgain: string;
  openSettings: string;
  skip: string;
  back: string;
  waiting: string;
  awaitingDialog: string;
}> = {
  en: {
    langTitle: `Welcome to ${BRANDING.appName}`,
    langPrompt: "Continue in…",
    langHintLine1: "Triff deine Auswahl oben.",
    langHintLine2: "Make your preferred selection.",
    english: "English",
    deutsch: "Deutsch",
    startedTitle: "Let's get started",
    startedBody: "Voice-dictate into any text field on your Mac. Press a hotkey, speak, press again — the text appears wherever your cursor is.",
    nameTitle: "What's your name?",
    namePlaceholder: "Your name",
    themeTitle: "Choose your theme",
    themeBody: "Pick a look. You can change this later in Settings → Configuration.",
    themeAuto: "Auto",
    themeLight: "Light",
    themeDarkOcean: "Dark Ocean",
    themeDarkNight: "Dark Night",
    hotkeyTitle: "Pick your hotkeys",
    hotkeyBody: "The recording hotkey starts and stops dictation from anywhere — even when Ultravox isn't focused. The mode-switcher hotkey opens a quick chooser so you can flip between Email, Note, etc. on the fly. Click a row and press your combo to change it.",
    hotkeyRecordLabel: "Start / stop recording",
    hotkeyOverlayLabel: "Open mode switcher",
    styleTitle: "How do you want to record?",
    styleBody: "Toggle is great for hands-free dictation. Push-to-talk feels natural if you're used to walkie-talkies or Discord.",
    styleToggle: "Toggle",
    styleToggleDesc: "Tap to start, tap to stop",
    stylePtt: "Push-to-talk (v1.5)",
    stylePttDesc: "Hold to record, release to stop — coming in a future update",
    modeTitle: "What do you mostly write?",
    modeBody: "We'll set this as your default mode. You can switch any time with the mode-switcher hotkey.",
    micTitle: "Allow microphone access",
    micBody: "Ultravox records your voice locally and sends only audio to the transcription service. macOS will ask once — click Allow when prompted.",
    micLabel: "Microphone",
    micGranted: "Access granted",
    micDenied: "Access denied — open System Settings → Privacy → Microphone",
    allowMic: "Allow Microphone Access",
    axTitle: "Allow accessibility access",
    axBody: "Ultravox needs Accessibility permission to paste the transcribed text into any focused app — the same permission DeepL uses for its overlay.",
    axLabel: "Accessibility",
    axGranted: "Access granted",
    axIdleHint: "Enable Ultravox in the list that just opened, then click Refresh below.",
    axNotGranted: "Not yet granted",
    allowAx: "Allow Accessibility Access",
    refresh: "I've enabled it — Refresh",
    doneTitle: "You're all set",
    doneBody: (kbd) => (<>Click into any text field — Notes, Mail, a browser — place your cursor, press {kbd} to record, press it again to stop.</>),
    open: `Open ${BRANDING.appName}`,
    continueBtn: "Continue",
    tryAgain: "Try again",
    openSettings: "Open System Settings",
    skip: "Skip onboarding",
    back: "← Back",
    waiting: "Waiting…",
    awaitingDialog: "Waiting for system dialog…",
  },
  de: {
    langTitle: `Willkommen bei ${BRANDING.appName}`,
    langPrompt: "Weiter auf…",
    langHintLine1: "Triff deine Auswahl oben.",
    langHintLine2: "Make your preferred selection.",
    english: "English",
    deutsch: "Deutsch",
    startedTitle: "Los geht's",
    startedBody: "Diktiere in jedes Textfeld auf deinem Mac. Hotkey drücken, sprechen, erneut drücken — der Text erscheint dort, wo dein Cursor ist.",
    nameTitle: "Wie ist dein Name?",
    namePlaceholder: "Dein Name",
    themeTitle: "Wähle dein Theme",
    themeBody: "Such dir einen Look aus. Du kannst das später unter Einstellungen → Konfiguration ändern.",
    themeAuto: "Automatisch",
    themeLight: "Hell",
    themeDarkOcean: "Dark Ocean",
    themeDarkNight: "Dark Night",
    hotkeyTitle: "Wähle deine Hotkeys",
    hotkeyBody: "Mit dem Aufnahme-Hotkey startest und stoppst du das Diktieren — von überall aus, auch wenn Ultravox nicht im Vordergrund ist. Der Modus-Hotkey öffnet eine schnelle Auswahl, damit du zwischen E-Mail, Notiz usw. wechseln kannst. Klicke in eine Zeile und drücke deine Kombination, um sie zu ändern.",
    hotkeyRecordLabel: "Aufnahme starten / stoppen",
    hotkeyOverlayLabel: "Modus-Auswahl öffnen",
    styleTitle: "Wie möchtest du aufnehmen?",
    styleBody: "Toggle ist ideal für freihändiges Diktieren. Push-to-talk fühlt sich vertraut an, wenn du Walkie-Talkies oder Discord kennst.",
    styleToggle: "Toggle",
    styleToggleDesc: "Tippen zum Start, tippen zum Stopp",
    stylePtt: "Push-to-talk (v1.5)",
    stylePttDesc: "Halten zum Aufnehmen, loslassen zum Stoppen — kommt in einem späteren Update",
    modeTitle: "Was schreibst du meistens?",
    modeBody: "Wir setzen das als deinen Standard-Modus. Du kannst jederzeit mit dem Modus-Hotkey wechseln.",
    micTitle: "Mikrofonzugriff erlauben",
    micBody: "Ultravox nimmt deine Stimme lokal auf und sendet nur Audio zur Transkription. macOS fragt einmal — klicke auf Erlauben im Dialog.",
    micLabel: "Mikrofon",
    micGranted: "Zugriff erlaubt",
    micDenied: "Zugriff verweigert — Systemeinstellungen → Datenschutz → Mikrofon öffnen",
    allowMic: "Mikrofon erlauben",
    axTitle: "Bedienungshilfen erlauben",
    axBody: "Ultravox benötigt Bedienungshilfen, um den transkribierten Text in jede fokussierte App einzufügen — dieselbe Berechtigung wie bei DeepL.",
    axLabel: "Bedienungshilfen",
    axGranted: "Zugriff erlaubt",
    axIdleHint: "Aktiviere Ultravox in der geöffneten Liste, dann unten auf Aktualisieren klicken.",
    axNotGranted: "Noch nicht erlaubt",
    allowAx: "Bedienungshilfen erlauben",
    refresh: "Aktiviert — aktualisieren",
    doneTitle: "Alles bereit",
    doneBody: (kbd) => (<>Klicke in ein Textfeld — Notizen, Mail, Browser — Cursor platzieren, {kbd} zum Aufnehmen drücken, erneut drücken zum Stoppen.</>),
    open: `${BRANDING.appName} öffnen`,
    continueBtn: "Weiter",
    tryAgain: "Erneut versuchen",
    openSettings: "Systemeinstellungen öffnen",
    skip: "Überspringen",
    back: "← Zurück",
    waiting: "Warte…",
    awaitingDialog: "Warte auf Systemdialog…",
  },
};

function detectInitialLang(): Lang {
  const nav = typeof navigator !== "undefined" ? navigator.language ?? "" : "";
  return nav.toLowerCase().startsWith("de") ? "de" : "en";
}

export default function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const [step, setStep] = useState(0);
  const [lang, setLang] = useState<Lang>(detectInitialLang);
  const [name, setName] = useState("");
  const [theme, setTheme] = useState<ThemeChoice>("auto");
  const [hotkeyRecord, setHotkeyRecord] = useState("Cmd+Shift+;");
  const [hotkeyModeOverlay, setHotkeyModeOverlay] = useState("Alt+Shift+K");
  const [recordingStyle, setRecordingStyle] = useState<AppSettings["recordingStyle"]>("toggle");
  const [activeModeId, setActiveModeId] = useState<string>(DEFAULT_MODES[0]?.id ?? "email");
  const [micStatus, setMicStatus] = useState<PermStatus>("idle");
  const [axStatus, setAxStatus] = useState<PermStatus>("idle");
  const nameInputRef = useRef<HTMLInputElement>(null);
  const t = COPY[lang];

  // Hydrate language and existing values from settings, AND ask macOS for
  // the system language so we can pre-emphasize the matching choice.
  useEffect(() => {
    loadSettings().then((s) => {
      if (s.uiLanguage) setLang(s.uiLanguage);
      if (s.userName) setName(s.userName);
      if (s.theme) {
        setTheme(s.theme);
        try { applyTheme(s.theme); } catch (e) { console.warn("applyTheme failed:", e); }
      }
      if (s.hotkeyRecord) setHotkeyRecord(s.hotkeyRecord);
      if (s.hotkeyModeOverlay) setHotkeyModeOverlay(s.hotkeyModeOverlay);
      if (s.recordingStyle) setRecordingStyle(s.recordingStyle);
      if (s.activeModeId) setActiveModeId(s.activeModeId);
      // Resume on the step the user last reached. Important for the
      // mic-permission flow: when the user denies, opens System Settings,
      // toggles allow, and macOS prompts them to relaunch the app — we
      // don't want them dropped back at "Welcome" with all their entries
      // intact but invisible. They reappear on the mic step (or wherever
      // they were) instead.
      if (typeof s.onboardingStep === "number" && s.onboardingStep > 0 && s.onboardingStep < TOTAL_STEPS) {
        setStep(s.onboardingStep);
      }
      // Only override `lang` from system language if the user hasn't already
      // saved a preference (first run scenario).
      if (!s.uiLanguage) {
        getSystemLanguage()
          .then((sys) => {
            const next: Lang = sys === "de" ? "de" : "en";
            setLang(next);
          })
          .catch(() => {});
      } else {
      }
    }).catch(() => {
      getSystemLanguage()
        .then((sys) => {
          const next: Lang = sys === "de" ? "de" : "en";
          setLang(next);
        })
        .catch(() => {});
    });
  }, []);

  // Probe permissions on mount — but DON'T trigger the mic prompt yet.
  // `getUserMedia` opens the system dialog if status is "prompt"; that
  // would surface during the language picker (step 0) which is jarring.
  // `navigator.permissions.query` only reads state, never prompts. The
  // actual `getUserMedia` call happens later when the user clicks
  // "Allow Microphone Access" on step 4. Same for Accessibility.
  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.permissions?.query) {
      navigator.permissions
        .query({ name: "microphone" as PermissionName })
        .then((res) => { if (res.state === "granted") setMicStatus("granted"); })
        .catch(() => {});
    }
    checkAccessibilityPermission()
      .then((ok) => { if (ok) setAxStatus("granted"); })
      .catch(() => {});
  }, []);

  // Auto-focus the name field when entering step 2.
  useEffect(() => {
    if (step === 2) nameInputRef.current?.focus();
  }, [step]);

  // Persist arbitrary patches to settings.
  const patchSettings = useCallback(async (patch: Partial<AppSettings>) => {
    try {
      const current = await loadSettings();
      await saveSettings({ ...current, ...patch });
    } catch (e) {
      console.warn("[onboarding] settings patch failed:", e);
    }
  }, []);

  const switchLang = useCallback(async (next: Lang, autoAdvance = false) => {
    setLang(next);
    await patchSettings({ uiLanguage: next });
    if (autoAdvance) setStep(1);
  }, [patchSettings]);

  const pickTheme = useCallback(async (next: ThemeChoice) => {
    setTheme(next);
    // Apply live so the wizard's own chrome (bg, text, surfaces, dots) flips
    // immediately. The settings window already imports the design system, so
    // applyTheme just toggles the data-theme attribute on the document root.
    try { applyTheme(next); } catch (e) { console.warn("applyTheme failed:", e); }
    await patchSettings({ theme: next });
  }, [patchSettings]);

  const updateHotkey = useCallback(async (kind: "record" | "mode", value: string) => {
    if (kind === "record") setHotkeyRecord(value);
    else setHotkeyModeOverlay(value);
    const next = {
      hotkeyRecord: kind === "record" ? value : hotkeyRecord,
      hotkeyModeOverlay: kind === "mode" ? value : hotkeyModeOverlay,
    };
    // Persist to settings only — DO NOT re-register globally. App.tsx
    // unregistered all globals when the wizard mounted, and re-registers
    // them in completeOnboarding(). Re-registering here would defeat the
    // onboarding-suppression and start a recording the moment the user
    // presses their new combo into the HotkeyRecorder.
    await patchSettings(next);
  }, [hotkeyRecord, hotkeyModeOverlay, patchSettings]);

  const pickRecordingStyle = useCallback(async (next: AppSettings["recordingStyle"]) => {
    setRecordingStyle(next);
    await patchSettings({ recordingStyle: next });
  }, [patchSettings]);

  const pickDefaultMode = useCallback(async (id: string) => {
    setActiveModeId(id);
    await patchSettings({ activeModeId: id });
  }, [patchSettings]);

  const requestMic = useCallback(async () => {
    setMicStatus("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setMicStatus("granted");
    } catch {
      setMicStatus("denied");
    }
  }, []);

  /** Re-poll permission state after the user toggled it in System Settings.
   *  Uses navigator.permissions.query (no UI prompt) — only flips to
   *  "granted" if the user actually allowed access in Settings. */
  const recheckMic = useCallback(async () => {
    if (typeof navigator !== "undefined" && navigator.permissions?.query) {
      try {
        const res = await navigator.permissions.query({ name: "microphone" as PermissionName });
        if (res.state === "granted") setMicStatus("granted");
        else if (res.state === "denied") setMicStatus("denied");
        else setMicStatus("idle");
      } catch { /* unsupported, fall through */ }
    }
  }, []);

  const requestAx = useCallback(async () => {
    setAxStatus("requesting");
    const ok = await requestAccessibilityPermission().catch(() => false);
    setAxStatus(ok ? "granted" : "idle");
  }, []);

  const recheckAx = useCallback(async () => {
    const ok = await checkAccessibilityPermission().catch(() => false);
    setAxStatus(ok ? "granted" : "idle");
  }, []);

  // Persist current step to settings on every change so a permission-induced
  // app restart resumes on the step the user last reached. The mic step is
  // the worst case: deny → open Settings → allow → macOS asks to relaunch
  // → app restarts. Without this, the user lands back on "Welcome" with
  // all their entered data invisible behind the language picker.
  useEffect(() => {
    void patchSettings({ onboardingStep: step });
  }, [step, patchSettings]);

  // Save the typed name on every keystroke (debounce-free — patchSettings
  // is fast and write-coalescing in tauri-plugin-store). Without this, a
  // user who types "Benjamin" and then app-restarts before clicking
  // Continue loses the entry.
  useEffect(() => {
    const trimmed = name.trim();
    if (!trimmed) return;
    void patchSettings({ userName: trimmed });
  }, [name, patchSettings]);

  const next = async () => {
    if (step === TOTAL_STEPS - 1) {
      // Apply chosen theme on the way out so the actual app launches in it.
      try { applyTheme(theme); } catch (e) { console.warn("applyTheme failed:", e); }
      onComplete();
    } else {
      setStep((s) => s + 1);
    }
  };
  const back = () => setStep((s) => Math.max(0, s - 1));

  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center p-8 relative"
      style={{ background: LIGHT_BG, color: FG_BODY }}
    >
      {/* Window-corner language toggle — visible on every step so the user
          can switch on the fly even after the initial pick. */}
      <div className="absolute top-4 right-4 flex gap-1 z-10">
        <LangBtn active={lang === "en"} onClick={() => switchLang("en")}>EN</LangBtn>
        <LangBtn active={lang === "de"} onClick={() => switchLang("de")}>DE</LangBtn>
      </div>

      <div className="w-full max-w-sm flex flex-col items-stretch gap-8">

        {/* Progress dots — hide on step 0 since language is the gate */}
        {step > 0 && (
          <div className="flex gap-1 justify-center">
            {Array.from({ length: TOTAL_STEPS - 1 }).map((_, i) => (
              <div
                key={i}
                className="h-1.5 flex-1 rounded-full transition-colors"
                style={{
                  background: i <= step - 1 ? FG_PRIMARY : TRACK_INACTIVE,
                }}
              />
            ))}
          </div>
        )}

        {/* ── Step 0: Language picker ── */}
        {step === 0 && (
          <Step title={t.langTitle} large>
            <p className="text-center" style={{ color: FG_BODY, fontSize: 14, marginBottom: 4 }}>
              {t.langPrompt}
            </p>
            <div className="flex gap-3">
              <BigChoiceBtn onClick={() => switchLang("en", true)}>{t.english}</BigChoiceBtn>
              <BigChoiceBtn onClick={() => switchLang("de", true)}>{t.deutsch}</BigChoiceBtn>
            </div>
            <div className="flex flex-col gap-0.5 mt-2 text-center" style={{ color: FG_MUTED, fontSize: 12 }}>
              <span>{t.langHintLine1}</span>
              <span>{t.langHintLine2}</span>
            </div>
          </Step>
        )}

        {/* ── Step 1: Let's get started ── */}
        {step === 1 && (
          <Step title={t.startedTitle}>
            <Body>{t.startedBody}</Body>
            <PrimaryBtn onClick={next}>{t.continueBtn}</PrimaryBtn>
          </Step>
        )}

        {/* ── Step 2: Name ── */}
        {step === 2 && (
          <Step title={t.nameTitle}>
            <input
              ref={nameInputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") next(); }}
              placeholder={t.namePlaceholder}
              className="w-full rounded-lg outline-none"
              style={{
                background: SURFACE,
                border: `1px solid ${SURFACE_BORDER}`,
                color: FG_PRIMARY,
                fontSize: 14,
                padding: "10px 14px",
              }}
            />
            <PrimaryBtn onClick={next}>{t.continueBtn}</PrimaryBtn>
          </Step>
        )}

        {/* ── Step 3: Theme ── */}
        {step === 3 && (
          <Step title={t.themeTitle}>
            <Body>{t.themeBody}</Body>
            <div className="grid grid-cols-2 gap-2">
              <ThemeCard id="auto"        label={t.themeAuto}      active={theme === "auto"}        preview={THEME_PREVIEWS.auto}        onClick={() => pickTheme("auto")} />
              <ThemeCard id="light"       label={t.themeLight}     active={theme === "light"}       preview={THEME_PREVIEWS.light}       onClick={() => pickTheme("light")} />
              <ThemeCard id="dark-ocean"  label={t.themeDarkOcean} active={theme === "dark-ocean"}  preview={THEME_PREVIEWS["dark-ocean"]}  onClick={() => pickTheme("dark-ocean")} />
              <ThemeCard id="dark-night"  label={t.themeDarkNight} active={theme === "dark-night"}  preview={THEME_PREVIEWS["dark-night"]}  onClick={() => pickTheme("dark-night")} />
            </div>
            <PrimaryBtn onClick={next}>{t.continueBtn}</PrimaryBtn>
          </Step>
        )}

        {/* ── Step 4: Default mode (moved up — explain modes BEFORE asking
                   the user to pick a hotkey, so they know what the hotkey
                   will operate on) ── */}
        {step === 4 && (
          <Step title={t.modeTitle}>
            <Body>{t.modeBody}</Body>
            <div className="grid grid-cols-2 gap-2">
              {DEFAULT_MODES.map((m) => (
                <ModeCard
                  key={m.id}
                  iconName={m.icon ?? null}
                  label={m.name}
                  active={activeModeId === m.id}
                  onClick={() => pickDefaultMode(m.id)}
                />
              ))}
            </div>
            <PrimaryBtn onClick={next}>{t.continueBtn}</PrimaryBtn>
          </Step>
        )}

        {/* ── Step 5: Hotkeys ── */}
        {step === 5 && (
          <Step title={t.hotkeyTitle}>
            <Body>{t.hotkeyBody}</Body>
            <div className="flex flex-col gap-2">
              <HotkeyRow label={t.hotkeyRecordLabel}>
                <HotkeyRecorder value={hotkeyRecord} onChange={(v) => void updateHotkey("record", v)} />
              </HotkeyRow>
              <HotkeyRow label={t.hotkeyOverlayLabel}>
                <HotkeyRecorder value={hotkeyModeOverlay} onChange={(v) => void updateHotkey("mode", v)} />
              </HotkeyRow>
            </div>
            <PrimaryBtn onClick={next}>{t.continueBtn}</PrimaryBtn>
          </Step>
        )}

        {/* ── Step 6: Recording style ── */}
        {step === 6 && (
          <Step title={t.styleTitle}>
            <Body>{t.styleBody}</Body>
            <div className="flex flex-col gap-2">
              <ChoiceCard
                title={t.styleToggle}
                desc={t.styleToggleDesc}
                active={recordingStyle === "toggle"}
                onClick={() => pickRecordingStyle("toggle")}
              />
              <ChoiceCard
                title={t.stylePtt}
                desc={t.stylePttDesc}
                active={false}
                onClick={() => {}}
                disabled
              />
            </div>
            <PrimaryBtn onClick={next}>{t.continueBtn}</PrimaryBtn>
          </Step>
        )}

        {/* ── Step 7: Microphone ── */}
        {step === 7 && (
          <Step title={t.micTitle}>
            <Body>{t.micBody}</Body>
            <PermRow
              icon="🎙"
              label={t.micLabel}
              status={micStatus}
              grantedLabel={t.micGranted}
              deniedLabel={t.micDenied}
              awaitingLabel={t.awaitingDialog}
            />
            {micStatus === "granted" ? (
              <PrimaryBtn onClick={next}>{t.continueBtn}</PrimaryBtn>
            ) : micStatus === "denied" ? (
              <>
                {/* Once macOS has a "denied" decision in TCC it will not
                    re-prompt; deep-link the user to the right Privacy pane. */}
                <PrimaryBtn onClick={() => openPrivacySettings("microphone")}>
                  {t.openSettings}
                </PrimaryBtn>
                <button
                  onClick={recheckMic}
                  className="text-[13px] underline text-center"
                  style={{ color: FG_MUTED, background: "none", border: "none", cursor: "pointer" }}
                >
                  {t.refresh}
                </button>
              </>
            ) : (
              <PrimaryBtn onClick={requestMic} loading={micStatus === "requesting"} loadingLabel={t.waiting}>
                {t.allowMic}
              </PrimaryBtn>
            )}
          </Step>
        )}

        {/* ── Step 8: Accessibility ── */}
        {step === 8 && (
          <Step title={t.axTitle}>
            <Body>{t.axBody}</Body>
            <PermRow
              icon="⌨️"
              label={t.axLabel}
              status={axStatus}
              grantedLabel={t.axGranted}
              deniedLabel={axStatus === "idle" ? t.axIdleHint : t.axNotGranted}
              awaitingLabel={t.awaitingDialog}
            />
            {axStatus !== "granted" ? (
              <>
                <PrimaryBtn onClick={requestAx} loading={axStatus === "requesting"} loadingLabel={t.waiting}>
                  {t.allowAx}
                </PrimaryBtn>
                {axStatus === "idle" && (
                  <button
                    onClick={recheckAx}
                    className="text-[13px] underline text-center"
                    style={{ color: FG_MUTED, background: "none", border: "none", cursor: "pointer" }}
                  >
                    {t.refresh}
                  </button>
                )}
              </>
            ) : (
              <PrimaryBtn onClick={next}>{t.continueBtn}</PrimaryBtn>
            )}
          </Step>
        )}

        {/* ── Step 9: Done ── */}
        {step === 9 && (
          <Step title={t.doneTitle}>
            <Body>{t.doneBody(<Kbd>{prettifyShortcut(hotkeyRecord)}</Kbd>)}</Body>
            <PrimaryBtn onClick={async () => {
              try { applyTheme(theme); } catch (e) { console.warn("applyTheme failed:", e); }
              onComplete();
            }}>{t.open}</PrimaryBtn>
          </Step>
        )}

        {/* Back + skip footer.
            Hidden on step 0 (language gate) and step 1 ("Let's get started"
            should feel committed — no escape hatch). */}
        {step > 0 && (
          <div className="flex justify-between items-center">
            <button
              onClick={back}
              className="text-[12px] hover:opacity-80 transition-opacity"
              style={{ color: FG_MUTED, background: "none", border: "none", cursor: "pointer" }}
            >
              {t.back}
            </button>
            {step > 1 ? (
              <button
                onClick={onComplete}
                className="text-[12px] hover:underline"
                style={{ color: FG_MUTED, background: "none", border: "none", cursor: "pointer" }}
              >
                {t.skip}
              </button>
            ) : (
              <span />
            )}
          </div>
        )}
      </div>
    </main>
  );
}

/* ── Layout helpers ─────────────────────────────────────────── */

function Step({
  title,
  children,
  large,
}: {
  title: string;
  children: React.ReactNode;
  /** Welcome (step 0) gets the bigger size; everywhere else is the standard serif heading. */
  large?: boolean;
}) {
  return (
    <div className="flex flex-col items-stretch gap-5">
      <h1
        className="text-center"
        style={{
          color: FG_PRIMARY,
          fontSize: large ? 32 : 26,
          fontWeight: 400,
          lineHeight: 1.15,
          fontFamily: '"Cormorant Garamond", serif',
          letterSpacing: "0.01em",
        }}
      >
        {title}
      </h1>
      {children}
    </div>
  );
}

function Body({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-center leading-relaxed"
      style={{ color: FG_BODY, fontSize: 14, minHeight: 64 }}
    >
      {children}
    </p>
  );
}

function LangBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded transition-opacity"
      style={{
        fontSize: 11,
        fontWeight: 500,
        padding: "3px 8px",
        background: active ? BTN_BG : "transparent",
        color: active ? BTN_FG : FG_MUTED,
        border: `1px solid ${active ? BTN_BG : SURFACE_BORDER}`,
        cursor: "pointer",
        letterSpacing: "0.04em",
      }}
    >
      {children}
    </button>
  );
}

/** A pair of equally-sized, prominently-styled language picker buttons. */
function BigChoiceBtn({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="flex-1 rounded-lg transition-opacity hover:opacity-90"
      style={{
        background: BTN_BG,
        color: BTN_FG,
        fontSize: 14,
        fontWeight: 500,
        letterSpacing: "0.02em",
        padding: "12px 16px",
        border: "none",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function ThemeCard({
  label,
  active,
  preview,
  onClick,
}: {
  id: ThemeChoice;
  label: string;
  active: boolean;
  preview: { bg: string; surface: string; fg: string; accent: string };
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-stretch gap-1.5 rounded-lg transition-all"
      style={{
        background: SURFACE,
        border: `2px solid ${active ? FG_PRIMARY : SURFACE_BORDER}`,
        cursor: "pointer",
        padding: 8,
      }}
    >
      <div
        className="rounded relative overflow-hidden"
        style={{ background: preview.bg, height: 56, border: `1px solid ${SURFACE_BORDER}` }}
      >
        {/* mini Settings card mock */}
        <div
          className="absolute"
          style={{
            left: 8, right: 8, top: 8, bottom: 8,
            background: preview.surface,
            borderRadius: 4,
            display: "flex", flexDirection: "column",
            justifyContent: "space-between",
            padding: "4px 6px",
          }}
        >
          <div style={{ height: 4, background: preview.fg, opacity: 0.85, borderRadius: 1, width: "40%" }} />
          <div style={{ height: 6, background: preview.accent, borderRadius: 2, width: "30%", alignSelf: "flex-end" }} />
        </div>
      </div>
      <span
        className="text-center"
        style={{ color: active ? FG_PRIMARY : FG_BODY, fontSize: 12, fontWeight: active ? 600 : 400 }}
      >
        {label}
      </span>
    </button>
  );
}

function PermRow({
  icon,
  label,
  status,
  grantedLabel,
  deniedLabel,
  awaitingLabel,
}: {
  icon: string;
  label: string;
  status: PermStatus;
  grantedLabel: string;
  deniedLabel: React.ReactNode;
  awaitingLabel: string;
}) {
  const accent =
    status === "granted" ? ACCENT : status === "denied" ? WARNING : FG_MUTED;
  const sub =
    status === "granted" ? grantedLabel
    : status === "denied" ? deniedLabel
    : status === "requesting" ? awaitingLabel
    : null;

  return (
    <div
      className="flex items-start gap-3 px-4 py-3 rounded-xl text-left"
      style={{ background: SURFACE, border: `1px solid ${SURFACE_BORDER}` }}
    >
      <span className="text-[20px] mt-0.5 shrink-0">{icon}</span>
      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
        <span style={{ fontSize: 14, fontWeight: 500, color: FG_PRIMARY }}>{label}</span>
        {sub && (
          <span style={{ fontSize: 12, lineHeight: 1.3, color: accent }}>{sub}</span>
        )}
      </div>
      <span style={{ fontSize: 18, color: accent, marginTop: 2 }} className="shrink-0">
        {status === "granted" ? "✓" : status === "denied" ? "✕" : "○"}
      </span>
    </div>
  );
}

function PrimaryBtn({
  onClick,
  children,
  loading,
  loadingLabel,
}: {
  onClick: () => void;
  children: React.ReactNode;
  loading?: boolean;
  loadingLabel?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="w-full rounded-lg transition-opacity disabled:opacity-60"
      style={{
        background: BTN_BG,
        color: BTN_FG,
        fontSize: 13,
        fontWeight: 500,
        letterSpacing: "0.02em",
        padding: "10px 20px",
        border: "none",
        cursor: loading ? "wait" : "pointer",
      }}
    >
      {loading ? loadingLabel ?? "…" : children}
    </button>
  );
}

function HotkeyRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg"
      style={{ background: SURFACE, border: `1px solid ${SURFACE_BORDER}` }}
    >
      <span style={{ fontSize: 13, color: FG_BODY }}>{label}</span>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function ChoiceCard({
  title,
  desc,
  active,
  onClick,
  disabled,
}: {
  title: string;
  desc: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className="flex flex-col items-start gap-1 rounded-lg text-left transition-all"
      style={{
        background: SURFACE,
        border: `2px solid ${active ? FG_PRIMARY : SURFACE_BORDER}`,
        cursor: disabled ? "not-allowed" : "pointer",
        padding: "12px 14px",
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <span style={{ color: active ? FG_PRIMARY : FG_BODY, fontSize: 14, fontWeight: active ? 600 : 500 }}>
        {title}
      </span>
      <span style={{ color: FG_MUTED, fontSize: 12 }}>{desc}</span>
    </button>
  );
}

function ModeCard({
  iconName,
  label,
  active,
  onClick,
}: {
  iconName: string | null;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-2 rounded-lg transition-all"
      style={{
        background: SURFACE,
        border: `2px solid ${active ? FG_PRIMARY : SURFACE_BORDER}`,
        cursor: "pointer",
        padding: 16,
      }}
    >
      <ModeGlyph name={iconName} size={24} color={active ? FG_PRIMARY : FG_BODY} />
      <span style={{ color: active ? FG_PRIMARY : FG_BODY, fontSize: 13, fontWeight: active ? 600 : 500 }}>
        {label}
      </span>
    </button>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd
      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded font-mono"
      style={{
        background: TRACK_INACTIVE,
        border: `1px solid ${SURFACE_BORDER}`,
        color: FG_PRIMARY,
        fontSize: 12,
      }}
    >
      {children}
    </kbd>
  );
}
