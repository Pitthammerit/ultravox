---
name: OpenRouter API key strategy (admin vs regular users)
description: How OpenRouter keys are scoped per user role in 2ndBrain — affects auth, settings UI, and AI ingestion routing
type: project
originSessionId: b28934e9-49a4-405e-9ad7-45ca2238a22c
---
OpenRouter API key handling differs by user role:

- **Admin users (Benjamin and similar)**: configure their own OpenRouter API key in Settings. Key is per-user, stored in their settings.
- **Regular published users**: use a centrally-defined OpenRouter key (TBD — bundled in app, fetched from a backend, or proxied through a server endpoint). To be defined when the app is published more broadly.

**Why:** Admins iterate on prompts and burn through cost; they own their billing. Regular users get a managed/metered experience with a key they don't see.

**How to apply:** When designing the multi-user login feature, the Settings UI for OpenRouter API key should only be visible/editable for admin-role accounts. Regular users either don't see the field or see a read-only "managed" indicator. The AI ingestion router (`app/server/ai/router.js`) should look up the key based on the requesting user's role at request time, not from a global env var alone.
