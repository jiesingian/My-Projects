import Link from "next/link";
import { Icon } from "@/components/icons";

/** Kin Free and Kin Plus, where people meet them (approved 28 September).
 *
 * Two small pieces and nothing that blocks a page. A household on Kin Free can
 * still open every Plus area and read, change or delete what it already has;
 * only a new entry is refused, by the database (require_kin_plus), with a
 * sentence from db-errors.ts. These say so before anyone types something in
 * and has it turned away. */

/** Top of a Plus area, for a household on Kin Free. */
export function PlusNote({ area, detail }: { area: string; detail?: string }) {
  return (
    <aside className="kin-plus-note" aria-label="Kin Plus">
      <span className="kin-plus-badge">PLUS</span>
      <p>
        <strong>{area} is part of Kin Plus.</strong> {detail ?? "Everything already here is still yours to open, change or delete. Adding something new needs Plus."}
      </p>
      <Link href="/subscribe" className="btn btn-secondary kin-plus-cta">
        See plans
      </Link>
    </aside>
  );
}

/** Today, in the last three days of a trial. Rare by design -- three days in
 * fourteen -- so it can afford to arrive rather than simply be there. */
export function TrialBanner({ daysLeft, isOrganiser }: { daysLeft: number; isOrganiser: boolean }) {
  const when = daysLeft <= 1 ? "Today is the last day" : `${daysLeft} days left`;
  return (
    <Link href="/subscribe" className="kin-plus-note kin-plus-trial" aria-label={`Kin Plus trial: ${when}. See plans.`}>
      <span className="kin-plus-badge">PLUS</span>
      <p>
        <strong>{when} of your Kin Plus trial.</strong>{" "}
        {isOrganiser
          ? "After that the household moves to Kin Free: calendar, lists and chat stay free for good."
          : "After that the household moves to Kin Free. The organizer can keep Plus."}
      </p>
      <Icon name="chevronLeft" size="0.9375rem" className="kin-plus-chev" />
    </Link>
  );
}
