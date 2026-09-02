"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type ActionState = { error: string | null };

export async function signUp(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || password.length < 8) {
    return { error: "Enter a valid email and a password of at least 8 characters." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) return { error: error.message };

  redirect(`/verify?email=${encodeURIComponent(email)}`);
}

export async function verifyEmail(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const token = String(formData.get("token") ?? "").trim();
  if (!email || token.length < 6) {
    return { error: "Enter the six-digit code from your email." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "signup" });
  if (error) return { error: error.message };

  redirect("/onboarding/profile");
}

export async function resendCode(email: string): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.auth.resend({ type: "signup", email });
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
