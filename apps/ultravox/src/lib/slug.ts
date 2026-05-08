/**
 * Convert an arbitrary string into a URL-safe slug.
 *   "Sales emails"   → "sales-emails"
 *   "B2B Email!!"    → "b2b-email"
 *   "  -- foo  bar"  → "foo-bar"
 *   "✨"             → "" (caller decides on a fallback)
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    // German transliteration MUST happen before NFKD or the umlauts get
    // decomposed (ä → a + ̈) and the combining mark is stripped, leaving
    // plain "a" instead of "ae".
    .replace(/ß/g, "ss")
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")  // strip remaining diacritics
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Ensure the candidate slug is unique among `existing`. If a collision is
 * found, append `-2`, `-3`, etc. until the slug is unique. If `currentId`
 * is supplied (when editing — but we shouldn't change ID after first save
 * anyway), it's excluded from the collision check.
 */
export function uniqueSlug(
  candidate: string,
  existing: Iterable<string>,
  currentId?: string,
): string {
  const taken = new Set<string>();
  for (const id of existing) {
    if (id !== currentId) taken.add(id);
  }
  if (!taken.has(candidate)) return candidate;
  let i = 2;
  while (taken.has(`${candidate}-${i}`)) i++;
  return `${candidate}-${i}`;
}

/**
 * True if `s` is a valid slug — only lowercase alphanumerics and hyphens,
 * no leading/trailing/consecutive hyphens, non-empty.
 */
export function isValidSlug(s: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s);
}
