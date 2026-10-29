"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { toast } from "@/components/toast";
import { deleteWithUndo, useHiddenRows } from "@/lib/undo-delete";
import { addNoteAction, deleteNoteAction, updateNoteAction } from "@/lib/actions/notes";
import { NOTE_MAX, noteMatches, noteTitle } from "@/lib/personal-notes";

type Note = { id: string; body: string; updatedAt: string };

function when(iso: string, tz: string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso));
}

/** The list of a person's private notes: write one at the top, search, and
 * edit or delete each in place (lib/personal-notes.ts). */
export function NotesBoard({ notes, startWriting, tz }: { notes: Note[]; startWriting: boolean; tz: string }) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const hidden = useHiddenRows();
  const visible = useMemo(() => notes.filter((n) => !hidden.has(n.id)), [notes, hidden]);
  const shown = useMemo(() => visible.filter((n) => noteMatches(n.body, query)), [visible, query]);

  const save = () =>
    startTransition(async () => {
      const r = await addNoteAction(draft);
      if (r.error) return void toast.error(r.error);
      setDraft("");
      router.refresh();
    });

  const saveEdit = () =>
    startTransition(async () => {
      if (!editing) return;
      const r = await updateNoteAction(editing.id, editing.body);
      if (r.error) return void toast.error(r.error);
      setEditing(null);
      router.refresh();
    });

  // Gone at once, with Undo for a few seconds, rather than a confirm first
  // (lib/undo-delete.ts).
  const remove = (note: Note) =>
    deleteWithUndo({
      id: note.id,
      message: `Deleted "${noteTitle(note.body)}"`,
      remove: () => deleteNoteAction(note.id),
      onDeleted: () => router.refresh(),
    });

  return (
    <div>
      <p style={{ margin: "0.25rem 0 0.75rem", fontSize: "0.8125rem", color: "var(--color-neutral-600)" }}>
        <Icon name="shieldCheck" size="0.8125rem" /> Only you can see these. Not your family, not a parent.
      </p>

      <textarea
        className="input"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="A quick note…"
        aria-label="New note"
        rows={3}
        maxLength={NOTE_MAX}
        autoFocus={startWriting}
        style={{ width: "100%", resize: "vertical", fontSize: "1rem" }}
      />
      <div style={{ display: "flex", justifyContent: "flex-end", margin: "0.5rem 0 1.25rem" }}>
        <button type="button" className="btn btn-primary" onClick={save} disabled={pending || !draft.trim()}>
          Save note
        </button>
      </div>

      {visible.length > 0 && (
        <input
          className="input"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your notes"
          aria-label="Search your notes"
          style={{ width: "100%", marginBottom: "0.75rem", fontSize: "1rem" }}
        />
      )}

      {visible.length === 0 ? (
        <p style={{ color: "var(--color-neutral-600)" }}>No notes yet. Write one above.</p>
      ) : shown.length === 0 ? (
        <p style={{ color: "var(--color-neutral-600)" }}>No note has &ldquo;{query.trim()}&rdquo; in it.</p>
      ) : (
        <ul data-kin-arrows="list" style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "0.625rem" }}>
          {shown.map((n) => (
            <li key={n.id} data-kin-arrow-item tabIndex={0} className="kin-note-card" style={{ padding: "0.75rem 0.875rem", background: "var(--color-surface)", boxShadow: "var(--shadow-sm)", borderRadius: "var(--radius-card)" }}>
              {editing?.id === n.id ? (
                <>
                  <textarea
                    className="input"
                    value={editing.body}
                    onChange={(e) => setEditing({ id: n.id, body: e.target.value })}
                    aria-label="Edit note"
                    rows={4}
                    maxLength={NOTE_MAX}
                    autoFocus
                    style={{ width: "100%", resize: "vertical", fontSize: "1rem" }}
                  />
                  <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", marginTop: "0.5rem" }}>
                    <button type="button" className="btn btn-secondary" onClick={() => setEditing(null)}>
                      Cancel
                    </button>
                    <button type="button" className="btn btn-primary" onClick={saveEdit} disabled={pending || !editing.body.trim()}>
                      Save
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p style={{ margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{n.body}</p>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.25rem", marginTop: "0.5rem" }}>
                    <span style={{ flex: 1, fontSize: "0.75rem", color: "var(--color-neutral-600)" }}>{when(n.updatedAt, tz)}</span>
                    <button type="button" className="btn btn-ghost" style={{ minHeight: "2rem", fontSize: "0.8125rem" }} onClick={() => setEditing({ id: n.id, body: n.body })}>
                      Edit
                    </button>
                    <button type="button" className="btn btn-ghost" style={{ minHeight: "2rem", fontSize: "0.8125rem", color: "var(--cal-occasion-ink)" }} onClick={() => void remove(n)}>
                      Delete
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
