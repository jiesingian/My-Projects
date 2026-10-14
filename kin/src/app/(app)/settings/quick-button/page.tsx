import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { DetailHeader } from "@/components/hub-header";
import { QuickButtonSettings } from "@/components/quick-button-settings";
import { readQuickPrefs } from "@/lib/quick-button";

/** The Action Button's pop-up menu and the Home Screen widget: what each
 * offers, a picture of each, and the one-time setup. See quick-button.ts. */
export default async function QuickButtonSettingsPage() {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  // Whether "Add to Kin" has a link on. The key lives in a table nobody
  // reads directly, so this asks; a failed read shows it as off, and making
  // a link from there simply replaces the old one.
  const supabase = await createClient();
  const { data: listAddOn } = await supabase.rpc("list_add_link_on");

  return (
    <div>
      <DetailHeader backHref="/settings" eyebrow="Action Button & widget" />
      <div style={{ padding: "0 var(--gutter) 1.375rem" }}>
        <QuickButtonSettings initial={readQuickPrefs(me.quick_actions)} briefOn={Boolean(me.brief_hash)} listAddOn={listAddOn === true} />
      </div>
    </div>
  );
}
