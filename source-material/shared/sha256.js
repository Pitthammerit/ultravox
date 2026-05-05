const isNode = typeof process !== 'undefined' && process.versions?.node;

export async function sha256Hex(input) {
  if (isNode) {
    const { createHash } = await import('node:crypto');
    return createHash('sha256').update(input).digest('hex');
  }
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
