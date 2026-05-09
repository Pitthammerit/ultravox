export interface VariantMeta {
  id: string;
  label: string;
  size: string;
  description: string;
  tooltip: string;
}

export const LLM_VARIANTS: VariantMeta[] = [
  {
    id: "auto",
    label: "Auto",
    size: "",
    description: "Smart-route (recommended)",
    tooltip: "Picks the best installed LLM based on available models. Falls back to OpenRouter if no local model is installed.",
  },
  {
    id: "phi-3.5",
    label: "Lite",
    size: "~2.4 GB",
    description: "Fastest, good quality",
    tooltip: "Phi-3.5 mini Instruct (Q4_K_M ~2.4 GB). Excellent balance of speed and quality for cleanup tasks. Great for Macs with 8 GB+ RAM.",
  },
  {
    id: "qwen2.5-3b",
    label: "Balance",
    size: "~1.9 GB",
    description: "Compact, decent quality",
    tooltip: "Qwen2.5-3B Instruct (Q4_K_M ~1.9 GB). Smallest footprint while maintaining reasonable cleanup quality. Good for lower-RAM Macs.",
  },
  {
    id: "mistral-7b",
    label: "Plus",
    size: "~4.4 GB",
    description: "Highest quality, slower",
    tooltip: "Mistral 7B Instruct v0.3 (Q4_K_M ~4.4 GB). Best cleanup quality at the cost of memory and speed. Requires 16 GB+ RAM for smooth performance.",
  },
];

export const LLM_LABEL_MAP: Record<string, { label: string }> = Object.fromEntries(
  LLM_VARIANTS.map((v) => [v.id, { label: v.label }])
);
