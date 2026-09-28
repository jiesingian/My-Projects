import Link from "next/link";
import { Icon } from "@/components/icons";
import { promptForWeek } from "@/lib/story-prompts";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { getCurrentMember } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { getGallery, getEntries, syncDriveJournalMedia, driveIsDisconnected } from "@/lib/queries/journal";
import { DriveDisconnectedNotice } from "@/components/drive-disconnected-notice";
import { HubHeader } from "@/components/hub-header";
import { Segmented } from "@/components/segmented";
import { Blueprint, Tag, Empty } from "@/components/ui";
import { GalleryUpload } from "@/components/gallery-upload";
import { GalleryGrid } from "@/components/gallery-grid";
import { JournalEntryPhotos } from "@/components/journal-entry-photos";
import { familyDate } from "@/lib/format-family";
import { FamilyFeed } from "@/components/family-feed";
import { EntryShareToggle } from "@/components/entry-share-toggle";
import { getFamilyFeed, getFamilyLinks, getFeedOccasions } from "@/lib/queries/family-links";
import { isGrownUp } from "@/lib/roles";
import { AddToHouseholdButton } from "@/components/add-to-household";

/* Gallery, Entries and Milestones were three hub segments; now they are one
   -- Entries -- with these three as views inside it. A person reading a day
   back wants the write-up, the photos and the milestone in one place rather
   than three tabs that all say "Journal" and show nothing of each other. */
/* Three layers (28 September, BACKLOG item 3): Mine -- what you wrote,
   including entries only you can see -- then the Household journal, then the
   Family feed that reaches linked households. The Gallery is the household's
   photos. Milestones are entries with a ★ (29 September), found with the
   filter chip on Household; `?view=milestones` is that filter. */
const VIEWS = ["mine", "household", "feed", "gallery", "milestones"] as const;
// Milestones is a filter on Household, not a tab: five tabs wrap on a phone.
const TABS: readonly View[] = ["mine", "household", "feed", "gallery"];
type View = (typeof VIEWS)[number];
const VIEW_LABELS: Record<View, string> = { mine: "Mine", household: "Household", feed: "Family feed", gallery: "Gallery", milestones: "Milestones" };

export default async function JournalPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const sp = await searchParams;
  // "list" is what the household journal was called; old links still land there.
  const asked = sp.view === "list" ? "household" : sp.view;
  const view: View = (VIEWS as readonly string[]).includes(asked ?? "") ? (asked as View) : "household";

  // Reconcile the index against Drive both ways — still on every Journal load,
  // still only for the two views that show Drive files, but once rather than
  // per pane and after the response has gone out. It refreshes a token and
  // lists a whole folder before it can say anything, so awaiting it meant no
  // photo appeared until Google had answered. A file added or deleted straight
  // in Drive now shows up on the next visit instead of holding up this one.
  if (view === "gallery" || view === "household") {
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
        {view === "gallery" && <GalleryPane familyId={me.family_id} />}
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

async function GalleryPane({ familyId }: { familyId: string }) {
  const fmtDate = await familyDate();
  const media = await getGallery(familyId);

  // A photo that's still indexed but whose Drive connection has since died
  // (revoked in the household's Google Account, or expired unused) renders as
  // a bare, unlabeled placeholder with nothing to click -- the household has
  // no way to tell "temporarily broken" from "gone for good". If any photo
  // here is Drive-backed and the link is no longer connected, say so and
  // point at the one place that fixes it.
  //
  // Only asked when there is a Drive-backed photo on screen: a household that
  // never linked Drive should never be told to reconnect it.
  const hasDriveMedia = media.some((m) => m.storage_provider === "google_drive");
  const driveDisconnected = hasDriveMedia && (await driveIsDisconnected(familyId));

  return (
    <>
      <GalleryUpload />
      {driveDisconnected && <DriveDisconnectedNotice />}
      {media.length === 0 ? (
        <Empty
          icon={<Icon name="images" size={26} />}
          title="No photos yet"
          line="Everything you add here is private to your family and backs up to your own Google Drive. Start with one from today."
        />
      ) : (
        <GalleryGrid
          media={media.map((m) => ({ id: m.id, url: m.url, viewLink: m.viewLink, date: m.taken_at ? fmtDate(m.taken_at) : "", media_type: m.media_type }))}
        />
      )}
    </>
  );
}

/** Everyone's shared memories, in date order, regardless of whose household
 * wrote them. Row-level security decides what is in here; this pane does not
 * filter by family at all, on purpose -- see getFamilyFeed. */
async function FeedPane({ meId, familyId, inviteCode, canManage }: { meId: string; familyId: string; inviteCode: string; canManage: boolean }) {
  const [entries, links, occasions] = await Promise.all([getFamilyFeed(familyId), getFamilyLinks(familyId), getFeedOccasions(meId, familyId)]);
  return <FamilyFeed entries={entries} links={links} ourCode={inviteCode} canManage={canManage} occasions={occasions} />;
}

async function EntriesPane({ familyId, mine, milestonesOnly = false }: { familyId: string; mine?: { personId: string }; milestonesOnly?: boolean }) {
  const fmtDate = await familyDate();
  const [entries, links] = await Promise.all([getEntries(familyId, mine, { milestonesOnly }), getFamilyLinks(familyId)]);
  const linkedCount = links.filter((l) => l.status === "accepted").length;

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
            {mine && (
              <Tag variant={e.visibility === "personal" ? "outline" : "neutral"} className={e.source === "from_plan" ? undefined : "ml-auto"}>
                {e.visibility === "personal" ? "JUST ME" : "HOUSEHOLD"}
              </Tag>
            )}
          </div>
          <div style={{ font: "600 1.3125rem/1.05 var(--font-heading)", margin: "7px 0 6px" }}>{e.title}</div>
          <JournalEntryPhotos photos={e.photos} entryTitle={e.title} />
          {e.note && <p style={{ fontSize: "0.875rem", margin: "0 0 9px", color: "var(--color-neutral-800)" }}>{e.note}</p>}
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "0.375rem 0.5rem" }}>
            <div style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)" }}>
              {e.people.map((p) => p.full_name.split(" ")[0]).join(" · ") || (e.visibility === "personal" ? "Only you" : "Whole family")}
            </div>
            <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "0.625rem" }}>
              {e.visibility === "personal" ? (
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
