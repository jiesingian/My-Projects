"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addBuyItemAction, toggleBuyItemAction, clearCheckedAction, updateBuyItemAction, removeBuyItemAction } from "@/lib/actions/household";
import { postHubExpenseAction } from "@/lib/actions/wealth";
import { MARKET_SECTIONS, UNITS, guessSection, formatQuantity } from "@/lib/grocery";
import type { ActionState } from "@/lib/actions/auth";
import { SubmitButton, ErrorText } from "@/components/form";
import { Blueprint, Tag } from "@/components/ui";
import { Icon } from "@/components/icons";
import { formatCurrency } from "@/lib/format";
import type { PickableAccount } from "@/components/money-actions";
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
  accounts,
  currency,
}: {
  groups: BuyGroup[];
  openCount: number;
  doneCount: number;
  familyId: string;
  accounts: PickableAccount[];
  currency: string;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();
  const [addState, addAction] = useActionState(addBuyItemAction, initialState);
  const [editing, setEditing] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [sectionTouched, setSectionTouched] = useState(false);
  const [sectionChoice, setSectionChoice] = useState<string>("Other");

  // The section follows what's being typed until the member overrides it.
  const section = sectionTouched ? sectionChoice : guessSection(newName);
  const setSection = (value: string) => {
    setSectionTouched(true);
    setSectionChoice(value);
  };

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

      {doneCount > 0 && <ClearCheckedPanel familyId={familyId} doneCount={doneCount} accounts={accounts} currency={currency} />}

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
                <div key={item.id}>
                <div style={{ display: "flex", gap: 11, alignItems: "center", padding: "10px 0", borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)" }}>
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
                  <button
                    type="button"
                    onClick={() => setEditing(editing === item.id ? null : item.id)}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      textAlign: "left",
                      background: "none",
                      border: 0,
                      padding: 0,
                      cursor: "pointer",
                      fontSize: 14,
                      color: item.checked ? "var(--color-neutral-500)" : "var(--color-text)",
                      textDecoration: item.checked ? "line-through" : "none",
                    }}
                  >
                    {item.name}
                  </button>
                  <span style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 11.5, color: "var(--color-neutral-600)", flex: "none" }}>
                    {formatQuantity(item.quantity, item.unit)}
                  </span>
                  <Tag variant={item.source === "meal_plan" ? "accent" : item.source === "maintenance" ? "outline" : "neutral"}>
                    {SOURCE_LABEL[item.source] ?? item.source}
                  </Tag>
                </div>
                {editing === item.id && <EditItemRow item={item} onClose={() => setEditing(null)} />}
                </div>
              ))}
          </div>
        );
      })}

      <form action={addAction} style={{ marginTop: 4 }}>
        <input type="hidden" name="source" value="house" />
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input
            className="input"
            name="name"
            placeholder="Add an item"
            required
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            style={{ minHeight: 42, flex: 1 }}
          />
          <input className="input" name="quantity" type="number" step="0.01" min="0" placeholder="Qty" style={{ minHeight: 42, width: 68 }} />
          <select className="input" name="unit" defaultValue="pc" style={{ minHeight: 42, width: 82 }}>
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {/* Pre-filled from the name as it's typed, so the common case is one tap. */}
          <select className="input" name="section" value={section} onChange={(e) => setSection(e.target.value)} style={{ minHeight: 42, flex: 1 }}>
            {MARKET_SECTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <SubmitButton className="btn btn-primary" style={{ minHeight: 42, paddingInline: 18 }}>
            ADD
          </SubmitButton>
        </div>
      </form>
      <ErrorText message={addState.error} />
      <div style={{ fontSize: 11, color: "var(--color-neutral-600)", marginTop: 10 }}>
        Sections follow the order you walk the market. Items from the meal plan are filed by name automatically — tap any item to fix its
        quantity or section. Ticked items stay until cleared.
      </div>
    </>
  );
}

/** Tapping an item opens this — fix the quantity, the unit, or which section
 * it was filed under when it came off a meal plan. */
function EditItemRow({ item, onClose }: { item: Tables<"buy_items">; onClose: () => void }) {
  const [name, setName] = useState(item.name);
  const [quantity, setQuantity] = useState(item.quantity === null ? "" : String(item.quantity));
  const [unit, setUnit] = useState(item.unit ?? "pc");
  const [section, setSection] = useState(item.section);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function save() {
    startTransition(async () => {
      await updateBuyItemAction(item.id, {
        name,
        quantity: quantity.trim() ? Number(quantity) : null,
        unit: unit || null,
        section,
      });
      onClose();
      router.refresh();
    });
  }

  return (
    <div style={{ padding: "10px 0 12px", borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)" }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} style={{ minHeight: 40, flex: 1 }} />
        <input
          className="input"
          type="number"
          step="0.01"
          min="0"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          placeholder="Qty"
          style={{ minHeight: 40, width: 68 }}
        />
        <select className="input" value={unit} onChange={(e) => setUnit(e.target.value)} style={{ minHeight: 40, width: 82 }}>
          {UNITS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <select className="input" value={section} onChange={(e) => setSection(e.target.value)} style={{ minHeight: 40, flex: 1 }}>
          {MARKET_SECTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button type="button" className="btn btn-primary" disabled={pending} style={{ minHeight: 40, fontSize: 11.5, paddingInline: 14 }} onClick={save}>
          {pending ? "…" : "SAVE"}
        </button>
        <button type="button" className="btn btn-secondary" style={{ minHeight: 40, fontSize: 11.5, paddingInline: 12 }} onClick={onClose}>
          CANCEL
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={pending}
          style={{ minHeight: 40, fontSize: 11.5, paddingInline: 12, color: "var(--color-accent-700)", borderColor: "var(--color-accent-700)" }}
          onClick={() => {
            if (!window.confirm(`Remove "${item.name}" from the list?`)) return;
            startTransition(async () => {
              await removeBuyItemAction(item.id);
              onClose();
              router.refresh();
            });
          }}
        >
          REMOVE
        </button>
      </div>
    </div>
  );
}

/** Clearing the trolley is the moment the shop actually cost something, so
 * that's where the spend is captured and taken out of a real account. */
function ClearCheckedPanel({
  familyId,
  doneCount,
  accounts,
  currency,
}: {
  familyId: string;
  doneCount: number;
  accounts: PickableAccount[];
  currency: string;
}) {
  const [amount, setAmount] = useState(0);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function finish(withSpend: boolean) {
    startTransition(async () => {
      if (withSpend && amount > 0 && accountId) {
        await postHubExpenseAction({
          accountId,
          amount,
          particulars: `Grocery run · ${doneCount} item${doneCount === 1 ? "" : "s"}`,
          category: "Groceries",
          sourceTable: "buy_items",
          sourceId: null,
        });
      }
      await clearCheckedAction(familyId);
      router.refresh();
    });
  }

  return (
    <Blueprint className="bg-[var(--color-accent-100)]" style={{ padding: "12px 13px", marginBottom: 16 }}>
      <div style={{ fontSize: 12, marginBottom: 10 }}>
        {doneCount} item{doneCount === 1 ? "" : "s"} in the trolley — what did the shop come to?
      </div>
      {accounts.length > 0 && (
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <div className="field" style={{ flex: 1, margin: 0 }}>
            <label>PAID FROM</label>
            <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)} style={{ minHeight: 40 }}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {formatCurrency(a.balance, currency)}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ width: 106, margin: 0 }}>
            <label>TOTAL</label>
            <input className="input" type="number" step="0.01" value={amount} onChange={(e) => setAmount(Number(e.target.value))} style={{ minHeight: 40 }} />
          </div>
        </div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          className="btn btn-primary"
          style={{ flex: 1, minHeight: 38, fontSize: 11.5, letterSpacing: ".04em" }}
          disabled={pending}
          onClick={() => finish(true)}
        >
          {pending ? "…" : amount > 0 ? "CLEAR & LOG SPEND" : "CLEAR CHECKED"}
        </button>
        {amount > 0 && (
          <button type="button" className="btn btn-secondary" style={{ flex: "none", minHeight: 38, fontSize: 11.5 }} disabled={pending} onClick={() => finish(false)}>
            CLEAR ONLY
          </button>
        )}
      </div>
    </Blueprint>
  );
}
