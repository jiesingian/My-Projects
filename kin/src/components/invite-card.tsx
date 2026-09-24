"use client";

import { useEffect, useState } from "react";
import { getEventInvitePreviewAction } from "@/lib/actions/planner";
import { inviteHost } from "@/lib/invite-link";

type Preview = { title: string; description: string | null; hasImage: boolean };

/** An event's invitation link as a card: the site it goes to, and -- once the
 * server has read the page -- its title, a line of description and a
 * thumbnail. The whole card opens the invitation in a new tab.
 *
 * It is a card from the first paint, not after the preview arrives: the site
 * and the way in are known without fetching anything, and a page that can't
 * be previewed (a login wall, a slow site, a PDF) still leaves a card that
 * works. The site shown is always the link's real host, never the page's own
 * name for itself, so the card says where tapping it actually goes. */
export function InviteCard({ eventId, url }: { eventId: string; url: string }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getEventInvitePreviewAction(eventId)
      .then((p) => {
        if (!cancelled) setPreview(p);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [eventId, url]);

  const host = inviteHost(url);
  const showImage = preview?.hasImage && !imageFailed;

  return (
    <a className="kin-invitecard" href={url} target="_blank" rel="noopener noreferrer nofollow" aria-label={`Open the invitation on ${host} in a new tab`}>
      {showImage && (
        // The proxy, not the site: see api/event-invite-image. `u` only makes a
        // changed link a new address to the browser's cache; the route ignores
        // it and reads the link from the event. Not next/image, which would
        // re-fetch it through its own optimiser for no gain here.
        // eslint-disable-next-line @next/next/no-img-element
        <img className="kin-invitecard-thumb" src={`/api/event-invite-image/${eventId}?u=${encodeURIComponent(url)}`} alt="" loading="lazy" onError={() => setImageFailed(true)} />
      )}
      <span className="kin-invitecard-body">
        <span className="kin-invitecard-site">INVITATION · {host}</span>
        <span className="kin-invitecard-title">{preview?.title ?? "Open the invitation"}</span>
        {preview?.description && <span className="kin-invitecard-desc">{preview.description}</span>}
        <span className="kin-invitecard-open">Open in a new tab ↗</span>
      </span>
    </a>
  );
}
