"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirm } from "@/components/confirm-sheet";
import { ShareMessage } from "@/components/share-message";
import { deletePaluwaganAction, setPaluwaganOptionsAction, setPaluwaganPaidAction } from "@/lib/actions/utang";
import type { ActionState } from "@/lib/actions/auth";

const small = { minHeight: "1.875rem", fontSize: "0.78125rem", padding: "0 0.625rem" } as const;

function useRun() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<ActionState>, after?: () => void) => {
    setError(null);
    startTransition(async () => {
      const r = await fn();
      if (r.error) setError(r.error);
      else after?.();
      router.refresh();
    });
  };
  return { pending, error, run, router };
}

export function PaluwaganOptions({ groupId, remind, isPrivate, mine }: { groupId: string; remind: boolean; isPrivate: boolean; mine: boolean }) {
  const { pending, error, run, router } = useRun();
  return (
    <div style={{ marginBottom: "0.875rem" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem" }}>
        <button type="button" className="btn btn-secondary" disabled={pending} style={small} onClick={() => run(() => setPaluwaganOptionsAction(groupId, { remind: !remind }))}>
          {remind ? "No reminders" : "Prepare reminders"}
        </button>
        {mine && (
          <button type="button" className="btn btn-secondary" disabled={pending} style={small} onClick={() => run(() => setPaluwaganOptionsAction(groupId, { isPrivate: !isPrivate }))}>
            {isPrivate ? "Show household grown-ups" : "Just me"}
          </button>
        )}
        <button
          type="button"
          className="btn btn-ghost"
          disabled={pending}
          style={{ ...small, color: "var(--color-neutral-700)" }}
          onClick={async () => {
            if (!(await confirm({ title: "Remove this savings circle?", description: "Its members and every round's record go with it.", confirmLabel: "Remove" }))) return;
            run(() => deletePaluwaganAction(groupId), () => router.push("/wealth/utang"));
          }}
        >
          Remove
        </button>
      </div>
      {error && <div role="alert" style={{ fontSize: "0.75rem", color: "var(--cal-occasion-ink)", marginTop: "0.25rem" }}>{error}</div>}
    </div>
  );
}

/** One member's hulog for one round: tap to tick it in, tap again to take
 * it back. A due one not in yet can carry the reminder to send. */
export function PaidTick({ groupId, memberId, round, name, paid, reminder }: { groupId: string; memberId: string; round: number; name: string; paid: boolean; reminder: string | null }) {
  const { pending, error, run } = useRun();
  const [showReminder, setShowReminder] = useState(false);
  return (
    <span style={{ display: "inline-flex", flexDirection: "column" }}>
      <span style={{ display: "inline-flex", gap: "0.25rem" }}>
        <button
          type="button"
          className={paid ? "btn btn-primary" : "btn btn-secondary"}
          aria-pressed={paid}
          disabled={pending}
          style={small}
          onClick={() => run(() => setPaluwaganPaidAction(groupId, memberId, round, !paid))}
        >
          {paid ? "✓ " : ""}
          {name}
        </button>
        {reminder && (
          <button type="button" className="btn btn-ghost" aria-expanded={showReminder} style={{ ...small, padding: "0 0.375rem" }} onClick={() => setShowReminder((s) => !s)}>
            Remind
          </button>
        )}
      </span>
      {showReminder && reminder && <ShareMessage text={reminder} title={`Savings circle reminder for ${name}`} />}
      {error && <span role="alert" style={{ fontSize: "0.71875rem", color: "var(--cal-occasion-ink)" }}>{error}</span>}
    </span>
  );
}
