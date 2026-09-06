import { createClient } from "@/lib/supabase/server";
import { ResetPasswordForm } from "./reset-password-form";

/** Two ways in, and the page has to serve both.
 *
 * Normally there is no session: the emailed link is fetched by the mail
 * provider before anyone taps it, which spends the one-time token, so the
 * person arrives here having only read the code out of the message. The code
 * is then the proof of identity, and it is checked when the form is submitted.
 *
 * Occasionally the link does survive, and /auth/callback has already exchanged
 * it for a session by the time we get here. Then there is nothing to type. */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email = "" } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return <ResetPasswordForm email={user?.email ?? email} verified={!!user} />;
}
