import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SetupForm } from "./setup-form";
import { createClient } from "@/lib/supabase/server";
import { HELPER_INVITE_COOKIE, helperLanding } from "@/lib/helper-access";
import { saidUnder18 } from "@/lib/age";

/** The one setup screen after sign-up (agreed 13 October): your name and your
 * family's, then Today. Arriving by an invite link puts joining first, with
 * the code filled in.
 *
 * Every signed-in person with no member row ends up here -- after sign-up,
 * sign-in, the email link, or any app page -- which makes it the one place a
 * household's helper is told apart (20261015121000): a helper link waiting
 * goes to /helper/accept, and someone who already helps a household goes to
 * /helper. A household invite link still comes first, so a helper who is
 * asked to join a family of their own can, and so does ?own=1 -- the helper
 * page's "Kin for your own family". */
export default async function SetupPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const jar = await cookies();
  const invite = jar.get("kin-invite")?.value ?? "";
  const supabase = await createClient();
  // Under 18 at sign-up: joining only (createFamilyAction refuses the rest).
  const { data: auth } = await supabase.auth.getUser();
  const minor = saidUnder18(auth.user?.user_metadata);
  if (!invite && (await searchParams).own !== "1") {
    const { data: helps } = await supabase.rpc("my_helper_households");
    const where = helperLanding({ hasInviteCookie: !!jar.get(HELPER_INVITE_COOKIE)?.value, helps: helps?.length ?? 0 });
    if (where === "accept") redirect("/helper/accept");
    if (where === "helper") redirect("/helper");
  }
  return <SetupForm inviteCode={invite} minor={minor} />;
}
