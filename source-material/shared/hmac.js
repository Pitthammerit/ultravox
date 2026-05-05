const isNode = typeof process !== 'undefined' && process.versions?.node;

const b64u = u8 => {
  const s = String.fromCharCode(...u8);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export async function hmacSha256B64u(secret, data) {
  if (isNode) {
    const { createHmac } = await import('node:crypto');
    return createHmac('sha256', secret).update(data).digest('base64url');
  }
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return b64u(new Uint8Array(sig));
}

export async function verifyHmacSha256B64u(secret, data, sig) {
  const expected = await hmacSha256B64u(secret, data);
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}
