"use client";

import { useActionState, useId, useOptimistic, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addBuyItemAction, toggleBuyItemAction, clearCheckedAction, updateBuyItemAction, removeBuyItemAction } from "@/lib/actions/household";
import { postHubExpenseAction } from "@/lib/actions/wealth";
import { MARKET_SECTIONS, UNITS, guessSection, formatQuantity, groupByAisle } from "@/lib/grocery";
import { BuyItemPriceButton, BuyItemPriceEditor } from "@/components/household-price-controls";
import type { ActionState } from "@/lib/actions/auth";
import { SubmitButton, ErrorText } from "@/components/form";
import { Blueprint } from "@/components/ui";
import { Icon } from "@/components/icons";
import { ShoppingDayControl } from "@/components/shopping-day";
import { formatCurrency } from "@/lib/format";
import { confirm } from "@/components/confirm-sheet";
import type { PickableAccount } from "@/components/money-actions";
import type { Tables } from "@/lib/database.types";
import { mealDayLabel } from "@/lib/meal-shopping";
import { isNetworkFailure, isOffline, newOpId, queueOffline, useQueue } from "@/lib/offline/live";

const initialState: ActionState = { error: null };

type ListOrder = "aisle" | "added" | "event";
const ORDER_KEY = "kin.buy-list.order";
// Kept here too, so the toggle still works where storage is blocked (a
// private window); it is just not remembered there.
let orderNow: ListOrder = "aisle";
const orderListeners = new Set<() => void>();
function readOrder(): ListOrder {
  try {
    const saved = localStorage.getItem(ORDER_KEY);
    if (saved === "aisle" || saved === "added" || saved === "event") orderNow = saved;
  } catch {}
  return orderNow;
}
function subscribeOrder(onChange: () => void) {
  orderListeners.add(onChange);
  return () => {
    orderListeners.delete(onChange);
  };
}
function chooseOrder(next: ListOrder) {
  orderNow = next;
  try {
    localStorage.setItem(ORDER_KEY, next);
  } catch {}
  orderListeners.forEach((f) => f());
}

type BuyGroup = { name: string; items: Tables<"buy_items">[]; openCount: number };
/** A group as shown: an aisle, the whole list, or an event (title and day apart). */
type ShownGroup = { name: string; items: Tables<"buy_items">[]; event?: { title: string; when: string } };
/** An event a line can be for, at its next date (YYYY-MM-DD). */
type ListEvent = { id: string; title: string; date: string };

/** "Robin turns 8 · Sat 24 Oct". Built from the date's own parts, so the
 * server and the phone print the same day whatever zone each is in. */
function eventLabel(e: ListEvent): string {
  const [y, m, d] = e.date.split("-").map(Number);
  const day = new Date(y, m - 1, d).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  return `${e.title} · ${day}`;
}

/** "Fri 16 Oct", with the year once it is not this year's ("Fri 22 Jan 2027"). */
function eventWhen(e: ListEvent): string {
  const [y, m, d] = e.date.split("-").map(Number);
  const sameYear = y === new Date().getFullYear();
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) }).replace(",", "");
}

export function BuyList({
  groups,
  openCount,
  doneCount,
  accounts,
  currency,
  prices,
  mealsFor = {},
  events = [],
  unpriced,
  trip,
  pricesSlot,
  startAdding = false,
}: {
  groups: BuyGroup[];
  openCount: number;
  doneCount: number;
  accounts: PickableAccount[];
  currency: string;
  /** What each line is expected to cost, keyed by item id. */
  prices: Record<string, { estimated: number | null; unitPrice: number | null; source: string; inPantry: boolean }>;
  /** Which planned meals each line is for, by item id. */
  mealsFor?: Record<string, { dish: string; date: string }[]>;
  /** The events a line can be for, soonest first. */
  events?: ListEvent[];
  /** How many lines Kin has no price for, so the total can say so. */
  unpriced: number;
  /** Open with the add box already out -- Today's "To buy" quick add. */
  startAdding?: boolean;
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
  const [optimisticChecked, setOptimisticChecked] = useOptimistic(
    new Map<string, boolean>(),
    (prev, [id, value]: [string, boolean]) => new Map(prev).set(id, value),
  );
  const [newName, setNewName] = useState("");
  const [sectionTouched, setSectionTouched] = useState(false);
  const [sectionChoice, setSectionChoice] = useState<string>("Other");
  const [eventChoice, setEventChoice] = useState("");
  // Ticks and adds made offline wait in the queue (lib/offline/live) and are
  // shown from it until the replay settles them.
  const queue = useQueue();
  const queuedTicks = new Map(queue.flatMap((q) => (q.kind === "buy.toggle" ? [[q.itemId, q.checked] as const] : [])));
  const queuedAdds = queue.flatMap((q) => (q.kind === "buy.add" ? [q] : []));
  const [queueError, setQueueError] = useState<string | null>(null);
  const isChecked = (item: { id: string; checked: boolean }) => optimisticChecked.get(item.id) ?? queuedTicks.get(item.id) ?? item.checked;
  const tick = async (item: { id: string; name: string; checked: boolean }) => {
    const checked = !isChecked(item);
    const later = async () => {
      const why = await queueOffline({ id: newOpId(), at: new Date().toISOString(), kind: "buy.toggle", itemId: item.id, checked, label: item.name });
      setQueueError(why);
    };
    setQueueError(null);
    if (isOffline()) return later();
    // Ticked on screen the moment the thumb lands; the server's answer
    // replaces it when it comes back.
    setOptimisticChecked([item.id, checked]);
    try {
      await toggleBuyItemAction(item.id, checked);
    } catch (e) {
      if (isNetworkFailure(e)) await later();
      else setQueueError("That tick didn't save. Try again.");
    }
  };
  const [addState, addAction] = useActionState(async (prev: ActionState, form: FormData): Promise<ActionState> => {
    const later = async (): Promise<ActionState> => {
      const name = String(form.get("name") ?? "").trim();
      if (!name) return { error: null };
      const why = await queueOffline({
        id: newOpId(),
        at: new Date().toISOString(),
        kind: "buy.add",
        name,
        label: name,
        quantity: String(form.get("quantity") ?? ""),
        unit: String(form.get("unit") ?? ""),
        section: String(form.get("section") ?? ""),
        ...(form.get("event_id") ? { eventId: String(form.get("event_id")) } : {}),
      });
      if (!why) {
        setNewName("");
        setSectionTouched(false);
      }
      return { error: why };
    };
    if (isOffline()) return later();
    try {
      const r = await addBuyItemAction(prev, form);
      if (!r.error) {
        setNewName("");
        setSectionTouched(false);
      }
      return r;
    } catch (e) {
      if (isNetworkFailure(e)) return later();
      return { error: "That item didn't save. Try again." };
    }
  }, initialState);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(startAdding);
  // Walked aisle by aisle, or read in the order things were added. Starts by
  // aisle -- which is also what the server draws -- and the choice is
  // remembered on this phone only.
  const order = useSyncExternalStore(subscribeOrder, readOrder, () => "aisle" as ListOrder);

  // What the basket comes to, and what the whole list would. Both are
  // estimates built from the price book, so a line Kin cannot price is
  // counted as an item but not as money — and says so.
  const allItems = groups.flatMap((g) => g.items);
  const estimateOf = (id: string) => prices[id]?.estimated ?? 0;
  const basketTotal = allItems.filter((i) => i.checked).reduce((sum, i) => sum + estimateOf(i.id), 0);
  const listTotal = allItems.reduce((sum, i) => sum + estimateOf(i.id), 0);
  const eventById = new Map(events.map((e) => [e.id, e]));
  const eventOf = (item: { event_id: string | null }) => (item.event_id ? eventById.get(item.event_id) ?? null : null);
  // By event: each event with something on the list, soonest first, each
  // still walked by aisle. Only what is for an event -- the everyday items
  // are in By aisle, and listing them here as "Not for an event" read as an
  // event of its own (Janine, 12 October).
  const byEvent = (): ShownGroup[] =>
    [...events]
      .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title))
      .map((e) => ({
        name: eventLabel(e),
        event: { title: e.title, when: eventWhen(e) },
        items: groupByAisle(allItems.filter((i) => eventOf(i)?.id === e.id)).flatMap((g) => g.items),
      }))
      .filter((g) => g.items.length > 0);
  const shown: ShownGroup[] =
    order === "aisle"
      ? groupByAisle(allItems)
      : order === "event"
        ? byEvent()
        : allItems.length > 0
          ? [{ name: "In the order added", items: [...allItems].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id)) }]
          : [];
  // Grouping by event is only worth offering once there is an event to group under.
  const canGroupByEvent = events.length > 0 || allItems.some((i) => i.event_id);

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
      <Blueprint style={{ padding: "0.875rem", marginBottom: "0.875rem" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem" }}>
          <span style={{ fontSize: "0.75rem", letterSpacing: ".04em", textTransform: "uppercase", color: "var(--color-neutral-600)" }}>
            This list
          </span>
          <span style={{ marginLeft: "auto", font: "600 1.5rem/1 var(--font-heading)" }}>{formatCurrency(listTotal, currency)}</span>
        </div>

        {/* How far round the shop you are: the filled part is in the basket. */}
        <div style={{ height: 7, borderRadius: 999, overflow: "hidden", background: "color-mix(in srgb, var(--color-text) 9%, transparent)", margin: "9px 0 7px" }}>
          <div style={{ height: "100%", width: `${listTotal > 0 ? Math.min(100, (basketTotal / listTotal) * 100) : 0}%`, background: "var(--color-switch-on)" }} />
        </div>

        <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem", fontSize: "0.8125rem" }}>
          <span>
            <strong style={{ fontWeight: 600 }}>{formatCurrency(basketTotal, currency)}</strong>
            <span style={{ color: "var(--color-neutral-700)" }}> in the basket · {doneCount} of {doneCount + openCount}</span>
          </span>
          <span style={{ marginLeft: "auto", color: "var(--color-neutral-700)" }}>
            {formatCurrency(listTotal - basketTotal, currency)} still to buy
          </span>
        </div>

        {unpriced > 0 && (
          <div style={{ fontSize: "0.75rem", color: "var(--color-neutral-700)", marginTop: "0.375rem" }}>
            {unpriced === 1 ? "One item has no price yet" : `${unpriced} items have no price yet`} — the totals leave them out.
          </div>
        )}

        {/* The day, its budget, and the two things you might do about it. */}
        <div style={{ paddingTop: "0.625rem", marginTop: "0.625rem", borderTop: "1px solid var(--color-divider)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.4375rem", fontSize: "0.84375rem" }}>
            <Icon name="basket" size={15} style={{ color: trip ? "var(--cal-schedule)" : "var(--color-neutral-600)", flex: "none" }} />
            <span style={{ flex: 1, minWidth: 0, color: trip ? "var(--color-text)" : "var(--color-neutral-700)" }}>
              {trip ? `${trip.title} · ${trip.when}` : "No shopping day yet"}
            </span>
            {trip &&
              (trip.budget != null ? (
                <span style={{ fontSize: "0.78125rem", flex: "none", color: listTotal > trip.budget ? "var(--cal-money)" : "var(--color-neutral-700)" }}>
                  {listTotal > trip.budget
                    ? `${formatCurrency(listTotal - trip.budget, currency)} over budget`
                    : `${formatCurrency(trip.budget - listTotal, currency)} under`}
                </span>
              ) : (
                // Still said, just not in a paragraph of its own: the budget
                // field is inside Change the day, one tap below.
                <span style={{ fontSize: "0.78125rem", flex: "none", color: "var(--color-neutral-600)" }}>no budget</span>
              ))}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.125rem" }}>
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
            style={{ width: "100%", minHeight: "2.5rem", fontSize: "0.84375rem", letterSpacing: ".04em", marginTop: "0.6875rem" }}
            onClick={() => setCheckingOut(true)}
          >
            Check out {doneCount} item{doneCount === 1 ? "" : "s"}
          </button>
        )}
      </Blueprint>

      {checkingOut && (
        <ClearCheckedPanel
          doneCount={doneCount}
          accounts={accounts}
          currency={currency}
          suggested={basketTotal}
          onClose={() => setCheckingOut(false)}
        />
      )}

      {allItems.length > 0 && (
        <div role="group" aria-label="Order the list" style={{ display: "flex", gap: "0.375rem", marginBottom: "0.875rem" }}>
          <button type="button" className="chip" data-active={order === "aisle"} aria-pressed={order === "aisle"} onClick={() => chooseOrder("aisle")}>
            By aisle
          </button>
          {canGroupByEvent && (
            <button type="button" className="chip" data-active={order === "event"} aria-pressed={order === "event"} onClick={() => chooseOrder("event")}>
              By event
            </button>
          )}
          <button type="button" className="chip" data-active={order === "added"} aria-pressed={order === "added"} onClick={() => chooseOrder("added")}>
            As added
          </button>
        </div>
      )}

      {shown.map((g) => {
        // One long list has nothing to fold away, so it is always open. Aisles
        // start closed; events start open (a party's list is read as a whole),
        // so for them the set holds the ones folded away.
        const isOpen = order === "added" || (order === "event" ? !expanded.has(`event:${g.name}`) : expanded.has(g.name));
        const toggleKey = order === "event" ? `event:${g.name}` : g.name;
        const inBasket = g.items.filter((i) => i.checked).length;
        // What an event's shopping comes to, from the same estimates as the
        // card above; lines with no price are counted, not guessed.
        const groupTotal = g.items.reduce((sum, i) => sum + estimateOf(i.id), 0);
        const groupUnpriced = g.items.filter((i) => prices[i.id]?.estimated == null).length;
        return (
          <div key={g.name} style={{ marginBottom: "1.125rem" }}>
            {/* One header for every grouping: its name and total on one
                line, then (an event's day ·) how many lines and how many are
                in the basket -- the By event header Jonathan preferred (12
                October), used by all three. */}
            <button
              type="button"
              onClick={() =>
                setExpanded((prev) => {
                  const next = new Set(prev);
                  if (next.has(toggleKey)) next.delete(toggleKey);
                  else next.add(toggleKey);
                  return next;
                })
              }
              aria-expanded={isOpen}
              style={{
                width: "100%",
                cursor: "pointer",
                background: "none",
                border: 0,
                borderBottom: "1px solid var(--color-divider)",
                padding: "0.5rem 0 0.625rem",
                display: "flex",
                alignItems: "flex-start",
                gap: "0.5rem",
                textAlign: "left",
                color: "inherit",
              }}
            >
              <Icon
                name="chevronLeft"
                size={12}
                className="text-[var(--color-neutral-600)]"
                style={{ flex: "none", marginTop: "0.3125rem", transform: isOpen ? "rotate(270deg)" : "rotate(180deg)", transition: "transform 160ms ease-out" }}
              />
              <span style={{ flex: 1, minWidth: 0, display: "grid", gap: "0.25rem" }}>
                <span style={{ font: "600 0.9375rem/1.3 var(--font-heading)", overflowWrap: "anywhere" }}>{g.event ? g.event.title : g.name}</span>
                <span style={{ font: "400 0.75rem/1.3 var(--font-numeric)", color: "var(--color-neutral-600)" }}>
                  {g.event ? `${g.event.when} · ` : ""}
                  {g.items.length} item{g.items.length === 1 ? "" : "s"}
                  {inBasket > 0 ? (inBasket === g.items.length ? " · all in the basket" : ` · ${inBasket} in the basket`) : ""}
                  {groupUnpriced > 0 && groupUnpriced < g.items.length ? ` · ${groupUnpriced} not priced` : ""}
                </span>
              </span>
              {groupUnpriced === g.items.length ? (
                <span style={{ flex: "none", font: "400 0.8125rem/1.3 var(--font-body)", color: "var(--color-neutral-600)", whiteSpace: "nowrap" }}>No price yet</span>
              ) : (
                <strong style={{ flex: "none", font: "600 0.9375rem/1.3 var(--font-numeric)", whiteSpace: "nowrap" }}>{formatCurrency(groupTotal, currency)}</strong>
              )}
            </button>
            {isOpen &&
              g.items.map((item) => (
                <div key={item.id}>
                {/* Every grouping draws a line the same way: tick, name with
                    what it is for under it, then quantity and price in columns
                    of their own so they line up down the list. Where a line
                    came from is said once in its group's header. */}
                <div
                  className="kin-buy-row"
                  data-checked={isChecked(item)}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1.5rem minmax(0, 1fr) auto 4.25rem",
                    columnGap: "0.6875rem",
                    alignItems: "center",
                    padding: "0.625rem 0",
                    borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)",
                  }}
                >
                  <button
                    type="button"
                    aria-label={item.name}
                    aria-pressed={isChecked(item)}
                    className="kin-tick"
                    onClick={() => startTransition(() => tick(item))}
                    style={{
                      width: "1.5rem",
                      height: "1.5rem",
                      flex: "none",
                      cursor: "pointer",
                      padding: 0,
                      borderRadius: 999,
                      border: `1.5px solid ${isChecked(item) ? "var(--color-accent)" : "var(--color-divider)"}`,
                      background: isChecked(item) ? "var(--color-accent)" : "transparent",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#fff",
                      fontSize: "0.875rem",
                    }}
                  >
                    {isChecked(item) ? "✓" : ""}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(editing === item.id ? null : item.id)}
                    style={{
                      minWidth: 0,
                      textAlign: "left",
                      background: "none",
                      border: 0,
                      padding: 0,
                      cursor: "pointer",
                      fontSize: "0.875rem",
                      color: isChecked(item) ? "var(--color-neutral-500)" : "var(--color-text)",
                      transition: "color 220ms var(--ease-out)",
                    }}
                  >
                    <span className="kin-strike" data-on={isChecked(item)} style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</span>
                    {/* The meals this line is for, so nobody wonders why there
                        is a kilo of beef shank on the list. */}
                    {mealsFor[item.id]?.length ? (
                      <span style={{ display: "block", marginTop: "0.125rem", fontSize: "0.71875rem", color: "var(--color-neutral-600)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        For {mealsFor[item.id].map((m) => `${m.dish} (${mealDayLabel(m.date)})`).join(", ")}
                      </span>
                    ) : null}
                    {/* The event it is for -- said on the line except when the
                        list is already grouped under it. */}
                    {order !== "event" && eventOf(item) ? (
                      <span style={{ display: "flex", alignItems: "center", gap: "0.25rem", marginTop: "0.125rem", fontSize: "0.71875rem", color: "var(--color-neutral-600)", overflow: "hidden", whiteSpace: "nowrap" }}>
                        <Icon name="calendarDays" size={11} style={{ flex: "none" }} />
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>For {eventLabel(eventOf(item)!)}</span>
                      </span>
                    ) : null}
                    {prices[item.id]?.inPantry ? (
                      <span style={{ display: "block", marginTop: "0.125rem", fontSize: "0.71875rem", fontWeight: 600, color: "var(--color-accent)" }}>Already at home</span>
                    ) : null}
                  </button>
                  {/* Tapping the amount is how anyone would expect to change
                      the amount, so it opens the same editor as the name. */}
                  <button
                    type="button"
                    onClick={() => setEditing(editing === item.id ? null : item.id)}
                    aria-label={`Change the amount of ${item.name}`}
                    style={{ background: "none", border: 0, padding: "0.375rem 0", cursor: "pointer", fontFamily: "var(--font-numeric)", fontSize: "0.8125rem", color: "var(--color-neutral-600)", textAlign: "right", whiteSpace: "nowrap" }}
                  >
                    {formatQuantity(item.quantity, item.unit)}
                  </button>
                  {/* What this line is expected to come to. Tapping it sets a
                      price for today only, without changing the price book —
                      in an editor that opens under the row, where there is
                      room for it. */}
                  {/* The button's padding pulled in, so the figure sits flush
                      under its group's total. */}
                  <span style={{ justifySelf: "end", marginRight: "-0.5rem" }}>
                    <BuyItemPriceButton
                      estimated={prices[item.id]?.estimated ?? null}
                      source={prices[item.id]?.source ?? "unknown"}
                      editing={pricing === item.id}
                      onToggle={() => setPricing(pricing === item.id ? null : item.id)}
                    />
                  </span>
                </div>
                {pricing === item.id && (
                  <BuyItemPriceEditor itemId={item.id} unitPrice={prices[item.id]?.unitPrice ?? null} onClose={() => setPricing(null)} />
                )}
                {editing === item.id && <EditItemRow item={item} events={events} onClose={() => setEditing(null)} />}
                </div>
              ))}
          </div>
        );
      })}

      {order === "event" && shown.length === 0 && allItems.length > 0 && (
        <p style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)", margin: "0 0 1.125rem" }}>
          Nothing on the list is for an event yet. Pick one under &ldquo;For an event&rdquo; when adding an item, or tap an item to set it.
        </p>
      )}

      {queuedAdds.length > 0 && (
        <div style={{ marginBottom: "1.125rem" }}>
          <div style={{ font: "600 0.8125rem/1 var(--font-heading)", letterSpacing: ".02em", textTransform: "uppercase", borderBottom: "1px solid var(--color-divider)", padding: "0 0 0.375rem", display: "flex", gap: "0.375rem", alignItems: "center" }}>
            <Icon name="clock" size={13} />
            Waiting to add
          </div>
          {queuedAdds.map((q) => (
            <div key={q.id} style={{ display: "flex", gap: "0.5rem", alignItems: "baseline", padding: "0.625rem 0", fontSize: "0.875rem", borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)" }}>
              <span style={{ flex: 1, minWidth: 0 }}>{q.name}</span>
              <span style={{ fontSize: "0.75rem", color: "var(--color-neutral-600)" }}>sends when you&rsquo;re back online</span>
            </div>
          ))}
        </div>
      )}
      <ErrorText message={queueError} />

      {/* Adding is one tap away, not four fields permanently in the way. The
          panel stays open after each item, because a list is usually written
          several things at a time. */}
      {!adding ? (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="btn btn-secondary"
          style={{ width: "100%", minHeight: "2.75rem", fontSize: "0.90625rem", gap: "0.375rem", marginTop: "0.625rem" }}
        >
          <Icon name="plus" size={16} />
          Add an item
        </button>
      ) : (
        <form action={addAction} style={{ marginTop: "0.625rem", padding: "0.75rem", borderRadius: 14, background: "color-mix(in srgb, var(--color-text) 4%, transparent)" }}>
          <input type="hidden" name="source" value="house" />
          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
            <input aria-label="Item to buy"
              className="input"
              name="name"
              placeholder="Add an item"
              required
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={150}
              style={{ minHeight: "2.625rem", flex: 1 }}
            />
            <input aria-label="Quantity" className="input" name="quantity" type="number" step="0.01" min="0" placeholder="Qty" style={{ minHeight: "2.625rem", width: 68 }} />
            <select aria-label="Unit" className="input" name="unit" defaultValue="pc" style={{ minHeight: "2.625rem", width: 82 }}>
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
          {/* Which event it is for, if any -- its own row, since event names
              are long. Kept between adds, for writing a party's list in one go. */}
          {events.length > 0 && (
            <select aria-label="For an event" className="input" name="event_id" value={eventChoice} onChange={(e) => setEventChoice(e.target.value)} style={{ minHeight: "2.625rem", width: "100%", marginBottom: "0.5rem" }}>
              <option value="">Not for an event</option>
              {events.map((e) => (
                <option key={e.id} value={e.id}>
                  For {eventLabel(e)}
                </option>
              ))}
            </select>
          )}
          <div style={{ display: "flex", gap: "0.5rem" }}>
            {/* Pre-filled from the name as it's typed, so the common case is one tap. */}
            <select aria-label="Market section" className="input" name="section" value={section} onChange={(e) => setSection(e.target.value)} style={{ minHeight: "2.625rem", flex: 1 }}>
              {MARKET_SECTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <SubmitButton className="btn btn-primary" style={{ minHeight: "2.625rem", paddingInline: "1.125rem" }}>
              ADD
            </SubmitButton>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ minHeight: "2.625rem", fontSize: "0.8125rem", paddingInline: "0.625rem" }}
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
      <div style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)", marginTop: "0.625rem" }}>
        Sections follow the order you walk the market. Items from the meal plan are filed by name automatically — tap any item to fix its
        quantity, section or the event it is for. Ticked items stay until cleared.
      </div>
    </>
  );
}

/** Tapping an item opens this — fix the quantity, the unit, or which section
 * it was filed under when it came off a meal plan. */
function EditItemRow({ item, events, onClose }: { item: Tables<"buy_items">; events: ListEvent[]; onClose: () => void }) {
  const [name, setName] = useState(item.name);
  const [quantity, setQuantity] = useState(item.quantity === null ? "" : String(item.quantity));
  const [unit, setUnit] = useState(item.unit ?? "pc");
  const [section, setSection] = useState(item.section);
  const [eventId, setEventId] = useState(item.event_id ?? "");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function save() {
    startTransition(async () => {
      await updateBuyItemAction(item.id, {
        name,
        quantity: quantity.trim() ? Number(quantity) : null,
        unit: unit || null,
        section,
        // Sent only when it changed, so an ordinary edit never touches it.
        ...(eventId !== (item.event_id ?? "") ? { eventId: eventId || null } : {}),
      });
      onClose();
      router.refresh();
    });
  }

  return (
    <div style={{ padding: "0.625rem 0 0.75rem", borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)" }}>
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
        <input aria-label="Item name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={150} style={{ minHeight: "2.5rem", flex: 1 }} />
        <input aria-label="Quantity"
          className="input"
          type="number"
          step="0.01"
          min="0"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          placeholder="Qty"
          style={{ minHeight: "2.5rem", width: 68 }}
        />
        <select aria-label="Unit" className="input" value={unit} onChange={(e) => setUnit(e.target.value)} style={{ minHeight: "2.5rem", width: 82 }}>
          {UNITS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      </div>
      {(events.length > 0 || item.event_id) && (
        <select aria-label="For an event" className="input" value={eventId} onChange={(e) => setEventId(e.target.value)} style={{ minHeight: "2.5rem", width: "100%", marginBottom: "0.5rem" }}>
          <option value="">Not for an event</option>
          {events.map((e) => (
            <option key={e.id} value={e.id}>
              For {eventLabel(e)}
            </option>
          ))}
        </select>
      )}
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <select aria-label="Market section" className="input" value={section} onChange={(e) => setSection(e.target.value)} style={{ minHeight: "2.5rem", flex: 1 }}>
          {MARKET_SECTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button type="button" className="btn btn-primary" disabled={pending} style={{ minHeight: "2.5rem", fontSize: "0.8125rem", paddingInline: "0.875rem" }} onClick={save}>
          {pending ? "…" : "Save"}
        </button>
        <button type="button" className="btn btn-secondary" style={{ minHeight: "2.5rem", fontSize: "0.8125rem", paddingInline: "0.75rem" }} onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={pending}
          style={{ minHeight: "2.5rem", fontSize: "0.8125rem", paddingInline: "0.75rem", color: "var(--color-accent-700)", borderColor: "var(--color-accent-700)" }}
          onClick={async () => {
            if (!(await confirm(`Remove "${item.name}" from the list?`))) return;
            startTransition(async () => {
              await removeBuyItemAction(item.id);
              onClose();
              router.refresh();
            });
          }}
        >
          Remove
        </button>
      </div>
    </div>
  );
}

/** Clearing the trolley is the moment the shop actually cost something, so
 * that's where the spend is captured and taken out of a real account. */
function ClearCheckedPanel({
  doneCount,
  accounts,
  currency,
  suggested,
  onClose,
}: {
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
  const uid = useId();

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
      await clearCheckedAction();
      // The basket is empty now, so the till closes with it.
      onClose();
      router.refresh();
    });
  }

  return (
    <Blueprint className="bg-[var(--color-accent-100)]" style={{ padding: "0.75rem 0.8125rem", marginBottom: "1rem" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem", marginBottom: "0.625rem" }}>
        <span style={{ fontSize: "0.84375rem", flex: 1, minWidth: 0 }}>
          {doneCount} item{doneCount === 1 ? "" : "s"} in the basket — what did the shop come to?
        </span>
        <button type="button" className="btn btn-ghost" style={{ minHeight: "1.75rem", fontSize: "0.78125rem", padding: "0 0.375rem" }} onClick={onClose}>
          Not yet
        </button>
      </div>
      {accounts.length > 0 && (
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.625rem" }}>
          <div className="field" style={{ flex: 1, margin: 0 }}>
            <label htmlFor={`${uid}-account`}>Paid from</label>
            <select id={`${uid}-account`} aria-label="Paid From" className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)} style={{ minHeight: "2.5rem" }}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {formatCurrency(a.balance, currency)}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ width: 106, margin: 0 }}>
            <label htmlFor={`${uid}-total`}>Total</label>
            <input id={`${uid}-total`} aria-label="Total" className="input" type="number" step="0.01" value={amount} onChange={(e) => setAmount(Number(e.target.value))} style={{ minHeight: "2.5rem" }} />
          </div>
        </div>
      )}
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button
          type="button"
          className="btn btn-primary"
          style={{ flex: 1, minHeight: "2.375rem", fontSize: "0.8125rem", letterSpacing: ".04em" }}
          disabled={pending}
          onClick={() => finish(true)}
        >
          {pending ? "…" : amount > 0 ? "Clear & log spend" : "Clear checked"}
        </button>
        {amount > 0 && (
          <button type="button" className="btn btn-secondary" style={{ flex: "none", minHeight: "2.375rem", fontSize: "0.8125rem" }} disabled={pending} onClick={() => finish(false)}>
            Clear only
          </button>
        )}
      </div>
    </Blueprint>
  );
}
