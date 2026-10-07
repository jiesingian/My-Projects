"use client";

import { useState, useTransition } from "react";
import { removeLetterAction } from "@/lib/actions/time-capsules";

export function LetterRemove({ id }: { id: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <>
      <button
        type="button"
        className="btn btn-ghost"
        disabled={pending}
        onClick={() => {
          if (!confirm("Take this letter back? It will be gone for good.")) return;
          startTransition(async () => setError((await removeLetterAction(id)).error));
        }}
      >
        {pending ? "…" : "Take it back"}
      </button>
      {error && <p role="alert" style={{ color: "var(--color-accent-700)", fontSize: "0.8125rem", margin: 0 }}>{error}</p>}
    </>
  );
}
