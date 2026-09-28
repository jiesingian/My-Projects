"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PhotoViewer } from "@/components/photo-viewer";
import { toast } from "@/components/toast";
import { confirm } from "@/components/confirm-sheet";
import { setEntryReactionAction, addEntryCommentAction, deleteEntryCommentAction } from "@/lib/actions/feed-talk";
import type { FeedEntry } from "@/lib/queries/family-links";

// Kept in step with ALLOWED in lib/actions/feed-talk.ts and the table's check.
const REACTIONS = ["❤️", "😂", "😮", "😢", "👍", "🙏"];

/** A memory on the feed leads with its picture: the first photo full width,
 * the rest a swipe away in the viewer. */
export function FeedPhotos({ photos, title }: { photos: FeedEntry["photos"]; title: string }) {
  const [open, setOpen] = useState<number | null>(null);
  if (photos.length === 0) return null;
  const [hero, ...rest] = photos;
  return (
    <>
      <button type="button" className="kin-feed-hero" onClick={() => setOpen(0)} aria-label={`Open the photos from ${title}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URLs */}
        <img src={hero.url} alt="" />
        {rest.length > 0 && <span className="kin-feed-hero-more">+{rest.length}</span>}
      </button>
      {open !== null && (
        <PhotoViewer
          items={photos.map(({ id, url }, i) => ({ url, alt: `Photo ${i + 1} from ${title}`, photo: id ? { kind: "journal" as const, id } : undefined }))}
          startIndex={open}
          onClose={() => setOpen(null)}
          label={title}
        />
      )}
    </>
  );
}

/** Reactions and comments under a memory, from this household and the ones
 * linked with it. One reaction each; tap yours again to take it back. */
export function FeedTalk({ entry }: { entry: FeedEntry }) {
  const router = useRouter();
  const inputId = useId();
  const [pending, startTransition] = useTransition();
  const [mine, setMine] = useState<string | null>(entry.myReaction);
  const [showAll, setShowAll] = useState(false);
  const [writing, setWriting] = useState(false);
  const [draft, setDraft] = useState("");

  // What is on screen follows a tap at once; the server catches up behind it.
  const counts = entry.reactions
    .map((r) => ({ ...r, count: r.count - (entry.myReaction === r.emoji ? 1 : 0) }))
    .map((r) => ({ ...r, count: r.count + (mine === r.emoji ? 1 : 0) }));
  if (mine && !counts.some((r) => r.emoji === mine)) counts.push({ emoji: mine, count: 1, names: ["You"] });
  const shown = counts.filter((r) => r.count > 0);

  function react(emoji: string) {
    const next = mine === emoji ? null : emoji;
    const before = mine;
    setMine(next);
    startTransition(async () => {
      const r = await setEntryReactionAction(entry.id, next);
      if (r.error) {
        setMine(before);
        toast.error(r.error);
      }
      router.refresh();
    });
  }

  function send(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    startTransition(async () => {
      const r = await addEntryCommentAction(entry.id, body);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      setDraft("");
      setShowAll(true);
      router.refresh();
    });
  }

  async function remove(id: string) {
    if (!(await confirm({ title: "Remove this comment?", confirmLabel: "Remove", danger: true }))) return;
    startTransition(async () => {
      const r = await deleteEntryCommentAction(id);
      if (r.error) toast.error(r.error);
      router.refresh();
    });
  }

  const comments = entry.comments;
  const visible = showAll ? comments : comments.slice(-2);

  return (
    <div className="kin-feed-talk">
      <div className="kin-feed-reactbar" role="group" aria-label="React">
        {REACTIONS.map((e) => {
          const c = shown.find((r) => r.emoji === e);
          return (
            <button
              key={e}
              type="button"
              className="kin-feed-react"
              aria-pressed={mine === e}
              data-mine={mine === e || undefined}
              title={c ? c.names.join(", ") : undefined}
              onClick={() => react(e)}
            >
              <span aria-hidden="true">{e}</span>
              {c && <span className="kin-feed-react-n">{c.count}</span>}
            </button>
          );
        })}
      </div>

      {comments.length > 2 && !showAll && (
        <button type="button" className="kin-linkbtn kin-feed-more" onClick={() => setShowAll(true)}>
          See all {comments.length} comments
        </button>
      )}
      {visible.length > 0 && (
        <ul className="kin-feed-comments">
          {visible.map((c) => (
            <li key={c.id}>
              <strong>{c.author}</strong> {c.body}
              {c.canRemove && (
                <button type="button" className="kin-feed-comment-x" aria-label="Remove comment" onClick={() => remove(c.id)}>
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {writing ? (
        <form className="kin-feed-say" onSubmit={send}>
          <label htmlFor={inputId} className="sr-only">
            Comment on {entry.title}
          </label>
          <input
            id={inputId}
            className="input"
            value={draft}
            maxLength={1000}
            autoFocus
            enterKeyHint="send"
            placeholder="Say something…"
            onChange={(e) => setDraft(e.target.value)}
          />
          <button type="submit" className="btn btn-primary" disabled={pending || !draft.trim()}>
            Post
          </button>
        </form>
      ) : (
        <button type="button" className="kin-linkbtn kin-feed-more" onClick={() => setWriting(true)}>
          Add a comment
        </button>
      )}
    </div>
  );
}
