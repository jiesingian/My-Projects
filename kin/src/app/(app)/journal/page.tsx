import Link from "next/link";
import { Icon } from "@/components/icons";
import { promptForWeek } from "@/lib/story-prompts";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { getCurrentMember } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { getEntries, getPublicFeed, syncDriveJournalMedia, driveIsDisconnected } from "@/lib/queries/journal";
import { getConnections } from "@/lib/queries/connections";
import { DriveDisconnectedNotice } from "@/components/drive-disconnected-notice";
import { HubHeader } from "@/components/hub-header";
import { Segmented } from "@/components/segmented";
import { Blueprint, Tag, Empty } from "@/components/ui";
import { JournalEntryPhotos } from "@/components/journal-entry-photos";
import { familyDate } from "@/lib/format-family";
import { FamilyFeed } from "@/components/family-feed";
import { EntryShareToggle } from "@/components/entry-share-toggle";
import { getFamilyFeed, getFamilyLinks, getFeedOccasions } from "@/lib/queries/family-links";
import { isGrownUp } from "@/lib/roles";
import { AddToHouseholdButton } from "@/components/add-to-household";
import { EntryShareOptions } from "@/components/entry-share-options";

/* Gallery, Entries and Milestones were three hub segments; now they are one
   -- Entries -- with these three as views inside it. A person reading a day
   back wants the write-up, the photos and the milestone in one place rather
   than three tabs that all say "Journal" and show nothing of each other. */
/* Three layers (28 September, BACKLOG item 3): Mine -- what you wrote,
   including entries only you can see -- then the Household journal, then the
   Family feed that reaches linked households. The Gallery is the household's
   photos. Milestones are entries with a ★ (29 September), found with the
   filter chip on Household; `?view=milestones` is that filter. */
/* The Gallery became the Public feed (29 September, Janine): entries their
   writers marked Public, from the people you are connected with, and yours.
   Photos now live with their entry -- each opens as its own gallery -- so a
   tab of loose photos had nothing left to do. */
const VIEWS = ["mine", "household", "feed", "public", "milestones"] as const;
// Milestones is a filter on Household, not a tab: five tabs wrap on a phone.
const TABS: readonly View[] = ["mine", "household", "feed", "public"];
type View = (typeof VIEWS)[number];
const VIEW_LABELS: Record<View, string> = { mine: "Mine", household: "Household", feed: "Family feed", public: "Public", milestones: "Milestones" };

export default async function JournalPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const sp = await searchParams;
  // "list" is what the household journal was called, and "gallery" the tab
  // Public replaced; old links still land somewhere sensible.
  const asked = sp.view === "list" ? "household" : sp.view === "gallery" ? "public" : sp.view;
  const view: View = (VIEWS as readonly string[]).includes(asked ?? "") ? (asked as View) : "household";

  // Reconcile the index against Drive both ways — still on every Journal load,
  // still only for the view that shows Drive files, but once rather than
  // per pane and after the response has gone out. It refreshes a token and
  // lists a whole folder before it can say anything, so awaiting it meant no
  // photo appeared until Google had answered. A file added or deleted straight
  // in Drive now shows up on the next visit instead of holding up this one.
  if (view === "household") {
    const supabase = await createClient();
    after(() => syncDriveJournalMedia(me.family_id, me.families.name, supabase));
  }

  const segments = [{ label: "Entries", href: "/journal", active: true }];
  const views = TABS.map((v) => ({ label: VIEW_LABELS[v], href: `/journal?view=${v}`, active: v === view || (v === "household" && view === "milestones") }));

  return (
    <div>
      <HubHeader n="02" title="Journal" segments={segments} dateFormat={me.families.date_format} />
      <div style={{ padding: "0 var(--gutter) 1.375rem" }}>
        <Segmented items={views} />
        {view === "public" && <PublicPane personId={me.person_id} familyId={me.family_id} />}
        {view === "household" && <EntriesPane familyId={me.family_id} />}
        {view === "mine" && <EntriesPane familyId={me.family_id} mine={{ personId: me.person_id }} />}
        {view === "milestones" && <EntriesPane familyId={me.family_id} milestonesOnly />}
        {view === "feed" && (
          <FeedPane meId={me.id} familyId={me.family_id} inviteCode={me.families.invite_code} canManage={isGrownUp(me.role)} />
        )}
      </div>
    </div>
  );
}

/** Everyone's shared memories, in date order, regardless of whose household
 * wrote them. Row-level security decides what is in here; this pane does not
 * filter by family at all, on purpose -- see getFamilyFeed. */
async function FeedPane({ meId, familyId, inviteCode, canManage }: { meId: string; familyId: string; inviteCode: string; canManage: boolean }) {
  const [entries, links, occasions] = await Promise.all([getFamilyFeed(familyId, meId), getFamilyLinks(familyId), getFeedOccasions(meId, familyId)]);
  return <FamilyFeed entries={entries} links={links} ourCode={inviteCode} canManage={canManage} occasions={occasions} />;
}

/** Public: what the people you are connected with chose to share with their
 * connections, and what you did. Row-level security decides what is in here
 * (20260929100200); nobody who is not connected with the writer can read it. */
async function PublicPane({ personId, familyId }: { personId: string; familyId: string }) {
  const fmtDate = await familyDate();
  const [entries, connections] = await Promise.all([getPublicFeed(personId, familyId), getConnections()]);
  const connected = connections.filter((c) => c.status === "accepted").length;
  return (
    <>
      <p style={{ fontSize: "0.84375rem", lineHeight: 1.5, color: "var(--color-neutral-700)", margin: "0.875rem 0 0.75rem" }}>
        Moments marked <strong>Public</strong> by the people you&apos;re connected with, and yours. Only your connections see what you share here.
      </p>
      {entries.length === 0 && (
        <div style={{ marginBottom: "1rem" }}>
          <Empty
            icon={<Icon name="images" size={26} />}
            title={connected === 0 ? "No connections yet" : "Nothing public yet"}
            line={
              connected === 0
                ? "Connect with someone — in the family or out of it — and what they make Public shows here. Anything you mark Public in Mine shows here too."
                : "When you or someone you're connected with marks an entry Public in Mine, it shows here."
            }
            action={{ label: "Go to Mine", href: "/journal?view=mine" }}
          />
        </div>
      )}
      {entries.map((e) => (
        <Blueprint key={e.id} style={{ padding: "0.8125rem", marginBottom: "1rem" }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "0.375rem 0.5rem" }}>
            <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>{e.author === "You" ? "You" : e.author.split(" ")[0]}</span>
            <span style={{ font: "400 0.75rem/1 var(--font-numeric)", color: "var(--color-accent-700)" }}>{fmtDate(e.entryDate)}</span>
            {e.milestone && (
              <span className="kin-entry-star">
                <span aria-hidden="true">★</span> Milestone
              </span>
            )}
          </div>
          <Link href={`/journal/${e.id}`} style={{ display: "block", font: "600 1.3125rem/1.05 var(--font-heading)", margin: "7px 0 6px", color: "inherit" }}>
            {e.title}
          </Link>
          <JournalEntryPhotos photos={e.photos} entryTitle={e.title} galleryHref={`/journal/${e.id}`} />
          {e.note && <p style={{ fontSize: "0.875rem", margin: "0 0 4px", color: "var(--color-neutral-800)" }}>{e.note}</p>}
        </Blueprint>
      ))}
    </>
  );
}

async function EntriesPane({ familyId, mine, milestonesOnly = false }: { familyId: string; mine?: { personId: string }; milestonesOnly?: boolean }) {
  const fmtDate = await familyDate();
  const [entries, links, connections] = await Promise.all([getEntries(familyId, mine, { milestonesOnly }), getFamilyLinks(familyId), mine ? getConnections() : []]);
  const linkedCount = links.filter((l) => l.status === "accepted").length;
  const connectionCount = connections.filter((c) => c.status === "accepted").length;

  // Entries shows Drive-backed photos exactly as the Gallery does, and said
  // nothing when they stopped loading. #59 added the explanation to the
  // Gallery only, so a household reading an entry still got bare placeholders
  // and no way back -- the failure that PR existed to end, surviving in the
  // pane nobody checked. Same question, same notice, asked the same way.
  const hasDriveMedia = entries.some((e) => e.hasDriveMedia);
  const driveDisconnected = hasDriveMedia && (await driveIsDisconnected(familyId));

  const question = promptForWeek();
  return (
    <>
      {driveDisconnected && <DriveDisconnectedNotice />}
      {/* This week's question: a reason for Lola to open the app, and a
          record of the family nothing else keeps. */}
      {mine && (
        <p style={{ fontSize: "0.84375rem", lineHeight: 1.5, color: "var(--color-neutral-700)", margin: "0.875rem 0 0.75rem" }}>
          What you wrote. Entries marked <strong>Just me</strong> are yours alone — they come with you if you ever start a household of your own.
        </p>
      )}
      {!mine && (
        <nav className="kin-journal-filter" aria-label="Show">
          <Link href="/journal?view=household" className="chip" data-active={!milestonesOnly} aria-current={!milestonesOnly ? "page" : undefined}>
            All entries
          </Link>
          <Link href="/journal?view=milestones" className="chip" data-active={milestonesOnly} aria-current={milestonesOnly ? "page" : undefined}>
            <span aria-hidden="true">★</span> Milestones
          </Link>
        </nav>
      )}
      {!mine && !milestonesOnly && <Link href={`/journal/new?title=${encodeURIComponent(question)}`} className="kin-story">
        <span className="kin-story-label">This week&apos;s question</span>
        <span className="kin-story-q">{question}</span>
        <span className="kin-story-cta">Answer it in the journal →</span>
      </Link>}
      {entries.length === 0 && (
        <div style={{ marginBottom: "1rem" }}>
          {milestonesOnly ? (
            <Empty
              icon={<Icon name="leaf" size={26} />}
              title="No milestones yet"
              line="First steps, first day of school, a tooth lost. Mark any entry with a ★, or add one here."
              action={{ label: "ADD A MILESTONE", href: "/journal/milestones/new" }}
            />
          ) : mine ? (
            <Empty
              icon={<Icon name="fileText" size={26} />}
              title="Nothing of yours yet"
              line="Write something just for you — a thought, a day, a photo — or add to the household journal. Both show here."
              action={{ label: "Write something", href: "/journal/new?for=me" }}
            />
          ) : (
            <Empty
              icon={<Icon name="fileText" size={26} />}
              title="Nothing written down yet"
              line="An entry is a day worth remembering — where you went, who was there, what it was like. Small ones count."
              action={{ label: "Write the first one", href: "/journal/new" }}
            />
          )}
        </div>
      )}
      {entries.map((e) => (
        <Blueprint key={e.id} style={{ padding: "0.8125rem", marginBottom: "1rem" }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "0.375rem 0.5rem" }}>
            <span style={{ font: "400 0.75rem/1 var(--font-numeric)", color: "var(--color-accent-700)" }}>{fmtDate(e.entry_date)}</span>
            {/* Only an entry Kin made from a plan says where it came from; one a
                person wrote needs no badge saying so (review, 28 September). */}
            {e.milestone && (
              <span className="kin-entry-star">
                <span aria-hidden="true">★</span> {e.milestoneOf ? `${e.milestoneOf.split(" ")[0]}'s milestone` : "Milestone"}
              </span>
            )}
            {e.source === "from_plan" && (
              <Tag variant="neutral" className="ml-auto">
                FROM PLAN
              </Tag>
            )}
          </div>
          {/* The title opens the entry on its own page, with every photo as a gallery. */}
          <Link href={`/journal/${e.id}`} style={{ display: "block", font: "600 1.3125rem/1.05 var(--font-heading)", margin: "7px 0 6px", color: "inherit" }}>
            {e.title}
          </Link>
          <JournalEntryPhotos photos={e.photos} entryTitle={e.title} galleryHref={`/journal/${e.id}`} />
          {e.note && <p style={{ fontSize: "0.875rem", margin: "0 0 9px", color: "var(--color-neutral-800)" }}>{e.note}</p>}
          {/* Mine: where it is shared and its star, on the entry and changed in a tap. */}
          {mine && (
            <EntryShareOptions
              entryId={e.id}
              title={e.title}
              personal={e.visibility === "personal"}
              shared={Boolean(e.shared_at)}
              milestone={e.milestone}
              isPublic={Boolean(e.public_at)}
              linkedCount={linkedCount}
              connectionCount={connectionCount}
            />
          )}
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "0.375rem 0.5rem" }}>
            <div style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)" }}>
              {e.people.map((p) => p.full_name.split(" ")[0]).join(" · ") || (e.visibility === "personal" ? "Only you" : "Whole family")}
            </div>
            <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "0.625rem" }}>
              {mine ? null : e.visibility === "personal" ? (
                <AddToHouseholdButton entryId={e.id} title={e.title} />
              ) : (
                <EntryShareToggle entryId={e.id} shared={Boolean(e.shared_at)} linkedCount={linkedCount} />
              )}
              <Link href={`/journal/${e.id}/edit`} style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--color-accent-700)" }}>
                Edit
              </Link>
            </span>
          </div>
        </Blueprint>
      ))}
      <Link
        href={mine ? "/journal/new?for=me" : milestonesOnly ? "/journal/milestones/new" : "/journal/new"}
        className="btn btn-primary btn-block"
        style={{ minHeight: "2.875rem", fontSize: "0.875rem", letterSpacing: ".04em" }}
      >
        {milestonesOnly ? "+ ADD MILESTONE" : "+ ADD ENTRY"}
      </Link>
    </>
  );
}
