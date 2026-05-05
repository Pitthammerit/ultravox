import { useState } from "react";
import type { AppSettings } from "../lib/store-bridge";
import type { VocabularyEntry } from "../lib/store-bridge";

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
    const next = [...settings.vocabulary, { input, replace }];
    await onChange({ vocabulary: next });
    setDraft({ input: "", replace: "" });
  };

  const remove = async (idx: number) => {
    const next = settings.vocabulary.filter((_, i) => i !== idx);
    await onChange({ vocabulary: next });
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h2 className="typography-h3 text-color-primary">Vocabulary</h2>
        <p className="typography-body text-color-secondary">
          Define how Whisper transcribes specific names or jargon. The first column is what
          Whisper hears; the second is what you want pasted.
        </p>
      </header>

      <div className="rounded-lg border border-color-ink-15 bg-color-surface p-4 flex flex-col gap-3">
        <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
          <input
            type="text"
            placeholder="What Whisper hears…"
            value={draft.input}
            onChange={(e) => setDraft({ ...draft, input: e.target.value })}
            className="px-3 py-2 rounded-md border border-color-ink-15 bg-white typography-body"
          />
          <input
            type="text"
            placeholder="What you want pasted…"
            value={draft.replace}
            onChange={(e) => setDraft({ ...draft, replace: e.target.value })}
            className="px-3 py-2 rounded-md border border-color-ink-15 bg-white typography-body"
          />
          <button
            onClick={add}
            disabled={!draft.input.trim()}
            className="px-4 py-2 rounded-md bg-color-primary text-primary-on-dark typography-menu-text disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </div>

      {settings.vocabulary.length === 0 ? (
        <p className="typography-meta text-color-secondary text-center py-8">
          No entries yet. Add your first replacement above.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {settings.vocabulary.map((entry, i) => (
            <li
              key={`${entry.input}-${i}`}
              className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center px-3 py-2 rounded-md border border-color-ink-15 bg-color-surface"
            >
              <span className="typography-body">{entry.input}</span>
              <span className="typography-body text-color-secondary">→ {entry.replace}</span>
              <button
                onClick={() => remove(i)}
                className="px-2 py-1 typography-meta text-color-warning hover:underline"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
