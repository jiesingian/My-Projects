"use client";

import { useActionState, useId, useState } from "react";
import { createHealthEntryAction } from "@/lib/actions/health";
import type { ActionState } from "@/lib/actions/auth";
import { SubmitButton, ErrorText } from "@/components/form";
import { DetailHeader } from "@/components/hub-header";
import { Blueprint } from "@/components/ui";
import type { Tables } from "@/lib/database.types";
import { familyDay } from "@/lib/time";
import { DateInput } from "@/components/date-input";
import { visibilityOptions } from "@/lib/visibility";

const initialState: ActionState = { error: null };

const TYPES = [
  { value: "illness", label: "Illness episode", titleLabel: "What is it", valueLabel: "Temperature", grouped: true },
  { value: "checkup", label: "Routine check-up", titleLabel: "What is it", valueLabel: "Findings", grouped: true },
  { value: "lab", label: "Laboratory result", titleLabel: "Test name", valueLabel: "Key value", grouped: false },
  { value: "blood_pressure", label: "Blood pressure", titleLabel: "Reading label", valueLabel: "Reading (e.g. 128/84)", grouped: false, device: true },
  { value: "weight", label: "Weight", titleLabel: "Reading label", valueLabel: "Weight (kg)", grouped: false, device: true },
  { value: "medication", label: "Medication", titleLabel: "Medicine", valueLabel: "Dose", grouped: true },
  { value: "vaccination", label: "Vaccination", titleLabel: "Vaccine", valueLabel: "Batch no.", grouped: true },
];

export function NewHealthEntryForm({
  member,
  conditions,
  omronConnected,
  myRole,
}: {
  member: Tables<"members">;
  conditions: { id: string; name: string }[];
  omronConnected: boolean;
  myRole: string;
}) {
  const uid = useId();
  const VISIBILITY = visibilityOptions(myRole);
  const [state, formAction] = useActionState(createHealthEntryAction, initialState);
  const [type, setType] = useState(TYPES[0]);
  const [groupId, setGroupId] = useState(conditions[0]?.id ?? "__new__");
  const [visibility, setVisibility] = useState("family");

  return (
    <div>
      <DetailHeader backHref={`/family/members/${member.id}?view=health`} eyebrow="HUB 01 · HEALTH ENTRY" />
      <div style={{ padding: "0 22px 22px" }}>
        <h3 style={{ fontSize: 30, margin: "0 0 4px" }}>New entry</h3>
        <div style={{ fontSize: 14, color: "var(--color-neutral-700)", marginBottom: 16 }}>For {member.full_name}</div>

        <form action={formAction}>
          <input type="hidden" name="member_id" value={member.id} />
          <input type="hidden" name="type" value={type.value} />
          <input type="hidden" name="visibility" value={visibility} />
          {type.grouped && <input type="hidden" name="group_id" value={groupId} />}
          <ErrorText message={state.error} />

          <div style={{ fontSize: 13, color: "var(--color-neutral-700)", marginBottom: 6 }}>Entry type</div>
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 18 }}>
            {TYPES.map((t) => (
              <button key={t.value} type="button" className="chip" data-active={type.value === t.value} onClick={() => setType(t)}>
                {t.label}
              </button>
            ))}
          </div>

          {type.device && (
            <Blueprint className="bg-[var(--color-accent-100)]" style={{ padding: 13, marginBottom: 18 }}>
              <div style={{ font: "600 13px/1 var(--font-heading)", letterSpacing: ".02em", color: "var(--color-accent-700)", marginBottom: 7 }}>
                FROM A DEVICE
              </div>
              <p style={{ fontSize: 13.5, margin: "0 0 11px", color: "var(--color-neutral-800)" }}>
                {omronConnected
                  ? "Omron Connect is linked — import the readings taken since the last sync instead of typing them."
                  : "Omron Connect is not linked yet. Connect it once and these readings arrive on their own."}
              </p>
              <div style={{ fontSize: 13, color: "var(--color-neutral-700)" }}>Enter the reading by hand below in the meantime.</div>
            </Blueprint>
          )}

          <div className="field" style={{ marginBottom: 14 }}>
            <label htmlFor={`${uid}-title`}>{type.titleLabel.toUpperCase()}</label>
            <input id={`${uid}-title`} aria-label={type.titleLabel.toUpperCase()} className="input" name="title" required maxLength={150} style={{ minHeight: 44 }} />
          </div>

          {type.grouped && (
            <>
              <div style={{ fontSize: 13, color: "var(--color-neutral-700)", marginBottom: 6 }}>Group under</div>
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 16 }}>
                {conditions.map((c) => (
                  <button key={c.id} type="button" className="chip" data-active={groupId === c.id} onClick={() => setGroupId(c.id)}>
                    {c.name}
                  </button>
                ))}
                <button type="button" className="chip" data-active={groupId === "__new__"} onClick={() => setGroupId("__new__")}>
                  + New group
                </button>
              </div>
              {groupId === "__new__" && (
                <div className="field" style={{ marginBottom: 16 }}>
                  <label htmlFor={`${uid}-new-group-name`}>NEW GROUP NAME</label>
                  <input id={`${uid}-new-group-name`} aria-label="New Group Name" className="input" name="new_group_name" placeholder="Leave blank to use the title above" maxLength={150} style={{ minHeight: 44 }} />
                </div>
              )}
            </>
          )}

          <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor={`${uid}-date`}>DATE</label>
              <DateInput id={`${uid}-date`} aria-label="Date" className="input" name="date" defaultValue={familyDay()} required style={{ minHeight: 44 }} />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor={`${uid}-value`}>{type.valueLabel.toUpperCase()}</label>
              <input id={`${uid}-value`} aria-label={type.valueLabel.toUpperCase()} className="input" name="value" maxLength={100} style={{ minHeight: 44 }} />
            </div>
          </div>

          <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor={`${uid}-seen-by`}>SEEN BY</label>
              <input id={`${uid}-seen-by`} aria-label="Seen By" className="input" name="seen_by" maxLength={100} style={{ minHeight: 44 }} />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor={`${uid}-where`}>WHERE</label>
              <input id={`${uid}-where`} aria-label="Where" className="input" name="where" maxLength={150} style={{ minHeight: 44 }} />
            </div>
          </div>

          <div className="field" style={{ marginBottom: 16 }}>
            <label htmlFor={`${uid}-notes`}>NOTES</label>
            <input id={`${uid}-notes`} aria-label="Notes" className="input" name="notes" placeholder="Symptoms, dosage, instructions" maxLength={1000} style={{ minHeight: 44 }} />
          </div>

          <div style={{ fontSize: 13, color: "var(--color-neutral-700)", marginBottom: 6 }}>Visible to</div>
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 18 }}>
            {VISIBILITY.map((v) => (
              <button key={v.value} type="button" className="chip" data-active={visibility === v.value} onClick={() => setVisibility(v.value)}>
                {v.label}
              </button>
            ))}
          </div>

          <SubmitButton style={{ minHeight: 46, fontSize: 14, letterSpacing: ".04em" }}>SAVE ENTRY</SubmitButton>
        </form>
      </div>
    </div>
  );
}
