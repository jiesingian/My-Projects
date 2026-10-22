import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentMember, getSessionUser } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { signOutAction } from "@/lib/actions/auth";
import { DetailHeader } from "@/components/hub-header";
import { DeleteAccountButton } from "@/components/delete-account-button";
import { ExportData } from "@/components/export-data";
import { isGrownUp } from "@/lib/roles";
import { inKidView } from "@/lib/kid-view";
import { planSentence, deletionDay, type HandoverPlan } from "@/lib/account-deletion";
import { pendingDeletion } from "@/lib/account-deletion-server";
import { keepAccountAction } from "@/lib/actions/account-deletion";

/** The email you sign in with, signing out, and deleting your account -- the
 * Account group of the old single Settings page. */
export default async function AccountSettingsPage() {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");

  const supabase = await createClient();
  const [authUser, { data: planData }, deleteAfter] = await Promise.all([getSessionUser(), supabase.rpc("my_account_deletion_plan"), pendingDeletion(supabase)]);
  // What deleting this account would do to the household, said before asking.
  const plan = (planData ?? { kind: "none" }) as HandoverPlan;
  const toName =
    plan.kind === "handover" ? (await supabase.from("members").select("full_name").eq("id", plan.to_member).maybeSingle()).data?.full_name : null;
  const keep = async () => {
    "use server";
    await keepAccountAction();
  };

  return (
    <div>
      <DetailHeader backHref="/settings" eyebrow="Account" />
      <div style={{ padding: "0 var(--gutter) 1.375rem" }}>
        <div style={{ fontSize: "0.8125rem", color: "var(--color-neutral-700)", marginBottom: "0.125rem" }}>Signed in as</div>
        <div style={{ padding: "0.5rem 0 0.8125rem", borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)", fontSize: "0.875rem" }}>
          {authUser?.email}
        </div>
        <form action={signOutAction}>
          <button type="submit" className="btn btn-secondary btn-block" style={{ minHeight: "2.875rem", fontSize: "0.84375rem", letterSpacing: ".04em", marginTop: "1.25rem" }}>
            Sign out
          </button>
        </form>
        {/* Anyone signed in as themselves; a child gets only their own part
            (lib/actions/export.ts). Never in kid view. */}
        {!inKidView(me) && me.role !== "child_managed" && <ExportData grownUp={isGrownUp(me.role)} />}
        <div style={{ marginTop: "0.75rem" }}>
          {deleteAfter ? (
            <form action={keep} style={{ border: "1px solid var(--color-accent-700)", padding: "0.875rem" }}>
              <p style={{ fontSize: "0.875rem", lineHeight: 1.5, margin: "0 0 10px" }}>
                Your account will be deleted on <strong>{deletionDay(deleteAfter)}</strong>. Nothing has been removed yet.
              </p>
              <button type="submit" className="btn btn-primary btn-block" style={{ minHeight: "2.625rem" }}>
                Keep my account
              </button>
            </form>
          ) : (
            <DeleteAccountButton householdNote={planSentence(plan, toName)} lastGrownUp={plan.kind === "last_grown_up"} />
          )}
        </div>
        <nav aria-label="Legal" style={{ display: "flex", justifyContent: "center", gap: "1.25rem", marginTop: "1.25rem", fontSize: "0.84375rem" }}>
          <Link href="/legal/privacy">Privacy</Link>
          <Link href="/legal/terms">Terms</Link>
          <Link href="/legal/refunds">Refunds</Link>
        </nav>
        <div style={{ font: "400 0.8125rem/1.6 var(--font-numeric)", color: "var(--color-neutral-600)", textAlign: "center", marginTop: "0.875rem" }}>KIN 1.0.0</div>
      </div>
    </div>
  );
}
