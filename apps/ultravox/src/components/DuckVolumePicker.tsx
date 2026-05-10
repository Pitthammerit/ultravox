import { useEffect, useState } from "react";
import { tokens } from "./ui";

export type DuckPercent = 30 | 50 | 70;

interface DuckVolumePickerProps {
  value: DuckPercent;
  onChange: (next: DuckPercent) => void;
}

const OPTIONS: Array<{ id: DuckPercent; label: string; description: string }> = [
  { id: 30, label: "30%",  description: "Subtle dip" },
  { id: 50, label: "50%",  description: "Balanced — recommended" },
  { id: 70, label: "70%",  description: "Strong dip" },
];

const PREVIEW_BG = "#2d2d33";
const SMALL_ACTIVE_BORDER = "#224160";

/**
 * Three-option segmented control for picking how much to duck other audio
 * while recording. Mirrors PillStylePicker's small-mode shape so the two
 * pickers read as a consistent design language.
 */
export function DuckVolumePicker({ value, onChange }: DuckVolumePickerProps) {
  // Optimistic local state — same pattern as PillStylePicker, prevents
  // a one-render lag when the parent's onChange involves a disk write.
  const [selected, setSelected] = useState<DuckPercent>(value);
  useEffect(() => { setSelected(value); }, [value]);

  return (
    <div className="flex gap-3 items-center justify-center flex-wrap">
      {OPTIONS.map((opt) => {
        const active = opt.id === selected;
        return (
          <button
            key={opt.id}
            type="button"
            aria-pressed={active}
            onClick={() => {
              setSelected(opt.id);
              onChange(opt.id);
            }}
            className="rounded-lg flex flex-col items-center justify-center"
            style={{
              minWidth: 92,
              padding: "8px 14px",
              background: PREVIEW_BG,
              border: `1.5px solid ${active ? SMALL_ACTIVE_BORDER : "transparent"}`,
              cursor: "pointer",
              opacity: active ? 1 : 0.5,
              transform: active ? "scale(1.05)" : "scale(1)",
              transition: "opacity 0.15s, transform 0.15s",
              color: tokens.fg,
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 600 }}>{opt.label}</span>
            <span style={{ fontSize: 10.5, color: tokens.fgMuted, marginTop: 2 }}>
              {opt.description}
            </span>
          </button>
        );
      })}
    </div>
  );
}
