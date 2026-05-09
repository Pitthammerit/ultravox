import { useCallback, useRef, useState } from "react";

export interface MicStreamControls {
  stream: MediaStream | null;
  start: (constraints?: MediaTrackConstraints) => Promise<MediaStream>;
  stop: () => void;
}

export function useMicStream(): MicStreamControls {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const start = useCallback(async (constraints?: MediaTrackConstraints) => {
    const audio: MediaTrackConstraints = constraints ?? {
      autoGainControl: true,
      noiseSuppression: true,
    };
    const s = await navigator.mediaDevices.getUserMedia({ audio });
    streamRef.current = s;
    setStream(s);
    return s;
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
