"use client";

import { useState, useTransition } from "react";
import { Avatar } from "@/components/avatar";
import { Icon } from "@/components/icons";
import { useCalls } from "@/components/call-provider";
import { setDoseTakenAction } from "@/lib/actions/health-care";
import { initials } from "@/lib/format";

export type SimpleDose = { medicineId: string; name: string; dose: string | null; time: string; taken: boolean; late: boolean };

/** Today's doses as big ticks, one per line. Shown ticked the moment it is
 * tapped; put back, with the reason, if the tick did not save. */
export function SimpleDoses({ memberId, day, doses }: { memberId: string; day: string; doses: SimpleDose[] }) {
  const [taken, setTaken] = useState(() => new Map(doses.map((d) => [`${d.medicineId}|${d.time}`, d.taken])));
  const [failed, setFailed] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const toggle = (d: SimpleDose) => {
    const key = `${d.medicineId}|${d.time}`;
    const next = !taken.get(key);
    setTaken((m) => new Map(m).set(key, next));
    setFailed(null);
    startTransition(async () => {
      const { error } = await setDoseTakenAction({ medicineId: d.medicineId, memberId, day, time: d.time, taken: next });
      if (error) {
        setTaken((m) => new Map(m).set(key, !next));
        setFailed(error);
      }
    });
  };

  return (
    <>
      <div className="kin-simple-list">
        {doses.map((d) => {
          const on = taken.get(`${d.medicineId}|${d.time}`) === true;
          return (
            <button key={`${d.medicineId}-${d.time}`} type="button" className="kin-simple-dose" aria-pressed={on} data-late={!on && d.late ? true : undefined} onClick={() => toggle(d)}>
              <span className="kin-simple-tick" aria-hidden="true">
                {on && <Icon name="check" size="1.5rem" />}
              </span>
              <span style={{ minWidth: 0 }}>
                <span className="kin-simple-row-title">
                  {d.name}
                  {d.dose ? ` · ${d.dose}` : ""}
                </span>
                <span className="kin-simple-row-meta">
                  {d.time} · {on ? "Taken" : d.late ? "Late, tap when taken" : "Tap when taken"}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {failed && (
        <p role="alert" className="kin-simple-empty" style={{ color: "var(--color-accent-700)" }}>
          {failed}
        </p>
      )}
    </>
  );
}

/** Everyone in the household with a Kin of their own to ring, each with a
 * big Call and Video button. Rings through the app's one call screen
 * (call-provider), the same as from Chat. */
export function CallFamily() {
  const calls = useCalls();
  if (!calls) return null;
  const others = calls.members.filter((m) => m.callable && m.id !== calls.me);
  if (others.length === 0) return null;
  return (
    <div className="kin-simple-list" style={{ marginTop: "0.75rem" }}>
      {others.map((m) => {
        const first = m.name.split(" ")[0];
        return (
          <div key={m.id} className="kin-simple-person">
            <Avatar url={m.photoUrl} initials={initials(m.name)} label={m.name} size={48} clickable={false} />
            <span className="kin-simple-row-title" style={{ flex: "1 1 6rem", minWidth: 0 }}>
              {first}
            </span>
            <span className="kin-simple-person-actions">
              <button type="button" className="btn btn-secondary kin-simple-big" disabled={calls.busy} onClick={() => calls.start(m.id, false)} aria-label={`Call ${first}`}>
                <Icon name="phone" size="1.375rem" /> Call
              </button>
              <button type="button" className="btn btn-secondary kin-simple-big" disabled={calls.busy} onClick={() => calls.start(m.id, true)} aria-label={`Video call ${first}`}>
                <Icon name="video" size="1.375rem" /> Video
              </button>
            </span>
          </div>
        );
      })}
    </div>
  );
}
