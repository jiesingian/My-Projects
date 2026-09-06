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

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
