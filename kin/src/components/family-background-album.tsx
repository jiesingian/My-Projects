"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import { PhotoAlbumViewer, type AlbumPhotoLike } from "@/components/photo-album-viewer";
import { FamilyBackgroundCropUpload } from "@/components/family-background-crop-upload";
import { setActiveFamilyBackgroundAction, deleteFamilyBackgroundAction } from "@/lib/actions/family";

/** Household cover photo — clicking the banner (when not uploading) opens
 * the album to browse/select/delete among previously uploaded photos, the
 * same browse pattern as the member-avatar album. Organizer only for both
 * uploading and managing; everyone else can still browse. */
export function FamilyBackgroundAlbum({
  backgroundUrl,
  photos,
  canEdit,
}: {
  backgroundUrl: string | null;
  photos: AlbumPhotoLike[];
  canEdit: boolean;
}) {
  const [albumOpen, setAlbumOpen] = useState(false);

  return (
    <div style={{ marginBottom: "0.875rem" }}>
      <button
        type="button"
        onClick={() => setAlbumOpen(true)}
        style={{
          all: "unset",
          cursor: "pointer",
          display: "block",
          width: "100%",
          position: "relative",
          // Empty, it is a slim invitation rather than 260px of grey; with a
          // photo, the photo gets its 4:3 (review, 28 September).
          aspectRatio: backgroundUrl ? "4 / 3" : "16 / 6",
          borderRadius: 14,
          overflow: "hidden",
          background: backgroundUrl ? `center center / cover no-repeat url(${backgroundUrl})` : "var(--color-neutral-200)",
          border: "1px solid var(--color-divider)",
        }}
        aria-label="View household photos"
      >
        {!backgroundUrl && (
          <span style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", gap: "0.375rem", alignItems: "center", justifyContent: "center", fontSize: "0.84375rem", color: "var(--color-neutral-600)" }}>
            <Icon name="images" size={22} />
            {canEdit ? "Add a photo of the whole family" : "No household photo yet"}
          </span>
        )}
      </button>

      {canEdit && <FamilyBackgroundCropUpload onDone={() => {}} />}

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
