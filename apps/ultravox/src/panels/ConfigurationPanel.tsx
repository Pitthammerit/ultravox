import { useState, useEffect, useCallback, useRef } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import type { AppSettings, RecordingsSettings } from "../lib/store-bridge";
import { applyTheme } from "@ultravox/design-system";
import { resetSettings, DEFAULT_SETTINGS } from "../lib/store-bridge";
import { Button, Input, Row, Section, ToggleRow, tokens } from "../components/ui";
import { Trash2 } from "lucide-react";
import { PillStylePicker } from "../components/PillStylePicker";
import { ConfirmDialog } from "../components/ConfirmDialog";
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
  recordingsDefaultFolder,
  chooseRecordingsFolder,
} from "../lib/tauri-bridge";
import {
  secureStoreSet,
  secureStoreDelete,
  secureStoreHas,
  KEY_OPENROUTER_API,
} from "../lib/secure-store";
import { formatPickerBytes, EnPill } from "../components/TranscriptionModelPicker";
import { VARIANT_LABEL_MAP } from "../lib/transcriptionVariants";
import { LLM_LABEL_MAP } from "../lib/llmVariants";
import { getDebugLog, clearDebugLog, type DebugEntry } from "../lib/debugLog";
import { useT } from "../lib/i18n/I18nProvider";
import type { Lang } from "../lib/i18n/catalog";

type SettingsSection =
  | "home"
  | "modes"
  | "vocabulary"
  | "configuration"
  | "sound"
  | "history";

interface ConfigurationPanelProps {
  settings?: AppSettings;
  onChange?: (patch: Partial<AppSettings>) => Promise<void>;
  /** When provided, the Configuration panel can navigate to other sections
   *  in the SettingsWindow shell — used by LastTranscriptionSection's
   *  "Show recent recordings" button to deep-link into the History panel. */
  onNavigate?: (s: SettingsSection) => void;
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

export default function ConfigurationPanel({ settings, onChange, onNavigate }: ConfigurationPanelProps) {
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
        DEFAULT_SETTINGS.pttHotkey,
        DEFAULT_SETTINGS.recordingStyle,
      );
    } catch { /* ignore */ }
    window.location.reload();
  };

  return (
    <>
      {/* About-you: a single row with two side-by-side text fields, no
          per-field label. Placeholder text is the only affordance — fits
          the user's "compact" mandate (2026-05-11). Width is split 1/1
          so first and last name carry equal visual weight. */}
      <Section
        label={t.panels.configuration.sectionAboutYou}
        help={t.panels.configuration.sectionAboutYouHelp}
      >
        <div className="flex items-center gap-1.5">
          <div className="flex-1">
            <Input
              value={settings?.firstName ?? ""}
              onChange={(v) => {
                if (onChange) void onChange(v.trim() ? { firstName: v } : { firstName: "" });
              }}
              placeholder={t.panels.configuration.firstName}
            />
          </div>
          <div className="flex-1">
            <Input
              value={settings?.lastName ?? ""}
              onChange={(v) => {
                if (onChange) void onChange(v.trim() ? { lastName: v } : { lastName: "" });
              }}
              placeholder={t.panels.configuration.lastName}
            />
          </div>
        </div>
      </Section>

      {/* UI language. Horizontal segmented control — same shape used for
          appearance theme so the chrome reads as a related primitive.
          Currently EN + DE; structure handles Swedish + Spanish (and any
          future addition) by just adding entries to the LANG_OPTIONS
          array. Width grows with the number of options, so 4 fits the
          Settings column without wrapping. */}
      <Section
        label={t.panels.configuration.sectionLanguage}
        help={t.panels.configuration.sectionLanguageHelp}
      >
        <Row
          label={t.panels.configuration.languageLabel}
          control={
            <LanguagePicker
              value={settings?.uiLanguage ?? "en"}
              onChange={async (v) => {
                if (!onChange) return;
                await onChange({ uiLanguage: v });
                emit("uiLanguage:changed", v).catch(() => {});
              }}
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

      {/* Mode selection — opt-in auto-mode-by-frontmost-app. Default off:
          the user's manually-picked activeModeId always wins until they
          flip this. Restored in v0.18.8 after being removed in v0.11.7
          (it silently overrode user intent). Sits ABOVE the model lists
          so it reads as a "how modes resolve" setting, not an "advanced
          model" tweak. */}
      <Section
        collapsible
        defaultCollapsed
        label={t.panels.configuration.sectionModeSelection}
        help={t.panels.configuration.sectionModeSelectionHelp}
      >
        <ToggleRow
          label={t.panels.configuration.autoModeLabel}
          help={t.panels.configuration.autoModeHelp}
          checked={settings?.autoModeEnabled ?? false}
          onChange={(v) => {
            if (onChange) void onChange({ autoModeEnabled: v });
          }}
        />
      </Section>

      <InstalledWhisperModelsSection />
      <InstalledLlmModelsSection />
      <LastTranscriptionSection settings={settings} onChange={onChange} onNavigate={onNavigate} />
      <RecordingsSection settings={settings} onChange={onChange} />

      {/* Permissions: collapsible. Default expanded so a first-launch user
          immediately sees the mic / accessibility prompts. After grant,
          they can collapse the section — the chevron position matches
          every other accordion (LEFT of the label) per v0.18.3 unified
          chevron rule.  */}
      <Section
        collapsible
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
              <span className="text-[12px] text-color-accent font-medium">{t.panels.configuration.permissionGranted}</span>
            ) : (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="xs"
                  onClick={grantMic}
                  disabled={micRequesting}
                >
                  {micRequesting ? t.panels.configuration.permissionWaiting : t.panels.configuration.grantAccess}
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
              <span className="text-[12px] text-color-accent font-medium">{t.panels.configuration.permissionGranted}</span>
            ) : (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="xs"
                  onClick={grantAx}
                  disabled={axRequesting}
                >
                  {axRequesting ? t.panels.configuration.permissionWaiting : t.panels.configuration.grantAccess}
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

      <ApiKeysSection
        claudeStatus={claudeStatus}
        settings={settings ?? null}
        onChange={onChange}
      />

      {/* Onboarding wizard — lives in its own section. Used to be inside
          Danger Zone, which was misleading: re-launching the wizard is
          non-destructive (settings preserved). Moving it out makes Danger
          Zone exclusively destructive operations. */}
      <Section
        label={t.panels.configuration.sectionOnboarding}
        help={t.panels.configuration.sectionOnboardingHelp}
      >
        <Row
          label={t.panels.configuration.launchOnboarding}
          control={
            <Button
              variant="outline"
              size="xs"
              onClick={async () => {
                await onChange?.({ onboardingComplete: false, onboardingStep: 0 });
                await emit("settings:launch-onboarding");
              }}
            >
              {t.panels.configuration.launchOnboarding}
            </Button>
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
      </Section>

      <DiagnosticsSection />
    </>
  );
}

/* ─────────────────────────────────────────────────────────────
   CLEANUP PROVIDERS — per-provider on/off toggles + credentials.
   v0.19.1 refactor of the v0.18.4 "API Keys" section.

   Each provider has a toggle:
   - OpenRouter: when ON + key in Keychain → available in mode editor.
     When OFF or no key → hidden from dropdown, backend won't use it.
   - Claude Code CLI: when ON + CLI detected → available. When OFF or
     not installed → hidden.

   Effective availability is computed at:
   - The mode editor's provider dropdown (filtered).
   - transcribe.ts's openrouter / claude-code branches (skip if toggle
     off; soft-fallback handles the rest).

   The OpenRouter key field is a masked password input. The plaintext
   value lives in React state ONLY while the user is actively typing
   into the field — it's cleared the moment Save resolves. The actual
   key never leaves the Keychain unless transcribe.ts reads it on
   demand at cleanup time.
   ───────────────────────────────────────────────────────────── */

interface ApiKeysSectionProps {
  claudeStatus: ClaudeCodeStatus | null;
  settings: AppSettings | null;
  onChange: ((next: Partial<AppSettings>) => void | Promise<void>) | undefined;
}

function ApiKeysSection({ claudeStatus, settings, onChange }: ApiKeysSectionProps) {
  const t = useT();
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<"saving" | "removing" | null>(null);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [removeConfirming, setRemoveConfirming] = useState(false);
  const removeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Defaults to true (matches DEFAULT_SETTINGS) so users on v0.19.0
  // settings files that predate the toggles get the same behavior they
  // had before — provider available if credential is present.
  const openrouterEnabled = settings?.openrouterEnabled ?? true;
  const claudeCodeEnabled = settings?.claudeCodeEnabled ?? true;

  useEffect(() => {
    secureStoreHas(KEY_OPENROUTER_API).then(setHasKey).catch(() => setHasKey(false));
    return () => {
      if (removeTimerRef.current) clearTimeout(removeTimerRef.current);
    };
  }, []);

  const flash = (kind: "ok" | "error", text: string) => {
    setFeedback({ kind, text });
    setTimeout(() => setFeedback(null), 4000);
  };

  const onSave = async () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    setBusy("saving");
    try {
      await secureStoreSet(KEY_OPENROUTER_API, trimmed);
      setDraft("");
      setHasKey(true);
      flash("ok", t.panels.configuration.openrouterKeySavedToast);
    } catch (e) {
      flash("error", t.panels.configuration.openrouterKeySaveError(String((e as Error).message ?? e)));
    } finally {
      setBusy(null);
    }
  };

  const onRemove = async () => {
    if (!removeConfirming) {
      setRemoveConfirming(true);
      removeTimerRef.current = setTimeout(() => setRemoveConfirming(false), 4000);
      return;
    }
    if (removeTimerRef.current) clearTimeout(removeTimerRef.current);
    setRemoveConfirming(false);
    setBusy("removing");
    try {
      await secureStoreDelete(KEY_OPENROUTER_API);
      setHasKey(false);
      flash("ok", t.panels.configuration.openrouterKeyRemovedToast);
    } catch (e) {
      flash("error", t.panels.configuration.openrouterKeyRemoveError(String((e as Error).message ?? e)));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Section
      label={t.panels.configuration.sectionCleanupProviders}
      help={t.panels.configuration.sectionCleanupProvidersHelp}
    >
      {/* OpenRouter master toggle */}
      <ToggleRow
        label={t.panels.configuration.openrouterLabel}
        help={t.panels.configuration.openrouterEnabledHelp}
        checked={openrouterEnabled}
        onChange={(v) => onChange?.({ openrouterEnabled: v })}
      />
      {openrouterEnabled && (
        <>
          <Row
            label={t.panels.configuration.openrouterApiKeyLabel}
            help={t.panels.configuration.openrouterApiKeyHelp}
            control={
              hasKey === null ? (
                <span className="text-[12px]" style={{ color: tokens.fgSubtle }}>
                  {t.panels.configuration.openrouterKeyChecking}
                </span>
              ) : hasKey ? (
                <span
                  className="inline-flex items-center text-[10px] font-semibold uppercase tracking-[0.06em]"
                  style={{
                    background: "color-mix(in srgb, var(--color-accent) 18%, transparent)",
                    color: "var(--color-accent)",
                    height: 14,
                    padding: "0 5px",
                    borderRadius: 3,
                    letterSpacing: "0.06em",
                  }}
                >
                  {t.panels.configuration.openrouterKeySaved}
                </span>
              ) : (
                <span className="text-[12px]" style={{ color: tokens.fgMuted }}>
                  {t.panels.configuration.openrouterKeyNotSet}
                </span>
              )
            }
          />
          <Row
            label={hasKey ? t.panels.configuration.openrouterReplaceKey : t.panels.configuration.openrouterSetKey}
            control={
              <div className="flex items-center gap-1.5">
                <input
                  type="password"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={t.panels.configuration.openrouterKeyPlaceholder}
                  autoComplete="off"
                  spellCheck={false}
                  className="rounded-md transition-colors focus:outline-none"
                  style={{
                    background: tokens.control,
                    color: tokens.fg,
                    border: `1px solid ${tokens.border}`,
                    padding: "4px 8px",
                    fontSize: 12.5,
                    width: 200,
                    fontFamily: "ui-monospace, SFMono-Regular, monospace",
                  }}
                />
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => void onSave()}
                  disabled={busy !== null || !draft.trim()}
                >
                  {busy === "saving" ? t.panels.configuration.openrouterKeySaving : t.common.save}
                </Button>
                {hasKey && (
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => void onRemove()}
                    disabled={busy !== null}
                    style={removeConfirming ? { borderColor: "var(--color-warning)", color: "var(--color-warning)" } : {}}
                  >
                    {busy === "removing"
                      ? "…"
                      : removeConfirming
                        ? t.panels.configuration.openrouterKeyClickAgain
                        : t.panels.configuration.openrouterKeyRemove}
                  </Button>
                )}
              </div>
            }
          />
          {feedback && (
            <Row
              label=""
              control={
                <span
                  className="text-[11.5px]"
                  style={{ color: feedback.kind === "ok" ? "var(--color-accent)" : "var(--color-warning)" }}
                >
                  {feedback.text}
                </span>
              }
            />
          )}
        </>
      )}

      {/* Claude Code CLI master toggle + status */}
      <ToggleRow
        label={t.panels.configuration.claudeCodeCli}
        help={t.panels.configuration.claudeCodeEnabledHelp}
        checked={claudeCodeEnabled}
        onChange={(v) => onChange?.({ claudeCodeEnabled: v })}
      />
      {claudeCodeEnabled && (
        <Row
          label=""
          control={
            <span style={{ fontSize: 12, color: claudeStatus?.available ? "var(--color-accent)" : tokens.fgMuted }}>
              {claudeStatus == null
                ? t.panels.configuration.claudeCodeCliChecking
                : claudeStatus.available
                  ? t.panels.configuration.claudeCodeCliAvailable(claudeStatus.version ?? "v?")
                  : t.panels.configuration.claudeCodeCliNotInstalled}
            </span>
          }
        />
      )}
    </Section>
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

/**
 * Round-and-coarsen byte formatter used only by the Recordings disk-usage
 * readout. The detailed formatBytes() above (used by Diagnostics + the
 * toggle-off dialog) reports e.g. "1.29MB" — fine when you need precision,
 * cluttered when you just want a "you have N MB sitting on disk" eyeball.
 * Rounded readout: < 1 MB → nearest KB (min 1 KB), >= 1 MB → nearest MB.
 */
function formatBytesRounded(b: number): string {
  if (b < 1024 * 1024) {
    const kb = Math.max(1, Math.round(b / 1024));
    return `${kb} KB`;
  }
  return `${Math.round(b / (1024 * 1024))} MB`;
}

/* ─────────────────────────────────────────────────────────────
   INSTALLED WHISPER MODELS — delete-only view for disk management
   Wrapped in an accordion; collapsed by default (maintenance feature).
   ───────────────────────────────────────────────────────────── */

function InstalledWhisperModelsSection() {
  const t = useT();
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

  // Unified accordion chevron: use the standard <Section collapsible> from
  // ui.tsx so the chevron sits LEFT of the label, matching every other
  // accordion (Recordings, Permissions, Diagnostics, etc.). The badge with
  // the install-count is inlined into the label ReactNode so it lives in
  // the same horizontal row, just after the eyebrow text.
  return (
    <Section
      collapsible
      defaultCollapsed
      label={
        <span className="inline-flex items-center gap-2">
          <span>{t.panels.configuration.sectionTranscription}</span>
          {installed.length > 0 && <CountBadge value={installed.length} />}
        </span>
      }
    >
      <div className="flex flex-col gap-1">
        {installed.length === 0 ? (
          <p className="text-[12px] py-1" style={{ color: tokens.fgMuted }}>
            No Whisper models installed. Pick a variant in a Mode&apos;s Transcription Model setting to download one.
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
    </Section>
  );
}

/* ─────────────────────────────────────────────────────────────
   INSTALLED LLM MODELS — delete-only view for disk management
   Wrapped in an accordion; collapsed by default (maintenance feature).
   ───────────────────────────────────────────────────────────── */

function InstalledLlmModelsSection() {
  const t = useT();
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

  // Same unified-chevron pattern as the Whisper section above.
  return (
    <Section
      collapsible
      defaultCollapsed
      label={
        <span className="inline-flex items-center gap-2">
          <span>{t.panels.configuration.installedLlmHeader}</span>
          {installed.length > 0 && <CountBadge value={installed.length} />}
        </span>
      }
    >
      <div className="flex flex-col gap-1">
        {installed.length === 0 ? (
          <p className="text-[12px] py-1" style={{ color: tokens.fgMuted }}>
            No LLM models installed. Pick a variant in a Mode&apos;s Processing Model setting to download one.
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
    </Section>
  );
}

/* ─────────────────────────────────────────────────────────────
   Small numeric count badge used inside unified accordion labels.
   Centralized so every section's "N installed" chip looks the same.
   ───────────────────────────────────────────────────────────── */
function CountBadge({ value }: { value: number }) {
  return (
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
      {value}
    </span>
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
   LAST TRANSCRIPTION — controls what happens to each transcript AFTER
   paste (clipboard / cache / neither). Independent of the audio-blob
   storage configured in RecordingsSection below. Lives in its own
   collapsible Section so the help text can be honest about what's
   actually local vs. round-tripped through the server.
   ────────────────────────────────────────────────────────────────── */

interface LastTranscriptionSectionProps {
  settings: AppSettings | undefined;
  onChange: ((patch: Partial<AppSettings>) => Promise<void>) | undefined;
  onNavigate: ((s: SettingsSection) => void) | undefined;
}

function LastTranscriptionSection({
  settings,
  onChange,
  onNavigate,
}: LastTranscriptionSectionProps) {
  const t = useT();
  const recordings: RecordingsSettings = settings?.recordings ?? {
    saveLocal: false,
    retentionDays: 30,
    cacheMode: "cache-only",
  };

  const handleShowRecordings = () => {
    if (!onNavigate) return;
    // Navigate FIRST so HistoryPanel mounts and registers its
    // `ui:blink-recordings` listener; then emit after a 200ms hedge so
    // the listener is in place when the event arrives. Same async-race
    // pattern noted in CLAUDE.md for the useHotkeyEvent hook — Tauri
    // listen() resolves asynchronously, and a 50ms margin can be lost on
    // a cold WebView mount or under memory pressure. 200ms is generous
    // enough to be robust without being perceptibly delayed.
    onNavigate("history");
    setTimeout(() => {
      emit("ui:blink-recordings").catch(() => {});
    }, 200);
  };

  return (
    <Section
      collapsible
      defaultCollapsed
      label={t.panels.configuration.sectionLastTranscription}
      help={t.panels.configuration.sectionLastTranscriptionHelp}
    >
      <Row
        label={t.panels.configuration.cacheModeLabel}
        help={t.panels.configuration.cacheModeHelp}
        control={
          <select
            value={recordings.cacheMode ?? "cache-only"}
            onChange={(e) => {
              const next = e.currentTarget.value as RecordingsSettings["cacheMode"];
              void onChange?.({ recordings: { ...recordings, cacheMode: next } });
            }}
            className="rounded-md text-[12px] px-2 py-1"
            style={{
              background: tokens.control,
              color: tokens.fg,
              border: `1px solid ${tokens.border}`,
            }}
          >
            <option value="auto-copy">{t.panels.configuration.cacheModeAutoCopy}</option>
            <option value="cache-only">{t.panels.configuration.cacheModeCacheOnly}</option>
            <option value="no-cache">{t.panels.configuration.cacheModeNoCache}</option>
          </select>
        }
      />
      {onNavigate && (
        <Row
          label={t.panels.configuration.showRecordingsButton}
          control={
            <Button size="xs" variant="outline" onClick={handleShowRecordings}>
              {t.panels.configuration.showRecordingsButton}
            </Button>
          }
        />
      )}
    </Section>
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
  // Default folder resolved from Rust on mount. Used as the placeholder
  // value in the "Folder" row when the user hasn't picked a custom one,
  // AND as the comparison reference for the "Reset to default" affordance.
  const [defaultFolder, setDefaultFolder] = useState<string>("");
  // Toggle-off prompt: when user flips Save-audio OFF AND there are
  // existing recordings on disk, show a 3-button dialog asking what to
  // do (Delete all + folder / Keep / Cancel). Confirmed by the user
  // 2026-05-11. Without this, an accidental toggle would silently leave
  // possibly-sensitive audio sitting on disk forever.
  const [showToggleOffDialog, setShowToggleOffDialog] = useState(false);

  const recordings: RecordingsSettings = settings?.recordings ?? {
    saveLocal: false,
    retentionDays: 30,
    cacheMode: "cache-only",
  };
  // Pass user-chosen folder to ALL recordings commands. When undefined,
  // Rust resolves to the default; we still pass it here so the
  // refreshStats list-call counts files in the right place.
  const folder = recordings.folder;

  const refreshStats = useCallback(async () => {
    try {
      const files = await listRecordingFiles(folder);
      const bytes = files.reduce((s, f) => s + f.sizeBytes, 0);
      setStats({ count: files.length, bytes });
    } catch (e) {
      console.warn("[Recordings] listRecordingFiles failed:", e);
    }
  }, [folder]);

  useEffect(() => { void refreshStats(); }, [refreshStats]);
  useEffect(() => {
    let unsub: (() => void) | undefined;
    listen("settings:saved", () => { void refreshStats(); }).then((u) => { unsub = u; });
    return () => { unsub?.(); };
  }, [refreshStats]);

  useEffect(() => {
    void recordingsDefaultFolder().then(setDefaultFolder).catch(() => {});
  }, []);

  /**
   * Flip the saveLocal toggle. Notes on architecture (for future me):
   *
   * `recordings.saveLocal` is a POST-TRANSCRIPTION persistence flag, not
   * a recording or transcription gate:
   *   - Recording (MediaRecorder capture during the hotkey press)
   *     happens regardless of this flag.
   *   - Transcription (audio blob → text via cloud worker / local
   *     whisper) happens regardless.
   *   - The flag only controls whether the resulting audio blob is
   *     ALSO persisted to disk after transcription completes, so the
   *     user can replay / re-transcribe / audit it later.
   *
   * Toggling OFF therefore doesn't break anything that's currently
   * happening — recordings continue to transcribe normally, just
   * without the disk-side copy. But existing files on disk persist
   * unless the user explicitly opts to delete them, which is why we
   * prompt below.
   */
  const setSaveLocal = (next: boolean) => {
    if (!next && stats.count > 0) {
      // OFF + files exist → confirm with the user. The dialog primary
      // deletes everything; secondary keeps them on disk; cancel
      // aborts the toggle entirely.
      setShowToggleOffDialog(true);
      return;
    }
    void onChange?.({ recordings: { ...recordings, saveLocal: next } });
  };

  const onToggleOffDeleteAll = async () => {
    setShowToggleOffDialog(false);
    try {
      const files = await listRecordingFiles(folder);
      for (const f of files) {
        await deleteRecordingAudio(f.id, folder);
      }
    } catch (e) {
      console.warn("[Recordings] toggle-off delete failed:", e);
    }
    await onChange?.({ recordings: { ...recordings, saveLocal: false } });
    void refreshStats();
  };

  const onToggleOffKeep = async () => {
    setShowToggleOffDialog(false);
    await onChange?.({ recordings: { ...recordings, saveLocal: false } });
  };
  const setRetention = (days: 0 | 7 | 30 | 90) =>
    onChange?.({ recordings: { ...recordings, retentionDays: days } });

  const onChooseFolder = async () => {
    try {
      const picked = await chooseRecordingsFolder();
      // null = user cancelled the dialog. Don't blank the existing value.
      if (picked) {
        await onChange?.({ recordings: { ...recordings, folder: picked } });
      }
    } catch (e) {
      console.warn("[Recordings] chooseRecordingsFolder failed:", e);
    }
  };

  const onResetFolder = async () => {
    const { folder: _drop, ...rest } = recordings;
    await onChange?.({ recordings: rest });
  };

  const onClearAll = async () => {
    if (!clearConfirming) {
      setClearConfirming(true);
      setTimeout(() => setClearConfirming(false), 4000);
      return;
    }
    setClearConfirming(false);
    try {
      const files = await listRecordingFiles(folder);
      for (const f of files) {
        await deleteRecordingAudio(f.id, folder);
      }
      void refreshStats();
    } catch (e) {
      console.warn("[Recordings] delete-all failed:", e);
    }
  };

  const effectiveFolder = folder ?? defaultFolder;
  const usingDefault = !folder;

  return (
    <>
      <ConfirmDialog
        open={showToggleOffDialog}
        onOpenChange={(open) => {
          // Treat backdrop-click / Esc as Cancel — leave the toggle ON
          // and the files on disk untouched.
          if (!open) setShowToggleOffDialog(false);
        }}
        title={t.panels.configuration.toggleOffTitle}
        body={t.panels.configuration.toggleOffBody(stats.count, formatBytes(stats.bytes))}
        primary={{
          label: t.panels.configuration.toggleOffDelete,
          onClick: onToggleOffDeleteAll,
          variant: "danger",
        }}
        secondary={{
          label: t.panels.configuration.toggleOffKeep,
          onClick: onToggleOffKeep,
        }}
        cancelLabel={t.common.cancel}
      />
    <Section
      label={t.panels.configuration.sectionRecordings}
      help={t.panels.configuration.sectionRecordingsHelp}
      collapsible
      defaultCollapsed
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
          {/* Folder row — full path on top (tilde-collapsed, wraps to a
              second line if long, full string on hover via title=). Open
              folder + Choose folder + Reset buttons in one horizontal row
              below. The previous truncated rtl-ellipsis chopped off the
              important folder-name suffix on long custom paths
              (2026-05-11). */}
          <Row
            label={t.panels.configuration.folderLabel}
            help={
              usingDefault
                ? t.panels.configuration.folderDefaultHelp
                : t.panels.configuration.folderCustomHelp
            }
            control={
              <div className="flex flex-col items-end gap-1.5" style={{ minWidth: 0, maxWidth: 280 }}>
                <span
                  style={{
                    fontSize: 11,
                    color: tokens.fgMuted,
                    fontFamily: "ui-monospace, SFMono-Regular, monospace",
                    textAlign: "right",
                    overflowWrap: "anywhere",
                    wordBreak: "break-all",
                    lineHeight: 1.35,
                  }}
                  title={effectiveFolder}
                >
                  {effectiveFolder.replace(/^\/Users\/[^/]+/, "~")}
                </span>
                <div className="flex items-center gap-1.5">
                  <Button size="xs" variant="outline" onClick={() => void openRecordingsFolder(folder)}>
                    {t.panels.configuration.openFolder}
                  </Button>
                  <Button size="xs" variant="outline" onClick={() => void onChooseFolder()}>
                    {t.panels.configuration.folderChoose}
                  </Button>
                  {!usingDefault && (
                    <Button size="xs" variant="outline" onClick={() => void onResetFolder()}>
                      {t.panels.configuration.folderReset}
                    </Button>
                  )}
                </div>
              </div>
            }
          />
          {/* Retention + disk usage + Delete-all in ONE row. Disk usage is
              rounded to the nearest MB (KB below 1 MB) since the count
              already lives in the Delete-all button right next to it —
              no need to repeat the "across N recordings" suffix. */}
          <Row
            label={t.panels.configuration.autoDeleteAfter}
            control={
              <div className="flex items-center gap-2 flex-wrap justify-end">
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
                <span style={{ fontSize: 11, color: tokens.fgMuted, whiteSpace: "nowrap" }}>
                  {stats.count === 0
                    ? t.panels.configuration.diskUsageEmpty
                    : t.panels.configuration.diskUsageFull(formatBytesRounded(stats.bytes))}
                </span>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => void onClearAll()}
                  style={
                    clearConfirming
                      ? {
                          // Destructive-state visual: warning-tinted background
                          // + matching text so the second tap is unambiguous.
                          background: "color-mix(in srgb, var(--color-warning) 22%, transparent)",
                          color: "var(--color-warning)",
                          borderColor: "color-mix(in srgb, var(--color-warning) 50%, transparent)",
                        }
                      : {}
                  }
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
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────
   LANGUAGE PICKER — horizontal segmented control. Shape mirrors the
   theme picker on the Home panel so the visual language stays
   consistent. Native ⌥-friendly via standard button focus, and the
   active segment uses --color-accent to match the rest of the
   highlight states.

   Locked at the Lang catalog union (en | de | es | sv) so adding new
   languages means: append to LANG_OPTIONS here AND add the
   corresponding entry in catalog.ts + messages.ts. TypeScript fails
   the build if any of the three drifts out of sync.
   ────────────────────────────────────────────────────────────────── */

interface LangOption {
  id: Lang;
  label: string;
}

const LANG_OPTIONS: LangOption[] = [
  { id: "en", label: "English" },
  { id: "de", label: "Deutsch" },
  { id: "es", label: "Español" },
  { id: "sv", label: "Svenska" },
];

function LanguagePicker({
  value,
  onChange,
}: {
  value: Lang;
  onChange: (next: Lang) => void;
}) {
  return (
    <div
      className="inline-flex rounded-md p-0.5"
      style={{ background: tokens.control }}
      role="radiogroup"
    >
      {LANG_OPTIONS.map((opt) => {
        const active = opt.id === value;
        return (
          <button
            key={opt.id}
            role="radio"
            aria-checked={active}
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
