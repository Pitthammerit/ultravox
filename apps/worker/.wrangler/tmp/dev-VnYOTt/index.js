var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// ../../../../../../../usr/local/lib/node_modules/wrangler/node_modules/unenv/dist/runtime/_internal/utils.mjs
// @__NO_SIDE_EFFECTS__
function createNotImplementedError(name) {
  return new Error(`[unenv] ${name} is not implemented yet!`);
}
__name(createNotImplementedError, "createNotImplementedError");

// ../../../../../../../usr/local/lib/node_modules/wrangler/node_modules/unenv/dist/runtime/node/internal/perf_hooks/performance.mjs
var _timeOrigin = globalThis.performance?.timeOrigin ?? Date.now();
var _performanceNow = globalThis.performance?.now ? globalThis.performance.now.bind(globalThis.performance) : () => Date.now() - _timeOrigin;
var nodeTiming = {
  name: "node",
  entryType: "node",
  startTime: 0,
  duration: 0,
  nodeStart: 0,
  v8Start: 0,
  bootstrapComplete: 0,
  environment: 0,
  loopStart: 0,
  loopExit: 0,
  idleTime: 0,
  uvMetricsInfo: {
    loopCount: 0,
    events: 0,
    eventsWaiting: 0
  },
  detail: void 0,
  toJSON() {
    return this;
  }
};
var PerformanceEntry = class {
  static {
    __name(this, "PerformanceEntry");
  }
  __unenv__ = true;
  detail;
  entryType = "event";
  name;
  startTime;
  constructor(name, options) {
    this.name = name;
    this.startTime = options?.startTime || _performanceNow();
    this.detail = options?.detail;
  }
  get duration() {
    return _performanceNow() - this.startTime;
  }
  toJSON() {
    return {
      name: this.name,
      entryType: this.entryType,
      startTime: this.startTime,
      duration: this.duration,
      detail: this.detail
    };
  }
};
var PerformanceMark = class PerformanceMark2 extends PerformanceEntry {
  static {
    __name(this, "PerformanceMark");
  }
  entryType = "mark";
  constructor() {
    super(...arguments);
  }
  get duration() {
    return 0;
  }
};
var PerformanceMeasure = class extends PerformanceEntry {
  static {
    __name(this, "PerformanceMeasure");
  }
  entryType = "measure";
};
var PerformanceResourceTiming = class extends PerformanceEntry {
  static {
    __name(this, "PerformanceResourceTiming");
  }
  entryType = "resource";
  serverTiming = [];
  connectEnd = 0;
  connectStart = 0;
  decodedBodySize = 0;
  domainLookupEnd = 0;
  domainLookupStart = 0;
  encodedBodySize = 0;
  fetchStart = 0;
  initiatorType = "";
  name = "";
  nextHopProtocol = "";
  redirectEnd = 0;
  redirectStart = 0;
  requestStart = 0;
  responseEnd = 0;
  responseStart = 0;
  secureConnectionStart = 0;
  startTime = 0;
  transferSize = 0;
  workerStart = 0;
  responseStatus = 0;
};
var PerformanceObserverEntryList = class {
  static {
    __name(this, "PerformanceObserverEntryList");
  }
  __unenv__ = true;
  getEntries() {
    return [];
  }
  getEntriesByName(_name, _type) {
    return [];
  }
  getEntriesByType(type) {
    return [];
  }
};
var Performance = class {
  static {
    __name(this, "Performance");
  }
  __unenv__ = true;
  timeOrigin = _timeOrigin;
  eventCounts = /* @__PURE__ */ new Map();
  _entries = [];
  _resourceTimingBufferSize = 0;
  navigation = void 0;
  timing = void 0;
  timerify(_fn, _options) {
    throw createNotImplementedError("Performance.timerify");
  }
  get nodeTiming() {
    return nodeTiming;
  }
  eventLoopUtilization() {
    return {};
  }
  markResourceTiming() {
    return new PerformanceResourceTiming("");
  }
  onresourcetimingbufferfull = null;
  now() {
    if (this.timeOrigin === _timeOrigin) {
      return _performanceNow();
    }
    return Date.now() - this.timeOrigin;
  }
  clearMarks(markName) {
    this._entries = markName ? this._entries.filter((e) => e.name !== markName) : this._entries.filter((e) => e.entryType !== "mark");
  }
  clearMeasures(measureName) {
    this._entries = measureName ? this._entries.filter((e) => e.name !== measureName) : this._entries.filter((e) => e.entryType !== "measure");
  }
  clearResourceTimings() {
    this._entries = this._entries.filter((e) => e.entryType !== "resource" || e.entryType !== "navigation");
  }
  getEntries() {
    return this._entries;
  }
  getEntriesByName(name, type) {
    return this._entries.filter((e) => e.name === name && (!type || e.entryType === type));
  }
  getEntriesByType(type) {
    return this._entries.filter((e) => e.entryType === type);
  }
  mark(name, options) {
    const entry = new PerformanceMark(name, options);
    this._entries.push(entry);
    return entry;
  }
  measure(measureName, startOrMeasureOptions, endMark) {
    let start;
    let end;
    if (typeof startOrMeasureOptions === "string") {
      start = this.getEntriesByName(startOrMeasureOptions, "mark")[0]?.startTime;
      end = this.getEntriesByName(endMark, "mark")[0]?.startTime;
    } else {
      start = Number.parseFloat(startOrMeasureOptions?.start) || this.now();
      end = Number.parseFloat(startOrMeasureOptions?.end) || this.now();
    }
    const entry = new PerformanceMeasure(measureName, {
      startTime: start,
      detail: {
        start,
        end
      }
    });
    this._entries.push(entry);
    return entry;
  }
  setResourceTimingBufferSize(maxSize) {
    this._resourceTimingBufferSize = maxSize;
  }
  addEventListener(type, listener, options) {
    throw createNotImplementedError("Performance.addEventListener");
  }
  removeEventListener(type, listener, options) {
    throw createNotImplementedError("Performance.removeEventListener");
  }
  dispatchEvent(event) {
    throw createNotImplementedError("Performance.dispatchEvent");
  }
  toJSON() {
    return this;
  }
};
var PerformanceObserver = class {
  static {
    __name(this, "PerformanceObserver");
  }
  __unenv__ = true;
  static supportedEntryTypes = [];
  _callback = null;
  constructor(callback) {
    this._callback = callback;
  }
  takeRecords() {
    return [];
  }
  disconnect() {
    throw createNotImplementedError("PerformanceObserver.disconnect");
  }
  observe(options) {
    throw createNotImplementedError("PerformanceObserver.observe");
  }
  bind(fn) {
    return fn;
  }
  runInAsyncScope(fn, thisArg, ...args) {
    return fn.call(thisArg, ...args);
  }
  asyncId() {
    return 0;
  }
  triggerAsyncId() {
    return 0;
  }
  emitDestroy() {
    return this;
  }
};
var performance = globalThis.performance && "addEventListener" in globalThis.performance ? globalThis.performance : new Performance();

// ../../../../../../../usr/local/lib/node_modules/wrangler/node_modules/@cloudflare/unenv-preset/dist/runtime/polyfill/performance.mjs
globalThis.performance = performance;
globalThis.Performance = Performance;
globalThis.PerformanceEntry = PerformanceEntry;
globalThis.PerformanceMark = PerformanceMark;
globalThis.PerformanceMeasure = PerformanceMeasure;
globalThis.PerformanceObserver = PerformanceObserver;
globalThis.PerformanceObserverEntryList = PerformanceObserverEntryList;
globalThis.PerformanceResourceTiming = PerformanceResourceTiming;

// index.ts
var MAX_FILE_SIZE = 25 * 1024 * 1024;
var API_TIMEOUT_MS = 3e4;
var TOKEN_TTL_SEC = 300;
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
__name(timingSafeEqual, "timingSafeEqual");
async function importHmacKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}
__name(importHmacKey, "importHmacKey");
function toBase64Url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
__name(toBase64Url, "toBase64Url");
async function signToken(subject, exp, secret) {
  const payload = `${subject}.${exp}`;
  const key = await importHmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return `${payload}.${toBase64Url(sig)}`;
}
__name(signToken, "signToken");
async function verifyHmacToken(token, secret) {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [subject, expStr, sig] = parts;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1e3)) return false;
  const payload = `${subject}.${expStr}`;
  const key = await importHmacKey(secret);
  const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const expected = toBase64Url(sigBuf);
  return timingSafeEqual(expected, sig);
}
__name(verifyHmacToken, "verifyHmacToken");
async function verifyAuth(request, env) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;
  const token = authHeader.slice(7);
  if (env.VOICE_HMAC_SECRET && await verifyHmacToken(token, env.VOICE_HMAC_SECRET)) return true;
  return !!env.DEV_BEARER_TOKEN && timingSafeEqual(token, env.DEV_BEARER_TOKEN);
}
__name(verifyAuth, "verifyAuth");
async function handleToken(_request, env) {
  if (!env.VOICE_HMAC_SECRET) {
    return Response.json(
      { ok: false, token: "", expiresIn: 0, error: "VOICE_HMAC_SECRET not configured" },
      { status: 500 }
    );
  }
  const exp = Math.floor(Date.now() / 1e3) + TOKEN_TTL_SEC;
  const token = await signToken("anon", exp, env.VOICE_HMAC_SECRET);
  return Response.json({ ok: true, token, expiresIn: TOKEN_TTL_SEC });
}
__name(handleToken, "handleToken");
function withAuth(handler) {
  return async (request, env) => {
    if (!await verifyAuth(request, env)) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    return handler(request, env);
  };
}
__name(withAuth, "withAuth");
var CLEANUP_PROMPTS = {
  prose: `You are cleaning up dictated speech. Remove filler words (um, uh, \xE4hm, also).
Fix punctuation and capitalization. Preserve question marks where the speaker's
intonation suggested a question. Fix obvious speech-to-text errors.
**Reply in the same language as the input \u2014 do not translate.**
Preserve voice, tone, and exact meaning. Do NOT paraphrase, summarise, or rewrite.
Return only the cleaned text \u2014 no preamble, no quotes, no explanation.`,
  list: `You are cleaning up dictated speech. Remove filler words (um, uh, \xE4hm, also).
Fix punctuation and capitalization. Fix obvious speech-to-text errors.
**Reply in the same language as the input \u2014 do not translate.**
If the user clearly enumerates a list (using "first\u2026 second\u2026 third\u2026",
"one\u2026 two\u2026 three\u2026", or comma-separated items after a phrase like "I need\u2026"),
format the items as a markdown bullet list with "- " prefix, one per line.
Otherwise return prose.
Preserve voice, tone, and exact meaning. Return only the cleaned text.`,
  note: `You are cleaning up dictated speech and lightly structuring it as a note.
Remove filler words (um, uh, \xE4hm). Fix punctuation, capitalization, and obvious
speech-to-text errors.
**Reply in the same language as the input \u2014 do not translate.**
Structure as a brief note: optional first-line heading (only if the speaker
clearly named a topic), body in 1-3 short paragraphs. Maximum 5 sentences total.
Preserve voice, tone, and exact meaning. Return only the cleaned note text.`
};
async function parseMultipartRequest(request) {
  const contentType = request.headers.get("Content-Type") ?? "";
  if (!contentType.includes("multipart/form-data") && !contentType.includes("boundary=")) return null;
  const formData = await request.formData();
  const file = formData.get("file") ?? formData.get("audio");
  if (!file) return null;
  if (file.size > MAX_FILE_SIZE) throw new Error(`File too large (max ${MAX_FILE_SIZE / 1024 / 1024} MB)`);
  const audio = await file.arrayBuffer();
  const language = String(formData.get("language") ?? "auto");
  const cleanupRaw = String(formData.get("cleanup") ?? "prose").toLowerCase();
  const cleanup = cleanupRaw === "list" || cleanupRaw === "note" || cleanupRaw === "raw" ? cleanupRaw : "prose";
  const vocabularyHints = String(formData.get("vocabularyHints") ?? "");
  const promptSuffix = String(formData.get("promptSuffix") ?? "");
  const providerRaw = String(formData.get("provider") ?? "openrouter").toLowerCase();
  const provider = providerRaw === "none" ? "none" : "openrouter";
  const model = String(formData.get("model") ?? "");
  const autocapitalize = String(formData.get("autocapitalize") ?? "false") === "true";
  let vocabularyReplacements = [];
  const replacementsRaw = formData.get("vocabularyReplacements");
  if (typeof replacementsRaw === "string" && replacementsRaw.trim()) {
    try {
      const parsed = JSON.parse(replacementsRaw);
      if (Array.isArray(parsed)) {
        vocabularyReplacements = parsed.filter(
          (e) => e && typeof e.input === "string" && typeof e.replace === "string"
        );
      }
    } catch {
    }
  }
  return { audio, language, cleanup, vocabularyHints, vocabularyReplacements, promptSuffix, provider, model, autocapitalize };
}
__name(parseMultipartRequest, "parseMultipartRequest");
function arrayBufferToBase64(buffer) {
  return new Uint8Array(buffer).toBase64();
}
__name(arrayBufferToBase64, "arrayBufferToBase64");
async function transcribeAudio(audioBase64, language, vocabularyHints, env) {
  const params = { audio: audioBase64 };
  if (language && language !== "auto") params.language = language;
  if (vocabularyHints.trim()) {
    params.prompt = `Names and terms that may appear: ${vocabularyHints.trim()}.`;
  }
  const response = await env.AI.run("@cf/openai/whisper-large-v3-turbo", params);
  if (!response || typeof response !== "object" || !("text" in response) || typeof response.text !== "string") {
    throw new Error("Invalid Whisper response");
  }
  return response.text;
}
__name(transcribeAudio, "transcribeAudio");
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
__name(escapeRegExp, "escapeRegExp");
function applyVocabularyReplacements(text, replacements) {
  let out = text;
  for (const { input, replace } of replacements) {
    if (!input) continue;
    out = out.replace(new RegExp(escapeRegExp(input), "gi"), replace);
  }
  return out;
}
__name(applyVocabularyReplacements, "applyVocabularyReplacements");
function autocapitalizeText(text) {
  return text.replace(/(^|[.!?]\s+)([a-zäöüß])/g, (_, sep, ch) => sep + ch.toUpperCase());
}
__name(autocapitalizeText, "autocapitalizeText");
async function cleanupText(text, cleanup, provider, model, promptSuffix, env) {
  if (cleanup === "raw" || provider === "none") return text;
  const trimmed = text.trim();
  if (!trimmed) return "";
  let systemPrompt = CLEANUP_PROMPTS[cleanup] ?? CLEANUP_PROMPTS.prose;
  if (promptSuffix.trim()) systemPrompt += `

Additional context:
${promptSuffix.trim()}`;
  const effectiveModel = model || "anthropic/claude-haiku-4-5-20251001";
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://ultravox.app",
        "X-Title": "ultravox-voice-worker"
      },
      body: JSON.stringify({
        model: effectiveModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: trimmed }
        ],
        temperature: 0.3,
        max_tokens: 2e3
      }),
      signal: controller.signal
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenRouter ${response.status}: ${errText}`);
    }
    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("Invalid OpenRouter response");
    return content;
  } finally {
    clearTimeout(timeoutId);
  }
}
__name(cleanupText, "cleanupText");
async function handleTranscribe(request, env) {
  let parsed;
  try {
    parsed = await parseMultipartRequest(request);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
  if (!parsed) return Response.json({ error: "No audio file provided" }, { status: 400 });
  try {
    const text = await transcribeAudio(
      arrayBufferToBase64(parsed.audio),
      parsed.language,
      parsed.vocabularyHints,
      env
    );
    return Response.json({ text });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
__name(handleTranscribe, "handleTranscribe");
async function handleClean(request, env) {
  let parsed;
  try {
    parsed = await parseMultipartRequest(request);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
  if (!parsed) return Response.json({ error: "No audio file provided" }, { status: 400 });
  try {
    const rawWhisperText = await transcribeAudio(
      arrayBufferToBase64(parsed.audio),
      parsed.language,
      parsed.vocabularyHints,
      env
    );
    const replacedText = applyVocabularyReplacements(rawWhisperText, parsed.vocabularyReplacements);
    let cleanedText = await cleanupText(
      replacedText,
      parsed.cleanup,
      parsed.provider,
      parsed.model,
      parsed.promptSuffix,
      env
    );
    if (parsed.autocapitalize) cleanedText = autocapitalizeText(cleanedText);
    return Response.json({ text: cleanedText, raw: rawWhisperText });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
__name(handleClean, "handleClean");
var authTranscribe = withAuth(handleTranscribe);
var authClean = withAuth(handleClean);
function withCors(response) {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  headers.set("Access-Control-Max-Age", "86400");
  return new Response(response.body, { status: response.status, headers });
}
__name(withCors, "withCors");
var index_default = {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (request.method === "OPTIONS") return withCors(new Response(null, { status: 204 }));
    if (pathname === "/health") {
      return withCors(
        Response.json({ ok: true, service: "ultravox-voice-worker", version: "0.1.0", timestamp: (/* @__PURE__ */ new Date()).toISOString() })
      );
    }
    if (pathname === "/api/voice/token" && request.method === "GET") {
      return withCors(await handleToken(request, env));
    }
    if (pathname === "/v1/audio/transcriptions" && request.method === "POST") {
      return withCors(await authTranscribe(request, env));
    }
    if (pathname === "/v1/audio/clean" && request.method === "POST") {
      return withCors(await authClean(request, env));
    }
    return withCors(new Response("Not found", { status: 404 }));
  }
};

// ../../../../../../../usr/local/lib/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// .wrangler/tmp/bundle-9rjZyJ/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default
];
var middleware_insertion_facade_default = index_default;

// ../../../../../../../usr/local/lib/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-9rjZyJ/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
