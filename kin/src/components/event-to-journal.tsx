"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "@/components/toast";
import { addEventToJournalAction } from "@/lib/actions/planner-photos";

/** On a past event with photos: put them in the Journal as one entry, or,
 * once there, open that entry. Sits above the row's own link
 * (kin-planrow-over), so tapping it doesn't also open the event. */
export function EventToJournal({ eventId, entryId }: { eventId: string; entryId: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const style = { fontSize: "0.8125rem", fontWeight: 500, color: "var(--color-accent-700)", textDecoration: "none", background: "none", border: 0, padding: "0.25rem 0", minHeight: "2rem", cursor: "pointer" } as const;

  if (entryId) {
    return (
      <Link href={`/journal/${entryId}`} className="kin-planrow-over" style={style}>
        In the Journal →
      </Link>
    );
  }
  return (
    <button
      type="button"
      className="kin-planrow-over"
      style={style}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await addEventToJournalAction(eventId);
          if (r.error) toast.error(r.error);
          else toast.success("Added to the Journal");
          if (r.entryId) router.push(`/journal/${r.entryId}`);
        })
      }
    >
      {pending ? "Adding…" : "Add photos to Journal"}
    </button>
  );
}
