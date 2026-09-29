"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { AnimatedSheet } from "@/components/animated-sheet";
import { Avatar } from "@/components/avatar";
import { Icon } from "@/components/icons";
import { toast } from "@/components/toast";
import { uploadFileDirect } from "@/lib/upload-client";
import { createHighlightAction, deleteHighlightAction } from "@/lib/actions/highlights";
import { HIGHLIGHT_PHOTO_MS, groupHighlights, highlightRefusal, timeLeft } from "@/lib/highlights";
import type { Highlight } from "@/lib/queries/highlights";

type Person = { id: string; label: string; initials: string; photoUrl: string | null };

const SEEN_KEY = "kin-highlights-seen";

/** Which highlights this phone has watched, so the button's ring says when
 * there is something new. Kept on the phone: a highlight lasts a day, and
 * who-watched-what is not something the family asked to be told. */
function seenSnapshot(): string {
  try {
    return localStorage.getItem(SEEN_KEY) ?? "[]";
  } catch {
    return "[]";
  }
}
function subscribeSeen(onChange: () => void) {
  window.addEventListener(SEEN_KEY, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(SEEN_KEY, onChange);
    window.removeEventListener("storage", onChange);
  };
}
function parseSeen(raw: string): Set<string> {
  try {
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}
function writeSeen(ids: Set<string>, live: Highlight[]) {
  try {
    // Only what is still live, so the list never grows past a day's worth.
    const keep = live.filter((h) => ids.has(h.id)).map((h) => h.id);
    localStorage.setItem(SEEN_KEY, JSON.stringify(keep));
    window.dispatchEvent(new Event(SEEN_KEY));
  } catch {
    // Private browsing: the ring just stays lit.
  }
}

/** How long a picked video runs, read on the phone before anything uploads. */
function videoSeconds(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    const url = URL.createObjectURL(file);
    const done = (s: number | null) => {
      URL.revokeObjectURL(url);
      resolve(s);
    };
    v.preload = "metadata";
    v.muted = true;
    v.onloadedmetadata = () => done(Number.isFinite(v.duration) ? v.duration : null);
    v.onerror = () => done(null);
    v.src = url;
  });
}

/** Highlights (29 September): the button beside the voice and video call
 * buttons. Anyone in the household posts a photo or a short video; everyone
 * in it sees it for 24 hours; then it is gone. */
export function HighlightsButton({ me, people, highlights }: { me: string; people: Person[]; highlights: Highlight[] }) {
  const router = useRouter();
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState<number | null>(null);
  const seenRaw = useSyncExternalStore(subscribeSeen, seenSnapshot, () => "[]");
  const seen = useMemo(() => parseSeen(seenRaw), [seenRaw]);
  const [posting, startPosting] = useTransition();
  const file = useRef<HTMLInputElement>(null);

  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const groups = useMemo(() => groupHighlights(highlights, me), [highlights, me]);
  const unseen = highlights.some((h) => h.memberId !== me && !seen.has(h.id));

  const markSeen = useCallback(
    (id: string) => {
      const now = parseSeen(seenSnapshot());
      if (!now.has(id)) writeSeen(now.add(id), highlights);
    },
    [highlights],
  );

  const post = (f: File | undefined) => {
    if (file.current) file.current.value = "";
    if (!f) return;
    startPosting(async () => {
      const seconds = f.type.startsWith("video/") ? await videoSeconds(f) : null;
      const refusal = highlightRefusal(f, seconds);
      if (refusal) return void toast.error(refusal);
      try {
        const up = await uploadFileDirect(f, "highlight");
        if (up.provider !== "supabase") throw new Error("That didn't upload. Try again.");
        const r = await createHighlightAction({ storagePath: up.storagePath, mediaType: f.type.startsWith("video/") ? "video" : "image", durationSeconds: seconds });
        if (r.error) return void toast.error(r.error);
        toast.success("Posted. Everyone at home can see it for 24 hours.");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "That didn't upload. Try again.");
      }
    });
  };

  return (
    <>
      <button
        type="button"
        className="btn btn-secondary btn-icon kin-hl-button"
        data-new={unseen || undefined}
        aria-label={unseen ? "Highlights, something new" : "Highlights"}
        onClick={() => setOpen(true)}
      >
        <Icon name="camera" size="1.125rem" />
      </button>
      <input ref={file} type="file" accept="image/*,video/*" hidden onChange={(e) => post(e.target.files?.[0])} />

      <AnimatedSheet open={open} onClose={() => setOpen(false)} labelledBy={titleId}>
        <h2 id={titleId} style={{ fontSize: "1.125rem", margin: "0 0 0.25rem" }}>
          Highlights
        </h2>
        <p style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)", margin: "0 0 0.875rem" }}>
          A photo or a video of up to 30 seconds. Everyone at home sees it for 24 hours, then it disappears.
        </p>
        <div className="kin-hl-row">
          <button type="button" className="kin-hl-person" onClick={() => file.current?.click()} disabled={posting}>
            <span className="kin-hl-add" aria-hidden="true">
              {posting ? <span className="kin-hl-spinner" /> : <Icon name="plus" size="1.375rem" />}
            </span>
            <span className="kin-hl-name">{posting ? "Posting…" : "Add yours"}</span>
          </button>
          {groups.map((g, i) => {
            const p = byId.get(g.memberId);
            const fresh = g.memberId !== me && g.items.some((h) => !seen.has(h.id));
            const last = g.items[g.items.length - 1];
            return (
              <button key={g.memberId} type="button" className="kin-hl-person" onClick={() => setViewing(i)}>
                <span className="kin-hl-ring" data-new={fresh || undefined}>
                  <Avatar url={p?.photoUrl ?? null} initials={p?.initials ?? "?"} label={p?.label ?? "Someone"} size={56} clickable={false} />
                </span>
                <span className="kin-hl-name">{g.memberId === me ? "You" : (p?.label ?? "Someone")}</span>
                <span className="kin-hl-left">{timeLeft(last.expiresAt)}</span>
              </button>
            );
          })}
        </div>
        {groups.length === 0 && <p style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)", margin: "0.75rem 0 0" }}>Nothing from today yet.</p>}
      </AnimatedSheet>

      {viewing !== null && groups[viewing] && (
        <HighlightViewer
          groups={groups}
          start={viewing}
          me={me}
          byId={byId}
          onSeen={markSeen}
          onClose={() => setViewing(null)}
          onDeleted={() => {
            setViewing(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

/** Full screen, one person at a time, like stories: a photo stays five
 * seconds, a video for its length. Tap the right side for the next, the left
 * for the one before; the last one closes it. */
function HighlightViewer({
  groups,
  start,
  me,
  byId,
  onSeen,
  onClose,
  onDeleted,
}: {
  groups: { memberId: string; items: Highlight[] }[];
  start: number;
  me: string;
  byId: Map<string, Person>;
  onSeen: (id: string) => void;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [at, setAt] = useState({ g: start, i: 0 });
  const [progress, setProgress] = useState(0);
  const [deleting, startDeleting] = useTransition();
  const [muted, setMuted] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const group = groups[at.g];
  const item = group?.items[at.i];
  const person = byId.get(group?.memberId ?? "");

  const next = useCallback(() => {
    setProgress(0);
    setAt(({ g, i }) => {
      if (i + 1 < groups[g].items.length) return { g, i: i + 1 };
      if (g + 1 < groups.length) return { g: g + 1, i: 0 };
      queueMicrotask(onClose);
      return { g, i };
    });
  }, [groups, onClose]);
  const prev = () => {
    setProgress(0);
    setAt(({ g, i }) => (i > 0 ? { g, i: i - 1 } : g > 0 ? { g: g - 1, i: groups[g - 1].items.length - 1 } : { g, i }));
  };

  useEffect(() => {
    if (item) onSeen(item.id);
  }, [item, onSeen]);

  // A photo's clock; a video drives its own progress from timeupdate.
  useEffect(() => {
    if (!item || item.mediaType !== "image") return;
    const began = performance.now();
    let raf = 0;
    const tick = () => {
      const p = (performance.now() - began) / HIGHLIGHT_PHOTO_MS;
      if (p >= 1) return next();
      setProgress(p);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [item, next]);

  // With sound if the phone allows it; iPhones often only allow a muted
  // start, so fall back to that and offer the sound on a tap.
  useEffect(() => {
    const v = video.current;
    if (!v || item?.mediaType !== "video") return;
    v.muted = false;
    v.play()
      .then(() => setMuted(false))
      .catch(() => {
        v.muted = true;
        setMuted(true);
        void v.play().catch(() => {});
      });
  }, [item]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!item) return null;

  return createPortal(
    <div className="kin-hl-viewer" role="dialog" aria-modal="true" aria-label={`Highlight from ${group.memberId === me ? "you" : (person?.label ?? "someone")}`}>
      <div className="kin-hl-bars" aria-hidden="true">
        {group.items.map((h, i) => (
          <span key={h.id} className="kin-hl-bar">
            <span style={{ transform: `scaleX(${i < at.i ? 1 : i === at.i ? progress : 0})` }} />
          </span>
        ))}
      </div>
      <div className="kin-hl-top">
        <Avatar url={person?.photoUrl ?? null} initials={person?.initials ?? "?"} label={person?.label ?? "Someone"} size={32} clickable={false} />
        <span className="kin-hl-who">
          {group.memberId === me ? "You" : (person?.label ?? "Someone")}
          <span>{timeLeft(item.expiresAt)}</span>
        </span>
        {item.mediaType === "video" && muted && (
          <button
            type="button"
            className="kin-hl-action"
            onClick={() => {
              if (video.current) video.current.muted = false;
              setMuted(false);
            }}
          >
            Sound on
          </button>
        )}
        {group.memberId === me && (
          <button
            type="button"
            className="kin-hl-action"
            disabled={deleting}
            onClick={() =>
              startDeleting(async () => {
                const r = await deleteHighlightAction(item.id);
                if (r.error) toast.error(r.error);
                else onDeleted();
              })
            }
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
        )}
        <button type="button" className="kin-hl-action" aria-label="Close" onClick={onClose}>
          <Icon name="x" size="1.25rem" />
        </button>
      </div>
      <div className="kin-hl-stage">
        {!item.url ? (
          <p className="kin-hl-missing">This one couldn&apos;t be loaded.</p>
        ) : item.mediaType === "video" ? (
          <video
            key={item.id}
            ref={video}
            src={item.url}
            playsInline
            onTimeUpdate={(e) => setProgress(e.currentTarget.duration ? e.currentTarget.currentTime / e.currentTarget.duration : 0)}
            onEnded={next}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- a signed, private URL; Next's optimiser can't fetch it.
          <img key={item.id} src={item.url} alt="" />
        )}
      </div>
      <button type="button" className="kin-hl-tap" data-side="prev" aria-label="Previous" onClick={prev} />
      <button type="button" className="kin-hl-tap" data-side="next" aria-label="Next" onClick={next} />
    </div>,
    document.body,
  );
}
