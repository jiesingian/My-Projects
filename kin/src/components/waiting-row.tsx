"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FormSheet } from "@/components/form-sheet";
import { formatCurrency } from "@/lib/format";
import { remindDepositAction, snoozeWaitingAction } from "@/lib/actions/waiting";

/* "Waiting on you"'s row and its own two buttons, apart from
 * money-actions.tsx (29 October): Planner shows the list too, and a row
 * shouldn't bring every money control with it -- the ones a sheet needs come
 * through components/waiting-actions.tsx, loaded when shown. */

function useAction() {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<{ error: string | null }>, onDone?: () => void) =>
    start(async () => {
      let res: { error: string | null };
      try {
        res = await fn();
      } catch {
        setError("That didn't go through. Check the connection and try again.");
        return;
      }
      setError(res.error);
      if (res.error) return;
      onDone?.();
      router.refresh();
    });
  return { error, pending, run };
}

/** One row of "Waiting on you" (Jonathan, 29 October): what it is, how it
 * stands and what it comes to; tapped, the same sheet wherever the row is
 * -- Accounts, Cash Flow, A&L or Goals -- with what it is about, who it
 * waits on, and the action owed on it right there. `sheet` is built on the
 * server (components/waiting-on-you.tsx). */
export function WaitingRow({
  title,
  meta,
  amount,
  badge,
  currency,
  autoOpen = false,
  quick,
  snoozeKey,
  sheet,
}: {
  title: string;
  meta: string;
  amount?: number;
  badge?: string;
  currency: string;
  autoOpen?: boolean;
  /** The one action a simple item needs, right on the row (Jonathan, 29
   * October), so paying a bill doesn't take a sheet first. */
  quick?: React.ReactNode;
  /** "Not now" in the sheet: away for 30 days (snoozeWaitingAction). */
  snoozeKey?: string;
  sheet: React.ReactNode;
}) {
  const [open, setOpen] = useState(autoOpen);
  const { error, pending, run } = useAction();
  return (
    <>
      <div style={{ borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)" }}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{ display: "flex", width: "100%", alignItems: "center", gap: "0.625rem", padding: quick ? "0.625rem 0 0.375rem" : "0.625rem 0", background: "none", border: 0, color: "inherit", textAlign: "left", cursor: "pointer", font: "inherit" }}
      >
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: "0.875rem", display: "block" }}>{title}</span>
          <span style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)" }}>{meta}</span>
        </span>
        {badge && <span style={{ flex: "none", font: "600 0.75rem/1 var(--font-numeric)", color: "var(--color-accent-700)", padding: "0.3125rem 0.5rem", borderRadius: 999, background: "color-mix(in srgb, var(--color-text) 6%, transparent)" }}>{badge}</span>}
        {amount != null && <span style={{ flex: "none", fontFamily: "var(--font-numeric)", fontSize: "0.8125rem" }}>{formatCurrency(amount, currency)}</span>}
        <span aria-hidden="true" style={{ flex: "none", color: "var(--color-neutral-600)" }}>›</span>
      </button>
      {/* Under the words, not beside them: a phone's row has no room for both. */}
      {quick && <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem", paddingBottom: "0.625rem" }}>{quick}</div>}
      </div>
      <FormSheet open={open} onClose={() => setOpen(false)} title={title} guardUnsaved={false}>
        {sheet}
        {snoozeKey && (
          <div style={{ marginTop: "0.875rem", paddingTop: "0.625rem", borderTop: "1px solid var(--color-divider)", display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
            <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => run(() => snoozeWaitingAction(snoozeKey), () => setOpen(false))} style={{ minHeight: "1.875rem", fontSize: "0.78125rem", padding: "0 0.6875rem" }}>
              {pending ? "Putting away…" : "Not now"}
            </button>
            <span style={{ fontSize: "0.75rem", color: "var(--color-neutral-600)" }}>Off your list for 30 days; back after that if it still stands.</span>
            {error && <p role="alert" style={{ fontSize: "0.75rem", color: "var(--color-accent-700)", margin: 0, width: "100%" }}>{error}</p>}
          </div>
        )}
      </FormSheet>
    </>
  );
}

/** "Remind" on a shared goal's deposit: one push to the person who hasn't
 * put in yet, sent once from here. */
export function RemindButton({ goalId, memberId, name }: { goalId: string; memberId: string; name: string }) {
  const [sent, setSent] = useState(false);
  const { error, pending, run } = useAction();
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: "0.25rem" }}>
      <button type="button" className="btn btn-secondary" disabled={pending || sent} onClick={() => run(() => remindDepositAction(goalId, memberId), () => setSent(true))} style={{ minHeight: "1.875rem", fontSize: "0.78125rem", padding: "0 0.6875rem" }}>
        {sent ? `Reminded ${name} ✓` : pending ? "Sending…" : `Remind ${name}`}
      </button>
      {error && <span role="alert" style={{ fontSize: "0.75rem", color: "var(--color-accent-700)" }}>{error}</span>}
    </span>
  );
}
