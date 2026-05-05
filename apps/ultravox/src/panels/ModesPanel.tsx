import type { AppSettings } from "../lib/store-bridge";
import { CLEANUP_VARIANTS, LANGUAGES } from "../lib/voiceModes";

interface ModesPanelProps {
  settings: AppSettings;
  onChange: (patch: Partial<AppSettings>) => Promise<void>;
}

/**
 * Read-only mode list in v1 — editing is v1.1+.
 * Active-mode selector lets users switch the default without app restart.
 */
export default function ModesPanel({ settings, onChange }: ModesPanelProps) {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h2 className="typography-h3 text-color-primary">Voice modes</h2>
        <p className="typography-body text-color-secondary">
          A mode controls how your dictation is cleaned up — choose the active default below.
        </p>
      </header>

      <div className="flex flex-col gap-2">
        <div className="typography-label">Active mode</div>
        <div className="flex flex-wrap gap-2">
          {settings.modes.map((m) => {
            const isActive = m.id === settings.activeModeId;
            return (
              <button
                key={m.id}
                onClick={() => onChange({ activeModeId: m.id })}
                className={`px-4 py-2 rounded-full typography-menu-text border transition-colors ${
                  isActive
                    ? "bg-color-primary text-primary-on-dark border-color-primary"
                    : "bg-color-surface text-color-text border-color-ink-15 hover:bg-color-surface-hover"
                }`}
              >
                {m.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="typography-label">All modes (read-only in v1)</div>
        <ul className="flex flex-col gap-2">
          {settings.modes.map((m) => {
            const cleanup = CLEANUP_VARIANTS.find((c) => c.id === m.cleanup);
            const lang = LANGUAGES.find((l) => l.id === m.language);
            return (
              <li
                key={m.id}
                className="rounded-lg border border-color-ink-15 bg-color-surface p-4"
              >
                <div className="flex items-baseline justify-between">
                  <h3 className="typography-h4 text-color-primary">{m.name}</h3>
                  <span className="typography-meta text-color-secondary">{m.id}</span>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 typography-meta text-color-secondary">
                  <span>Cleanup: {cleanup?.label ?? m.cleanup}</span>
                  <span>Language: {lang?.label ?? m.language}</span>
                  <span>Provider: {m.languageModelProvider}</span>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
