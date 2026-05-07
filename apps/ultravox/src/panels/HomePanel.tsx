import { useEffect, useRef, useState } from "react";
import { emit } from "@tauri-apps/api/event";
import type { AppSettings } from "../lib/store-bridge";
import { applyTheme, type ThemeChoice } from "@ultravox/design-system";
import {
  NavCard,
  Row,
  Section,
  tokens,
} from "../components/ui";
import { HotkeyRecorder } from "../components/HotkeyRecorder";
import { registerHotkeys } from "../lib/tauri-bridge";

interface HomePanelProps {
  settings: AppSettings;
  onNavigate: (s: "modes" | "vocabulary" | "configuration" | "sound" | "history") => void;
  onChange: (patch: Partial<AppSettings>) => Promise<void>;
}

export default function HomePanel({ settings, onNavigate, onChange }: HomePanelProps) {
  /* ── Theme ────────────────────────────────────────────────── */
  const appearance: "light" | "dark" | "auto" =
    settings.theme === "auto"
      ? "auto"
      : settings.theme === "light"
      ? "light"
      : "dark";
  const darkVariant: "ocean" | "night" =
    settings.theme === "dark-night" ? "night" : "ocean";

  const broadcastTheme = (theme: ThemeChoice) => {
    applyTheme(theme);
    // Tell other Tauri windows (pill, mode-overlay) to repaint with the new theme.
    emit("theme:changed", theme).catch(() => {});
  };

  const setAppearance = async (next: "light" | "dark" | "auto") => {
    let theme: ThemeChoice;
    if (next === "light") theme = "light";
    else if (next === "auto") theme = "auto";
    else theme = darkVariant === "night" ? "dark-night" : "dark-ocean";
    await onChange({ theme });
    broadcastTheme(theme);
  };

  const setDarkVariant = async (next: "ocean" | "night") => {
    const theme: ThemeChoice = next === "night" ? "dark-night" : "dark-ocean";
    await onChange({ theme });
    broadcastTheme(theme);
  };

  /* ── Shortcuts ────────────────────────────────────────────── */
  const recordDup =
    settings.hotkeyRecord !== "" &&
    settings.hotkeyRecord === settings.hotkeyModeOverlay;

  const updateHotkey = async (
    key: "hotkeyRecord" | "hotkeyModeOverlay",
    v: string,
  ) => {
    const next = { ...settings, [key]: v };
    await onChange({ [key]: v });
    try {
      await registerHotkeys(next.hotkeyRecord, next.hotkeyModeOverlay);
    } catch (e) {
      console.warn("hotkey register failed:", e);
    }
  };

  return (
    <>
      <Section title="Voice">
        <NavCard title="Modes" onClick={() => onNavigate("modes")} />
        <NavCard title="Vocabulary" onClick={() => onNavigate("vocabulary")} />
        <NavCard title="Sound & Microphone" onClick={() => onNavigate("sound")} />
      </Section>

      <Section
        label="Recording"
        help="Click a chip to record a new combo. Esc cancels, Backspace clears."
      >
        <Row
          label="Record toggle"
          control={
            <HotkeyRecorder
              value={settings.hotkeyRecord}
              onChange={(v) => updateHotkey("hotkeyRecord", v)}
              error={recordDup}
            />
          }
        />
        <Row
          label="Mode switcher"
          control={
            <HotkeyRecorder
              value={settings.hotkeyModeOverlay}
              onChange={(v) => updateHotkey("hotkeyModeOverlay", v)}
              error={recordDup}
            />
          }
        />
        <Row
          label="Push-to-talk"
          help="Hold the hotkey while speaking instead of toggling. Coming in v1.5."
          control={
            <span style={{ fontSize: 11, fontWeight: 500, padding: "3px 8px", borderRadius: 4, background: "var(--color-ink-15)", color: "var(--color-secondary)", letterSpacing: "0.04em" }}>
              v1.5
            </span>
          }
        />
      </Section>

      <Section label="Appearance">
        <Row
          label="Theme"
          control={
            <ThemePicker
              appearance={appearance}
              darkVariant={darkVariant}
              onAppearanceChange={setAppearance}
              onDarkVariantChange={setDarkVariant}
            />
          }
        />
      </Section>

      <Section title="App">
        <NavCard title="Configuration" onClick={() => onNavigate("configuration")} />
        <NavCard title="History" onClick={() => onNavigate("history")} />
      </Section>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────
   THEME PICKER — segmented Light/Dark/Auto with a popover
   under "Dark" for choosing Ocean / Night.
   ───────────────────────────────────────────────────────────── */

type Appearance = "light" | "dark" | "auto";
type DarkVariant = "ocean" | "night";

function ThemePicker({
  appearance,
  darkVariant,
  onAppearanceChange,
  onDarkVariantChange,
}: {
  appearance: Appearance;
  darkVariant: DarkVariant;
  onAppearanceChange: (a: Appearance) => void;
  onDarkVariantChange: (v: DarkVariant) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Click outside or Esc closes the popover.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const handleSegment = (next: Appearance) => {
    if (next === "dark") {
      // First click on Dark also opens the variant menu; second click toggles it.
      if (appearance !== "dark") onAppearanceChange("dark");
      setOpen((o) => !o);
    } else {
      onAppearanceChange(next);
      setOpen(false);
    }
  };

  const SegBtn = ({
    id,
    label,
    children,
  }: {
    id: Appearance;
    label?: string;
    children?: React.ReactNode;
  }) => {
    const active = id === appearance;
    return (
      <button
        onClick={() => handleSegment(id)}
        className="px-2.5 py-[3px] rounded text-[12px] font-medium transition-colors inline-flex items-center gap-1"
        style={{
          background: active ? tokens.card : "transparent",
          color: active ? tokens.fg : tokens.fgMuted,
          boxShadow: active ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
        }}
      >
        {label}
        {children}
      </button>
    );
  };

  return (
    <div ref={wrapRef} className="relative inline-block">
      <div
        className="inline-flex items-center gap-0.5 rounded-md p-0.5"
        style={{ background: tokens.control }}
      >
        <SegBtn id="light" label="Light" />
        <SegBtn id="dark" label="Dark">
          <Caret open={open} />
        </SegBtn>
        <SegBtn id="auto" label="Auto" />
      </div>

      {open && (
        <div
          role="menu"
          className="absolute z-30 mt-1 rounded-md p-1 flex flex-col"
          style={{
            top: "100%",
            left: "33%",
            transform: "translateX(-50%)",
            minWidth: 120,
            background: tokens.card,
            border: `1px solid ${tokens.borderStrong}`,
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
          }}
        >
          <PopItem
            label="Ocean"
            active={darkVariant === "ocean"}
            onClick={() => { onDarkVariantChange("ocean"); setOpen(false); }}
          />
          <PopItem
            label="Night"
            active={darkVariant === "night"}
            onClick={() => { onDarkVariantChange("night"); setOpen(false); }}
          />
        </div>
      )}
    </div>
  );
}

function Caret({ open }: { open: boolean }) {
  return (
    <svg
      width="9"
      height="9"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        transform: open ? "rotate(180deg)" : "rotate(0deg)",
        transition: "transform 120ms ease",
        opacity: 0.7,
      }}
      aria-hidden
    >
      <polyline points="3 4.5 6 7.5 9 4.5" />
    </svg>
  );
}

function PopItem({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      role="menuitemradio"
      aria-checked={active}
      onClick={onClick}
      className="flex items-center justify-between px-2.5 py-1.5 rounded text-[12px] font-medium transition-colors text-left"
      style={{
        color: tokens.fg,
        background: "transparent",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = tokens.controlHover)}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <span>{label}</span>
      {active && (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
    </button>
  );
}
