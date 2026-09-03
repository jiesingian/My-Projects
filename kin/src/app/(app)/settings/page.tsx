import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentMember } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { signOutAction } from "@/lib/actions/auth";
import { DetailHeader } from "@/components/hub-header";
import { Blueprint, Tag } from "@/components/ui";
import { Icon } from "@/components/icons";
import {
  ThemeControl,
  TextSizeControl,
  NotificationToggles,
  InviteCodeCard,
  HouseholdNameForm,
  HouseholdPrefsForm,
  DriveConnectedPanel,
  CalendarConnectedPanel,
} from "@/components/settings-controls";
import { DeleteHouseholdButton } from "@/components/delete-household-button";
import { DeleteAccountButton } from "@/components/delete-account-button";
import { Avatar } from "@/components/avatar";
import { TransferOrganizerRole } from "@/components/transfer-organizer-role";
import { initials } from "@/lib/format";

const DRIVE_ERROR_MESSAGES: Record<string, string> = {
  not_configured: "Google Drive linking isn't configured on this server yet — set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
  invalid_state: "That connection attempt expired — try again.",
  token_exchange_failed: "Google didn't accept that connection attempt — try again.",
  organizer_only: "Only the household organizer can connect or disconnect Google Drive.",
};

const CALENDAR_ERROR_MESSAGES: Record<string, string> = {
  not_configured: "Google Calendar linking isn't configured on this server yet — set GOOGLE_CALENDAR_REDIRECT_URI.",
  invalid_state: "That connection attempt expired — try again.",
  token_exchange_failed: "Google didn't accept that connection attempt — try again.",
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ drive_error?: string; calendar_error?: string }>;
}) {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const { drive_error, calendar_error } = await searchParams;

  const supabase = await createClient();
  const [
    { data: authUser },
    { data: driveLink },
    { data: calendarLink },
    { data: otherCalendarLinks },
    { count: memberCount },
    { count: managedCount },
    { data: transferCandidates },
    { count: otherActiveCount },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("drive_links").select("*, connected_by:connected_by_member_id(full_name)").eq("family_id", me.family_id).maybeSingle(),
    supabase.from("calendar_links").select("*").eq("member_id", me.id).maybeSingle(),
    supabase.from("calendar_links").select("connected, members(full_name)").eq("family_id", me.family_id).eq("connected", true).neq("member_id", me.id),
    supabase.from("members").select("id", { count: "exact", head: true }).eq("family_id", me.family_id),
    supabase.from("members").select("id", { count: "exact", head: true }).eq("family_id", me.family_id).eq("status", "managed"),
    supabase
      .from("members")
      .select("id, full_name")
      .eq("family_id", me.family_id)
      .eq("status", "active")
      .in("role", ["parent", "adult"])
      .neq("id", me.id),
    supabase
      .from("members")
      .select("id", { count: "exact", head: true })
      .eq("family_id", me.family_id)
      .in("status", ["active", "managed"])
      .neq("id", me.id),
  ]);
  const connectedByName = (driveLink?.connected_by as unknown as { full_name: string } | null)?.full_name ?? null;
  const otherConnectedNames = (otherCalendarLinks ?? [])
    .map((l) => (l.members as unknown as { full_name: string } | null)?.full_name)
    .filter((v): v is string => !!v);

  return (
    <div>
      <DetailHeader backHref="/today" eyebrow="SETTINGS" />
      <div style={{ padding: "0 22px 22px" }}>
        <Link href={`/family/members/${me.id}`} style={{ textDecoration: "none", color: "inherit" }}>
          <Blueprint style={{ padding: 14, display: "flex", gap: 13, alignItems: "center", marginBottom: 22 }}>
            <Avatar url={me.avatar_url} initials={initials(me.full_name)} size={48} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ font: "600 20px/1.05 var(--font-heading)", display: "block" }}>{me.full_name}</span>
              <span style={{ fontSize: 11.5, color: "var(--color-neutral-600)" }}>
                {authUser.user?.email} · {authUser.user?.email_confirmed_at ? "verified" : "unverified"}
              </span>
              <span style={{ fontSize: 11, color: "var(--color-accent-700)", textDecoration: "underline" }}>Edit profile</span>
            </span>
            {me.is_organiser && <Tag variant="accent">ORGANIZER</Tag>}
          </Blueprint>
        </Link>

        <div style={{ font: "600 10px/1 var(--font-heading)", letterSpacing: ".16em", color: "var(--color-neutral-600)", marginBottom: 4 }}>
          CONNECTED SERVICES
        </div>
        <Blueprint style={{ padding: 14, marginBottom: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <Icon name="hardDrive" size={18} className="text-[var(--color-accent-700)]" />
            <span style={{ font: "600 18px/1.05 var(--font-heading)", flex: 1 }}>Google Drive</span>
            <Tag variant={driveLink?.connected ? "accent" : "outline"}>{driveLink?.connected ? "CONNECTED" : "NOT CONNECTED"}</Tag>
          </div>
          {drive_error && (
            <p style={{ fontSize: 12, color: "var(--color-accent-700)", marginBottom: 10 }}>{DRIVE_ERROR_MESSAGES[drive_error] ?? "Something went wrong."}</p>
          )}
          {driveLink?.connected ? (
            <DriveConnectedPanel
              email={driveLink.account_email}
              rootFolderLink={driveLink.root_folder_link}
              lastSyncedAt={driveLink.last_synced_at}
              connectedByName={connectedByName}
              canManage={me.is_organiser}
            />
          ) : me.is_organiser ? (
            <>
              <p style={{ fontSize: 12, color: "var(--color-neutral-700)", marginBottom: 12 }}>
                Connect your Google Drive once, as organizer — Kin creates and organizes the household&apos;s folders
                there automatically. Everyone else views files through the app or the Drive link, governed by
                whatever sharing you set on that folder in Drive itself.
              </p>
              <a href="/api/drive/connect" className="btn btn-primary btn-block" style={{ minHeight: 44, fontSize: 13.5, letterSpacing: ".04em" }}>
                CONNECT GOOGLE DRIVE
              </a>
            </>
          ) : (
            <p style={{ fontSize: 12, color: "var(--color-neutral-700)" }}>
              Not connected yet. Only the household organizer can connect Google Drive.
            </p>
          )}
        </Blueprint>

        <Blueprint style={{ padding: 14, marginBottom: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <Icon name="calendarDays" size={18} className="text-[var(--color-accent-700)]" />
            <span style={{ font: "600 18px/1.05 var(--font-heading)", flex: 1 }}>My Google Calendar</span>
            <Tag variant={calendarLink?.connected ? "accent" : "outline"}>{calendarLink?.connected ? "CONNECTED" : "NOT CONNECTED"}</Tag>
          </div>
          {calendar_error && (
            <p style={{ fontSize: 12, color: "var(--color-accent-700)", marginBottom: 10 }}>{CALENDAR_ERROR_MESSAGES[calendar_error] ?? "Something went wrong."}</p>
          )}
          {calendarLink?.connected ? (
            <CalendarConnectedPanel email={calendarLink.account_email} lastSyncedAt={calendarLink.last_synced_at} />
          ) : (
            <>
              <p style={{ fontSize: 12, color: "var(--color-neutral-700)", marginBottom: 12 }}>
                Everyone connects their own Google Calendar. Activities and events tagged to you (or the whole
                family), plus your health appointments and document renewals, sync to your calendar — and anything
                you add or change there syncs back into Kin.
              </p>
              <a href="/api/calendar/connect" className="btn btn-primary btn-block" style={{ minHeight: 44, fontSize: 13.5, letterSpacing: ".04em" }}>
                CONNECT MY GOOGLE CALENDAR
              </a>
            </>
          )}
          {otherConnectedNames.length > 0 && (
            <div style={{ fontSize: 11, color: "var(--color-neutral-600)", marginTop: 10 }}>
              Also connected: {otherConnectedNames.join(", ")}
            </div>
          )}
        </Blueprint>

        <div style={{ font: "600 10px/1 var(--font-heading)", letterSpacing: ".16em", color: "var(--color-neutral-600)", marginBottom: 8 }}>APPEARANCE</div>
        <div style={{ fontSize: 11.5, color: "var(--color-neutral-700)", marginBottom: 6 }}>Theme</div>
        <ThemeControl current={me.theme} />
        <div style={{ fontSize: 11.5, color: "var(--color-neutral-700)", marginBottom: 6 }}>Text size</div>
        <TextSizeControl current={me.text_size} />

        <div style={{ font: "600 10px/1 var(--font-heading)", letterSpacing: ".16em", color: "var(--color-neutral-600)", marginBottom: 2 }}>NOTIFICATIONS</div>
        <NotificationToggles prefs={me.notification_prefs as Record<string, boolean>} />

        <div style={{ font: "600 10px/1 var(--font-heading)", letterSpacing: ".16em", color: "var(--color-neutral-600)", margin: "22px 0 8px" }}>HOUSEHOLD</div>
        <div style={{ fontSize: 11.5, color: "var(--color-neutral-700)", marginBottom: 6 }}>Household name</div>
        {me.is_organiser ? (
          <HouseholdNameForm familyId={me.family_id} name={me.families.name} />
        ) : (
          <div style={{ padding: "10px 0", marginBottom: 14, fontSize: 15 }}>{me.families.name}</div>
        )}
        <div style={{ fontSize: 11.5, color: "var(--color-neutral-700)", marginBottom: 6 }}>
          Members · {memberCount ?? 0} · {managedCount ?? 0} managed profiles
        </div>
        <Link href="/family?seg=profile" className="btn btn-secondary btn-block" style={{ minHeight: 40, fontSize: 12, marginBottom: 14 }}>
          VIEW MEMBERS
        </Link>
        {me.is_organiser && (
          <>
            <div style={{ fontSize: 11.5, color: "var(--color-neutral-700)", marginBottom: 6 }}>Invite code</div>
            <div style={{ marginBottom: 14 }}>
              <InviteCodeCard code={me.families.invite_code} />
            </div>
            <div style={{ fontSize: 11.5, color: "var(--color-neutral-700)", marginBottom: 6 }}>Transfer organizer role</div>
            <div style={{ marginBottom: 14 }}>
              <TransferOrganizerRole candidates={transferCandidates ?? []} />
            </div>
          </>
        )}
        <div style={{ fontSize: 11.5, color: "var(--color-neutral-700)", marginBottom: 6 }}>Currency, dates and week start</div>
        {me.is_organiser ? (
          <HouseholdPrefsForm familyId={me.family_id} currency={me.families.currency} dateFormat={me.families.date_format} weekStart={me.families.week_start} />
        ) : (
          <div style={{ padding: "10px 0", marginBottom: 20, fontSize: 13 }}>
            {me.families.currency} · {me.families.date_format} · {me.families.week_start === "monday" ? "Mon start" : "Sun start"}
          </div>
        )}

        {me.is_organiser && (
          <>
            <div style={{ font: "600 10px/1 var(--font-heading)", letterSpacing: ".16em", color: "var(--color-accent-700)", margin: "8px 0 8px" }}>
              DANGER ZONE
            </div>
            <div style={{ marginBottom: 20 }}>
              <DeleteHouseholdButton householdName={me.families.name} />
            </div>
          </>
        )}

        <div style={{ font: "600 10px/1 var(--font-heading)", letterSpacing: ".16em", color: "var(--color-neutral-600)", margin: "8px 0 2px" }}>ACCOUNT</div>
        <div style={{ padding: "13px 0", borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)", fontSize: 14 }}>
          {authUser.user?.email}
        </div>
        <form action={signOutAction}>
          <button type="submit" className="btn btn-secondary btn-block" style={{ minHeight: 46, fontSize: 13.5, letterSpacing: ".04em", marginTop: 20 }}>
            SIGN OUT
          </button>
        </form>
        <div style={{ marginTop: 12 }}>
          <DeleteAccountButton isSoleMember={(otherActiveCount ?? 0) === 0} />
        </div>
        <div style={{ font: "400 10px/1.6 ui-monospace, Menlo, monospace", color: "var(--color-neutral-500)", textAlign: "center", marginTop: 14 }}>
          KIN 1.0.0
        </div>
      </div>
    </div>
  );
}
