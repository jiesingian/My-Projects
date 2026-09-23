"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { respondTreeOfferAction } from "@/lib/actions/tree-links";
import { toast } from "@/components/toast";
import type { TreeOffer } from "@/lib/queries/tree-links";

/** Relatives another household has offered this one. Each is a name and a
 * year of birth -- all the other household chose to reveal -- and three
 * answers: that is somebody already in our tree, add them to it, or not ours.
 * Answering "that's our Eduardo" is what joins the two trees at him. */
export function TreeOffers({ offers, people }: { offers: TreeOffer[]; people: { id: string; fullName: string; dob: string | null }[] }) {
  if (!offers.length) return null;
  return (
    <div className="kin-treeoffers">
      {offers.map((o) => (
        <OfferCard key={o.matchId} offer={o} people={people} />
      ))}
    </div>
  );
}

function OfferCard({ offer, people }: { offer: TreeOffer; people: { id: string; fullName: string; dob: string | null }[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // A likely match -- same first name and year -- is picked for them, since it
  // is usually right; they can pick anybody else, or nobody.
  const guess =
    people.find(
      (p) =>
        p.fullName.split(" ")[0].toLowerCase() === offer.fullName.split(" ")[0].toLowerCase() &&
        (!offer.birthYear || p.dob?.startsWith(offer.birthYear)),
    )?.id ?? "";
  const [choice, setChoice] = useState(guess);

  const answer = (accept: boolean, personId: string | null) =>
    startTransition(async () => {
      const r = await respondTreeOfferAction(offer.matchId, accept, personId);
      if (r.error) toast.error(r.error);
      else toast.success(!accept ? "Declined." : personId ? "Linked. Their side of the family is on your tree now." : `${offer.fullName} is in your tree now.`);
      router.refresh();
    });

  return (
    <div className="kin-treeoffer">
      <p className="kin-treeoffer-text">
        The <strong>{offer.fromFamilyName}</strong> household says <strong>{offer.fullName}</strong>
        {offer.birthYear ? ` (b. ${offer.birthYear})` : ""} is family to you too.
      </p>
      {people.length > 0 && (
        <div className="kin-treeoffer-row">
          <select className="input" value={choice} onChange={(e) => setChoice(e.target.value)} aria-label="Who this is in your tree" disabled={pending}>
            <option value="">Who is this in your tree?</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.fullName}
                {p.dob ? ` (b. ${p.dob.slice(0, 4)})` : ""}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-primary" disabled={!choice || pending} onClick={() => answer(true, choice)}>
            That&rsquo;s them
          </button>
        </div>
      )}
      <div className="kin-treeoffer-row">
        <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => answer(true, null)}>
          Add to our tree
        </button>
        <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => answer(false, null)}>
          Not our family
        </button>
      </div>
    </div>
  );
}
