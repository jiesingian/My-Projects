import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { isGrownUp } from "@/lib/roles";
import { DetailHeader } from "@/components/hub-header";
import { Blueprint } from "@/components/ui";
import { KidViewSwitch } from "@/components/settings-controls";

/** Kid view, per child (K1, 25 September): for children with a login of
 * their own. Any grown-up in the household switches it; the child can't. */
export default async function KidViewSettingsPage() {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  if (!isGrownUp(me.role)) redirect("/settings");

  const supabase = await createClient();
  const { data: children } = await supabase
    .from("members")
    .select("id, full_name, kid_view")
    .eq("family_id", me.family_id)
    .eq("role", "child_self")
    .neq("status", "removed")
    .order("created_at");

  return (
    <div>
      <DetailHeader backHref="/settings" eyebrow="Kid view" />
      <div style={{ padding: "0 1.375rem 1.375rem" }}>
        <p style={{ fontSize: "0.9375rem", lineHeight: 1.45, color: "var(--color-neutral-700)", margin: "0 0 1rem" }}>
          A simpler Kin for children with a login of their own. Only a grown-up can change this.
        </p>
        {(children ?? []).length === 0 ? (
          <p style={{ fontSize: "0.875rem", color: "var(--color-neutral-600)" }}>
            No child here has a login of their own yet. Children without one never open Kin, so there is nothing to switch.
          </p>
        ) : (
          <Blueprint style={{ padding: "0 0 0 0.9375rem", marginBottom: "1.25rem" }}>
            {(children ?? []).map((c) => (
              <KidViewSwitch key={c.id} memberId={c.id} name={c.full_name} on={c.kid_view === true} />
            ))}
          </Blueprint>
        )}
        <div className="kin-eyebrow" style={{ marginBottom: "0.5rem" }}>What kid view shows</div>
        <ul style={{ margin: 0, paddingLeft: "1.125rem", fontSize: "0.9375rem", lineHeight: 1.6, color: "var(--color-neutral-800)" }}>
          <li>Today: their own jobs, their stars and rewards, what&rsquo;s coming up</li>
          <li>Chat with the family</li>
          <li>Journal</li>
          <li>The family tree and profiles</li>
          <li>Their own appearance and text size</li>
        </ul>
        <p style={{ fontSize: "0.875rem", color: "var(--color-neutral-600)", margin: "0.75rem 0 0" }}>
          Money, the vault, health records and running the household are hidden, and their pages send a child back to Today.
          A child who gets their own login starts in kid view.
        </p>
      </div>
    </div>
  );
}
