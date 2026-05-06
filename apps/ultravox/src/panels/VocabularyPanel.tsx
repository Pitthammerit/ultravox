import { useState } from "react";
import type { AppSettings, VocabularyEntry } from "../lib/store-bridge";
import { Button, Input, Section, tokens } from "../components/ui";

interface VocabularyPanelProps {
  settings: AppSettings;
  onChange: (patch: Partial<AppSettings>) => Promise<void>;
}

export default function VocabularyPanel({ settings, onChange }: VocabularyPanelProps) {
  const [draft, setDraft] = useState<VocabularyEntry>({ input: "", replace: "" });

  const add = async () => {
    const input = draft.input.trim();
    const replace = draft.replace.trim();
    if (!input) return;
    await onChange({ vocabulary: [...settings.vocabulary, { input, replace }] });
    setDraft({ input: "", replace: "" });
  };

  const remove = async (idx: number) => {
    await onChange({ vocabulary: settings.vocabulary.filter((_, i) => i !== idx) });
  };

  return (
    <>
      <Section
        label="Add entry"
        help="Help Whisper recognize names, acronyms, and jargon. Leave the replacement blank to bias spelling without rewriting."
      >
        <div className="flex items-center gap-1.5">
          <Input
            value={draft.input}
            onChange={(v) => setDraft({ ...draft, input: v })}
            placeholder="Word or phrase…"
            autoFocus
          />
          <Input
            value={draft.replace}
            onChange={(v) => setDraft({ ...draft, replace: v })}
            placeholder="Replace with… (optional)"
          />
          <Button
            onClick={add}
            disabled={!draft.input.trim()}
            size="xs"
            variant="primary"
          >
            Add
          </Button>
        </div>
      </Section>

      <Section label={`Entries (${settings.vocabulary.length})`}>
        {settings.vocabulary.length === 0 ? (
          <p
            className="text-[11.5px] italic px-1"
            style={{ color: tokens.fgSubtle }}
          >
            No entries yet.
          </p>
        ) : (
          <div className="flex flex-col gap-0.5">
            {settings.vocabulary.map((entry, i) => (
              <div
                key={`${entry.input}-${i}`}
                className="flex items-center gap-2 px-3 py-1 rounded-md"
                style={{
                  background: tokens.card,
                  border: `1px solid ${tokens.border}`,
                }}
              >
                <span
                  className="text-[12.5px] truncate"
                  style={{ color: tokens.fg }}
                >
                  {entry.input}
                </span>
                {entry.replace && (
                  <>
                    <span style={{ color: tokens.fgSubtle }}>→</span>
                    <span
                      className="text-[12.5px] truncate"
                      style={{ color: tokens.fgMuted }}
                    >
                      {entry.replace}
                    </span>
                  </>
                )}
                <button
                  onClick={() => remove(i)}
                  aria-label="Remove"
                  className="text-[14px] leading-none px-1 hover:opacity-100 opacity-60 ml-auto"
                  style={{ color: tokens.fgMuted }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}
