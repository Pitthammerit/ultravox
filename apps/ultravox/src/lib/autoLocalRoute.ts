/**
 * Behavior glue for the "Run on-device" toggles in the Modes panel.
 *
 * When the user flips "Enable local transcription" or "Enable local cleanup"
 * ON, we want a one-click "go fully local" experience:
 *
 *  1. Switch every voice mode to route through local equivalents
 *     (transcriptionModel: "auto" for Whisper, languageModelProvider:
 *     "local" for cleanup) so the user doesn't have to edit each mode.
 *
 *  2. If the user has fewer than two essential local models installed,
 *     start the downloads in the background. The downloads stream via
 *     the existing local_whisper:download-progress / local_llm:download-
 *     progress events, surfaced as chips in the Configuration panel's
 *     Installed-models list. The user can keep working — auto-routing
 *     falls back to Cloud gracefully until the downloads land.
 *
 * "Essentials" are deliberately small. The whisper-rs CoreML feature is
 * enabled (v0.15.0) so even the 78 MB Tiny model runs fast on Apple
 * Silicon, and the WisperSync benchmark's recommended speed/quality
 * sweet spot (medium-q8_0 at 823 MB) is the second essential. For LLMs,
 * Phi-3.5 (~2 GB) is the smallest local cleanup model that produces
 * reasonable output across English + German.
 *
 * Downloads are idempotent on the Rust side — re-running with a model
 * already installed is a no-op. Routing changes are idempotent too:
 * setting transcriptionModel: "auto" on a mode that's already on "auto"
 * doesn't trigger a re-save.
 */

import {
  localWhisperListModels,
  localWhisperDownloadModel,
  localLlmListModels,
  localLlmDownloadModel,
} from "./tauri-bridge";
import type { AppSettings } from "./store-bridge";
import type { VoiceMode, LanguageModelProvider } from "./voiceModes";

/** Whisper essentials, in order of "start this download first". Tiny is
 *  small enough to land in seconds even on slow connections, so the user
 *  sees local transcription working ASAP. medium-q8_0 lands behind it. */
export const ESSENTIAL_WHISPER_VARIANTS = ["tiny", "medium-q8_0"] as const;

/** LLM essentials. Phi-3.5 is the smallest model that produces usable
 *  English+German cleanup. Qwen2.5-3B is the larger quality pick. */
export const ESSENTIAL_LLM_VARIANTS = ["phi-3.5", "qwen2.5-3b"] as const;

/** Default LLM variant id when we have to pick one for a mode that
 *  currently uses cloud/openrouter/claude-code. */
const DEFAULT_LOCAL_LLM_VARIANT = "phi-3.5";

/** Provider values we leave alone — "none" means the user explicitly
 *  doesn't want cleanup at all (raw transcript), so don't override. */
const PROVIDERS_TO_PRESERVE: ReadonlyArray<LanguageModelProvider> = ["none"];

/**
 * Compute a new modes array with every mode routed through local equivalents.
 * Returns null if nothing would change (saves an unnecessary disk write).
 */
export function routeModesToLocal(
  modes: VoiceMode[],
  opts: { transcription: boolean; cleanup: boolean },
): VoiceMode[] | null {
  let changed = false;
  const next = modes.map((m) => {
    let mode: VoiceMode = m;

    // Transcription: cloud → auto. Auto routes through whichever local
    // model is installed (preferring quality, falling back gracefully).
    // Already-explicit non-cloud variants are preserved.
    if (opts.transcription && (mode.transcriptionModel ?? "auto") === "cloud") {
      mode = { ...mode, transcriptionModel: "auto" };
      changed = true;
    }

    // Cleanup: non-local provider → local. "none" stays "none" (user
    // explicitly wants raw output). cleanup === "raw" modes don't run
    // any LLM regardless of provider, so we leave them alone too.
    if (opts.cleanup && mode.cleanup !== "raw") {
      const currentProvider = mode.languageModelProvider ?? "openrouter";
      if (
        currentProvider !== "local" &&
        !PROVIDERS_TO_PRESERVE.includes(currentProvider)
      ) {
        mode = {
          ...mode,
          languageModelProvider: "local",
          languageModel: DEFAULT_LOCAL_LLM_VARIANT,
        };
        changed = true;
      }
    }

    return mode;
  });
  return changed ? next : null;
}

/**
 * Kick off background downloads for any missing essential models.
 * Resolves immediately — the downloads themselves run async on the Rust
 * side and stream progress events to whatever Configuration-panel chip
 * subscribed via subscribeToWhisperDownloadProgress.
 *
 * On any error (network down, HF rate limit, no disk space) we swallow
 * silently and let the user retry from Configuration → Models. The
 * toggle flip succeeds either way.
 */
export async function ensureEssentialModelsDownloaded(opts: {
  transcription: boolean;
  cleanup: boolean;
}): Promise<void> {
  const tasks: Promise<unknown>[] = [];

  if (opts.transcription) {
    try {
      const installed = await localWhisperListModels();
      const haveIds = new Set(installed.map((m) => m.variant));
      for (const variant of ESSENTIAL_WHISPER_VARIANTS) {
        if (!haveIds.has(variant)) {
          tasks.push(
            localWhisperDownloadModel(variant).catch((e) => {
              console.warn(`[autoLocalRoute] Whisper ${variant} download failed:`, e);
            }),
          );
        }
      }
    } catch (e) {
      console.warn("[autoLocalRoute] localWhisperListModels failed:", e);
    }
  }

  if (opts.cleanup) {
    try {
      const installed = await localLlmListModels();
      const haveIds = new Set(installed.map((m) => m.variant));
      for (const variant of ESSENTIAL_LLM_VARIANTS) {
        if (!haveIds.has(variant)) {
          tasks.push(
            localLlmDownloadModel(variant).catch((e) => {
              console.warn(`[autoLocalRoute] LLM ${variant} download failed:`, e);
            }),
          );
        }
      }
    } catch (e) {
      console.warn("[autoLocalRoute] localLlmListModels failed:", e);
    }
  }

  // Don't await downloads — they're long-running. Just fire them.
  // Return when all the LIST + ENQUEUE operations have completed so the
  // caller knows the kickoff is done.
  void Promise.allSettled(tasks);
}

/**
 * One-shot helper used by the Modes-panel toggle handlers. Routes modes
 * to local + ensures essentials are downloading, then returns the new
 * modes array (or null if no changes). Caller passes the result into
 * onChange({ modes }) along with the toggle flag itself.
 */
export async function applyLocalToggle(
  settings: AppSettings,
  opts: { transcription: boolean; cleanup: boolean },
): Promise<{ modes: VoiceMode[] | null }> {
  // Kick off downloads in parallel with mode routing — they don't depend
  // on each other.
  void ensureEssentialModelsDownloaded(opts);
  const routedModes = routeModesToLocal(settings.modes, opts);
  return { modes: routedModes };
}
