"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ProfileFieldsView, ProfileFieldsEditor } from "@/components/profile-fields";
import { updateOwnProfileAction, updateMemberProfileAction, type ProfileFields } from "@/lib/actions/profile";

export function ProfileEditForm({
  memberId,
  isSelf,
  canEdit,
  initial,
}: {
  memberId: string;
  isSelf: boolean;
  canEdit: boolean;
  initial: ProfileFields;
}) {
  const [mode, setMode] = useState<"view" | "edit">("view");
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
      <div style={{ marginBottom: 20 }}>
        <ProfileFieldsView fields={fields} />
        {canEdit && (
          <button type="button" className="btn btn-secondary btn-block" style={{ minHeight: 40, fontSize: 13.5, marginTop: 10 }} onClick={() => setMode("edit")}>
            EDIT PROFILE
          </button>
        )}
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <div className="field" style={{ marginBottom: 10 }}>
        <label>FULL NAME</label>
        <input className="input" value={fields.full_name} onChange={(e) => set("full_name", e.target.value)} style={{ minHeight: 44 }} disabled={busy} />
      </div>
      <ProfileFieldsEditor fields={fields} set={set} busy={busy} />
      {error && <p style={{ color: "var(--color-accent-700)", fontSize: 13, margin: "0 0 10px" }}>{error}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" className="btn btn-secondary" style={{ flex: 1, minHeight: 44, fontSize: 13 }} disabled={busy} onClick={cancel}>
          CANCEL
        </button>
        <button type="button" className="btn btn-primary" style={{ flex: 1, minHeight: 44, fontSize: 13 }} disabled={busy} onClick={save}>
          {busy ? "SAVING…" : "SAVE"}
        </button>
      </div>
    </div>
  );
}
