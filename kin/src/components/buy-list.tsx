"use client";

import { useActionState, useId, useOptimistic, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useBuyListLive } from "@/lib/buy-list-live";
import {
  addBuyItemAction,
  toggleBuyItemAction,
  clearCheckedAction,
  updateBuyItemAction,
  removeBuyItemAction,
  setBuyItemActualAction,
  setItemPriceAction,
  removeBuyTripAction,
} from "@/lib/actions/household";
import type { RecentTrip } from "@/lib/queries/household";
import { budgetSummary, differsFromBook, lineActual, lineBudget, lineSavings, parseAmount, type BudgetLine } from "@/lib/buy-budget";
import { postHubExpenseAction } from "@/lib/actions/wealth";
import {
  MARKET_SECTIONS,
  UNITS,
  STORE_KINDS,
  STORE_KIND_LABEL,
  guessSection,
  guessStoreKind,
  storeKindOf,
  formatQuantity,
  groupByAisle,
  groupByStoreKind,
  groupWithinStoreKind,
  storeNameSuggestions,
  isStoreKind,
  type StoreKind,
} from "@/lib/grocery";
import { BuyItemPriceButton, BuyItemPriceEditor } from "@/components/household-price-controls";
import type { ActionState } from "@/lib/actions/auth";
import { SubmitButton, ErrorText } from "@/components/form";
import { Blueprint } from "@/components/ui";
import { Icon } from "@/components/icons";
import { FormSheet } from "@/components/form-sheet";
import { ShoppingDayControl } from "@/components/shopping-day";
import { CheckoutCards, LoyaltyCardsButton } from "@/components/loyalty-cards";
import type { LoyaltyCard } from "@/lib/loyalty-cards";
import { formatCurrency } from "@/lib/format";
import { deleteWithUndo, useHiddenRows } from "@/lib/undo-delete";
import type { PickableAccount } from "@/components/money-actions";
import { AccountOptions } from "@/components/account-options";
import type { Tables } from "@/lib/database.types";
import { mealDayLabel } from "@/lib/meal-shopping";
import { failedSaveMessage, isNetworkFailure, isOffline, newOpId, queueOffline, useQueue } from "@/lib/offline/live";

const initialState: ActionState = { error: null };

/** What the list is shopping for (23 October, Janine): everything, one kind
 * of store, or what is for an event. It replaced the By aisle / By event
 * chips; By aisle reads as All items now. */
type ListOrder = "all" | StoreKind | "event";
const ORDER_KEY = "kin.buy-list.shopping-for";
const OLD_ORDER_KEY = "kin.buy-list.order";
// Kept here too, so the picker still works where storage is blocked (a
// private window); it is just not remembered there.
let orderNow: ListOrder = "all";
const orderListeners = new Set<() => void>();
function readOrder(): ListOrder {
  try {
    const saved = localStorage.getItem(ORDER_KEY) ?? (localStorage.getItem(OLD_ORDER_KEY) === "event" ? "event" : null);
    if (saved === "all" || saved === "event" || isStoreKind(saved)) orderNow = saved;
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
type ShownGroup = { name: string; items: Tables<"buy_items">[]; event?: { title: string; when: EventDay } };
/** An event's day as its header shows it: "16" over "Oct" ("Jan '27" in another year). */
type EventDay = { day: string; month: string; full: string };
/** An event a line can be for, at its next date (YYYY-MM-DD). */
type ListEvent = { id: string; title: string; date: string };

/** "Robin turns 8 · Sat 24 Oct". Built from the date's own parts, so the
 * server and the phone print the same day whatever zone each is in. */
function eventLabel(e: ListEvent): string {
  const [y, m, d] = e.date.split("-").map(Number);
  const day = new Date(y, m - 1, d).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  return `${e.title} · ${day}`;
}

function eventWhen(e: ListEvent): EventDay {
  const [y, m, d] = e.date.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const month = date.toLocaleDateString("en-GB", { month: "short" });
  return {
    day: String(d),
    month: y === new Date().getFullYear() ? month : `${month} '${String(y).slice(2)}`,
    full: date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
  };
}

const SOURCE_LABEL: Record<string, string> = {
  meal_plan: "Meal plan",
  house: "House",
  maintenance: "Maintenance",
  member: "Member",
};

/** Where a group's lines came from, said once under its header instead of a
 * tag on every line: "House · Meal plan". */
function sourcesOf(items: Tables<"buy_items">[]): string {
  return [...new Set(items.map((i) => SOURCE_LABEL[i.source] ?? i.source))].join(" · ");
}

export function BuyList({
  familyId,
  groups,
  doneCount,
  accounts,
  currency,
  prices,
  mealsFor = {},
  events = [],
  trip,
  pricesSlot,
  cards = [],
  usedStores = [],
  trips = [],
  canEditCards = false,
  tripIsToday = false,
  startAdding = false,
}: {
  /** The household, for the list's live channel (lib/buy-list-live). */
  familyId: string;
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
  /** The household's suki and loyalty cards, for the counter. */
  cards?: LoyaltyCard[];
  /** The stores the household has named before, for the store box. */
  usedStores?: { store_kind: string | null; store_name: string | null }[];
  /** The week's checkouts, newest first. */
  trips?: RecentTrip[];
  /** Grown-ups add and change cards; everyone else shows them. */
  canEditCards?: boolean;
  /** The shopping day is today: the cards come out on the list itself. */
  tripIsToday?: boolean;
}) {
  // Which sections are open. Empty means all closed, which is how the list
  // starts: a shopping list is read one aisle at a time.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [checkingOut, setCheckingOut] = useState(false);
  // Which line's price is being set. One at a time, under its own row.
  const [pricing, setPricing] = useState<string | null>(null);
  // The line just ticked, whose "what did it cost" box is open under it.
  const [actualFor, setActualFor] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [optimisticChecked, setOptimisticChecked] = useOptimistic(
    new Map<string, boolean>(),
    (prev, [id, value]: [string, boolean]) => new Map(prev).set(id, value),
  );
  const [newName, setNewName] = useState("");
  const [sectionTouched, setSectionTouched] = useState(false);
  const [sectionChoice, setSectionChoice] = useState<string>("Other");
  const [eventChoice, setEventChoice] = useState("");
  // The kind of store follows the section until the member picks one; the
  // store's name is kept between adds, for writing one shop's list in a go.
  const [storeKindTouched, setStoreKindTouched] = useState(false);
  const [storeKindChoice, setStoreKindChoice] = useState<StoreKind>("grocery");
  const [storeName, setStoreName] = useState("");
  const storeListId = useId();
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
    // replaces it when it comes back. Ticking asks what it cost, every time
    // (Janine, 23 October); unticking closes the question.
    setOptimisticChecked([item.id, checked]);
    setActualFor(checked ? item.id : null);
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
        storeKind: String(form.get("store_kind") ?? ""),
        storeName: String(form.get("store_name") ?? ""),
        budget: String(form.get("budget") ?? ""),
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
  // Someone else's tick or add -- the helper's at the market included --
  // shows without reopening the page.
  useBuyListLive(familyId);
  // All items, one kind of store, or what is for an event. Starts on All
  // items -- which is also what the server draws -- and the choice is
  // remembered on this phone only.
  const order = useSyncExternalStore(subscribeOrder, readOrder, () => "all" as ListOrder);

  // What the basket comes to, and what the whole list would. Both are
  // estimates built from the price book, so a line Kin cannot price is
  // counted as an item but not as money — and says so.
  // Less any item just removed and still offering Undo (lib/undo-delete.ts),
  // so the totals drop with it.
  const hidden = useHiddenRows();
  const allItems = groups.flatMap((g) => g.items).filter((i) => !hidden.has(i.id));
  // A line's budget, what it cost and what it saved (lib/buy-budget.ts).
  const budgetLine = (i: Tables<"buy_items">): BudgetLine => ({
    checked: isChecked(i),
    budget: i.budget == null ? null : Number(i.budget),
    estimated: prices[i.id]?.estimated ?? null,
    actual: i.actual_cost == null ? null : Number(i.actual_cost),
  });
  // Checking out clears every ticked line, whichever store is showing, so
  // what it suggests paying is the whole basket.
  const whole = budgetSummary(allItems.map(budgetLine));
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
  // Grouping by event is only worth offering once there is an event to group under.
  const canGroupByEvent = events.length > 0 || allItems.some((i) => i.event_id);
  // "For an event" once nothing is for one falls back to All items, since
  // the picker no longer offers it to choose back out of.
  const view: ListOrder = order === "event" && !canGroupByEvent ? "all" : order;
  const shown: ShownGroup[] =
    view === "event" ? byEvent() : view === "all" ? groupByStoreKind(allItems) : groupWithinStoreKind(view, allItems);
  // The lines the card above counts: the ones showing.
  const viewItems = view === "all" ? allItems : view === "event" ? allItems.filter((i) => eventOf(i)) : allItems.filter((i) => storeKindOf(i) === view);
  const summary = budgetSummary(viewItems.map(budgetLine));
  const viewLabel = view === "all" ? "This list" : view === "event" ? "For events" : STORE_KIND_LABEL[view];
  const kindCount = (kind: StoreKind) => allItems.filter((i) => storeKindOf(i) === kind).length;
  // A store group's lines all share its name, so the line need not say it.
  const groupIsStore = (g: ShownGroup) => isStoreKind(view) && g.items.every((i) => i.store_name && i.store_name.toLowerCase() === g.name.toLowerCase());

  // The section follows what's being typed until the member overrides it.
  const section = sectionTouched ? sectionChoice : guessSection(newName);
  const setSection = (value: string) => {
    setSectionTouched(true);
    setSectionChoice(value);
  };
  // Adding while one store is showing files the line there; otherwise the
  // store follows the section.
  const storeKind: StoreKind = storeKindTouched ? storeKindChoice : isStoreKind(view) ? view : guessStoreKind(section);
  const setStoreKind = (value: StoreKind) => {
    if (value !== storeKind) setStoreName("");
    setStoreKindTouched(true);
    setStoreKindChoice(value);
  };
  const storeNames = storeNameSuggestions(usedStores, cards.map((c) => c.store), storeKind);

  return (
    <>
      {/* One card for the whole shop: what the list comes to, how much of it
          is already in the basket, what is still to buy, the day it is being
          bought on and the budget for it. They were two cards saying halves
          of the same thing. */}
      <Blueprint style={{ padding: "0.875rem", marginBottom: "0.875rem" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem" }}>
          <span style={{ fontSize: "0.75rem", letterSpacing: ".04em", textTransform: "uppercase", color: "var(--color-neutral-600)" }}>
            {viewLabel}
          </span>
          <span style={{ marginLeft: "auto", fontSize: "0.78125rem", color: "var(--color-neutral-700)" }}>
            {summary.bought} of {summary.lines} bought
          </span>
        </div>

        {/* Budget, what the bought lines cost, and what that saved -- the
            saving only over what is bought, so the unbought never reads as
            saved (Janine, 23 October). */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "0.5rem", marginTop: "0.5rem" }}>
          {[
            { label: "Budget", value: formatCurrency(summary.budget, currency), tone: "var(--color-text)" },
            { label: "Actual", value: formatCurrency(summary.actual, currency), tone: "var(--color-text)" },
            {
              label: summary.savings < 0 ? "Over" : "Savings",
              value: formatCurrency(Math.abs(summary.savings), currency),
              tone: summary.savings < 0 ? "var(--cal-money)" : summary.savings > 0 ? "var(--color-switch-on-ink)" : "var(--color-text)",
            },
          ].map((f) => (
            <div key={f.label} style={{ display: "grid", gap: "0.1875rem", minWidth: 0 }}>
              <span style={{ fontSize: "0.6875rem", letterSpacing: ".04em", textTransform: "uppercase", color: "var(--color-neutral-600)" }}>{f.label}</span>
              <span style={{ font: "600 1.0625rem/1.1 var(--font-numeric)", color: f.tone, overflowWrap: "anywhere" }}>{f.value}</span>
            </div>
          ))}
        </div>

        {/* How far round the shop you are: the filled part is bought. */}
        <div style={{ height: 7, borderRadius: 999, overflow: "hidden", background: "color-mix(in srgb, var(--color-text) 9%, transparent)", margin: "9px 0 7px" }}>
          <div style={{ height: "100%", width: `${summary.lines > 0 ? (summary.bought / summary.lines) * 100 : 0}%`, background: "var(--color-switch-on)" }} />
        </div>

        <div style={{ fontSize: "0.8125rem", color: "var(--color-neutral-700)" }}>{formatCurrency(summary.toBuy, currency)} still to buy</div>

        {summary.noBudget > 0 && (
          <div style={{ fontSize: "0.75rem", color: "var(--color-neutral-700)", marginTop: "0.375rem" }}>
            {summary.noBudget === 1 ? "One item has no budget or price yet" : `${summary.noBudget} items have no budget or price yet`} — the
            budget leaves them out.
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
                <span style={{ fontSize: "0.78125rem", flex: "none", color: whole.budget > trip.budget ? "var(--cal-money)" : "var(--color-neutral-700)" }}>
                  {whole.budget > trip.budget
                    ? `${formatCurrency(whole.budget - trip.budget, currency)} over budget`
                    : `${formatCurrency(trip.budget - whole.budget, currency)} under`}
                </span>
              ) : (
                // Still said, just not in a paragraph of its own: the budget
                // field is inside Change the day, one tap below.
                <span style={{ fontSize: "0.78125rem", flex: "none", color: "var(--color-neutral-600)" }}>no budget</span>
              ))}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.125rem" }}>
            <ShoppingDayControl run={trip} />
            <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "0.375rem" }}>
              <LoyaltyCardsButton cards={cards} tripTitle={trip?.title ?? null} canEdit={canEditCards} />
              {pricesSlot}
            </span>
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

      {/* At the store: the day's cards come out on the list itself, the
          store's own first, while the shopping day is on or the basket is
          being checked out. */}
      {(tripIsToday || checkingOut) && <CheckoutCards cards={cards} tripTitle={trip?.title ?? null} />}

      {checkingOut && (
        <ClearCheckedPanel
          doneCount={doneCount}
          accounts={accounts}
          currency={currency}
          suggested={whole.actual}
          market={(() => {
            // What was ticked at a Market store, filed under Market rather
            // than Groceries (Janine, 26 October).
            const fromMarket = allItems.filter((i) => isChecked(i) && storeKindOf(i) === "market");
            return { count: fromMarket.length, actual: budgetSummary(fromMarket.map(budgetLine)).actual };
          })()}
          budget={allItems.filter((i) => isChecked(i)).reduce((sum, i) => sum + (lineBudget(budgetLine(i)) ?? 0), 0)}
          onClose={() => setCheckingOut(false)}
        />
      )}

      {allItems.length > 0 && (
        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.875rem", fontSize: "0.8125rem", color: "var(--color-neutral-700)" }}>
          <span style={{ flex: "none" }}>Shopping for</span>
          <select
            className="input"
            value={view}
            onChange={(e) => chooseOrder(e.target.value as ListOrder)}
            style={{ minHeight: "2.5rem", flex: 1, minWidth: 0 }}
          >
            <option value="all">All items ({allItems.length})</option>
            {STORE_KINDS.map((k) => (
              <option key={k} value={k}>
                {STORE_KIND_LABEL[k]} ({kindCount(k)})
              </option>
            ))}
            {canGroupByEvent && <option value="event">For an event ({allItems.filter((i) => eventOf(i)).length})</option>}
          </select>
        </label>
      )}

      {shown.map((g) => {
        // Every group starts folded to its header and opens on a tap
        // (Jonathan, 12 October); the set holds the open ones.
        const toggleKey = `${view}:${g.name}`;
        const isOpen = expanded.has(toggleKey);
        const inBasket = g.items.filter((i) => i.checked).length;
        // The group's budget, and once anything in it is bought, what that
        // cost and saved -- the same sums as the card above.
        const gs = budgetSummary(g.items.map(budgetLine));
        return (
          <div key={g.name} style={{ marginBottom: "1.125rem" }}>
            {/* One header for every grouping: what the group is (an event's
                day in its own column, so a long name wraps under itself),
                how many lines and how many are in the basket, then its total
                on the right; where the lines came from under the name
                (Jonathan, 12 October). */}
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
              aria-label={g.event ? `${g.event.title}, ${g.event.when.full}` : undefined}
              style={{
                width: "100%",
                cursor: "pointer",
                background: "none",
                border: 0,
                borderBottom: "1px solid var(--color-divider)",
                padding: "0.375rem 0 0.625rem",
                display: "grid",
                gridTemplateColumns: g.event ? "0.75rem 2.5rem minmax(0, 1fr) auto auto" : "0.75rem minmax(0, 1fr) auto auto",
                columnGap: "0.5rem",
                alignItems: "start",
                textAlign: "left",
                color: "inherit",
              }}
            >
              <Icon
                name="chevronLeft"
                size={12}
                className="text-[var(--color-neutral-600)]"
                style={{ marginTop: "0.3125rem", transform: isOpen ? "rotate(270deg)" : "rotate(180deg)", transition: "transform 160ms ease-out" }}
              />
              {g.event && (
                <span aria-hidden style={{ display: "grid", justifyItems: "center", padding: "0.25rem 0", borderRadius: 10, background: "color-mix(in srgb, var(--color-accent) 10%, transparent)", color: "var(--color-accent)" }}>
                  <span style={{ font: "700 1rem/1 var(--font-numeric)" }}>{g.event.when.day}</span>
                  <span style={{ font: "600 0.625rem/1.2 var(--font-body)", textTransform: "uppercase", letterSpacing: ".04em", whiteSpace: "nowrap" }}>{g.event.when.month}</span>
                </span>
              )}
              <span style={{ display: "grid", gap: "0.1875rem", minWidth: 0 }}>
                <span style={{ font: "600 0.9375rem/1.3 var(--font-heading)", overflowWrap: "anywhere" }}>{g.event ? g.event.title : g.name}</span>
                <span style={{ fontSize: "0.71875rem", lineHeight: 1.3, color: "var(--color-neutral-600)" }}>{sourcesOf(g.items)}</span>
              </span>
              <span style={{ display: "grid", justifyItems: "end", gap: "0.1875rem", font: "400 0.71875rem/1.3 var(--font-numeric)", color: "var(--color-neutral-600)", whiteSpace: "nowrap", paddingTop: "0.125rem" }}>
                <span>{g.items.length} item{g.items.length === 1 ? "" : "s"}</span>
                {inBasket > 0 && <span>{inBasket === g.items.length ? "all" : inBasket} in basket</span>}
              </span>
              <span style={{ display: "grid", justifyItems: "end", gap: "0.1875rem", minWidth: "3.75rem" }}>
                {gs.noBudget === g.items.length ? (
                  <span style={{ font: "400 0.8125rem/1.3 var(--font-body)", color: "var(--color-neutral-600)", whiteSpace: "nowrap" }}>No budget</span>
                ) : (
                  <strong style={{ font: "600 0.9375rem/1.3 var(--font-numeric)", whiteSpace: "nowrap" }}>{formatCurrency(gs.budget, currency)}</strong>
                )}
                {gs.bought > 0 ? (
                  <span style={{ font: "400 0.6875rem/1.3 var(--font-body)", color: gs.savings < 0 ? "var(--cal-money)" : "var(--color-neutral-600)", whiteSpace: "nowrap" }}>
                    Actual {formatCurrency(gs.actual, currency)}
                    {gs.savings !== 0 && ` · ${gs.savings < 0 ? "over" : "saved"} ${formatCurrency(Math.abs(gs.savings), currency)}`}
                  </span>
                ) : (
                  gs.noBudget > 0 &&
                  gs.noBudget < g.items.length && (
                    <span style={{ font: "400 0.6875rem/1.3 var(--font-body)", color: "var(--color-neutral-600)", whiteSpace: "nowrap" }}>+{gs.noBudget} no budget</span>
                  )
                )}
              </span>
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
                    {/* Added by the household's helper (20261015121000): the
                        name comes from their helper row, never typed. */}
                    {item.helper_name ? (
                      <span style={{ display: "block", marginTop: "0.125rem", fontSize: "0.71875rem", color: "var(--color-neutral-600)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        Added by {item.helper_name}
                      </span>
                    ) : null}
                    {/* The meals this line is for, so nobody wonders why there
                        is a kilo of beef shank on the list. */}
                    {mealsFor[item.id]?.length ? (
                      <span style={{ display: "block", marginTop: "0.125rem", fontSize: "0.71875rem", color: "var(--color-neutral-600)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        For {mealsFor[item.id].map((m) => `${m.dish} (${mealDayLabel(m.date)})`).join(", ")}
                      </span>
                    ) : null}
                    {/* The event it is for -- said on the line except when the
                        list is already grouped under it. */}
                    {/* Bought: against its budget. */}
                    {isChecked(item) && lineSavings(budgetLine(item)) != null ? (
                      <span style={{ display: "block", marginTop: "0.125rem", fontSize: "0.71875rem", color: lineSavings(budgetLine(item))! < 0 ? "var(--cal-money)" : "var(--color-neutral-600)" }}>
                        Budget {formatCurrency(lineBudget(budgetLine(item))!, currency)}
                        {lineSavings(budgetLine(item))! !== 0 &&
                          ` · ${lineSavings(budgetLine(item))! < 0 ? "over" : "saved"} ${formatCurrency(Math.abs(lineSavings(budgetLine(item))!), currency)}`}
                      </span>
                    ) : null}
                    {/* The store it is named for, unless its group is that store. */}
                    {item.store_name && !groupIsStore(g) ? (
                      <span style={{ display: "flex", alignItems: "center", gap: "0.25rem", marginTop: "0.125rem", fontSize: "0.71875rem", color: "var(--color-neutral-600)", overflow: "hidden", whiteSpace: "nowrap" }}>
                        <Icon name="basket" size={11} style={{ flex: "none" }} />
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{view === "event" ? `${STORE_KIND_LABEL[storeKindOf(item)]} · ${item.store_name}` : item.store_name}</span>
                      </span>
                    ) : null}
                    {view !== "event" && eventOf(item) ? (
                      <span style={{ display: "flex", alignItems: "center", gap: "0.25rem", marginTop: "0.125rem", fontSize: "0.71875rem", color: "var(--color-neutral-600)", overflow: "hidden", whiteSpace: "nowrap" }}>
                        <Icon name="calendarDays" size={11} style={{ flex: "none" }} />
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>For {eventLabel(eventOf(item)!)}</span>
                      </span>
                    ) : null}
                    {/* Quiet, like the lines above it: a list with a dozen
                        pantry items read loud in the accent colour. */}
                    {prices[item.id]?.inPantry ? (
                      <span style={{ display: "flex", alignItems: "center", gap: "0.25rem", marginTop: "0.125rem", fontSize: "0.71875rem", color: "var(--color-neutral-600)" }}>
                        <Icon name="house" size={11} style={{ flex: "none" }} />
                        Already at home
                      </span>
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
                    {isChecked(item) ? (
                      // Bought: what it cost, and a tap asks again.
                      <button
                        type="button"
                        aria-label={`What ${item.name} cost`}
                        aria-expanded={actualFor === item.id}
                        onClick={() => setActualFor(actualFor === item.id ? null : item.id)}
                        style={{ border: 0, background: "none", cursor: "pointer", padding: "0.375rem 0.5rem", margin: "-6px 0", fontSize: "0.84375rem", color: "var(--color-neutral-700)", fontFamily: "var(--font-body)" }}
                      >
                        {lineActual(budgetLine(item)) == null ? "cost?" : formatCurrency(lineActual(budgetLine(item))!, currency)}
                      </button>
                    ) : item.budget != null ? (
                      // Its own budget, changed where it was set.
                      <button
                        type="button"
                        aria-label={`Change the budget for ${item.name}`}
                        onClick={() => setEditing(editing === item.id ? null : item.id)}
                        style={{ border: 0, background: "none", cursor: "pointer", padding: "0.375rem 0.5rem", margin: "-6px 0", fontSize: "0.84375rem", fontWeight: 600, color: "var(--color-neutral-700)", fontFamily: "var(--font-body)" }}
                      >
                        {formatCurrency(Number(item.budget), currency)}
                      </button>
                    ) : (
                      <BuyItemPriceButton
                        estimated={prices[item.id]?.estimated ?? null}
                        source={prices[item.id]?.source ?? "unknown"}
                        editing={pricing === item.id}
                        onToggle={() => setPricing(pricing === item.id ? null : item.id)}
                      />
                    )}
                  </span>
                </div>
                {actualFor === item.id && isChecked(item) && (
                  <ActualRow
                    item={item}
                    line={budgetLine(item)}
                    book={prices[item.id] ?? null}
                    currency={currency}
                    onClose={() => setActualFor(null)}
                  />
                )}
                {pricing === item.id && (
                  <BuyItemPriceEditor itemId={item.id} unitPrice={prices[item.id]?.unitPrice ?? null} onClose={() => setPricing(null)} />
                )}
                {editing === item.id && (
                  <EditItemRow item={item} events={events} usedStores={usedStores} cardStores={cards.map((c) => c.store)} onClose={() => setEditing(null)} />
                )}
                </div>
              ))}
          </div>
        );
      })}

      {isStoreKind(view) && shown.length === 0 && allItems.length > 0 && (
        <p style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)", margin: "0 0 1.125rem" }}>
          Nothing on the list is for the {STORE_KIND_LABEL[view].toLowerCase()} yet. Add an item below, or tap an item to change its store.
        </p>
      )}

      {view === "event" && shown.length === 0 && allItems.length > 0 && (
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

      {/* Adding is one tap away, not four fields permanently in the way. It
          opens over the list (Jonathan, 26 October), and stays open after
          each item, because a list is usually written several things at a
          time; Done or a swipe down closes it. */}
      <button
          type="button"
          onClick={() => setAdding(true)}
          className="btn btn-secondary"
          style={{ width: "100%", minHeight: "2.75rem", fontSize: "0.90625rem", gap: "0.375rem", marginTop: "0.625rem" }}
        >
          <Icon name="plus" size={16} />
          Add an item
        </button>
      <FormSheet
        open={adding}
        onClose={() => {
          setAdding(false);
          setNewName("");
        }}
        title="Add to the list"
      >
        <form action={addAction}>
          <input type="hidden" name="source" value="house" />
          <input aria-label="Item to buy"
            className="input"
            name="name"
            placeholder="What to buy"
            required
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            maxLength={150}
            style={{ minHeight: "2.625rem", width: "100%", marginBottom: "0.5rem" }}
          />
          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
            <input aria-label="Quantity" className="input" name="quantity" type="number" step="0.01" min="0" placeholder="Qty" style={{ minHeight: "2.625rem", flex: 1, minWidth: 0 }} />
            <select aria-label="Unit" className="input" name="unit" defaultValue="pc" style={{ minHeight: "2.625rem", flex: 1, minWidth: 0 }}>
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
          {/* Which kind of store, and which store, if it matters. The kind
              follows the section; the name is offered from the stores the
              household has used and its loyalty cards. */}
          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
            <select aria-label="Kind of store" className="input" name="store_kind" value={storeKind} onChange={(e) => setStoreKind(e.target.value as StoreKind)} style={{ minHeight: "2.625rem", flex: 1, minWidth: 0 }}>
              {STORE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {STORE_KIND_LABEL[k]}
                </option>
              ))}
            </select>
            <input
              aria-label="Store name"
              className="input"
              name="store_name"
              placeholder="Store name (optional)"
              list={`${storeListId}-add`}
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              maxLength={80}
              style={{ minHeight: "2.625rem", flex: 1, minWidth: 0 }}
            />
            <datalist id={`${storeListId}-add`}>
              {storeNames.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem" }}>
            {/* What it may cost. Blank lets the price book's estimate stand in. */}
            <input
              aria-label="Budget"
              className="input"
              name="budget"
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              placeholder="Budget"
              style={{ minHeight: "2.625rem", width: 110, flex: "none" }}
            />
            {/* Pre-filled from the name as it's typed, so the common case is one tap. */}
            <select aria-label="Market section" className="input" name="section" value={section} onChange={(e) => setSection(e.target.value)} style={{ minHeight: "2.625rem", flex: 1, minWidth: 0 }}>
              {MARKET_SECTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <ErrorText message={addState.error} />
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <SubmitButton className="btn btn-primary" style={{ minHeight: "2.75rem", flex: 1 }}>
              ADD
            </SubmitButton>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ minHeight: "2.75rem", flex: 1, fontSize: "0.875rem" }}
              onClick={() => {
                setAdding(false);
                setNewName("");
              }}
            >
              Done
            </button>
          </div>
        </form>
      </FormSheet>
      <div style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)", marginTop: "0.625rem" }}>
        Sections follow the order you walk the market. Items are filed by name automatically — tap any item to fix its quantity, section,
        store or the event it is for. Ticked items stay until cleared.
      </div>

      {trips.length > 0 && <PastTrips trips={trips} currency={currency} />}
    </>
  );
}

/** Tapping an item opens this — fix the quantity, the unit, or which section
 * it was filed under when it came off a meal plan. */
function EditItemRow({
  item,
  events,
  usedStores,
  cardStores,
  onClose,
}: {
  item: Tables<"buy_items">;
  events: ListEvent[];
  usedStores: { store_kind: string | null; store_name: string | null }[];
  cardStores: string[];
  onClose: () => void;
}) {
  const [name, setName] = useState(item.name);
  const [quantity, setQuantity] = useState(item.quantity === null ? "" : String(item.quantity));
  const [unit, setUnit] = useState(item.unit ?? "pc");
  const [section, setSection] = useState(item.section);
  const [eventId, setEventId] = useState(item.event_id ?? "");
  const [storeKind, setStoreKind] = useState<StoreKind>(storeKindOf(item));
  const [storeName, setStoreName] = useState(item.store_name ?? "");
  const [budget, setBudget] = useState(item.budget == null ? "" : String(item.budget));
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const storeListId = useId();

  function save() {
    startTransition(async () => {
      await updateBuyItemAction(item.id, {
        name,
        quantity: quantity.trim() ? Number(quantity) : null,
        unit: unit || null,
        section,
        // Sent only when it changed, so an ordinary edit never touches it.
        ...(eventId !== (item.event_id ?? "") ? { eventId: eventId || null } : {}),
        storeKind,
        storeName: storeName.trim() || null,
        budget: parseAmount(budget),
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
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
        <select aria-label="Kind of store" className="input" value={storeKind} onChange={(e) => setStoreKind(e.target.value as StoreKind)} style={{ minHeight: "2.5rem", flex: 1, minWidth: 0 }}>
          {STORE_KINDS.map((k) => (
            <option key={k} value={k}>
              {STORE_KIND_LABEL[k]}
            </option>
          ))}
        </select>
        <input
          aria-label="Store name"
          className="input"
          placeholder="Store name (optional)"
          list={storeListId}
          value={storeName}
          onChange={(e) => setStoreName(e.target.value)}
          maxLength={80}
          style={{ minHeight: "2.5rem", flex: 1, minWidth: 0 }}
        />
        <datalist id={storeListId}>
          {storeNameSuggestions(usedStores, cardStores, storeKind).map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
      </div>
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
        <input
          aria-label="Budget"
          className="input"
          type="number"
          step="0.01"
          min="0"
          inputMode="decimal"
          placeholder="Budget"
          value={budget}
          onChange={(e) => setBudget(e.target.value)}
          style={{ minHeight: "2.5rem", width: 92, flex: "none" }}
        />
        <select aria-label="Market section" className="input" value={section} onChange={(e) => setSection(e.target.value)} style={{ minHeight: "2.5rem", flex: 1, minWidth: 0 }}>
          {MARKET_SECTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <span style={{ flex: 1 }} />
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
          onClick={() => {
            // Off the list at once, with Undo for a few seconds, instead of
            // a confirm first. The old path also ignored a failed remove;
            // deleteWithUndo brings the item back and says why.
            onClose();
            deleteWithUndo({
              id: item.id,
              message: `Removed "${item.name}"`,
              remove: () => removeBuyItemAction(item.id),
              onDeleted: () => router.refresh(),
            });
          }}
        >
          Remove
        </button>
      </div>
    </div>
  );
}

/** Ticking a line asks what it cost (Janine, 23 October): a box under the
 * row, already holding its budget, so the common case is one tap. A figure
 * the price book does not have is then offered to it -- asked every time,
 * never written on its own. */
function ActualRow({
  item,
  line,
  book,
  currency,
  onClose,
}: {
  item: Tables<"buy_items">;
  line: BudgetLine;
  book: { estimated: number | null; unitPrice: number | null } | null;
  currency: string;
  onClose: () => void;
}) {
  const start = lineActual(line);
  const [value, setValue] = useState(start == null ? "" : String(start));
  const [asking, setAsking] = useState<{ unitPrice: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Its own, so the question is answerable at once: saving the figure stays
  // pending while the list refreshes behind it, which greyed out both buttons
  // and showed "…" on one nobody had pressed (29 October, the QA run).
  const [updating, startUpdate] = useTransition();
  const router = useRouter();
  const amount = parseAmount(value);
  const budget = lineBudget(line);
  const saved = budget != null && amount != null ? Math.round((budget - amount) * 100) / 100 : null;
  const unit = item.unit || "pc";

  function save() {
    if (amount == null) return onClose();
    startTransition(async () => {
      // The budget is what a ticked line costs anyway, so only a different
      // figure is kept.
      const r = await setBuyItemActualAction(item.id, amount === budget ? null : amount);
      if (r.error) return setError(r.error);
      router.refresh();
      const qty = item.quantity == null || Number(item.quantity) <= 0 ? 1 : Number(item.quantity);
      if (amount > 0 && differsFromBook(amount, book?.estimated ?? null)) setAsking({ unitPrice: Math.round((amount / qty) * 100) / 100 });
      else onClose();
    });
  }

  function updateBook(unitPrice: number) {
    startUpdate(async () => {
      const r = await setItemPriceAction({ name: item.name, unitPrice, unit, section: item.section });
      if (r.error) return setError(r.error);
      onClose();
      router.refresh();
    });
  }

  const box: React.CSSProperties = { display: "grid", gap: "0.4375rem", padding: "0.5rem 0 0.75rem 2.1875rem", borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)" };

  if (asking) {
    return (
      <div style={box}>
        <span style={{ fontSize: "0.8125rem" }}>
          {book?.unitPrice != null
            ? `The price book has ${formatCurrency(book.unitPrice, currency)} per ${unit}. Use ${formatCurrency(asking.unitPrice, currency)} per ${unit} from now on?`
            : `Save ${formatCurrency(asking.unitPrice, currency)} per ${unit} as the usual price of ${item.name}?`}
        </span>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button type="button" className="btn btn-primary" disabled={updating} style={{ minHeight: "2.25rem", fontSize: "0.8125rem" }} onClick={() => updateBook(asking.unitPrice)}>
            {updating ? "…" : "Update price book"}
          </button>
          <button type="button" className="btn btn-secondary" disabled={updating} style={{ minHeight: "2.25rem", fontSize: "0.8125rem" }} onClick={onClose}>
            Just this time
          </button>
        </div>
        <ErrorText message={error} />
      </div>
    );
  }

  return (
    <div style={box}>
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <label style={{ fontSize: "0.8125rem", color: "var(--color-neutral-700)", flex: "none" }} htmlFor={`actual-${item.id}`}>
          Actual
        </label>
        <input
          id={`actual-${item.id}`}
          className="input"
          type="number"
          step="0.01"
          min="0"
          inputMode="decimal"
          placeholder="What it cost"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          style={{ minHeight: "2.25rem", width: 110 }}
        />
        <button type="button" className="btn btn-primary" disabled={pending} style={{ minHeight: "2.25rem", fontSize: "0.8125rem", paddingInline: "0.875rem" }} onClick={save}>
          {pending ? "…" : "OK"}
        </button>
      </div>
      {budget != null && (
        <span style={{ fontSize: "0.75rem", color: saved != null && saved < 0 ? "var(--cal-money)" : "var(--color-neutral-600)" }}>
          Budget {formatCurrency(budget, currency)}
          {saved != null && saved !== 0 && ` · ${saved < 0 ? "over" : "saved"} ${formatCurrency(Math.abs(saved), currency)}`}
        </span>
      )}
      <ErrorText message={error} />
    </div>
  );
}

/** The week's checkouts (Janine, 23 October): each with its budget, what it
 * cost and what it saved, and its lines a tap away. Kept seven days, then
 * gone (20261023210000_buy_trips). */
function PastTrips({ trips, currency }: { trips: RecentTrip[]; currency: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const router = useRouter();
  // A removed trip goes at once, with Undo for a few seconds (lib/undo-delete).
  const hidden = useHiddenRows();
  const shownTrips = trips.filter((t) => !hidden.has(t.id));
  const stores = (t: RecentTrip) => {
    const names = [...new Set(t.items.map((i) => i.store_name ?? (isStoreKind(i.store_kind) ? STORE_KIND_LABEL[i.store_kind] : "Other")))];
    return names.length > 3 ? `${names.slice(0, 3).join(" · ")} +${names.length - 3}` : names.join(" · ");
  };
  return (
    <section style={{ marginTop: "1.5rem" }} aria-label="Past trips">
      <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem", borderBottom: "1px solid var(--color-divider)", paddingBottom: "0.375rem", marginBottom: "0.25rem" }}>
        <span style={{ font: "600 0.9375rem/1.3 var(--font-heading)" }}>Past trips</span>
        <span style={{ marginLeft: "auto", fontSize: "0.71875rem", color: "var(--color-neutral-600)" }}>kept for a week</span>
      </div>
      {shownTrips.map((t) => {
        const isOpen = open === t.id;
        return (
          <div key={t.id} style={{ borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)" }}>
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : t.id)}
              style={{ width: "100%", background: "none", border: 0, padding: "0.625rem 0", cursor: "pointer", textAlign: "left", color: "inherit", display: "grid", gap: "0.3125rem" }}
            >
              <span style={{ display: "flex", alignItems: "baseline", gap: "0.5rem" }}>
                <span style={{ fontSize: "0.875rem", fontWeight: 600 }}>{t.when}</span>
                <span style={{ fontSize: "0.75rem", color: "var(--color-neutral-600)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{stores(t)}</span>
                <span style={{ fontSize: "0.75rem", color: "var(--color-neutral-600)", flex: "none" }}>
                  {t.itemCount} item{t.itemCount === 1 ? "" : "s"}
                </span>
              </span>
              <span style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", font: "400 0.78125rem/1.3 var(--font-numeric)", color: "var(--color-neutral-700)" }}>
                <span>Budget {formatCurrency(t.budget, currency)}</span>
                <span>Actual {formatCurrency(t.actual, currency)}</span>
                <span style={{ color: t.savings < 0 ? "var(--cal-money)" : t.savings > 0 ? "var(--color-switch-on-ink)" : undefined, fontWeight: 600 }}>
                  {t.savings < 0 ? `Over ${formatCurrency(-t.savings, currency)}` : `Saved ${formatCurrency(t.savings, currency)}`}
                </span>
                {t.paid != null && Math.abs(t.paid - t.actual) >= 0.01 && <span>Paid {formatCurrency(t.paid, currency)}</span>}
              </span>
            </button>
            {isOpen && (
              <div style={{ padding: "0 0 0.75rem" }}>
                {t.items.map((i, n) => (
                  <div key={n} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto auto", columnGap: "0.75rem", fontSize: "0.8125rem", padding: "0.25rem 0" }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {i.name}
                      {i.quantity != null && <span style={{ color: "var(--color-neutral-600)" }}> · {formatQuantity(i.quantity, i.unit)}</span>}
                    </span>
                    <span style={{ fontFamily: "var(--font-numeric)", color: "var(--color-neutral-600)" }}>{i.budget == null ? "—" : formatCurrency(i.budget, currency)}</span>
                    <span style={{ fontFamily: "var(--font-numeric)", minWidth: "4rem", textAlign: "right" }}>{i.actual == null ? "—" : formatCurrency(i.actual, currency)}</span>
                  </div>
                ))}
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ minHeight: "2rem", fontSize: "0.78125rem", padding: "0 0.375rem", marginTop: "0.375rem", color: "var(--color-accent-700)" }}
                  onClick={() => {
                    setOpen(null);
                    deleteWithUndo({ id: t.id, message: `Removed the trip of ${t.when}`, remove: () => removeBuyTripAction(t.id), onDeleted: () => router.refresh() });
                  }}
                >
                  Remove this trip
                </button>
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

/** Clearing the trolley is the moment the shop actually cost something, so
 * that's where the spend is captured and taken out of a real account. */
function ClearCheckedPanel({
  doneCount,
  accounts,
  currency,
  suggested,
  market,
  budget,
  onClose,
}: {
  doneCount: number;
  /** The ticked items from Market stores: how many, and what they came to. */
  market: { count: number; actual: number };
  accounts: PickableAccount[];
  currency: string;
  /** What the basket was estimated at — the till usually agrees closely
   * enough that this is the right number to start from. */
  suggested: number;
  /** What the basket was budgeted at, to show what the shop saved. */
  budget: number;
  onClose: () => void;
}) {
  // By store type: all from the market, all elsewhere, or both -- then two
  // amounts, each logged under its own category.
  const allMarket = market.count > 0 && market.count === doneCount;
  const mixed = market.count > 0 && market.count < doneCount;
  const [marketAmount, setMarketAmount] = useState(Math.round(market.actual * 100) / 100);
  const [groceryAmount, setGroceryAmount] = useState(Math.round((suggested - market.actual) * 100) / 100);
  const [single, setSingle] = useState(Math.round(suggested * 100) / 100);
  const amount = mixed ? Math.round((marketAmount + groceryAmount) * 100) / 100 : single;
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const uid = useId();
  const [error, setError] = useState<string | null>(null);
  // One id per category's spend, made at the first try and kept until the
  // basket clears (lib/ledger-ids, 29 October): a retry after "Load failed"
  // finds a spend already logged instead of taking it out twice.
  const ids = useRef(new Map<string, string>());
  const spendId = (category: string) => {
    if (!ids.current.has(category)) ids.current.set(category, newOpId());
    return ids.current.get(category)!;
  };

  function finish(withSpend: boolean) {
    setError(null);
    startTransition(async () => {
      try {
        await checkout(withSpend);
      } catch (e) {
        // A weak signal: the basket stays as it was, to try again.
        setError(failedSaveMessage(e, true));
      }
    });
  }

  async function checkout(withSpend: boolean) {
    if (withSpend && amount > 0 && accountId) {
      const runs = mixed
        ? [
            { category: "Groceries", amount: groceryAmount, count: doneCount - market.count, noun: "Grocery run" },
            { category: "Market", amount: marketAmount, count: market.count, noun: "Market run" },
          ]
        : [{ category: allMarket ? "Market" : "Groceries", amount: single, count: doneCount, noun: allMarket ? "Market run" : "Grocery run" }];
      for (const r of runs.filter((x) => x.amount > 0)) {
        const res = await postHubExpenseAction({
          accountId,
          amount: r.amount,
          particulars: `${r.noun} · ${r.count} item${r.count === 1 ? "" : "s"}`,
          category: r.category,
          sourceTable: "buy_items",
          sourceId: null,
          clientId: spendId(r.category),
        });
        // Not logged: the basket stays, rather than clearing as if it was.
        if (res.error) {
          setError(res.error);
          return;
        }
      }
    }
    await clearCheckedAction(withSpend && amount > 0 ? amount : null);
    ids.current.clear();
    // The basket is empty now, so the till closes with it.
    onClose();
    router.refresh();
  }

  return (
    <Blueprint className="bg-[var(--color-accent-100)]" style={{ padding: "0.75rem 0.8125rem", marginBottom: "1rem" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem", marginBottom: "0.625rem" }}>
        <span style={{ fontSize: "0.84375rem", flex: 1, minWidth: 0 }}>
          {doneCount} item{doneCount === 1 ? "" : "s"} in the basket — what did the shop come to?
          {budget > 0 && (
            <span style={{ display: "block", marginTop: "0.25rem", fontSize: "0.78125rem", color: amount > budget ? "var(--cal-money)" : "var(--color-neutral-700)" }}>
              Budget {formatCurrency(budget, currency)} · Paid {formatCurrency(amount, currency)} ·{" "}
              {amount > budget ? `${formatCurrency(amount - budget, currency)} over` : `saved ${formatCurrency(budget - amount, currency)}`}
            </span>
          )}
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
              <AccountOptions accounts={accounts} currency={currency} />
            </select>
          </div>
          {!mixed && (
            <div className="field" style={{ width: 106, margin: 0 }}>
              <label htmlFor={`${uid}-total`}>{allMarket ? "Market" : "Total"}</label>
              <input id={`${uid}-total`} aria-label="Total" className="input" type="number" step="0.01" value={single} onChange={(e) => setSingle(Number(e.target.value))} style={{ minHeight: "2.5rem" }} />
            </div>
          )}
        </div>
      )}
      {accounts.length > 0 && mixed && (
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.625rem" }}>
          <div className="field" style={{ flex: 1, margin: 0 }}>
            <label htmlFor={`${uid}-groceries`}>Groceries · {doneCount - market.count}</label>
            <input id={`${uid}-groceries`} aria-label="Groceries" className="input" type="number" step="0.01" value={groceryAmount} onChange={(e) => setGroceryAmount(Number(e.target.value))} style={{ minHeight: "2.5rem" }} />
          </div>
          <div className="field" style={{ flex: 1, margin: 0 }}>
            <label htmlFor={`${uid}-market`}>Market · {market.count}</label>
            <input id={`${uid}-market`} aria-label="Market" className="input" type="number" step="0.01" value={marketAmount} onChange={(e) => setMarketAmount(Number(e.target.value))} style={{ minHeight: "2.5rem" }} />
          </div>
        </div>
      )}
      <ErrorText message={error} />
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
