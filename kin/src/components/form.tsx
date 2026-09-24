"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";

export function SubmitButton({
  children,
  className = "btn btn-primary btn-block",
  style,
  pending: pendingOverride,
}: {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  /** For a form submitted from onSubmit rather than its action attribute,
   * which useFormStatus cannot see: the action's own pending flag. */
  pending?: boolean;
}) {
  const status = useFormStatus();
  const pending = pendingOverride ?? status.pending;
  return (
    <button type="submit" className={className} style={style} disabled={pending}>
      {pending ? "…" : children}
    </button>
  );
}

export function ErrorText({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      style={{ color: "var(--color-accent-700)", fontSize: "0.8125rem", margin: "0 0 14px" }}
    >
      {message}
    </p>
  );
}
