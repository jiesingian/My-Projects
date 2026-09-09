import { cookies } from "next/headers";

/** The half-finished profile between step 3 and step 4 of onboarding.
 *
 * It used to travel as query parameters -- /onboarding/family?full_name=…&
 * dob=…&mobile=… -- which put somebody's name, date of birth and mobile
 * number in the address bar, in browser history, and in the Referer header of
 * every request that page goes on to make. A date of birth and a phone number
 * are the two fields on that form worth protecting, and this is a family
 * organiser: half the birthdays it collects belong to children.
 *
 * A cookie is the smallest thing that carries them out of sight. httpOnly so
 * no script can read it back, sameSite lax because the redirect that sets it
 * is a top-level navigation, and fifteen minutes because it is scratch space
 * between two adjacent screens and not a session. It is cleared the moment
 * the member row exists, which is the point at which the real record takes
 * over from the draft. */
const ONBOARDING_PROFILE = "kin_onboarding_profile";
const ONBOARDING_PROFILE_TTL = 60 * 15;

export type OnboardingProfile = { full_name: string; dob: string; mobile: string };

export async function stashOnboardingProfile(profile: OnboardingProfile) {
  const jar = await cookies();
  jar.set(ONBOARDING_PROFILE, JSON.stringify(profile), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/onboarding",
    maxAge: ONBOARDING_PROFILE_TTL,
  });
}

/** Reads the stash back. Anything unreadable is treated as absent rather than
 * thrown: a stale or truncated cookie should send somebody back one screen,
 * not show them an error page in the middle of signing up. */
export async function readOnboardingProfile(): Promise<OnboardingProfile> {
  const empty: OnboardingProfile = { full_name: "", dob: "", mobile: "" };
  const raw = (await cookies()).get(ONBOARDING_PROFILE)?.value;
  if (!raw) return empty;
  try {
    const parsed = JSON.parse(raw) as Partial<OnboardingProfile>;
    return {
      full_name: typeof parsed.full_name === "string" ? parsed.full_name : "",
      dob: typeof parsed.dob === "string" ? parsed.dob : "",
      mobile: typeof parsed.mobile === "string" ? parsed.mobile : "",
    };
  } catch {
    return empty;
  }
}

export async function clearOnboardingProfile() {
  (await cookies()).delete({ name: ONBOARDING_PROFILE, path: "/onboarding" });
}
