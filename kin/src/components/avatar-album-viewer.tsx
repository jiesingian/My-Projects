"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setActiveAvatarAction, deleteAvatarFromAlbumAction, type AlbumPhoto } from "@/lib/actions/profile";

export function AvatarAlbumViewer({ photos, activeUrl, onClose }: { photos: AlbumPhoto[]; activeUrl: string | null; onClose: () => void }) {
  const startIndex = Math.max(0, photos.findIndex((p) => p.url === activeUrl));
  const [index, setIndex] = useState(startIndex);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  if (photos.length === 0) {
    return (
      <div role="dialog" aria-modal="true" onClick={onClose} style={overlayStyle}>
        <div onClick={(e) => e.stopPropagation()} style={{ color: "#fff", textAlign: "center" }}>
          <p style={{ fontSize: 13, marginBottom: 14 }}>No photos yet — click EDIT PROFILE to add your first one.</p>
          <button type="button" className="btn btn-secondary" style={{ minHeight: 40, fontSize: 12, padding: "0 20px" }} onClick={onClose}>
            CLOSE
          </button>
        </div>
      </div>
    );
  }

  const current = photos[index];
  const isActive = current.url === activeUrl;

  return (
    <div role="dialog" aria-modal="true" onClick={onClose} style={overlayStyle}>
      <button type="button" aria-label="Close" onClick={onClose} style={closeButtonStyle}>
        ×
      </button>

      <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button type="button" aria-label="Previous" disabled={photos.length < 2} onClick={() => setIndex((i) => (i - 1 + photos.length) % photos.length)} style={navButtonStyle}>
            ‹
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={current.url} alt="" style={{ width: 240, height: 240, borderRadius: "50%", objectFit: "cover", border: "2px solid #fff" }} />
          <button type="button" aria-label="Next" disabled={photos.length < 2} onClick={() => setIndex((i) => (i + 1) % photos.length)} style={navButtonStyle}>
            ›
          </button>
        </div>

        <span style={{ color: "#fff", fontSize: 11.5 }}>
          {index + 1} / {photos.length}
        </span>

        {error && <p style={{ color: "var(--color-accent-400)", fontSize: 11.5 }}>{error}</p>}

        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            className="btn btn-primary"
            style={{ minHeight: 40, fontSize: 12, padding: "0 18px" }}
            disabled={busy || isActive}
            onClick={async () => {
              setBusy(true);
              setError(null);
              const result = await setActiveAvatarAction(current.id);
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
            style={{ minHeight: 40, fontSize: 12, padding: "0 14px", color: "var(--color-accent-700)", borderColor: "var(--color-accent-700)" }}
            disabled={busy}
            onClick={async () => {
              if (!window.confirm("Delete this photo? This can't be undone.")) return;
              setBusy(true);
              setError(null);
              const result = await deleteAvatarFromAlbumAction(current.id);
              setBusy(false);
              if (result.error) setError(result.error);
              else router.refresh();
            }}
          >
            DELETE
          </button>
        </div>
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
  padding: 24,
};

const closeButtonStyle: React.CSSProperties = {
  position: "absolute",
  top: 16,
  right: 20,
  background: "none",
  border: "none",
  color: "#fff",
  fontSize: 30,
  lineHeight: 1,
  cursor: "pointer",
};

const navButtonStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#fff",
  fontSize: 34,
  lineHeight: 1,
  cursor: "pointer",
  padding: 6,
};
