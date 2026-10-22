"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import { confirmMatches } from "@/lib/account-deletion";
import { databaseError, reportError } from "@/lib/report-error";
import type { ActionState } from "@/lib/actions/auth";

/** Delete my account (Jonathan, 21 October). Asking only records the day:
 * for 7 days nothing is removed, and signing in offers "Keep my account".
 * Then the daily job removes the person's own data and login
 * (20261021020000_delete_my_account.sql, app/api/cron/account-deletions).
 * The person is signed out straight away, so asking feels like leaving. */
export async function requestAccountDeletionAction(typed: string): Promise<ActionState> {
  await requireCurrentMember();
  if (!confirmMatches(typed)) return { error: "Type the words exactly as shown." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("request_account_deletion");
  if (error) return { error: databaseError(error) };

  const { error: signOutError } = await supabase.auth.signOut();
  if (signOutError) reportError("Sign out did not complete", signOutError);
  redirect("/login?deleting=1");
}

/** "Keep my account": the request is forgotten and nothing was removed. */
export async function keepAccountAction(): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_account_deletion");
  if (error) return { error: databaseError(error) };
  redirect("/today");
}
