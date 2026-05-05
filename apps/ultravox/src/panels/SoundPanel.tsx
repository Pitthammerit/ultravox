import { useState } from "react";
import { Section, ToggleRow, tokens } from "../components/ui";

export default function SoundPanel() {
  // Stub controls — wired to real audio devices in v1.1.
  const [autoGain, setAutoGain] = useState(true);
  const [silenceRemoval, setSilenceRemoval] = useState(false);
  const [chime, setChime] = useState(false);

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
          checked={autoGain}
          onChange={setAutoGain}
        />
        <ToggleRow
          label="Silence removal"
          description="Trim silent passages before upload"
          checked={silenceRemoval}
          onChange={setSilenceRemoval}
        />
      </Section>

      <Section label="Sound effects">
        <ToggleRow
          label="Chime on start/stop"
          description="Brief tone when recording starts and stops"
          checked={chime}
          onChange={setChime}
        />
      </Section>
    </>
  );
}
