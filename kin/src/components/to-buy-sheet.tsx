"use client";

import { useId, useState, useTransition } from "react";
import { AnimatedSheet } from "@/components/animated-sheet";
import { Icon } from "@/components/icons";
import { toast } from "@/components/toast";
import { addLinesToBuyListAction } from "@/lib/actions/chat";
import { LIST_ADD_MAX_ITEMS } from "@/lib/list-add";

/** "To buy" from a chat message: the things Kin read out of it, one line
 * each, for a quick look before they go on the list. Rules split "pabili ng
 * gatas at itlog" well and "mac and cheese" badly; this is where a person
 * fixes the second in a tap, so nothing lands on the list unseen. */
export function ToBuySheet({ lines, onClose }: { lines: string[] | null; onClose: () => void }) {
  const titleId = useId();
  const [rows, setRows] = useState<string[] | null>(null);
  const [opened, setOpened] = useState<string[] | null>(null);
  const [pending, startTransition] = useTransition();

  // A new message's lines replace whatever was being edited before.
  if (lines !== opened) {
    setOpened(lines);
    setRows(lines);
  }
  const kept = (rows ?? []).filter((r) => r.trim());

  const add = () =>
    startTransition(async () => {
      const result = await addLinesToBuyListAction(kept);
      if (result.added?.length) {
        toast.success(
          result.added.length === 1
            ? `Added ${result.added[0]} to the To-Buy list.`
            : `Added ${result.added.length} things to the To-Buy list: ${result.added.join(", ")}.`,
        );
      }
      if (result.error) toast.error(result.error);
      else onClose();
    });

  return (
    <AnimatedSheet open={lines !== null} onClose={onClose} labelledBy={titleId} panelClassName="sheet-panel--confirm">
      <h2 id={titleId} style={{ fontSize: "1.125rem", margin: "0 0 0.25rem" }}>
        Add to the To-Buy list
      </h2>
      <p style={{ margin: "0 0 0.75rem", fontSize: "0.8125rem", color: "var(--color-neutral-600)" }}>
        Fix a name or an amount (&ldquo;rice 2kg&rdquo;), or take one off.
      </p>
      <div style={{ display: "grid", gap: "0.5rem", maxHeight: "50vh", overflowY: "auto" }}>
        {(rows ?? []).map((row, i) => (
          <div key={i} style={{ display: "flex", gap: "0.375rem", alignItems: "center" }}>
            <input
              className="input"
              style={{ flex: 1 }}
              value={row}
              maxLength={160}
              aria-label={`Thing ${i + 1}`}
              onChange={(e) => setRows((prev) => (prev ?? []).map((r, j) => (j === i ? e.target.value : r)))}
            />
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              aria-label={`Take ${row || "this"} off`}
              onClick={() => setRows((prev) => (prev ?? []).filter((_, j) => j !== i))}
            >
              <Icon name="x" size="0.875rem" />
            </button>
          </div>
        ))}
        {(rows?.length ?? 0) < LIST_ADD_MAX_ITEMS && (
          <button type="button" className="btn btn-ghost" style={{ justifySelf: "start" }} onClick={() => setRows((prev) => [...(prev ?? []), ""])}>
            <Icon name="plus" size="0.875rem" /> Another
          </button>
        )}
      </div>
      <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", marginTop: "1rem" }}>
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" disabled={pending || kept.length === 0} onClick={add}>
          {pending ? "Adding…" : kept.length === 1 ? "Add 1 thing" : `Add ${kept.length} things`}
        </button>
      </div>
    </AnimatedSheet>
  );
}
