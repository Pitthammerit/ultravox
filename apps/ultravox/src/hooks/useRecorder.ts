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
  /** Peak RMS amplitude observed during the current/last recording (0..1). */
  getPeakLevel: () => number;
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

  // Peak-amplitude tracking (Web Audio AnalyserNode driven by rAF).
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const peakRafRef = useRef<number>(0);
  const peakLevelRef = useRef<number>(0);

  const teardownPeakTracking = useCallback(() => {
    if (peakRafRef.current) {
      cancelAnimationFrame(peakRafRef.current);
      peakRafRef.current = 0;
    }
    try { analyserSourceRef.current?.disconnect(); } catch { /* ignore */ }
    analyserSourceRef.current = null;
    if (audioCtxRef.current) {
      try { audioCtxRef.current.close(); } catch { /* ignore */ }
      audioCtxRef.current = null;
    }
  }, []);

  const startPeakTracking = useCallback((stream: MediaStream) => {
    const Ctx = window.AudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0;
    source.connect(analyser);
    audioCtxRef.current = ctx;
    analyserSourceRef.current = source;
    const buf = new Uint8Array(analyser.fftSize);
    peakLevelRef.current = 0;
    const tick = () => {
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = ((buf[i] ?? 128) - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / buf.length);
      if (rms > peakLevelRef.current) peakLevelRef.current = rms;
      peakRafRef.current = requestAnimationFrame(tick);
    };
    peakRafRef.current = requestAnimationFrame(tick);
  }, []);

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
          message: `${chunksRef.current.length} chunks, peak=${peakLevelRef.current.toFixed(4)}`,
          durationMs: Math.round(performance.now() - recordStart),
        });
        setAudioBlob(blob);
        setState("stopped");
        teardownPeakTracking();
        stopResolveRef.current?.(blob);
        stopResolveRef.current = null;
        mic.stop();
      };
      recorder.onerror = (e) => {
        setError(new Error("MediaRecorder error: " + (e as ErrorEvent).message));
        setState("error");
      };
      recorderRef.current = recorder;
      startPeakTracking(stream);
      recorder.start();
      setState("recording");
    } catch (err) {
      setError(err as Error);
      setState("error");
      teardownPeakTracking();
      throw err; // re-throw so callers know recording never started
    }
  }, [mic, preferredMimeType, startPeakTracking, teardownPeakTracking]);

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
    teardownPeakTracking();
    mic.stop();
  }, [mic, teardownPeakTracking]);

  const pause = useCallback(() => {
    if (recorderRef.current?.state === "recording") recorderRef.current.pause();
  }, []);

  const resume = useCallback(() => {
    if (recorderRef.current?.state === "paused") recorderRef.current.resume();
  }, []);

  const getPeakLevel = useCallback(() => peakLevelRef.current, []);

  return { state, audioBlob, error, stream: mic.stream, start, stop, cancel, pause, resume, getPeakLevel };
}
