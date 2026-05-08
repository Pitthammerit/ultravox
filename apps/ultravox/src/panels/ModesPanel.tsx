import { useRef, useState } from "react";
import type { AppSettings } from "../lib/store-bridge";
import { CLEANUP_VARIANTS, LANGUAGES, type VoiceMode } from "../lib/voiceModes";
import { Button, Section, tokens } from "../components/ui";
import { ConfirmDialog } from "../components/ConfirmDialog";
import ModeForm from "./ModeEditor";

// 1×1 fully transparent PNG. Used as the drag image so macOS / WKWebView
// don't render the default "+" copy-affordance badge over the cursor.
const TRANSPARENT_DRAG_IMG: HTMLImageElement | null = (() => {
  if (typeof Image === "undefined") return null;
  const img = new Image(1, 1);
  img.src =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
  return img;
})();

interface ModesPanelProps {
  settings: AppSettings;
  onChange: (patch: Partial<AppSettings>) => Promise<void>;
}

type DropEdge = "before" | "after";

export default function ModesPanel({ settings, onChange }: ModesPanelProps) {
  const activeId = settings.activeModeId;
  const activeMode =
    settings.modes.find((m) => m.id === activeId) ?? settings.modes[0]!;

  // Transient draft seed for the duplicate flow. Lives only in the panel —
  // never persisted until the user explicitly clicks Save in the editor.
  const [pendingDuplicate, setPendingDuplicate] = useState<VoiceMode | null>(null);

  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; edge: DropEdge } | null>(null);

  // Unsaved-changes guard: ModeEditor reports dirty state up; ModesPanel gates
  // navigation behind the confirm dialog.
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const pendingNavRef = useRef<(() => void) | null>(null);
  const editorSaveRef = useRef<(() => Promise<void>) | null>(null);

  const guardedNav = (action: () => void) => {
    if (!hasUnsavedChanges) {
      action();
      return;
    }
    pendingNavRef.current = action;
    setConfirmOpen(true);
  };

  const handleConfirmSave = async () => {
    await editorSaveRef.current?.();
    setConfirmOpen(false);
    setHasUnsavedChanges(false);
    pendingNavRef.current?.();
    pendingNavRef.current = null;
  };

  const handleConfirmDiscard = () => {
    setConfirmOpen(false);
    setHasUnsavedChanges(false);
    pendingNavRef.current?.();
    pendingNavRef.current = null;
  };

  const handleConfirmCancel = () => {
    setConfirmOpen(false);
    pendingNavRef.current = null;
  };

  const reorder = async (fromId: string, toId: string, edge: DropEdge) => {
    if (fromId === toId) return;
    const fromIdx = settings.modes.findIndex((m) => m.id === fromId);
    const toIdx = settings.modes.findIndex((m) => m.id === toId);
    if (fromIdx < 0 || toIdx < 0) return;
    const next = settings.modes.slice();
    const [moved] = next.splice(fromIdx, 1);
    if (!moved) return;
    let insertIdx = next.findIndex((m) => m.id === toId);
    if (edge === "after") insertIdx += 1;
    if (insertIdx === fromIdx) return;
    next.splice(insertIdx, 0, moved);
    if (next.map((m) => m.id).join("|") === settings.modes.map((m) => m.id).join("|")) return;
    await onChange({ modes: next });
  };

  const duplicate = (m: VoiceMode) => {
    guardedNav(() => {
      const seed: VoiceMode = {
        ...m,
        id: `custom-${crypto.randomUUID().slice(0, 8)}`,
        name: `${m.name} copy`,
      };
      setPendingDuplicate(seed);
      void onChange({ activeModeId: "__duplicate__" });
    });
  };

  const startNew = () => {
    guardedNav(() => {
      setPendingDuplicate(null);
      void onChange({ activeModeId: "__new__" });
    });
  };

  const handleEditorChange = async (patch: Partial<AppSettings>) => {
    // Once the draft commits (modes array grew or activeModeId moved off the
    // sentinel), drop the pending seed and clear unsaved state.
    if (patch.modes || (patch.activeModeId && patch.activeModeId !== "__duplicate__")) {
      setPendingDuplicate(null);
      setHasUnsavedChanges(false);
    }
    await onChange(patch);
  };

  return (
    <>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!open) handleConfirmCancel();
        }}
        title="Save or discard changes?"
        body="You have unsaved changes in this mode. Save them or discard before navigating away."
        primary={{
          label: "Save",
          onClick: handleConfirmSave,
        }}
        secondary={{
          label: "Discard",
          onClick: handleConfirmDiscard,
        }}
        cancelLabel="Cancel"
      />
      <Section
        label="Active mode"
        right={
          <Button size="xs" variant="outline" onClick={startNew}>
            + New
          </Button>
        }
      >
        <div className="flex flex-col gap-1">
          {settings.modes.map((m, idx) => {
            const selected = m.id === activeId;
            const isDragging = dragId === m.id;
            const dragIdx = dragId ? settings.modes.findIndex((x) => x.id === dragId) : -1;
            // Resolve the insertion index that the current dropTarget points at.
            // Hide the indicator when that index equals the dragged row's slot
            // or its slot+1 (both are no-op drops).
            const targetIdx =
              dropTarget && dragId && dropTarget.id !== dragId
                ? settings.modes.findIndex((x) => x.id === dropTarget.id) +
                  (dropTarget.edge === "after" ? 1 : 0)
                : -1;
            const isNoOpDrop =
              dragIdx >= 0 && (targetIdx === dragIdx || targetIdx === dragIdx + 1);
            const showLineBefore =
              !!dragId &&
              dropTarget?.id === m.id &&
              dropTarget.edge === "before" &&
              dragId !== m.id &&
              !isNoOpDrop;
            const isLast = idx === settings.modes.length - 1;
            const showLineAfter =
              isLast &&
              !!dragId &&
              dropTarget?.id === m.id &&
              dropTarget.edge === "after" &&
              dragId !== m.id &&
              !isNoOpDrop;
            return (
              <div key={m.id} className="contents">
                {showLineBefore && <InsertionLine />}
                <div
                draggable
                onDragStart={(e) => {
                  setDragId(m.id);
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", m.id);
                  // Suppress the macOS / WKWebView "+" copy-affordance badge
                  // by handing the OS a 1×1 transparent drag image. Without
                  // this the cursor shows a green plus throughout the drag.
                  if (TRANSPARENT_DRAG_IMG) {
                    e.dataTransfer.setDragImage(TRANSPARENT_DRAG_IMG, 0, 0);
                  }
                }}
                onDragEnter={(e) => {
                  // HTML5 DnD requires preventDefault on dragenter AND dragover
                  // for the element to be a valid drop target. WebKit (WKWebView)
                  // is strict about this — without it, onDrop never fires and the
                  // cursor shows the "no drop" affordance.
                  if (!dragId || dragId === m.id) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                }}
                onDragOver={(e) => {
                  if (!dragId || dragId === m.id) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  const rect = e.currentTarget.getBoundingClientRect();
                  const edge: DropEdge =
                    e.clientY < rect.top + rect.height / 2 ? "before" : "after";
                  if (
                    !dropTarget ||
                    dropTarget.id !== m.id ||
                    dropTarget.edge !== edge
                  ) {
                    setDropTarget({ id: m.id, edge });
                  }
                }}
                onDragLeave={(e) => {
                  // Only clear when leaving the row entirely (not children).
                  const related = e.relatedTarget as Node | null;
                  if (related && e.currentTarget.contains(related)) return;
                  if (dropTarget?.id === m.id) setDropTarget(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const fromId = dragId ?? e.dataTransfer.getData("text/plain");
                  const edge =
                    dropTarget?.id === m.id ? dropTarget.edge : "after";
                  setDragId(null);
                  setDropTarget(null);
                  if (fromId) void reorder(fromId, m.id, edge);
                }}
                onDragEnd={() => {
                  setDragId(null);
                  setDropTarget(null);
                }}
                className="flex items-center gap-2 w-full text-left px-3 py-1.5 rounded-lg transition-colors hover:bg-[var(--s-card-hover)]"
                style={{
                  background: tokens.card,
                  border: `1px solid ${selected ? tokens.fg : tokens.border}`,
                  opacity: isDragging ? 0.5 : 1,
                  cursor: isDragging ? "grabbing" : "default",
                }}
              >
                <span
                  title="Drag to reorder"
                  aria-hidden="true"
                  className="select-none shrink-0"
                  style={{
                    color: tokens.fgSubtle,
                    fontSize: 12,
                    lineHeight: 1,
                    cursor: "grab",
                    letterSpacing: "-1px",
                  }}
                >
                  ⋮⋮
                </span>
                <button
                  type="button"
                  onClick={() => guardedNav(() => { void onChange({ activeModeId: m.id }); })}
                  className="flex items-center gap-2 flex-1 min-w-0 text-left"
                  style={{ background: "transparent", border: "none", padding: 0 }}
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
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    duplicate(m);
                  }}
                  title="Duplicate this mode"
                  aria-label={`Duplicate ${m.name}`}
                  className="shrink-0 inline-flex items-center justify-center rounded transition-colors"
                  style={{
                    width: 22,
                    height: 22,
                    color: tokens.fgMuted,
                    background: "transparent",
                    border: `1px solid transparent`,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = tokens.control;
                    e.currentTarget.style.borderColor = tokens.border;
                    e.currentTarget.style.color = tokens.fg;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.borderColor = "transparent";
                    e.currentTarget.style.color = tokens.fgMuted;
                  }}
                >
                  <DuplicateIcon />
                </button>
                </div>
                {showLineAfter && <InsertionLine />}
              </div>
            );
          })}
        </div>
      </Section>

      <Section
        label={
          activeId === "__new__"
            ? "New mode"
            : activeId === "__duplicate__"
              ? `New mode — copy of ${pendingDuplicate?.name ?? ""}`
              : `Configure — ${activeMode.name}`
        }
      >
        <ModeForm
          key={activeId}
          settings={settings}
          modeId={activeId}
          seedDraft={activeId === "__duplicate__" ? pendingDuplicate : null}
          onChange={handleEditorChange}
          onDirtyChange={setHasUnsavedChanges}
          saveRef={editorSaveRef}
        />
      </Section>
    </>
  );
}

function InsertionLine() {
  return (
    <div
      aria-hidden="true"
      style={{
        height: 2,
        background: "var(--color-primary)",
        borderRadius: 1,
        margin: "-1px 0",
        pointerEvents: "none",
      }}
    />
  );
}

function DuplicateIcon() {
  // Two overlapping rectangles — universal "copy/duplicate" affordance.
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="5" y="5" width="9" height="9" rx="1.5" />
      <path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5" />
    </svg>
  );
}

function cleanupLabel(id: string): string {
  return CLEANUP_VARIANTS.find((c) => c.id === id)?.label ?? id;
}

function langLabel(id: string): string {
  return LANGUAGES.find((l) => l.id === id)?.label ?? id;
}
