import { useCallback, useRef, useState } from "react";
import { useMicStream } from "./useMicStream";
import { logDebug } from "../lib/debugLog";

export type RecorderState = "idle" | "recording" | "stopped" | "error";

export interface RecorderControls {
  state: RecorderState;
  audioBlob: Blob | null;
  error: Error | null;
  stream: MediaStream | null;
  start: (constraints?: MediaTrackConstraints) => Promise<void>;
  stop: () => Promise<Blob | null>;
  cancel: () => void;
  pause: () => void;
  resume: () => void;
}

/** Pick the best supported mime type for the current engine.
 *  WebKit/WKWebView records mp4 natively; Whisper decodes mp4 reliably,
 *  whereas the WebM/Opus that Chrome produces can fail decoding on
 *  Cloudflare Workers AI Whisper (error 3030). Prefer mp4 first. */
function pickMimeType(preferred?: string): string {
  if (typeof MediaRecorder === "undefined") return preferred || "audio/webm";
  const candidates = preferred
    ? [preferred, "audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg"]
    : ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg"];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported?.(c)) return c;
  }
  return preferred || "audio/webm";
}

export function useRecorder(preferredMimeType?: string): RecorderControls {
  const mic = useMicStream();
  const [state, setState] = useState<RecorderState>("idle");
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const stopResolveRef = useRef<((blob: Blob | null) => void) | null>(null);

  const start = useCallback(async (constraints?: MediaTrackConstraints) => {
    try {
      const stream = await mic.start(constraints);
      chunksRef.current = [];
      const chosen = pickMimeType(preferredMimeType);
      console.log("[useRecorder] chosen mimeType:", chosen, {
        webm: MediaRecorder.isTypeSupported?.("audio/webm"),
        webmOpus: MediaRecorder.isTypeSupported?.("audio/webm;codecs=opus"),
        mp4: MediaRecorder.isTypeSupported?.("audio/mp4"),
        ogg: MediaRecorder.isTypeSupported?.("audio/ogg"),
      });
      const recorder = new MediaRecorder(stream, { mimeType: chosen });
      const recordStart = performance.now();
      logDebug("record-start", { mime: recorder.mimeType || chosen });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blobType = recorder.mimeType || chosen;
        const blob =
          chunksRef.current.length > 0
            ? new Blob(chunksRef.current, { type: blobType })
            : null;
        logDebug("record-stop", {
          mime: blobType,
          bytes: blob?.size ?? 0,
          message: `${chunksRef.current.length} chunks`,
          durationMs: Math.round(performance.now() - recordStart),
        });
        setAudioBlob(blob);
        setState("stopped");
        stopResolveRef.current?.(blob);
        stopResolveRef.current = null;
        mic.stop();
      };
      recorder.onerror = (e) => {
        setError(new Error("MediaRecorder error: " + (e as ErrorEvent).message));
        setState("error");
      };
      recorderRef.current = recorder;
      recorder.start();
      setState("recording");
    } catch (err) {
      setError(err as Error);
      setState("error");
      throw err; // re-throw so callers know recording never started
    }
  }, [mic, preferredMimeType]);

  const stop = useCallback(() => {
    return new Promise<Blob | null>((resolve) => {
      const r = recorderRef.current;
      if (!r || (r.state !== "recording" && r.state !== "paused")) {
        resolve(null);
        return;
      }
      // Resume first if paused — MediaRecorder.stop() requires state "recording".
      if (r.state === "paused") r.resume();
      stopResolveRef.current = resolve;
      r.stop();
    });
  }, []);

  const cancel = useCallback(() => {
    const r = recorderRef.current;
    if (r && (r.state === "recording" || r.state === "paused")) r.stop();
    chunksRef.current = [];
    setAudioBlob(null);
    setState("idle");
    mic.stop();
  }, [mic]);

  const pause = useCallback(() => {
    if (recorderRef.current?.state === "recording") recorderRef.current.pause();
  }, []);

  const resume = useCallback(() => {
    if (recorderRef.current?.state === "paused") recorderRef.current.resume();
  }, []);

  return { state, audioBlob, error, stream: mic.stream, start, stop, cancel, pause, resume };
}
