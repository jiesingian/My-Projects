import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { signOutAction } from "@/lib/actions/auth";
import { DetailHeader } from "@/components/hub-header";
import { DeleteAccountButton } from "@/components/delete-account-button";

/** The email you sign in with, signing out, and deleting your account -- the
 * Account group of the old single Settings page. */
export default async function AccountSettingsPage() {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");

  const supabase = await createClient();
  const [{ data: authUser }, { count: otherActiveCount }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("members").select("id", { count: "exact", head: true }).eq("family_id", me.family_id).in("status", ["active", "managed"]).neq("id", me.id),
  ]);

  return (
    <div>
      <DetailHeader backHref="/settings" eyebrow="Account" />
      <div style={{ padding: "0 1.375rem 1.375rem" }}>
        <div style={{ fontSize: "0.8125rem", color: "var(--color-neutral-700)", marginBottom: "0.125rem" }}>Signed in as</div>
        <div style={{ padding: "0.5rem 0 0.8125rem", borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)", fontSize: "0.875rem" }}>
          {authUser.user?.email}
        </div>
        <form action={signOutAction}>
          <button type="submit" className="btn btn-secondary btn-block" style={{ minHeight: "2.875rem", fontSize: "0.84375rem", letterSpacing: ".04em", marginTop: "1.25rem" }}>
            Sign out
          </button>
        </form>
        <div style={{ marginTop: "0.75rem" }}>
          <DeleteAccountButton isSoleMember={(otherActiveCount ?? 0) === 0} />
        </div>
        <div style={{ font: "400 0.8125rem/1.6 var(--font-numeric)", color: "var(--color-neutral-500)", textAlign: "center", marginTop: "0.875rem" }}>KIN 1.0.0</div>
      </div>
    </div>
  );
}
