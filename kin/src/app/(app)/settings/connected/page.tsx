import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { DetailHeader } from "@/components/hub-header";
import { Blueprint, Tag } from "@/components/ui";
import { Icon } from "@/components/icons";
import { CalendarFeedControl, DriveConnectedPanel, CalendarConnectedPanel } from "@/components/settings-controls";
import { keepKidViewOut } from "@/lib/kid-view";
import { AppleHealthControl } from "@/components/apple-health-control";

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

/** Google Drive, Google Calendar, and the Apple Calendar & Outlook link --
 * the Connected services group of the old single Settings page. Google's
 * connect routes still return to /settings, which forwards any error here. */
export default async function ConnectedSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ drive_error?: string; calendar_error?: string }>;
}) {
  await keepKidViewOut();
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const { drive_error, calendar_error } = await searchParams;

  const supabase = await createClient();
  const [{ data: driveLink }, { data: calendarLink }, { data: otherCalendarLinks }, { data: appleHealth }] = await Promise.all([
    supabase.from("drive_links").select("*, connected_by:connected_by_member_id(full_name)").eq("family_id", me.family_id).maybeSingle(),
    supabase.from("calendar_links").select("*").eq("member_id", me.id).maybeSingle(),
    supabase.from("calendar_links").select("connected, members(full_name)").eq("family_id", me.family_id).eq("connected", true).neq("member_id", me.id),
    supabase.rpc("apple_health_status"),
  ]);
  const appleHealthLink = appleHealth?.[0] ?? null;
  const connectedByName = (driveLink?.connected_by as unknown as { full_name: string } | null)?.full_name ?? null;
  const otherConnectedNames = (otherCalendarLinks ?? [])
    .map((l) => (l.members as unknown as { full_name: string } | null)?.full_name)
    .filter((v): v is string => !!v);

  return (
    <div>
      <DetailHeader backHref="/settings" eyebrow="Connected apps" />
      <div style={{ padding: "0 1.375rem 1.375rem" }}>
        <Blueprint style={{ padding: "0.875rem", marginBottom: "1.375rem" }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.375rem 0.625rem", marginBottom: "0.625rem" }}>
            <Icon name="hardDrive" size={18} className="text-[var(--color-accent-700)]" />
            <span style={{ font: "600 1.125rem/1.05 var(--font-heading)", flex: "1 1 8rem" }}>Google Drive</span>
            <Tag variant={driveLink?.connected ? "accent" : "outline"}>{driveLink?.connected ? "CONNECTED" : "NOT CONNECTED"}</Tag>
          </div>
          {drive_error && (
            <p style={{ fontSize: "0.84375rem", color: "var(--color-accent-700)", marginBottom: "0.625rem" }}>{DRIVE_ERROR_MESSAGES[drive_error] ?? "Something went wrong."}</p>
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
              <p style={{ fontSize: "0.84375rem", color: "var(--color-neutral-700)", marginBottom: "0.75rem" }}>
                Connect your Google Drive once, as organizer — Kin creates and organizes the household&apos;s folders
                there automatically. Everyone else views files through the app or the Drive link, governed by
                whatever sharing you set on that folder in Drive itself.
              </p>
              <a href="/api/drive/connect" className="btn btn-primary btn-block" style={{ minHeight: "2.75rem", fontSize: "0.84375rem", letterSpacing: ".04em" }}>
                Connect Google Drive
              </a>
            </>
          ) : (
            <p style={{ fontSize: "0.84375rem", color: "var(--color-neutral-700)" }}>
              Not connected yet. Only the household organizer can connect Google Drive.
            </p>
          )}
        </Blueprint>

        <Blueprint style={{ padding: "0.875rem", marginBottom: "1.375rem" }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.375rem 0.625rem", marginBottom: "0.625rem" }}>
            <Icon name="calendarDays" size={18} className="text-[var(--color-accent-700)]" />
            <span style={{ font: "600 1.125rem/1.05 var(--font-heading)", flex: "1 1 8rem" }}>My Google Calendar</span>
            <Tag variant={calendarLink?.connected ? "accent" : "outline"}>{calendarLink?.connected ? "CONNECTED" : "NOT CONNECTED"}</Tag>
          </div>
          {calendar_error && (
            <p style={{ fontSize: "0.84375rem", color: "var(--color-accent-700)", marginBottom: "0.625rem" }}>{CALENDAR_ERROR_MESSAGES[calendar_error] ?? "Something went wrong."}</p>
          )}
          {calendarLink?.connected ? (
            <CalendarConnectedPanel email={calendarLink.account_email} lastSyncedAt={calendarLink.last_synced_at} />
          ) : (
            <>
              <p style={{ fontSize: "0.84375rem", color: "var(--color-neutral-700)", marginBottom: "0.75rem" }}>
                Everyone connects their own Google Calendar. Activities and events tagged to you (or the whole
                family), plus your health appointments and document renewals, sync to your calendar — and anything
                you add or change there syncs back into Kin.
              </p>
              <a href="/api/calendar/connect" className="btn btn-primary btn-block" style={{ minHeight: "2.75rem", fontSize: "0.84375rem", letterSpacing: ".04em" }}>
                Connect my Google Calendar
              </a>
            </>
          )}
          {otherConnectedNames.length > 0 && (
            <div style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)", marginTop: "0.625rem" }}>
              Also connected: {otherConnectedNames.join(", ")}
            </div>
          )}
        </Blueprint>

        <Blueprint style={{ padding: "0.875rem" }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.375rem 0.625rem", marginBottom: "0.5rem" }}>
            <Icon name="calendarDays" size={18} className="text-[var(--color-accent-700)]" />
            <span style={{ font: "600 1.125rem/1.05 var(--font-heading)", flex: "1 1 8rem" }}>Apple Calendar &amp; Outlook</span>
            <Tag variant={me.calendar_feed_hash ? "accent" : "outline"}>{me.calendar_feed_hash ? "LINK ON" : "OFF"}</Tag>
          </div>
          <CalendarFeedControl hasLink={Boolean(me.calendar_feed_hash)} />
        </Blueprint>

        <Blueprint style={{ padding: "0.875rem", marginTop: "1.375rem" }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.375rem 0.625rem", marginBottom: "0.5rem" }}>
            <Icon name="activity" size={18} className="text-[var(--color-accent-700)]" />
            <span style={{ font: "600 1.125rem/1.05 var(--font-heading)", flex: "1 1 8rem" }}>Apple Health</span>
            <Tag variant={appleHealthLink ? "accent" : "outline"}>{appleHealthLink ? "CONNECTED" : "OFF"}</Tag>
          </div>
          <AppleHealthControl connected={Boolean(appleHealthLink)} lastUsedAt={appleHealthLink?.last_used_at ?? null} visibility={appleHealthLink?.visibility ?? null} role={me.role} />
        </Blueprint>
      </div>
    </div>
  );
}
