import Link from "next/link";
import { Icon } from "@/components/icons";
import type { Memory, WeekRecap } from "@/lib/queries/memories";

/** "On this day": a strip of what the family recorded on this date in
 * earlier years. Hidden when there is nothing, so a new household is not
 * shown an empty shelf. */
export function OnThisDay({ memories }: { memories: Memory[] }) {
  if (memories.length === 0) return null;
  return (
    <section style={{ marginBottom: "1.625rem" }}>
      <h3 className="kin-eyebrow">On this day</h3>
      <div className="kin-memories">
        {memories.map((m) => (
          <Link key={`${m.kind}-${m.id}`} href={m.href} className="kin-memory">
            {m.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- signed or proxied URLs, not a static asset
              <img src={m.photoUrl} alt="" className="kin-memory-photo" loading="lazy" />
            ) : (
              <span className="kin-memory-photo kin-memory-glyph" aria-hidden="true">
                <Icon name={m.kind === "milestone" ? "target" : "images"} size={22} />
              </span>
            )}
            <span className="kin-memory-when">{m.yearsAgo === 1 ? "1 year ago" : `${m.yearsAgo} years ago`}</span>
            <span className="kin-memory-title">{m.title}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

/** The week in numbers, shown at the weekend. Only the parts that happened:
 * a line that says "0 photos" reads as a scolding, not a recap. */
export function WeekRecapCard({ recap }: { recap: WeekRecap }) {
  const parts: { n: number; label: string }[] = [
    { n: recap.choresDone, label: recap.choresDone === 1 ? "chore done" : "chores done" },
    { n: recap.posts, label: recap.posts === 1 ? "post" : "posts" },
    { n: recap.photos, label: recap.photos === 1 ? "photo" : "photos" },
    { n: recap.milestones, label: recap.milestones === 1 ? "milestone" : "milestones" },
  ].filter((p) => p.n > 0);
  if (parts.length === 0) return null;
  return (
    <section className="kin-recap" aria-label="Your family's week">
      <div className="kin-recap-head">
        <Icon name="sparkle" size={16} /> Your family&apos;s week
      </div>
      <div className="kin-recap-stats">
        {parts.map((p) => (
          <div key={p.label} className="kin-recap-stat">
            <span className="kin-recap-n">{p.n}</span>
            <span className="kin-recap-l">{p.label}</span>
          </div>
        ))}
      </div>
      {recap.topHelper && <p className="kin-recap-line">Most helpful this week: {recap.topHelper}</p>}
    </section>
  );
}
