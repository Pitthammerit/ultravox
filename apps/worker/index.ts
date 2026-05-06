/**
 * Ultravox Voice Worker
 *
 * Cloudflare Worker for audio transcription and text cleanup.
 * Holds managed API keys server-side; clients obtain a short-lived HMAC token
 * from /api/voice/token before calling the audio endpoints.
 *
 * Endpoints:
 * - GET  /api/voice/token           — issue a 5-min HMAC bearer token
 * - POST /v1/audio/transcriptions   — OpenAI-compatible Whisper transcription
 * - POST /v1/audio/clean            — Transcribe + OpenRouter LLM cleanup
 * - GET  /health                    — liveness check
 */

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB
const API_TIMEOUT_MS = 30_000;
const TOKEN_TTL_SEC = 300; // 5 minutes

interface Env {
  AI: Ai;
  OPENROUTER_API_KEY: string;
  VOICE_HMAC_SECRET: string;
  DEV_BEARER_TOKEN?: string; // static token for local curl smoke-tests only
}

interface TokenResponse {
  ok: boolean;
  token: string;
  expiresIn: number;
  error?: string;
}

interface TranscribeResponse {
  text: string;
}

interface CleanResponse {
  text: string;
  raw: string;
}

interface ErrorResponse {
  error: string;
}

// ---------------------------------------------------------------------------
// HMAC helpers
// ---------------------------------------------------------------------------

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

function toBase64Url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function signToken(subject: string, exp: number, secret: string): Promise<string> {
  const payload = `${subject}.${exp}`;
  const key = await importHmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return `${payload}.${toBase64Url(sig)}`;
}

async function verifyHmacToken(token: string, secret: string): Promise<boolean> {
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [subject, expStr, sig] = parts;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;

  const payload = `${subject}.${expStr}`;
  const key = await importHmacKey(secret);
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  const expected = toBase64Url(sigBuf);
  return timingSafeEqual(expected, sig);
}

async function verifyAuth(request: Request, env: Env): Promise<boolean> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return false;
  const token = authHeader.slice(7);

  if (env.VOICE_HMAC_SECRET && (await verifyHmacToken(token, env.VOICE_HMAC_SECRET))) return true;
  return !!env.DEV_BEARER_TOKEN && timingSafeEqual(token, env.DEV_BEARER_TOKEN);
}

// ---------------------------------------------------------------------------
// Token endpoint
// ---------------------------------------------------------------------------

async function handleToken(_request: Request, env: Env): Promise<Response> {
  if (!env.VOICE_HMAC_SECRET) {
    return Response.json(
      { ok: false, token: '', expiresIn: 0, error: 'VOICE_HMAC_SECRET not configured' } satisfies TokenResponse,
      { status: 500 },
    );
  }

  const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_SEC;
  const token = await signToken('anon', exp, env.VOICE_HMAC_SECRET);

  return Response.json({ ok: true, token, expiresIn: TOKEN_TTL_SEC } satisfies TokenResponse);
}

// ---------------------------------------------------------------------------
// Auth wrapper
// ---------------------------------------------------------------------------

function withAuth(
  handler: (request: Request, env: Env) => Promise<Response>,
): (request: Request, env: Env) => Promise<Response> {
  return async (request, env) => {
    if (!(await verifyAuth(request, env))) {
      return Response.json({ error: 'Unauthorized' } satisfies ErrorResponse, { status: 401 });
    }
    return handler(request, env);
  };
}

// ---------------------------------------------------------------------------
// Cleanup prompts
// ---------------------------------------------------------------------------

const CLEANUP_PROMPTS: Record<string, string> = {
  prose: `You are cleaning up dictated speech. Remove filler words (um, uh, ähm, also).
Fix punctuation and capitalization. Preserve question marks where the speaker's
intonation suggested a question. Fix obvious speech-to-text errors.
**Reply in the same language as the input — do not translate.**
Preserve voice, tone, and exact meaning. Do NOT paraphrase, summarise, or rewrite.
Return only the cleaned text — no preamble, no quotes, no explanation.`,

  list: `You are cleaning up dictated speech. Remove filler words (um, uh, ähm, also).
Fix punctuation and capitalization. Fix obvious speech-to-text errors.
**Reply in the same language as the input — do not translate.**
If the user clearly enumerates a list (using "first… second… third…",
"one… two… three…", or comma-separated items after a phrase like "I need…"),
format the items as a markdown bullet list with "- " prefix, one per line.
Otherwise return prose.
Preserve voice, tone, and exact meaning. Return only the cleaned text.`,

  note: `You are cleaning up dictated speech and lightly structuring it as a note.
Remove filler words (um, uh, ähm). Fix punctuation, capitalization, and obvious
speech-to-text errors.
**Reply in the same language as the input — do not translate.**
Structure as a brief note: optional first-line heading (only if the speaker
clearly named a topic), body in 1-3 short paragraphs. Maximum 5 sentences total.
Preserve voice, tone, and exact meaning. Return only the cleaned note text.`,
};

// ---------------------------------------------------------------------------
// Multipart parsing
// ---------------------------------------------------------------------------

type ParsedRequest = {
  audio: ArrayBuffer;
  language: string;
  cleanup: 'prose' | 'list' | 'note' | 'raw';
  vocabularyHints: string;
  vocabularyReplacements: Array<{ input: string; replace: string }>;
  promptSuffix: string;
  provider: 'openrouter' | 'none';
  model: string;
  autocapitalize: boolean;
};

async function parseMultipartRequest(request: Request): Promise<ParsedRequest | null> {
  const contentType = request.headers.get('Content-Type') ?? '';
  if (!contentType.includes('multipart/form-data') && !contentType.includes('boundary=')) return null;

  const formData = await request.formData();
  const file = (formData.get('file') ?? formData.get('audio')) as File | null;
  if (!file) return null;
  if (file.size > MAX_FILE_SIZE) throw new Error(`File too large (max ${MAX_FILE_SIZE / 1024 / 1024} MB)`);

  const audio = await file.arrayBuffer();

  const language = String(formData.get('language') ?? 'auto');
  const cleanupRaw = String(formData.get('cleanup') ?? 'prose').toLowerCase();
  const cleanup: ParsedRequest['cleanup'] =
    cleanupRaw === 'list' || cleanupRaw === 'note' || cleanupRaw === 'raw' ? cleanupRaw : 'prose';

  const vocabularyHints = String(formData.get('vocabularyHints') ?? '');
  const promptSuffix = String(formData.get('promptSuffix') ?? '');
  const providerRaw = String(formData.get('provider') ?? 'openrouter').toLowerCase();
  const provider: ParsedRequest['provider'] = providerRaw === 'none' ? 'none' : 'openrouter';
  const model = String(formData.get('model') ?? '');
  const autocapitalize = String(formData.get('autocapitalize') ?? 'false') === 'true';

  let vocabularyReplacements: ParsedRequest['vocabularyReplacements'] = [];
  const replacementsRaw = formData.get('vocabularyReplacements');
  if (typeof replacementsRaw === 'string' && replacementsRaw.trim()) {
    try {
      const parsed = JSON.parse(replacementsRaw);
      if (Array.isArray(parsed)) {
        vocabularyReplacements = parsed.filter(
          (e: unknown) =>
            e && typeof (e as Record<string, unknown>).input === 'string' &&
            typeof (e as Record<string, unknown>).replace === 'string',
        );
      }
    } catch {
      // ignore malformed JSON
    }
  }

  return { audio, language, cleanup, vocabularyHints, vocabularyReplacements, promptSuffix, provider, model, autocapitalize };
}

// ---------------------------------------------------------------------------
// Core pipeline
// ---------------------------------------------------------------------------

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  return new Uint8Array(buffer).toBase64();
}

async function transcribeAudio(
  audioBase64: string,
  language: string,
  vocabularyHints: string,
  env: Env,
): Promise<string> {
  const params: Record<string, unknown> = { audio: audioBase64 };
  if (language && language !== 'auto') params.language = language;
  if (vocabularyHints.trim()) {
    params.prompt = `Names and terms that may appear: ${vocabularyHints.trim()}.`;
  }

  const response = await env.AI.run('@cf/openai/whisper-large-v3-turbo', params as never);

  if (!response || typeof response !== 'object' || !('text' in response) || typeof response.text !== 'string') {
    throw new Error('Invalid Whisper response');
  }
  return response.text;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function applyVocabularyReplacements(
  text: string,
  replacements: Array<{ input: string; replace: string }>,
): string {
  let out = text;
  for (const { input, replace } of replacements) {
    if (!input) continue;
    out = out.replace(new RegExp(escapeRegExp(input), 'gi'), replace);
  }
  return out;
}

function autocapitalizeText(text: string): string {
  return text.replace(/(^|[.!?]\s+)([a-zäöüß])/g, (_, sep, ch) => sep + (ch as string).toUpperCase());
}

async function cleanupText(
  text: string,
  cleanup: 'prose' | 'list' | 'note' | 'raw',
  provider: 'openrouter' | 'none',
  model: string,
  promptSuffix: string,
  env: Env,
): Promise<string> {
  if (cleanup === 'raw' || provider === 'none') return text;
  const trimmed = text.trim();
  if (!trimmed) return '';

  let systemPrompt = CLEANUP_PROMPTS[cleanup] ?? CLEANUP_PROMPTS.prose;
  if (promptSuffix.trim()) systemPrompt += `\n\nAdditional context:\n${promptSuffix.trim()}`;

  const effectiveModel = model || 'anthropic/claude-haiku-4.5';
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://ultravox.app',
        'X-Title': 'ultravox-voice-worker',
      },
      body: JSON.stringify({
        model: effectiveModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: trimmed },
        ],
        temperature: 0.3,
        max_tokens: 2000,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenRouter ${response.status}: ${errText}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new Error('Invalid OpenRouter response');
    return content;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

async function handleTranscribe(request: Request, env: Env): Promise<Response> {
  let parsed: ParsedRequest | null;
  try {
    parsed = await parseMultipartRequest(request);
  } catch (e) {
    return Response.json({ error: (e as Error).message } satisfies ErrorResponse, { status: 400 });
  }
  if (!parsed) return Response.json({ error: 'No audio file provided' } satisfies ErrorResponse, { status: 400 });

  try {
    const text = await transcribeAudio(
      arrayBufferToBase64(parsed.audio),
      parsed.language,
      parsed.vocabularyHints,
      env,
    );
    return Response.json({ text } satisfies TranscribeResponse);
  } catch (e) {
    return Response.json({ error: (e as Error).message } satisfies ErrorResponse, { status: 500 });
  }
}

async function handleClean(request: Request, env: Env): Promise<Response> {
  let parsed: ParsedRequest | null;
  try {
    parsed = await parseMultipartRequest(request);
  } catch (e) {
    return Response.json({ error: (e as Error).message } satisfies ErrorResponse, { status: 400 });
  }
  if (!parsed) return Response.json({ error: 'No audio file provided' } satisfies ErrorResponse, { status: 400 });

  try {
    const rawWhisperText = await transcribeAudio(
      arrayBufferToBase64(parsed.audio),
      parsed.language,
      parsed.vocabularyHints,
      env,
    );
    const replacedText = applyVocabularyReplacements(rawWhisperText, parsed.vocabularyReplacements);
    let cleanedText = await cleanupText(
      replacedText,
      parsed.cleanup,
      parsed.provider,
      parsed.model,
      parsed.promptSuffix,
      env,
    );
    if (parsed.autocapitalize) cleanedText = autocapitalizeText(cleanedText);

    return Response.json({ text: cleanedText, raw: rawWhisperText } satisfies CleanResponse);
  } catch (e) {
    return Response.json({ error: (e as Error).message } satisfies ErrorResponse, { status: 500 });
  }
}

const authTranscribe = withAuth(handleTranscribe);
const authClean = withAuth(handleClean);

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  headers.set('Access-Control-Max-Age', '86400');
  return new Response(response.body, { status: response.status, headers });
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (request.method === 'OPTIONS') return withCors(new Response(null, { status: 204 }));

    if (pathname === '/health') {
      return withCors(
        Response.json({ ok: true, service: 'ultravox-voice-worker', version: '0.1.0', timestamp: new Date().toISOString() }),
      );
    }

    if (pathname === '/api/voice/token' && request.method === 'GET') {
      return withCors(await handleToken(request, env));
    }

    if (pathname === '/v1/audio/transcriptions' && request.method === 'POST') {
      return withCors(await authTranscribe(request, env));
    }

    if (pathname === '/v1/audio/clean' && request.method === 'POST') {
      return withCors(await authClean(request, env));
    }

    return withCors(new Response('Not found', { status: 404 }));
  },
} satisfies ExportedHandler<Env>;
