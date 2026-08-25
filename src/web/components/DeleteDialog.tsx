import { useEffect, useRef } from "react";

interface DeleteDialogProps {
  open: boolean;
  routeName: string;
  pending: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DeleteDialog({
  open,
  routeName,
  pending,
  error,
  onCancel,
  onConfirm,
}: DeleteDialogProps) {
  const cancelButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) cancelButton.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onCancel}>
      <section
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-title"
        aria-describedby="delete-description"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !pending) onCancel();
        }}
      >
        <span className="dialog__icon" aria-hidden="true">
          ×
        </span>
        <h2 id="delete-title">Delete go/{routeName}?</h2>
        <p id="delete-description">
          This permanently removes the route and all of its aliases. Existing bookmarks will stop
          working.
        </p>
        {error ? (
          <p className="field-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="dialog__actions">
          <button
            ref={cancelButton}
            className="button button--ghost"
            onClick={onCancel}
            disabled={pending}
          >
            Keep route
          </button>
          <button className="button button--danger" onClick={onConfirm} disabled={pending}>
            {pending ? "Deleting…" : "Delete permanently"}
          </button>
        </div>
      </section>
    </div>
  );
}
