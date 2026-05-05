// Wiki path validator — wiki/<category>/<slug>.md
//
// Tradeoff: existing vaults contain category folders like `_meta` and
// sidecar files like `foo.md.conflicted-2026-….md`, so we cannot require
// strict `[a-z0-9]` slugs. Instead we forbid the bytes that actually
// matter for path safety: traversal sequences, backslashes, slashes inside
// segments, leading-dot hidden files, NUL, and Unicode normalization
// tricks. Anything else is allowed.
const SAFE_WIKI = /^wiki\/[^./\\\0][^/\\\0]*\/[^./\\\0][^/\\\0]*\.md$/;

export function validateWikiPath(input) {
  if (typeof input !== 'string' || !input) return { ok: false, reason: 'not-string' };

  // Reject if NFC normalization changes the string (combining chars, lookalike attacks)
  if (input.normalize('NFC') !== input) return { ok: false, reason: 'unicode-normalized' };

  // Reject non-ASCII bytes outright. Filenames in the vault are always ASCII;
  // anything else is either a normalization trick or accidental input.
  if (/[^\x20-\x7E]/.test(input)) return { ok: false, reason: 'non-ascii' };

  // Reject path separators and traversal markers anywhere in the string
  if (input.includes('\\') || input.includes('//') || input.includes('\0')) {
    return { ok: false, reason: 'illegal-chars' };
  }
  if (input.includes('..')) return { ok: false, reason: 'traversal' };

  if (!SAFE_WIKI.test(input)) return { ok: false, reason: 'shape' };

  return { ok: true, path: input };
}
