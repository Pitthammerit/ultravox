export interface VariantMeta {
  id: string;
  label: string;
  size: string;
  description: string;
  tooltip: string;
  isCloud?: boolean;
  isEnglish?: boolean;
}

/**
 * Whisper variant metadata. Labels match the canonical names from the
 * OpenAI Whisper repo so users can compare against external benchmarks
 * without translating our marketing labels.
 *
 * Sizes and descriptions are calibrated against the WisperSync community
 * benchmark (Queen "Don't Stop Me Now" transcription test on M1 Pro,
 * 2026-05): https://wispersync.dev/whisper-models-comparison
 *
 * Quantized q8_0 variants (medium-q8, large-v3-turbo-q8_0) — the
 * article's recommended "best all-rounders" — are not yet listed because
 * the Rust download/routing layer needs CoreML acceleration first
 * (matches Superwhisper's setup). Coming alongside Phase D.
 */
export const TRANSCRIPTION_VARIANTS: VariantMeta[] = [
  {
    id: "cloud",
    label: "Cloud",
    size: "",
    description: "Transcribe in Cloud",
    tooltip:
      "Send audio to the managed Cloudflare worker for transcription. Never runs on-device — overrides the global local-transcription toggle for this mode.",
    isCloud: true,
  },
  {
    id: "auto",
    label: "Auto",
    size: "",
    description: "Smart-route (recommended)",
    tooltip:
      "Picks the best installed local model based on the mode's language AND audio quality. Quiet recordings auto-upgrade to a more accurate model when available. English modes prefer English-tuned variants. Falls back to Cloud if nothing local is installed.",
  },
  {
    id: "tiny",
    label: "Tiny",
    size: "74 MB",
    description: "Fastest — quick drafts only",
    tooltip:
      "Whisper Tiny (74 MB). Near-instant on any Mac, but accuracy drops sharply on accents, fast speech, or non-lyrical sounds. Good for jot-down memos in clean conditions; not recommended for meetings or music.",
  },
  {
    id: "base",
    label: "Base",
    size: "141 MB",
    description: "Multilingual quick draft",
    tooltip:
      "Whisper Base, multilingual variant (141 MB). Fast — handles non-English with reasonable accuracy. Significant errors on complex audio remain.",
  },
  {
    id: "base.en",
    label: "Base (English)",
    size: "141 MB",
    description: "English-tuned quick draft",
    tooltip:
      "Whisper Base.en (141 MB), English-only training data. More accurate than Tiny for English at the same speed envelope.",
    isEnglish: true,
  },
  {
    id: "small",
    label: "Small",
    size: "465 MB",
    description: "Solid all-rounder",
    tooltip:
      "Whisper Small (465 MB). Strong middle ground — good accuracy at moderate speed. Some errors remain on rapid or musical content.",
  },
  {
    id: "medium",
    label: "Medium",
    size: "1.4 GB",
    description: "High accuracy multilingual",
    tooltip:
      "Whisper Medium (1.4 GB). High quality across all languages. ~21 s for a 3:31 audio clip on Apple Silicon (per WisperSync benchmark).",
  },
  {
    id: "medium.en",
    label: "Medium (English)",
    size: "1.4 GB",
    description: "Best for English (mid-tier)",
    tooltip:
      "Whisper Medium.en (1.4 GB), English-only. Best English-tuned option when you don't need Large-v3-turbo. Balanced speed and accuracy.",
    isEnglish: true,
  },
  {
    id: "large-v3-turbo",
    label: "Large v3 Turbo",
    size: "1.5 GB",
    description: "Fast Large-class accuracy",
    tooltip:
      "Whisper Large-v3-turbo (1.5 GB). Distilled-decoder version of Large-v3 — runs at Medium speed (~17 s for 3:31 audio) but reaches near-Large accuracy on word-level transcription. Misses some non-lyrical vocalizations on music. Multilingual.",
  },
  {
    id: "large-v3",
    label: "Large v3",
    size: "2.9 GB",
    description: "Highest accuracy (slow)",
    tooltip:
      "Whisper Large-v3 (2.9 GB), the full non-distilled model. Highest accuracy at the cost of disk space and ~3× the transcription time of Medium. Use for archival or high-stakes dictation. Multilingual.",
  },
];

export const VARIANT_LABEL_MAP: Record<string, { label: string; isEnglish: boolean }> = Object.fromEntries(
  TRANSCRIPTION_VARIANTS.map((v) => [v.id, { label: v.label, isEnglish: v.isEnglish ?? false }])
);
