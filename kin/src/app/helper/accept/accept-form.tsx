"use client";

import { useState, useTransition } from "react";
import { acceptHelperLinkAction } from "@/lib/actions/helpers";

/** "Accept": claims the link, then the action moves on to /helper. */
export function AcceptHelperLink() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div>
      <button
        type="button"
        className="btn btn-primary btn-block"
        style={{ minHeight: "2.875rem" }}
        disabled={pending}
        onClick={() => startTransition(async () => setError((await acceptHelperLinkAction()).error))}
      >
        {pending ? "…" : "Accept"}
      </button>
      {error && <p role="alert" style={{ color: "var(--color-accent-700)", fontSize: "0.8125rem", margin: "6px 0 0" }}>{error}</p>}
    </div>
  );
}
