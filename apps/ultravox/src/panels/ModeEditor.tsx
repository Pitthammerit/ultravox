import { useState } from "react";
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
  Input,
  Row,
  Section,
  Select,
  Segmented,
  Textarea,
  ToggleRow,
  tokens,
} from "../components/ui";

interface ModeEditorProps {
  settings: AppSettings;
  /** mode id being edited, or "__new__" for a fresh draft. */
  modeId: string;
  onChange: (patch: Partial<AppSettings>) => Promise<void>;
  onClose: () => void;
}

function makeBlankMode(): VoiceMode {
  return {
    id: `custom-${crypto.randomUUID().slice(0, 8)}`,
    name: "New mode",
    voiceModel: "whisper-large-v3-turbo",
    language: "auto",
    cleanup: "prose",
    languageModelProvider: "openrouter",
    languageModel: "anthropic/claude-haiku-4-5-20251001",
    autocapitalize: true,
    insertion: "paste",
  };
}

export default function ModeEditor({ settings, modeId, onChange, onClose }: ModeEditorProps) {
  const isNew = modeId === "__new__";
  const original = isNew
    ? makeBlankMode()
    : settings.modes.find((m) => m.id === modeId) ?? makeBlankMode();

  const [draft, setDraft] = useState<VoiceMode>(original);

  const dirty = JSON.stringify(draft) !== JSON.stringify(original);
  const usesCleanup = draft.cleanup !== "raw" && draft.languageModelProvider !== "none";
  const providerModels = LANGUAGE_MODELS[draft.languageModelProvider] ?? [];

  const save = async () => {
    if (!draft.name.trim()) return;
    const exists = settings.modes.some((m) => m.id === draft.id);
    const next = exists
      ? settings.modes.map((m) => (m.id === draft.id ? draft : m))
      : [...settings.modes, draft];
    await onChange({ modes: next });
    onClose();
  };

  const remove = async () => {
    if (isNew) {
      onClose();
      return;
    }
    if (settings.modes.length <= 1) {
      alert("Can't delete the last mode.");
      return;
    }
    if (!confirm(`Delete the "${draft.name}" mode?`)) return;
    const next = settings.modes.filter((m) => m.id !== draft.id);
    const patch: Partial<AppSettings> = { modes: next };
    if (settings.activeModeId === draft.id) patch.activeModeId = next[0]!.id;
    await onChange(patch);
    onClose();
  };

  return (
    <>
      <Section label="Identity">
        <Row label="Name" control={<Input value={draft.name} onChange={(name) => setDraft({ ...draft, name })} />} />
        <Row
          label="ID"
          description={isNew ? "Auto-generated" : "Read-only"}
          control={
            <span className="text-[12px] font-mono px-2 py-1 rounded" style={{ background: tokens.control, color: tokens.fgMuted }}>
              {draft.id}
            </span>
          }
        />
      </Section>

      <Section label="Cleanup">
        <Row
          label="Style"
          control={
            <Segmented<VoiceCleanup>
              options={CLEANUP_VARIANTS.map((c) => ({ id: c.id, label: c.label }))}
              value={draft.cleanup}
              onChange={(cleanup) => setDraft({ ...draft, cleanup })}
            />
          }
        />
        <p className="text-[11.5px] -mt-0.5 px-1" style={{ color: tokens.fgMuted }}>
          {CLEANUP_VARIANTS.find((c) => c.id === draft.cleanup)?.description}
        </p>
      </Section>

      <Section label="Language model" help={usesCleanup ? "Used to clean up the raw transcript." : "Cleanup is disabled — raw Whisper output is used."}>
        <Row
          label="Provider"
          control={
            <Select<LanguageModelProvider>
              value={draft.languageModelProvider}
              onChange={(languageModelProvider) =>
                setDraft({
                  ...draft,
                  languageModelProvider,
                  languageModel: LANGUAGE_MODELS[languageModelProvider]?.[0]?.id ?? null,
                })
              }
              options={LANGUAGE_MODEL_PROVIDERS.map((p) => ({ id: p.id, label: p.label }))}
            />
          }
        />
        {usesCleanup && providerModels.length > 0 && (
          <Row
            label="Model"
            control={
              <Select<string>
                value={draft.languageModel ?? providerModels[0]!.id}
                onChange={(languageModel) => setDraft({ ...draft, languageModel })}
                options={providerModels.map((m) => ({ id: m.id, label: m.label }))}
              />
            }
          />
        )}
      </Section>

      <Section label="Transcription">
        <Row
          label="Language"
          control={
            <Select<string>
              value={draft.language}
              onChange={(language) => setDraft({ ...draft, language })}
              options={LANGUAGES.map((l) => ({ id: l.id, label: l.label }))}
            />
          }
        />
        <ToggleRow
          label="Auto-capitalize"
          description="Server-side capitalize after punctuation"
          checked={!!draft.autocapitalize}
          onChange={(autocapitalize) => setDraft({ ...draft, autocapitalize })}
        />
      </Section>

      {usesCleanup && (
        <Section label="Custom prompt" help="Appended to the system prompt for this mode.">
          <Textarea
            value={draft.promptSuffix ?? ""}
            onChange={(promptSuffix) =>
              setDraft({ ...draft, promptSuffix: promptSuffix || null })
            }
            placeholder="e.g. Use British spelling. Avoid contractions."
            rows={3}
          />
        </Section>
      )}

      <div className="flex items-center justify-between gap-2 pt-3 mt-1 border-t" style={{ borderColor: tokens.border }}>
        <Button variant="ghost" size="xs" onClick={remove}>
          {isNew ? "Cancel" : "Delete"}
        </Button>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="xs" onClick={onClose}>
            {dirty ? "Discard" : "Close"}
          </Button>
          <Button variant="primary" size="xs" disabled={!dirty || !draft.name.trim()} onClick={save}>
            Save
          </Button>
        </div>
      </div>
    </>
  );
}
