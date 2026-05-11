import { useEffect, useState } from "react";
import { tokens } from "./ui";
import { useT } from "../lib/i18n/I18nProvider";

export type DuckPercent = 30 | 50 | 70;

interface DuckVolumePickerProps {
  value: DuckPercent;
  onChange: (next: DuckPercent) => void;
}

/**
 * Three-option segmented control for ducking depth.
 *
 * v0.18.11: refactored from the previous big-card layout (112×60 each
 * with scale-up animation) to a compact pill-style segmented control,
 * matching the visual language of HomePanel's RecordingStylePicker and
 * the SettingsWindow LanguagePicker. The Subtle/Balanced/Strong labels
 * describe the EFFECT (intensity); the exact percentage is in the hover
 * title for users who want the number.
 */
export function DuckVolumePicker({ value, onChange }: DuckVolumePickerProps) {
  const t = useT();
  // Optimistic local state — same pattern as PillStylePicker, prevents
  // a one-render lag when the parent's onChange involves a disk write.
  const [selected, setSelected] = useState<DuckPercent>(value);
  useEffect(() => { setSelected(value); }, [value]);

  const options: Array<{ id: DuckPercent; label: string }> = [
    { id: 30, label: t.panels.sound.duckSubtle },
    { id: 50, label: t.panels.sound.duckBalanced },
    { id: 70, label: t.panels.sound.duckStrong },
  ];

  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-md p-0.5"
      style={{ background: tokens.control }}
      role="radiogroup"
      aria-label={t.panels.sound.duckingDepth}
    >
      {options.map((opt) => {
        const active = opt.id === selected;
        return (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={`${opt.label} (${opt.id}%)`}
            title={t.panels.sound.duckTooltip(opt.id)}
            onClick={() => {
              setSelected(opt.id);
              onChange(opt.id);
            }}
            className="px-2.5 py-[3px] rounded text-[12px] font-medium transition-colors"
            style={{
              background: active ? tokens.card : "transparent",
              color: active ? tokens.fg : tokens.fgMuted,
              boxShadow: active ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
              cursor: "pointer",
              border: "none",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
