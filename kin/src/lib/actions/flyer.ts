"use server";

import Anthropic from "@anthropic-ai/sdk";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import { syncRowToCalendars } from "@/lib/actions/calendar-sync";
import { humanDatabaseError } from "@/lib/db-errors";
import { activityInstants } from "@/lib/planner-time";
import { familyDay } from "@/lib/time";
import { SCAN_SCHEMA, normaliseScan, scanPrompt, type ScannedItem } from "@/lib/flyer-scan";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type ImageType = (typeof IMAGE_TYPES)[number];
/** The page shrinks a photo to 1600px before sending it, which lands well
 * under this; the limit is for a caller who skips the page. */
const MAX_BYTES = 5 * 1024 * 1024;

/** Reads a photo of a flyer and proposes calendar entries. Saves nothing. */
export async function scanFlyerAction(formData: FormData): Promise<{ error: string | null; items: ScannedItem[] }> {
  await requireCurrentMember();
  if (!process.env.ANTHROPIC_API_KEY) return { error: "Scanning isn't set up yet — ANTHROPIC_API_KEY is missing.", items: [] };

  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a photo first.", items: [] };
  if (!IMAGE_TYPES.includes(file.type as ImageType)) return { error: "That isn't a photo Kin can read. Try a JPEG or PNG.", items: [] };
  if (file.size > MAX_BYTES) return { error: "That photo is too large. Try a smaller one.", items: [] };

  const data = Buffer.from(await file.arrayBuffer()).toString("base64");
  const client = new Anthropic();
  try {
    const response = await client.beta.messages.create({
      model: "claude-opus-5",
      max_tokens: 4096,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: { type: "json_schema", schema: SCAN_SCHEMA } },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: file.type as ImageType, data } },
            { type: "text", text: scanPrompt(familyDay()) },
          ],
        },
      ],
    });
    if (response.stop_reason === "refusal") return { error: "Kin couldn't read that one. Try another photo.", items: [] };
    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { error: "Kin couldn't make sense of that photo. Try a sharper one.", items: [] };
    }
    const items = normaliseScan(parsed);
    if (items.length === 0) return { error: "No dates found on that photo. Try one where the dates are in frame and in focus.", items: [] };
    return { error: null, items };
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) return { error: "Too many scans just now. Give it a moment.", items: [] };
    if (error instanceof Anthropic.APIError) {
      console.error(`Flyer scan API error ${error.status}`, error);
      return { error: "The scanner couldn't be reached. Try again.", items: [] };
    }
    console.error("Flyer scan failed", error);
    return { error: "Something went wrong reading that photo.", items: [] };
  }
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
    if (error) return { error: humanDatabaseError(error.message), added };
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
