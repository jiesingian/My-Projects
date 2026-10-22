"use server";

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import { readAccess } from "@/lib/access";
import { inKidView } from "@/lib/kid-view";
import { householdZone } from "@/lib/household-zone";
import { familyDay } from "@/lib/time";
import { takeKinAiUse } from "@/lib/kin-ai-allowance";
import { KIN_AI_OFF, kinAiReady, kinAiRequest, textOf } from "@/lib/kin-ai";
import { RECEIPT_PLUS_ONLY, RECEIPT_SCHEMA, normaliseReceipt, receiptPrompt, type ScannedReceipt } from "@/lib/receipt-scan";
import { reportError } from "@/lib/report-error";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type ImageType = (typeof IMAGE_TYPES)[number];
const MAX_BYTES = 5 * 1024 * 1024;

/** Reads a receipt, an e-wallet screenshot or a bill and proposes one
 * expense or bill. Saves nothing: the member reviews it, then the usual
 * Wealth actions record it. Kin Plus only -- a Free household is told so
 * before anything is counted or sent, so it spends none of its five scans. */
export async function scanReceiptAction(formData: FormData): Promise<{ error: string | null; receipt: ScannedReceipt | null }> {
  const me = await requireCurrentMember();
  if (inKidView(me)) return { error: "Not in kid view.", receipt: null };
  if (!readAccess(me.families).plus) return { error: RECEIPT_PLUS_ONLY, receipt: null };
  if (!kinAiReady()) return { error: KIN_AI_OFF, receipt: null };

  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a photo or screenshot first.", receipt: null };
  if (!IMAGE_TYPES.includes(file.type as ImageType)) return { error: "That isn't a picture Kin can read. Try a JPEG, PNG or a screenshot.", receipt: null };
  if (file.size > MAX_BYTES) return { error: "That picture is too large. Try a smaller one.", receipt: null };

  const supabase = await createClient();
  // Plus is unlimited; counted all the same so the month's use is known.
  const allowance = await takeKinAiUse(supabase);
  if (!allowance.ok) return { error: allowance.error, receipt: null };

  // The accounts the viewer may see, for the account guess. Row-level
  // security keeps another member's private account out of the list, so the
  // model cannot name one and the guess cannot land there.
  const { data: accounts } = await supabase.from("accounts").select("id, name, institution").eq("family_id", me.family_id).eq("is_archived", false).order("name");
  const pickable = (accounts ?? []).map((a) => ({ id: a.id, name: a.name, institution: a.institution }));

  const tz = await householdZone();
  const data = Buffer.from(await file.arrayBuffer()).toString("base64");
  const client = new Anthropic();
  try {
    const response = await client.beta.messages.create(
      kinAiRequest({
        max_tokens: 2048,
        output_config: { format: { type: "json_schema", schema: RECEIPT_SCHEMA } },
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: file.type as ImageType, data } },
              { type: "text", text: receiptPrompt(familyDay(new Date(), tz), pickable) },
            ],
          },
        ],
      }),
    );
    if (response.stop_reason === "refusal") return { error: "Kin couldn't read that one. Try another picture.", receipt: null };
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(textOf(response.content));
    } catch {
      // Not the parse error itself: it quotes the start of the answer, which
      // is what was in the picture.
      reportError("Receipt scan: the answer was not JSON", new Error("Receipt scan: the answer was not JSON"));
      return { error: "Kin couldn't make sense of that picture. Try a sharper one.", receipt: null };
    }
    const receipt = normaliseReceipt(parsed, pickable);
    if (!receipt) return { error: "No amount found on that picture. Try one where the total is in frame and in focus.", receipt: null };
    return { error: null, receipt };
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) return { error: "Too many scans just now. Give it a moment.", receipt: null };
    if (error instanceof Anthropic.APIError) {
      reportError("Receipt scan API error", error, error.status);
      return { error: "The scanner couldn't be reached. Try again.", receipt: null };
    }
    reportError("Receipt scan failed", error);
    return { error: "Something went wrong reading that picture.", receipt: null };
  }
}
