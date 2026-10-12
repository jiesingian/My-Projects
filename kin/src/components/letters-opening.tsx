import Link from "next/link";
import { Blueprint } from "@/components/ui";
import { getTimeCapsules, letterDays } from "@/lib/queries/time-capsules";
import { familyDay } from "@/lib/time";

/** On Today, the morning a special day's letters open: one card per person
 * and day, however many letters, leading to them in the journal. Only the
 * person they're for and each letter's writer get it -- the table returns
 * nothing to anyone else, and nothing still sealed. */
const names = (xs: string[]) => [...new Set(xs.filter(Boolean))].join(" and ");

export async function LettersOpeningToday({ familyId, meId, timeZone }: { familyId: string; meId?: string; timeZone?: string }) {
  const days = letterDays(await getTimeCapsules(familyId, { openingOn: familyDay(new Date(), timeZone), timeZone }));
  if (days.length === 0) return null;
  return (
    <section style={{ marginBottom: "1.25rem" }} aria-label="Letters opening today">
      {days.map((d) => {
        const forMe = d.recipientMemberId === meId;
        const who = d.recipientName.split(" ")[0];
        const from = [...new Set(d.letters.map((l) => l.writerName.split(" ")[0]).filter(Boolean))];
        return (
          <Blueprint key={d.key} className="kin-letter-today" style={{ padding: "0.8125rem", marginBottom: "0.75rem" }}>
            <span className="kin-eyebrow">
              {d.letters.every((l) => l.replyTo)
                ? `${names(d.letters.map((l) => l.writerName.split(" ")[0]))} wrote back`
                : d.letters.length === 1 ? "A letter opens today" : `${d.letters.length} letters open today`}
            </span>
            <Link href={d.letters.every((l) => l.replyTo) ? `/journal#letter-${d.letters[0].replyTo}` : `/journal#letters-${d.key}`} style={{ display: "block", font: "600 1.3125rem/1.1 var(--font-heading)", margin: "6px 0 4px", color: "inherit" }}>
              {d.occasion || (forMe ? "For you" : `For ${who}`)}
            </Link>
            <p style={{ fontSize: "0.84375rem", margin: 0, color: "var(--color-neutral-700)" }}>
              {forMe ? "For you" : `For ${who}`}
              {from.length > 0 ? `, from ${from.join(", ")}` : ""} · open them in the journal
            </p>
          </Blueprint>
        );
      })}
    </section>
  );
}
