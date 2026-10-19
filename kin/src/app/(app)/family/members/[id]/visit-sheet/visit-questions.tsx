"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ErrorText } from "@/components/form";
import { Icon } from "@/components/icons";
import { addVisitQuestionAction, editVisitQuestionAction, removeVisitQuestionAction, setVisitQuestionDoneAction } from "@/lib/actions/visit-questions";

type Question = { id: string; body: string; done: boolean };

/** The family's questions for the doctor: add, tick off once asked, edit,
 * remove. Kept per person, so an unasked question waits for the next visit.
 * Ticked ones are left off the printout. */
export function VisitQuestions({ memberId, questions }: { memberId: string; questions: Question[] }) {
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const run = (fn: () => Promise<{ error: string | null }>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      setError(r.error);
      if (!r.error) {
        after?.();
        router.refresh();
      }
    });

  return (
    <div>
      <ErrorText message={error} />
      {questions.length === 0 && <p className="kin-visit-none">None yet. Add what you want to ask.</p>}
      <ul className="kin-visit-questions">
        {questions.map((q) => (
          <li key={q.id} data-done={q.done || undefined}>
            {editing === q.id ? (
              <form
                className="kin-print-hide"
                style={{ display: "flex", gap: "0.375rem", flex: 1 }}
                onSubmit={(e) => {
                  e.preventDefault();
                  run(() => editVisitQuestionAction(memberId, q.id, editText), () => setEditing(null));
                }}
              >
                <input className="input" aria-label="Edit question" value={editText} maxLength={300} onChange={(e) => setEditText(e.target.value)} style={{ flex: 1, minHeight: "2.25rem", fontSize: "0.875rem" }} />
                <button type="submit" className="btn btn-primary" disabled={pending} style={{ minHeight: "2.25rem", padding: "0 0.625rem" }}>
                  Save
                </button>
              </form>
            ) : (
              <>
                <label style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start", flex: 1, minWidth: 0 }}>
                  <input
                    type="checkbox"
                    className="kin-print-hide"
                    checked={q.done}
                    disabled={pending}
                    aria-label={q.done ? "Asked; mark not asked" : "Mark as asked"}
                    onChange={(e) => run(() => setVisitQuestionDoneAction(memberId, q.id, e.target.checked))}
                    style={{ marginTop: "0.25rem" }}
                  />
                  <span style={{ overflowWrap: "anywhere", textDecoration: q.done ? "line-through" : undefined }}>{q.body}</span>
                </label>
                <button
                  type="button"
                  className="btn btn-secondary"
                  aria-label={`Edit “${q.body}”`}
                  onClick={() => {
                    setEditing(q.id);
                    setEditText(q.body);
                  }}
                  style={{ minHeight: "2rem", padding: "0 0.5rem" }}
                >
                  Edit
                </button>
                <button type="button" className="btn btn-secondary" aria-label={`Remove “${q.body}”`} disabled={pending} onClick={() => run(() => removeVisitQuestionAction(memberId, q.id))} style={{ minHeight: "2rem", padding: "0 0.5rem" }}>
                  <Icon name="trash" size={13} />
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
      <form
        className="kin-print-hide"
        style={{ display: "flex", gap: "0.375rem", marginTop: "0.5rem" }}
        onSubmit={(e) => {
          e.preventDefault();
          run(() => addVisitQuestionAction(memberId, draft), () => setDraft(""));
        }}
      >
        <input className="input" aria-label="A question to ask" value={draft} maxLength={300} placeholder="Is the cough worth an X-ray?" onChange={(e) => setDraft(e.target.value)} style={{ flex: 1, minHeight: "2.5rem", fontSize: "0.875rem" }} />
        <button type="submit" className="btn btn-primary" disabled={pending || !draft.trim()} style={{ minHeight: "2.5rem", padding: "0 0.75rem" }}>
          Add
        </button>
      </form>
    </div>
  );
}
