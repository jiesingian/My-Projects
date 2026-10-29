import Link from "next/link";
import { redirect } from "next/navigation";
import { Icon } from "@/components/icons";
import { getCurrentMember } from "@/lib/session";
import { DetailHeader } from "@/components/hub-header";
import { PushOptIn } from "@/components/push-opt-in";
import { NotificationToggles } from "@/components/settings-controls";
import { PushTestRows } from "@/components/push-test-rows";
import { inKidView } from "@/lib/kid-view";

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
        {/* Real alarms in the Kin iPhone app (29 October; lib/alarms.ts). */}
        <nav className="kin-brief" data-kin-arrows="list" aria-label="Alarms" style={{ marginTop: "1rem" }}>
          <Link href="/settings/notifications/alarms" className="kin-brief-row">
            <span className="kin-brief-ico" data-tint="occasion">
              <Icon name="clock" size="1.0625rem" />
            </span>
            <span style={{ minWidth: 0 }}>
              <span className="kin-brief-title">Alarms</span>
              <span className="kin-brief-meta" style={{ color: "var(--color-neutral-600)" }}>
                Medicine, plans, check-ups and bills that ring like the Clock app, in the Kin iPhone app
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
