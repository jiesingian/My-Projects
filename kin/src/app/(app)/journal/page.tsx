import Link from "next/link";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { getCurrentMember } from "@/lib/session";
import { getGallery, getEntries, getMilestones, syncDriveJournalMedia, driveIsDisconnected } from "@/lib/queries/journal";
import { DriveDisconnectedNotice } from "@/components/drive-disconnected-notice";
import { HubHeader } from "@/components/hub-header";
import { Blueprint, Tag, Empty } from "@/components/ui";
import { GalleryUpload } from "@/components/gallery-upload";
import { GalleryGrid } from "@/components/gallery-grid";
import { JournalEntryPhotos } from "@/components/journal-entry-photos";
import { MilestoneControls } from "@/components/milestone-controls";
import { familyDate } from "@/lib/format-family";

const SEGMENTS = ["gallery", "entries", "milestones"] as const;
type Seg = (typeof SEGMENTS)[number];

export default async function JournalPage({
  searchParams,
}: {
  searchParams: Promise<{ seg?: string }>;
}) {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const sp = await searchParams;
  const seg: Seg = (SEGMENTS as readonly string[]).includes(sp.seg ?? "") ? (sp.seg as Seg) : "gallery";

  // Reconcile the index against Drive both ways — still on every Journal load,
  // still only for the two segments that show Drive files, but once rather than
  // per pane and after the response has gone out. It refreshes a token and
  // lists a whole folder before it can say anything, so awaiting it meant no
  // photo appeared until Google had answered. A file added or deleted straight
  // in Drive now shows up on the next visit instead of holding up this one.
  if (seg === "gallery" || seg === "entries") {
    after(() => syncDriveJournalMedia(me.family_id, me.families.name));
  }

  const segments = SEGMENTS.map((s) => ({
    label: s[0].toUpperCase() + s.slice(1),
    href: `/journal?seg=${s}`,
    active: s === seg,
  }));

  return (
    <div>
      <HubHeader n="02" title="Journal" segments={segments} dateFormat={me.families.date_format} />
      <div style={{ padding: "0 22px 22px" }}>
        {seg === "gallery" && <GalleryPane familyId={me.family_id} />}
        {seg === "entries" && <EntriesPane familyId={me.family_id} />}
        {seg === "milestones" && <MilestonesPane familyId={me.family_id} />}
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
          icon="🖼"
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

async function EntriesPane({ familyId }: { familyId: string }) {
  const fmtDate = await familyDate();
  const entries = await getEntries(familyId);

  // Entries shows Drive-backed photos exactly as the Gallery does, and said
  // nothing when they stopped loading. #59 added the explanation to the
  // Gallery only, so a household reading an entry still got bare placeholders
  // and no way back -- the failure that PR existed to end, surviving in the
  // pane nobody checked. Same question, same notice, asked the same way.
  const hasDriveMedia = entries.some((e) => e.hasDriveMedia);
  const driveDisconnected = hasDriveMedia && (await driveIsDisconnected(familyId));

  return (
    <>
      {driveDisconnected && <DriveDisconnectedNotice />}
      {entries.length === 0 && (
        <div style={{ marginBottom: 16 }}>
          <Empty
            icon="📔"
            title="Nothing written down yet"
            line="An entry is a day worth remembering — where you went, who was there, what it was like. Small ones count."
            action={{ label: "WRITE THE FIRST ONE", href: "/journal/new" }}
          />
        </div>
      )}
      {entries.map((e) => (
        <Blueprint key={e.id} style={{ padding: 13, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ font: "400 12px/1 var(--font-numeric)", color: "var(--color-accent-700)" }}>{fmtDate(e.entry_date)}</span>
            <Tag variant="neutral" className="ml-auto">
              {e.source === "from_plan" ? "FROM PLAN" : "ADDED DIRECTLY"}
            </Tag>
          </div>
          <div style={{ font: "600 21px/1.05 var(--font-heading)", margin: "7px 0 6px" }}>{e.title}</div>
          <JournalEntryPhotos urls={e.photoUrls} />
          {e.note && <p style={{ fontSize: 14, margin: "0 0 9px", color: "var(--color-neutral-800)" }}>{e.note}</p>}
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <div style={{ fontSize: 13, color: "var(--color-neutral-600)" }}>{e.people.map((p) => p.full_name.split(" ")[0]).join(" · ") || "Whole family"}</div>
            <Link href={`/journal/${e.id}/edit`} style={{ marginLeft: "auto", fontSize: 13, fontWeight: 600, color: "var(--color-accent-700)" }}>
              EDIT
            </Link>
          </div>
        </Blueprint>
      ))}
      <Link href="/journal/new" className="btn btn-primary btn-block" style={{ minHeight: 46, fontSize: 14, letterSpacing: ".04em" }}>
        + ADD ENTRY
      </Link>
    </>
  );
}

async function MilestonesPane({ familyId }: { familyId: string }) {
  const fmtDate = await familyDate();
  const milestones = await getMilestones(familyId);
  return (
    <>
      <div style={{ borderLeft: "1px solid var(--color-divider)", paddingLeft: 16, marginBottom: 18 }}>
        {milestones.length === 0 && (
          <Empty
            icon="🌱"
            title="No milestones yet"
            line="First steps, first day of school, a tooth lost. The things you will want the date of in ten years."
            action={{ label: "ADD A MILESTONE", href: "/journal/milestones/new" }}
          />
        )}
        {milestones.map((m) => (
          <div key={m.id} style={{ position: "relative", paddingBottom: 20 }}>
            <span style={{ position: "absolute", left: -21, top: 5, width: 9, height: 9, background: "var(--color-accent)", display: "block" }} />
            <div style={{ font: "400 12px/1 var(--font-numeric)", color: "var(--color-accent-700)" }}>{fmtDate(m.milestone_date)}</div>
            <div style={{ font: "600 19px/1.05 var(--font-heading)", margin: "4px 0 2px" }}>{m.title}</div>
            <div style={{ fontSize: 13, color: "var(--color-neutral-600)" }}>
              {(m.members as unknown as { full_name: string } | null)?.full_name ?? "Whole family"}
            </div>
            <MilestoneControls milestoneId={m.id} title={m.title} date={m.milestone_date} memberId={m.member_id} />
          </div>
        ))}
      </div>
      <Link href="/journal/milestones/new" className="btn btn-primary btn-block" style={{ minHeight: 46, fontSize: 14, letterSpacing: ".04em" }}>
        + ADD MILESTONE
      </Link>
    </>
  );
}
