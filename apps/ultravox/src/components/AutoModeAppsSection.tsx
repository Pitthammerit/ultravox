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
 * apps. List of pills with × remove + an "Add app…" button that
 * triggers a native osascript "choose application" via the
 * pick_app_bundle Tauri command. Multi-select supported; adds are
 * de-duped by case-insensitive bundle ID. v0.19.0.
 *
 * Visual language matches the rest of the Mode editor (Group-style
 * frame with inline header label, similar to AccordionGroup but
 * non-collapsible — the apps list should be immediately visible
 * because seeing your current set is the whole point of this UI).
 */
export function AutoModeAppsSection({ mode, onChange }: AutoModeAppsSectionProps) {
  const t = useT();
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
      <div
        className="flex items-center justify-between w-full px-3 py-2"
        style={{
          fontSize: 12,
          fontWeight: 500,
          color: tokens.fg,
          borderBottom: `1px solid ${tokens.border}`,
        }}
      >
        <span>{t.panels.modes.autoModeAppsLabel}</span>
      </div>
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
    </div>
  );
}
