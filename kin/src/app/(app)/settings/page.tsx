import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentMember } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { getLockState } from "@/lib/security/gate";
import { DetailHeader } from "@/components/hub-header";
import { Blueprint, Tag } from "@/components/ui";
import { Icon, type IconName } from "@/components/icons";
import { Avatar } from "@/components/avatar";
import { initials } from "@/lib/format";
import { paletteById } from "@/lib/palettes";
import { NOTIFICATION_DEFS } from "@/lib/notifications";

/** Settings, as a short list. It used to be one long page -- profile,
 * connected services, appearance, notifications, everything about the
 * household, the danger zone and the account, top to bottom. Now each group
 * is a row that says its current value and opens a page with only that
 * group on it. Nothing was removed: every control moved to one of the pages
 * below, as mapped in Jonathan's approved proposal (item 8, 25 September). */
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ drive_error?: string; calendar_error?: string }>;
}) {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");

  // Google's connect and callback routes still come back here, and an error
  // they report belongs on Connected apps, where the button that failed is.
  const sp = await searchParams;
  if (sp.drive_error || sp.calendar_error) {
    const q = new URLSearchParams();
    if (sp.drive_error) q.set("drive_error", sp.drive_error);
    if (sp.calendar_error) q.set("calendar_error", sp.calendar_error);
    redirect(`/settings/connected?${q}`);
  }

  const supabase = await createClient();
  const [{ data: authUser }, { data: driveLink }, { data: calendarLink }, lock] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("drive_links").select("connected").eq("family_id", me.family_id).maybeSingle(),
    supabase.from("calendar_links").select("connected").eq("member_id", me.id).maybeSingle(),
    getLockState(me.id),
  ]);

  const themeLabel = { light: "Light", dark: "Dark", system: "System" }[me.theme as "light" | "dark" | "system"] ?? "System";
  const prefs = (me.notification_prefs ?? {}) as Record<string, boolean>;
  const notifOn = NOTIFICATION_DEFS.filter((n) => prefs[n.key] ?? true).length;
  const connected = [driveLink?.connected && "Drive", calendarLink?.connected && "Google Calendar", me.calendar_feed_hash && "Apple & Outlook"].filter(Boolean) as string[];
  const lockOn = lock.hasPin || lock.credentialCount > 0;

  const groups: { href: string; icon: IconName; tint: "money" | "schedule" | "occasion" | "home" | undefined; title: string; value: string }[][] = [
    [
      { href: "/settings/appearance", icon: "sparkle", tint: "occasion", title: "Appearance", value: `${themeLabel} · ${paletteById(me.palette).name} · ${me.text_scale ?? 100}%` },
      { href: "/settings/notifications", icon: "message", tint: "money", title: "Notifications", value: `${notifOn} of ${NOTIFICATION_DEFS.length} on` },
      { href: "/settings/connected", icon: "hardDrive", tint: "schedule", title: "Connected apps", value: connected.length > 0 ? connected.join(", ") : "None connected" },
    ],
    [
      { href: "/settings/household", icon: "house", tint: "home", title: "Household", value: `${me.families.name} · ${me.families.currency} · ${me.families.week_start === "monday" ? "Mon start" : "Sun start"}` },
      { href: "/settings/privacy", icon: "keyRound", tint: undefined, title: "Privacy & lock", value: lockOn ? "Documents lock on" : "Documents lock off" },
    ],
    [{ href: "/settings/account", icon: "users", tint: undefined, title: "Account", value: authUser.user?.email ?? "Sign out" }],
  ];

  return (
    <div>
      <DetailHeader backHref="/today" eyebrow="Settings" />
      <div style={{ padding: "0 1.375rem 1.375rem", display: "flex", flexDirection: "column", gap: "1.125rem" }}>
        <Link href={`/family/members/${me.id}?from=settings`} style={{ textDecoration: "none", color: "inherit" }}>
          <Blueprint style={{ padding: "0.875rem", display: "flex", gap: "0.8125rem", alignItems: "center" }}>
            <Avatar url={me.avatar_url} initials={initials(me.full_name)} label={me.full_name} size={48} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ font: "600 1.25rem/1.05 var(--font-heading)", display: "block" }}>{me.full_name}</span>
              <span style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)" }}>
                {authUser.user?.email} · {authUser.user?.email_confirmed_at ? "verified" : "unverified"}
              </span>
              <span style={{ fontSize: "0.8125rem", color: "var(--color-accent-700)", textDecoration: "underline", display: "block" }}>Edit profile</span>
            </span>
            {me.is_organiser && <Tag variant="accent">ORGANIZER</Tag>}
          </Blueprint>
        </Link>

        {groups.map((rows, gi) => (
          <nav key={gi} className="kin-brief" aria-label={gi === 0 ? "You" : gi === 1 ? "Household" : "Account"}>
            {rows.map((r) => (
              <Link key={r.href} href={r.href} className="kin-brief-row">
                <span className="kin-brief-ico" data-tint={r.tint}>
                  <Icon name={r.icon} size="1.0625rem" />
                </span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span className="kin-brief-title">{r.title}</span>
                  <span className="kin-brief-meta" style={{ color: "var(--color-neutral-600)" }}>
                    {r.value}
                  </span>
                </span>
                <Icon name="chevronLeft" size="0.9375rem" className="kin-brief-chev" />
              </Link>
            ))}
          </nav>
        ))}

        <div style={{ font: "400 0.8125rem/1.6 var(--font-numeric)", color: "var(--color-neutral-500)", textAlign: "center" }}>KIN 1.0.0</div>
      </div>
    </div>
  );
}
