import { useState } from "react";
import type { AppSettings } from "../lib/store-bridge";
import { Button, Row, Section, ToggleRow, tokens } from "../components/ui";
import { playStartChime, playStopChime } from "../lib/chime";
import { transcribe } from "../lib/transcribe";
import { TOKEN_ENDPOINT } from "../lib/tauri-bridge";
import { DEFAULT_MODES } from "../lib/voiceModes";
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
      <Section label="Microphone">
        <p
          className="text-[12.5px] leading-relaxed"
          style={{ color: tokens.fgMuted }}
        >
          Ultravox uses your system default microphone. Per-device selection
          comes in v1.1.
        </p>
        <TestRecordingRow settings={settings} />
      </Section>

      <Section label="Input processing">
        <ToggleRow
          label="Auto-gain"
          description="Browser auto-adjusts microphone level"
          checked={sound.autoGain}
          onChange={(v) => setSound({ autoGain: v })}
        />
        <ToggleRow
          label="Silence removal"
          description="Trim silent passages before upload (v1.1)"
          checked={sound.silenceRemoval}
          onChange={(v) => setSound({ silenceRemoval: v })}
        />
      </Section>

      <Section label="Sound effects">
        <ToggleRow
          label="Chime on start/stop"
          description="Brief tone when recording starts and stops"
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
          noiseSuppression: true,
          echoCancellation: true,
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
      description="Record 2s, send to the worker, show the response. Tests the pipeline in isolation — no hotkey, no paste."
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
