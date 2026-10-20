"use server";

import Anthropic from "@anthropic-ai/sdk";
import { requireCurrentMember } from "@/lib/session";
import { readAccess } from "@/lib/access";
import { inKidView } from "@/lib/kid-view";
import { householdZone } from "@/lib/household-zone";
import { familyDay } from "@/lib/time";
import { takeKinAiUse } from "@/lib/kin-ai-allowance";
import { createClient } from "@/lib/supabase/server";
import { KIN_AI_OFF, kinAiReady, kinAiRequest, textOf } from "@/lib/kin-ai";
import { STATEMENT_SCHEMA, capLines, normaliseStatementRows, statementPrompt } from "@/lib/statement-ai";
import type { ParsedRow } from "@/lib/statement-import";

/** Maps the text lines of a PDF statement to rows for the review step
 * (#679). Only the lines arrive -- the PDF and its password stay on the
 * device. Kin Plus, like the import itself. Saves nothing. */
export async function mapStatementTextAction(lines: string[], bank: string): Promise<{ error: string | null; rows: ParsedRow[] }> {
  const me = await requireCurrentMember();
  if (inKidView(me)) return { error: "Not in kid view.", rows: [] };
  if (!readAccess(me.families).plus) return { error: "Importing a statement is part of Kin Plus. See Settings → Your plan.", rows: [] };
  if (!kinAiReady()) return { error: `${KIN_AI_OFF} Until then, a CSV of the statement imports without it.`, rows: [] };

  const text = capLines(Array.isArray(lines) ? lines.filter((l): l is string => typeof l === "string") : []);
  if (text.length === 0) return { error: "No text could be read from that PDF. If it is a scan of a printout, Kin cannot read it yet.", rows: [] };

  const allowance = await takeKinAiUse(await createClient());
  if (!allowance.ok) return { error: allowance.error, rows: [] };

  const tz = await householdZone();
  const client = new Anthropic();
  try {
    const response = await client.beta.messages.create(
      kinAiRequest({
        max_tokens: 16000,
        output_config: { format: { type: "json_schema", schema: STATEMENT_SCHEMA } },
        messages: [{ role: "user", content: `${statementPrompt(familyDay(new Date(), tz), bank.slice(0, 40) || "bank")}\n\n${text.join("\n")}` }],
      }),
    );
    if (response.stop_reason === "refusal") return { error: "Kin couldn't read that statement.", rows: [] };
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(textOf(response.content));
    } catch {
      return { error: "Kin couldn't make sense of that statement. A CSV of it, where the bank offers one, imports without Kin AI.", rows: [] };
    }
    const rows = normaliseStatementRows(parsed);
    if (rows.length === 0) return { error: "No transactions were found in that PDF.", rows: [] };
    return { error: null, rows };
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) return { error: "Too many imports just now. Give it a moment.", rows: [] };
    if (error instanceof Anthropic.APIError) {
      console.error(`Statement map API error ${error.status}`, error);
      return { error: "Kin AI couldn't be reached. Try again.", rows: [] };
    }
    console.error("Statement map failed", error);
    return { error: "Something went wrong reading that statement.", rows: [] };
  }
}
