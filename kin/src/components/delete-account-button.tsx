"use client";

import { useId, useState } from "react";
import { requestAccountDeletionAction } from "@/lib/actions/account-deletion";
import { DELETE_CONFIRM_WORDS, DELETE_GRACE_DAYS, confirmMatches } from "@/lib/account-deletion";

/** Delete my account: the words typed out, then 7 days to change your mind
 * (lib/actions/account-deletion.ts). `householdNote` is what happens to the
 * household (lib/account-deletion.ts, planSentence), worked out on the
 * server from who else is in it. */
export function DeleteAccountButton({ householdNote }: { householdNote: string | null }) {
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
        Delete my account
      </button>
    );
  }

  return (
    <div style={{ border: "1px solid var(--color-accent-700)", padding: "0.875rem" }}>
      <p style={{ fontSize: "0.875rem", lineHeight: 1.5, margin: "0 0 8px" }}>
        In {DELETE_GRACE_DAYS} days your account is deleted: your login, your personal space, the health records about you, your
        connections and your details. What you added for the household (plans, lists, money, chat) stays, shown as written by a{" "}
        <strong>Former member</strong>. Children&apos;s profiles are not deleted.
      </p>
      {householdNote && <p style={{ fontSize: "0.875rem", lineHeight: 1.5, margin: "0 0 8px" }}>{householdNote}</p>}
      <p style={{ fontSize: "0.8125rem", lineHeight: 1.5, color: "var(--color-neutral-700)", margin: "0 0 10px" }}>
        You&apos;ll be signed out now. Sign in again within {DELETE_GRACE_DAYS} days to keep your account. Download your data first if you want a copy.
      </p>
      <label htmlFor={`${uid}-confirm`} style={{ fontSize: "0.8125rem", color: "var(--color-neutral-700)", display: "block", marginBottom: "0.25rem" }}>
        Type <strong>{DELETE_CONFIRM_WORDS}</strong> to confirm
      </label>
      <input
        id={`${uid}-confirm`}
        className="input"
        value={confirmText}
        onChange={(e) => setConfirmText(e.target.value)}
        autoComplete="off"
        autoCapitalize="none"
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
          Keep my account
        </button>
        <button
          type="button"
          className="btn btn-primary"
          style={{ flex: 1, minHeight: "2.625rem", fontSize: "0.875rem", background: "var(--color-accent-700)", borderColor: "var(--color-accent-700)" }}
          disabled={!confirmMatches(confirmText) || busy}
          onClick={async () => {
            setBusy(true);
            const result = await requestAccountDeletionAction(confirmText);
            setBusy(false);
            if (result?.error) setError(result.error);
          }}
        >
          {busy ? "Deleting…" : "Delete my account"}
        </button>
      </div>
    </div>
  );
}
