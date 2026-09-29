"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ErrorText } from "@/components/form";
import { GroupPeoplePicker, type PickablePerson } from "@/components/group-people-picker";
import { createGroupAction } from "@/lib/actions/chat-rooms";

/** A new group chat, or an announcement channel where only admins post. */
export function GroupCreateForm({ people, announce }: { people: PickablePerson[]; announce: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [announceOnly, setAnnounceOnly] = useState(announce);
  const [chosen, setChosen] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const create = () =>
    startTransition(async () => {
      const r = await createGroupAction(name, announceOnly, chosen);
      if (r.error || !r.id) {
        setError(r.error ?? "That didn't work.");
        return;
      }
      router.push(`/chat/groups/${r.id}`);
    });

  return (
    <div>
      <label style={{ display: "block", marginBottom: "0.875rem" }}>
        <span style={{ display: "block", fontSize: "0.8125rem", color: "var(--color-neutral-600)", marginBottom: "0.25rem" }}>Name</span>
        <input
          className="input"
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
          placeholder={announceOnly ? "Family news" : "Cousins, Siblings, Lola's 80th…"}
          style={{ width: "100%" }}
        />
      </label>
      <label style={{ display: "flex", gap: "0.625rem", alignItems: "flex-start", marginBottom: "1rem" }}>
        <input type="checkbox" checked={announceOnly} onChange={(e) => setAnnounceOnly(e.target.checked)} style={{ width: "1.25rem", height: "1.25rem", marginTop: "0.125rem" }} />
        <span>
          <span style={{ display: "block", fontWeight: 600 }}>Announcements only</span>
          <span style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)", lineHeight: 1.45 }}>
            Only admins post; everyone else reads and reacts. Good for reunions, birthdays and news the whole family should see
            without replies burying it.
          </span>
        </span>
      </label>
      <div style={{ font: "600 0.8125rem/1 var(--font-heading)", letterSpacing: ".02em", color: "var(--color-accent-700)", margin: "0 0 0.5rem" }}>WHO&rsquo;S IN IT</div>
      <GroupPeoplePicker people={people} chosen={chosen} onChange={setChosen} />
      <ErrorText message={error} />
      <button type="button" className="btn btn-primary btn-block" style={{ marginTop: "1rem" }} disabled={pending || !name.trim()} onClick={create}>
        {pending ? "…" : announceOnly ? "Create channel" : "Create group"}
      </button>
    </div>
  );
}
