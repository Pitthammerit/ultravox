---
name: Always use AskUserQuestion tool for questions
description: Whenever asking the user a clarifying or decision question, use the AskUserQuestion tool — not plain prose with A/B/C options
type: feedback
originSessionId: 60ec4ada-e1fd-4aa7-b88e-0bba5d5d7b3b
---
When asking the user a clarifying or decision question, ALWAYS use the `AskUserQuestion` tool rather than plain-text A/B/C/D in a message.

**Why:** User explicitly requested this, and asked it be remembered for future sessions. The tool gives them a proper picker UI with chip headers, descriptions, and an automatic "Other" escape hatch — much better UX than scanning prose options.

**How to apply:**
- Any time the next sensible action is to ask the user something with bounded choices, call `AskUserQuestion` (load via ToolSearch if deferred).
- One question per call when possible (multi-question batches only if truly parallel).
- Lead with the recommended option and tag it `(Recommended)` per the tool's guidance.
- Don't include an explicit "Other" option — the tool adds one automatically.
- Open-ended free-text questions (e.g. "what's your project name?") are fine as plain prose; the tool is for choices.
