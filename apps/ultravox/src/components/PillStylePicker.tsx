import { useEffect, useState } from "react";
import { tokens } from "./ui";

export type PillStyle = "classic" | "mini";

interface PillStylePickerProps {
  value: PillStyle;
  onChange: (next: PillStyle) => void;
  /**
   * "small" — compact 2-card row used in Settings.
   * "large" — bigger preview cards used in Onboarding.
   */
  size?: "small" | "large";
}

const OPTIONS: Array<{ id: PillStyle; label: string; description: string }> = [
  { id: "classic", label: "Classic", description: "Full pill with waveform" },
  { id: "mini",    label: "Mini",    description: "Compact dots at top of screen" },
];

export function PillStylePicker({ value, onChange, size = "small" }: PillStylePickerProps) {
  const labelSize = size === "large" ? 13 : 12;
  const descSize = size === "large" ? 12 : 11;

  // Local optimistic selection. The picker shows what the user just clicked
  // immediately, even before the parent re-renders with the new `value`.
  // Without this, in some setups (Configuration panel passing a prop from a
  // parent whose `update` callback awaits a disk write before its setState
  // resolves visibly), the visual selection lagged a render and users had
  // to click twice. Sync from prop in an effect so external changes (e.g.
  // an onboarding wizard reset, a pillStyle:changed event from another
  // window) still flow through.
  const [selected, setSelected] = useState<PillStyle>(value);
  useEffect(() => { setSelected(value); }, [value]);

  return (
    <div className="flex gap-2 items-center">
      {OPTIONS.map((opt) => {
        const active = opt.id === selected;
        const handleClick = () => {
          setSelected(opt.id);
          onChange(opt.id);
        };
        const dims = cardDims(opt.id, size);

        if (size === "small") {
          return (
            <button
              key={opt.id}
              type="button"
              title={opt.label}
              aria-label={opt.label}
              aria-pressed={active}
              onClick={handleClick}
              className="rounded-lg flex items-center justify-center transition-colors"
              style={{
                width: dims.cardWidth,
                height: dims.cardHeight,
                background: "#0a0a0e",
                border: `1.5px solid ${active ? "#ffffff" : "transparent"}`,
                cursor: "pointer",
                overflow: "hidden",
                padding: 0,
              }}
            >
              <PillPreview style={opt.id} size={size} />
            </button>
          );
        }

        return (
          <button
            key={opt.id}
            type="button"
            onClick={handleClick}
            className="flex flex-col items-center rounded-lg p-2 transition-colors"
            style={{
              width: dims.cardWidth,
              background: tokens.control,
              border: `1.5px solid ${active ? "#ffffff" : tokens.border}`,
              cursor: "pointer",
            }}
          >
            <div
              className="w-full rounded-md flex items-center justify-center mb-2"
              style={{
                height: dims.cardHeight,
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
            <div
              className="text-center mt-0.5"
              style={{ fontSize: descSize, color: tokens.fgMuted, lineHeight: 1.3 }}
            >
              {opt.description}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function cardDims(_style: PillStyle, size: "small" | "large"): { cardWidth: number; cardHeight: number } {
  // Both cards share identical outer dimensions so the row reads as a uniform
  // segmented control. The pill *inside* differs in size to communicate the
  // two styles' relative footprints.
  if (size === "large") {
    return { cardWidth: 123, cardHeight: 59 };
  }
  return { cardWidth: 112, cardHeight: 43 };
}

/**
 * Visual recreations of each pill style for the picker preview cards.
 * Uses the same pill-* CSS tokens as the live pill so updates carry over.
 */
function PillPreview({ style, size }: { style: PillStyle; size: "small" | "large" }) {
  if (style === "mini") return <MiniPreview size={size} />;
  return <ClassicPreview size={size} />;
}

function MiniPreview({ size }: { size: "small" | "large" }) {
  const scale = size === "large" ? 0.61 : 0.47;
  const width = 130 * scale;
  const height = 28 * scale;
  const padX = 8 * scale;
  const innerW = width - padX * 2 - 14 * scale; /* leave room for X */
  const bars = 28;
  return (
    <div
      style={{
        width,
        height,
        borderRadius: 999,
        background: "rgba(13, 24, 38, 0.98)",
        border: "1px solid rgba(255,255,255,0.08)",
        display: "flex",
        alignItems: "center",
        padding: `0 ${padX}px`,
        gap: 4 * scale,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: innerW,
          height: "100%",
          display: "flex",
          alignItems: "center",
          gap: 1.5 * scale,
        }}
      >
        {Array.from({ length: bars }).map((_, i) => {
          const dist = Math.abs(i - (bars - 1) / 2) / ((bars - 1) / 2);
          const envelope = 1 - dist * 0.85;
          const variance = 0.4 + Math.abs(Math.sin((i + 1) * 1.4)) * 0.6;
          const h = Math.max(2 * scale, (height - 8) * envelope * variance);
          return (
            <span
              key={i}
              style={{
                flex: 1,
                height: h,
                background: "#ffffff",
                borderRadius: 1,
                opacity: 0.78,
              }}
            />
          );
        })}
      </div>
      <span
        aria-hidden
        style={{
          color: "rgba(255,255,255,0.55)",
          fontSize: 11 * scale,
          lineHeight: 1,
          marginLeft: "auto",
        }}
      >
        ✕
      </span>
    </div>
  );
}

function ClassicPreview({ size }: { size: "small" | "large" }) {
  const scale = size === "large" ? 0.61 : 0.51;
  const width = 184 * scale;
  const height = 70 * scale;
  const waveformH = 40 * scale;
  const footerH = height - waveformH;
  const padX = 10 * scale;
  const bars = 38;
  return (
    <div
      style={{
        width,
        height,
        borderRadius: 10 * scale,
        background: "rgba(13, 24, 38, 0.98)",
        border: "1px solid rgba(255,255,255,0.08)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Waveform row */}
      <div
        style={{
          height: waveformH,
          display: "flex",
          alignItems: "center",
          gap: 1.5 * scale,
          padding: `0 ${padX}px`,
        }}
      >
        {Array.from({ length: bars }).map((_, i) => {
          const dist = Math.abs(i - (bars - 1) / 2) / ((bars - 1) / 2);
          const envelope = 1 - dist * 0.55;
          const variance = 0.35 + Math.abs(Math.sin((i + 1) * 0.7) * 0.5 + Math.cos(i * 0.4) * 0.4);
          const h = Math.max(2 * scale, (waveformH - 10) * envelope * Math.min(1, variance));
          return (
            <span
              key={i}
              style={{
                flex: 1,
                height: h,
                background: "#ffffff",
                borderRadius: 1,
                opacity: 0.82,
              }}
            />
          );
        })}
      </div>

      {/* Footer */}
      <div
        style={{
          height: footerH,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: `0 ${padX}px`,
          background: "rgba(0,0,0,0.28)",
          borderTop: "1px solid rgba(255,255,255,0.05)",
          color: "rgba(255,255,255,0.85)",
          fontSize: 9.5 * scale,
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 * scale, fontWeight: 500 }}>
          <ChatBubbleIcon size={9.5 * scale} />
          <span>Message</span>
        </span>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 3 * scale,
            color: "rgba(255,255,255,0.6)",
          }}
        >
          <span>Stop</span>
          <Kbd scale={scale}>⌘</Kbd>
          <Kbd scale={scale}>Space</Kbd>
        </span>
      </div>
    </div>
  );
}

function Kbd({ children, scale }: { children: React.ReactNode; scale: number }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 12 * scale,
        height: 12 * scale,
        padding: `0 ${3 * scale}px`,
        fontSize: 8.5 * scale,
        borderRadius: 2,
        background: "rgba(255,255,255,0.12)",
        color: "rgba(255,255,255,0.85)",
        fontFamily: "monospace",
        lineHeight: 1,
      }}
    >
      {children}
    </span>
  );
}

function ChatBubbleIcon({ size }: { size: number }) {
  return (
    <svg
      width={size * 1.3}
      height={size * 1.3}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 4h10a1.5 1.5 0 0 1 1.5 1.5v5A1.5 1.5 0 0 1 13 12H7l-3 2.5V12H3a1.5 1.5 0 0 1-1.5-1.5v-5A1.5 1.5 0 0 1 3 4z" />
    </svg>
  );
}
