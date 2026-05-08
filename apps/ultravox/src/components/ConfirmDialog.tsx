// WHY: Reusable accessible confirm dialog built on Radix Dialog (focus trap,
// Esc-to-cancel, role="alertdialog"). Used for the unsaved-changes guard in
// ModeEditor and for future destructive-action confirmations throughout the
// Settings UI.
import * as Dialog from "@radix-ui/react-dialog";
import { Button, tokens } from "./ui";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  body?: string;
  primary: {
    label: string;
    onClick: () => void | Promise<void>;
    variant?: "primary" | "danger";
  };
  secondary?: {
    label: string;
    onClick: () => void | Promise<void>;
  };
  cancelLabel?: string;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  primary,
  secondary,
  cancelLabel = "Cancel",
}: ConfirmDialogProps) {
  const handleCancel = () => onOpenChange(false);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          style={{
            position: "fixed",
            inset: 0,
            background: "var(--color-dialog-backdrop)",
            zIndex: 50,
          }}
        />
        <Dialog.Content
          role="alertdialog"
          aria-labelledby="confirm-dialog-title"
          aria-describedby={body ? "confirm-dialog-body" : undefined}
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            background: tokens.card,
            border: `1px solid ${tokens.borderStrong}`,
            boxShadow: "0 12px 32px rgba(0,0,0,0.16)",
            borderRadius: 10,
            padding: 20,
            maxWidth: 380,
            width: "calc(100vw - 32px)",
            zIndex: 51,
            outline: "none",
          }}
        >
          <Dialog.Title
            id="confirm-dialog-title"
            style={{
              margin: 0,
              fontSize: 15,
              fontWeight: 600,
              color: tokens.fg,
              lineHeight: 1.3,
            }}
          >
            {title}
          </Dialog.Title>

          {body && (
            <Dialog.Description
              id="confirm-dialog-body"
              style={{
                margin: "8px 0 0",
                fontSize: 13,
                color: tokens.fgMuted,
                lineHeight: 1.5,
              }}
            >
              {body}
            </Dialog.Description>
          )}

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
              marginTop: 20,
            }}
          >
            <Button variant="ghost" size="xs" onClick={handleCancel}>
              {cancelLabel}
            </Button>
            {secondary && (
              <Button
                variant="outline"
                size="xs"
                onClick={() => {
                  void secondary.onClick();
                }}
              >
                {secondary.label}
              </Button>
            )}
            <Button
              variant="primary"
              size="xs"
              onClick={() => {
                void primary.onClick();
              }}
              {...(primary.variant === "danger"
                ? { style: { background: tokens.warning, color: "#fff", border: "1px solid transparent" } }
                : {})}
            >
              {primary.label}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
