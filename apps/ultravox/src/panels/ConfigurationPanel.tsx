import { useState, useEffect, useCallback, useRef } from "react";
import { emit } from "@tauri-apps/api/event";
import type { AppSettings } from "../lib/store-bridge";
import { applyTheme } from "@ultravox/design-system";
import { resetSettings, DEFAULT_SETTINGS } from "../lib/store-bridge";
import { Button, Input, Row, Section, ToggleRow, tokens } from "../components/ui";
import { Download, Trash2 } from "lucide-react";
import { PillStylePicker } from "../components/PillStylePicker";
import {
  registerHotkeys,
  checkAccessibilityPermission,
  requestAccessibilityPermission,
  claudeCodeCheck,
  type ClaudeCodeStatus,
  localWhisperListModels,
  localWhisperDownloadModel,
  localWhisperDeleteModel,
  subscribeToDownloadProgress,
  subscribeToDownloadComplete,
  subscribeToDownloadError,
  type LocalWhisperModelInfo,
} from "../lib/tauri-bridge";
import { getDebugLog, clearDebugLog, type DebugEntry } from "../lib/debugLog";

interface ConfigurationPanelProps {
  settings?: AppSettings;
  onChange?: (patch: Partial<AppSettings>) => Promise<void>;
}

type MicState = "granted" | "denied" | "prompt" | "unknown";

async function checkMicrophonePermission(): Promise<MicState> {
  // Permissions API: query without prompting. Supported in WKWebView 16+.
  try {
    const perm = await navigator.permissions?.query({ name: "microphone" as PermissionName });
    if (perm) return perm.state as MicState;
  } catch { /* fall through */ }
  return "unknown";
}

async function requestMicrophonePermission(): Promise<boolean> {
  // Calling getUserMedia triggers the macOS prompt the first time, then
  // grants/denies on subsequent calls based on the persisted choice.
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    return true;
  } catch {
    return false;
  }
}

export default function ConfigurationPanel({ settings, onChange }: ConfigurationPanelProps) {
  const [axGranted, setAxGranted] = useState<boolean | null>(null);
  const [axRequesting, setAxRequesting] = useState(false);
  const [micState, setMicState] = useState<MicState>("unknown");
  const [micRequesting, setMicRequesting] = useState(false);
  const [resetConfirming, setResetConfirming] = useState(false);
  const [claudeStatus, setClaudeStatus] = useState<ClaudeCodeStatus | null>(null);

  useEffect(() => {
    checkAccessibilityPermission().then(setAxGranted).catch(() => setAxGranted(false));
    checkMicrophonePermission().then(setMicState);
    claudeCodeCheck().then(setClaudeStatus).catch(() => setClaudeStatus({ available: false, path: null, version: null }));
  }, []);

  const grantAx = useCallback(async () => {
    setAxRequesting(true);
    const already = await requestAccessibilityPermission().catch(() => false);
    setAxRequesting(false);
    if (already) {
      setAxGranted(true);
    }
    // If not already granted, user must go to System Settings and then click Refresh.
  }, []);

  const recheckAx = useCallback(async () => {
    const granted = await checkAccessibilityPermission().catch(() => false);
    setAxGranted(granted);
  }, []);

  const grantMic = useCallback(async () => {
    setMicRequesting(true);
    const ok = await requestMicrophonePermission();
    setMicRequesting(false);
    setMicState(ok ? "granted" : "denied");
  }, []);

  const recheckMic = useCallback(async () => {
    setMicState(await checkMicrophonePermission());
  }, []);

  const reset = async () => {
    if (!resetConfirming) {
      setResetConfirming(true);
      // Auto-cancel after 4 s if the user doesn't confirm.
      setTimeout(() => setResetConfirming(false), 4000);
      return;
    }
    setResetConfirming(false);
    await resetSettings();
    applyTheme(DEFAULT_SETTINGS.theme);
    try {
      await registerHotkeys(
        DEFAULT_SETTINGS.hotkeyRecord,
        DEFAULT_SETTINGS.hotkeyModeOverlay,
      );
    } catch { /* ignore */ }
    window.location.reload();
  };

  return (
    <>
      <Section
        label="About you"
        help="Used by your modes to personalize cleanup — e.g. Email mode signs off with your first name. Available in custom prompts as {{firstName}}, {{lastName}}, and {{fullName}}."
      >
        <Row
          label="First name"
          control={
            <Input
              value={settings?.firstName ?? ""}
              onChange={(v) => { if (onChange) void onChange(v.trim() ? { firstName: v } : { firstName: "" }); }}
              placeholder="First name"
            />
          }
        />
        <Row
          label="Last name"
          control={
            <Input
              value={settings?.lastName ?? ""}
              onChange={(v) => { if (onChange) void onChange(v.trim() ? { lastName: v } : { lastName: "" }); }}
              placeholder="Last name"
            />
          }
        />
      </Section>

      <Section
        label="Recording window"
        help="Choose how the floating pill appears while you're recording."
      >
        <Row
          label="Style"
          control={
            <PillStylePicker
              value={settings?.pillStyle ?? "classic"}
              onChange={(v) => {
                if (onChange) void onChange({ pillStyle: v });
                emit("pillStyle:changed", v).catch(() => {});
              }}
              size="small"
            />
          }
        />
      </Section>

      <Section
        label="Local transcription (experimental)"
        help="Run Whisper on this Mac instead of in the cloud. Audio never leaves your device."
      >
        <ToggleRow
          label="Enable local transcription"
          help="Transcribe on-device using a downloaded Whisper model. Faster + private, but requires ~150 MB model download. v0.10 is experimental — falls back to cloud on any error."
          checked={settings?.localWhisperEnabled ?? false}
          onChange={(next) => { if (onChange) void onChange({ localWhisperEnabled: next }); }}
        />
        {(settings?.localWhisperEnabled ?? false) && (
          <LocalWhisperConfig
            activeVariant={settings?.localWhisperActiveVariant}
            onVariantChange={(v) => {
              if (onChange) {
                void onChange(v !== undefined ? { localWhisperActiveVariant: v } : {});
              }
            }}
          />
        )}
      </Section>

      <Section
        label="Permissions"
        help="Required for Ultravox to record audio and paste transcriptions into other apps."
      >
        <Row
          label="Microphone access"
          help={
            micState === "granted"
              ? "Granted — recording works."
              : micState === "denied"
              ? "Denied — open System Settings → Privacy & Security → Microphone and enable Ultravox."
              : micState === "prompt"
              ? "Not yet requested — click Grant Access."
              : "Checking…"
          }
          control={
            micState === "granted" ? (
              <span className="text-[12px] text-color-accent font-medium">✓ Granted</span>
            ) : (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="xs"
                  onClick={grantMic}
                  disabled={micRequesting}
                >
                  {micRequesting ? "Waiting…" : "Grant Access"}
                </Button>
                {micState === "denied" && !micRequesting && (
                  <button
                    onClick={recheckMic}
                    className="text-[12px] text-color-secondary hover:text-color-primary underline"
                  >
                    Refresh
                  </button>
                )}
              </div>
            )
          }
        />
        <Row
          label="Accessibility access"
          help={
            axGranted === true
              ? "Granted — paste works correctly."
              : axGranted === false
              ? "Not granted — transcriptions can't be pasted."
              : "Checking…"
          }
          control={
            axGranted ? (
              <span className="text-[12px] text-color-accent font-medium">✓ Granted</span>
            ) : (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="xs"
                  onClick={grantAx}
                  disabled={axRequesting}
                >
                  {axRequesting ? "Waiting…" : "Grant Access"}
                </Button>
                {axGranted === false && !axRequesting && (
                  <button
                    onClick={recheckAx}
                    className="text-[12px] text-color-secondary hover:text-color-primary underline"
                  >
                    Refresh
                  </button>
                )}
              </div>
            )
          }
        />
      </Section>

      <Section
        label="Cleanup backends"
        help="Per-mode cleanup is configured in the Modes panel. Each mode picks its own provider — OpenRouter (managed) or Claude Code (local CLI). This section just reports whether the local CLI is available."
      >
        <Row
          label="Claude Code CLI"
          help={claudeStatus?.path ? `Detected at ${claudeStatus.path}` : "Install Claude Code (https://claude.ai/code) and run `claude /login` once to enable, then select it as a provider in any Mode."}
          control={
            <span style={{ fontSize: 12, color: claudeStatus?.available ? "var(--color-accent)" : tokens.fgMuted }}>
              {claudeStatus == null
                ? "Checking…"
                : claudeStatus.available
                  ? `Available · ${claudeStatus.version ?? "v?"}`
                  : "Not installed"}
            </span>
          }
        />
      </Section>

      <Section label="Maintenance">
        <Row
          label="Reset to defaults"
          help="Restore all preferences. History is preserved."
          control={
            <Button
              variant="outline"
              size="xs"
              onClick={reset}
              style={resetConfirming ? { borderColor: "var(--color-warning)", color: "var(--color-warning)" } : {}}
            >
              {resetConfirming ? "Click again to confirm" : "Reset"}
            </Button>
          }
        />
      </Section>

      <DiagnosticsSection />
    </>
  );
}

/* ─────────────────────────────────────────────────────────────
   DIAGNOSTICS — recent entries from the record/transcribe/paste
   pipeline. Renders the last 30 entries from debug-log.json.
   ───────────────────────────────────────────────────────────── */

function DiagnosticsSection() {
  const [entries, setEntries] = useState<DebugEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setEntries(await getDebugLog());
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const onClear = async () => {
    if (!confirmClear) {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 4000);
      return;
    }
    setConfirmClear(false);
    await clearDebugLog();
    refresh();
  };

  return (
    <Section
      label="Diagnostics"
      help="Last 30 events from record → transcribe → paste. Use this when transcription fails: the failing stage shows the status code and error body."
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[12px]" style={{ color: tokens.fgMuted }}>
          {entries.length} entries · newest first
        </span>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="xs" onClick={refresh} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </Button>
          <Button
            variant="outline"
            size="xs"
            onClick={onClear}
            style={confirmClear ? { borderColor: "var(--color-warning)", color: "var(--color-warning)" } : {}}
          >
            {confirmClear ? "Click again" : "Clear"}
          </Button>
        </div>
      </div>

      {entries.length === 0 ? (
        <p className="text-[12px] py-3 text-center" style={{ color: tokens.fgSubtle }}>
          No events yet — try a recording.
        </p>
      ) : (
        <div
          className="rounded-md overflow-hidden"
          style={{ background: tokens.control, border: `1px solid ${tokens.border}` }}
        >
          {entries.slice(0, 30).map((e, i) => (
            <DebugRow key={e.id} entry={e} isLast={i === Math.min(29, entries.length - 1)} />
          ))}
        </div>
      )}
    </Section>
  );
}

function DebugRow({ entry, isLast }: { entry: DebugEntry; isLast: boolean }) {
  const isError = entry.error || (entry.status && entry.status >= 400);
  const stageColor = isError
    ? "var(--color-warning)"
    : entry.stage === "transcribe-result" || entry.stage === "paste"
    ? "var(--color-accent)"
    : tokens.fgMuted;

  const time = new Date(entry.ts).toLocaleTimeString(undefined, { hour12: false });
  const detail = [
    entry.status != null ? `${entry.status}` : null,
    entry.bytes != null ? `${formatBytes(entry.bytes)}` : null,
    entry.textLength != null ? `${entry.textLength}c` : null,
    entry.mime,
    entry.modeId,
    entry.durationMs != null ? `${entry.durationMs}ms` : null,
    entry.message,
  ].filter(Boolean).join(" · ");

  return (
    <div
      className="flex flex-col gap-0.5 px-3 py-2"
      style={{ borderBottom: isLast ? "none" : `1px solid ${tokens.border}` }}
    >
      <div className="flex items-center gap-2 text-[11.5px]">
        <span className="font-mono shrink-0" style={{ color: tokens.fgSubtle, minWidth: 64 }}>{time}</span>
        <span className="font-medium shrink-0" style={{ color: stageColor, minWidth: 130 }}>{entry.stage}</span>
        <span className="font-mono truncate" style={{ color: tokens.fgMuted }}>{detail}</span>
      </div>
      {entry.error && (
        <div
          className="text-[11px] font-mono pl-[200px] pr-2"
          style={{ color: "var(--color-warning)", wordBreak: "break-word" }}
        >
          {entry.error}
        </div>
      )}
    </div>
  );
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b}B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)}KB`;
  return `${(b / 1024 / 1024).toFixed(2)}MB`;
}

/* ─────────────────────────────────────────────────────────────
   LOCAL WHISPER — dropdown variant picker with per-row download/delete
   ───────────────────────────────────────────────────────────── */

const VARIANTS: Array<{ id: string; label: string; size: string; description: string; tooltip: string }> = [
  { id: "tiny",    label: "Tiny",    size: "~75 MB",  description: "Fastest, lower accuracy",    tooltip: "Tiny is the smallest Whisper model (~75 MB). Transcription is near-instant but accuracy is lower, especially for accents or fast speech." },
  { id: "base.en", label: "Base.en", size: "~142 MB", description: "More accurate, English",     tooltip: "Base.en is trained on English-only data — more accurate than Tiny for English dictation at a modest size increase (~142 MB)." },
  { id: "base",    label: "Base",    size: "~142 MB", description: "Multilingual, balanced",     tooltip: "Base is the multilingual sibling of Base.en (~142 MB). Handles non-English languages with good accuracy and reasonable speed." },
  { id: "small",   label: "Small",   size: "~466 MB", description: "Best accuracy, slowest",    tooltip: "Small delivers the best transcription quality in the v0.10 lineup (~466 MB) but takes noticeably longer per recording." },
];

interface LocalWhisperConfigProps {
  activeVariant?: AppSettings["localWhisperActiveVariant"];
  onVariantChange?: (v: AppSettings["localWhisperActiveVariant"]) => void;
}

function LocalWhisperConfig({ activeVariant, onVariantChange }: LocalWhisperConfigProps) {
  const [installed, setInstalled] = useState<LocalWhisperModelInfo[]>([]);
  const [downloadingVariants, setDownloadingVariants] = useState<Record<string, number>>({});
  const [downloadErrors, setDownloadErrors] = useState<Record<string, string>>({});
  const [removeConfirming, setRemoveConfirming] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const active = activeVariant ?? "base.en";
  const activeInfo = VARIANTS.find((v) => v.id === active);

  const refresh = useCallback(async () => {
    const list = await localWhisperListModels().catch(() => [] as LocalWhisperModelInfo[]);
    setInstalled(list);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    let unsubProgress: (() => void) | null = null;
    let unsubComplete: (() => void) | null = null;
    let unsubError: (() => void) | null = null;
    let alive = true;

    subscribeToDownloadProgress((p) => {
      if (!alive) return;
      setDownloadingVariants((prev) => ({ ...prev, [p.variant]: p.percent }));
    }).then((u) => { if (alive) unsubProgress = u; else u(); });

    subscribeToDownloadComplete((p) => {
      if (!alive) return;
      setDownloadingVariants((prev) => { const next = { ...prev }; delete next[p.variant]; return next; });
      setDownloadErrors((prev) => { const next = { ...prev }; delete next[p.variant]; return next; });
      refresh();
    }).then((u) => { if (alive) unsubComplete = u; else u(); });

    subscribeToDownloadError((p) => {
      if (!alive) return;
      setDownloadingVariants((prev) => { const next = { ...prev }; delete next[p.variant]; return next; });
      setDownloadErrors((prev) => ({ ...prev, [p.variant]: p.error }));
    }).then((u) => { if (alive) unsubError = u; else u(); });

    return () => {
      alive = false;
      unsubProgress?.();
      unsubComplete?.();
      unsubError?.();
    };
  }, [refresh]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const selectVariant = useCallback((variantId: string) => {
    const v = variantId as AppSettings["localWhisperActiveVariant"];
    onVariantChange?.(v);
    setOpen(false);
    // Auto-start background download if not installed
    const isInstalled = installed.some((m) => m.variant === variantId);
    const isDownloading = variantId in downloadingVariants;
    if (!isInstalled && !isDownloading) {
      localWhisperDownloadModel(variantId).catch(() => {});
    }
  }, [installed, downloadingVariants, onVariantChange]);

  const startDownload = useCallback((e: React.MouseEvent, variantId: string) => {
    e.stopPropagation();
    setDownloadErrors((prev) => { const next = { ...prev }; delete next[variantId]; return next; });
    localWhisperDownloadModel(variantId).catch(() => {});
  }, []);

  const onRemove = useCallback(async (e: React.MouseEvent, variantId: string) => {
    e.stopPropagation();
    if (removeConfirming !== variantId) {
      setRemoveConfirming(variantId);
      setTimeout(() => setRemoveConfirming((cur) => cur === variantId ? null : cur), 4000);
      return;
    }
    setRemoveConfirming(null);
    try {
      await localWhisperDeleteModel(variantId);
      await refresh();
    } catch (err) {
      setDownloadErrors((prev) => ({ ...prev, [variantId]: String(err) }));
    }
  }, [removeConfirming, refresh]);

  const activeIsInstalled = installed.some((m) => m.variant === active);

  return (
    <div className="mt-2" ref={dropdownRef} style={{ position: "relative" }}>
      {/* Closed trigger */}
      <button
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
        <span>
          <span className="font-medium">{activeInfo?.label ?? active}</span>
          <span style={{ color: tokens.fgMuted, marginLeft: 6 }}>—</span>
          <span style={{ color: tokens.fgMuted, marginLeft: 6 }}>{activeInfo?.description}</span>
        </span>
        <svg width="10" height="6" viewBox="0 0 10 6" fill="none" style={{ color: tokens.fgMuted, flexShrink: 0 }}>
          <path d={open ? "M1 5L5 1L9 5" : "M1 1L5 5L9 1"} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {/* Dropdown rows */}
      {open && (
        <div
          className="absolute left-0 right-0 z-10 rounded-md overflow-hidden"
          style={{
            top: "calc(100% + 4px)",
            background: tokens.control,
            border: `1px solid ${tokens.border}`,
            boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
          }}
        >
          {VARIANTS.map((opt, i) => {
            const isInstalled = installed.some((m) => m.variant === opt.id);
            const isDownloading = opt.id in downloadingVariants;
            const pct = downloadingVariants[opt.id] ?? 0;
            const isActive = opt.id === active;
            const isConfirmingRemove = removeConfirming === opt.id;
            const installedInfo = installed.find((m) => m.variant === opt.id);

            return (
              <div
                key={opt.id}
                onClick={() => selectVariant(opt.id)}
                className="flex items-center gap-2 px-3 py-2 cursor-pointer"
                style={{
                  borderBottom: i < VARIANTS.length - 1 ? `1px solid ${tokens.border}` : "none",
                  background: isActive ? `color-mix(in srgb, var(--color-primary) 8%, transparent)` : "transparent",
                }}
              >
                {/* Active checkmark */}
                <div style={{ width: 14, flexShrink: 0, color: "var(--color-accent)" }}>
                  {isActive && (
                    <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
                      <path d="M1 5L4.5 8.5L11 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>

                {/* Label + tooltip */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium" style={{ fontSize: 12, color: tokens.fg }}>{opt.label}</span>
                    <Tooltip text={opt.tooltip}>
                      <span
                        className="inline-flex items-center justify-center rounded-full"
                        style={{ width: 13, height: 13, fontSize: 9, background: tokens.border, color: tokens.fgMuted, cursor: "default", flexShrink: 0, fontWeight: 600 }}
                      >
                        ?
                      </span>
                    </Tooltip>
                    <span style={{ fontSize: 11, color: tokens.fgSubtle }}>{opt.description}</span>
                  </div>
                  {isDownloading && (
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <div
                        className="rounded-full overflow-hidden flex-1"
                        style={{ height: 3, background: tokens.border }}
                      >
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
                    <span style={{ fontSize: 10, color: "var(--color-warning)" }}>{downloadErrors[opt.id]}</span>
                  )}
                </div>

                {/* File size */}
                <span style={{ fontSize: 11, color: tokens.fgSubtle, flexShrink: 0 }}>
                  {installedInfo ? formatBytes(installedInfo.sizeBytes) : opt.size}
                </span>

                {/* Action icon */}
                <div style={{ width: 24, flexShrink: 0, display: "flex", justifyContent: "center" }}>
                  {isDownloading ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--color-accent)", animation: "spin 1s linear infinite" }}>
                      <path d="M21 12a9 9 0 11-6.219-8.56"/>
                    </svg>
                  ) : isInstalled ? (
                    <button
                      type="button"
                      onClick={(e) => void onRemove(e, opt.id)}
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
        </div>
      )}

      {/* "not installed" hint beneath the dropdown trigger */}
      {!activeIsInstalled && !open && !(active in downloadingVariants) && (
        <p className="text-[11px] mt-1.5" style={{ color: tokens.fgMuted }}>
          {activeInfo?.label ?? active} not downloaded yet — click the <Download size={10} style={{ display: "inline", verticalAlign: "middle" }} /> icon to download, or open the dropdown to pick a different variant.
        </p>
      )}
    </div>
  );
}

/* Minimal tooltip — shows on hover via CSS title-like approach using a wrapper */
function Tooltip({ text, children }: { text: string; children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  return (
    <span
      style={{ position: "relative", display: "inline-flex" }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && (
        <span
          style={{
            position: "absolute",
            left: "50%",
            bottom: "calc(100% + 5px)",
            transform: "translateX(-50%)",
            background: "var(--color-primary)",
            color: "#fff",
            fontSize: 11,
            lineHeight: 1.4,
            padding: "5px 8px",
            borderRadius: 5,
            whiteSpace: "normal",
            width: 200,
            pointerEvents: "none",
            zIndex: 50,
            boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
          }}
        >
          {text}
        </span>
      )}
    </span>
  );
}
