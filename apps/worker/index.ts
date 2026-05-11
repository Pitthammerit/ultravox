/**
 * Ultravox Voice Worker
 *
 * Cloudflare Worker for audio transcription. Acts as a free, no-key Whisper
 * proxy for the desktop app: clients obtain a short-lived HMAC bearer token
 * from /api/voice/token, then POST audio to /v1/audio/transcriptions.
 *
 * LLM cleanup is NOT performed here. The /v1/audio/clean endpoint was
 * removed in v0.19.0 — clients now hit OpenRouter directly with the user's
 * own API key (stored in macOS Keychain) or use Claude Code locally. This
 * keeps the worker key-free and the user's text body off our servers.
 *
 * Endpoints:
 * - GET  /api/voice/token           — issue a 5-min HMAC bearer token
 * - POST /v1/audio/transcriptions   — OpenAI-compatible Whisper transcription
 * - POST /v1/audio/clean            — 410 Gone (removed; clients must upgrade)
 * - GET  /health                    — liveness check
 */

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB
const TOKEN_TTL_SEC = 300; // 5 minutes

interface Env {
  AI: Ai;
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
// Multipart parsing
// ---------------------------------------------------------------------------

type ParsedRequest = {
  audio: ArrayBuffer;
  language: string;
  vocabularyHints: string;
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
  const vocabularyHints = String(formData.get('vocabularyHints') ?? '');

  return { audio, language, vocabularyHints };
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

const authTranscribe = withAuth(handleTranscribe);

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
        Response.json({ ok: true, service: 'ultravox-voice-worker', version: '0.3.0', timestamp: new Date().toISOString() }),
      );
    }

    if (pathname === '/api/voice/token' && request.method === 'GET') {
      return withCors(await handleToken(request, env));
    }

    if (pathname === '/v1/audio/transcriptions' && request.method === 'POST') {
      return withCors(await authTranscribe(request, env));
    }

    // Removed in v0.19.0 — cleanup is now client-side (BYO OpenRouter key
    // in macOS Keychain, or local Claude Code CLI). Old clients that still
    // hit this endpoint get a clear upgrade message instead of a 404.
    if (pathname === '/v1/audio/clean' && request.method === 'POST') {
      return withCors(
        Response.json(
          {
            error:
              'The /v1/audio/clean endpoint was removed. Update Ultravox to v0.19.0+ — cleanup now runs client-side with your own OpenRouter API key or via the local Claude Code CLI.',
          } satisfies ErrorResponse,
          { status: 410 },
        ),
      );
    }

    return withCors(new Response('Not found', { status: 404 }));
  },
} satisfies ExportedHandler<Env>;
