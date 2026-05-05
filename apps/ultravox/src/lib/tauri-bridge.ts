import type { ApiKeys } from "./transcribe";

/**
 * Returns API keys for the transcription pipeline.
 * Dev: reads from VITE_OPENAI_KEY / VITE_OPENROUTER_KEY env vars.
 *   → create apps/ultravox/.env.local with those two keys.
 * Phase 9: replace with tauri-plugin-stronghold reads.
 */
export function getApiKeys(): ApiKeys {
  const openAiKey = import.meta.env["VITE_OPENAI_KEY"] as string | undefined;
  const openRouterKey = import.meta.env["VITE_OPENROUTER_KEY"] as string | undefined;

  if (!openAiKey || !openRouterKey) {
    throw new Error(
      "Missing API keys. Add VITE_OPENAI_KEY and VITE_OPENROUTER_KEY to apps/ultravox/.env.local",
    );
  }

  return { openAiKey, openRouterKey };
}
