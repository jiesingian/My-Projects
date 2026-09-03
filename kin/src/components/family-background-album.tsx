"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PhotoAlbumViewer, type AlbumPhotoLike } from "@/components/photo-album-viewer";
import { addFamilyBackgroundAction, setActiveFamilyBackgroundAction, deleteFamilyBackgroundAction } from "@/lib/actions/family";

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function onFileChange() {
    const file = inputRef.current?.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const path = `${familyId}/household-bg-${Date.now()}.${file.name.split(".").pop() ?? "jpg"}`;
      const supabase = createClient();
      const { error: uploadErr } = await supabase.storage.from("avatars").upload(path, file, { contentType: file.type });
      if (uploadErr) throw new Error(uploadErr.message);

      const result = await addFamilyBackgroundAction(path);
      if (result.error) throw new Error(result.error);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

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
          height: 240,
          borderRadius: 4,
          overflow: "hidden",
          background: backgroundUrl ? `center/cover no-repeat url(${backgroundUrl})` : "var(--color-neutral-200)",
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

      {canEdit && (
        <>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ minHeight: 32, fontSize: 11, padding: "0 12px", marginTop: 8 }}
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? "UPLOADING…" : "ADD PHOTO"}
          </button>
          <input ref={inputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onFileChange} />
        </>
      )}
      {error && <p style={{ color: "var(--color-accent-700)", fontSize: 11.5, marginTop: 8 }}>{error}</p>}

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
