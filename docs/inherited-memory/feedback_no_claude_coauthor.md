---
name: never add Co-Authored-By Claude in commits
description: User wants commits attributed to him only (the natural git author). Don't append Co-Authored-By Claude trailers.
type: feedback
originSessionId: 14267211-adf6-4d5c-bfcc-c79c7bca633a
---
Never add `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>` (or any other Claude co-author trailer) to commit messages.

**Why:** User's explicit preference for attribution under his own name on GitHub. The natural git author is already Benjamin Kurtz; the co-author line muddies that signal.

**How to apply:** When crafting commit messages, omit the Co-Authored-By trailer entirely. The body should end after the last paragraph. Existing commits with the trailer don't need to be rewritten — just stop adding it from now on.
