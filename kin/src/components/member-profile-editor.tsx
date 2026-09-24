"use client";

import { useId, useState } from "react";
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
  fullName,
  ageLabel,
  statusLabel,
  statusVariant,
  avatarUrl,
  initials,
  photos,
  initial,
  dateFormat,
}: {
  fullName: string;
  ageLabel: string;
  statusLabel: string;
  statusVariant: "accent" | "neutral" | "outline";
  avatarUrl: string | null;
  initials: string;
  photos: AlbumPhoto[];
  initial: ProfileFields;
  dateFormat?: string;
}) {
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [albumOpen, setAlbumOpen] = useState(false);
  const [fields, setFields] = useState<ProfileFields>(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const uid = useId();

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
      <div style={{ display: "flex", gap: "0.875rem", alignItems: "flex-end", marginBottom: "1.125rem" }}>
        <div style={{ position: "relative" }}>
          <button
            type="button"
            onClick={() => mode === "view" && setAlbumOpen(true)}
            style={{ all: "unset", cursor: "pointer", display: "block" }}
            aria-label="View profile pictures"
          >
            <Avatar url={avatarUrl} initials={initials} label={fullName} size={88} clickable={false} />
          </button>
          {mode === "edit" && <AvatarCropUpload onDone={() => {}} />}
        </div>
        <div>
          <div style={{ font: "600 2.125rem/.98 var(--font-heading)" }}>{fullName}</div>
          <div style={{ fontSize: "0.84375rem", color: "var(--color-neutral-600)", marginTop: "0.25rem" }}>{ageLabel}</div>
          <Tag variant={statusVariant} className="mt-2 inline-flex">
            {statusLabel}
          </Tag>
        </div>
      </div>

      {albumOpen && <AvatarAlbumViewer photos={photos} activeUrl={avatarUrl} onClose={() => setAlbumOpen(false)} />}

      {mode === "view" ? (
        <div style={{ marginBottom: "1.25rem" }}>
          <ProfileFieldsView fields={fields} dateFormat={dateFormat} />
          <button type="button" className="btn btn-secondary btn-block" style={{ minHeight: "2.5rem", fontSize: "0.84375rem", marginTop: "0.625rem" }} onClick={() => setMode("edit")}>
            Edit profile
          </button>
        </div>
      ) : (
        <div style={{ marginBottom: "1.25rem" }}>
          <div className="field" style={{ marginBottom: "0.625rem" }}>
            <label htmlFor={`${uid}-full-name`}>Full name</label>
            <input id={`${uid}-full-name`} aria-label="Full Name" className="input" value={fields.full_name} onChange={(e) => set("full_name", e.target.value)} maxLength={100} style={{ minHeight: "2.75rem" }} disabled={busy} />
          </div>
          <ProfileFieldsEditor fields={fields} set={set} busy={busy} />
          {error && <p style={{ color: "var(--color-accent-700)", fontSize: "0.8125rem", margin: "0 0 10px" }}>{error}</p>}
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button type="button" className="btn btn-secondary" style={{ flex: 1, minHeight: "2.75rem", fontSize: "0.8125rem" }} disabled={busy} onClick={cancel}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" style={{ flex: 1, minHeight: "2.75rem", fontSize: "0.8125rem" }} disabled={busy} onClick={save}>
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
