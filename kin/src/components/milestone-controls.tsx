"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateMilestoneAction, deleteMilestoneAction } from "@/lib/actions/journal";
import { DeleteButton } from "@/components/delete-button";
import { DateInput } from "@/components/date-input";

export function MilestoneControls({
  milestoneId,
  title,
  date,
  memberId,
}: {
  milestoneId: string;
  title: string;
  date: string;
  memberId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [milestoneTitle, setMilestoneTitle] = useState(title);
  const [milestoneDate, setMilestoneDate] = useState(date);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  if (!open) {
    return (
      <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
        <button type="button" style={{ fontSize: 12.5, fontWeight: 600, color: "var(--color-accent-700)", background: "none", border: "none", padding: 0, cursor: "pointer" }} onClick={() => setOpen(true)}>
          EDIT
        </button>
        <DeleteButton label="Delete milestone" confirmText="Delete this milestone? This can't be undone." onDelete={() => deleteMilestoneAction(milestoneId)} style={{ padding: 0 }} />
      </div>
    );
  }

  return (
    <div style={{ marginTop: 6, maxWidth: 280 }}>
      {error && <p style={{ color: "var(--color-accent-700)", fontSize: 12.5, margin: "0 0 6px" }}>{error}</p>}
      <div className="field" style={{ marginBottom: 6 }}>
        <input aria-label="Title" className="input" value={milestoneTitle} onChange={(e) => setMilestoneTitle(e.target.value)} style={{ minHeight: 36, fontSize: 13 }} />
      </div>
      <div className="field" style={{ marginBottom: 6 }}>
        <DateInput aria-label="Date" className="input" value={milestoneDate} onChange={(e) => setMilestoneDate(e.target.value)} style={{ minHeight: 36, fontSize: 13 }} />
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <button
          type="button"
          className="btn btn-secondary"
          style={{ fontSize: 12, padding: "0 8px", minHeight: 26 }}
          disabled={busy}
          onClick={() => { setOpen(false); setMilestoneTitle(title); setMilestoneDate(date); setError(null); }}
        >
          CANCEL
        </button>
        <button
          type="button"
          className="btn btn-primary"
          style={{ fontSize: 12, padding: "0 8px", minHeight: 26 }}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const result = await updateMilestoneAction({ milestoneId, title: milestoneTitle, date: milestoneDate, memberId });
            setBusy(false);
            if (result.error) return setError(result.error);
            setOpen(false);
            router.refresh();
          }}
        >
          {busy ? "SAVING…" : "SAVE"}
        </button>
      </div>
    </div>
  );
}
