"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  addTreeMemberAction,
  addTreePersonAction,
  updateTreePersonAction,
  setTreeLinksAction,
  removeTreePersonAction,
  type TreePersonFields,
  type TreeLinkFields,
} from "@/lib/actions/family";
import type { TreePerson } from "@/lib/queries/family";

type MemberOption = { id: string; full_name: string };

const emptyFields: TreePersonFields = { fullName: "", dob: "", notes: "" };

function personLabel(p: TreePerson): string {
  return p.dob ? `${p.fullName} (b. ${p.dob.slice(0, 4)})` : p.fullName;
}

function LinkPicker({
  label,
  value,
  onChange,
  people,
  excludeId,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  people: TreePerson[];
  excludeId: string;
  disabled: boolean;
}) {
  return (
    <div className="field" style={{ marginBottom: 8 }}>
      <label>{label}</label>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)} style={{ minHeight: 40 }} disabled={disabled}>
        <option value="">Not recorded</option>
        {people
          .filter((p) => p.id !== excludeId)
          .map((p) => (
            <option key={p.id} value={p.id}>
              {personLabel(p)}
            </option>
          ))}
      </select>
    </div>
  );
}

function PersonForm({
  fields,
  set,
  busy,
  error,
  onCancel,
  onSave,
  saveLabel,
}: {
  fields: TreePersonFields;
  set: <K extends keyof TreePersonFields>(key: K, value: string) => void;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSave: () => void;
  saveLabel: string;
}) {
  return (
    <div style={{ marginTop: 8, marginBottom: 10 }}>
      <div className="field" style={{ marginBottom: 8 }}>
        <label>NAME</label>
        <input aria-label="Name" className="input" value={fields.fullName} onChange={(e) => set("fullName", e.target.value)} style={{ minHeight: 40 }} disabled={busy} />
      </div>
      <div className="field" style={{ marginBottom: 8 }}>
        <label>DATE OF BIRTH (OPTIONAL)</label>
        <input aria-label="Date of birth" className="input" type="date" value={fields.dob} onChange={(e) => set("dob", e.target.value)} style={{ minHeight: 40 }} disabled={busy} />
      </div>
      <div className="field" style={{ marginBottom: 8 }}>
        <label>NOTES (OPTIONAL)</label>
        <input aria-label="Notes" className="input" placeholder="e.g. Emigrated in 1978" value={fields.notes} onChange={(e) => set("notes", e.target.value)} style={{ minHeight: 40 }} disabled={busy} />
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

/** Manages who's in the tree and how they link together: add a relative who
 * never had a Kin login, bring in an existing household member, set each
 * person's father/mother/spouse, or remove one. FamilyTreeView reads back
 * whatever this produces -- nothing here draws the tree itself. */
export function FamilyTreeEditor({ people, unaddedMembers }: { people: TreePerson[]; unaddedMembers: MemberOption[] }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"none" | "add-relative" | { editName: string } | { editLinks: string }>("none");
  const [fields, setFields] = useState<TreePersonFields>(emptyFields);
  const [links, setLinks] = useState<TreeLinkFields>({ fatherId: null, motherId: null, spouseId: null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function set<K extends keyof TreePersonFields>(key: K, value: string) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  function startAddRelative() {
    setFields(emptyFields);
    setError(null);
    setMode("add-relative");
  }

  function startEditName(p: TreePerson) {
    setFields({ fullName: p.fullName, dob: p.dob ?? "", notes: p.notes ?? "" });
    setError(null);
    setMode({ editName: p.id });
  }

  function startEditLinks(p: TreePerson) {
    setLinks({ fatherId: p.fatherId, motherId: p.motherId, spouseId: p.spouseId });
    setError(null);
    setMode({ editLinks: p.id });
  }

  function cancel() {
    setError(null);
    setMode("none");
  }

  async function saveRelative() {
    setBusy(true);
    setError(null);
    const result =
      typeof mode === "object" && "editName" in mode
        ? await updateTreePersonAction(mode.editName, fields)
        : await addTreePersonAction(fields);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setMode("none");
    router.refresh();
  }

  async function saveLinks(id: string) {
    setBusy(true);
    setError(null);
    const result = await setTreeLinksAction(id, links);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setMode("none");
    router.refresh();
  }

  async function addMember(memberId: string) {
    setBusy(true);
    const result = await addTreeMemberAction(memberId);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  async function remove(p: TreePerson) {
    if (!window.confirm(`Remove ${p.fullName} from the tree? This can't be undone.`)) return;
    await removeTreePersonAction(p.id);
    router.refresh();
  }

  if (!open) {
    return (
      <button type="button" className="btn btn-secondary btn-block" style={{ minHeight: 40, fontSize: 13.5, letterSpacing: ".04em", marginTop: 14 }} onClick={() => setOpen(true)}>
        EDIT THE TREE
      </button>
    );
  }

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
        <div style={{ font: "600 13px/1 var(--font-heading)", letterSpacing: ".02em", color: "var(--color-neutral-600)", flex: 1 }}>PEOPLE IN THE TREE</div>
        <button type="button" className="btn btn-ghost" style={{ fontSize: 13 }} onClick={() => setOpen(false)}>
          Done
        </button>
      </div>

      {people.length === 0 && <div style={{ fontSize: 13.5, color: "var(--color-neutral-600)", marginBottom: 10 }}>Nobody&apos;s been added yet.</div>}

      {people.map((p) =>
        typeof mode === "object" && "editLinks" in mode && mode.editLinks === p.id ? (
          <div key={p.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--color-divider)" }}>
            <div style={{ font: "600 14px/1.1 var(--font-heading)", marginBottom: 8 }}>{p.fullName}</div>
            <LinkPicker label="FATHER" value={links.fatherId ?? ""} onChange={(v) => setLinks((l) => ({ ...l, fatherId: v || null }))} people={people} excludeId={p.id} disabled={busy} />
            <LinkPicker label="MOTHER" value={links.motherId ?? ""} onChange={(v) => setLinks((l) => ({ ...l, motherId: v || null }))} people={people} excludeId={p.id} disabled={busy} />
            <LinkPicker label="SPOUSE" value={links.spouseId ?? ""} onChange={(v) => setLinks((l) => ({ ...l, spouseId: v || null }))} people={people} excludeId={p.id} disabled={busy} />
            {error && <p style={{ color: "var(--color-accent-700)", fontSize: 13, margin: "0 0 8px" }}>{error}</p>}
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="btn btn-secondary" style={{ flex: 1, minHeight: 38, fontSize: 13.5 }} disabled={busy} onClick={cancel}>
                CANCEL
              </button>
              <button type="button" className="btn btn-primary" style={{ flex: 1, minHeight: 38, fontSize: 13.5 }} disabled={busy} onClick={() => saveLinks(p.id)}>
                {busy ? "SAVING…" : "SAVE LINKS"}
              </button>
            </div>
          </div>
        ) : typeof mode === "object" && "editName" in mode && mode.editName === p.id ? (
          <div key={p.id} style={{ borderBottom: "1px solid var(--color-divider)" }}>
            <PersonForm fields={fields} set={set} busy={busy} error={error} onCancel={cancel} onSave={saveRelative} saveLabel="SAVE" />
          </div>
        ) : (
          <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "1px solid var(--color-divider)" }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 14, fontWeight: 600, display: "block" }}>
                {p.fullName}
                {p.memberId && (
                  <span style={{ fontSize: 10.5, fontWeight: 600, color: "var(--color-accent-700)", marginLeft: 6, verticalAlign: "middle" }}>KIN MEMBER</span>
                )}
              </span>
              <span style={{ fontSize: 12.5, color: "var(--color-neutral-600)" }}>
                Father: {people.find((o) => o.id === p.fatherId)?.fullName ?? "—"} · Mother: {people.find((o) => o.id === p.motherId)?.fullName ?? "—"} · Spouse:{" "}
                {people.find((o) => o.id === p.spouseId)?.fullName ?? "—"}
              </span>
            </span>
            <button type="button" onClick={() => startEditLinks(p)} style={{ all: "unset", cursor: "pointer", fontSize: 12.5, color: "var(--color-accent-700)" }}>
              LINKS
            </button>
            {!p.memberId && (
              <button type="button" onClick={() => startEditName(p)} style={{ all: "unset", cursor: "pointer", fontSize: 12.5, color: "var(--color-accent-700)" }}>
                EDIT
              </button>
            )}
            <button type="button" onClick={() => remove(p)} style={{ all: "unset", cursor: "pointer", fontSize: 12.5, color: "var(--color-accent-700)" }}>
              REMOVE
            </button>
          </div>
        ),
      )}

      {mode === "add-relative" ? (
        <PersonForm fields={fields} set={set} busy={busy} error={error} onCancel={cancel} onSave={saveRelative} saveLabel="ADD RELATIVE" />
      ) : (
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <button type="button" className="btn btn-secondary" style={{ flex: 1, minHeight: 38, fontSize: 13 }} onClick={startAddRelative}>
            + ADD RELATIVE
          </button>
          {unaddedMembers.length > 0 && (
            <select
              className="input"
              style={{ flex: 1, minHeight: 38, fontSize: 13 }}
              disabled={busy}
              value=""
              onChange={(e) => {
                if (e.target.value) addMember(e.target.value);
              }}
              aria-label="Add a household member to the tree"
            >
              <option value="">+ ADD HOUSEHOLD MEMBER…</option>
              {unaddedMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
    </div>
  );
}
