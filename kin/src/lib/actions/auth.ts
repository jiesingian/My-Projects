"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export type ActionState = { error: string | null };

// An address longer than this cannot be delivered to -- 254 characters is the
// ceiling RFC 5321 puts on a path -- and a code longer than this is not a code
// anyone was given. Both are refused rather than trimmed: silently shortening
// what someone typed would sign them in as, or mail, a different address than
// the one on screen. Passwords are deliberately not bounded here; a length cap
// on a password is a weakening, and Supabase already has its own limit.
//
// The reason this matters beyond tidiness is the reset flow below, which
// redirects to /reset-password?email=<what was typed> whether or not the
// address exists -- on purpose, so the page cannot be used to ask who has an
// account. Without a bound, a pasted megabyte comes back as a megabyte of
// query string and the person gets a request-too-large error instead of the
// screen asking for their code.
const EMAIL_MAX = 254;
const CODE_MAX = 100;

function tooLong(email: string): boolean {
  return email.length > EMAIL_MAX;
}

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
  if (!email || tooLong(email) || password.length < 8) {
    return { error: "Enter a valid email and a password of at least 8 characters." };
  }
  if (!accessCode || accessCode.length > CODE_MAX) {
    return { error: "Kin is invite-only. Enter the code you were given." };
  }

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
  if (tooLong(email)) return { error: "Those details don't match an account." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };

  redirect("/");
}

/** Sends the recovery email. The reply is deliberately the same whether or not
 * the address has an account: this form is unauthenticated, so telling the
 * truth here would turn it into a way to ask "does this person use Kin?" --
 * and for a family app, membership is itself private. Errors are swallowed
 * for the same reason; the person is told to go and look in their inbox
 * either way. */
export async function requestPasswordReset(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email || tooLong(email)) return { error: "Enter the email you sign in with." };

  const supabase = await createClient();
  const origin = await getOrigin();
  // Deliberately not surfaced. This flow answers the same way whether or not
  // the address has an account, and reporting a failure here would tell a
  // stranger which addresses exist. A mailer that is actually down is a
  // different thing, though, and should not be invisible to us.
  const { error: mailError } = await supabase.auth.resetPasswordForEmail(email, {
    // The email carries a typed code as well as this link, and the code is
    // what the next screen actually asks for -- see the note there. The link
    // is kept for the case where it survives: it lands on the same callback
    // the confirmation email uses and arrives already signed in.
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  });
  if (mailError) console.error("Password reset email could not be sent", mailError.message);

  redirect(`/reset-password?email=${encodeURIComponent(email)}`);
}

export async function updatePasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const code = String(formData.get("code") ?? "").replace(/\s/g, "");
  const email = String(formData.get("email") ?? "").trim();
  if (password.length < 8) return { error: "Use at least 8 characters." };
  if (tooLong(email) || code.length > CODE_MAX) {
    return { error: "That code isn't right, or it has expired. Ask for a new one." };
  }
  if (password !== confirm) return { error: "Those two passwords don't match." };

  const supabase = await createClient();
  let {
    data: { user },
  } = await supabase.auth.getUser();

  // No session means the emailed link never got them here -- which is the
  // normal case, because mail providers fetch the links they deliver and a
  // link that signs you in by being fetched is spent before anyone taps it.
  // The typed code is the way in: nothing can consume it by scanning the
  // message, and it works even when the email is read on another device.
  if (!user) {
    if (!code) return { error: "Enter the 6-digit code from the email." };
    if (!email) return { error: "Start again from the sign-in screen." };
    const { error: otpError } = await supabase.auth.verifyOtp({ email, token: code, type: "recovery" });
    if (otpError) return { error: "That code isn't right, or it has expired. Ask for a new one." };
    ({
      data: { user },
    } = await supabase.auth.getUser());
    if (!user) return { error: "That code isn't right, or it has expired. Ask for a new one." };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };

  // A password is usually reset because the old one is not trusted any more,
  // so every other device is signed out. This session stays, so they land in
  // the app rather than at the login screen having just proved who they are.
  const { error: othersError } = await supabase.auth.signOut({ scope: "others" });
  // Not surfaced: they have just proved who they are and are on their way in,
  // and there is nothing they could do about it here. But a password reset
  // that failed to sign the other devices out is exactly the case the reset
  // was for, so it must not pass unrecorded.
  if (othersError) console.error("Other sessions were not signed out after a password reset", othersError.message);

  redirect("/today");
}

export async function signOutAction() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  // The redirect happens either way -- leaving someone stranded on a page
  // they meant to leave is worse -- but a sign-out that did not take means
  // the session is still live behind the login screen.
  if (error) console.error("Sign out did not complete", error.message);
  redirect("/login");
}
