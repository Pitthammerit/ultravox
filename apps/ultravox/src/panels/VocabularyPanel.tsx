import { useState } from "react";
import type { AppSettings, VocabularyEntry } from "../lib/store-bridge";
import { Button, Input, Section, SectionLabel, tokens } from "../components/ui";

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
      <p
        className="text-[12.5px] leading-relaxed"
        style={{ color: tokens.fgMuted }}
      >
        Help Whisper recognize names, acronyms, and jargon. Add a replacement to
        fix consistent mis-transcriptions.
      </p>

      <div
        className="flex flex-col gap-2 rounded-lg p-3"
        style={{ background: tokens.card, border: `1px solid ${tokens.border}` }}
      >
        <Input
          value={draft.input}
          onChange={(v) => setDraft({ ...draft, input: v })}
          placeholder="New word or phrase…"
          autoFocus
        />
        {showReplace && (
          <Input
            value={draft.replace}
            onChange={(v) => setDraft({ ...draft, replace: v })}
            placeholder="Replace with…"
          />
        )}
        <div className="flex items-center justify-between gap-2 pt-0.5">
          {!showReplace ? (
            <Button variant="ghost" size="xs" onClick={() => setShowReplace(true)}>
              + Replace with…
            </Button>
          ) : (
            <span />
          )}
          <Button onClick={add} disabled={!draft.input.trim()} size="xs" variant="primary">
            Add
          </Button>
        </div>
      </div>

      <Section label={`Entries (${settings.vocabulary.length})`}>
        {settings.vocabulary.length === 0 ? (
          <p
            className="text-[12.5px] italic"
            style={{ color: tokens.fgSubtle }}
          >
            No entries yet — add a name above to bias Whisper.
          </p>
        ) : (
          settings.vocabulary.map((entry, i) => (
            <div
              key={`${entry.input}-${i}`}
              className="flex items-center justify-between gap-2 px-3 py-2 rounded-md"
              style={{
                background: tokens.card,
                border: `1px solid ${tokens.border}`,
              }}
            >
              <div className="flex flex-col min-w-0">
                <span
                  className="text-[12.5px] truncate"
                  style={{ color: tokens.fg }}
                >
                  {entry.input}
                </span>
                {entry.replace && (
                  <span
                    className="text-[11.5px] truncate"
                    style={{ color: tokens.fgMuted }}
                  >
                    → {entry.replace}
                  </span>
                )}
              </div>
              <button
                onClick={() => remove(i)}
                aria-label="Remove"
                className="text-[15px] leading-none px-1 hover:opacity-100 opacity-60"
                style={{ color: tokens.fgMuted }}
              >
                ×
              </button>
            </div>
          ))
        )}
      </Section>

      <SectionLabel>Tip</SectionLabel>
      <p
        className="text-[11.5px] leading-relaxed -mt-1"
        style={{ color: tokens.fgSubtle }}
      >
        Leave the replacement blank to bias Whisper toward a spelling without
        rewriting the text.
      </p>
    </>
  );
}
