export const TOKEN_ENDPOINT = import.meta.env.DEV
  ? "http://localhost:8787/api/voice/token"
  : "https://api.ultravox.app/voice/token";
