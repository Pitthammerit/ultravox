# Superwhisper — transcription pipeline, prompts, and mode templating

**Source:** binary inspection of Superwhisper 2.13.2 at `/Users/benjaminkurtz/Desktop/Contents/`. Companion to `superwhisper-architecture.md` (UI / state machine). This file focuses on what happens *between* "audio captured" and "text pasted" — language detection, the cleanup-prompt system, mode templating, and the post-LLM formatter pipeline.

**Why we care:** these are the parts that drive *accuracy* and *speed* (not UX). Two questions prompted the readout:

1. How is language detection handled — could it be faster?
2. Would custom prompts like *"if missing hello/bye, write appropriate greetings using the Name from Settings"* actually work in our current pipeline?

Spoiler for both: language detection is already optimal in our stack, and the second prompt **would not work today** because we have no variable substitution.

---

## 1. Language detection — they use Whisper's native auto-detect

Symbol-table evidence (from `MacOS/superwhisper`):
```
whisper_lang_auto_detect_with_state
%s: failed to auto-detect language
%s: auto-detected language: %s (p = %f)
WhisperContext / WhisperKit / WhisperKitManager
NLLanguageRecognizer (Apple's NaturalLanguage framework)
```

**How Whisper does it:** decode the first ~30s mel chunk, compute logits over the language tokens, pick argmax. Cost: a single forward pass through the encoder (already needed for transcription) + a tiny softmax. Effectively **free** — no separate language-detection step.

**What we do today** (`apps/worker/index.ts:262`):
```ts
if (language && language !== 'auto') params.language = language;
```
When the mode's `language` is `"auto"`, we **don't** pass `language` to Whisper → Whisper auto-detects. Same mechanism, same model, same speed. No change needed.

**Surface improvement worth doing:** the Whisper response object contains the detected language code. We currently throw it away. If we returned it and surfaced it in diagnostics ("Detected: de"), users can verify their auto-detect is working. ~10 lines.

---

## 2. Per-mode cleanup prompts — what Superwhisper actually ships

Superwhisper has **at least 5 distinct cleanup prompts** baked into the binary as constant strings, each with a different "specialist" persona, explicit DO/DON'T sections, and inline examples. The full text of three of them (extracted from the binary):

### 2.1 Email mode (verbatim)
```
You are an email formatting specialist. Your task is to transform user messages
into professional email format.
CRITICAL INSTRUCTION: Your response must ONLY contain the formatted email. Nothing else.

EMAIL STRUCTURE REQUIREMENTS:
1. Greeting: If the user already starts with a greeting (e.g. "Hello", "Hi", "Hey"),
   preserve it exactly and do NOT repeat it in the body. If no greeting is given,
   add "Hey there," (if no name) or "Hey [Name]," (if name provided).
2. Body: Clear paragraphs with corrected grammar. Do NOT repeat any words
   already used in the greeting line.
3. Sign-off: Use "Thanks," or "Cheers," (choose based on tone) unless sign off
   is given in the dictated message
4. NO additional content outside these elements
5. DO NOT INCLUDE A SUBJECT LINE

FORMATTING RULES:
- Use original content only - add nothing new
- Maintain the sender's tone and intent
- Fix grammar and punctuation
- Create logical paragraph breaks

WRONG BEHAVIOR - DO NOT DO THIS:
Wrong: Adding explanations, context, or content not in original
Wrong: Here's the formatted email: Hey there...
Wrong: Including signatures, names, or additional text after sign-off
Wrong: Changing "Hello" to "Hey" or any other greeting word
Wrong: "Hello there,
Hello, I am writing about..." (duplicating the greeting word in the body)
```

Followed by **four input/output example pairs** (curious whats happening with the project timeline → Hey there, / Curious, what's happening with the project timeline? / Thanks,) — i.e. classic few-shot prompting.

### 2.2 Default reformatting (verbatim)
```
You are a specialized text reformatting assistant. Your ONLY job is to clean
up and reformat the user's text input.
CRITICAL INSTRUCTION: Your response must ONLY contain the cleaned text. Nothing else.

WHAT YOU DO:
- Fix grammar, spelling, and punctuation
- Remove speech artifacts ("um", "uh", false starts, repetitions)
- Correct homophones and standardize numbers/dates
- Break content into paragraphs, aim for 2-5 sentences per paragraph
- Maintain the original tone and intent
- Improve readability by splitting the text into paragraphs or sentences and questions onto new lines
- Replace common emoji descriptions with the emoji itself smiley face -> 😊

WHAT YOU NEVER DO:
- Answer questions (only reformat the question itself)
- Add new content not in the original message
- Provide responses or solutions to requests
- Add greetings, sign-offs, or explanations

WRONG BEHAVIOR - DO NOT DO THIS:
User: "what's the weather like"
Wrong: I don't have access to current weather data, but you can check...
Correct: What's the weather like?

Remember: You are a text editor, NOT a conversational assistant. Only reformat, never respond.
```

### 2.3 Note-taking (verbatim, partial)
```
You are a note-taking specialist. Your job is to extract key information and
organize it into structured notes.
CRITICAL INSTRUCTION: Your response must ONLY contain the structured notes. Nothing else.
NOTE FORMATTING REQUIREMENTS:
1. Structure text for effective note taking
…
4. Extract only information present in original message
WRONG BEHAVIOR - DO NOT DO THIS:
Wrong: Adding interpretations or assumptions
```

Followed by examples that include `Project Status Update:` headers and `- Phase 1: Completed ahead of schedule`-style bullets — i.e. **the note prompt does produce headers and bullets** when the speaker's content suggests structure. Their note format isn't "title + paragraphs only" like ours.

### 2.4 Meeting transcript summarizer
Different prompt entirely — produces action-item lists with assigned people. Out of scope for v1 but a great mode-template for v1.5.

### 2.5 Context-aware reformatter (verbatim)
```
You are an AI assistant tasked with reformatting user messages for an active
application that the user has focused on.
Your goal is to adapt the message to fit the context of the application and
correct any spelling errors based on the vocabulary provided.
Context taken from the active application will be provided.
…
**PRIMARY RULE: PRESERVE THE ORIGINAL MESSAGE**
- Only make changes when you are absolutely certain they improve accuracy
- When in doubt, leave the original text unchanged

1. **Context Analysis**: Consider the application context, focused element,
   vocabulary, and names provided as background information…
3. **Self-Corrections**: Apply user corrections within the message.
   Example: "Let's meet at 8pm actually I mean 9pm" → "Let's meet at 9pm"
4. **Name Handling**:
   - **Direct messaging contexts**: Prefer actual names over usernames
   - **Group conversations**: Use @username when directly addressing someone
     and an exact username match exists in the names list
5. **URL/Email Formatting**: Convert spelled-out formats.
   Examples: "John at Example dot com" → "john@example.com"
```

This is what the user was asking about — Superwhisper *natively* injects the user's name, the active app, and the vocabulary list as **structured context** the model can reason over. It's not just a prompt suffix.

---

## 3. Variable substitution — they have a templating engine

Direct evidence in the binary (settings UI string):
> *"Use macro `{{user_message}}` to inject your dictacted text"*

Class names confirming the templating:
- `PromptRenderer`
- `PromptContext`
- `SystemContext`
- `Stencil` (Swift's Jinja-equivalent template engine)
- `PromptExample` (struct for input/output example pairs)

Per-mode toggleable context injection (from settings strings):
- **Application context** — frontmost app + screen content. *"Application context will grab information about the application currently in use and the information present on the screen, in your prompt refer to it as 'Application Context'."*
- **Clipboard context** — content copied 3s before recording. *"Refer to it as 'Clipboard context'."*
- **Selected text** — text highlighted at record start. *"Refer to it as 'Selected text'."*
- **System info** — OS version, system audio, etc. *"Details about your system and active app will be included in the prompt."*

Each is a per-mode opt-in. The mode editor UI lets you toggle them and reference them by name in your custom prompt.

**This is the missing piece in Ultravox.** Today our `promptSuffix` is a plain string — there's no `{{name}}`, no `{{frontmost_app}}`, no `{{clipboard}}`. So a user-written prompt like *"use Name from the Settings Panel"* literally tells the LLM "use Name from the Settings Panel" — there's nothing to substitute.

---

## 4. Few-shot examples per mode

The `PromptExample` Swift type and the inline examples in every prompt (visible in §2 above) confirm: each mode supports **input/output example pairs** that are interpolated into the prompt. UI hint:
> *"An example of the output you want from the AI language model"* / *"An example of your dictated voice input"*

This is dramatically cheaper than fine-tuning and dramatically more reliable than instruction-only prompts. Worth adopting.

---

## 5. Deterministic post-processors after the LLM

Class names from the binary:
```
AICleanupTransformer
EmailFormatter         AddressFormatter        CurrencyFormatter
ListFormatter          PhoneFormatter          TimeFormatter
URLFormatter           EmojiFormatter          MarkupFormatter
BritishSpellingFormatter   AmericanSpellingFormatter
```

These look like deterministic regex/lookup post-processors that run **after** the LLM cleanup, normalizing things the model is bad at:
- Phone numbers → E.164 / national format
- URLs / emails → canonical lowercase
- Currency / time / date → locale-specific
- British vs American spelling → consistent
- Emoji — *"smiley face → 😊"* (the prompt itself instructs this; the formatter probably enforces a canonical mapping)

The pattern: LLM does the high-variance work (paragraphing, voice preservation), formatters do the deterministic work (don't trust the model with phone digits).

---

## 6. Multiple transcription backends

Symbol/path evidence:
```
Transcription/CerebriumWhisper.swift   — their hosted Whisper @ ai.superwhisper.com
Transcription/Deepgram.swift           — Deepgram cloud
Transcription/ElevenLabs.swift         — ElevenLabs Scribe
Transcription/ModalWhisper.swift       — modal.com hosted
Transcription/OpenAIWhisper.swift      — OpenAI / Groq
WhisperKitManager / WhisperState        — local CoreML via WhisperKit
whisper_init_from_file_with_params      — local llama.cpp/whisper.cpp
```

**Behind a common interface.** They wire backend selection per-mode. Includes ElevenLabs Scribe — which is what the user mentioned earlier as a candidate for our list. So Scribe IS used by them, but as a **transcription backend** (STT), not as a cleanup LLM. The user's intuition was right; my earlier dismissal was wrong-context.

Also visible: VAD via `vad-v1.onnx` for voice-activity segmentation and per-mode toggleable speaker separation ("Identify Speakers", available with Nova/Parakeet only).

---

## 7. Local LLMs via llama.cpp + Metal + per-model jinja

The on-device cleanup path uses:
- `default.metallib` — Metal shaders for compute on Apple Silicon
- llama.cpp common chat-templating internals (Granite, DeepSeek, Qwen3, command_r7b, etc.)
- Per-model jinja templates in `Resources/ChatTemplates/`:
  - `llama-3.2.jinja`, `llama3.jinja`
  - `mistral.jinja`, `ministral.jinja`
  - `phi-2.jinja`
  - `gpt-oss.jinja`
  - `deepseek-r1.jinja`

These are the standard llama.cpp prompt-formatting templates per model family. Letting users run cleanup fully offline on their M-series Mac is the bigger story than which template is used.

For us: this is comparable to our Claude Code CLI integration, but more general (any local model). v1.5+ if at all.

---

## 8. App-aware mode selection (text_input_format)

`Resources/bundled_app_info.json` — covered in `superwhisper-architecture.md`. Hundreds of apps with `text_input_format` tags (`password`, `audio_metadata`, `design_parameters`, `configuration_settings`, `file_path`). Drives auto-mode selection. Our v1 `apps.json` plan is the same shape, just with ~15 entries.

---

## What this means for Ultravox — concrete plan

### Already correct, no action needed
- ✅ **Language detection** — we already pass `language` only when non-auto, so Whisper auto-detects natively. Same speed as Superwhisper.
- ✅ **Anti-injection wrapping** — our `<transcript>...</transcript>` + `ANTI_CHAT_PREAMBLE` is the same pattern as theirs ("CRITICAL INSTRUCTION: Your response must ONLY contain…").
- ✅ **Vocabulary as Whisper hint + post-LLM regex** — equivalent mechanism.

### High-impact gaps to close

The next four items are ordered by ROI. Each one is implementable independently.

#### A. Variable substitution in prompts (HIGH ROI, MEDIUM EFFORT)

Without this, the user's example prompts (*"use Name from the Settings Panel"*, *"if missing hello/bye, write appropriate greetings"*) **will not work as intended**. The LLM sees the literal string "Name from the Settings Panel" with nothing to substitute.

**Implementation:**
1. Add a `renderPrompt(template, ctx)` helper to the worker. Use a tiny mustache-style replacer (`{{var}}` → `ctx.var`). No new dep — 10 lines.
2. Build a `PromptContext` server-side from the form fields:
   ```ts
   interface PromptContext {
     userName?: string;          // from settings
     frontmostApp?: string;      // bundle id label
     frontmostBundleId?: string;
     selectedText?: string;      // optional, opt-in
     clipboardText?: string;     // optional, opt-in
     date: string;               // ISO date for timestamps
     time: string;               // HH:MM
     language?: string;          // mode language
   }
   ```
3. Wire the client to send `userName` (already in settings as `userName`), `frontmostApp` (we have `getFrontmostApp()`), and a per-mode opt-in for `clipboardText`/`selectedText`.
4. Apply substitution to BOTH the system prompt template AND the user's `promptSuffix` before they're sent to the LLM.

After this, the user's prompt becomes:
```
If a greeting is missing, add one appropriate to the tone using the
recipient's name when known. The user's display name is {{userName}}.
For sign-offs, use "Thanks," for formal contexts and "Cheers," for casual.
```
…and *that* will work.

**Files touched:** `apps/worker/index.ts` (renderer + context build), `apps/ultravox/src/lib/transcribe.ts` (send the new fields), `apps/ultravox/src/lib/store-bridge.ts` (no change — `userName` exists), `apps/ultravox/src/panels/ModeEditor.tsx` (show available variables next to the prompt textarea).

#### B. Per-mode few-shot examples (HIGH ROI, LOW EFFORT)

Add an `examples: Array<{ input: string; output: string }>` field to `VoiceMode`. Render them into the prompt as:
```
Here are examples of the input → output transformation:

Input: <input1>
Output: <output1>

Input: <input2>
Output: <output2>
```

Two examples per mode is usually enough. UX: a small repeater control under the prompt suffix.

**Files touched:** `voiceModes.ts` (type), `ModeEditor.tsx` (UI), `transcribe.ts` (pass through), `apps/worker/index.ts` (interpolate into the system prompt).

#### C. Rewrite the built-in cleanup prompts to match Superwhisper's structure (MEDIUM ROI, LOW EFFORT)

Our prompts are concise and rule-based; Superwhisper's are verbose, persona-led, and include a "WRONG BEHAVIOR — DO NOT DO THIS" section followed by examples. The verbose form is empirically better at preventing meta-commentary, especially on smaller models.

Concrete deltas:
- **Note**: stop forbidding `#`. Allow real Markdown (heading, sub-headings, bullet lists). Add a per-mode `markdownStyle: "rich" | "plain"` flag for users who paste into chat fields where `#` is ugly.
- **List**: split intent detection. Sequential ("first/then/also") → numbered list. Enumeration ("X, Y, and Z") → bullets. No clear list intent → prose. (Already drafted in our previous discussion — implement now.)
- **Email**: add the greeting/sign-off rules, optionally with `{{userName}}` substitution from §A.
- **Add a "Default" reformatter mode** matching Superwhisper's general-purpose §2.2 — drops fillers, fixes grammar, paragraphizes. Useful when no domain-specific mode applies.

**Files touched:** `apps/worker/index.ts` (`CLEANUP_PROMPTS` + new prompt for default reformatter).

#### D. Surface detected language in diagnostics (LOW ROI, TINY EFFORT)

The Cloudflare AI binding's Whisper response includes the detected language code. Pass it through in the `TranscribeResponse` and `CleanResponse` shapes, surface in `transcribe-result` log entries.

**Files touched:** `apps/worker/index.ts` (extract from response, include in JSON), `apps/ultravox/src/lib/transcribe.ts` (consume), `apps/ultravox/src/lib/debugLog.ts` (display).

### Out of scope for v1 (revisit v1.5+)

- **Local LLMs via llama.cpp** — Claude Code CLI already covers most of this need.
- **Multi-backend ASR** — Cloudflare AI Whisper is good enough for v1. Adding Deepgram / ElevenLabs / Groq is a marketplace play, not a quality play.
- **Deterministic post-formatters** (phone, URL, currency) — do this when we have data showing the LLM is consistently wrong on a category. Premature today.
- **Speaker diarization** — niche, requires backend that supports it.
- **Real-time streaming results** — major architectural change. Worth a dedicated readout if/when we tackle it.
- **Application/clipboard/selection context capture** — getting selected text from a focused field on macOS requires Accessibility API queries beyond our current scope. Frontmost-app label only, for now.

### Ordering recommendation

If we ship one thing: **A (variable substitution)** — it makes per-mode prompting a real product surface instead of a glorified comment field.

Combined with **B (few-shot)** and **C (rewrite prompts to Superwhisper's pattern)** in a single batch, we close the gap on output quality.

**D (detected language in diagnostics)** is a nice-to-have with debugging value; ship whenever convenient.

---

## Out of scope of this note

- Did not extract the entire prompt for every Superwhisper mode — only the three with the most informative content (email, default reformatter, context-aware). The meeting summarizer and note-taking prompts are partially captured.
- Did not measure timing differences between local llama.cpp cleanup and Cerebrium cleanup — only verified both code paths exist.
- Did not enumerate every formatter class implementation — only confirmed the class names exist in the symbol table.
- This is pattern-level pattern recognition, not source — no code copying, just structure.
