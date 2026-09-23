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
    <section style={{ marginBottom: "1.625rem" }}>
      <h3 className="kin-eyebrow">Today&rsquo;s tasks</h3>
      {dueToday.map((t) => (
        <TaskRow key={t.id} task={t} />
      ))}
      {overdueOnly.length > 0 && (
        <Blueprint style={{ padding: "0.75rem 0.875rem", display: "flex", alignItems: "center", gap: "0.625rem", marginBottom: "0.5625rem" }}>
          <Icon name="info" size={16} style={{ color: "var(--cal-money)", flex: "none" }} />
          <span style={{ flex: 1, fontSize: "0.84375rem" }}>
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
        padding: "0.8125rem",
        marginBottom: "0.5625rem",
        boxShadow:
          today.status === "done" && today.approval !== "pending" && today.approval !== "rejected"
            ? "inset 3px 0 0 var(--color-switch-on)"
            : !today.status && task.overdue.length > 0
              ? "inset 3px 0 0 var(--cal-money)"
              : undefined,
      }}
    >
      <div style={{ display: "flex", gap: "0.625rem", alignItems: "flex-start" }}>
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
          <div style={{ font: "600 0.96875rem/1.2 var(--font-heading)" }}>{task.title}</div>
          <div style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)", marginTop: "0.125rem" }}>
            {task.rotates && today.assignee ? `${today.assignee.name.split(" ")[0]}'s turn` : whoFor}
            {task.timeOfDay ? ` · ${formatTimeOfDay(task.timeOfDay)}` : ""}
          </div>
        </div>
      </div>

      <div style={{ marginTop: "0.625rem" }}>
        {!today.status ? (
          <>
            <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap", alignItems: "center" }}>
              <button
                type="button"
                className="btn btn-primary"
                disabled={pending}
                onClick={() => log("done")}
                style={{ minHeight: "2rem", fontSize: "0.8125rem", padding: "0 0.875rem", gap: "0.3125rem" }}
              >
                <Icon name="check" size={14} />
                Done
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={pending}
                onClick={() => log("skipped")}
                style={{ minHeight: "2rem", fontSize: "0.8125rem", padding: "0 0.75rem" }}
              >
                Skip
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setNoteOpen((o) => !o)}
                style={{ minHeight: "2rem", fontSize: "0.78125rem", padding: "0 0.5rem", gap: "0.25rem" }}
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
                  style={{ marginTop: "0.4375rem", fontSize: "0.8125rem", width: "100%", resize: "vertical" }}
                />
              </>
            )}
          </>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4375rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              {/* A child's "done" is a claim until a grown-up says otherwise,
                  and saying "Done today" to them would be a small lie the
                  first time one got turned down. */}
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.3125rem",
                  fontSize: "0.78125rem",
                  fontWeight: 500,
                  color:
                    today.approval === "rejected"
                      ? "var(--cal-occasion)"
                      : today.status === "done" && today.approval !== "pending"
                        ? "var(--color-neutral-900)"
                        : "var(--color-neutral-700)",
                }}
              >
                <Icon
                  name={today.approval === "pending" ? "clock" : today.approval === "rejected" ? "x" : today.status === "done" ? "check" : "x"}
                  size={14}
                />
                {today.approval === "pending"
                  ? "Waiting for a grown-up"
                  : today.approval === "rejected"
                    ? "Sent back — have another go"
                    : today.status === "done"
                      ? "Done today"
                      : "Skipped today"}
              </span>
              <button type="button" className="btn btn-ghost" disabled={pending} onClick={undo} style={{ minHeight: "1.75rem", fontSize: "0.75rem", padding: "0 0.5rem" }}>
                Undo
              </button>
            </div>

            {editingNote ? (
              <div style={{ display: "flex", gap: "0.375rem", alignItems: "flex-start" }}>
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
                  style={{ fontSize: "0.8125rem", flex: 1, resize: "vertical" }}
                />
                <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={pending}
                    onClick={saveNote}
                    style={{ minHeight: "1.75rem", fontSize: "0.75rem", padding: "0 0.625rem" }}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setEditingNote(false)}
                    style={{ minHeight: "1.75rem", fontSize: "0.75rem", padding: "0 0.5rem" }}
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
                  fontSize: "0.8125rem",
                  color: "var(--color-neutral-700)",
                  lineHeight: 1.4,
                }}
              >
                &ldquo;{today.note}&rdquo; <span style={{ fontSize: "0.71875rem", color: "var(--color-neutral-500)" }}>· edit</span>
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setNoteDraft("");
                  setEditingNote(true);
                }}
                style={{ minHeight: "1.75rem", fontSize: "0.75rem", padding: "0 0.5rem", alignSelf: "flex-start" }}
              >
                + Add a note
              </button>
            )}
          </div>
        )}
        {error && <div style={{ fontSize: "0.78125rem", color: "var(--cal-occasion)", marginTop: "0.375rem" }}>{error}</div>}
      </div>
    </Blueprint>
  );
}
