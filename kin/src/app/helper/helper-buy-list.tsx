"use client";

import { useOptimistic, useState, useTransition } from "react";
import { Icon } from "@/components/icons";
import { formatQuantity } from "@/lib/grocery";
import { helperAddAction, helperTickAction } from "@/lib/actions/helpers";
import { useBuyListLive } from "@/lib/buy-list-live";

type Item = { item_id: string; item_name: string; quantity: number | null; unit: string | null; section: string; checked: boolean; added_by: string | null };

/** The household's open To-Buy list, as the helper sees it: the same rows the
 * family sees, so a tick here is a tick on their list. Tick, untick, add --
 * no prices, no amounts to change, nothing to delete. Live: what the family
 * adds or ticks shows here without reopening the page (lib/buy-list-live). */
export function HelperBuyList({ familyId, items }: { familyId: string; items: Item[] }) {
  useBuyListLive(familyId);
  const [shown, setShown] = useOptimistic(items, (list, { id, checked }: { id: string; checked: boolean }) =>
    list.map((i) => (i.item_id === id ? { ...i, checked } : i)),
  );
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const tick = (id: string, checked: boolean) =>
    startTransition(async () => {
      setShown({ id, checked });
      setError((await helperTickAction(id, checked)).error);
    });

  const add = () =>
    startTransition(async () => {
      const r = await helperAddAction(familyId, name);
      setError(r.error);
      if (!r.error) setName("");
    });

  return (
    <div>
      {shown.length === 0 ? (
        <p style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)", margin: "0 0 0.75rem" }}>The list is empty.</p>
      ) : (
        <ul style={{ listStyle: "none", margin: "0 0 0.75rem", padding: 0, display: "grid", gap: "0.125rem" }}>
          {shown.map((i) => (
            <li key={i.item_id}>
              <button
                type="button"
                role="checkbox"
                aria-checked={i.checked}
                onClick={() => tick(i.item_id, !i.checked)}
                style={{ display: "flex", alignItems: "center", gap: "0.625rem", width: "100%", minHeight: "2.75rem", background: "none", border: 0, padding: "0.25rem 0", textAlign: "left", cursor: "pointer", color: "var(--color-text)" }}
              >
                {/* The family list's own tick (buy-list.tsx), so it reads the same. */}
                <span
                  aria-hidden="true"
                  className="kin-tick"
                  style={{
                    flex: "none",
                    width: "1.5rem",
                    height: "1.5rem",
                    borderRadius: 999,
                    border: `1.5px solid ${i.checked ? "var(--color-accent)" : "var(--color-divider)"}`,
                    background: i.checked ? "var(--color-accent)" : "transparent",
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {i.checked && <Icon name="check" size={14} />}
                </span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span className="kin-strike" data-on={i.checked} style={{ display: "block", fontSize: "0.9375rem", overflowWrap: "anywhere", color: i.checked ? "var(--color-neutral-500)" : undefined }}>
                    {i.item_name}
                    {i.quantity ? <span style={{ color: "var(--color-neutral-600)" }}> · {formatQuantity(i.quantity, i.unit)}</span> : null}
                  </span>
                  {i.added_by && <span style={{ display: "block", fontSize: "0.71875rem", color: "var(--color-neutral-600)" }}>Added by {i.added_by}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <input
          className="input"
          aria-label="Add to the list"
          placeholder="Add: itlog, sabon…"
          maxLength={150}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && name.trim() && !pending) add();
          }}
          style={{ minHeight: "2.75rem", minWidth: 0, flex: 1, fontSize: "1rem" }}
          disabled={pending}
        />
        <button type="button" className="btn btn-primary btn-icon" aria-label="Add" style={{ minHeight: "2.75rem", minWidth: "2.75rem" }} disabled={pending || !name.trim()} onClick={add}>
          <Icon name="plus" size={18} />
        </button>
      </div>
      {error && <p role="alert" style={{ color: "var(--color-accent-700)", fontSize: "0.8125rem", margin: "6px 0 0" }}>{error}</p>}
    </div>
  );
}
