"use client";

import { useState } from "react";
import { Avatar } from "@/components/avatar";
import { PhotoAlbumViewer, type AlbumPhotoLike } from "@/components/photo-album-viewer";

const noChange = async () => ({ error: "Only they can change their own pictures." });

/** Somebody else's profile picture: tapping it opens their pictures in the
 * full-screen viewer, read-only, with reactions and comments under each --
 * the household answering a photo someone put up, the way Facebook does.
 * With no album to show (none uploaded, or none readable), it is the plain
 * avatar it always was. */
export function ProfilePhotosButton({
  photos,
  url,
  initials,
  label,
  size,
}: {
  photos: AlbumPhotoLike[];
  url: string | null;
  initials: string;
  label: string;
  size: number;
}) {
  const [open, setOpen] = useState(false);
  if (photos.length === 0) return <Avatar url={url} initials={initials} label={label} size={size} />;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} style={{ all: "unset", cursor: "pointer", display: "block" }} aria-label={`View ${label}'s profile pictures`}>
        <Avatar url={url} initials={initials} label={label} size={size} clickable={false} />
      </button>
      {open && (
        <PhotoAlbumViewer
          photos={photos}
          activeUrl={url}
          onClose={() => setOpen(false)}
          onSetActive={noChange}
          onDelete={noChange}
          canManage={false}
          shape="circle"
          emptyMessage=""
        />
      )}
    </>
  );
}
