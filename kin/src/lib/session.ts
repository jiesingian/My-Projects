import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/database.types";

export type CurrentMember = Tables<"members"> & {
  families: Tables<"families">;
};

/** The signed-in user's member row plus their family, or null if they haven't
 * finished onboarding (no member row yet) or aren't signed in. */
export async function getCurrentMember(): Promise<CurrentMember | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("members")
    .select("*, families(*)")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  return (data as CurrentMember | null) ?? null;
}

export async function requireCurrentMember(): Promise<CurrentMember> {
  const member = await getCurrentMember();
  if (!member) throw new Error("Not a member of a family yet");
  return member;
}
