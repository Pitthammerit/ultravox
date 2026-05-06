import type { AppSettings } from "../lib/store-bridge";
import { CLEANUP_VARIANTS, LANGUAGES } from "../lib/voiceModes";
import { Button, Section, tokens } from "../components/ui";
import ModeForm from "./ModeEditor";

interface ModesPanelProps {
  settings: AppSettings;
  onChange: (patch: Partial<AppSettings>) => Promise<void>;
}

export default function ModesPanel({ settings, onChange }: ModesPanelProps) {
  const activeId = settings.activeModeId;
  const activeMode =
    settings.modes.find((m) => m.id === activeId) ?? settings.modes[0]!;

  return (
    <>
      <Section
        label="Active mode"
        right={
          <Button size="xs" variant="outline" onClick={() => onChange({ activeModeId: "__new__" })}>
            + New
          </Button>
        }
      >
        <div className="flex flex-col gap-1">
          {settings.modes.map((m) => {
            const selected = m.id === activeId;
            return (
              <button
                key={m.id}
                onClick={() => onChange({ activeModeId: m.id })}
                className="flex items-center gap-2 w-full text-left px-3 py-1.5 rounded-lg transition-colors hover:bg-[var(--s-card-hover)]"
                style={{
                  background: tokens.card,
                  border: `1px solid ${selected ? tokens.fg : tokens.border}`,
                }}
              >
                <span
                  className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full shrink-0"
                  style={{
                    border: `1.5px solid ${selected ? tokens.fg : tokens.borderStrong}`,
                  }}
                >
                  {selected && (
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: tokens.fg }}
                    />
                  )}
                </span>
                <span
                  className="text-[12.5px] font-medium truncate"
                  style={{ color: tokens.fg }}
                >
                  {m.name}
                </span>
                <span
                  className="text-[11px] truncate ml-auto"
                  style={{ color: tokens.fgMuted }}
                >
                  {cleanupLabel(m.cleanup)} · {langLabel(m.language)}
                </span>
              </button>
            );
          })}
        </div>
      </Section>

      <Section label={activeId === "__new__" ? "New mode" : `Configure — ${activeMode.name}`}>
        <ModeForm
          key={activeId}
          settings={settings}
          modeId={activeId}
          onChange={onChange}
        />
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
