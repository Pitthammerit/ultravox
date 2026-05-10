import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  clearHistory,
  loadSettings,
  saveSettings,
  type HistoryEntry,
} from "../lib/store-bridge";
import {
  copyToClipboard,
  deleteRecordingAudio,
  readRecordingAudio,
} from "../lib/tauri-bridge";
import { Button, Section, tokens } from "../components/ui";

export default function HistoryPanel() {
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);

  const refresh = async () => {
    const s = await loadSettings();
    setHistory(s.history);
  };

  useEffect(() => {
    refresh();
    // Auto-refresh when a new transcription writes to the store. The
    // PillWindow's appendHistory broadcasts settings:saved on every
    // recording, so the History panel stays current without the user
    // navigating away and back.
    let unsub: (() => void) | undefined;
    listen("settings:saved", () => { void refresh(); }).then((u) => { unsub = u; });
    return () => { unsub?.(); };
  }, []);

  const onClear = async () => {
    // Also delete every saved audio file along with the entries.
    if (history) {
      for (const e of history) {
        if (e.audioPath) {
          await deleteRecordingAudio(e.id).catch(() => {});
        }
      }
    }
    await clearHistory();
    setHistory([]);
  };

  const onDeleteAudio = async (entryId: string) => {
    await deleteRecordingAudio(entryId);
    // Strip audio fields from the entry; keep the text record.
    const fresh = await loadSettings();
    const next = fresh.history.map((e) =>
      e.id === entryId
        ? { id: e.id, ts: e.ts, modeId: e.modeId, bundleId: e.bundleId, text: e.text }
        : e,
    );
    await saveSettings({ ...fresh, history: next });
    setHistory(next);
  };

  if (!history) return null;

  const audioCount = history.filter((e) => !!e.audioPath).length;

  return (
    <>
      <Section
        label={`Recent transcriptions (${history.length})`}
        right={
          history.length > 0 ? (
            <Button size="xs" variant="outline" onClick={onClear}>
              Clear all
            </Button>
          ) : undefined
        }
      >
        {history.length === 0 ? (
          <p
            className="text-[12.5px] italic"
            style={{ color: tokens.fgSubtle }}
          >
            No transcriptions yet — capture one with the record hotkey.
          </p>
        ) : (
          history.map((entry) => (
            <HistoryItem
              key={entry.id}
              entry={entry}
              onDeleteAudio={() => void onDeleteAudio(entry.id)}
            />
          ))
        )}
      </Section>

      <p
        className="text-[11.5px] leading-relaxed pt-1"
        style={{ color: tokens.fgSubtle }}
      >
        History is stored locally on this Mac. {audioCount > 0
          ? `${audioCount} entr${audioCount === 1 ? "y has" : "ies have"} saved audio.`
          : "Audio is only saved when 'Save audio recordings locally' is on in Configuration → Recordings."}{" "}
        Last 50 transcriptions kept.
      </p>
    </>
  );
}

function HistoryItem({
  entry,
  onDeleteAudio,
}: {
  entry: HistoryEntry;
  onDeleteAudio: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioErr, setAudioErr] = useState<string | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const hasAudio = !!entry.audioPath && !!entry.audioFormat;

  // Load the audio bytes lazily. Reading on mount would create a Blob URL
  // for every entry on the page; we only do it when the user expands an
  // item. For now: load on mount, but revoke on unmount to bound memory.
  // Future: switch to a "click play" pattern if memory becomes an issue.
  useEffect(() => {
    if (!hasAudio || !entry.audioFormat) return;
    let cancelled = false;
    const fmt = entry.audioFormat;
    const ext = guessExt(fmt);
    readRecordingAudio(entry.id, ext)
      .then((bytes) => {
        if (cancelled) return;
        const blob = new Blob([new Uint8Array(bytes)], { type: fmt });
        const url = URL.createObjectURL(blob);
        objectUrlRef.current = url;
        setAudioUrl(url);
      })
      .catch((e) => {
        if (cancelled) return;
        setAudioErr((e as Error).message ?? String(e));
      });
    return () => {
      cancelled = true;
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [entry.id, entry.audioFormat, hasAudio]);

  const copy = async () => {
    try {
      // Route through Rust clipboard for parity with the tray + app-menu
      // copy-last paths — same reason as App.tsx's copyLastFromHistory.
      await copyToClipboard(entry.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      className="rounded-lg px-3 py-2.5"
      style={{
        background: tokens.card,
        border: `1px solid ${tokens.border}`,
      }}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span
            className="text-[10.5px] uppercase tracking-[0.14em] font-medium"
            style={{ color: tokens.fgSubtle }}
          >
            {entry.modeId}
          </span>
          <span className="text-[11px]" style={{ color: tokens.fgMuted }}>
            {formatRelative(entry.ts)}
          </span>
          {hasAudio && entry.audioBytes && (
            <span
              className="text-[10px] uppercase tracking-[0.10em] font-semibold inline-flex items-center"
              title={`Audio saved (${formatBytes(entry.audioBytes)})`}
              style={{
                height: 14,
                padding: "0 5px",
                borderRadius: 3,
                background: "color-mix(in srgb, var(--color-accent) 18%, transparent)",
                color: "var(--color-accent)",
              }}
            >
              ♫
            </span>
          )}
        </div>
        <button
          onClick={copy}
          className="text-[11px] font-medium px-1.5 py-0.5 rounded transition-colors"
          style={{
            color: copied ? tokens.fg : tokens.fgMuted,
          }}
        >
          {copied ? "✓ Copied" : "Copy"}
        </button>
      </div>
      {hasAudio && (
        <div className="mb-1.5">
          {audioUrl && (
            <audio
              controls
              src={audioUrl}
              style={{ width: "100%", height: 28 }}
              preload="metadata"
            />
          )}
          {audioErr && !audioUrl && (
            <p className="text-[10px] italic" style={{ color: tokens.fgSubtle }}>
              Could not load audio: {audioErr}
            </p>
          )}
        </div>
      )}
      <p
        className="text-[12.5px] leading-relaxed line-clamp-3"
        style={{ color: tokens.fg }}
        title={entry.text}
      >
        {entry.text}
      </p>
      {hasAudio && (
        <div className="flex items-center gap-1.5 mt-2">
          <Button size="xs" variant="outline" onClick={onDeleteAudio}>
            Delete audio
          </Button>
        </div>
      )}
    </div>
  );
}

/** Map "audio/mp4" → "mp4", "audio/webm;codecs=opus" → "webm" etc. Mirrors
 *  store-bridge.ts's blobMimeToExt — used here to reconstruct the file
 *  path for read_recording_audio. */
function guessExt(mime: string): string {
  const base = mime.split(";")[0]!.trim().toLowerCase();
  if (base === "audio/mp4" || base === "audio/aac") return "mp4";
  if (base.startsWith("audio/webm")) return "webm";
  if (base === "audio/ogg") return "ogg";
  if (base === "audio/wav" || base === "audio/wave") return "wav";
  return "bin";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(ts).toLocaleDateString();
}
