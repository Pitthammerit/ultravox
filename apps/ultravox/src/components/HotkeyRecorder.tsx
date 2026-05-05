import { useCallback, useEffect, useRef, useState } from "react";
import { tokens } from "./ui";

/**
 * Capture a global hotkey from real key events. Output is a Tauri-format
 * shortcut string (e.g. `Cmd+Shift+;`) — the same syntax accepted by
 * `tauri-plugin-global-shortcut`.
 *
 * UX: the button is a chip that says "Click to record" → "Press keys…".
 * Esc cancels, Backspace clears, any modifier+printable-key commits.
 */
interface HotkeyRecorderProps {
  value: string;
  onChange: (next: string) => void;
  /** Marks invalid (e.g. duplicate) — renders red border. */
  error?: boolean;
}

export function HotkeyRecorder({ value, onChange, error }: HotkeyRecorderProps) {
  const [recording, setRecording] = useState(false);
  const [draft, setDraft] = useState<string>("");
  const btnRef = useRef<HTMLButtonElement | null>(null);

  const stopRecording = useCallback(
    (commit: string | null) => {
      if (commit !== null && commit.length > 0) onChange(commit);
      setRecording(false);
      setDraft("");
    },
    [onChange],
  );

  useEffect(() => {
    if (!recording) return;

    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === "Escape") {
        stopRecording(null);
        return;
      }
      if (e.key === "Backspace" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        onChange("");
        setRecording(false);
        return;
      }

      const parts: string[] = [];
      if (e.metaKey) parts.push("Cmd");
      if (e.ctrlKey) parts.push("Ctrl");
      if (e.altKey) parts.push("Alt");
      if (e.shiftKey) parts.push("Shift");

      // Ignore plain modifier presses — wait for the actual key.
      const isModifierOnly =
        e.key === "Meta" ||
        e.key === "Control" ||
        e.key === "Alt" ||
        e.key === "Shift" ||
        e.key === "Cmd";
      if (isModifierOnly) {
        setDraft(parts.length ? `${parts.join("+")}+…` : "…");
        return;
      }

      const keyName = normalizeKey(e);
      if (!keyName) return;

      // Require at least one modifier — global hotkeys without a modifier
      // would intercept all typing.
      if (parts.length === 0) {
        setDraft("Need a modifier (⌘ ⌃ ⌥ ⇧)");
        return;
      }

      const combo = [...parts, keyName].join("+");
      stopRecording(combo);
    };

    window.addEventListener("keydown", handler, { capture: true });
    return () => window.removeEventListener("keydown", handler, { capture: true } as EventListenerOptions);
  }, [recording, onChange, stopRecording]);

  const start = () => {
    setDraft("Press keys…");
    setRecording(true);
    btnRef.current?.focus();
  };

  const display = recording ? draft || "Press keys…" : value || "Click to record";
  const isPlaceholder = !recording && !value;

  return (
    <button
      ref={btnRef}
      onClick={() => (recording ? stopRecording(null) : start())}
      onBlur={() => recording && stopRecording(null)}
      className="inline-flex items-center rounded-md font-mono transition-colors"
      style={{
        background: recording ? tokens.control : tokens.control,
        color: isPlaceholder ? tokens.fgSubtle : tokens.fg,
        padding: "4px 10px",
        fontSize: 11.5,
        border: `1px solid ${
          error ? "var(--s-warning)" : recording ? tokens.borderStrong : tokens.border
        }`,
        minWidth: 110,
        outline: recording ? `2px solid ${tokens.fg}` : "none",
        outlineOffset: 1,
      }}
    >
      {display}
    </button>
  );
}

/**
 * Map a KeyboardEvent to a Tauri-shortcut key name.
 * Tauri accepts: A-Z, 0-9, F1-F24, named keys (Space, Enter, Escape, Up, ...),
 * and punctuation (Semicolon, Comma, Period, Slash, ...).
 */
function normalizeKey(e: KeyboardEvent): string | null {
  // Letters: use uppercase A-Z regardless of layout.
  if (/^[a-zA-Z]$/.test(e.key)) return e.key.toUpperCase();
  // Digits: 0-9
  if (/^[0-9]$/.test(e.key)) return e.key;
  // Function keys
  if (/^F\d{1,2}$/.test(e.key)) return e.key;

  const named: Record<string, string> = {
    " ": "Space",
    Enter: "Enter",
    Tab: "Tab",
    ArrowUp: "Up",
    ArrowDown: "Down",
    ArrowLeft: "Left",
    ArrowRight: "Right",
    Home: "Home",
    End: "End",
    PageUp: "PageUp",
    PageDown: "PageDown",
    ";": "Semicolon",
    ":": "Semicolon",
    ",": "Comma",
    ".": "Period",
    "/": "Slash",
    "\\": "Backslash",
    "'": "Quote",
    "`": "Backquote",
    "-": "Minus",
    "=": "Equal",
    "[": "BracketLeft",
    "]": "BracketRight",
  };
  return named[e.key] ?? null;
}
