"use client";

import { useState } from "react";
import { deleteOwnAccountAction } from "@/lib/actions/profile";
import { confirm } from "@/components/confirm-sheet";

export function DeleteAccountButton({ isSoleMember }: { isSoleMember: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div>
      <button
        type="button"
        className="btn btn-secondary btn-block"
        style={{ minHeight: "2.875rem", fontSize: "0.84375rem", letterSpacing: ".04em", color: "var(--color-accent-700)", borderColor: "var(--color-accent-700)" }}
        disabled={busy}
        onClick={async () => {
          const warning = isSoleMember
            ? "You're the only member — deleting your account will also delete the household and everything in it. This can't be undone."
            : "Delete your account? You'll be removed from the household and signed out permanently. This can't be undone.";
          if (!(await confirm({ title: "Delete your account?", description: warning, confirmLabel: "Delete", danger: true }))) return;
          setBusy(true);
          const result = await deleteOwnAccountAction();
          setBusy(false);
          if (result?.error) setError(result.error);
        }}
      >
        {busy ? "Deleting…" : "Delete my account"}
      </button>
      {error && <p style={{ color: "var(--color-accent-700)", fontSize: "0.8125rem", marginTop: "0.5rem" }}>{error}</p>}
    </div>
  );
}
