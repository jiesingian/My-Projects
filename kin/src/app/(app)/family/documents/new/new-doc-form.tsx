"use client";

import { useActionState, useState } from "react";
import { createDocEntryAction } from "@/lib/actions/documents";
import type { ActionState } from "@/lib/actions/auth";
import { SubmitButton, ErrorText } from "@/components/form";
import { DetailHeader } from "@/components/hub-header";
import type { Tables } from "@/lib/database.types";

const initialState: ActionState = { error: null };
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
  const [state, formAction] = useActionState(createDocEntryAction, initialState);
  const [folderId, setFolderId] = useState(defaultFolderId ?? folders[0]?.id ?? "__new__");
  const [visibility, setVisibility] = useState("family");

  return (
    <div>
      <DetailHeader backHref="/family?seg=documents" eyebrow="HUB 01 · NEW ENTRY" />
      <div style={{ padding: "0 22px 22px" }}>
        <h3 style={{ fontSize: 30, margin: "0 0 16px" }}>Add a document</h3>
        <form action={formAction}>
          <input type="hidden" name="folder_id" value={folderId} />
          <input type="hidden" name="visibility" value={visibility} />
          <ErrorText message={state.error} />

          <div
            className="blueprint placeholder-fill"
            style={{ padding: "22px 16px", textAlign: "center", marginBottom: 18 }}
          >
            <div style={{ font: "600 17px/1.15 var(--font-heading)", margin: "0 0 4px" }}>Choose files</div>
            <div style={{ fontSize: 11.5, color: "var(--color-neutral-700)", marginBottom: 12 }}>
              PDF, JPG, PNG, HEIC.
            </div>
            <input type="file" name="files" multiple accept=".pdf,.jpg,.jpeg,.png,.heic" style={{ margin: "0 auto" }} />
          </div>

          <div className="field" style={{ marginBottom: 14 }}>
            <label>ENTRY TITLE</label>
            <input className="input" name="title" required style={{ minHeight: 44 }} />
          </div>

          <div style={{ fontSize: 11.5, color: "var(--color-neutral-700)", marginBottom: 6 }}>Folder</div>
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 16 }}>
            {folders.map((f) => (
              <button
                key={f.id}
                type="button"
                className="chip"
                data-active={folderId === f.id}
                onClick={() => setFolderId(f.id)}
              >
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

          <SubmitButton style={{ minHeight: 46, fontSize: 14, letterSpacing: ".04em" }}>SAVE ENTRY</SubmitButton>
        </form>
      </div>
    </div>
  );
}
