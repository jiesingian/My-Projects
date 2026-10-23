import Link from "next/link";
import { redirect } from "next/navigation";
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
        <p className="kin-quickbtn-note" style={{ marginTop: "1rem" }}>
          On an iPhone, a dose reminder is silent when the phone is.{" "}
          <Link href="/settings/notifications/alarms">Make your dose times iPhone alarms</Link>, which ring even on silent.
        </p>
        {(me.role === "parent" || me.role === "adult") && !inKidView(me) && <PushTestRows />}
      </div>
    </div>
  );
}
