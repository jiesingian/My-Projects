"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import {
  addEmergencyContactAction,
  updateEmergencyContactAction,
  removeEmergencyContactAction,
  type EmergencyContactFields,
} from "@/lib/actions/family";
import { confirm } from "@/components/confirm-sheet";

export type EmergencyContact = {
  id: string;
  name: string;
  relationship: string;
  phone: string;
  note: string | null;
};

const emptyFields: EmergencyContactFields = { name: "", relationship: "", phone: "", note: "" };

function fieldsFromContact(c: EmergencyContact): EmergencyContactFields {
  return { name: c.name, relationship: c.relationship, phone: c.phone, note: c.note ?? "" };
}

function ContactForm({
  fields,
  set,
  busy,
  error,
  onCancel,
  onSave,
  saveLabel,
}: {
  fields: EmergencyContactFields;
  set: <K extends keyof EmergencyContactFields>(key: K, value: string) => void;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSave: () => void;
  saveLabel: string;
}) {
  const uid = useId();
  return (
    <div style={{ marginTop: 10, marginBottom: 10 }}>
      <div className="field" style={{ marginBottom: 8 }}>
        <label htmlFor={`${uid}-name`}>NAME</label>
        <input id={`${uid}-name`} aria-label="Name" className="input" placeholder="Dr. Santos" value={fields.name} onChange={(e) => set("name", e.target.value)} style={{ minHeight: 40 }} disabled={busy} />
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor={`${uid}-relationship`}>RELATIONSHIP</label>
          <input id={`${uid}-relationship`} aria-label="Relationship" className="input" placeholder="Pediatrician" value={fields.relationship} onChange={(e) => set("relationship", e.target.value)} style={{ minHeight: 40 }} disabled={busy} />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor={`${uid}-phone`}>PHONE</label>
          <input id={`${uid}-phone`} aria-label="Phone" type="tel" className="input" placeholder="0917 000 0000" value={fields.phone} onChange={(e) => set("phone", e.target.value)} style={{ minHeight: 40 }} disabled={busy} />
        </div>
      </div>
      <div className="field" style={{ marginBottom: 8 }}>
        <label htmlFor={`${uid}-note`}>NOTE</label>
        <input id={`${uid}-note`} aria-label="Note" className="input" placeholder="Clinic hours, address, anything worth remembering" value={fields.note} onChange={(e) => set("note", e.target.value)} style={{ minHeight: 40 }} disabled={busy} />
      </div>
      {error && <p style={{ color: "var(--color-accent-700)", fontSize: 13, margin: "0 0 8px" }}>{error}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" className="btn btn-secondary" style={{ flex: 1, minHeight: 38, fontSize: 13.5 }} disabled={busy} onClick={onCancel}>
          CANCEL
        </button>
        <button type="button" className="btn btn-primary" style={{ flex: 1, minHeight: 38, fontSize: 13.5 }} disabled={busy} onClick={onSave}>
          {busy ? "SAVING…" : saveLabel}
        </button>
      </div>
    </div>
  );
}

/** A short list of who to call in a hurry -- a pediatrician, poison control,
 * a relative five minutes away -- open to any signed-in member to keep, the
 * same reasoning milestones and the family tree already follow. Not tied to
 * a Kin member: most of these are people or services the household will
 * never invite to sign in. */
export function EmergencyContactList({ contacts }: { contacts: EmergencyContact[] }) {
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [fields, setFields] = useState<EmergencyContactFields>(emptyFields);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function set<K extends keyof EmergencyContactFields>(key: K, value: string) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  function startAdd() {
    setFields(emptyFields);
    setError(null);
    setEditingId("new");
  }

  function startEdit(c: EmergencyContact) {
    setFields(fieldsFromContact(c));
    setError(null);
    setEditingId(c.id);
  }

  function cancelForm() {
    setError(null);
    setEditingId(null);
  }

  async function save() {
    setBusy(true);
    setError(null);
    const result = editingId === "new" ? await addEmergencyContactAction(fields) : await updateEmergencyContactAction(editingId!, fields);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setEditingId(null);
    router.refresh();
  }

  async function remove(id: string) {
    if (!(await confirm({ title: "Remove this contact?", danger: true }))) return;
    const result = await removeEmergencyContactAction(id);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div style={{ marginBottom: 20 }}>
      {/* Removing a contact has no form open to show its own error in --
          this is the only place a failed remove() is ever visible. */}
      {error && editingId === null && <p style={{ color: "var(--color-accent-700)", fontSize: 13, margin: "0 0 8px" }}>{error}</p>}
      {contacts.length === 0 && editingId !== "new" && (
        <div style={{ fontSize: 13.5, color: "var(--color-neutral-600)", marginBottom: 10 }}>
          No emergency contacts yet — start with a pediatrician, poison control, or a relative nearby.
        </div>
      )}
      {contacts.map((c) =>
        editingId === c.id ? (
          <ContactForm key={c.id} fields={fields} set={set} busy={busy} error={error} onCancel={cancelForm} onSave={save} saveLabel="SAVE CONTACT" />
        ) : (
          <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "1px solid var(--color-divider)" }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ font: "600 15px/1.1 var(--font-heading)", display: "block" }}>{c.name}</span>
              <span style={{ fontSize: 13, color: "var(--color-neutral-600)" }}>
                {c.relationship}
                {c.note ? ` · ${c.note}` : ""}
              </span>
            </span>
            <a href={`tel:${c.phone}`} style={{ fontSize: 13, color: "var(--color-accent-700)", textDecoration: "none", flex: "none", fontFamily: "var(--font-numeric)" }}>
              {c.phone}
            </a>
            <button type="button" onClick={() => startEdit(c)} style={{ all: "unset", cursor: "pointer", fontSize: 13, color: "var(--color-accent-700)" }}>
              EDIT
            </button>
            <button type="button" onClick={() => remove(c.id)} style={{ all: "unset", cursor: "pointer", fontSize: 13, color: "var(--color-accent-700)" }}>
              REMOVE
            </button>
          </div>
        ),
      )}

      {editingId === "new" ? (
        <ContactForm fields={fields} set={set} busy={busy} error={error} onCancel={cancelForm} onSave={save} saveLabel="SAVE CONTACT" />
      ) : (
        <button type="button" className="btn btn-secondary btn-block" style={{ minHeight: 36, fontSize: 13, marginTop: 10 }} onClick={startAdd}>
          + ADD CONTACT
        </button>
      )}
    </div>
  );
}
