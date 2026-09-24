"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { ProfileFieldsView, ProfileFieldsEditor } from "@/components/profile-fields";
import { updateOwnProfileAction, updateMemberProfileAction, type ProfileFields } from "@/lib/actions/profile";

export function ProfileEditForm({
  memberId,
  isSelf,
  canEdit,
  initial,
  dateFormat,
}: {
  memberId: string;
  isSelf: boolean;
  canEdit: boolean;
  initial: ProfileFields;
  dateFormat?: string;
}) {
  const [mode, setMode] = useState<"view" | "edit">("view");
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
    const result = isSelf ? await updateOwnProfileAction(fields) : await updateMemberProfileAction(memberId, fields);
    setBusy(false);
    setError(result.error);
    if (!result.error) {
      setMode("view");
      router.refresh();
    }
  }

  if (mode === "view") {
    return (
      <div style={{ marginBottom: "1.25rem" }}>
        <ProfileFieldsView fields={fields} dateFormat={dateFormat} />
        {canEdit && (
          <button type="button" className="btn btn-secondary btn-block" style={{ minHeight: "2.5rem", fontSize: "0.84375rem", marginTop: "0.625rem" }} onClick={() => setMode("edit")}>
            Edit profile
          </button>
        )}
      </div>
    );
  }

  return (
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
  );
}
