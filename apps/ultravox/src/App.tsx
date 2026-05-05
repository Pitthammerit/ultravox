import { useState } from "react";
import { BRANDING } from "./branding";
import { useRecorder } from "./hooks/useRecorder";
import { transcribe } from "./lib/transcribe";
import { TOKEN_ENDPOINT } from "./lib/tauri-bridge";
import type { VoiceMode } from "./lib/voiceModes";

const TEST_MODE: VoiceMode = {
  id: "note",
  name: "Note",
  voiceModel: "whisper-large-v3-turbo",
  language: "auto",
  cleanup: "prose",
  languageModelProvider: "openrouter",
  languageModel: "anthropic/claude-haiku-4-5-20251001",
};

export default function App() {
  const recorder = useRecorder();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const handleTest = async () => {
    if (recorder.state === "recording") {
      setBusy(true);
      const blob = await recorder.stop();
      if (blob) {
        try {
          const result = await transcribe(blob, {
            mode: TEST_MODE,
            vocabulary: [],
            tokenEndpoint: TOKEN_ENDPOINT,
          });
          setText(result.text);
        } catch (err) {
          setText(`Error: ${(err as Error).message}`);
        }
      }
      setBusy(false);
    } else {
      await recorder.start();
    }
  };

  const label =
    busy ? "Transcribing…"
    : recorder.state === "recording" ? "Stop & transcribe"
    : "Test record";

  return (
    <main className="min-h-screen bg-color-bg-light text-color-text flex flex-col items-center justify-center gap-6 p-6">
      <h1 className="typography-h2 text-color-primary">{BRANDING.appName}</h1>
      <p className="typography-body text-color-secondary">
        Voice dictation companion — dev scaffold
      </p>

      <button
        onClick={handleTest}
        disabled={busy}
        className="px-5 py-2.5 rounded-lg bg-color-primary text-primary-on-dark typography-menu-text transition-opacity disabled:opacity-50"
      >
        {label}
      </button>

      {text && (
        <pre className="max-w-lg w-full rounded-lg p-4 bg-white/60 text-color-text typography-body whitespace-pre-wrap border border-color-ink-15">
          {text}
        </pre>
      )}
    </main>
  );
}
