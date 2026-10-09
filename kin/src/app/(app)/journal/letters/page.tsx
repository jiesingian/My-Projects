import { householdZone } from "@/lib/household-zone";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { getMembers } from "@/lib/queries/family";
import { getTimeCapsules } from "@/lib/queries/time-capsules";
import { isGrownUp } from "@/lib/roles";
import { familyDay, readableDay } from "@/lib/time";
import { Blueprint, Empty } from "@/components/ui";
import { Icon } from "@/components/icons";
import { LetterForm } from "@/components/letter-form";
import { LetterRemove } from "@/components/letter-remove";

/** Time-capsule letters (roadmap item 6): written now, opened on a day the
 * writer picks -- by default the 18th birthday of the person they're for.
 * Sealed ones are listed only to their writer; the table's rules see to
 * that (20261007090000_time_capsule_letters.sql). */
export default async function LettersPage() {
  const tz = await householdZone();
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const today = familyDay(new Date(), tz);
  const [letters, members] = await Promise.all([getTimeCapsules(me.family_id), isGrownUp(me.role) ? getMembers(me.family_id) : Promise.resolve([])]);
  const opened = letters.filter((l) => !l.sealed);
  const sealed = letters.filter((l) => l.sealed && l.writerMemberId === me.id);
  const recipients = members
    .filter((m) => m.status === "active")
    .map((m) => {
      const eighteenth = m.dob && /^\d{4}-\d{2}-\d{2}/.test(m.dob) ? `${Number(m.dob.slice(0, 4)) + 18}${m.dob.slice(4, 10)}` : null;
      return { id: m.id, name: m.full_name, eighteenth };
    });
  const first = (name: string) => name.split(" ")[0];

  return (
    <div style={{ padding: "0.875rem 0" }}>
      <Link href="/journal" style={{ fontSize: "0.8125rem", color: "var(--color-neutral-700)" }}>← Journal</Link>
      <h1 style={{ font: "600 1.75rem/1.1 var(--font-heading)", margin: "0.5rem 0 0.375rem" }}>Letters for later</h1>
      <p style={{ fontSize: "0.875rem", lineHeight: 1.5, color: "var(--color-neutral-700)", margin: "0 0 1.25rem" }}>
        A letter to someone in the family, sealed until a day you choose — their 18th birthday, unless you pick another.
      </p>

      {opened.length === 0 && sealed.length === 0 && (
        <Empty icon={<Icon name="fileText" size={26} />} title="No letters yet" line="Write one now for a birthday years away. Nobody else sees it until then." />
      )}

      {opened.map((l) => (
        <Blueprint key={l.id} style={{ padding: "0.8125rem", marginBottom: "1rem" }}>
          <article id={`letter-${l.id}`}>
            <span style={{ font: "400 0.75rem/1 var(--font-numeric)", color: "var(--color-accent-700)" }}>
              Opened {readableDay(l.opensOn, { year: true })}
            </span>
            <h2 style={{ font: "600 1.3125rem/1.1 var(--font-heading)", margin: "7px 0 4px" }}>{l.title || `For ${first(l.recipientName)}`}</h2>
            <p style={{ fontSize: "0.8125rem", margin: "0 0 0.625rem", color: "var(--color-neutral-700)" }}>
              For {first(l.recipientName)}, from {first(l.writerName) || "someone in the family"} · written {readableDay(familyDay(new Date(l.createdAt), tz), { year: true })}
            </p>
            <p style={{ fontSize: "0.9375rem", lineHeight: 1.6, whiteSpace: "pre-wrap", margin: 0 }}>{l.body}</p>
          </article>
        </Blueprint>
      ))}

      {sealed.length > 0 && (
        <section style={{ margin: "1.5rem 0" }}>
          <h3 className="kin-eyebrow">Sealed — only you can see these</h3>
          {sealed.map((l) => (
            <Blueprint key={l.id} style={{ padding: "0.8125rem", marginBottom: "0.75rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
                <div>
                  <strong style={{ fontSize: "0.9375rem" }}>{l.title || `For ${first(l.recipientName)}`}</strong>
                  <div style={{ fontSize: "0.8125rem", color: "var(--color-neutral-700)" }}>
                    For {first(l.recipientName)} · opens {readableDay(l.opensOn, { year: true })}
                  </div>
                </div>
                <LetterRemove id={l.id} />
              </div>
            </Blueprint>
          ))}
        </section>
      )}

      {isGrownUp(me.role) && (
        <section style={{ marginTop: "1.5rem" }}>
          <h3 className="kin-eyebrow">Write a letter</h3>
          <LetterForm recipients={recipients} today={today} />
        </section>
      )}
    </div>
  );
}
