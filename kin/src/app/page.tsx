import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/session";
import { Welcome } from "@/components/welcome/welcome";
import { paletteCss } from "@/lib/palettes";

export const metadata = {
  title: "Kin: your family, in one home",
  description: "Money, plans, memories, health and the people you love, in one place everyone in the house shares.",
};

/** Signed in: straight to Today, as always. Signed out: the public home page
 * -- the 3D house, setup one question at a time, and a tour of the features
 * before sign-up -- instead of being dropped on a login form. */
export default async function RootPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <>
        {/* Kin Coral, the icon's look: what a new profile starts on. */}
        <style>{paletteCss("coral")}</style>
        <Welcome />
      </>
    );
  }

  const member = await getCurrentMember();
  if (!member) redirect("/onboarding/profile");

  redirect("/today");
}
