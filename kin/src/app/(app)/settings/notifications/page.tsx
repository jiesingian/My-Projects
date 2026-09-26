import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { DetailHeader } from "@/components/hub-header";
import { PushOptIn } from "@/components/push-opt-in";
import { NotificationToggles } from "@/components/settings-controls";

/** Push notifications on this device, and which kinds of news reach you --
 * the Notifications group of the old single Settings page. */
export default async function NotificationSettingsPage() {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");

  return (
    <div>
      <DetailHeader backHref="/settings" eyebrow="Notifications" />
      <div style={{ padding: "0 1.375rem 1.375rem" }}>
        <PushOptIn />
        <NotificationToggles prefs={me.notification_prefs as Record<string, boolean>} grownUp={me.role === "parent" || me.role === "adult"} />
      </div>
    </div>
  );
}
