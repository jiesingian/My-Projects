"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateOwnProfileAction, updateMemberProfileAction, type ProfileFields } from "@/lib/actions/profile";

export function ProfileEditForm({
  memberId,
  isSelf,
  initial,
}: {
  memberId: string;
  isSelf: boolean;
  initial: ProfileFields;
}) {
  const [fields, setFields] = useState<ProfileFields>(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  function set<K extends keyof ProfileFields>(key: K, value: ProfileFields[K]) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    setBusy(true);
    const result = isSelf ? await updateOwnProfileAction(fields) : await updateMemberProfileAction(memberId, fields);
    setBusy(false);
    setError(result.error);
    if (!result.error) router.refresh();
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <div className="field" style={{ marginBottom: 10 }}>
        <label>FULL NAME</label>
        <input className="input" value={fields.full_name} onChange={(e) => set("full_name", e.target.value)} style={{ minHeight: 44 }} disabled={busy} />
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <div className="field" style={{ flex: 1 }}>
          <label>DATE OF BIRTH</label>
          <input className="input" type="date" value={fields.dob ?? ""} onChange={(e) => set("dob", e.target.value || null)} style={{ minHeight: 44 }} disabled={busy} />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>MOBILE</label>
          <input className="input" value={fields.mobile ?? ""} onChange={(e) => set("mobile", e.target.value || null)} style={{ minHeight: 44 }} disabled={busy} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <div className="field" style={{ flex: 1 }}>
          <label>BLOOD TYPE</label>
          <input className="input" value={fields.blood_type ?? ""} onChange={(e) => set("blood_type", e.target.value || null)} style={{ minHeight: 44 }} disabled={busy} />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>ALLERGIES</label>
          <input className="input" value={fields.allergies ?? ""} onChange={(e) => set("allergies", e.target.value || null)} style={{ minHeight: 44 }} disabled={busy} />
        </div>
      </div>
      <div className="field" style={{ marginBottom: 10 }}>
        <label>INSURANCE</label>
        <input className="input" value={fields.insurance_info ?? ""} onChange={(e) => set("insurance_info", e.target.value || null)} style={{ minHeight: 44 }} disabled={busy} />
      </div>
      <div className="field" style={{ marginBottom: 14 }}>
        <label>PHYSICIAN</label>
        <input className="input" value={fields.physician_name ?? ""} onChange={(e) => set("physician_name", e.target.value || null)} style={{ minHeight: 44 }} disabled={busy} />
      </div>
      {error && <p style={{ color: "var(--color-accent-700)", fontSize: 11.5, margin: "0 0 10px" }}>{error}</p>}
      <button type="button" className="btn btn-secondary btn-block" style={{ minHeight: 44, fontSize: 13 }} disabled={busy} onClick={save}>
        {busy ? "SAVING…" : "SAVE PROFILE"}
      </button>
    </div>
  );
}
