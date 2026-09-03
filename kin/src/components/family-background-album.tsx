"use client";

import { useState } from "react";
import { PhotoAlbumViewer, type AlbumPhotoLike } from "@/components/photo-album-viewer";
import { FamilyBackgroundCropUpload } from "@/components/family-background-crop-upload";
import { setActiveFamilyBackgroundAction, deleteFamilyBackgroundAction } from "@/lib/actions/family";

/** Household cover photo — clicking the banner (when not uploading) opens
 * the album to browse/select/delete among previously uploaded photos, the
 * same browse pattern as the member-avatar album. Organizer only for both
 * uploading and managing; everyone else can still browse. */
export function FamilyBackgroundAlbum({
  familyId,
  backgroundUrl,
  photos,
  canEdit,
}: {
  familyId: string;
  backgroundUrl: string | null;
  photos: AlbumPhotoLike[];
  canEdit: boolean;
}) {
  const [albumOpen, setAlbumOpen] = useState(false);

  return (
    <div style={{ marginBottom: 14 }}>
      <button
        type="button"
        onClick={() => setAlbumOpen(true)}
        style={{
          all: "unset",
          cursor: "pointer",
          display: "block",
          width: "100%",
          position: "relative",
          aspectRatio: "4 / 3",
          borderRadius: 4,
          overflow: "hidden",
          background: backgroundUrl ? `center center / cover no-repeat url(${backgroundUrl})` : "var(--color-neutral-200)",
          border: "1px solid var(--color-divider)",
        }}
        aria-label="View household photos"
      >
        {!backgroundUrl && (
          <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "var(--color-neutral-600)" }}>
            No household photo yet
          </span>
        )}
      </button>

      {canEdit && <FamilyBackgroundCropUpload familyId={familyId} onDone={() => {}} />}

      {albumOpen && (
        <PhotoAlbumViewer
          photos={photos}
          activeUrl={backgroundUrl}
          onClose={() => setAlbumOpen(false)}
          onSetActive={setActiveFamilyBackgroundAction}
          onDelete={deleteFamilyBackgroundAction}
          canManage={canEdit}
          shape="banner"
          emptyMessage="No photos yet — add your first household photo."
        />
      )}
    </div>
  );
}
