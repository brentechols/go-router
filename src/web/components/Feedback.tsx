import type { ReactNode } from "react";

export function PageLoading({ label = "Loading routes" }: { label?: string }) {
  return (
    <div className="state-card" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <div>
        <strong>{label}…</strong>
        <p>Just a moment.</p>
      </div>
    </div>
  );
}

export function PageError({
  title = "Something went wrong",
  error,
  action,
}: {
  title?: string;
  error: unknown;
  action?: ReactNode;
}) {
  const message = error instanceof Error ? error.message : "The request could not be completed.";
  return (
    <div className="state-card state-card--error" role="alert">
      <span className="state-card__icon" aria-hidden="true">
        !
      </span>
      <div>
        <strong>{title}</strong>
        <p>{message}</p>
        {action}
      </div>
    </div>
  );
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <span className="field-error" role="alert">
      {message}
    </span>
  );
}
