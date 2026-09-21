"use client";

import { useState, useTransition } from "react";
import { useId } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { Blueprint } from "@/components/ui";
import { logRoutineAction, clearRoutineLogAction, setRoutineLogNoteAction } from "@/lib/actions/routines";
import { ROUTINE_KIND_META, formatTimeOfDay, type RoutineKind } from "@/lib/routines";
import type { RoutineView } from "@/lib/queries/routines";

/** Today's tasks, with who is on each one, a tap to mark it done or skipped,
 * an optional note on how it went, and a way back if a tap was wrong — the
 * same jobs Planner's routine rows do, read out for the one day this page is
 * about rather than the whole week. */
export function TodayTaskList({ tasks }: { tasks: RoutineView[] }) {
  const dueToday = tasks.filter((t) => t.today);
  const overdueOnly = tasks.filter((t) => !t.today && t.overdue.length > 0);

  if (dueToday.length === 0 && overdueOnly.length === 0) return null;

  return (
    <section style={{ marginBottom: 26 }}>
      <h3 className="kin-eyebrow">Today&rsquo;s tasks</h3>
      {dueToday.map((t) => (
        <TaskRow key={t.id} task={t} />
      ))}
      {overdueOnly.length > 0 && (
        <Blueprint style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 10, marginBottom: 9 }}>
          <Icon name="info" size={16} style={{ color: "var(--cal-money)", flex: "none" }} />
          <span style={{ flex: 1, fontSize: 13.5 }}>
            {overdueOnly.length} task{overdueOnly.length === 1 ? "" : "s"} behind on other days —{" "}
            <Link href="/planner?seg=routines" style={{ color: "var(--color-accent-700)", fontWeight: 500 }}>
              catch up on Planner
            </Link>
          </span>
        </Blueprint>
      )}
    </section>
  );
}

function TaskRow({ task }: { task: RoutineView }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [editingNote, setEditingNote] = useState(false);
  const noteId = useId();
  const editId = useId();

  const today = task.today!;
  const meta = ROUTINE_KIND_META[(task.kind as RoutineKind) ?? "other"] ?? ROUTINE_KIND_META.other;
  const whoFor = task.appliesToAll
    ? "Whole family"
    : task.rotates
      ? `Taking turns · ${task.members.map((m) => m.name.split(" ")[0]).join(", ")}`
      : task.members.map((m) => m.name.split(" ")[0]).join(", ") || "House";

  const log = (status: "done" | "skipped") => {
    setError(null);
    const note = noteDraft;
    startTransition(async () => {
      const result = await logRoutineAction({ routineId: task.id, date: today.date, status, note: note || null });
      if (result.error) setError(result.error);
      setNoteOpen(false);
      setNoteDraft("");
      router.refresh();
    });
  };

  const undo = () => {
    setError(null);
    startTransition(async () => {
      const result = await clearRoutineLogAction(task.id, today.date);
      if (result.error) setError(result.error);
      router.refresh();
    });
  };

  const saveNote = () => {
    setError(null);
    startTransition(async () => {
      const result = await setRoutineLogNoteAction(task.id, today.date, noteDraft);
      if (result.error) setError(result.error);
      setEditingNote(false);
      router.refresh();
    });
  };

  return (
    <Blueprint
      style={{
        padding: 13,
        marginBottom: 9,
        boxShadow:
          today.status === "done"
            ? "inset 3px 0 0 var(--color-switch-on)"
            : !today.status && task.overdue.length > 0
              ? "inset 3px 0 0 var(--cal-money)"
              : undefined,
      }}
    >
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <span
          style={{
            width: 30,
            height: 30,
            flex: "none",
            borderRadius: 9,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--cal-schedule)",
            color: "#fff",
          }}
        >
          <Icon name={meta.icon} size={16} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: "600 15.5px/1.2 var(--font-heading)" }}>{task.title}</div>
          <div style={{ fontSize: 12.5, color: "var(--color-neutral-600)", marginTop: 2 }}>
            {task.rotates && today.assignee ? `${today.assignee.name.split(" ")[0]}'s turn` : whoFor}
            {task.timeOfDay ? ` · ${formatTimeOfDay(task.timeOfDay)}` : ""}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 10 }}>
        {!today.status ? (
          <>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <button
                type="button"
                className="btn btn-primary"
                disabled={pending}
                onClick={() => log("done")}
                style={{ minHeight: 32, fontSize: 13, padding: "0 14px", gap: 5 }}
              >
                <Icon name="check" size={14} />
                Done
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={pending}
                onClick={() => log("skipped")}
                style={{ minHeight: 32, fontSize: 13, padding: "0 12px" }}
              >
                Skip
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setNoteOpen((o) => !o)}
                style={{ minHeight: 32, fontSize: 12.5, padding: "0 8px", gap: 4 }}
              >
                <Icon name="fileText" size={13} />
                {noteOpen ? "Hide note" : "Add a note"}
              </button>
            </div>
            {noteOpen && (
              <>
                <label htmlFor={noteId} className="sr-only">
                  A note on {task.title}
                </label>
                <textarea
                  id={noteId}
                  className="input"
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  placeholder="A word on how it went — applies to whichever you tap"
                  rows={2}
                  maxLength={500}
                  style={{ marginTop: 7, fontSize: 13, width: "100%", resize: "vertical" }}
                />
              </>
            )}
          </>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  fontSize: 12.5,
                  fontWeight: 500,
                  color: today.status === "done" ? "var(--color-neutral-900)" : "var(--color-neutral-700)",
                }}
              >
                <Icon name={today.status === "done" ? "check" : "x"} size={14} />
                {today.status === "done" ? "Done today" : "Skipped today"}
              </span>
              <button type="button" className="btn btn-ghost" disabled={pending} onClick={undo} style={{ minHeight: 28, fontSize: 12, padding: "0 8px" }}>
                Undo
              </button>
            </div>

            {editingNote ? (
              <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                <label htmlFor={editId} className="sr-only">
                  Edit the note on {task.title}
                </label>
                <textarea
                  id={editId}
                  className="input"
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  rows={2}
                  maxLength={500}
                  autoFocus
                  style={{ fontSize: 13, flex: 1, resize: "vertical" }}
                />
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={pending}
                    onClick={saveNote}
                    style={{ minHeight: 28, fontSize: 12, padding: "0 10px" }}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setEditingNote(false)}
                    style={{ minHeight: 28, fontSize: 12, padding: "0 8px" }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : today.note ? (
              <button
                type="button"
                onClick={() => {
                  setNoteDraft(today.note ?? "");
                  setEditingNote(true);
                }}
                style={{
                  textAlign: "left",
                  background: "none",
                  border: 0,
                  padding: 0,
                  cursor: "pointer",
                  fontSize: 13,
                  color: "var(--color-neutral-700)",
                  lineHeight: 1.4,
                }}
              >
                &ldquo;{today.note}&rdquo; <span style={{ fontSize: 11.5, color: "var(--color-neutral-500)" }}>· edit</span>
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setNoteDraft("");
                  setEditingNote(true);
                }}
                style={{ minHeight: 28, fontSize: 12, padding: "0 8px", alignSelf: "flex-start" }}
              >
                + Add a note
              </button>
            )}
          </div>
        )}
        {error && <div style={{ fontSize: 12.5, color: "var(--cal-occasion)", marginTop: 6 }}>{error}</div>}
      </div>
    </Blueprint>
  );
}
