/**
 * Sound effects for voice recording — generated via Web Audio API at runtime
 * (no audio assets to ship). Singleton AudioContext, lazy-init on first call.
 *
 * `volume` (0..1) scales the gain. Each helper returns a Promise that resolves
 * after the sound finishes so call sites can await it if needed. Failures
 * (e.g. AudioContext blocked by autoplay policy) are swallowed silently —
 * sound effects are non-essential.
 */

let _ctx = null

function getCtx() {
  if (_ctx) return _ctx
  try {
    const Ctor = window.AudioContext || window.webkitAudioContext
    if (!Ctor) return null
    _ctx = new Ctor()
  } catch {
    _ctx = null
  }
  return _ctx
}

function playBeep({ frequency, durationMs, volume }) {
  return new Promise((resolve) => {
    try {
      const ctx = getCtx()
      if (!ctx) { resolve(); return }
      if (ctx.state === 'suspended') ctx.resume().catch(() => {})

      const now = ctx.currentTime
      const dur = durationMs / 1000
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(frequency, now)
      const peak = Math.max(0, Math.min(1, volume)) * 0.3
      gain.gain.setValueAtTime(0, now)
      gain.gain.linearRampToValueAtTime(peak, now + 0.005)
      gain.gain.linearRampToValueAtTime(0, now + dur)
      osc.connect(gain).connect(ctx.destination)
      osc.start(now)
      osc.stop(now + dur)
      osc.onended = () => resolve()
      setTimeout(resolve, durationMs + 50)
    } catch {
      resolve()
    }
  })
}

export async function playStartChime(volume = 0.5) {
  return playBeep({ frequency: 1000, durationMs: 80, volume })
}

export async function playStopChime(volume = 0.5) {
  return playBeep({ frequency: 600, durationMs: 80, volume })
}

export async function playErrorChime(volume = 0.5) {
  await playBeep({ frequency: 700, durationMs: 60, volume })
  return playBeep({ frequency: 400, durationMs: 60, volume })
}
