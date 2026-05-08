import { useState, useEffect, useCallback } from "react";
import { emit } from "@tauri-apps/api/event";
import type { AppSettings } from "../lib/store-bridge";
import { applyTheme } from "@ultravox/design-system";
import { resetSettings, DEFAULT_SETTINGS } from "../lib/store-bridge";
import { Button, Input, Row, Section, ToggleRow, tokens } from "../components/ui";
import { PillStylePicker } from "../components/PillStylePicker";
import {
  registerHotkeys,
  checkAccessibilityPermission,
  requestAccessibilityPermission,
  claudeCodeCheck,
  type ClaudeCodeStatus,
  localWhisperStatus,
  localWhisperListModels,
  localWhisperDownloadModel,
  localWhisperDeleteModel,
  subscribeToDownloadProgress,
  subscribeToDownloadComplete,
  subscribeToDownloadError,
  type LocalWhisperModelInfo,
  type LocalWhisperStatus as LocalWhisperStatusType,
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
        {(settings?.localWhisperEnabled ?? false) && <LocalWhisperConfig />}
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
   LOCAL WHISPER — variant picker, download progress, status
   ───────────────────────────────────────────────────────────── */

const VARIANTS: Array<{ id: string; label: string; size: string; description: string }> = [
  { id: "tiny",    label: "Tiny",    size: "~75 MB",  description: "Fastest, lower accuracy" },
  { id: "base.en", label: "Base.en", size: "~142 MB", description: "Recommended for English" },
  { id: "base",    label: "Base",    size: "~142 MB", description: "All languages, balanced" },
  { id: "small",   label: "Small",   size: "~466 MB", description: "Best accuracy, slowest" },
];

function LocalWhisperConfig() {
  const [status, setStatus] = useState<LocalWhisperStatusType | null>(null);
  const [installed, setInstalled] = useState<LocalWhisperModelInfo[]>([]);
  const [picked, setPicked] = useState<string>("base.en");
  const [downloadingVariant, setDownloadingVariant] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [removeConfirming, setRemoveConfirming] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [s, list] = await Promise.all([
      localWhisperStatus().catch(() => null),
      localWhisperListModels().catch(() => [] as LocalWhisperModelInfo[]),
    ]);
    setStatus(s);
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
      setDownloadingVariant(p.variant);
      setProgress(p.percent);
    }).then((u) => { if (alive) unsubProgress = u; else u(); });

    subscribeToDownloadComplete(() => {
      if (!alive) return;
      setDownloadingVariant(null);
      setProgress(0);
      setDownloadError(null);
      refresh();
    }).then((u) => { if (alive) unsubComplete = u; else u(); });

    subscribeToDownloadError((p) => {
      if (!alive) return;
      setDownloadingVariant(null);
      setProgress(0);
      setDownloadError(p.error);
    }).then((u) => { if (alive) unsubError = u; else u(); });

    return () => {
      alive = false;
      unsubProgress?.();
      unsubComplete?.();
      unsubError?.();
    };
  }, [refresh]);

  const onDownload = async () => {
    setDownloadError(null);
    setDownloadingVariant(picked);
    setProgress(0);
    try {
      await localWhisperDownloadModel(picked);
    } catch (e) {
      setDownloadingVariant(null);
      setDownloadError(String(e));
    }
  };

  const onRemove = async (variant: string) => {
    if (removeConfirming !== variant) {
      setRemoveConfirming(variant);
      setTimeout(() => {
        setRemoveConfirming((cur) => (cur === variant ? null : cur));
      }, 4000);
      return;
    }
    setRemoveConfirming(null);
    try {
      await localWhisperDeleteModel(variant);
      await refresh();
    } catch (e) {
      setDownloadError(String(e));
    }
  };

  const isDownloading = downloadingVariant !== null;
  const ready = status?.available === true;
  const installedForVariant = installed.find((m) => m.variant === status?.modelVariant);

  return (
    <div className="flex flex-col gap-3 mt-2">
      {/* Status row */}
      <div
        className="rounded-md px-3 py-2 text-[12px]"
        style={{
          background: tokens.control,
          border: `1px solid ${tokens.border}`,
          color: ready ? "var(--color-accent)" : tokens.fgMuted,
        }}
      >
        {ready
          ? `✓ Installed · ${status?.modelVariant ?? "?"}${
              installedForVariant ? ` · ${formatBytes(installedForVariant.sizeBytes)}` : ""
            } · ready`
          : "No model installed — pick a variant below to enable local transcription"}
      </div>

      {/* Variant picker */}
      <div className="flex flex-wrap gap-2">
        {VARIANTS.map((opt) => {
          const active = opt.id === picked;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => setPicked(opt.id)}
              disabled={isDownloading}
              className="flex flex-col items-start rounded-lg p-2 transition-colors text-left"
              style={{
                width: 140,
                background: tokens.control,
                border: `1.5px solid ${active ? "#ffffff" : tokens.border}`,
                cursor: isDownloading ? "not-allowed" : "pointer",
                opacity: isDownloading && !active ? 0.5 : 1,
              }}
            >
              <div className="font-medium" style={{ fontSize: 12, color: tokens.fg }}>
                {opt.label}
              </div>
              <div style={{ fontSize: 11, color: tokens.fgMuted }}>{opt.size}</div>
              <div style={{ fontSize: 10.5, color: tokens.fgSubtle, lineHeight: 1.3, marginTop: 2 }}>
                {opt.description}
              </div>
            </button>
          );
        })}
      </div>

      {/* Download button or progress */}
      {isDownloading ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-[11.5px]" style={{ color: tokens.fgMuted }}>
            <span>Downloading {downloadingVariant}…</span>
            <span className="font-mono">{progress.toFixed(0)}%</span>
          </div>
          <div
            className="rounded-full overflow-hidden"
            style={{ height: 6, background: tokens.control, border: `1px solid ${tokens.border}` }}
          >
            <div
              style={{
                width: `${Math.max(0, Math.min(100, progress))}%`,
                height: "100%",
                background: "var(--color-accent)",
                transition: "width 200ms ease-out",
              }}
            />
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Button variant="primary" size="xs" onClick={onDownload}>
            Download {picked}
          </Button>
          {downloadError && (
            <span className="text-[11.5px]" style={{ color: "var(--color-warning)" }}>
              {downloadError}
            </span>
          )}
        </div>
      )}

      {/* Installed list */}
      {installed.length > 0 && (
        <div className="flex flex-col gap-1 mt-1">
          <div className="text-[11.5px]" style={{ color: tokens.fgMuted }}>
            Installed ({installed.length})
          </div>
          <div
            className="rounded-md overflow-hidden"
            style={{ background: tokens.control, border: `1px solid ${tokens.border}` }}
          >
            {installed.map((m, i) => (
              <div
                key={m.variant}
                className="flex items-center justify-between px-3 py-2 text-[11.5px]"
                style={{
                  borderBottom: i === installed.length - 1 ? "none" : `1px solid ${tokens.border}`,
                }}
              >
                <span className="font-mono" style={{ color: tokens.fg }}>
                  {m.variant}
                  <span style={{ color: tokens.fgMuted, marginLeft: 8 }}>
                    {formatBytes(m.sizeBytes)}
                  </span>
                </span>
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => onRemove(m.variant)}
                  style={
                    removeConfirming === m.variant
                      ? { borderColor: "var(--color-warning)", color: "var(--color-warning)" }
                      : {}
                  }
                >
                  {removeConfirming === m.variant ? "Click again" : "Remove"}
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
