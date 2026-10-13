import { redirect } from "next/navigation";

/** Setup is one screen now (agreed 13 October): name, family name and the
 * rest live at /onboarding/profile. This address is kept for old bookmarks and
 * half-finished sign-ups from before, and only sends them there. */
export default function OldFamilyStepPage() {
  redirect("/onboarding/profile");
}
