"use client";

import { useState, useTransition } from "react";
import { Icon } from "@/components/icons";
import { addSpecialDayAction, removeSpecialDayAction } from "@/lib/actions/special-days";
import type { SpecialDay } from "@/lib/queries/special-days";

/** Settings → Household: the household's own special days, beside the public
 * holidays Kin already knows. For the day the Palace proclaims a week out, or
 * the town fiesta nobody outside the town has heard of. */
export function SpecialDays({ days }: { days: SpecialDay[] }) {
  const [day, setDay] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const add = () =>
    startTransition(async () => {
      const r = await addSpecialDayAction(day, name);
      setError(r.error);
      if (!r.error) {
        setDay("");
        setName("");
      }
    });

  return (
    <div className="kin-specialdays">
      {days.length > 0 && (
        <ul className="kin-specialdays-list">
          {days.map((d) => (
            <li key={d.id}>
              <span>
                {d.name}
                <span className="kin-specialdays-date"> · {new Date(`${d.date}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</span>
              </span>
              <button
                type="button"
                className="btn btn-ghost btn-icon"
                aria-label={`Remove ${d.name}`}
                disabled={pending}
                onClick={() => startTransition(async () => setError((await removeSpecialDayAction(d.id)).error))}
              >
                <Icon name="trash" size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="kin-specialdays-form">
        <input className="input" type="date" aria-label="Date" value={day} onChange={(e) => setDay(e.target.value)} style={{ minHeight: "2.5rem" }} disabled={pending} />
        <input className="input" aria-label="Name of the day" placeholder="Town fiesta" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} style={{ minHeight: "2.5rem" }} disabled={pending} />
        <button type="button" className="btn btn-secondary" style={{ minHeight: "2.5rem" }} disabled={pending || !day || !name.trim()} onClick={add}>
          {pending ? "…" : "Add"}
        </button>
      </div>
      {error && <p role="alert" style={{ color: "var(--color-accent-700)", fontSize: "0.8125rem", margin: "6px 0 0" }}>{error}</p>}
    </div>
  );
}
