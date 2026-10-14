"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "@/components/toast";
import { addEventCommentAction, deleteEventCommentAction, editEventCommentAction } from "@/lib/actions/event-thread";
import { COMMENT_MAX, commentAge } from "@/lib/event-thread";

export type EventComment = { id: string; body: string; createdAt: string; edited: boolean; author: string; mine: boolean };

/** The thread on an event's own screen (20261014100000): what everyone who
 * can see the event has said, oldest first, with who and when; your own can
 * be edited or deleted. The same shape as comments under a photo
 * (components/photo-social), on the page instead of the dark viewer. */
export function EventThread({ eventId, comments, now }: { eventId: string; comments: EventComment[]; now: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);

  const run = (fn: () => Promise<{ error: string | null }>, done?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.error) toast.error(r.error);
      else done?.();
      router.refresh();
    });
  const send = () => {
    const body = draft.trim();
    if (body) run(() => addEventCommentAction(eventId, body), () => setDraft(""));
  };
  const save = () => {
    if (editing) run(() => editEventCommentAction(editing.id, editing.body), () => setEditing(null));
  };
  const linkButton = { border: 0, background: "none", padding: 0, minHeight: "1.75rem", font: "500 0.75rem/1 var(--font-body)", color: "var(--color-accent-700)", cursor: "pointer" } as const;

  return (
    <div id="thread">
      {comments.length === 0 && <p style={{ margin: "0 0 0.5rem", fontSize: "0.84375rem", color: "var(--color-neutral-600)" }}>No comments yet. Ask a question or share a detail.</p>}
      {comments.map((c) => (
        <div key={c.id} style={{ marginBottom: "0.625rem", fontSize: "0.9375rem", lineHeight: 1.35 }}>
          {editing?.id === c.id ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                save();
              }}
              style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}
            >
              <textarea className="input" rows={2} value={editing.body} maxLength={COMMENT_MAX} onChange={(e) => setEditing({ id: c.id, body: e.target.value })} aria-label="Edit your comment" autoFocus />
              <div style={{ display: "flex", gap: "0.75rem" }}>
                <button type="submit" style={linkButton} disabled={pending || !editing.body.trim()}>
                  Save
                </button>
                <button type="button" style={{ ...linkButton, color: "var(--color-neutral-600)" }} onClick={() => setEditing(null)}>
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <>
              <span style={{ fontWeight: 650 }}>{c.author}</span> <span style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{c.body}</span>
              <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", fontSize: "0.75rem", color: "var(--color-neutral-600)" }}>
                <time dateTime={c.createdAt}>{commentAge(c.createdAt, now)}</time>
                {c.edited && <span>edited</span>}
                {c.mine && (
                  <>
                    <button type="button" style={linkButton} disabled={pending} onClick={() => setEditing({ id: c.id, body: c.body })}>
                      Edit
                    </button>
                    <button type="button" style={linkButton} disabled={pending} onClick={() => run(() => deleteEventCommentAction(c.id))} aria-label="Delete your comment">
                      Delete
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      ))}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end" }}
      >
        <textarea className="input" rows={1} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add a comment…" maxLength={COMMENT_MAX} aria-label="Add a comment" style={{ flex: 1, minWidth: 0 }} />
        <button type="submit" className="btn btn-primary" disabled={pending || !draft.trim()}>
          Post
        </button>
      </form>
    </div>
  );
}
