"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateOwnProfileAction, updateMemberProfileAction, type ProfileFields } from "@/lib/actions/profile";
import { formatDate } from "@/lib/format";

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
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: "var(--color-divider)", border: "1px solid var(--color-divider)" }}>
          {[
            ["Date of birth", fields.dob ? formatDate(fields.dob) : "Not recorded"],
            ["Mobile", fields.mobile ?? "Not recorded"],
            ["Blood type", fields.blood_type ?? "Not recorded"],
            ["Allergies", fields.allergies ?? "None recorded"],
            ["Insurance", fields.insurance_info ?? "Not recorded"],
            ["Physician", fields.physician_name ?? "Not recorded"],
          ].map(([k, v]) => (
            <div key={k} style={{ background: "var(--color-bg)", padding: "10px 12px" }}>
              <div style={{ fontSize: 9, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--color-neutral-600)" }}>{k}</div>
              <div style={{ fontSize: 13.5 }}>{v}</div>
            </div>
          ))}
        </div>
        {canEdit && (
          <button type="button" className="btn btn-secondary btn-block" style={{ minHeight: 40, fontSize: 12, marginTop: 10 }} onClick={() => setMode("edit")}>
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
