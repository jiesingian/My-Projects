"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "@/components/toast";
import { planNocheBuenaAction } from "@/lib/actions/christmas";
import type { NocheBuenaDish } from "@/lib/christmas";

/** The ready Noche Buena plan on Today (lib/christmas.ts): the classic
 * dishes ticked, one tap plans them on the 24 December dinner and their
 * ingredients go on the To-Buy list. Untick what you won't make; add
 * anything else from Meals. */
export function NocheBuenaPlanner({ dishes, canPlan, mealsHref }: { dishes: NocheBuenaDish[]; canPlan: boolean; mealsHref: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(dishes.map((d) => d.key)));
  const toggle = (key: string) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const plan = () =>
    start(async () => {
      const r = await planNocheBuenaAction([...chosen]);
      if (r.error) toast.error(r.error);
      else toast.success(r.added > 0 ? `${r.added} ${r.added === 1 ? "dish" : "dishes"} planned for 24 December. The To-Buy list has what they need.` : "Already planned.");
      router.refresh();
    });

  return (
    <div>
      <ul className="kin-pasko-dishes" aria-label="Noche Buena dishes">
        {dishes.map((d) => (
          <li key={d.key}>
            <label>
              <input type="checkbox" checked={chosen.has(d.key)} disabled={!canPlan || pending} onChange={() => toggle(d.key)} />
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontWeight: 500 }}>{d.name}</span>
                <span style={{ display: "block", fontSize: "0.78125rem", color: "var(--color-neutral-600)" }}>
                  serves {d.serves} · {d.ingredients} things to buy
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap", alignItems: "center", marginTop: "0.5rem" }}>
        {canPlan ? (
          <button type="button" className="btn btn-primary" style={{ minHeight: "2.5rem", fontSize: "0.875rem" }} disabled={pending || chosen.size === 0} onClick={plan}>
            Plan it and fill the To-Buy list
          </button>
        ) : (
          <span style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)" }}>A grown-up plans it.</span>
        )}
        <Link href={mealsHref} className="btn btn-ghost" style={{ minHeight: "2.5rem", fontSize: "0.875rem" }}>
          Open Meals
        </Link>
      </div>
    </div>
  );
}
