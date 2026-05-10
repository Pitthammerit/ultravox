import { useState, useEffect, useCallback } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import type { AppSettings } from "../lib/store-bridge";
import { applyTheme } from "@ultravox/design-system";
import { resetSettings, DEFAULT_SETTINGS } from "../lib/store-bridge";
import { Button, Input, Row, Section, ToggleRow, tokens } from "../components/ui";
import { Trash2 } from "lucide-react";
import { PillStylePicker } from "../components/PillStylePicker";
import {
  registerHotkeys,
  checkAccessibilityPermission,
  requestAccessibilityPermission,
  claudeCodeCheck,
  type ClaudeCodeStatus,
  localWhisperListModels,
  localWhisperDeleteModel,
  type LocalWhisperModelInfo,
  localLlmListModels,
  localLlmDeleteModel,
  type LocalLlmModelInfo as LocalLlmModel,
  listRecordingFiles,
  deleteRecordingAudio,
  openRecordingsFolder,
} from "../lib/tauri-bridge";
import { formatPickerBytes, EnPill } from "../components/TranscriptionModelPicker";
import { VARIANT_LABEL_MAP } from "../lib/transcriptionVariants";
import { LLM_LABEL_MAP } from "../lib/llmVariants";
import { getDebugLog, clearDebugLog, type DebugEntry } from "../lib/debugLog";
import { useT } from "../lib/i18n/I18nProvider";

interface ConfigurationPanelProps {
  settings?: AppSettings;
  onChange?: (patch: Partial<AppSettings>) => Promise<void>;
}

type MicState = "granted" | "denied" | "prompt" | "unknown";

async function checkMicrophonePermission(): Promise<MicState> {
  // Source of truth: macOS AVCaptureDevice authorization status (via Rust).
  // The WKWebView Permissions API returns "prompt" instead of "granted" on
  // cold launches even when the system has actually granted access — its
  // permission cache doesn't survive app relaunches.
  try {
    const native = await invoke<"notdetermined" | "restricted" | "denied" | "authorized">(
      "microphone_auth_status",
    );
    if (native === "authorized") return "granted";
    if (native === "denied" || native === "restricted") return "denied";
    // notdetermined → fall through to the WebView probe (lets us detect a
    // first-launch prompt state if it ever differs).
  } catch { /* fall through */ }
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
  const t = useT();
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
        label={t.panels.configuration.sectionRecordingWindow}
        help={t.panels.configuration.sectionRecordingWindowHelp}
      >
        <Row
          label={t.panels.configuration.pillStyleLabel}
          control={
            <PillStylePicker
              value={settings?.pillStyle ?? "classic"}
              onChange={(v) => {
                // Write pillStyle AND legacy compactPill in lockstep — this matches
                // what the in-pill expand/collapse handlers do. If we only wrote
                // pillStyle, downgrades to a pre-0.9.17 build would read the wrong
                // state, and any read path that prefers compactPill (none should,
                // but defensive) would diverge.
                if (onChange && settings) {
                  void onChange({
                    pillStyle: v,
                    sound: { ...settings.sound, compactPill: v === "mini" },
                  });
                }
                emit("pillStyle:changed", v).catch(() => {});
              }}
              size="small"
            />
          }
        />
      </Section>

      <InstalledWhisperModelsSection />
      <InstalledLlmModelsSection />
      <RecordingsSection settings={settings} onChange={onChange} />

      <Section
        label={t.panels.configuration.sectionPermissions}
        help={t.panels.configuration.sectionPermissionsHelp}
      >
        <Row
          label={t.panels.configuration.micAccess}
          help={
            micState === "granted"
              ? t.panels.configuration.micGrantedHelp
              : micState === "denied"
              ? t.panels.configuration.micDeniedHelp
              : micState === "prompt"
              ? t.panels.configuration.micPromptHelp
              : t.panels.configuration.micCheckingHelp
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
                  {micRequesting ? "Waiting…" : t.panels.configuration.grantAccess}
                </Button>
                {micState === "denied" && !micRequesting && (
                  <button
                    onClick={recheckMic}
                    className="text-[12px] text-color-secondary hover:text-color-primary underline"
                  >
                    {t.common.refresh}
                  </button>
                )}
              </div>
            )
          }
        />
        <Row
          label={t.panels.configuration.axAccess}
          help={
            axGranted === true
              ? t.panels.configuration.axGrantedHelp
              : axGranted === false
              ? t.panels.configuration.axIdleHelp
              : t.panels.configuration.micCheckingHelp
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
                  {axRequesting ? "Waiting…" : t.panels.configuration.grantAccess}
                </Button>
                {axGranted === false && !axRequesting && (
                  <button
                    onClick={recheckAx}
                    className="text-[12px] text-color-secondary hover:text-color-primary underline"
                  >
                    {t.common.refresh}
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

      <Section label={t.panels.configuration.sectionDangerZone}>
        <Row
          label={t.panels.configuration.resetAll}
          help={t.panels.configuration.resetAllHelp}
          control={
            <Button
              variant="outline"
              size="xs"
              onClick={reset}
              style={resetConfirming ? { borderColor: "var(--color-warning)", color: "var(--color-warning)" } : {}}
            >
              {resetConfirming ? t.panels.configuration.resetAllConfirm : t.panels.configuration.resetAll}
            </Button>
          }
        />
        <Row
          label="Onboarding wizard"
          help="Re-open the setup wizard. Your settings are preserved."
          control={
            <Button
              variant="outline"
              size="xs"
              onClick={async () => {
                await onChange?.({ onboardingComplete: false, onboardingStep: 0 });
                await emit("settings:launch-onboarding");
              }}
            >
              Launch
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
  const t = useT();
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
      label={t.panels.configuration.sectionDiagnostics}
      help={t.panels.configuration.sectionDiagnosticsHelp}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[12px]" style={{ color: tokens.fgMuted }}>
          {entries.length} entries · newest first
        </span>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="xs" onClick={refresh} disabled={loading}>
            {loading ? t.common.loading : t.common.refresh}
          </Button>
          <Button
            variant="outline"
            size="xs"
            onClick={onClear}
            style={confirmClear ? { borderColor: "var(--color-warning)", color: "var(--color-warning)" } : {}}
          >
            {confirmClear ? "Click again" : t.panels.configuration.clearLog}
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
   INSTALLED WHISPER MODELS — delete-only view for disk management
   Wrapped in an accordion; collapsed by default (maintenance feature).
   ───────────────────────────────────────────────────────────── */

function InstalledWhisperModelsSection() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [installed, setInstalled] = useState<LocalWhisperModelInfo[]>([]);
  const [removeConfirming, setRemoveConfirming] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    const list = await localWhisperListModels().catch(() => [] as LocalWhisperModelInfo[]);
    setInstalled(list);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const onRemove = useCallback(async (e: React.MouseEvent, variant: string) => {
    e.stopPropagation();
    if (removeConfirming !== variant) {
      setRemoveConfirming(variant);
      setTimeout(() => setRemoveConfirming((cur) => cur === variant ? null : cur), 4000);
      return;
    }
    setRemoveConfirming(null);
    try {
      await localWhisperDeleteModel(variant);
      await refresh();
    } catch (err) {
      setErrors((prev) => ({ ...prev, [variant]: String(err) }));
    }
  }, [removeConfirming, refresh]);

  return (
    <section className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between w-full text-left"
        style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
      >
        <div className="flex items-center gap-2">
          <span
            className="text-[10.5px] uppercase tracking-[0.14em] font-medium"
            style={{ color: tokens.fgMuted }}
          >
            {t.panels.configuration.sectionTranscription}
          </span>
          {installed.length > 0 && (
            <span
              className="inline-flex items-center justify-center rounded-full text-[10px] font-semibold"
              style={{
                minWidth: 16,
                height: 16,
                padding: "0 4px",
                background: `color-mix(in srgb, var(--color-primary) 12%, transparent)`,
                color: tokens.fgMuted,
              }}
            >
              {installed.length}
            </span>
          )}
        </div>
        <svg
          width="10" height="6" viewBox="0 0 10 6" fill="none"
          style={{
            color: tokens.fgMuted,
            flexShrink: 0,
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform 150ms ease",
          }}
        >
          <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      <div
        style={{
          overflow: "hidden",
          maxHeight: open ? 600 : 0,
          transition: "max-height 150ms ease",
        }}
      >
        <div className="flex flex-col gap-1">
          {installed.length === 0 ? (
            <p className="text-[12px] py-1" style={{ color: tokens.fgMuted }}>
              No Whisper models installed. Pick a variant in a Mode's Transcription Model setting to download one.
            </p>
          ) : (
            installed.map((m) => {
              const isConfirming = removeConfirming === m.variant;
              const meta = VARIANT_LABEL_MAP[m.variant];
              const brandedLabel = meta?.label ?? m.variant;
              const isEnglish = meta?.isEnglish ?? false;
              return (
                <Row
                  key={m.variant}
                  label={
                    <span className="flex items-center gap-1.5">
                      <span>{brandedLabel}</span>
                      {isEnglish && <EnPill />}
                      {m.coremlInstalled && <CoremlBadge />}
                    </span>
                  }
                  help={errors[m.variant]}
                  control={
                    <div className="flex items-center gap-2">
                      <span style={{ fontSize: 11, color: tokens.fgSubtle }}>{formatPickerBytes(m.sizeBytes)}</span>
                      <button
                        type="button"
                        onClick={(e) => void onRemove(e, m.variant)}
                        title={isConfirming ? "Click again to confirm" : "Delete model file"}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          padding: 2,
                          color: isConfirming ? "var(--color-warning)" : tokens.fgMuted,
                          display: "flex",
                          alignItems: "center",
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  }
                />
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
   INSTALLED LLM MODELS — delete-only view for disk management
   Wrapped in an accordion; collapsed by default (maintenance feature).
   ───────────────────────────────────────────────────────────── */

function InstalledLlmModelsSection() {
  // useT() invoked for future migrations once catalog has LLM model section keys.
  void useT();
  const [open, setOpen] = useState(false);
  const [installed, setInstalled] = useState<LocalLlmModel[]>([]);
  const [removeConfirming, setRemoveConfirming] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    const list = await localLlmListModels().catch(() => [] as LocalLlmModel[]);
    setInstalled(list);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const onRemove = useCallback(async (e: React.MouseEvent, variant: string) => {
    e.stopPropagation();
    if (removeConfirming !== variant) {
      setRemoveConfirming(variant);
      setTimeout(() => setRemoveConfirming((cur) => cur === variant ? null : cur), 4000);
      return;
    }
    setRemoveConfirming(null);
    try {
      await localLlmDeleteModel(variant);
      await refresh();
    } catch (err) {
      setErrors((prev) => ({ ...prev, [variant]: String(err) }));
    }
  }, [removeConfirming, refresh]);

  return (
    <section className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between w-full text-left"
        style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
      >
        <div className="flex items-center gap-2">
          <span
            className="text-[10.5px] uppercase tracking-[0.14em] font-medium"
            style={{ color: tokens.fgMuted }}
          >
            Installed LLM models
          </span>
          {installed.length > 0 && (
            <span
              className="inline-flex items-center justify-center rounded-full text-[10px] font-semibold"
              style={{
                minWidth: 16,
                height: 16,
                padding: "0 4px",
                background: `color-mix(in srgb, var(--color-primary) 12%, transparent)`,
                color: tokens.fgMuted,
              }}
            >
              {installed.length}
            </span>
          )}
        </div>
        <svg
          width="10" height="6" viewBox="0 0 10 6" fill="none"
          style={{
            color: tokens.fgMuted,
            flexShrink: 0,
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform 150ms ease",
          }}
        >
          <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      <div
        style={{
          overflow: "hidden",
          maxHeight: open ? 600 : 0,
          transition: "max-height 150ms ease",
        }}
      >
        <div className="flex flex-col gap-1">
          {installed.length === 0 ? (
            <p className="text-[12px] py-1" style={{ color: tokens.fgMuted }}>
              No LLM models installed. Pick a variant in a Mode's Processing Model setting to download one.
            </p>
          ) : (
            installed.map((m) => {
              const isConfirming = removeConfirming === m.variant;
              const meta = LLM_LABEL_MAP[m.variant];
              const brandedLabel = meta?.label ?? m.variant;
              return (
                <Row
                  key={m.variant}
                  label={brandedLabel}
                  help={errors[m.variant]}
                  control={
                    <div className="flex items-center gap-2">
                      <span style={{ fontSize: 11, color: tokens.fgSubtle }}>{formatPickerBytes(m.sizeBytes)}</span>
                      <button
                        type="button"
                        onClick={(e) => void onRemove(e, m.variant)}
                        title={isConfirming ? "Click again to confirm" : "Delete model file"}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          padding: 2,
                          color: isConfirming ? "var(--color-warning)" : tokens.fgMuted,
                          display: "flex",
                          alignItems: "center",
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  }
                />
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * Visual indicator that a Whisper model has its CoreML encoder bundle
 * installed alongside the .bin — meaning the encoder runs on Apple's
 * Neural Engine for ~2-3× faster transcription. Shown next to the model
 * label in the Configuration panel's "Transcription" section.
 */
function CoremlBadge() {
  // useT() invoked per migration spec; aneBadgeTitle key not yet in catalog.
  void useT();
  return (
    <span
      title="CoreML encoder installed — runs on Apple Neural Engine"
      className="inline-flex items-center justify-center text-[9.5px] uppercase tracking-[0.08em] font-semibold"
      style={{
        height: 14,
        padding: "0 5px",
        borderRadius: 3,
        background: "color-mix(in srgb, var(--color-accent) 18%, transparent)",
        color: "var(--color-accent)",
        letterSpacing: "0.06em",
      }}
    >
      ANE
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────────
   RECORDINGS — local audio storage opt-in. Default OFF (privacy-first).
   When enabled, every recording's audio blob is persisted to disk so
   the user can replay / re-transcribe / audit later from the History
   panel. Auto-deletes after configurable retention (off / 7 / 30 / 90
   days), sweep runs on app launch.
   ────────────────────────────────────────────────────────────────── */

interface RecordingsSectionProps {
  settings: AppSettings | undefined;
  onChange: ((patch: Partial<AppSettings>) => Promise<void>) | undefined;
}

function RecordingsSection({ settings, onChange }: RecordingsSectionProps) {
  const t = useT();
  // Disk-usage readout. Refreshed on settings:saved (which fires after
  // every recording append) so the user sees the count climb in real time
  // when they're testing the feature on first install.
  const [stats, setStats] = useState<{ count: number; bytes: number }>({ count: 0, bytes: 0 });
  const [clearConfirming, setClearConfirming] = useState(false);

  const refreshStats = useCallback(async () => {
    try {
      const files = await listRecordingFiles();
      const bytes = files.reduce((s, f) => s + f.sizeBytes, 0);
      setStats({ count: files.length, bytes });
    } catch (e) {
      console.warn("[Recordings] listRecordingFiles failed:", e);
    }
  }, []);

  useEffect(() => { void refreshStats(); }, [refreshStats]);
  useEffect(() => {
    let unsub: (() => void) | undefined;
    listen("settings:saved", () => { void refreshStats(); }).then((u) => { unsub = u; });
    return () => { unsub?.(); };
  }, [refreshStats]);

  const recordings = settings?.recordings ?? { saveLocal: false, retentionDays: 30 };
  const setSaveLocal = (next: boolean) =>
    onChange?.({ recordings: { ...recordings, saveLocal: next } });
  const setRetention = (days: 0 | 7 | 30 | 90) =>
    onChange?.({ recordings: { ...recordings, retentionDays: days } });

  const onClearAll = async () => {
    if (!clearConfirming) {
      setClearConfirming(true);
      setTimeout(() => setClearConfirming(false), 4000);
      return;
    }
    setClearConfirming(false);
    try {
      const files = await listRecordingFiles();
      for (const f of files) {
        await deleteRecordingAudio(f.id);
      }
      void refreshStats();
    } catch (e) {
      console.warn("[Recordings] delete-all failed:", e);
    }
  };

  return (
    <Section
      label={t.panels.configuration.sectionRecordings}
      help={t.panels.configuration.sectionRecordingsHelp}
    >
      <ToggleRow
        label={t.panels.configuration.saveAudioLocally}
        help={
          recordings.saveLocal
            ? t.panels.configuration.saveAudioOnHelp(
                recordings.retentionDays === 0
                  ? t.panels.configuration.retentionNever
                  : t.panels.configuration.retentionDays(recordings.retentionDays),
              )
            : t.panels.configuration.saveAudioOffHelp
        }
        checked={recordings.saveLocal}
        onChange={(v) => void setSaveLocal(v)}
      />
      {recordings.saveLocal && (
        <>
          <Row
            label={t.panels.configuration.autoDeleteAfter}
            control={
              <select
                value={recordings.retentionDays}
                onChange={(e) => setRetention(Number(e.currentTarget.value) as 0 | 7 | 30 | 90)}
                className="rounded-md text-[12px] px-2 py-1"
                style={{
                  background: tokens.control,
                  color: tokens.fg,
                  border: `1px solid ${tokens.border}`,
                }}
              >
                <option value={0}>{t.panels.configuration.retentionNever}</option>
                <option value={7}>{t.panels.configuration.retentionDays(7)}</option>
                <option value={30}>{t.panels.configuration.retentionDays(30)}</option>
                <option value={90}>{t.panels.configuration.retentionDays(90)}</option>
              </select>
            }
          />
          <Row
            label={t.panels.configuration.diskUsage}
            control={
              <span style={{ fontSize: 12, color: tokens.fgMuted }}>
                {stats.count === 0
                  ? t.panels.configuration.diskUsageEmpty
                  : t.panels.configuration.diskUsageFull(formatBytes(stats.bytes), stats.count)}
              </span>
            }
          />
          <Row
            label=""
            control={
              <div className="flex items-center gap-1.5">
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => void openRecordingsFolder()}
                >
                  {t.panels.configuration.openFolder}
                </Button>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => void onClearAll()}
                >
                  {clearConfirming
                    ? t.panels.configuration.deleteAllConfirm
                    : t.panels.configuration.deleteAll(stats.count)}
                </Button>
              </div>
            }
          />
        </>
      )}
    </Section>
  );
}
