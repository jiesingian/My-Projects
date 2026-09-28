import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { DetailHeader } from "@/components/hub-header";
import { Avatar } from "@/components/avatar";
import { Blueprint } from "@/components/ui";
import { Icon } from "@/components/icons";
import { initials } from "@/lib/format";
import { familyDate } from "@/lib/format-family";
import { memberColourVar } from "@/lib/member-colours";
import { getRelativeProfile } from "@/lib/queries/relatives";
import { getTreeMatches } from "@/lib/queries/tree-links";

/** A relative in a linked household (28 September): opened from a greeter's
 * name on a birthday card, or anywhere a linked relative is named. Read-only,
 * and deliberately thin -- their name, photo and cover, where they are on the
 * family tree, and the moments their household has already shared. Nothing
 * from About, and no health, documents or money: that stays in their own
 * household (20260929013000_relative_profile.sql). */
export default async function RelativePage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  // Somebody in this household has their own full profile.
  if (id === me.id) redirect(`/family/members/${id}`);

  const matches = await getTreeMatches(me.family_id);
  const person = await getRelativeProfile(
    id,
    matches.filter((m) => m.status === "accepted").map((m) => ({ matchId: m.matchId, ourPersonId: m.ourPersonId })),
  );
  if (!person) notFound();
  const fmtDate = await familyDate();
  const first = person.fullName.split(" ")[0];

  return (
    <div>
      <DetailHeader backHref="/journal?view=feed" eyebrow="Family" trail={[{ label: "Family feed", href: "/journal?view=feed" }, { label: person.fullName }]} />
      <div style={{ padding: "0 var(--gutter) 1.375rem" }}>
        <div className="kin-profile-hero">
          <div className="kin-profile-cover" style={{ ["--member" as string]: memberColourVar(person.memberId, null) }}>
            {person.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- public avatars bucket
              <img src={person.coverUrl} alt="" />
            ) : person.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- their own photo, washed across the cover
              <img src={person.avatarUrl} alt="" className="kin-profile-wash" />
            ) : null}
          </div>
          <div className="kin-profile-id">
            <div className="kin-profile-photo">
              <Avatar url={person.avatarUrl} initials={initials(person.fullName)} label={person.fullName} size={96} clickable={false} />
            </div>
            <h1 className="kin-profile-name">{person.fullName}</h1>
            <div className="kin-profile-meta">{person.householdName}</div>
          </div>
          <div className="kin-profile-actions">
            {person.linkId && (
              <Link href={`/journal/links/${person.linkId}`} className="btn btn-primary" style={{ gap: "0.375rem" }}>
                <Icon name="message" size={16} />
                Message
              </Link>
            )}
            {person.tree && (
              <Link
                href={`/family?seg=tree&branch=${person.tree.matchId}&person=${encodeURIComponent(person.tree.chartId)}`}
                className="btn btn-secondary"
                style={{ gap: "0.375rem" }}
              >
                <Icon name="users" size={16} />
                Show in the tree
              </Link>
            )}
          </div>
        </div>

        {person.linkId && (
          <p style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)", margin: "0.75rem 0 0", lineHeight: 1.45 }}>
            Message opens the conversation your household shares with {person.householdName}.
          </p>
        )}

        <h2 className="kin-eyebrow" style={{ marginTop: "1.5rem" }}>
          Shared by {first}
        </h2>
        {person.moments.length === 0 ? (
          <p style={{ fontSize: "0.9375rem", color: "var(--color-neutral-600)" }}>Nothing shared with the family yet.</p>
        ) : (
          <Blueprint style={{ padding: "0.25rem 0.9375rem" }}>
            {person.moments.map((m, i) => (
              <div
                key={`${m.kind}-${m.id}`}
                style={{ display: "flex", alignItems: "baseline", gap: "0.625rem", padding: "0.6875rem 0", borderTop: i === 0 ? undefined : "1px solid var(--color-divider)" }}
              >
                <span aria-hidden="true" style={{ width: "1rem", flex: "none", color: "var(--cal-occasion)" }}>
                  {m.kind === "milestone" ? "★" : ""}
                </span>
                <span style={{ flex: 1, minWidth: 0, fontSize: "0.9375rem" }}>{m.title}</span>
                <span style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)", whiteSpace: "nowrap" }}>{fmtDate(m.date)}</span>
              </div>
            ))}
          </Blueprint>
        )}
      </div>
    </div>
  );
}
