"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "@/components/toast";
import { setRsvpAction } from "@/lib/actions/event-rsvp";
import { RSVP_ANSWERS, type RsvpAnswer } from "@/lib/event-rsvp";
import { guestHeadsLabel, headsIn } from "@/lib/event-guests";

/** `heads`: how many this one stands for -- a guest by link answers for
 * their whole party (20261020231000); a member is one. */
type Person = { id: string; name: string; heads?: number };

/** Who's coming, on an event's own screen (20261014090000): a Going / Maybe /
 * Can't go choice for each person `me` answers for (themselves, and a
 * grown-up's managed children), then everyone asked, grouped by answer, with
 * who hasn't answered yet. Read-only once the event is over. */
export function EventRsvp({
  eventId,
  open,
  mine,
  groups,
}: {
  eventId: string;
  open: boolean;
  /** The people `me` may answer for, with their current answer. */
  mine: (Person & { answer: RsvpAnswer | null })[];
  groups: Record<RsvpAnswer | "waiting", Person[]>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const choose = (memberId: string, current: RsvpAnswer | null, next: RsvpAnswer) =>
    start(async () => {
      // Tapping the answer already chosen takes it back.
      const r = await setRsvpAction(eventId, memberId, current === next ? null : next);
      if (r.error) toast.error(r.error);
      router.refresh();
    });
  const first = (n: string) => n.split(" ")[0];
  // A guest's name is shown whole, with "(by link)" and how many they are.
  const shown = (p: Person) => (p.heads !== undefined ? guestHeadsLabel(p.name, p.heads) : first(p.name));
  const line = (label: string, people: Person[]) =>
    people.length > 0 && (
      <div style={{ fontSize: "0.84375rem", marginTop: "0.375rem" }}>
        <span style={{ fontWeight: 600 }}>
          {label} · {headsIn(people)}
        </span>
        <span style={{ color: "var(--color-neutral-600)" }}> {people.map(shown).join(", ")}</span>
      </div>
    );

  return (
    <div>
      {open &&
        mine.map((p) => (
          <div key={p.id} style={{ marginBottom: "0.625rem" }}>
            {mine.length > 1 && <div style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)", marginBottom: "0.25rem" }}>{first(p.name)}</div>}
            <div role="group" aria-label={`${p.name}: are you coming?`} style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap" }}>
              {RSVP_ANSWERS.map((a) => (
                <button
                  key={a.key}
                  type="button"
                  className="chip"
                  data-active={p.answer === a.key}
                  aria-pressed={p.answer === a.key}
                  disabled={pending}
                  onClick={() => choose(p.id, p.answer, a.key)}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      {!open && <div style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)" }}>This event is over; the answers are kept as they were.</div>}
      {line("Going", groups.going)}
      {line("Maybe", groups.maybe)}
      {line("Can't go", groups.no)}
      {line(open ? "Not answered yet" : "Didn't answer", groups.waiting)}
    </div>
  );
}
