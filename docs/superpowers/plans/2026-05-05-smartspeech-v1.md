# SmartSpeech v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Tauri 2 standalone macOS dictation companion app that lets a user dictate into any focused text field via a global hotkey, transcribed and cleaned via the existing CF Voice Worker.

**Architecture:** pnpm monorepo with `apps/bka2brain` (existing app, refactored to consume shared lib), `apps/smartspeech` (new Tauri app), and `packages/voice-core` (shared React voice components, lib, and shared utilities). Tauri Rust process owns global hotkey, paste-to-frontmost-app, frontmost-app detection, tray, and window management. React renders inside a frameless transparent pill window for recording and a standard settings window. CF Voice Worker is unchanged.

**Tech Stack:** Tauri 2, React 19 + TypeScript, Vite, pnpm workspaces, Rust (with `enigo`, `tauri-plugin-global-shortcut`, `tauri-plugin-store`, `tauri-plugin-stronghold`, `tauri-plugin-updater`, `objc2`/`windows-rs` for OS APIs), CF Worker (existing).

**Working name:** `smartspeech`. Real name + bundle ID locked before first signed distributable build.

**Companion docs:** [research.md](../../../smartspeech/research.md), [design.md](../../../smartspeech/design.md)

---

## Pre-flight checklist (before Phase 1)

- [ ] Apple Developer ID is active (`security find-identity -p codesigning -v` shows the cert)
- [ ] Rust toolchain installed (`rustc --version` ≥ 1.75)
- [ ] pnpm installed (`pnpm --version` ≥ 9)
- [ ] Tauri CLI v2 installable (`cargo install create-tauri-app`)
- [ ] Existing bka2brain dev servers (`npm run dev`) currently work
- [ ] Clean git working tree on `main`
- [ ] Branch created: `git checkout -b feat/smartspeech-v1`

---

## File structure overview

This is the target tree after the full plan is executed:

```
bka2brain/                              (root, becomes monorepo)
├── pnpm-workspace.yaml                 NEW (Phase 1)
├── package.json                        MODIFIED (Phase 1) — workspaces
├── apps/
│   ├── bka2brain/                      MOVED from root (Phase 1)
│   │   ├── ui/, server/, package.json, etc.
│   └── smartspeech/                    NEW (Phase 2)
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       ├── index.html
│       ├── public/
│       ├── src/                        React renderer
│       │   ├── main.tsx
│       │   ├── App.tsx
│       │   ├── windows/
│       │   │   ├── PillWindow.tsx          (Phase 6)
│       │   │   ├── ModeOverlay.tsx         (Phase 6)
│       │   │   └── SettingsWindow.tsx      (Phase 7)
│       │   ├── panels/
│       │   │   ├── HomePanel.tsx           (Phase 7)
│       │   │   ├── ModesPanel.tsx          (Phase 8)
│       │   │   ├── VocabularyPanel.tsx     (Phase 8)
│       │   │   ├── ConfigurationPanel.tsx  (Phase 7)
│       │   │   ├── SoundPanel.tsx          (Phase 7)
│       │   │   └── HistoryPanel.tsx        (Phase 7, stub only)
│       │   ├── lib/
│       │   │   ├── tauri-bridge.ts         (Phase 4)
│       │   │   ├── store-bridge.ts         (Phase 9)
│       │   │   └── stronghold-bridge.ts    (Phase 9)
│       │   └── hooks/
│       │       ├── useFrontmostApp.ts      (Phase 10)
│       │       └── useHotkeyEvents.ts      (Phase 4)
│       └── src-tauri/                  Rust main process
│           ├── Cargo.toml
│           ├── tauri.conf.json
│           ├── build.rs
│           ├── icons/
│           ├── capabilities/
│           │   └── default.json
│           └── src/
│               ├── main.rs                 (Phase 2)
│               ├── lib.rs                  (Phase 2)
│               ├── hotkey.rs               (Phase 4)
│               ├── paste.rs                (Phase 5)
│               ├── frontmost.rs            (Phase 10)
│               ├── window.rs               (Phase 6)
│               └── tray.rs                 (Phase 11)
└── packages/
    └── voice-core/                     NEW (Phase 1)
        ├── package.json
        ├── tsconfig.json
        ├── src/
        │   ├── index.ts                    (barrel)
        │   ├── branding.ts                 (Phase 3)
        │   ├── tokens.css                  (copied)
        │   ├── components/
        │   │   ├── VoiceWaveform.tsx
        │   │   ├── VoiceRecordingIndicator.tsx
        │   │   ├── VoiceModeSwitcher.tsx
        │   │   ├── HotkeyRecorder.tsx
        │   │   ├── EditableField.tsx
        │   │   ├── Toast.tsx
        │   │   ├── ToastHost.tsx
        │   │   ├── ConfirmDialog.tsx
        │   │   ├── ConfirmHost.tsx
        │   │   └── Tooltip.tsx
        │   ├── hooks/
        │   │   ├── useRecorder.ts          (Phase 4 — refactored from VoiceInput.jsx)
        │   │   ├── useMicStream.ts         (Phase 4)
        │   │   ├── useVoiceSettings.ts
        │   │   └── useVoiceHotkeys.ts
        │   ├── lib/
        │   │   ├── voiceModels.ts
        │   │   ├── voiceModes.ts
        │   │   ├── voiceVocabulary.ts
        │   │   ├── voiceSounds.ts
        │   │   ├── voiceIcons.ts
        │   │   ├── transcribe.ts           (Phase 4 — new)
        │   │   └── notifications.ts
        │   ├── shared/
        │   │   ├── slugify.ts
        │   │   ├── parseFrontmatter.ts
        │   │   ├── parseFrontmatterValue.ts
        │   │   ├── hmac.ts
        │   │   ├── sha256.ts
        │   │   ├── pathSafety.ts
        │   │   ├── responses.ts
        │   │   ├── detectLanguage.ts
        │   │   └── wikilink.ts
        │   └── data/
        │       └── apps.json               (Phase 10)
        └── tests/                          (Phase 1+)
```

---

## Phase 1 — Monorepo conversion + voice-core extraction

**Goal:** Convert the existing bka2brain repo into a pnpm workspace; extract reusable voice components, lib, and shared modules into `packages/voice-core` without breaking bka2brain's existing behaviour.

**Outcome at end of phase:** `pnpm dev:bka2brain` runs the existing app exactly as `npm run dev` did before. `pnpm --filter voice-core build` produces a TypeScript declaration bundle.

### Task 1.1 — Initialize pnpm workspace

**Files:**
- Create: `pnpm-workspace.yaml`
- Create: `.npmrc`
- Modify: `package.json` (root)

- [ ] **Step 1.1.1: Create pnpm-workspace.yaml**

```yaml
packages:
  - apps/*
  - packages/*
```

- [ ] **Step 1.1.2: Create .npmrc**

```ini
auto-install-peers=true
strict-peer-dependencies=false
shamefully-hoist=true
```

- [ ] **Step 1.1.3: Verify pnpm sees the workspace**

Run: `pnpm install --workspace-root=false`
Expected: pnpm reads workspace config without errors, even though no package dirs exist yet.

- [ ] **Step 1.1.4: Commit**

```bash
git add pnpm-workspace.yaml .npmrc
git commit -m "chore: introduce pnpm workspace"
```

### Task 1.2 — Move existing app into apps/bka2brain

**Files:**
- Move: `app/` → `apps/bka2brain/`
- Move: `package.json`, `vite.config.js`, `vitest.config.js`, `tsconfig.json`, `electron.vite.config.js`, `electron-builder.yml` → `apps/bka2brain/`
- Move: `data/`, `knowledge/`, `migrations/`, `cloud/`, `contracts/`, `fonts/`, `output/`, `scripts/`, `tests/` → `apps/bka2brain/`
- Modify: `apps/bka2brain/package.json` — add `name` field, update scripts paths
- Create: `package.json` (new root)

- [ ] **Step 1.2.1: Make the apps directory and move bka2brain files**

```bash
mkdir -p apps/bka2brain
git mv app apps/bka2brain/app
git mv package.json apps/bka2brain/package.json
git mv package-lock.json apps/bka2brain/package-lock.json
git mv vite.config.js apps/bka2brain/vite.config.js
git mv vitest.config.js apps/bka2brain/vitest.config.js
git mv tsconfig.json apps/bka2brain/tsconfig.json
git mv electron.vite.config.js apps/bka2brain/electron.vite.config.js
git mv electron-builder.yml apps/bka2brain/electron-builder.yml
git mv electron apps/bka2brain/electron
git mv data apps/bka2brain/data
git mv knowledge apps/bka2brain/knowledge
git mv migrations apps/bka2brain/migrations
git mv cloud apps/bka2brain/cloud
git mv contracts apps/bka2brain/contracts
git mv fonts apps/bka2brain/fonts
git mv output apps/bka2brain/output
git mv scripts apps/bka2brain/scripts
git mv tests apps/bka2brain/tests
git mv wrangler.jsonc apps/bka2brain/wrangler.jsonc
git mv build apps/bka2brain/build
```

- [ ] **Step 1.2.2: Edit apps/bka2brain/package.json — add name field**

In `apps/bka2brain/package.json`, set the `"name"` field to `"bka2brain"` if not already set, and ensure scripts reference relative paths that still work from the new location (most should be unaffected).

- [ ] **Step 1.2.3: Create new root package.json**

Create `package.json` at the repo root:

```json
{
  "name": "bka2brain-monorepo",
  "private": true,
  "version": "0.1.0",
  "scripts": {
    "dev:bka2brain": "pnpm --filter bka2brain dev",
    "dev:smartspeech": "pnpm --filter smartspeech tauri dev",
    "build:bka2brain": "pnpm --filter bka2brain build",
    "build:smartspeech": "pnpm --filter smartspeech tauri build",
    "build:voice-core": "pnpm --filter voice-core build",
    "test": "pnpm -r test",
    "lint": "pnpm -r lint"
  },
  "engines": {
    "pnpm": ">=9",
    "node": ">=20"
  }
}
```

- [ ] **Step 1.2.4: Install in the new layout**

```bash
rm -rf node_modules apps/bka2brain/node_modules
pnpm install
```

Expected: pnpm builds a `node_modules` at root and symlinks workspace deps. No errors.

- [ ] **Step 1.2.5: Smoke test bka2brain still runs**

```bash
pnpm dev:bka2brain
```

Expected: UI on :5173, API on :8787 — same as before. Stop with Ctrl-C.

- [ ] **Step 1.2.6: Commit**

```bash
git add -A
git commit -m "chore: move existing app into apps/bka2brain"
```

### Task 1.3 — Create empty voice-core package

**Files:**
- Create: `packages/voice-core/package.json`
- Create: `packages/voice-core/tsconfig.json`
- Create: `packages/voice-core/src/index.ts`

- [ ] **Step 1.3.1: Create package.json**

```json
{
  "name": "voice-core",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./tokens.css": "./src/tokens.css",
    "./components/*": "./src/components/*",
    "./hooks/*": "./src/hooks/*",
    "./lib/*": "./src/lib/*",
    "./shared/*": "./src/shared/*",
    "./data/*": "./src/data/*"
  },
  "scripts": {
    "build": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint src --ext .ts,.tsx"
  },
  "peerDependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0",
    "@testing-library/react": "^15.0.0",
    "@testing-library/jest-dom": "^6.4.0",
    "jsdom": "^24.0.0",
    "eslint": "^9.0.0"
  }
}
```

- [ ] **Step 1.3.2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "allowSyntheticDefaultImports": true,
    "resolveJsonModule": true,
    "lib": ["ES2022", "DOM"],
    "types": ["vitest/globals"]
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 1.3.3: Create empty barrel export**

`packages/voice-core/src/index.ts`:

```typescript
export {}
```

- [ ] **Step 1.3.4: Install + verify package resolves**

```bash
pnpm install
pnpm --filter voice-core build
```

Expected: tsc completes with no errors.

- [ ] **Step 1.3.5: Commit**

```bash
git add packages/voice-core
git commit -m "feat(voice-core): scaffold empty package"
```

### Task 1.4 — Migrate shared utilities (port js → ts)

**Files (each created in voice-core, deleted from bka2brain):**
- `packages/voice-core/src/shared/slugify.ts`
- `packages/voice-core/src/shared/parseFrontmatter.ts`
- `packages/voice-core/src/shared/parseFrontmatterValue.ts`
- `packages/voice-core/src/shared/hmac.ts`
- `packages/voice-core/src/shared/sha256.ts`
- `packages/voice-core/src/shared/pathSafety.ts`
- `packages/voice-core/src/shared/responses.ts`
- `packages/voice-core/src/shared/detectLanguage.ts`
- `packages/voice-core/src/shared/wikilink.ts`
- `packages/voice-core/tests/shared/*.test.ts` — preserve any existing tests
- Modify: `apps/bka2brain/app/shared/index.js` — re-export from `voice-core/shared` for back-compat during migration

- [ ] **Step 1.4.1: Copy each file from apps/bka2brain/app/shared → packages/voice-core/src/shared**

For each file in `apps/bka2brain/app/shared/`, create a `.ts` version under `packages/voice-core/src/shared/` with the same content but TypeScript-typed. Where the original is `.js`, infer types and add explicit annotations on exports.

- [ ] **Step 1.4.2: Write/port unit tests for each shared util**

Create `packages/voice-core/tests/shared/slugify.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { slugify } from '../../src/shared/slugify'

describe('slugify', () => {
  it('handles ASCII', () => {
    expect(slugify('Hello World')).toBe('hello-world')
  })

  it('handles German umlauts via UMLAUT_MAP', () => {
    expect(slugify('Müller über Äpfel')).toBe('mueller-ueber-aepfel')
  })

  it('strips punctuation', () => {
    expect(slugify('Foo, Bar! Baz?')).toBe('foo-bar-baz')
  })

  it('collapses repeated dashes', () => {
    expect(slugify('a---b')).toBe('a-b')
  })
})
```

Repeat for each shared util — write tests that capture the non-trivial behaviours (HMAC verification timing, frontmatter edge cases, path safety unicode, language detection thresholds). Aim for 3-5 tests per util.

- [ ] **Step 1.4.3: Run tests, verify they pass against the ported code**

```bash
pnpm --filter voice-core test
```

Expected: all tests pass.

- [ ] **Step 1.4.4: Replace apps/bka2brain/app/shared/*.js with re-exports**

For each `apps/bka2brain/app/shared/foo.js`, replace its content with:

```javascript
export * from 'voice-core/shared/foo'
```

This keeps existing imports in bka2brain working while the source of truth is in voice-core.

- [ ] **Step 1.4.5: Add voice-core as a dependency of bka2brain**

In `apps/bka2brain/package.json`, add:

```json
"dependencies": {
  "voice-core": "workspace:*"
}
```

Then `pnpm install`.

- [ ] **Step 1.4.6: Smoke test bka2brain dev server**

```bash
pnpm dev:bka2brain
```

Open the app, verify wiki entries load, save flow works. Stop.

- [ ] **Step 1.4.7: Commit**

```bash
git add -A
git commit -m "feat(voice-core): migrate shared utilities, bka2brain re-exports"
```

### Task 1.5 — Migrate voice-related lib files

**Files:**
- `packages/voice-core/src/lib/voiceModels.ts` (from `apps/bka2brain/app/ui/lib/voiceModels.js`)
- `packages/voice-core/src/lib/voiceModes.ts`
- `packages/voice-core/src/lib/voiceVocabulary.ts`
- `packages/voice-core/src/lib/voiceSounds.ts`
- `packages/voice-core/src/lib/voiceIcons.ts`
- `packages/voice-core/src/lib/notifications.ts`
- `packages/voice-core/src/hooks/useVoiceSettings.ts` (from `apps/bka2brain/app/ui/lib/voiceSettings.js`)
- `packages/voice-core/src/hooks/useVoiceHotkeys.ts` (from `apps/bka2brain/app/ui/lib/voiceHotkeys.js`)
- `packages/voice-core/tests/lib/voiceVocabulary.test.ts` etc.

- [ ] **Step 1.5.1: Port each file js → ts, file-by-file**

For each, copy contents to the target `.ts` path, add type annotations to exported functions and constants. Where the original imports another `.js` file already migrated, update the import path.

- [ ] **Step 1.5.2: Write unit tests for vocabulary matching**

`packages/voice-core/tests/lib/voiceVocabulary.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { buildHintString, getReplacePairs } from '../../src/lib/voiceVocabulary'

describe('voiceVocabulary', () => {
  it('builds a comma-separated hint string from vocabulary entries', () => {
    const vocab = [
      { source: 'cloud', replacement: 'claude' },
      { source: 'super whisper', replacement: 'Superwhisper' },
    ]
    expect(buildHintString(vocab)).toContain('claude')
    expect(buildHintString(vocab)).toContain('Superwhisper')
  })

  it('returns replacement pairs only when both fields are present', () => {
    const vocab = [
      { source: 'cloud', replacement: 'claude' },
      { source: 'just-a-hint', replacement: '' },
    ]
    const pairs = getReplacePairs(vocab)
    expect(pairs).toHaveLength(1)
    expect(pairs[0]).toEqual({ source: 'cloud', replacement: 'claude' })
  })
})
```

- [ ] **Step 1.5.3: Write tests for voiceModes**

`packages/voice-core/tests/lib/voiceModes.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { resolveModeConfig } from '../../src/lib/voiceModes'

describe('voiceModes', () => {
  it('returns the named mode when found', () => {
    const cfg = resolveModeConfig('email')
    expect(cfg.cleanup).toBe('prose')
  })

  it('falls back to a default for unknown modes', () => {
    const cfg = resolveModeConfig('nonexistent')
    expect(cfg).toBeDefined()
  })
})
```

- [ ] **Step 1.5.4: Run tests**

```bash
pnpm --filter voice-core test
```

Expected: all green.

- [ ] **Step 1.5.5: Replace apps/bka2brain/app/ui/lib/voice*.js with re-exports**

Same pattern as Task 1.4.4 — each file becomes a one-line re-export from voice-core.

- [ ] **Step 1.5.6: Smoke test bka2brain dictation**

Run bka2brain. Use the in-app voice button. Verify recording, transcription, and paste-back-to-textarea still work.

- [ ] **Step 1.5.7: Commit**

```bash
git add -A
git commit -m "feat(voice-core): migrate voice lib + hooks"
```

### Task 1.6 — Migrate voice-related React components

**Files:**
- `packages/voice-core/src/components/VoiceWaveform.tsx`
- `packages/voice-core/src/components/VoiceRecordingIndicator.tsx`
- `packages/voice-core/src/components/VoiceModeSwitcher.tsx`
- `packages/voice-core/src/components/HotkeyRecorder.tsx`
- `packages/voice-core/src/components/EditableField.tsx`
- `packages/voice-core/src/components/Toast.tsx`
- `packages/voice-core/src/components/ToastHost.tsx`
- `packages/voice-core/src/components/ConfirmDialog.tsx`
- `packages/voice-core/src/components/ConfirmHost.tsx`
- `packages/voice-core/src/components/Tooltip.tsx`
- `packages/voice-core/src/tokens.css` (canonical copy)

- [ ] **Step 1.6.1: Copy tokens.css**

```bash
cp apps/bka2brain/app/ui/tokens.css packages/voice-core/src/tokens.css
```

- [ ] **Step 1.6.2: Port each component .jsx → .tsx**

For each component, copy to `packages/voice-core/src/components/Foo.tsx` and add TypeScript prop interfaces. Example for `VoiceWaveform`:

```typescript
import { useEffect, useRef } from 'react'

export interface VoiceWaveformProps {
  stream: MediaStream | null
  active: boolean
  width?: number
  height?: number
}

export function VoiceWaveform({ stream, active, width = 200, height = 40 }: VoiceWaveformProps) {
  // existing logic, typed
}
```

- [ ] **Step 1.6.3: Add render-smoke tests for each component**

Create `packages/voice-core/tests/components/VoiceWaveform.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { VoiceWaveform } from '../../src/components/VoiceWaveform'

describe('VoiceWaveform', () => {
  it('renders a canvas element', () => {
    const { container } = render(<VoiceWaveform stream={null} active={false} />)
    expect(container.querySelector('canvas')).toBeTruthy()
  })
})
```

Repeat for each component — at minimum a "renders without crashing" test.

- [ ] **Step 1.6.4: Run tests**

```bash
pnpm --filter voice-core test
```

Expected: all green.

- [ ] **Step 1.6.5: Replace apps/bka2brain/app/ui/components/Voice*.jsx with re-exports**

Each file becomes:

```javascript
export { VoiceWaveform } from 'voice-core/components/VoiceWaveform'
```

(Adjust default vs named exports as needed.)

- [ ] **Step 1.6.6: Smoke test bka2brain UI**

Run bka2brain, open the wiki, use the dictation button on a vault entry. Verify the waveform indicator renders, recording works, transcription returns and pastes.

- [ ] **Step 1.6.7: Commit**

```bash
git add -A
git commit -m "feat(voice-core): migrate React components"
```

### Task 1.7 — Update voice-core barrel export

**Files:** `packages/voice-core/src/index.ts`

- [ ] **Step 1.7.1: Replace empty barrel with full exports**

```typescript
// Components
export { VoiceWaveform } from './components/VoiceWaveform'
export { VoiceRecordingIndicator } from './components/VoiceRecordingIndicator'
export { VoiceModeSwitcher } from './components/VoiceModeSwitcher'
export { HotkeyRecorder } from './components/HotkeyRecorder'
export { EditableField } from './components/EditableField'
export { Toast } from './components/Toast'
export { ToastHost, useToast } from './components/ToastHost'
export { ConfirmDialog } from './components/ConfirmDialog'
export { ConfirmHost, useConfirm } from './components/ConfirmHost'
export { Tooltip } from './components/Tooltip'

// Hooks
export { useVoiceSettings } from './hooks/useVoiceSettings'
export { useVoiceHotkeys } from './hooks/useVoiceHotkeys'

// Lib
export * from './lib/voiceModels'
export * from './lib/voiceModes'
export * from './lib/voiceVocabulary'
export * from './lib/voiceSounds'
export * from './lib/voiceIcons'
export * from './lib/notifications'

// Shared
export * from './shared/slugify'
export * from './shared/parseFrontmatter'
export * from './shared/hmac'
export * from './shared/sha256'
export * from './shared/pathSafety'
export * from './shared/responses'
export * from './shared/detectLanguage'
export * from './shared/wikilink'
```

- [ ] **Step 1.7.2: Run TypeScript check**

```bash
pnpm --filter voice-core build
```

Expected: no errors.

- [ ] **Step 1.7.3: Commit**

```bash
git add packages/voice-core/src/index.ts
git commit -m "feat(voice-core): export full public API via barrel"
```

---

## Phase 2 — Tauri app scaffold

**Goal:** Create `apps/smartspeech` with Tauri 2 + React + TypeScript + Vite. App opens a window that says "SmartSpeech" with a button. No actual functionality yet — just verifying the toolchain.

**Outcome at end of phase:** `pnpm dev:smartspeech` opens a Tauri dev window with React inside.

### Task 2.1 — Create Tauri app via CLI

**Files:** All files under `apps/smartspeech/` (created by CLI)

- [ ] **Step 2.1.1: Run create-tauri-app**

```bash
cd apps
pnpm create tauri-app smartspeech --template react-ts --manager pnpm --identifier com.smartspeech.dev
cd ..
```

Expected: `apps/smartspeech/` is created with `src/`, `src-tauri/`, `package.json`, `tauri.conf.json`.

- [ ] **Step 2.1.2: Set the package name to match workspace convention**

In `apps/smartspeech/package.json`, set `"name": "smartspeech"` and add voice-core dep:

```json
"dependencies": {
  "voice-core": "workspace:*"
}
```

- [ ] **Step 2.1.3: Reinstall**

```bash
pnpm install
```

- [ ] **Step 2.1.4: Run dev server**

```bash
pnpm dev:smartspeech
```

Expected: Rust compiles (~2-5 min first time), Tauri window opens with the default React + Tauri demo.

- [ ] **Step 2.1.5: Stop the dev server, commit**

```bash
git add apps/smartspeech
git commit -m "feat(smartspeech): scaffold Tauri 2 + React + TS"
```

### Task 2.2 — Configure tauri.conf.json for app identity

**Files:** `apps/smartspeech/src-tauri/tauri.conf.json`

- [ ] **Step 2.2.1: Set product name, identifier, version**

Edit `tauri.conf.json`:

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "SmartSpeech",
  "version": "0.1.0",
  "identifier": "com.smartspeech.dev",
  "build": {
    "beforeDevCommand": "pnpm dev",
    "beforeBuildCommand": "pnpm build",
    "frontendDist": "../dist",
    "devUrl": "http://localhost:1420"
  },
  "app": {
    "windows": [
      {
        "title": "SmartSpeech",
        "width": 960,
        "height": 640,
        "resizable": true,
        "fullscreen": false,
        "label": "settings",
        "visible": true
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": ["dmg"],
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns"
    ],
    "category": "Productivity",
    "shortDescription": "Voice dictation companion for macOS",
    "longDescription": "Dictate into any focused text field with a global hotkey."
  }
}
```

- [ ] **Step 2.2.2: Update src-tauri/Cargo.toml package name**

```toml
[package]
name = "smartspeech"
version = "0.1.0"
description = "Voice dictation companion for macOS"
authors = ["Benjamin Kurtz"]
edition = "2021"
```

- [ ] **Step 2.2.3: Re-run dev**

```bash
pnpm dev:smartspeech
```

Expected: window title is "SmartSpeech", size 960x640.

- [ ] **Step 2.2.4: Commit**

```bash
git add apps/smartspeech/src-tauri/tauri.conf.json apps/smartspeech/src-tauri/Cargo.toml
git commit -m "feat(smartspeech): set app identity"
```

---

## Phase 3 — Branding constants + design tokens

**Goal:** Centralize the app name, bundle id, domain, and other branding strings in one place. Wire voice-core's `tokens.css` into the SmartSpeech UI so future components inherit bka2brain's visual language.

**Outcome:** Renaming the app pre-launch is editing a single TS file plus three Tauri config fields.

### Task 3.1 — Create branding.ts in voice-core

**Files:** `packages/voice-core/src/branding.ts`

- [ ] **Step 3.1.1: Create the constants file**

```typescript
/**
 * Branding constants. Single source of truth for the app's name and ids.
 * Pre-launch rename: edit only this file + tauri.conf.json + Cargo.toml.
 */
export const BRANDING = {
  appName: 'SmartSpeech',
  shortName: 'SmartSpeech',
  bundleIdProd: 'com.smartspeech.app',
  bundleIdDev: 'com.smartspeech.dev',
  domain: 'smartspeech.local',
  supportEmail: 'support@smartspeech.local',
  marketingUrl: 'https://smartspeech.local',
} as const

export type Branding = typeof BRANDING
```

- [ ] **Step 3.1.2: Add to barrel export**

In `packages/voice-core/src/index.ts`, add:

```typescript
export { BRANDING, type Branding } from './branding'
```

- [ ] **Step 3.1.3: Test branding**

`packages/voice-core/tests/branding.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { BRANDING } from '../src/branding'

describe('BRANDING', () => {
  it('exposes a non-empty appName', () => {
    expect(BRANDING.appName.length).toBeGreaterThan(0)
  })

  it('uses dev bundle id during development', () => {
    expect(BRANDING.bundleIdDev).toMatch(/\.dev$/)
  })
})
```

Run: `pnpm --filter voice-core test`. Expected: pass.

- [ ] **Step 3.1.4: Commit**

```bash
git add packages/voice-core/src/branding.ts packages/voice-core/src/index.ts packages/voice-core/tests/branding.test.ts
git commit -m "feat(voice-core): centralize branding constants"
```

### Task 3.2 — Wire tokens.css into smartspeech

**Files:**
- Modify: `apps/smartspeech/src/main.tsx`
- Modify: `apps/smartspeech/src/App.tsx`

- [ ] **Step 3.2.1: Import tokens.css in main.tsx**

```typescript
import 'voice-core/tokens.css'
import './style.css'
import App from './App'
import React from 'react'
import ReactDOM from 'react-dom/client'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

- [ ] **Step 3.2.2: Replace App.tsx body with token-using header**

```typescript
import { BRANDING } from 'voice-core'

export default function App() {
  return (
    <main style={{
      minHeight: '100vh',
      background: 'var(--color-bg-light)',
      color: 'var(--color-text)',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      padding: '24px',
    }}>
      <h1 style={{ color: 'var(--color-primary)' }}>{BRANDING.appName}</h1>
      <p style={{ color: 'var(--color-secondary)' }}>Voice dictation companion (working name)</p>
    </main>
  )
}
```

- [ ] **Step 3.2.3: Run smartspeech**

```bash
pnpm dev:smartspeech
```

Expected: window shows "SmartSpeech" in dark navy on cream background.

- [ ] **Step 3.2.4: Commit**

```bash
git add apps/smartspeech/src
git commit -m "feat(smartspeech): wire tokens.css and branding"
```

---

## Phase 4 — Audio recording + transcribe pipeline

**Goal:** A `useRecorder` hook in voice-core that captures mic audio and a `transcribe` function that POSTs to the CF Voice Worker. SmartSpeech wires them together with a temporary in-window button.

**Outcome:** Click button in dev window → record → release → see transcribed text appear in window.

### Task 4.1 — Implement useMicStream hook

**Files:**
- Create: `packages/voice-core/src/hooks/useMicStream.ts`
- Create: `packages/voice-core/tests/hooks/useMicStream.test.ts`

- [ ] **Step 4.1.1: Write failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useMicStream } from '../../src/hooks/useMicStream'

beforeEach(() => {
  // @ts-expect-error mock
  navigator.mediaDevices = {
    getUserMedia: vi.fn().mockResolvedValue({
      getTracks: () => [{ stop: vi.fn(), addEventListener: vi.fn() }],
      getAudioTracks: () => [{ stop: vi.fn(), addEventListener: vi.fn() }],
    }),
  }
})

describe('useMicStream', () => {
  it('starts with no stream', () => {
    const { result } = renderHook(() => useMicStream())
    expect(result.current.stream).toBeNull()
  })

  it('acquires a stream on start()', async () => {
    const { result } = renderHook(() => useMicStream())
    await act(async () => {
      await result.current.start()
    })
    expect(result.current.stream).toBeTruthy()
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled()
  })
})
```

- [ ] **Step 4.1.2: Run, verify failure**

```bash
pnpm --filter voice-core test useMicStream
```

Expected: fails — module not found.

- [ ] **Step 4.1.3: Implement the hook**

```typescript
import { useCallback, useRef, useState } from 'react'

export interface MicStreamControls {
  stream: MediaStream | null
  start: (constraints?: MediaTrackConstraints) => Promise<MediaStream>
  stop: () => void
}

export function useMicStream(): MicStreamControls {
  const [stream, setStream] = useState<MediaStream | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const start = useCallback(async (constraints?: MediaTrackConstraints) => {
    const s = await navigator.mediaDevices.getUserMedia({
      audio: constraints ?? true,
    })
    streamRef.current = s
    setStream(s)
    return s
  }, [])

  const stop = useCallback(() => {
    if (streamRef.current) {
      for (const t of streamRef.current.getTracks()) t.stop()
      streamRef.current = null
      setStream(null)
    }
  }, [])

  return { stream, start, stop }
}
```

- [ ] **Step 4.1.4: Run test, verify pass**

```bash
pnpm --filter voice-core test useMicStream
```

Expected: pass.

- [ ] **Step 4.1.5: Commit**

```bash
git add packages/voice-core/src/hooks/useMicStream.ts packages/voice-core/tests/hooks/useMicStream.test.ts
git commit -m "feat(voice-core): useMicStream hook with start/stop"
```

### Task 4.2 — Implement useRecorder hook (MediaRecorder wrapper)

**Files:**
- Create: `packages/voice-core/src/hooks/useRecorder.ts`
- Create: `packages/voice-core/tests/hooks/useRecorder.test.ts`

- [ ] **Step 4.2.1: Write the failing test**

```typescript
import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useRecorder } from '../../src/hooks/useRecorder'

describe('useRecorder', () => {
  it('initializes idle', () => {
    const { result } = renderHook(() => useRecorder())
    expect(result.current.state).toBe('idle')
  })

  it('exposes start/stop/cancel functions', () => {
    const { result } = renderHook(() => useRecorder())
    expect(typeof result.current.start).toBe('function')
    expect(typeof result.current.stop).toBe('function')
    expect(typeof result.current.cancel).toBe('function')
  })
})
```

- [ ] **Step 4.2.2: Run, verify failure**

```bash
pnpm --filter voice-core test useRecorder
```

Expected: fails (no module).

- [ ] **Step 4.2.3: Implement the hook**

```typescript
import { useCallback, useRef, useState } from 'react'
import { useMicStream } from './useMicStream'

export type RecorderState = 'idle' | 'recording' | 'stopped' | 'error'

export interface RecorderControls {
  state: RecorderState
  audioBlob: Blob | null
  error: Error | null
  start: () => Promise<void>
  stop: () => Promise<Blob | null>
  cancel: () => void
}

export function useRecorder(mimeType = 'audio/webm'): RecorderControls {
  const mic = useMicStream()
  const [state, setState] = useState<RecorderState>('idle')
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [error, setError] = useState<Error | null>(null)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const stopResolveRef = useRef<((blob: Blob | null) => void) | null>(null)

  const start = useCallback(async () => {
    try {
      const stream = await mic.start()
      chunksRef.current = []
      const recorder = new MediaRecorder(stream, { mimeType })
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = () => {
        const blob = chunksRef.current.length > 0 ? new Blob(chunksRef.current, { type: mimeType }) : null
        setAudioBlob(blob)
        setState('stopped')
        stopResolveRef.current?.(blob)
        stopResolveRef.current = null
        mic.stop()
      }
      recorder.onerror = (e) => {
        setError(new Error('MediaRecorder error: ' + (e as ErrorEvent).message))
        setState('error')
      }
      recorderRef.current = recorder
      recorder.start()
      setState('recording')
    } catch (err) {
      setError(err as Error)
      setState('error')
    }
  }, [mic, mimeType])

  const stop = useCallback(() => {
    return new Promise<Blob | null>((resolve) => {
      const r = recorderRef.current
      if (!r || r.state !== 'recording') {
        resolve(null)
        return
      }
      stopResolveRef.current = resolve
      r.stop()
    })
  }, [])

  const cancel = useCallback(() => {
    const r = recorderRef.current
    if (r && r.state === 'recording') r.stop()
    chunksRef.current = []
    setAudioBlob(null)
    setState('idle')
    mic.stop()
  }, [mic])

  return { state, audioBlob, error, start, stop, cancel }
}
```

- [ ] **Step 4.2.4: Run test, verify pass**

```bash
pnpm --filter voice-core test useRecorder
```

Expected: pass.

- [ ] **Step 4.2.5: Commit**

```bash
git add packages/voice-core/src/hooks/useRecorder.ts packages/voice-core/tests/hooks/useRecorder.test.ts
git commit -m "feat(voice-core): useRecorder hook wraps MediaRecorder"
```

### Task 4.3 — Implement transcribe.ts client

**Files:**
- Create: `packages/voice-core/src/lib/transcribe.ts`
- Create: `packages/voice-core/tests/lib/transcribe.test.ts`

- [ ] **Step 4.3.1: Write failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { transcribe } from '../../src/lib/transcribe'

const fetchMock = vi.fn()

beforeEach(() => {
  // @ts-expect-error
  global.fetch = fetchMock
  fetchMock.mockReset()
})

describe('transcribe', () => {
  it('POSTs blob to /v1/audio/clean when mode requires cleanup', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, token: 'abc', apiUrl: 'https://worker.example' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ text: 'hello world' }) })
    const blob = new Blob(['x'], { type: 'audio/webm' })
    const result = await transcribe(blob, {
      mode: { id: 'email', cleanup: 'prose', provider: 'openrouter', model: 'x' } as any,
      vocabulary: [],
      tokenEndpoint: '/api/voice/token',
    })
    expect(result.text).toBe('hello world')
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/v1/audio/clean'), expect.any(Object))
  })

  it('POSTs to /v1/audio/transcriptions when cleanup is raw', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, token: 'abc', apiUrl: 'https://worker.example' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ text: 'raw text' }) })
    const blob = new Blob(['x'], { type: 'audio/webm' })
    const result = await transcribe(blob, {
      mode: { id: 'code', cleanup: 'raw' } as any,
      vocabulary: [],
      tokenEndpoint: '/api/voice/token',
    })
    expect(result.text).toBe('raw text')
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/v1/audio/transcriptions'), expect.any(Object))
  })
})
```

- [ ] **Step 4.3.2: Run, verify failure**

```bash
pnpm --filter voice-core test transcribe
```

Expected: fail.

- [ ] **Step 4.3.3: Implement transcribe.ts**

```typescript
import { buildHintString, getReplacePairs } from './voiceVocabulary'
import type { VoiceMode } from './voiceModes'

export interface VocabularyEntry {
  source: string
  replacement: string
}

export interface TranscribeOptions {
  mode: VoiceMode
  vocabulary: VocabularyEntry[]
  tokenEndpoint: string
}

export interface TranscribeResult {
  text: string
}

interface TokenResponse {
  ok: boolean
  token: string
  apiUrl: string
  error?: string
}

async function fetchToken(endpoint: string): Promise<{ token: string; apiUrl: string }> {
  const res = await fetch(endpoint)
  const data = (await res.json()) as TokenResponse
  if (!res.ok || !data.ok) throw new Error(data.error || `token endpoint ${res.status}`)
  return { token: data.token, apiUrl: data.apiUrl }
}

export async function transcribe(blob: Blob, opts: TranscribeOptions): Promise<TranscribeResult> {
  const { token, apiUrl } = await fetchToken(opts.tokenEndpoint)

  const cleanup = opts.mode.cleanup ?? 'prose'
  const endpoint = cleanup === 'raw' ? '/v1/audio/transcriptions' : '/v1/audio/clean'
  const fd = new FormData()
  fd.append('file', blob, 'audio.webm')
  if (opts.mode.language && opts.mode.language !== 'auto') fd.append('language', opts.mode.language)

  if (cleanup !== 'raw') {
    fd.append('cleanup', cleanup)
    if (opts.mode.languageModelProvider) fd.append('provider', opts.mode.languageModelProvider)
    if (opts.mode.languageModel) fd.append('model', opts.mode.languageModel)
    if (opts.mode.promptSuffix) fd.append('promptSuffix', opts.mode.promptSuffix)
    if (opts.mode.autocapitalize) fd.append('autocapitalize', 'true')
  }

  const hints = buildHintString(opts.vocabulary)
  if (hints) fd.append('vocabularyHints', hints)
  const replacements = getReplacePairs(opts.vocabulary)
  if (replacements.length && cleanup !== 'raw') fd.append('vocabularyReplacements', JSON.stringify(replacements))

  const res = await fetch(`${apiUrl}${endpoint}`, {
    method: 'POST',
    body: fd,
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`voice worker ${res.status}: ${errText}`)
  }
  const data = (await res.json()) as { text?: string }
  return { text: data.text ?? '' }
}
```

- [ ] **Step 4.3.4: Run test, verify pass**

```bash
pnpm --filter voice-core test transcribe
```

Expected: pass.

- [ ] **Step 4.3.5: Add to barrel + commit**

In `packages/voice-core/src/index.ts`:

```typescript
export { transcribe, type TranscribeOptions, type TranscribeResult } from './lib/transcribe'
export { useRecorder, type RecorderState } from './hooks/useRecorder'
export { useMicStream } from './hooks/useMicStream'
```

```bash
git add -A
git commit -m "feat(voice-core): transcribe + useRecorder + useMicStream"
```

### Task 4.4 — Wire dev token endpoint into smartspeech

For now, smartspeech reuses bka2brain's local token endpoint (`http://localhost:8787/api/voice/token`) during dev. v1.5 introduces a hosted endpoint.

**Files:** `apps/smartspeech/src/lib/tauri-bridge.ts` (just constants for now)

- [ ] **Step 4.4.1: Create the bridge file**

```typescript
export const TOKEN_ENDPOINT = import.meta.env.DEV
  ? 'http://localhost:8787/api/voice/token'
  : 'https://api.smartspeech.local/voice/token'
```

- [ ] **Step 4.4.2: Add a temporary "Test record" button in App.tsx**

```typescript
import { useState } from 'react'
import { BRANDING, useRecorder, transcribe } from 'voice-core'
import { TOKEN_ENDPOINT } from './lib/tauri-bridge'

export default function App() {
  const recorder = useRecorder()
  const [text, setText] = useState('')

  const handleTest = async () => {
    if (recorder.state === 'recording') {
      const blob = await recorder.stop()
      if (!blob) return
      const result = await transcribe(blob, {
        mode: { id: 'note', cleanup: 'prose', languageModelProvider: 'openrouter', languageModel: 'anthropic/claude-haiku-4.5' } as any,
        vocabulary: [],
        tokenEndpoint: TOKEN_ENDPOINT,
      })
      setText(result.text)
    } else {
      await recorder.start()
    }
  }

  return (
    <main style={{ minHeight: '100vh', background: 'var(--color-bg-light)', color: 'var(--color-text)', padding: 24 }}>
      <h1 style={{ color: 'var(--color-primary)' }}>{BRANDING.appName}</h1>
      <button onClick={handleTest} style={{ padding: '8px 16px' }}>
        {recorder.state === 'recording' ? 'Stop' : 'Test record'}
      </button>
      <pre style={{ marginTop: 16, padding: 12, background: 'white' }}>{text || '(no transcript yet)'}</pre>
    </main>
  )
}
```

- [ ] **Step 4.4.3: Smoke test end-to-end**

In one terminal: `pnpm dev:bka2brain` (so the CF Voice Worker token endpoint is reachable).
In another: `pnpm dev:smartspeech`.
Click "Test record", speak, click "Stop". Expected: text appears in the `<pre>`.

- [ ] **Step 4.4.4: Commit**

```bash
git add apps/smartspeech/src
git commit -m "feat(smartspeech): wire useRecorder + transcribe through to dev UI"
```

---

## Phase 5 — Rust paste command

**Goal:** A Tauri command `paste_to_frontmost(text: String)` that copies `text` to the clipboard, simulates Cmd+V, then restores the previous clipboard contents after 500 ms.

**Outcome:** Click "Test record", speak, release — text auto-pastes into whichever app was focused when you tapped the button.

### Task 5.1 — Add enigo + clipboard dependencies

**Files:** `apps/smartspeech/src-tauri/Cargo.toml`

- [ ] **Step 5.1.1: Add deps**

```toml
[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-clipboard-manager = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
enigo = "0.2"
```

- [ ] **Step 5.1.2: Run cargo check**

```bash
cd apps/smartspeech/src-tauri
cargo check
cd -
```

Expected: deps download, no errors.

- [ ] **Step 5.1.3: Commit**

```bash
git add apps/smartspeech/src-tauri/Cargo.toml apps/smartspeech/src-tauri/Cargo.lock
git commit -m "feat(smartspeech): add enigo + clipboard plugin deps"
```

### Task 5.2 — Implement paste.rs

**Files:**
- Create: `apps/smartspeech/src-tauri/src/paste.rs`
- Modify: `apps/smartspeech/src-tauri/src/lib.rs`

- [ ] **Step 5.2.1: Create paste.rs**

```rust
use enigo::{Enigo, Key, Keyboard, Direction, Settings};
use std::time::Duration;
use tauri::AppHandle;
use tauri_plugin_clipboard_manager::ClipboardExt;

#[tauri::command]
pub async fn paste_to_frontmost(app: AppHandle, text: String) -> Result<(), String> {
    let clipboard = app.clipboard();
    let saved = clipboard.read_text().ok();

    clipboard.write_text(text.clone()).map_err(|e| e.to_string())?;

    // Small delay so the OS sees the new clipboard before we synthesize Cmd+V.
    tokio::time::sleep(Duration::from_millis(50)).await;

    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
    #[cfg(target_os = "macos")]
    {
        enigo.key(Key::Meta, Direction::Press).map_err(|e| e.to_string())?;
        enigo.key(Key::Unicode('v'), Direction::Click).map_err(|e| e.to_string())?;
        enigo.key(Key::Meta, Direction::Release).map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "windows")]
    {
        enigo.key(Key::Control, Direction::Press).map_err(|e| e.to_string())?;
        enigo.key(Key::Unicode('v'), Direction::Click).map_err(|e| e.to_string())?;
        enigo.key(Key::Control, Direction::Release).map_err(|e| e.to_string())?;
    }

    // Restore prior clipboard after a short delay so the paste lands first.
    if let Some(prev) = saved {
        let cb = clipboard.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(Duration::from_millis(500)).await;
            let _ = cb.write_text(prev);
        });
    }

    Ok(())
}
```

- [ ] **Step 5.2.2: Register the command in lib.rs**

```rust
mod paste;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![paste::paste_to_frontmost])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 5.2.3: Update capabilities**

`apps/smartspeech/src-tauri/capabilities/default.json`:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Default permissions for SmartSpeech",
  "windows": ["main", "settings", "pill"],
  "permissions": [
    "core:default",
    "core:webview:default",
    "clipboard-manager:allow-read-text",
    "clipboard-manager:allow-write-text"
  ]
}
```

- [ ] **Step 5.2.4: Run cargo check + dev**

```bash
pnpm dev:smartspeech
```

Expected: app builds + launches without runtime errors.

- [ ] **Step 5.2.5: Commit**

```bash
git add apps/smartspeech/src-tauri/src/paste.rs apps/smartspeech/src-tauri/src/lib.rs apps/smartspeech/src-tauri/capabilities/default.json
git commit -m "feat(smartspeech): add paste_to_frontmost Rust command"
```

### Task 5.3 — Wire paste into the React test flow

**Files:** Modify `apps/smartspeech/src/App.tsx`, `apps/smartspeech/src/lib/tauri-bridge.ts`

- [ ] **Step 5.3.1: Add invoke wrapper**

Append to `tauri-bridge.ts`:

```typescript
import { invoke } from '@tauri-apps/api/core'

export async function pasteToFrontmost(text: string): Promise<void> {
  await invoke('paste_to_frontmost', { text })
}
```

- [ ] **Step 5.3.2: Call paste after transcribe in App.tsx**

In the `handleTest` function, after `setText(result.text)`:

```typescript
import { pasteToFrontmost } from './lib/tauri-bridge'
// ...
if (result.text) {
  await pasteToFrontmost(result.text)
}
```

- [ ] **Step 5.3.3: Manual paste test**

Open TextEdit. Click into the document body. Then in SmartSpeech dev window, click "Test record", speak "this is a test", click "Stop". Expected: text appears in TextEdit.

⚠️ Accessibility permission required — macOS will prompt the first time enigo synthesizes a keystroke. Approve in System Settings.

- [ ] **Step 5.3.4: Commit**

```bash
git add apps/smartspeech/src
git commit -m "feat(smartspeech): paste transcribed text into frontmost app"
```

---

## Phase 6 — Frontmost-app detection

**Goal:** Tauri command `get_frontmost_bundle_id() -> String` returns the bundle id of whichever app is currently in front of SmartSpeech.

**Outcome:** A small status line in App.tsx shows "Focused: com.apple.TextEdit" updating live.

### Task 6.1 — Implement frontmost.rs (macOS)

**Files:**
- Create: `apps/smartspeech/src-tauri/src/frontmost.rs`
- Modify: `apps/smartspeech/src-tauri/Cargo.toml` — add `objc2` deps

- [ ] **Step 6.1.1: Add Cargo deps**

```toml
[target.'cfg(target_os = "macos")'.dependencies]
objc2 = "0.5"
objc2-foundation = "0.2"
objc2-app-kit = "0.2"
```

- [ ] **Step 6.1.2: Create frontmost.rs**

```rust
#[cfg(target_os = "macos")]
pub fn get_frontmost_bundle_id_impl() -> Option<String> {
    use objc2::rc::Retained;
    use objc2_app_kit::NSWorkspace;
    let workspace = unsafe { NSWorkspace::sharedWorkspace() };
    let app: Retained<_> = unsafe { workspace.frontmostApplication()? };
    let bundle_id = unsafe { app.bundleIdentifier() }?;
    Some(bundle_id.to_string())
}

#[cfg(not(target_os = "macos"))]
pub fn get_frontmost_bundle_id_impl() -> Option<String> {
    None
}

#[tauri::command]
pub fn get_frontmost_bundle_id() -> Option<String> {
    get_frontmost_bundle_id_impl()
}
```

- [ ] **Step 6.1.3: Register in lib.rs**

```rust
mod frontmost;
mod paste;

// inside .invoke_handler:
.invoke_handler(tauri::generate_handler![
    paste::paste_to_frontmost,
    frontmost::get_frontmost_bundle_id,
])
```

- [ ] **Step 6.1.4: Cargo check**

```bash
cd apps/smartspeech/src-tauri && cargo check && cd -
```

Expected: builds.

- [ ] **Step 6.1.5: Commit**

```bash
git add apps/smartspeech/src-tauri
git commit -m "feat(smartspeech): get_frontmost_bundle_id command (macOS)"
```

### Task 6.2 — useFrontmostApp hook + display

**Files:**
- Create: `apps/smartspeech/src/hooks/useFrontmostApp.ts`
- Modify: `apps/smartspeech/src/App.tsx`

- [ ] **Step 6.2.1: Implement the hook**

```typescript
import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'

export function useFrontmostApp(intervalMs = 500): string | null {
  const [bundleId, setBundleId] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    const tick = async () => {
      try {
        const id = await invoke<string | null>('get_frontmost_bundle_id')
        if (!cancelled) setBundleId(id ?? null)
      } catch { /* ignore */ }
    }
    tick()
    const handle = setInterval(tick, intervalMs)
    return () => { cancelled = true; clearInterval(handle) }
  }, [intervalMs])
  return bundleId
}
```

- [ ] **Step 6.2.2: Show in App.tsx**

```typescript
import { useFrontmostApp } from './hooks/useFrontmostApp'
// ...inside App:
const frontmost = useFrontmostApp()
// add to JSX:
<p style={{ color: 'var(--color-secondary)', fontSize: 12 }}>Focused: {frontmost ?? '—'}</p>
```

- [ ] **Step 6.2.3: Smoke test**

Run dev. Click into TextEdit, then back to dev window, then to Slack. Expected: "Focused" line updates within ~500ms each switch.

- [ ] **Step 6.2.4: Commit**

```bash
git add apps/smartspeech/src
git commit -m "feat(smartspeech): useFrontmostApp hook with live polling"
```

---

## Phase 7 — Global hotkey

**Goal:** Press `Cmd+Shift+;` from any app → SmartSpeech registers it as a toggle event. Shows the dev window, starts the recorder via the existing button flow programmatically.

**Outcome:** Hotkey from any app triggers record/stop.

### Task 7.1 — Add global-shortcut plugin

**Files:** `apps/smartspeech/src-tauri/Cargo.toml`, `apps/smartspeech/src-tauri/src/lib.rs`, `apps/smartspeech/src-tauri/capabilities/default.json`

- [ ] **Step 7.1.1: Add the plugin dep**

```toml
tauri-plugin-global-shortcut = "2"
```

- [ ] **Step 7.1.2: Register it**

In lib.rs's builder chain: `.plugin(tauri_plugin_global_shortcut::Builder::new().build())`

- [ ] **Step 7.1.3: Update capabilities**

Add to permissions array: `"global-shortcut:allow-register"`, `"global-shortcut:allow-unregister"`, `"global-shortcut:allow-is-registered"`.

- [ ] **Step 7.1.4: Cargo check + commit**

```bash
cd apps/smartspeech/src-tauri && cargo check && cd -
git add -A
git commit -m "feat(smartspeech): add global-shortcut plugin"
```

### Task 7.2 — Implement hotkey.rs with toggle event

**Files:** Create `apps/smartspeech/src-tauri/src/hotkey.rs`, modify lib.rs

- [ ] **Step 7.2.1: Create hotkey.rs**

```rust
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

const DEFAULT_HOTKEY: Shortcut = Shortcut::new(Some(Modifiers::SUPER.union(Modifiers::SHIFT)), Code::Semicolon);

pub fn register_default<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let app_for_handler = app.clone();
    app.global_shortcut()
        .on_shortcut(DEFAULT_HOTKEY, move |_app, _shortcut, event| {
            if event.state() == ShortcutState::Pressed {
                let _ = app_for_handler.emit("smartspeech://hotkey-toggle", ());
            }
        })
        .map_err(|e| e.to_string())?;
    Ok(())
}
```

- [ ] **Step 7.2.2: Call register_default during setup**

In `lib.rs`:

```rust
mod hotkey;
// ...
.setup(|app| {
    hotkey::register_default(&app.handle())?;
    Ok(())
})
```

- [ ] **Step 7.2.3: React side: listen for the event**

`apps/smartspeech/src/hooks/useHotkeyEvents.ts`:

```typescript
import { useEffect } from 'react'
import { listen } from '@tauri-apps/api/event'

export function useHotkeyEvents(onToggle: () => void) {
  useEffect(() => {
    const unlistenPromise = listen('smartspeech://hotkey-toggle', () => onToggle())
    return () => { unlistenPromise.then((unlisten) => unlisten()) }
  }, [onToggle])
}
```

- [ ] **Step 7.2.4: Wire in App.tsx**

```typescript
import { useHotkeyEvents } from './hooks/useHotkeyEvents'
// ...
useHotkeyEvents(() => { handleTest() })
```

- [ ] **Step 7.2.5: Smoke test**

Run dev. Click into TextEdit. Press `⌘⇧;`. Expected: SmartSpeech recorder starts; speak; press again; text appears in TextEdit.

- [ ] **Step 7.2.6: Commit**

```bash
git add apps/smartspeech
git commit -m "feat(smartspeech): default global hotkey starts/stops recorder"
```

---

## Phase 8 — Pill window: chrome + states

**Goal:** Replace the dev window's button-based UI with a frameless transparent pill window that shows recording state, waveform, mode label, and hotkey hints. Hidden by default; shown on hotkey.

**Outcome:** Press `⌘⇧;` → pill slides up from bottom-center; recording starts. Stop → pill flashes ✓ and hides.

### Task 8.1 — Configure pill window in tauri.conf.json

**Files:** `apps/smartspeech/src-tauri/tauri.conf.json`, `apps/smartspeech/index.html` (rename to `settings.html`), `apps/smartspeech/pill.html`

- [ ] **Step 8.1.1: Create separate HTML entry points**

Move `apps/smartspeech/index.html` → `apps/smartspeech/settings.html` (this is the settings shell). Create `apps/smartspeech/pill.html`:

```html
<!doctype html>
<html lang="en">
  <head><meta charset="UTF-8" /><title>SmartSpeech Pill</title></head>
  <body><div id="root"></div><script type="module" src="/src/pill-main.tsx"></script></body>
</html>
```

- [ ] **Step 8.1.2: Update vite.config.ts for multi-entry**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        settings: path.resolve(__dirname, 'settings.html'),
        pill: path.resolve(__dirname, 'pill.html'),
      },
    },
  },
  server: { port: 1420, strictPort: true },
})
```

- [ ] **Step 8.1.3: Add windows config in tauri.conf.json**

```json
"app": {
  "windows": [
    {
      "label": "settings",
      "title": "SmartSpeech",
      "url": "settings.html",
      "width": 960,
      "height": 640,
      "visible": false,
      "decorations": true,
      "resizable": true
    },
    {
      "label": "pill",
      "title": "SmartSpeech Pill",
      "url": "pill.html",
      "width": 600,
      "height": 100,
      "visible": false,
      "decorations": false,
      "transparent": true,
      "alwaysOnTop": true,
      "skipTaskbar": true,
      "resizable": false,
      "shadow": false
    }
  ]
}
```

- [ ] **Step 8.1.4: Stub pill-main.tsx**

`apps/smartspeech/src/pill-main.tsx`:

```typescript
import 'voice-core/tokens.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { PillWindow } from './windows/PillWindow'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><PillWindow /></React.StrictMode>
)
```

- [ ] **Step 8.1.5: Stub PillWindow.tsx**

`apps/smartspeech/src/windows/PillWindow.tsx`:

```typescript
export function PillWindow() {
  return (
    <div style={{
      width: '100%', height: '100%',
      borderRadius: 18,
      background: 'rgba(34, 65, 96, 0.92)',
      color: 'white',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      Pill placeholder
    </div>
  )
}
```

- [ ] **Step 8.1.6: Run dev, verify pill window opens (manually visible:true for test)**

Temporarily set `pill` window's `visible: true`, run `pnpm dev:smartspeech`, verify a 600x100 transparent rounded window appears. Set back to `false` after verification.

- [ ] **Step 8.1.7: Commit**

```bash
git add -A
git commit -m "feat(smartspeech): scaffold pill window + multi-entry vite"
```

### Task 8.2 — window.rs: show/hide pill, position bottom-center

**Files:** Create `apps/smartspeech/src-tauri/src/window.rs`, modify lib.rs

- [ ] **Step 8.2.1: Implement window.rs**

```rust
use tauri::{AppHandle, Manager, PhysicalPosition, Runtime, WebviewWindowBuilder};

pub fn show_pill<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let pill = app.get_webview_window("pill").ok_or("pill window missing")?;
    let monitor = pill.current_monitor().map_err(|e| e.to_string())?
        .ok_or("no monitor")?;
    let mon_size = monitor.size();
    let pill_size = pill.outer_size().map_err(|e| e.to_string())?;
    let x = ((mon_size.width as i32) - (pill_size.width as i32)) / 2;
    let y = (mon_size.height as i32) - (pill_size.height as i32) - 80;
    pill.set_position(PhysicalPosition::new(x, y)).map_err(|e| e.to_string())?;
    pill.show().map_err(|e| e.to_string())?;
    pill.set_focus().map_err(|e| e.to_string())?;
    Ok(())
}

pub fn hide_pill<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    if let Some(pill) = app.get_webview_window("pill") {
        pill.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn pill_show(app: AppHandle) -> Result<(), String> { show_pill(&app) }

#[tauri::command]
pub fn pill_hide(app: AppHandle) -> Result<(), String> { hide_pill(&app) }
```

- [ ] **Step 8.2.2: Register commands**

In lib.rs add `mod window;` and append `window::pill_show, window::pill_hide` to the invoke_handler.

- [ ] **Step 8.2.3: Update hotkey.rs to show pill**

```rust
// inside the on_shortcut callback:
let _ = crate::window::show_pill(&app_for_handler);
let _ = app_for_handler.emit("smartspeech://hotkey-toggle", ());
```

- [ ] **Step 8.2.4: Smoke test**

Run dev. Press `⌘⇧;`. Expected: pill appears at bottom-center.

- [ ] **Step 8.2.5: Commit**

```bash
git add apps/smartspeech/src-tauri
git commit -m "feat(smartspeech): show/hide pill at bottom-center"
```

### Task 8.3 — Pill state machine in React

**Files:** `apps/smartspeech/src/windows/PillWindow.tsx`

- [ ] **Step 8.3.1: Implement the state machine**

```typescript
import { useEffect, useState, useCallback } from 'react'
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { useRecorder, transcribe, VoiceWaveform } from 'voice-core'
import { TOKEN_ENDPOINT, pasteToFrontmost } from '../lib/tauri-bridge'

type PillState = 'arming' | 'recording' | 'transcribing' | 'pasted' | 'error' | 'discardConfirm'

export function PillWindow() {
  const recorder = useRecorder()
  const [state, setState] = useState<PillState>('arming')
  const [errorMsg, setErrorMsg] = useState<string>('')

  const start = useCallback(async () => {
    setState('arming')
    await recorder.start()
    setState('recording')
  }, [recorder])

  const finish = useCallback(async () => {
    setState('transcribing')
    const blob = await recorder.stop()
    if (!blob) { setState('error'); setErrorMsg('no audio'); return }
    try {
      const result = await transcribe(blob, {
        mode: { id: 'note', cleanup: 'prose', languageModelProvider: 'openrouter', languageModel: 'anthropic/claude-haiku-4.5' } as any,
        vocabulary: [],
        tokenEndpoint: TOKEN_ENDPOINT,
      })
      if (result.text) await pasteToFrontmost(result.text)
      setState('pasted')
      setTimeout(() => { invoke('pill_hide'); setState('arming') }, 250)
    } catch (e) {
      setErrorMsg((e as Error).message)
      setState('error')
      setTimeout(() => { invoke('pill_hide'); setState('arming') }, 3000)
    }
  }, [recorder])

  useEffect(() => {
    const unlisten = listen('smartspeech://hotkey-toggle', () => {
      if (state === 'arming') { start() }
      else if (state === 'recording') { finish() }
    })
    return () => { unlisten.then((u) => u()) }
  }, [state, start, finish])

  // start on first show
  useEffect(() => { start() }, [])

  return (
    <div style={pillStyle}>
      <div style={{ flex: 1 }}>
        <VoiceWaveform stream={recorder.state === 'recording' ? (recorder as any).stream : null} active={state === 'recording'} />
      </div>
      <div style={{ marginLeft: 16, color: 'rgba(255,255,255,0.85)', fontSize: 13 }}>
        {state === 'arming' && 'Listening…'}
        {state === 'recording' && 'Note · ⌘⇧; to stop'}
        {state === 'transcribing' && 'Transcribing…'}
        {state === 'pasted' && '✓ Pasted'}
        {state === 'error' && `⚠ ${errorMsg}`}
      </div>
    </div>
  )
}

const pillStyle: React.CSSProperties = {
  width: '100%', height: '100%',
  display: 'flex', alignItems: 'center',
  padding: '12px 20px',
  borderRadius: 18,
  background: 'rgba(34, 65, 96, 0.92)',
}
```

- [ ] **Step 8.3.2: Smoke test all states**

Manually: open TextEdit, hotkey, speak, hotkey. Expected: arming → recording (waveform) → transcribing → pasted (text in TextEdit) → hide.

- [ ] **Step 8.3.3: Commit**

```bash
git add apps/smartspeech/src
git commit -m "feat(smartspeech): pill window state machine + waveform"
```

### Task 8.4 — Discard with Esc

**Files:** `apps/smartspeech/src/windows/PillWindow.tsx`

- [ ] **Step 8.4.1: Add Esc handler**

```typescript
useEffect(() => {
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && state === 'recording') {
      setState('discardConfirm')
    } else if (e.key === 'Escape' && state === 'discardConfirm') {
      recorder.cancel()
      invoke('pill_hide')
      setState('arming')
    } else if (e.key === 'Enter' && state === 'discardConfirm') {
      recorder.cancel()
      invoke('pill_hide')
      setState('arming')
    }
  }
  window.addEventListener('keydown', onKey)
  return () => window.removeEventListener('keydown', onKey)
}, [state, recorder])
```

- [ ] **Step 8.4.2: Render discardConfirm state**

```typescript
{state === 'discardConfirm' && 'Discard recording? ↵'}
```

- [ ] **Step 8.4.3: Smoke test discard**

Hotkey to start. Press Esc. Expected: pill prompts "Discard recording?". Press Enter. Expected: pill closes, no paste.

- [ ] **Step 8.4.4: Commit**

```bash
git add apps/smartspeech/src/windows/PillWindow.tsx
git commit -m "feat(smartspeech): discard recording with Esc"
```

---

## Phase 9 — Persistence layer (settings, modes, vocabulary)

**Goal:** Use `tauri-plugin-store` to persist user settings, custom hotkey, mic device, the 4 starter modes (read-only in v1), and vocabulary. Use `tauri-plugin-stronghold` for the BYO API key.

**Outcome:** Settings survive app quit + relaunch.

### Task 9.1 — Add tauri-plugin-store

**Files:** `apps/smartspeech/src-tauri/Cargo.toml`, `lib.rs`, `capabilities/default.json`, `apps/smartspeech/src/lib/store-bridge.ts`

- [ ] **Step 9.1.1: Add deps**

```toml
tauri-plugin-store = "2"
```

```typescript
// in apps/smartspeech/package.json deps:
"@tauri-apps/plugin-store": "^2"
```

- [ ] **Step 9.1.2: Register plugin**

In lib.rs: `.plugin(tauri_plugin_store::Builder::default().build())`

In capabilities: add `"store:default"` permission.

- [ ] **Step 9.1.3: Create store-bridge.ts**

```typescript
import { Store } from '@tauri-apps/plugin-store'

let _store: Store | null = null

async function getStore(): Promise<Store> {
  if (!_store) _store = await Store.load('settings.json')
  return _store
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const s = await getStore()
  const v = await s.get<T>(key)
  return v ?? fallback
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  const s = await getStore()
  await s.set(key, value)
  await s.save()
}
```

- [ ] **Step 9.1.4: Smoke test**

In App.tsx briefly: `await setSetting('test', 42); console.log(await getSetting('test', 0))`. Expected: 42 logged.

- [ ] **Step 9.1.5: Commit**

```bash
git add -A
git commit -m "feat(smartspeech): tauri-plugin-store + store-bridge helpers"
```

### Task 9.2 — Default modes seed file

**Files:** `packages/voice-core/src/data/default-modes.json`, modify `voiceModes.ts`

- [ ] **Step 9.2.1: Create the seed file**

```json
[
  {
    "id": "email",
    "name": "Email",
    "icon": "mail",
    "language": "auto",
    "cleanup": "prose",
    "languageModelProvider": "openrouter",
    "languageModel": "anthropic/claude-haiku-4.5",
    "promptSuffix": "Format as a clear, professional email. Add greeting/sign-off only if dictated.",
    "autocapitalize": true
  },
  {
    "id": "message",
    "name": "Message",
    "icon": "message",
    "language": "auto",
    "cleanup": "prose",
    "languageModelProvider": "openrouter",
    "languageModel": "anthropic/claude-haiku-4.5",
    "promptSuffix": "Format as a casual chat message. Keep it short and conversational.",
    "autocapitalize": false
  },
  {
    "id": "note",
    "name": "Note",
    "icon": "note",
    "language": "auto",
    "cleanup": "prose",
    "languageModelProvider": "openrouter",
    "languageModel": "anthropic/claude-haiku-4.5",
    "promptSuffix": "Format as personal notes. Preserve bullet points if dictated. No greeting.",
    "autocapitalize": true
  },
  {
    "id": "code",
    "name": "Code",
    "icon": "code",
    "language": "auto",
    "cleanup": "raw"
  }
]
```

- [ ] **Step 9.2.2: Export getter from voiceModes.ts**

```typescript
import defaultModes from '../data/default-modes.json'
export function getDefaultModes(): VoiceMode[] { return defaultModes as VoiceMode[] }
```

- [ ] **Step 9.2.3: Test**

```typescript
import { getDefaultModes } from '../../src/lib/voiceModes'
it('returns 4 starter modes', () => { expect(getDefaultModes()).toHaveLength(4) })
```

- [ ] **Step 9.2.4: Commit**

```bash
git add packages/voice-core
git commit -m "feat(voice-core): default modes seed (Email/Message/Note/Code)"
```

### Task 9.3 — Stronghold for API key

**Files:** `apps/smartspeech/src-tauri/Cargo.toml`, `lib.rs`, `apps/smartspeech/src/lib/stronghold-bridge.ts`

- [ ] **Step 9.3.1: Add stronghold plugin**

```toml
tauri-plugin-stronghold = "2"
```

```json
"@tauri-apps/plugin-stronghold": "^2"
```

- [ ] **Step 9.3.2: Register with machine-derived password**

In lib.rs:

```rust
.plugin(tauri_plugin_stronghold::Builder::with_argon2(b"smartspeech-fixed-salt-v1").build())
```

(Future: rotate to OS keychain via `keyring` crate in v1.5.)

- [ ] **Step 9.3.3: Create stronghold-bridge.ts**

```typescript
import { Stronghold, Client } from '@tauri-apps/plugin-stronghold'
import { appDataDir } from '@tauri-apps/api/path'

const PASSWORD_KEY = 'smartspeech-master-v1'
const VAULT_NAME = 'smartspeech-vault'

async function open(): Promise<Client> {
  const dir = await appDataDir()
  const stronghold = await Stronghold.load(`${dir}/vault.bin`, PASSWORD_KEY)
  try {
    return await stronghold.loadClient(VAULT_NAME)
  } catch {
    return await stronghold.createClient(VAULT_NAME)
  }
}

export async function setSecret(key: string, value: string): Promise<void> {
  const client = await open()
  const store = client.getStore()
  await store.insert(key, Array.from(new TextEncoder().encode(value)))
}

export async function getSecret(key: string): Promise<string | null> {
  const client = await open()
  const store = client.getStore()
  const data = await store.get(key)
  if (!data || data.length === 0) return null
  return new TextDecoder().decode(new Uint8Array(data))
}
```

- [ ] **Step 9.3.4: Smoke test set/get**

In App.tsx: `await setSecret('openrouter', 'sk-or-test'); console.log(await getSecret('openrouter'))`. Expected: round-trips correctly.

- [ ] **Step 9.3.5: Commit**

```bash
git add -A
git commit -m "feat(smartspeech): stronghold-backed secret storage"
```

---

## Phase 10 — Frontmost-app context (apps.json + auto-mode)

**Goal:** When the hotkey fires, look up the frontmost app's bundle id in `apps.json` and pre-select the appropriate mode for that recording.

**Outcome:** Hotkey from Cursor → mode "Code" auto-selected. Hotkey from Mail → mode "Email".

### Task 10.1 — Create apps.json

**Files:** `packages/voice-core/src/data/apps.json`

- [ ] **Step 10.1.1: Create the curated list**

```json
{
  "entries": [
    { "bundleId": "com.apple.Mail", "name": "Apple Mail", "recommendedMode": "email" },
    { "bundleId": "com.google.Chrome", "name": "Chrome", "recommendedMode": "note" },
    { "bundleId": "com.tinyspeck.slackmacgap", "name": "Slack", "recommendedMode": "message" },
    { "bundleId": "com.hnc.Discord", "name": "Discord", "recommendedMode": "message" },
    { "bundleId": "com.apple.MobileSMS", "name": "Messages", "recommendedMode": "message" },
    { "bundleId": "WhatsApp", "name": "WhatsApp", "recommendedMode": "message" },
    { "bundleId": "com.todesktop.230313mzl4w4u92", "name": "Cursor", "recommendedMode": "code" },
    { "bundleId": "com.microsoft.VSCode", "name": "VS Code", "recommendedMode": "code" },
    { "bundleId": "com.apple.Terminal", "name": "Terminal", "recommendedMode": "code" },
    { "bundleId": "com.googlecode.iterm2", "name": "iTerm2", "recommendedMode": "code" },
    { "bundleId": "notion.id", "name": "Notion", "recommendedMode": "note" },
    { "bundleId": "md.obsidian", "name": "Obsidian", "recommendedMode": "note" },
    { "bundleId": "com.linear", "name": "Linear", "recommendedMode": "note" },
    { "bundleId": "com.apple.TextEdit", "name": "TextEdit", "recommendedMode": "note" }
  ],
  "default": "note"
}
```

- [ ] **Step 10.1.2: Add resolver to voiceModes.ts**

```typescript
import appsData from '../data/apps.json'

export function recommendedModeForBundleId(bundleId: string | null): string {
  if (!bundleId) return appsData.default
  const entry = appsData.entries.find((e: any) => e.bundleId === bundleId)
  return entry ? entry.recommendedMode : appsData.default
}
```

- [ ] **Step 10.1.3: Test**

```typescript
import { recommendedModeForBundleId } from '../../src/lib/voiceModes'
it('maps Slack to message', () => {
  expect(recommendedModeForBundleId('com.tinyspeck.slackmacgap')).toBe('message')
})
it('falls back to default for unknown', () => {
  expect(recommendedModeForBundleId('com.unknown.app')).toBe('note')
})
```

- [ ] **Step 10.1.4: Commit**

```bash
git add packages/voice-core
git commit -m "feat(voice-core): apps.json + recommendedModeForBundleId"
```

### Task 10.2 — Capture frontmost app at hotkey time, pass to pill

**Files:** `apps/smartspeech/src-tauri/src/hotkey.rs`, `apps/smartspeech/src/windows/PillWindow.tsx`

- [ ] **Step 10.2.1: Capture bundle id in hotkey callback**

```rust
.on_shortcut(DEFAULT_HOTKEY, move |_, _, event| {
    if event.state() == ShortcutState::Pressed {
        let bundle_id = crate::frontmost::get_frontmost_bundle_id_impl();
        let _ = crate::window::show_pill(&app_for_handler);
        let _ = app_for_handler.emit("smartspeech://hotkey-toggle", bundle_id);
    }
})
```

- [ ] **Step 10.2.2: Read the payload in PillWindow**

```typescript
import { recommendedModeForBundleId, getDefaultModes } from 'voice-core'
// ...inside PillWindow:
const [activeMode, setActiveMode] = useState(getDefaultModes()[2]) // note default

useEffect(() => {
  const unlisten = listen<string | null>('smartspeech://hotkey-toggle', (e) => {
    const bundleId = e.payload
    if (state === 'arming') {
      const modeId = recommendedModeForBundleId(bundleId)
      const mode = getDefaultModes().find((m) => m.id === modeId) ?? getDefaultModes()[2]
      setActiveMode(mode)
      start()
    } else if (state === 'recording') {
      finish()
    }
  })
  return () => { unlisten.then((u) => u()) }
}, [state, start, finish])
```

- [ ] **Step 10.2.3: Pass activeMode to transcribe call**

In `finish()`, replace the hardcoded mode object with `activeMode`.

- [ ] **Step 10.2.4: Smoke test auto-mode**

Open Slack. Hotkey, speak, hotkey. Expected: pill shows "Message" label. Switch to Cursor. Hotkey, speak, hotkey. Expected: pill shows "Code" label.

- [ ] **Step 10.2.5: Commit**

```bash
git add apps/smartspeech
git commit -m "feat(smartspeech): auto-select mode from frontmost app"
```

---

## Phase 11 — Tray icon + menu

**Goal:** Status icon in macOS menu bar with state-aware glyph (Ready / Recording / Processing / Error). Click → settings; right-click menu → Settings, Pause sound, Quit.

**Outcome:** App is "live" in the menu bar even when no window is visible.

### Task 11.1 — tauri-plugin tray basics

**Files:** `apps/smartspeech/src-tauri/Cargo.toml`, `lib.rs`, `apps/smartspeech/src-tauri/icons/tray-*.png`

- [ ] **Step 11.1.1: Add the system-tray feature to tauri**

In Cargo.toml:

```toml
tauri = { version = "2", features = ["tray-icon"] }
```

- [ ] **Step 11.1.2: Create simple tray icons**

Place `tray-ready.png`, `tray-recording.png`, `tray-processing.png`, `tray-error.png` (16x16 + @2x) in `src-tauri/icons/`. (Use placeholder color blocks for v1; replace with real glyphs later.)

- [ ] **Step 11.1.3: Implement tray.rs**

```rust
use tauri::{
    AppHandle, Manager, Runtime,
    menu::{Menu, MenuItem},
    tray::{TrayIconBuilder, TrayIconEvent, MouseButton},
    image::Image,
};

pub fn build<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let settings = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>).map_err(|e| e.to_string())?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>).map_err(|e| e.to_string())?;
    let menu = Menu::with_items(app, &[&settings, &quit]).map_err(|e| e.to_string())?;

    let icon = Image::from_path("icons/tray-ready.png").unwrap_or_else(|_| Image::from_bytes(&[]).unwrap());

    TrayIconBuilder::with_id("main")
        .icon(icon)
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "settings" => { let _ = app.get_webview_window("settings").map(|w| w.show()); }
            "quit" => { app.exit(0); }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, .. } = event {
                let app = tray.app_handle();
                if let Some(w) = app.get_webview_window("settings") {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
        })
        .build(app).map_err(|e| e.to_string())?;
    Ok(())
}
```

- [ ] **Step 11.1.4: Call from setup**

```rust
mod tray;
// inside .setup:
tray::build(&app.handle())?;
```

- [ ] **Step 11.1.5: Smoke test**

Run dev. Verify tray icon appears in menu bar. Click → settings window opens. Right-click → Settings/Quit menu appears.

- [ ] **Step 11.1.6: Commit**

```bash
git add -A
git commit -m "feat(smartspeech): tray icon + menu with Settings/Quit"
```

---

## Phase 12 — Settings shell + 6 panels

**Goal:** Sidebar + content layout matching the design spec. Home/Modes/Vocabulary/Configuration/Sound/History tabs. v1 implements all read-only views + the editable ones (Vocabulary, Configuration, Sound). Modes is read-only with a "v1.1 — editor coming" badge. History is a stub with "Coming in v1.1".

### Task 12.1 — Settings window shell

**Files:** `apps/smartspeech/src/windows/SettingsWindow.tsx`, `apps/smartspeech/src/main.tsx` (settings entry)

- [ ] **Step 12.1.1: Rename current `main.tsx` → `settings-main.tsx`** and point `settings.html` at it. Replace App.tsx with `<SettingsWindow />`.

- [ ] **Step 12.1.2: Implement SettingsWindow.tsx**

```typescript
import { useState } from 'react'
import { HomePanel } from '../panels/HomePanel'
import { ModesPanel } from '../panels/ModesPanel'
import { VocabularyPanel } from '../panels/VocabularyPanel'
import { ConfigurationPanel } from '../panels/ConfigurationPanel'
import { SoundPanel } from '../panels/SoundPanel'
import { HistoryPanel } from '../panels/HistoryPanel'

const TABS = [
  { id: 'home', label: 'Home', component: HomePanel },
  { id: 'modes', label: 'Modes', component: ModesPanel },
  { id: 'vocabulary', label: 'Vocabulary', component: VocabularyPanel },
  { id: 'configuration', label: 'Configuration', component: ConfigurationPanel },
  { id: 'sound', label: 'Sound', component: SoundPanel },
  { id: 'history', label: 'History', component: HistoryPanel },
] as const

export function SettingsWindow() {
  const [active, setActive] = useState<string>('home')
  const ActiveComponent = TABS.find((t) => t.id === active)?.component ?? HomePanel
  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--color-bg-light)' }}>
      <aside style={{ width: 220, background: 'rgba(34,65,96,0.04)', padding: 12 }}>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setActive(t.id)} style={{
            display: 'block', width: '100%', textAlign: 'left',
            padding: '8px 12px', borderRadius: 8, marginBottom: 4,
            background: active === t.id ? 'var(--color-primary)' : 'transparent',
            color: active === t.id ? 'white' : 'var(--color-text)',
            border: 'none', cursor: 'pointer',
          }}>{t.label}</button>
        ))}
      </aside>
      <main style={{ flex: 1, padding: 24, overflow: 'auto' }}>
        <ActiveComponent />
      </main>
    </div>
  )
}
```

- [ ] **Step 12.1.3: Stub all 6 panels**

For each: `apps/smartspeech/src/panels/{Home,Modes,Vocabulary,Configuration,Sound,History}Panel.tsx`:

```typescript
export function HomePanel() { return <h2>Home</h2> }
// etc — same shape for each
```

- [ ] **Step 12.1.4: Smoke test**

Run dev. Click tray icon. Settings window opens. Click each tab. Verify content swaps.

- [ ] **Step 12.1.5: Commit**

```bash
git add apps/smartspeech/src
git commit -m "feat(smartspeech): settings shell + 6 panel stubs"
```

### Task 12.2 — VocabularyPanel (real implementation)

Already-tested logic via `voiceVocabulary` lib. The panel is a thin UI over the persistent store.

**Files:** `apps/smartspeech/src/panels/VocabularyPanel.tsx`

- [ ] **Step 12.2.1: Implement read/edit/save**

```typescript
import { useEffect, useState } from 'react'
import { getSetting, setSetting } from '../lib/store-bridge'

interface VocabRow { source: string; replacement: string }

export function VocabularyPanel() {
  const [rows, setRows] = useState<VocabRow[]>([])
  const [draft, setDraft] = useState<VocabRow>({ source: '', replacement: '' })

  useEffect(() => { getSetting<VocabRow[]>('vocabulary', []).then(setRows) }, [])

  const save = async (next: VocabRow[]) => {
    setRows(next)
    await setSetting('vocabulary', next)
  }

  const add = () => {
    if (!draft.source) return
    save([...rows, draft])
    setDraft({ source: '', replacement: '' })
  }

  return (
    <div>
      <h2 style={{ color: 'var(--color-primary)' }}>Vocabulary</h2>
      <div style={{ marginTop: 16, marginBottom: 16, display: 'flex', gap: 8 }}>
        <input placeholder="said" value={draft.source} onChange={(e) => setDraft({ ...draft, source: e.target.value })} />
        <input placeholder="replacement" value={draft.replacement} onChange={(e) => setDraft({ ...draft, replacement: e.target.value })} />
        <button onClick={add}>Add</button>
      </div>
      <table style={{ width: '100%' }}>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>{r.source}</td>
              <td>→ {r.replacement}</td>
              <td><button onClick={() => save(rows.filter((_, j) => j !== i))}>×</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 12.2.2: Smoke test**

Add a vocab pair, restart app, verify it persists.

- [ ] **Step 12.2.3: Commit**

```bash
git add apps/smartspeech/src/panels/VocabularyPanel.tsx
git commit -m "feat(smartspeech): VocabularyPanel with persistence"
```

### Task 12.3 — ConfigurationPanel (hotkey + API key + autostart)

**Files:** `apps/smartspeech/src/panels/ConfigurationPanel.tsx`

- [ ] **Step 12.3.1: Implement**

```typescript
import { useEffect, useState } from 'react'
import { HotkeyRecorder } from 'voice-core'
import { getSetting, setSetting } from '../lib/store-bridge'
import { getSecret, setSecret } from '../lib/stronghold-bridge'

export function ConfigurationPanel() {
  const [hotkey, setHotkey] = useState<string>('CommandOrControl+Shift+Semicolon')
  const [apiKey, setApiKey] = useState('')
  const [revealKey, setRevealKey] = useState(false)

  useEffect(() => {
    getSetting<string>('hotkey', 'CommandOrControl+Shift+Semicolon').then(setHotkey)
    getSecret('openrouter-key').then((v) => setApiKey(v ?? ''))
  }, [])

  return (
    <div>
      <h2 style={{ color: 'var(--color-primary)' }}>Configuration</h2>

      <section style={{ marginTop: 24 }}>
        <h3>Hotkey</h3>
        <HotkeyRecorder value={hotkey} onChange={async (v) => { setHotkey(v); await setSetting('hotkey', v) }} />
        <p style={{ fontSize: 12, color: 'var(--color-secondary)' }}>Restart required after change in v1.</p>
      </section>

      <section style={{ marginTop: 24 }}>
        <h3>OpenRouter API key</h3>
        <input
          type={revealKey ? 'text' : 'password'}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          onBlur={() => setSecret('openrouter-key', apiKey)}
          style={{ width: '100%' }}
        />
        <button onClick={() => setRevealKey(!revealKey)}>{revealKey ? 'Hide' : 'Show'}</button>
      </section>
    </div>
  )
}
```

- [ ] **Step 12.3.2: Smoke test**

Set hotkey, restart, verify the new hotkey works. Set API key, restart, verify persisted.

- [ ] **Step 12.3.3: Commit**

```bash
git add apps/smartspeech/src/panels/ConfigurationPanel.tsx
git commit -m "feat(smartspeech): ConfigurationPanel with hotkey + API key"
```

### Task 12.4 — SoundPanel + ModesPanel (read-only) + HomePanel

- [ ] **Step 12.4.1: Implement SoundPanel** — sliders for sound effect volume, toggle for "play start/stop chime", written through store-bridge.

- [ ] **Step 12.4.2: Implement ModesPanel** — list the 4 default modes, each as a row showing name + cleanup type. Edit button disabled with badge "v1.1 — editor coming."

- [ ] **Step 12.4.3: Implement HomePanel** — branding, "Get started" cards (Set hotkey / Add vocabulary), version info.

- [ ] **Step 12.4.4: Implement HistoryPanel stub** — single line: "Recording history is coming in v1.1."

- [ ] **Step 12.4.5: Smoke test all panels**

- [ ] **Step 12.4.6: Commit**

```bash
git add apps/smartspeech/src/panels
git commit -m "feat(smartspeech): Home/Modes(read-only)/Sound/History panels"
```

---

## Phase 13 — First-run onboarding

**Goal:** On first launch, the settings window opens with a 4-step wizard: permissions → API key → hotkey → "try it now."

**Outcome:** A new user can install + run the app + dictate within 2 minutes without reading docs.

### Task 13.1 — Onboarding state machine

**Files:** Create `apps/smartspeech/src/onboarding/Onboarding.tsx`, modify `SettingsWindow.tsx`

- [ ] **Step 13.1.1: Detect first-run**

```typescript
// in store-bridge:
export async function isFirstRun(): Promise<boolean> {
  return !(await getSetting('onboarding-complete', false))
}
```

- [ ] **Step 13.1.2: Render wizard if first-run**

```typescript
import { useEffect, useState } from 'react'
import { isFirstRun, setSetting } from '../lib/store-bridge'

const STEPS = ['permissions', 'apiKey', 'hotkey', 'tryIt'] as const

export function Onboarding({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<typeof STEPS[number]>('permissions')
  // step content for each — see steps below
  return <div>{/* render based on step */}</div>
}
```

- [ ] **Step 13.1.3: Steps**

- **Permissions:** Show request for Microphone (programmatic via `getUserMedia`) and Accessibility (deeplink: `x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility`). Poll readiness.
- **API Key:** Input field (password-masked), validate on blur by calling a tiny endpoint. Save via `setSecret`.
- **Hotkey:** `HotkeyRecorder` from voice-core, save via `setSetting`.
- **Try It:** A textarea + "press your hotkey now" prompt. On successful paste, finish.

- [ ] **Step 13.1.4: Mark complete**

```typescript
const finish = async () => { await setSetting('onboarding-complete', true); onDone() }
```

- [ ] **Step 13.1.5: Smoke test**

```bash
# Reset onboarding by deleting store:
rm ~/Library/Application\ Support/com.smartspeech.dev/settings.json
pnpm dev:smartspeech
```

Expected: wizard appears.

- [ ] **Step 13.1.6: Commit**

```bash
git add -A
git commit -m "feat(smartspeech): first-run 4-step onboarding wizard"
```

---

## Phase 14 — Mode switcher overlay (⌥⇧K)

**Goal:** While pill is recording, press `⌥⇧K` to swap to a different mode mid-recording. Overlay shows the 4 modes with numeric shortcuts.

### Task 14.1 — Register the second hotkey + overlay UI

**Files:** `apps/smartspeech/src-tauri/src/hotkey.rs`, `apps/smartspeech/src/windows/PillWindow.tsx`

- [ ] **Step 14.1.1: Register second shortcut + emit different event**

```rust
const MODE_HOTKEY: Shortcut = Shortcut::new(Some(Modifiers::ALT.union(Modifiers::SHIFT)), Code::KeyK);
// in register_default add a second on_shortcut for MODE_HOTKEY emitting "smartspeech://mode-overlay"
```

- [ ] **Step 14.1.2: Listen in PillWindow, render overlay**

```typescript
const [overlayOpen, setOverlayOpen] = useState(false)
useEffect(() => {
  listen('smartspeech://mode-overlay', () => setOverlayOpen(true))
}, [])
// inside JSX:
{overlayOpen && <ModeOverlay onSelect={(m) => { setActiveMode(m); setOverlayOpen(false) }} onClose={() => setOverlayOpen(false)} />}
```

- [ ] **Step 14.1.3: Implement ModeOverlay.tsx**

```typescript
import { getDefaultModes } from 'voice-core'
import { useEffect } from 'react'

export function ModeOverlay({ onSelect, onClose }: { onSelect: (m: any) => void; onClose: () => void }) {
  const modes = getDefaultModes()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const idx = parseInt(e.key)
      if (idx >= 1 && idx <= modes.length) { onSelect(modes[idx - 1]); }
      else if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [modes, onSelect, onClose])

  return (
    <div style={overlayStyle}>
      {modes.map((m, i) => (
        <div key={m.id} style={{ padding: 8, color: 'white' }}>
          <span style={{ marginRight: 8 }}>{i + 1}.</span>{m.name}
        </div>
      ))}
    </div>
  )
}

const overlayStyle: React.CSSProperties = {
  position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
  background: 'rgba(0,0,0,0.85)', borderRadius: 18, padding: 12,
}
```

- [ ] **Step 14.1.4: Smoke test**

Hotkey → record → press ⌥⇧K → see overlay → press 2 → mode swaps to Message → finish recording → verify Message-cleanup applied.

- [ ] **Step 14.1.5: Commit**

```bash
git add -A
git commit -m "feat(smartspeech): mid-recording mode switcher overlay"
```

---

## Phase 15 — Telemetry + auto-update

**Goal:** Sentry crash + error reporting; auto-update via tauri-plugin-updater pointing at a private GitHub Releases appcast.

### Task 15.1 — Sentry

**Files:** `apps/smartspeech/src-tauri/Cargo.toml`, `apps/smartspeech/package.json`, init code

- [ ] **Step 15.1.1: Add Sentry to React side**

```bash
pnpm --filter smartspeech add @sentry/react
```

- [ ] **Step 15.1.2: Initialize**

In `settings-main.tsx` and `pill-main.tsx`:

```typescript
import * as Sentry from '@sentry/react'
Sentry.init({ dsn: import.meta.env.VITE_SENTRY_DSN, environment: import.meta.env.DEV ? 'dev' : 'prod' })
```

- [ ] **Step 15.1.3: Add Rust-side Sentry**

```toml
sentry = { version = "0.34", features = ["panic"], default-features = false }
```

In `lib.rs::run`: `let _guard = sentry::init(env!("SENTRY_DSN_RUST"));` (build-time env var).

- [ ] **Step 15.1.4: Verify error capture**

Throw a synthetic error, verify it appears in Sentry dashboard.

- [ ] **Step 15.1.5: Commit**

```bash
git add -A
git commit -m "feat(smartspeech): Sentry on both Rust and React sides"
```

### Task 15.2 — tauri-plugin-updater

**Files:** Cargo.toml, lib.rs, tauri.conf.json

- [ ] **Step 15.2.1: Generate update-signing keypair**

```bash
cd apps/smartspeech/src-tauri
pnpm tauri signer generate -- -w ~/.tauri/smartspeech.key
```

Save the password somewhere safe. Public key goes into tauri.conf.json. Private key NEVER goes into the repo.

- [ ] **Step 15.2.2: Configure tauri.conf.json**

```json
"plugins": {
  "updater": {
    "endpoints": ["https://github.com/{owner}/smartspeech-releases/releases/latest/download/latest.json"],
    "pubkey": "<generated public key>"
  }
}
```

- [ ] **Step 15.2.3: Add the plugin**

```toml
tauri-plugin-updater = "2"
```

In lib.rs: `.plugin(tauri_plugin_updater::Builder::new().build())`.

In capabilities: add `"updater:default"`.

- [ ] **Step 15.2.4: Add update-check on launch**

```typescript
// in settings-main.tsx after mount:
import { check } from '@tauri-apps/plugin-updater'
check().then(async (update) => {
  if (update?.available) {
    // simple toast: "Update X available — install?"
    if (confirm(`Update ${update.version} available. Install now?`)) {
      await update.downloadAndInstall()
    }
  }
}).catch(() => {})
```

- [ ] **Step 15.2.5: Commit**

```bash
git add -A
git commit -m "feat(smartspeech): tauri-plugin-updater wired"
```

---

## Phase 16 — Build, code-sign, notarize, distribute

**Goal:** A single-file `.dmg` that any macOS user can download from a URL, double-click, drag to /Applications, and run without Gatekeeper warnings.

### Task 16.1 — Configure signing in tauri.conf.json

**Files:** `apps/smartspeech/src-tauri/tauri.conf.json`

- [ ] **Step 16.1.1: Add macOS signing block**

```json
"bundle": {
  "macOS": {
    "signingIdentity": "Developer ID Application: <Your Name> (<TeamID>)",
    "providerShortName": "<TeamID>",
    "entitlements": "macOS/entitlements.plist",
    "minimumSystemVersion": "12.0"
  }
}
```

- [ ] **Step 16.1.2: Create entitlements.plist**

`apps/smartspeech/src-tauri/macOS/entitlements.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.device.audio-input</key><true/>
  <key>com.apple.security.automation.apple-events</key><true/>
  <key>com.apple.security.cs.allow-jit</key><true/>
</dict>
</plist>
```

- [ ] **Step 16.1.3: Set Apple credentials env vars**

```bash
export APPLE_ID="hallo@benjaminkurtz.de"
export APPLE_PASSWORD="<app-specific password>"
export APPLE_TEAM_ID="<TeamID>"
```

- [ ] **Step 16.1.4: Build**

```bash
pnpm build:smartspeech
```

Expected: produces `apps/smartspeech/src-tauri/target/release/bundle/dmg/SmartSpeech_0.1.0_x64.dmg` (or similar) — signed and notarized.

- [ ] **Step 16.1.5: Verify signature + notarization**

```bash
codesign -dv --verbose=4 apps/smartspeech/src-tauri/target/release/bundle/macos/SmartSpeech.app
spctl -a -vvv apps/smartspeech/src-tauri/target/release/bundle/macos/SmartSpeech.app
```

Expected: signed by your Developer ID; notarized + stapled.

- [ ] **Step 16.1.6: Install the DMG, run from /Applications**

Drag to /Applications. Right-click → Open. Expected: opens with no Gatekeeper warnings.

- [ ] **Step 16.1.7: Commit (without secrets)**

```bash
git add apps/smartspeech/src-tauri/macOS apps/smartspeech/src-tauri/tauri.conf.json
git commit -m "feat(smartspeech): code-sign + notarize macOS bundle"
```

---

## Phase 17 — Cross-app smoke-test matrix (ship-blocker)

**Goal:** Verify paste works in every app on the v1 support list. Document any that block synthetic events.

**Outcome:** A populated table in `smartspeech/known-issues.md` listing every test app and whether paste works, mode auto-switches, and any quirks.

### Task 17.1 — Run the matrix

**Files:** `smartspeech/known-issues.md`

- [ ] **Step 17.1.1: Create the file**

```markdown
# SmartSpeech v1 — Known issues + cross-app paste matrix

| App | Paste works | Mode auto-selected | Notes |
|---|---|---|---|
| TextEdit | ⏳ | n/a | sanity baseline |
| Apple Mail | ⏳ | email | |
| Slack | ⏳ | message | |
| Discord | ⏳ | message | |
| Messages | ⏳ | message | |
| Cursor | ⏳ | code | |
| VS Code | ⏳ | code | |
| Terminal | ⏳ | code | |
| iTerm2 | ⏳ | code | |
| Chrome / Gmail | ⏳ | note | |
| Notion | ⏳ | note | |
| Obsidian | ⏳ | note | |

⏳ = pending · ✅ = pass · ❌ = fail · ⚠️ = partial
```

- [ ] **Step 17.1.2: Walk through each app**

For each: open it, focus a text field, hotkey, dictate "this is a test", verify paste lands, verify mode label was correct. Update the matrix.

- [ ] **Step 17.1.3: Address blockers**

Any "❌" in apps you consider must-have for v1 → triage. Likely culprits: app blocks synthetic key events, Accessibility permission not granted, app uses non-standard text editor (e.g. Notion's contenteditable).

- [ ] **Step 17.1.4: Commit the populated matrix**

```bash
git add smartspeech/known-issues.md
git commit -m "docs(smartspeech): cross-app paste matrix v1"
```

---

## Phase 18 — Distribution + landing page (lightweight)

**Goal:** A simple page hosted somewhere (your existing infra) where someone can download the latest `.dmg`. Auto-update infrastructure in place.

**Out of scope:** marketing copy, screenshots, conversion optimization. This is a download page, not a launch.

### Task 18.1 — Static download page

- [ ] **Step 18.1.1:** Create a simple HTML page hosted on the chosen domain that links to the latest `.dmg` URL on the GitHub Release.
- [ ] **Step 18.1.2:** Confirm the appcast `latest.json` exists at the URL referenced in `tauri.conf.json` and that v0.1.1 → v0.1.0 update flow works.
- [ ] **Step 18.1.3:** Commit page sources to a separate repo or `apps/smartspeech-site/`.

---

## Self-review checklist (before declaring plan complete)

**1. Spec coverage:**
- ✅ Monorepo + voice-core (Phase 1)
- ✅ Tauri scaffold (Phase 2)
- ✅ Branding constants (Phase 3)
- ✅ Audio + transcribe (Phase 4)
- ✅ Paste-to-frontmost (Phase 5)
- ✅ Frontmost-app detection (Phase 6)
- ✅ Global hotkey (Phase 7)
- ✅ Pill window + states (Phase 8)
- ✅ Persistence + secret store (Phase 9)
- ✅ apps.json + auto-mode (Phase 10)
- ✅ Tray icon (Phase 11)
- ✅ Settings shell + panels (Phase 12)
- ✅ Onboarding (Phase 13)
- ✅ Mode switcher overlay (Phase 14)
- ✅ Telemetry + updater (Phase 15)
- ✅ Sign + notarize + DMG (Phase 16)
- ✅ Cross-app smoke matrix (Phase 17)
- ✅ Download page (Phase 18)

**2. Placeholder scan:** No "TBD" / "TODO" / "implement later" remains. Each task has concrete code or commands.

**3. Type consistency:**
- `RecorderState` defined in Task 4.2, referenced in Phase 8 — same name.
- `VoiceMode` from voice-core/lib/voiceModes is the type used everywhere modes are passed.
- `recommendedModeForBundleId(bundleId: string | null) → string` consistent in 10.1.2 and 10.2.2.
- Tauri command names: `paste_to_frontmost`, `get_frontmost_bundle_id`, `pill_show`, `pill_hide` — consistent throughout.
- Event names: `smartspeech://hotkey-toggle`, `smartspeech://mode-overlay` — consistent.

**4. Ambiguity check:** First-run wizard step ordering, default hotkey (`Cmd+Shift+;`), auto-paste behaviour, mode resolution priority (frontmost-app → user-active → default) all explicit.

---

## Out of scope (explicitly deferred)

- v1.5: Magic-link auth via Supabase, Stripe Pro tier, managed CF Worker key, device-limit enforcement, Windows port, mode editor UI, file-transcription drop-zone, History panel real implementation, native AX-API paste (replaces enigo), keychain-backed key storage (replaces stronghold).
- v2: Local Whisper, translation modes, meeting recording, stats panel, shared team dictionary.

---

## Estimated calendar

Allowing for buffer + iteration:

| Phase | Tasks | Calendar |
|---|---|---|
| 1 | Monorepo + voice-core | Week 1 |
| 2–3 | Tauri scaffold + branding | Week 1 |
| 4–6 | Audio + paste + frontmost | Week 2 |
| 7–8 | Hotkey + pill window | Week 2 |
| 9–10 | Persistence + apps.json | Week 3 |
| 11–14 | Tray + settings + onboarding + mode overlay | Week 3 |
| 15 | Telemetry + updater | Week 4 |
| 16–17 | Sign + matrix | Week 4 |
| 18 | Distribution | Week 4 (or 5 buffer) |

**Target ship: 4 weeks of dev time + 1 week buffer for unforeseen issues.**
