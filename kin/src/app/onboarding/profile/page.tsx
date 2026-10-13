import { cookies } from "next/headers";
import { SetupForm } from "./setup-form";

/** The one setup screen after sign-up (agreed 13 October): your name and your
 * family's, then Today. Arriving by an invite link puts joining first, with
 * the code filled in. */
export default async function SetupPage() {
  const invite = (await cookies()).get("kin-invite")?.value ?? "";
  return <SetupForm inviteCode={invite} />;
}
