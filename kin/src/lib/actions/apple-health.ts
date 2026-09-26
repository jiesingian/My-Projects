"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import { randomToken, sha256 } from "@/lib/security/crypto";
import { humanDatabaseError } from "@/lib/db-errors";
import type { ActionState } from "@/lib/actions/auth";

/** Makes the member's Apple Health link, replacing any earlier one. Only the
 * key's hash is stored (20260926100000_apple_health_import.sql), so this is
 * the one moment the link exists anywhere readable: shown once, and a lost
 * one is replaced, never recovered -- the calendar link's rule. */
export async function createAppleHealthLinkAction(visibility: string): Promise<{ error: string | null; url?: string }> {
  await requireCurrentMember();
  const token = randomToken();
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_apple_health_token", { p_token_hash: sha256(token).toString("hex"), p_visibility: visibility });
  if (error) return { error: humanDatabaseError(error.message) };
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  revalidatePath("/settings/connected");
  return { error: null, url: `https://${host}/api/health/apple/${token}` };
}

/** Turns the link off. The Shortcut's next run gets "not connected". */
export async function removeAppleHealthLinkAction(): Promise<ActionState> {
  await requireCurrentMember();
  const supabase = await createClient();
  const { error } = await supabase.rpc("clear_apple_health_token");
  revalidatePath("/settings/connected");
  return { error: error ? humanDatabaseError(error.message) : null };
}
