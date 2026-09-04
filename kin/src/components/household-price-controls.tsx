"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  setItemPriceAction,
  resetItemPriceAction,
  setBuyItemPriceAction,
  setPantryItemAction,
  removePantryItemAction,
} from "@/lib/actions/household";
import { Icon } from "@/components/icons";
import { MARKET_SECTIONS, UNITS } from "@/lib/grocery";

function useHouseholdAction() {
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
  return { pending, error, run };
}

function peso(n: number) {
  return `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

/** One row of the price book. Tapping the price opens it for editing; a
 * family figure can be dropped to fall back on the shipped estimate. */
export function PriceRowControl({
  itemKey,
  name,
  unit,
  price,
  section,
  source,
}: {
  itemKey: string;
  name: string;
  unit: string;
  price: number;
  section: string;
  source: "family" | "starter";
}) {
  const { pending, error, run } = useHouseholdAction();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(price));
  const [unitValue, setUnitValue] = useState(unit);

  if (!editing) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderTop: "1px solid var(--color-divider)" }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: 15 }}>{name}</span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            border: 0,
            background: "none",
            cursor: "pointer",
            fontFamily: "var(--font-body)",
            fontSize: 15,
            color: "var(--color-text)",
            padding: "4px 2px",
          }}
          aria-label={`Edit the price of ${name}`}
        >
          <span style={{ fontWeight: source === "family" ? 600 : 400 }}>{peso(price)}</span>
          <span style={{ fontSize: 12.5, color: "var(--color-neutral-600)" }}>/{unit}</span>
          {source === "starter" && (
            <span
              title="Kin's starting estimate — tap to set yours"
              style={{ fontSize: 10.5, padding: "1px 5px", borderRadius: 999, background: "color-mix(in srgb, var(--color-text) 8%, transparent)", color: "var(--color-neutral-700)" }}
            >
              est
            </span>
          )}
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: "10px 0", borderTop: "1px solid var(--color-divider)" }}>
      <div style={{ fontSize: 15, marginBottom: 7 }}>{name}</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <input
          className="input"
          type="number"
          step="0.01"
          min="0"
          inputMode="decimal"
          value={value}
          onChange={(ev) => setValue(ev.target.value)}
          style={{ minHeight: 40, width: 110, fontSize: 15 }}
          aria-label="Price"
          autoFocus
        />
        <select className="input" value={unitValue} onChange={(ev) => setUnitValue(ev.target.value)} style={{ minHeight: 40, width: 96, fontSize: 14 }} aria-label="Unit">
          {[...new Set([unit, ...UNITS])].map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn btn-primary"
          style={{ minHeight: 40, fontSize: 13, padding: "0 14px" }}
          disabled={pending}
          onClick={() =>
            run(async () => {
              const result = await setItemPriceAction({ name, unitPrice: Number(value), unit: unitValue, section });
              if (!result.error) setEditing(false);
              return result;
            })
          }
        >
          Save
        </button>
        {source === "family" && (
          <button
            type="button"
            className="btn btn-ghost"
            style={{ minHeight: 40, fontSize: 12.5, padding: "0 8px" }}
            disabled={pending}
            onClick={() =>
              run(async () => {
                const result = await resetItemPriceAction(itemKey);
                if (!result.error) setEditing(false);
                return result;
              })
            }
          >
            Use estimate
          </button>
        )}
        <button type="button" className="btn btn-ghost" style={{ minHeight: 40, fontSize: 12.5, padding: "0 8px" }} onClick={() => setEditing(false)}>
          Cancel
        </button>
      </div>
      {error && <div style={{ fontSize: 12.5, color: "var(--cal-occasion)", marginTop: 6 }}>{error}</div>}
    </div>
  );
}

/** Add something the price book has never heard of. */
export function AddPriceControl() {
  const { pending, error, run } = useHouseholdAction();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [unit, setUnit] = useState("pc");
  const [section, setSection] = useState<string>("Other");

  if (!open) {
    return (
      <button type="button" className="btn btn-secondary btn-block" style={{ minHeight: 44, fontSize: 14, marginTop: 14 }} onClick={() => setOpen(true)}>
        <Icon name="plus" size={15} /> Add an item to the price book
      </button>
    );
  }

  return (
    <div style={{ marginTop: 14, padding: 13, borderRadius: 14, background: "color-mix(in srgb, var(--color-text) 4%, transparent)" }}>
      <input className="input" placeholder="Item name" value={name} onChange={(e) => setName(e.target.value)} style={{ minHeight: 42, marginBottom: 8 }} />
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        <input className="input" type="number" step="0.01" min="0" inputMode="decimal" placeholder="Price" value={price} onChange={(e) => setPrice(e.target.value)} style={{ minHeight: 42, flex: 1 }} />
        <select className="input" value={unit} onChange={(e) => setUnit(e.target.value)} style={{ minHeight: 42, width: 100 }}>
          {UNITS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      </div>
      <select className="input" value={section} onChange={(e) => setSection(e.target.value)} style={{ minHeight: 42, marginBottom: 10 }}>
        {MARKET_SECTIONS.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <div style={{ display: "flex", gap: 6 }}>
        <button
          type="button"
          className="btn btn-primary"
          style={{ flex: 1, minHeight: 42, fontSize: 14 }}
          disabled={pending || !name.trim() || price === ""}
          onClick={() =>
            run(async () => {
              const result = await setItemPriceAction({ name, unitPrice: Number(price), unit, section });
              if (!result.error) {
                setName("");
                setPrice("");
                setOpen(false);
              }
              return result;
            })
          }
        >
          Save
        </button>
        <button type="button" className="btn btn-ghost" style={{ minHeight: 42, fontSize: 13, padding: "0 12px" }} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      {error && <div style={{ fontSize: 12.5, color: "var(--cal-occasion)", marginTop: 6 }}>{error}</div>}
    </div>
  );
}

/** The price for one line of the buy list, when today's shop differs from
 * the household's usual figure. */
export function BuyItemPriceControl({
  itemId,
  estimated,
  unitPrice,
  source,
}: {
  itemId: string;
  estimated: number | null;
  unitPrice: number | null;
  source: string;
}) {
  const { pending, run } = useHouseholdAction();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(unitPrice == null ? "" : String(unitPrice));

  if (editing) {
    return (
      <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
        <input
          className="input"
          type="number"
          step="0.01"
          min="0"
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          style={{ minHeight: 32, width: 84, fontSize: 13 }}
          aria-label="Price for this line"
          autoFocus
        />
        <button
          type="button"
          className="btn btn-primary"
          style={{ minHeight: 32, fontSize: 12, padding: "0 9px" }}
          disabled={pending}
          onClick={() =>
            run(async () => {
              const result = await setBuyItemPriceAction(itemId, value === "" ? null : Number(value));
              if (!result.error) setEditing(false);
              return result;
            })
          }
        >
          Set
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      aria-label="Set the price for this line"
      style={{
        border: 0,
        background: "none",
        cursor: "pointer",
        padding: "2px 0",
        fontFamily: "var(--font-body)",
        fontSize: 13.5,
        color: estimated == null ? "var(--color-accent)" : "var(--color-neutral-700)",
        fontWeight: source === "override" ? 600 : 400,
      }}
    >
      {estimated == null ? "price?" : peso(estimated)}
    </button>
  );
}

/** What is already in the house. */
export function PantryControls({ items }: { items: { item_key: string; name: string; quantity: number | null; unit: string | null }[] }) {
  const { pending, error, run } = useHouseholdAction();
  const [name, setName] = useState("");

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        <input
          className="input"
          placeholder="Rice, cooking oil, soy sauce…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ minHeight: 42, flex: 1 }}
          aria-label="Something already in the house"
        />
        <button
          type="button"
          className="btn btn-primary"
          style={{ minHeight: 42, fontSize: 14, padding: "0 14px" }}
          disabled={pending || !name.trim()}
          onClick={() =>
            run(async () => {
              const result = await setPantryItemAction({ name });
              if (!result.error) setName("");
              return result;
            })
          }
        >
          Add
        </button>
      </div>
      {items.length === 0 ? (
        <p style={{ fontSize: 13.5, color: "var(--color-neutral-600)", margin: 0 }}>
          Nothing listed yet. Whatever is in here is skipped when a shopping list is built from the week&rsquo;s meals.
        </p>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {items.map((it) => (
            <span
              key={it.item_key}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                minHeight: 32,
                padding: "0 6px 0 12px",
                borderRadius: 999,
                fontSize: 13,
                background: "color-mix(in srgb, var(--color-switch-on) 15%, transparent)",
              }}
            >
              {it.name}
              <button
                type="button"
                onClick={() => run(() => removePantryItemAction(it.item_key))}
                disabled={pending}
                aria-label={`Remove ${it.name} from the pantry`}
                style={{ border: 0, background: "none", cursor: "pointer", padding: 4, display: "flex", color: "var(--color-neutral-700)" }}
              >
                <Icon name="x" size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      {error && <div style={{ fontSize: 12.5, color: "var(--cal-occasion)", marginTop: 6 }}>{error}</div>}
    </div>
  );
}
