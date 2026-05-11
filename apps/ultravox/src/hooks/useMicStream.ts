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
      // Force mono. macOS' default getUserMedia stream is stereo with one
      // channel left silent on most built-in mics — the user reports
      // saved recordings play back only on the left speaker. Whisper
      // resamples to mono anyway, so we lose nothing by capturing mono.
      channelCount: 1,
    };

    // Progressive constraint fallback. Two macOS-26 WebKit failure modes
    // we've observed in production debug logs:
    //
    //  (a) `{exact: <deviceId>}` triggers OverconstrainedError when the
    //      saved device ID drifted (coreaudiod restart, disconnect/reconnect,
    //      Serato HAL re-registration). The error message is just "Invalid
    //      constraint" — looks like an EC issue but it's actually deviceId.
    //
    //  (b) Even without a deviceId, opting out of EC while keeping AGC+NS
    //      can be rejected because all three filters share the Voice-
    //      Processing IO Audio Unit chain.
    //
    // Critical: falling all the way back to `audio: true` re-enables EC
    // (WebKit's default), which makes other audio sources duck during
    // recording — undoing the v0.12.2 fix. The ladder below tries to
    // preserve EC: false through more levels by stripping the deviceId
    // BEFORE we strip EC. That way, if the deviceId was the problem (as
    // 2026-05-11 logs showed), we keep the no-ducking config.
    //
    // Level 1: requested (user's exact constraints, deviceId + EC:false)
    // Level 2: drop deviceId, keep EC:false  ← preserves no-ducking
    // Level 3: drop deviceId AND EC key (WebKit defaults EC:true → music ducks)
    // Level 4: filters-off (AGC:false, NS:false → bypasses VPIO entirely;
    //          EC defaults probably false, raw mic, lower input level)
    // Level 5: bare audio:true (last resort, EC:true, ducking)
    const noDevice = stripDeviceId(requested);
    const noDeviceNoEc = stripEchoCancellation(noDevice);
    const filtersOff: MediaTrackConstraints = {
      autoGainControl: false,
      noiseSuppression: false,
      echoCancellation: false,
      channelCount: 1,
    };
    const attempts: Array<{ label: string; audio: boolean | MediaTrackConstraints }> = [
      { label: "preferred", audio: requested },
      { label: "no-device", audio: noDevice },
      { label: "no-ec-key", audio: noDeviceNoEc },
      { label: "filters-off", audio: filtersOff },
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
        // Log the *actual* settings WebKit applied, not just the level we
        // asked for. macOS 26 may silently flip echoCancellation back on
        // even when we explicitly request false. getSettings() reveals it
        // and tells us whether ducking will happen for this session.
        // Optional-chain the method too — older WebKit / test mocks may
        // not implement getSettings on the audio track.
        const applied = s.getAudioTracks?.()[0]?.getSettings?.();
        logDebug("record-start", {
          message: `mic constraint accepted level=${attempt.label}, applied=${JSON.stringify({
            autoGainControl: applied?.autoGainControl,
            noiseSuppression: applied?.noiseSuppression,
            echoCancellation: applied?.echoCancellation,
            deviceId: applied?.deviceId ? "set" : "none",
          })}`,
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
 * Used by the constraint fallback in `start()`. Setting the field to
 * `undefined` is NOT equivalent — WebKit's getUserMedia inspects the
 * field's *presence*, not its value, when negotiating.
 */
function stripEchoCancellation(c: MediaTrackConstraints): MediaTrackConstraints {
  const { echoCancellation: _ec, ...rest } = c;
  return rest;
}

/**
 * Return a copy of `c` with the `deviceId` field removed. The user's
 * saved deviceId can go stale (after coreaudiod restart, USB device
 * unplug, virtual-audio HAL re-registration) and an `exact:` match
 * triggers OverconstrainedError before any other constraint is even
 * evaluated. Falling back without it lets WebKit pick the system
 * default mic and the rest of the constraints can negotiate normally.
 */
function stripDeviceId(c: MediaTrackConstraints): MediaTrackConstraints {
  const { deviceId: _id, ...rest } = c;
  return rest;
}
