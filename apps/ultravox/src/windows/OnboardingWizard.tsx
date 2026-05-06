import { useState, useCallback, useEffect } from "react";
import { BRANDING } from "../branding";
import {
  checkAccessibilityPermission,
  requestAccessibilityPermission,
} from "../lib/tauri-bridge";

interface OnboardingWizardProps {
  onComplete: () => void;
}

type PermStatus = "idle" | "requesting" | "granted" | "denied";

export default function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const [step, setStep] = useState(0);
  const [micStatus, setMicStatus] = useState<PermStatus>("idle");
  const [axStatus, setAxStatus] = useState<PermStatus>("idle");

  // Check existing permissions on mount so steps already show ✓ if granted.
  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then((s) => { s.getTracks().forEach((t) => t.stop()); setMicStatus("granted"); })
      .catch(() => {}); // leave as idle — don't auto-deny
    checkAccessibilityPermission()
      .then((ok) => { if (ok) setAxStatus("granted"); })
      .catch(() => {});
  }, []);

  /* ── Microphone ────────────────────────────────────────────── */
  const requestMic = useCallback(async () => {
    setMicStatus("requesting");
    try {
      // getUserMedia from the focused settings window triggers the macOS mic dialog.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setMicStatus("granted");
    } catch {
      setMicStatus("denied");
    }
  }, []);

  /* ── Accessibility ─────────────────────────────────────────── */
  const requestAx = useCallback(async () => {
    setAxStatus("requesting");
    // This calls AXIsProcessTrustedWithOptions which:
    // 1. Adds the app to the Accessibility list in System Settings
    // 2. Shows the system "wants to control this computer" dialog
    const alreadyGranted = await requestAccessibilityPermission().catch(() => false);
    setAxStatus(alreadyGranted ? "granted" : "idle");
  }, []);

  const recheckAx = useCallback(async () => {
    const granted = await checkAccessibilityPermission().catch(() => false);
    setAxStatus(granted ? "granted" : "idle");
  }, []);

  /* ── Navigation ────────────────────────────────────────────── */
  const TOTAL = 4;
  const next = () => {
    if (step === TOTAL - 1) onComplete();
    else setStep((s) => s + 1);
  };
  const back = () => setStep((s) => Math.max(0, s - 1));

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-color-bg-light p-8">
      <div className="max-w-md w-full flex flex-col gap-8">

        {/* Progress dots */}
        <div className="flex gap-2 justify-center">
          {Array.from({ length: TOTAL }).map((_, i) => (
            <div
              key={i}
              className={`h-1.5 w-10 rounded-full transition-colors ${
                i <= step ? "bg-color-primary" : "bg-color-ink-15"
              }`}
            />
          ))}
        </div>

        {/* ── Step 0: Welcome ── */}
        {step === 0 && (
          <Step
            title={`Welcome to ${BRANDING.appName}`}
            body="Voice-dictate into any text field on your Mac. Press a hotkey, speak, press again — the transcribed text appears wherever your cursor is."
          >
            <PrimaryBtn onClick={next}>Get started</PrimaryBtn>
          </Step>
        )}

        {/* ── Step 1: Microphone ── */}
        {step === 1 && (
          <Step
            title="Allow microphone access"
            body="Ultravox records your voice locally. macOS will ask once — click Allow when the dialog appears."
          >
            <PermRow
              icon="🎙"
              label="Microphone"
              status={micStatus}
              grantedLabel="Access granted"
              deniedLabel="Access denied — open System Settings → Privacy → Microphone"
            />
            <div className="flex gap-3 justify-center mt-2">
              {micStatus !== "granted" && (
                <PrimaryBtn onClick={requestMic} loading={micStatus === "requesting"}>
                  {micStatus === "denied" ? "Try again" : "Allow Microphone Access"}
                </PrimaryBtn>
              )}
              <GhostBtn onClick={next}>
                {micStatus === "granted" ? "Continue" : "Skip for now"}
              </GhostBtn>
            </div>
          </Step>
        )}

        {/* ── Step 2: Accessibility ── */}
        {step === 2 && (
          <Step
            title="Allow accessibility access"
            body="Ultravox uses macOS Accessibility to paste the transcription into any focused text field — the same permission used by Superwhisper, DeepL, and macrowhisper."
          >
            <PermRow
              icon="⌨️"
              label="Accessibility"
              status={axStatus}
              grantedLabel="Access granted"
              deniedLabel={
                axStatus === "idle"
                  ? "Enable Ultravox in the list that just opened, then click Refresh below."
                  : "Not yet granted"
              }
            />

            <div className="flex flex-col gap-2 items-center mt-2">
              {axStatus !== "granted" && (
                <PrimaryBtn onClick={requestAx} loading={axStatus === "requesting"}>
                  Allow Accessibility Access
                </PrimaryBtn>
              )}
              {/* After the system dialog appears the user goes to System Settings;
                  they come back and click Refresh to confirm. */}
              {axStatus === "idle" && (
                <button
                  onClick={recheckAx}
                  className="text-[13px] text-color-secondary hover:text-color-primary underline"
                >
                  I've enabled it — Refresh
                </button>
              )}
              <GhostBtn onClick={next}>
                {axStatus === "granted" ? "Continue" : "Skip for now"}
              </GhostBtn>
            </div>
          </Step>
        )}

        {/* ── Step 3: Try it ── */}
        {step === 3 && (
          <Step
            title="You're all set"
            body={
              <>
                Click into any other app — TextEdit, Notes, a browser — place your cursor
                in a text field, then press <Kbd>⌘ ⇧ ;</Kbd> to start recording. Press it
                again to stop. The transcription is pasted where your cursor is.
              </>
            }
          >
            <PrimaryBtn onClick={onComplete}>Open {BRANDING.appName}</PrimaryBtn>
          </Step>
        )}

        {/* Back + skip */}
        <div className="flex justify-between items-center">
          {step > 0 ? (
            <button
              onClick={back}
              className="text-[13px] text-color-secondary hover:text-color-primary"
            >
              ← Back
            </button>
          ) : (
            <span />
          )}
          <button
            onClick={onComplete}
            className="text-[12px] text-color-secondary hover:underline"
          >
            Skip onboarding
          </button>
        </div>
      </div>
    </main>
  );
}

/* ── Layout helpers ─────────────────────────────────────────── */

function Step({
  title,
  body,
  children,
}: {
  title: string;
  body: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5 text-center">
      <h1 className="typography-h3 text-color-primary">{title}</h1>
      <p className="typography-body-narrative text-color-text leading-relaxed">{body}</p>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  );
}

function PermRow({
  icon,
  label,
  status,
  grantedLabel,
  deniedLabel,
}: {
  icon: string;
  label: string;
  status: PermStatus;
  grantedLabel: string;
  deniedLabel: React.ReactNode;
}) {
  const dot =
    status === "granted"
      ? "text-color-accent"
      : status === "denied"
      ? "text-color-warning"
      : "text-color-secondary";

  const sub =
    status === "granted"
      ? grantedLabel
      : status === "denied"
      ? deniedLabel
      : status === "requesting"
      ? "Waiting for system dialog…"
      : null;

  return (
    <div
      className="flex items-start gap-3 px-4 py-3 rounded-xl text-left"
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-surface-border)",
      }}
    >
      <span className="text-[20px] mt-0.5 shrink-0">{icon}</span>
      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
        <span className="text-[14px] font-medium text-color-primary">{label}</span>
        {sub && (
          <span className={`text-[12px] leading-tight ${dot}`}>{sub}</span>
        )}
      </div>
      <span className={`text-[18px] shrink-0 mt-0.5 ${dot}`}>
        {status === "granted" ? "✓" : status === "denied" ? "✕" : "○"}
      </span>
    </div>
  );
}

function PrimaryBtn({
  onClick,
  children,
  loading,
}: {
  onClick: () => void;
  children: React.ReactNode;
  loading?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="px-6 py-2.5 rounded-lg bg-color-primary text-primary-on-dark typography-menu-text disabled:opacity-60 transition-opacity"
    >
      {loading ? "Waiting…" : children}
    </button>
  );
}

function GhostBtn({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="text-[13px] text-color-secondary hover:text-color-primary transition-colors"
    >
      {children}
    </button>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd
      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[12px] font-mono"
      style={{
        background: "var(--color-ink-08)",
        border: "1px solid var(--color-ink-15)",
        color: "var(--color-primary)",
      }}
    >
      {children}
    </kbd>
  );
}
