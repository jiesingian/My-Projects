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
      <h2 style={{ fontSize: "1.75rem", margin: "28px 0 12px" }}>Waiting for approval</h2>
      <Blueprint style={{ padding: "1rem", marginBottom: "1.25rem" }}>
        <p style={{ fontSize: "0.84375rem", lineHeight: 1.5, margin: 0 }}>
          Your request to join <strong>{me.families.name}</strong> is waiting on the household organizer to approve it.
          You&apos;ll get full access as soon as they do — no need to sign up again.
        </p>
      </Blueprint>
      <Link href="/onboarding/pending" className="btn btn-secondary btn-block" style={{ minHeight: "2.875rem", fontSize: "0.875rem", letterSpacing: ".04em", marginBottom: "0.625rem" }}>
        Check again
      </Link>
      <form action={signOutAction}>
        <button type="submit" className="btn btn-secondary btn-block" style={{ minHeight: "2.875rem", fontSize: "0.875rem", letterSpacing: ".04em" }}>
          Sign out
        </button>
      </form>
    </OnboardingShell>
  );
}
