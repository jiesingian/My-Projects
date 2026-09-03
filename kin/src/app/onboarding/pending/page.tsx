import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { signOutAction } from "@/lib/actions/auth";
import { OnboardingShell, Wordmark } from "@/components/onboarding-shell";
import { Blueprint } from "@/components/ui";
import Link from "next/link";

export default async function PendingApprovalPage() {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  if (me.status !== "pending") redirect("/today");

  return (
    <OnboardingShell>
      <Wordmark />
      <h2 style={{ fontSize: 28, margin: "28px 0 12px" }}>Waiting for approval</h2>
      <Blueprint style={{ padding: 16, marginBottom: 20 }}>
        <p style={{ fontSize: 13.5, lineHeight: 1.5, margin: 0 }}>
          Your request to join <strong>{me.families.name}</strong> is waiting on the household organizer to approve it.
          You&apos;ll get full access as soon as they do — no need to sign up again.
        </p>
      </Blueprint>
      <Link href="/onboarding/pending" className="btn btn-secondary btn-block" style={{ minHeight: 46, fontSize: 14, letterSpacing: ".04em", marginBottom: 10 }}>
        CHECK AGAIN
      </Link>
      <form action={signOutAction}>
        <button type="submit" className="btn btn-secondary btn-block" style={{ minHeight: 46, fontSize: 14, letterSpacing: ".04em" }}>
          SIGN OUT
        </button>
      </form>
    </OnboardingShell>
  );
}
