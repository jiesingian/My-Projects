"use client";

import { useActionState, useState } from "react";
import { createJournalEntryAction } from "@/lib/actions/journal";
import type { ActionState } from "@/lib/actions/auth";
import { SubmitButton, ErrorText } from "@/components/form";
import { DetailHeader } from "@/components/hub-header";
import type { Tables } from "@/lib/database.types";

const initialState: ActionState = { error: null };

export function NewEntryForm({ members }: { members: Tables<"members">[] }) {
  const [state, formAction] = useActionState(createJournalEntryAction, initialState);
  const [people, setPeople] = useState<string[]>([]);

  return (
    <div>
      <DetailHeader backHref="/journal?seg=entries" eyebrow="HUB 02 · NEW ENTRY" />
      <div style={{ padding: "0 22px 22px" }}>
        <h3 style={{ fontSize: 30, margin: "0 0 16px" }}>Add a journal entry</h3>
        <form action={formAction}>
          {people.map((id) => (
            <input key={id} type="hidden" name="people" value={id} />
          ))}
          <ErrorText message={state.error} />
          <div className="field" style={{ marginBottom: 14 }}>
            <label>TITLE</label>
            <input className="input" name="title" required style={{ minHeight: 44 }} />
          </div>
          <div className="field" style={{ marginBottom: 16 }}>
            <label>DATE</label>
            <input className="input" type="date" name="date" defaultValue={new Date().toISOString().slice(0, 10)} required style={{ minHeight: 44 }} />
          </div>
          <div style={{ fontSize: 11.5, color: "var(--color-neutral-700)", marginBottom: 6 }}>Who was there</div>
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 16 }}>
            {members.map((m) => {
              const active = people.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  className="chip"
                  data-active={active}
                  onClick={() => setPeople((p) => (active ? p.filter((x) => x !== m.id) : [...p, m.id]))}
                >
                  {m.full_name.split(" ")[0]}
                </button>
              );
            })}
          </div>
          <div className="field" style={{ marginBottom: 16 }}>
            <label>NOTE</label>
            <textarea className="input" name="note" placeholder="What happened?" />
          </div>
          <div className="field" style={{ marginBottom: 18 }}>
            <label>PHOTOS</label>
            <input type="file" name="files" multiple accept="image/*,video/*" />
          </div>
          <SubmitButton style={{ minHeight: 46, fontSize: 14, letterSpacing: ".04em" }}>SAVE ENTRY</SubmitButton>
        </form>
      </div>
    </div>
  );
}
