import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { signOutAction } from "@/lib/actions/auth";
import { keepAccountAction } from "@/lib/actions/account-deletion";
import { pendingDeletion } from "@/lib/account-deletion-server";
import { deletionDay } from "@/lib/account-deletion";
import { OnboardingShell, Wordmark } from "@/components/onboarding-shell";

export const metadata = { title: "Keep your account? · Kin" };

/** Signing in while the account is waiting to be deleted lands here (from
 * the root page and the sign-in callback): keep it, or carry on leaving. */
export default async function KeepAccountPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const supabase = await createClient();
  const deleteAfter = await pendingDeletion(supabase);
  if (!deleteAfter) redirect("/today");

  const keep = async () => {
    "use server";
    await keepAccountAction();
  };

  return (
    <OnboardingShell>
      <Wordmark />
      <h2 style={{ fontSize: "2rem", margin: "30px 0 12px" }}>Keep your account?</h2>
      <p style={{ fontSize: "0.9375rem", lineHeight: 1.55, margin: "0 0 1.5rem" }}>
        You asked for your account to be deleted. It will be on <strong>{deletionDay(deleteAfter)}</strong>. Nothing has been removed yet.
      </p>
      <form action={keep}>
        <button type="submit" className="btn btn-primary btn-block" style={{ minHeight: "2.875rem" }}>
          Keep my account
        </button>
      </form>
      <form action={signOutAction}>
        <button type="submit" className="btn btn-secondary btn-block" style={{ minHeight: "2.875rem", marginTop: "0.75rem" }}>
          No, delete it as planned
        </button>
      </form>
    </OnboardingShell>
  );
}
