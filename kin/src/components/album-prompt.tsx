"use client";

import { useEffect, useId, useState, useTransition } from "react";
import Link from "next/link";
import { AnimatedSheet } from "@/components/animated-sheet";
import { toast } from "@/components/toast";
import { addToAlbumAction, createAlbumAction, listAlbumsAction, type AlbumChoice } from "@/lib/actions/chat-albums";

/** "Keep these in an album?" -- offered right after photos are sent in the
 * family chat (28 September), so they can be found again without scrolling
 * the whole thread. Choosing is optional; "Not now" leaves them in the chat
 * only, which is where they are either way. */
export function AlbumPrompt({ photoIds, onClose }: { photoIds: string[]; onClose: () => void }) {
  const titleId = useId();
  const [albums, setAlbums] = useState<AlbumChoice[] | null>(null);
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const count = photoIds.length;

  useEffect(() => {
    let live = true;
    void listAlbumsAction().then((list) => live && setAlbums(list));
    return () => {
      live = false;
    };
  }, []);

  const done = (label: string) => {
    toast.success(`${count === 1 ? "Photo" : `${count} photos`} added to ${label}`);
    onClose();
  };

  const addTo = (a: AlbumChoice) =>
    start(async () => {
      const r = await addToAlbumAction(a.id, photoIds);
      if (r.error) setError(r.error);
      else done(a.name);
    });

  const create = () =>
    start(async () => {
      const r = await createAlbumAction(name, photoIds);
      if (r.error) setError(r.error);
      else done(name.trim());
    });

  return (
    <AnimatedSheet open onClose={onClose} labelledBy={titleId}>
      <div className="confirm-grabber" />
      <div className="kin-albumprompt">
        <h3 id={titleId}>Keep {count === 1 ? "this photo" : `these ${count} photos`} in an album?</h3>
        <p className="kin-albumprompt-sub">They stay in the chat either way. An album keeps them together so they don&apos;t get buried.</p>

        <form
          className="kin-albumprompt-new"
          onSubmit={(e) => {
            e.preventDefault();
            create();
          }}
        >
          <input className="input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="New album name, e.g. Beach day" aria-label="New album name" />
          <button type="submit" className="btn btn-primary" disabled={pending || !name.trim()}>
            Create
          </button>
        </form>

        {albums && albums.length > 0 && (
          <>
            <div className="kin-albumprompt-label">Or add to</div>
            <ul className="kin-albumprompt-list">
              {albums.map((a) => (
                <li key={a.id}>
                  <button type="button" disabled={pending} onClick={() => addTo(a)}>
                    <span>{a.name}</span>
                    <span className="kin-albumprompt-count">{a.count}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        {error && (
          <p role="alert" className="kin-albumprompt-error">
            {error}
          </p>
        )}
        <div className="kin-albumprompt-foot">
          <Link href="/chat/albums" onClick={onClose}>
            See all albums
          </Link>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={pending}>
            Not now
          </button>
        </div>
      </div>
    </AnimatedSheet>
  );
}
