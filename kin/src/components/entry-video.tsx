"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { PhotoViewer } from "@/components/photo-viewer";
import { VideoMaker } from "@/components/video-maker";
import { confirm } from "@/components/confirm-sheet";
import { toast } from "@/components/toast";
import { removeEntryVideoAction } from "@/lib/actions/journal-video";
import { setEntrySharedAction } from "@/lib/actions/family-links";
import { saveToPhone } from "@/lib/video-maker/save";
import type { EntryVideo } from "@/lib/queries/entry-video";

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

/** Wide videos fill the card; a tall one is held to a height a list can take. */
function frameStyle(video: EntryVideo, maxHeight: number): React.CSSProperties {
  return {
    aspectRatio: `${video.width} / ${video.height}`,
    width: `min(100%, ${Math.round((maxHeight * video.width) / video.height)}px)`,
    margin: "0 auto",
  };
}

/** An entry's video as its cover, in the journal and the Family feed: plays
 * silently, inline, on a loop -- but only while it is on screen, so a long
 * list is not playing twenty videos at once. Tap for the full-screen player,
 * with sound.
 *
 * It stays on its poster, not playing, when the phone asks for less motion
 * or for less data (Low Data Mode, Data Saver): a moving cover is a nicety,
 * not something to spend someone's plan on. */
export function EntryVideoCover({ video, title }: { video: EntryVideo; title: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [open, setOpen] = useState(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
    if (reduce || saveData) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.intersectionRatio >= 0.6) el.play().catch(() => {});
        else el.pause();
      },
      { threshold: [0, 0.6, 1] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <>
      <div className="kin-video-cover" style={frameStyle(video, 420)} data-playing={playing}>
        <video
          ref={ref}
          src={video.url}
          poster={video.poster || undefined}
          muted
          playsInline
          loop
          preload="metadata"
          onPlaying={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          aria-hidden="true"
          tabIndex={-1}
        />
        <button type="button" className="kin-video-cover-hit" onClick={() => setOpen(true)} aria-label={`Play the video of ${title}, with sound`}>
          <span className="kin-video-pill">
            <Icon name="play" size={12} /> {clock(video.duration)}
          </span>
        </button>
      </div>
      {open && <PhotoViewer items={[{ url: video.url, alt: `Video of ${title}`, kind: "video" }]} onClose={() => setOpen(false)} label={title} />}
    </>
  );
}

/** On the entry's own page: the video, with its controls, and what can be
 * done with it -- save it to the phone, send it to the Family feed, make a
 * new one, take it off. Without a video yet, the way in to making one. */
export function EntryVideoPanel({
  entryId,
  title,
  dateLabel,
  signature,
  personal,
  photos,
  video,
  canMake,
  canShareToFeed,
  sharedToFeed,
  autoOpen,
}: {
  entryId: string;
  title: string;
  dateLabel: string;
  signature: string;
  personal: boolean;
  photos: { id: string | null; url: string }[];
  video: EntryVideo | null;
  canMake: boolean;
  canShareToFeed: boolean;
  sharedToFeed: boolean;
  autoOpen: boolean;
}) {
  const router = useRouter();
  // "Make a video" from the new-entry form lands here with ?video=1.
  const [making, setMaking] = useState(() => autoOpen && canMake && photos.length > 0);
  const [fetching, setFetching] = useState(false);
  const [ready, setReady] = useState<Blob | null>(null);
  const [pending, startTransition] = useTransition();

  // The ?video=1 comes off the address, so going back or refreshing does not
  // open the maker again.
  useEffect(() => {
    if (autoOpen) router.replace(`/journal/${entryId}`, { scroll: false });
  }, [autoOpen, entryId, router]);

  const fileName = `${title || "Kin video"}.${video?.mimeType.includes("mp4") ? "mp4" : "webm"}`;

  async function save() {
    if (!video) return;
    // Fetched once; a second tap, if the phone wanted a fresh one for its
    // share sheet, is then instant.
    if (ready) {
      await saveToPhone(ready, fileName, title);
      return;
    }
    setFetching(true);
    try {
      const res = await fetch(video.url);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      setReady(blob);
      const how = await saveToPhone(blob, fileName, title);
      if (how === "downloaded") toast.success("Video saved to Downloads.");
    } catch {
      toast.error("The video couldn't be fetched. Check the connection and try again.");
    } finally {
      setFetching(false);
    }
  }

  const shareToFeed = () =>
    startTransition(async () => {
      const ok = await confirm({
        title: "Share to the Family feed?",
        description: "The linked households will see this entry, its photos and its video.",
        confirmLabel: "Share",
      });
      if (!ok) return;
      const { error } = await setEntrySharedAction(entryId, true);
      if (error) toast.error(error);
      else {
        toast.success("Shared to the Family feed.");
        router.refresh();
      }
    });

  const remove = () =>
    startTransition(async () => {
      const ok = await confirm({ title: "Remove the video?", description: "The photos stay. You can make another any time.", confirmLabel: "Remove", danger: true });
      if (!ok) return;
      const { error } = await removeEntryVideoAction(entryId);
      if (error) toast.error(error);
      else router.refresh();
    });

  return (
    <>
      {video ? (
        <div style={{ margin: "0 0 1rem" }}>
          <div className="kin-video-cover" style={frameStyle(video, 520)}>
            <video src={video.url} poster={video.poster || undefined} controls playsInline preload="metadata" aria-label={`Video of ${title}`} />
          </div>
          <div className="kin-video-actions">
            <button type="button" className="btn btn-secondary" onClick={save} disabled={fetching}>
              <Icon name="download" size={16} /> {fetching ? "Getting it…" : "Save video"}
            </button>
            {canShareToFeed && !sharedToFeed && (
              <button type="button" className="btn btn-secondary" onClick={shareToFeed} disabled={pending}>
                <Icon name="users" size={16} /> Share to Family feed
              </button>
            )}
            {canMake && photos.length > 0 && (
              <button type="button" className="btn btn-ghost" onClick={() => setMaking(true)}>
                Make a new one
              </button>
            )}
            {canMake && (
              <button type="button" className="btn btn-ghost" onClick={remove} disabled={pending}>
                Remove
              </button>
            )}
          </div>
        </div>
      ) : (
        canMake &&
        photos.length > 0 && (
          <button type="button" className="kin-video-invite" onClick={() => setMaking(true)}>
            <span className="kin-video-invite-ico" aria-hidden="true">
              <Icon name="video" size={20} />
            </span>
            <span>
              <strong>Make a video</strong>
              <span>From {photos.length === 1 ? "this photo" : `these ${photos.length} photos`}, with music, in about a minute</span>
            </span>
          </button>
        )
      )}
      {making && (
        <VideoMaker
          entryId={entryId}
          title={title}
          dateLabel={dateLabel}
          signature={signature}
          personal={personal}
          photos={photos}
          hasVideo={!!video}
          onClose={() => setMaking(false)}
        />
      )}
    </>
  );
}
