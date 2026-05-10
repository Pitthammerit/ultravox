import { useEffect, useState } from "react";
import { tokens } from "./ui";

export type DuckPercent = 30 | 50 | 70;

interface DuckVolumePickerProps {
  value: DuckPercent;
  onChange: (next: DuckPercent) => void;
}

const OPTIONS: Array<{ id: DuckPercent; label: string; description: string }> = [
  { id: 30, label: "30%", description: "Subtle" },
  { id: 50, label: "50%", description: "Balanced" },
  { id: 70, label: "70%", description: "Strong" },
];

// Match PillStylePicker exactly so the two segmented controls read as one
// consistent design language. Identical card dims, identical color tokens,
// identical active scale + opacity transition.
const PREVIEW_BG = "#2d2d33";
const SMALL_ACTIVE_BORDER = "#224160";
const CARD_W = 112;
const CARD_H = 60;

/**
 * Three-option segmented control for picking how much to duck other audio
 * while recording. Visually identical to PillStylePicker's small-mode card
 * row — same width/height, same active border + scale + opacity transition.
 */
export function DuckVolumePicker({ value, onChange }: DuckVolumePickerProps) {
  // Optimistic local state — same pattern as PillStylePicker, prevents
  // a one-render lag when the parent's onChange involves a disk write.
  const [selected, setSelected] = useState<DuckPercent>(value);
  useEffect(() => { setSelected(value); }, [value]);

  return (
    <div className="flex gap-4 items-center justify-center">
      {OPTIONS.map((opt) => {
        const active = opt.id === selected;
        return (
          <button
            key={opt.id}
            type="button"
            aria-pressed={active}
            aria-label={`${opt.label} ${opt.description}`}
            title={`Duck other audio to ${100 - opt.id}% during recording`}
            onClick={() => {
              setSelected(opt.id);
              onChange(opt.id);
            }}
            className="rounded-lg flex flex-col items-center justify-center"
            style={{
              width: CARD_W,
              height: CARD_H,
              background: PREVIEW_BG,
              border: `1.5px solid ${active ? SMALL_ACTIVE_BORDER : "transparent"}`,
              cursor: "pointer",
              opacity: active ? 1 : 0.5,
              transform: active ? "scale(1.10)" : "scale(1)",
              transition: "opacity 0.15s, transform 0.15s",
              padding: 0,
            }}
          >
            <span style={{ fontSize: 16, fontWeight: 600, color: tokens.fg, lineHeight: 1.1 }}>
              {opt.label}
            </span>
            <span style={{ fontSize: 11, color: tokens.fgMuted, marginTop: 3, lineHeight: 1.1 }}>
              {opt.description}
            </span>
          </button>
        );
      })}
    </div>
  );
}
