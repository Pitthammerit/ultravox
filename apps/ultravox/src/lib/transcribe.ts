import { buildHintString, getReplacePairs } from "./voiceVocabulary";
import type { VocabularyEntry } from "./voiceVocabulary";
import type { VoiceMode } from "./voiceModes";
import { logDebug } from "./debugLog";
import { claudeCodeCheck, claudeCodeCleanup } from "./tauri-bridge";

export type { VocabularyEntry };

export interface TranscribeOptions {
  mode: VoiceMode;
  vocabulary: VocabularyEntry[];
  tokenEndpoint: string;
  /**
   * If true, attempt LLM cleanup via the local `claude` CLI (Anthropic
   * Claude Code, authenticated against the user's Max plan) before the
   * managed worker. On any failure (CLI missing, not logged in, timeout,
   * empty output, network) we transparently fall back to the worker so the
   * user never gets a broken transcription.
   */
  useClaudeCode?: boolean;
  /** Fired once when the upload starts (single phase — server does both). */
  onProgress?: (phase: "transcribing") => void;
}

export interface TranscribeResult {
  text: string;
}

interface TokenResponse {
  ok: boolean;
  token: string;
  expiresIn?: number;
  error?: string;
}

function deriveApiBase(tokenEndpoint: string): string {
  const url = new URL(tokenEndpoint, "http://localhost");
  return `${url.protocol}//${url.host}`;
}

async function fetchToken(endpoint: string): Promise<{ token: string; apiUrl: string }> {
  const t0 = performance.now();
  const res = await fetch(endpoint);
  const data = (await res.json()) as TokenResponse;
  const durationMs = Math.round(performance.now() - t0);
  if (!res.ok || !data.ok) {
    logDebug("transcribe-token", { status: res.status, durationMs, error: data.error ?? `HTTP ${res.status}` });
    throw new Error(data.error ?? `token endpoint ${res.status}`);
  }
  logDebug("transcribe-token", { status: res.status, durationMs });
  return { token: data.token, apiUrl: deriveApiBase(endpoint) };
}

/**
 * Phase 1: send audio to /v1/audio/transcriptions (Whisper-only) and
 * return raw transcript. Used by the Claude-Code path so we have plain
 * text to feed into the local CLI for cleanup.
 */
async function whisperRaw(
  blob: Blob,
  opts: TranscribeOptions,
  token: string,
  apiUrl: string,
): Promise<string> {
  const ext = /mp4|m4a|aac/.test(blob.type) ? "m4a"
            : /ogg/.test(blob.type)         ? "ogg"
            : /wav/.test(blob.type)         ? "wav"
            :                                  "webm";
  const fd = new FormData();
  fd.append("file", blob, `audio.${ext}`);
  if (opts.mode.language && opts.mode.language !== "auto") {
    fd.append("language", opts.mode.language);
  }
  const hints = buildHintString(opts.vocabulary);
  if (hints) fd.append("vocabularyHints", hints);

  const res = await fetch(`${apiUrl}/v1/audio/transcriptions`, {
    method: "POST",
    body: fd,
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`whisper ${res.status}: ${errText.slice(0, 200)}`);
  }
  const data = (await res.json()) as { text?: string };
  return data.text ?? "";
}

/**
 * Build the cleanup prompt for the local `claude` CLI. Mirrors what the
 * Cloudflare Voice Worker does server-side: cleanup style + language +
 * vocabulary replacements + per-mode prompt suffix.
 */
function buildClaudePrompt(rawText: string, opts: TranscribeOptions): string {
  const cleanup = opts.mode.cleanup ?? "prose";
  const styleInstruction = (() => {
    switch (cleanup) {
      case "list":
        return "Format the content as a clean bulleted list. Each bullet on its own line, prefixed with '- '.";
      case "note":
        return "Format as a short note: a single Markdown heading on the first line followed by 1–3 short paragraphs.";
      case "prose":
      default:
        return "Format the content as flowing, well-punctuated prose. Fix obvious dictation errors and disfluencies (um, uh, repeated words). Preserve the speaker's voice — do not paraphrase or summarise.";
    }
  })();

  const langLine = (opts.mode.language && opts.mode.language !== "auto")
    ? `Output language: ${opts.mode.language}.`
    : "Output language: same as the input.";

  const capLine = opts.mode.autocapitalize
    ? "Apply standard sentence-case capitalisation."
    : "";

  const replacements = getReplacePairs(opts.vocabulary);
  const vocabLine = replacements.length
    ? `Apply these replacements verbatim where the source text matches case-insensitively: ${replacements.map((p) => `"${p.input}" → "${p.replace}"`).join(", ")}.`
    : "";

  const customSuffix = opts.mode.promptSuffix?.trim() ?? "";

  return [
    "You are a transcription cleanup assistant. Clean the following voice transcript.",
    styleInstruction,
    langLine,
    capLine,
    vocabLine,
    customSuffix ? `Additional instructions: ${customSuffix}` : "",
    "Output ONLY the cleaned text — no preamble, no explanations, no Markdown code-fences, no quotation marks around the output.",
    "",
    "Raw transcript:",
    rawText,
  ].filter(Boolean).join("\n\n");
}

/**
 * Run the worker path: one upload to `/v1/audio/clean` (Whisper + LLM in
 * a single roundtrip) or `/v1/audio/transcriptions` for raw mode.
 */
async function workerTranscribe(
  blob: Blob,
  opts: TranscribeOptions,
  token: string,
  apiUrl: string,
): Promise<string> {
  const cleanup = opts.mode.cleanup ?? "prose";
  const endpoint = cleanup === "raw" ? "/v1/audio/transcriptions" : "/v1/audio/clean";

  const ext = /mp4|m4a|aac/.test(blob.type) ? "m4a"
            : /ogg/.test(blob.type)         ? "ogg"
            : /wav/.test(blob.type)         ? "wav"
            :                                  "webm";

  const fd = new FormData();
  fd.append("file", blob, `audio.${ext}`);
  if (opts.mode.language && opts.mode.language !== "auto") {
    fd.append("language", opts.mode.language);
  }
  const hints = buildHintString(opts.vocabulary);
  if (hints) fd.append("vocabularyHints", hints);

  if (cleanup !== "raw") {
    fd.append("cleanup", cleanup);
    if (opts.mode.languageModelProvider) fd.append("provider", opts.mode.languageModelProvider);
    if (opts.mode.languageModel) fd.append("model", opts.mode.languageModel);
    if (opts.mode.promptSuffix) fd.append("promptSuffix", opts.mode.promptSuffix);
    if (opts.mode.autocapitalize) fd.append("autocapitalize", "true");
    const replacements = getReplacePairs(opts.vocabulary);
    if (replacements.length) fd.append("vocabularyReplacements", JSON.stringify(replacements));
  }

  const t0 = performance.now();
  logDebug("transcribe-post", {
    mime: blob.type,
    bytes: blob.size,
    modeId: opts.mode.id,
    message: `${endpoint} (${cleanup})`,
  });
  const res = await fetch(`${apiUrl}${endpoint}`, {
    method: "POST",
    body: fd,
    headers: { Authorization: `Bearer ${token}` },
  });
  const durationMs = Math.round(performance.now() - t0);
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    logDebug("transcribe-result", { status: res.status, durationMs, error: errText.slice(0, 240) });
    throw new Error(`voice worker ${res.status}: ${errText.slice(0, 200)}`);
  }
  const data = (await res.json()) as { text?: string };
  const text = data.text ?? "";
  logDebug("transcribe-result", { status: res.status, durationMs, textLength: text.length });
  return text;
}

export async function transcribe(
  blob: Blob,
  opts: TranscribeOptions,
): Promise<TranscribeResult> {
  const { token, apiUrl } = await fetchToken(opts.tokenEndpoint);
  opts.onProgress?.("transcribing");

  const cleanup = opts.mode.cleanup ?? "prose";

  // ── Claude Code path (opt-in, with auto-fallback) ──
  if (opts.useClaudeCode && cleanup !== "raw") {
    try {
      const status = await claudeCodeCheck();
      if (status.available) {
        // Phase 1: Whisper raw transcription via the worker
        const raw = await whisperRaw(blob, opts, token, apiUrl);
        if (raw.trim()) {
          // Phase 2: cleanup via local Claude Code CLI
          const prompt = buildClaudePrompt(raw, opts);
          const cleaned = await claudeCodeCleanup(prompt);
          logDebug("transcribe-result", {
            status: 200,
            textLength: cleaned.length,
            message: `claude-code (${status.version})`,
          });
          return { text: cleaned };
        }
        // Empty raw — return as-is, no LLM call needed.
        return { text: raw };
      }
      logDebug("transcribe-post", { message: "claude-code not available — falling back to worker" });
    } catch (e) {
      // Any error → fall back. We log so dev can see why, but the user
      // gets a working transcription.
      logDebug("transcribe-post", {
        message: "claude-code path failed, falling back to worker",
        error: (e as Error).message?.slice(0, 200),
      });
    }
  }

  // ── Worker path (default) ──
  const text = await workerTranscribe(blob, opts, token, apiUrl);
  return { text };
}
