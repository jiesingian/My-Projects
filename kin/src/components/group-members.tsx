"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { ErrorText } from "@/components/form";
import { confirm } from "@/components/confirm-sheet";
import { GroupPeoplePicker, type PickablePerson } from "@/components/group-people-picker";
import { initials } from "@/lib/format";
import { addGroupMembersAction, removeGroupMemberAction, setGroupAdminAction, updateGroupAction } from "@/lib/actions/chat-rooms";
import type { GroupMember, GroupSummary } from "@/lib/queries/chat-rooms";

/** Who is in a group, and -- for its admins -- adding, removing, making
 * admins, renaming. Anyone can leave. */
export function GroupMembers({
  group,
  members,
  me,
  isAdmin,
  candidates,
}: {
  group: GroupSummary;
  members: GroupMember[];
  me: string;
  isAdmin: boolean;
  candidates: PickablePerson[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<string[]>([]);
  const [name, setName] = useState(group.name);
  const [announceOnly, setAnnounceOnly] = useState(group.announceOnly);
  const inGroup = new Set(members.map((m) => m.personId));
  const addable = candidates.filter((c) => !inGroup.has(c.personId));

  const run = (fn: () => Promise<{ error: string | null }>, after?: () => void) =>
    startTransition(async () => {
      const r = await fn();
      setError(r.error);
      if (!r.error) after?.();
      router.refresh();
    });

  return (
    <div>
      <ErrorText message={error} />
      {isAdmin && (
        <div style={{ marginBottom: "1.25rem" }}>
          <label style={{ display: "block", marginBottom: "0.5rem" }}>
            <span style={{ display: "block", fontSize: "0.8125rem", color: "var(--color-neutral-600)", marginBottom: "0.25rem" }}>Name</span>
            <input className="input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} style={{ width: "100%" }} />
          </label>
          <label style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.5rem" }}>
            <input type="checkbox" checked={announceOnly} onChange={(e) => setAnnounceOnly(e.target.checked)} style={{ width: "1.25rem", height: "1.25rem" }} />
            <span>Announcements only (just admins post)</span>
          </label>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={pending || (name === group.name && announceOnly === group.announceOnly)}
            onClick={() => run(() => updateGroupAction(group.id, name, announceOnly))}
          >
            Save
          </button>
        </div>
      )}

      <div style={{ font: "600 0.8125rem/1 var(--font-heading)", letterSpacing: ".02em", color: "var(--color-accent-700)", margin: "0 0 0.5rem" }}>
        MEMBERS · {members.length}
      </div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {members.map((m) => (
          <li key={m.personId} style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap", padding: "0.5rem 0", borderBottom: "1px solid color-mix(in srgb, var(--color-text) 8%, transparent)" }}>
            <Avatar url={m.avatarUrl} initials={initials(m.fullName)} label={m.fullName} size={36} clickable={false} />
            <span style={{ flex: "1 1 8rem", minWidth: 0 }}>
              <span style={{ display: "block", fontWeight: 600 }}>
                {m.personId === me ? "You" : m.fullName}
                {m.admin && <span style={{ fontSize: "0.75rem", color: "var(--color-accent-700)", fontWeight: 600 }}> · admin</span>}
              </span>
              {m.householdName && <span style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)" }}>{m.householdName}</span>}
            </span>
            {isAdmin && m.personId !== me && (
              <span style={{ display: "flex", gap: "0.25rem" }}>
                <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => run(() => setGroupAdminAction(group.id, m.personId, !m.admin))}>
                  {m.admin ? "Not admin" : "Make admin"}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={pending}
                  onClick={async () => {
                    if (await confirm({ title: `Remove ${m.fullName}?`, description: "They stop seeing this group at once.", confirmLabel: "Remove", danger: true }))
                      run(() => removeGroupMemberAction(group.id, m.personId));
                  }}
                >
                  Remove
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>

      {isAdmin && addable.length > 0 && (
        <div style={{ marginTop: "1.25rem" }}>
          <div style={{ font: "600 0.8125rem/1 var(--font-heading)", letterSpacing: ".02em", color: "var(--color-accent-700)", margin: "0 0 0.5rem" }}>ADD PEOPLE</div>
          <GroupPeoplePicker people={addable} chosen={adding} onChange={setAdding} />
          <button
            type="button"
            className="btn btn-primary"
            style={{ marginTop: "0.5rem" }}
            disabled={pending || adding.length === 0}
            onClick={() => run(() => addGroupMembersAction(group.id, adding), () => setAdding([]))}
          >
            Add {adding.length || ""}
          </button>
        </div>
      )}

      <button
        type="button"
        className="btn btn-ghost"
        style={{ marginTop: "1.5rem", color: "var(--color-accent-700)" }}
        disabled={pending}
        onClick={async () => {
          if (await confirm({ title: `Leave ${group.name}?`, description: "You stop seeing it at once. Someone in it can add you back.", confirmLabel: "Leave", danger: true }))
            run(() => removeGroupMemberAction(group.id, me), () => router.push("/chat"));
        }}
      >
        Leave this {group.announceOnly ? "channel" : "group"}
      </button>
    </div>
  );
}
