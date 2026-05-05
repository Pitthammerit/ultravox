/**
 * Recording start/stop chime — brief WebAudio tones, no asset bundling.
 *
 * `start`: rising two-tone (G5 → C6).
 * `stop`:  falling two-tone (C6 → G5), shorter.
 */

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctx = window.AudioContext;
  if (!Ctx) return null;
  audioCtx ??= new Ctx();
  if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
  return audioCtx;
}

interface ToneStep {
  freq: number;
  start: number;
  duration: number;
}

function playSequence(steps: ToneStep[], volume: number) {
  const ctx = getCtx();
  if (!ctx) return;
  const gain = ctx.createGain();
  gain.gain.value = Math.max(0, Math.min(1, volume / 100)) * 0.18; // cap so it isn't startling
  gain.connect(ctx.destination);

  for (const step of steps) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = step.freq;
    const eg = ctx.createGain();
    eg.gain.setValueAtTime(0, ctx.currentTime + step.start);
    eg.gain.linearRampToValueAtTime(1, ctx.currentTime + step.start + 0.012);
    eg.gain.linearRampToValueAtTime(0, ctx.currentTime + step.start + step.duration);
    osc.connect(eg).connect(gain);
    osc.start(ctx.currentTime + step.start);
    osc.stop(ctx.currentTime + step.start + step.duration + 0.02);
  }
}

export function playStartChime(volume = 50): void {
  playSequence(
    [
      { freq: 784, start: 0,    duration: 0.09 }, // G5
      { freq: 1047, start: 0.07, duration: 0.13 }, // C6
    ],
    volume,
  );
}

export function playStopChime(volume = 50): void {
  playSequence(
    [
      { freq: 1047, start: 0,    duration: 0.07 }, // C6
      { freq: 784, start: 0.05, duration: 0.10 }, // G5
    ],
    volume,
  );
}
