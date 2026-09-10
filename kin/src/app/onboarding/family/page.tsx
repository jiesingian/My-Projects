import { redirect } from "next/navigation";
import { readOnboardingProfile } from "@/lib/onboarding-profile";
import { FamilyForkForm } from "./family-fork-form";

/** Step 4 has no fields of its own for the person -- their name, birthday and
 * mobile come from step 3 and ride along in hidden inputs. They used to ride
 * in the query string; they now come from an httpOnly cookie, which is why
 * this page reads rather than takes them.
 *
 * The redirect matters as much as the read. Landing here without a stash --
 * an old bookmark, a shared link, a browser that dropped the cookie, or
 * simply coming back an hour later -- used to render the form with an empty
 * hidden name, so filling in the household name and pressing CREATE answered
 * "your name is required" while pointing at no field that asks for a name.
 * There was no way out of that screen except to guess. Now it sends them back
 * one step, to the form that actually asks. */
export default async function FamilyForkPage() {
  const profile = await readOnboardingProfile();
  if (!profile.full_name) redirect("/onboarding/profile");
  return <FamilyForkForm fullName={profile.full_name} dob={profile.dob} mobile={profile.mobile} />;
}
