"use server";

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import { readAccess } from "@/lib/access";
import { inKidView } from "@/lib/kid-view";
import { householdZone } from "@/lib/household-zone";
import { familyDay } from "@/lib/time";
import { takeKinAiUse } from "@/lib/kin-ai-allowance";
import { pairOf } from "@/lib/queries/chat-rooms";
import { KIN_AI_OFF, kinAiReady, kinAiRequest, textOf } from "@/lib/kin-ai";
import { MAX_SUMMARY_MESSAGES, cleanSummary, missedDigest, summaryPrompt, transcript, type MissedDigest, type SummaryLine } from "@/lib/chat-summary";
import { reportError } from "@/lib/report-error";

const THREAD = /^(household|family|dm:[0-9a-f-]{36}|group:[0-9a-f-]{36})$/i;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

type Me = Awaited<ReturnType<typeof requireCurrentMember>>;

/** The messages of one conversation after `since`, read as the viewer, as
 * transcript lines. Shared by the AI summary and the free catch-up. */
async function unreadLines(supabase: Awaited<ReturnType<typeof createClient>>, me: Me, thread: string, since: string, peerName?: string): Promise<SummaryLine[]> {
  const limit = MAX_SUMMARY_MESSAGES + 1;
  let lines: SummaryLine[] = [];

  // Every query below runs as the member, so row-level security decides
  // what is readable: a conversation they are not in returns nothing.
  if (thread === "household") {
    const [{ data: rows }, { data: members }] = await Promise.all([
      supabase.from("family_messages").select("member_id, body, created_at").eq("family_id", me.family_id).is("deleted_at", null).gt("created_at", since).order("created_at", { ascending: false }).limit(limit),
      supabase.from("members").select("id, full_name").eq("family_id", me.family_id),
    ]);
    const name = new Map((members ?? []).map((m) => [m.id, m.full_name.split(" ")[0]]));
    lines = (rows ?? []).map((r) => ({ who: r.member_id === me.id ? "You" : (name.get(r.member_id ?? "") ?? "Someone"), at: r.created_at, body: r.body }));
  } else if (thread === "family") {
    const { data: rows } = await supabase.from("family_tree_messages").select("person_id, author_name, body, created_at").is("deleted_at", null).gt("created_at", since).order("created_at", { ascending: false }).limit(limit);
    lines = (rows ?? []).map((r) => ({ who: r.person_id === me.person_id ? "You" : r.author_name.split(" ")[0] || "Someone", at: r.created_at, body: r.body }));
  } else if (thread.startsWith("dm:")) {
    const [low, high] = pairOf(me.person_id, thread.slice(3));
    const { data: rows } = await supabase.from("direct_messages").select("sender_person_id, body, created_at").eq("person_low", low).eq("person_high", high).is("deleted_at", null).gt("created_at", since).order("created_at", { ascending: false }).limit(limit);
    const peer = (peerName ?? "").trim().split(" ")[0] || "Them";
    lines = (rows ?? []).map((r) => ({ who: r.sender_person_id === me.person_id ? "You" : peer, at: r.created_at, body: r.body }));
  } else {
    const { data: rows } = await supabase.from("chat_group_messages").select("sender_person_id, author_name, body, created_at").eq("group_id", thread.slice(6)).is("deleted_at", null).gt("created_at", since).order("created_at", { ascending: false }).limit(limit);
    lines = (rows ?? []).map((r) => ({ who: r.sender_person_id === me.person_id ? "You" : r.author_name.split(" ")[0] || "Someone", at: r.created_at, body: r.body }));
  }

  return lines;
}

/** The free catch-up (29 October): who wrote how much, the questions, and
 * where you were named, from the same unread messages, on every plan and
 * with no Kin AI. Nothing is sent anywhere or written. */
export async function missedDigestAction(input: { thread: string; since: string; peerName?: string }): Promise<{ error: string | null; digest: MissedDigest | null }> {
  const me = await requireCurrentMember();
  const thread = String(input.thread ?? "");
  const since = String(input.since ?? "");
  if (!THREAD.test(thread) || !ISO.test(since)) return { error: "That conversation could not be read.", digest: null };
  const supabase = await createClient();
  const lines = await unreadLines(supabase, me, thread, since, input.peerName);
  const digest = missedDigest(lines, me.full_name);
  if (digest.from.length === 0) return { error: "Nothing new since you last read here.", digest: null };
  return { error: null, digest };
}

/** "What did I miss?": the unread messages of one conversation, read as the
 * viewer from `since` (the last-read time the page captured before the
 * thread marked itself read), summarised once. Nothing is written: the
 * summary is returned to the screen and forgotten. Kin Plus only. */
export async function summariseThreadAction(input: { thread: string; since: string; threadName: string; peerName?: string }): Promise<{ error: string | null; summary: string | null; count: number }> {
  const me = await requireCurrentMember();
  if (inKidView(me)) return { error: "Not in kid view.", summary: null, count: 0 };
  if (!readAccess(me.families).plus) return { error: "Catching up with Kin AI is part of Kin Plus. See Settings → Your plan.", summary: null, count: 0 };
  if (!kinAiReady()) return { error: KIN_AI_OFF, summary: null, count: 0 };
  const thread = String(input.thread ?? "");
  const since = String(input.since ?? "");
  if (!THREAD.test(thread) || !ISO.test(since)) return { error: "That conversation could not be read.", summary: null, count: 0 };

  const supabase = await createClient();
  const lines = await unreadLines(supabase, me, thread, since, input.peerName);

  // Your own messages are not news to you, as the badge counts it.
  const unread = lines.filter((l) => l.who !== "You");
  if (unread.length === 0) return { error: "Nothing new since you last read here.", summary: null, count: 0 };

  const allowance = await takeKinAiUse(supabase);
  if (!allowance.ok) return { error: allowance.error, summary: null, count: 0 };

  const tz = await householdZone();
  const stamp = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: tz, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const t = transcript(lines, stamp);
  const client = new Anthropic();
  try {
    const response = await client.beta.messages.create(
      kinAiRequest({
        max_tokens: 2048,
        system: summaryPrompt({ memberName: me.full_name.split(" ")[0], threadName: String(input.threadName ?? "").slice(0, 80) || "this chat", included: t.included, skipped: t.skipped, today: familyDay(new Date(), tz) }),
        messages: [{ role: "user", content: t.text }],
      }),
    );
    if (response.stop_reason === "refusal") return { error: "Kin couldn't summarise that one.", summary: null, count: unread.length };
    const summary = cleanSummary(textOf(response.content));
    if (!summary) return { error: "Kin had nothing to say about it. Scroll up to read.", summary: null, count: unread.length };
    return { error: null, summary, count: unread.length };
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) return { error: "Too many requests just now. Give it a moment.", summary: null, count: unread.length };
    if (error instanceof Anthropic.APIError) {
      reportError("Chat summary API error", error, error.status);
      return { error: "Kin AI couldn't be reached. Try again.", summary: null, count: unread.length };
    }
    reportError("Chat summary failed", error);
    return { error: "Something went wrong.", summary: null, count: unread.length };
  }
}
