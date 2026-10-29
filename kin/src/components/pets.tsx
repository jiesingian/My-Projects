"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Blueprint } from "@/components/ui";
import { DateInput } from "@/components/date-input";
import { toast } from "@/components/toast";
import { confirm } from "@/components/confirm-sheet";
import { addPetFoodToListAction, deletePetAction, savePetAction, type PetInput } from "@/lib/actions/pets";
import { PET_KINDS, PET_KIND_LABELS, type PetKind } from "@/lib/pets";

export type PetView = { id: string; name: string; kind: string; birthday: string | null; food: string | null; vet: string | null; next_vaccine_on: string | null; next_vet_on: string | null; notes: string | null };

const blank: PetInput = { name: "", kind: "dog", birthday: "", food: "", vet: "", next_vaccine_on: "", next_vet_on: "", notes: "" };
const day = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-PH", { day: "numeric", month: "short", year: "numeric" });

/** Family -> Pets: each pet's card, and one form to add or change one. */
export function PetsManager({ pets }: { pets: PetView[] }) {
  const uid = useId();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<PetInput>(blank);
  const [open, setOpen] = useState(pets.length === 0);
  const run = (fn: () => Promise<{ error: string | null }>, ok?: string, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.error) toast.error(r.error);
      else {
        if (ok) toast.success(ok);
        after?.();
        router.refresh();
      }
    });
  const edit = (p: PetView) => {
    setEditing(p.id);
    setOpen(true);
    setDraft({ name: p.name, kind: p.kind, birthday: p.birthday ?? "", food: p.food ?? "", vet: p.vet ?? "", next_vaccine_on: p.next_vaccine_on ?? "", next_vet_on: p.next_vet_on ?? "", notes: p.notes ?? "" });
  };
  const reset = () => {
    setEditing(null);
    setDraft(blank);
    setOpen(false);
  };
  const field = { minHeight: "2.5rem", width: "100%" } as const;
  const set = (k: keyof PetInput) => (e: { target: { value: string } }) => setDraft({ ...draft, [k]: e.target.value });

  return (
    <div style={{ display: "grid", gap: "0.625rem" }}>
      {pets.map((p) => (
        <Blueprint key={p.id} style={{ padding: "0.75rem 0.9375rem" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem" }}>
            <strong style={{ fontSize: "1.0625rem", flex: 1 }}>{p.name}</strong>
            <span style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)" }}>{PET_KIND_LABELS[p.kind as PetKind] ?? p.kind}</span>
          </div>
          <div style={{ fontSize: "0.8125rem", color: "var(--color-neutral-700)", marginTop: "0.25rem", lineHeight: 1.5 }}>
            {[p.next_vaccine_on && `Vaccine ${day(p.next_vaccine_on)}`, p.next_vet_on && `Vet ${day(p.next_vet_on)}`, p.vet, p.food && `Eats ${p.food}`].filter(Boolean).join(" · ") || "Add the next vaccine and vet visit so Today reminds you."}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem", marginTop: "0.5rem" }}>
            <button type="button" className="btn btn-secondary" style={{ minHeight: "2rem", fontSize: "0.8125rem" }} disabled={pending} onClick={() => run(() => addPetFoodToListAction(p.id), "Added to To-Buy.")}>
              Food to To-Buy
            </button>
            <button type="button" className="btn btn-secondary" style={{ minHeight: "2rem", fontSize: "0.8125rem" }} onClick={() => edit(p)}>
              Edit
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ minHeight: "2rem", fontSize: "0.8125rem" }}
              disabled={pending}
              onClick={async () => {
                if (await confirm({ title: `Remove ${p.name}?`, confirmLabel: "Remove", danger: true })) run(() => deletePetAction(p.id), undefined, () => editing === p.id && reset());
              }}
            >
              Remove
            </button>
          </div>
        </Blueprint>
      ))}

      {!open ? (
        <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
          Add a pet
        </button>
      ) : (
        <Blueprint style={{ padding: "0.875rem 0.9375rem" }}>
          <div style={{ font: "600 0.9375rem/1.2 var(--font-heading)", marginBottom: "0.625rem" }}>{editing ? "Change" : "Add a pet"}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.625rem" }}>
            <div className="field" style={{ margin: 0 }}>
              <label htmlFor={`${uid}-name`}>Name</label>
              <input id={`${uid}-name`} className="input" maxLength={60} value={draft.name} onChange={set("name")} style={field} />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label htmlFor={`${uid}-kind`}>Kind</label>
              <select id={`${uid}-kind`} className="input" value={draft.kind} onChange={set("kind")} style={field}>
                {PET_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {PET_KIND_LABELS[k]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label htmlFor={`${uid}-vaccine`}>Next vaccine</label>
              <DateInput id={`${uid}-vaccine`} className="input" value={draft.next_vaccine_on ?? ""} onChange={set("next_vaccine_on")} style={field} />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label htmlFor={`${uid}-vet`}>Next vet visit</label>
              <DateInput id={`${uid}-vet`} className="input" value={draft.next_vet_on ?? ""} onChange={set("next_vet_on")} style={field} />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label htmlFor={`${uid}-food`}>Food (for To-Buy)</label>
              <input id={`${uid}-food`} className="input" maxLength={80} placeholder="Pedigree 3kg" value={draft.food} onChange={set("food")} style={field} />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label htmlFor={`${uid}-bday`}>Birthday</label>
              <DateInput id={`${uid}-bday`} className="input" value={draft.birthday ?? ""} onChange={set("birthday")} style={field} />
            </div>
            <div className="field" style={{ margin: 0, gridColumn: "1 / -1" }}>
              <label htmlFor={`${uid}-vetname`}>Vet (name and number)</label>
              <input id={`${uid}-vetname`} className="input" maxLength={120} value={draft.vet} onChange={set("vet")} style={field} />
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
            <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={reset}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" style={{ flex: 2 }} disabled={pending || !draft.name.trim()} onClick={() => run(() => savePetAction(editing, draft), undefined, reset)}>
              {pending ? "…" : editing ? "Save" : "Add"}
            </button>
          </div>
        </Blueprint>
      )}
    </div>
  );
}
