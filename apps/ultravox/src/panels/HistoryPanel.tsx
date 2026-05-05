import { Description, Section } from "../components/ui";

export default function HistoryPanel() {
  return (
    <Section label="Archive">
      <div className="rounded-xl border border-color-divider-on-dark/40 bg-color-surface px-4 py-6 text-center">
        <Description>
          Transcription history is coming in v1.1. Your audio never leaves the
          worker today — recordings are not stored.
        </Description>
      </div>
    </Section>
  );
}
