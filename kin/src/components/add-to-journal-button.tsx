"use client";

import { useState, useTransition } from "react";
import { addActivityToJournalAction } from "@/lib/actions/planner";

export function AddToJournalButton({ activityId }: { activityId: string }) {
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState<string | null>(null);

  return (
    <div style={{ marginTop: 8 }}>
      <button
        type="button"
        className="btn btn-secondary"
        style={{ fontSize: 13 }}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const { error } = await addActivityToJournalAction(activityId);
            setFailed(error);
          })
        }
      >
        {pending ? "Adding…" : "ADD TO JOURNAL"}
      </button>
      {/* Without this the button reported success by going quiet, which is the
          same thing it did when the write failed. */}
      {failed && (
        <p role="alert" style={{ fontSize: 13, color: "var(--danger, #d33)", marginTop: 6 }}>
          {failed}
        </p>
      )}
    </div>
  );
}
