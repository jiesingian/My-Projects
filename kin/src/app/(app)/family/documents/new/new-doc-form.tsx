"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createDocEntryAction, attachDocFileAction } from "@/lib/actions/documents";
import { uploadFileDirect, rollbackUpload, type UploadedFile } from "@/lib/upload-client";
import { ErrorText } from "@/components/form";
import { DetailHeader } from "@/components/hub-header";
import type { Tables } from "@/lib/database.types";

const VISIBILITY = [
  { value: "family", label: "Whole family" },
  { value: "parents", label: "Parents only" },
  { value: "private", label: "Just me" },
];

export function NewDocForm({
  folders,
  members,
  defaultFolderId,
}: {
  folders: Tables<"doc_folders">[];
  members: Tables<"members">[];
  defaultFolderId?: string;
}) {
  const [folderId, setFolderId] = useState(defaultFolderId ?? folders[0]?.id ?? "__new__");
  const [visibility, setVisibility] = useState("family");
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const fd = new FormData(e.currentTarget);
    const created = await createDocEntryAction({
      title: String(fd.get("title") ?? ""),
      folderId,
      newFolderName: folderId === "__new__" ? String(fd.get("new_folder_name") ?? "") : null,
      ownerMemberId: String(fd.get("owner_member_id") ?? "") || null,
      expiresAt: String(fd.get("expires_at") ?? "") || null,
      docType: String(fd.get("doc_type") ?? "").trim() || null,
      referenceNo: String(fd.get("reference_no") ?? "").trim() || null,
      visibility,
      note: String(fd.get("note") ?? "").trim() || null,
    });
    if (created.error || !created.entryId || !created.folderId) {
      setError(created.error ?? "Something went wrong.");
      setSaving(false);
      return;
    }

    const files = Array.from(fileRef.current?.files ?? []).filter((f) => f.size > 0);
    for (const file of files) {
      let uploaded: UploadedFile | undefined;
      try {
        uploaded = await uploadFileDirect(file, "document", created.folderId);
        const result = await attachDocFileAction({
          entryId: created.entryId,
          fileName: file.name,
          mimeType: file.type || null,
          sizeBytes: file.size,
          uploaded,
        });
        if (result.error) throw new Error(result.error);
      } catch (err) {
        if (uploaded) await rollbackUpload(uploaded);
        setError(`Entry saved, but ${(err as Error).message}`);
        setSaving(false);
        return;
      }
    }

    router.push(`/family/documents/${created.folderId}`);
    router.refresh();
  }

  return (
    <div>
      <DetailHeader backHref="/family?seg=documents" eyebrow="HUB 01 · NEW ENTRY" />
      <div style={{ padding: "0 22px 22px" }}>
        <h3 style={{ fontSize: 30, margin: "0 0 16px" }}>Add a document</h3>
        <form onSubmit={onSubmit}>
          <ErrorText message={error} />

          <div className="blueprint placeholder-fill" style={{ padding: "22px 16px", textAlign: "center", marginBottom: 18 }}>
            <div style={{ font: "600 17px/1.15 var(--font-heading)", margin: "0 0 4px" }}>Choose files</div>
            <div style={{ fontSize: 11.5, color: "var(--color-neutral-700)", marginBottom: 12 }}>PDF, JPG, PNG, HEIC.</div>
            <input
              ref={fileRef}
              type="file"
              name="files"
              multiple
              accept=".pdf,.jpg,.jpeg,.png,.heic"
              style={{ margin: "0 auto" }}
              onChange={() => setFileNames(Array.from(fileRef.current?.files ?? []).map((f) => f.name))}
            />
            {fileNames.length > 0 && (
              <div style={{ fontSize: 11, color: "var(--color-neutral-700)", marginTop: 8 }}>{fileNames.join(", ")}</div>
            )}
          </div>

          <div className="field" style={{ marginBottom: 14 }}>
            <label>ENTRY TITLE</label>
            <input className="input" name="title" required style={{ minHeight: 44 }} />
          </div>

          <div style={{ fontSize: 11.5, color: "var(--color-neutral-700)", marginBottom: 6 }}>Folder</div>
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 16 }}>
            {folders.map((f) => (
              <button key={f.id} type="button" className="chip" data-active={folderId === f.id} onClick={() => setFolderId(f.id)}>
                {f.name}
              </button>
            ))}
            <button type="button" className="chip" data-active={folderId === "__new__"} onClick={() => setFolderId("__new__")}>
              + New folder
            </button>
          </div>
          {folderId === "__new__" && (
            <div className="field" style={{ marginBottom: 16 }}>
              <label>NEW FOLDER NAME</label>
              <input className="input" name="new_folder_name" placeholder="e.g. Insurance policies" required style={{ minHeight: 44 }} />
            </div>
          )}

          <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
            <div className="field" style={{ flex: 1 }}>
              <label>BELONGS TO</label>
              <select className="input" name="owner_member_id" style={{ minHeight: 44 }}>
                <option value="">Whole family</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>EXPIRES</label>
              <input className="input" type="date" name="expires_at" style={{ minHeight: 44 }} />
            </div>
          </div>

          <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
            <div className="field" style={{ flex: 1 }}>
              <label>DOCUMENT TYPE</label>
              <input className="input" name="doc_type" placeholder="e.g. Application form" style={{ minHeight: 44 }} />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>REFERENCE NO.</label>
              <input className="input" name="reference_no" placeholder="Optional" style={{ minHeight: 44 }} />
            </div>
          </div>

          <div style={{ fontSize: 11.5, color: "var(--color-neutral-700)", marginBottom: 6 }}>Visible to</div>
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 16 }}>
            {VISIBILITY.map((v) => (
              <button key={v.value} type="button" className="chip" data-active={visibility === v.value} onClick={() => setVisibility(v.value)}>
                {v.label}
              </button>
            ))}
          </div>

          <div className="field" style={{ marginBottom: 18 }}>
            <label>NOTE</label>
            <input className="input" name="note" placeholder="Anything worth remembering" style={{ minHeight: 44 }} />
          </div>

          <button type="submit" className="btn btn-primary btn-block" style={{ minHeight: 46, fontSize: 14, letterSpacing: ".04em" }} disabled={saving}>
            {saving ? "SAVING…" : "SAVE ENTRY"}
          </button>
        </form>
      </div>
    </div>
  );
}
