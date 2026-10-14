import { redirect } from "next/navigation";
import { getCurrentMember, getSessionUser } from "@/lib/session";
import { Welcome } from "@/components/welcome/welcome";
import { paletteCss } from "@/lib/palettes";

export const metadata = {
  title: "Kin: Family Life, Decoded",
  description: "Money, plans, memories, health and the people you love, in one place everyone in the house shares.",
};

/** Signed in: straight to Today, as always. Signed out: the public home page
 * -- the family check-up, its result, and the plan before sign-up -- instead
 * of being dropped on a login form. `/?start=quiz` (the link ads use) opens
 * at the first question. */
export default async function RootPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const user = await getSessionUser();

  if (!user) {
    return (
      <>
        {/* Kin Coral, the icon's look: what a new profile starts on. */}
        <style>{paletteCss("coral")}</style>
        <Welcome startQuiz={(await searchParams).start === "quiz"} />
      </>
    );
  }

  const member = await getCurrentMember();
  if (!member) redirect("/onboarding/profile");

  redirect("/today");
}
