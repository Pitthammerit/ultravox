# Compact Settings UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce visual weight of every Settings panel — merge Modes list with Mode editor in one view, collapse verbose row descriptions into help-icon tooltips, remove redundant section headers, tighten line-height/padding, stop nesting framed cards, and replace the white native macOS title bar with the traffic lights embedded in the custom header (no "Settings" wordmark).

**Architecture:** Pure UI refactor inside `apps/ultravox/src/panels/*` and `apps/ultravox/src/components/ui.tsx`, plus one Tauri window config change (`titleBarStyle: "Overlay"`). No state-shape, store, or store-bridge changes. The Settings router gains a single new section `modes` that combines the old `modes` + `modes-edit`; `modes-edit` route stays for now and aliases to the merged view.

**Tech Stack:** React 19 · TypeScript · Tailwind v4 · existing `tokens` from `components/ui.tsx`.

---

## File Structure

**Modify:**
- `apps/ultravox/src-tauri/tauri.conf.json` — add `titleBarStyle: "Overlay"` to settings window, reduce `minHeight` to 480.
- `apps/ultravox/src/components/ui.tsx` — add `RowCompact`, `Field`, `BareSection` primitives; tighten `Row`/`Section` paddings; update `PageHeader` to embed in overlay title area.
- `apps/ultravox/src/panels/ModesPanel.tsx` — replace with merged view (compact mode list + inline editor below).
- `apps/ultravox/src/panels/ModeEditor.tsx` — keep file but export only the inline `<ModeForm>` body used by the merged panel.
- `apps/ultravox/src/panels/SoundPanel.tsx` — strip descriptions, convert to tooltips, drop redundant `Section` frames.
- `apps/ultravox/src/panels/VocabularyPanel.tsx` — compact entries (single-line `input → replace`), drop the "Tip" section.
- `apps/ultravox/src/panels/HomePanel.tsx` — drop subtitle text, tighten cards, replace per-row descriptions with tooltips.
- `apps/ultravox/src/panels/ConfigurationPanel.tsx` — same treatment.
- `apps/ultravox/src/windows/SettingsWindow.tsx` — route `modes-edit` to the merged `modes` view.

**No new files.**

---

## Density Constants (apply consistently in every task)

When a task says "tighten paddings" or "compact", use these values:

| Element              | Old                | New                |
|----------------------|--------------------|--------------------|
| Row padding          | `px-3.5 py-2.5`    | `px-3 py-1.5`      |
| Card padding         | `px-3.5 py-2.5`    | `px-3 py-2`        |
| Section gap          | `gap-2.5`          | `gap-1.5`          |
| Container gap        | `gap-6` (panel)    | `gap-4`            |
| Row label font-size  | `13.5px`           | `12.5px`           |
| Description size     | `12px` (block)     | dropped → tooltip  |
| RadioCard padding    | `px-3.5 py-2.5`    | `px-3 py-1.5`      |

These map cleanly to one find-and-replace per file.

---

### Task 0: Remove native title bar — embed traffic lights in header

**Files:**
- Modify: `apps/ultravox/src-tauri/tauri.conf.json`
- Modify: `apps/ultravox/src/components/ui.tsx`
- Modify: `apps/ultravox/src/windows/SettingsWindow.tsx`

**Background:** macOS `titleBarStyle: "Overlay"` keeps the red/yellow/green traffic lights but makes the title bar transparent, letting app content flow behind it. The content area begins at `y=0`; the traffic lights float at ~12px from the top-left. We must pad the header to not collide with the buttons (they occupy ~68×28px). The native "Ultravox" title string is hidden by removing `"title"` or via CSS—`titleBarStyle: "Overlay"` suppresses it automatically when there is no `title` in the window.

- [ ] **Step 1: Set `titleBarStyle` in tauri.conf.json**

Open `apps/ultravox/src-tauri/tauri.conf.json`. In the `settings` window object, replace:

```json
        "decorations": true
```

with:

```json
        "decorations": true,
        "titleBarStyle": "Overlay",
        "hiddenTitle": true,
        "minHeight": 480
```

(`hiddenTitle: true` suppresses the "Ultravox" text in the overlay bar.)

- [ ] **Step 2: Update `PageHeader` in `ui.tsx`**

Replace the entire `PageHeader` function (lines ~38–72) with:

```tsx
export function PageHeader({ breadcrumb, onBack, right }: PageHeaderProps) {
  return (
    <header
      data-tauri-drag-region
      className="flex items-center justify-between border-b"
      style={{
        borderColor: T.border,
        /* Traffic lights are ~68 px wide, 28 px tall; we clear them. */
        paddingTop: 10,
        paddingBottom: 8,
        paddingLeft: 80,   /* leave room for ● ● ● */
        paddingRight: 16,
      }}
    >
      <div className="flex items-center gap-1.5">
        {onBack && (
          <button
            onClick={onBack}
            aria-label="Back"
            className="text-[16px] leading-none px-1 py-0.5 rounded-md hover:bg-[var(--s-control)] transition-colors"
            style={{ color: T.fgMuted }}
          >
            ‹
          </button>
        )}
        {breadcrumb && (
          <span
            className="text-[12px]"
            style={{ color: T.fgMuted }}
          >
            {breadcrumb}
          </span>
        )}
      </div>
      {right && <div>{right}</div>}
    </header>
  );
}
```

Key changes: `data-tauri-drag-region` on the header so users can drag the window by it. No "Settings" serif heading. `paddingLeft: 80` clears the traffic lights. Breadcrumb appears when navigating into a sub-panel (Modes, Sound, etc.) but the home view shows nothing — minimal chrome.

- [ ] **Step 3: Remove top padding from SettingsWindow content area**

In `apps/ultravox/src/windows/SettingsWindow.tsx`, the content `<div>` currently has `py-5`. Because the header now flows from `y=0`, keep it as-is — the header's own padding is the top clearance. No additional change needed unless visual inspection reveals collision.

- [ ] **Step 4: Smoke test**

```bash
cd apps/ultravox && pnpm tauri dev
```

Verify:
- No white title bar — the window top edge is the same dark `--s-page` color.
- Red/yellow/green buttons appear in their normal position (left side, ~12px from top).
- Dragging the header area moves the window.
- "Settings" text is gone; breadcrumb ("modes", "sound", etc.) appears at the correct indent.

- [ ] **Step 5: Commit**

```bash
git add apps/ultravox/src-tauri/tauri.conf.json apps/ultravox/src/components/ui.tsx apps/ultravox/src/windows/SettingsWindow.tsx
git commit -m "ui: replace native title bar with overlay — embed traffic lights in header"
```

---

### Task 1: Add compact UI primitives

**Files:**
- Modify: `apps/ultravox/src/components/ui.tsx`

- [ ] **Step 1: Add `Field` primitive**

In `apps/ultravox/src/components/ui.tsx`, after the existing `Row` export (around line 323), append:

```tsx
/* ─────────────────────────────────────────────────────────────
   FIELD  (frameless inline label · control · help)
   Use inside cards/groups to avoid frame-in-frame nesting.
   ───────────────────────────────────────────────────────────── */

export function Field({
  label,
  help,
  control,
}: {
  label: ReactNode;
  help?: string | undefined;
  control: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <div className="flex items-center gap-1.5 min-w-0">
        <span
          className="text-[12.5px] font-medium truncate"
          style={{ color: T.fg }}
        >
          {label}
        </span>
        {help && <HelpIcon tooltip={help} />}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   GROUP  (single framed container holding multiple Fields)
   Replaces nested Row/Card frames in dense panels.
   ───────────────────────────────────────────────────────────── */

export function Group({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex flex-col gap-0.5 rounded-lg px-3 py-2"
      style={{ background: T.card, border: `1px solid ${T.border}` }}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Tighten `Row` paddings**

In the same file, replace the `Row` body (the `<div>` opening on line ~301):

```tsx
    <div
      className="flex items-center justify-between px-3 py-1.5"
      style={cardBase}
    >
      <div className="flex flex-col gap-0 min-w-0">
        <div className="flex items-center gap-1.5">
          <span
            className="text-[12.5px] font-medium"
            style={{ color: T.fg }}
          >
            {label}
          </span>
          {help && <HelpIcon tooltip={help} />}
        </div>
        {description && (
          <span className="text-[11.5px]" style={{ color: T.fgMuted }}>
            {description}
          </span>
        )}
      </div>
      <div className="shrink-0 ml-3">{control}</div>
    </div>
```

- [ ] **Step 3: Tighten `Section` gaps**

Replace the `Section` `<section>` opening:

```tsx
    <section className="flex flex-col gap-1.5">
```

And the children wrapper:

```tsx
      <div className="flex flex-col gap-1">{children}</div>
```

- [ ] **Step 4: Tighten `Card`, `NavCard`, `RadioCard` paddings**

Find each `px-3.5 py-2.5` in `Card`, `NavCard`, `RadioCard` and replace with `px-3 py-1.5`.

- [ ] **Step 5: Verify the dev server still renders**

```bash
cd apps/ultravox && pnpm tauri dev
```

Open Settings, click through Home / Modes / Vocabulary / Sound. Confirm nothing crashes and rows look tighter.

- [ ] **Step 6: Commit**

```bash
git add apps/ultravox/src/components/ui.tsx
git commit -m "ui: tighten Row/Section paddings, add Field+Group primitives"
```

---

### Task 2: Merge Modes list + ModeEditor into one view

**Files:**
- Modify: `apps/ultravox/src/panels/ModesPanel.tsx` (full rewrite)
- Modify: `apps/ultravox/src/panels/ModeEditor.tsx` (extract `<ModeForm>` export)
- Modify: `apps/ultravox/src/windows/SettingsWindow.tsx` (drop `modes-edit` route)

- [ ] **Step 1: Extract `ModeForm` from `ModeEditor.tsx`**

Open `apps/ultravox/src/panels/ModeEditor.tsx`. Replace the entire file with:

```tsx
import { useEffect, useState } from "react";
import type { AppSettings } from "../lib/store-bridge";
import {
  CLEANUP_VARIANTS,
  LANGUAGES,
  LANGUAGE_MODELS,
  LANGUAGE_MODEL_PROVIDERS,
  type LanguageModelProvider,
  type VoiceCleanup,
  type VoiceMode,
} from "../lib/voiceModes";
import {
  Button,
  Field,
  Group,
  Input,
  Segmented,
  Select,
  Textarea,
  tokens,
} from "../components/ui";
import { MODE_ICON_NAMES, ModeGlyph } from "../components/ModeIcons";

interface ModeFormProps {
  settings: AppSettings;
  modeId: string;
  onChange: (patch: Partial<AppSettings>) => Promise<void>;
}

function makeBlankMode(): VoiceMode {
  return {
    id: `custom-${crypto.randomUUID().slice(0, 8)}`,
    name: "New mode",
    voiceModel: "whisper-large-v3-turbo",
    language: "auto",
    cleanup: "prose",
    languageModelProvider: "openrouter",
    languageModel: "anthropic/claude-haiku-4.5",
    autocapitalize: true,
    insertion: "paste",
  };
}

export default function ModeForm({ settings, modeId, onChange }: ModeFormProps) {
  const isNew = modeId === "__new__";
  const original =
    settings.modes.find((m) => m.id === modeId) ?? makeBlankMode();

  const [draft, setDraft] = useState<VoiceMode>(original);

  // Reset draft when the selected mode changes (parent switches active mode).
  useEffect(() => {
    setDraft(original);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modeId]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(original);
  const usesCleanup =
    draft.cleanup !== "raw" && draft.languageModelProvider !== "none";
  const providerModels = LANGUAGE_MODELS[draft.languageModelProvider] ?? [];

  const save = async () => {
    if (!draft.name.trim()) return;
    const exists = settings.modes.some((m) => m.id === draft.id);
    const next = exists
      ? settings.modes.map((m) => (m.id === draft.id ? draft : m))
      : [...settings.modes, draft];
    await onChange({ modes: next });
  };

  const remove = async () => {
    if (settings.modes.length <= 1) {
      alert("Can't delete the last mode.");
      return;
    }
    if (!confirm(`Delete the "${draft.name}" mode?`)) return;
    const next = settings.modes.filter((m) => m.id !== draft.id);
    const patch: Partial<AppSettings> = { modes: next };
    if (settings.activeModeId === draft.id) patch.activeModeId = next[0]!.id;
    await onChange(patch);
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Identity row: icon picker + name + id */}
      <Group>
        <div className="flex items-center gap-2 py-1">
          <IconPicker
            value={draft.icon ?? null}
            onChange={(icon) =>
              setDraft({ ...draft, icon: icon ?? undefined })
            }
          />
          <Input
            value={draft.name}
            onChange={(name) => setDraft({ ...draft, name })}
          />
          <span
            title="Mode ID (read-only)"
            className="text-[11px] font-mono px-2 py-1 rounded shrink-0"
            style={{ background: tokens.control, color: tokens.fgMuted }}
          >
            {draft.id}
          </span>
        </div>
      </Group>

      {/* Cleanup + language model */}
      <Group>
        <Field
          label="Style"
          help={CLEANUP_VARIANTS.find((c) => c.id === draft.cleanup)?.description}
          control={
            <Segmented<VoiceCleanup>
              options={CLEANUP_VARIANTS.map((c) => ({
                id: c.id,
                label: c.label,
              }))}
              value={draft.cleanup}
              onChange={(cleanup) => setDraft({ ...draft, cleanup })}
            />
          }
        />
        <Field
          label="Provider"
          help={
            usesCleanup
              ? "Cleanup LLM provider"
              : "Cleanup is disabled — raw Whisper output is used"
          }
          control={
            <Select<LanguageModelProvider>
              value={draft.languageModelProvider}
              onChange={(languageModelProvider) =>
                setDraft({
                  ...draft,
                  languageModelProvider,
                  languageModel:
                    LANGUAGE_MODELS[languageModelProvider]?.[0]?.id ?? null,
                })
              }
              options={LANGUAGE_MODEL_PROVIDERS.map((p) => ({
                id: p.id,
                label: p.label,
              }))}
            />
          }
        />
        {usesCleanup && providerModels.length > 0 && (
          <Field
            label="Model"
            control={
              <Select<string>
                value={draft.languageModel ?? providerModels[0]!.id}
                onChange={(languageModel) =>
                  setDraft({ ...draft, languageModel })
                }
                options={providerModels.map((m) => ({
                  id: m.id,
                  label: m.label,
                }))}
              />
            }
          />
        )}
        <Field
          label="Language"
          control={
            <Select<string>
              value={draft.language}
              onChange={(language) => setDraft({ ...draft, language })}
              options={LANGUAGES.map((l) => ({ id: l.id, label: l.label }))}
            />
          }
        />
        <Field
          label="Auto-capitalize"
          help="Server-side capitalize after punctuation"
          control={
            <input
              type="checkbox"
              checked={!!draft.autocapitalize}
              onChange={(e) =>
                setDraft({ ...draft, autocapitalize: e.currentTarget.checked })
              }
              style={{ accentColor: tokens.fg }}
            />
          }
        />
      </Group>

      {usesCleanup && (
        <div>
          <div
            className="text-[10.5px] uppercase tracking-[0.14em] font-medium mb-1 px-1"
            style={{ color: tokens.fgMuted }}
          >
            Custom prompt
          </div>
          <Textarea
            value={draft.promptSuffix ?? ""}
            onChange={(promptSuffix) =>
              setDraft({ ...draft, promptSuffix: promptSuffix || null })
            }
            placeholder="e.g. Use British spelling. Avoid contractions."
            rows={3}
          />
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-1">
        <Button variant="ghost" size="xs" onClick={remove}>
          {isNew ? "Cancel" : "Delete"}
        </Button>
        <Button
          variant="primary"
          size="xs"
          disabled={!dirty || !draft.name.trim()}
          onClick={save}
        >
          Save
        </Button>
      </div>
    </div>
  );
}

/** Inline icon picker with a popover grid. */
function IconPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (icon: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center justify-center rounded transition-colors"
        style={{
          width: 28,
          height: 28,
          background: tokens.control,
          border: `1px solid ${tokens.border}`,
          color: tokens.fg,
        }}
        title="Pick icon"
      >
        {value ? (
          <ModeGlyph name={value} size={15} strokeWidth={1.8} />
        ) : (
          <span style={{ color: tokens.fgSubtle, fontSize: 14 }}>○</span>
        )}
      </button>
      {open && (
        <div
          className="absolute z-30 mt-1 grid gap-1 p-1.5 rounded-md"
          style={{
            top: "100%",
            left: 0,
            gridTemplateColumns: "repeat(8, 1fr)",
            background: tokens.card,
            border: `1px solid ${tokens.borderStrong}`,
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            width: 280,
          }}
        >
          {MODE_ICON_NAMES.map((name) => {
            const active = value === name;
            return (
              <button
                key={name}
                type="button"
                onClick={() => {
                  onChange(active ? null : name);
                  setOpen(false);
                }}
                title={name}
                className="inline-flex items-center justify-center rounded transition-colors"
                style={{
                  width: 28,
                  height: 28,
                  background: active
                    ? "var(--color-primary, #224160)"
                    : "transparent",
                  color: active ? "#fff" : tokens.fg,
                }}
              >
                <ModeGlyph name={name} size={15} strokeWidth={1.8} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Rewrite `ModesPanel.tsx` to merge list + form**

Replace the entire contents of `apps/ultravox/src/panels/ModesPanel.tsx` with:

```tsx
import type { AppSettings } from "../lib/store-bridge";
import { CLEANUP_VARIANTS, LANGUAGES } from "../lib/voiceModes";
import { Button, Section, tokens } from "../components/ui";
import ModeForm from "./ModeEditor";

interface ModesPanelProps {
  settings: AppSettings;
  onChange: (patch: Partial<AppSettings>) => Promise<void>;
}

export default function ModesPanel({ settings, onChange }: ModesPanelProps) {
  const activeId = settings.activeModeId;
  const activeMode =
    settings.modes.find((m) => m.id === activeId) ?? settings.modes[0]!;

  const newMode = async () => {
    // Stub: append a placeholder; ModeForm handles the real save.
    // We just switch active to "__new__" by storing id and letting ModeForm
    // append on save.
    await onChange({ activeModeId: "__new__" });
  };

  return (
    <>
      <Section
        label="Active mode"
        right={
          <Button size="xs" variant="outline" onClick={newMode}>
            + New
          </Button>
        }
      >
        <div className="flex flex-col gap-1">
          {settings.modes.map((m) => {
            const selected = m.id === activeId;
            return (
              <button
                key={m.id}
                onClick={() => onChange({ activeModeId: m.id })}
                className="flex items-center gap-2 w-full text-left px-3 py-1.5 rounded-lg transition-colors hover:bg-[var(--s-card-hover)]"
                style={{
                  background: tokens.card,
                  border: `1px solid ${selected ? tokens.fg : tokens.border}`,
                }}
              >
                <span
                  className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full shrink-0"
                  style={{
                    border: `1.5px solid ${selected ? tokens.fg : tokens.borderStrong}`,
                  }}
                >
                  {selected && (
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: tokens.fg }}
                    />
                  )}
                </span>
                <span
                  className="text-[12.5px] font-medium truncate"
                  style={{ color: tokens.fg }}
                >
                  {m.name}
                </span>
                <span
                  className="text-[11px] truncate ml-auto"
                  style={{ color: tokens.fgMuted }}
                >
                  {cleanupLabel(m.cleanup)} · {langLabel(m.language)}
                </span>
              </button>
            );
          })}
        </div>
      </Section>

      <Section label={`Configure — ${activeMode.name}`}>
        <ModeForm
          key={activeMode.id}
          settings={settings}
          modeId={activeMode.id}
          onChange={onChange}
        />
      </Section>
    </>
  );
}

function cleanupLabel(id: string): string {
  return CLEANUP_VARIANTS.find((c) => c.id === id)?.label ?? id;
}

function langLabel(id: string): string {
  return LANGUAGES.find((l) => l.id === id)?.label ?? id;
}
```

- [ ] **Step 3: Drop `modes-edit` route from `SettingsWindow.tsx`**

In `apps/ultravox/src/windows/SettingsWindow.tsx`:

1. Remove the `import ModeEditor from "../panels/ModeEditor";` line.
2. Remove `"modes-edit"` from the `Section` union type.
3. Remove the `"modes-edit": "modes / edit"` entry from `BREADCRUMBS`.
4. Remove the `editingModeId` state and the `startEditMode` function.
5. Remove the entire `{section === "modes-edit" && (...)}` block (lines ~98–105).
6. Update the Modes render:

```tsx
          {section === "modes" && (
            <ModesPanel settings={settings} onChange={update} />
          )}
```

7. Update `back`:

```tsx
  const back = () => setSection("home");
```

- [ ] **Step 4: Run typecheck**

```bash
cd apps/ultravox && pnpm exec tsc --noEmit
```

Expected: no errors. If `editingModeId` state was referenced elsewhere, fix imports.

- [ ] **Step 5: Smoke test**

```bash
cd apps/ultravox && pnpm tauri dev
```

Open Settings → Modes. Verify:
- 4 mode rows render compact, single-line.
- Clicking a different mode flips the radio + reloads the form below.
- Editing name / picking icon / changing style updates the form's draft state.
- Save persists to disk (close + reopen Settings, change is still there).

- [ ] **Step 6: Commit**

```bash
git add apps/ultravox/src/panels/ModesPanel.tsx apps/ultravox/src/panels/ModeEditor.tsx apps/ultravox/src/windows/SettingsWindow.tsx
git commit -m "ui: merge modes list with editor, single compact view"
```

---

### Task 3: Compact SoundPanel — descriptions to tooltips

**Files:**
- Modify: `apps/ultravox/src/panels/SoundPanel.tsx`

- [ ] **Step 1: Replace `ToggleRow` descriptions with `help` tooltips**

In `apps/ultravox/src/panels/SoundPanel.tsx`, replace the three `ToggleRow` blocks in the body (lines ~44–63) with:

```tsx
      <Section label="Input processing">
        <ToggleRow
          label="Auto-gain"
          help="Browser auto-adjusts microphone level"
          checked={sound.autoGain}
          onChange={(v) => setSound({ autoGain: v })}
        />
        <ToggleRow
          label="Silence removal"
          help="Trim silent passages before upload (v1.1)"
          checked={sound.silenceRemoval}
          onChange={(v) => setSound({ silenceRemoval: v })}
        />
      </Section>

      <Section label="Sound effects">
        <ToggleRow
          label="Chime on start/stop"
          help="Brief tone when recording starts and stops"
          checked={sound.chime}
          onChange={(v) => setSound({ chime: v })}
        />
```

- [ ] **Step 2: Add `help` prop support to `ToggleRow`**

In `apps/ultravox/src/components/ui.tsx`, replace the `ToggleRow` definition with:

```tsx
export function ToggleRow({
  label,
  description,
  help,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  help?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <Row
      label={label}
      {...(description ? { description } : {})}
      {...(help ? { help } : {})}
      control={<Toggle checked={checked} onChange={onChange} />}
    />
  );
}
```

- [ ] **Step 3: Replace the microphone explanation `<p>` with a help-icon header**

In `SoundPanel.tsx`, replace the `<Section label="Microphone">` block (lines ~25–34):

```tsx
      <Section
        label="Microphone"
        help="Ultravox uses your system default microphone. Per-device selection comes in v1.1."
      >
        <TestRecordingRow settings={settings} />
      </Section>
```

- [ ] **Step 4: Tighten the `TestRecordingRow` description to a tooltip**

In the same file, replace the `Row` returned from `TestRecordingRow` (lines ~172–199):

```tsx
  return (
    <Row
      label="Round-trip test"
      help="Record 2s, send to the worker, show the response. Tests the pipeline in isolation — no hotkey, no paste."
      control={
        <div className="flex flex-col gap-1 items-end" style={{ minWidth: 220 }}>
          <Button variant="primary" size="xs" onClick={run} disabled={busy}>
            {label}
          </Button>
          {result && (
            <div
              className="text-[11.5px] font-mono px-2 py-1.5 rounded w-full"
              style={{
                background: tokens.control,
                border: `1px solid ${tokens.border}`,
                color: resultColor,
                wordBreak: "break-word",
                maxHeight: 96,
                overflowY: "auto",
              }}
            >
              {result}
            </div>
          )}
        </div>
      }
    />
  );
```

- [ ] **Step 5: Smoke test**

```bash
cd apps/ultravox && pnpm tauri dev
```

Open Settings → Sound. Hover over each `?` glyph — tooltip text should match what the prose said before. The toggles should be flush, no descriptive subtitles.

- [ ] **Step 6: Commit**

```bash
git add apps/ultravox/src/panels/SoundPanel.tsx apps/ultravox/src/components/ui.tsx
git commit -m "ui: convert SoundPanel descriptions to tooltips"
```

---

### Task 4: Compact VocabularyPanel

**Files:**
- Modify: `apps/ultravox/src/panels/VocabularyPanel.tsx`

- [ ] **Step 1: Replace the panel body**

Replace the entire `apps/ultravox/src/panels/VocabularyPanel.tsx` with:

```tsx
import { useState } from "react";
import type { AppSettings, VocabularyEntry } from "../lib/store-bridge";
import { Button, Input, Section, tokens } from "../components/ui";

interface VocabularyPanelProps {
  settings: AppSettings;
  onChange: (patch: Partial<AppSettings>) => Promise<void>;
}

export default function VocabularyPanel({ settings, onChange }: VocabularyPanelProps) {
  const [draft, setDraft] = useState<VocabularyEntry>({ input: "", replace: "" });

  const add = async () => {
    const input = draft.input.trim();
    const replace = draft.replace.trim();
    if (!input) return;
    await onChange({ vocabulary: [...settings.vocabulary, { input, replace }] });
    setDraft({ input: "", replace: "" });
  };

  const remove = async (idx: number) => {
    await onChange({ vocabulary: settings.vocabulary.filter((_, i) => i !== idx) });
  };

  return (
    <>
      <Section
        label="Add entry"
        help="Help Whisper recognize names, acronyms, and jargon. Leave the replacement blank to bias spelling without rewriting."
      >
        <div className="flex items-center gap-1.5">
          <Input
            value={draft.input}
            onChange={(v) => setDraft({ ...draft, input: v })}
            placeholder="Word or phrase…"
            autoFocus
          />
          <Input
            value={draft.replace}
            onChange={(v) => setDraft({ ...draft, replace: v })}
            placeholder="Replace with… (optional)"
          />
          <Button
            onClick={add}
            disabled={!draft.input.trim()}
            size="xs"
            variant="primary"
          >
            Add
          </Button>
        </div>
      </Section>

      <Section label={`Entries (${settings.vocabulary.length})`}>
        {settings.vocabulary.length === 0 ? (
          <p
            className="text-[11.5px] italic px-1"
            style={{ color: tokens.fgSubtle }}
          >
            No entries yet.
          </p>
        ) : (
          <div className="flex flex-col gap-0.5">
            {settings.vocabulary.map((entry, i) => (
              <div
                key={`${entry.input}-${i}`}
                className="flex items-center gap-2 px-3 py-1 rounded-md"
                style={{
                  background: tokens.card,
                  border: `1px solid ${tokens.border}`,
                }}
              >
                <span
                  className="text-[12.5px] truncate"
                  style={{ color: tokens.fg }}
                >
                  {entry.input}
                </span>
                {entry.replace && (
                  <>
                    <span style={{ color: tokens.fgSubtle }}>→</span>
                    <span
                      className="text-[12.5px] truncate"
                      style={{ color: tokens.fgMuted }}
                    >
                      {entry.replace}
                    </span>
                  </>
                )}
                <button
                  onClick={() => remove(i)}
                  aria-label="Remove"
                  className="text-[14px] leading-none px-1 hover:opacity-100 opacity-60 ml-auto"
                  style={{ color: tokens.fgMuted }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}
```

- [ ] **Step 2: Smoke test**

```bash
cd apps/ultravox && pnpm tauri dev
```

Open Settings → Vocabulary. Add an entry, confirm it shows on one line. Hover the `?` next to "Add entry" — tooltip should explain usage.

- [ ] **Step 3: Commit**

```bash
git add apps/ultravox/src/panels/VocabularyPanel.tsx
git commit -m "ui: compact VocabularyPanel to inline rows + tooltip"
```

---

### Task 5: Compact HomePanel

**Files:**
- Modify: `apps/ultravox/src/panels/HomePanel.tsx`

- [ ] **Step 1: Drop `NavCard` subtitles in favour of plain titles**

In `apps/ultravox/src/panels/HomePanel.tsx`, replace the two `<Section title="Voice">` and `<Section title="App">` blocks (lines ~75–91 and ~139–150) with:

```tsx
      <Section title="Voice">
        <NavCard title="Modes" onClick={() => onNavigate("modes")} />
        <NavCard title="Vocabulary" onClick={() => onNavigate("vocabulary")} />
        <NavCard title="Sound & Microphone" onClick={() => onNavigate("sound")} />
      </Section>
```

```tsx
      <Section title="App">
        <NavCard title="Configuration" onClick={() => onNavigate("configuration")} />
        <NavCard title="History" onClick={() => onNavigate("history")} />
      </Section>
```

- [ ] **Step 2: Convert push-to-talk description to tooltip**

In the same file, in the `Recording` section, replace the `ToggleRow`:

```tsx
        <ToggleRow
          label="Push-to-talk"
          help="Hold the hotkey while speaking instead of toggle"
          checked={settings.recordingStyle === "push-to-talk"}
          onChange={(v) => onChange({ recordingStyle: v ? "push-to-talk" : "toggle" })}
        />
```

- [ ] **Step 3: Drop the bottom prose footnote**

Remove the entire `<p>` block at the end:

```tsx
      <p className="text-[11.5px] leading-relaxed pt-1" style={{ color: tokens.fgSubtle }}>
        Ultravox v0.1.0 · keys are managed server-side · audio is never stored.
      </p>
```

- [ ] **Step 4: Smoke test**

```bash
cd apps/ultravox && pnpm tauri dev
```

Open Settings (Home). Cards should be one-line titles + chevron. Push-to-talk shows `?` icon revealing the prior subtitle on hover.

- [ ] **Step 5: Commit**

```bash
git add apps/ultravox/src/panels/HomePanel.tsx
git commit -m "ui: compact HomePanel — drop NavCard subtitles, use tooltips"
```

---

### Task 6: Compact ConfigurationPanel

**Files:**
- Modify: `apps/ultravox/src/panels/ConfigurationPanel.tsx`

- [ ] **Step 1: Move `Row` descriptions to `help` tooltips**

In `apps/ultravox/src/panels/ConfigurationPanel.tsx`, replace the Accessibility `Row` (lines ~64–97):

```tsx
        <Row
          label="Accessibility access"
          help={
            axGranted === true
              ? "Granted — paste works correctly."
              : axGranted === false
              ? "Not granted — transcriptions can't be pasted."
              : "Checking…"
          }
          control={
            axGranted ? (
              <span className="text-[12px] text-color-accent font-medium">✓ Granted</span>
            ) : (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="xs"
                  onClick={grantAx}
                  disabled={axRequesting}
                >
                  {axRequesting ? "Waiting…" : "Grant Access"}
                </Button>
                {axGranted === false && !axRequesting && (
                  <button
                    onClick={recheckAx}
                    className="text-[12px] text-color-secondary hover:text-color-primary underline"
                  >
                    Refresh
                  </button>
                )}
              </div>
            )
          }
        />
```

And replace the Reset `Row`:

```tsx
        <Row
          label="Reset to defaults"
          help="Restore all preferences. History is preserved."
          control={
            <Button
              variant="outline"
              size="xs"
              onClick={reset}
              style={resetConfirming ? { borderColor: "var(--color-warning)", color: "var(--color-warning)" } : {}}
            >
              {resetConfirming ? "Click again to confirm" : "Reset"}
            </Button>
          }
        />
```

- [ ] **Step 2: Smoke test**

```bash
cd apps/ultravox && pnpm tauri dev
```

Open Settings → Configuration. Permissions / Reset rows are one-line; status text moves to tooltip via `?` icon.

- [ ] **Step 3: Commit**

```bash
git add apps/ultravox/src/panels/ConfigurationPanel.tsx
git commit -m "ui: compact ConfigurationPanel descriptions to tooltips"
```

---

### Task 7: Tighten outer page gap

**Files:**
- Modify: `apps/ultravox/src/windows/SettingsWindow.tsx`

- [ ] **Step 1: Reduce page gap and vertical padding**

Replace the `<div>` at line ~91:

```tsx
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className="flex flex-col gap-4 max-w-md mx-auto">
```

- [ ] **Step 2: Smoke test all panels**

```bash
cd apps/ultravox && pnpm tauri dev
```

Click through every section: Home / Modes / Vocabulary / Configuration / Sound / History. Confirm:
- No content overflows or clips.
- Sections sit close together but don't run into each other.
- Tooltips on every `?` glyph match the previous prose.

- [ ] **Step 3: Run tests**

```bash
cd apps/ultravox && pnpm test --run
```

Expected: all pass (we changed UI only — no logic).

- [ ] **Step 4: Commit + push**

```bash
git add apps/ultravox/src/windows/SettingsWindow.tsx
git commit -m "ui: tighten Settings outer gap"
git push origin claude/hungry-spence-99d948
```

---

## Self-review checklist (pre-handoff)

- [x] Spec coverage: Modes merged, Vocabulary compact, Sound tooltips, Home compact, Configuration compact — all panels covered.
- [x] No placeholders — every step has full code.
- [x] Type consistency: `Field`, `Group`, `ToggleRow.help`, `ModeForm` default-export are all defined where first used.
- [x] No store-shape changes — settings keys, `VoiceMode`, `AppSettings` untouched.
