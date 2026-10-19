"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "@/components/toast";
import { Icon } from "@/components/icons";
import { addPotluckItemAction, claimPotluckAction, removePotluckItemAction, setPotluckRelativesAction } from "@/lib/actions/potluck";
import { claimLimit, potluckSummary, type PotluckLine } from "@/lib/potluck";

/** Who brings what, on an event's own screen (20261019233100): the host
 * lists what is needed ("Pancit x2"), and anyone who can see the potluck --
 * the household, and linked households when the host asks them -- claims an
 * item with how many they'll bring. Read-only once the event is over. */
export function EventPotluck({
  eventId,
  lines,
  open,
  canList,
  canAskRelatives,
  relatives,
}: {
  eventId: string;
  lines: PotluckLine[];
  open: boolean;
  /** The host household, not in kid view: may add and remove items. */
  canList: boolean;
  /** A grown-up of the host household: may ask linked households too. */
  canAskRelatives: boolean;
  relatives: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState("");
  const run = (fn: () => Promise<{ error: string | null }>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.error) toast.error(r.error);
      else after?.();
      router.refresh();
    });

  return (
    <div>
      <div style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)", marginBottom: "0.5rem" }}>
        {potluckSummary(lines)}
        {!open && " · this event is over; the list is kept as it was."}
      </div>

      {lines.map((l) => {
        const limit = claimLimit(l);
        const qty = l.mine?.qty ?? 0;
        return (
          <div key={l.id} className="kin-potluck-row" data-covered={l.left === 0 || undefined}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "0.9375rem", fontWeight: 500 }}>
                {l.label}
                {l.wanted > 1 && <span style={{ color: "var(--color-neutral-600)", fontWeight: 400 }}> · {l.taken} of {l.wanted}</span>}
              </div>
              <div style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)" }}>
                {l.bringers.length > 0 ? l.bringers.map((b) => (b.qty > 1 ? `${b.name} ×${b.qty}` : b.name)).join(", ") : "Nobody yet"}
              </div>
            </div>
            {open && (qty > 0 || l.left > 0) && (
              <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                {qty > 0 && (
                  <button type="button" className="chip" aria-label={`Bring one fewer ${l.label}`} disabled={pending} onClick={() => run(() => claimPotluckAction(l.id, qty - 1))}>
                    −
                  </button>
                )}
                {qty > 0 && <span style={{ minWidth: "1.25rem", textAlign: "center", fontWeight: 600 }}>{qty}</span>}
                {qty < limit && (
                  <button type="button" className="chip" data-active={qty > 0 || undefined} aria-label={qty > 0 ? `Bring one more ${l.label}` : `I'll bring ${l.label}`} disabled={pending} onClick={() => run(() => claimPotluckAction(l.id, qty + 1))}>
                    {qty > 0 ? "+" : "I'll bring it"}
                  </button>
                )}
              </div>
            )}
            {canList && (
              <button type="button" className="kin-potluck-remove" aria-label={`Take ${l.label} off the list`} disabled={pending} onClick={() => run(() => removePotluckItemAction(l.id))}>
                <Icon name="x" size={14} />
              </button>
            )}
          </div>
        );
      })}

      {canList && open && (
        <form
          style={{ display: "flex", gap: "0.375rem", marginTop: "0.5rem" }}
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.trim()) run(() => addPotluckItemAction(eventId, draft), () => setDraft(""));
          }}
        >
          <input className="input" aria-label="What is needed" placeholder="What's needed, like “Pancit x2”" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={90} style={{ flex: 1, minHeight: "2.5rem" }} disabled={pending} />
          <button type="submit" className="btn btn-secondary" style={{ minHeight: "2.5rem", fontSize: "0.84375rem" }} disabled={pending || !draft.trim()}>
            Add
          </button>
        </form>
      )}

      {canAskRelatives && open && (
        <label style={{ display: "flex", gap: "0.5rem", alignItems: "center", fontSize: "0.84375rem", marginTop: "0.625rem" }}>
          <input type="checkbox" checked={relatives} disabled={pending} onChange={(e) => run(() => setPotluckRelativesAction(eventId, e.target.checked))} />
          Ask linked households too: they see this list and the event&apos;s name and date, nothing else
        </label>
      )}
    </div>
  );
}
