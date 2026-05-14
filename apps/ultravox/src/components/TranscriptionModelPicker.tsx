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
import { useOnlineStatus, friendlyDownloadError } from "../lib/networkStatus";
import { useT } from "../lib/i18n/I18nProvider";

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
  const t = useT();
  const online = useOnlineStatus();
  const [open, setOpen] = useState(false);
  const [downloadErrors, setDownloadErrors] = useState<Record<string, string>>({});
  // Variants that errored due to offline — retry once when online flips back.
  // ref so we don't re-trigger the retry effect on every render. New offline
  // errors add to the set; the online-flip effect drains it.
  const pendingResumeRef = useRef<Set<string>>(new Set());
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

  // v0.19.7 — friendly error mapping + auto-resume on reconnect.
  // i18n strings memoized so the helper stays pure (no react-import dep).
  const errI18n = {
    offline: t.panels.configuration.downloadErrOffline,
    notFound: t.panels.configuration.downloadErrNotFound,
    auth: t.panels.configuration.downloadErrAuth,
    disk: t.panels.configuration.downloadErrDisk,
    cancelled: t.panels.configuration.downloadErrCancelled,
  };
  // Track offline-errored variants so the next online flip triggers retry.
  // Effect re-syncs on downloadErrors changes; the ref is only drained on
  // online → true transitions (below).
  useEffect(() => {
    Object.entries(downloadErrors).forEach(([variant, raw]) => {
      if (friendlyDownloadError(raw, online, errI18n).kind === "offline") {
        pendingResumeRef.current.add(variant);
      }
    });
    // Only re-run when downloadErrors changes — `online` is checked inside
    // the helper, and `errI18n` is a fresh object per render but its
    // semantic identity depends only on `t`. Re-running on every render
    // would be fine here (the helper is O(1) per variant), so this dep
    // shape is intentionally permissive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [downloadErrors, online]);

  // Auto-resume: when online flips true and there are queued variants,
  // clear their errors optimistically and re-trigger the download.
  useEffect(() => {
    if (!online) return;
    if (pendingResumeRef.current.size === 0) return;
    const toRetry = Array.from(pendingResumeRef.current);
    pendingResumeRef.current.clear();
    setDownloadErrors((prev) => {
      const next = { ...prev };
      toRetry.forEach((v) => delete next[v]);
      return next;
    });
    toRetry.forEach((v) => onDownload(v));
  }, [online, onDownload]);

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
    const naturalHeight = panelRef.current.scrollHeight;

    // Width: match trigger; clamp to viewport so a narrow Settings window
    // never causes horizontal clipping.
    const maxPanelWidth = window.innerWidth - VIEWPORT_PAD * 2;
    // Panel is wider than the trigger so row text fits without truncation.
    // Falls back to viewport width on narrow windows.
    const width = Math.min(Math.max(triggerRect.width, 420), maxPanelWidth);

    // Open BELOW the trigger by default (NSPopUpButton-style "selected row
    // aligns with trigger" was confusing — panel drifted way above when the
    // selected item was deep in the list). If there isn't room below, flip
    // above. If neither fits, take whichever side has more room and let the
    // panel scroll inside (already clamped by maxHeight).
    const GAP = 4;
    const spaceBelow = window.innerHeight - triggerRect.bottom - VIEWPORT_PAD - GAP;
    const spaceAbove = triggerRect.top - VIEWPORT_PAD - GAP;
    const openAbove = spaceBelow < Math.min(naturalHeight, 200) && spaceAbove > spaceBelow;
    const maxPanelHeight = Math.max(120, openAbove ? spaceAbove : spaceBelow);
    const panelHeight = Math.min(naturalHeight, maxPanelHeight);

    const top = openAbove
      ? Math.max(VIEWPORT_PAD, triggerRect.top - GAP - panelHeight)
      : triggerRect.bottom + GAP;

    // Horizontal: anchor to trigger left, then clamp so the right edge stays
    // inside the viewport.
    const desiredLeft = triggerRect.left;
    const maxLeft = window.innerWidth - width - VIEWPORT_PAD;
    const left = Math.max(VIEWPORT_PAD, Math.min(desiredLeft, maxLeft));

    setPanelStyle({
      position: "fixed",
      top,
      left,
      width,
      maxHeight: maxPanelHeight,
      overflowY: "auto",
      visibility: "visible",
    });
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
        <span className="flex items-center gap-1.5" style={{ minWidth: 0, flex: 1, overflow: "hidden" }}>
          {activeInfo.isCloud && <Cloud size={11} style={{ color: tokens.fgMuted, flexShrink: 0 }} />}
          <span className="font-medium" style={{ flexShrink: 0 }}>{activeInfo.label}</span>
          {activeInfo.isEnglish && <EnPill />}
          <span style={{ color: tokens.fgMuted, marginLeft: 4, flexShrink: 0 }}>—</span>
          <span
            style={{
              color: tokens.fgMuted,
              marginLeft: 4,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              minWidth: 0,
            }}
          >
            {activeInfo.description}
          </span>
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
          {/* v0.19.7 offline banner — shows at the top of the picker
             dropdown when navigator.onLine is false. Inline (not a
             toast / modal) so it's visible while the user inspects
             which models they can/can't download. */}
          {!online && (
            <div
              role="status"
              style={{
                padding: "6px 10px",
                fontSize: 11,
                background: "color-mix(in srgb, var(--color-warning) 18%, transparent)",
                color: tokens.fg,
                borderBottom: `1px solid ${tokens.border}`,
                lineHeight: 1.4,
              }}
            >
              {t.panels.configuration.downloadErrOfflineBanner}
            </div>
          )}
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
                className="cursor-pointer px-3 py-1.5"
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 52px 16px 20px",
                  alignItems: "center",
                  gap: "0 4px",
                  borderBottom: i < TRANSCRIPTION_VARIANTS.length - 1 ? `1px solid ${tokens.border}` : "none",
                  background: isActive ? `color-mix(in srgb, var(--color-accent) 18%, transparent)` : "transparent",
                  borderLeft: isActive ? `3px solid var(--color-accent)` : "3px solid transparent",
                  paddingLeft: isActive ? "9px" : "12px",
                }}
              >
                {/* name col — flush left. Rank badge (per WisperSync 2026
                    benchmark) prefixed for the top 5 models so users can
                    pick the recommended option without reading every
                    tooltip. */}
                <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
                  {opt.rank !== undefined && (
                    <span
                      style={{
                        fontSize: 9.5,
                        fontWeight: 700,
                        letterSpacing: "0.02em",
                        padding: "1px 5px",
                        borderRadius: 3,
                        background:
                          opt.rank === 1
                            ? "var(--color-accent)"
                            : `color-mix(in srgb, var(--color-accent) 25%, transparent)`,
                        color: opt.rank === 1 ? "var(--color-primary-on-dark)" : "var(--color-accent)",
                        flexShrink: 0,
                      }}
                      title={`Recommendation rank #${opt.rank} per WisperSync benchmark`}
                    >
                      #{opt.rank}
                    </span>
                  )}
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
                  {downloadErrors[opt.id] && !isDownloading && (() => {
                    const fr = friendlyDownloadError(downloadErrors[opt.id]!, online, errI18n);
                    // Offline errors get a neutral muted color (it'll auto-
                    // resume), other errors stay warning-red.
                    const color: string = fr.kind === "offline" ? tokens.fgMuted : "var(--color-warning)";
                    return (
                      <span style={{ fontSize: 10, color, marginLeft: 4, flexShrink: 0 }}>{fr.message}</span>
                    );
                  })()}
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

                {/* action icon col — anchored to right edge */}
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  {opt.isCloud ? (
                    <Cloud size={12} style={{ color: tokens.fgMuted, flexShrink: 0 }} />
                  ) : noActionNeeded ? null : isDownloading ? (
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
                        padding: 0,
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
                        padding: 0,
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
  const GB = 1024 * 1024 * 1024;
  const MB = 1024 * 1024;
  const KB = 1024;
  if (b < KB) return `${b} B`;
  if (b < MB) return `${(b / KB).toFixed(1)} KB`;
  if (b < GB) return `${(b / MB).toFixed(0)} MB`;
  // ≥ 1 GB: one decimal, e.g. 2.2 GB / 1.5 GB / 4.4 GB.
  return `${(b / GB).toFixed(1)} GB`;
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
