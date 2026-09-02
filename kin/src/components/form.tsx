"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";

export function SubmitButton({
  children,
  className = "btn btn-primary btn-block",
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const { pending } = useFormStatus();
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
      style={{ color: "var(--color-accent-700)", fontSize: 13, margin: "0 0 14px" }}
    >
      {message}
    </p>
  );
}
