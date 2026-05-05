export const BRANDING = {
  appName: "Ultravox",
  shortName: "Ultravox",
  bundleIdProd: "com.ultravox.app",
  bundleIdDev: "com.ultravox.dev",
  domain: "ultravox.app",
  supportEmail: "support@ultravox.app",
  marketingUrl: "https://ultravox.app",
} as const;

export type Branding = typeof BRANDING;
