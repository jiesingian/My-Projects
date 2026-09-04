"use client";

import { useState } from "react";
import { deleteOwnAccountAction } from "@/lib/actions/profile";

export function DeleteAccountButton({ isSoleMember }: { isSoleMember: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div>
      <button
        type="button"
        className="btn btn-secondary btn-block"
        style={{ minHeight: 46, fontSize: 13.5, letterSpacing: ".04em", color: "var(--color-accent-700)", borderColor: "var(--color-accent-700)" }}
        disabled={busy}
        onClick={async () => {
          const warning = isSoleMember
            ? "You're the only member — deleting your account will also delete the household and everything in it. This can't be undone. Continue?"
            : "Delete your account? You'll be removed from the household and signed out permanently. This can't be undone. Continue?";
          if (!window.confirm(warning)) return;
          setBusy(true);
          const result = await deleteOwnAccountAction();
          setBusy(false);
          if (result?.error) setError(result.error);
        }}
      >
        {busy ? "DELETING…" : "DELETE MY ACCOUNT"}
      </button>
      {error && <p style={{ color: "var(--color-accent-700)", fontSize: 13, marginTop: 8 }}>{error}</p>}
    </div>
  );
}
