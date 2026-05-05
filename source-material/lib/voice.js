import { useEffect, useRef, useState } from 'react'
import { getPersonaName, pickGreeting } from './persona.js'
import { isLoaded } from './settings.js'

/**
 * useVoiceLine — returns the current persona-voice line for an active panel.
 *
 * Priority (top → bottom):
 *   1. state === 'idle' → daypart greeting (stable across renders)
 *   2. AI status fresh (≤45s old) → latestVoice.message
 *   3. AI status stale (>45s old) → "still working" nudge
 *   4. No AI status yet this phase → state-derived fallback
 *
 * @param {object} input
 * @param {'idle'|'planning'|'answering'|'writing'|'done'|'error'} input.state
 * @param {{ message: string, ts: number } | null} input.latestVoice
 * @param {number} [input.questionCount=0]
 * @param {number} [input.fileCount=0]
 * @returns {string}
 */
export function useVoiceLine({ state, latestVoice, questionCount = 0, fileCount = 0, panel = 'ingest' }) {
  const personaName = getPersonaName()

  // Wait for settings to hydrate before picking the idle greeting — otherwise
  // the first render flashes a name-less line and snaps to the named one once
  // settings load. Tick once when isLoaded() flips so we re-render and pick.
  const [, setSettingsTick] = useState(0)
  useEffect(() => {
    if (isLoaded()) return
    const id = setInterval(() => {
      if (isLoaded()) {
        setSettingsTick((t) => t + 1)
        clearInterval(id)
      }
    }, 50)
    return () => clearInterval(id)
  }, [])

  // Stable idle greeting — picked once per mount AFTER settings load, scoped
  // to the panel so each tab has its own tone.
  const [greeting, setGreeting] = useState(() => isLoaded() ? pickGreeting(personaName, panel) : '')
  const greetingPickedRef = useRef(isLoaded())
  useEffect(() => {
    if (isLoaded() && !greetingPickedRef.current) {
      greetingPickedRef.current = true
      setGreeting(pickGreeting(personaName, panel))
    }
  }, [personaName, panel])

  // Fallback: stable per phase entry. Re-pick when state changes.
  const [fallbackMap, setFallbackMap] = useState({})
  useEffect(() => {
    if (!state || state === 'idle') return
    setFallbackMap((prev) => (prev[state] ? prev : { ...prev, [state]: pickFallback(state, personaName, questionCount, fileCount) }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  // Tick every 1s so the 45s staleness check re-evaluates.
  const [, setTick] = useState(0)
  const nudgeRef = useRef({ openedAt: 0, line: null })
  useEffect(() => {
    if (!state || state === 'idle' || state === 'done' || state === 'error') return
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [state])

  if (state === 'idle' || !state) return greeting

  const now = Date.now()
  const hasFresh = latestVoice && now - latestVoice.ts <= 45_000
  const hasStale = latestVoice && now - latestVoice.ts > 45_000

  if (hasFresh) {
    // Fresh status from AI — reset any prior nudge so the next stale window starts clean.
    nudgeRef.current = { openedAt: 0, line: null }
    return latestVoice.message
  }

  if (hasStale) {
    // First time we cross the staleness threshold for this AI status: pick a nudge once.
    if (nudgeRef.current.openedAt !== latestVoice.ts) {
      nudgeRef.current = { openedAt: latestVoice.ts, line: pickNudge(personaName) }
    }
    return nudgeRef.current.line
  }

  // No AI status yet this phase — show fallback.
  return fallbackMap[state] || pickFallback(state, personaName, questionCount, fileCount)
}

// ───────── pools ─────────

function pickFallback(state, name, q, f) {
  const n = name ? `, ${name}` : ''
  const Name = name || 'Hey'
  const qs = q === 1 ? '' : 's'
  const fs = f === 1 ? 'y' : 'ies'

  const POOLS = {
    planning: [
      `Let me think this through${n}.`,
      `Reading your snippet now${n}.`,
      `Sorting this out…`,
      `Working through the angles${n}.`,
      `Scanning what you dropped${n}.`,
      `Finding the right shape for this.`,
      `Mapping connections in the vault…`,
    ],
    answering: [
      `${Name}, I have ${q} question${qs} for you.`,
      `Quick check${n} — ${q} thing${qs} to clarify.`,
      `Need your input on ${q} point${qs}${n}.`,
      `${q} quick question${qs} before I proceed${n}.`,
    ],
    writing: [
      `Writing entries now${n}.`,
      `Putting it together${n}.`,
      `Drafting the wiki updates.`,
      `Polishing the prose${n}.`,
      `Getting this into shape.`,
      `Finalizing each entry…`,
    ],
    done: [
      `Done — ${f} entr${fs} saved${n}.`,
      `All filed${n}.`,
      `Wrapped${n} — ${f} entr${fs} in.`,
      `${f} entr${fs} now in your vault${n}.`,
    ],
    error: [
      `Hit a snag${n}. Details below.`,
      `Something went sideways.`,
      `That didn't work${n} — see below.`,
    ],
  }
  const pool = POOLS[state] || [`Working on it${n}.`]
  return pool[Math.floor(Math.random() * pool.length)]
}

function pickNudge(name) {
  const n = name ? `, ${name}` : ''
  const NUDGES = [
    `Still on it${n} — re-reading the vault.`,
    `Taking a closer look — bear with me${n}.`,
    `This one's got me thinking. Hang tight${n}.`,
    `Just a moment${n} — chewing on it.`,
  ]
  return NUDGES[Math.floor(Math.random() * NUDGES.length)]
}
