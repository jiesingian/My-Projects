"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export type ActionState = { error: string | null };

// Server Actions have no request.url, so the callback origin is read off
// headers() — the Origin header when present, else proto+host (Vercel sets
// x-forwarded-proto; localhost falls back to http).
async function getOrigin(): Promise<string> {
  const h = await headers();
  const origin = h.get("origin");
  if (origin) return origin;
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("host");
  return `${proto}://${host}`;
}

export async function signUp(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const accessCode = String(formData.get("access_code") ?? "").trim();
  if (!email || password.length < 8) {
    return { error: "Enter a valid email and a password of at least 8 characters." };
  }
  if (!accessCode) return { error: "Kin is invite-only. Enter the code you were given." };

  const supabase = await createClient();

  // Checked in the database, not here: the codes never reach the browser, and
  // the function returns only yes or no so a wrong guess learns nothing.
  // A household's own invite code passes too, so someone joining a family
  // needs the single code the organizer already gave them.
  const { data: codeOk, error: codeError } = await supabase.rpc("signup_code_is_valid", {
    p_code: accessCode,
  });
  if (codeError) return { error: "We couldn't check that code just now. Try again in a moment." };
  if (!codeOk) return { error: "That code isn't valid. Check it with whoever invited you." };

  const origin = await getOrigin();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });
  if (error) return { error: error.message };

  redirect(`/verify?email=${encodeURIComponent(email)}`);
}

export async function resendConfirmation(email: string): Promise<ActionState> {
  const supabase = await createClient();
  const origin = await getOrigin();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });
  return { error: error?.message ?? null };
}

export async function signIn(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };

  redirect("/");
}

/** Sends the recovery link. The reply is deliberately the same whether or not
 * the address has an account: this form is unauthenticated, so telling the
 * truth here would turn it into a way to ask "does this person use Kin?" --
 * and for a family app, membership is itself private. Errors are swallowed
 * for the same reason; the person is told to go and look in their inbox
 * either way. */
export async function requestPasswordReset(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Enter the email you sign in with." };

  const supabase = await createClient();
  const origin = await getOrigin();
  await supabase.auth.resetPasswordForEmail(email, {
    // Lands on the same callback the confirmation link uses, which exchanges
    // the code for a session, then hands over to the page that sets the new
    // password.
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  });

  redirect(`/forgot-password?sent=${encodeURIComponent(email)}`);
}

export async function updatePasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < 8) return { error: "Use at least 8 characters." };
  if (password !== confirm) return { error: "Those two passwords don't match." };

  const supabase = await createClient();
  // The recovery link is what proves who this is: following it exchanged a
  // one-time code for a session, so there is a signed-in user here or there
  // is nobody. Without this check the page would happily change the password
  // of whoever merely happened to be signed in.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "That reset link has expired. Ask for a new one." };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };

  // A password is usually reset because the old one is not trusted any more,
  // so every other device is signed out. This session stays, so they land in
  // the app rather than at the login screen having just proved who they are.
  await supabase.auth.signOut({ scope: "others" });

  redirect("/today");
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
