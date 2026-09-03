"use client";

import { useActionState, useState, useTransition } from "react";
import { addBuyItemAction, toggleBuyItemAction, clearCheckedAction } from "@/lib/actions/household";
import type { ActionState } from "@/lib/actions/auth";
import { SubmitButton, ErrorText } from "@/components/form";
import { Blueprint, Tag } from "@/components/ui";
import { Icon } from "@/components/icons";
import type { Tables } from "@/lib/database.types";

const initialState: ActionState = { error: null };

type BuyGroup = { name: string; items: Tables<"buy_items">[]; openCount: number };

const SOURCE_LABEL: Record<string, string> = {
  meal_plan: "MEAL PLAN",
  house: "HOUSE",
  maintenance: "MAINTENANCE",
  member: "MEMBER",
};

export function BuyList({
  groups,
  openCount,
  doneCount,
  familyId,
}: {
  groups: BuyGroup[];
  openCount: number;
  doneCount: number;
  familyId: string;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [addState, addAction] = useActionState(addBuyItemAction, initialState);

  return (
    <>
      <Blueprint style={{ padding: 13, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ font: "600 10px/1 var(--font-heading)", letterSpacing: ".14em", color: "var(--color-neutral-600)" }}>
            ONE LIST · EVERY SOURCE
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, margin: "9px 0 0" }}>
          <span style={{ font: "600 34px/1 var(--font-heading)" }}>{openCount}</span>
          <span style={{ fontSize: 12, color: "var(--color-neutral-600)" }}>still to buy · {doneCount} in the trolley</span>
        </div>
      </Blueprint>

      {doneCount > 0 && (
        <Blueprint className="bg-[var(--color-accent-100)]" style={{ padding: "11px 13px", marginBottom: 16, display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ fontSize: 12, flex: 1 }}>
            {doneCount} item{doneCount === 1 ? "" : "s"} ticked off — clear {doneCount === 1 ? "it" : "them"} from the list?
          </span>
          <button
            type="button"
            className="btn btn-primary"
            style={{ minHeight: 38, fontSize: 11.5, letterSpacing: ".04em", flex: "none" }}
            disabled={pending}
            onClick={() => startTransition(() => clearCheckedAction(familyId))}
          >
            CLEAR CHECKED
          </button>
        </Blueprint>
      )}

      {groups.map((g) => {
        const isCollapsed = collapsed.has(g.name);
        return (
          <div key={g.name} style={{ marginBottom: 18 }}>
            <button
              type="button"
              onClick={() =>
                setCollapsed((prev) => {
                  const next = new Set(prev);
                  if (next.has(g.name)) {
                    next.delete(g.name);
                  } else {
                    next.add(g.name);
                  }
                  return next;
                })
              }
              style={{
                width: "100%",
                cursor: "pointer",
                background: "none",
                border: 0,
                borderBottom: "1px solid var(--color-text)",
                padding: "0 0 6px",
                display: "flex",
                alignItems: "baseline",
                gap: 8,
              }}
            >
              <Icon name="chevronLeft" size={12} className="text-[var(--color-neutral-600)]" style={{ transform: isCollapsed ? "rotate(0deg)" : "rotate(-90deg)" }} />
              <span style={{ font: "600 11px/1 var(--font-heading)", letterSpacing: ".14em", textTransform: "uppercase" }}>{g.name}</span>
              <span style={{ font: "400 9.5px/1 ui-monospace, Menlo, monospace", color: "var(--color-neutral-600)", marginLeft: "auto" }}>
                {g.openCount} OF {g.items.length}
              </span>
            </button>
            {!isCollapsed &&
              g.items.map((item) => (
                <div key={item.id} style={{ display: "flex", gap: 11, alignItems: "center", padding: "10px 0", borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)" }}>
                  <button
                    type="button"
                    onClick={() => startTransition(() => toggleBuyItemAction(item.id, !item.checked))}
                    style={{
                      width: 18,
                      height: 18,
                      flex: "none",
                      cursor: "pointer",
                      padding: 0,
                      border: `1.5px solid ${item.checked ? "var(--color-accent)" : "var(--color-divider)"}`,
                      background: item.checked ? "var(--color-accent)" : "transparent",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "var(--color-bg)",
                      fontSize: 11,
                    }}
                  >
                    {item.checked ? "✓" : ""}
                  </button>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 14, textDecoration: item.checked ? "line-through" : "none", color: item.checked ? "var(--color-neutral-500)" : "var(--color-text)" }}>
                    {item.name}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--color-neutral-600)" }}>{item.qty}</span>
                  <Tag variant={item.source === "meal_plan" ? "accent" : item.source === "maintenance" ? "outline" : "neutral"}>
                    {SOURCE_LABEL[item.source] ?? item.source}
                  </Tag>
                </div>
              ))}
          </div>
        );
      })}

      <form action={addAction} style={{ display: "flex", gap: 10, marginTop: 4 }}>
        <input className="input" name="name" placeholder="Add an item" required style={{ minHeight: 42 }} />
        <input type="hidden" name="group_name" value="Other" />
        <input type="hidden" name="source" value="house" />
        <SubmitButton className="btn btn-primary" style={{ minHeight: 42, paddingInline: 18 }}>
          ADD
        </SubmitButton>
      </form>
      <ErrorText message={addState.error} />
      <div style={{ fontSize: 11, color: "var(--color-neutral-600)", marginTop: 10 }}>
        Groceries generated from the meal plan land here under their own group. Ticked items stay until cleared.
      </div>
    </>
  );
}
