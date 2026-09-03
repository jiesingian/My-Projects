"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { AvatarAlbumViewer } from "@/components/avatar-album-viewer";
import { AvatarCropUpload } from "@/components/avatar-crop-upload";
import { Tag } from "@/components/ui";
import { ProfileFieldsView, ProfileFieldsEditor } from "@/components/profile-fields";
import { updateOwnProfileAction, type ProfileFields, type AlbumPhoto } from "@/lib/actions/profile";

/** Combined avatar + profile-fields editor for a member viewing their own
 * record. Avatar and fields share one view/edit toggle: clicking the
 * picture while not editing opens the album (browse/select among photos
 * already uploaded); clicking it while editing opens the file picker for a
 * brand new one, with a crop/zoom step. Selecting a new file (the actual
 * "picture selection" dialog) is therefore only ever reachable in edit
 * mode — browsing and picking among existing photos is not gated behind
 * it, since that's not introducing a new picture. */
export function MemberProfileEditor({
  familyId,
  memberId,
  fullName,
  ageLabel,
  statusLabel,
  statusVariant,
  avatarUrl,
  initials,
  photos,
  initial,
}: {
  familyId: string;
  memberId: string;
  fullName: string;
  ageLabel: string;
  statusLabel: string;
  statusVariant: "accent" | "neutral" | "outline";
  avatarUrl: string | null;
  initials: string;
  photos: AlbumPhoto[];
  initial: ProfileFields;
}) {
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [albumOpen, setAlbumOpen] = useState(false);
  const [fields, setFields] = useState<ProfileFields>(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  function set<K extends keyof ProfileFields>(key: K, value: ProfileFields[K]) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  function cancel() {
    setFields(initial);
    setError(null);
    setMode("view");
  }

  async function save() {
    setBusy(true);
    const result = await updateOwnProfileAction(fields);
    setBusy(false);
    setError(result.error);
    if (!result.error) {
      setMode("view");
      router.refresh();
    }
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 14, alignItems: "flex-end", marginBottom: 18 }}>
        <div style={{ position: "relative" }}>
          <button
            type="button"
            onClick={() => mode === "view" && setAlbumOpen(true)}
            style={{ all: "unset", cursor: "pointer", display: "block" }}
            aria-label="View profile pictures"
          >
            <Avatar url={avatarUrl} initials={initials} size={88} />
          </button>
          {mode === "edit" && <AvatarCropUpload familyId={familyId} memberId={memberId} onDone={() => {}} />}
        </div>
        <div>
          <div style={{ font: "600 34px/.98 var(--font-heading)" }}>{fullName}</div>
          <div style={{ fontSize: 12, color: "var(--color-neutral-600)", marginTop: 4 }}>{ageLabel}</div>
          <Tag variant={statusVariant} className="mt-2 inline-flex">
            {statusLabel}
          </Tag>
        </div>
      </div>

      {albumOpen && <AvatarAlbumViewer photos={photos} activeUrl={avatarUrl} onClose={() => setAlbumOpen(false)} />}

      {mode === "view" ? (
        <div style={{ marginBottom: 20 }}>
          <ProfileFieldsView fields={fields} />
          <button type="button" className="btn btn-secondary btn-block" style={{ minHeight: 40, fontSize: 12, marginTop: 10 }} onClick={() => setMode("edit")}>
            EDIT PROFILE
          </button>
        </div>
      ) : (
        <div style={{ marginBottom: 20 }}>
          <div className="field" style={{ marginBottom: 10 }}>
            <label>FULL NAME</label>
            <input className="input" value={fields.full_name} onChange={(e) => set("full_name", e.target.value)} style={{ minHeight: 44 }} disabled={busy} />
          </div>
          <ProfileFieldsEditor fields={fields} set={set} busy={busy} />
          {error && <p style={{ color: "var(--color-accent-700)", fontSize: 11.5, margin: "0 0 10px" }}>{error}</p>}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn btn-secondary" style={{ flex: 1, minHeight: 44, fontSize: 13 }} disabled={busy} onClick={cancel}>
              CANCEL
            </button>
            <button type="button" className="btn btn-primary" style={{ flex: 1, minHeight: 44, fontSize: 13 }} disabled={busy} onClick={save}>
              {busy ? "SAVING…" : "SAVE"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
