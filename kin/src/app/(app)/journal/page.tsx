import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { getGallery, getEntries, getMilestones } from "@/lib/queries/journal";
import { HubHeader } from "@/components/hub-header";
import { Blueprint, Tag } from "@/components/ui";
import { GalleryUpload } from "@/components/gallery-upload";
import { GalleryTile } from "@/components/gallery-tile";
import { formatDate } from "@/lib/format";

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

  const segments = SEGMENTS.map((s) => ({
    label: s[0].toUpperCase() + s.slice(1),
    href: `/journal?seg=${s}`,
    active: s === seg,
  }));

  return (
    <div>
      <HubHeader n="02" title="Journal" segments={segments} />
      <div style={{ padding: "0 22px 22px" }}>
        {seg === "gallery" && <GalleryPane familyId={me.family_id} />}
        {seg === "entries" && <EntriesPane familyId={me.family_id} />}
        {seg === "milestones" && <MilestonesPane familyId={me.family_id} />}
      </div>
    </div>
  );
}

async function GalleryPane({ familyId }: { familyId: string }) {
  const media = await getGallery(familyId);
  return (
    <>
      <GalleryUpload />
      {media.length === 0 ? (
        <p style={{ fontSize: 12, color: "var(--color-neutral-600)" }}>No photos or videos yet — upload the first one above.</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
          {media.map((m) => (
            <GalleryTile key={m.id} url={m.url} viewLink={m.viewLink} date={m.taken_at ? formatDate(m.taken_at) : ""} mediaType={m.media_type} />
          ))}
        </div>
      )}
    </>
  );
}

async function EntriesPane({ familyId }: { familyId: string }) {
  const entries = await getEntries(familyId);
  return (
    <>
      {entries.length === 0 && <p style={{ fontSize: 12, color: "var(--color-neutral-600)", marginBottom: 16 }}>Nothing logged yet.</p>}
      {entries.map((e) => (
        <Blueprint key={e.id} style={{ padding: 13, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ font: "400 9.5px/1 ui-monospace, Menlo, monospace", color: "var(--color-accent-700)" }}>{formatDate(e.entry_date)}</span>
            <Tag variant="neutral" className="ml-auto">
              {e.source === "from_plan" ? "FROM PLAN" : "ADDED DIRECTLY"}
            </Tag>
          </div>
          <div style={{ font: "600 21px/1.05 var(--font-heading)", margin: "7px 0 6px" }}>{e.title}</div>
          {e.photoUrls.length > 0 && (
            <div style={{ display: "flex", gap: 5, marginBottom: 9 }}>
              {e.photoUrls.map((url, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={url} alt="" style={{ flex: 1, height: 74, objectFit: "cover", border: "1px solid var(--color-divider)" }} />
              ))}
            </div>
          )}
          {e.note && <p style={{ fontSize: 12.5, margin: "0 0 9px", color: "var(--color-neutral-800)" }}>{e.note}</p>}
          <div style={{ fontSize: 11, color: "var(--color-neutral-600)" }}>{e.people.map((p) => p.full_name.split(" ")[0]).join(" · ") || "Whole family"}</div>
        </Blueprint>
      ))}
      <Link href="/journal/new" className="btn btn-primary btn-block" style={{ minHeight: 46, fontSize: 14, letterSpacing: ".04em" }}>
        + ADD ENTRY
      </Link>
    </>
  );
}

async function MilestonesPane({ familyId }: { familyId: string }) {
  const milestones = await getMilestones(familyId);
  return (
    <>
      <div style={{ borderLeft: "1px solid var(--color-divider)", paddingLeft: 16, marginBottom: 18 }}>
        {milestones.length === 0 && <p style={{ fontSize: 12, color: "var(--color-neutral-600)" }}>No milestones logged yet.</p>}
        {milestones.map((m) => (
          <div key={m.id} style={{ position: "relative", paddingBottom: 20 }}>
            <span style={{ position: "absolute", left: -21, top: 5, width: 9, height: 9, background: "var(--color-accent)", display: "block" }} />
            <div style={{ font: "400 9.5px/1 ui-monospace, Menlo, monospace", color: "var(--color-accent-700)" }}>{formatDate(m.milestone_date)}</div>
            <div style={{ font: "600 19px/1.05 var(--font-heading)", margin: "4px 0 2px" }}>{m.title}</div>
            <div style={{ fontSize: 11.5, color: "var(--color-neutral-600)" }}>
              {(m.members as unknown as { full_name: string } | null)?.full_name ?? "Whole family"}
            </div>
          </div>
        ))}
      </div>
      <Link href="/journal/milestones/new" className="btn btn-primary btn-block" style={{ minHeight: 46, fontSize: 14, letterSpacing: ".04em" }}>
        + ADD MILESTONE
      </Link>
    </>
  );
}
