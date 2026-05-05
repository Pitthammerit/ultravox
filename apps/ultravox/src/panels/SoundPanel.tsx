import { Description, Section, ToggleCard } from "../components/ui";
import { useState } from "react";

export default function SoundPanel() {
  // Stub controls — wired to real audio devices in v1.1.
  const [autoGain, setAutoGain] = useState(true);
  const [silenceRemoval, setSilenceRemoval] = useState(false);
  const [chime, setChime] = useState(false);

  return (
    <>
      <Section label="Microphone">
        <Description>
          Ultravox uses your system default microphone. Per-device selection is
          coming in v1.1.
        </Description>
      </Section>

      <Section label="Input processing">
        <ToggleCard
          label="Auto-gain"
          description="Browser auto-adjusts microphone level"
          checked={autoGain}
          onChange={setAutoGain}
          highlight
        />
        <ToggleCard
          label="Silence removal"
          description="Trim silent passages before upload"
          checked={silenceRemoval}
          onChange={setSilenceRemoval}
        />
      </Section>

      <Section label="Sound effects">
        <ToggleCard
          label="Chime on start/stop"
          description="Play a brief tone when recording starts and stops"
          checked={chime}
          onChange={setChime}
        />
      </Section>
    </>
  );
}
