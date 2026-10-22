"use server";

import { householdZone } from "@/lib/household-zone";
import Anthropic from "@anthropic-ai/sdk";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import { readAccess } from "@/lib/access";
import { inKidView } from "@/lib/kid-view";
import { syncRowToCalendars } from "@/lib/actions/calendar-sync";
import { databaseError, reportError } from "@/lib/report-error";
import { activityInstants } from "@/lib/planner-time";
import { familyDay } from "@/lib/time";
import { SCAN_SCHEMA, normaliseScan, scanPrompt, type ScannedItem } from "@/lib/flyer-scan";
import { takeKinAiUse } from "@/lib/kin-ai-allowance";
import { KIN_AI_OFF, kinAiReady, kinAiRequest, textOf } from "@/lib/kin-ai";
import { sentIdFrom } from "@/lib/send-to-kin";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type ImageType = (typeof IMAGE_TYPES)[number];
/** The page shrinks a photo to 1600px before sending it, which lands well
 * under this; the limit is for a caller who skips the page. */
const MAX_BYTES = 5 * 1024 * 1024;

type ScanResult = { error: string | null; items: ScannedItem[] };

/** The model call itself, shared by the photo picked on the page and the
 * screenshot a Shortcut sent (lib/send-to-kin.ts). Proposes; saves nothing. */
async function readPicture(data: string, mediaType: ImageType, tz: string): Promise<ScanResult> {
  const client = new Anthropic();
  try {
    // The model (Haiku 5.5) and the request shape are lib/kin-ai.ts's.
    const response = await client.beta.messages.create(
      kinAiRequest({
        output_config: { format: { type: "json_schema", schema: SCAN_SCHEMA } },
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data } },
              { type: "text", text: scanPrompt(familyDay(new Date(), tz)) },
            ],
          },
        ],
      }),
    );
    if (response.stop_reason === "refusal") return { error: "Kin couldn't read that one. Try another photo.", items: [] };
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(textOf(response.content));
    } catch {
      // Not the parse error itself: it quotes the start of the answer, which
      // is what was in the picture.
      reportError("Flyer scan: the answer was not JSON", new Error("Flyer scan: the answer was not JSON"));
      return { error: "Kin couldn't make sense of that photo. Try a sharper one.", items: [] };
    }
    const items = normaliseScan(parsed);
    if (items.length === 0) return { error: "No dates found on that photo. Try one where the dates are in frame and in focus.", items: [] };
    return { error: null, items };
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) return { error: "Too many scans just now. Give it a moment.", items: [] };
    if (error instanceof Anthropic.APIError) {
      reportError("Flyer scan API error", error, error.status);
      return { error: "The scanner couldn't be reached. Try again.", items: [] };
    }
    reportError("Flyer scan failed", error);
    return { error: "Something went wrong reading that photo.", items: [] };
  }
}

/** Reads a photo of a flyer and proposes calendar entries. Saves nothing. */
export async function scanFlyerAction(formData: FormData): Promise<ScanResult> {
  const tz = await householdZone();
  await requireCurrentMember();
  if (!kinAiReady()) return { error: "Scanning isn't switched on yet. Fill in the event below for now.", items: [] };

  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a photo first.", items: [] };
  if (!IMAGE_TYPES.includes(file.type as ImageType)) return { error: "That isn't a photo Kin can read. Try a JPEG or PNG.", items: [] };
  if (file.size > MAX_BYTES) return { error: "That photo is too large. Try a smaller one.", items: [] };

  // Counted only once the photo is one Kin would actually send.
  const allowance = await takeKinAiUse(await createClient());
  if (!allowance.ok) return { error: allowance.error, items: [] };

  return readPicture(Buffer.from(await file.arrayBuffer()).toString("base64"), file.type as ImageType, tz);
}

/** "Send it to Kin" (Kin Plus): the screenshot a Shortcut left waiting
 * (sent_screenshots, 20261020230000), read once as the member who sent it,
 * scanned like a flyer, and deleted -- whether or not anything was found,
 * so a picture never waits longer than the one look. Row-level security
 * is what finds it: another member's, or another household's, is not there. */
export async function scanSentScreenshotAction(rawId: string): Promise<ScanResult> {
  const me = await requireCurrentMember();
  if (inKidView(me)) return { error: "Not in kid view.", items: [] };
  const id = sentIdFrom(rawId);
  if (!id) return { error: "That screenshot could not be found. Share it to Kin again.", items: [] };
  const supabase = await createClient();
  const { data: row } = await supabase.from("sent_screenshots").select("id, mime, data").eq("id", id).maybeSingle();
  if (!row) return { error: "That screenshot has already been read, or it waited more than a day. Share it to Kin again.", items: [] };
  // Gone before the model sees it: one look is all a waiting picture gets.
  await supabase.from("sent_screenshots").delete().eq("id", id);

  if (!readAccess(me.families).plus) return { error: "Send it to Kin is part of Kin Plus. See Settings → Your plan.", items: [] };
  if (!kinAiReady()) return { error: KIN_AI_OFF, items: [] };
  if (!IMAGE_TYPES.includes(row.mime as ImageType)) return { error: "That isn't a picture Kin can read.", items: [] };

  const allowance = await takeKinAiUse(supabase);
  if (!allowance.ok) return { error: allowance.error, items: [] };

  // bytea comes back from PostgREST as hex ("\x...").
  const hex = typeof row.data === "string" ? row.data : "";
  const bytes = hex.startsWith("\\x") ? Buffer.from(hex.slice(2), "hex") : Buffer.from(hex, "base64");
  if (bytes.length === 0) return { error: "That screenshot was empty. Share it to Kin again.", items: [] };
  const tz = await householdZone();
  return readPicture(bytes.toString("base64"), row.mime as ImageType, tz);
}

/** Saves the proposals the member ticked, as tasks for the whole family --
 * the same row the Add form writes, re-checked here because it came back
 * from the browser. */
export async function addScannedItemsAction(items: ScannedItem[]): Promise<{ error: string | null; added: number }> {
  const me = await requireCurrentMember();
  const clean = normaliseScan({ items });
  if (clean.length === 0) return { error: "Nothing to add.", added: 0 };
  const supabase = await createClient();
  let added = 0;
  for (const it of clean) {
    const when = activityInstants(it.date, it.from || "09:00", it.to);
    if ("error" in when) return { error: `${it.title}: ${when.error}`, added };
    const { data: row, error } = await supabase
      .from("activities")
      .insert({
        family_id: me.family_id,
        title: it.title,
        start_at: when.startAt.toISOString(),
        end_at: when.endAt ? when.endAt.toISOString() : null,
        repeat: "once",
        location: it.location || null,
        notes: it.notes || null,
        applies_to_whole_family: true,
        created_by: me.id,
      })
      .select("id")
      .single();
    if (error) return { error: databaseError(error), added };
    added++;
    await syncRowToCalendars(
      me.family_id,
      "activities",
      row.id,
      { title: it.title, startAt: when.startAt, endAt: when.endAt, location: it.location || null },
      { kind: "all" },
    );
  }
  revalidatePath("/planner");
  revalidatePath("/today");
  return { error: null, added };
}
