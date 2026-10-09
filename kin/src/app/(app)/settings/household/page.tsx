import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentMember } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { DetailHeader } from "@/components/hub-header";
import { InviteCodeCard, HouseholdNameForm, HouseholdPrefsForm, ShareWithRelativesSwitch } from "@/components/settings-controls";
import { DeleteHouseholdButton } from "@/components/delete-household-button";
import { TransferOrganizerRole } from "@/components/transfer-organizer-role";
import { countryLabel } from "@/lib/countries";
import { TIME_ZONES } from "@/lib/household-prefs";
import { keepKidViewOut } from "@/lib/kid-view";
import { isGrownUp } from "@/lib/roles";
import { SpecialDays } from "@/components/special-days";
import { getHouseholdSpecialDays } from "@/lib/queries/special-days";

/** The household's name, members, invite code, organizer role, currency and
 * calendar preferences, and -- last, for the organizer -- deleting it. The
 * Household group and the danger zone of the old single Settings page. */
export default async function HouseholdSettingsPage() {
  await keepKidViewOut();
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");

  const supabase = await createClient();
  const [{ count: memberCount }, { count: managedCount }, { data: transferCandidates }] = await Promise.all([
    supabase.from("members").select("id", { count: "exact", head: true }).eq("family_id", me.family_id),
    supabase.from("members").select("id", { count: "exact", head: true }).eq("family_id", me.family_id).eq("status", "managed"),
    supabase
      .from("members")
      .select("id, full_name")
      .eq("family_id", me.family_id)
      .eq("status", "active")
      .in("role", ["parent", "adult"])
      .neq("id", me.id),
  ]);

  // The household's own special days from today on, for a grown-up to add to
  // or tidy (20260930171000). Past ones stay on the Planner where they fell.
  const today = new Date().toLocaleDateString("en-CA", { timeZone: me.families.time_zone });
  const specialDays = isGrownUp(me.role) ? await getHouseholdSpecialDays(me.family_id, today, "9999-12-31") : [];

  return (
    <div>
      <DetailHeader backHref="/settings" eyebrow="Household" />
      <div style={{ padding: "0 var(--gutter) 1.375rem" }}>
        <div style={{ fontSize: "0.8125rem", color: "var(--color-neutral-700)", marginBottom: "0.375rem" }}>Household name</div>
        {me.is_organiser ? (
          <HouseholdNameForm name={me.families.name} />
        ) : (
          <div style={{ padding: "0.625rem 0", marginBottom: "0.875rem", fontSize: "0.9375rem" }}>{me.families.name}</div>
        )}
        <div style={{ fontSize: "0.8125rem", color: "var(--color-neutral-700)", marginBottom: "0.375rem" }}>
          Members · {memberCount ?? 0} · {managedCount ?? 0} managed profiles
        </div>
        <Link href="/family?seg=profile" className="btn btn-secondary btn-block" style={{ minHeight: "2.5rem", fontSize: "0.84375rem", marginBottom: "0.875rem" }}>
          View members
        </Link>
        {me.is_organiser && (
          <>
            <div style={{ fontSize: "0.8125rem", color: "var(--color-neutral-700)", marginBottom: "0.375rem" }}>Invite code</div>
            <div style={{ marginBottom: "0.875rem" }}>
              <InviteCodeCard code={me.families.invite_code} />
            </div>
            <div style={{ fontSize: "0.8125rem", color: "var(--color-neutral-700)", marginBottom: "0.375rem" }}>Transfer organizer role</div>
            <div style={{ marginBottom: "0.875rem" }}>
              <TransferOrganizerRole candidates={transferCandidates ?? []} />
            </div>
          </>
        )}
        <div style={{ fontSize: "0.8125rem", color: "var(--color-neutral-700)", marginBottom: "0.375rem" }}>Linked relatives</div>
        <ShareWithRelativesSwitch on={me.families.share_with_relatives} canChange={me.is_organiser} />
        <div style={{ fontSize: "0.8125rem", color: "var(--color-neutral-700)", marginBottom: "0.375rem" }}>Currency, dates, week start and country</div>
        {me.is_organiser ? (
          <HouseholdPrefsForm currency={me.families.currency} dateFormat={me.families.date_format} weekStart={me.families.week_start} country={me.families.country} timeZone={me.families.time_zone} />
        ) : (
          <div style={{ padding: "0.625rem 0", marginBottom: "1.25rem", fontSize: "0.8125rem" }}>
            {me.families.currency} · {me.families.date_format} · {me.families.week_start === "monday" ? "Mon start" : "Sun start"}
            {me.families.country ? ` · ${countryLabel(me.families.country)}` : ""}
            {` · ${TIME_ZONES.find((tz) => tz.value === me.families.time_zone)?.label ?? me.families.time_zone}`}
          </div>
        )}

        {isGrownUp(me.role) && (
          <div style={{ marginBottom: "1.25rem" }}>
            <div style={{ fontSize: "0.8125rem", color: "var(--color-neutral-700)", marginBottom: "0.375rem" }}>Special days</div>
            <p style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)", margin: "0 0 0.5rem" }}>
              Public holidays are already on the Planner. Add a day off they don&apos;t know yet: a late proclamation, the town fiesta.
            </p>
            <SpecialDays days={specialDays} />
          </div>
        )}

        <div style={{ fontSize: "0.8125rem", color: "var(--color-neutral-700)", marginBottom: "0.375rem" }}>Your own household</div>
        <Link href="/settings/household/move" className="btn btn-secondary btn-block" style={{ minHeight: "2.5rem", fontSize: "0.84375rem", marginBottom: "1.25rem" }}>
          Start your own, or move to another
        </Link>

        {me.is_organiser && (
          <>
            <div style={{ font: "600 0.8125rem/1 var(--font-heading)", letterSpacing: ".02em", color: "var(--color-accent-700)", margin: "8px 0 8px" }}>DANGER ZONE</div>
            <DeleteHouseholdButton householdName={me.families.name} />
          </>
        )}
      </div>
    </div>
  );
}
