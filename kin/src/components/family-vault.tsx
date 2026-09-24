"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon, type IconName } from "@/components/icons";
import { confirm } from "@/components/confirm-sheet";
import { addVaultItemAction, updateVaultItemAction, removeVaultItemAction, type VaultFields } from "@/lib/actions/vault";
import type { VaultItem } from "@/lib/queries/vault";

/** The groups most households start with. Any other name works too -- these
 * are suggestions in the picker, not a list the database knows about. */
const PRESET_GROUPS: { name: string; icon: IconName }[] = [
  { name: "Wi-Fi", icon: "wifi" },
  { name: "Door & gate", icon: "house" },
  { name: "Streaming", icon: "play" },
  { name: "Utilities", icon: "receipt" },
];

function iconFor(group: string): IconName {
  return PRESET_GROUPS.find((g) => g.name.toLowerCase() === group.toLowerCase())?.icon ?? "keyRound";
}

const emptyFields = (group = "Wi-Fi"): VaultFields => ({ group, label: "", username: "", secret: "", note: "", visibility: "everyone" });

function fieldsFrom(i: VaultItem): VaultFields {
  return { group: i.group, label: i.label, username: i.username ?? "", secret: i.secret, note: i.note ?? "", visibility: i.visibility };
}

function ItemForm({
  fields,
  set,
  groups,
  busy,
  error,
  onCancel,
  onSave,
}: {
  fields: VaultFields;
  set: <K extends keyof VaultFields>(key: K, value: VaultFields[K]) => void;
  groups: string[];
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSave: () => void;
}) {
  const uid = useId();
  const [show, setShow] = useState(false);
  return (
    <div className="kin-vault-form">
      <div className="field">
        <label htmlFor={`${uid}-group`}>Group</label>
        <input id={`${uid}-group`} className="input" list={`${uid}-groups`} placeholder="Wi-Fi" value={fields.group} onChange={(e) => set("group", e.target.value)} disabled={busy} maxLength={40} />
        <datalist id={`${uid}-groups`}>
          {groups.map((g) => (
            <option key={g} value={g} />
          ))}
        </datalist>
      </div>
      <div className="field">
        <label htmlFor={`${uid}-label`}>Name</label>
        <input id={`${uid}-label`} className="input" placeholder="Home Wi-Fi, Front gate, Netflix" value={fields.label} onChange={(e) => set("label", e.target.value)} disabled={busy} maxLength={80} />
      </div>
      <div className="field">
        <label htmlFor={`${uid}-username`}>Username or network (optional)</label>
        <input id={`${uid}-username`} className="input" autoComplete="off" value={fields.username} onChange={(e) => set("username", e.target.value)} disabled={busy} maxLength={200} />
      </div>
      <div className="field">
        <label htmlFor={`${uid}-secret`}>Password or code</label>
        <div style={{ display: "flex", gap: "0.375rem" }}>
          <input
            id={`${uid}-secret`}
            className="input"
            type={show ? "text" : "password"}
            autoComplete="new-password"
            value={fields.secret}
            onChange={(e) => set("secret", e.target.value)}
            disabled={busy}
            maxLength={500}
            style={{ flex: 1, minWidth: 0, fontFamily: "var(--font-numeric)" }}
          />
          <button type="button" className="btn btn-secondary" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide" : "Show"} style={{ flex: "none", minWidth: "2.75rem" }}>
            <Icon name={show ? "eyeOff" : "eye"} size={16} />
          </button>
        </div>
      </div>
      <div className="field">
        <label htmlFor={`${uid}-note`}>Note (optional)</label>
        <input id={`${uid}-note`} className="input" placeholder="Router is behind the TV" value={fields.note} onChange={(e) => set("note", e.target.value)} disabled={busy} maxLength={500} />
      </div>
      <fieldset className="kin-vault-who" disabled={busy}>
        <legend>WHO CAN SEE IT</legend>
        <label>
          <input type="radio" name={`${uid}-vis`} checked={fields.visibility === "everyone"} onChange={() => set("visibility", "everyone")} /> Everyone in the house
        </label>
        <label>
          <input type="radio" name={`${uid}-vis`} checked={fields.visibility === "grown_ups"} onChange={() => set("visibility", "grown_ups")} /> Grown-ups only
        </label>
      </fieldset>
      {error && <p className="kin-vault-error">{error}</p>}
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button type="button" className="btn btn-secondary" style={{ flex: 1 }} disabled={busy} onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" style={{ flex: 1 }} disabled={busy} onClick={onSave}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

function SecretRow({ item, canEdit, onEdit, onRemove }: { item: VaultItem; canEdit: boolean; onEdit: () => void; onRemove: () => void }) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(item.secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Some browsers refuse the clipboard outside a secure context; showing
      // it is the fallback, so the person can still read it off the screen.
      setShown(true);
    }
  }

  return (
    <div className="kin-vault-item">
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="kin-vault-label">
          {item.label}
          {item.visibility === "grown_ups" && <span className="kin-vault-badge">GROWN-UPS</span>}
        </div>
        {item.username && <div className="kin-vault-sub">{item.username}</div>}
        <div className="kin-vault-secret" aria-live="polite">
          {shown ? item.secret : "•".repeat(Math.min(Math.max(item.secret.length, 6), 14))}
        </div>
        {item.note && <div className="kin-vault-sub">{item.note}</div>}
      </div>
      <div className="kin-vault-actions">
        <button type="button" onClick={() => setShown((s) => !s)} aria-label={shown ? `Hide ${item.label}` : `Show ${item.label}`}>
          <Icon name={shown ? "eyeOff" : "eye"} size={16} />
        </button>
        <button type="button" onClick={copy} aria-label={`Copy ${item.label}`}>
          <Icon name={copied ? "check" : "copy"} size={16} />
        </button>
        {canEdit && (
          <>
            <button type="button" onClick={onEdit} className="kin-vault-text">
              Edit
            </button>
            <button type="button" onClick={onRemove} aria-label={`Remove ${item.label}`}>
              <Icon name="trash" size={16} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** Passwords and codes the household shares -- the Wi-Fi, the door lock, the
 * gate, the streaming login -- in groups. Only rendered once the page has
 * checked the lock, and the rows it gets are only those the database lets
 * this member read. Nothing here is anybody's Kin sign-in. */
export function FamilyVault({ items, canEdit }: { items: VaultItem[]; canEdit: boolean }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [fields, setFields] = useState<VaultFields>(emptyFields());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const groupNames = [...new Set(items.map((i) => i.group))];
  const suggestions = [...new Set([...PRESET_GROUPS.map((g) => g.name), ...groupNames])];

  function set<K extends keyof VaultFields>(key: K, value: VaultFields[K]) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  function startAdd(group?: string) {
    setFields(emptyFields(group));
    setError(null);
    setEditingId("new");
  }

  function startEdit(i: VaultItem) {
    setFields(fieldsFrom(i));
    setError(null);
    setEditingId(i.id);
  }

  async function save() {
    setBusy(true);
    setError(null);
    const result = editingId === "new" ? await addVaultItemAction(fields) : await updateVaultItemAction(editingId!, fields);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setEditingId(null);
    router.refresh();
  }

  async function remove(i: VaultItem) {
    if (!(await confirm({ title: `Remove ${i.label}?`, description: "It is gone for everyone in the house.", confirmLabel: "Remove", danger: true }))) return;
    const result = await removeVaultItemAction(i.id);
    if (result.error) setError(result.error);
    else router.refresh();
  }

  const form = (
    <ItemForm fields={fields} set={set} groups={suggestions} busy={busy} error={error} onCancel={() => setEditingId(null)} onSave={save} />
  );

  return (
    <div className="kin-vault">
      {error && editingId === null && <p className="kin-vault-error">{error}</p>}

      {items.length === 0 && editingId !== "new" && (
        <div className="kin-vault-empty">
          {canEdit
            ? "Keep the Wi-Fi, the door lock code and the streaming logins here, instead of on a card on the fridge."
            : "Nothing here yet. A grown-up can add the Wi-Fi password and the door code."}
          {canEdit && (
            <div className="kin-vault-starters">
              {PRESET_GROUPS.map((g) => (
                <button key={g.name} type="button" className="kin-vault-chip" onClick={() => startAdd(g.name)}>
                  <Icon name={g.icon} size={14} /> {g.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {groupNames.map((group) => (
        <section key={group} className="kin-vault-group" aria-label={group}>
          <h4>
            <Icon name={iconFor(group)} size={15} /> {group}
          </h4>
          {items
            .filter((i) => i.group === group)
            .map((i) =>
              editingId === i.id ? (
                <div key={i.id}>{form}</div>
              ) : (
                <SecretRow key={i.id} item={i} canEdit={canEdit} onEdit={() => startEdit(i)} onRemove={() => remove(i)} />
              ),
            )}
        </section>
      ))}

      {canEdit &&
        (editingId === "new" ? (
          form
        ) : (
          <button type="button" className="btn btn-secondary btn-block" style={{ minHeight: "2.25rem", fontSize: "0.8125rem", marginTop: "0.625rem" }} onClick={() => startAdd(groupNames[0])}>
            + ADD A PASSWORD
          </button>
        ))}
    </div>
  );
}
