import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ResetPasswordForm } from "./reset-password-form";

/** Reached by following the recovery link, which exchanged its one-time code
 * for a session on the way through /auth/callback. That session is the proof
 * of identity, so anyone arriving here without one is sent to ask for a link
 * rather than shown the form. */
export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/forgot-password");

  return <ResetPasswordForm email={user.email ?? ""} />;
}
