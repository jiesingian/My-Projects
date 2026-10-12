"use client";

import { useState, useTransition } from "react";
import { openLetterAction } from "@/lib/actions/time-capsules";

/** Open an "open when" letter -- once, so it asks first. */
export function OpenWhenButton({ id, moment }: { id: string; moment: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <>
      <button
        type="button"
        className="btn btn-secondary"
        style={{ minHeight: "2.25rem" }}
        disabled={pending}
        onClick={() => {
          if (!confirm(`This letter is for when ${moment}. Open it now? It stays open after.`)) return;
          startTransition(async () => setError((await openLetterAction(id)).error));
        }}
      >
        {pending ? "Opening…" : "Open it"}
      </button>
      {error && <p role="alert" style={{ flexBasis: "100%", color: "var(--color-accent-700)", fontSize: "0.8125rem", margin: 0 }}>{error}</p>}
    </>
  );
}
