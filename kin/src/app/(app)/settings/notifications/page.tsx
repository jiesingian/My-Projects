import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { DetailHeader } from "@/components/hub-header";
import { PushOptIn } from "@/components/push-opt-in";
import { NotificationToggles } from "@/components/settings-controls";
import { PushTestRows } from "@/components/push-test-rows";
import { inKidView } from "@/lib/kid-view";
import { Icon } from "@/components/icons";

/** Push notifications on this device, and which kinds of news reach you --
 * the Notifications group of the old single Settings page. For a grown-up,
 * "Send me a test" per kind of push (20261020210000). */
export default async function NotificationSettingsPage() {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");

  return (
    <div>
      <DetailHeader backHref="/settings" eyebrow="Notifications" />
      <div style={{ padding: "0 var(--gutter) 1.375rem" }}>
        <PushOptIn />
        <NotificationToggles prefs={me.notification_prefs as Record<string, boolean>} grownUp={me.role === "parent" || me.role === "adult"} />
        {/* A row, not a note (Jonathan, 26 October: the sentence under the
            switches was missed -- "there is no medicine alarms"). */}
        <nav className="kin-brief" data-kin-arrows="list" aria-label="Medicine alarms" style={{ marginTop: "1rem" }}>
          <Link href="/settings/notifications/alarms" className="kin-brief-row">
            <span className="kin-brief-ico" data-tint="occasion">
              <Icon name="pill" size="1.0625rem" />
            </span>
            <span style={{ minWidth: 0 }}>
              <span className="kin-brief-title">Medicine alarms</span>
              <span className="kin-brief-meta" style={{ color: "var(--color-neutral-600)" }}>
                Ring dose times as iPhone Clock alarms, even on silent
              </span>
            </span>
            <Icon name="chevronLeft" size="0.9375rem" className="kin-brief-chev" />
          </Link>
        </nav>
        {(me.role === "parent" || me.role === "adult") && !inKidView(me) && <PushTestRows />}
      </div>
    </div>
  );
}
