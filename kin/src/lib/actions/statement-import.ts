"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import { databaseError } from "@/lib/report-error";
import { MAX_STATEMENT_ROWS } from "@/lib/statement-import";

export type ImportRow = { date: string; direction: "in" | "out"; amount: number; particulars: string };

/** Save the rows a person ticked on the review screen into one account.
 * Only the rows arrive -- never the file. import_wealth_transactions() skips
 * what is already there, checks who may write to the account, and saves the
 * rest in one go (20261019120000). */
export async function importStatementAction(accountId: string, rows: ImportRow[]): Promise<{ error: string | null; imported?: number; skipped?: number }> {
  await requireCurrentMember();
  if (rows.length === 0) return { error: "Tick at least one line to import." };
  if (rows.length > MAX_STATEMENT_ROWS) return { error: `Import up to ${MAX_STATEMENT_ROWS} lines at a time.` };
  const clean = rows.map((r) => ({
    date: String(r.date).slice(0, 10),
    direction: r.direction === "in" ? "in" : "out",
    amount: Math.round(Math.abs(Number(r.amount)) * 100) / 100,
    particulars: String(r.particulars).slice(0, 150),
  }));

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("import_wealth_transactions", { p_account: accountId, p_rows: clean });
  if (error) return { error: databaseError(error) };
  const result = Array.isArray(data) ? data[0] : data;

  revalidatePath("/wealth");
  revalidatePath(`/wealth/accounts/${accountId}`);
  revalidatePath("/household");
  revalidatePath("/today");
  return { error: null, imported: result?.imported ?? 0, skipped: result?.skipped ?? 0 };
}
