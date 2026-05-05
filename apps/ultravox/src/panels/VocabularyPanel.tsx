import { useState } from "react";
import type { AppSettings, VocabularyEntry } from "../lib/store-bridge";
import { Description, Input, PillButton, Section, SectionLabel } from "../components/ui";

interface VocabularyPanelProps {
  settings: AppSettings;
  onChange: (patch: Partial<AppSettings>) => Promise<void>;
}

export default function VocabularyPanel({ settings, onChange }: VocabularyPanelProps) {
  const [draft, setDraft] = useState<VocabularyEntry>({ input: "", replace: "" });
  const [showReplace, setShowReplace] = useState(false);

  const add = async () => {
    const input = draft.input.trim();
    const replace = draft.replace.trim();
    if (!input) return;
    await onChange({ vocabulary: [...settings.vocabulary, { input, replace }] });
    setDraft({ input: "", replace: "" });
    setShowReplace(false);
  };

  const remove = async (idx: number) => {
    await onChange({ vocabulary: settings.vocabulary.filter((_, i) => i !== idx) });
  };

  return (
    <>
      <Description>
        Help Whisper recognize people's names, company names, acronyms, slang, or
        words from other languages. Add a replacement to fix consistent
        mis-transcriptions.
      </Description>

      <div className="rounded-xl border border-color-divider-on-dark/40 bg-color-surface p-3 flex flex-col gap-2">
        <Input
          value={draft.input}
          onChange={(v) => setDraft({ ...draft, input: v })}
          placeholder="New word or phrase…"
        />
        {showReplace && (
          <Input
            value={draft.replace}
            onChange={(v) => setDraft({ ...draft, replace: v })}
            placeholder="Replace with…"
          />
        )}
        <div className="flex items-center justify-between gap-2 pt-1">
          {!showReplace ? (
            <PillButton variant="outline" size="sm" onClick={() => setShowReplace(true)}>
              + Replace with…
            </PillButton>
          ) : (
            <span />
          )}
          <PillButton onClick={add} disabled={!draft.input.trim()} size="sm">
            + Add to vocabulary
          </PillButton>
        </div>
      </div>

      <Section label={`Entries (${settings.vocabulary.length})`}>
        {settings.vocabulary.length === 0 ? (
          <p className="text-[13px] italic text-color-secondary">
            No entries yet — add a name above to bias Whisper.
          </p>
        ) : (
          settings.vocabulary.map((entry, i) => (
            <div
              key={`${entry.input}-${i}`}
              className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-color-divider-on-dark/40 bg-color-surface"
            >
              <div className="flex flex-col min-w-0">
                <span className="text-[13px] text-color-fg truncate">{entry.input}</span>
                {entry.replace && (
                  <span className="text-[12px] text-color-secondary truncate">
                    → {entry.replace}
                  </span>
                )}
              </div>
              <button
                onClick={() => remove(i)}
                aria-label="Remove"
                className="text-color-secondary hover:text-color-warning text-[16px] leading-none"
              >
                ×
              </button>
            </div>
          ))
        )}
      </Section>

      <SectionLabel>Tip</SectionLabel>
      <p className="text-[12px] text-color-secondary leading-relaxed -mt-1">
        Leave the replacement blank to only bias Whisper toward a specific
        spelling without rewriting the text.
      </p>
    </>
  );
}
