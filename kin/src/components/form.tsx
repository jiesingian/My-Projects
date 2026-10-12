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
      className="kin-form-error"
    >
      {message}
    </p>
  );
}

/** The red asterisk after a required field's label, for a label that wraps
 * its input (where the CSS rule in globals.css cannot reach). */
export function RequiredMark() {
  return (
    <span className="kin-req" aria-hidden="true">
      {" "}*
    </span>
  );
}
