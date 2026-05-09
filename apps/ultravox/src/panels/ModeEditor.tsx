import { useEffect, useRef, useState } from "react";
import type { AppSettings } from "../lib/store-bridge";
import {
  CLEANUP_VARIANTS,
  LANGUAGES,
  LANGUAGE_MODELS,
  LANGUAGE_MODEL_PROVIDERS,
  type LanguageModelProvider,
  type VoiceCleanup,
  type VoiceMode,
} from "../lib/voiceModes";
import { defaultTemplateFor, PROMPT_VARIABLES } from "../lib/cleanupTemplates";
import { slugify, uniqueSlug, isValidSlug } from "../lib/slug";
import {
  Button,
  Field,
  Group,
  Input,
  Segmented,
  Select,
  Textarea,
  tokens,
} from "../components/ui";
import { MODE_ICON_NAMES, ModeGlyph } from "../components/ModeIcons";
import { TranscriptionModelPicker, useTranscriptionModelPicker } from "../components/TranscriptionModelPicker";
import { LocalLLMPicker, useLocalLLMPicker } from "../components/LocalLLMPicker";
import type { TranscriptionModelValue } from "../lib/voiceModes";

interface ModeFormProps {
  settings: AppSettings;
  modeId: string;
  /**
   * Optional seed for the editor's initial draft state. Used by the duplicate
   * flow (modeId === "__duplicate__") to prefill the form with a copy of an
   * existing mode without persisting anything to settings.modes until the
   * user clicks Save. Same draft semantics as the "+ New mode" flow.
   */
  seedDraft?: VoiceMode | null;
  onChange: (patch: Partial<AppSettings>) => Promise<void>;
  onDirtyChange?: (dirty: boolean) => void;
  saveRef?: React.MutableRefObject<(() => Promise<void>) | null>;
}

function makeBlankMode(): VoiceMode {
  return {
    id: `custom-${crypto.randomUUID().slice(0, 8)}`,
    name: "New mode",
    voiceModel: "whisper-large-v3-turbo",
    language: "auto",
    cleanup: "prose",
    languageModelProvider: "openrouter",
    languageModel: "anthropic/claude-haiku-4.5",
    transcriptionModel: "auto",
    autocapitalize: true,
    insertion: "paste",
  };
}

export default function ModeForm({ settings, modeId, seedDraft, onChange, onDirtyChange, saveRef }: ModeFormProps) {
  const isNew = modeId === "__new__" || modeId === "__duplicate__";
  const isDuplicate = modeId === "__duplicate__";
  const original = isDuplicate
    ? (seedDraft ?? makeBlankMode())
    : (settings.modes.find((m) => m.id === modeId) ?? makeBlankMode());

  const [draft, setDraft] = useState<VoiceMode>(original);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const transcriptionPicker = useTranscriptionModelPicker();
  const llmPicker = useLocalLLMPicker();
  // For new modes only: tracks whether the user has manually edited the slug.
  // While untouched, the slug field auto-syncs from the name; once touched,
  // it stays as the user typed. Clearing the field resets to untouched.
  // For duplicate, pre-mark as touched=false so the slug auto-syncs from the
  // "X copy" name on first render.
  const [slugTouched, setSlugTouched] = useState(false);
  // Live-edited slug for new modes. For existing modes the slug is locked
  // (draft.id is read-only) and this isn't shown.
  const [slugInput, setSlugInput] = useState(isNew ? "" : original.id);

  useEffect(() => {
    setDraft(original);
    setConfirmingDelete(false);
    setSlugTouched(false);
    setSlugInput(isNew ? "" : original.id);
    // Re-init when modeId changes OR when the duplicate seed changes — clicking
    // Duplicate on a different row swaps seedDraft.id without modeId changing
    // (it stays "__duplicate__"), so we must depend on the seed id too.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modeId, seedDraft?.id]);

  // Auto-derive slug from name while the user hasn't touched the slug field.
  useEffect(() => {
    if (!isNew) return;
    if (slugTouched) return;
    setSlugInput(slugify(draft.name));
  }, [draft.name, isNew, slugTouched]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(original);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const usesCleanup =
    draft.cleanup !== "raw" && draft.languageModelProvider !== "none";
  const providerModels = LANGUAGE_MODELS[draft.languageModelProvider] ?? [];

  // Slug-field validation only applies to new modes (existing modes are locked).
  const slugCollision = isNew &&
    slugInput.length > 0 &&
    settings.modes.some((m) => m.id === slugInput);
  const slugInvalid = isNew &&
    slugInput.length > 0 &&
    !isValidSlug(slugInput);

  const save = async () => {
    if (!draft.name.trim()) return;

    let finalDraft = draft;
    if (isNew) {
      // Pick the slug: user-typed input takes priority; fall back to auto-
      // derived from the name; final fallback is the temp UUID. uniqueSlug
      // ensures we don't collide with an existing mode id.
      const userOrAuto = slugInput.trim() || slugify(draft.name);
      const candidate = isValidSlug(userOrAuto) ? userOrAuto : draft.id;
      const finalId = uniqueSlug(candidate, settings.modes.map((m) => m.id));
      finalDraft = { ...draft, id: finalId };
    }

    const exists = settings.modes.some((m) => m.id === finalDraft.id);
    const next = exists
      ? settings.modes.map((m) => (m.id === finalDraft.id ? finalDraft : m))
      : [...settings.modes, finalDraft];
    const patch: Partial<AppSettings> = { modes: next };
    if (!exists) patch.activeModeId = finalDraft.id;
    await onChange(patch);
  };

  // Keep saveRef pointing at the latest save closure so ModesPanel can call
  // it without stale captures.
  if (saveRef) saveRef.current = save;

  const remove = async () => {
    if (isNew) {
      await onChange({ activeModeId: settings.modes[0]!.id });
      return;
    }
    if (settings.modes.length <= 1) return;
    setConfirmingDelete(true);
  };

  const confirmDelete = async () => {
    const next = settings.modes.filter((m) => m.id !== draft.id);
    const patch: Partial<AppSettings> = { modes: next };
    if (settings.activeModeId === draft.id) patch.activeModeId = next[0]!.id;
    await onChange(patch);
  };

  const handleIconChange = (icon: string | null) => {
    if (icon === null) {
      const { icon: _drop, ...rest } = draft;
      void _drop;
      setDraft(rest as VoiceMode);
    } else {
      setDraft({ ...draft, icon });
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Group>
        <div className="flex items-center gap-2 py-1">
          <IconPicker
            value={draft.icon ?? null}
            onChange={handleIconChange}
          />
          <Input
            value={draft.name}
            onChange={(name) => setDraft({ ...draft, name })}
          />
          {isNew ? (
            <SlugInput
              value={slugInput}
              onChange={(v) => {
                if (v === "") {
                  // Empty field → resume auto-syncing from name.
                  setSlugTouched(false);
                  setSlugInput(slugify(draft.name));
                } else {
                  setSlugTouched(true);
                  // Normalize as the user types so the field always shows a
                  // valid slug (uppercase → lowercase, spaces → -, etc.).
                  setSlugInput(slugify(v));
                }
              }}
              invalid={slugInvalid}
              collision={slugCollision}
            />
          ) : (
            <span
              title="Mode ID — frozen on first save, never changes"
              className="text-[11px] font-mono px-2 py-1 rounded shrink-0"
              style={{ background: tokens.control, color: tokens.fgMuted }}
            >
              {draft.id}
            </span>
          )}
        </div>
      </Group>

      <Group>
        <Field
          label="Style"
          help={CLEANUP_VARIANTS.find((c) => c.id === draft.cleanup)?.description}
          control={
            <Segmented<VoiceCleanup>
              options={CLEANUP_VARIANTS.map((c) => ({
                id: c.id,
                label: c.label,
              }))}
              value={draft.cleanup}
              onChange={(cleanup) => setDraft({ ...draft, cleanup })}
            />
          }
        />
        {(settings.localWhisperEnabled ?? true) && (
          <Field
            label="Transcription"
            help="Which Whisper variant runs transcription for this mode. Auto smart-routes based on language."
            control={
              <TranscriptionModelPicker
                value={(draft.transcriptionModel ?? "auto") as TranscriptionModelValue}
                onChange={(transcriptionModel) => setDraft({ ...draft, transcriptionModel })}
                installedModels={transcriptionPicker.installedModels}
                downloadProgress={transcriptionPicker.downloadProgress}
                onDownload={transcriptionPicker.handleDownload}
                onDelete={transcriptionPicker.handleDelete}
                removeConfirming={transcriptionPicker.removeConfirming}
                onRemoveRequest={transcriptionPicker.handleRemoveRequest}
              />
            }
          />
        )}
        {draft.cleanup !== "raw" && (
          <Field
            label="Processing Provider"
            help="Cleanup LLM provider"
            control={
              <Select<LanguageModelProvider>
                value={draft.languageModelProvider}
                onChange={(languageModelProvider) =>
                  setDraft({
                    ...draft,
                    languageModelProvider,
                    languageModel:
                      LANGUAGE_MODELS[languageModelProvider]?.[0]?.id ?? null,
                  })
                }
                options={LANGUAGE_MODEL_PROVIDERS.map((p) => ({
                  id: p.id,
                  label: p.label,
                }))}
              />
            }
          />
        )}
        {usesCleanup && providerModels.length > 0 && (
          <Field
            label="Processing AI Model"
            control={
              draft.languageModelProvider === "local" ? (
                <LocalLLMPicker
                  value={draft.languageModel ?? "auto"}
                  onChange={(languageModel) => setDraft({ ...draft, languageModel })}
                  installedModels={llmPicker.installedModels}
                  downloadProgress={llmPicker.downloadProgress}
                  onDownload={llmPicker.handleDownload}
                  onDelete={llmPicker.handleDelete}
                  removeConfirming={llmPicker.removeConfirming}
                  onRemoveRequest={llmPicker.handleRemoveRequest}
                />
              ) : (
                <Select<string>
                  value={draft.languageModel ?? providerModels[0]!.id}
                  onChange={(languageModel) =>
                    setDraft({ ...draft, languageModel })
                  }
                  options={providerModels.map((m) => ({
                    id: m.id,
                    label: m.label,
                  }))}
                />
              )
            }
          />
        )}
        <Field
          label="Language"
          control={
            <Select<string>
              value={draft.language}
              onChange={(language) => setDraft({ ...draft, language })}
              options={LANGUAGES.map((l) => ({ id: l.id, label: l.label }))}
            />
          }
        />
        <Field
          label="Auto-capitalize"
          help="Server-side capitalize after punctuation"
          control={
            <input
              type="checkbox"
              checked={!!draft.autocapitalize}
              onChange={(e) =>
                setDraft({ ...draft, autocapitalize: e.currentTarget.checked })
              }
              style={{ accentColor: tokens.fg, width: 18, height: 18, cursor: "pointer" }}
            />
          }
        />
      </Group>

      {usesCleanup && (
        <CleanupPromptEditor
          cleanup={draft.cleanup}
          value={draft.systemPrompt ?? null}
          onChange={(systemPrompt) =>
            setDraft({ ...draft, systemPrompt: systemPrompt && systemPrompt.length > 0 ? systemPrompt : null })
          }
        />
      )}

      {confirmingDelete ? (
        <div className="flex items-center justify-between gap-2 pt-1">
          <span className="text-[12px]" style={{ color: tokens.fgMuted }}>
            Delete &ldquo;{draft.name}&rdquo;?
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="xs" onClick={() => setConfirmingDelete(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="xs" onClick={confirmDelete}
              style={{ background: tokens.warning, color: "#fff" }}>
              Delete
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2 pt-1">
          <Button variant="ghost" size="xs" onClick={remove}>
            {isNew ? "Cancel" : "Delete"}
          </Button>
          <Button
            variant="primary"
            size="xs"
            disabled={!dirty || !draft.name.trim()}
            onClick={save}
          >
            Save
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Editable cleanup-prompt textarea. Seeded from the per-style default template;
 * tracks whether the user has diverged so we can offer "Reset to default".
 *
 * The ANTI_CHAT_PREAMBLE safety frame is NOT shown here — it's prepended
 * server-side on every request and not user-editable.
 */
function CleanupPromptEditor({
  cleanup,
  value,
  onChange,
}: {
  cleanup: VoiceCleanup;
  value: string | null;
  onChange: (next: string | null) => void;
}) {
  const defaultText = defaultTemplateFor(cleanup);
  const effective = value ?? defaultText;
  const isModified = value != null && value !== defaultText;
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const insertVariable = (name: string) => {
    const ta = textareaRef.current;
    const placeholder = `{{${name}}}`;
    const current = effective;
    if (!ta) {
      onChange(current + placeholder);
      return;
    }
    const start = ta.selectionStart ?? current.length;
    const end = ta.selectionEnd ?? current.length;
    const next = current.slice(0, start) + placeholder + current.slice(end);
    onChange(next);
    // restore cursor after the inserted placeholder on next paint
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + placeholder.length;
      ta.setSelectionRange(pos, pos);
    });
  };

  const reset = () => onChange(null);

  return (
    <div>
      <div className="flex items-center justify-between mb-1 px-1">
        <div
          className="text-[10.5px] uppercase tracking-[0.14em] font-medium"
          style={{ color: tokens.fgMuted }}
        >
          Cleanup instructions
        </div>
        <div className="flex items-center gap-2">
          {isModified && (
            <span
              className="text-[10.5px] font-medium"
              style={{ color: "var(--color-warning)" }}
              title="You've edited this from the default. Click Reset to restore."
            >
              Modified
            </span>
          )}
          {isModified && (
            <button
              type="button"
              onClick={reset}
              className="text-[11px] underline"
              style={{ color: tokens.fgMuted }}
            >
              Reset to default
            </button>
          )}
        </div>
      </div>
      <Textarea
        ref={textareaRef}
        value={effective}
        onChange={(next) => onChange(next === defaultText ? null : next)}
        placeholder="Describe how the AI should clean up your dictated text…"
        rows={10}
      />
      <div className="flex items-center flex-wrap gap-1.5 mt-1.5 px-1">
        <span className="text-[10.5px]" style={{ color: tokens.fgSubtle }}>
          Insert variable:
        </span>
        {PROMPT_VARIABLES.map((v) => (
          <button
            key={v.name}
            type="button"
            onClick={() => insertVariable(v.name)}
            title={`${v.description} — e.g. "${v.example}"`}
            className="font-mono text-[10.5px] px-1.5 py-0.5 rounded transition-colors"
            style={{
              background: tokens.control,
              border: `1px solid ${tokens.border}`,
              color: tokens.fg,
            }}
          >
            {`{{${v.name}}}`}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Slug field shown only when creating a new mode. Mono font + small to match
 * the read-only chip used for saved modes. Auto-syncs from the name input
 * unless the user manually edits it. Once the mode is saved, this field is
 * replaced by the read-only chip — the slug is frozen forever.
 */
function SlugInput({
  value,
  onChange,
  invalid,
  collision,
}: {
  value: string;
  onChange: (next: string) => void;
  invalid: boolean;
  collision: boolean;
}) {
  const error = invalid || collision;
  return (
    <div className="flex flex-col items-end shrink-0" style={{ minWidth: 140 }}>
      <input
        type="text"
        value={value}
        placeholder="auto"
        onChange={(e) => onChange(e.target.value)}
        title="Mode slug — auto-derived from the name. Click here to edit. Locked once saved."
        className="text-[11px] font-mono rounded transition-colors focus:outline-none"
        style={{
          background: tokens.control,
          color: tokens.fgMuted,
          border: `1px solid ${error ? "var(--color-warning)" : tokens.border}`,
          padding: "4px 8px",
          width: 140,
        }}
      />
      {collision && (
        <span className="text-[10px] mt-0.5" style={{ color: "var(--color-warning)" }}>
          already used — will dedupe on save
        </span>
      )}
    </div>
  );
}

function IconPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (icon: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center justify-center rounded transition-colors"
        style={{
          width: 28,
          height: 28,
          background: tokens.control,
          border: `1px solid ${tokens.border}`,
          color: tokens.fg,
        }}
        title="Pick icon"
      >
        {value ? (
          <ModeGlyph name={value} size={15} strokeWidth={1.8} />
        ) : (
          <span style={{ color: tokens.fgSubtle, fontSize: 14 }}>○</span>
        )}
      </button>
      {open && (
        <div
          className="absolute z-30 mt-1 grid gap-1 p-1.5 rounded-md"
          style={{
            top: "100%",
            left: 0,
            gridTemplateColumns: "repeat(8, 1fr)",
            background: tokens.card,
            border: `1px solid ${tokens.borderStrong}`,
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            width: 280,
          }}
        >
          {MODE_ICON_NAMES.map((name) => {
            const active = value === name;
            return (
              <button
                key={name}
                type="button"
                onClick={() => {
                  onChange(active ? null : name);
                  setOpen(false);
                }}
                title={name}
                className="inline-flex items-center justify-center rounded transition-colors"
                style={{
                  width: 28,
                  height: 28,
                  background: active
                    ? "var(--color-primary, #224160)"
                    : "transparent",
                  color: active ? "#fff" : tokens.fg,
                }}
              >
                <ModeGlyph name={name} size={15} strokeWidth={1.8} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
