import yaml from 'js-yaml';

const RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/**
 * Parse YAML frontmatter from markdown text.
 * @param {string} text
 * @returns {{ frontmatter: Record<string, any>, body: string }}
 */
export function parseFrontmatter(text) {
  if (typeof text !== 'string' || !text.length) return { frontmatter: {}, body: text || '' };
  // Strip BOM
  const stripped = text.replace(/^﻿/, '');
  const m = stripped.match(RE);
  if (!m) return { frontmatter: {}, body: stripped };
  let frontmatter = {};
  try {
    const parsed = yaml.load(m[1]);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) frontmatter = parsed;
  } catch (err) {
    throw new Error(`[frontmatter] YAML parse failed: ${err.message}`);
  }
  return { frontmatter, body: m[2] };
}

export function stringifyFrontmatter(frontmatter, body) {
  const head = yaml.dump(frontmatter, { lineWidth: 0, noRefs: true }).trimEnd();
  return `---\n${head}\n---\n${body}`;
}
