import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Cloud, Download, Trash2 } from "lucide-react";
import { tokens } from "./ui";
import {
  localWhisperDownloadModel,
  localWhisperDeleteModel,
  subscribeToDownloadProgress,
  subscribeToDownloadComplete,
  subscribeToDownloadError,
  type LocalWhisperModelInfo,
} from "../lib/tauri-bridge";
import type { TranscriptionModelValue } from "../lib/voiceModes";
import { TRANSCRIPTION_VARIANTS } from "../lib/transcriptionVariants";

export type { TranscriptionModelValue };

interface TranscriptionModelPickerProps {
  value: TranscriptionModelValue;
  onChange: (next: TranscriptionModelValue) => void;
  installedModels: LocalWhisperModelInfo[];
  downloadProgress: Record<string, number>;
  onDownload: (variant: string) => void;
  onDelete: (variant: string) => void;
  removeConfirming: string | null;
  onRemoveRequest: (variant: string) => void;
}

// Each row: py-2 (8px top+bottom) + 16px line height = 32px. Used for anchored-popup math.
const ROW_HEIGHT = 32;
const VIEWPORT_PAD = 8;

export function TranscriptionModelPicker({
  value,
  onChange,
  installedModels,
  downloadProgress,
  onDownload,
  onDelete,
  removeConfirming,
  onRemoveRequest,
}: TranscriptionModelPickerProps) {
  const [open, setOpen] = useState(false);
  const [downloadErrors, setDownloadErrors] = useState<Record<string, string>>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({ position: "fixed", visibility: "hidden", top: 0, left: 0 });

  const activeInfo = TRANSCRIPTION_VARIANTS.find((v) => v.id === value) ?? TRANSCRIPTION_VARIANTS[0]!;

  useEffect(() => {
    let unsubProgress: (() => void) | null = null;
    let unsubComplete: (() => void) | null = null;
    let unsubError: (() => void) | null = null;
    let alive = true;

    subscribeToDownloadProgress(() => {}).then((u) => { if (alive) unsubProgress = u; else u(); });

    subscribeToDownloadComplete((p) => {
      if (!alive) return;
      setDownloadErrors((prev) => { const next = { ...prev }; delete next[p.variant]; return next; });
    }).then((u) => { if (alive) unsubComplete = u; else u(); });

    subscribeToDownloadError((p) => {
      if (!alive) return;
      setDownloadErrors((prev) => ({ ...prev, [p.variant]: p.error }));
    }).then((u) => { if (alive) unsubError = u; else u(); });

    return () => {
      alive = false;
      unsubProgress?.();
      unsubComplete?.();
      unsubError?.();
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const inTrigger = triggerRef.current?.contains(target);
      const inPanel = panelRef.current?.contains(target);
      if (!inTrigger && !inPanel) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Anchored-popup positioning: align the selected row's Y to the trigger's Y,
  // then clamp to viewport so the panel never extends off-screen.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !panelRef.current) return;
    const triggerRect = triggerRef.current.getBoundingClientRect();
    const panelHeight = panelRef.current.offsetHeight;
    const panelWidth = panelRef.current.offsetWidth;
    const selectedIndex = TRANSCRIPTION_VARIANTS.findIndex((v) => v.id === value);
    const selectedRowOffset = Math.max(0, selectedIndex) * ROW_HEIGHT;

    const desiredTop = triggerRect.top - selectedRowOffset;
    const maxTop = window.innerHeight - panelHeight - VIEWPORT_PAD;
    const top = Math.max(VIEWPORT_PAD, Math.min(desiredTop, maxTop));

    const desiredLeft = triggerRect.left;
    const maxLeft = window.innerWidth - panelWidth - VIEWPORT_PAD;
    const left = Math.max(VIEWPORT_PAD, Math.min(desiredLeft, maxLeft));

    setPanelStyle({ position: "fixed", top, left, width: triggerRect.width, visibility: "visible" });
  }, [open, value]);

  const selectVariant = useCallback((variantId: string) => {
    onChange(variantId as TranscriptionModelValue);
    setOpen(false);
    if (variantId === "cloud" || variantId === "auto") return;
    const isInstalled = installedModels.some((m) => m.variant === variantId);
    const isDownloading = variantId in downloadProgress;
    if (!isInstalled && !isDownloading) {
      onDownload(variantId);
    }
  }, [installedModels, downloadProgress, onChange, onDownload]);

  const startDownload = useCallback((e: React.MouseEvent, variantId: string) => {
    e.stopPropagation();
    setDownloadErrors((prev) => { const next = { ...prev }; delete next[variantId]; return next; });
    onDownload(variantId);
  }, [onDownload]);

  const handleRemoveClick = useCallback((e: React.MouseEvent, variantId: string) => {
    e.stopPropagation();
    if (removeConfirming === variantId) {
      onDelete(variantId);
    } else {
      onRemoveRequest(variantId);
    }
  }, [removeConfirming, onDelete, onRemoveRequest]);

  return (
    <div style={{ position: "relative" }}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between rounded-md px-3 py-2 text-left"
        style={{
          background: tokens.control,
          border: `1px solid ${open ? tokens.fgMuted : tokens.border}`,
          cursor: "pointer",
          fontSize: 12,
          color: tokens.fg,
        }}
      >
        <span className="flex items-center gap-1.5">
          {activeInfo.isCloud && <Cloud size={11} style={{ color: tokens.fgMuted, flexShrink: 0 }} />}
          <span className="font-medium">{activeInfo.label}</span>
          {activeInfo.isEnglish && <EnPill />}
          <span style={{ color: tokens.fgMuted, marginLeft: 4 }}>—</span>
          <span style={{ color: tokens.fgMuted, marginLeft: 4 }}>{activeInfo.description}</span>
        </span>
        <svg width="10" height="6" viewBox="0 0 10 6" fill="none" style={{ color: tokens.fgMuted, flexShrink: 0 }}>
          <path d={open ? "M1 5L5 1L9 5" : "M1 1L5 5L9 1"} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {open && createPortal(
        <div
          ref={panelRef}
          className="z-50 rounded-md overflow-hidden"
          style={{
            ...panelStyle,
            background: tokens.card,
            border: `1px solid ${tokens.borderStrong}`,
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
          }}
        >
          {TRANSCRIPTION_VARIANTS.map((opt, i) => {
            const isInstalled = !opt.isCloud && opt.id !== "auto" && installedModels.some((m) => m.variant === opt.id);
            const isDownloading = opt.id in downloadProgress;
            const pct = downloadProgress[opt.id] ?? 0;
            const isActive = opt.id === value;
            const isConfirmingRemove = removeConfirming === opt.id;
            const installedInfo = installedModels.find((m) => m.variant === opt.id);
            const noActionNeeded = opt.isCloud || opt.id === "auto";

            return (
              <div
                key={opt.id}
                onClick={() => selectVariant(opt.id)}
                className="cursor-pointer px-3 py-2"
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 52px 16px 24px",
                  alignItems: "center",
                  gap: "0 6px",
                  borderBottom: i < TRANSCRIPTION_VARIANTS.length - 1 ? `1px solid ${tokens.border}` : "none",
                  background: isActive ? `color-mix(in srgb, var(--color-primary) 8%, transparent)` : "transparent",
                }}
              >
                {/* name col — flush left, includes optional cloud icon + EN pill */}
                <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
                  {opt.isCloud && <Cloud size={11} style={{ color: tokens.fgMuted, flexShrink: 0 }} />}
                  <span className="font-medium" style={{ fontSize: 12, color: tokens.fg, whiteSpace: "nowrap" }}>{opt.label}</span>
                  {opt.isEnglish && <EnPill />}
                  <span style={{ fontSize: 11, color: tokens.fgSubtle, marginLeft: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {opt.description}
                  </span>
                  {isDownloading && (
                    <div className="flex items-center gap-1.5 ml-2 flex-1" style={{ minWidth: 60 }}>
                      <div className="rounded-full overflow-hidden flex-1" style={{ height: 3, background: tokens.border }}>
                        <div
                          style={{
                            width: `${Math.max(0, Math.min(100, pct))}%`,
                            height: "100%",
                            background: "var(--color-accent)",
                            transition: "width 200ms ease-out",
                          }}
                        />
                      </div>
                      <span style={{ fontSize: 10, color: tokens.fgMuted, flexShrink: 0 }}>{pct.toFixed(0)}%</span>
                    </div>
                  )}
                  {downloadErrors[opt.id] && !isDownloading && (
                    <span style={{ fontSize: 10, color: "var(--color-warning)", marginLeft: 4, flexShrink: 0 }}>{downloadErrors[opt.id]}</span>
                  )}
                </div>

                {/* size col — right-aligned, fixed width */}
                <span style={{ fontSize: 11, color: tokens.fgSubtle, textAlign: "right", whiteSpace: "nowrap" }}>
                  {installedInfo ? formatPickerBytes(installedInfo.sizeBytes) : opt.size}
                </span>

                {/* help icon col — fixed width */}
                <PickerTooltip text={opt.tooltip}>
                  <span
                    className="inline-flex items-center justify-center rounded-full"
                    style={{ width: 13, height: 13, fontSize: 9, background: tokens.border, color: tokens.fgMuted, cursor: "default", flexShrink: 0, fontWeight: 600 }}
                  >
                    ?
                  </span>
                </PickerTooltip>

                {/* action icon col — fixed width */}
                <div style={{ display: "flex", justifyContent: "center" }}>
                  {noActionNeeded ? null : isDownloading ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--color-accent)", animation: "spin 1s linear infinite" }}>
                      <path d="M21 12a9 9 0 11-6.219-8.56"/>
                    </svg>
                  ) : isInstalled ? (
                    <button
                      type="button"
                      onClick={(e) => handleRemoveClick(e, opt.id)}
                      title={isConfirmingRemove ? "Click again to confirm" : "Delete model"}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        padding: 2,
                        color: isConfirmingRemove ? "var(--color-warning)" : tokens.fgMuted,
                        display: "flex",
                        alignItems: "center",
                      }}
                    >
                      <Trash2 size={12} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => startDownload(e, opt.id)}
                      title="Download model"
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        padding: 2,
                        color: tokens.fgMuted,
                        display: "flex",
                        alignItems: "center",
                      }}
                    >
                      <Download size={12} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
}

export function formatPickerBytes(b: number): string {
  if (b < 1024) return `${b}B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)}KB`;
  return `${(b / 1024 / 1024).toFixed(0)}MB`;
}

export function EnPill() {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "1px 3px",
        borderRadius: 3,
        background: tokens.control,
        border: `1px solid ${tokens.border}`,
        fontSize: 9,
        fontWeight: 600,
        color: tokens.fgMuted,
        lineHeight: 1,
        flexShrink: 0,
        letterSpacing: "0.03em",
      }}
    >
      EN
    </span>
  );
}

function PickerTooltip({ text, children }: { text: string; children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ bottom: number; left: number } | null>(null);

  function computePos() {
    if (!anchorRef.current) return;
    const r = anchorRef.current.getBoundingClientRect();
    setPos({ bottom: window.innerHeight - r.top + 5, left: r.left + r.width / 2 });
  }

  return (
    <span
      ref={anchorRef}
      style={{ display: "inline-flex" }}
      onMouseEnter={() => { computePos(); setVisible(true); }}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && pos && createPortal(
        <span
          style={{
            position: "fixed",
            bottom: pos.bottom,
            left: pos.left,
            transform: "translateX(-50%)",
            background: "var(--color-primary)",
            color: "#fff",
            fontSize: 11,
            lineHeight: 1.4,
            padding: "5px 8px",
            borderRadius: 5,
            whiteSpace: "normal",
            width: 220,
            pointerEvents: "none",
            zIndex: 9999,
            boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
          }}
        >
          {text}
        </span>,
        document.body
      )}
    </span>
  );
}

export function useTranscriptionModelPicker() {
  const [installedModels, setInstalledModels] = useState<LocalWhisperModelInfo[]>([]);
  const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({});
  const [removeConfirming, setRemoveConfirming] = useState<string | null>(null);

  const refreshModels = useCallback(async () => {
    const { localWhisperListModels } = await import("../lib/tauri-bridge");
    const list = await localWhisperListModels().catch(() => [] as LocalWhisperModelInfo[]);
    setInstalledModels(list);
  }, []);

  useEffect(() => { void refreshModels(); }, [refreshModels]);

  useEffect(() => {
    let unsubProgress: (() => void) | null = null;
    let unsubComplete: (() => void) | null = null;
    let alive = true;

    subscribeToDownloadProgress((p) => {
      if (!alive) return;
      setDownloadProgress((prev) => ({ ...prev, [p.variant]: p.percent }));
    }).then((u) => { if (alive) unsubProgress = u; else u(); });

    subscribeToDownloadComplete((p) => {
      if (!alive) return;
      setDownloadProgress((prev) => { const next = { ...prev }; delete next[p.variant]; return next; });
      void refreshModels();
    }).then((u) => { if (alive) unsubComplete = u; else u(); });

    return () => {
      alive = false;
      unsubProgress?.();
      unsubComplete?.();
    };
  }, [refreshModels]);

  const handleDownload = useCallback((variant: string) => {
    localWhisperDownloadModel(variant).catch(() => {});
  }, []);

  const handleDelete = useCallback(async (variant: string) => {
    setRemoveConfirming(null);
    try {
      await localWhisperDeleteModel(variant);
      await refreshModels();
    } catch { /* swallow — delete errors are rare */ }
  }, [refreshModels]);

  const handleRemoveRequest = useCallback((variant: string) => {
    setRemoveConfirming(variant);
    setTimeout(() => setRemoveConfirming((cur) => cur === variant ? null : cur), 4000);
  }, []);

  return {
    installedModels,
    downloadProgress,
    removeConfirming,
    handleDownload,
    handleDelete,
    handleRemoveRequest,
  };
}
