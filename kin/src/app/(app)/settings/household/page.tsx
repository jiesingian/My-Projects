import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentMember } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { DetailHeader } from "@/components/hub-header";
import { InviteCodeCard, HouseholdNameForm, HouseholdPrefsForm, ShareWithRelativesSwitch } from "@/components/settings-controls";
import { DeleteHouseholdButton } from "@/components/delete-household-button";
import { TransferOrganizerRole } from "@/components/transfer-organizer-role";
import { countryLabel } from "@/lib/countries";
import { keepKidViewOut } from "@/lib/kid-view";

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

  return (
    <div>
      <DetailHeader backHref="/settings" eyebrow="Household" />
      <div style={{ padding: "0 1.375rem 1.375rem" }}>
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
          <HouseholdPrefsForm currency={me.families.currency} dateFormat={me.families.date_format} weekStart={me.families.week_start} country={me.families.country} />
        ) : (
          <div style={{ padding: "0.625rem 0", marginBottom: "1.25rem", fontSize: "0.8125rem" }}>
            {me.families.currency} · {me.families.date_format} · {me.families.week_start === "monday" ? "Mon start" : "Sun start"}
            {me.families.country ? ` · ${countryLabel(me.families.country)}` : ""}
          </div>
        )}

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
