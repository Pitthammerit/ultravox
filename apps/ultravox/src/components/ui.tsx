/**
 * Settings UI primitives — shadcn/ui-inspired. Refined, dense, predictable.
 *
 * All colors come from CSS variables defined in `styles/settings.css`
 * (--s-* tokens). Inline styles are used intentionally — they're immune
 * to Tailwind v4's compilation quirks with token-based utility classes.
 */
import { useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

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
  return (
    <header
      data-tauri-drag-region
      className="relative border-b shrink-0 flex items-center"
      style={{ borderColor: T.border, background: T.page, height: 40 }}
    >
      {/* Center: app name stays absolutely centered (its position never
          shifts when a breadcrumb appears). Breadcrumb is anchored to the
          right of the title with a measured offset, so it reads as
          "ULTRAVOX ‹ Modes" with the title locked at center. */}
      <CenteredHeaderTitle title="Ultravox" color={T.fg} breadcrumb={breadcrumb} onBack={onBack ?? null} />

      {/* Right slot — only used when no breadcrumb back button is rendered */}
      {right && !breadcrumb && (
        <div className="absolute flex items-center" style={{ right: 16, top: 0, bottom: 0, display: "flex", alignItems: "center" }}>
          {right}
        </div>
      )}
    </header>
  );
}

/* Internal: title stays absolutely centered, breadcrumb is pinned to
   `left: 50% + halfTitleWidth + gap` so it visually butts up against the
   right edge of the title without shifting it.

   We measure the rendered title width with useLayoutEffect (synchronous,
   pre-paint) and re-measure on font-load and window-resize so it stays
   aligned across themes / OS font swaps. */
const TITLE_GAP = 12;

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
  const titleRef = useRef<HTMLSpanElement>(null);
  const [titleW, setTitleW] = useState<number>(0);

  useLayoutEffect(() => {
    const measure = () => {
      if (titleRef.current) setTitleW(titleRef.current.getBoundingClientRect().width);
    };
    measure();
    window.addEventListener("resize", measure);
    if ("fonts" in document) document.fonts.ready.then(measure).catch(() => {});
    return () => window.removeEventListener("resize", measure);
  }, [title]);

  return (
    <>
      <span
        ref={titleRef}
        className="absolute left-1/2 text-[15px] font-semibold pointer-events-none"
        style={{
          transform: "translateX(-50%)",
          color,
          whiteSpace: "nowrap",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {title}
      </span>

      {breadcrumb && onBack && (
        <button
          onClick={onBack}
          aria-label={`Back from ${breadcrumb}`}
          className="absolute flex items-center gap-1 text-[15px] font-semibold transition-opacity hover:opacity-70"
          style={{
            // Anchor at page-center, then push right by half the title's
            // width plus the gap so it lands just after the title's right
            // edge — independent of locale / font.
            left: `calc(50% + ${titleW / 2 + TITLE_GAP}px)`,
            top: 0,
            bottom: 0,
            color,
            whiteSpace: "nowrap",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
          }}
        >
          <span style={{ fontSize: 17, lineHeight: 1 }}>‹</span>
          <span>{breadcrumb}</span>
        </button>
      )}
    </>
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
  return (
    <span className="ux-help inline-flex items-center">
      <span
        className="inline-flex items-center justify-center cursor-help shrink-0"
        style={{ width: 13, height: 13, color: T.fgSubtle }}
        aria-label={tooltip}
      >
        {/* Lucide help-circle — circle + question mark as SVG paths,
            guaranteed centered regardless of font metrics. */}
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
      {tooltip && <span className="ux-help-tip" role="tooltip">{tooltip}</span>}
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

export function Textarea({
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
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
}

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
