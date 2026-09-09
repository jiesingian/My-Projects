"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  updateConditionEntryAction,
  deleteConditionEntryAction,
  deleteConditionAction,
  updateLabAction,
  deleteLabAction,
} from "@/lib/actions/health";
import { DeleteButton } from "@/components/delete-button";
import { DateInput } from "@/components/date-input";

const rowStyle: React.CSSProperties = { display: "flex", gap: 6, marginTop: 4 };
const smallBtn: React.CSSProperties = { fontSize: 12, padding: "0 8px", minHeight: 26 };

export function ConditionEntryControls({ entryId, memberId, date, note }: { entryId: string; memberId: string; date: string; note: string }) {
  const [open, setOpen] = useState(false);
  const [entryDate, setEntryDate] = useState(date);
  const [entryNote, setEntryNote] = useState(note);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  if (!open) {
    return (
      <div style={rowStyle}>
        <button type="button" className="btn btn-secondary" style={smallBtn} onClick={() => setOpen(true)}>
          EDIT
        </button>
        <DeleteButton
          label="Delete entry"
          confirmText="Delete this entry? This can't be undone."
          onDelete={() => deleteConditionEntryAction(entryId, memberId)}
        />
      </div>
    );
  }

  return (
    <div style={{ marginTop: 6 }}>
      {error && <p style={{ color: "var(--color-accent-700)", fontSize: 12.5, margin: "0 0 6px" }}>{error}</p>}
      <div className="field" style={{ marginBottom: 6 }}>
        <DateInput aria-label="Entry date" className="input" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} style={{ minHeight: 36, fontSize: 13 }} />
      </div>
      <div className="field" style={{ marginBottom: 6 }}>
        <textarea aria-label="Note" className="input" value={entryNote} onChange={(e) => setEntryNote(e.target.value)} style={{ fontSize: 13 }} />
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <button type="button" className="btn btn-secondary" style={smallBtn} disabled={busy} onClick={() => { setOpen(false); setEntryDate(date); setEntryNote(note); setError(null); }}>
          CANCEL
        </button>
        <button
          type="button"
          className="btn btn-primary"
          style={smallBtn}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const result = await updateConditionEntryAction({ entryId, memberId, date: entryDate, note: entryNote });
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

export function ConditionDeleteButton({ conditionId, memberId }: { conditionId: string; memberId: string }) {
  return (
    <DeleteButton
      label="Delete condition"
      confirmText="Delete this condition and everything logged under it? This can't be undone."
      onDelete={() => deleteConditionAction(conditionId, memberId)}
    />
  );
}

export function LabControls({ labId, memberId, date, name, result }: { labId: string; memberId: string; date: string; name: string; result: string }) {
  const [open, setOpen] = useState(false);
  const [testDate, setTestDate] = useState(date);
  const [labName, setLabName] = useState(name);
  const [labResult, setLabResult] = useState(result);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  if (!open) {
    return (
      <div style={rowStyle}>
        <button type="button" className="btn btn-secondary" style={smallBtn} onClick={() => setOpen(true)}>
          EDIT
        </button>
        <DeleteButton label="Delete lab result" confirmText="Delete this lab result? This can't be undone." onDelete={() => deleteLabAction(labId, memberId)} />
      </div>
    );
  }

  return (
    <div style={{ marginTop: 6 }}>
      {error && <p style={{ color: "var(--color-accent-700)", fontSize: 12.5, margin: "0 0 6px" }}>{error}</p>}
      <div className="field" style={{ marginBottom: 6 }}>
        <input aria-label="Test name" className="input" value={labName} onChange={(e) => setLabName(e.target.value)} style={{ minHeight: 36, fontSize: 13 }} />
      </div>
      <div className="field" style={{ marginBottom: 6 }}>
        <DateInput aria-label="Test date" className="input" value={testDate} onChange={(e) => setTestDate(e.target.value)} style={{ minHeight: 36, fontSize: 13 }} />
      </div>
      <div className="field" style={{ marginBottom: 6 }}>
        <input aria-label="Result" className="input" value={labResult} onChange={(e) => setLabResult(e.target.value)} style={{ minHeight: 36, fontSize: 13 }} />
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <button
          type="button"
          className="btn btn-secondary"
          style={smallBtn}
          disabled={busy}
          onClick={() => { setOpen(false); setTestDate(date); setLabName(name); setLabResult(result); setError(null); }}
        >
          CANCEL
        </button>
        <button
          type="button"
          className="btn btn-primary"
          style={smallBtn}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const result2 = await updateLabAction({ labId, memberId, date: testDate, name: labName, result: labResult });
            setBusy(false);
            if (result2.error) return setError(result2.error);
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
