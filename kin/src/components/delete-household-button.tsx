"use client";

import { useState } from "react";
import { deleteHouseholdAction } from "@/lib/actions/family";

export function DeleteHouseholdButton({ householdName }: { householdName: string }) {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        className="btn btn-secondary btn-block"
        style={{ minHeight: 46, fontSize: 13.5, letterSpacing: ".04em", color: "var(--color-accent-700)", borderColor: "var(--color-accent-700)" }}
        onClick={() => setOpen(true)}
      >
        DELETE HOUSEHOLD
      </button>
    );
  }

  const canDelete = confirmText.trim() === householdName;

  return (
    <div style={{ border: "1px solid var(--color-accent-700)", padding: 14 }}>
      <p style={{ fontSize: 12.5, lineHeight: 1.5, margin: "0 0 10px" }}>
        This permanently deletes <strong>{householdName}</strong> — every member, journal entry, health record,
        document index, and everything else in the app. This can&apos;t be undone. Files in Google Drive itself
        are not touched.
      </p>
      <label style={{ fontSize: 11, color: "var(--color-neutral-700)", display: "block", marginBottom: 4 }}>
        Type <strong>{householdName}</strong> to confirm
      </label>
      <input
        className="input"
        value={confirmText}
        onChange={(e) => setConfirmText(e.target.value)}
        style={{ minHeight: 40, marginBottom: 10 }}
        disabled={busy}
      />
      {error && <p style={{ color: "var(--color-accent-700)", fontSize: 11.5, margin: "0 0 10px" }}>{error}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          className="btn btn-secondary"
          style={{ flex: 1, minHeight: 42, fontSize: 12.5 }}
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
          style={{ flex: 1, minHeight: 42, fontSize: 12.5, background: "var(--color-accent-700)", borderColor: "var(--color-accent-700)" }}
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
