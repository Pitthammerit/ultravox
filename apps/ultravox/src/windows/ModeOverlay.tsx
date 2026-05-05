import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { DEFAULT_MODES, type VoiceMode } from "../lib/voiceModes";
import { loadSettings, saveSettings, type AppSettings } from "../lib/store-bridge";

/**
 * Mode-switcher overlay — Superwhisper-style.
 * Up/Down arrows + Enter to select, number keys for quick-select, Esc/Space to close.
 */
export default function ModeOverlay() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [highlightIdx, setHighlightIdx] = useState(0);

  useEffect(() => {
    loadSettings().then((s) => {
      setSettings(s);
      const idx = (s.modes ?? DEFAULT_MODES).findIndex((m) => m.id === s.activeModeId);
      setHighlightIdx(idx === -1 ? 0 : idx);
    });
  }, []);

  const close = useCallback(() => {
    invoke("hide_mode_overlay").catch(() => {});
  }, []);

  const pick = useCallback(
    async (mode: VoiceMode) => {
      if (settings) {
        const next = { ...settings, activeModeId: mode.id };
        await saveSettings(next);
        setSettings(next);
      }
      close();
    },
    [close, settings],
  );

  const modes = settings?.modes ?? DEFAULT_MODES;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === " " || e.code === "Space") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightIdx((i) => (i + 1) % modes.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightIdx((i) => (i - 1 + modes.length) % modes.length);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const m = modes[highlightIdx];
        if (m) pick(m);
        return;
      }
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= modes.length) {
        e.preventDefault();
        pick(modes[n - 1]!);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modes, pick, close, highlightIdx]);

  if (!settings) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center p-3 bg-transparent">
      <div
        className="w-full h-full flex flex-col rounded-[18px] overflow-hidden select-none"
        style={{
          background: "rgba(13, 14, 18, 0.90)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 12px 32px rgba(0,0,0,0.45), 0 2px 6px rgba(0,0,0,0.25)",
        }}
      >
        {/* Mode list */}
        <div className="flex-1 flex flex-col gap-1.5 px-3 py-3 overflow-y-auto">
          {modes.map((m, i) => {
            const active = m.id === settings.activeModeId;
            const highlighted = i === highlightIdx;
            return (
              <button
                key={m.id}
                onClick={() => pick(m)}
                onMouseEnter={() => setHighlightIdx(i)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-left"
                style={{
                  background: highlighted
                    ? "rgba(255,255,255,0.06)"
                    : "rgba(255,255,255,0.02)",
                  border: `1px solid ${highlighted ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.04)"}`,
                }}
              >
                <ModeIcon cleanup={m.cleanup} />
                <span
                  className="flex-1 text-[14px] font-medium"
                  style={{ color: "rgba(230,232,238,0.95)" }}
                >
                  {m.name}
                </span>
                {active ? (
                  <CheckIcon />
                ) : (
                  <NumberBadge n={i + 1} />
                )}
              </button>
            );
          })}
        </div>

        {/* Footer hints */}
        <div
          className="flex items-center justify-between px-4 py-2.5"
          style={{
            background: "rgba(0,0,0,0.30)",
            borderTop: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <div className="flex items-center gap-1.5 opacity-60">
            <Triangle />
          </div>
          <div className="flex items-center gap-4">
            <Hint label="">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd>
            </Hint>
            <Hint label="Select">
              <Kbd>↵</Kbd>
            </Hint>
            <Hint label="Back">
              <Kbd>Space</Kbd>
            </Hint>
          </div>
        </div>
      </div>
    </div>
  );
}

function Hint({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      {label && (
        <span className="text-[12px]" style={{ color: "rgba(230,232,238,0.55)" }}>
          {label}
        </span>
      )}
      <div className="flex items-center gap-0.5">{children}</div>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd
      className="inline-flex items-center justify-center font-mono"
      style={{
        minWidth: 20,
        height: 20,
        padding: "0 5px",
        fontSize: 11,
        borderRadius: 4,
        background: "rgba(255,255,255,0.10)",
        color: "rgba(230,232,238,0.95)",
        border: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      {children}
    </kbd>
  );
}

function NumberBadge({ n }: { n: number }) {
  return (
    <span
      className="inline-flex items-center justify-center font-mono"
      style={{
        minWidth: 22,
        height: 22,
        fontSize: 11,
        borderRadius: 5,
        background: "rgba(255,255,255,0.08)",
        color: "rgba(230,232,238,0.85)",
      }}
    >
      {n}
    </span>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(230,232,238,0.95)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function ModeIcon({ cleanup }: { cleanup: string }) {
  if (cleanup === "raw" || cleanup === "prose" || cleanup === "list") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(230,232,238,0.85)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="23" />
        <line x1="8" y1="23" x2="16" y2="23" />
      </svg>
    );
  }
  // note / other
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(230,232,238,0.85)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="9" y1="13" x2="15" y2="13" />
      <line x1="9" y1="17" x2="13" y2="17" />
    </svg>
  );
}

function Triangle() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="rgba(230,232,238,0.4)" aria-hidden>
      <polygon points="12,4 22,20 2,20" />
    </svg>
  );
}
