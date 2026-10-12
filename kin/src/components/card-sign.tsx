"use client";

import { useState, useTransition } from "react";
import { sealLetterAction } from "@/lib/actions/time-capsules";

/** Sign a card someone started: just a note. The person, the day and the
 * occasion are the card's own. */
export function CardSign({ recipientId, recipientFirst, opensOn, occasion }: { recipientId: string; recipientFirst: string; opensOn: string; occasion: string }) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button type="button" className="btn btn-secondary" style={{ minHeight: "2.25rem" }} onClick={() => setOpen(true)}>
        Sign it
      </button>
    );
  }
  return (
    <div className="kin-card-sign">
      <textarea
        className="input"
        aria-label={`Your note for ${recipientFirst}`}
        placeholder={`Your note for ${recipientFirst}…`}
        rows={4}
        maxLength={20000}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        disabled={pending}
        autoFocus
      />
      <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
        <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending || !body.trim()}
          onClick={() =>
            startTransition(async () => {
              const r = await sealLetterAction({ recipientId, opensOn, occasion, title: "", body });
              setError(r.error);
              if (!r.error) setOpen(false);
            })
          }
        >
          {pending ? "Signing…" : "Add my note"}
        </button>
      </div>
      {error && <p role="alert" style={{ color: "var(--color-accent-700)", fontSize: "0.8125rem", margin: 0 }}>{error}</p>}
    </div>
  );
}
