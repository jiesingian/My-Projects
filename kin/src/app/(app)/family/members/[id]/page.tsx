import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentMember } from "@/lib/session";
import { getMemberDetail, buildBarSeries } from "@/lib/queries/health";
import { DetailHeader } from "@/components/hub-header";
import { Segmented } from "@/components/segmented";
import { Blueprint, Tag } from "@/components/ui";
import { Icon } from "@/components/icons";
import { formatAge, formatDate, initials } from "@/lib/format";
import { OmronToggle } from "./omron-toggle";
import { RelationshipEditor } from "@/components/relationship-editor";
import { RemoveMemberButton } from "@/components/member-status-actions";
import { Avatar } from "@/components/avatar";
import { AvatarUpload } from "@/components/avatar-upload";
import { ProfileEditForm } from "@/components/profile-edit-form";

const SEGMENTS = ["schedule", "conditions", "labs", "vitals"] as const;
type Seg = (typeof SEGMENTS)[number];

export default async function MemberDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ seg?: string }>;
}) {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const { id } = await params;
  const sp = await searchParams;
  const seg: Seg = (SEGMENTS as readonly string[]).includes(sp.seg ?? "") ? (sp.seg as Seg) : "schedule";

  const { member, schedule, appointments, conditions, labs, vitals, omron } = await getMemberDetail(id, me.family_id);
  if (!member) redirect("/family?seg=members");
  const isSelf = me.id === member.id;

  const isChild = member.role === "child_managed" || member.role === "child_self";
  const bpPoints = vitals.filter((v) => v.vital_type === "blood_pressure");
  const weightPoints = vitals.filter((v) => v.vital_type === "weight");
  const lengthPoints = vitals.filter((v) => v.vital_type === "length");
  const topSeries = isChild
    ? buildBarSeries(lengthPoints, (v) => parseFloat(v), 25)
    : buildBarSeries(bpPoints, (v) => parseInt(v, 10), 30);
  const weightSeries = buildBarSeries(weightPoints, (v) => parseFloat(v), 20);

  const segments = SEGMENTS.map((s) => ({
    label: s[0].toUpperCase() + s.slice(1),
    href: `/family/members/${id}?seg=${s}`,
    active: s === seg,
  }));

  return (
    <div>
      <DetailHeader backHref="/family?seg=members" eyebrow="HUB 01 · MEMBER RECORD" />
      <div style={{ padding: "0 22px 22px" }}>
        <div style={{ display: "flex", gap: 14, alignItems: "flex-end", marginBottom: 18 }}>
          {isSelf ? (
            <AvatarUpload familyId={me.family_id} memberId={member.id} avatarUrl={member.avatar_url} initials={initials(member.full_name)} size={88} />
          ) : (
            <Avatar url={member.avatar_url} initials={initials(member.full_name)} size={88} />
          )}
          <div>
            <div style={{ font: "600 34px/.98 var(--font-heading)" }}>{member.full_name}</div>
            <div style={{ fontSize: 12, color: "var(--color-neutral-600)", marginTop: 4 }}>
              {formatAge(member.dob)} · {member.relationship ?? member.role.replace("_", " ")}
            </div>
            <Tag variant={member.is_organiser ? "accent" : "neutral"} className="mt-2 inline-flex">
              {member.is_organiser ? "ORGANIZER" : member.status.toUpperCase()}
            </Tag>
          </div>
        </div>

        {me.is_organiser && (
          <>
            <div style={{ fontSize: 11.5, color: "var(--color-neutral-700)", marginBottom: 6 }}>Relationship</div>
            <RelationshipEditor memberId={member.id} relationship={member.relationship} />
          </>
        )}

        <ProfileEditForm
          memberId={member.id}
          isSelf={isSelf}
          canEdit={isSelf || me.is_organiser}
          initial={{
            full_name: member.full_name,
            dob: member.dob,
            mobile: member.mobile,
            blood_type: member.blood_type,
            allergies: member.allergies,
            insurance_info: member.insurance_info,
            physician_name: member.physician_name,
          }}
        />

        <Segmented items={segments} />
        <div style={{ marginTop: 18 }}>
          {seg === "schedule" && (
            <>
              {schedule.map((s) => (
                <div key={s.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderBottom: "1px solid var(--color-divider)" }}>
                  <span style={{ fontSize: 12.5 }}>{s.what}</span>
                  <span style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 11.5, color: "var(--color-neutral-700)" }}>
                    {s.when_date ? formatDate(s.when_date) : "—"}
                  </span>
                  <Tag variant={s.status === "due" ? "accent" : "neutral"}>{s.status.replace("_", " ").toUpperCase()}</Tag>
                </div>
              ))}
              <div style={{ font: "600 10px/1 var(--font-heading)", letterSpacing: ".16em", color: "var(--color-neutral-600)", margin: "20px 0 6px" }}>
                APPOINTMENTS
              </div>
              {appointments.map((a) => (
                <div key={a.id} style={{ display: "flex", gap: 12, padding: "11px 0", borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)" }}>
                  <span style={{ font: "400 11px/1.4 ui-monospace, Menlo, monospace", color: "var(--color-accent-700)", width: 140, flex: "none" }}>
                    {new Date(a.when_at).toLocaleString()}
                  </span>
                  <span style={{ flex: 1, fontSize: 13 }}>{a.what}</span>
                </div>
              ))}
              {schedule.length === 0 && appointments.length === 0 && <EmptyNote text="Nothing scheduled yet." />}
            </>
          )}

          {seg === "conditions" &&
            (conditions.length === 0 ? (
              <EmptyNote text="No conditions or routines logged yet." />
            ) : (
              conditions.map((c) => (
                <Blueprint key={c.id} style={{ padding: 13, marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <span style={{ font: "600 18px/1.05 var(--font-heading)" }}>{c.name}</span>
                    <Tag variant={c.status === "active" ? "accent" : c.status === "standing" ? "outline" : "neutral"} className="ml-auto">
                      {c.status.toUpperCase()}
                    </Tag>
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--color-neutral-600)", margin: "4px 0 9px" }}>{c.meta_note}</div>
                  {(c.health_condition_entries ?? [])
                    .sort((a, b) => b.entry_date.localeCompare(a.entry_date))
                    .map((e) => (
                      <div key={e.id} style={{ display: "flex", gap: 10, padding: "8px 0", borderTop: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)" }}>
                        <span style={{ font: "400 10.5px/1.5 ui-monospace, Menlo, monospace", color: "var(--color-accent-700)", width: 74, flex: "none" }}>
                          {formatDate(e.entry_date)}
                        </span>
                        <span style={{ flex: 1, fontSize: 12.5 }}>{e.note}</span>
                      </div>
                    ))}
                </Blueprint>
              ))
            ))}

          {seg === "labs" &&
            (labs.length === 0 ? (
              <EmptyNote text="No lab results logged yet." />
            ) : (
              labs.map((l) => (
                <div key={l.id} style={{ padding: "12px 0", borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)" }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <span style={{ font: "600 16px/1.1 var(--font-heading)" }}>{l.name}</span>
                    <Tag variant={l.flag === "NORMAL" ? "neutral" : "accent"} className="ml-auto">
                      {l.flag}
                    </Tag>
                  </div>
                  <div style={{ display: "flex", gap: 10, alignItems: "baseline", marginTop: 5 }}>
                    <span style={{ font: "400 10.5px/1.5 ui-monospace, Menlo, monospace", color: "var(--color-neutral-600)", width: 74, flex: "none" }}>
                      {formatDate(l.test_date)}
                    </span>
                    <span style={{ flex: 1, fontSize: 12, color: "var(--color-neutral-800)" }}>{l.result}</span>
                  </div>
                </div>
              ))
            ))}

          {seg === "vitals" && (
            <>
              <Blueprint className={omron?.connected ? "bg-[var(--color-accent-100)]" : ""} style={{ padding: 13, marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Icon name="activity" size={17} className="text-[var(--color-accent-700)]" />
                  <span style={{ font: "600 16px/1.05 var(--font-heading)", flex: 1 }}>Omron Connect</span>
                  <Tag variant={omron?.connected ? "accent" : "outline"}>{omron?.connected ? "LINKED" : "NOT LINKED"}</Tag>
                </div>
                <div style={{ fontSize: 11.5, color: "var(--color-neutral-700)", margin: "8px 0 10px" }}>
                  {omron?.connected
                    ? `Last sync ${omron.last_synced_at ? new Date(omron.last_synced_at).toLocaleString() : "just now"}. Readings arrive automatically.`
                    : "Link the Omron Connect app to pull blood pressure and weight readings straight into this record."}
                </div>
                <OmronToggle memberId={member.id} familyId={me.family_id} connected={!!omron?.connected} />
              </Blueprint>

              <BarChart title={isChild ? "LENGTH HISTORY" : "BLOOD PRESSURE HISTORY"} series={topSeries} unit={isChild ? "cm" : "mmHg"} />
              <BarChart title="WEIGHT HISTORY" series={weightSeries} unit="kg" />
            </>
          )}
        </div>

        <Link
          href={`/family/members/${id}/health/new`}
          className="btn btn-primary btn-block"
          style={{ minHeight: 46, fontSize: 14, letterSpacing: ".04em", marginTop: 20 }}
        >
          + NEW HEALTH ENTRY
        </Link>

        {me.is_organiser && !member.is_organiser && member.status !== "removed" && (
          <RemoveMemberButton memberId={member.id} fullName={member.full_name} variant="block" />
        )}
      </div>
    </div>
  );
}

function EmptyNote({ text }: { text: string }) {
  return <div style={{ fontSize: 12, color: "var(--color-neutral-600)" }}>{text}</div>;
}

function BarChart({
  title,
  series,
  unit,
}: {
  title: string;
  series: { label: string; value: string; heightPct: number }[];
  unit: string;
}) {
  if (series.length === 0) {
    return (
      <>
        <div style={{ font: "600 10px/1 var(--font-heading)", letterSpacing: ".16em", color: "var(--color-neutral-600)", marginBottom: 8 }}>{title}</div>
        <EmptyNote text="No readings yet." />
      </>
    );
  }
  const latest = series[series.length - 1];
  return (
    <>
      <div style={{ font: "600 10px/1 var(--font-heading)", letterSpacing: ".16em", color: "var(--color-neutral-600)", marginBottom: 8 }}>{title}</div>
      <Blueprint style={{ padding: 13, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 12 }}>
          <span style={{ font: "600 30px/1 var(--font-heading)" }}>
            {latest.value} {unit}
          </span>
        </div>
        <div style={{ display: "flex", gap: 5, alignItems: "flex-end", height: 88 }}>
          {series.map((b, i) => (
            <div key={i} style={{ flex: 1, height: `${b.heightPct}%`, border: "1px solid var(--color-accent)", background: "var(--color-accent-400)" }} />
          ))}
        </div>
        <div style={{ display: "flex", gap: 5, marginTop: 5 }}>
          {series.map((b, i) => (
            <span key={i} style={{ flex: 1, textAlign: "center", font: "400 8px/1 ui-monospace, Menlo, monospace", color: "var(--color-neutral-600)" }}>
              {b.label}
            </span>
          ))}
        </div>
      </Blueprint>
    </>
  );
}
