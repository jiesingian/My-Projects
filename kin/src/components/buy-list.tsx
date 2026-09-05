"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addBuyItemAction, toggleBuyItemAction, clearCheckedAction, updateBuyItemAction, removeBuyItemAction } from "@/lib/actions/household";
import { postHubExpenseAction } from "@/lib/actions/wealth";
import { MARKET_SECTIONS, UNITS, guessSection, formatQuantity } from "@/lib/grocery";
import { BuyItemPriceButton, BuyItemPriceEditor } from "@/components/household-price-controls";
import type { ActionState } from "@/lib/actions/auth";
import { SubmitButton, ErrorText } from "@/components/form";
import { Blueprint, Tag } from "@/components/ui";
import { Icon } from "@/components/icons";
import { ShoppingDayControl } from "@/components/shopping-day";
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
  prices,
  unpriced,
  trip,
  pricesSlot,
}: {
  groups: BuyGroup[];
  openCount: number;
  doneCount: number;
  familyId: string;
  accounts: PickableAccount[];
  currency: string;
  /** What each line is expected to cost, keyed by item id. */
  prices: Record<string, { estimated: number | null; unitPrice: number | null; source: string; inPantry: boolean }>;
  /** How many lines Kin has no price for, so the total can say so. */
  unpriced: number;
  /** The day this list is being bought on, if one is set. */
  trip: {
    id: string;
    title: string;
    iso: string;
    time: string;
    budget: number | null;
    source: "trip" | "routine";
    occurrenceDate?: string;
    when: string;
  } | null;
  /** The Prices & pantry sheet, built on the server and passed in. */
  pricesSlot: React.ReactNode;
}) {
  // Which sections are open. Empty means all closed, which is how the list
  // starts: a shopping list is read one aisle at a time.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [checkingOut, setCheckingOut] = useState(false);
  // Which line's price is being set. One at a time, under its own row.
  const [pricing, setPricing] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [addState, addAction] = useActionState(addBuyItemAction, initialState);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [sectionTouched, setSectionTouched] = useState(false);
  const [sectionChoice, setSectionChoice] = useState<string>("Other");

  // What the basket comes to, and what the whole list would. Both are
  // estimates built from the price book, so a line Kin cannot price is
  // counted as an item but not as money — and says so.
  const allItems = groups.flatMap((g) => g.items);
  const estimateOf = (id: string) => prices[id]?.estimated ?? 0;
  const basketTotal = allItems.filter((i) => i.checked).reduce((sum, i) => sum + estimateOf(i.id), 0);
  const listTotal = allItems.reduce((sum, i) => sum + estimateOf(i.id), 0);

  // The section follows what's being typed until the member overrides it.
  const section = sectionTouched ? sectionChoice : guessSection(newName);
  const setSection = (value: string) => {
    setSectionTouched(true);
    setSectionChoice(value);
  };

  return (
    <>
      {/* One card for the whole shop: what the list comes to, how much of it
          is already in the basket, what is still to buy, the day it is being
          bought on and the budget for it. They were two cards saying halves
          of the same thing. */}
      <Blueprint style={{ padding: 14, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontSize: 12, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--color-neutral-600)" }}>
            This list
          </span>
          <span style={{ marginLeft: "auto", font: "600 24px/1 var(--font-heading)" }}>{formatCurrency(listTotal, currency)}</span>
        </div>

        {/* How far round the shop you are: the filled part is in the basket. */}
        <div style={{ height: 7, borderRadius: 999, overflow: "hidden", background: "color-mix(in srgb, var(--color-text) 9%, transparent)", margin: "9px 0 7px" }}>
          <div style={{ height: "100%", width: `${listTotal > 0 ? Math.min(100, (basketTotal / listTotal) * 100) : 0}%`, background: "var(--color-switch-on)" }} />
        </div>

        <div style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 13 }}>
          <span>
            <strong style={{ fontWeight: 600 }}>{formatCurrency(basketTotal, currency)}</strong>
            <span style={{ color: "var(--color-neutral-700)" }}> in the basket · {doneCount} of {doneCount + openCount}</span>
          </span>
          <span style={{ marginLeft: "auto", color: "var(--color-neutral-700)" }}>
            {formatCurrency(listTotal - basketTotal, currency)} still to buy
          </span>
        </div>

        {unpriced > 0 && (
          <div style={{ fontSize: 12, color: "var(--color-neutral-700)", marginTop: 6 }}>
            {unpriced === 1 ? "One item has no price yet" : `${unpriced} items have no price yet`} — the totals leave them out.
          </div>
        )}

        {/* The day, its budget, and the two things you might do about it. */}
        <div style={{ paddingTop: 10, marginTop: 10, borderTop: "1px solid var(--color-divider)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13.5 }}>
            <Icon name="basket" size={15} style={{ color: trip ? "var(--cal-schedule)" : "var(--color-neutral-600)", flex: "none" }} />
            <span style={{ flex: 1, minWidth: 0, color: trip ? "var(--color-text)" : "var(--color-neutral-700)" }}>
              {trip ? `${trip.title} · ${trip.when}` : "No shopping day yet"}
            </span>
            {trip &&
              (trip.budget != null ? (
                <span style={{ fontSize: 12.5, flex: "none", color: listTotal > trip.budget ? "var(--cal-money)" : "var(--color-neutral-700)" }}>
                  {listTotal > trip.budget
                    ? `${formatCurrency(listTotal - trip.budget, currency)} over budget`
                    : `${formatCurrency(trip.budget - listTotal, currency)} under`}
                </span>
              ) : (
                // Still said, just not in a paragraph of its own: the budget
                // field is inside Change the day, one tap below.
                <span style={{ fontSize: 12.5, flex: "none", color: "var(--color-neutral-600)" }}>no budget</span>
              ))}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 2 }}>
            <ShoppingDayControl run={trip} />
            <span style={{ marginLeft: "auto" }}>{pricesSlot}</span>
          </div>
        </div>

        {/* Checking out is a decision, so it waits to be asked for. It used
            to appear on its own the moment anything was ticked, above the
            list, where it read as a panel that had opened itself. */}
        {doneCount > 0 && !checkingOut && (
          <button
            type="button"
            className="btn btn-primary"
            style={{ width: "100%", minHeight: 40, fontSize: 13.5, letterSpacing: ".04em", marginTop: 11 }}
            onClick={() => setCheckingOut(true)}
          >
            CHECK OUT {doneCount} ITEM{doneCount === 1 ? "" : "S"}
          </button>
        )}
      </Blueprint>

      {checkingOut && (
        <ClearCheckedPanel
          familyId={familyId}
          doneCount={doneCount}
          accounts={accounts}
          currency={currency}
          suggested={basketTotal}
          onClose={() => setCheckingOut(false)}
        />
      )}

      {groups.map((g) => {
        const isOpen = expanded.has(g.name);
        const inBasket = g.items.filter((i) => i.checked).length;
        return (
          <div key={g.name} style={{ marginBottom: 18 }}>
            <button
              type="button"
              onClick={() =>
                setExpanded((prev) => {
                  const next = new Set(prev);
                  if (next.has(g.name)) next.delete(g.name);
                  else next.add(g.name);
                  return next;
                })
              }
              style={{
                width: "100%",
                cursor: "pointer",
                background: "none",
                border: 0,
                borderBottom: "1px solid var(--color-divider)",
                padding: "0 0 6px",
                display: "flex",
                alignItems: "baseline",
                gap: 8,
              }}
            >
              <Icon name="chevronLeft" size={12} className="text-[var(--color-neutral-600)]" style={{ transform: isOpen ? "rotate(-90deg)" : "rotate(0deg)" }} />
              <span style={{ font: "600 13px/1 var(--font-heading)", letterSpacing: ".02em", textTransform: "uppercase" }}>{g.name}</span>
              <span style={{ font: "400 12px/1 var(--font-numeric)", color: "var(--color-neutral-600)", marginLeft: "auto" }}>
                {g.items.length} ITEM{g.items.length === 1 ? "" : "S"}
                {inBasket > 0 ? ` · ${inBasket} IN BASKET` : ""}
              </span>
            </button>
            {isOpen &&
              g.items.map((item) => (
                <div key={item.id}>
                <div style={{ display: "flex", gap: 11, alignItems: "center", padding: "10px 0", borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)" }}>
                  <button
                    type="button"
                    onClick={() => startTransition(() => toggleBuyItemAction(item.id, !item.checked))}
                    style={{
                      width: 24,
                      height: 24,
                      flex: "none",
                      cursor: "pointer",
                      padding: 0,
                      borderRadius: 999,
                      border: `1.5px solid ${item.checked ? "var(--color-accent)" : "var(--color-divider)"}`,
                      background: item.checked ? "var(--color-accent)" : "transparent",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#fff",
                      fontSize: 14,
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
                    {/* Name and quantity are one target: tapping the amount
                        is how anyone would expect to change the amount, and
                        it used to be dead text beside the button. */}
                    <span style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</span>
                      <span style={{ fontFamily: "var(--font-numeric)", fontSize: 13, color: "var(--color-neutral-600)", flex: "none" }}>
                        {formatQuantity(item.quantity, item.unit)}
                      </span>
                    </span>
                  </button>
                  {/* What this line is expected to come to. Tapping it sets a
                      price for today only, without changing the price book —
                      in an editor that opens under the row, where there is
                      room for it. */}
                  <span style={{ flex: "none" }}>
                    <BuyItemPriceButton
                      estimated={prices[item.id]?.estimated ?? null}
                      source={prices[item.id]?.source ?? "unknown"}
                      editing={pricing === item.id}
                      onToggle={() => setPricing(pricing === item.id ? null : item.id)}
                    />
                  </span>
                  {prices[item.id]?.inPantry ? (
                    <Tag variant="accent">at home</Tag>
                  ) : (
                    <Tag variant={item.source === "meal_plan" ? "accent" : item.source === "maintenance" ? "outline" : "neutral"}>
                      {SOURCE_LABEL[item.source] ?? item.source}
                    </Tag>
                  )}
                </div>
                {pricing === item.id && (
                  <BuyItemPriceEditor itemId={item.id} unitPrice={prices[item.id]?.unitPrice ?? null} onClose={() => setPricing(null)} />
                )}
                {editing === item.id && <EditItemRow item={item} onClose={() => setEditing(null)} />}
                </div>
              ))}
          </div>
        );
      })}

      {/* Adding is one tap away, not four fields permanently in the way. The
          panel stays open after each item, because a list is usually written
          several things at a time. */}
      {!adding ? (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="btn btn-secondary"
          style={{ width: "100%", minHeight: 44, fontSize: 14.5, gap: 6, marginTop: 10 }}
        >
          <Icon name="plus" size={16} />
          Add an item
        </button>
      ) : (
        <form action={addAction} style={{ marginTop: 10, padding: 12, borderRadius: 14, background: "color-mix(in srgb, var(--color-text) 4%, transparent)" }}>
          <input type="hidden" name="source" value="house" />
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input
              className="input"
              name="name"
              placeholder="Add an item"
              required
              autoFocus
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
            <button
              type="button"
              className="btn btn-ghost"
              style={{ minHeight: 42, fontSize: 13, paddingInline: 10 }}
              onClick={() => {
                setAdding(false);
                setNewName("");
              }}
            >
              Done
            </button>
          </div>
        </form>
      )}
      <ErrorText message={addState.error} />
      <div style={{ fontSize: 13, color: "var(--color-neutral-600)", marginTop: 10 }}>
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
        <button type="button" className="btn btn-primary" disabled={pending} style={{ minHeight: 40, fontSize: 13, paddingInline: 14 }} onClick={save}>
          {pending ? "…" : "SAVE"}
        </button>
        <button type="button" className="btn btn-secondary" style={{ minHeight: 40, fontSize: 13, paddingInline: 12 }} onClick={onClose}>
          CANCEL
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={pending}
          style={{ minHeight: 40, fontSize: 13, paddingInline: 12, color: "var(--color-accent-700)", borderColor: "var(--color-accent-700)" }}
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
  suggested,
  onClose,
}: {
  familyId: string;
  doneCount: number;
  accounts: PickableAccount[];
  currency: string;
  /** What the basket was estimated at — the till usually agrees closely
   * enough that this is the right number to start from. */
  suggested: number;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState(Math.round(suggested * 100) / 100);
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
      // The basket is empty now, so the till closes with it.
      onClose();
      router.refresh();
    });
  }

  return (
    <Blueprint className="bg-[var(--color-accent-100)]" style={{ padding: "12px 13px", marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 13.5, flex: 1, minWidth: 0 }}>
          {doneCount} item{doneCount === 1 ? "" : "s"} in the basket — what did the shop come to?
        </span>
        <button type="button" className="btn btn-ghost" style={{ minHeight: 28, fontSize: 12.5, padding: "0 6px" }} onClick={onClose}>
          Not yet
        </button>
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
          style={{ flex: 1, minHeight: 38, fontSize: 13, letterSpacing: ".04em" }}
          disabled={pending}
          onClick={() => finish(true)}
        >
          {pending ? "…" : amount > 0 ? "CLEAR & LOG SPEND" : "CLEAR CHECKED"}
        </button>
        {amount > 0 && (
          <button type="button" className="btn btn-secondary" style={{ flex: "none", minHeight: 38, fontSize: 13 }} disabled={pending} onClick={() => finish(false)}>
            CLEAR ONLY
          </button>
        )}
      </div>
    </Blueprint>
  );
}
