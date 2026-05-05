---
name: dev verification stays on localhost first
description: User explicitly said "check tun wir allerdings alles erstmal über localhost". Testing/smoke happens locally before deploy.
type: feedback
originSessionId: 14267211-adf6-4d5c-bfcc-c79c7bca633a
---
All functional verification (smoke tests, browser previews, end-to-end checks) happens on localhost first. Deploy to Cloudflare is a separate step that comes after local sign-off.

**Why:** Faster iteration, no deploy-cycle latency, no hot path touching production users (the eaglevault.app side runs live).

**How to apply:**
- When verifying a change, drive the local preview server (port 5173 / 8787), don't gate on the CF Worker
- Don't dispatch CF deploy steps unless the user explicitly asks
- The CF subdomain (`brain.eaglevault.app`) gets set up by the user manually in CF dashboard once main is pushed; we don't auto-deploy from CI
