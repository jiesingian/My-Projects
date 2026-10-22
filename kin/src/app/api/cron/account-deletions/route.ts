import { constantTimeEquals } from "@/lib/security/crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { HOUSEHOLD_BUCKETS, removeFolder } from "@/lib/storage-sweep";

/** Once a day (kin-account-deletions, 20261021020000_delete_my_account.sql):
 * every account whose 7 days are up is deleted.
 *
 * pg_cron calls this with the reminders' shared secret (CRON_SECRET), as it
 * calls app/api/cron/reminders. For each one due, the database removes the
 * person's own data, hands the household to another grown-up or names it
 * for deletion, and keeps their shared records under "Former member"
 * (finalize_account_deletion, 20261022090000). This route then does what
 * plain SQL can't: removes their files from Storage and their login from
 * Auth, and deletes a household left with nobody in it the way Delete
 * household does (#777's health photo paths, then every household folder).
 * Those need the service
 * role, as deleting a login always has (the old Delete my account did the
 * same); it is used for nothing else here, and reads nothing.
 * Until CRON_SECRET and the service-role key are set it answers 503. */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  const given = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (secret.length < 32) return Response.json({ error: "Not set up here." }, { status: 503 });
  if (!constantTimeEquals(given, secret)) return Response.json({ error: "Not allowed." }, { status: 401 });
  const admin = createAdminClient();
  if (!admin) return Response.json({ error: "Not set up here." }, { status: 503 });

  const { data: due, error } = await admin.rpc("due_account_deletions");
  if (error) {
    console.error("Account deletions: could not list who is due", error.message);
    return Response.json({ error: "Database unavailable." }, { status: 503 });
  }

  let done = 0;
  for (const userId of (due ?? []) as string[]) {
    const { data, error: finalizeError } = await admin.rpc("finalize_account_deletion", { p_user: userId });
    if (finalizeError) {
      console.error(`Account deletion ${userId} did not finish`, finalizeError.message);
      continue;
    }
    const result = (data ?? {}) as {
      person_id?: string | null;
      files?: { bucket: string; path: string }[];
      keep_files?: { bucket: string; path: string }[];
      delete_families?: string[];
    };

    for (const bucket of new Set((result.files ?? []).map((f) => f.bucket))) {
      const paths = (result.files ?? []).filter((f) => f.bucket === bucket).map((f) => f.path);
      for (let i = 0; i < paths.length; i += 100) await admin.storage.from(bucket).remove(paths.slice(i, i + 100));
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
      const { data: healthFiles, error: householdError } = await admin.rpc("delete_household_for_account_deletion", { p_family: familyId });
      if (householdError) {
        // Someone is still there (another grown-up also leaving, say): the
        // household stays, and their own deletion will come back to it.
        console.error(`Household ${familyId} was kept after an account deletion: ${householdError.message}`);
        continue;
      }
      const paths = (healthFiles ?? []) as string[];
      for (let i = 0; i < paths.length; i += 100) await admin.storage.from("journal").remove(paths.slice(i, i + 100));
      for (const bucket of HOUSEHOLD_BUCKETS) {
        const left = await removeFolder(admin, bucket, familyId);
        if (left > 0) console.error(`${left} files in ${bucket} were left behind while deleting household ${familyId}`);
      }
    }

    const { error: authError } = await admin.auth.admin.deleteUser(userId);
    if (authError) console.error(`Login ${userId} was left behind after its account was deleted`, authError.message);
    done++;
  }
  return Response.json({ deleted: done });
}
