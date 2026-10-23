"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { ErrorText } from "@/components/form";
import { setRsvpAction } from "@/lib/actions/event-rsvp";

/** Going / Can't go on a Today row (23 October): an event still waiting on
 * the reader's answer, answered where it is seen rather than one tap down
 * on the event's page (the push two days before opened that page). Maybe,
 * and answering for a managed child, stay on the event's page. */
export function RsvpButtons({ eventId, memberId }: { eventId: string; memberId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const answer = (value: "going" | "no") =>
    startTransition(async () => {
      setError(null);
      const r = await setRsvpAction(eventId, memberId, value);
      if (r.error) setError(r.error);
      else router.refresh();
    });
  const small = { minHeight: "2rem", fontSize: "0.8125rem", padding: "0 0.875rem", gap: "0.3125rem" } as const;
  return (
    <div style={{ marginTop: "0.625rem", display: "flex", gap: "0.375rem", flexWrap: "wrap", alignItems: "center" }}>
      <button type="button" className="btn btn-primary" disabled={pending} onClick={() => answer("going")} style={small}>
        <Icon name="check" size={14} />
        Going
      </button>
      <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => answer("no")} style={{ ...small, padding: "0 0.75rem" }}>
        Can&rsquo;t go
      </button>
      <ErrorText message={error} />
    </div>
  );
}
