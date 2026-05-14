import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Download, Trash2 } from "lucide-react";
import { tokens } from "./ui";
import {
  localLlmDownloadModel,
  localLlmDeleteModel,
  subscribeToLlmDownloadProgress,
  subscribeToLlmDownloadComplete,
  subscribeToLlmDownloadError,
  type LocalLlmModelInfo,
} from "../lib/tauri-bridge";
import { LLM_VARIANTS } from "../lib/llmVariants";
import { useOnlineStatus, friendlyDownloadError } from "../lib/networkStatus";
import { useT } from "../lib/i18n/I18nProvider";

export interface LocalLLMPickerProps {
  value: string;
  onChange: (next: string) => void;
  installedModels: LocalLlmModelInfo[];
  downloadProgress: Record<string, number>;
  onDownload: (variant: string) => void;
  onDelete: (variant: string) => void;
  removeConfirming: string | null;
  onRemoveRequest: (variant: string) => void;
}

const VIEWPORT_PAD = 8;

export function LocalLLMPicker({
  value,
  onChange,
  installedModels,
  downloadProgress,
  onDownload,
  onDelete,
  removeConfirming,
  onRemoveRequest,
}: LocalLLMPickerProps) {
  const t = useT();
  const online = useOnlineStatus();
  const [open, setOpen] = useState(false);
  const [downloadErrors, setDownloadErrors] = useState<Record<string, string>>({});
  // See TranscriptionModelPicker for the rationale on this ref + the two
  // effects below — same auto-resume pattern. v0.19.7.
  const pendingResumeRef = useRef<Set<string>>(new Set());
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({ position: "fixed", visibility: "hidden", top: 0, left: 0 });

  const activeInfo = LLM_VARIANTS.find((v) => v.id === value) ?? LLM_VARIANTS[0]!;

  useEffect(() => {
    let unsubProgress: (() => void) | null = null;
    let unsubComplete: (() => void) | null = null;
    let unsubError: (() => void) | null = null;
    let alive = true;

    subscribeToLlmDownloadProgress(() => {}).then((u) => { if (alive) unsubProgress = u; else u(); });

    subscribeToLlmDownloadComplete((p) => {
      if (!alive) return;
      setDownloadErrors((prev) => { const next = { ...prev }; delete next[p.variant]; return next; });
    }).then((u) => { if (alive) unsubComplete = u; else u(); });

    subscribeToLlmDownloadError((p) => {
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

  // v0.19.7 — friendly error mapping + auto-resume (mirrors TranscriptionModelPicker)
  const errI18n = {
    offline: t.panels.configuration.downloadErrOffline,
    notFound: t.panels.configuration.downloadErrNotFound,
    auth: t.panels.configuration.downloadErrAuth,
    disk: t.panels.configuration.downloadErrDisk,
    cancelled: t.panels.configuration.downloadErrCancelled,
  };
  useEffect(() => {
    Object.entries(downloadErrors).forEach(([variant, raw]) => {
      if (friendlyDownloadError(raw, online, errI18n).kind === "offline") {
        pendingResumeRef.current.add(variant);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [downloadErrors, online]);

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

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !panelRef.current) return;
    const triggerRect = triggerRef.current.getBoundingClientRect();
    const naturalHeight = panelRef.current.scrollHeight;

    const maxPanelWidth = window.innerWidth - VIEWPORT_PAD * 2;
    // Panel is wider than the trigger so row text fits without truncation.
    // Falls back to viewport width on narrow windows.
    const width = Math.min(Math.max(triggerRect.width, 420), maxPanelWidth);

    const GAP = 4;
    const spaceBelow = window.innerHeight - triggerRect.bottom - VIEWPORT_PAD - GAP;
    const spaceAbove = triggerRect.top - VIEWPORT_PAD - GAP;
    const openAbove = spaceBelow < Math.min(naturalHeight, 200) && spaceAbove > spaceBelow;
    const maxPanelHeight = Math.max(120, openAbove ? spaceAbove : spaceBelow);
    const panelHeight = Math.min(naturalHeight, maxPanelHeight);

    const top = openAbove
      ? Math.max(VIEWPORT_PAD, triggerRect.top - GAP - panelHeight)
      : triggerRect.bottom + GAP;

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
    onChange(variantId);
    setOpen(false);
    if (variantId === "auto") return;
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
          <span className="font-medium" style={{ flexShrink: 0 }}>{activeInfo.label}</span>
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
          {LLM_VARIANTS.map((opt, i) => {
            const isInstalled = opt.id !== "auto" && installedModels.some((m) => m.variant === opt.id);
            const isDownloading = opt.id in downloadProgress;
            const pct = downloadProgress[opt.id] ?? 0;
            const isActive = opt.id === value;
            const isConfirmingRemove = removeConfirming === opt.id;
            const installedInfo = installedModels.find((m) => m.variant === opt.id);
            const noActionNeeded = opt.id === "auto";

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
                  borderBottom: i < LLM_VARIANTS.length - 1 ? `1px solid ${tokens.border}` : "none",
                  background: isActive ? `color-mix(in srgb, var(--color-accent) 18%, transparent)` : "transparent",
                  borderLeft: isActive ? `3px solid var(--color-accent)` : "3px solid transparent",
                  paddingLeft: isActive ? "9px" : "12px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
                  <span className="font-medium" style={{ fontSize: 12, color: tokens.fg, whiteSpace: "nowrap" }}>{opt.label}</span>
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
                    const color: string = fr.kind === "offline" ? tokens.fgMuted : "var(--color-warning)";
                    return <span style={{ fontSize: 10, color, marginLeft: 4, flexShrink: 0 }}>{fr.message}</span>;
                  })()}
                </div>

                <span style={{ fontSize: 11, color: tokens.fgSubtle, textAlign: "right", whiteSpace: "nowrap" }}>
                  {installedInfo ? formatPickerBytes(installedInfo.sizeBytes) : opt.size}
                </span>

                <PickerTooltip text={opt.tooltip}>
                  <span
                    className="inline-flex items-center justify-center rounded-full"
                    style={{ width: 13, height: 13, fontSize: 9, background: tokens.border, color: tokens.fgMuted, cursor: "default", flexShrink: 0, fontWeight: 600 }}
                  >
                    ?
                  </span>
                </PickerTooltip>

                <div style={{ display: "flex", justifyContent: "flex-end" }}>
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
  return `${(b / GB).toFixed(1)} GB`;
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

export function useLocalLLMPicker() {
  const [installedModels, setInstalledModels] = useState<LocalLlmModelInfo[]>([]);
  const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({});
  const [removeConfirming, setRemoveConfirming] = useState<string | null>(null);

  const refreshModels = useCallback(async () => {
    const { localLlmListModels } = await import("../lib/tauri-bridge");
    const list = await localLlmListModels().catch(() => [] as LocalLlmModelInfo[]);
    setInstalledModels(list);
  }, []);

  useEffect(() => { void refreshModels(); }, [refreshModels]);

  useEffect(() => {
    let unsubProgress: (() => void) | null = null;
    let unsubComplete: (() => void) | null = null;
    let alive = true;

    subscribeToLlmDownloadProgress((p) => {
      if (!alive) return;
      setDownloadProgress((prev) => ({ ...prev, [p.variant]: p.percent }));
    }).then((u) => { if (alive) unsubProgress = u; else u(); });

    subscribeToLlmDownloadComplete((p) => {
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
    localLlmDownloadModel(variant).catch(() => {});
  }, []);

  const handleDelete = useCallback(async (variant: string) => {
    setRemoveConfirming(null);
    try {
      await localLlmDeleteModel(variant);
      await refreshModels();
    } catch { }
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
