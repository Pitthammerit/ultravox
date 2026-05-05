---
name: app/shared is canonical home for cross-runtime helpers
description: Logic used by both Node server and CF Worker must live in app/shared/, not be duplicated
type: feedback
originSessionId: a487585b-bfcc-4610-8f96-c7ea7583ba5e
---
When adding logic touched by both `app/server/` (Node Hono) and `app/worker/` (CF Worker), put it in `app/shared/`. Imports work from both sides because the codebase is ESM-only.

**Why:** The 2026-05-01 audit found 6+ duplicated helpers (slugify, frontmatter parse, sha256, detectLanguage, hmac, pathSafety) with subtle algorithm divergence. Bug fixes had to be made twice and diverged silently (e.g. worker slugify used NFKD so ü→u instead of ü→ue).

**How to apply:** Before writing any helper inside `app/server/` or `app/worker/`, grep the other side. If it exists or could exist there too, write it once in `app/shared/` and import from both.
