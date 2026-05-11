/**
 * Settings UI primitives — shadcn/ui-inspired. Refined, dense, predictable.
 *
 * All colors come from CSS variables defined in `styles/settings.css`
 * (--s-* tokens). Inline styles are used intentionally — they're immune
 * to Tailwind v4's compilation quirks with token-based utility classes.
 */
import { forwardRef, useCallback, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
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
  useEffect(() => {
    setTrafficLightsVisible(false).catch(() => {});
    return () => { setTrafficLightsVisible(true).catch(() => {}); };
  }, []);

  const [waveActive, setWaveActive] = useState(false);
  const waveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const waveRunning = useRef(false); // true while the 2500ms window is open

  const handleMouseEnter = useCallback(() => {
    setTrafficLightsVisible(true).catch(() => {});
    if (waveRunning.current) return; // let the current cycle finish uninterrupted
    waveRunning.current = true;
    setWaveActive(true);
    waveTimer.current = setTimeout(() => {
      waveRunning.current = false;
      setWaveActive(false);
    }, 2500);
  }, []);

  return (
    <header
      data-tauri-drag-region
      className="relative shrink-0 flex items-center"
      style={{ background: T.page, height: 40 }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setTrafficLightsVisible(false).catch(() => {})}
    >
      {/* Waveform first — painter's algorithm keeps it behind everything */}
      <HeaderWaveform active={waveActive} />

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
    </header>
  );
}

/** Waveform separator — bars grow upward from the bottom edge of the header,
 *  overlapping the content below. No background needed underneath because
 *  there are no bars extending downward. */
function HeaderWaveform({ active }: { active: boolean }) {
  const HALF = 30;
  const MAX_H = 6; // max bar height in px (upward only)
  const rightHalf = Array.from({ length: HALF }, (_, i) => {
    const dist = i / (HALF - 1);
    const envelope = 1 - dist * 0.78;
    const variance = 0.4 + Math.abs(Math.sin((i + 1) * 0.7) * 0.5 + Math.cos(i * 0.4) * 0.4);
    return Math.max(1, MAX_H * envelope * Math.min(1, variance));
  });
  const bars = [...[...rightHalf].reverse(), ...rightHalf];

  return (
    <div
      aria-hidden
      className="s-header-wave"
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        height: MAX_H,
        display: "flex",
        alignItems: "flex-end", // bars grow upward from the bottom baseline
        gap: 1,
        pointerEvents: "none",
        overflow: "visible",
        zIndex: 0,
      }}
    >
      {bars.map((h, i) => (
        <span
          key={i}
          className={active ? "s-wave-bar s-wave-active" : "s-wave-bar"}
          style={{
            flex: 1,
            height: h,
            background: "var(--s-header-wave)",
            borderRadius: "1px 1px 0 0",
            opacity: 0.6,
            animationDelay: `${(Math.abs(Math.sin(i * 1.7 + 0.3)) * 0.3).toFixed(3)}s`,
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
      style={{ left: "50%", transform: "translateX(-50%)", top: 0, bottom: 0, whiteSpace: "nowrap", zIndex: 2 }}
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
  /** Make the section header click-to-toggle. The children mount/unmount
   *  with the toggled state (no CSS-only hide so children with side
   *  effects like polling intervals release cleanly when collapsed). */
  collapsible?: boolean;
  /** Initial state when `collapsible` is true. Defaults to expanded. */
  defaultCollapsed?: boolean;
}

export function Section({
  title,
  label,
  description,
  help,
  right,
  children,
  collapsible = false,
  defaultCollapsed = false,
}: SectionProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed && collapsible);
  const headerInteractive = collapsible
    ? {
        role: "button" as const,
        tabIndex: 0,
        onClick: () => setCollapsed((c) => !c),
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setCollapsed((c) => !c);
          }
        },
        style: { cursor: "pointer" as const, userSelect: "none" as const },
        "aria-expanded": !collapsed,
      }
    : {};
  return (
    <section className="flex flex-col gap-1.5">
      {title && (
        <div className="flex items-center justify-between" {...headerInteractive}>
          <h2
            className="text-[14px] font-semibold tracking-tight inline-flex items-center gap-1.5"
            style={{ color: T.fg }}
          >
            {collapsible && <Chevron open={!collapsed} />}
            {title}
          </h2>
          {right}
        </div>
      )}
      {label && (
        <div className="flex items-center justify-between" {...headerInteractive}>
          <span className="inline-flex items-center gap-1.5">
            {collapsible && <Chevron open={!collapsed} />}
            <SectionLabel help={help}>{label}</SectionLabel>
          </span>
          {right}
        </div>
      )}
      {description && !collapsed && (
        <p
          className="text-[13px] leading-relaxed -mt-1"
          style={{ color: T.fgMuted }}
        >
          {description}
        </p>
      )}
      {!collapsed && <div className="flex flex-col gap-1">{children}</div>}
    </section>
  );
}

/** Inline chevron used by collapsible Section headers. Rotates on toggle. */
function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        transform: open ? "rotate(0deg)" : "rotate(-90deg)",
        transition: "transform 140ms ease",
        opacity: 0.7,
        flexShrink: 0,
      }}
      aria-hidden
    >
      <polyline points="3 4.5 6 7.5 9 4.5" />
    </svg>
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

/**
 * Position the tooltip such that:
 *   - It's always fully within the viewport (8px margin on every edge).
 *   - Default placement is above the anchor.
 *   - Flips below if there isn't enough room above.
 *   - Centered horizontally on the anchor when there's room; clamped to the
 *     nearest edge when the anchor is too close to the viewport edge.
 *
 * The previous implementation used CSS `transform: translateX(-50%)` for
 * centering. That blindly shifted the tooltip half its width to the left of
 * the anchor center — fine in the middle of the viewport, broken at either
 * edge (user reported the Recording-section help tip cropped off the left
 * edge in German, 2026-05-11). New approach computes the explicit top + left
 * in JS so we can clamp into the viewport.
 */
const TIP_VIEWPORT_MARGIN = 8;
const TIP_ANCHOR_GAP = 6;

export function HelpIcon({ tooltip }: { tooltip?: string }) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  const [tipPos, setTipPos] = useState<{ top: number; left: number } | null>(null);

  const updateTipPos = useCallback(() => {
    const anchor = anchorRef.current;
    const tip = tipRef.current;
    if (!anchor || !tip) return;
    const a = anchor.getBoundingClientRect();
    // offsetWidth/Height reflect the rendered size including padding; works
    // even while opacity:0 since the element is in flow.
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Horizontal: prefer centered on anchor, clamp into viewport.
    const desiredLeft = a.left + a.width / 2 - tw / 2;
    const left = Math.max(
      TIP_VIEWPORT_MARGIN,
      Math.min(desiredLeft, vw - tw - TIP_VIEWPORT_MARGIN),
    );

    // Vertical: prefer above anchor; flip below if no room.
    let top = a.top - th - TIP_ANCHOR_GAP;
    if (top < TIP_VIEWPORT_MARGIN) {
      top = a.bottom + TIP_ANCHOR_GAP;
      // If even below would overflow (tiny window), pin to bottom margin
      // and let the tooltip overlap the anchor — still readable.
      if (top + th > vh - TIP_VIEWPORT_MARGIN) {
        top = Math.max(TIP_VIEWPORT_MARGIN, vh - th - TIP_VIEWPORT_MARGIN);
      }
    }

    setTipPos({ top, left });
  }, []);

  // Recompute on scroll/resize so multi-monitor and window-drag corner cases
  // don't strand the tip off-screen between hover and re-hover.
  useEffect(() => {
    const onResize = () => {
      if (anchorRef.current && anchorRef.current.matches(":hover, :focus-within")) {
        updateTipPos();
      }
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [updateTipPos]);

  return (
    <span
      className="ux-help inline-flex items-center"
      onMouseEnter={updateTipPos}
      onFocus={updateTipPos}
      ref={anchorRef}
    >
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
          ref={tipRef}
          className="ux-help-tip"
          role="tooltip"
          style={tipPos ? { top: tipPos.top, left: tipPos.left } : undefined}
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
