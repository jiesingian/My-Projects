"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import {
  addPhotoCommentAction,
  deletePhotoCommentAction,
  getPhotoSocialAction,
  setPhotoReactionAction,
  type PhotoRef,
  type PhotoSocial as Social,
} from "@/lib/actions/photo-social";

/** Kept in step with ALLOWED in lib/actions/photo-social.ts. */
const REACTIONS = ["❤️", "😂", "😮", "😢", "👍", "🙏"];

const timeAgo = (iso: string) => {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
};

/** Reactions and comments under a photo in the full-screen viewer -- the
 * row Facebook and Instagram put under a picture. One reaction per person
 * (tap another to change it, the same one to take it back); comments open
 * underneath. Loads for whichever photo is showing, so swiping to the next
 * photo shows that photo's. */
export function PhotoSocial({ photo }: { photo: PhotoRef }) {
  // undefined while loading; null when it can't be had (no such photo, or a
  // database without the tables yet), which shows nothing at all.
  const [social, setSocial] = useState<Social | null | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const key = `${photo.kind}:${photo.id}`;

  // A fresh one per photo: the viewer keys this component by the photo, so
  // swiping to the next picture starts from nothing rather than showing the
  // last one's comments for a moment.
  const load = useCallback(async () => setSocial(await getPhotoSocialAction(photo)), [photo]);

  useEffect(() => {
    let live = true;
    getPhotoSocialAction(photo).then((next) => live && setSocial(next));
    return () => {
      live = false;
    };
    // Keyed on the photo's identity, not the object, which is new each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (social === undefined) return <div className="kin-psocial" aria-busy="true" style={{ minHeight: "2.75rem" }} />;
  if (social === null) return null;

  const react = (emoji: string) => {
    const next = social.myReaction === emoji ? null : emoji;
    // Answer at once; the server's version replaces it a moment later.
    setSocial((s) => (s ? optimistic(s, next) : s));
    startTransition(async () => {
      const result = await setPhotoReactionAction(photo, next);
      if (result.error) setError(result.error);
      await load();
    });
  };

  const send = () => {
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    startTransition(async () => {
      const result = await addPhotoCommentAction(photo, body);
      if (result.error) {
        setError(result.error);
        setDraft(body);
      } else setError(null);
      await load();
    });
  };

  const remove = (id: string) =>
    startTransition(async () => {
      const result = await deletePhotoCommentAction(id);
      if (result.error) setError(result.error);
      await load();
    });

  const total = social.reactions.reduce((n, r) => n + r.count, 0);

  return (
    <div className="kin-psocial">
      <div className="kin-psocial-row">
        <div className="kin-psocial-reacts" role="group" aria-label="React to this photo">
          {REACTIONS.map((e) => (
            <button key={e} type="button" className="kin-psocial-react" data-mine={social.myReaction === e || undefined} aria-pressed={social.myReaction === e} onClick={() => react(e)} disabled={pending}>
              {e}
            </button>
          ))}
        </div>
        <button type="button" className="kin-psocial-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {social.comments.length === 0 ? "Comment" : social.comments.length === 1 ? "1 comment" : `${social.comments.length} comments`}
        </button>
      </div>

      {total > 0 && (
        <div className="kin-psocial-summary">
          {social.reactions.map((r) => (
            <span key={r.emoji} title={r.names.join(", ")}>
              {r.emoji} {r.count}
            </span>
          ))}
          <span className="kin-psocial-who">{social.reactions.flatMap((r) => r.names).join(", ")}</span>
        </div>
      )}

      {open && (
        <div className="kin-psocial-comments">
          {social.comments.length === 0 && <p className="kin-psocial-empty">No comments yet. Say something about this one.</p>}
          {social.comments.map((c) => (
            <div key={c.id} className="kin-psocial-comment">
              <span className="kin-psocial-author">{c.author}</span> {c.body}
              <span className="kin-psocial-meta">
                {timeAgo(c.createdAt)}
                {c.mine && (
                  <button type="button" onClick={() => remove(c.id)} disabled={pending} aria-label="Delete your comment">
                    Delete
                  </button>
                )}
              </span>
            </div>
          ))}
          <form
            className="kin-psocial-form"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <input className="kin-psocial-input" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add a comment…" maxLength={1000} aria-label="Add a comment" />
            <button type="submit" className="kin-psocial-send" disabled={pending || !draft.trim()}>
              Post
            </button>
          </form>
        </div>
      )}
      {error && (
        <p role="alert" className="kin-psocial-error">
          {error}
        </p>
      )}
    </div>
  );
}

function optimistic(s: Social, next: string | null): Social {
  // Copies throughout: these objects are React state.
  const reactions = s.reactions
    .map((r) => (r.emoji === s.myReaction ? { ...r, count: r.count - 1, names: r.names.filter((n) => n !== "You") } : { ...r, names: [...r.names] }))
    .filter((r) => r.count > 0);
  if (next) {
    const hit = reactions.find((r) => r.emoji === next);
    if (hit) {
      hit.count += 1;
      hit.names.push("You");
    } else reactions.push({ emoji: next, count: 1, names: ["You"] });
  }
  return { ...s, reactions, myReaction: next };
}
