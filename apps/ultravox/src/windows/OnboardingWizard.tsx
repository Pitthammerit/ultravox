import { useState } from "react";
import { BRANDING } from "../branding";

interface OnboardingWizardProps {
  onComplete: () => void;
}

const STEPS = [
  {
    title: `Welcome to ${BRANDING.appName}`,
    body: "Voice-dictate into any text field on your Mac. Press a hotkey, speak, release — the cleaned text appears where your cursor is.",
    cta: "Get started",
  },
  {
    title: "Grant microphone access",
    body: "macOS will ask once. Pick \"Allow\" so Ultravox can capture your voice. We never store recordings.",
    cta: "Continue",
  },
  {
    title: "Grant accessibility access",
    body: "We use macOS Accessibility to paste your transcription into the focused app. Open System Settings → Privacy & Security → Accessibility and toggle Ultravox on.",
    cta: "I've done that",
  },
  {
    title: "Try it now",
    body: "Press ⌘⇧; (Cmd+Shift+Semicolon) anywhere to start recording. Press it again to stop. The text pastes into whatever you're focused on.",
    cta: "Open Ultravox",
  },
];

export default function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const [step, setStep] = useState(0);
  const current = STEPS[step]!;
  const isLast = step === STEPS.length - 1;

  const next = () => {
    if (isLast) onComplete();
    else setStep(step + 1);
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-color-bg-light p-8">
      <div className="max-w-lg w-full flex flex-col gap-6">
        <div className="flex gap-2 justify-center">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 w-12 rounded-full transition-colors ${
                i <= step ? "bg-color-primary" : "bg-color-ink-15"
              }`}
            />
          ))}
        </div>

        <h1 className="typography-h2 text-color-primary text-center">{current.title}</h1>
        <p className="typography-body-narrative text-color-text text-center">{current.body}</p>

        <div className="flex justify-center gap-3 mt-2">
          {step > 0 && (
            <button
              onClick={() => setStep(step - 1)}
              className="px-4 py-2 typography-menu-text text-color-secondary hover:text-color-primary"
            >
              Back
            </button>
          )}
          <button
            onClick={next}
            className="px-5 py-2.5 rounded-lg bg-color-primary text-primary-on-dark typography-menu-text"
          >
            {current.cta}
          </button>
        </div>

        <button
          onClick={onComplete}
          className="typography-meta text-color-secondary hover:underline self-center"
        >
          Skip onboarding
        </button>
      </div>
    </main>
  );
}
