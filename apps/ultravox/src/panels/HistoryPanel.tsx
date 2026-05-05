import { useEffect, useState } from "react";
import {
  clearHistory,
  loadSettings,
  type HistoryEntry,
} from "../lib/store-bridge";
import { Button, Section, tokens } from "../components/ui";

export default function HistoryPanel() {
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);

  const refresh = async () => {
    const s = await loadSettings();
    setHistory(s.history);
  };

  useEffect(() => {
    refresh();
  }, []);

  const onClear = async () => {
    await clearHistory();
    setHistory([]);
  };

  if (!history) return null;

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
            <HistoryItem key={entry.id} entry={entry} />
          ))
        )}
      </Section>

      <p
        className="text-[11.5px] leading-relaxed pt-1"
        style={{ color: tokens.fgSubtle }}
      >
        History is stored locally on this Mac. Audio is never stored — only the
        cleaned text. Last 50 transcriptions kept.
      </p>
    </>
  );
}

function HistoryItem({ entry }: { entry: HistoryEntry }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(entry.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* ignore — Tauri WebView allows clipboard writes */
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
      <p
        className="text-[12.5px] leading-relaxed line-clamp-3"
        style={{ color: tokens.fg }}
        title={entry.text}
      >
        {entry.text}
      </p>
    </div>
  );
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
