/**
 * Settings UI primitives — shadcn/ui-inspired. Refined, dense, predictable.
 *
 * All colors come from CSS variables defined in `styles/settings.css`
 * (--s-* tokens). Inline styles are used intentionally — they're immune
 * to Tailwind v4's compilation quirks with token-based utility classes.
 */
import { forwardRef, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { setTrafficLightsVisible } from "../lib/tauri-bridge";

const T = {
  page: "var(--s-page)",
  card: "var(--s-card)",
  cardHover: "var(--s-card-hover)",
  border: "var(--s-border)",
  borderStrong: "var(--s-border-strong)",
  fg: "var(--s-fg)",
  fgMuted: "var(--s-fg-muted)",
  fgSubtle: "var(--s-fg-subtle)",
  accent: "var(--s-accent)",
  accentFg: "var(--s-accent-fg)",
  control: "var(--s-control)",
  controlHover: "var(--s-control-hover)",
  warning: "var(--s-warning)",
} as const;

export const tokens = T;

/* ─────────────────────────────────────────────────────────────
   PAGE HEADER  (drag region with traffic-light clearance + breadcrumb)
   ───────────────────────────────────────────────────────────── */

interface PageHeaderProps {
  breadcrumb?: string | undefined;
  onBack?: (() => void) | null;
  right?: ReactNode;
}

export function PageHeader({ breadcrumb, onBack, right }: PageHeaderProps) {
  // Traffic lights autohide — hidden by default, visible only while hovering
  // the header region. Restored on unmount so closing the window via code
  // (e.g. onComplete in onboarding) doesn't leave them permanently hidden.
  useEffect(() => {
    setTrafficLightsVisible(false).catch(() => {});
    return () => { setTrafficLightsVisible(true).catch(() => {}); };
  }, []);

  return (
    <header
      data-tauri-drag-region
      className="relative shrink-0 flex items-center"
      style={{ background: T.page, height: 40 }}
      onMouseEnter={() => setTrafficLightsVisible(true).catch(() => {})}
      onMouseLeave={() => setTrafficLightsVisible(false).catch(() => {})}
    >
      {/* Title abbreviates to "UV" in sub-pages so the breadcrumb fits */}
      <CenteredHeaderTitle
        title={breadcrumb ? "UV" : "Ultravox"}
        color={T.fg}
        breadcrumb={breadcrumb}
        onBack={onBack ?? null}
      />

      {right && !breadcrumb && (
        <div className="absolute flex items-center" style={{ right: 16, top: 0, bottom: 0, display: "flex", alignItems: "center" }}>
          {right}
        </div>
      )}

      {/* Mirrored waveform replaces the border-b divider */}
      <HeaderWaveform />
    </header>
  );
}

/** Static mirrored waveform separator — same envelope+variance formula as
 *  the pill previews. Right half computed, left half is an exact mirror. */
function HeaderWaveform() {
  const HALF = 32;
  const MAX_H = 8;
  // Compute right half: i=0 = center, i=HALF-1 = right edge
  const rightHalf = Array.from({ length: HALF }, (_, i) => {
    const dist = i / (HALF - 1);
    const envelope = 1 - dist * 0.55;
    const variance = 0.35 + Math.abs(Math.sin((i + 1) * 0.7) * 0.5 + Math.cos(i * 0.4) * 0.4);
    return Math.max(1, MAX_H * envelope * Math.min(1, variance));
  });
  const bars = [...[...rightHalf].reverse(), ...rightHalf];

  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        height: MAX_H + 1,
        display: "flex",
        alignItems: "flex-end",
        gap: 1,
        pointerEvents: "none",
      }}
    >
      {bars.map((h, i) => (
        <span
          key={i}
          style={{
            flex: 1,
            height: h,
            background: "var(--s-header-wave)",
            borderRadius: "1px 1px 0 0",
            opacity: 0.55,
          }}
        />
      ))}
    </div>
  );
}

/* Title + optional breadcrumb live in a single flex group that is always
   centered as a unit. "ULTRAVOX" is wide so the text fills the group and
   reads as centered. When in a sub-page the group becomes "UV ‹ Modes":
   "UV" sits left-of-center (making room) while the breadcrumb fills the
   right — no layout measurement needed. */
function CenteredHeaderTitle({
  title,
  color,
  breadcrumb,
  onBack,
}: {
  title: string;
  color: string;
  breadcrumb?: string | undefined;
  onBack?: (() => void) | null;
}) {
  return (
    <div
      className="absolute flex items-center gap-1.5 pointer-events-none"
      style={{ left: "50%", transform: "translateX(-50%)", top: 0, bottom: 0, whiteSpace: "nowrap" }}
    >
      <span
        className="text-[15px] font-semibold"
        style={{ color, textTransform: "uppercase", letterSpacing: "0.08em", opacity: breadcrumb ? 0.5 : 1 }}
      >
        {title}
      </span>

      {breadcrumb && onBack && (
        <button
          onClick={onBack}
          aria-label={`Back from ${breadcrumb}`}
          className="flex items-center gap-0.5 text-[15px] font-semibold transition-opacity hover:opacity-70 pointer-events-auto"
          style={{ color, background: "none", border: "none", cursor: "pointer", padding: 0 }}
        >
          <span style={{ fontSize: 17, lineHeight: 1 }}>‹</span>
          <span>{breadcrumb}</span>
        </button>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   SECTION
   ───────────────────────────────────────────────────────────── */

interface SectionProps {
  title?: string;
  label?: string;
  description?: string;
  help?: string | undefined;
  right?: ReactNode;
  children: ReactNode;
}

export function Section({
  title,
  label,
  description,
  help,
  right,
  children,
}: SectionProps) {
  return (
    <section className="flex flex-col gap-1.5">
      {title && (
        <div className="flex items-center justify-between">
          <h2
            className="text-[14px] font-semibold tracking-tight"
            style={{ color: T.fg }}
          >
            {title}
          </h2>
          {right}
        </div>
      )}
      {label && (
        <div className="flex items-center justify-between">
          <SectionLabel help={help}>{label}</SectionLabel>
          {right}
        </div>
      )}
      {description && (
        <p
          className="text-[13px] leading-relaxed -mt-1"
          style={{ color: T.fgMuted }}
        >
          {description}
        </p>
      )}
      <div className="flex flex-col gap-1">{children}</div>
    </section>
  );
}

export function SectionLabel({
  children,
  help,
}: {
  children: ReactNode;
  help?: string | undefined;
}) {
  return (
    <div
      className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.14em] font-medium"
      style={{ color: T.fgMuted }}
    >
      <span>{children}</span>
      {help && <HelpIcon tooltip={help} />}
    </div>
  );
}

export function HelpIcon({ tooltip }: { tooltip?: string }) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [tipPos, setTipPos] = useState<{ bottom: number; left: number } | null>(null);

  function updateTipPos() {
    if (!anchorRef.current) return;
    const r = anchorRef.current.getBoundingClientRect();
    setTipPos({
      // "bottom" in fixed context = distance from viewport bottom to tip's bottom edge.
      // Placing tip bottom 6px above anchor top keeps it clear of the icon.
      bottom: window.innerHeight - r.top + 6,
      left: r.left + r.width / 2,
    });
  }

  return (
    <span className="ux-help inline-flex items-center" onMouseEnter={updateTipPos} ref={anchorRef}>
      <span
        className="inline-flex items-center justify-center cursor-help shrink-0"
        style={{ width: 13, height: 13, color: T.fgSubtle }}
        aria-label={tooltip}
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </span>
      {tooltip && (
        <span
          className="ux-help-tip"
          role="tooltip"
          style={tipPos ? { bottom: tipPos.bottom, left: tipPos.left } : undefined}
        >
          {tooltip}
        </span>
      )}
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────
   CARD
   ───────────────────────────────────────────────────────────── */

const cardBase: CSSProperties = {
  background: T.card,
  border: `1px solid ${T.border}`,
  borderRadius: 8,
};

export function Card({
  children,
  selected,
  onClick,
}: {
  children: ReactNode;
  selected?: boolean;
  onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={`block w-full text-left px-3 py-1.5 transition-colors ${onClick ? "hover:bg-[var(--s-card-hover)]" : ""}`}
      style={{
        ...cardBase,
        borderColor: selected ? T.fg : T.border,
      }}
    >
      {children}
    </Tag>
  );
}

/* ─────────────────────────────────────────────────────────────
   NAV CARD  (title + subtitle + chevron)
   ───────────────────────────────────────────────────────────── */

export function NavCard({
  title,
  subtitle,
  onClick,
}: {
  title: string;
  subtitle?: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center justify-between w-full text-left px-3 py-1.5 transition-colors hover:bg-[var(--s-card-hover)]"
      style={cardBase}
    >
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-[13.5px] font-medium" style={{ color: T.fg }}>
          {title}
        </span>
        {subtitle && (
          <span className="text-[12px] truncate" style={{ color: T.fgMuted }}>
            {subtitle}
          </span>
        )}
      </div>
      <span className="text-[16px] leading-none ml-3" style={{ color: T.fgSubtle }}>
        ›
      </span>
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────
   RADIO CARD
   ───────────────────────────────────────────────────────────── */

export function RadioCard({
  title,
  subtitle,
  selected,
  onClick,
}: {
  title: string;
  subtitle?: ReactNode;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-start gap-3 w-full text-left px-3 py-1.5 transition-colors hover:bg-[var(--s-card-hover)]"
      style={{ ...cardBase, borderColor: selected ? T.fg : T.border }}
    >
      <span
        className="mt-0.5 inline-flex items-center justify-center w-4 h-4 rounded-full shrink-0"
        style={{
          border: `1.5px solid ${selected ? T.fg : T.borderStrong}`,
        }}
      >
        {selected && (
          <span
            className="w-2 h-2 rounded-full"
            style={{ background: T.fg }}
          />
        )}
      </span>
      <div className="flex flex-col gap-0.5 min-w-0">
        <span
          className="text-[13.5px] font-medium leading-tight"
          style={{ color: T.fg }}
        >
          {title}
        </span>
        {subtitle && (
          <span
            className="text-[12px] leading-tight"
            style={{ color: T.fgMuted }}
          >
            {subtitle}
          </span>
        )}
      </div>
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────
   ROW  (label left, control right)
   ───────────────────────────────────────────────────────────── */

export function Row({
  label,
  description,
  help,
  control,
}: {
  label: ReactNode;
  description?: string;
  help?: string | undefined;
  control: ReactNode;
}) {
  return (
    <div
      className="flex items-center justify-between px-3 py-1.5"
      style={cardBase}
    >
      <div className="flex flex-col gap-0 min-w-0">
        <div className="flex items-center gap-1.5">
          <span
            className="text-[12.5px] font-medium"
            style={{ color: T.fg }}
          >
            {label}
          </span>
          {help && <HelpIcon tooltip={help} />}
        </div>
        {description && (
          <span className="text-[12px]" style={{ color: T.fgMuted }}>
            {description}
          </span>
        )}
      </div>
      <div className="shrink-0 ml-3 flex items-center">{control}</div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   FIELD  (frameless inline label · control · help)
   Use inside cards/groups to avoid frame-in-frame nesting.
   ───────────────────────────────────────────────────────────── */

export function Field({
  label,
  help,
  control,
}: {
  label: ReactNode;
  help?: string | undefined;
  control: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <div className="flex items-center gap-1.5 min-w-0">
        <span
          className="text-[12.5px] font-medium truncate"
          style={{ color: T.fg }}
        >
          {label}
        </span>
        {help && <HelpIcon tooltip={help} />}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   GROUP  (single framed container holding multiple Fields)
   Replaces nested Row/Card frames in dense panels.
   ───────────────────────────────────────────────────────────── */

export function Group({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex flex-col gap-0.5 rounded-lg px-3 py-2"
      style={{ background: T.card, border: `1px solid ${T.border}` }}
    >
      {children}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   TOGGLE  (pill switch)
   ───────────────────────────────────────────────────────────── */

export function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  const id = useId();
  return (
    <button
      role="switch"
      aria-checked={checked}
      id={id}
      onClick={() => onChange(!checked)}
      className="relative inline-flex items-center w-[34px] h-[20px] rounded-full transition-colors"
      style={{
        background: checked ? T.fg : T.control,
      }}
    >
      <span
        className="absolute top-[2px] inline-block w-[16px] h-[16px] rounded-full transition-transform"
        style={{
          background: checked ? T.accentFg : T.fg,
          transform: checked ? "translateX(16px)" : "translateX(2px)",
        }}
      />
    </button>
  );
}

export function ToggleRow({
  label,
  description,
  help,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  help?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <Row
      label={label}
      {...(description ? { description } : {})}
      {...(help ? { help } : {})}
      control={<Toggle checked={checked} onChange={onChange} />}
    />
  );
}

/* ─────────────────────────────────────────────────────────────
   SEGMENTED  (white-pill tab control)
   ───────────────────────────────────────────────────────────── */

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ id: T; label: ReactNode }>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-md p-0.5"
      style={{ background: tokens.control }}
    >
      {options.map((opt) => {
        const active = opt.id === value;
        return (
          <button
            key={opt.id}
            onClick={() => onChange(opt.id)}
            className="px-2.5 py-[3px] rounded text-[12px] font-medium transition-colors"
            style={{
              background: active ? tokens.card : "transparent",
              color: active ? tokens.fg : tokens.fgMuted,
              boxShadow: active ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   BUTTON  (3 variants × 2 sizes)
   ───────────────────────────────────────────────────────────── */

export function Button({
  children,
  onClick,
  disabled,
  variant = "outline",
  size = "sm",
  style: styleProp,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "outline" | "ghost";
  size?: "sm" | "xs";
  style?: CSSProperties;
}) {
  const sizeStyle =
    size === "xs"
      ? { padding: "3px 10px", fontSize: 11 }
      : { padding: "5px 12px", fontSize: 12.5 };

  const variantStyle: CSSProperties =
    variant === "primary"
      ? { background: tokens.accent, color: tokens.accentFg, border: "1px solid transparent" }
      : variant === "ghost"
      ? { background: "transparent", color: tokens.fgMuted, border: "1px solid transparent" }
      : { background: tokens.card, color: tokens.fg, border: `1px solid ${tokens.border}` };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-md font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-95"
      style={{ ...sizeStyle, ...variantStyle, fontWeight: 500, ...styleProp }}
    >
      {children}
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────
   INPUT
   ───────────────────────────────────────────────────────────── */

export function Input({
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <input
      type="text"
      value={value}
      placeholder={placeholder}
      autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md transition-colors focus:outline-none"
      style={{
        background: tokens.control,
        color: tokens.fg,
        border: `1px solid ${tokens.border}`,
        padding: "6px 10px",
        fontSize: 13,
      }}
    />
  );
}

/* ─────────────────────────────────────────────────────────────
   SELECT  (native <select> styled to match)
   ───────────────────────────────────────────────────────────── */

export function Select<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ id: T; label: string }>;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.currentTarget.value as T)}
      className="rounded-md transition-colors focus:outline-none cursor-pointer"
      style={{
        background: tokens.control,
        color: tokens.fg,
        border: `1px solid ${tokens.border}`,
        padding: "4px 26px 4px 10px",
        fontSize: 12.5,
        appearance: "none",
        backgroundImage:
          'url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'currentColor\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'><polyline points=\'6 9 12 15 18 9\'></polyline></svg>")',
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 8px center",
      }}
    >
      {options.map((opt) => (
        <option
          key={opt.id}
          value={opt.id}
          style={{ background: tokens.card, color: tokens.fg }}
        >
          {opt.label}
        </option>
      ))}
    </select>
  );
}

/* ─────────────────────────────────────────────────────────────
   TEXTAREA
   ───────────────────────────────────────────────────────────── */

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    rows?: number;
  }
>(function Textarea({ value, onChange, placeholder, rows = 3 }, ref) {
  return (
    <textarea
      ref={ref}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      className="w-full rounded-md transition-colors focus:outline-none resize-y leading-relaxed"
      style={{
        background: tokens.control,
        color: tokens.fg,
        border: `1px solid ${tokens.border}`,
        padding: "8px 10px",
        fontSize: 13,
        fontFamily: "var(--font-primary)",
      }}
    />
  );
});

/* ─────────────────────────────────────────────────────────────
   HOTKEY CHIP
   ───────────────────────────────────────────────────────────── */

export function HotkeyChip({ children }: { children: ReactNode }) {
  return (
    <span
      className="inline-flex items-center rounded-md font-mono"
      style={{
        background: tokens.control,
        color: tokens.fg,
        padding: "3px 8px",
        fontSize: 11.5,
      }}
    >
      {children}
    </span>
  );
}
