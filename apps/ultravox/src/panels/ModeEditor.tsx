import { useEffect, useState } from "react";
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

interface ModeFormProps {
  settings: AppSettings;
  modeId: string;
  onChange: (patch: Partial<AppSettings>) => Promise<void>;
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
    autocapitalize: true,
    insertion: "paste",
  };
}

export default function ModeForm({ settings, modeId, onChange }: ModeFormProps) {
  const isNew = modeId === "__new__";
  const original =
    settings.modes.find((m) => m.id === modeId) ?? makeBlankMode();

  const [draft, setDraft] = useState<VoiceMode>(original);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    setDraft(original);
    setConfirmingDelete(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modeId]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(original);
  const usesCleanup =
    draft.cleanup !== "raw" && draft.languageModelProvider !== "none";
  const providerModels = LANGUAGE_MODELS[draft.languageModelProvider] ?? [];

  const save = async () => {
    if (!draft.name.trim()) return;
    const exists = settings.modes.some((m) => m.id === draft.id);
    const next = exists
      ? settings.modes.map((m) => (m.id === draft.id ? draft : m))
      : [...settings.modes, draft];
    const patch: Partial<AppSettings> = { modes: next };
    if (!exists) patch.activeModeId = draft.id;
    await onChange(patch);
  };

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
          <span
            title="Mode ID (read-only)"
            className="text-[11px] font-mono px-2 py-1 rounded shrink-0"
            style={{ background: tokens.control, color: tokens.fgMuted }}
          >
            {draft.id}
          </span>
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
        {draft.cleanup !== "raw" && (
          <Field
            label="Provider"
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
            label="Model"
            control={
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
        <div>
          <div
            className="text-[10.5px] uppercase tracking-[0.14em] font-medium mb-1 px-1"
            style={{ color: tokens.fgMuted }}
          >
            Custom prompt
          </div>
          <Textarea
            value={draft.promptSuffix ?? ""}
            onChange={(promptSuffix) =>
              setDraft({ ...draft, promptSuffix: promptSuffix || null })
            }
            placeholder="e.g. Use British spelling. Avoid contractions."
            rows={3}
          />
        </div>
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
