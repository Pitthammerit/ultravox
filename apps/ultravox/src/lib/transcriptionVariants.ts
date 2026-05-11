export interface VariantMeta {
  id: string;
  label: string;
  size: string;
  description: string;
  tooltip: string;
  isCloud?: boolean;
  isEnglish?: boolean;
  /** Quantized models (q5_0, q8_0) — smaller file, near-identical accuracy. */
  isQuantized?: boolean;
}

/**
 * Whisper variant metadata. Labels match the canonical names from the
 * OpenAI Whisper repo so users can compare against external benchmarks
 * without translating our marketing labels.
 *
 * Sizes are the official file sizes from HuggingFace
 * ggerganov/whisper.cpp/tree/main, verified 2026-05-11. Picker may show
 * slightly different values for installed models because they reflect
 * on-disk size (filesystem block rounding).
 *
 * Quantized variants (q5_0, q8_0) are the same network with weights
 * compressed to 5-bit or 8-bit integers; accuracy is within 1-2% of the
 * full precision version per the whisper.cpp benchmark suite. They're
 * the right pick when you want Large-class accuracy without 1.6+ GB
 * on disk. medium-q8_0 and large-v3-turbo-q8_0 are the WisperSync
 * benchmark's "best all-rounders" for Apple Silicon.
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
    size: "78 MB",
    description: "Fastest — quick drafts only",
    tooltip:
      "Whisper Tiny (78 MB). Near-instant on any Mac, but accuracy drops sharply on accents, fast speech, or non-lyrical sounds. Good for jot-down memos in clean conditions; not recommended for meetings or music.",
  },
  {
    id: "base",
    label: "Base",
    size: "148 MB",
    description: "Multilingual quick draft",
    tooltip:
      "Whisper Base, multilingual variant (148 MB). Fast — handles non-English with reasonable accuracy. Significant errors on complex audio remain.",
  },
  {
    id: "base.en",
    label: "Base (English)",
    size: "148 MB",
    description: "English-tuned quick draft",
    tooltip:
      "Whisper Base.en (148 MB), English-only training data. More accurate than Tiny for English at the same speed envelope.",
    isEnglish: true,
  },
  {
    id: "small",
    label: "Small",
    size: "488 MB",
    description: "Solid all-rounder",
    tooltip:
      "Whisper Small (488 MB). Strong middle ground — good accuracy at moderate speed. Some errors remain on rapid or musical content.",
  },
  {
    id: "medium-q5_0",
    label: "Medium (q5)",
    size: "539 MB",
    description: "Compressed Medium — half the size",
    tooltip:
      "Whisper Medium quantized to 5-bit weights (539 MB). Near-Medium accuracy at a third the disk usage. Pick this over full Medium unless you need every fraction of a percent.",
    isQuantized: true,
  },
  {
    id: "medium-q8_0",
    label: "Medium (q8)",
    size: "823 MB",
    description: "Best balance — recommended",
    tooltip:
      "Whisper Medium quantized to 8-bit weights (823 MB). The WisperSync benchmark's pick: ~17s for a 3:31 audio clip on Apple Silicon, near-Medium accuracy. Best speed/quality/disk-usage balance of any variant.",
    isQuantized: true,
  },
  {
    id: "medium",
    label: "Medium",
    size: "1.5 GB",
    description: "High accuracy multilingual",
    tooltip:
      "Whisper Medium (1.5 GB). High quality across all languages. ~21 s for a 3:31 audio clip on Apple Silicon (per WisperSync benchmark). For most workloads, prefer Medium (q8) — same accuracy, half the disk.",
  },
  {
    id: "medium.en",
    label: "Medium (English)",
    size: "1.5 GB",
    description: "Best for English (mid-tier)",
    tooltip:
      "Whisper Medium.en (1.5 GB), English-only. Best English-tuned option when you don't need Large-v3-turbo. Balanced speed and accuracy.",
    isEnglish: true,
  },
  {
    id: "large-v3-turbo-q5_0",
    label: "Large v3 Turbo (q5)",
    size: "574 MB",
    description: "Compressed Turbo — fastest large-class",
    tooltip:
      "Whisper Large-v3-turbo quantized to 5-bit weights (574 MB). Fastest of the large-class models thanks to the distilled decoder. Tiny accuracy drop vs full Turbo. Pick this when speed matters most on a smaller disk.",
    isQuantized: true,
  },
  {
    id: "large-v3-turbo-q8_0",
    label: "Large v3 Turbo (q8)",
    size: "874 MB",
    description: "Compressed Turbo — best of both",
    tooltip:
      "Whisper Large-v3-turbo quantized to 8-bit weights (874 MB). Near-full Turbo accuracy at half the disk usage. Excellent default for new users who want Large-class quality without 1.6 GB on disk.",
    isQuantized: true,
  },
  {
    id: "large-v3-turbo",
    label: "Large v3 Turbo",
    size: "1.6 GB",
    description: "Fast Large-class accuracy",
    tooltip:
      "Whisper Large-v3-turbo (1.6 GB). Distilled-decoder version of Large-v3 — runs at Medium speed (~17 s for 3:31 audio) but reaches near-Large accuracy on word-level transcription. Misses some non-lyrical vocalizations on music. Multilingual.",
  },
  {
    id: "large-v3-q5_0",
    label: "Large v3 (q5)",
    size: "1.1 GB",
    description: "Compressed Large — third the size",
    tooltip:
      "Whisper Large-v3 quantized to 5-bit weights (1.1 GB). Same architecture as full Large-v3 with weights compressed; accuracy is within 1-2%. Good middle ground when Turbo isn't accurate enough but full Large is too big.",
    isQuantized: true,
  },
  {
    id: "large-v3",
    label: "Large v3",
    size: "3.1 GB",
    description: "Highest accuracy (slow)",
    tooltip:
      "Whisper Large-v3 (3.1 GB), the full non-distilled model. Highest accuracy at the cost of disk space and ~3× the transcription time of Medium. Use for archival or high-stakes dictation. Multilingual.",
  },
];

export const VARIANT_LABEL_MAP: Record<string, { label: string; isEnglish: boolean }> = Object.fromEntries(
  TRANSCRIPTION_VARIANTS.map((v) => [v.id, { label: v.label, isEnglish: v.isEnglish ?? false }])
);
