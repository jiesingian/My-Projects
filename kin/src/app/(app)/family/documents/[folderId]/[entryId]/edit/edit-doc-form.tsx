"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { updateDocEntryAction } from "@/lib/actions/documents";
import { ErrorText } from "@/components/form";
import { DetailHeader } from "@/components/hub-header";
import type { Tables } from "@/lib/database.types";
import { DateInput } from "@/components/date-input";
import { visibilityOptions } from "@/lib/visibility";

export function EditDocForm({
  entry,
  folderId,
  folderName,
  members,
  myRole,
}: {
  entry: Tables<"doc_entries">;
  folderId: string;
  folderName: string;
  members: Tables<"members">[];
  myRole: string;
}) {
  const uid = useId();
  const VISIBILITY = visibilityOptions(myRole);
  const [visibility, setVisibility] = useState(entry.visibility);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const router = useRouter();
  const backHref = `/family/documents/${folderId}`;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const fd = new FormData(e.currentTarget);
    const result = await updateDocEntryAction({
      entryId: entry.id,
      folderId,
      title: String(fd.get("title") ?? ""),
      ownerMemberId: String(fd.get("owner_member_id") ?? "") || null,
      expiresAt: String(fd.get("expires_at") ?? "") || null,
      docType: String(fd.get("doc_type") ?? "").trim() || null,
      referenceNo: String(fd.get("reference_no") ?? "").trim() || null,
      visibility,
      note: String(fd.get("note") ?? "").trim() || null,
    });
    if (result.error) {
      setError(result.error);
      setSaving(false);
      return;
    }

    router.push(backHref);
    router.refresh();
  }

  return (
    <div>
      <DetailHeader
        backHref={backHref}
        eyebrow="Family"
        trail={[
          { label: "Docs", href: "/family?seg=documents" },
          { label: folderName, href: backHref },
          { label: entry.title },
        ]}
      />
      <div style={{ padding: "0 1.375rem 1.375rem" }}>
        <h3 style={{ fontSize: "1.875rem", margin: "0 0 16px" }}>Edit document entry</h3>
        <form onSubmit={onSubmit}>
          <ErrorText message={error} />

          <div className="field" style={{ marginBottom: "0.875rem" }}>
            <label htmlFor={`${uid}-title`}>Entry title</label>
            <input id={`${uid}-title`} aria-label="Entry Title" className="input" name="title" defaultValue={entry.title} required maxLength={150} style={{ minHeight: "2.75rem" }} />
          </div>

          <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem" }}>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor={`${uid}-owner`}>Belongs to</label>
              <select id={`${uid}-owner`} aria-label="Belongs To" className="input" name="owner_member_id" defaultValue={entry.owner_member_id ?? ""} style={{ minHeight: "2.75rem" }}>
                <option value="">Whole family</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor={`${uid}-expires`}>Expires</label>
              <DateInput id={`${uid}-expires`} aria-label="Expires" className="input" name="expires_at" defaultValue={entry.expires_at ?? ""} style={{ minHeight: "2.75rem" }} />
            </div>
          </div>

          <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem" }}>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor={`${uid}-doc-type`}>Document type</label>
              <input id={`${uid}-doc-type`} aria-label="Document Type" className="input" name="doc_type" defaultValue={entry.doc_type ?? ""} placeholder="e.g. Application form" maxLength={50} style={{ minHeight: "2.75rem" }} />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor={`${uid}-reference-no`}>Reference no.</label>
              <input id={`${uid}-reference-no`} aria-label="Reference No." className="input" name="reference_no" defaultValue={entry.reference_no ?? ""} placeholder="Optional" maxLength={100} style={{ minHeight: "2.75rem" }} />
            </div>
          </div>

          <div style={{ fontSize: "0.8125rem", color: "var(--color-neutral-700)", marginBottom: "0.375rem" }}>Visible to</div>
          <div style={{ display: "flex", gap: "0.4375rem", flexWrap: "wrap", marginBottom: "1rem" }}>
            {VISIBILITY.map((v) => (
              <button key={v.value} type="button" className="chip" data-active={visibility === v.value} onClick={() => setVisibility(v.value)}>
                {v.label}
              </button>
            ))}
          </div>

          <div className="field" style={{ marginBottom: "1.125rem" }}>
            <label htmlFor={`${uid}-note`}>Note</label>
            <input id={`${uid}-note`} aria-label="Note" className="input" name="note" defaultValue={entry.note ?? ""} placeholder="Anything worth remembering" maxLength={1000} style={{ minHeight: "2.75rem" }} />
          </div>

          <button type="submit" className="btn btn-primary btn-block" style={{ minHeight: "2.875rem", fontSize: "0.875rem", letterSpacing: ".04em" }} disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </button>
        </form>
      </div>
    </div>
  );
}
