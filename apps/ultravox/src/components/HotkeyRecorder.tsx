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

  const display = recording ? draft || "Press keys…" : value ? prettifyShortcut(value) : "Click to record";
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

/** Convert stored shortcut string ("Cmd+Shift+Semicolon") to readable display. */
export function prettifyShortcut(s: string): string {
  return s
    .split("+")
    .map((p) => {
      switch (p) {
        case "Cmd": return "⌘";
        case "Ctrl": return "⌃";
        case "Alt": return "⌥";
        case "Shift": return "⇧";
        case "Semicolon": return ";";
        case "Comma": return ",";
        case "Period": return ".";
        case "Slash": return "/";
        case "Backslash": return "\\";
        case "Quote": return "'";
        case "Backquote": return "`";
        case "Minus": return "-";
        case "Equal": return "=";
        case "BracketLeft": return "[";
        case "BracketRight": return "]";
        case "Space": return "Space";
        default: return p;
      }
    })
    .join(" ");
}

/**
 * Map a KeyboardEvent to a Tauri-shortcut key name using e.code (physical
 * key position) instead of e.key (layout-dependent character). This makes
 * hotkey capture work correctly on non-US keyboards (e.g. German Ö = Semicolon).
 */
function normalizeKey(e: KeyboardEvent): string | null {
  const code = e.code;

  // Letters: KeyA → "A", KeyZ → "Z"
  const letterMatch = code.match(/^Key([A-Z])$/);
  if (letterMatch) return letterMatch[1]!;

  // Digits: Digit0 → "0" … Digit9 → "9"
  const digitMatch = code.match(/^Digit([0-9])$/);
  if (digitMatch) return digitMatch[1]!;

  // Function keys: F1-F24
  if (/^F\d{1,2}$/.test(code)) return code;

  // Named / punctuation — physical key → Tauri name
  const codeMap: Record<string, string> = {
    Space: "Space",
    Enter: "Enter",
    NumpadEnter: "Enter",
    Tab: "Tab",
    ArrowUp: "Up",
    ArrowDown: "Down",
    ArrowLeft: "Left",
    ArrowRight: "Right",
    Home: "Home",
    End: "End",
    PageUp: "PageUp",
    PageDown: "PageDown",
    Semicolon: "Semicolon",   // physical ; key — shows as Ö on German keyboards
    Comma: "Comma",
    Period: "Period",
    Slash: "Slash",
    Backslash: "Backslash",
    Quote: "Quote",
    Backquote: "Backquote",
    Minus: "Minus",
    Equal: "Equal",
    BracketLeft: "BracketLeft",
    BracketRight: "BracketRight",
  };
  return codeMap[code] ?? null;
}
