"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "@/components/toast";
import { Icon } from "@/components/icons";
import { LogSpendControl, type PickableAccount } from "@/components/money-actions";
import { addGiftIdeaAction, addGiftPersonAction, removeGiftIdeaAction, removeGiftPersonAction, setGiftBoughtAction, setGiftBudgetAction } from "@/lib/actions/gift-list";
import { GIFT_KINDS, personTotals, spendParticulars, type GiftKind } from "@/lib/gift-list";
import { formatCurrency } from "@/lib/format";
import type { GiftListPerson } from "@/lib/queries/gift-list";

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ error: string | null }>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.error) toast.error(r.error);
      else after?.();
      router.refresh();
    });
  return { pending, run };
}

/** Add someone to the year's list: a name (or someone at home, so the list
 * is hidden from them), family or inaanak, and a budget. */
export function AddGiftPerson({ year, household }: { year: number; household: { id: string; name: string }[] }) {
  const { pending, run } = useRun();
  const [f, setF] = useState({ name: "", memberId: "", kind: "family" as GiftKind, budget: "" });
  return (
    <form
      className="kin-gift-add"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => addGiftPersonAction({ year, ...f, memberId: f.memberId || null }), () => setF({ name: "", memberId: "", kind: f.kind, budget: "" }));
      }}
    >
      <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap" }}>
        {GIFT_KINDS.map((k) => (
          <button key={k.key} type="button" className="chip" data-active={f.kind === k.key || undefined} aria-pressed={f.kind === k.key} onClick={() => setF({ ...f, kind: k.key })}>
            {k.label}
          </button>
        ))}
      </div>
      {household.length > 0 && f.kind === "family" && (
        <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap", marginTop: "0.5rem" }}>
          {household.map((m) => (
            <button
              key={m.id}
              type="button"
              className="chip"
              data-active={f.memberId === m.id || undefined}
              aria-pressed={f.memberId === m.id}
              onClick={() => setF({ ...f, memberId: f.memberId === m.id ? "" : m.id, name: f.memberId === m.id ? "" : m.name.split(" ")[0] })}
            >
              {m.name.split(" ")[0]}
            </button>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: "0.375rem", marginTop: "0.5rem" }}>
        <input className="input" aria-label="Who it's for" placeholder={f.kind === "inaanak" ? "Your godchild's name" : "Name"} value={f.name} maxLength={80} onChange={(e) => setF({ ...f, name: e.target.value, memberId: "" })} style={{ flex: 2, minHeight: "2.5rem" }} disabled={pending} />
        <input className="input" aria-label="Budget" inputMode="decimal" placeholder="Budget" value={f.budget} onChange={(e) => setF({ ...f, budget: e.target.value })} style={{ flex: 1, minHeight: "2.5rem" }} disabled={pending} />
        <button type="submit" className="btn btn-primary" style={{ minHeight: "2.5rem" }} disabled={pending || !f.name.trim()}>
          Add
        </button>
      </div>
      {f.memberId && <p style={{ fontSize: "0.75rem", color: "var(--color-neutral-600)", margin: "0.25rem 0 0" }}>Hidden from {f.name}: they won&apos;t see their row or its ideas.</p>}
    </form>
  );
}

/** One person's card: budget, ideas with Bought ticks, totals. */
export function GiftPersonCard({ person, currency, accounts, recorded }: { person: GiftListPerson; currency: string; accounts: PickableAccount[]; recorded: string[] }) {
  const { pending, run } = useRun();
  const [idea, setIdea] = useState("");
  const [budget, setBudget] = useState(person.budget == null ? "" : String(person.budget));
  const t = personTotals(person);
  const money = (n: number) => formatCurrency(n, currency);
  return (
    <div className="kin-gift-card" data-done={t.done || undefined}>
      <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem" }}>
        <div style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: "1rem" }}>
          {person.name}
          {person.kind === "inaanak" && <span style={{ fontWeight: 400, color: "var(--color-neutral-600)", fontSize: "0.8125rem" }}> · godchild</span>}
        </div>
        <button type="button" className="kin-potluck-remove" aria-label={`Take ${person.name} off the list`} disabled={pending} onClick={() => window.confirm(`Take ${person.name} off the list, with their ideas?`) && run(() => removeGiftPersonAction(person.id))}>
          <Icon name="trash" size={14} />
        </button>
      </div>
      <div style={{ fontSize: "0.8125rem", color: t.over ? "var(--color-accent-700)" : "var(--color-neutral-600)", margin: "0.125rem 0 0.375rem" }}>
        {money(t.bought)} bought of {money(t.planned)} planned
        {t.left !== null && (t.over ? ` · ${money(-t.left)} over the ${money(person.budget!)} budget` : ` · ${money(t.left)} left of ${money(person.budget!)}`)}
      </div>

      {person.items.map((i) => (
        <div key={i.id} className="kin-gift-item">
          <label style={{ display: "flex", gap: "0.5rem", alignItems: "center", flex: 1, minWidth: 0 }}>
            <input type="checkbox" checked={i.bought} disabled={pending} onChange={(e) => run(() => setGiftBoughtAction(i.id, e.target.checked))} />
            <span style={{ textDecoration: i.bought ? "line-through" : undefined, color: i.bought ? "var(--color-neutral-600)" : undefined }}>
              {i.label}
              {i.isCash && " (cash)"}
            </span>
          </label>
          {i.cost != null && <span style={{ fontSize: "0.8125rem", fontVariantNumeric: "tabular-nums" }}>{money(i.cost)}</span>}
          {i.bought && i.cost != null && i.cost > 0 && accounts.length > 0 && (
            recorded.includes(i.id) ? (
              <span style={{ fontSize: "0.75rem", color: "var(--color-neutral-600)" }}>in Wealth</span>
            ) : (
              <LogSpendControl accounts={accounts} currency={currency} particulars={spendParticulars(i)} category="Gifts" sourceTable="gift_list_items" sourceId={i.id} suggested={i.cost} label="Record" />
            )
          )}
          <button type="button" className="kin-potluck-remove" aria-label={`Remove ${i.label}`} disabled={pending} onClick={() => run(() => removeGiftIdeaAction(i.id))}>
            <Icon name="x" size={12} />
          </button>
        </div>
      ))}

      <form
        style={{ display: "flex", gap: "0.375rem", marginTop: "0.375rem" }}
        onSubmit={(e) => {
          e.preventDefault();
          if (idea.trim()) run(() => addGiftIdeaAction(person.id, idea), () => setIdea(""));
        }}
      >
        <input className="input" aria-label={`An idea for ${person.name}`} placeholder={person.kind === "inaanak" ? "Cash gift 500" : "An idea, like “Lego set 1,200”"} value={idea} onChange={(e) => setIdea(e.target.value)} maxLength={140} style={{ flex: 1, minHeight: "2.375rem" }} disabled={pending} />
        <button type="submit" className="btn btn-secondary" style={{ minHeight: "2.375rem", fontSize: "0.8125rem" }} disabled={pending || !idea.trim()}>
          Add
        </button>
      </form>
      <form
        style={{ display: "flex", gap: "0.375rem", alignItems: "center", marginTop: "0.375rem", fontSize: "0.8125rem" }}
        onSubmit={(e) => {
          e.preventDefault();
          run(() => setGiftBudgetAction(person.id, budget));
        }}
      >
        <label htmlFor={`budget-${person.id}`} style={{ color: "var(--color-neutral-600)" }}>
          Budget
        </label>
        <input id={`budget-${person.id}`} className="input" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} style={{ width: "6.5rem", minHeight: "2.125rem" }} disabled={pending} />
        {budget !== (person.budget == null ? "" : String(person.budget)) && (
          <button type="submit" className="btn btn-secondary" style={{ minHeight: "2.125rem", fontSize: "0.78125rem" }} disabled={pending}>
            Save
          </button>
        )}
      </form>
    </div>
  );
}
