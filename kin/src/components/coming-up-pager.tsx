"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/icons";
import { PickButton } from "@/components/pick-button";
import type { BriefItem } from "@/lib/queries/today";

/** Today's "Coming up", with the same Who dropdown as the Planner and
 * Wealth (29 September, Janine -- it replaced three swiped pages):
 *
 *   All     everything coming up, everyone's and the family's;
 *   Family  what is the whole family's -- whole-family plans, bills, meals;
 *   a name  that person's, with the family's alongside, the way the
 *           Planner shows one person.
 *
 * The choice stays on the page rather than reloading Today, so the list
 * changes under the thumb without the page jumping back to the top. */
export function ComingUpPager({ items, people }: { items: BriefItem[]; people: { id: string; label: string }[] }) {
  const [who, setWho] = useState("all");

  const isFamily = (b: BriefItem) => (b.whose ?? "family") === "family";
  const rows =
    who === "all" ? items : who === "family" ? items.filter(isFamily) : items.filter((b) => isFamily(b) || (b.memberIds ?? []).includes(who));

  const label = who === "all" ? "All" : who === "family" ? "Family" : (people.find((p) => p.id === who)?.label ?? "All");
  const options = [
    { label: "All", href: "all", active: who === "all" },
    { label: "Family", href: "family", active: who === "family" },
    ...people.map((p) => ({ label: p.label, href: p.id, active: who === p.id })),
  ];

  return (
    <>
      <div style={{ display: "flex", marginBottom: "0.625rem" }}>
        <PickButton title="Who" icon="users" label={label} options={options} onPick={setWho} />
      </div>
      <div className="kin-brief">
        {rows.length === 0 ? (
          <p className="kin-pager-empty">Nothing coming up for {who === "all" ? "anyone" : who === "family" ? "the whole family" : label === "Me" ? "you" : label} this week.</p>
        ) : (
          rows.map((b) => (
            <Link key={b.id} href={b.href} className="kin-brief-row">
              <span className="kin-brief-ico" data-tint={b.tint}>
                <Icon name={b.icon} size="1.0625rem" />
              </span>
              <span style={{ minWidth: 0 }}>
                <span className="kin-brief-title">{b.title}</span>
                <span className="kin-brief-meta">{b.meta}</span>
              </span>
              <Icon name="chevronLeft" size="0.9375rem" className="kin-brief-chev" />
            </Link>
          ))
        )}
      </div>
    </>
  );
}
