import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentMember } from "@/lib/session";
import { inKidView } from "@/lib/kid-view";
import { createClient } from "@/lib/supabase/server";
import { getMemberDetail, buildBarSeries } from "@/lib/queries/health";
import { getAccounts } from "@/lib/queries/wealth";
import { LogSpendControl } from "@/components/money-actions";
import { DetailHeader } from "@/components/hub-header";
import { ChipRow } from "@/components/segmented";
import { MedicinesPanel, IllnessPanel, GrowthPanel } from "@/components/health-care";
import { ageInMonths } from "@/lib/growth";
import { familyDay, familyClock } from "@/lib/time";
import { Blueprint, Tag } from "@/components/ui";
import { Icon } from "@/components/icons";
import { formatAge, initials } from "@/lib/format";
import { MemberColourPicker } from "@/components/member-colour-picker";
import { isGrownUp, roleLabel } from "@/lib/roles";
import { OmronToggle } from "./omron-toggle";
import { ConditionEntryControls, ConditionDeleteButton, LabControls } from "@/components/health-entry-controls";
import { RelationshipEditor } from "@/components/relationship-editor";
import { RoleEditor } from "@/components/role-editor";
import { ConvertToChild } from "@/components/convert-to-child";
import { Avatar } from "@/components/avatar";
import { ProfileEditForm } from "@/components/profile-edit-form";
import { MemberProfileEditor } from "@/components/member-profile-editor";
import { ProfilePhotosButton } from "@/components/profile-photos-button";
import type { AlbumPhoto } from "@/lib/actions/profile";
import { memberToProfileFields } from "@/lib/profile-fields";
import { resolvePhotoUrl } from "@/lib/photo-url";
import { familyDate } from "@/lib/format-family";
import { familyDateTime } from "@/lib/time";
import { isGone } from "@/lib/member-status";
import { Segmented } from "@/components/segmented";
import { getPersonMoments } from "@/lib/queries/journal";
import { memberColourVar } from "@/lib/member-colours";
import { PersonActions, ProfileMoreMenu, CoverPicker } from "@/components/person-profile";

const SEGMENTS = ["schedule", "medicines", "illness", "conditions", "labs", "vitals"] as const;
type Seg = (typeof SEGMENTS)[number];

export default async function MemberDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ seg?: string; view?: string; from?: string; tab?: string }>;
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

  const { member, schedule, appointments, conditions, labs, vitals, omron, medicines, doses, illness, photoCount } = await getMemberDetail(id, me.family_id);
  if (!member) redirect("/family?seg=profile");
  const isSelf = me.id === member.id;

  // Reachable from two different hubs, not one: the Family list links here
  // (the ordinary path), but Settings also links straight to your own
  // profile -- so "back" alone no longer says where you'd land, the same
  // gap `docs/PAGE_PATTERNS.md` names for the other two nested routes.
  // `from` only ever means Settings (nothing else links here that way), so
  // Family stays the default for everybody arriving the ordinary route.
  // And from the family tree (Jonathan, 28 September): back goes to the tree.
  const cameFromSettings = isSelf && sp.from === "settings";
  const cameFromTree = sp.from === "tree";
  const familyHref = cameFromTree ? "/family?seg=tree" : view === "health" ? "/family?seg=health" : "/family?seg=profile";
  const backHref = cameFromSettings ? "/settings" : familyHref;
  const trail = cameFromSettings
    ? [{ label: "Settings", href: "/settings" }, { label: member.full_name }]
    : [{ label: cameFromTree ? "Tree" : "Family", href: familyHref }, { label: member.full_name }];
  const tab: "moments" | "about" = sp.tab === "about" ? "about" : "moments";
  const from = cameFromSettings ? "&from=settings" : cameFromTree ? "&from=tree" : "";

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

  const coverUrl = photos.find((p) => p.id === member.cover_avatar_id)?.url ?? null;
  const grownUpView = isGrownUp(me.role) && !inKidView(me);
  const moreLinks = [
    ...(grownUpView ? [{ label: "Health records", href: `/family/members/${member.id}?view=health`, icon: "activity" as const }] : []),
    ...(grownUpView ? [{ label: "Emergency card", href: `/family/members/${member.id}/emergency`, icon: "shieldCheck" as const }] : []),
    ...(cameFromTree ? [] : [{ label: "Show in the family tree", href: "/family?seg=tree", icon: "users" as const }]),
  ];
  // Remove used to sit in red on every row of the Family list; it lives here now.
  const canRemove = me.is_organiser && !isSelf && !member.is_organiser && !isGone(member.status);

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
      <div style={{ padding: "0 var(--gutter) 1.375rem" }}>
        {view === "profile" ? (
          <>
            <div className="kin-profile-hero">
              <div className="kin-profile-cover" style={{ ["--member" as string]: memberColourVar(member.id, member.color) }}>
                {coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
                  <img src={coverUrl} alt="" />
                ) : member.avatar_url ? (
                  // Their colour, with their own photo washed across it.
                  // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
                  <img src={member.avatar_url} alt="" className="kin-profile-wash" />
                ) : null}
                {isSelf && <CoverPicker photos={photos} current={member.cover_avatar_id} />}
              </div>
              {/* On the hero, not inside the cover: the cover clips to its
                  rounded corners, and the menu has to be able to leave it. */}
              <ProfileMoreMenu memberId={member.id} fullName={member.full_name} links={moreLinks} canRemove={canRemove} />
              <div className="kin-profile-id">
                <div className="kin-profile-photo">
                  <ProfilePhotosButton photos={photos} url={member.avatar_url} initials={initials(member.full_name)} label={member.full_name} size={96} />
                </div>
                <h1 className="kin-profile-name">{member.full_name}</h1>
                <div className="kin-profile-meta">
                  {[member.dob ? formatAge(member.dob) : null, member.relationship ?? roleLabel(member.role)].filter(Boolean).join(" · ")}
                  {member.is_organiser && (
                    <Tag variant="accent" className="ml-2 inline-flex">
                      ORGANIZER
                    </Tag>
                  )}
                </div>
              </div>
              {isSelf ? (
                tab === "moments" && (
                  <div className="kin-profile-actions">
                    <Link href={`/family/members/${member.id}?tab=about${from}`} className="btn btn-secondary">
                      Edit profile
                    </Link>
                  </div>
                )
              ) : (
                !isGone(member.status) && (
                  <PersonActions
                    memberId={member.id}
                    firstName={member.full_name.split(" ")[0]}
                    callable={member.status === "active" && member.auth_user_id !== null}
                    mobile={member.mobile}
                  />
                )
              )}
            </div>
            <Segmented
              items={[
                { label: "Moments", href: `/family/members/${member.id}?tab=moments${from}`, active: tab === "moments" },
                { label: "About", href: `/family/members/${member.id}?tab=about${from}`, active: tab === "about" },
              ]}
            />
            <div style={{ marginTop: "1.125rem" }}>
              {tab === "moments" ? (
                <MomentsPane memberId={member.id} familyId={me.family_id} firstName={member.full_name.split(" ")[0]} isSelf={isSelf} fmtDate={fmtDate} />
              ) : isSelf ? (
            <MemberProfileEditor
              dateFormat={dateFormat}
              fullName={member.full_name}
              ageLabel={`${formatAge(member.dob)} · ${member.relationship ?? roleLabel(member.role)}`}
              statusLabel={member.is_organiser ? "ORGANIZER" : member.status.toUpperCase()}
              statusVariant={member.is_organiser ? "accent" : "neutral"}
              avatarUrl={member.avatar_url}
              initials={initials(member.full_name)}
              photos={photos}
              initial={memberToProfileFields(member)}
              compact
            />
              ) : (
                <>
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
                  {/* Parent or adult is the one choice the editor offers. A
                      child with their own login showed there as "Adult", and
                      Edit then Save would have made a 10-year-old one
                      (review, 28 September): a child's role is shown, not
                      edited, here. */}
                  {isGrownUp(member.role) ? (
                    <RoleEditor memberId={member.id} fullName={member.full_name} role={member.role} />
                  ) : (
                    <div style={{ fontSize: "0.875rem", marginBottom: "1.25rem" }}>{roleLabel(member.role).replace(/^child/, "Child")}</div>
                  )}
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
              )}
            </div>
          </>
        ) : (
          <div style={{ display: "flex", gap: "0.875rem", alignItems: "flex-end", marginBottom: "1.125rem" }}>
            <Avatar url={member.avatar_url} initials={initials(member.full_name)} label={member.full_name} size={64} />
            <div>
              <div style={{ font: "600 1.625rem/.98 var(--font-heading)" }}>{member.full_name}</div>
              <div style={{ fontSize: "0.84375rem", color: "var(--color-neutral-600)", marginTop: "0.25rem" }}>
                {formatAge(member.dob)} · {member.relationship ?? roleLabel(member.role)}
              </div>
            </div>
          </div>
        )}

        {view === "health" && (
          <>
        <Link href={`/family/members/${member.id}/emergency`} className="btn btn-secondary btn-block kin-care-sos">
          <Icon name="shieldCheck" size="1rem" /> Emergency card
        </Link>
        <ChipRow items={segments} />
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
                    <span style={{ flex: 1, fontSize: "0.8125rem", minWidth: "7.5rem" }}>
                      {a.what}
                      <Link href={`/family/members/${member.id}/visit/${a.id}`} className="kin-care-visitlink">
                        {a.notes || photoCount.get(a.id) ? `Notes${photoCount.get(a.id) ? ` · ${photoCount.get(a.id)} photo${photoCount.get(a.id) === 1 ? "" : "s"}` : ""}` : "Add notes & photos"}
                      </Link>
                    </span>
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

          {seg === "medicines" && (
            <MedicinesPanel
              memberId={member.id}
              firstName={member.full_name.split(" ")[0]}
              medicines={medicines}
              doses={doses}
              today={familyDay()}
              now={familyClock(new Date())}
              role={me.role}
            />
          )}

          {seg === "illness" && (
            <IllnessPanel
              memberId={member.id}
              firstName={member.full_name.split(" ")[0]}
              logs={illness.map((l) => ({ ...l, when: familyDateTime(new Date(l.logged_at)) }))}
              role={me.role}
            />
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
              {/* The WHO standard covers birth to five. */}
              {member.dob && ageInMonths(member.dob, familyDay()) <= 60 && (
                <GrowthPanel
                  memberId={member.id}
                  firstName={member.full_name.split(" ")[0]}
                  dob={member.dob}
                  sex={member.sex === "female" || member.sex === "male" ? member.sex : null}
                  weights={weightPoints.map((v) => ({ date: v.reading_date, value: parseFloat(v.value_text) })).filter((p) => p.value > 0)}
                  lengths={lengthPoints.map((v) => ({ date: v.reading_date, value: parseFloat(v.value_text) })).filter((p) => p.value > 0)}
                />
              )}
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

/** A person's recent moments and milestones -- the front of their profile,
 * the way Facebook and Instagram open on what someone has been up to rather
 * than on their shoe size. Household journal entries only: a personal entry
 * is its owner's, and never shows here even to them. */
async function MomentsPane({
  memberId,
  familyId,
  firstName,
  isSelf,
  fmtDate,
}: {
  memberId: string;
  familyId: string;
  firstName: string;
  isSelf: boolean;
  fmtDate: (iso: string) => string;
}) {
  const { milestones, moments } = await getPersonMoments(familyId, memberId);
  if (milestones.length === 0 && moments.length === 0) {
    return (
      <Blueprint style={{ padding: "1rem" }}>
        <p style={{ fontSize: "0.875rem", lineHeight: 1.5, margin: "0 0 0.75rem" }}>
          {isSelf ? "Nothing here yet. Journal entries you write or are in show up here." : `Nothing here yet. When ${firstName} is in a journal entry, it shows up here.`}
        </p>
        <Link href="/journal/new" className="btn btn-secondary btn-block">
          Add a moment
        </Link>
      </Blueprint>
    );
  }
  return (
    <>
      {milestones.length > 0 && (
        <>
          <div className="kin-eyebrow" style={{ marginBottom: "0.5rem" }}>
            MILESTONES
          </div>
          <ol className="kin-profile-milestones">
            {milestones.map((m) => (
              <li key={m.id}>
                <span className="kin-profile-star" aria-hidden="true">
                  ★
                </span>
                <span className="kin-profile-milestone-title">{m.title}</span>
                <time dateTime={m.milestone_date}>{fmtDate(m.milestone_date)}</time>
              </li>
            ))}
          </ol>
        </>
      )}
      {moments.length > 0 && (
        <>
          <div className="kin-eyebrow" style={{ margin: milestones.length ? "1.375rem 0 0.5rem" : "0 0 0.5rem" }}>
            RECENT MOMENTS
          </div>
          <div className="kin-profile-moments">
            {moments.map((m) => (
              <Link key={m.id} href={`/journal/${m.id}`} className="kin-profile-moment">
                <div className="kin-profile-moment-media">
                  {m.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
                    <img src={m.photo} alt="" loading="lazy" />
                  ) : m.note ? (
                    <span>{m.note}</span>
                  ) : (
                    <Icon name="fileText" size="1.375rem" className="kin-profile-moment-icon" />
                  )}
                </div>
                <div className="kin-profile-moment-title">{m.title}</div>
                <time dateTime={m.date}>{fmtDate(m.date)}</time>
              </Link>
            ))}
          </div>
          <Link href="/journal" className="btn btn-ghost btn-block" style={{ marginTop: "0.5rem", fontSize: "0.84375rem" }}>
            All of the journal
          </Link>
        </>
      )}
    </>
  );
}
