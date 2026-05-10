import { useState } from "react";
import type { AppSettings } from "../lib/store-bridge";
import { Button, Row, Section, ToggleRow, tokens } from "../components/ui";
import { playStartChime, playStopChime } from "../lib/chime";
import { transcribe } from "../lib/transcribe";
import { TOKEN_ENDPOINT } from "../lib/tauri-bridge";
import { DEFAULT_MODES, type VoiceMode } from "../lib/voiceModes";
import { logDebug } from "../lib/debugLog";

interface SoundPanelProps {
  settings: AppSettings;
  onChange: (patch: Partial<AppSettings>) => Promise<void>;
}

type TestStatus = "idle" | "recording" | "transcribing" | "ok" | "error";

export default function SoundPanel({ settings, onChange }: SoundPanelProps) {
  const sound = settings.sound;

  const setSound = (patch: Partial<AppSettings["sound"]>) =>
    onChange({ sound: { ...sound, ...patch } });

  return (
    <>
      <Section
        label="Microphone"
        help="Ultravox uses your system default microphone. Per-device selection comes in v1.1."
      >
        <TestRecordingRow settings={settings} />
      </Section>

      <Section
        label="Compare cleanup quality"
        help="Records 6s, then runs the same audio through Whisper raw + four LLM variants in parallel. Use this to pick the right model for your dictation style."
      >
        <CompareCleanupRow settings={settings} />
      </Section>

      <Section label="Input processing">
        <ToggleRow
          label="Auto-gain"
          help="Browser auto-adjusts microphone level"
          checked={sound.autoGain}
          onChange={(v) => setSound({ autoGain: v })}
        />
        <ToggleRow
          label="Noise suppression"
          help="Reduce background noise. Mild quality tradeoff."
          checked={sound.noiseSuppression}
          onChange={(v) => setSound({ noiseSuppression: v })}
        />
        <ToggleRow
          label="Silence removal"
          help="Trim silent passages before upload (v1.1)"
          checked={sound.silenceRemoval}
          onChange={(v) => setSound({ silenceRemoval: v })}
        />
      </Section>

      <Section label="Sound effects">
        <ToggleRow
          label="Pause music while recording"
          help="Pause Music and Spotify when a recording starts; resume when it stops."
          checked={sound.pauseMediaWhileRecording}
          onChange={(v) => setSound({ pauseMediaWhileRecording: v })}
        />
        <ToggleRow
          label="Chime on start/stop"
          help="Brief tone when recording starts and stops"
          checked={sound.chime}
          onChange={(v) => setSound({ chime: v })}
        />
        {sound.chime && (
          <Row
            label="Chime volume"
            control={
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={sound.chimeVolume}
                onChange={(e) =>
                  setSound({ chimeVolume: Number(e.currentTarget.value) })
                }
                style={{ width: 140, accentColor: tokens.fg }}
              />
            }
          />
        )}
        {sound.chime && (
          <Row
            label="Test"
            control={
              <div className="flex items-center gap-1.5">
                <Button size="xs" onClick={() => playStartChime(sound.chimeVolume)}>
                  ▶ Start
                </Button>
                <Button size="xs" onClick={() => playStopChime(sound.chimeVolume)}>
                  ▶ Stop
                </Button>
              </div>
            }
          />
        )}
      </Section>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────
   TEST RECORDING — records 2 s, sends to the worker, displays
   the response inline. Bypasses paste / hotkeys / modes so the
   audio→worker round trip can be tested in isolation.
   ───────────────────────────────────────────────────────────── */

function TestRecordingRow({ settings }: { settings: AppSettings }) {
  const [status, setStatus] = useState<TestStatus>("idle");
  const [result, setResult] = useState<string>("");

  const run = async () => {
    setStatus("recording");
    setResult("");
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          autoGainControl: settings.sound.autoGain,
          noiseSuppression: settings.sound.noiseSuppression,
          echoCancellation: false,
        },
      });

      // Same mime detection as useRecorder — keep behaviour identical.
      const candidates = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg"];
      const chosen = candidates.find((c) => MediaRecorder.isTypeSupported?.(c)) ?? "audio/webm";

      const recorder = new MediaRecorder(stream, { mimeType: chosen });
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

      const blob: Blob = await new Promise((resolve) => {
        recorder.onstop = () => {
          resolve(new Blob(chunks, { type: recorder.mimeType || chosen }));
        };
        recorder.start();
        setTimeout(() => recorder.stop(), 2000);
      });

      logDebug("record-stop", { mime: blob.type, bytes: blob.size, message: "test-recording" });

      setStatus("transcribing");
      const mode = settings.modes.find((m) => m.id === settings.activeModeId) ?? DEFAULT_MODES[0]!;
      const r = await transcribe(blob, {
        mode,
        vocabulary: settings.vocabulary ?? [],
        tokenEndpoint: TOKEN_ENDPOINT,
      });
      setResult(r.text || "(empty)");
      setStatus(r.text ? "ok" : "error");
    } catch (e) {
      setResult((e as Error).message ?? String(e));
      setStatus("error");
    } finally {
      stream?.getTracks().forEach((t) => t.stop());
    }
  };

  const busy = status === "recording" || status === "transcribing";
  const label =
    status === "recording" ? "Recording 2s…"
    : status === "transcribing" ? "Sending to worker…"
    : "Test recording";

  const resultColor =
    status === "ok" ? "var(--color-accent)"
    : status === "error" ? "var(--color-warning)"
    : tokens.fgMuted;

  return (
    <Row
      label="Round-trip test"
      help="Record 2s, send to the worker, show the response. Tests the pipeline in isolation — no hotkey, no paste."
      control={
        <div className="flex flex-col gap-1 items-end" style={{ minWidth: 220 }}>
          <Button variant="primary" size="xs" onClick={run} disabled={busy}>
            {label}
          </Button>
          {result && (
            <div
              className="text-[11.5px] font-mono px-2 py-1.5 rounded w-full"
              style={{
                background: tokens.control,
                border: `1px solid ${tokens.border}`,
                color: resultColor,
                wordBreak: "break-word",
                maxHeight: 96,
                overflowY: "auto",
              }}
            >
              {result}
            </div>
          )}
        </div>
      }
    />
  );
}

/* ─────────────────────────────────────────────────────────────
   COMPARE CLEANUP — record once, fan out to N LLM variants in
   parallel, render results side by side. Read-only A/B for
   choosing the right model for your dictation style.
   ───────────────────────────────────────────────────────────── */

interface CompareVariant {
  id: string;
  label: string;
  /** null = call /v1/audio/transcriptions (raw Whisper, no cleanup). */
  modelOverride: string | null;
}

const COMPARE_VARIANTS: CompareVariant[] = [
  { id: "raw",      label: "Whisper (raw)",   modelOverride: null },
  { id: "haiku",    label: "Haiku 4.5",       modelOverride: "anthropic/claude-haiku-4.5" },
  { id: "sonnet45", label: "Sonnet 4.5",      modelOverride: "anthropic/claude-sonnet-4.5" },
  { id: "sonnet46", label: "Sonnet 4.6",      modelOverride: "anthropic/claude-sonnet-4.6" },
  { id: "opus47",   label: "Opus 4.7",        modelOverride: "anthropic/claude-opus-4.7" },
];

interface VariantResult {
  status: "pending" | "ok" | "error";
  text?: string;
  durationMs?: number;
  error?: string;
}

function CompareCleanupRow({ settings }: { settings: AppSettings }) {
  const [phase, setPhase] = useState<"idle" | "recording" | "comparing" | "done">("idle");
  const [results, setResults] = useState<Record<string, VariantResult>>({});

  const run = async () => {
    setPhase("recording");
    setResults(Object.fromEntries(COMPARE_VARIANTS.map((v) => [v.id, { status: "pending" }])));
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          autoGainControl: settings.sound.autoGain,
          noiseSuppression: settings.sound.noiseSuppression,
          echoCancellation: false,
        },
      });
      const candidates = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg"];
      const chosen = candidates.find((c) => MediaRecorder.isTypeSupported?.(c)) ?? "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType: chosen });
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      const blob: Blob = await new Promise((resolve) => {
        recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || chosen }));
        recorder.start();
        setTimeout(() => recorder.stop(), 6000);
      });
      logDebug("record-stop", { mime: blob.type, bytes: blob.size, message: "compare-test" });

      setPhase("comparing");
      const baseMode = settings.modes.find((m) => m.id === settings.activeModeId) ?? DEFAULT_MODES[0]!;

      // Fan out: each variant gets its own transcribe() call. Yes, this hits
      // Whisper N times (one per variant) — acceptable cost for a dev tool.
      await Promise.all(
        COMPARE_VARIANTS.map(async (v) => {
          const t0 = performance.now();
          try {
            const variantMode: VoiceMode = v.modelOverride === null
              ? { ...baseMode, cleanup: "raw" }
              : { ...baseMode, languageModel: v.modelOverride };
            const r = await transcribe(blob, {
              mode: variantMode,
              vocabulary: settings.vocabulary ?? [],
              tokenEndpoint: TOKEN_ENDPOINT,
            });
            setResults((prev) => ({
              ...prev,
              [v.id]: {
                status: "ok",
                text: r.text || "(empty)",
                durationMs: Math.round(performance.now() - t0),
              },
            }));
          } catch (e) {
            setResults((prev) => ({
              ...prev,
              [v.id]: {
                status: "error",
                error: (e as Error).message ?? String(e),
                durationMs: Math.round(performance.now() - t0),
              },
            }));
          }
        }),
      );
      setPhase("done");
    } catch (e) {
      setResults({ raw: { status: "error", error: (e as Error).message ?? String(e) } });
      setPhase("done");
    } finally {
      stream?.getTracks().forEach((t) => t.stop());
    }
  };

  const busy = phase === "recording" || phase === "comparing";
  const buttonLabel =
    phase === "recording" ? "Recording 6s…"
    : phase === "comparing" ? "Comparing…"
    : phase === "done" ? "Run again"
    : "Record & compare";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-end">
        <Button variant="primary" size="xs" onClick={run} disabled={busy}>
          {buttonLabel}
        </Button>
      </div>

      {Object.keys(results).length > 0 && (
        <div className="flex flex-col gap-1.5">
          {COMPARE_VARIANTS.map((v) => (
            <CompareResultRow key={v.id} variant={v} result={results[v.id]} />
          ))}
        </div>
      )}
    </div>
  );
}

function CompareResultRow({
  variant,
  result,
}: {
  variant: CompareVariant;
  result: VariantResult | undefined;
}) {
  const status = result?.status ?? "pending";
  const accent =
    status === "ok" ? "var(--color-accent)"
    : status === "error" ? "var(--color-warning)"
    : tokens.fgSubtle;

  return (
    <div
      className="flex flex-col gap-1 px-3 py-2 rounded-md"
      style={{ background: tokens.control, border: `1px solid ${tokens.border}` }}
    >
      <div className="flex items-center justify-between gap-2 text-[11.5px]">
        <span className="font-medium" style={{ color: accent }}>{variant.label}</span>
        <span className="font-mono" style={{ color: tokens.fgSubtle }}>
          {status === "pending" && "running…"}
          {status !== "pending" && result?.durationMs != null && `${result.durationMs}ms`}
        </span>
      </div>
      <div
        className="text-[12.5px] font-mono"
        style={{ color: status === "error" ? "var(--color-warning)" : tokens.fg, wordBreak: "break-word" }}
      >
        {status === "pending" && (
          <span style={{ color: tokens.fgSubtle }}>—</span>
        )}
        {status === "ok" && (result?.text ?? "")}
        {status === "error" && `Error: ${result?.error ?? ""}`}
      </div>
    </div>
  );
}
