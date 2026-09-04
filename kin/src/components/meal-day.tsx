"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { uploadFileDirect } from "@/lib/upload-client";
import {
  addMealIngredientAction,
  removeMealIngredientAction,
  removeRecipePhotoAction,
  setMealIngredientAction,
  setRecipePhotoAction,
  toggleIngredientAtHomeAction,
} from "@/lib/actions/household";

function useAct() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<{ error: string | null }>) => {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.error) setError(result.error);
      router.refresh();
    });
  };
  return { pending, error, run };
}

/** Photograph the dish. The picture belongs to the dish, not to the evening,
 * so once a house has photographed its own adobo every adobo has it. */
export function MealPhotoControl({ recipeRef, hasPhoto, dish }: { recipeRef: string; hasPhoto: boolean; dish: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPick(file: File) {
    setError(null);
    setBusy(true);
    try {
      const uploaded = await uploadFileDirect(file, "recipe");
      if (uploaded.provider !== "supabase") throw new Error("That photo went somewhere unexpected.");
      const result = await setRecipePhotoAction(recipeRef, uploaded.storagePath);
      if (result.error) setError(result.error);
      else router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That photo didn't upload.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void onPick(file);
        }}
      />
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          aria-label={hasPhoto ? `Replace the photo of ${dish}` : `Add a photo of ${dish}`}
          className="kin-plate-action"
        >
          <Icon name="camera" size={13} />
          {busy ? "Uploading…" : hasPhoto ? "Replace" : "Add a photo"}
        </button>
        {hasPhoto && !busy && (
          <button
            type="button"
            onClick={() => {
              void removeRecipePhotoAction(recipeRef).then(() => router.refresh());
            }}
            aria-label={`Remove the photo of ${dish}`}
            className="kin-plate-action"
          >
            <Icon name="trash" size={13} />
          </button>
        )}
      </div>
      {error && <div style={{ fontSize: 12, color: "var(--cal-occasion)", marginTop: 4 }}>{error}</div>}
    </>
  );
}

/** One ingredient, with the amount this meal needs. The amount is the meal's
 * own: cooking for eight on Sunday shouldn't rewrite the recipe. Saved when
 * the field is left, so nothing has to be pressed. */
export function IngredientAmountRow({
  id,
  name,
  amount,
  unit,
  qty,
  inPantry,
  onList,
}: {
  id: string;
  name: string;
  amount: number | null;
  unit: string | null;
  qty: string | null;
  inPantry: boolean;
  onList: boolean;
}) {
  const { pending, error, run } = useAct();
  const [amountText, setAmountText] = useState(amount == null ? "" : String(amount));
  const [unitText, setUnitText] = useState(unit ?? "");

  const save = () => {
    const next = amountText.trim() === "" ? null : Number(amountText);
    if (next != null && Number.isNaN(next)) return;
    const sameAmount = (next ?? null) === (amount ?? null);
    const sameUnit = (unitText.trim() || null) === (unit ?? null);
    if (sameAmount && sameUnit) return;
    run(() => setMealIngredientAction({ ingredientId: id, amount: next, unit: unitText }));
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 0", borderBottom: "1px solid var(--color-divider)" }}>
      <button
        type="button"
        disabled={pending}
        onClick={() => run(() => toggleIngredientAtHomeAction(name, !inPantry))}
        title={inPantry ? "In the house — tap to say it is not" : "Tap if it is already in the house"}
        aria-pressed={inPantry}
        style={{
          width: 22,
          height: 22,
          flex: "none",
          borderRadius: 7,
          border: inPantry ? 0 : "1.5px solid var(--color-neutral-400)",
          background: inPantry ? "var(--color-switch-on)" : "transparent",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          padding: 0,
        }}
      >
        {inPantry && <Icon name="check" size={13} style={{ color: "#fff" }} />}
      </button>

      <span style={{ flex: 1, minWidth: 0, fontSize: 14 }}>
        <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
        {/* Amounts a number can't hold — "to taste", "a handful" — stay
            readable underneath rather than being thrown away. */}
        {amount == null && qty && qty.trim() !== "" && (
          <span style={{ display: "block", fontSize: 11.5, color: "var(--color-neutral-600)" }}>{qty}</span>
        )}
        {!inPantry && onList && <span style={{ display: "block", fontSize: 11.5, color: "var(--cal-schedule)" }}>on the list</span>}
      </span>

      <input
        inputMode="decimal"
        value={amountText}
        onChange={(e) => setAmountText(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        aria-label={`How much ${name}`}
        placeholder="—"
        className="input"
        style={{ width: 58, minHeight: 34, fontSize: 13.5, textAlign: "right", padding: "0 7px", flex: "none" }}
      />
      <input
        value={unitText}
        onChange={(e) => setUnitText(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        aria-label={`Unit for ${name}`}
        placeholder="unit"
        className="input"
        style={{ width: 62, minHeight: 34, fontSize: 13.5, padding: "0 7px", flex: "none" }}
      />
      <button
        type="button"
        disabled={pending}
        onClick={() => run(() => removeMealIngredientAction(id))}
        aria-label={`Take ${name} off this meal`}
        style={{ border: 0, background: "none", cursor: "pointer", padding: 4, display: "flex", color: "var(--color-neutral-600)", flex: "none" }}
      >
        <Icon name="x" size={13} />
      </button>
      {error && <span style={{ fontSize: 11.5, color: "var(--cal-occasion)" }}>{error}</span>}
    </div>
  );
}

export function AddIngredientRow({ mealId }: { mealId: string }) {
  const { pending, error, run } = useAct();
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useState("");

  const add = () => {
    if (!name.trim()) return;
    run(async () => {
      const result = await addMealIngredientAction({
        mealId,
        name,
        amount: amount.trim() === "" ? null : Number(amount),
        unit,
      });
      if (!result.error) {
        setName("");
        setAmount("");
        setUnit("");
      }
      return result;
    });
  };

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", paddingTop: 8 }}>
      <input
        className="input"
        placeholder="Add an ingredient"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && add()}
        aria-label="Another ingredient for this meal"
        style={{ flex: 1, minWidth: 0, minHeight: 34, fontSize: 13.5 }}
      />
      <input
        className="input"
        inputMode="decimal"
        placeholder="—"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        aria-label="How much"
        style={{ width: 58, minHeight: 34, fontSize: 13.5, textAlign: "right", padding: "0 7px", flex: "none" }}
      />
      <input
        className="input"
        placeholder="unit"
        value={unit}
        onChange={(e) => setUnit(e.target.value)}
        aria-label="Unit"
        style={{ width: 62, minHeight: 34, fontSize: 13.5, padding: "0 7px", flex: "none" }}
      />
      <button
        type="button"
        className="btn btn-secondary btn-icon"
        style={{ width: 34, height: 34, flex: "none" }}
        disabled={pending || !name.trim()}
        onClick={add}
        aria-label="Add this ingredient"
      >
        <Icon name="plus" size={15} />
      </button>
      {error && <span style={{ fontSize: 11.5, color: "var(--cal-occasion)" }}>{error}</span>}
    </div>
  );
}
