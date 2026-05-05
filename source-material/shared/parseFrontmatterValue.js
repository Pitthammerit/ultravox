export function parseFrontmatterValue(text, key) {
  if (typeof text !== 'string' || !text) return null
  const fmMatch = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!fmMatch) return null
  const lines = fmMatch[1].split(/\r?\n/)
  const prefix = key + ':'
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed.startsWith(prefix)) continue
    // Guard against prefix collision: 'source_type' must not match 'source_type_v2:'
    const afterColon = trimmed[prefix.length]
    if (afterColon !== undefined && afterColon !== ' ') continue
    const raw = trimmed.slice(prefix.length).trim()
    if (raw === '') return ''
    if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
      return raw.slice(1, -1)
    }
    return raw
  }
  return null
}
