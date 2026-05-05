import { useCallback, useRef, useState } from "react";
import { useMicStream } from "./useMicStream";

export type RecorderState = "idle" | "recording" | "stopped" | "error";

export interface RecorderControls {
  state: RecorderState;
  audioBlob: Blob | null;
  error: Error | null;
  stream: MediaStream | null;
  start: () => Promise<void>;
  stop: () => Promise<Blob | null>;
  cancel: () => void;
}

export function useRecorder(mimeType = "audio/webm"): RecorderControls {
  const mic = useMicStream();
  const [state, setState] = useState<RecorderState>("idle");
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const stopResolveRef = useRef<((blob: Blob | null) => void) | null>(null);

  const start = useCallback(async () => {
    try {
      const stream = await mic.start();
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream, { mimeType });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob =
          chunksRef.current.length > 0
            ? new Blob(chunksRef.current, { type: mimeType })
            : null;
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
    }
  }, [mic, mimeType]);

  const stop = useCallback(() => {
    return new Promise<Blob | null>((resolve) => {
      const r = recorderRef.current;
      if (!r || r.state !== "recording") {
        resolve(null);
        return;
      }
      stopResolveRef.current = resolve;
      r.stop();
    });
  }, []);

  const cancel = useCallback(() => {
    const r = recorderRef.current;
    if (r && r.state === "recording") r.stop();
    chunksRef.current = [];
    setAudioBlob(null);
    setState("idle");
    mic.stop();
  }, [mic]);

  return { state, audioBlob, error, stream: mic.stream, start, stop, cancel };
}
