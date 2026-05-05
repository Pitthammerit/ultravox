import type { AppSettings } from "../lib/store-bridge";
import { CLEANUP_VARIANTS, LANGUAGES } from "../lib/voiceModes";
import { RadioCard, Section, tokens } from "../components/ui";

interface ModesPanelProps {
  settings: AppSettings;
  onChange: (patch: Partial<AppSettings>) => Promise<void>;
}

export default function ModesPanel({ settings, onChange }: ModesPanelProps) {
  return (
    <>
      <Section
        label="Active mode"
        help="Used when no app-specific mode is auto-picked."
      >
        {settings.modes.map((m) => (
          <RadioCard
            key={m.id}
            title={m.name}
            subtitle={`${cleanupLabel(m.cleanup)} · ${langLabel(m.language)}`}
            selected={m.id === settings.activeModeId}
            onClick={() => onChange({ activeModeId: m.id })}
          />
        ))}
      </Section>

      <Section label="All modes" help="Read-only in v1. Editor lands in v1.1.">
        {settings.modes.map((m) => (
          <div
            key={m.id}
            className="px-3.5 py-2.5 rounded-lg"
            style={{
              background: tokens.card,
              border: `1px solid ${tokens.border}`,
            }}
          >
            <div className="flex items-baseline justify-between">
              <span
                className="text-[13.5px] font-medium"
                style={{ color: tokens.fg }}
              >
                {m.name}
              </span>
              <span
                className="text-[10px] uppercase tracking-[0.14em] font-medium"
                style={{ color: tokens.fgSubtle }}
              >
                {m.id}
              </span>
            </div>
            <div
              className="mt-1 grid grid-cols-3 gap-1 text-[11.5px]"
              style={{ color: tokens.fgMuted }}
            >
              <span>{cleanupLabel(m.cleanup)}</span>
              <span>{langLabel(m.language)}</span>
              <span>{m.languageModelProvider}</span>
            </div>
          </div>
        ))}
      </Section>
    </>
  );
}

function cleanupLabel(id: string): string {
  return CLEANUP_VARIANTS.find((c) => c.id === id)?.label ?? id;
}

function langLabel(id: string): string {
  return LANGUAGES.find((l) => l.id === id)?.label ?? id;
}
