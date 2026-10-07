import Link from "next/link";
import { Blueprint } from "@/components/ui";
import { getTimeCapsules } from "@/lib/queries/time-capsules";
import { familyDay, readableDay } from "@/lib/time";

/** Time-capsule letters that open today, on Today and atop the household
 * journal. Before today only their writer could see them; nothing shows
 * here for a letter still sealed, because the table won't return it. */
export async function LettersOpeningToday({ familyId }: { familyId: string }) {
  const letters = await getTimeCapsules(familyId, { openingOn: familyDay() });
  if (letters.length === 0) return null;
  return (
    <section style={{ marginBottom: "1.25rem" }} aria-label="Letters opening today">
      {letters.map((l) => (
        <Blueprint key={l.id} style={{ padding: "0.8125rem", marginBottom: "0.75rem" }}>
          <span className="kin-eyebrow">A letter opens today</span>
          <Link href={`/journal/letters#letter-${l.id}`} style={{ display: "block", font: "600 1.3125rem/1.1 var(--font-heading)", margin: "6px 0 4px", color: "inherit" }}>
            {l.title || `For ${l.recipientName.split(" ")[0]}`}
          </Link>
          <p style={{ fontSize: "0.84375rem", margin: 0, color: "var(--color-neutral-700)" }}>
            For {l.recipientName.split(" ")[0]}, from {l.writerName.split(" ")[0] || "someone in the family"} · sealed {readableDay(familyDay(new Date(l.createdAt)), { year: true })}
          </p>
        </Blueprint>
      ))}
    </section>
  );
}
