import { useEffect, useRef, useState } from 'react'
import { subscribeAudioStream } from './VoiceInput.jsx'

const NUM_BARS = 5
// Frequency bins (0..frequencyBinCount-1) that map to the bars. Picked from
// the lower-mid range where speech energy concentrates: ~85Hz–4kHz at the
// default 44.1kHz sampleRate with fftSize=64 → 32 bins covering 0–22kHz,
// each bin ≈ 689Hz wide. Bins 0/1 are mostly DC + room rumble, so skip them.
const BIN_GROUPS = [
  [2, 3],       // ~1.4–2.7kHz (low formants)
  [4, 5, 6],    // ~2.7–4.8kHz (mid)
  [7, 8, 9],    // ~4.8–6.9kHz (mid-upper)
  [10, 12, 14], // ~6.9–10kHz (upper)
  [15, 18, 22], // ~10–15kHz (high — sibilants)
]

function useAnalyser(stream) {
  const analyserRef = useRef(null)
  const ctxRef = useRef(null)
  const sourceRef = useRef(null)

  useEffect(() => {
    if (!stream) {
      analyserRef.current = null
      return
    }
    let cancelled = false
    let ctx, analyser, source
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext
      if (!Ctx) return
      ctx = new Ctx()
      // resume() may be required if the AudioContext is created from a
      // non-user-gesture call site. Recording itself is gesture-initiated.
      if (ctx.state === 'suspended') ctx.resume().catch(() => {})
      source = ctx.createMediaStreamSource(stream)
      analyser = ctx.createAnalyser()
      analyser.fftSize = 64
      analyser.smoothingTimeConstant = 0.6
      source.connect(analyser)
      if (cancelled) return
      ctxRef.current = ctx
      sourceRef.current = source
      analyserRef.current = analyser
    } catch {
      // Audio access can race with track ending — ignore and just render flat.
    }
    return () => {
      cancelled = true
      try { source?.disconnect() } catch { /* ignore */ }
      try { analyser?.disconnect() } catch { /* ignore */ }
      try { ctx?.close() } catch { /* ignore */ }
      analyserRef.current = null
      ctxRef.current = null
      sourceRef.current = null
    }
  }, [stream])

  return analyserRef
}

/**
 * VoiceWaveform — 5 frequency-driven bars that animate to live mic input.
 *
 * Subscribes to the active audio stream published by VoiceInput's getUserMedia
 * patch. Builds a private AnalyserNode (fftSize=64, smoothing=0.6) and runs a
 * requestAnimationFrame loop translating averaged bins into bar heights.
 *
 * Falls back gracefully when no stream is available (renders flat dots that
 * still pulse via CSS `animate-pulse`, matching the prior 3-dot indicator's
 * visual weight).
 */
export default function VoiceWaveform({
  active = true,
  color = 'var(--color-primary-on-dark)',
  width = 44,
  height = 18,
}) {
  const [stream, setStream] = useState(null)
  const analyserRef = useAnalyser(active ? stream : null)
  const canvasRef = useRef(null)

  useEffect(() => subscribeAudioStream((s) => setStream(s)), [])

  useEffect(() => {
    if (!active) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    ctx.scale(dpr, dpr)

    // Smoothed bar heights — lerp toward target each frame to avoid strobe.
    const heights = new Array(NUM_BARS).fill(0.15)
    const buf = new Uint8Array(32)
    let raf

    const barW = (width - (NUM_BARS - 1) * 3) / NUM_BARS
    const minBarH = 2
    const radius = barW / 2

    function draw() {
      const analyser = analyserRef.current
      let targets
      if (analyser) {
        analyser.getByteFrequencyData(buf)
        targets = BIN_GROUPS.map((bins) => {
          let sum = 0
          for (const b of bins) sum += buf[b] || 0
          // Normalize 0..255 → 0..1, then mild nonlinear boost so quiet
          // speech still moves the bars visibly.
          const v = sum / (bins.length * 255)
          return Math.min(1, Math.pow(v, 0.7) * 1.2)
        })
      } else {
        // No stream / not yet connected — gentle idle pulse.
        const t = performance.now() / 600
        targets = [0.18, 0.22, 0.28, 0.22, 0.18].map((b, i) => b + 0.05 * Math.sin(t + i * 0.7))
      }
      ctx.clearRect(0, 0, width, height)
      ctx.fillStyle = color
      for (let i = 0; i < NUM_BARS; i++) {
        // Lerp toward target — α=0.35 feels responsive but still smooth.
        heights[i] = heights[i] + (targets[i] - heights[i]) * 0.35
        const h = Math.max(minBarH, heights[i] * (height - 2))
        const x = i * (barW + 3)
        const y = (height - h) / 2
        // Rounded-rect bars
        ctx.beginPath()
        if (ctx.roundRect) {
          ctx.roundRect(x, y, barW, h, radius)
        } else {
          ctx.rect(x, y, barW, h)
        }
        ctx.fill()
      }
      raf = requestAnimationFrame(draw)
    }

    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [active, analyserRef, width, height, color])

  return <canvas ref={canvasRef} aria-hidden="true" />
}
