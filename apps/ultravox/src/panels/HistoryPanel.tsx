export default function HistoryPanel() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h2 className="typography-h3 text-color-primary">History</h2>
      </header>
      <div className="rounded-lg border border-color-ink-15 bg-color-surface p-8 text-center">
        <p className="typography-body text-color-secondary">
          Transcription history is coming in v1.1. Your audio never leaves the worker today —
          recordings are not stored.
        </p>
      </div>
    </div>
  );
}
