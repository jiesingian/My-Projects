"use client";

import { useEffect, useState } from "react";
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
  const [index, setIndex] = useState(startIndex);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (photos.length === 0) {
    return (
      <div role="dialog" aria-modal="true" onClick={onClose} style={overlayStyle}>
        <div onClick={(e) => e.stopPropagation()} style={{ color: "#fff", textAlign: "center" }}>
          <p style={{ fontSize: "0.8125rem", marginBottom: "0.875rem" }}>{emptyMessage}</p>
          <button type="button" className="btn btn-secondary" style={{ minHeight: "2.5rem", fontSize: "0.84375rem", padding: "0 1.25rem" }} onClick={onClose}>
            CLOSE
          </button>
        </div>
      </div>
    );
  }

  const current = photos[Math.min(index, photos.length - 1)];
  const isActive = current.url === activeUrl;
  const imgStyle: React.CSSProperties =
    shape === "circle"
      ? { width: 240, height: 240, borderRadius: "50%", objectFit: "cover", border: "2px solid #fff" }
      : { width: "min(90vw, 480px)", aspectRatio: "4 / 3", borderRadius: 4, objectFit: "cover", border: "2px solid #fff" };

  return (
    <div role="dialog" aria-modal="true" onClick={onClose} style={overlayStyle}>
      <button type="button" aria-label="Close" onClick={onClose} style={closeButtonStyle}>
        ×
      </button>

      <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <button type="button" aria-label="Previous" disabled={photos.length < 2} onClick={() => setIndex((i) => (i - 1 + photos.length) % photos.length)} style={navButtonStyle}>
            ‹
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={current.url} alt={`Photo ${index + 1} of ${photos.length}`} style={imgStyle} />
          <button type="button" aria-label="Next" disabled={photos.length < 2} onClick={() => setIndex((i) => (i + 1) % photos.length)} style={navButtonStyle}>
            ›
          </button>
        </div>

        <span style={{ color: "#fff", fontSize: "0.8125rem" }}>
          {index + 1} / {photos.length}
        </span>

        {error && <p style={{ color: "var(--color-accent-400)", fontSize: "0.8125rem" }}>{error}</p>}

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
              {isActive ? "CURRENT PICTURE" : busy ? "…" : "USE THIS PICTURE"}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ minHeight: "2.5rem", fontSize: "0.84375rem", padding: "0 0.875rem", color: "var(--color-accent-700)", borderColor: "var(--color-accent-700)" }}
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
              DELETE
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,.85)",
  zIndex: 1000,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "1.5rem",
};

const closeButtonStyle: React.CSSProperties = {
  position: "absolute",
  top: 16,
  right: 20,
  background: "none",
  border: "none",
  color: "#fff",
  fontSize: "1.875rem",
  lineHeight: 1,
  cursor: "pointer",
};

const navButtonStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#fff",
  fontSize: "2.125rem",
  lineHeight: 1,
  cursor: "pointer",
  padding: "0.375rem",
};
