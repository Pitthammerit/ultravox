/**
 * Settings UI primitives — clones bka2brain's settings visual language.
 *
 * Patterns: dark cards with subtle borders, sans-serif bold section headings,
 * pill toggles, white-pill segmented controls, selectable radio cards,
 * nav cards with chevron, compact hotkey chips.
 */
import { useId, type ReactNode } from "react";

/* ─────────────────────────────────────────────────────────────
   TYPOGRAPHY
   ───────────────────────────────────────────────────────────── */

export function PageTitle({ children }: { children: ReactNode }) {
  // Settings page header — italic serif (Cormorant) per bka2brain.
  return (
    <h1
      className="text-[34px] leading-none italic text-color-fg"
      style={{ fontFamily: "var(--font-secondary)" }}
    >
      {children}
    </h1>
  );
}

export function Breadcrumb({ children }: { children: ReactNode }) {
  return (
    <div className="text-[13px] text-color-secondary mt-0.5">{children}</div>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  // Sans-serif bold — bka2brain's "Identity", "Visual", "AI Engine" style.
  return (
    <h2 className="text-[20px] font-semibold text-color-fg tracking-tight mb-3">
      {children}
    </h2>
  );
}

export function SectionLabel({
  children,
  help,
}: {
  children: ReactNode;
  help?: string;
}) {
  return (
    <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] text-color-secondary mb-2">
      <span>{children}</span>
      {help && <HelpIcon tooltip={help} />}
    </div>
  );
}

export function Description({ children }: { children: ReactNode }) {
  return (
    <p className="text-[14px] leading-relaxed text-color-secondary">
      {children}
    </p>
  );
}

export function HelpIcon({ tooltip }: { tooltip?: string }) {
  return (
    <span
      title={tooltip}
      className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-color-secondary/50 text-color-secondary text-[9px] leading-none cursor-help"
    >
      ?
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────
   CARDS & ROWS
   ───────────────────────────────────────────────────────────── */

interface CardProps {
  children: ReactNode;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
}

export function Card({ children, selected, onClick, className = "" }: CardProps) {
  const Wrap = onClick ? "button" : "div";
  const base = "rounded-xl border bg-color-surface px-4 py-3 w-full text-left transition-colors";
  const ring = selected
    ? "border-color-primary-on-dark/90"
    : "border-color-divider-on-dark/40 hover:bg-color-surface-hover";
  return (
    <Wrap onClick={onClick} className={`${base} ${ring} ${className}`}>
      {children}
    </Wrap>
  );
}

interface NavCardProps {
  title: string;
  subtitle?: string;
  onClick?: () => void;
}

export function NavCard({ title, subtitle, onClick }: NavCardProps) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between rounded-xl border border-color-divider-on-dark/40 bg-color-surface hover:bg-color-surface-hover px-4 py-3 transition-colors text-left"
    >
      <div className="flex flex-col gap-0.5">
        <span className="text-[16px] font-medium text-color-fg">{title}</span>
        {subtitle && (
          <span className="text-[13px] text-color-secondary">{subtitle}</span>
        )}
      </div>
      <span className="text-color-secondary text-[18px] leading-none">›</span>
    </button>
  );
}

interface RadioCardProps {
  title: string;
  subtitle?: ReactNode;
  selected: boolean;
  onClick: () => void;
}

export function RadioCard({ title, subtitle, selected, onClick }: RadioCardProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-start gap-3 rounded-xl border bg-color-surface px-4 py-3 transition-colors text-left ${
        selected
          ? "border-color-primary-on-dark/90"
          : "border-color-divider-on-dark/40 hover:bg-color-surface-hover"
      }`}
    >
      <span className="mt-0.5 inline-flex items-center justify-center w-4 h-4 rounded-full border border-color-primary-on-dark/80 shrink-0">
        {selected && (
          <span className="w-2 h-2 rounded-full bg-color-primary-on-dark" />
        )}
      </span>
      <div className="flex flex-col gap-0.5">
        <span className="text-[15px] font-medium text-color-fg">{title}</span>
        {subtitle && (
          <span className="text-[13px] text-color-secondary">{subtitle}</span>
        )}
      </div>
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────
   ROW (label left, control right)
   ───────────────────────────────────────────────────────────── */

interface RowProps {
  label: ReactNode;
  help?: string;
  description?: string;
  control: ReactNode;
}

export function Row({ label, help, description, control }: RowProps) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-color-divider-on-dark/40 bg-color-surface px-4 py-3">
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[15px] font-medium text-color-fg">{label}</span>
          {help && <HelpIcon tooltip={help} />}
        </div>
        {description && (
          <span className="text-[13px] text-color-secondary">{description}</span>
        )}
      </div>
      <div className="shrink-0 ml-3">{control}</div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   TOGGLE  (pill switch — dark off / white circle on)
   ───────────────────────────────────────────────────────────── */

interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
}

export function Toggle({ checked, onChange }: ToggleProps) {
  const id = useId();
  return (
    <button
      role="switch"
      aria-checked={checked}
      id={id}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex items-center w-10 h-6 rounded-full transition-colors ${
        checked
          ? "bg-color-primary-on-dark"
          : "bg-color-divider-on-dark/40 border border-color-divider-on-dark/60"
      }`}
    >
      <span
        className={`absolute top-0.5 inline-block w-5 h-5 rounded-full transition-transform ${
          checked ? "translate-x-[18px] bg-color-primary" : "translate-x-0.5 bg-color-primary-on-dark"
        }`}
      />
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────
   TOGGLE-CARD  (toggle + label + description as a full row)
   ───────────────────────────────────────────────────────────── */

interface ToggleCardProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  highlight?: boolean;
}

export function ToggleCard({
  label,
  description,
  checked,
  onChange,
  highlight = false,
}: ToggleCardProps) {
  return (
    <div
      className={`flex items-start gap-3 rounded-xl border px-4 py-3 transition-colors ${
        highlight
          ? "border-color-primary-on-dark/90 bg-color-surface"
          : "border-color-divider-on-dark/40 bg-color-surface"
      }`}
    >
      <div className="pt-0.5">
        <Toggle checked={checked} onChange={onChange} />
      </div>
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-[15px] font-medium text-color-fg">{label}</span>
        {description && (
          <span className="text-[13px] text-color-secondary">{description}</span>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   SEGMENTED CONTROL  (white pill highlights active option)
   ───────────────────────────────────────────────────────────── */

interface SegmentedOption<T extends string> {
  id: T;
  label: ReactNode;
}

interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (v: T) => void;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: SegmentedProps<T>) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-full bg-color-divider-on-dark/30 p-0.5">
      {options.map((opt) => {
        const active = opt.id === value;
        return (
          <button
            key={opt.id}
            onClick={() => onChange(opt.id)}
            className={`px-3 py-1 rounded-full text-[12px] font-medium transition-colors flex items-center gap-1.5 ${
              active
                ? "bg-color-primary-on-dark text-color-primary"
                : "text-color-fg hover:text-color-fg/90"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   PILL BUTTON  (outlined rounded-full)
   ───────────────────────────────────────────────────────────── */

interface PillButtonProps {
  children: ReactNode;
  onClick?: () => void;
  variant?: "outline" | "solid" | "ghost";
  disabled?: boolean;
  size?: "sm" | "md";
}

export function PillButton({
  children,
  onClick,
  variant = "outline",
  disabled,
  size = "md",
}: PillButtonProps) {
  const sizeCls = size === "sm" ? "px-3 py-1 text-[12px]" : "px-4 py-1.5 text-[13px]";
  const variantCls =
    variant === "solid"
      ? "bg-color-primary-on-dark text-color-primary"
      : variant === "ghost"
      ? "text-color-fg hover:bg-color-surface"
      : "border border-color-divider-on-dark/60 text-color-fg hover:bg-color-surface";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-full font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${sizeCls} ${variantCls}`}
    >
      {children}
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────
   HOTKEY CHIP  (gray pill, monospace)
   ───────────────────────────────────────────────────────────── */

export function HotkeyChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center px-3 py-1 rounded-md bg-color-divider-on-dark/30 text-[12px] font-mono text-color-fg">
      {children}
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────
   INPUT
   ───────────────────────────────────────────────────────────── */

interface InputProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

export function Input({ value, onChange, placeholder }: InputProps) {
  return (
    <input
      type="text"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 rounded-lg border border-color-divider-on-dark/40 bg-color-surface text-[14px] text-color-fg placeholder:text-color-secondary/70 focus:outline-none focus:border-color-primary-on-dark/70"
    />
  );
}

/* ─────────────────────────────────────────────────────────────
   SECTION  (label + content)
   ───────────────────────────────────────────────────────────── */

interface SectionProps {
  title?: string;
  label?: string;
  help?: string;
  description?: string;
  right?: ReactNode;
  children: ReactNode;
}

export function Section({
  title,
  label,
  help,
  description,
  right,
  children,
}: SectionProps) {
  return (
    <section className="flex flex-col gap-2">
      {title && <SectionTitle>{title}</SectionTitle>}
      {(label || right) && (
        <div className="flex items-center justify-between -mb-1">
          {label ? (
            help ? (
              <SectionLabel help={help}>{label}</SectionLabel>
            ) : (
              <SectionLabel>{label}</SectionLabel>
            )
          ) : (
            <span />
          )}
          {right}
        </div>
      )}
      {description && <Description>{description}</Description>}
      <div className="flex flex-col gap-2 mt-1">{children}</div>
    </section>
  );
}
