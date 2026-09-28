import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { signOutAction } from "@/lib/actions/auth";
import { OnboardingShell, Wordmark } from "@/components/onboarding-shell";
import { MoveHousehold } from "@/components/move-household";

/** Where someone lands after their household removed them. Until 28
 * September this was a dead end -- the app opened on nothing, and joining
 * anywhere else was refused because the account still had a member row. Now
 * they start their own household or ask to join another, and their personal
 * space comes with them. */
export default async function RemovedPage() {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  if (me.status !== "removed") redirect("/today");

  return (
    <OnboardingShell>
      <Wordmark />
      <h2 style={{ fontSize: "1.75rem", margin: "28px 0 12px" }}>You&apos;re no longer in {me.families.name}</h2>
      <p style={{ fontSize: "0.875rem", lineHeight: 1.5, color: "var(--color-neutral-700)", margin: "0 0 1.25rem" }}>
        Your account and your own journal, notes and personal goals are still yours. Start a household of your own,
        or ask to join another with its invite code.
      </p>
      <MoveHousehold currentHousehold={me.families.name} wasRemoved canStart={me.role === "parent" || me.role === "adult"} />
      <form action={signOutAction} style={{ marginTop: "0.875rem" }}>
        <button type="submit" className="btn btn-secondary btn-block" style={{ minHeight: "2.875rem", fontSize: "0.875rem", letterSpacing: ".04em" }}>
          Sign out
        </button>
      </form>
    </OnboardingShell>
  );
}
