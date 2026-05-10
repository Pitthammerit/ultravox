import { useEffect, useRef, useState } from "react";
import { emit } from "@tauri-apps/api/event";
import type { AppSettings } from "../lib/store-bridge";
import { applyTheme, type ThemeChoice } from "@ultravox/design-system";
import {
  Button,
  NavCard,
  Row,
  Section,
  tokens,
} from "../components/ui";
import { HotkeyRecorder } from "../components/HotkeyRecorder";
import { registerHotkeys, copyToClipboard } from "../lib/tauri-bridge";
import { useT } from "../lib/i18n/I18nProvider";

interface HomePanelProps {
  settings: AppSettings;
  onNavigate: (s: "modes" | "vocabulary" | "configuration" | "sound" | "history") => void;
  onChange: (patch: Partial<AppSettings>) => Promise<void>;
}

export default function HomePanel({ settings, onNavigate, onChange }: HomePanelProps) {
  const t = useT();
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

  /* ── Last-transcription safety net ─────────────────────────
   * If a paste landed in the wrong place (focus drifted, the
   * captured PID was stale, etc.), the user can recover the most
   * recent transcript without re-recording. Same data is also
   * exposed via the tray menu. The history array already stores
   * up to 50 entries (HISTORY_MAX). */
  const lastEntry = settings.history?.[0] ?? null;
  const [copied, setCopied] = useState(false);
  const copyLast = async () => {
    if (!lastEntry?.text) return;
    try {
      // Route through Rust for consistency with the tray-menu path —
      // dodges any WKWebView clipboard-policy quirks on different macOS
      // versions and gives one source of truth for clipboard writes.
      await copyToClipboard(lastEntry.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch (e) {
      console.warn("copyLast failed:", e);
    }
  };
  const lastPreview = lastEntry?.text
    ? lastEntry.text.length > 80
      ? lastEntry.text.slice(0, 78) + "…"
      : lastEntry.text
    : null;

  return (
    <>
      {lastEntry && (
        <Section
          label={t.panels.home.lastTranscriptionLabel}
          help={t.panels.home.lastTranscriptionHelp}
        >
          <Row
            label={
              <span style={{ fontSize: 12, color: tokens.fgMuted, fontStyle: "italic" }}>
                {lastPreview}
              </span>
            }
            control={
              <Button size="xs" variant="outline" onClick={copyLast}>
                {copied ? t.common.copied : t.common.copy}
              </Button>
            }
          />
        </Section>
      )}
      <Section title={t.panels.home.sectionVoice}>
        <NavCard title={t.panels.home.navModes} onClick={() => onNavigate("modes")} />
        <NavCard title={t.panels.home.navVocabulary} onClick={() => onNavigate("vocabulary")} />
        <NavCard title={t.panels.home.navSound} onClick={() => onNavigate("sound")} />
      </Section>

      <Section
        label={t.panels.home.sectionRecording}
        help={t.panels.home.hotkeyHelp}
      >
        <Row
          label={t.panels.home.recordToggle}
          control={
            <HotkeyRecorder
              value={settings.hotkeyRecord}
              onChange={(v) => updateHotkey("hotkeyRecord", v)}
              error={recordDup}
            />
          }
        />
        <Row
          label={t.panels.home.modeSwitcher}
          control={
            <HotkeyRecorder
              value={settings.hotkeyModeOverlay}
              onChange={(v) => updateHotkey("hotkeyModeOverlay", v)}
              error={recordDup}
            />
          }
        />
        <Row
          label={t.panels.home.pushToTalk}
          help={t.panels.home.pushToTalkHelp}
          control={
            <span style={{ fontSize: 11, fontWeight: 500, padding: "3px 8px", borderRadius: 4, background: "var(--color-ink-15)", color: "var(--color-secondary)", letterSpacing: "0.04em" }}>
              {t.panels.home.pushToTalkPlaceholder}
            </span>
          }
        />
      </Section>

      <Section label={t.panels.home.sectionAppearance}>
        <Row
          label={t.panels.home.themeLabel}
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

      <Section title={t.panels.home.sectionApp}>
        <NavCard title={t.panels.home.navConfiguration} onClick={() => onNavigate("configuration")} />
        <NavCard title={t.panels.home.navHistory} onClick={() => onNavigate("history")} />
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
  const t = useT();
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
        <SegBtn id="light" label={t.panels.home.themeLight} />
        <SegBtn id="dark" label={t.panels.home.themeDark}>
          <Caret open={open} />
        </SegBtn>
        <SegBtn id="auto" label={t.panels.home.themeAuto} />
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
            label={t.panels.home.themeOcean}
            active={darkVariant === "ocean"}
            onClick={() => { onDarkVariantChange("ocean"); setOpen(false); }}
          />
          <PopItem
            label={t.panels.home.themeNight}
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
