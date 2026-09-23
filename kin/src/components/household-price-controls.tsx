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
      <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", padding: "0.5625rem 0", borderTop: "1px solid var(--color-divider)" }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: "0.9375rem" }}>{name}</span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.3125rem",
            border: 0,
            background: "none",
            cursor: "pointer",
            fontFamily: "var(--font-body)",
            fontSize: "0.9375rem",
            color: "var(--color-text)",
            padding: "0.25rem 0.125rem",
          }}
          aria-label={`Edit the price of ${name}`}
        >
          <span style={{ fontWeight: source === "family" ? 600 : 400 }}>{peso(price)}</span>
          <span style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)" }}>/{unit}</span>
          {source === "starter" && (
            <span
              title="Kin's starting estimate — tap to set yours"
              style={{ fontSize: "0.65625rem", padding: "0.0625rem 0.3125rem", borderRadius: 999, background: "color-mix(in srgb, var(--color-text) 8%, transparent)", color: "var(--color-neutral-700)" }}
            >
              est
            </span>
          )}
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: "0.625rem 0", borderTop: "1px solid var(--color-divider)" }}>
      <div style={{ fontSize: "0.9375rem", marginBottom: "0.4375rem" }}>{name}</div>
      <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap", alignItems: "center" }}>
        <input
          className="input"
          type="number"
          step="0.01"
          min="0"
          inputMode="decimal"
          value={value}
          onChange={(ev) => setValue(ev.target.value)}
          style={{ minHeight: "2.5rem", width: "6.875rem", fontSize: "0.9375rem" }}
          aria-label="Price"
          autoFocus
        />
        <select className="input" value={unitValue} onChange={(ev) => setUnitValue(ev.target.value)} style={{ minHeight: "2.5rem", width: "6rem", fontSize: "0.875rem" }} aria-label="Unit">
          {[...new Set([unit, ...UNITS])].map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn btn-primary"
          style={{ minHeight: "2.5rem", fontSize: "0.8125rem", padding: "0 0.875rem" }}
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
            style={{ minHeight: "2.5rem", fontSize: "0.78125rem", padding: "0 0.5rem" }}
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
        <button type="button" className="btn btn-ghost" style={{ minHeight: "2.5rem", fontSize: "0.78125rem", padding: "0 0.5rem" }} onClick={() => setEditing(false)}>
          Cancel
        </button>
      </div>
      {error && <div style={{ fontSize: "0.78125rem", color: "var(--cal-occasion)", marginTop: "0.375rem" }}>{error}</div>}
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
      <button type="button" className="btn btn-secondary btn-block" style={{ minHeight: "2.75rem", fontSize: "0.875rem", marginTop: "0.875rem" }} onClick={() => setOpen(true)}>
        <Icon name="plus" size={15} /> Add an item to the price book
      </button>
    );
  }

  return (
    <div style={{ marginTop: "0.875rem", padding: "0.8125rem", borderRadius: 14, background: "color-mix(in srgb, var(--color-text) 4%, transparent)" }}>
      <input className="input" placeholder="Item name" value={name} onChange={(e) => setName(e.target.value)} maxLength={150} style={{ minHeight: "2.625rem", marginBottom: "0.5rem" }} />
      <div style={{ display: "flex", gap: "0.375rem", marginBottom: "0.5rem" }}>
        <input className="input" type="number" step="0.01" min="0" inputMode="decimal" placeholder="Price" value={price} onChange={(e) => setPrice(e.target.value)} style={{ minHeight: "2.625rem", flex: 1 }} />
        <select className="input" value={unit} onChange={(e) => setUnit(e.target.value)} style={{ minHeight: "2.625rem", width: 100 }}>
          {UNITS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      </div>
      <select className="input" value={section} onChange={(e) => setSection(e.target.value)} style={{ minHeight: "2.625rem", marginBottom: "0.625rem" }}>
        {MARKET_SECTIONS.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <div style={{ display: "flex", gap: "0.375rem" }}>
        <button
          type="button"
          className="btn btn-primary"
          style={{ flex: 1, minHeight: "2.625rem", fontSize: "0.875rem" }}
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
        <button type="button" className="btn btn-ghost" style={{ minHeight: "2.625rem", fontSize: "0.8125rem", padding: "0 0.75rem" }} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      {error && <div style={{ fontSize: "0.78125rem", color: "var(--cal-occasion)", marginTop: "0.375rem" }}>{error}</div>}
    </div>
  );
}

/** The price for one line of the buy list, when today's shop differs from
 * the household's usual figure. */
/** What this line is expected to cost. A tap opens the editor beneath the
 * row rather than inside it: an input and a Set button never fitted next to
 * the name, the quantity and the source tag on a phone, and the half of the
 * button that overlapped the tag simply did not take the tap. */
export function BuyItemPriceButton({
  estimated,
  source,
  editing,
  onToggle,
}: {
  estimated: number | null;
  source: string;
  editing: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label="Set the price for this line"
      aria-expanded={editing}
      style={{
        border: 0,
        background: editing ? "color-mix(in srgb, var(--color-accent) 12%, transparent)" : "none",
        borderRadius: 8,
        cursor: "pointer",
        // A comfortable target, rather than the width of four characters.
        padding: "0.375rem 0.5rem",
        margin: "-6px 0",
        fontFamily: "var(--font-body)",
        fontSize: "0.84375rem",
        color: estimated == null ? "var(--color-accent)" : "var(--color-neutral-700)",
        fontWeight: source === "override" ? 600 : 400,
      }}
    >
      {estimated == null ? "price?" : peso(estimated)}
    </button>
  );
}

/** The editor itself, on its own line under the item. */
export function BuyItemPriceEditor({
  itemId,
  unitPrice,
  onClose,
}: {
  itemId: string;
  unitPrice: number | null;
  onClose: () => void;
}) {
  const { pending, error, run } = useHouseholdAction();
  const [value, setValue] = useState(unitPrice == null ? "" : String(unitPrice));

  const save = () =>
    run(async () => {
      const result = await setBuyItemPriceAction(itemId, value.trim() === "" ? null : Number(value));
      if (!result.error) onClose();
      return result;
    });

  return (
    <div style={{ display: "flex", gap: "0.375rem", alignItems: "center", padding: "0 0 0.625rem 2.1875rem" }}>
      <input
        className="input"
        type="number"
        step="0.01"
        min="0"
        inputMode="decimal"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && save()}
        style={{ minHeight: "2.375rem", flex: 1, minWidth: 0, fontSize: "0.875rem" }}
        aria-label="Price for this line"
        placeholder="What it costs today"
        autoFocus
      />
      <button type="button" className="btn btn-primary" style={{ minHeight: "2.375rem", fontSize: "0.8125rem", padding: "0 0.75rem" }} disabled={pending} onClick={save}>
        {pending ? "…" : "Set"}
      </button>
      <button type="button" className="btn btn-ghost" style={{ minHeight: "2.375rem", fontSize: "0.78125rem", padding: "0 0.5rem" }} onClick={onClose}>
        Cancel
      </button>
      {error && <span style={{ fontSize: "0.75rem", color: "var(--cal-occasion)" }}>{error}</span>}
    </div>
  );
}

/** What is already in the house. */
export function PantryControls({ items }: { items: { item_key: string; name: string; quantity: number | null; unit: string | null }[] }) {
  const { pending, error, run } = useHouseholdAction();
  const [name, setName] = useState("");

  return (
    <div>
      <div style={{ display: "flex", gap: "0.375rem", marginBottom: "0.625rem" }}>
        <input
          className="input"
          placeholder="Rice, cooking oil, soy sauce…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={150}
          style={{ minHeight: "2.625rem", flex: 1 }}
          aria-label="Something already in the house"
        />
        <button
          type="button"
          className="btn btn-primary"
          style={{ minHeight: "2.625rem", fontSize: "0.875rem", padding: "0 0.875rem" }}
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
        <p style={{ fontSize: "0.84375rem", color: "var(--color-neutral-600)", margin: 0 }}>
          Nothing listed yet. Whatever is in here is skipped when a shopping list is built from the week&rsquo;s meals.
        </p>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem" }}>
          {items.map((it) => (
            <span
              key={it.item_key}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.375rem",
                minHeight: "2rem",
                padding: "0 0.375rem 0 0.75rem",
                borderRadius: 999,
                fontSize: "0.8125rem",
                background: "color-mix(in srgb, var(--color-switch-on) 15%, transparent)",
              }}
            >
              {it.name}
              <button
                type="button"
                onClick={() => run(() => removePantryItemAction(it.item_key))}
                disabled={pending}
                aria-label={`Remove ${it.name} from the pantry`}
                style={{ border: 0, background: "none", cursor: "pointer", padding: "0.25rem", display: "flex", color: "var(--color-neutral-700)" }}
              >
                <Icon name="x" size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      {error && <div style={{ fontSize: "0.78125rem", color: "var(--cal-occasion)", marginTop: "0.375rem" }}>{error}</div>}
    </div>
  );
}
