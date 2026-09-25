"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { PhotoViewer } from "@/components/photo-viewer";
import { useRouter } from "next/navigation";
import { confirm } from "@/components/confirm-sheet";

export type AlbumPhotoLike = { id: string; url: string };

/** Full-screen browse/select/delete lightbox shared by any photo album in
 * the app (member avatars, household background) — the actions themselves
 * are passed in so this component stays agnostic of what it's a photo of. */
export function PhotoAlbumViewer({
  photos,
  activeUrl,
  onClose,
  onSetActive,
  onDelete,
  canManage = true,
  shape = "circle",
  emptyMessage,
}: {
  photos: AlbumPhotoLike[];
  activeUrl: string | null;
  onClose: () => void;
  onSetActive: (id: string) => Promise<{ error: string | null }>;
  onDelete: (id: string) => Promise<{ error: string | null }>;
  canManage?: boolean;
  shape?: "circle" | "banner";
  emptyMessage: string;
}) {
  const startIndex = Math.max(0, photos.findIndex((p) => p.url === activeUrl));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  if (photos.length === 0) {
    return createPortal(
      <div role="dialog" aria-modal="true" onClick={onClose} style={overlayStyle}>
        <div onClick={(e) => e.stopPropagation()} style={{ color: "#fff", textAlign: "center" }}>
          <p style={{ fontSize: "0.8125rem", marginBottom: "0.875rem" }}>{emptyMessage}</p>
          <button type="button" className="btn btn-secondary" style={{ minHeight: "2.5rem", fontSize: "0.84375rem", padding: "0 1.25rem" }} onClick={onClose}>
            Close
          </button>
        </div>
      </div>,
      document.body,
    );
  }

  const actions = (i: number) => {
    const current = photos[Math.min(i, photos.length - 1)];
    const isActive = current.url === activeUrl;
    return (
      <>
        {error && <p style={{ color: "#ff8a9b", fontSize: "0.8125rem", margin: 0 }}>{error}</p>}
        {canManage && (
          <div style={{ display: "flex", gap: "0.625rem" }}>
            <button
              type="button"
              className="btn btn-primary"
              style={{ minHeight: "2.5rem", fontSize: "0.84375rem", padding: "0 1.125rem" }}
              disabled={busy || isActive}
              onClick={async () => {
                setBusy(true);
                setError(null);
                const result = await onSetActive(current.id);
                setBusy(false);
                if (result.error) setError(result.error);
                else {
                  router.refresh();
                  onClose();
                }
              }}
            >
              {isActive ? "Current picture" : busy ? "…" : "Use this picture"}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ minHeight: "2.5rem", fontSize: "0.84375rem", padding: "0 0.875rem" }}
              disabled={busy}
              onClick={async () => {
                if (!(await confirm({ title: "Delete this photo?", description: "This can't be undone.", confirmLabel: "Delete", danger: true }))) return;
                setBusy(true);
                setError(null);
                const result = await onDelete(current.id);
                setBusy(false);
                if (result.error) setError(result.error);
                else router.refresh();
              }}
            >
              Delete
            </button>
          </div>
        )}
      </>
    );
  };

  // The whole photo, full screen -- not cropped to a circle or a banner. The
  // crop is how it will sit on the page; this is for seeing the photo itself.
  return (
    <PhotoViewer
      items={photos.map((p, i) => ({
        url: p.url,
        alt: `${shape === "circle" ? "Profile picture" : "Household photo"} ${i + 1} of ${photos.length}`,
        // A circle album is someone's profile pictures; a banner, the household photo.
        photo: { kind: shape === "circle" ? ("avatar" as const) : ("background" as const), id: p.id },
      }))}
      startIndex={startIndex}
      onClose={onClose}
      footer={actions}
      label={shape === "circle" ? "Profile pictures" : "Household photos"}
    />
  );
}

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,.85)",
  zIndex: 2000,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "1.5rem",
};


