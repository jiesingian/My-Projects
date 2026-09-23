"use client";

import { useId, useState } from "react";
import { deleteHouseholdAction } from "@/lib/actions/family";

export function DeleteHouseholdButton({ householdName }: { householdName: string }) {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const uid = useId();

  if (!open) {
    return (
      <button
        type="button"
        className="btn btn-secondary btn-block"
        style={{ minHeight: "2.875rem", fontSize: "0.84375rem", letterSpacing: ".04em", color: "var(--color-accent-700)", borderColor: "var(--color-accent-700)" }}
        onClick={() => setOpen(true)}
      >
        DELETE HOUSEHOLD
      </button>
    );
  }

  const canDelete = confirmText.trim() === householdName;

  return (
    <div style={{ border: "1px solid var(--color-accent-700)", padding: "0.875rem" }}>
      <p style={{ fontSize: "0.875rem", lineHeight: 1.5, margin: "0 0 10px" }}>
        This permanently deletes <strong>{householdName}</strong> — every member, journal entry, health record,
        document index, and everything else in the app. This can&apos;t be undone. Files in Google Drive itself
        are not touched.
      </p>
      <label htmlFor={`${uid}-confirm`} style={{ fontSize: "0.8125rem", color: "var(--color-neutral-700)", display: "block", marginBottom: "0.25rem" }}>
        Type <strong>{householdName}</strong> to confirm
      </label>
      <input
        id={`${uid}-confirm`}
        className="input"
        value={confirmText}
        onChange={(e) => setConfirmText(e.target.value)}
            aria-label="Type the household name to confirm deletion"
        style={{ minHeight: "2.5rem", marginBottom: "0.625rem" }}
        disabled={busy}
      />
      {error && <p style={{ color: "var(--color-accent-700)", fontSize: "0.8125rem", margin: "0 0 10px" }}>{error}</p>}
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button
          type="button"
          className="btn btn-secondary"
          style={{ flex: 1, minHeight: "2.625rem", fontSize: "0.875rem" }}
          disabled={busy}
          onClick={() => {
            setOpen(false);
            setConfirmText("");
            setError(null);
          }}
        >
          CANCEL
        </button>
        <button
          type="button"
          className="btn btn-primary"
          style={{ flex: 1, minHeight: "2.625rem", fontSize: "0.875rem", background: "var(--color-accent-700)", borderColor: "var(--color-accent-700)" }}
          disabled={!canDelete || busy}
          onClick={async () => {
            setBusy(true);
            const result = await deleteHouseholdAction();
            setBusy(false);
            if (result?.error) setError(result.error);
          }}
        >
          {busy ? "DELETING…" : "PERMANENTLY DELETE"}
        </button>
      </div>
    </div>
  );
}
