import { useState, useCallback, useEffect } from "react";
import { BRANDING } from "../branding";
import {
  checkAccessibilityPermission,
  requestAccessibilityPermission,
} from "../lib/tauri-bridge";
import { loadSettings, saveSettings } from "../lib/store-bridge";

interface OnboardingWizardProps {
  onComplete: () => void;
}

type PermStatus = "idle" | "requesting" | "granted" | "denied";
type Lang = "en" | "de";

const TOTAL_STEPS = 4;

/**
 * Onboarding always renders in the light theme regardless of the user's
 * Settings → Theme choice. The wizard is a one-time first-run flow and
 * benefits from a single, predictable visual treatment.
 */
const LIGHT_BG = "#EDE7DC";
const FG_PRIMARY = "#224160";
const FG_BODY = "#5A5550";
const FG_MUTED = "#7696AD";
const ACCENT = "#2DAD71";
const WARNING = "#DC2626";
const SURFACE = "#FFFFFF";
const SURFACE_BORDER = "color-mix(in srgb, #224160 12%, transparent)";
const TRACK_INACTIVE = "color-mix(in srgb, #224160 14%, transparent)";

/**
 * Body copy is hand-tuned to land within ~125–145 characters per page so
 * the wizard reads with a consistent rhythm. Titles use Cormorant Garamond
 * (the serif token from the design system) for the launch screen.
 */
const COPY: Record<Lang, {
  welcomeTitle: string;
  welcomeBody: string;
  micTitle: string;
  micBody: string;
  axTitle: string;
  axBody: string;
  doneTitle: string;
  doneBody: (kbd: React.ReactNode) => React.ReactNode;
  getStarted: string;
  continueBtn: string;
  allowMic: string;
  allowAx: string;
  tryAgain: string;
  skip: string;
  back: string;
  refresh: string;
  open: string;
  waiting: string;
  micLabel: string;
  axLabel: string;
  granted: string;
  micDenied: string;
  axIdleHint: string;
  axNotGranted: string;
  awaitingDialog: string;
}> = {
  en: {
    welcomeTitle: `Welcome to ${BRANDING.appName}`,
    welcomeBody: "Voice-dictate into any text field on your Mac. Press a hotkey, speak, press again — the text appears wherever your cursor is.",
    micTitle: "Allow microphone access",
    micBody: "Ultravox records your voice locally and sends only audio to the transcription service. macOS will ask once — click Allow when prompted.",
    axTitle: "Allow accessibility access",
    axBody: "Ultravox needs Accessibility permission to paste the transcribed text into any focused app — the same permission DeepL uses for its overlay.",
    doneTitle: "You're all set",
    doneBody: (kbd) => (<>Click into any text field — Notes, Mail, a browser — place your cursor, press {kbd} to record, press it again to stop.</>),
    getStarted: "Get started",
    continueBtn: "Continue",
    allowMic: "Allow Microphone Access",
    allowAx: "Allow Accessibility Access",
    tryAgain: "Try again",
    skip: "Skip onboarding",
    back: "← Back",
    refresh: "I've enabled it — Refresh",
    open: `Open ${BRANDING.appName}`,
    waiting: "Waiting…",
    micLabel: "Microphone",
    axLabel: "Accessibility",
    granted: "Access granted",
    micDenied: "Access denied — open System Settings → Privacy → Microphone",
    axIdleHint: "Enable Ultravox in the list that just opened, then click Refresh below.",
    axNotGranted: "Not yet granted",
    awaitingDialog: "Waiting for system dialog…",
  },
  de: {
    welcomeTitle: `Willkommen bei ${BRANDING.appName}`,
    welcomeBody: "Diktiere in jedes Textfeld auf deinem Mac. Hotkey drücken, sprechen, erneut drücken — der Text erscheint dort, wo dein Cursor ist.",
    micTitle: "Mikrofonzugriff erlauben",
    micBody: "Ultravox nimmt deine Stimme lokal auf und sendet nur Audio zur Transkription. macOS fragt einmal — klicke auf Erlauben im Dialog.",
    axTitle: "Bedienungshilfen erlauben",
    axBody: "Ultravox benötigt Bedienungshilfen, um den transkribierten Text in jede fokussierte App einzufügen — dieselbe Berechtigung wie bei DeepL.",
    doneTitle: "Alles bereit",
    doneBody: (kbd) => (<>Klicke in ein Textfeld — Notizen, Mail, Browser — Cursor platzieren, {kbd} zum Aufnehmen drücken, erneut drücken zum Stoppen.</>),
    getStarted: "Los geht's",
    continueBtn: "Weiter",
    allowMic: "Mikrofon erlauben",
    allowAx: "Bedienungshilfen erlauben",
    tryAgain: "Erneut versuchen",
    skip: "Überspringen",
    back: "← Zurück",
    refresh: "Aktiviert — aktualisieren",
    open: `${BRANDING.appName} öffnen`,
    waiting: "Warte…",
    micLabel: "Mikrofon",
    axLabel: "Bedienungshilfen",
    granted: "Zugriff erlaubt",
    micDenied: "Zugriff verweigert — Systemeinstellungen → Datenschutz → Mikrofon öffnen",
    axIdleHint: "Aktiviere Ultravox in der geöffneten Liste, dann unten auf Aktualisieren klicken.",
    axNotGranted: "Noch nicht erlaubt",
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
  const [micStatus, setMicStatus] = useState<PermStatus>("idle");
  const [axStatus, setAxStatus] = useState<PermStatus>("idle");
  const t = COPY[lang];

  // Hydrate language from saved settings (overrides browser-detect).
  useEffect(() => {
    loadSettings().then((s) => { if (s.uiLanguage) setLang(s.uiLanguage); }).catch(() => {});
  }, []);

  // Check existing permissions on mount.
  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then((s) => { s.getTracks().forEach((t) => t.stop()); setMicStatus("granted"); })
      .catch(() => {});
    checkAccessibilityPermission()
      .then((ok) => { if (ok) setAxStatus("granted"); })
      .catch(() => {});
  }, []);

  // Persist language whenever the user toggles it.
  const switchLang = useCallback(async (next: Lang) => {
    setLang(next);
    try {
      const current = await loadSettings();
      await saveSettings({ ...current, uiLanguage: next });
    } catch (e) {
      console.warn("[onboarding] failed to persist uiLanguage:", e);
    }
  }, []);

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

  const requestAx = useCallback(async () => {
    setAxStatus("requesting");
    const ok = await requestAccessibilityPermission().catch(() => false);
    setAxStatus(ok ? "granted" : "idle");
  }, []);

  const recheckAx = useCallback(async () => {
    const ok = await checkAccessibilityPermission().catch(() => false);
    setAxStatus(ok ? "granted" : "idle");
  }, []);

  const next = () => {
    if (step === TOTAL_STEPS - 1) onComplete();
    else setStep((s) => s + 1);
  };
  const back = () => setStep((s) => Math.max(0, s - 1));

  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center p-8"
      style={{ background: LIGHT_BG, color: FG_BODY }}
    >
      <div className="w-full max-w-sm flex flex-col items-stretch gap-8 relative">

        {/* Language toggle — only on first page */}
        {step === 0 && (
          <div className="absolute -top-2 right-0 flex gap-1">
            <LangBtn active={lang === "en"} onClick={() => switchLang("en")}>EN</LangBtn>
            <LangBtn active={lang === "de"} onClick={() => switchLang("de")}>DE</LangBtn>
          </div>
        )}

        {/* Progress dots */}
        <div className="flex gap-2 justify-center">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div
              key={i}
              className="h-1.5 flex-1 rounded-full transition-colors"
              style={{
                background: i <= step ? FG_PRIMARY : TRACK_INACTIVE,
                maxWidth: 56,
              }}
            />
          ))}
        </div>

        {step === 0 && (
          <Step title={t.welcomeTitle} serif>
            <Body>{t.welcomeBody}</Body>
            <PrimaryBtn onClick={next}>{t.getStarted}</PrimaryBtn>
          </Step>
        )}

        {step === 1 && (
          <Step title={t.micTitle}>
            <Body>{t.micBody}</Body>
            <PermRow
              icon="🎙"
              label={t.micLabel}
              status={micStatus}
              grantedLabel={t.granted}
              deniedLabel={t.micDenied}
              awaitingLabel={t.awaitingDialog}
            />
            {micStatus !== "granted" ? (
              <PrimaryBtn onClick={requestMic} loading={micStatus === "requesting"} loadingLabel={t.waiting}>
                {micStatus === "denied" ? t.tryAgain : t.allowMic}
              </PrimaryBtn>
            ) : (
              <PrimaryBtn onClick={next}>{t.continueBtn}</PrimaryBtn>
            )}
          </Step>
        )}

        {step === 2 && (
          <Step title={t.axTitle}>
            <Body>{t.axBody}</Body>
            <PermRow
              icon="⌨️"
              label={t.axLabel}
              status={axStatus}
              grantedLabel={t.granted}
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

        {step === 3 && (
          <Step title={t.doneTitle}>
            <Body>{t.doneBody(<Kbd>⌘ ⇧ ;</Kbd>)}</Body>
            <PrimaryBtn onClick={onComplete}>{t.open}</PrimaryBtn>
          </Step>
        )}

        <div className="flex justify-between items-center">
          {step > 0 ? (
            <button
              onClick={back}
              className="text-[12px] hover:opacity-80 transition-opacity"
              style={{ color: FG_MUTED, background: "none", border: "none", cursor: "pointer" }}
            >
              {t.back}
            </button>
          ) : (
            <span />
          )}
          <button
            onClick={onComplete}
            className="text-[12px] hover:underline"
            style={{ color: FG_MUTED, background: "none", border: "none", cursor: "pointer" }}
          >
            {t.skip}
          </button>
        </div>
      </div>
    </main>
  );
}

/* ── Layout helpers ─────────────────────────────────────────── */

function Step({
  title,
  children,
  serif,
}: {
  title: string;
  children: React.ReactNode;
  serif?: boolean;
}) {
  return (
    <div className="flex flex-col items-stretch gap-5">
      <h1
        className="text-center"
        style={{
          color: FG_PRIMARY,
          fontSize: serif ? 32 : 24,
          fontWeight: 400,
          lineHeight: 1.15,
          fontFamily: serif ? '"Cormorant Garamond", serif' : undefined,
          letterSpacing: serif ? "0.01em" : undefined,
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
        background: active ? FG_PRIMARY : "transparent",
        color: active ? "#FFFFFF" : FG_MUTED,
        border: `1px solid ${active ? FG_PRIMARY : SURFACE_BORDER}`,
        cursor: "pointer",
        letterSpacing: "0.04em",
      }}
    >
      {children}
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
    status === "granted"
      ? grantedLabel
      : status === "denied"
      ? deniedLabel
      : status === "requesting"
      ? awaitingLabel
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
        background: FG_PRIMARY,
        color: "#FFFFFF",
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
