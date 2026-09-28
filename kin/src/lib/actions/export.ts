"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import { isGrownUp } from "@/lib/roles";
import { inKidView } from "@/lib/kid-view";
import { buildZip } from "@/lib/export/zip";
import { toCsv, withoutSecrets } from "@/lib/export/csv";

/** "Download my data" (approved by Jonathan, 28 September): the household's
 * records as a ZIP of spreadsheets, after the member types their password.
 *
 * - Grown-ups only, and never in kid view.
 * - The password is checked by signing in again with it, server-side, before
 *   anything is read. The vault's PIN and Face ID are optional and many
 *   members never set one, so the account password is the lock everyone has.
 * - Every table is read with the member's own session, so row-level security
 *   decides what is in it: a grown-up gets exactly what they can see in Kin,
 *   including the "just me" and grown-ups-only records they are allowed,
 *   and nothing else.
 * - Vault secrets, tokens, hashes and billing ids are withheld
 *   (csv.ts, withoutSecrets). Photos and files are listed by name and path;
 *   the files themselves stay in Kin or the family's Google Drive.
 *
 * This is the Data Privacy Act's right to a copy of one's data, which the
 * privacy notice (/legal/privacy) promises. */

/** File name in the ZIP, and the table it comes from. Order is the order a
 * person would look for things. */
const SECTIONS: [file: string, table: string][] = [
  ["people.csv", "members"],
  ["calendar-events.csv", "events"],
  ["calendar-activities.csv", "activities"],
  ["trips.csv", "trips"],
  ["chores-and-routines.csv", "routines"],
  ["chores-done.csv", "routine_log"],
  ["rewards.csv", "rewards"],
  ["rewards-redeemed.csv", "reward_redemptions"],
  ["goals.csv", "planner_goals"],
  ["goals-logged.csv", "planner_goal_entries"],
  ["goal-rewards.csv", "planner_goal_rewards"],
  ["shopping-list.csv", "buy_items"],
  ["pantry.csv", "pantry_items"],
  ["price-book.csv", "price_list"],
  ["meal-plans.csv", "meal_plans"],
  ["recipes.csv", "family_recipes"],
  ["chat-messages.csv", "family_messages"],
  ["chat-polls.csv", "family_polls"],
  ["journal.csv", "journal_entries"],
  ["journal-photos.csv", "journal_media"],
  ["milestones.csv", "milestones"],
  ["family-tree.csv", "family_tree_people"],
  ["addresses.csv", "family_addresses"],
  ["emergency-contacts.csv", "emergency_contacts"],
  ["health-appointments.csv", "health_appointments"],
  ["health-conditions.csv", "health_conditions"],
  ["health-schedule.csv", "health_schedule"],
  ["health-labs.csv", "health_labs"],
  ["health-vitals.csv", "health_vitals"],
  ["medicines.csv", "health_medicines"],
  ["medicine-doses.csv", "health_medicine_doses"],
  ["illness-log.csv", "health_illness_logs"],
  ["water-intake.csv", "liquid_intake_log"],
  ["money-accounts.csv", "accounts"],
  ["money-transactions.csv", "wealth_transactions"],
  ["bills.csv", "bills"],
  ["budgets.csv", "budget_periods"],
  ["budget-lines.csv", "budget_allocations"],
  ["income.csv", "income_schedules"],
  ["savings-goals.csv", "goals"],
  ["assets.csv", "assets"],
  ["debts.csv", "liabilities"],
  ["vault-folders.csv", "doc_folders"],
  ["vault-documents.csv", "doc_entries"],
  ["vault-files.csv", "doc_files"],
  ["vault-passwords-list.csv", "family_vault_items"],
  ["locations.csv", "member_locations"],
];

const PAGE = 1000;
/** No household comes near this; it stops a runaway read, nothing more. */
const MAX_ROWS = 100_000;

export type ExportResult = { error: string | null; filename?: string; base64?: string };

export async function exportMyDataAction(_prev: unknown, formData: FormData): Promise<ExportResult> {
  const me = await requireCurrentMember();
  if (!isGrownUp(me.role) || inKidView(me)) return { error: "Downloading the household's data is for grown-ups." };

  const password = String(formData.get("password") ?? "");
  if (!password) return { error: "Enter your password." };

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const email = auth.user?.email;
  if (!email) return { error: "Sign in again, then try once more." };
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) {
    return {
      error: /rate|too many/i.test(signInError.message)
        ? "Too many tries. Wait a few minutes, then try again."
        : "That password isn't right.",
    };
  }

  // The generated types do not know a table picked from a list at runtime.
  const db = supabase as unknown as SupabaseClient;
  const enc = new TextEncoder();
  const files: { name: string; data: Uint8Array }[] = [];
  const counts: string[] = [];

  const { data: family } = await db.from("families").select("*").eq("id", me.family_id).maybeSingle();
  if (family) files.push({ name: "household.csv", data: enc.encode(toCsv(withoutSecrets([family]))) });

  for (const [file, table] of SECTIONS) {
    const rows: Record<string, unknown>[] = [];
    for (let from = 0; from < MAX_ROWS; from += PAGE) {
      const { data, error } = await db.from(table).select("*").eq("family_id", me.family_id).range(from, from + PAGE - 1);
      if (error) {
        // A section this member cannot read, or one that does not exist in
        // this database yet, is left out and said so -- not a failed export.
        console.error(`Export: ${table} skipped`, error.message);
        break;
      }
      rows.push(...(data ?? []));
      if (!data || data.length < PAGE) break;
    }
    if (rows.length === 0) continue;
    files.push({ name: file, data: enc.encode(toCsv(withoutSecrets(rows))) });
    counts.push(`  ${file.padEnd(30)} ${rows.length} row${rows.length === 1 ? "" : "s"}`);
  }

  const today = new Date().toISOString().slice(0, 10);
  const readme = [
    `${me.families.name} on Kin`,
    `Downloaded by ${me.full_name} on ${today}.`,
    "",
    "Each .csv file opens in Excel, Numbers or Google Sheets. It holds what",
    `${me.full_name.split(" ")[0]} can see in Kin, and nothing more.`,
    "",
    "Left out on purpose: the passwords saved in the vault (their names and",
    "usernames are in vault-passwords-list.csv; open the vault to copy one),",
    "and sign-in keys, tokens and billing ids.",
    "",
    "Photos and files are listed with their names and where they are kept.",
    "The files themselves stay in Kin, or on your Google Drive if connected.",
    "",
    "What is in this download:",
    ...counts,
    "",
    "Keep this file somewhere private: it has your family's health and money records.",
    "",
  ].join("\r\n");
  files.unshift({ name: "README.txt", data: enc.encode(readme) });

  const zip = buildZip(files);
  const slug = me.families.name.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "household";
  return { error: null, filename: `Kin-${slug}-${today}.zip`, base64: Buffer.from(zip).toString("base64") };
}
