"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirm } from "@/components/confirm-sheet";
import { toast } from "@/components/toast";
import { addEntryToHouseholdAction, takeEntryBackAction, setEntryMilestoneAction } from "@/lib/actions/journal";
import { setEntrySharedAction } from "@/lib/actions/family-links";

/** On an entry you wrote (Mine, and the entry's own page): where it is shared
 * and whether it is a milestone, shown as it stands and changed in one tap
 * (29 September, Janine: "option to mark it to share in household, family
 * feed ... and to mark it as a milestone").
 *
 * Neither chip lit is Just me. The Family feed reaches linked households, and
 * only a household entry goes there, so lighting it on a Just-me entry adds it
 * to the household too, and taking it out of the household takes it out of
 * the feed. Every widening asks first; narrowing just happens. */
export function EntryShareOptions({
  entryId,
  title,
  personal,
  shared,
  milestone,
  linkedCount,
}: {
  entryId: string;
  title: string;
  personal: boolean;
  shared: boolean;
  milestone: boolean;
  linkedCount: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const run = (steps: (() => Promise<{ error: string | null }>)[], done?: string) =>
    startTransition(async () => {
      for (const step of steps) {
        const { error } = await step();
        if (error) {
          toast.error(error);
          router.refresh();
          return;
        }
      }
      if (done) toast.success(done);
      router.refresh();
    });

  const relatives =
    linkedCount > 0
      ? `The ${linkedCount === 1 ? "household" : `${linkedCount} households`} you're linked with will see it, photos included.`
      : "Nobody outside your household sees it until you link with another household.";

  async function toggleHousehold() {
    if (!personal) {
      if (
        !(await confirm({
          title: `Make "${title}" just yours again?`,
          description: `It leaves the household journal${shared ? " and the Family feed" : ""}. Photos saved to the household's Google Drive stay in the household's photos.`,
          confirmLabel: "Just me",
        }))
      )
        return;
      run([() => takeEntryBackAction(entryId)], "Just yours again.");
      return;
    }
    if (
      !(await confirm({
        title: `Share "${title}" with the household?`,
        description: "Everyone in the household will see it and its photos. It stays yours, and you can take it back.",
        confirmLabel: "Share with household",
      }))
    )
      return;
    run([() => addEntryToHouseholdAction(entryId)], "Shared with the household.");
  }

  async function toggleFeed() {
    if (shared) {
      run([() => setEntrySharedAction(entryId, false)]);
      return;
    }
    if (
      !(await confirm({
        title: "Put this in the Family feed?",
        description: `${personal ? "It goes into the household journal too. " : ""}${relatives} Tagged names stay here. You can take it back at any time.`,
        confirmLabel: "Share it",
      }))
    )
      return;
    run([...(personal ? [() => addEntryToHouseholdAction(entryId)] : []), () => setEntrySharedAction(entryId, true)], "In the Family feed.");
  }

  return (
    <div className="kin-entry-share" aria-busy={pending || undefined}>
      <span className="kin-entry-share-label">{personal && !shared ? "Just me · share with" : "Shared with"}</span>
      <button type="button" className="chip" data-active={!personal} aria-pressed={!personal} disabled={pending} onClick={toggleHousehold}>
        Household
      </button>
      <button type="button" className="chip" data-active={shared} aria-pressed={shared} disabled={pending} onClick={toggleFeed}>
        Family feed
      </button>
      <button
        type="button"
        className="chip kin-entry-share-star"
        data-active={milestone}
        aria-pressed={milestone}
        disabled={pending}
        onClick={() => run([() => setEntryMilestoneAction(entryId, !milestone)])}
      >
        <span aria-hidden="true">{milestone ? "★" : "☆"}</span> Milestone
      </button>
    </div>
  );
}
