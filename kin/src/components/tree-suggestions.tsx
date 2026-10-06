"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmTreeSuggestionAction, dismissTreeSuggestionAction } from "@/lib/actions/tree-links";
import { toast } from "@/components/toast";
import type { TreeSuggestion } from "@/lib/queries/tree-links";

/** "Is this the same Stella?" (docs/FAMILY_TREE.md, step 3). Somebody in a
 * linked household's tree with the same name as somebody in ours, and the
 * same birth date or the same parents. Never merged on its own: "Same person"
 * offers ours to them, or accepts theirs if they asked first, so the two are
 * linked only when both households have said yes. "Not the same" is for
 * good. */
export function TreeSuggestions({ suggestions, people }: { suggestions: TreeSuggestion[]; people: { id: string; fullName: string }[] }) {
  if (!suggestions.length) return null;
  const nameOf = new Map(people.map((p) => [p.id, p.fullName]));
  return (
    <div className="kin-treeoffers">
      {suggestions.map((s) => (
        <SuggestionCard key={`${s.ourPersonId}-${s.otherPersonId}`} s={s} ourName={nameOf.get(s.ourPersonId) ?? "someone in your tree"} />
      ))}
    </div>
  );
}

function SuggestionCard({ s, ourName }: { s: TreeSuggestion; ourName: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const first = ourName.split(" ")[0];
  const why = s.reason === "birth date" ? "the same name and birth date" : "the same name and the same parents";

  const same = () =>
    startTransition(async () => {
      const r = await confirmTreeSuggestionAction(s.ourPersonId, s.otherFamilyId, s.theirOfferId);
      if (r.error) toast.error(r.error);
      else toast.success(r.linked ? `Linked. ${first} is the same person in both trees now.` : `Asked the ${s.otherFamilyName} household. They're linked once they say yes too.`);
      router.refresh();
    });
  const notSame = () =>
    startTransition(async () => {
      const r = await dismissTreeSuggestionAction(s.ourPersonId, s.otherPersonId);
      if (r.error) toast.error(r.error);
      else toast.success("Got it. Kin won't ask about them again.");
      router.refresh();
    });

  return (
    <div className="kin-treeoffer">
      <p className="kin-treeoffer-text">
        <strong>Is this the same {first}?</strong> The <strong>{s.otherFamilyName}</strong> household has{" "}
        <strong>{s.otherName}</strong>
        {s.otherBirthYear ? ` (b. ${s.otherBirthYear})` : ""} in their tree, with {why} as your {ourName}.
        {s.theirOfferId ? " They say it's the same person." : ""}
      </p>
      {s.weOffered ? (
        <p className="kin-treeoffer-text" style={{ color: "var(--color-neutral-600)" }}>
          You said yes. Waiting for the {s.otherFamilyName} household to say yes too.
        </p>
      ) : (
        <div className="kin-treeoffer-row">
          <button type="button" className="btn btn-primary" disabled={pending} onClick={same}>
            Same person
          </button>
          <button type="button" className="btn btn-ghost" disabled={pending} onClick={notSame}>
            Not the same
          </button>
        </div>
      )}
    </div>
  );
}
