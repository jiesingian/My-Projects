"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { Blueprint } from "@/components/ui";
import { approveRoutineLogAction, rejectRoutineLogAction } from "@/lib/actions/routines";
import { grantRedemptionAction, refuseRedemptionAction } from "@/lib/actions/rewards";
import type { PendingApproval, PendingRedemption } from "@/lib/queries/routines";

/** What the grown-ups still have to answer for. Only rendered for a parent
 * or an adult -- a child sees their own chore waiting instead, on the task
 * itself, which is the honest place for it. */
export function ApprovalQueue({ pending, redemptions }: { pending: PendingApproval[]; redemptions: PendingRedemption[] }) {
  const total = pending.length + redemptions.length;
  if (total === 0) return null;

  return (
    <section style={{ marginBottom: 26 }}>
      <h3 className="kin-eyebrow">Waiting on you · {total}</h3>
      {pending.map((p) => (
        <ApprovalRow key={`${p.routineId}-${p.date}`} item={p} />
      ))}
      {redemptions.map((r) => (
        <RedemptionRow key={r.id} item={r} />
      ))}
    </section>
  );
}

/** A reward asked for. Its points are already held against the balance, so
 * refusing is what hands them back rather than what takes them away. */
function RedemptionRow({ item }: { item: PendingRedemption }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<{ error: string | null }>) => {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.error) setError(result.error);
      router.refresh();
    });
  };

  return (
    <Blueprint style={{ padding: 13, marginBottom: 9 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <span
          style={{
            width: 30,
            height: 30,
            flex: "none",
            borderRadius: 9,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "color-mix(in srgb, var(--cal-goal) 22%, transparent)",
          }}
        >
          <Icon name="gift" size={16} style={{ color: "var(--cal-goal)" }} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: "600 15.5px/1.2 var(--font-heading)" }}>{item.title}</div>
          <div style={{ fontSize: 12.5, color: "var(--color-neutral-600)", marginTop: 2 }}>
            {item.who.split(" ")[0]} is asking · {item.costPoints} point{item.costPoints === 1 ? "" : "s"}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending}
          onClick={() => run(() => grantRedemptionAction(item.id))}
          style={{ minHeight: 32, fontSize: 13, padding: "0 14px", gap: 5 }}
        >
          <Icon name="check" size={14} />
          Grant it
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={pending}
          onClick={() => run(() => refuseRedemptionAction(item.id))}
          style={{ minHeight: 32, fontSize: 13, padding: "0 12px" }}
        >
          Not this time
        </button>
      </div>
      {error && <div style={{ fontSize: 12.5, color: "var(--cal-occasion)", marginTop: 6 }}>{error}</div>}
    </Blueprint>
  );
}

function ApprovalRow({ item }: { item: PendingApproval }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<{ error: string | null }>) => {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.error) setError(result.error);
      router.refresh();
    });
  };

  return (
    <Blueprint style={{ padding: 13, marginBottom: 9 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <span
          style={{
            width: 30,
            height: 30,
            flex: "none",
            borderRadius: 9,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "color-mix(in srgb, var(--cal-money) 22%, transparent)",
          }}
        >
          <Icon name="check" size={16} style={{ color: "var(--cal-money)" }} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: "600 15.5px/1.2 var(--font-heading)" }}>{item.title}</div>
          <div style={{ fontSize: 12.5, color: "var(--color-neutral-600)", marginTop: 2 }}>
            {item.who.split(" ")[0]} says it is done · {readableDate(item.date)}
            {item.points > 0 ? ` · ${item.points} point${item.points === 1 ? "" : "s"}` : ""}
          </div>
          {item.note && (
            <div style={{ fontSize: 13, color: "var(--color-neutral-700)", marginTop: 4, lineHeight: 1.4 }}>&ldquo;{item.note}&rdquo;</div>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending}
          onClick={() => run(() => approveRoutineLogAction(item.routineId, item.date))}
          style={{ minHeight: 32, fontSize: 13, padding: "0 14px", gap: 5 }}
        >
          <Icon name="check" size={14} />
          Approve
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={pending}
          onClick={() => run(() => rejectRoutineLogAction(item.routineId, item.date))}
          style={{ minHeight: 32, fontSize: 13, padding: "0 12px" }}
        >
          Not yet
        </button>
      </div>
      {error && <div style={{ fontSize: 12.5, color: "var(--cal-occasion)", marginTop: 6 }}>{error}</div>}
    </Blueprint>
  );
}

function readableDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}
