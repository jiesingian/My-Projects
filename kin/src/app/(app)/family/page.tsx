import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { getMembers, getHealthSummary, getDocFolders } from "@/lib/queries/family";
import { HubHeader } from "@/components/hub-header";
import { ChipRow } from "@/components/segmented";
import { Blueprint, Tag } from "@/components/ui";
import { formatAge, initials } from "@/lib/format";

const SEGMENTS = ["members", "health", "documents"] as const;
type Seg = (typeof SEGMENTS)[number];

export default async function FamilyPage({
  searchParams,
}: {
  searchParams: Promise<{ seg?: string; who?: string }>;
}) {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");

  const sp = await searchParams;
  const seg: Seg = (SEGMENTS as readonly string[]).includes(sp.seg ?? "") ? (sp.seg as Seg) : "members";
  const who = sp.who ?? "all";

  const segments = SEGMENTS.map((s) => ({
    label: s === "members" ? "Members" : s === "health" ? "Health" : "Documents",
    href: `/family?seg=${s}`,
    active: s === seg,
  }));

  return (
    <div>
      <HubHeader n="01" title="Family" segments={segments} />
      <div style={{ padding: "0 22px 22px" }}>
        {seg === "members" && <MembersPane familyId={me.family_id} />}
        {seg === "health" && <HealthPane familyId={me.family_id} who={who} />}
        {seg === "documents" && <DocumentsPane familyId={me.family_id} who={who} />}
      </div>
    </div>
  );
}

async function MembersPane({ familyId }: { familyId: string }) {
  const members = await getMembers(familyId);
  return (
    <>
      {members.map((m) => (
        <Link
          key={m.id}
          href={`/family/members/${m.id}`}
          style={{
            display: "flex",
            gap: 12,
            alignItems: "center",
            padding: "13px 0",
            borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)",
            textDecoration: "none",
            color: "inherit",
          }}
        >
          <span
            className="placeholder-fill"
            style={{
              width: 44,
              height: 44,
              flex: "none",
              border: "1px solid var(--color-divider)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              font: "600 15px/1 var(--font-heading)",
              color: "var(--color-neutral-700)",
            }}
          >
            {initials(m.full_name)}
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ font: "600 18px/1.1 var(--font-heading)", display: "block" }}>{m.full_name}</span>
            <span style={{ fontSize: 11.5, color: "var(--color-neutral-600)" }}>
              {formatAge(m.dob)} · {m.role.replace("_", " ")}
            </span>
          </span>
          <Tag variant={m.auth_user_id === null ? "neutral" : m.is_organiser ? "accent" : "outline"}>
            {m.auth_user_id === null ? "MANAGED" : m.is_organiser ? "ORGANISER" : m.status.toUpperCase()}
          </Tag>
        </Link>
      ))}
      <div style={{ fontSize: 11.5, color: "var(--color-neutral-600)", marginTop: 14 }}>
        Managed profiles are written by a parent. Children graduate to their own login at 13.
      </div>
    </>
  );
}

async function HealthPane({ familyId, who }: { familyId: string; who: string }) {
  const rows = await getHealthSummary(familyId);
  const filtered = who === "all" ? rows : rows.filter((r) => r.member.id === who);

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <ChipRow
          items={[
            { label: "All", href: "/family?seg=health&who=all", active: who === "all" },
            ...rows.map((r) => ({
              label: r.member.full_name.split(" ")[0],
              href: `/family?seg=health&who=${r.member.id}`,
              active: who === r.member.id,
            })),
          ]}
        />
      </div>
      {filtered.map(({ member, nextDue, hasAlert }) => (
        <Link key={member.id} href={`/family/members/${member.id}`} style={{ color: "inherit", textDecoration: "none" }}>
          <Blueprint style={{ padding: 13, marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
              <span style={{ font: "600 19px/1 var(--font-heading)" }}>{member.full_name.split(" ")[0]}</span>
              <Tag variant={hasAlert ? "accent" : "neutral"} className="ml-auto">
                {nextDue}
              </Tag>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "7px 14px", fontSize: 11.5 }}>
              <Fact k="Blood type" v={member.blood_type} />
              <Fact k="Allergies" v={member.allergies} />
              <Fact k="Insurance" v={member.insurance_info} />
              <Fact k="Physician" v={member.physician_name} />
            </div>
          </Blueprint>
        </Link>
      ))}
    </>
  );
}

function Fact({ k, v }: { k: string; v: string | null }) {
  return (
    <div>
      <span style={{ color: "var(--color-neutral-600)", letterSpacing: ".06em", textTransform: "uppercase", fontSize: 9, display: "block" }}>
        {k}
      </span>
      {v || "Not recorded"}
    </div>
  );
}

async function DocumentsPane({ familyId, who }: { familyId: string; who: string }) {
  const members = await getMembers(familyId);
  const folders = await getDocFolders(familyId);
  const filtered =
    who === "all"
      ? folders
      : folders.filter((f) => f.owners.includes(members.find((m) => m.id === who)?.full_name ?? "__none__"));

  return (
    <>
      <Blueprint className="bg-[var(--color-accent-100)] mb-4" style={{ padding: 12, display: "flex", gap: 10, alignItems: "center" }}>
        <span style={{ fontSize: 11.5, lineHeight: 1.35 }}>
          Files stay in your connected Drive. Kin holds the index and the expiry dates only.
        </span>
      </Blueprint>
      <div style={{ marginBottom: 14 }}>
        <ChipRow
          items={[
            { label: "All", href: "/family?seg=documents&who=all", active: who === "all" },
            ...members.map((m) => ({
              label: m.full_name.split(" ")[0],
              href: `/family?seg=documents&who=${m.id}`,
              active: who === m.id,
            })),
          ]}
        />
      </div>
      {filtered.map((folder) => (
        <Link
          key={folder.id}
          href={`/family/documents/${folder.id}`}
          style={{
            display: "flex",
            gap: 11,
            alignItems: "center",
            padding: "12px 0",
            borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)",
            textDecoration: "none",
            color: "inherit",
          }}
        >
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ font: "600 16px/1.1 var(--font-heading)", display: "block" }}>{folder.name}</span>
            <span style={{ fontSize: 11, color: "var(--color-neutral-600)" }}>
              {folder.fileCount} file{folder.fileCount === 1 ? "" : "s"}
            </span>
          </span>
          <Tag variant={folder.flag === "RENEWS SOON" ? "accent" : folder.flag === "EMPTY" ? "outline" : "neutral"}>
            {folder.flag}
          </Tag>
        </Link>
      ))}
      <Link
        href="/family/documents/new"
        className="btn btn-primary btn-block"
        style={{ minHeight: 46, fontSize: 14, letterSpacing: ".04em", marginTop: 18 }}
      >
        + NEW ENTRY
      </Link>
    </>
  );
}
