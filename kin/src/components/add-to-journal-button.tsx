"use client";

import { useTransition } from "react";
import { addActivityToJournalAction } from "@/lib/actions/planner";

export function AddToJournalButton({ activityId }: { activityId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className="btn btn-secondary"
      style={{ fontSize: 11.5, marginTop: 8 }}
      disabled={pending}
      onClick={() => startTransition(() => addActivityToJournalAction(activityId))}
    >
      {pending ? "Adding…" : "ADD TO JOURNAL"}
    </button>
  );
}
