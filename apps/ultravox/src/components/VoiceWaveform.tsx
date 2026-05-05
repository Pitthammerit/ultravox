import { useEffect, useRef } from "react";

const NUM_BARS = 5;
const BIN_GROUPS = [
  [2, 3],
  [4, 5, 6],
  [7, 8, 9],
  [10, 12, 14],
  [15, 18, 22],
];

interface VoiceWaveformProps {
  stream: MediaStream | null;
  active?: boolean;
  color?: string;
  width?: number;
  height?: number;
}

/**
 * 5-bar canvas waveform driven by a private AnalyserNode wrapped around
 * the live MediaStream. Falls back to an idle sine pulse when no stream.
 */
export default function VoiceWaveform({
  stream,
  active = true,
  color = "var(--color-primary-on-dark)",
  width = 44,
  height = 18,
}: VoiceWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  useEffect(() => {
    if (!stream || !active) {
      analyserRef.current = null;
      return;
    }
    const Ctx = window.AudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 64;
    analyser.smoothingTimeConstant = 0.6;
    source.connect(analyser);
    analyserRef.current = analyser;

    return () => {
      try { source.disconnect(); } catch { /* ignore */ }
      try { analyser.disconnect(); } catch { /* ignore */ }
      try { ctx.close(); } catch { /* ignore */ }
      analyserRef.current = null;
    };
  }, [stream, active]);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    const heights = new Array<number>(NUM_BARS).fill(0.15);
    const buf = new Uint8Array(32);
    let raf = 0;
    const barW = (width - (NUM_BARS - 1) * 3) / NUM_BARS;
    const radius = barW / 2;

    const draw = () => {
      const analyser = analyserRef.current;
      let targets: number[];
      if (analyser) {
        analyser.getByteFrequencyData(buf);
        targets = BIN_GROUPS.map((bins) => {
          const sum = bins.reduce((acc, b) => acc + (buf[b] || 0), 0);
          const v = sum / (bins.length * 255);
          return Math.min(1, Math.pow(v, 0.7) * 1.2);
        });
      } else {
        const t = performance.now() / 600;
        targets = [0.18, 0.22, 0.28, 0.22, 0.18].map((b, i) => b + 0.05 * Math.sin(t + i * 0.7));
      }
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = color;
      for (let i = 0; i < NUM_BARS; i++) {
        const cur = heights[i] ?? 0.15;
        const tgt = targets[i] ?? 0.15;
        const next = cur + (tgt - cur) * 0.35;
        heights[i] = next;
        const h = Math.max(2, next * (height - 2));
        const x = i * (barW + 3);
        const y = (height - h) / 2;
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(x, y, barW, h, radius);
        } else {
          ctx.rect(x, y, barW, h);
        }
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [active, width, height, color]);

  return <canvas ref={canvasRef} aria-hidden="true" />;
}
