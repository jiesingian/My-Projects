import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/database.types";

export type CurrentMember = Tables<"members"> & {
  families: Tables<"families">;
};

/** Who is signed in, read from the session JWT's claims, or null.
 *
 * getClaims() checks the token's signature locally against the project's
 * published signing key (both projects use asymmetric keys), so it costs no
 * round trip to the auth server, unlike getUser(). Row-level security stays
 * the real gate on data. Where a fresh server check matters (password reset,
 * the export's re-sign-in) keep calling auth.getUser(). */
export const getSessionUser = cache(async (): Promise<{ id: string; email: string | null } | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) return null;
  return { id: data.claims.sub, email: typeof data.claims.email === "string" ? data.claims.email : null };
});

/** The signed-in user's member row plus their family, or null if they haven't
 * finished onboarding (no member row yet) or aren't signed in.
 *
 * Wrapped in React's cache() because both the (app) layout and every page
 * under it call this independently — without memoizing, each navigation was
 * paying for the DB round trip twice per request. */
export const getCurrentMember = cache(async (): Promise<CurrentMember | null> => {
  const user = await getSessionUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("members")
    .select("*, families(*)")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  return (data as CurrentMember | null) ?? null;
});

export async function requireCurrentMember(): Promise<CurrentMember> {
  const member = await getCurrentMember();
  if (!member) throw new Error("Not a member of a family yet");
  return member;
}
