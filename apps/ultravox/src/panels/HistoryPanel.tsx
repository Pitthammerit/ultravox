import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { ChevronDown } from "lucide-react";
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
import { useT } from "../lib/i18n/I18nProvider";

// Char threshold above which we render the chevron-expand affordance.
// Roughly correlates to "would clamp at line-clamp-3 in a ~360px column".
// Picked over scrollHeight measurement to avoid a layout-effect-per-item
// pass on every render — the heuristic mis-classifies a few short multi-
// line entries but never hides text the user can't otherwise read.
const EXPAND_THRESHOLD_CHARS = 180;

export default function HistoryPanel() {
  const t = useT();
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  const [blinking, setBlinking] = useState(false);
  const sectionRef = useRef<HTMLDivElement | null>(null);

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
    let unsubSaved: (() => void) | undefined;
    listen("settings:saved", () => { void refresh(); }).then((u) => { unsubSaved = u; });

    // Listen for the deep-link from Configuration → "Show recent
    // recordings". The corresponding emit is fired AFTER the navigation
    // so this listener has time to register on first mount; we still
    // run the scroll + pulse here as a single visible response.
    let unsubBlink: (() => void) | undefined;
    listen("ui:blink-recordings", () => {
      sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      setBlinking(true);
      setTimeout(() => setBlinking(false), 1500);
    }).then((u) => { unsubBlink = u; });

    return () => {
      unsubSaved?.();
      unsubBlink?.();
    };
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
      <div
        ref={sectionRef}
        className={`uv-blink-target${blinking ? " uv-blinking" : ""}`}
      >
        <Section
          label={t.panels.history.sectionTitle(history.length)}
          right={
            history.length > 0 ? (
              <Button size="xs" variant="outline" onClick={onClear}>
                {t.panels.history.clearAll}
              </Button>
            ) : undefined
          }
        >
          {history.length === 0 ? (
            <p
              className="text-[12.5px] italic"
              style={{ color: tokens.fgSubtle }}
            >
              {t.panels.history.empty}
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
      </div>

      <p
        className="text-[11.5px] leading-relaxed pt-1"
        style={{ color: tokens.fgSubtle }}
      >
        {audioCount > 0
          ? t.panels.history.footnoteAudio(audioCount)
          : t.panels.history.footnoteNoAudio}{" "}
        {t.panels.history.footnoteCap}
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
  const t = useT();
  const [copied, setCopied] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioErr, setAudioErr] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [hovering, setHovering] = useState(false);
  const objectUrlRef = useRef<string | null>(null);

  const hasAudio = !!entry.audioPath && !!entry.audioFormat;
  const canExpand = entry.text.length > EXPAND_THRESHOLD_CHARS;

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
            {formatRelative(entry.ts, t)}
          </span>
          {hasAudio && entry.audioBytes && (
            <span
              className="text-[10px] uppercase tracking-[0.10em] font-semibold inline-flex items-center"
              title={t.panels.history.audioBadgeTitle(formatBytes(entry.audioBytes))}
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
          {copied ? t.common.copied : t.common.copy}
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
              {audioErr}
            </p>
          )}
        </div>
      )}
      {/* Click-to-copy frame around the transcript. The dedicated Copy
          button up top stays as the discoverable affordance; this is the
          "I'll just click the text" shortcut. Hover gets a faint accent
          tint so the click target is visible but not loud. */}
      <button
        type="button"
        onClick={() => void copy()}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        title={t.panels.history.clickToCopy}
        className="w-full text-left rounded-md px-1.5 py-1 -mx-1.5 transition-colors"
        style={{
          background: hovering
            ? "color-mix(in srgb, var(--color-accent) 8%, transparent)"
            : "transparent",
          border: "none",
          cursor: "pointer",
        }}
      >
        <p
          className={`text-[12.5px] leading-relaxed${expanded ? "" : " line-clamp-3"}`}
          style={{ color: tokens.fg, margin: 0 }}
        >
          {entry.text}
        </p>
      </button>
      {canExpand && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-label={expanded ? t.panels.history.collapse : t.panels.history.expand}
          className="mt-1 inline-flex items-center justify-center rounded-full transition-colors"
          style={{
            background: "transparent",
            border: "none",
            cursor: "pointer",
            color: tokens.fgMuted,
            width: 20,
            height: 20,
            padding: 0,
          }}
        >
          <ChevronDown
            size={14}
            style={{
              transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 160ms ease",
            }}
          />
        </button>
      )}
      {hasAudio && (
        <div className="flex items-center gap-1.5 mt-2">
          <Button size="xs" variant="outline" onClick={onDeleteAudio}>
            {t.panels.history.deleteAudio}
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

function formatRelative(
  ts: number,
  t: ReturnType<typeof useT>,
): string {
  const diff = Date.now() - ts;
  const min = Math.round(diff / 60000);
  if (min < 1) return t.panels.history.timeJustNow;
  if (min < 60) return t.panels.history.timeMinutesAgo(min);
  const hr = Math.round(min / 60);
  if (hr < 24) return t.panels.history.timeHoursAgo(hr);
  const day = Math.round(hr / 24);
  if (day < 7) return t.panels.history.timeDaysAgo(day);
  return new Date(ts).toLocaleDateString();
}
