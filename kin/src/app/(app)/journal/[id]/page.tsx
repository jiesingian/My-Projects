import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { getEntry, getPublicEntry, driveIsDisconnected } from "@/lib/queries/journal";
import { DriveDisconnectedNotice } from "@/components/drive-disconnected-notice";
import { getConnections } from "@/lib/queries/connections";
import { familyDate } from "@/lib/format-family";
import { DetailHeader } from "@/components/hub-header";
import { JournalEntryGallery } from "@/components/journal-entry-gallery";
import { EntryShareOptions } from "@/components/entry-share-options";
import { getFamilyLinks } from "@/lib/queries/family-links";
import { EntryVideoPanel } from "@/components/entry-video";

/** One entry, read on its own: the write-up and every photo it holds, as a
 * gallery. Opened by tapping an entry in Mine or Household. Row-level
 * security decides whether it can be read at all -- a Just-me entry is its
 * owner's alone, and anyone else gets the 404. */
export default async function JournalEntryPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ video?: string }> }) {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const [{ id }, { video: openMaker }] = await Promise.all([params, searchParams]);
  const [ours, fmtDate, links, connections] = await Promise.all([getEntry(me.family_id, id), familyDate(), getFamilyLinks(me.family_id), getConnections()]);
  // Not this household's: it can still be one a connection made Public.
  const entry = ours ?? (await getPublicEntry(id));
  if (!entry) notFound();
  const fromOutside = !ours;
  // The same notice Household shows, asked the same way: a Drive photo that
  // stopped loading says why, and where to fix it.
  const driveDisconnected = entry.hasDriveMedia && (await driveIsDisconnected(me.family_id));

  const personal = entry.visibility === "personal";
  const names = entry.people.map((p) => p.full_name.split(" ")[0]).join(" · ");

  return (
    <div>
      <DetailHeader backHref={fromOutside ? "/journal?view=public" : personal ? "/journal?view=mine" : "/journal?view=household"} eyebrow="Journal" />
      <div style={{ padding: "0 var(--gutter) 1.375rem" }}>
        {driveDisconnected && <DriveDisconnectedNotice />}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "0.375rem 0.5rem" }}>
          <span style={{ font: "400 0.75rem/1 var(--font-numeric)", color: "var(--color-accent-700)" }}>{fmtDate(entry.entry_date)}</span>
          {entry.milestone && (
            <span className="kin-entry-star">
              <span aria-hidden="true">★</span> {entry.milestoneOf ? `${entry.milestoneOf.split(" ")[0]}'s milestone` : "Milestone"}
            </span>
          )}
          {!fromOutside && (
            <Link href={`/journal/${entry.id}/edit`} style={{ marginLeft: "auto", fontSize: "0.8125rem", fontWeight: 600, color: "var(--color-accent-700)" }}>
              Edit
            </Link>
          )}
        </div>
        <h3 style={{ font: "600 1.5rem/1.1 var(--font-heading)", margin: "0.5rem 0 0.375rem" }}>{entry.title}</h3>
        <div style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)", marginBottom: "0.75rem" }}>
          {fromOutside ? "Shared with their connections" : names || (personal ? "Only you" : "Whole family")}
        </div>
        {/* Its writer sees where it is shared, and changes it here as in Mine. */}
        {entry.owner_person_id === me.person_id && (
          <EntryShareOptions
            entryId={entry.id}
            title={entry.title}
            personal={personal}
            shared={Boolean(entry.shared_at)}
            milestone={entry.milestone}
            isPublic={Boolean(entry.public_at)}
            linkedCount={links.filter((l) => l.status === "accepted").length}
            connectionCount={connections.filter((c) => c.status === "accepted").length}
          />
        )}
        {/* The entry's video, or the way in to making one from its photos.
            Anyone in the household may make one; a connection's Public entry
            is theirs to read, not to change. */}
        <EntryVideoPanel
          entryId={entry.id}
          title={entry.title}
          dateLabel={longDate(entry.entry_date)}
          signature={personal ? me.full_name : me.families.name}
          personal={personal}
          photos={entry.photos.filter((p) => !("kind" in p) || p.kind !== "video")}
          video={entry.video}
          canMake={!fromOutside}
          canShareToFeed={!fromOutside && !personal && links.some((l) => l.status === "accepted")}
          sharedToFeed={Boolean(entry.shared_at)}
          autoOpen={openMaker === "1"}
        />
        {entry.note && <p style={{ fontSize: "0.9375rem", lineHeight: 1.55, margin: "0 0 1rem", color: "var(--color-neutral-800)", whiteSpace: "pre-wrap" }}>{entry.note}</p>}
        {entry.photos.length > 0 ? (
          <>
            <div style={{ fontSize: "0.75rem", fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--color-neutral-600)", margin: "0 0 0.5rem" }}>
              {entry.photos.length} photo{entry.photos.length === 1 ? "" : "s"}
            </div>
            <JournalEntryGallery photos={entry.photos} entryTitle={entry.title} />
          </>
        ) : (
          <p style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)" }}>
            No photos.{" "}
            {!fromOutside && (
              <Link href={`/journal/${entry.id}/edit`} style={{ color: "var(--color-accent-700)", fontWeight: 600 }}>
                Add some
              </Link>
            )}
          </p>
        )}
      </div>
    </div>
  );
}

/** "30 September 2026", for the video's title and end cards. The entry's date
 * is a calendar day, so it is read as one, not as a moment in a time zone. */
function longDate(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? day : d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}
