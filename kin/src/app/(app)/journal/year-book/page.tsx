import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { readAccess } from "@/lib/access";
import { DetailHeader } from "@/components/hub-header";
import { PlusNote } from "@/components/plus";
import { getYearBookEntries } from "@/lib/queries/year-book";
import { bookYears } from "@/lib/year-book";
import { familyDay } from "@/lib/time";
import { YearBookMaker } from "./year-book-maker";

/** The year book (19 October): the year's ★ milestones and best photos as a
 * PDF to print. Kin Plus. On Kin Free the page says so and makes nothing --
 * the book is made on the phone from what the household can already read, so
 * there is no write for the database to refuse; this page is the gate. */
export default async function YearBookPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const plus = readAccess(me.families).plus;
  const entries = plus ? await getYearBookEntries(me.family_id) : [];
  const thisYear = Number(familyDay(new Date(), me.families.time_zone).slice(0, 4));
  const years = bookYears(entries.map((e) => e.date));
  if (!years.includes(thisYear)) years.unshift(thisYear);
  const asked = Number((await searchParams).year);
  const year = years.includes(asked) ? asked : thisYear;

  return (
    <div>
      <DetailHeader backHref="/journal?view=milestones" eyebrow="Journal" />
      <div style={{ padding: "0 var(--gutter) 1.5rem" }}>
        <h3 style={{ fontSize: "1.5rem", margin: "0 0 0.25rem" }}>Year book</h3>
        <p style={{ fontSize: "0.84375rem", lineHeight: 1.5, color: "var(--color-neutral-700)", margin: "0 0 0.875rem" }}>
          The year&apos;s milestones and best photos, as a PDF to print at a photo shop or a photobook service. A4, one entry a page. It&apos;s made on this phone and never stored.
        </p>
        {plus ? (
          <YearBookMaker key={year} household={me.families.name} years={years} year={year} entries={entries.filter((e) => e.date.startsWith(`${year}-`))} />
        ) : (
          <PlusNote area="The year book" detail="Your journal and its photos stay free. Making a printable year book from them needs Plus." />
        )}
      </div>
    </div>
  );
}
