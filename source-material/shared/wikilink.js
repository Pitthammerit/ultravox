/**
 * Shared wikilink resolver — used by both the UI (MarkdownView) and the
 * server-side WikiIndex (extracts outbound link targets per entry).
 *
 * Pure functions, no DOM / no Node-specific imports — safe to import in
 * either runtime.
 *
 * Resolution rules (target inside [[ ]]):
 *   - "raw-<sub>-<rest>"          → { kind: 'raw',  path: 'raw/<sub>/<rest>.md' }
 *   - "raw/<…>" or "raw/<…>.md"   → { kind: 'raw',  path: 'raw/<…>.md' }
 *   - "wiki/x/y" / "x/y"          → { kind: 'wiki', path: 'wiki/x/y.md' }
 *   - bare slug (no slash)        → null  (unresolved — rendered muted)
 *   - "output/…"                  → null  (never an in-vault target)
 */

/**
 * @param {string} target
 * @returns {{ kind: 'wiki' | 'raw', path: string } | null}
 */
export function resolveWikilink(target) {
  let t = String(target).trim()
  // Obsidian-style raw refs: [[raw-snippets-2026-04-26-…]] — flat-dash form
  // Resolve to raw/<subfolder>/<rest>.md.
  if (t.startsWith('raw-')) {
    const parts = t.split('-')
    if (parts.length >= 3) {
      const subfolder = parts[1]
      const slug = parts.slice(2).join('-').replace(/\.md$/, '')
      if (slug) return { kind: 'raw', path: `raw/${subfolder}/${slug}.md` }
    }
    return null
  }
  // Already-slashed raw refs: [[raw/snippets/foo]] or [[raw/snippets/foo.md]]
  if (t.startsWith('raw/')) {
    const cleaned = t.replace(/\.md$/, '')
    return { kind: 'raw', path: `${cleaned}.md` }
  }
  // wiki entries
  if (t.startsWith('wiki/')) t = t.slice(5)
  t = t.replace(/\.md$/, '')
  if (!t.includes('/')) return null
  if (t.startsWith('output/')) return null
  return { kind: 'wiki', path: `wiki/${t}.md` }
}

/**
 * Human-friendly label for a wikilink target (last path segment, no extension).
 * @param {string} target
 * @returns {string}
 */
export function labelForTarget(target) {
  return (
    String(target)
      .replace(/^wiki\//, '')
      .replace(/^raw\//, '')
      .replace(/\.md$/, '')
      .split('/')
      .pop() || target
  )
}
