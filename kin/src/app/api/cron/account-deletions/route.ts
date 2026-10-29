import { constantTimeEquals } from "@/lib/security/crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { HOUSEHOLD_BUCKETS, removeFolder, removePaths } from "@/lib/storage-sweep";
import { revokeGoogleToken } from "@/lib/google-revoke";
import { reportError } from "@/lib/report-error";

/** Once a day (kin-account-deletions, 20261021020000_delete_my_account.sql):
 * every account whose 7 days are up is deleted.
 *
 * pg_cron calls this with the reminders' shared secret (CRON_SECRET), as it
 * calls app/api/cron/reminders. For each one due, the database removes the
 * person's own data, hands the household to another grown-up or names it
 * for deletion, and keeps their shared records under "Former member"
 * (finalize_account_deletion, 20261022090000). This route then does what
 * plain SQL can't: removes their files from Storage and their login from
 * Auth, and deletes a household left with no grown-up in it the way Delete
 * household does (#777's health photo paths, then every household folder).
 * Those need the service role, as deleting a login always has (the old
 * Delete my account did the same). It is used for one more thing here, every
 * day: removing the files in members' own folders that deleted journal rows
 * left behind (sweepQueuedFiles, 20261022120000), which only their owner
 * could otherwise remove. That reads storage_sweep and nothing else. Until
 * CRON_SECRET and the service-role key are set it answers 503. */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  const given = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (secret.length < 32) return Response.json({ error: "Not set up here." }, { status: 503 });
  if (!constantTimeEquals(given, secret)) return Response.json({ error: "Not allowed." }, { status: 401 });
  const admin = createAdminClient();
  if (!admin) return Response.json({ error: "Not set up here." }, { status: 503 });

  const { data: due, error } = await admin.rpc("due_account_deletions");
  if (error) {
    reportError("Account deletions: could not list who is due", error);
    // The sweep does not depend on it.
    return Response.json({ error: "Database unavailable.", swept: await sweepQueuedFiles(admin) }, { status: 503 });
  }

  let done = 0;
  for (const userId of (due ?? []) as string[]) {
    // Their Google Calendar keys, read before the database deletes them, so
    // Kin's access can be taken back at Google too once the deletion holds.
    const { data: mine } = await admin.from("members").select("id").eq("auth_user_id", userId);
    const memberIds = (mine ?? []).map((m: { id: string }) => m.id);
    const { data: calendarTokens } = memberIds.length
      ? await admin.from("calendar_tokens").select("refresh_token, access_token").in("member_id", memberIds)
      : { data: [] };

    const { data, error: finalizeError } = await admin.rpc("finalize_account_deletion", { p_user: userId });
    if (finalizeError) {
      reportError("Account deletion did not finish", finalizeError, userId);
      continue;
    }
    for (const token of calendarTokens ?? []) await revokeGoogleToken(token);
    const result = (data ?? {}) as {
      person_id?: string | null;
      files?: { bucket: string; path: string }[];
      keep_files?: { bucket: string; path: string }[];
      delete_families?: string[];
    };

    for (const bucket of new Set((result.files ?? []).map((f) => f.bucket))) {
      const paths = (result.files ?? []).filter((f) => f.bucket === bucket).map((f) => f.path);
      const left = await removePaths(admin, bucket, paths);
      if (left.length > 0) reportError("An account's files were left behind", new Error("An account's files were left behind"), left.length, bucket, userId);
    }
    // Their own folder, except the photos of entries they added to the
    // household journal from "Just me": those stay where they were filed.
    if (result.person_id) {
      for (const bucket of HOUSEHOLD_BUCKETS) {
        const keep = new Set((result.keep_files ?? []).filter((f) => f.bucket === bucket).map((f) => f.path));
        await removeFolder(admin, bucket, `person/${result.person_id}`, 0, keep);
      }
    }

    for (const familyId of result.delete_families ?? []) {
      // Drive is one connection for the whole household, so it is taken back
      // at Google only when the household itself goes.
      const { data: driveToken } = await admin.from("drive_tokens").select("refresh_token, access_token").eq("family_id", familyId).maybeSingle();
      const { data: healthFiles, error: householdError } = await admin.rpc("delete_household_for_account_deletion", { p_family: familyId });
      if (householdError) {
        // A grown-up is still there (another one also leaving, say): the
        // household stays, and their own deletion will come back to it.
        if (/still has a grown-up in it/.test(householdError.message)) console.error(`Household ${familyId} was kept after an account deletion: ${householdError.message}`);
        else reportError("A household was not deleted after an account deletion", householdError, familyId);
        continue;
      }
      await revokeGoogleToken(driveToken);
      const left = await removePaths(admin, "journal", (healthFiles ?? []) as string[]);
      if (left.length > 0) reportError("Health photo files were left behind while deleting a household", new Error("Health photo files were left behind while deleting a household"), left.length, familyId);
      for (const bucket of HOUSEHOLD_BUCKETS) {
        const left = await removeFolder(admin, bucket, familyId);
        if (left > 0) reportError("Files were left behind while deleting a household", new Error("Files were left behind while deleting a household"), left, bucket, familyId);
      }
    }

    const { error: authError } = await admin.auth.admin.deleteUser(userId);
    if (authError) reportError("Login was left behind after its account was deleted", authError, userId);
    done++;
  }

  return Response.json({ deleted: done, swept: await sweepQueuedFiles(admin) });
}

/** Files in members' own folders whose journal rows were deleted by
 * someone else or by a cascade (a deleted household, an account deletion):
 * only their owner may remove them, so the database queues them
 * (20261022120000) and this removes the ones no row still names, by exact
 * path, then forgets them. A batch that failed stays queued for tomorrow. */
async function sweepQueuedFiles(admin: NonNullable<ReturnType<typeof createAdminClient>>): Promise<number> {
  const { data, error } = await admin.rpc("due_storage_sweep");
  if (error) {
    reportError("Queued files could not be listed", error);
    return 0;
  }
  const rows = (data ?? []) as { bucket: string; path: string }[];
  let swept = 0;
  for (const bucket of new Set(rows.map((r) => r.bucket))) {
    const paths = rows.filter((r) => r.bucket === bucket).map((r) => r.path);
    const left = new Set(await removePaths(admin, bucket, paths));
    if (left.size > 0) reportError("Queued files could not be removed", new Error("Queued files could not be removed"), left.size, bucket);
    // Removed, or already gone: either way nothing is left to sweep.
    const removed = paths.filter((path) => !left.has(path));
    if (removed.length === 0) continue;
    const { data: forgotten, error: forgetError } = await admin.rpc("forget_storage_sweep", { p_bucket: bucket, p_paths: removed });
    if (forgetError) reportError("Swept files are still queued", forgetError);
    else swept += Number(forgotten ?? 0);
  }
  return swept;
}
