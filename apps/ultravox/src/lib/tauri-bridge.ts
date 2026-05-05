/**
 * Dev: start the CF Voice Worker locally with `wrangler dev` (port 8787).
 * Prod: Ultravox deploys its own Worker instance on the same Cloudflare account.
 *       Set VITE_WORKER_URL at build time to the deployed Worker URL.
 */
export const TOKEN_ENDPOINT = import.meta.env["VITE_WORKER_URL"]
  ? `${import.meta.env["VITE_WORKER_URL"]}/api/voice/token`
  : "http://localhost:8787/api/voice/token";
