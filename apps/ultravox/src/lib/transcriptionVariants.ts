export interface VariantMeta {
  id: string;
  label: string;
  size: string;
  description: string;
  tooltip: string;
  isCloud?: boolean;
  isEnglish?: boolean;
}

export const TRANSCRIPTION_VARIANTS: VariantMeta[] = [
  { id: "auto",           label: "Auto",     size: "",        description: "Smart-route (recommended)",      tooltip: "Picks the best installed local model based on the mode's language AND audio quality. Quiet recordings auto-upgrade to a more accurate model when available. English modes prefer english-tuned variants. Falls back to Whisper Cloud if nothing local is installed." },
  { id: "cloud",          label: "Cloud",    size: "",        description: "Transcribe in Cloud",            tooltip: "Send audio to the managed Cloudflare worker for transcription. Never runs on-device — overrides the global local-transcription toggle for this mode.", isCloud: true },
  { id: "tiny",           label: "Quick",    size: "~75 MB",  description: "Fastest, lower accuracy",        tooltip: "Tiny is the smallest Whisper model (~75 MB). Transcription is near-instant but accuracy is lower, especially for accents or fast speech." },
  { id: "base.en",        label: "Lite",     size: "~142 MB", description: "More accurate, English",         tooltip: "Base.en is trained on English-only data — more accurate than Tiny for English dictation at a modest size increase (~142 MB).", isEnglish: true },
  { id: "base",           label: "Lite",     size: "~142 MB", description: "Multilingual, balanced",         tooltip: "Base is the multilingual sibling of Base.en (~142 MB). Handles non-English languages with good accuracy and reasonable speed." },
  { id: "small",          label: "Balance",  size: "~466 MB", description: "Good accuracy, moderate speed",  tooltip: "Small delivers good transcription quality (~466 MB) at a moderate speed." },
  { id: "medium",         label: "Plus",     size: "~1.5 GB", description: "High accuracy, multilingual",    tooltip: "Medium is a large multilingual model (~1.5 GB). High quality across all languages; significantly slower than Small." },
  { id: "medium.en",      label: "Plus",     size: "~1.5 GB", description: "High accuracy, English",         tooltip: "Medium.en is trained exclusively on English data (~1.5 GB). Best English-tuned option when Large-v3-turbo isn't needed.", isEnglish: true },
  { id: "large-v3-turbo", label: "Max",      size: "~1.6 GB", description: "Best accuracy, decent speed",   tooltip: "Large-v3-turbo (~1.6 GB) is the highest-accuracy local model. Faster than full Large-v3 thanks to a distilled decoder, while matching its quality. Multilingual." },
];

export const VARIANT_LABEL_MAP: Record<string, { label: string; isEnglish: boolean }> = Object.fromEntries(
  TRANSCRIPTION_VARIANTS.map((v) => [v.id, { label: v.label, isEnglish: v.isEnglish ?? false }])
);
