"use client";

import { useId, useState } from "react";
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
import { confirm } from "@/components/confirm-sheet";

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
  const uid = useId();
  return (
    <div className="field" style={{ marginBottom: "0.5rem" }}>
      <label htmlFor={uid}>{label}</label>
      <select id={uid} className="input" value={value} onChange={(e) => onChange(e.target.value)} style={{ minHeight: "2.5rem" }} disabled={disabled}>
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
  const uid = useId();
  return (
    <div style={{ marginTop: "0.5rem", marginBottom: "0.625rem" }}>
      <div className="field" style={{ marginBottom: "0.5rem" }}>
        <label htmlFor={`${uid}-name`}>NAME</label>
        <input id={`${uid}-name`} aria-label="Name" className="input" value={fields.fullName} onChange={(e) => set("fullName", e.target.value)} style={{ minHeight: "2.5rem" }} disabled={busy} />
      </div>
      <div className="field" style={{ marginBottom: "0.5rem" }}>
        <label htmlFor={`${uid}-dob`}>DATE OF BIRTH (OPTIONAL)</label>
        <input id={`${uid}-dob`} aria-label="Date of birth" className="input" type="date" value={fields.dob} onChange={(e) => set("dob", e.target.value)} style={{ minHeight: "2.5rem" }} disabled={busy} />
      </div>
      <div className="field" style={{ marginBottom: "0.5rem" }}>
        <label htmlFor={`${uid}-notes`}>NOTES (OPTIONAL)</label>
        <input id={`${uid}-notes`} aria-label="Notes" className="input" placeholder="e.g. Emigrated in 1978" value={fields.notes} onChange={(e) => set("notes", e.target.value)} style={{ minHeight: "2.5rem" }} disabled={busy} />
      </div>
      {error && <p style={{ color: "var(--color-accent-700)", fontSize: "0.8125rem", margin: "0 0 8px" }}>{error}</p>}
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button type="button" className="btn btn-secondary" style={{ flex: 1, minHeight: "2.375rem", fontSize: "0.84375rem" }} disabled={busy} onClick={onCancel}>
          CANCEL
        </button>
        <button type="button" className="btn btn-primary" style={{ flex: 1, minHeight: "2.375rem", fontSize: "0.84375rem" }} disabled={busy} onClick={onSave}>
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
    if (!(await confirm({ title: `Remove ${p.fullName} from the tree?`, description: "This can't be undone.", confirmLabel: "Remove", danger: true }))) return;
    const result = await removeTreePersonAction(p.id);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  if (!open) {
    return (
      <button type="button" className="btn btn-secondary btn-block" style={{ minHeight: "2.5rem", fontSize: "0.84375rem", letterSpacing: ".04em", marginTop: "0.875rem" }} onClick={() => setOpen(true)}>
        EDIT THE TREE
      </button>
    );
  }

  return (
    <div style={{ marginTop: "0.875rem" }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: "0.625rem" }}>
        <div style={{ font: "600 0.8125rem/1 var(--font-heading)", letterSpacing: ".02em", color: "var(--color-neutral-600)", flex: 1 }}>PEOPLE IN THE TREE</div>
        <button type="button" className="btn btn-ghost" style={{ fontSize: "0.8125rem" }} onClick={() => setOpen(false)}>
          Done
        </button>
      </div>

      {/* Removing someone, or adding a member to the tree, has no form open
          to show its own error in -- this is the only place either is
          visible. */}
      {error && mode === "none" && <p style={{ color: "var(--color-accent-700)", fontSize: "0.8125rem", margin: "0 0 10px" }}>{error}</p>}

      {people.length === 0 && <div style={{ fontSize: "0.84375rem", color: "var(--color-neutral-600)", marginBottom: "0.625rem" }}>Nobody&apos;s been added yet.</div>}

      {people.map((p) =>
        typeof mode === "object" && "editLinks" in mode && mode.editLinks === p.id ? (
          <div key={p.id} style={{ padding: "0.625rem 0", borderBottom: "1px solid var(--color-divider)" }}>
            <div style={{ font: "600 0.875rem/1.1 var(--font-heading)", marginBottom: "0.5rem" }}>{p.fullName}</div>
            <LinkPicker label="FATHER" value={links.fatherId ?? ""} onChange={(v) => setLinks((l) => ({ ...l, fatherId: v || null }))} people={people} excludeId={p.id} disabled={busy} />
            <LinkPicker label="MOTHER" value={links.motherId ?? ""} onChange={(v) => setLinks((l) => ({ ...l, motherId: v || null }))} people={people} excludeId={p.id} disabled={busy} />
            <LinkPicker label="SPOUSE" value={links.spouseId ?? ""} onChange={(v) => setLinks((l) => ({ ...l, spouseId: v || null }))} people={people} excludeId={p.id} disabled={busy} />
            {error && <p style={{ color: "var(--color-accent-700)", fontSize: "0.8125rem", margin: "0 0 8px" }}>{error}</p>}
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button type="button" className="btn btn-secondary" style={{ flex: 1, minHeight: "2.375rem", fontSize: "0.84375rem" }} disabled={busy} onClick={cancel}>
                CANCEL
              </button>
              <button type="button" className="btn btn-primary" style={{ flex: 1, minHeight: "2.375rem", fontSize: "0.84375rem" }} disabled={busy} onClick={() => saveLinks(p.id)}>
                {busy ? "SAVING…" : "SAVE LINKS"}
              </button>
            </div>
          </div>
        ) : typeof mode === "object" && "editName" in mode && mode.editName === p.id ? (
          <div key={p.id} style={{ borderBottom: "1px solid var(--color-divider)" }}>
            <PersonForm fields={fields} set={set} busy={busy} error={error} onCancel={cancel} onSave={saveRelative} saveLabel="SAVE" />
          </div>
        ) : (
          <div key={p.id} style={{ display: "flex", alignItems: "center", gap: "0.625rem", padding: "0.5625rem 0", borderBottom: "1px solid var(--color-divider)" }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: "0.875rem", fontWeight: 600, display: "block" }}>
                {p.fullName}
                {p.memberId && (
                  <span style={{ fontSize: "0.65625rem", fontWeight: 600, color: "var(--color-accent-700)", marginLeft: "0.375rem", verticalAlign: "middle" }}>KIN MEMBER</span>
                )}
              </span>
              <span style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)" }}>
                Father: {people.find((o) => o.id === p.fatherId)?.fullName ?? "—"} · Mother: {people.find((o) => o.id === p.motherId)?.fullName ?? "—"} · Spouse:{" "}
                {people.find((o) => o.id === p.spouseId)?.fullName ?? "—"}
              </span>
            </span>
            <button type="button" onClick={() => startEditLinks(p)} style={{ all: "unset", cursor: "pointer", fontSize: "0.78125rem", color: "var(--color-accent-700)" }}>
              LINKS
            </button>
            {!p.memberId && (
              <button type="button" onClick={() => startEditName(p)} style={{ all: "unset", cursor: "pointer", fontSize: "0.78125rem", color: "var(--color-accent-700)" }}>
                EDIT
              </button>
            )}
            <button type="button" onClick={() => remove(p)} style={{ all: "unset", cursor: "pointer", fontSize: "0.78125rem", color: "var(--color-accent-700)" }}>
              REMOVE
            </button>
          </div>
        ),
      )}

      {mode === "add-relative" ? (
        <PersonForm fields={fields} set={set} busy={busy} error={error} onCancel={cancel} onSave={saveRelative} saveLabel="ADD RELATIVE" />
      ) : (
        <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem", flexWrap: "wrap" }}>
          <button type="button" className="btn btn-secondary" style={{ flex: 1, minHeight: "2.375rem", fontSize: "0.8125rem" }} onClick={startAddRelative}>
            + ADD RELATIVE
          </button>
          {unaddedMembers.length > 0 && (
            <select
              className="input"
              style={{ flex: 1, minHeight: "2.375rem", fontSize: "0.8125rem" }}
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
