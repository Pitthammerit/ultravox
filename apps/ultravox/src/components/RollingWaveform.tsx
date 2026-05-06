import { useEffect, useRef } from "react";

interface RollingWaveformProps {
  stream: MediaStream | null;
  active?: boolean;
  /** Bar color (CSS). */
  color?: string;
  /** Bar width in px. */
  barWidth?: number;
  /** Gap between bars in px. */
  gap?: number;
}

/**
 * Superwhisper-style rolling waveform: a horizontal series of thin vertical
 * bars whose heights track the running time-domain RMS amplitude. New bars
 * appear on the right; older bars scroll left.
 *
 * Bars are mirrored vertically — each bar grows up AND down from the center
 * line as two identical halves.
 *
 * Renders to a single <canvas>, sized to its container via ResizeObserver.
 */
export default function RollingWaveform({
  stream,
  active = true,
  color = "rgba(255, 255, 255, 0.85)",
  barWidth = 3,
  gap = 2,
}: RollingWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const bufferRef = useRef<Uint8Array | null>(null);

  // Acquire / release analyser when the stream changes.
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
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0;
    source.connect(analyser);
    analyserRef.current = analyser;
    bufferRef.current = new Uint8Array(analyser.fftSize);

    return () => {
      try { source.disconnect(); } catch { /* ignore */ }
      try { analyser.disconnect(); } catch { /* ignore */ }
      try { ctx.close(); } catch { /* ignore */ }
      analyserRef.current = null;
    };
  }, [stream, active]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let cssW = 0, cssH = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);
    let levels: number[] = [];

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      cssW = Math.max(1, r.width);
      cssH = Math.max(1, r.height);
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      const numBars = Math.max(8, Math.floor(cssW / (barWidth + gap)));
      // If bar count changed, resize history (preserve trailing samples).
      if (levels.length !== numBars) {
        const next = new Array<number>(numBars).fill(0.04);
        const overlap = Math.min(levels.length, numBars);
        for (let i = 0; i < overlap; i++) {
          next[numBars - 1 - i] = levels[levels.length - 1 - i] ?? 0.04;
        }
        levels = next;
      }
    };
    resize();

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let raf = 0;
    const draw = () => {
      const analyser = analyserRef.current;
      const buf = bufferRef.current;

      // Sample new amplitude (RMS over the time-domain window).
      let level: number;
      if (analyser && buf) {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = ((buf[i] ?? 128) - 128) / 128; // -1..1
          sum += v * v;
        }
        const rms = Math.sqrt(sum / buf.length);
        // Light non-linear curve so quiet speech still moves bars.
        level = Math.min(1, Math.pow(rms, 0.6) * 1.6);
      } else {
        // Idle gentle pulse so it never looks dead.
        level = 0.04 + 0.02 * (1 + Math.sin(performance.now() / 360));
      }

      // Shift history: drop oldest, push newest.
      if (levels.length > 0) {
        levels.shift();
        levels.push(level);
      }

      // Render
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = color;
      const cx = canvas.width;
      const cy = canvas.height;
      const baseline = cy / 2;
      const minH = 2 * dpr;
      const radius = (barWidth * dpr) / 2;

      const totalSlot = (barWidth + gap) * dpr;
      const startX = cx - levels.length * totalSlot;

      // Subtle center line
      ctx.globalAlpha = 0.15;
      ctx.fillRect(0, baseline - dpr * 0.5, cx, dpr);
      ctx.globalAlpha = 1;

      for (let i = 0; i < levels.length; i++) {
        const lvl = levels[i] ?? 0.04;
        const upperH = Math.max(minH / 2, lvl * (baseline - 3 * dpr));
        const bw = barWidth * dpr;
        const rx = Math.min(radius, bw / 2);
        const x = startX + i * totalSlot;

        // Upper half — grows upward from center
        if (ctx.roundRect) {
          ctx.beginPath();
          ctx.roundRect(x, baseline - upperH, bw, upperH, [rx, rx, 0, 0]);
          ctx.fill();
        } else {
          ctx.fillRect(x, baseline - upperH, bw, upperH);
        }

        // Lower half — mirror grows downward from center
        if (ctx.roundRect) {
          ctx.beginPath();
          ctx.roundRect(x, baseline, bw, upperH, [0, 0, rx, rx]);
          ctx.fill();
        } else {
          ctx.fillRect(x, baseline, bw, upperH);
        }
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [color, barWidth, gap]);

  return <canvas ref={canvasRef} className="w-full h-full block" aria-hidden />;
}
