import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentMember } from "@/lib/session";
import { inKidView } from "@/lib/kid-view";
import { createClient } from "@/lib/supabase/server";
import { getMemberDetail, buildBarSeries } from "@/lib/queries/health";
import { getAccounts } from "@/lib/queries/wealth";
import { LogSpendControl } from "@/components/money-actions";
import { DetailHeader } from "@/components/hub-header";
import { Segmented } from "@/components/segmented";
import { Blueprint, Tag } from "@/components/ui";
import { Icon } from "@/components/icons";
import { formatAge, initials } from "@/lib/format";
import { MemberColourPicker } from "@/components/member-colour-picker";
import { isGrownUp } from "@/lib/roles";
import { OmronToggle } from "./omron-toggle";
import { ConditionEntryControls, ConditionDeleteButton, LabControls } from "@/components/health-entry-controls";
import { RelationshipEditor } from "@/components/relationship-editor";
import { RoleEditor } from "@/components/role-editor";
import { ConvertToChild } from "@/components/convert-to-child";
import { RemoveMemberButton } from "@/components/member-status-actions";
import { Avatar } from "@/components/avatar";
import { ProfileEditForm } from "@/components/profile-edit-form";
import { MemberProfileEditor } from "@/components/member-profile-editor";
import { ProfilePhotosButton } from "@/components/profile-photos-button";
import type { AlbumPhoto } from "@/lib/actions/profile";
import { memberToProfileFields } from "@/lib/profile-fields";
import { resolvePhotoUrl } from "@/lib/photo-url";
import { familyDate } from "@/lib/format-family";
import { familyDateTime } from "@/lib/time";

const SEGMENTS = ["schedule", "conditions", "labs", "vitals"] as const;
type Seg = (typeof SEGMENTS)[number];

export default async function MemberDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ seg?: string; view?: string; from?: string }>;
}) {
  const me = await getCurrentMember();
  const dateFormat = me?.families.date_format;
  const fmtDate = await familyDate();
  if (!me) redirect("/onboarding/profile");
  const { id } = await params;
  const sp = await searchParams;
  const seg: Seg = (SEGMENTS as readonly string[]).includes(sp.seg ?? "") ? (sp.seg as Seg) : "schedule";
  const view: "profile" | "health" = sp.view === "health" ? "health" : "profile";
  // Health records are kept by the grown-ups; kid view shows the profile.
  if (view === "health" && inKidView(me)) redirect(`/family/members/${id}`);

  const { member, schedule, appointments, conditions, labs, vitals, omron } = await getMemberDetail(id, me.family_id);
  if (!member) redirect("/family?seg=profile");
  const isSelf = me.id === member.id;

  // Reachable from two different hubs, not one: the Family list links here
  // (the ordinary path), but Settings also links straight to your own
  // profile -- so "back" alone no longer says where you'd land, the same
  // gap `docs/PAGE_PATTERNS.md` names for the other two nested routes.
  // `from` only ever means Settings (nothing else links here that way), so
  // Family stays the default for everybody arriving the ordinary route.
  const cameFromSettings = isSelf && sp.from === "settings";
  const familyHref = view === "health" ? "/family?seg=health" : "/family?seg=profile";
  const backHref = cameFromSettings ? "/settings" : familyHref;
  const trail = cameFromSettings
    ? [{ label: "Settings", href: "/settings" }, { label: member.full_name }]
    : [{ label: "Family", href: familyHref }, { label: member.full_name }];

  const accounts = await getAccounts(me.family_id);
  const payableAccounts = accounts
    .filter((a) => a.is_joint || a.owner_member_id === me.id)
    .map((a) => ({ id: a.id, name: a.name, institution: a.institution, linked_app_url: a.linked_app_url, balance: a.balance, is_joint: a.is_joint }));

  // Everyone's pictures, not only your own: on someone else's profile they
  // open read-only, for the household to react to and comment on.
  let photos: AlbumPhoto[] = [];
  {
    const supabase = await createClient();
    const { data: albumRows } = await supabase
      .from("member_avatars")
      .select("id, storage_path, drive_file_id")
      .eq("member_id", member.id)
      .order("created_at", { ascending: false });
    photos = (albumRows ?? [])
      .map((row) => ({ id: row.id, url: resolvePhotoUrl(supabase, row) }))
      .filter((p): p is AlbumPhoto => p.url !== null);
  }

  const isChild = member.role === "child_managed" || member.role === "child_self";
  const bpPoints = vitals.filter((v) => v.vital_type === "blood_pressure");
  const weightPoints = vitals.filter((v) => v.vital_type === "weight");
  const lengthPoints = vitals.filter((v) => v.vital_type === "length");
  const topSeries = isChild
    ? buildBarSeries(lengthPoints, (v) => parseFloat(v), 25, dateFormat)
    : buildBarSeries(bpPoints, (v) => parseInt(v, 10), 30, dateFormat);
  const weightSeries = buildBarSeries(weightPoints, (v) => parseFloat(v), 20, dateFormat);
  // From Apple Health (api/health/apple): the last two weeks of each.
  const recent = (type: string) => vitals.filter((v) => v.vital_type === type).slice(-14);
  const stepsSeries = buildBarSeries(recent("steps"), (v) => parseInt(v, 10), 10, dateFormat);
  const heartSeries = buildBarSeries(recent("heart_rate"), (v) => parseInt(v, 10), 30, dateFormat);
  const sleepSeries = buildBarSeries(recent("sleep"), (v) => parseFloat(v), 20, dateFormat);

  const segments = SEGMENTS.map((s) => ({
    label: s[0].toUpperCase() + s.slice(1),
    href: `/family/members/${id}?view=health&seg=${s}`,
    active: s === seg,
  }));

  return (
    <div>
      <DetailHeader backHref={backHref} eyebrow="Family" trail={trail} />
      <div style={{ padding: "0 1.375rem 1.375rem" }}>
        {view === "profile" ? (
          isSelf ? (
            <MemberProfileEditor
              dateFormat={dateFormat}
              fullName={member.full_name}
              ageLabel={`${formatAge(member.dob)} · ${member.relationship ?? member.role.replace("_", " ")}`}
              statusLabel={member.is_organiser ? "ORGANIZER" : member.status.toUpperCase()}
              statusVariant={member.is_organiser ? "accent" : "neutral"}
              avatarUrl={member.avatar_url}
              initials={initials(member.full_name)}
              photos={photos}
              initial={memberToProfileFields(member)}
            />
          ) : (
            <>
              <div style={{ display: "flex", gap: "0.875rem", alignItems: "flex-end", marginBottom: "1.125rem" }}>
                <ProfilePhotosButton photos={photos} url={member.avatar_url} initials={initials(member.full_name)} label={member.full_name} size={88} />
                <div>
                  <div style={{ font: "600 2.125rem/.98 var(--font-heading)" }}>{member.full_name}</div>
                  <div style={{ fontSize: "0.84375rem", color: "var(--color-neutral-600)", marginTop: "0.25rem" }}>
                    {formatAge(member.dob)} · {member.relationship ?? member.role.replace("_", " ")}
                  </div>
                  <Tag variant={member.is_organiser ? "accent" : "neutral"} className="mt-2 inline-flex">
                    {member.is_organiser ? "ORGANIZER" : member.status.toUpperCase()}
                  </Tag>
                </div>
              </div>

              {me.is_organiser && (
                <>
                  <div style={{ fontSize: "0.8125rem", color: "var(--color-neutral-700)", marginBottom: "0.375rem" }}>Relationship</div>
                  <RelationshipEditor memberId={member.id} relationship={member.relationship} />
                </>
              )}

              {/* Role sits with the other details rather than on the family
                  list, where a standing button for a once-per-person decision
                  was clutter. Offered on exactly the rows the database will
                  accept it for: not yourself, and not a managed profile, whose
                  privileges a trigger refuses to change at all. */}
              {me.is_organiser && member.id !== me.id && member.auth_user_id !== null && (
                <>
                  <div style={{ fontSize: "0.8125rem", color: "var(--color-neutral-700)", marginBottom: "0.375rem" }}>Role</div>
                  <RoleEditor memberId={member.id} fullName={member.full_name} role={member.role} />
                  <ConvertToChild memberId={member.id} fullName={member.full_name} />
                </>
              )}

              <ProfileEditForm
                dateFormat={dateFormat}
                memberId={member.id}
                isSelf={false}
                canEdit={me.is_organiser || (isGrownUp(me.role) && member.status === "managed")}
                initial={memberToProfileFields(member)}
              />

              {/* Your colour is yours. The one exception is a managed
                  profile, which has nobody to choose for itself -- the same
                  rule the rest of this screen already follows. */}
              {(member.id === me.id || (isGrownUp(me.role) && member.status === "managed")) && (
                <div style={{ marginTop: "1.125rem" }}>
                  <MemberColourPicker memberId={member.id} chosen={member.color} />
                </div>
              )}
            </>
          )
        ) : (
          <div style={{ display: "flex", gap: "0.875rem", alignItems: "flex-end", marginBottom: "1.125rem" }}>
            <Avatar url={member.avatar_url} initials={initials(member.full_name)} label={member.full_name} size={64} />
            <div>
              <div style={{ font: "600 1.625rem/.98 var(--font-heading)" }}>{member.full_name}</div>
              <div style={{ fontSize: "0.84375rem", color: "var(--color-neutral-600)", marginTop: "0.25rem" }}>
                {formatAge(member.dob)} · {member.relationship ?? member.role.replace("_", " ")}
              </div>
            </div>
          </div>
        )}

        {view === "health" && (
          <>
        <Segmented items={segments} />
        <div style={{ marginTop: "1.125rem" }}>
          {seg === "schedule" && (
            <>
              {schedule.map((s) => (
                <div key={s.id} style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", padding: "0.5rem 0", borderBottom: "1px solid var(--color-divider)" }}>
                  <span style={{ fontSize: "0.875rem" }}>{s.what}</span>
                  <span style={{ fontFamily: "var(--font-numeric)", fontSize: "0.8125rem", color: "var(--color-neutral-700)" }}>
                    {s.when_date ? fmtDate(s.when_date) : "—"}
                  </span>
                  <Tag variant={s.status === "due" ? "accent" : "neutral"}>{s.status.replace("_", " ").toUpperCase()}</Tag>
                </div>
              ))}
              <div className="kin-eyebrow" style={{ margin: "20px 0 6px" }}>
                APPOINTMENTS
              </div>
              {appointments.map((a) => (
                <div key={a.id} style={{ padding: "0.6875rem 0", borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)" }}>
                  <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ font: "400 0.8125rem/1.4 var(--font-numeric)", color: "var(--color-accent-700)", width: 140, flex: "none" }}>
                      {familyDateTime(new Date(a.when_at))}
                    </span>
                    <span style={{ flex: 1, fontSize: "0.8125rem", minWidth: "7.5rem" }}>{a.what}</span>
                    <LogSpendControl
                      accounts={payableAccounts}
                      currency={me.families.currency}
                      particulars={`${a.what} · ${member.full_name.split(" ")[0]}`}
                      category="Health"
                      sourceTable="health_appointments"
                      sourceId={a.id}
                      suggested={a.cost ? Number(a.cost) : undefined}
                      label="Log cost"
                    />
                  </div>
                </div>
              ))}
              {schedule.length === 0 && appointments.length === 0 && <EmptyNote text="No check-ups or appointments scheduled. Adding one puts it in the Planner and on Today when it comes due." />}
            </>
          )}

          {seg === "conditions" &&
            (conditions.length === 0 ? (
              <EmptyNote text="Nothing logged. Allergies, medication and long-running conditions go here so anyone in the family can find them quickly." />
            ) : (
              conditions.map((c) => (
                <Blueprint key={c.id} style={{ padding: "0.8125rem", marginBottom: "0.75rem" }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem" }}>
                    <span style={{ font: "600 1.125rem/1.05 var(--font-heading)" }}>{c.name}</span>
                    <Tag variant={c.status === "active" ? "accent" : c.status === "standing" ? "outline" : "neutral"} className="ml-auto">
                      {c.status.toUpperCase()}
                    </Tag>
                    <ConditionDeleteButton conditionId={c.id} memberId={member.id} />
                  </div>
                  <div style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)", margin: "4px 0 9px" }}>{c.meta_note}</div>
                  {(c.health_condition_entries ?? [])
                    .sort((a, b) => b.entry_date.localeCompare(a.entry_date))
                    .map((e) => (
                      <div key={e.id} style={{ padding: "0.5rem 0", borderTop: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)" }}>
                        <div style={{ display: "flex", gap: "0.625rem" }}>
                          <span style={{ font: "400 0.65625rem/1.5 var(--font-numeric)", color: "var(--color-accent-700)", width: 74, flex: "none" }}>
                            {fmtDate(e.entry_date)}
                          </span>
                          <span style={{ flex: 1, fontSize: "0.875rem" }}>{e.note}</span>
                        </div>
                        <ConditionEntryControls entryId={e.id} memberId={member.id} date={e.entry_date} note={e.note} />
                      </div>
                    ))}
                </Blueprint>
              ))
            ))}

          {seg === "labs" &&
            (labs.length === 0 ? (
              <EmptyNote text="No results yet. Logging them here keeps a history you can show a doctor without hunting through paperwork." />
            ) : (
              labs.map((l) => (
                <div key={l.id} style={{ padding: "0.75rem 0", borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)" }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem" }}>
                    <span style={{ font: "600 1rem/1.1 var(--font-heading)" }}>{l.name}</span>
                    <Tag variant={l.flag === "NORMAL" ? "neutral" : "accent"} className="ml-auto">
                      {l.flag}
                    </Tag>
                  </div>
                  <div style={{ display: "flex", gap: "0.625rem", alignItems: "baseline", marginTop: "0.3125rem" }}>
                    <span style={{ font: "400 0.65625rem/1.5 var(--font-numeric)", color: "var(--color-neutral-600)", width: 74, flex: "none" }}>
                      {fmtDate(l.test_date)}
                    </span>
                    <span style={{ flex: 1, fontSize: "0.84375rem", color: "var(--color-neutral-800)" }}>{l.result}</span>
                  </div>
                  <LabControls labId={l.id} memberId={member.id} date={l.test_date} name={l.name} result={l.result ?? ""} />
                </div>
              ))
            ))}

          {seg === "vitals" && (
            <>
              <Blueprint className={omron?.connected ? "bg-[var(--color-accent-100)]" : ""} style={{ padding: "0.8125rem", marginBottom: "0.875rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
                  <Icon name="activity" size={17} className="text-[var(--color-accent-700)]" />
                  <span style={{ font: "600 1rem/1.05 var(--font-heading)", flex: 1 }}>Omron Connect</span>
                  <Tag variant={omron?.connected ? "accent" : "outline"}>{omron?.connected ? "LINKED" : "NOT LINKED"}</Tag>
                </div>
                <div style={{ fontSize: "0.8125rem", color: "var(--color-neutral-700)", margin: "8px 0 10px" }}>
                  {omron?.connected
                    ? `Last sync ${omron.last_synced_at ? familyDateTime(new Date(omron.last_synced_at)) : "just now"}. Readings arrive automatically.`
                    : "Link the Omron Connect app to pull blood pressure and weight readings straight into this record."}
                </div>
                <OmronToggle memberId={member.id} connected={!!omron?.connected} />
              </Blueprint>

              <BarChart title={isChild ? "LENGTH HISTORY" : "BLOOD PRESSURE HISTORY"} series={topSeries} unit={isChild ? "cm" : "mmHg"} />
              <BarChart title="WEIGHT HISTORY" series={weightSeries} unit="kg" />
              {stepsSeries.length > 0 && <BarChart title="STEPS · APPLE HEALTH" series={stepsSeries} unit="steps" />}
              {heartSeries.length > 0 && <BarChart title="RESTING HEART RATE · APPLE HEALTH" series={heartSeries} unit="bpm" />}
              {sleepSeries.length > 0 && <BarChart title="SLEEP · APPLE HEALTH" series={sleepSeries} unit="hours" />}
            </>
          )}
        </div>

        <Link
          href={`/family/members/${id}/health/new`}
          className="btn btn-primary btn-block"
          style={{ minHeight: "2.875rem", fontSize: "0.875rem", letterSpacing: ".04em", marginTop: "1.25rem" }}
        >
          + NEW HEALTH ENTRY
        </Link>
          </>
        )}

        {view === "profile" && me.is_organiser && !member.is_organiser && member.status !== "removed" && (
          <RemoveMemberButton memberId={member.id} fullName={member.full_name} variant="block" />
        )}
      </div>
    </div>
  );
}

function EmptyNote({ text }: { text: string }) {
  return <div style={{ fontSize: "0.84375rem", color: "var(--color-neutral-600)" }}>{text}</div>;
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
        <div className="kin-eyebrow" style={{ marginBottom: "0.5rem" }}>{title}</div>
        <EmptyNote text="No readings yet — once there are a few, they chart here." />
      </>
    );
  }
  const latest = series[series.length - 1];
  return (
    <>
      <div className="kin-eyebrow" style={{ marginBottom: "0.5rem" }}>{title}</div>
      <Blueprint style={{ padding: "0.8125rem", marginBottom: "1rem" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem", marginBottom: "0.75rem" }}>
          <span style={{ font: "600 1.875rem/1 var(--font-heading)" }}>
            {latest.value} {unit}
          </span>
        </div>
        <div style={{ display: "flex", gap: "0.3125rem", alignItems: "flex-end", height: 88 }}>
          {series.map((b, i) => (
            <div key={i} style={{ flex: 1, height: `${b.heightPct}%`, border: "1px solid var(--color-accent)", background: "var(--color-accent-400)" }} />
          ))}
        </div>
        <div style={{ display: "flex", gap: "0.3125rem", marginTop: "0.3125rem" }}>
          {series.map((b, i) => (
            <span key={i} style={{ flex: 1, textAlign: "center", font: "400 0.5rem/1 var(--font-numeric)", color: "var(--color-neutral-600)" }}>
              {b.label}
            </span>
          ))}
        </div>
      </Blueprint>
    </>
  );
}
