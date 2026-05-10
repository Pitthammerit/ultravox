import { useCallback, useRef, useState } from "react";
import { logDebug } from "../lib/debugLog";

export interface MicStreamControls {
  stream: MediaStream | null;
  start: (constraints?: MediaTrackConstraints) => Promise<MediaStream>;
  stop: () => void;
}

export function useMicStream(): MicStreamControls {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const start = useCallback(async (constraints?: MediaTrackConstraints) => {
    const requested: MediaTrackConstraints = constraints ?? {
      autoGainControl: true,
      noiseSuppression: true,
      echoCancellation: false,
    };

    // Progressive constraint fallback. macOS 26 WebKit can reject the
    // 3-key combo (autoGainControl + noiseSuppression + echoCancellation:
    // false) with OverconstrainedError → "Invalid constraint", because all
    // three filters live inside the same Voice-Processing IO Audio Unit
    // and opting out of EC collapses the chain. Hard-failing recording
    // for that is much worse than losing the music-ducking workaround,
    // so we retry with progressively looser constraints and log which
    // level succeeded.
    //
    // Level 1: requested (preferred — no EC, no music ducking)
    // Level 2: drop echoCancellation key (WebKit defaults to true → EC
    //          re-enabled → music ducking returns BUT recording works
    //          and AGC is delivered through VPIO)
    // Level 3: bare audio:true (last resort)
    const attempts: Array<{ label: string; audio: boolean | MediaTrackConstraints }> = [
      { label: "preferred", audio: requested },
      { label: "no-ec-key", audio: stripEchoCancellation(requested) },
      { label: "minimal", audio: true },
    ];

    let lastErr: unknown = null;
    for (const attempt of attempts) {
      // Log EVERY attempt (not just rejections) so the debug log proves which
      // level the user's macOS actually accepted. Without this, a successful
      // fallback at level=preferred is invisible in the log and indistinguishable
      // from "fallback never ran".
      const audioStr = attempt.audio === true ? "true" : JSON.stringify(attempt.audio);
      logDebug("record-start", {
        message: `mic constraint trying level=${attempt.label} audio=${audioStr}`,
      });
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: attempt.audio });
        logDebug("record-start", {
          message: `mic constraint accepted level=${attempt.label}`,
        });
        streamRef.current = s;
        setStream(s);
        return s;
      } catch (e) {
        lastErr = e;
        const err = e as { name?: string; message?: string };
        const isConstraint =
          err?.name === "OverconstrainedError" ||
          (err?.message ?? "").toLowerCase().includes("constraint");
        logDebug("error", {
          message: `mic constraint level=${attempt.label} threw ${err?.name ?? "Error"}: ${err?.message ?? "unknown"}; isConstraint=${isConstraint}`,
        });
        if (!isConstraint) throw e; // permission/notfound/etc → don't keep retrying
      }
    }
    throw lastErr ?? new Error("getUserMedia: all constraint levels failed");
  }, []);

  const stop = useCallback(() => {
    if (streamRef.current) {
      for (const t of streamRef.current.getTracks()) t.stop();
      streamRef.current = null;
      setStream(null);
    }
  }, []);

  return { stream, start, stop };
}

/**
 * Return a copy of `c` with the `echoCancellation` field removed.
 * Used by the level-2 constraint fallback in `start()`. Setting the
 * field to `undefined` is NOT equivalent — WebKit's getUserMedia
 * inspects the field's *presence*, not its value, when negotiating.
 */
function stripEchoCancellation(c: MediaTrackConstraints): MediaTrackConstraints {
  const { echoCancellation: _ec, ...rest } = c;
  return rest;
}
