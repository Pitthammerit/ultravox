// TC39 Stage 3 proposal: Uint8Array → base64 conversion methods.
// Available in the Cloudflare Workers runtime (workerd) but not yet in
// @cloudflare/workers-types or the default TS lib. Remove this
// augmentation when it lands upstream.
// https://github.com/tc39/proposal-arraybuffer-base64

interface Uint8Array {
  toBase64(options?: {
    alphabet?: "base64" | "base64url";
    omitPadding?: boolean;
  }): string;
}

interface Uint8ArrayConstructor {
  fromBase64(
    string: string,
    options?: {
      alphabet?: "base64" | "base64url";
      lastChunkHandling?: "loose" | "strict" | "stop-before-partial";
    },
  ): Uint8Array;
}
