import { Section, tokens } from "../components/ui";

export default function HistoryPanel() {
  return (
    <Section label="Archive">
      <div
        className="rounded-lg px-4 py-5 text-center"
        style={{
          background: tokens.card,
          border: `1px solid ${tokens.border}`,
        }}
      >
        <p
          className="text-[12.5px] leading-relaxed"
          style={{ color: tokens.fgMuted }}
        >
          Transcription history is coming in v1.1. Audio never leaves the worker
          today — recordings are not stored.
        </p>
      </div>
    </Section>
  );
}
