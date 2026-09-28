import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { FREE_AI_PER_MONTH } from "@/lib/access";

/** Takes one Kin AI use -- a question to the assistant or a flyer scan --
 * from the household's month. Kin Plus is unlimited; Kin Free gets
 * FREE_AI_PER_MONTH (20260928150000_kin_free_and_plus.sql, use_kin_ai()).
 *
 * Counted before the model is called, because the call is what costs money.
 * If the counter itself cannot be reached the use goes through and the
 * failure is logged: a family asking a question should not be refused
 * because our bookkeeping hiccupped, and the cost of one uncounted question
 * is a few pesos. */
export async function takeKinAiUse(supabase: SupabaseClient<Database>): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc("use_kin_ai");
  if (error) {
    console.error("use_kin_ai failed; letting this use through uncounted", error.message);
    return { ok: true };
  }
  const result = data as { ok?: boolean } | null;
  if (result?.ok === false) {
    return {
      ok: false,
      error: `Kin Free includes ${FREE_AI_PER_MONTH} Kin AI questions and flyer scans a month, and this month's are used. They come back on the 1st, or Kin Plus makes them unlimited — see Settings → Your plan.`,
    };
  }
  return { ok: true };
}
