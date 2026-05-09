/**
 * Persistent diagnostic log for the recording → transcribe → paste pipeline.
 *
 * Each step in the flow appends an entry; the Configuration panel renders the
 * tail so the user (and Claude) can see exactly where a failure happened
 * without opening WKWebView devtools. Backed by tauri-plugin-store in its own
 * file so it doesn't bloat settings.json. Ring-buffered to DEBUG_LOG_MAX.
 */

import { LazyStore } from "@tauri-apps/plugin-store";

export const DEBUG_LOG_MAX = 240;

export type DebugStage =
  | "record-start"
  | "record-stop"
  | "transcribe-token"
  | "transcribe-pre"
  | "transcribe-backend"
  | "transcribe-post"
  | "transcribe-result"
  | "paste"
  | "pill-collapse"
  | "pill-expand"
  | "pill-auto-expand"
  | "error";

export interface DebugEntry {
  id: string;
  /** Unix ms */
  ts: number;
  stage: DebugStage;
  /** Optional structured fields, all serialisable. */
  mime?: string;
  bytes?: number;
  modeId?: string;
  status?: number;
  textLength?: number;
  durationMs?: number;
  message?: string;
  error?: string;
}

const STORE_FILE = "debug-log.json";
const KEY = "entries";

let storeInstance: LazyStore | null = null;
function getStore(): LazyStore {
  storeInstance ??= new LazyStore(STORE_FILE);
  return storeInstance;
}

/** Append one entry. Best-effort — failures are swallowed so diagnostics never break flow. */
export async function logDebug(
  stage: DebugStage,
  fields: Omit<DebugEntry, "id" | "ts" | "stage"> = {},
): Promise<void> {
  // Always log to console first so we have a record even if storage fails.
  // eslint-disable-next-line no-console
  console.log(`[debug-log] ${stage}`, fields);
  try {
    const store = getStore();
    const entries = (await store.get<DebugEntry[]>(KEY)) ?? [];
    const next: DebugEntry[] = [
      { id: crypto.randomUUID(), ts: Date.now(), stage, ...fields },
      ...entries,
    ].slice(0, DEBUG_LOG_MAX);
    await store.set(KEY, next);
    await store.save();
  } catch {
    /* swallow — diagnostics are best-effort */
  }
}

export async function getDebugLog(): Promise<DebugEntry[]> {
  try {
    const store = getStore();
    return (await store.get<DebugEntry[]>(KEY)) ?? [];
  } catch {
    return [];
  }
}

export async function clearDebugLog(): Promise<void> {
  try {
    const store = getStore();
    await store.set(KEY, []);
    await store.save();
  } catch {
    /* swallow */
  }
}
