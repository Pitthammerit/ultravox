/**
 * Network status helpers — JS-side connectivity detection + friendly
 * mapping of raw Rust/reqwest error strings to user-readable categories.
 *
 * v0.19.7 — previously the Whisper / LLM model download surface piped
 * raw reqwest error text ("error sending request for url
 * (https://huggingface.co/…)") into the picker UI, which was useless
 * to end users. Now: detect the offline pattern, route to a friendly
 * message + auto-retry hook.
 *
 * `navigator.onLine` is supported by WKWebView, fires `online`/`offline`
 * window events on state change, and works without permission. For our
 * use case (let the user know a network-related download will resume
 * when reconnected) it's sufficient — we don't need true reachability
 * probing.
 */

import { useEffect, useState } from "react";

/** Hook: returns the live online/offline boolean, updating on state change. */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  return online;
}

export type DownloadErrorKind =
  | "offline"      // network unreachable / DNS / Load failed
  | "notfound"     // 404 — bad URL or model removed from HF
  | "auth"         // 401 / 403 — HuggingFace rate-limiting or private
  | "disk"         // out-of-disk / permission
  | "cancelled"   // user-initiated abort
  | "other";       // everything else — pass through raw, truncated

export interface FriendlyError {
  kind: DownloadErrorKind;
  /** What to render to the user. Already i18n-aware on the caller side
   *  if `kind` is well-known; raw passthrough for "other". */
  message: string;
}

/**
 * Map a raw Rust/reqwest/HTTP error string to a category + the i18n
 * key to render. Caller provides the translated short strings — this
 * helper doesn't import the catalog directly so the helper stays
 * test-friendly without React/i18n setup.
 */
export function friendlyDownloadError(
  raw: string,
  online: boolean,
  i18n: {
    offline: string;
    notFound: string;
    auth: string;
    disk: string;
    cancelled: string;
  },
): FriendlyError {
  const lower = raw.toLowerCase();

  // Offline detection — combine the live navigator.onLine signal with
  // textual sniffing of the underlying error. macOS surfaces network
  // failures as a variety of strings depending on at which layer they
  // bubble up; we treat them all as "offline" because from the user's
  // POV they're equivalent: their machine can't reach the network.
  const offlinePatterns =
    /error sending request|load failed|connection refused|connection reset|dns error|name or service|no route to host|network is unreachable|connect timed out|operation timed out|nodename nor servname/i;
  if (!online || offlinePatterns.test(raw)) {
    return { kind: "offline", message: i18n.offline };
  }

  if (/cancel/i.test(lower)) return { kind: "cancelled", message: i18n.cancelled };
  if (/\b404\b|not found/.test(lower)) return { kind: "notfound", message: i18n.notFound };
  if (/\b401\b|\b403\b|unauthorized|forbidden/.test(lower)) return { kind: "auth", message: i18n.auth };
  if (/no space|disk full|permission denied|read-?only/i.test(raw)) {
    return { kind: "disk", message: i18n.disk };
  }

  // Truncate raw error so unknown reqwest noise doesn't blow up the UI row.
  const trimmed = raw.length > 80 ? raw.slice(0, 77) + "…" : raw;
  return { kind: "other", message: trimmed };
}
