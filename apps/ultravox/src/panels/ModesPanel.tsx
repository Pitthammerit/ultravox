import type { AppSettings } from "../lib/store-bridge";
import { CLEANUP_VARIANTS, LANGUAGES } from "../lib/voiceModes";
import { Card, RadioCard, Section } from "../components/ui";

interface ModesPanelProps {
  settings: AppSettings;
  onChange: (patch: Partial<AppSettings>) => Promise<void>;
}

export default function ModesPanel({ settings, onChange }: ModesPanelProps) {
  return (
    <>
      <Section
        label="Active mode"
        help="Used when no app-specific mode is auto-selected."
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

      <Section
        label="All modes"
        help="Read-only in v1. Full editor lands in v1.1."
      >
        {settings.modes.map((m) => (
          <Card key={m.id}>
            <div className="flex items-baseline justify-between">
              <span className="text-[15px] font-medium text-color-fg">{m.name}</span>
              <span className="text-[11px] text-color-secondary uppercase tracking-wider">
                {m.id}
              </span>
            </div>
            <div className="mt-1.5 grid grid-cols-3 gap-1 text-[12px] text-color-secondary">
              <span>Cleanup: {cleanupLabel(m.cleanup)}</span>
              <span>Lang: {langLabel(m.language)}</span>
              <span>Provider: {m.languageModelProvider}</span>
            </div>
          </Card>
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
