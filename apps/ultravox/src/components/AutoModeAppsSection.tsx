import { useState } from "react";
import { tokens, Button } from "./ui";
import { useT } from "../lib/i18n/I18nProvider";
import { pickAppBundle } from "../lib/tauri-bridge";
import type { VoiceMode } from "../lib/voiceModes";

interface AutoModeAppsSectionProps {
  mode: VoiceMode;
  onChange: (next: NonNullable<VoiceMode["autoModeApps"]>) => void;
}

/**
 * UI section inside the Mode editor for managing per-mode auto-switch
 * apps. Collapsible accordion (renamed "App-Auto mode" in v0.19.3 — was
 * "Auto-mode for this mode" in v0.19.0). List of pills with × remove +
 * an "Add app…" button that triggers a native osascript "choose
 * application" via the pick_app_bundle Tauri command. Multi-select
 * supported; adds are de-duped by case-insensitive bundle ID.
 *
 * Defaults to OPEN so first-time users see the empty-state hint and the
 * Add button. State is component-local — collapse persists for the
 * editor's lifetime (until the user navigates away and back).
 */
export function AutoModeAppsSection({ mode, onChange }: AutoModeAppsSectionProps) {
  const t = useT();
  const [open, setOpen] = useState(true);
  const apps = mode.autoModeApps ?? [];

  const handleAdd = async () => {
    const prompt = t.panels.modes.autoModeAppsPickerTitle(mode.name);
    try {
      const picked = await pickAppBundle(prompt);
      if (picked.length === 0) return; // user cancelled
      const existingIds = new Set(apps.map((a) => a.bundleId.toLowerCase()));
      const newApps = picked
        .filter((p) => !existingIds.has(p.bundleId.toLowerCase()))
        .map((p) => ({ bundleId: p.bundleId, displayName: p.displayName }));
      if (newApps.length === 0) return; // all picks were duplicates
      onChange([...apps, ...newApps]);
    } catch (e) {
      console.warn("[AutoModeAppsSection] pickAppBundle failed:", e);
    }
  };

  const handleRemove = (bundleId: string) => {
    onChange(apps.filter((a) => a.bundleId !== bundleId));
  };

  return (
    <div
      className="flex flex-col rounded-lg"
      style={{ background: tokens.card, border: `1px solid ${tokens.border}` }}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full px-3 py-2 text-left"
        style={{
          fontSize: 12,
          fontWeight: 500,
          color: tokens.fg,
          background: "transparent",
          cursor: "pointer",
          borderBottom: open ? `1px solid ${tokens.border}` : "none",
        }}
      >
        <span>{t.panels.modes.autoModeAppsLabel}</span>
        <svg
          width="10"
          height="6"
          viewBox="0 0 10 6"
          fill="none"
          style={{
            color: tokens.fgMuted,
            transform: open ? "rotate(0deg)" : "rotate(-90deg)",
            transition: "transform 120ms ease-out",
            flexShrink: 0,
          }}
        >
          <path
            d="M1 1L5 5L9 1"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && (
      <div className="flex flex-col gap-1.5 px-3 py-2">
        <p
          className="text-[11.5px] leading-snug pb-1"
          style={{ color: tokens.fgMuted }}
        >
          {t.panels.modes.autoModeAppsHelp(mode.name)}
        </p>
        {apps.length === 0 && (
          <p
            className="text-[12px] italic py-1"
            style={{ color: tokens.fgSubtle }}
          >
            {t.panels.modes.autoModeAppsEmpty}
          </p>
        )}
        {apps.map((app) => (
          <div
            key={app.bundleId}
            className="flex items-center justify-between rounded-md px-2.5 py-1.5"
            style={{
              background: tokens.control,
              border: `1px solid ${tokens.border}`,
            }}
          >
            <span style={{ fontSize: 12, color: tokens.fg }}>{app.displayName}</span>
            <button
              type="button"
              aria-label={t.panels.modes.autoModeAppsRemove(app.displayName)}
              onClick={() => handleRemove(app.bundleId)}
              style={{
                background: "none",
                border: "none",
                color: tokens.fgMuted,
                cursor: "pointer",
                fontSize: 14,
                padding: "0 4px",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "var(--color-warning)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = tokens.fgMuted;
              }}
            >
              ✕
            </button>
          </div>
        ))}
        <div className="pt-1">
          <Button size="xs" variant="outline" onClick={() => void handleAdd()}>
            {t.panels.modes.autoModeAppsAdd}
          </Button>
        </div>
      </div>
      )}
    </div>
  );
}
