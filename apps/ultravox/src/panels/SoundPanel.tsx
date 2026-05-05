import type { AppSettings } from "../lib/store-bridge";
import { Button, Row, Section, ToggleRow, tokens } from "../components/ui";
import { playStartChime, playStopChime } from "../lib/chime";

interface SoundPanelProps {
  settings: AppSettings;
  onChange: (patch: Partial<AppSettings>) => Promise<void>;
}

export default function SoundPanel({ settings, onChange }: SoundPanelProps) {
  const sound = settings.sound;

  const setSound = (patch: Partial<AppSettings["sound"]>) =>
    onChange({ sound: { ...sound, ...patch } });

  return (
    <>
      <Section label="Microphone">
        <p
          className="text-[12.5px] leading-relaxed"
          style={{ color: tokens.fgMuted }}
        >
          Ultravox uses your system default microphone. Per-device selection
          comes in v1.1.
        </p>
      </Section>

      <Section label="Input processing">
        <ToggleRow
          label="Auto-gain"
          description="Browser auto-adjusts microphone level"
          checked={sound.autoGain}
          onChange={(v) => setSound({ autoGain: v })}
        />
        <ToggleRow
          label="Silence removal"
          description="Trim silent passages before upload (v1.1)"
          checked={sound.silenceRemoval}
          onChange={(v) => setSound({ silenceRemoval: v })}
        />
      </Section>

      <Section label="Sound effects">
        <ToggleRow
          label="Chime on start/stop"
          description="Brief tone when recording starts and stops"
          checked={sound.chime}
          onChange={(v) => setSound({ chime: v })}
        />
        {sound.chime && (
          <Row
            label="Chime volume"
            control={
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={sound.chimeVolume}
                onChange={(e) =>
                  setSound({ chimeVolume: Number(e.currentTarget.value) })
                }
                style={{ width: 140, accentColor: tokens.fg }}
              />
            }
          />
        )}
        {sound.chime && (
          <Row
            label="Test"
            control={
              <div className="flex items-center gap-1.5">
                <Button size="xs" onClick={() => playStartChime(sound.chimeVolume)}>
                  ▶ Start
                </Button>
                <Button size="xs" onClick={() => playStopChime(sound.chimeVolume)}>
                  ▶ Stop
                </Button>
              </div>
            }
          />
        )}
      </Section>
    </>
  );
}
