import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { DetailHeader } from "@/components/hub-header";
import { QuickButtonSettings } from "@/components/quick-button-settings";
import { readQuickPrefs } from "@/lib/quick-button";

/** The phone's own button, pointed at Kin: which button, what a tap, double
 * tap and long press each do, and the one-time setup. See quick-button.ts. */
export default async function QuickButtonSettingsPage() {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");

  return (
    <div>
      <DetailHeader backHref="/settings" eyebrow="Quick button" />
      <div style={{ padding: "0 var(--gutter) 1.375rem" }}>
        <QuickButtonSettings initial={readQuickPrefs(me.quick_actions)} />
      </div>
    </div>
  );
}
