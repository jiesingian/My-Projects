import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { getMembers, getHealthSummary, getDocFolders, getFamilyProfile } from "@/lib/queries/family";
import { HubHeader } from "@/components/hub-header";
import { ChipRow } from "@/components/segmented";
import { Blueprint, Tag } from "@/components/ui";
import { PendingMemberActions } from "@/components/pending-member-actions";
import { RemoveMemberButton, ReinstateMemberButton } from "@/components/member-status-actions";
import { Avatar } from "@/components/avatar";
import { FamilyBackgroundUpload } from "@/components/family-background-upload";
import { FamilyAddressList } from "@/components/family-address-list";
import { formatAge, initials } from "@/lib/format";

const SEGMENTS = ["profile", "health", "documents"] as const;
type Seg = (typeof SEGMENTS)[number];

export default async function FamilyPage({
  searchParams,
}: {
  searchParams: Promise<{ seg?: string; who?: string }>;
}) {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");

  const sp = await searchParams;
  const seg: Seg = (SEGMENTS as readonly string[]).includes(sp.seg ?? "") ? (sp.seg as Seg) : "profile";
  const who = sp.who ?? "all";

  const segments = SEGMENTS.map((s) => ({
    label: s === "profile" ? "Profile" : s === "health" ? "Health" : "Documents",
    href: `/family?seg=${s}`,
    active: s === seg,
  }));

  return (
    <div>
      <HubHeader n="01" title="Family" segments={segments} />
      <div style={{ padding: "0 22px 22px" }}>
        {seg === "profile" && <ProfilePane familyId={me.family_id} isOrganiser={me.is_organiser} myId={me.id} />}
        {seg === "health" && <HealthPane familyId={me.family_id} who={who} />}
        {seg === "documents" && <DocumentsPane familyId={me.family_id} who={who} />}
      </div>
    </div>
  );
}

async function ProfilePane({ familyId, isOrganiser, myId }: { familyId: string; isOrganiser: boolean; myId: string }) {
  const [allMembers, { backgroundUrl, addresses }] = await Promise.all([getMembers(familyId), getFamilyProfile(familyId)]);
  const pending = allMembers.filter((m) => m.status === "pending");
  const removed = allMembers.filter((m) => m.status === "removed");
  const members = allMembers.filter((m) => m.status !== "pending" && m.status !== "removed");

  return (
    <>
      <FamilyBackgroundUpload familyId={familyId} backgroundUrl={backgroundUrl} canEdit={isOrganiser} />
      <FamilyAddressList addresses={addresses} canEdit={isOrganiser} />
      <div style={{ height: 1, background: "var(--color-divider)", margin: "4px 0 18px" }} />

      {isOrganiser && pending.length > 0 && (
        <>
          <div style={{ font: "600 10px/1 var(--font-heading)", letterSpacing: ".14em", color: "var(--color-accent-700)", marginBottom: 8 }}>
            PENDING REQUESTS · {pending.length}
          </div>
          {pending.map((m) => (
            <Blueprint key={m.id} className="bg-[var(--color-accent-100)]" style={{ padding: 12, marginBottom: 10, display: "flex", alignItems: "center", gap: 12 }}>
              <Avatar url={m.avatar_url} initials={initials(m.full_name)} size={40} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ font: "600 15px/1.1 var(--font-heading)", display: "block" }}>{m.full_name}</span>
                <span style={{ fontSize: 11, color: "var(--color-neutral-600)" }}>
                  {formatAge(m.dob)} · wants to join as {m.role.replace("_", " ")}
                </span>
              </span>
              <PendingMemberActions memberId={m.id} fullName={m.full_name} />
            </Blueprint>
          ))}
          <div style={{ height: 1, background: "var(--color-divider)", margin: "4px 0 16px" }} />
        </>
      )}
      {members.map((m) => (
        <div
          key={m.id}
          style={{
            display: "flex",
            gap: 12,
            alignItems: "center",
            padding: "13px 0",
            borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)",
          }}
        >
          <Link href={`/family/members/${m.id}`} style={{ display: "flex", gap: 12, alignItems: "center", flex: 1, minWidth: 0, textDecoration: "none", color: "inherit" }}>
            <Avatar url={m.avatar_url} initials={initials(m.full_name)} size={44} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ font: "600 18px/1.1 var(--font-heading)", display: "block" }}>{m.full_name}</span>
              <span style={{ fontSize: 11.5, color: "var(--color-neutral-600)" }}>
                {formatAge(m.dob)} · {m.relationship ?? m.role.replace("_", " ")}
              </span>
            </span>
          </Link>
          <Tag variant={m.auth_user_id === null ? "neutral" : m.is_organiser ? "accent" : "outline"}>
            {m.auth_user_id === null ? "MANAGED" : m.is_organiser ? "ORGANIZER" : m.status.toUpperCase()}
          </Tag>
          {isOrganiser && m.id !== myId && !m.is_organiser && <RemoveMemberButton memberId={m.id} fullName={m.full_name} />}
        </div>
      ))}
      <div style={{ fontSize: 11.5, color: "var(--color-neutral-600)", marginTop: 14 }}>
        Managed profiles are written by a parent. Children graduate to their own login at 13.
      </div>

      {isOrganiser && removed.length > 0 && (
        <>
          <div style={{ font: "600 10px/1 var(--font-heading)", letterSpacing: ".14em", color: "var(--color-neutral-600)", margin: "22px 0 8px" }}>
            REMOVED · {removed.length}
          </div>
          {removed.map((m) => (
            <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)", opacity: 0.7 }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: 14 }}>{m.full_name}</span>
              <ReinstateMemberButton memberId={m.id} />
            </div>
          ))}
        </>
      )}
    </>
  );
}

async function HealthPane({ familyId, who }: { familyId: string; who: string }) {
  const rows = (await getHealthSummary(familyId)).filter((r) => r.member.status !== "pending" && r.member.status !== "removed");
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
        <Link key={member.id} href={`/family/members/${member.id}?view=health`} style={{ color: "inherit", textDecoration: "none" }}>
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
  const members = (await getMembers(familyId)).filter((m) => m.status !== "pending" && m.status !== "removed");
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
