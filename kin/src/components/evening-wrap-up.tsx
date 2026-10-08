"use client";

import { useState, useTransition } from "react";
import { Icon } from "@/components/icons";
import { moveOpenToTomorrowAction } from "@/lib/actions/today";
import type { WrapUp } from "@/lib/wrap-up";

/** Today after 6pm (lib/wrap-up.ts): what got done, what is still open, and
 * one tap to move the open plans to tomorrow. */
export function EveningWrapUp({ wrap }: { wrap: WrapUp }) {
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  const { done, open, movable } = wrap;

  const move = () =>
    start(async () => {
      const res = await moveOpenToTomorrowAction(movable);
      if (res.error) setNote(res.error);
      else setNote(`Moved ${res.moved} to tomorrow${res.kept ? ` · ${res.kept} stayed (repeating or already changed)` : ""}.`);
    });

  return (
    <section className="kin-wrapup" aria-label="Evening wrap-up">
      <h3 className="kin-eyebrow">This evening</h3>
      <p className="kin-wrapup-line">
        <Icon name="check" size={15} style={{ color: "var(--cal-home)" }} />
        <span>
          {done.length === 0 ? "Nothing ticked off yet today." : <><b>{done.length} done</b> · {done.join(", ")}</>}
        </span>
      </p>
      <p className="kin-wrapup-line">
        <Icon name="clock" size={15} style={{ color: "var(--cal-money)" }} />
        <span>
          {open.length === 0 ? "Nothing left open. A clear day." : <><b>{open.length} still open</b> · {open.map((o) => o.title).join(", ")}</>}
        </span>
      </p>
      {movable.length > 0 && (
        <button type="button" className="btn btn-secondary btn-block" onClick={move} disabled={pending} style={{ minHeight: "2.75rem", marginTop: "0.5rem" }}>
          {pending ? "Moving…" : `Move ${movable.length} open plan${movable.length === 1 ? "" : "s"} to tomorrow`}
        </button>
      )}
      {note && (
        <p role="status" className="kin-wrapup-note">
          {note}
        </p>
      )}
    </section>
  );
}
