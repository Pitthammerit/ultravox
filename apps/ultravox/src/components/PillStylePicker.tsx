import { tokens } from "./ui";

export type PillStyle = "classic" | "mini" | "none";

interface PillStylePickerProps {
  value: PillStyle;
  onChange: (next: PillStyle) => void;
  /**
   * "small" — compact 3-card row used in Settings.
   * "large" — bigger preview cards used in Onboarding.
   */
  size?: "small" | "large";
}

const OPTIONS: Array<{ id: PillStyle; label: string; description: string }> = [
  { id: "classic", label: "Classic", description: "Full pill with waveform" },
  { id: "mini",    label: "Mini",    description: "Compact dots at top of screen" },
  { id: "none",    label: "None",    description: "No window — silent recording" },
];

export function PillStylePicker({ value, onChange, size = "small" }: PillStylePickerProps) {
  const cardWidth = size === "large" ? 168 : 120;
  const previewHeight = size === "large" ? 80 : 56;
  const labelSize = size === "large" ? 13 : 12;
  const descSize = size === "large" ? 12 : 11;

  return (
    <div className="flex gap-2">
      {OPTIONS.map((opt) => {
        const active = opt.id === value;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className="flex flex-col items-center rounded-lg p-2 transition-colors"
            style={{
              width: cardWidth,
              // Same surface for selected and unselected — selection is signaled
              // by the border alone (matches the Superwhisper-style picker).
              background: tokens.control,
              border: `1.5px solid ${active ? "var(--color-primary)" : tokens.border}`,
              cursor: "pointer",
            }}
          >
            <div
              className="w-full rounded-md flex items-center justify-center mb-2"
              style={{
                height: previewHeight,
                background: "#0a0a0e",
                position: "relative",
                overflow: "hidden",
              }}
            >
              <PillPreview style={opt.id} size={size} />
            </div>
            <div className="font-medium" style={{ fontSize: labelSize, color: tokens.fg }}>
              {opt.label}
            </div>
            {size === "large" && (
              <div
                className="text-center mt-0.5"
                style={{ fontSize: descSize, color: tokens.fgMuted, lineHeight: 1.3 }}
              >
                {opt.description}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Mini CSS recreation of each pill state for the picker preview cards.
 * Uses the same color/shape vocabulary as the live pill so updates to the
 * real pill design carry over visually.
 */
function PillPreview({ style, size }: { style: PillStyle; size: "small" | "large" }) {
  const scale = size === "large" ? 1 : 0.72;

  if (style === "none") {
    return (
      <svg
        width={28 * scale}
        height={28 * scale}
        viewBox="0 0 24 24"
        fill="none"
        stroke="rgba(255,255,255,0.45)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 3l18 18" />
        <path d="M10.94 6.08A4 4 0 0 1 16 10v1m-1.41 4.59A4 4 0 0 1 12 16a4 4 0 0 1-4-4v-1" />
        <path d="M5 12a7 7 0 0 0 .39 2.32" />
        <path d="M19 12a7 7 0 0 1-7 7" />
        <line x1="12" y1="19" x2="12" y2="22" />
      </svg>
    );
  }

  if (style === "mini") {
    return (
      <div
        style={{
          width: 86 * scale,
          height: 22 * scale,
          borderRadius: 999,
          background: "#1a1a22",
          border: "1px solid rgba(255,255,255,0.08)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 3 * scale,
        }}
      >
        {[0.5, 0.8, 1.0, 0.8, 0.5].map((h, i) => (
          <span
            key={i}
            style={{
              width: 2.5 * scale,
              height: 12 * scale * h,
              background: "#ffffff",
              borderRadius: 1,
              opacity: 0.7,
            }}
          />
        ))}
      </div>
    );
  }

  // classic
  return (
    <div
      style={{
        width: 144 * scale,
        height: 36 * scale,
        borderRadius: 999,
        background: "#1a1a22",
        border: "1px solid rgba(255,255,255,0.08)",
        display: "flex",
        alignItems: "center",
        padding: `0 ${10 * scale}px`,
        gap: 1.5 * scale,
        overflow: "hidden",
      }}
    >
      {Array.from({ length: 22 }).map((_, i) => {
        const h = 4 + Math.abs(Math.sin((i + 1) * 0.7)) * 14;
        return (
          <span
            key={i}
            style={{
              flex: 1,
              height: h * scale,
              background: "#ffffff",
              borderRadius: 1,
              opacity: 0.55 + Math.abs(Math.cos(i * 1.3)) * 0.3,
            }}
          />
        );
      })}
    </div>
  );
}
